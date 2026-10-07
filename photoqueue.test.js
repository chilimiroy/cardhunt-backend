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
     /pendingRows = stampcheck\.compareOrder\(pendingRows\);[^]{0,200}?Promise\.all\(pendingRows\.map\(r => stampcheck\.checkItem\(/.test(fnS('stampFollowUpWith')));
  sc._clearCache(); fetched = [];
  await Promise.all(sc.compareOrder(gathered).map(r => sc.checkItem(r.itemId, r.imageUrl, LUG)));
  ok('…and the pool fetches them in that order', fetched.join(',') === 'p5,p3,p7,p1,p4,p6,p2', fetched.join(','));

  console.log('\n  2. classes: top colour, top comparisons, other colour, other comparisons');
  ok('the classes, lowest first: colour top 0 · comparisons top / back / asked 1 · colour rest 2 · comparisons rest 3',
     sc.PRIO.colourTop === 0 && sc.PRIO.compareTop === 1 && sc.PRIO.back === 1 && sc.PRIO.asked === 1 && sc.PRIO.colourRest === 2 && sc.PRIO.compareRest === 3);
  ok('the top rows are the first 25 in compareOrder', sc.COMPARE_TOP === 25
     && sc.topOf(Array.from({ length: 40 }, (_, i) => row(100 + i, 40 - i))).map(r => r.price).join(',') === Array.from({ length: 25 }, (_, i) => i + 1).join(','));
  {
    // Hold the worker (test hook), let every class download into its queue,
    // then release and read the order they finish in: with one worker, that
    // is the order run.
    sc._clearCache(); const done = [];
    sc._setFetch(async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) }));
    const track = (name, p) => p.then(() => done.push(name));
    sc._hold(true);
    const all = [track('cmpRest', sc.checkItem('v1|901|0', U('cr1'), LUG, null, sc.PRIO.compareRest))];
    all.push(track('colRest', sc.checkMaterialPhoto(U('mr1'), sc.PRIO.colourRest)));
    all.push(track('cmpTop', sc.checkItem('v1|902|0', U('ct1'), LUG, null, sc.PRIO.compareTop)));
    all.push(track('colTop', sc.checkMaterialPhoto(U('mt1'), sc.PRIO.colourTop)));
    all.push(track('raised', sc.checkItem('v1|903|0', U('rz1'), LUG, null, sc.PRIO.compareRest)));
    sc.checkItem('v1|903|0', U('rz1'), LUG, null, sc.PRIO.compareTop);   // asked again, more urgently
    await new Promise(r => setTimeout(r, 50));                          // every download lands in the worker queue
    const byClass = sc.poolState().queuedByClass;
    sc._hold(false);
    await Promise.all(all);
    ok('the queue reports itself by class', byClass && byClass[0] === 1 && byClass[1] === 2 && byClass[2] === 1 && byClass[3] === 1, JSON.stringify(byClass));
    ok('run in class order: top colour, top comparisons (first-come), other colour, other comparisons',
       done.join(',') === 'colTop,cmpTop,raised,colRest,cmpRest', done.join(','));
    ok('a job asked for again more urgently moves up its class (raised from 3 to 1)', done.indexOf('raised') < done.indexOf('colRest'));
  }
  const fu = fnS('stampFollowUpWith'), mf = fnS('materialFollowUp');
  ok('the server queues the view\'s top rows in class 1 and the rest in class 3',
     /top\.has\(r\.itemId\) \? stampcheck\.PRIO\.compareTop : stampcheck\.PRIO\.compareRest/.test(fu));
  ok('…the top rows come from the gate (pendingTop), on the first answer and on every rebuild',
     /stampFollowUp\(card, requestedId, grade, printing, edition, gathered\.stampPending, gathered\.stampPendingTop\)/.test(S)
     && /stampFollowUp\(card, requestedId, grade, printing, edition, j\.stampPending, j\.stampPendingTop\)/.test(S));
  ok('colour: the top rows in class 0, the rest in class 2, in compareOrder',
     /top\.has\(r\) \? stampcheck\.PRIO\.colourTop : stampcheck\.PRIO\.colourRest/.test(mf) && /stampcheck\.compareOrder\(/.test(mf) && /stampcheck\.topOf\(rows\)/.test(mf));
  {
    const g = sc.gate([row(10, 9), row(11, 2), row(12, 5, 'auction'), row(13, 1)], LUG);
    ok('the gate returns pending rows in compareOrder, and which are top rows',
       g.pending.map(r => r.price).join(',') === '1,2,9,5' && g.pendingTop.length === 4, g.pending.map(r => r.price).join(','));
  }

  console.log('\n  3. downloads happen off the worker');
  {
    const sj = fs.readFileSync(__dirname + '/stampcheck.js', 'utf8');
    const rj = sj.slice(sj.indexOf('function runJob('), sj.indexOf('\n}', sj.indexOf('function runJob(')));
    ok('the worker never downloads: runJob only posts a downloaded photo', rj.length > 50 && !/_fetch|await/.test(rj) && /const buf = job\.buf/.test(rj));
    // One photo whose download never ends must not hold the worker from the next.
    sc._clearCache(); let never;
    sc._setFetch(url => /\/g\/stuck\//.test(url) ? new Promise(r => { never = r; })
      : Promise.resolve({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) }));
    sc.checkItem('v1|950|0', U('stuck'), LUG, null, sc.PRIO.compareTop);
    const t0 = Date.now(), v = await sc.checkItem('v1|951|0', U('next'), LUG, null, sc.PRIO.compareTop);
    ok('a download that never ends does not hold the next comparison', v.state === 'not-visible' && Date.now() - t0 < 5000, v.state + ' ' + (Date.now() - t0) + ' ms');
    ok('the lanes run ahead of the worker by a bound (READY_MAX), most urgent first',
       sc.poolState().materialFetch.readyMax === 12 && /_queue\.length \+ _mat\.fetching < READY_MAX/.test(sj) && /const job = nextJob\(_fetchQueue\)/.test(sj));
    sc._setFetch(async () => ({ ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => new ArrayBuffer(8) }));
    const png = await sc.checkItem('v1|952|0', U('png'), LUG, null, sc.PRIO.compareTop);
    ok('an eBay photo served as PNG under a comparison is unreadable, never judged', png.state === 'unreadable' && /not a JPEG/.test(png.says), png.says);
    if (never) never({ ok: false, status: 599, headers: { get: () => '' } });
  }

  console.log('\n  photoqueue.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
