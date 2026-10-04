// ══════════════════════════════════════════════════════════════
// querygap.js — which SETS does eBay answer nothing for, and why?
//
// Four query mismatches were found one at a time, each by accident:
// SWSH202/307, H09 vs H9, Yellow A Alternate (24a/06), Poké Card Creator
// Pack. This asks the question across every visible set at once
// (TASK T2, 2026-10-04):
//
//   1. dry run (free): the exact query each set's card is asked with
//   2. live: ONE card a set — the dearest card priced $2-$150 that is not
//      one of the 55 reprint originals (those cost +1/+2 calls a view)
//   3. a set whose card returned nothing (A: scanned 0) or kept nothing
//      (B: every row refused) gets two more cards — a set fails only when
//      all three do. One card a set says nothing about a market; three
//      cards answering zero is a query, not a market.
//
// Classes, per card (linkaudit's): A eBay returned nothing, B the gate
// refused everything, ok something kept. The query's parts are recorded
// so failures can be grouped by cause (set name / number form / total).
//
// COST: 1 eBay call per card asked (tooling origin, counted against the
// tooling allowance; a card opened in the last 15 minutes is 0). A whole
// run is ~200 + 2 per failing set. Results go to querygap.json; --resume
// skips cards already asked, so a run stopped by the allowance continues
// the next UTC day without paying twice.
//
//   node querygap.js en --dry            queries only, nothing spent
//   node querygap.js en                  live, ~1 call a set
//   node querygap.js en --resume         continue a stopped run
//   node querygap.js en --set=xya,ex5.5  only these
//   node querygap.js en --report         re-print the table from the file
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const cm = require('./cardmatch.js');
const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const args = process.argv.slice(2);
const lang = (args[0] && !args[0].startsWith('--')) ? args[0] : 'en';
const dry = args.includes('--dry');
const resume = args.includes('--resume');
const reportOnly = args.includes('--report');
const only = ((args.find(a => a.startsWith('--set=')) || '').slice(6)).split(',').filter(Boolean);
const OUT = (args.find(a => a.startsWith('--out=')) || '--out=querygap.json').slice(6);
const EXTRA = 2;   // further cards asked of a set whose first card failed

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The 55 originals: opening one also fetches its reprint's listings.
const REPRINT_ORIGINALS = new Set();
for (const fam of Object.values(cm.REPRINT_OF || {}))
  for (const v of Object.values(fam)) REPRINT_ORIGINALS.add('en-' + v[0]);

async function get(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + path, { headers: { Accept: 'application/json', 'X-CardHunt-Origin': 'tooling' } });
      const text = await r.text();
      if (!r.ok) { if (r.status >= 500) { await sleep(3000); continue; } return { ok: false, status: r.status, body: text.slice(0, 200) }; }
      return { ok: true, json: JSON.parse(text) };
    } catch (e) { await sleep(3000); }
  }
  return { ok: false, status: 0, body: 'unreachable' };
}

function load() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { lang, sets: {} }; } }
function save(db) { fs.writeFileSync(OUT, JSON.stringify(db, null, 1)); }

// Which cards to ask, best first.
function candidates(cards) {
  const pool = cards.filter(c => !REPRINT_ORIGINALS.has(c.id));
  const price = c => (c._priceIsReal && c._price) || 0;
  const mid = pool.filter(c => price(c) >= 2 && price(c) <= 150).sort((a, b) => price(b) - price(a));
  const rest = pool.filter(c => !mid.includes(c)).sort((a, b) => price(b) - price(a));
  // Spread the extras through the set rather than the next-dearest neighbours.
  return mid.concat(rest);
}

function classify(d) {
  const eb = (d && d.sources && d.sources.ebay) || {};
  if (eb.status === 'quota') return { code: 'STOP', why: eb.reason || 'quota' };
  if (eb.status && eb.status !== 'ok') return { code: 'C', why: `${eb.status}: ${eb.reason || ''}` };
  const scanned = eb.scanned ?? null, kept = eb.kept ?? d.count ?? null;
  if (scanned === 0) return { code: 'A', scanned, kept: 0 };
  if (kept === 0) return { code: 'B', scanned, kept: 0 };
  return { code: 'ok', scanned, kept };
}

function dropReasons(d) {
  const eb = (d && d.sources && d.sources.ebay) || {};
  const out = {};
  for (const x of eb.dropped || []) {
    const r = typeof x === 'string' ? x : (x.reason || x.why || JSON.stringify(x));
    const k = String(r).replace(/\d+/g, 'N').slice(0, 60);
    out[k] = (out[k] || 0) + (x.count || 1);
  }
  return out;
}

// What the query asked, in parts, so failures group by cause.
function shape(card, q) {
  const num = String(card.number || '');
  return {
    query: q,
    number: num,
    numberHasLetters: /[a-z]/i.test(num),
    printedTotal: card.set && card.set.total,
    askedPair: /\d+[a-z]*\/\d+/i.test(q || ''),
    setName: card.set && card.set.name,
    setNameInQuery: !!(q && card.set && card.set.name && q.includes(card.set.name)),
  };
}

async function askCard(card, live) {
  const d = await get(`/api/listings/${encodeURIComponent(card.id)}?dryRun=1`);
  const q = d.ok && d.json.dryRun && d.json.dryRun.ebay ? d.json.dryRun.ebay.parsedQuery : null;
  const rec = { id: card.id, name: card.name, number: card.number, price: card._price, ...shape(card, q) };
  if (!live) return rec;
  const L = await get(`/api/listings/${encodeURIComponent(card.id)}`);
  if (!L.ok) return { ...rec, code: 'C', why: `HTTP ${L.status} ${L.body}` };
  const c = classify(L.json);
  const eb = (L.json.sources && L.json.sources.ebay) || {};
  return { ...rec, ...c, cached: !!L.json.cached, drops: dropReasons(L.json),
    keptTitles: (L.json.listings || []).filter(x => x.source === 'ebay').slice(0, 3).map(x => x.title),
    droppedSample: (eb.droppedSample || []).slice(0, 4).map(x => (x.title || x) + ' — ' + (x.reason || '')) };
}

function report(db) {
  const rows = Object.entries(db.sets).filter(([id]) => !only.length || only.includes(id));
  const failing = [], ok = [], partial = [], unasked = [];
  for (const [id, s] of rows) {
    const asked = (s.cards || []).filter(c => c.code);
    if (!asked.length) { unasked.push(id); continue; }
    const good = asked.filter(c => c.code === 'ok').length;
    if (good === 0) failing.push([id, s, asked]); else if (good < asked.length) partial.push([id, s, asked]); else ok.push(id);
  }
  console.log(`\n  ${lang}: ${rows.length} sets — ok ${ok.length}, some cards fail ${partial.length}, EVERY card asked fails ${failing.length}, not asked ${unasked.length}`);
  for (const [id, s, asked] of failing) {
    console.log(`\n  ✗ ${id.padEnd(12)} ${s.name}  (${s.cardCount} cards)`);
    for (const c of asked) console.log(`      ${c.code} ${c.id.padEnd(22)} scanned ${c.scanned ?? '-'}  q="${c.query}"` +
      (Object.keys(c.drops || {}).length ? `\n         drops ${JSON.stringify(c.drops)}` : ''));
  }
  if (partial.length) {
    console.log('\n  partial (at least one card answered):');
    for (const [id, s, asked] of partial) console.log(`      ${id.padEnd(12)} ` + asked.map(c => `${c.code}:${c.number}`).join(' '));
  }
  if (unasked.length) console.log('\n  not asked: ' + unasked.join(' '));
}

async function main() {
  const db = load();
  if (reportOnly) return report(db);
  const S = await get(`/api/sets/lang/${lang}`);
  if (!S.ok) { console.error('sets: HTTP ' + S.status); process.exit(1); }
  const sets = S.json.sets.filter(s => !only.length || only.includes(s.id));
  console.log(`  ${sets.length} ${lang} sets — ${dry ? 'DRY (no eBay calls)' : 'LIVE (1 eBay call a card)'}`);

  for (const s of sets) {
    const prev = db.sets[s.id];
    if (resume && prev && prev.done && (dry || prev.live)) continue;
    const C = await get(`/api/sets/${encodeURIComponent(s.id)}/cards?lang=${lang}`);
    const cards = C.ok ? (C.json.data || []) : [];
    const cand = candidates(cards);
    const rec = { name: s.name, cardCount: s.cardCount, total: s.total, cards: [], live: !dry };
    if (!cand.length) { rec.done = true; rec.note = 'no cards returned'; db.sets[s.id] = rec; save(db); continue; }

    // One card, then two more spread through the set if it failed.
    const picks = [cand[0]];
    const r0 = await askCard(cand[0], !dry);
    if (r0.code === 'STOP') { console.error(`  STOP at ${s.id}: ${r0.why}`); save(db); process.exit(3); }
    rec.cards.push(r0);
    if (!dry && r0.code !== 'ok') {
      const rest = cand.slice(1);
      for (let i = 1; i <= EXTRA && rest.length; i++) {
        const c = rest[Math.min(rest.length - 1, Math.floor((i - 1) * rest.length / EXTRA))];
        if (picks.includes(c)) continue;
        picks.push(c);
        const r = await askCard(c, true);
        if (r.code === 'STOP') { db.sets[s.id] = rec; save(db); console.error(`  STOP at ${s.id}: ${r.why}`); process.exit(3); }
        rec.cards.push(r);
        if (r.code === 'ok') break;   // the set answers; it is not a query failure
      }
    }
    rec.done = true;
    db.sets[s.id] = rec; save(db);
    const tag = rec.cards.map(c => c.code || 'dry').join(',');
    console.log(`  ${s.id.padEnd(12)} ${tag.padEnd(10)} ${rec.cards[0].query}`);
    await sleep(250);
  }
  report(db);
}

main().catch(e => { console.error(e); process.exit(1); });
