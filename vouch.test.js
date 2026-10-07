// vouch.test.js — the VOUCHING bar: absence of evidence is a skip, never a pass (2026-10-07)
//
// deals.vouchFree / vouchPhotos (Roy): a listing is eligible only when there
// is evidence to vouch for it on every criterion. Each case below removes ONE
// piece of evidence from an otherwise-vouchable row and expects a skip naming
// it. Offline; the shelf stays off.

const deals = require('./deals.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const ref = { price: 100, isReal: true, current: true };
const view = (o) => Object.assign({ listings: [], stampGate: { applied: true, kind: 'sibling', pending: 0 },
  materialCheck: { applied: true, pending: 0 } }, o || {});
const row = (o) => Object.assign({ live: true, saleType: 'fixed', shippingKnown: true, landed: 60, price: 55, source: 'ebay',
  itemId: 'v1|1|0', title: 'Charizard 4/102 NM', stamp: { state: 'not-visible', kind: 'sibling' },
  sellerStated: true, sellerCondition: 'NM', conditionSource: 'ebay', sellerFeedback: { score: 2500, percent: 99.6 } }, o || {});
const free = (l, v) => deals.vouchFree(l, v || view(), ref);

console.log('\n  a row with every piece of evidence clears');
let r = free(row());
ok('cleared, listing each signal', !r.skip && r.cleared.length >= 6, r.skip || r.cleared.length + ' signals');
ok('...and reports the identity tier (a sibling check ran)', r.identity === 'sibling');
ok('the photos: 3 photos and a genuine back clear', !deals.vouchPhotos({ state: 'genuine-back', photos: 3 }).skip);

console.log('\n  remove ONE piece of evidence -> skipped, saying which');
const cases = [
  ['flagged by outlier.js', row({ suspect: 'unusually-cheap' }), null, /flagged/],
  ['shipping not stated', row({ shippingKnown: false }), null, /shipping/],
  ['less than 15% below the price', row({ landed: 95 }), null, /below a current measured price/],
  ['photo check pending', row({ stamp: { state: 'pending' } }), null, /not checked yet|pending/],
  ['photo check never ran on the row', row({ stamp: undefined }), null, /not run/],
  ['a sibling check could not run (no reference)', row(), view({ stampGate: { applied: true, kind: 'sibling', notRun: [{ label: 'X #2' }] } }), /could not run/],
  ['novelty check cannot run on this card', row(), view({ materialCheck: { applied: false, reason: 'no scan' } }), /cannot run/],
  ['novelty check not run on this row yet', row({ materialPending: true }), null, /novelty check not run/],
  ['no condition stated', row({ sellerStated: false, conditionSource: null, sellerCondition: null }), null, /no condition stated/],
  ['stated below near mint', row({ sellerCondition: 'LP' }), null, /below near mint/],
  ['seller feedback unknown', row({ sellerFeedback: null }), null, /feedback unknown/],
  ['a new seller (12 ratings)', row({ sellerFeedback: { score: 12, percent: 100 } }), null, /feedback 12/],
  ['a poorly rated seller (95%)', row({ sellerFeedback: { score: 900, percent: 95 } }), null, /feedback 900 at 95/],
];
for (const [what, l, v, re] of cases) { const x = free(l, v); ok(what + ' -> skip', !!x.skip && re.test(x.skip), x.skip || 'CLEARED'); }
ok('no current measured price -> skip', !!deals.vouchFree(row(), view(), { price: 100, isReal: true, current: false }).skip);
ok('no photo check applies to the card: noted, not a skip, identity none',
   (x => !x.skip && x.identity === 'none' && x.cleared.some(c => /no reprint, pair or sibling check applies/.test(c)))(free(row({ stamp: undefined }), view({ stampGate: { applied: false } }))));

console.log('\n  the photos (one getItem)');
for (const [what, v, re] of [['back check failed', { error: 'HTTP 500' }, /could not run/], ['one photo', { state: 'genuine-back', photos: 1 }, /1 photo/],
  ['no back verdict', { state: 'no-claim', photos: 4 }, /not vouched: no-claim/], ['another family\'s back', { state: 'other-back', photos: 4 }, /other-back/],
  ['a metal photo among them', { state: 'genuine-back', photos: 4, metal: true }, /metal/], ['nothing at all', null, /could not run/]])
  ok(what + ' -> skip', (x => !!x.skip && re.test(x.skip))(deals.vouchPhotos(v)), (deals.vouchPhotos(v).skip || 'CLEARED'));

// A re-seen row (2026-10-08): the back verdict came from the cache or the
// store, which kept no photo count, and the bar read it as "0 photos" — no row
// could be picked twice; the 40-card production run picked 0.
console.log('\n  a back verdict seen before (cache or store)');
{
  const x = deals.vouchPhotos({ state: 'genuine-back', cached: true });
  ok('a verdict with no photo count says "not known", never "0 photos"', !!x.skip && /not known/.test(x.skip) && !/0 photos/.test(x.skip), x.skip);
  const src = require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8').replace(/\r/g, '');
  ok('the in-memory verdict keeps the photo count', /backVerdicts\.set\(k, \{[^}]*photos: v\.photos/.test(src));
  ok('the deals bar asks for the count (needPhotos)', /backCheckItem\(card, l\.itemId, \{ background: true, needPhotos: true \}\)/.test(src));
  const fn = src.slice(src.indexOf('async function backCheckItem('), src.indexOf('\n}\n', src.indexOf('async function backCheckItem(')));
  ok('a cached verdict without a count fetches the listing (shared 15-min getItem cache)', /c\.photos == null && o && o\.needPhotos[\s\S]*ebayItemOnDemand\(itemId, cid, 'back', o\)[\s\S]*c\.photos = \(got\.hit\.images \|\| \[\]\)\.length/.test(fn));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
