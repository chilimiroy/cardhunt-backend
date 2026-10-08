// materiallanes.test.js — colour-profile downloads overlap, off the worker (2026-10-07)
//
// Measured on Render: a colour job was 86% download wait (136 ms) and 7 ms
// of CPU, while holding the one photo worker. stampcheck now downloads them
// MATERIAL_FETCH_LANES at a time outside the worker and sends only the
// decode to it. Full coverage is kept: every row is profiled. A struggling
// host (network error, timeout, 429, 5xx) pauses every lane.
// Offline: a fake CDN with a 150 ms download.

require('./testcount')(8);   // assertions in a plain run — fewer fails the file (testcount.js)
const sc = require('./stampcheck.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const jpeg = require('jpeg-js').encode({ width: 60, height: 80, data: Buffer.alloc(60 * 80 * 4, 180) }, 90).data;
let inFlight = 0, maxInFlight = 0, failNext = 0, failStatus = 503;
sc._setFetch(async () => {
  inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise(r => setTimeout(r, 150)); inFlight--;
  if (failNext > 0) { failNext--; return { ok: false, status: failStatus, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(0) }; }
  return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => jpeg };
});
const urls = (tag, n) => Array.from({ length: n }, (_, i) => 'https://i.ebayimg.com/images/g/' + tag + i + 'AAeSw/s-l225.jpg');

(async () => {
  console.log('\n  downloads overlap, every row profiled');
  sc._clearCache();
  let t0 = Date.now();
  let vs = await Promise.all(urls('a', 30).map(u => sc.checkMaterialPhoto(u)));
  const ms = Date.now() - t0;
  ok('several downloads at once (4-6), never more', maxInFlight >= 4 && maxInFlight <= 6, 'max ' + maxInFlight);
  ok('every one of 30 rows profiled — no coverage cut', vs.filter(v => v.state === 'profiled').length === 30);
  ok('30 x 150 ms downloads finish far sooner than one at a time (4.5 s)', ms < 2500, ms + ' ms');
  ok('the lanes are reported in poolState', sc.poolState().materialFetch && sc.poolState().materialFetch.lanes === maxInFlight);

  console.log('\n  a struggling host backs every lane off');
  sc._clearCache(); failNext = 2; failStatus = 503;
  t0 = Date.now();
  vs = await Promise.all(urls('b', 8).map(u => sc.checkMaterialPhoto(u)));
  ok('a 503 row gets a retryable verdict, as before (never a profile, never a pass)', vs.filter(v => v.retryable).length === 2);
  ok('...the others are still profiled', vs.filter(v => v.state === 'profiled').length === 6);
  ok('...and the lanes paused (backoff counted, the batch waited)', sc.poolState().materialFetch.backoffs >= 1 && Date.now() - t0 >= 2000, (Date.now() - t0) + ' ms');

  console.log('\n  a missing photo is not a struggling host');
  sc._clearCache(); failNext = 1; failStatus = 404;
  const before = sc.poolState().materialFetch.backoffs;
  vs = await Promise.all(urls('c', 3).map(u => sc.checkMaterialPhoto(u)));
  ok('a 404 does not pause the lanes', sc.poolState().materialFetch.backoffs === before && vs.filter(v => v.state === 'profiled').length === 2);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
