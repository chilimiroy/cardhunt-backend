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
ok('the shared margin is the measured 0.30', sc.LOOKALIKE_MARGIN === 0.30);
// T0 (2026-10-06): a genuine bubble Mew (dim binder photo) scored 0.352 and was
// refused at 0.30. Not reproducible on a scan (NCC ignores a linear dimming) and
// never an eBay photo in a fixture — so the number is pinned here, and the
// measurement is in PROGRESS: 0.40 keeps it, still refuses 113 of 178 30th photos.
ok('the Mew pair carries its own margin, 0.40, both directions',
   onPF.find(c => c.kind === 'lookalike').margin === 0.40 && onTH.find(c => c.kind === 'lookalike').margin === 0.40);
ok('the Evolutions pairs carry none (the shared 0.30)',
   ['en-ex13-103', 'en-xy12-51', 'en-ex3-90', 'en-xy12-72'].every(id => cm.lookalikesOf({ cardId: id })[0].margin === undefined));
{
  // A photo that lands between 0.30 and 0.40 under the Mew pair is KEPT; the
  // same score under a 0.30 pair is refused. Driven through judge itself: a
  // pair whose "other" side is our card's own scan scores margin 0.
  const self = [{ cardId: PF, kind: 'lookalike', ours: PF, label: 'x' }];
  ok('judge reads the pair\'s margin (a margin-0 photo is kept at any margin)',
     sc.judge(photoOf(img(PF)), self.map(c => Object.assign({}, c, { margin: 0.40 }))).state !== 'found');
  ok('...and a pair margin of 0 or below would refuse it — the field is what judge compares',
     sc.judge(photoOf(img(PF)), self.map(c => Object.assign({}, c, { margin: -0.01 }))).state === 'found');
}

console.log('\n  the cross-set pairs (2026-10-05): ex-era cards listed with Evolutions photos');
for (const [ours, other, name] of [['en-ex13-103', 'en-xy12-51', 'Mewtwo ☆ / Evolutions Mewtwo'],
                                   ['en-ex3-90', 'en-xy12-72', 'Dragonite ex / Evolutions Dragonite-EX']]) {
  ok(name + ': named both directions', cm.photoChecksOf({ cardId: ours }).some(c => c.kind === 'lookalike' && c.cardId === other) &&
     cm.photoChecksOf({ cardId: other }).some(c => c.kind === 'lookalike' && c.cardId === ours));
  ok(name + ': both whole-card templates built', !!img(ours) && !!img(other));
  const mine = cm.photoChecksOf({ cardId: ours });
  let v2 = sc.judge(photoOf(img(other)), mine);
  ok(name + ': the Evolutions photo under the ex-era card is FOUND', v2.state === 'found', 'margin ' + (v2.scores[0] || {}).margin);
  v2 = sc.judge(photoOf(img(ours)), mine);
  ok(name + ': the genuine card\'s photo is KEPT', v2.state !== 'found', 'margin ' + (v2.scores[0] || {}).margin);
  v2 = sc.judge(photoOf(img(ours), { glare: true }), mine);
  ok(name + ': a GLARED genuine photo is still kept', v2.state !== 'found', 'margin ' + (v2.scores[0] || {}).margin);
  v2 = sc.judge(photoOf(img(other)), cm.photoChecksOf({ cardId: other }));
  ok(name + ': the Evolutions photo on its OWN card is kept', v2.state !== 'found', 'margin ' + (v2.scores[0] || {}).margin);
}
ok('shipped at the Mew pair\'s margin, not re-tuned on these two', sc.LOOKALIKE_MARGIN === 0.30);
ok('the verdict version moved with the pairs (older verdicts never answer for them)', sc.VERDICT_VERSION === 'stamp-2');

console.log('\n  the verdict belongs to the photo AND the card viewed');
const item = 'v1|123456789012|0';
ok('a lookalike verdict is keyed on item + our card + the pair\'s own margin',
   sc.verdictKey(item, onPF) === item + '@' + PF + '~m0.4' && sc.verdictKey(item, onTH) === item + '@' + TH + '~m0.4');
ok('a pair on the shared margin keeps its old key (Evolutions verdicts still read)',
   sc.verdictKey(item, cm.photoChecksOf({ cardId: 'en-ex13-103' })) === item + '@en-ex13-103');
ok('a stamp-only verdict keeps its old key (stored verdicts still read)',
   sc.verdictKey(item, cm.reprintCardsOf({ cardId: 'en-ecard2-149', number: '149' })) === item);

console.log('\n  the gate');
sc._clearCache();
const url = 'https://i.ebayimg.com/images/g/abc/s-l225.jpg';
const row = { source: 'ebay', itemId: item, imageUrl: url, title: 'Mew ex 232/091 Paldean Fates', price: 180 };
// T0 (2026-10-06): hiding every unchecked row emptied whole panels while the
// photo queue ran (Evolutions Mewtwo 0 of 190 shown). The sibling rule now.
let g = sc.gate([row], onPF);
ok('unchecked, no stored price: SHOWN while checked, labelled, still queued',
   g.listings.length === 1 && g.listings[0].stamp.state === 'pending' && g.listings[0].stamp.kind === 'lookalike'
   && g.report.pending === 1 && g.pending.length === 1 && g.report.kind === 'lookalike');
g = sc.gate([row], onPF, { hideBelow: 872.64 * sc.SIBLING_HIDE_FRACTION });
ok('unchecked and priced below ~55% of the current price ($180 under $872.64): HIDDEN until checked',
   g.listings.length === 0 && g.report.pending === 1 && g.report.pendingShown === 0);
g = sc.gate([Object.assign({}, row, { price: 850, landed: 850 })], onPF, { hideBelow: 872.64 * sc.SIBLING_HIDE_FRACTION });
ok('unchecked at the card\'s price ($850): SHOWN while checked', g.listings.length === 1 && g.report.pendingShown === 1);
sc._clearCache();
g = sc.gate([row], onPF);
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
