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
require('./testcount')(34);   // assertions in a plain run — fewer fails the file (testcount.js)
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
     /pendingRows = stampcheck\.compareOrder\(pendingRows\)[^]{0,200}?Promise\.all\(pendingRows\.map\(r => stampcheck\.checkItem\(/.test(fnS('stampFollowUpWith')));
  sc._clearCache(); fetched = [];
  await Promise.all(sc.compareOrder(gathered).map(r => sc.checkItem(r.itemId, r.imageUrl, LUG)));
  ok('…and the pool fetches them in that order', fetched.join(',') === 'p5,p3,p7,p1,p4,p6,p2', fetched.join(','));

  console.log('\n  2. classes: top colour, top comparisons, other colour');
  ok('the classes, lowest first: colour top 0 · comparisons top / back / asked 1 · colour rest 2 — no class for other comparisons',
     sc.PRIO.colourTop === 0 && sc.PRIO.compareTop === 1 && sc.PRIO.back === 1 && sc.PRIO.asked === 1 && sc.PRIO.colourRest === 2
     && Object.keys(sc.PRIO).length === 5);
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
    const all = [track('colRest', sc.checkMaterialPhoto(U('mr1'), sc.PRIO.colourRest))];
    all.push(track('cmpTop', sc.checkItem('v1|902|0', U('ct1'), LUG, null, sc.PRIO.compareTop)));
    all.push(track('colTop', sc.checkMaterialPhoto(U('mt1'), sc.PRIO.colourTop)));
    all.push(track('raised', sc.checkMaterialPhoto(U('rz1'), sc.PRIO.colourRest)));
    sc.checkMaterialPhoto(U('rz1'), sc.PRIO.colourTop);                // asked again, more urgently
    await new Promise(r => setTimeout(r, 50));                          // every download lands in the worker queue
    const byClass = sc.poolState().queuedByClass;
    sc._hold(false);
    await Promise.all(all);
    ok('the queue reports itself by class', byClass && byClass[0] === 2 && byClass[1] === 1 && byClass[2] === 1, JSON.stringify(byClass));
    ok('run in class order: top colour (first-come), top comparisons, other colour',
       done.join(',') === 'colTop,raised,cmpTop,colRest', done.join(','));
    ok('a job asked for again more urgently moves up (raised from class 2 to 0)', done.indexOf('raised') < done.indexOf('cmpTop'));
  }
  const fu = fnS('stampFollowUpWith'), mf = fnS('materialFollowUp');
  ok('the server queues ONLY the rows the gate chose, in class 1',
     /pendingRows = stampcheck\.compareOrder\(pendingRows\)\.filter\(r => top\.has\(r\.itemId\)\);/.test(fu)
     && /stampcheck\.checkItem\(r\.itemId, r\.imageUrl, reprints, card\.api_card_id,\s*stampcheck\.PRIO\.compareTop\)/.test(fu));
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

  console.log('\n  4. only the top 25 (and hidden rows) are compared on their own; the rest when seen');
  {
    sc._clearCache();
    const view = Array.from({ length: 40 }, (_, i) => row(200 + i, 50 + i));                 // 40 Buy It Now rows
    const cheapAuctions = [row(300, 5, 'auction'), row(301, 6, 'auction')];                   // beyond the top 25, below 55% of $60
    const g = sc.gate(view.concat(cheapAuctions), LUG, { hideBelow: 60 * sc.SIBLING_HIDE_FRACTION });
    const r = g.report, st = id => (g.listings.find(l => l.itemId === 'v1|' + id + '|0') || {}).stamp || {};
    ok('the top 25 are queued, the other 15 shown and waiting to be seen', r.pendingQueued === 27 && r.pendingDeferred === 15, r.pendingQueued + ' queued, ' + r.pendingDeferred + ' deferred');
    ok('…a hidden row is always compared (nobody can scroll to it; the swaps sat there)',
       g.pendingTop.some(x => x.itemId === 'v1|300|0') && g.pendingTop.some(x => x.itemId === 'v1|301|0') && !g.listings.some(l => l.itemId === 'v1|300|0'));
    ok('a top row says it is queued; a later row says it is compared when seen — both "pending", neither claims a check',
       st(200).state === 'pending' && !st(200).deferred && st(239).state === 'pending' && st(239).deferred === true
       && /compared when this row comes into view/.test(st(239).says) && !/compared when/.test(st(200).says));
    ok('the summary counts the rows compared when scrolled to', /15 compared when scrolled to/.test(r.summary), r.summary);
    sc._setFetch(async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) }));
    sc._hold(true);
    const asked = sc.checkItem('v1|239|0', view[39].imageUrl, LUG, null, sc.PRIO.asked);   // the page asked for it
    const g2 = sc.gate(view.concat(cheapAuctions), LUG, { hideBelow: 60 * sc.SIBLING_HIDE_FRACTION });
    const st2 = (g2.listings.find(l => l.itemId === 'v1|239|0') || {}).stamp || {};
    ok('a row asked for on scroll counts as queued while it is compared', g2.report.pendingDeferred === 14 && st2.deferred === false, g2.report.pendingDeferred + ' deferred');
    sc._hold(false); await asked;
  }
  {
    const route = S.slice(S.indexOf("app.post('/api/listings/:cardId/compare'"), S.indexOf("app.get('/api/listings/:cardId'"));
    ok('the compare route is priced (access.priced on its declaration line)', /^app\.post\('\/api\/listings\/:cardId\/compare', access\.priced, /m.test(S));
    ok('…takes at most COMPARE_TOP items, only rows of the view the caller has open, and never fetches eBay',
       /\.slice\(0, stampcheck\.COMPARE_TOP\)/.test(route) && /viewStateGet\(listingKey\(card\.api_card_id, viewCacheGrade\(grade, printing, edition\)\)\)/.test(route)
       && !/ebaycall|ebayFetch|gatherListings|ebayItemOnDemand/.test(route));
    ok('…queues them with the top comparisons and re-judges the view at once (no new photo follow-up)',
       /stampFollowUpWith\(card, cardId, grade, printing, edition, rows, reprints, rows\)/.test(route) && /rebuildView\([^)]*\{ noFetch: true, stamp: true \}\)/.test(route));
    const P = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
    const fnP = name => { const i = P.indexOf('function ' + name + '('); return i < 0 ? '' : P.slice(i, P.indexOf('\n}', i) + 2); };
    ok('the page re-reads only while something is queued (or just asked for) — not while rows wait to be seen',
       /var queued = g \? \(g\.pendingQueued != null \? g\.pendingQueued : g\.pending\) : 0;/.test(fnP('scheduleStampPoll')) && /DEFER\.until/.test(fnP('scheduleStampPoll')));
    ok('a waiting row carries its item id; rows coming into view are sent to /compare, once each, prices open only',
       /data-defer-item=/.test(fnP('liveRow')) && /new IntersectionObserver/.test(fnP('watchDeferredRows')) && /pricesOpen\(\)/.test(fnP('watchDeferredRows'))
       && /DEFER\.asked\[key \+ '\|' \+ id\]/.test(fnP('watchDeferredRows')) && /'\/compare'/.test(fnP('sendDeferred')) && /items\.forEach\(function \(id\) \{ delete DEFER\.asked/.test(fnP('sendDeferred')));
    // (applyMeasuredGrade was removed 2026-10-08, eBay API licence §9.5 — the draw is the anchor now)
    ok('…watched after every draw of the panel', (P.replace(/\r/g, '').match(/host\.innerHTML = html;\n\s*watchDeferredRows\(card, grade\);/g) || []).length === 2);
  }

  console.log('\n  5. a smaller photo for comparisons only — never for a stamp');
  {
    const SF = JSON.parse(fs.readFileSync(__dirname + '/sibling.fixture.json', 'utf8')).wholes;
    const SIB = [{ cardId: 'en-xy10-117', kind: 'sibling', ours: 'en-xy10-125', label: '#117', wholes: { 'en-xy10-125': SF['en-xy10-125'], 'en-xy10-117': SF['en-xy10-117'] } }];
    const LOOK = [{ cardId: 'en-30th-152', kind: 'lookalike', ours: 'en-sv04.5-232' }];
    // Measured 2026-10-07 on eBay's CDN: s-l300, s-l400, s-l500 are served; s-l350 answers an 80x80 placeholder.
    ok('comparisons use s-l400, a size eBay\'s CDN serves (never s-l350, an 80x80 placeholder)', sc.COMPARE_PHOTO_SIZE === 's-l400'
       && ['s-l300', 's-l400', 's-l500'].includes(sc.COMPARE_PHOTO_SIZE));
    ok('sibling-only and lookalike-only checks download the smaller photo', sc.compareSize(SIB) === 's-l400' && sc.compareSize(LOOK) === 's-l400');
    ok('anything with a STAMP downloads s-l500 — alone or mixed with a comparison; no checks, s-l500',
       sc.compareSize(LUG) === 's-l500' && sc.compareSize(LUG.concat(SIB)) === 's-l500' && sc.compareSize([]) === 's-l500' && sc.PHOTO_SIZE === 's-l500');
    sc._clearCache(); const got = [], saved = [];
    sc._setFetch(async url => { got.push(url.match(/\/(s-l\d+)\.jpg$/)[1]);
      return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) }; });
    sc.setStore({ async load() { return []; }, async save(v) { saved.push(v); } });
    await sc.checkItem('v1|960|0', U('sib'), SIB, 'en-xy10-125');
    await sc.checkItem('v1|961|0', U('stp'), LUG, 'en-ecard2-149');
    await new Promise(r => setTimeout(r, 20));
    ok('executed: the sibling job fetched s-l400, the stamp job s-l500', got.join(',') === 's-l400,s-l500', got.join(','));
    ok('the verdict\'s identity stays the s-l500 photo — stored verdicts made before still match',
       saved.length === 2 && saved[0].photoKey === sc.photoKey(sc.photoUrl(U('sib'))) && sc.photoUrl(U('sib')).endsWith('/s-l500.jpg'));
    const sib = sc.cacheGet(sc.verdictKey('v1|960|0', SIB), sc.photoUrl(U('sib')));
    ok('…and the gate finds it under that identity', !!sib);
    sc.setStore(null);
  }

  console.log('\n  photoqueue.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
