// ══════════════════════════════════════════════════════════════
// backcheck.js — what does the BACK of a listing's card show? (TASK T3, 2026-10-04)
//
// Every genuine card of a language family shares one back: English and
// every European language one design (blue swirl, Poké Ball, the doubled
// "POKéMON" wordmark — the doubling is the genuine design); modern
// Japanese, Korean and Chinese another (orbs, a yellow border). A metal or
// printed replica copies the line art in the wrong material. So a back is
// compared with OUR template of each family's back, cut from a published
// scan (stamps.json "backs", built by stampbuild.js --backs) — never from a
// listing photo.
//
// Measured twice. 2026-10-04 (T2), template from a test photo: 104 of 107
// genuine English backs found, 0 of 58 metal, 0 of 17 Japanese. Re-measured
// the same day on 98 FRESH listings (none from that sample), templates from
// the scans, every listing labelled by eye: English back found on 52 of 52
// genuine English listings, 0 of 17 metal/printed-fake backs, 0 of 12
// Japanese backs, 0 of 15 listings with no back; Japanese back found on 11
// of 12 Japanese listings and 0 of 52 English. The per-photo rule below.
//
// What it may claim — the asymmetry is the point (the stamp's rule):
//   other-back   a back of ANOTHER language family (a Japanese back on an
//                English card): a different printing. Strong: refuses.
//   genuine-back this card's own family's back: the row is labelled "back
//                photo matches a genuine card". NEVER "verified" — a genuine
//                back says nothing about a different genuine card (kind D),
//                and a European-language copy has the English back.
//   no-claim     nothing found. A metal back and a missing back look the
//                same here, so absence claims NOTHING and never refuses.
//
// The photos are eBay's: fetched from eBay's image CDN for the check, never
// stored. The VERDICT is ours: hashed item id, our card id, the verdict, the
// matcher version (BACK_VERSION) — server.js stores it beside the stamp
// verdicts (check_kind 'back').
// ══════════════════════════════════════════════════════════════
'use strict';
const sc = require('./stampcheck.js');

const BACK_VERSION = 'back-1';
// Per photo: a family's back is SEEN when its template scores at least this
// AND beats the other family's template by MARGIN (the comparison T1
// measured; an absolute score alone sits close to the other class at places:
// Japanese photos reach 0.53 on the English template, English slab close-ups
// 0.575 on the Japanese one).
const EN_MIN = 0.55, JA_MIN = 0.65, MARGIN = 0.10;
const SWEEP = { maxTw: 24, steps: 8, lo: 0.22, hi: 0.95 };

let _t = null;
function templates() {
  if (_t) return _t;
  const b = (sc.templates() || {}).backs || {};
  const img = e => e && { w: e.w, h: e.h, data: new Uint8Array(Buffer.from(e.rgb, 'base64')) };
  _t = {};
  for (const fam of ['en', 'ja']) {
    const i = img(b[fam]);
    if (i) _t[fam] = { up: i, side: sc.rotate90(i) };
  }
  return _t;
}
const ready = () => !!(templates().en && templates().ja);

function sweep(photo, t) {
  let best = -1;
  for (let i = 0; i < SWEEP.steps; i++) {
    const tw = photo.w * SWEEP.lo * Math.pow(SWEEP.hi / SWEEP.lo, i / (SWEEP.steps - 1));
    const f = Math.max(1, tw / SWEEP.maxTw);
    const im = f === 1 ? photo : sc.resize(photo, photo.w / f, photo.h / f);
    const tt = sc.resize(t, tw / f, (tw / f) * t.h / t.w);
    if (tt.w >= im.w || tt.h >= im.h || tt.h < 6) continue;
    let r = sc.nccMax(im, tt, 2);
    r = sc.nccMax(im, tt, 1, { x0: r.x - 2, x1: r.x + 2, y0: r.y - 2, y1: r.y + 2 });
    if (r.score > best) best = r.score;
  }
  return best;
}
// One decoded photo -> { en, ja, seen: 'en' | 'ja' | null }. Upright and a
// quarter turn: backs are photographed either way round.
function scorePhoto(photo) {
  const T = templates();
  if (!photo || photo.w < sc.MIN_SIDE || photo.h < sc.MIN_SIDE || !ready()) return { en: null, ja: null, seen: null };
  const en = Math.max(sweep(photo, T.en.up), sweep(photo, T.en.side));
  const ja = Math.max(sweep(photo, T.ja.up), sweep(photo, T.ja.side));
  const seen = (ja >= JA_MIN && ja - en >= MARGIN) ? 'ja' : (en >= EN_MIN && en - ja >= MARGIN) ? 'en' : null;
  return { en: +en.toFixed(3), ja: +ja.toFixed(3), seen };
}

// Which back a genuine copy of this card has: English for en- cards; the
// Japanese-family back for ja-, ko- and zh- cards.
function familyOf(cardId) {
  const id = String(cardId || '');
  if (/^en-/.test(id)) return 'en';
  if (/^(ja|ko|zh-tw|zh-cn)-/.test(id)) return 'ja';
  return null;
}
const FAMILY_NAME = { en: 'English', ja: 'Japanese-language (Japanese, Korean or Chinese)' };

// The listing's verdict from its photos' scores.
function listingVerdict(scores, cardId) {
  const fam = familyOf(cardId);
  const seen = (scores || []).map(s => s && s.seen).filter(Boolean);
  const other = seen.find(f => f !== fam);
  if (fam && other) return { state: 'other-back', family: other,
    says: `A seller's photo shows a ${FAMILY_NAME[other]} card back — a different printing from this ${FAMILY_NAME[fam]} card.` };
  if (fam && seen.includes(fam)) return { state: 'genuine-back', family: fam,
    says: 'A seller\'s photo shows the back a genuine card has. That is not proof this is the card — a different genuine card shares the back.' };
  return { state: 'no-claim',
    says: 'No genuine back found in the seller\'s photos. That claims nothing: a replica\'s back and no back photo look the same here.' };
}

// Which rows are checked without anyone asking: rows the outlier check
// flagged, and every eBay row of the most-faked cards (T2: Shining Charizard
// 64 of 90 metal replicas; Base Charizard 20 wrong among 84; Pikachu VMAX 14
// metal among 99). Capped per view; each row costs one getItem once — its
// verdict is then stored.
const MOST_FAKED = new Set(['en-neo4-107', 'en-base1-4', 'en-swsh4-188']);
const AUTO_MAX_PER_VIEW = 20;
function autoRows(cardId, rows, known) {
  const fam = familyOf(cardId);
  if (!fam) return [];
  return (rows || []).filter(r => r && r.source === 'ebay' && r.itemId && !(known && known(r.itemId)) &&
                             (MOST_FAKED.has(cardId) || r.suspect))
                     .slice(0, AUTO_MAX_PER_VIEW);
}

// ── Where absence IS evidence: cards decided one by one (TASK T1, 2026-10-05) ──
// On most cards "no genuine back" claims nothing (above). On a card whose
// listings are mostly metal copies, the trade changes: a RAW row the back
// check has judged no-claim is hidden there — refused with its reason, listed
// under refused[], never deleted. Unchecked rows stay shown. Measured on US
// page 1, every row back-checked and labelled by eye (PROGRESS 2026-10-05,
// "T1 — require a genuine back, per card"):
//   card                      rows  metal  metal w/o genuine back  genuine  genuine hidden
//   Shining Charizard neo4-107  35    22         22                   13       0
//   Base Charizard base1-4      67     6          6                  ~50       1 (doubtful)
//   M&W GX sm9-161              15     4          4                   10       1   NOT required
//   Pikachu VMAX swsh4-188      94    18         18                   72      10   NOT required
// M&W: the 2026-10-04 labelled set adds 8 of 32 genuine without a back seen
// (21% together). Pikachu VMAX: 14% of genuine rows hidden to remove 19%
// metal. Those two keep "absence claims nothing". Raw only: what was measured.
const REQUIRE_GENUINE_BACK = new Set(['en-neo4-107', 'en-base1-4']);
function requiresGenuineBack(cardId, grade) {
  return REQUIRE_GENUINE_BACK.has(String(cardId || '')) && (!grade || /^(raw|ungraded|none)$/i.test(String(grade).trim()) || /^raw[\s_-]/i.test(String(grade).trim()));
}
const REQUIRED_BACK_REASON = 'no genuine card back in the seller’s photos — on this card most such listings are metal copies';

module.exports = { BACK_VERSION, EN_MIN, JA_MIN, MARGIN, MOST_FAKED, AUTO_MAX_PER_VIEW,
                   REQUIRE_GENUINE_BACK, REQUIRED_BACK_REASON, requiresGenuineBack,
                   templates, ready, scorePhoto, familyOf, listingVerdict, autoRows,
                   _reset: () => { _t = null; } };
