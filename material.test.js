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

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
