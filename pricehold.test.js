// pricehold.test.js — a card whose price we cannot stand behind shows no number
// (Roy, 2026-10-09). See pricehold.js.
//
//   node pricehold.test.js         offline
//   node pricehold.test.js --db    also: the real headline query returns nothing for a held card,
//                                  and still returns the unheld cards' prices
'use strict';
require('./testcount')(14);
const fs = require('fs'), vm = require('vm');
const ph = require('./pricehold'), printsql = require('./printsql'), { isOurCardId } = require('./cardid');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  pricehold.test.js\n');

console.log('  the list');
const ids = Object.keys(ph.HELD);
ok('BOTH sides of every collision are held (9 cards, 4 products)', ids.length === 9 && ph.COLLISIONS.length === 4
  && ph.COLLISIONS.every(c => c.cards.length >= 2 && c.cards.every(id => ph.HELD[id] && ph.HELD[id].product === c.product)), ids.length);
ok('the four found replaying 08/10: 90056, 97703, 85669, 86201', ph.COLLISIONS.map(c => c.product).sort().join(',') === '85669,86201,90056,97703');
ok('every hold says why, names the other card(s), and when it comes off', ids.every(id => /price withheld/.test(ph.HELD[id].reason) && ph.HELD[id].with.length && ph.HELD[id].removeWhen));
ok('every held id is one of ours (safe to quote into SQL)', ids.every(id => isOurCardId(id) && !/['\\]/.test(id)));

console.log('\n  the headline rule');
const sql = printsql.basePrintingSql('ph', 'c');
ok('basePrintingSql excludes every row of a held card (real and estimate alike)', ids.every(id => sql.includes("'" + id + "'")) && /ph\.card_api_id NOT IN \(/.test(sql));
ok('…on the table alias it is given', /p2\.card_api_id NOT IN/.test(printsql.basePrintingSql('p2', 'c2')));
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
ok('the card endpoint wraps its payload in pricehold.apply', /return res\.json\(\{ data: pricehold\.apply\(\{/.test(S) && /\}, c\.api_card_id\) \}\);/.test(S));
ok('the set-cards payload wraps each card in pricehold.apply', /return pricehold\.apply\(\{\n\s+id: r\.api_card_id,/.test(S) && /\}, r\.api_card_id\);\n\s+\}\);/.test(S));
ok('the deals pool refuses a held card by name too', /&& !pricehold\.heldFor\(id\)\)\.slice\(0, n\)/.test(S));

console.log('\n  the payload');
const held = ph.apply({ id: 'en-np-36', _price: 1400, _priceIsReal: true, _priceSource: 'tcgdex_tcgplayer_normal', tcgplayer: { prices: { normal: { market: 1400 } } }, cardmarket: {} });
ok('apply: no headline, no TCGplayer or Cardmarket blob, priceHeld with the reason',
  held._price === null && held._priceIsReal === false && held.tcgplayer === null && held.cardmarket === null && /97703/.test(held.priceHeld.reason));
const free = ph.apply({ id: 'en-base1-4', _price: 928.32, tcgplayer: { x: 1 } });
ok('apply leaves an unheld card alone', free._price === 928.32 && free.tcgplayer && !free.priceHeld);

console.log('\n  the page');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const gb = H.slice(H.indexOf('function getBase(c) {'), H.indexOf('\n}\n', H.indexOf('function getBase(c) {')) + 2);
const ctx = { pricesOpen: () => true, mockP: () => 77.7 };
vm.createContext(ctx); vm.runInContext(gb, ctx);
ok('getBase: a held card has no number — not the blob, not the estimate',
  ctx.getBase({ priceHeld: { reason: 'x' }, _price: null, tcgplayer: { prices: { holofoil: { market: 1400 } } } }) === 0);
ok('getBase: an unheld card without a price still falls through as before (unchanged)', ctx.getBase({ _price: null }) === 77.7);
const up = H.slice(H.indexOf('function updatePrices(grade,base){'), H.indexOf('\n}\n', H.indexOf('function updatePrices(grade,base){')));
ok('the card page draws a dash and the reason, as a warning', /if \(cc && cc\.priceHeld\) \{\s*document\.getElementById\('cd-mkt'\)\.innerHTML = '&mdash;';/.test(up) && /liveEsc\(cc\.priceHeld\.reason\)/.test(up));

(async () => {
  if (process.argv.includes('--db')) {
    console.log('\n  --db: the real headline query');
    const db = require('./schemaguard').testPool();
    try {
      const q = async list => (await db.query(`SELECT c.api_card_id, lp.price_usd FROM cards c LEFT JOIN LATERAL (
          SELECT price_usd FROM price_history ph WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL
            AND ${printsql.basePrintingSql('ph', 'c')} ORDER BY ph.recorded_at DESC LIMIT 1) lp ON TRUE
        WHERE c.api_card_id = ANY($1)`, [list])).rows;
      const h = await q(ids);
      ok('every held card: in the catalogue, and NO headline row', h.length === ids.length && h.every(r => r.price_usd == null), JSON.stringify(h.filter(r => r.price_usd != null)));
      const raw = (await db.query(`SELECT count(DISTINCT card_api_id)::int n FROM price_history WHERE card_api_id = ANY($1) AND grade IS NULL`, [ids])).rows[0].n;
      ok('…while their rows are still stored (nothing deleted)', raw >= 7, raw + ' of 9 hold rows');
      const u = await q(['en-base1-4', 'en-sv03.5-199', 'en-dpp-DP01']);
      ok('unheld cards beside them keep their headline', u.filter(r => r.price_usd != null).length >= 2, JSON.stringify(u));
    } finally { await db.end(); }
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
