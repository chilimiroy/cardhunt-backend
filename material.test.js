// material.test.js — gold and black novelty cards (TASK T1, 2026-10-05).
//
// Mass-produced gold / black / silver metal copies of popular cards, titled
// like the real thing, passed every gate: on 2026-10-04, 41 of the 52 rows
// Shining Charizard's page SHOWED were metal. stampcheck.materialJudge
// compares the listing photo's colour with OUR scan of the same card (never
// a fixed colour), and counts three signals: colour, the outlier flag, a
// gold/black metal photo among the seller's others. Two refuse, one flags,
// a genuine back seen never refuses.
//
// What it must KEEP is tested first: the measured genuine rows (Shining
// Charizard incl. the $2,525 poor-condition copy, Magikarp & Wailord GX,
// Mewtwo ☆ — a Gold Star — and 118 gold hyper-rare Mew ex) are refused
// 0 times. Then what it catches, on the same fixture, and the wiring.
//
//   node material.test.js
'use strict';
const fs = require('fs');
const sc = require('./stampcheck.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } }

console.log('\n  material.test.js\n');
const fx = JSON.parse(fs.readFileSync(__dirname + '/material.fixture.json', 'utf8'));
const rows = fx.rows;
const act = r => sc.materialJudge(r).action;
const of = (label, set) => rows.filter(r => r.label === label && (!set || r.set === set));

console.log('  what it KEEPS (measured, labelled by eye)');
const genuine = of('genuine');
ok(genuine.length >= 190, 'the fixture holds the genuine rows (' + genuine.length + ')');
ok(genuine.filter(r => act(r) === 'refuse').length === 0, 'no genuine row refused (0 of ' + genuine.length + ')');
const poor = rows.find(r => r.note && /2,525/.test(r.note));
ok(poor && act(poor) !== 'refuse', 'the $2,525 poor-condition genuine Shining Charizard survives (' + (poor && act(poor)) + ')');
const goldMew = of('genuine', 'mewg');
ok(goldMew.length >= 100 && goldMew.every(r => act(r) === 'none'),
   'an SV gold hyper rare (Mew ex 205/165, ' + goldMew.length + ' rows) — not refused, not even flagged: its own scan is gold');
const goldStar = of('genuine', 'gs');
ok(goldStar.length && goldStar.every(r => act(r) !== 'refuse'), 'a Gold Star (Mewtwo ☆ 103/110, ' + goldStar.length + ' genuine rows) survives');
// Why colour does not refuse alone (measured 2026-10-05): genuine rows reach
// 0.491 above their own scan — gold hyper rares whose scan undercounts the
// gold (Reversal Energy, Basic Water Energy), a $610 Magikarp & Wailord at
// 0.424, a $758 Shining Charizard at 0.416. No threshold refuses colour alone
// without one of them, and at 0.50 it would catch 34 of 95 metal, fewer than two signals.
const colourOnly = genuine.filter(r => r.profile.gold - r.ref.gold > sc.MATERIAL_GOLD_EXCESS);
ok(colourOnly.length >= 4 && colourOnly.every(r => act(r) !== 'refuse'),
   'genuine rows above the colour threshold (' + colourOnly.length + ') are flagged, never refused — colour is one signal, not a verdict');
const hr = of('genuine', 'widen-hr');
ok(hr.length === 4 && hr.every(r => act(r) !== 'refuse'), 'the genuine gold hyper rares found widening the sample survive (' + hr.length + ')');
ok(genuine.filter(r => act(r) === 'flag').length <= 8,
   'genuine rows flagged (sorted last, still shown): ' + genuine.filter(r => act(r) === 'flag').length + ' of ' + genuine.length);

console.log('\n  what it catches');
const metal = of('metal');
const refused = metal.filter(r => act(r) === 'refuse').length, flagged = metal.filter(r => act(r) === 'flag').length;
ok(metal.length >= 90, 'the fixture holds the metal rows (' + metal.length + ')');
ok(refused >= 51, 'metal rows refused: ' + refused + ' of ' + metal.length + ' (measured 51)');
ok(refused + flagged >= 73, 'metal rows refused or flagged: ' + (refused + flagged) + ' of ' + metal.length + ' (measured 73)');

ok(sc.MATERIAL_GOLD_EXCESS >= 0.40, 'the threshold sits above the hardest genuine photo seen (Charizard ex 199 SIR, excess 0.352)');
ok(sc.materialJudge({ profile: { gold: 0.364, black: 0.015 }, ref: { gold: 0.012, black: 0.011 }, priceFlag: false,
     back: { state: 'no-claim', metal: true } }).action !== 'refuse',
   'that genuine SIR ($446.73, warm light, no back posted) is not refused');

console.log('\n  the rule');
const ref = { gold: 0.2, black: 0.1 };
const goldPhoto = { gold: 0.2 + sc.MATERIAL_GOLD_EXCESS + 0.05, black: 0 };
ok(act({ profile: goldPhoto, ref, priceFlag: true }) === 'refuse', 'colour + price: refused');
ok(act({ profile: goldPhoto, ref, back: { state: 'no-claim', metal: true } }) === 'refuse', 'colour + a metal photo: refused');
ok(act({ profile: { gold: 0.2, black: 0 }, ref, priceFlag: true, back: { state: 'no-claim', metal: true } }) === 'refuse', 'price + a metal photo: refused');
ok(act({ profile: goldPhoto, ref }) === 'flag', 'colour alone: flagged, not refused');
ok(act({ profile: { gold: 0.2, black: 0 }, ref, priceFlag: true }) === 'flag', 'price alone: flagged (the outlier flag it already is)');
ok(act({ profile: goldPhoto, ref, priceFlag: true, back: { state: 'genuine-back', metal: false } }) === 'flag',
   'two signals but a GENUINE back seen: flagged, never refused');
ok(act({ profile: { gold: 0.9, black: 0 }, ref: { gold: 0.6, black: 0 }, priceFlag: true }) === 'flag',
   'compared with the card\'s own scan: a gold photo of a gold card is no colour signal');
ok(act({ profile: null, ref, priceFlag: false }) === 'none' && act({ profile: goldPhoto, ref: null }) === 'none',
   'no profile or no scan: no colour signal (nothing claimed)');
ok(sc.metalPhotoOf([{ gold: 0.9, black: 0 }, { gold: 0.1, black: 0, seen: 'en' }], ref) === false,
   'the first photo (the front) and a genuine back never count as a metal photo');
ok(sc.metalPhotoOf([{ gold: 0.1, black: 0 }, { gold: 0.1, black: 0.8 }], ref) === true, 'a black-dominated other photo counts');

console.log('\n  the colour profile');
const img = (w, h, rgb) => { const d = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) d.set(rgb, i * 3); return { w, h, data: d }; };
const g = sc.colourProfile(img(20, 20, [212, 175, 55]));
ok(g.gold > 0.95 && g.black === 0, 'a gold field reads gold (' + g.gold + ')');
const b = sc.colourProfile(img(20, 20, [20, 20, 25]));
ok(b.black > 0.95 && b.gold === 0, 'a black field reads black (' + b.black + ')');
const blue = sc.colourProfile(img(20, 20, [30, 80, 200]));
ok(blue.gold === 0 && blue.black === 0, 'a blue card back reads neither');
const framed = img(20, 20, [212, 175, 55]);
for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (x >= 4 && x < 16 && y >= 4 && y < 16) framed.data.set([30, 80, 200], (y * 20 + x) * 3);
ok(sc.colourProfile(framed).gold === 0, 'only the centre 60% is read: a gold table around a blue card is not the card');
ok(sc.photoUrl('https://i.ebayimg.com/images/g/abc/s-l1600.jpg', sc.MATERIAL_PHOTO_SIZE) === 'https://i.ebayimg.com/images/g/abc/s-l225.jpg',
   'profiles are taken at the measured size (s-l225)');

console.log('\n  our scan as a PNG (pokemontcg.io art, 806 English cards — 2026-10-05)');
const { PNG } = require('pngjs');
const png = new PNG({ width: 20, height: 20 });
for (let i = 0; i < 400; i++) png.data.set(i < 20 ? [0, 0, 0, 0] : [212, 175, 55, 255], i * 4);   // a transparent top row
const pimg = sc.decodeImage(PNG.sync.write(png));
ok(pimg.w === 20 && pimg.h === 20 && sc.colourProfile(pimg).gold > 0.95, 'a gold PNG decodes and reads gold');
ok(pimg.data[0] === 255 && pimg.data[1] === 255 && pimg.data[2] === 255, 'transparency (the rounded corners) is flattened onto white, not black');
ok((() => { try { sc.decodeImage(Buffer.from('GIF89a')); return false; } catch (e) { return /not a PNG or JPEG/.test(e.message); } })(),
   'anything else is refused, not guessed');
ok(sc.PNG_SCAN_HOST.test('https://images.pokemontcg.io/cel25c/4_A.png') && sc.PNG_SCAN_HOST.test('https://images.pokemontcg.io/swsh45sv/SV107.png'),
   'pokemontcg.io scans are accepted (CC002, Shiny Vault)');
ok(!sc.PNG_SCAN_HOST.test('https://images.pokemontcg.io.evil.com/a/b.png') && !sc.PNG_SCAN_HOST.test('https://i.ebayimg.com/images/g/abc/s-l225.png')
   && !sc.PNG_SCAN_HOST.test('https://images.pokemontcg.io/a/b.png?x=1'), 'no other host, no query string');
const sjob = fs.readFileSync(__dirname + '/stampcheck.js', 'utf8');
ok(/const scanPng = job\.material && PNG_SCAN_HOST\.test\(job\.url\) && \/png\/i\.test\(type\)/.test(sjob),
   'a PNG is accepted only for OUR scan — an eBay photo is still JPEG or nothing');
ok(/m\.material \? decodeImage\(/.test(sjob), 'the worker decodes a scan as PNG or JPEG');
const sb = fs.readFileSync(__dirname + '/stampbuild.js', 'utf8');
ok(/const decodeAny = sc\.decodeImage;/.test(sb) && !/PNG\.sync\.read/.test(sb), 'stampbuild uses the same decoder — one definition');
// The rule lives in refscans.js (2026-10-07): the builder and the server
// must measure the same scan, so the server delegates to it.
const ssrc = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
ok(/const materialScanUrl = card => refscans\.colourScanUrlOf\(card\);/.test(ssrc), 'the server reads the scan URL rule from refscans.js — one definition');
const scanUrlOf = require('./refscans.js').colourScanUrlOf;
ok(scanUrlOf({ image_small: 'https://images.pokemontcg.io/cel25c/4_A.png' }) === 'https://images.pokemontcg.io/cel25c/4_A.png',
   'the server takes a pokemontcg.io scan as the reference (CC002 had none)');
ok(scanUrlOf({ image_small: 'https://assets.tcgdex.net/en/neo/neo4/107/low.png' }) === 'https://assets.tcgdex.net/en/neo/neo4/107/low.jpg',
   'a TCGdex scan is still read as its .jpg');
ok(scanUrlOf({ image_small: 'https://images.scrydex.com/pokemon/x/large' }) === null && scanUrlOf({}) === null,
   'any other host, or no image: no reference, said so (not guessed)');

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const judge = src.slice(src.indexOf('async function judgeListings'), src.indexOf('// One card view\'s listings'));
ok(/stampcheck\.materialJudge\(/.test(judge), 'judgeListings runs the novelty check');
ok(judge.indexOf('outlier.flagOutliers') < judge.indexOf('stampcheck.materialJudge('), '...after the outlier check, whose flag is a signal');
ok(judge.indexOf('stampcheck.materialJudge(') < judge.indexOf('listings.sort('), '...and before the sort, so a flagged row sorts last');
ok(/priceFlag: !!l\.suspect/.test(judge) && /backVerdicts\.get\(backKey\(l\.itemId/.test(judge), 'it is given the outlier flag and the stored back verdict');
ok(/sources = withMaterialRefusals\(sources, j\.material\)/.test(src) && /function withMaterialRefusals/.test(src),
   'a refusal is counted in sources.ebay like any other');
ok(/j\.material && j\.material\.refusedRows/.test(src), 'and listed in refused[] with its reason');
{ // the REAL helper: the summary's "N kept" moves with the count (it said 53 while 36 were shown)
  const vm = require('vm'), ctx = {}; vm.createContext(ctx);
  const s2 = src.replace(/\r\n/g, '\n'), i = s2.indexOf('\nfunction withMaterialRefusals(');
  vm.runInContext(i < 0 ? 'function withMaterialRefusals(s){return s}' : s2.slice(i + 1, s2.indexOf('\n}\n', i + 1) + 2), ctx);
  const out = ctx.withMaterialRefusals({ ebay: { status: 'ok', count: 53, rejected: 147, scanned: 200,
    summary: '53 kept, 147 rejected of 200 scanned', droppedSample: [] } }, { refused: 17, refusedSample: [] });
  ok(out.ebay.count === 36 && /^36 kept, 164 rejected of 200 scanned \(17 by the gold\/black novelty check\)$/.test(out.ebay.summary),
     'the eBay summary counts the refusals: ' + out.ebay.summary);
}
ok(/material: j\.material, ebayState/.test(src), 'the view state carries it, so a rebuild keeps it');
// Found live on Render 2026-10-05: the FIRST answer's payload object named
// stamp and back but not material — refusals made, not counted, not listed.
const firstAnswer = (src.match(/buildListingsPayload\(card, requestedId, grade, printing,\s*\{[^}]*\}/g) || []);
ok(firstAnswer.length >= 1 && firstAnswer.every(s => /material: gathered\.material/.test(s)),
   'the first answer carries it too (every payload object built by hand names material)');
ok(/if \(!ropts\.material\) materialFollowUp\(/.test(src) && /if \(st\) materialFollowUp\(/.test(src),
   'rows are profiled after the answer, on the first answer and on rebuilds');
ok(/check_kind = 'material'/.test(src) && /VALUES \(\$1,'material',\$2,\$3,'profiled',\$4,\$5\)/.test(src),
   'profiles are stored as check_kind \'material\' — hashed key, numbers only');
ok(!/'material'[^;]*title/.test(src), 'no title stored with a profile');
ok(/metal: stampcheck\.metalPhotoOf\(scores, mref\)/.test(src) && /v\.metal \? 'metal-photo' : null/.test(src),
   'the back check records a metal photo with its verdict');
ok(!/ebayCall|fetchEbay/.test(judge.slice(judge.indexOf('Gold and black novelty'), judge.indexOf('listings.sort('))),
   'the novelty check makes no eBay call');

// ── Our scan's colour, stored ahead (2026-10-07) ──
// server.js storedColourRef + materialRefOf, run as written against a fake
// database and a spy on the live path (stampcheck.checkMaterialScan).
console.log('\n  our scan\'s colour: stored first, live only as the fallback');
const refscans = require('./refscans.js');
const seg = ssrc.slice(ssrc.indexOf('async function storedColourRef(card) {'), ssrc.indexOf('\nconst materialPhotoOf'));
ok(seg.length > 300 && !/INSERT INTO card_colour_refs/.test(seg), 'the server reads card_colour_refs and never writes it (refbuild.js is the one writer)');
const harness = (rows) => {
  const live = { calls: 0 };
  const fakeSc = { checkMaterialScan: async () => { live.calls++; return { state: 'profiled', gold: 0.5, black: 0.1 }; } };
  const fakeDb = { query: async (sql) => ({ rows: /FROM card_colour_refs/.test(sql) ? rows : [] }) };
  const fakeRefscans = Object.assign({}, refscans, { ensureColourTable: async () => {} });
  const f = new Function('db', 'refscans', 'stampcheck', 'materialScanUrl', '_materialRef',
    seg + '\nreturn materialRefOf;')(fakeDb, fakeRefscans, fakeSc, c => refscans.colourScanUrlOf(c), new Map());
  return { f, live };
};
const card199 = { api_card_id: 'en-sv03.5-199', image_small: 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.png' };
const url199 = 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.jpg';
(async () => {
  let h = harness([{ scan_url: url199, state: 'built', version: sc.MATERIAL_VERSION, gold: 0.012, black: 0.011 }]);
  let v = await h.f(card199);
  ok(v && v.gold === 0.012 && v.stored === true && h.live.calls === 0, 'a stored profile is used and the scan is NOT fetched', JSON.stringify(v));
  h = harness([]);
  v = await h.f(card199);
  ok(v && v.gold === 0.5 && !v.stored && h.live.calls === 1, 'not stored yet: the old live path, unchanged (no coverage lost)');
  h = harness([{ scan_url: 'https://assets.tcgdex.net/en/sv/sv03.5/199/OLD.jpg', state: 'built', version: sc.MATERIAL_VERSION, gold: 0.9, black: 0 }]);
  v = await h.f(card199);
  ok(v && v.gold === 0.5 && h.live.calls === 1, 'a profile of a DIFFERENT scan is not this card\'s: measured live');
  h = harness([{ scan_url: url199, state: 'built', version: 'material-0', gold: 0.9, black: 0 }]);
  v = await h.f(card199);
  ok(v && v.gold === 0.5 && h.live.calls === 1, 'a profile of another MATERIAL_VERSION is retired: measured live');
  const png = require('pngjs').PNG, p = new png({ width: 20, height: 28 });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 200; p.data[i + 1] = 160; p.data[i + 2] = 40; p.data[i + 3] = 255; }
  const built = refscans.colourFromScan(png.sync.write(p));
  ok(built.version === sc.MATERIAL_VERSION && built.gold != null && built.black != null, 'the builder stamps the current MATERIAL_VERSION');
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
