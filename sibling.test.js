// sibling.test.js — same-name cards in one set, told apart by the photo (T1, 2026-10-04)
//
// Alakazam EX #125/124 (gold secret) showed #117/124 (full art) and #25/124
// listings, and #117 showed #25. Every kept title stated the right number:
// the photo was of the sibling. linkaudit --live --kept on all three, eight
// eBay sites, 361 rows: 0 wrong numbers. So the photo is compared with OUR
// scan of every same-name card in the set (stampcheck "sibling").
// Measured on 1,478 photos of six groups, every row with margin >= 0.10
// looked at: 11 swaps at 0.267-0.524, the hardest genuine at 0.307. Margin
// 0.40: 7 of 11 refused, 0 genuine — a reduction, not a solve.
// Unchecked rows: hidden only below SIBLING_HIDE_FRACTION of a current stored
// raw price (Roy, 2026-10-04: the swaps sat at 14% of market); with no such
// price nothing is hidden.
//
// Offline: the "photos" are our own scans (sibling.fixture.json), framed and
// degraded as a seller's shot would be.

const fs = require('fs');
const sc = require('./stampcheck.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const FX = JSON.parse(fs.readFileSync(__dirname + '/sibling.fixture.json', 'utf8')).wholes;
const img = id => { const e = FX[id]; return { w: e.w, h: e.h, data: new Uint8Array(Buffer.from(e.rgb, 'base64')) }; };
const A25 = 'en-xy10-25', A117 = 'en-xy10-117', A125 = 'en-xy10-125';
// The checks the server builds for a card (server.js photoChecksFor).
const checksFor = ours => [A25, A117, A125].filter(id => id !== ours).map(id => ({
  cardId: id, kind: 'sibling', ours, label: 'Alakazam EX #' + id.split('-').pop() + '/124',
  wholes: { [ours]: FX[ours], [id]: FX[id] } }));

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
const top = v => Math.max(...v.scores.filter(s => s.checked).map(s => s.margin));

console.log('\n  the photo, both directions');
let v = sc.judge(photoOf(img(A117)), checksFor(A125));
ok('#117 photo under #125 is FOUND (refused)', v.state === 'found' && v.reprint === A117, 'margin ' + top(v));
ok('…and says which card it matches, never "stamp"', /#117/.test(v.says) && !/stamp/i.test(v.says));
v = sc.judge(photoOf(img(A25)), checksFor(A117));
ok('#25 photo under #117 is FOUND', v.state === 'found' && v.reprint === A25, 'margin ' + top(v));
v = sc.judge(photoOf(img(A125)), checksFor(A125));
ok('#125 photo under #125 is KEPT (not-visible, never "verified")', v.state === 'not-visible' && !/verified/i.test(v.says), 'margin ' + top(v));
v = sc.judge(photoOf(img(A125), { glare: true }), checksFor(A125));
ok('a GLARED #125 photo under #125 is still kept', v.state !== 'found', 'margin ' + top(v));
v = sc.judge(photoOf(img(A117)), checksFor(A117));
ok('#117 photo under #117 is KEPT', v.state !== 'found', 'margin ' + top(v));
ok('the sibling margin is the measured 0.40 — above the hardest genuine (0.307)', sc.SIBLING_MARGIN === 0.40);
ok('the held-pair margin is unchanged (0.30, bubble Mew)', sc.LOOKALIKE_MARGIN === 0.30);

console.log('\n  the verdict key');
const item = 'v1|123456789012|0';
ok('a sibling verdict is keyed on item + our card + "s"', sc.verdictKey(item, checksFor(A125)) === item + '@' + A125 + '+s');
ok('a held pair alone keeps its old key', sc.verdictKey(item, [{ cardId: 'en-30th-152', kind: 'lookalike', ours: 'en-sv04.5-232' }]) === item + '@en-sv04.5-232');

console.log('\n  which unchecked rows are hidden (Roy, 2026-10-04)');
sc._clearCache();
const row = (id, price) => ({ source: 'ebay', itemId: 'v1|' + id + '|0', price, landed: price, title: 'Alakazam EX 125/124',
  imageUrl: 'https://i.ebayimg.com/images/g/' + id + 'AAeSw/s-l225.jpg' });
const rows = [row(1, 25), row(2, 99), row(3, 101), row(4, 181.89)];
const hideBelow = 181.89 * sc.SIBLING_HIDE_FRACTION;
let g = sc.gate(rows, checksFor(A125), { hideBelow });
ok('the hide line is ~55% of the stored price', sc.SIBLING_HIDE_FRACTION >= 0.5 && sc.SIBLING_HIDE_FRACTION <= 0.6);
ok('a $25 row under a $181.89 card is HIDDEN until checked', !g.listings.some(l => l.price === 25));
ok('rows at or above the line are SHOWN while checked', g.listings.filter(l => l.price >= 101).length === 2
   && g.listings.every(l => l.stamp && l.stamp.state === 'pending'), g.listings.map(l => l.price).join(','));
ok('every unchecked row is still queued for checking', g.pending.length === 4);
ok('the report counts hidden and shown apart', g.report.pending === 4 && g.report.pendingShown === 2 && g.report.kind === 'sibling');
g = sc.gate(rows, checksFor(A125), { hideBelow: null });
ok('no stored price: NOTHING is hidden (no baseline, as outlier.js)', g.listings.length === 4 && g.pending.length === 4);
const stampToo = checksFor(A125).concat([{ cardId: 'en-30th-c-029', family: { label: '30th' } }]);
sc._setTemplates(Object.assign({}, sc.templates(), { templates: Object.assign({}, sc.templates().templates, { 'en-30th-c-029': sc.templates().templates['en-30th-c-029'] || { w: 4, h: 4, rgb: '' } }) }));
g = sc.gate(rows, stampToo, { hideBelow });
ok('with a stamp check too, unchecked is HIDDEN as before', g.listings.length === 0 && g.pending.length === 4);
sc._setTemplates(null);

console.log('\n  a verdict that lands');
sc._clearCache();
const r1 = row(5, 150);
sc.cacheSet(sc.verdictKey(r1.itemId, checksFor(A125)),
  { state: 'found', kind: 'lookalike', reprint: A25, label: 'Alakazam EX #25/124', says: 'x', scores: [] }, sc.photoUrl(r1.imageUrl));
g = sc.gate([r1], checksFor(A125), { hideBelow });
ok('a FOUND sibling refuses the row, with its reason', g.listings.length === 0 && g.report.refused === 1
   && /matches Alakazam EX #25\/124, not this card/.test(g.report.refusedSample[0].reason));

console.log('\n  wired: server and page');
const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('the listing gate asks photoChecksFor (siblings included)', /stampReprints = opts\.noReprintCheck \? \[\] : await photoChecksFor\(card\)/.test(server));
ok('the follow-up and /api/stamp ask it too', /photoChecksFor\(card\)\.then\(reprints => stampFollowUpWith/.test(server)
   && /const reprints = await photoChecksFor\(card\);/.test(server));
ok('the hide line is current + raw only', /mref && mref\.current && jpf\.isRawGrade\(grade\) \? mref\.price \* stampcheck\.SIBLING_HIDE_FRACTION : null/.test(server));
ok('siblings: same set, same name, English, Pocket hidden', /lower\(c\.name\) = lower\(me\.name\)/.test(server)
   && /c\.api_card_id LIKE 'en-%' AND \$\{digital\.visibleSql\('c'\)\}/.test(server));
ok('templates from a fetched JPEG, never assumed', /buf\[0\] === 0xff && buf\[1\] === 0xd8/.test(server));
ok('the page labels a row still being compared', /'pending':\s+'Photo being compared'/.test(page));
ok('the page says what the check does NOT catch', /not every wrong card/.test(page));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
