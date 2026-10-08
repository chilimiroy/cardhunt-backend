// pricedupe.test.js — the duplicate-price guard judges duplication, not sort order
// (Roy, 2026-10-09). See pricedupe.js.
//
//   node pricedupe.test.js
'use strict';
require('./testcount')(18);
const fs = require('fs');
const pd = require('./pricedupe');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  pricedupe.test.js\n');
const r = (price, source, productId) => ({ price, source, meta: productId == null ? {} : { productId } });

console.log('  what it ALLOWS');
{ // The 08/10 shape: a value-ordered run, neighbours within 1.5%, every card its own product.
  const g = pd.createGuard(); let refused = 0;
  for (let i = 0; i < 400; i++) if (g.check('en-x-' + i, r(+(250 * Math.pow(0.995, i)).toFixed(2), 'tcgdex_tcgplayer_holofoil', 500000 + i))) refused++;
  ok('400 value-ordered prices, each 0.5% below the last, distinct products: none refused (the old guard refused most)', refused === 0, refused);
}
{ const g = pd.createGuard();
  ok('the same price for two DIFFERENT products: allowed', !g.check('en-a-1', r(42.5, 'tcgdex_tcgplayer_normal', 1)) && !g.check('en-a-2', r(42.5, 'tcgdex_tcgplayer_normal', 2)));
  ok('the same product at a different price: allowed (not the mismatch)', !g.check('en-a-3', r(10, 'tcgplayer_market', 7)) && !g.check('en-a-4', r(12, 'tcgplayer_market', 7)));
  ok('the same card asked twice (same product, same price): allowed', !g.check('en-a-5', r(99, 'tcgplayer_market', 9)) && !g.check('en-a-5', r(99, 'tcgplayer_market', 9)));
}
{ const g = pd.createGuard(); let refused = 0;
  for (let i = 0; i < 50; i++) if (g.check('en-b-' + i, r(0.15, 'yahoojp_3'))) refused++;
  ok('below $5 with no product id, 50 cards at $0.15: allowed (bulk sits on the minimum)', refused === 0, refused);
}
{ const g = pd.createGuard(); let refused = 0;
  for (let i = 0; i < 4; i++) if (g.check('en-c-' + i, r(12.5, 'yahoojp_5'))) refused++;
  ok('no product id, the same exact $12.50 on 4 cards: allowed', refused === 0);
  ok('…the same $12.50 from a DIFFERENT source: counted apart', !g.check('en-c-9', r(12.5, 'yahoojp_6')));
  ok('…$12.51 is not $12.50 (no proximity test)', !g.check('en-c-10', r(12.51, 'yahoojp_5')));
}
ok('no price: nothing to judge', pd.createGuard().check('en-d-1', r(0, 'x', 1)) === null && pd.createGuard().check('en-d-1', null) === null);

console.log('\n  what it REFUSES');
{ const g = pd.createGuard();
  g.check('en-e-1', r(249, 'tcgplayer_market', 90056));
  const v = g.check('en-e-2', r(249, 'tcgplayer_market', 90056));
  ok('a second card, same product, same price: refused, naming the first', /same product 90056 as en-e-1/.test(v || ''), v);
  ok('product ids compare across sources (TCGdex and the search are both TCGplayer ids)', !!g.check('en-e-3', r(249, 'tcgdex_tcgplayer_normal', '90056')));
  ok('…at any price, even below $5', (() => { const h = pd.createGuard(); h.check('en-f-1', r(0.25, 'tcgplayer_market', 5)); return !!h.check('en-f-2', r(0.25, 'tcgplayer_market', 5)); })());
}
{ const g = pd.createGuard(); const vs = [];
  for (let i = 0; i < 6; i++) vs.push(g.check('en-g-' + i, r(17.99, 'yahoojp_4')));
  ok('no product id, the same exact price on a 5th card: refused from the 5th on', vs.slice(0, 4).every(v => !v) && vs[4] && vs[5], JSON.stringify(vs.map(v => !!v)));
}
// The five real duplicates found replaying the 08/10 run (each written by the old guard).
{ const g = pd.createGuard(); const seq = [
    ['en-dpp-DP48', 249, 'tcgplayer_market', 90056], ['en-dpp-DP25', 249, 'tcgplayer_market', 90056], ['en-dpp-DP05', 249, 'tcgplayer_market', 90056],
    ['en-hgssp-HGSS18', 1400, 'tcgdex_tcgplayer_normal', 97703], ['en-np-36', 1400, 'tcgdex_tcgplayer_normal', 97703],
    ['en-ecard3-H09', 509.99, 'tcgdex_tcgplayer_holofoil', 85669], ['en-ecard3-10', 509.99, 'tcgdex_tcgplayer_normal', 85669],
    ['en-ecard3-12', 111.04, 'tcgplayer_market', 86201], ['en-ecard3-H11', 111.04, 'tcgplayer_market', 86201]];
  const refused = seq.filter(([id, p, s, pid]) => g.check(id, r(p, s, pid))).map(x => x[0]);
  ok('the 08/10 duplicates: the five second-comers refused, the first claimant of each product kept',
    refused.join(',') === 'en-dpp-DP25,en-dpp-DP05,en-np-36,en-ecard3-10,en-ecard3-H11', refused.join(','));
}

console.log('\n  ingest.js uses it, and the old test is gone');
const I = fs.readFileSync(__dirname + '/ingest.js', 'utf8').replace(/\r/g, '');
const spf = I.slice(I.indexOf('async function safePriceFor('), I.indexOf('\n}\n', I.indexOf('async function safePriceFor(')));
ok('safePriceFor asks PRICE_GUARD.check with the card id and the result', /const dup = PRICE_GUARD\.check\(card\.api_card_id, res\);/.test(spf));
ok('a refusal is named — card, source, why — and nothing is written', /REFUSED \$\{card\.api_card_id\}/.test(spf) && /if \(dup\) \{[\s\S]{0,200}return null;/.test(spf));
ok('one guard for the whole command (not per card)', /^const PRICE_GUARD = pricedupe\.createGuard\(\);$/m.test(I));
ok('the proximity-over-a-window test is gone (looksLikeJunk, recentPrices, JUNK_REL_TOLERANCE)', !/function looksLikeJunk|recentPrices|JUNK_REL_TOLERANCE/.test(I));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
