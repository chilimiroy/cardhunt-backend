// backcheck.test.js — the card-back check (TASK T3, 2026-10-04)
//
// Two positive verdicts, two actions: another language family's back
// REFUSES the row; this card's own family's back LABELS it ("back photo
// matches a genuine card", never "verified"). Nothing found claims nothing.
// Measured on 98 fresh listings labelled by eye (CLAUDE.md, "THE CARD
// BACK"): 52/52 genuine English labelled, 0/17 metal or printed-fake backs,
// 11/12 Japanese backs found, 0 English listings called Japanese.
//
// Offline: the "photos" are the templates themselves, framed as a seller
// would shoot them, and a card FRONT from stamps.json as the non-back.

const fs = require('fs');
const bc = require('./backcheck.js');
const sc = require('./stampcheck.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const S = sc.templates();
const img = e => e && { w: e.w, h: e.h, data: new Uint8Array(Buffer.from(e.rgb, 'base64')) };
function framed(im, opts) {
  opts = opts || {};
  const cw = 280, ch = Math.round(cw * im.h / im.w), pad = 70, W = cw + 2 * pad, H = ch + 2 * pad;
  const c = sc.resize(im, cw, ch), out = new Uint8Array(W * H * 3).fill(opts.bg || 120);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let k = 0; k < 3; k++) {
    let v = c.data[(y * cw + x) * 3 + k];
    if (opts.gold) v = k === 0 ? Math.min(255, 140 + v * 0.45) : k === 1 ? Math.min(255, 110 + v * 0.4) : 40 + v * 0.1;
    out[((y + pad) * W + x + pad) * 3 + k] = v;
  }
  return { w: W, h: H, data: out };
}

console.log('\n  templates — from published scans, never a listing photo');
ok('an English and a Japanese back template are built', !!(S.backs && S.backs.en && S.backs.ja) && bc.ready());
ok('each names the scan it was cut from', /Cardback\.jpg$/.test(S.backs.en.scan) && /TCG_Card_Back_Japanese\.jpg$/.test(S.backs.ja.scan));

console.log('\n  one photo');
const EN = img(S.backs.en), JA = img(S.backs.ja), FRONT = img((S.wholes || {})['en-sv04.5-232']);
let s = bc.scorePhoto(framed(EN));
ok('an English back is seen as English', s.seen === 'en', JSON.stringify(s));
s = bc.scorePhoto(framed(JA));
ok('a Japanese back is seen as Japanese', s.seen === 'ja', JSON.stringify(s));
s = bc.scorePhoto(framed(sc.rotate90(EN)));
ok('a back photographed sideways is still seen', s.seen === 'en', JSON.stringify(s));
s = bc.scorePhoto(framed(FRONT));
ok('a card FRONT is no back at all', s.seen === null, JSON.stringify(s));
// A LIMIT, pinned so a change to it is noticed: the matcher reads STRUCTURE,
// not colour (normalised cross-correlation ignores a per-channel colour
// shift). A recoloured print of the genuine back passes. Real metal backs
// fail (0.30-0.36, 0 of 17) because embossed metal loses the swirl, not
// because it is gold — and a printed counterfeit with an accurate back
// would be labelled "matches a genuine card". Hence never "verified".
s = bc.scorePhoto(framed(EN, { gold: true }));
ok('LIMIT: a recoloured print of the genuine back still reads as the genuine back', s.seen === 'en', JSON.stringify(s));

console.log('\n  the listing verdict');
const en = { seen: 'en' }, ja = { seen: 'ja' }, no = { seen: null };
ok('a Japanese back on an ENGLISH card -> other-back (refuse)', bc.listingVerdict([no, ja], 'en-base1-4').state === 'other-back');
ok('an English back on a JAPANESE card -> other-back (refuse)', bc.listingVerdict([en], 'ja-SV2a-151').state === 'other-back');
ok('an English back on an English card -> genuine-back (label)', bc.listingVerdict([no, en], 'en-base1-4').state === 'genuine-back');
ok('a Japanese back on a Korean or Chinese card is its own family', bc.listingVerdict([ja], 'zh-tw-SV2a-1').state === 'genuine-back');
ok('nothing seen -> no-claim (a metal back and no back look alike)', bc.listingVerdict([no, no], 'en-base1-4').state === 'no-claim');
ok('no photos at all -> no-claim', bc.listingVerdict([], 'en-base1-4').state === 'no-claim');
ok('no verdict ever says "verified"', ['genuine-back', 'other-back', 'no-claim'].every(st =>
  !/\bverified\b/i.test(bc.listingVerdict(st === 'genuine-back' ? [en] : st === 'other-back' ? [ja] : [], 'en-x').says)));
ok('the genuine label says it is not proof of THIS card', /not proof/i.test(bc.listingVerdict([en], 'en-x').says));

console.log('\n  which rows run without anyone asking');
const rows = Array.from({ length: 30 }, (_, i) => ({ source: 'ebay', itemId: 'v1|' + i + '|0', suspect: i === 3 ? 'implausible' : null }));
ok('an ordinary card: only the outlier-flagged row', bc.autoRows('en-sv03.5-199', rows).map(r => r.itemId).join() === 'v1|3|0');
ok('a most-faked card (Shining Charizard): every row, capped at 20', bc.autoRows('en-neo4-107', rows).length === bc.AUTO_MAX_PER_VIEW && bc.AUTO_MAX_PER_VIEW === 20);
ok('a row already checked is not checked again', !bc.autoRows('en-neo4-107', rows, id => id === 'v1|0|0').some(r => r.itemId === 'v1|0|0'));
ok('a non-eBay row is never checked (no getItem for it)', bc.autoRows('en-neo4-107', [{ source: 'yuyutei', itemId: 'x', suspect: 'implausible' }]).length === 0);

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('/api/back exists and uses the SHARED getItem (one call serves Verify, Photos and the back)',
   /app\.get\('\/api\/back\/:cardId'/.test(src) && /ebayItemOnDemand\(itemId, cid, 'back', o\)/.test(src));
ok('automatic runs are BACKGROUND (they yield at the soft stop)', /backCheckItem\(card, r\.itemId, \{ background: true \}\)/.test(src));
ok('another language\'s back is refused in judgeListings and counted as an eBay rejection',
   /v\.state === 'other-back'/.test(src) && /function withBackRefusals/.test(src) && /sources = withBackRefusals\(sources, j\.back\)/.test(src));
ok('verdicts are stored as check_kind \'back\' with hashed keys — no title, price, URL or photo',
   /VALUES \(\$1,'back',\$2,\$3,\$4,\$5,\$6,\$7,\$8\)/.test(src) && /stampcheck\.itemKey\(k\)/.test(src) && !/INSERT INTO listing_photo_verdicts[^;]*title/.test(src));
ok('back photos are scored in the stamp worker pool, not on the request thread', /stampcheck\.checkBackPhoto\(u\)/.test(src));
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('the page offers "Check card back" and shows "Back photo matches a genuine card"',
   /Check card back/.test(page) && /Back photo matches a genuine card/.test(page) && !/BACK_CHIP[\s\S]{0,400}[Vv]erified/.test(page));

console.log(`\n  backcheck.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
