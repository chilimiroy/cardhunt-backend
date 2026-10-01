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

console.log('\n5. THE SERVER ROUTE — zero eBay calls, no URL taken, nothing stored');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
const a = S.indexOf("app.get('/api/stamp/:cardId'"), b = S.indexOf('\napp.', a + 10);
const route = a >= 0 ? S.slice(a, b > a ? b : undefined) : '';
ok('the route exists', route.length > 500);
ok('takes an eBay item id, validated', /certcheck\.ITEM_ID\.test\(itemId\)/.test(route));
ok('never reads a URL from the request', !/req\.query\.(url|image|img|photo|src)/.test(route));
ok('the photo is the row this server already served (listing cache)', /cachedListingRow\(/.test(route));
ok('...and goes through stampcheck.photoUrl (i.ebayimg.com only)', /stampcheck\.photoUrl\(row\.imageUrl\)/.test(route));
ok('no eBay API call in the route', !/fetchEbay|ebayItemOnDemand|getEbayToken|api\.ebay\.com/.test(route));
ok('reports ebayCalls: 0', /ebayCalls: 0/.test(route));
ok('only for a card a known reprint copies', /cm\.reprintCardsOf\(card\)/.test(route) && /nothing to look for/.test(route));
ok('the match runs in a worker thread (never stalls the server)', /judgeInWorker\(/.test(route));
ok('the verdict is cached in memory (stampcheck.cacheSet), never written', /stampcheck\.cacheSet\(/.test(route) && !/db\.query|INSERT/.test(route));
ok('a failed photo fetch is NOT cached (retryable)', /retryable: true/.test(route));
const C = fs.readFileSync(__dirname + '/stampcheck.js', 'utf8');
ok('stampcheck.js never touches the database', !/db\.query|require\('pg'\)|INSERT|DATABASE_URL/.test(C));
ok('the listings payload says whether a row can be checked', /stampCheck: stampCheckFor\(card\)/.test(S));

console.log('\n6. THE PAGE');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('a row offers the check only when the server says it can', /LF\.stampCheck && LF\.stampCheck\.available/.test(fn('stampRowEligible')));
ok('LF.stampCheck comes from the listings payload', /LF\.stampCheck = \(d && d\.stampCheck\) \|\| null;/.test(H));
ok('the button says it costs no eBay lookup', /no eBay lookup/.test(fn('stampLine')));
ok('it calls /api/stamp with the item id only', /\/api\/stamp\/' \+ encodeURIComponent\(cardId\) \+ '\?item=' \+ encodeURIComponent\(itemId\)/.test(fn('stampCheck')));
ok('three chips: found / not visible / unreadable', /'found':/.test(H) && /'not-visible':/.test(H) && /'unreadable':/.test(H));
ok('the not-visible chip says "not proof"', /'not-visible':\s*'No stamp visible — not proof'/.test(H));
ok('nothing on the page calls a stamp result "verified" or "original"',
   !/STAMP_CHIP[\s\S]{0,400}(verified|genuine original)/i.test(H));
ok('the stamp line sits inside the row\'s own on-demand line (one writer)', /\+ stampLine\(l\)/.test(fn('certLine')));

(async () => {
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
})();
