// photoqueue.test.js — what the one photo worker does first (photo speed, 2026-10-07)
//
//   node photoqueue.test.js
//
// Render gives the worker 0.15 of a core, so the order of its queue decides
// what a visitor sees checked. Measured on Giratina V #130 cold (194 rows):
// the comparisons ran in GATHERED order and the cheapest 25 resolved at 146 s
// of a 191 s run; 191 colour profiles ran before the first comparison.
// Executed here through the real pool, with the CDN stubbed: the order the
// photos are fetched is the order the queue serves them.
'use strict';
const fs = require('fs');
const sc = require('./stampcheck.js');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
const fnS = name => { const i = S.indexOf('function ' + name + '('); return i < 0 ? '' : S.slice(i, S.indexOf('\n}', i) + 2); };

const FXS = require('./stamp.fixture.json').scans;
const LUG = cm.reprintCardsOf({ cardId: 'en-ecard2-149', setId: 'ecard2', number: '149' });
const JPEG = Buffer.from(FXS['en-ecard2-149'].jpeg, 'base64');
const U = id => 'https://i.ebayimg.com/images/g/' + id + '/s-l225.jpg';
const row = (id, price, saleType) => ({ source: 'ebay', itemId: 'v1|' + id + '|0', price, landed: price, saleType: saleType || 'buy-it-now', imageUrl: U('p' + id) });
let fetched = [];
sc._setFetch(async url => { fetched.push(url.match(/\/g\/(\w+)\//)[1]);
  return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) }; });

(async () => {
  console.log('\n  1. comparisons: cheapest Buy It Now first');
  const gathered = [row(1, 40), row(2, 3, 'auction'), row(3, 12), row(4, null), row(5, 7), row(6, 1, 'auction'), row(7, 12)];
  const order = sc.compareOrder(gathered).map(r => r.itemId.split('|')[1]).join(',');
  ok('Buy It Now by price, then auctions by price, unpriced last; ties keep their order', order === '5,3,7,1,4,6,2', order);
  ok('compareOrder does not mutate the view\'s rows', gathered[0].itemId === 'v1|1|0');
  ok('the server queues a view\'s pending rows in that order, not gathered order',
     /pendingRows = stampcheck\.compareOrder\(pendingRows\);\s*Promise\.all\(pendingRows\.map\(r => stampcheck\.checkItem\(/.test(fnS('stampFollowUpWith')));
  sc._clearCache(); fetched = [];
  await Promise.all(sc.compareOrder(gathered).map(r => sc.checkItem(r.itemId, r.imageUrl, LUG)));
  ok('…and the pool fetches them in that order', fetched.join(',') === 'p5,p3,p7,p1,p4,p6,p2', fetched.join(','));

  console.log('\n  photoqueue.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
