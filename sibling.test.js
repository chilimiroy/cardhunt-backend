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
ok('with a stamp check too, the same price rule (T0 2026-10-06): cheap hidden, the rest shown while checked',
   g.listings.length === 2 && g.pending.length === 4);
sc._setTemplates(null);

console.log('\n  a verdict that lands');
sc._clearCache();
const r1 = row(5, 150);
sc.cacheSet(sc.verdictKey(r1.itemId, checksFor(A125)),
  { state: 'found', kind: 'lookalike', reprint: A25, label: 'Alakazam EX #25/124', says: 'x', scores: [] }, sc.photoUrl(r1.imageUrl));
g = sc.gate([r1], checksFor(A125), { hideBelow });
ok('a FOUND sibling refuses the row, with its reason', g.listings.length === 0 && g.report.refused === 1
   && /matches Alakazam EX #25\/124, not this card/.test(g.report.refusedSample[0].reason));

console.log('\n  references built ahead of time (speed T2, 2026-10-06)');
// The stored reference is the template the matcher actually compares: 96 px,
// then resized to WHOLE_TW exactly as wholeScore does. Same verdicts.
const refscans = require('./refscans.js');
const t24 = id => { const t = img(id), s = sc.resize(t, sc.WHOLE_TW, sc.WHOLE_TW * t.h / t.w);
  return refscans.entryOf({ state: 'built', version: refscans.REF_VERSION, w: s.w, h: s.h, rgb: Buffer.from(s.data), scan_url: 'fixture' }); };
const checks24 = ours => checksFor(ours).map(c => Object.assign({}, c, { wholes: { [ours]: t24(ours), [c.cardId]: t24(c.cardId) } }));
let same = 0, all = 0;
for (const p of [A25, A117, A125]) for (const ours of [A25, A117, A125]) for (const glare of [false, true]) {
  const ph = photoOf(img(p), { glare }), a = sc.judge(ph, checksFor(ours)), b = sc.judge(ph, checks24(ours));
  all++; if (JSON.stringify(a) === JSON.stringify(b)) same++;
}
ok('a stored 24-px reference gives the IDENTICAL verdict and scores as the 96-px one', same === all, same + '/' + all);
ok('a reference of another version is not used (no two generations mixed)', refscans.entryOf({ state: 'built', version: 'ref-0', w: 24, h: 33, rgb: Buffer.alloc(2376) }) === null
   && refscans.entryOf({ state: 'built', w: 24, h: 33, rgb: Buffer.alloc(2376) }) === null);
ok('the version names the matcher width it was built for', refscans.REF_VERSION === 'ref-1-w' + sc.WHOLE_TW);
ok('a new reference carries the current version', refscans.templateFromScan(Buffer.from(require('jpeg-js').encode({ width: 48, height: 66, data: Buffer.alloc(48 * 66 * 4, 128) }, 90).data)).version === refscans.REF_VERSION);
ok('an unbuildable row is not a reference', refscans.entryOf({ state: 'unbuildable', reason: 'HTTP 404' }) === null);
ok('a reference is built only from a JPEG or a PNG', refscans.templateFromScan(Buffer.from('<html>')).reason === 'scan is neither a JPEG nor a PNG');
{ // pokemontcg.io / scrydex serve PNG only: decoded, transparency flattened onto white, the same 24-px template
  const { PNG } = require('pngjs'); const p = new PNG({ width: 48, height: 66 });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 200; p.data[i + 1] = 40; p.data[i + 2] = 40; p.data[i + 3] = i < 48 * 4 ? 0 : 255; }
  const v = refscans.templateFromScan(PNG.sync.write(p));
  ok('a PNG scan builds a reference (24 px, current version)', !v.reason && v.w === sc.WHOLE_TW && v.h === 33 && v.version === refscans.REF_VERSION, v.reason || v.w + 'x' + v.h);
  ok('...its transparent corner flattened onto white, as a printed card shows', v.rgb && v.rgb[0] > 200 && v.rgb[1] > 130, v.rgb && [...v.rgb.slice(0, 3)].join(','));
}

console.log('\n  a sibling with no reference: NOT run, and said so');
sc._clearCache();
const missingSib = [{ cardId: A117, label: 'Alakazam EX #117/124', why: 'no reference scan stored yet (node refbuild.js)' }];
g = sc.gate(rows, [], { hideBelow, notRun: missingSib });
ok('no check could run: rows are unchanged, the gate is NOT applied', g.listings.length === 4 && !g.report.applied && g.pending.length === 0);
ok('...and the report names what was not run, and why', g.report.notRun && g.report.notRun.length === 1
   && /NOT run/.test(g.report.reason) && /no reference scan stored/.test(g.report.reason));
ok('...listed among the checks as no template, not run', g.report.reprints.some(r => r.cardId === A117 && r.template === false && r.notRun === true));
const half = checksFor(A125).filter(c => c.cardId === A25);
g = sc.gate(rows, half, { hideBelow, notRun: missingSib });
ok('one sibling ready, one missing: the ready one runs, the missing one is named', g.report.applied
   && (g.report.notRun || []).length === 1 && /NOT run/.test(g.report.summary));
ok('the verdict key does not claim a comparison that did not run', sc.verdictKey(item, []) === item);
g = sc.gate(rows, checksFor(A125), { hideBelow });
ok('with every reference present nothing is reported as not run', !g.report.notRun && !/NOT run/.test(g.report.summary));

console.log('\n  wired: server and page');
const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('the listing gate asks photoChecksFor (siblings included)', /stampReprints = opts\.noReprintCheck \? \[\] : await photoChecksFor\(card\)/.test(server));
ok('the follow-up and /api/stamp ask it too', /photoChecksFor\(card\)\.then\(reprints => stampFollowUpWith/.test(server)
   && /const reprints = await photoChecksFor\(card\);/.test(server));
ok('the hide line is current + raw only', /mref && mref\.current && jpf\.isRawGrade\(grade\) \? mref\.price \* stampcheck\.SIBLING_HIDE_FRACTION : null/.test(server));
ok('siblings: same set, same name, English, Pocket hidden', /lower\(c\.name\) = lower\(me\.name\)/.test(server)
   && /c\.api_card_id LIKE 'en-%' AND \$\{digital\.visibleSql\('c'\)\}/.test(server));
ok('templates from a fetched JPEG, never assumed (refscans.js)', /buf\[0\] === 0xff && buf\[1\] === 0xd8/.test(fs.readFileSync(__dirname + '/refscans.js', 'utf8')));
const sibBlock = server.slice(server.indexOf('// ── Same-name siblings in the set'), server.indexOf('function stampFollowUp('));
const liveFn = sibBlock.slice(sibBlock.indexOf('function liveTemplateOf('), sibBlock.indexOf('async function withLiveFallback('));
ok('the request reads stored references; a scan is fetched ONLY by the live fallback', sibBlock.length > 500 && /card_reference_scans/.test(sibBlock)
   && liveFn.length > 200 && (sibBlock.match(/fetch\(/g) || []).length === 1 && /fetch\(/.test(liveFn) && !/decodeJpeg/.test(sibBlock));
ok('the live fallback is bounded as before (SIBLING_BUILD_MS = 3000), on the fetch and on the whole build',
   /const SIBLING_BUILD_MS = 3000;/.test(sibBlock) && /AbortSignal\.timeout\(SIBLING_BUILD_MS\)/.test(liveFn)
   && /setTimeout\(\(\) => res\(null\), SIBLING_BUILD_MS\)/.test(sibBlock));
ok('...only for cards with no stored reference that were never recorded unbuildable', /!r\.tpl && r\.ref_state !== 'unbuildable'/.test(sibBlock));
ok('...never writes the table (refbuild.js is the one writer)', !/INSERT INTO card_reference_scans/.test(sibBlock));
ok('...and a live build that fails is reported with its reason, never dropped', /liveFailed/.test(sibBlock) && /row\.liveFailed/.test(sibBlock));
ok('a missing reference is reported (notRun), never dropped', /notRun\.push\(/.test(sibBlock) && /notRun: stampNotRun/.test(server));
ok('the page labels a row whose check has not run yet as NOT checked yet', /'pending':\s+'Not checked yet'/.test(page));
ok('...and never claims a comparison is under way while the row waits in the queue', !/being compared/.test(page));
const notRunFn = page.slice(page.indexOf('function liveNotRun('), page.indexOf('function liveStampNote('));
const noteFn = page.slice(page.indexOf('function liveStampNote('), page.indexOf('function scheduleStampPoll('));
ok('a check that could not run is named on the page with its reason, never shown as a pass',
   /g\.notRun/.test(notRunFn) && /r\.why/.test(notRunFn) && /did not run/.test(notRunFn) && /not cleared/.test(notRunFn));
ok('...on a card where NO check could run (the note used to be empty)', /if \(!g\.applied\) return liveNotRun\(g\)/.test(noteFn));
ok('...and beside the checks that did run (sibling, pair, stamp notes)', (noteFn.match(/\n\s+\+ liveNotRun\(g\)/g) || []).length === 3);
ok('the page says what the check does NOT catch', /not every wrong card/.test(page));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
