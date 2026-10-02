// stampcheck.test.js — the reprint-stamp check (TASK T1, 2026-10-02)
//   node stampcheck.test.js           offline
//   node stampcheck.test.js --live    + both directions on our own catalogue scans
//
// What it may claim is the point: FOUND is strong, NOT VISIBLE is weak and
// never "verified original", UNREADABLE is neither. And it costs no eBay
// call: the photo comes from eBay's image CDN, and only from there.
//
// The measurement itself (373 reprint photos, 16 labelled originals, the
// originals' own listings) used real eBay photos, which may not be kept, so
// it lives in CLAUDE.md, not here. What is here: the matcher, the gate on
// the URL, the three states, and the wiring — and, with --live, the same
// detector on clean scans of four originals and their reprints.
'use strict';
const fs = require('fs');
const sc = require('./stampcheck');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || d === undefined ? '' : '  — ' + d)); };

console.log('\n1. THE PHOTO URL — eBay\'s image CDN only, at s-l500 (never a caller\'s URL)');
ok('i.ebayimg.com s-l225 -> s-l500', sc.photoUrl('https://i.ebayimg.com/images/g/iRsAAeSwnBlqvsuP/s-l225.jpg') === 'https://i.ebayimg.com/images/g/iRsAAeSwnBlqvsuP/s-l500.jpg');
ok('s-l1600 and .webp normalised to s-l500.jpg', sc.photoUrl('https://i.ebayimg.com/images/g/x/s-l1600.webp') === 'https://i.ebayimg.com/images/g/x/s-l500.jpg');
for (const bad of ['http://i.ebayimg.com/images/g/x/s-l225.jpg', 'https://evil.example/s-l225.jpg',
                   'https://i.ebayimg.com.evil.example/images/g/x/s-l225.jpg', 'https://169.254.169.254/latest/meta-data',
                   'https://i.ebayimg.com/images/g/x/photo.jpg', 'javascript:alert(1)', '', null])
  ok('refused: ' + String(bad).slice(0, 60), sc.photoUrl(bad) === null);

console.log('\n2. THE MATCHER');
const rnd = (w, h, seed) => { let s = seed; const d = new Uint8Array(w * h * 3); for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s & 255; } return { w, h, data: d }; };
const img = rnd(120, 90, 7), t = sc.crop(img, 40, 30, 20, 15);
const m = sc.nccMax(img, t);
ok('a template cut from an image matches itself at 1.0, in place', Math.abs(m.score - 1) < 1e-6 && m.x === 40 && m.y === 30, JSON.stringify(m));
const flat = { w: 20, h: 15, data: new Uint8Array(20 * 15 * 3).fill(128) };
ok('a flat template scores nothing (no pattern to find)', sc.nccMax(img, flat).score === -1);
// Per-channel means (OpenCV's TM_CCOEFF_NORMED). One mean across channels
// scored a plain yellow border like the stamp — two originals at 0.77.
const yellow = { w: 20, h: 15, data: new Uint8Array(20 * 15 * 3) };
for (let i = 0; i < 300; i++) { yellow.data[i * 3] = 250; yellow.data[i * 3 + 1] = 210; yellow.data[i * 3 + 2] = 20 + (i % 7); }
const pattern = sc.crop(img, 10, 10, 20, 15);
ok('per-channel: a flat yellow patch does not match a textured template', sc.nccMax(yellow, pattern).score < 0.3, sc.nccMax(yellow, pattern).score);
let r4 = img; for (let i = 0; i < 4; i++) r4 = sc.rotate90(r4);
ok('four quarter turns are the identity', Buffer.compare(Buffer.from(r4.data), Buffer.from(img.data)) === 0 && r4.w === img.w);
ok('a quarter turn swaps width and height', sc.rotate90(img).w === 90 && sc.rotate90(img).h === 120);
const half = sc.resize(img, 60, 45);
ok('resize gives the size asked', half.w === 60 && half.h === 45);

console.log('\n3. THREE STATES, NOT TWO');
const T = sc.templates().templates || {};
const ids = Object.keys(T);
ok('stamps.json holds templates', ids.length >= 50, ids.length);
const lug = T['en-30th-c-029'];
ok('the 30th Lugia template exists, cut from OUR scan (not a seller photo)', lug && /scrydex|pokemontcg|tcgdex/.test(lug.scan), lug && lug.scan);
const tplImg = { w: lug.w, h: lug.h, data: new Uint8Array(Buffer.from(lug.rgb, 'base64')) };
// A synthetic "photo": noise with the stamp template placed in it at 2x.
const photo = rnd(375, 500, 11), big = sc.resize(tplImg, lug.w * 1.5, lug.h * 1.5);
for (let y = 0; y < big.h; y++) photo.data.set(big.data.subarray(y * big.w * 3, (y + 1) * big.w * 3), ((200 + y) * 375 + 30) * 3);
const reprints = [{ cardId: 'en-30th-c-029', family: { label: '30th Celebration (2026)' } }];
const found = sc.judge(photo, reprints);
ok('stamp present -> found', found.state === 'found', JSON.stringify(found.scores));
ok('found names the reprint and says "looks like the reprint"', found.reprint === 'en-30th-c-029' && /looks like the reprint/.test(found.says));
const none = sc.judge(rnd(375, 500, 23), reprints);
ok('stamp absent -> not-visible', none.state === 'not-visible', JSON.stringify(none.scores));
ok('not-visible says it is NOT proof of an original', /not proof/i.test(none.says) && !/verified|genuine|authentic/i.test(none.says));
ok('a tiny photo -> unreadable, not "not visible"', sc.judge(rnd(100, 120, 5), reprints).state === 'unreadable');
ok('a reprint with no template -> unchecked (never silently "not visible")',
   sc.judge(rnd(375, 500, 3), [{ cardId: 'en-no-such-1', family: { label: 'x' } }]).state === 'unchecked');
ok('the threshold is the measured 0.70', sc.THRESHOLD === 0.70);
ok('the photo size is the measured s-l500', sc.PHOTO_SIZE === 's-l500');

const cm = require('./cardmatch');
console.log('\n3b. BOTH DIRECTIONS, OFFLINE — our own scans of four originals and their reprints');
// stamp.fixture.json: the catalogue images /api/cards serves, 250px JPEG.
// With one mean across channels (the first JS version) all four ORIGINALS
// came back "found" at 0.74-0.81; this is the section that fires on it.
if (fs.existsSync(__dirname + '/stamp.fixture.json')) {
  const FX = require('./stamp.fixture.json').scans;
  for (const [orig, rep] of [['en-ecard2-149', 'en-30th-c-029'], ['en-base1-58', 'en-30th-c-014'], ['en-bw6-85', 'en-30th-c-016'], ['en-base1-4', 'en-cel25cc-CC002']]) {
    const rps = cm.reprintCardsOf({ cardId: orig, setId: orig.replace(/^en-|-[^-]+$/g, ''), number: orig.split('-').pop() });
    const im = id => sc.decodeJpeg(Buffer.from(FX[id].jpeg, 'base64'));
    const vo = sc.judge(im(orig), rps), vr = sc.judge(im(rep), rps);
    ok(orig + ' original: no stamp found', vo.state === 'not-visible', vo.state + ' ' + JSON.stringify(vo.scores.map(s => s.score)));
    ok(rep + ' reprint: stamp found', vr.state === 'found', vr.state + ' ' + JSON.stringify(vr.scores.map(s => s.score)));
  }
} else ok('stamp.fixture.json present', false);

console.log('\n4. THE TEMPLATES — every reprint REPRINT_OF names, built or said why not');
const want = [];
for (const rset of Object.keys(cm.REPRINT_OF)) for (const num of Object.keys(cm.REPRINT_OF[rset])) want.push('en-' + rset + '-' + num);
const nb = sc.templates().notBuilt || {};
ok('all ' + want.length + ' reprints accounted for (template or notBuilt)', want.every(id => T[id] || nb[id]), want.filter(id => !T[id] && !nb[id]).join(','));
ok('every template located its stamp at >= 0.93 on its scan', ids.every(id => T[id].located >= 0.93), ids.filter(id => T[id].located < 0.93).join(','));
ok('every notBuilt says why', Object.values(nb).every(x => x.why));
ok('the sideways cards (BREAK, LEGEND top) are marked sideways', T['en-30th-c-009'] && T['en-30th-c-009'].sideways && T['en-30th-c-019'] && T['en-30th-c-019'].sideways);

console.log('\n5. THE GATE — found refuses, weak evidence keeps, nothing waits');
const FXS = fs.existsSync(__dirname + '/stamp.fixture.json') ? require('./stamp.fixture.json').scans : {};
const LUG = cm.reprintCardsOf({ cardId: 'en-ecard2-149', setId: 'ecard2', number: '149' });
const U = id => 'https://i.ebayimg.com/images/g/' + id + '/s-l225.jpg';
const row = (id, extra) => Object.assign({ source: 'ebay', itemId: 'v1|' + id + '|0', title: 'Lugia ' + id, price: 100, imageUrl: U('p' + id) }, extra || {});
sc._clearCache();
const rowsIn = [row(1), row(2), row(3), row(4), row(5, { imageUrl: null }), { source: 'yuyutei', title: 'shop row', price: 5 }];
const frozen = JSON.stringify(rowsIn);
sc.cacheSet('v1|1|0', { state: 'found', reprint: 'en-30th-c-029', label: '30th Celebration (2026)', says: 'x' }, sc.photoUrl(U('p1')));
sc.cacheSet('v1|2|0', { state: 'not-visible', says: 'No reprint stamp visible ... not proof' }, sc.photoUrl(U('p2')));
sc.cacheSet('v1|3|0', { state: 'unreadable', says: 'too small' }, sc.photoUrl(U('p3')));
const g = sc.gate(rowsIn, LUG);
const byId = id => g.listings.find(l => l.itemId === 'v1|' + id + '|0');
ok('applied on a card whose reprint has a template', g.report.applied === true);
ok('stamp FOUND -> the row is refused (not in the list)', !byId(1));
ok('...counted, with its reason and the reprint named', g.report.refused === 1 && g.report.refusedSample[0].itemId === 'v1|1|0' && /30th Celebration/.test(g.report.refusedSample[0].reason));
ok('no stamp visible -> KEPT, marked not-visible', byId(2) && byId(2).stamp.state === 'not-visible');
ok('unreadable -> KEPT, marked unreadable', byId(3) && byId(3).stamp.state === 'unreadable');
ok('not yet checked -> KEPT, marked pending, handed back to check', byId(4) && byId(4).stamp.state === 'pending' && g.pending.length === 1 && g.pending[0].itemId === 'v1|4|0');
ok('no photo -> KEPT, unreadable (never pending forever)', byId(5) && byId(5).stamp.state === 'unreadable');
ok('a non-eBay row passes untouched', g.listings.some(l => l.source === 'yuyutei' && !l.stamp));
ok('counts add up: 1 refused, 1 not visible, 2 unreadable, 1 pending', g.report.refused === 1 && g.report.notVisible === 1 && g.report.unreadable === 2 && g.report.pending === 1, JSON.stringify(g.report));
ok('the input rows are not mutated (a view re-judges its raw rows)', JSON.stringify(rowsIn) === frozen);
ok('the report says zero eBay calls', g.report.ebayCalls === 0);
const g0 = sc.gate(rowsIn, [{ cardId: 'en-no-such-1', family: { label: 'x' } }]);
ok('no template for the reprint -> not applied, says why, every row kept', !g0.report.applied && /no stamp template/.test(g0.report.reason) && g0.listings.length === rowsIn.length);
ok('no reprint at all -> not applied, every row kept', !sc.gate(rowsIn, []).report.applied && sc.gate(rowsIn, []).listings === rowsIn);

console.log('\n5b. THE VERDICT CACHE — by eBay item id, the photo URL beside it');
ok('a verdict is kept for days, not 15 minutes (a photo does not change)', sc.TTL_MS >= 24 * 3600 * 1000);
ok('the same item with a DIFFERENT photo URL is checked again', sc.cacheGet('v1|1|0', sc.photoUrl(U('changed'))) === null);
sc.cacheSet('v1|9|0', { state: 'unreadable', retryable: true, says: 'CDN down' }, sc.photoUrl(U('p9')));
ok('a retryable failure is held (the view is not left pending)...', !!sc.cacheGet('v1|9|0', sc.photoUrl(U('p9'))));
const e9 = sc.cacheGet('v1|9|0'); e9.at -= sc.RETRY_MS + 1;
ok('...but only RETRY_MS: after that the item is asked again', sc.cacheGet('v1|9|0') === null);

(async () => {
  console.log('\n5c. THE POOL — one worker queue, one job per item, the CDN only');
  if (!FXS['en-30th-c-029']) { ok('stamp.fixture.json has the reprint scan', false); }
  else {
    sc._clearCache();
    const fetched = [];
    const jpegFor = { 'r': Buffer.from(FXS['en-30th-c-029'].jpeg, 'base64'), 'o': Buffer.from(FXS['en-ecard2-149'].jpeg, 'base64') };
    sc._setFetch(async (url) => {
      fetched.push(url);
      if (/\/g\/down\//.test(url)) return { ok: false, status: 503, headers: { get: () => 'text/html' } };
      const b = jpegFor[url.match(/\/g\/(\w)/)[1]];
      return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    });
    const [a1, a2] = await Promise.all([sc.checkItem('v1|71|0', U('r71'), LUG), sc.checkItem('v1|71|0', U('r71'), LUG)]);
    ok('the reprint scan through the pool -> found', a1.state === 'found', a1.state + ' ' + JSON.stringify(a1.scores));
    ok('two callers of one item share ONE job (one photo fetch)', fetched.length === 1 && a2.state === 'found');
    ok('only i.ebayimg.com at s-l500 was fetched', fetched.every(u => /^https:\/\/i\.ebayimg\.com\/.*\/s-l500\.jpg$/.test(u)), fetched.join(' '));
    const b1 = await sc.checkItem('v1|72|0', U('o72'), LUG);
    ok('the original scan through the pool -> not-visible (kept)', b1.state === 'not-visible', b1.state + ' ' + JSON.stringify(b1.scores));
    const n0 = fetched.length, a3 = await sc.checkItem('v1|71|0', U('r71'), LUG);
    ok('asked again: answered from the cache, no fetch', a3.cached === true && fetched.length === n0);
    const d1 = await sc.checkItem('v1|73|0', 'https://i.ebayimg.com/images/g/down/s-l225.jpg', LUG);
    ok('the CDN failing -> unreadable AND retryable, never "not visible"', d1.state === 'unreadable' && d1.retryable === true);
    const ev = await sc.checkItem('v1|74|0', 'https://evil.example/x.jpg', LUG);
    ok('a non-eBay photo URL is never fetched', ev.state === 'unreadable' && !fetched.some(u => /evil/.test(u)));
    const ps = sc.poolState();
    ok('the pool is bounded (STAMP_WORKERS, default 1) and reports itself', ps.workers >= 1 && ps.checked >= 2 && ps.queued === 0, JSON.stringify(ps));
  }
  rest();
})();

function rest() {
console.log('\n6. THE SERVER — wired after the text gates, before display');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
const fnS = decl => { const i = S.indexOf('\n' + decl); return i < 0 ? '' : S.slice(i + 1, S.indexOf('\n}\n', i + 1) + 2); };
const jl = fnS('async function judgeListings(');
ok('judgeListings runs stampcheck.gate', /stampcheck\.gate\(listings, stampReprints\)/.test(jl));
ok('...BEFORE the outlier check (reprints cannot set the median)', jl.indexOf('stampcheck.gate(') > 0 && jl.indexOf('stampcheck.gate(') < jl.indexOf('outlier.flagOutliers('));
ok('...never on a reprint\'s own listings (noReprintCheck)', /opts\.noReprintCheck \? \[\] : cm\.reprintCardsOf\(card\)/.test(jl));
ok('a photo-check update never fetches the reprint\'s listings (noFetch)', /else if \(opts\.noFetch\) why =/.test(jl));
// withStampRefusals, run for real.
const wsr = new Function('return ' + fnS('function withStampRefusals(').replace(/^function withStampRefusals/, 'function'))();
const srcs = { ebay: { status: 'ok', count: 82, rejected: 118, scanned: 200, droppedSample: [{ reason: 'not a single card' }] } };
const out = wsr(srcs, { applied: true, refused: 5, pending: 3, refusedSample: [{ title: 't', itemId: 'v1|1|0', reason: 'photo shows the 30th Celebration (2026) stamp' }] });
ok('stamp refusals are eBay rejections: kept 82 -> 77, rejected 118 -> 123', out.ebay.count === 77 && out.ebay.rejected === 123, JSON.stringify(out.ebay));
ok('...named in droppedSample and the summary', out.ebay.droppedSample[0].reason.includes('stamp') && /5 by the photo stamp check, 3 photos still being checked/.test(out.ebay.summary), out.ebay.summary);
ok('...on a COPY (a view\'s sources are re-used by every rebuild)', srcs.ebay.count === 82 && srcs.ebay.rejected === 118);
ok('the payload carries stampGate', /stampGate: j\.stamp \?/.test(fnS('function buildListingsPayload(')));
const lf = fnS('async function listingsFor(');
ok('a re-read (?poll=1) never searches: cache or "not fetched"', /if \(opts\.poll && !wantSites && !wantMore\) return \{[^}]*notFetched: true/.test(lf));
ok('opening a card starts the photo checks after the answer', /stampFollowUp\(card, requestedId, grade, printing, edition, pendingStampRows\(payload\)\)/.test(lf));
const fu = fnS('function stampFollowUp(');
ok('the follow-up re-judges with noFetch and starts nothing further', /rebuildView\([^)]*\{ noFetch: true, stamp: true \}\)/.test(fu) && /if \(!ropts\.stamp\) stampFollowUp/.test(fnS('async function rebuildView(')));
ok('the follow-up makes no eBay call', !/fetchEbay|sourceEbay|gatherListings|ebayLoadMore/.test(fu));
const a = S.indexOf("app.get('/api/stamp/:cardId'"), b = S.indexOf('\napp.', a + 10);
const route = a >= 0 ? S.slice(a, b > a ? b : undefined) : '';
ok('/api/stamp: an eBay item id, validated; never a URL from the request', /certcheck\.ITEM_ID\.test\(itemId\)/.test(route) && !/req\.query\.(url|image|img|photo|src)/.test(route));
ok('/api/stamp: the row this server already served, through the SAME checkItem', /cachedListingRow\(/.test(route) && /stampcheck\.checkItem\(itemId, row\.imageUrl, reprints\)/.test(route));
ok('/api/stamp: no eBay API call, ebayCalls: 0', !/fetchEbay|ebayItemOnDemand|getEbayToken|api\.ebay\.com/.test(route) && /ebayCalls: 0/.test(route));
const C = fs.readFileSync(__dirname + '/stampcheck.js', 'utf8');
ok('stampcheck.js never touches the database', !/db\.query|require\('pg'\)|INSERT|DATABASE_URL/.test(C));

console.log('\n7. THE PAGE — no button; the server\'s verdict on the row; re-read while pending');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('no "Check photo" button and no /api/stamp call from the page', !/Check photo for reprint stamp/.test(H) && !/\/api\/stamp\//.test(H));
ok('a row shows the server\'s stamp state (l.stamp)', /var st = l && l\.stamp;/.test(fn('stampLine')));
ok('chips: pending / not visible / unreadable — and no "found" (found rows are refused)', /'pending':/.test(H) && /'not-visible':\s*'No stamp visible — not proof'/.test(H) && /'unreadable':/.test(H) && !/STAMP_CHIP = \{[^}]*'found'/.test(H));
ok('nothing on the page calls a stamp result "verified" or "original"', !/STAMP_CHIP[\s\S]{0,400}(verified|genuine original)/i.test(H));
ok('the panel says how many the stamp check refused', /liveStampNote\(d\)/.test(fn('excludedNote')) && /refused &mdash; the seller&rsquo;s photo shows the/.test(fn('liveStampNote')));
ok('the panel re-reads while photos are pending, with ?poll=1', /stampGate\.pending > 0/.test(fn('scheduleStampPoll')) && /poll: true/.test(fn('scheduleStampPoll')) && /scheduleStampPoll\(card, grade, d\)/.test(H));
ok('the stamp line sits inside the row\'s own line (one writer)', /\+ stampLine\(l\)/.test(fn('certLine')));
live();
}

async function live() {
  if (process.argv.includes('--live')) {
    console.log('\n7. BOTH DIRECTIONS ON OUR OWN SCANS (--live: fetches 8 catalogue images)');
    const API = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
    const { PNG } = require('pngjs');
    const load = async id => {
      const j = await (await fetch(API + '/api/cards/' + id)).json(); const u = (j.data || j).images.large;
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      if (buf[0] === 0x89) { const p = PNG.sync.read(buf); const o = new Uint8Array(p.width * p.height * 3);
        for (let i = 0, k = 0; k < p.data.length; i += 3, k += 4) { o[i] = p.data[k]; o[i + 1] = p.data[k + 1]; o[i + 2] = p.data[k + 2]; }
        return sc.resize({ w: p.width, h: p.height, data: o }, 375, 375 * p.height / p.width); }
      const d = sc.decodeJpeg(buf); return sc.resize(d, 375, 375 * d.h / d.w);
    };
    for (const [orig, rep] of [['en-ecard2-149', 'en-30th-c-029'], ['en-base1-58', 'en-30th-c-014'], ['en-bw6-85', 'en-30th-c-016'], ['en-base1-4', 'en-cel25cc-CC002']]) {
      const card = { cardId: orig, setId: orig.replace(/^en-|-[^-]+$/g, ''), number: orig.split('-').pop() };
      const rps = cm.reprintCardsOf(card);
      const vo = sc.judge(await load(orig), rps), vr = sc.judge(await load(rep), rps);
      ok(orig + ' (original scan): no stamp found', vo.state === 'not-visible', vo.state + ' ' + JSON.stringify(vo.scores.map(s => s.score)));
      ok(rep + ' (reprint scan): stamp found', vr.state === 'found', vr.state + ' ' + JSON.stringify(vr.scores.map(s => s.score)));
    }
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
}
