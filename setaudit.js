// ══════════════════════════════════════════════════════════════
// setaudit.js — which sets work end to end, and which do not?
//
// Three symptoms, one suspected cause: a set id that fails to resolve
// falls back to pokemontcg.io, whose cards carry foreign ids, so the
// listings endpoint cannot find them and no links appear.
//
// This tests every set through the REAL endpoints rather than reading
// code, and reports where each one breaks. Read-only.
//
//   node setaudit.js en            every English set
//   node setaudit.js en --broken   only the failures
//   node setaudit.js all --limit=40
//   node setaudit.js en --set=sv10 --verbose
// ══════════════════════════════════════════════════════════════

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';

const args   = process.argv.slice(2);
const lang   = (args[0] && !args[0].startsWith('--')) ? args[0] : 'en';
const only   = (args.find(a => a.startsWith('--set=')) || '').replace('--set=', '');
const limit  = parseInt((args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '')) || 9999;
const brokenOnly = args.includes('--broken');
const verbose    = args.includes('--verbose');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  try {
    const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, body: text.slice(0, 200) };
    try { return { ok: true, status: r.status, json: JSON.parse(text) }; }
    catch { return { ok: false, status: r.status, body: 'not JSON: ' + text.slice(0, 120) }; }
  } catch (e) { return { ok: false, status: 0, body: e.message }; }
}

async function auditSet(set) {
  const id = set.id;
  const out = { id, name: set.name, cards: 0, source: null,
                priced: 0, idShape: null, listingsOk: null, problems: [] };

  const r = await get(`/api/sets/${encodeURIComponent(id)}/cards`);
  if (!r.ok) {
    out.problems.push(`set endpoint HTTP ${r.status}`);
    return out;
  }

  const d = r.json;
  const cards = d.cards || d.data || [];
  out.cards  = cards.length;
  out.source = d._source || d.source || '(none)';
  out.resolvedSetId = d.resolvedSetId || null;

  if (!cards.length) { out.problems.push('no cards returned'); return out; }

  // 1. Served from our database, or fallen back?
  if (out.source !== 'cardhunt_db') {
    out.problems.push(`served from ${out.source}, not the database`);
  }

  // 2. Card id shape decides whether listings can resolve them
  const sample = cards[0];
  const cid = String(sample.id || sample.api_card_id || '');
  out.idShape = cid;
  const ours = /^(en|ja|zh-tw|zh-cn)-/.test(cid);
  if (!ours) out.problems.push(`card ids are "${cid}" — not ours, listings cannot resolve them`);

  // 3. How many carry a real price?
  out.priced = cards.filter(c => c._priceIsReal).length;
  const pct = out.cards ? Math.round((out.priced / out.cards) * 100) : 0;
  out.pricedPct = pct;
  if (pct < 50) out.problems.push(`only ${pct}% have a real price`);

  // 4. Does a card from this set actually resolve on its own endpoint?
  if (ours) {
    const c = await get(`/api/cards/${encodeURIComponent(cid)}`);
    await sleep(120);
    if (!c.ok) out.problems.push(`card endpoint HTTP ${c.status} for ${cid}`);
    else {
      const cd = c.json.data || c.json;
      const setPrice  = sample._price;
      const cardPrice = cd._price;
      out.setPrice = setPrice; out.cardPrice = cardPrice;
      if (setPrice && cardPrice) {
        const ratio = Math.max(setPrice, cardPrice) / Math.min(setPrice, cardPrice);
        // This is symptom 1: correct in the set, collapsed on the card page
        if (ratio > 1.5) out.problems.push(
          `set page $${Number(setPrice).toFixed(2)} vs card page $${Number(cardPrice).toFixed(2)} (${ratio.toFixed(1)}x)`);
      } else if (setPrice && !cardPrice) {
        out.problems.push(`card endpoint returns no price where the set page has $${Number(setPrice).toFixed(2)}`);
      }
      if (!cd._priceIsReal && sample._priceIsReal) {
        out.problems.push('card endpoint falls back to an estimate');
      }
    }

    // 5. Can this card produce listings at all?
    const l = await get(`/api/listings/${encodeURIComponent(cid)}?grade=Raw%20NM&dryRun=1`);
    await sleep(120);
    if (!l.ok) { out.listingsOk = false; out.problems.push(`listings HTTP ${l.status}`); }
    else {
      const ld = l.json;
      out.listingsOk = !!(ld.card && ld.card.name);
      if (!out.listingsOk) out.problems.push('listings endpoint cannot resolve this card');
      const eb = ld.sources && ld.sources.ebay;
      if (eb && eb.status && !['ok','dry-run'].includes(eb.status)) {
        out.problems.push(`ebay source: ${eb.status}${eb.reason ? ' — ' + eb.reason : ''}`);
      }
    }
  }

  return out;
}

(async () => {
  console.log(`\n${'='.repeat(92)}`);
  console.log(`  SET AUDIT — ${lang}   ${BASE}`);
  console.log(`${'='.repeat(92)}\n`);

  const langs = lang === 'all' ? ['en','ja','zh-tw','zh-cn'] : [lang];
  const rows = [];

  for (const L of langs) {
    const r = await get(`/api/sets/lang/${L}`);
    if (!r.ok) { console.log(`  could not list ${L} sets: HTTP ${r.status}`); continue; }
    let sets = r.json.sets || [];
    if (only) sets = sets.filter(s => s.id === only);
    sets = sets.slice(0, limit);
    console.log(`  ${L}: ${sets.length} sets to check\n`);

    for (let i = 0; i < sets.length; i++) {
      const res = await auditSet(sets[i]);
      res.lang = L;
      rows.push(res);
      await sleep(150);

      const bad = res.problems.length > 0;
      if (brokenOnly && !bad) continue;

      const mark = bad ? 'FAIL' : ' ok ';
      console.log(`  ${mark}  ${String(res.id).padEnd(12)} ${String(res.name || '').slice(0,22).padEnd(24)}` +
        `${String(res.cards).padStart(4)} cards  ${String(res.pricedPct + '%').padStart(5)} priced  ` +
        `${String(res.source).slice(0,14)}`);
      if (bad) res.problems.forEach(p => console.log(`        - ${p}`));
      if (verbose) console.log(`        ids: ${res.idShape}   resolved: ${res.resolvedSetId || '-'}`);
    }
  }

  // ── Grouped summary: the point is the pattern, not the list ──
  console.log(`\n${'-'.repeat(92)}`);
  const broken = rows.filter(r => r.problems.length);
  console.log(`  ${rows.length} sets checked, ${broken.length} with problems\n`);

  const byProblem = {};
  broken.forEach(r => r.problems.forEach(p => {
    const key = p.replace(/\$[\d.]+/g, '$X').replace(/\d+(\.\d+)?x/g, 'Nx')
                 .replace(/\b\d+\b/g, 'N').replace(/"[^"]*"/g, '"..."');
    (byProblem[key] = byProblem[key] || []).push(r.id);
  }));

  Object.entries(byProblem).sort((a,b) => b[1].length - a[1].length).forEach(([p, ids]) => {
    console.log(`  ${String(ids.length).padStart(4)}  ${p}`);
    console.log(`        ${ids.slice(0, 14).join(', ')}${ids.length > 14 ? ' ...' : ''}`);
  });

  const working = rows.filter(r => !r.problems.length).map(r => r.id);
  if (working.length) {
    console.log(`\n  working: ${working.slice(0, 20).join(', ')}${working.length > 20 ? ' ...' : ''}`);
  }
  console.log('\n  Compare a working set with a failing one — the difference is the cause.\n');
})();
