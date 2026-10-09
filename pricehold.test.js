// pricehold.test.js — a card whose price we cannot stand behind shows no number
// (Roy, 2026-10-09). See pricehold.js.
//
//   node pricehold.test.js         offline
//   node pricehold.test.js --db    also: the real headline query returns nothing for a held card,
//                                  and still returns the unheld cards' prices
'use strict';
require('./testcount')(25);
const fs = require('fs'), vm = require('vm');
const ph = require('./pricehold'), printsql = require('./printsql'), { isOurCardId } = require('./cardid');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  pricehold.test.js\n');

console.log('  the list');
const ids = Object.keys(ph.HELD);
// The list is the catalogue-wide measurement (pricehold-collisions.json,
// collisionscan.js --write): 53 products over 106 cards on 2026-10-09; 23
// over 47 once our search's rows were held to the whole-number rule
// (TASK-product-matching) — every one left involves TCGdex's own mapping.
const listed = new Set(ph.COLLISIONS.flatMap(c => c.cards.map(x => x.id)));
ok('EVERY card of EVERY collision is held — both sides, not the first claimant', ids.length === listed.size && [...listed].every(id => ph.HELD[id])
  && ph.COLLISIONS.every(c => c.cards.length >= 2 && c.cards.every(x => ph.HELD[x.id].products.includes(c.product))), ids.length + ' held of ' + listed.size);
ok('the catalogue-wide list: 22 products on 45 cards; 97703 (HGSS18 / np-36) is gone — it is a [Staff] product stating HGSS18, refused on both cards',
  ph.COLLISIONS.length === 22 && ids.length === 45 && !ph.COLLISIONS.some(c => c.product === '97703')
  && ph.REFUSED.some(r => r.card === 'en-np-36' && r.product === '97703') && ph.REFUSED.some(r => r.card === 'en-hgssp-HGSS18' && r.product === '97703'), ph.COLLISIONS.length + ' / ' + ids.length);
ok('every product left is held because TCGdex maps it, never by our search alone', ph.COLLISIONS.every(c => c.origin !== 'our-search' && c.cards.some(x => x.via.some(v => v.startsWith('tcgdex')))));
ok('the Ninetales-Gyarados-Starmie trio stays held (TCGdex gives all three one product)', ['en-ru1-3', 'en-ru1-5', 'en-ru1-6'].every(id => ph.HELD[id]));
ok('the Umbreon pair, the Gengar pair and Garchomp 146/228/247 are released', ['en-ecard3-32', 'en-ecard3-H30', 'en-ecard3-10', 'en-ecard3-H09', 'en-sm11-146', 'en-sm11-228', 'en-sm11-247', 'en-sm11-114'].every(id => !ph.HELD[id]));

console.log('\n  refused rows (our search\'s, stating another number)');
ok('the refused rows are measured, named by row id, each with why', ph.REFUSED.length >= 274 && ph.REFUSED.every(r => /^\d+$/.test(r.row) && r.card && /states (another|no) number|stamped product|TCGdex maps a/.test(r.why)), ph.REFUSED.length + ' rows');
ok('a stamped product is refused unless TCGdex maps the card to it: Delcatty SM132 [Staff] rows out, Lycanroc SM118 (Prerelease) rows kept',
  ph.REFUSED.some(r => r.card === 'en-smp-SM132' && /stamped/.test(r.why)) && !ph.REFUSED.some(r => r.card === 'en-smp-SM118'));
ok('Skyridge Gengar H09\'s rows for Gengar (10) are among them, and Golduck 50a\'s own (50a) row is not',
  ph.REFUSED.some(r => r.card === 'en-ecard3-H09' && r.matched === 'Gengar (10)') && !ph.REFUSED.some(r => r.card === 'en-ecard2-50a'));
ok('every refused row is out of the headline rule, on the alias it is given', ph.REFUSED.every(r => printsql.basePrintingSql('ph', 'c').includes(r.row)) && /p2\.id NOT IN \(/.test(printsql.basePrintingSql('p2', 'c2')));
ok('every hold says why, names the other card(s), and when it comes off', ids.every(id => /price withheld/.test(ph.HELD[id].reason) && ph.HELD[id].with.length && ph.HELD[id].removeWhen));
ok('every held id is one of ours (safe to quote into SQL)', ids.every(id => isOurCardId(id) && !/['\\]/.test(id)));

console.log('\n  estimates held (an estimate 5x or more from the card\'s own measured record)');
const ES = require('./pricehold-estimates.json');
ok('the list is measured at the multiple estimatescan.js holds at (5), and Skyridge Gengar H09 is on it',
  ES.multiple === 5 && require('./estimatescan').MULTIPLE === 5 && ph.ESTIMATE_HELD['en-ecard3-H09'] && ES.held.every(e => e.ratio >= ES.multiple && e.readings > 0),
  ES.held.map(e => e.id + ' ' + e.ratio + 'x').join(', '));
ok('its estimate rows leave the headline rule, its measured rows do not',
  printsql.basePrintingSql('ph', 'c').includes(ph.notEstimateHeldSql('ph')) && /NOT \(ph\.source LIKE 'estimate%' AND ph\.card_api_id IN \('en-ecard3-H09'/.test(ph.notEstimateHeldSql('ph')));
const g = ph.apply({ id: 'en-ecard3-H09', _price: 0.3, _priceIsReal: false, _priceSource: 'estimate' });
ok('made to fire: H09 with only its estimate shows no number, and says the estimate and its own median',
  g._price === null && g.priceHeld && /\$0\.3\b/.test(g.priceHeld.reason) && /\$192\.97|median of \d+ readings/.test(g.priceHeld.reason), g.priceHeld && g.priceHeld.reason);
const real = ph.apply({ id: 'en-ecard3-H09', _price: 1300, _priceIsReal: true, _priceSource: 'tcgplayer_market' });
ok('…and what it ALLOWS: once a measured price is recorded it shows, unheld', real._price === 1300 && !real.priceHeld);

console.log('\n  the headline rule');
const sql = printsql.basePrintingSql('ph', 'c');
ok('basePrintingSql excludes every row of a held card (real and estimate alike)', ids.every(id => sql.includes("'" + id + "'")) && /ph\.card_api_id NOT IN \(/.test(sql));
ok('…on the table alias it is given', /p2\.card_api_id NOT IN/.test(printsql.basePrintingSql('p2', 'c2')));
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
ok('the card endpoint wraps its payload in pricehold.apply', /return res\.json\(\{ data: pricehold\.apply\(\{/.test(S) && /\}, c\.api_card_id\) \}\);/.test(S));
ok('the set-cards payload wraps each card in pricehold.apply', /return pricehold\.apply\(\{\n\s+id: r\.api_card_id,/.test(S) && /\}, r\.api_card_id\);\n\s+\}\);/.test(S));
ok('the deals pool refuses a held card by name too', /&& !pricehold\.heldFor\(id\)\)\.slice\(0, n\)/.test(S));

console.log('\n  the payload');
const held = ph.apply({ id: 'en-ru1-5', _price: 1400, _priceIsReal: true, _priceSource: 'tcgdex_tcgplayer_normal', tcgplayer: { prices: { normal: { market: 1400 } } }, cardmarket: {} });
ok('apply: no headline, no TCGplayer or Cardmarket blob, priceHeld with the reason',
  held._price === null && held._priceIsReal === false && held.tcgplayer === null && held.cardmarket === null && new RegExp(ph.HELD['en-ru1-5'].product).test(held.priceHeld.reason));
const free = ph.apply({ id: 'en-base1-4', _price: 928.32, tcgplayer: { x: 1 } });
ok('apply leaves an unheld card alone', free._price === 928.32 && free.tcgplayer && !free.priceHeld);

console.log('\n  the page');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const gb = H.slice(H.indexOf('function getBase(c, out) {'), H.indexOf('\n}\n', H.indexOf('function getBase(c, out) {')) + 2);
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
      ok('…while their rows are still stored (nothing deleted)', raw >= ids.length * 0.9, raw + ' of ' + ids.length + ' held cards have rows');
      // The file is the measurement: re-measure and compare (it drifts when
      // the nightly writes a new mapping, or when a collision is fixed).
      const now = await require('./collisionscan').scan(db);
      const key = list => list.map(c => c.product + ':' + c.cards.map(x => x.id).join(',')).sort().join('|');
      ok('pricehold-collisions.json matches the database today (re-run collisionscan.js --write if not)', key(now.collisions) === key(ph.COLLISIONS),
        now.collisions.length + ' products now vs ' + ph.COLLISIONS.length + ' in the file');
      ok('…and its refused rows too', now.refused.map(r => r.row).sort().join() === ph.REFUSED.map(r => r.row).sort().join(), now.refused.length + ' rows now vs ' + ph.REFUSED.length);
      // T3 (TASK-product-matching): no TCGplayer product on two of our cards,
      // except where TCGdex itself gives it to both — and then every card on it is held.
      const unheld = now.collisions.filter(c => c.cards.some(x => !ph.HELD[x.id]));
      ok('no TCGplayer product id is mapped to more than one card without every card on it held', unheld.length === 0,
        unheld.map(c => c.product + ': ' + c.cards.map(x => x.id).join(', ')).join(' | '));
      ok('our search maps no product to two cards (none left from our matching alone)', !now.collisions.some(c => c.origin === 'our-search'));
      const rel = await q(['en-ecard3-32', 'en-ecard3-H30', 'en-sm11-247']);
      const at = id => rel.find(r => r.api_card_id === id) || {};
      ok('released: Umbreon 32 and Garchomp 247 have a headline; H30 has none (its only rows were Umbreon 32\'s product)',
        at('en-ecard3-32').price_usd > 0 && at('en-sm11-247').price_usd > 0 && at('en-ecard3-H30').price_usd == null, JSON.stringify(rel));
      const es = await require('./estimatescan').scan(db);
      ok('pricehold-estimates.json matches the database today (re-run estimatescan.js --write if not)',
        es.held.map(e => e.id).sort().join() === ES.held.map(e => e.id).sort().join(), es.held.map(e => e.id).join(', ') + ' now vs ' + ES.held.map(e => e.id).join(', '));
      const gh = await q(['en-ecard3-H09']);
      ok('H09: the real headline query returns no estimate', gh.length === 1 && gh[0].price_usd == null, JSON.stringify(gh));
      const u = await q(['en-base1-4', 'en-sv03.5-199', 'en-dpp-DP01']);
      ok('unheld cards beside them keep their headline', u.filter(r => r.price_usd != null).length >= 2, JSON.stringify(u));
    } finally { await db.end(); }
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
