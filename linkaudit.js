// ══════════════════════════════════════════════════════════════
// linkaudit.js — why does this card have no links?
//
// "No links" has three very different causes that look identical in
// the UI:
//
//   A. eBay returned nothing        — scanned 0
//   B. the gate rejected everything — scanned N, kept 0
//   C. the card never got that far  — resolve or query failure
//
// The response already carries kept/rejected/scanned. This reads it per
// card and reports which of the three happened, with the drop reasons.
// Read-only, uses dryRun where it can to avoid spending quota.
//
//   node linkaudit.js sv10                    a whole set
//   node linkaudit.js sv10 --grade="PSA 10"
//   node linkaudit.js swsh11 --name=Giratina  only matching cards
//   node linkaudit.js sv10 --live             spend quota, real results
//   node linkaudit.js en-sv10-1               one card
// ══════════════════════════════════════════════════════════════

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const args = process.argv.slice(2);
const target = args[0];
const grade  = (args.find(a => a.startsWith('--grade=')) || '--grade=Raw NM').replace('--grade=', '');
const nameF  = (args.find(a => a.startsWith('--name=')) || '').replace('--name=', '').toLowerCase();
const live   = args.includes('--live');
const limit  = parseInt((args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '')) || 12;

if (!target) {
  console.log('  usage: node linkaudit.js <setId|cardId> [--grade="PSA 10"] [--name=X] [--live]');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  try {
    const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, body: text.slice(0, 200) };
    return { ok: true, json: JSON.parse(text) };
  } catch (e) { return { ok: false, status: 0, body: e.message }; }
}

function classify(d) {
  if (!d) return { code: 'C', why: 'no response' };
  if (!d.card || !d.card.name) return { code: 'C', why: 'listings could not resolve the card' };

  const eb = (d.sources && d.sources.ebay) || {};
  if (eb.status && !['ok', 'dry-run'].includes(eb.status)) {
    return { code: 'C', why: `ebay source ${eb.status}: ${eb.reason || ''}`.trim() };
  }

  const scanned  = eb.scanned  != null ? eb.scanned  : null;
  const rejected = eb.rejected != null ? eb.rejected : null;
  const kept     = d.count != null ? d.count : (eb.count != null ? eb.count : null);

  if (scanned === null) {
    // In dry run nothing is fetched, so there is legitimately no scan count.
    // Saying "the gate may not have run" here was misleading — it had nothing
    // to run on.
    if (d.dryRun) return { code: 'd', why: 'dry run — query built, nothing fetched. Use --live to see results.' };
    return { code: '?', why: 'no scan count reported — the gate may not have run' };
  }
  if (scanned === 0)    return { code: 'A', why: 'eBay returned nothing for this query' };
  if (kept === 0)       return { code: 'B', why: `all ${scanned} scanned were rejected` };
  return { code: 'ok', why: `${kept} kept of ${scanned}` };
}

async function auditCard(cardId, cardName, cardNumber) {
  const q = `/api/listings/${encodeURIComponent(cardId)}?grade=${encodeURIComponent(grade)}` +
            (live ? '&refresh=1' : '&dryRun=1');
  const r = await get(q);
  if (!r.ok) {
    console.log(`  C     ${String(cardNumber).padEnd(5)} ${String(cardName).slice(0,26).padEnd(28)} HTTP ${r.status}`);
    return 'C';
  }
  const d = r.json;
  const c = classify(d);

  const query = (d.dryRun && d.dryRun.ebay && d.dryRun.ebay.parsedQuery) ||
                (d.sources && d.sources.ebay && d.sources.ebay.query) || '';

  const mark = c.code === 'ok' ? ' ok  ' : `  ${c.code}   `;
  console.log(`${mark}${String(cardNumber).padEnd(5)} ${String(cardName).slice(0,26).padEnd(28)} ${c.why}`);
  if (c.code !== 'ok') {
    if (query) console.log(`        query: ${query}`);
    const drops = (d.sources && d.sources.ebay && d.sources.ebay.droppedSample) || [];
    const seen = new Set();
    drops.slice(0, 20).forEach(x => {
      if (seen.has(x.reason)) return;
      seen.add(x.reason);
      console.log(`        drop:  ${x.reason}`);
      console.log(`               "${String(x.title).slice(0, 72)}"`);
    });
    if (d.card) {
      console.log(`        card:  number=${d.card.number} setTotal=${d.card.setTotal} set="${d.card.set}"`);
    }
  }
  return c.code;
}

(async () => {
  console.log(`\n${'='.repeat(88)}`);
  console.log(`  LINK AUDIT — ${target}   grade "${grade}"   ${live ? 'LIVE' : 'dry run'}`);
  console.log(`${'='.repeat(88)}\n`);

  let cards = [];
  if (/^(en|ja|zh-tw|zh-cn)-/.test(target)) {
    const c = await get(`/api/cards/${encodeURIComponent(target)}`);
    if (!c.ok) { console.log(`  card not found: HTTP ${c.status}`); return; }
    const d = c.json.data || c.json;
    cards = [{ id: target, name: d.name, number: d.number }];
  } else {
    const r = await get(`/api/sets/${encodeURIComponent(target)}/cards`);
    if (!r.ok) { console.log(`  set not found: HTTP ${r.status}`); return; }
    const d = r.json;
    console.log(`  set served from: ${d._source || d.source || '(none)'}` +
                (d.resolvedSetId ? `   resolved: ${d.resolvedSetId}` : ''));
    cards = (d.cards || d.data || []).map(c => ({
      id: c.id || c.api_card_id, name: c.name, number: c.number,
      price: c._price, real: c._priceIsReal
    }));
    if (nameF) cards = cards.filter(c => String(c.name).toLowerCase().includes(nameF));
    console.log(`  ${cards.length} cards${nameF ? ` matching "${nameF}"` : ''}` +
                (cards.length > limit ? `, checking ${limit}` : '') + '\n');
    // Spread the sample rather than taking the first N — chase cards live
    // at the end of a set and are exactly where this tends to fail.
    if (cards.length > limit) {
      const step = cards.length / limit;
      cards = Array.from({ length: limit }, (_, i) => cards[Math.floor(i * step)]);
    }
  }

  console.log('  code  #     card                         outcome');
  console.log('  ' + '-'.repeat(80));

  const tally = {};
  for (const c of cards) {
    const code = await auditCard(c.id, c.name, c.number);
    tally[code] = (tally[code] || 0) + 1;
    await sleep(live ? 400 : 150);
  }

  console.log('\n  ' + '-'.repeat(80));
  console.log('  A = eBay returned nothing     B = gate rejected everything');
  console.log('  C = card or source failed     d = dry run, nothing fetched');
  console.log('  ? = no scan count on a live call — the gate may not have run\n');
  Object.entries(tally).sort().forEach(([k, v]) => console.log(`    ${k.padEnd(4)} ${v}`));

  if (tally.B) console.log('\n  B means the query found listings and the gate refused them all.\n' +
                           '  Read the drop reasons above — either the gate is too strict\n' +
                           '  for this card, or eBay genuinely has only wrong cards.');
  if (tally.A) console.log('\n  A means the query itself returns nothing. Check the query string\n' +
                           '  printed above — usually an over-constrained set name or number.');
  if (tally.C) console.log('\n  C means the card never reached eBay. Check id resolution.');
  if (tally.d) console.log('\n  All dry runs. The queries above are well-formed and the cards resolve,\n' +
                           '  which rules out a resolution fault. Re-run with --live --limit=4 to\n' +
                           '  see whether eBay returns nothing (A) or the gate refuses it all (B).');
  console.log('');
})();
