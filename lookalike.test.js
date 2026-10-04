// lookalike.test.js — the comparative photo check (T1, 2026-10-04)
//
// Paldean Fates Mew ex 232/091 showed 30th Celebration Mew ex 152/128 rows,
// titled by their sellers as "232/091". A different card, not a reprint, so
// no stamp table can hold it. We hold both scans, so the photo is asked
// which of the two it matches better (stampcheck.judge, "lookalike").
// Measured on 457 photos labelled by eye (CLAUDE.md, "COMPARATIVE MATCHING"):
// margin 0.30 — 0 of 276 genuine refused, 162 of 178 of the other refused.
//
// Offline: the "photos" here are our own scans from stamps.json, shrunk and
// degraded, so the test needs no network.

const sc = require('./stampcheck.js');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const W = sc.templates().wholes || {};
const img = id => { const e = W[id]; return e && { w: e.w, h: e.h, data: new Uint8Array(Buffer.from(e.rgb, 'base64')) }; };
const PF = 'en-sv04.5-232', TH = 'en-30th-152';

console.log('\n  the pair and its templates');
ok('cardmatch names the pair, both directions',
   cm.photoChecksOf({ cardId: PF }).some(c => c.kind === 'lookalike' && c.cardId === TH) &&
   cm.photoChecksOf({ cardId: TH }).some(c => c.kind === 'lookalike' && c.cardId === PF));
ok('an ordinary card has no lookalike', cm.lookalikesOf({ cardId: 'en-base1-4' }).length === 0);
ok('both whole-card templates are built from our scans', !!img(PF) && !!img(TH));

// A "photo": the scan placed on a grey background with a margin, as a
// seller's shot would frame it, at roughly s-l500 scale.
function photoOf(scan, opts) {
  opts = opts || {};
  const cw = 300, ch = Math.round(cw * scan.h / scan.w), pad = 60, W2 = cw + 2 * pad, H2 = ch + 2 * pad;
  const card = sc.resize(scan, cw, ch), out = new Uint8Array(W2 * H2 * 3).fill(90);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let c = 0; c < 3; c++) {
    let v = card.data[(y * cw + x) * 3 + c];
    if (opts.glare && x > cw * 0.2 && x < cw * 0.6 && y > ch * 0.15 && y < ch * 0.5) v = Math.min(255, v + 110);
    out[((y + pad) * W2 + x + pad) * 3 + c] = v;
  }
  return { w: W2, h: H2, data: out };
}

console.log('\n  both directions, on our own scans');
const onPF = cm.photoChecksOf({ cardId: PF }), onTH = cm.photoChecksOf({ cardId: TH });
let v = sc.judge(photoOf(img(TH)), onPF);
ok('a 30th Mew photo under Paldean Fates is FOUND (refused)', v.state === 'found' && v.kind === 'lookalike', 'margin ' + (v.scores[0] || {}).margin);
v = sc.judge(photoOf(img(PF)), onPF);
ok('a bubble Mew photo under Paldean Fates is KEPT (not-visible, never "verified")', v.state === 'not-visible' && !/verified/i.test(v.says), 'margin ' + (v.scores[0] || {}).margin);
v = sc.judge(photoOf(img(PF), { glare: true }), onPF);
ok('a GLARED bubble Mew photo is still kept', v.state !== 'found', 'margin ' + (v.scores[0] || {}).margin);
v = sc.judge(photoOf(img(TH)), onTH);
ok('a 30th Mew photo under the 30th card is KEPT', v.state !== 'found', 'margin ' + (v.scores[0] || {}).margin);
v = sc.judge(photoOf(img(PF)), onTH);
ok('a bubble Mew photo under the 30th card is FOUND', v.state === 'found', 'margin ' + (v.scores[0] || {}).margin);
ok('the margin is the measured 0.30', sc.LOOKALIKE_MARGIN === 0.30);

console.log('\n  the verdict belongs to the photo AND the card viewed');
const item = 'v1|123456789012|0';
ok('a lookalike verdict is keyed on item + our card', sc.verdictKey(item, onPF) === item + '@' + PF && sc.verdictKey(item, onTH) === item + '@' + TH);
ok('a stamp-only verdict keeps its old key (stored verdicts still read)',
   sc.verdictKey(item, cm.reprintCardsOf({ cardId: 'en-ecard2-149', number: '149' })) === item);

console.log('\n  the gate');
sc._clearCache();
const url = 'https://i.ebayimg.com/images/g/abc/s-l225.jpg';
const row = { source: 'ebay', itemId: item, imageUrl: url, title: 'Mew ex 232/091 Paldean Fates', price: 180 };
let g = sc.gate([row], onPF);
ok('unchecked: HIDDEN and counted, never shown', g.listings.length === 0 && g.report.pending === 1 && g.report.kind === 'lookalike');
sc.cacheSet(sc.verdictKey(item, onPF), { state: 'found', kind: 'lookalike', reprint: TH, label: '30th Celebration Mew ex 152/128', scores: [] }, sc.photoUrl(url));
g = sc.gate([row], onPF);
ok('found under Paldean Fates: refused, reason names the other card',
   g.listings.length === 0 && g.report.refused === 1 && /matches 30th Celebration Mew ex 152\/128, not this card/.test(g.report.refusedSample[0].reason));
g = sc.gate([row], onTH);
ok('the SAME item under the 30th card is not refused by that verdict (hidden until its own check)',
   g.report.refused === 0 && g.report.pending === 1);
sc.cacheSet(sc.verdictKey(item, onTH), { state: 'not-visible', says: 'x', scores: [] }, sc.photoUrl(url));
g = sc.gate([row], onTH);
ok('...and shown once its own verdict lands, marked as a lookalike check', g.listings.length === 1 && g.listings[0].stamp.kind === 'lookalike');

console.log('\n  the page says what was checked');
const page = require('fs').readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('the panel note has a lookalike wording (not "reprint stamp")', /g\.kind === 'lookalike'/.test(page) && /better than this card/.test(page));
ok('the row chip never says "No stamp visible" for a lookalike check', /Not clearly the other card/.test(page));

console.log(`\n  lookalike.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
