// deals.js — "Best deals right now" (TASK T3, 2026-10-05).
//
// REQUIRED BY server.js, so it is TRACKED.
//
// The rule, decided by Roy: the cheapest TRUSTED Buy It Now listing against
// a MEASURED price, where both ends are solid. Deliberately not the outlier
// signal: an outlier is below trust; a deal is at the bottom of trust.
//
//   listing end  live, Buy It Now (never a current bid), not flagged by any
//                check (outlier.trustworthy — price, reprint band, novelty),
//                landed cost KNOWN (shipping stated), not still waiting for
//                its photo check
//   price end    the card's stored, number-matched, ungraded price, real and
//                CURRENT (pricequality: no old / thin / unsettled mark) — the
//                same reference outlier.js judges by
//   a deal       landed at least MIN_DISCOUNT below that price
//
// Drawn ONLY from views someone opened in the last 15 minutes (the listing
// cache eBay's terms allow). It never fetches: 0 eBay calls to fill a browse
// tile — that is how 5,000 calls once went in twelve hours. Raw views
// without a printing or edition filter only: the stored price is the base
// printing, ungraded.
//
// OFF since 2026-10-05 (Roy). Seen live with real views, at most 2 of 8 were
// like-for-like: a gold metal novelty card, an Evolutions Mewtwo under Mewtwo
// ☆, three copies the seller called damaged / MP against a near-mint price,
// a "Non-Holo" against the holo price. The bar below now also refuses stated
// damage, a stated printing or edition other than the price's, and any row a
// check has marked (pending photo, metal photo, other back). It does NOT catch
// that #1 row: the gold Shining Charizard carried no mark anywhere — colour
// 0.059 above our scan (washed-out light), price not low enough to flag, back
// "no-claim" (PROGRESS 2026-10-05, night).
//
// ON again 2026-10-05 (TASK T1) with the GENUINE-BACK RULE: every check above
// asks "is there evidence this is fake?", and a muted-gold photo at a fair
// price produces none. The shelf recommends, so it asks the other question —
// "is there evidence this is real?" — and the back check answers it: 0 of 58
// metal backs matched a genuine template, 104 of 107 genuine backs were found,
// 88% of listings post one. A deal must have backcheck's 'genuine-back'.
// Absence (no back photo, a metal back, not checked yet) keeps a row OFF the
// shelf — it says nothing against the row in the listings panel.
// The check is paid (1 getItem), so server.js asks it for the deal CANDIDATES
// of a raw view only, at most DEAL_BACK_MAX a card. (Since 2026-10-08 the
// refresh job asks it, through pickVouched; the shelf itself asks nothing.)
'use strict';
const outlier = require('./outlier');

// OFF AGAIN 2026-10-05, the same evening, after the live check: the gold
// Shining Charizard was gone (refused in the panel, and no genuine back), but
// the shelf's 2 picks were a gold Charizard ex 228/197 sold under Base
// Charizard 4/102 (a DIFFERENT genuine card — its back is genuine; colour 0.244
// on our warm Base scan leaves it under 0.40) and a genuine Pikachu VMAX with a
// crease the title does not state. A genuine back says the card is real, not
// that it is THIS card. Needs an "is this photo this card" answer first.
// ON 2026-10-08 (Roy), on the VOUCHING bar (pickVouched) for approved
// accounts, with a discount CEILING: every bad pick across two runs sat at
// the extreme (Lugia 185 sold as 186 at 85% below; the Blastoise reprints
// at 87%). Past MAX_DISCOUNT the discount is itself the evidence.
const ENABLED = true;
const OFF_REASON = 'Best deals is switched off while its bar is fixed: listings shown here must be the same card, '
  + 'printing and condition as the price they are compared with. On 2026-10-05 a genuine back was required and the '
  + 'top pick was still a different card.';
const MIN_DISCOUNT = 0.15;
const MAX_DISCOUNT = 0.60;
// Cards kept off the shelf, each with WHY and WHEN IT COMES OFF this list —
// a temporary exclusion with no removal condition becomes permanent (Roy).
const EXCLUDED = {
  // 2026-10-08: the shelf's pick was a PRERELEASE-stamped copy whose title
  // never said so ("Near Mint w Swirl") — the stamp is on the art, and no
  // photo check detects it yet. REMOVE when a PRERELEASE stamp template in
  // stampcheck refuses these photos, measured both ways.
  'en-base5-8': { reason: 'the PRERELEASE stamp on Dark Gyarados is not detectable yet',
                  removeWhen: 'a PRERELEASE stamp template in stampcheck catches it, measured both ways' },
  // en-bwp-BW28, en-bw5-107 and en-ex12-91 were here 2026-10-08 -> 10-09, on a
  // wrong inference: rebuilding the 08/10 batch showed none of them was in it
  // (written 07/10 00:01, due a minute after that run began), so the old
  // duplicate-price guard never touched them; each product id belongs to that
  // card alone; en-ex12-91 answers TCGdex again at the stored $799
  // (PROGRESS 2026-10-09).
};
// getItem calls a raw view may spend checking its deal candidates' backs.
const DEAL_BACK_MAX = 2;
// Stated below near mint: the stored price is the card's ungraded market price,
// which is a near-mint price. Codes from cardmatch.sellerCondition.
const BELOW_NM = new Set(['LP', 'MP', 'HP', 'DMG']);

// The printing the card's price is for: its one non-reverse printing. null
// when the card's printings are unread or it has two (normal AND holo) — then
// a row that STATES a printing cannot be shown to be the priced one.
function basePrintingOf(payload) {
  const keys = ((payload && payload.printings) || []).map(p => p && p.key).filter(k => k && !/^reverse/.test(k));
  return keys.length === 1 ? keys[0] : null;
}

// Why this row cannot be a deal, or null. Every reason is a row the listings
// panel already marks or the title already states — one place, counted.
function notADeal(l, base) {
  if (!l || !l.live) return 'ended';
  if (l.saleType === 'auction' || !outlier.trustworthy(l)) return l.suspect ? 'flagged: ' + l.suspect : 'a current bid';
  if (!l.shippingKnown || !(Number(l.landed) > 0)) return 'shipping not stated';
  return rowMarked(l, base);
}
// What any bar refuses on the row itself, whatever its sale type — one
// definition for the deals bar and the auction bars (T5b).
function rowMarked(l, base) {
  if (l.materialPending) return 'novelty check not run yet';
  if (l.stamp && l.stamp.state === 'pending') return 'photo not checked yet';
  if (l.back && (l.back.state === 'other-back' || l.back.metal)) return 'back check marked it';
  if (l.sellerStated && BELOW_NM.has(l.sellerCondition)) return 'stated condition below near mint';
  if (l.printingStated && (/^reverse/.test(l.printing || '') || l.printing !== base)) return 'states another printing';
  if (l.editionStated && l.editionKey && l.editionKey !== 'unlimited') return 'states another edition';
  return null;
}

const discountOf = (l, ref) => 1 - Number(l.landed) / ref.price;
// The discount is INTERNAL — it chooses, it is never shown or stored (Roy,
// 2026-10-08). What IS shown is our own price, named: "TCGplayer market". Our
// stored prices come from TCGplayer (via TCGdex, or TCGplayer directly);
// anything else is named by its own source rather than passed off as "market".
function refLabel(ref) {
  const src = String((ref && ref.source) || '');
  return /tcgplayer/i.test(src) ? 'TCGplayer market price' : 'stored price (' + (src || 'unknown source') + ')';
}
const refUsable = ref => ref && ref.isReal !== false && ref.price > 0 && ref.current;

// ── The VOUCHING bar (Roy, 2026-10-07) — measured; the shelf stays OFF ──
// Every check above asks "is there evidence this is bad?", and a damaged or
// wrong card with nothing visibly wrong passes it. This asks the other
// question: "is there enough evidence to vouch for this one?" — and anything
// without it is SKIPPED, never passed. Absence of evidence is a skip.
// vouchFree: every criterion the view already answers (0 calls). The two
// that need the seller's photos — at least VOUCH.minPhotos, and a genuine
// back — come from ONE getItem (vouchPhotos), asked only of rows that
// cleared everything free. Each returns the signals cleared, or why not.
const VOUCH = { minFeedbackScore: 100, minFeedbackPercent: 98, minPhotos: 2 };
function vouchFree(l, payload, ref) {
  const cleared = [];
  const no = notADeal(l, basePrintingOf(payload));
  if (no) return { skip: no };
  cleared.push('live Buy It Now, shipping stated, unflagged (outlier / reprint price / year / novelty), no other printing or edition stated');
  if (!refUsable(ref) || discountOf(l, ref) < MIN_DISCOUNT) return { skip: 'not ' + Math.round(MIN_DISCOUNT * 100) + '% below the ' + refLabel(ref) };
  if (discountOf(l, ref) > MAX_DISCOUNT) return { skip: 'more than ' + Math.round(MAX_DISCOUNT * 100) + '% below the ' + refLabel(ref) + ' — a discount that large is itself evidence something is wrong' };
  cleared.push(Math.round(discountOf(l, ref) * 100) + '% below the ' + refLabel(ref));
  return vouchEvidence(l, payload, cleared);
}
// The evidence every vouching bar needs on a row, after its own price rule:
// every photo check that applies ran and passed, the novelty check ran, a
// stated condition, no ambiguous "HP", a seller with a record. Shared by the
// deals bar and the auction bars (T5b) — one definition.
function vouchEvidence(l, payload, cleared) {
  const sg = (payload && payload.stampGate) || {};
  if (sg.notRun && sg.notRun.length) return { skip: 'a photo check could not run on this card (' + sg.notRun.map(r => r.label).join(', ') + ')' };
  if (sg.applied) {
    if (!l.stamp || l.stamp.state !== 'not-visible') return { skip: 'photo check ' + (l.stamp ? l.stamp.state : 'not run') + ' (' + (sg.kind || '?') + ')' };
    cleared.push('photo check ran and passed (' + sg.kind + ')');
  } else cleared.push('no reprint, pair or sibling check applies to this card');
  const mc = (payload && payload.materialCheck) || {};
  if (!mc.applied) return { skip: 'novelty (colour) check cannot run on this card' + (mc.reason ? ': ' + mc.reason : '') };
  if (l.materialPending) return { skip: 'novelty (colour) check not run on this row yet' };
  cleared.push('novelty (colour) check ran and passed');
  if (!l.sellerStated || !l.sellerCondition && l.conditionSource !== 'ebay') return { skip: 'no condition stated by the seller' };
  if (hpAmbiguous(l.title)) return { skip: 'title says "HP" away from a hit-point number — heavily played or hit points, ambiguous' };
  cleared.push('condition stated near mint or better (' + (l.conditionSource === 'ebay' ? "eBay's Card Condition field" : 'title') + ')');
  const fb = l.sellerFeedback || {};
  if (!(fb.score >= VOUCH.minFeedbackScore && fb.percent >= VOUCH.minFeedbackPercent))
    return { skip: 'seller feedback ' + (fb.score == null ? 'unknown' : fb.score + ' at ' + fb.percent + '%') + ' (needs ' + VOUCH.minFeedbackScore + '+ at ' + VOUCH.minFeedbackPercent + '%+)' };
  cleared.push('seller feedback ' + fb.score + ' at ' + fb.percent + '%');
  return { cleared, identity: sg.applied && /lookalike|sibling|both/.test(sg.kind || '') ? sg.kind : 'none' };
}
// "HP" is printed on every card (hit points) and is also Heavily Played. It
// reads as hit points only beside a bare number ("70 HP", "220HP", "HP 160");
// anywhere else — "Alakazam EX 125/124 HP" — it is ambiguous, and a deal is
// vouched for, so ambiguity is a skip (Roy, 2026-10-08).
function hpAmbiguous(title) {
  const t = String(title || '');
  const re = /\bhp\b/gi; let m;
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index), after = t.slice(m.index + m[0].length);
    const hitPoints = /(?:^|\s)\d{2,3}\s*$/.test(before) || /^\s*\d{2,3}\b/.test(after);
    if (!hitPoints) return true;
  }
  return false;
}
// The photos: v is the back check's own answer for this row ({ state, photos, metal }).
function vouchPhotos(v) {
  if (v && v.notChecked) return { skip: 'back not checked yet' };
  if (!v || v.error) return { skip: 'back check could not run' + (v && v.error ? ': ' + v.error : '') };
  // An unknown count is not zero: say which (a stored verdict carries none).
  if (v.photos == null) return { skip: 'photo count not known' + (v.photosError ? ': ' + v.photosError : '') };
  if (!(v.photos >= VOUCH.minPhotos)) return { skip: (v.photos || 0) + ' photo' + (v.photos === 1 ? '' : 's') + ' (needs ' + VOUCH.minPhotos + '+)' };
  if (v.metal) return { skip: 'a gold/black metal photo among the seller\'s' };
  if (v.state !== 'genuine-back') return { skip: 'back not vouched: ' + (v.state || 'no verdict') };
  return { cleared: [v.photos + ' photos', 'genuine back found'] };
}

// THE vouching bar for one view — one definition, run by the shelf
// (/api/deals: backOf answers from verdicts already held, 0 calls), the
// view-time follow-up (backOf asks eBay: at most DEAL_BACK_MAX getItem a
// view) and the probe (/api/ebay/dealsprobe?bar=vouch). Cheapest first;
// every free criterion before the back; the first row clearing all wins.
async function pickVouched(payload, ref, backOf) {
  const why = EXCLUDED[payload && payload.cardId];
  if (why) return { pick: null, skipped: { ['card excluded from deals: ' + why.reason]: 1 }, reached: [], backsAsked: 0, examined: 0, excluded: why };
  const rows = ((payload && payload.listings) || []).slice().sort((a, b) => Number(a.landed) - Number(b.landed));
  const skipped = {}, reached = [];
  let pick = null, backsAsked = 0;
  const skip = (why, l) => { const k = why.replace(/-?\d+(\.\d+)?/g, 'N'); skipped[k] = (skipped[k] || 0) + 1; if (l) reached.push({ l, why }); };
  for (const l of rows) {
    const f = vouchFree(l, payload, ref);
    if (f.skip) { skip(f.skip); continue; }
    if (backsAsked >= DEAL_BACK_MAX) { skip('back-check budget for this card spent', l); continue; }
    backsAsked++;
    const v = await backOf(l);
    const p = vouchPhotos(v);
    if (p.skip) { skip(p.skip, l); continue; }
    pick = { listing: l, discount: Math.round(discountOf(l, ref) * 1000) / 1000, cleared: f.cleared.concat(p.cleared),
             identity: f.identity, back: { state: v.state, photos: v.photos } };
    break;
  }
  return { pick, skipped, reached, backsAsked, examined: rows.length };
}

// ROTATION (T5a, 2026-10-10): which n of the pool a run walks. Never walked
// first, then the longest ago; ties keep the pool's order (dearest first).
// walked: Map(cardId -> ms of the job's last walk). One definition, tested.
function rotate(pool, walked, n) {
  const rank = new Map(pool.map((id, i) => [id, i]));
  const at = id => (walked && walked.get(id)) || 0;
  return pool.slice().sort((a, b) => at(a) - at(b) || rank.get(a) - rank.get(b)).slice(0, n);
}

// ── THE AUCTION BARS (TASK-account-and-bars T5b, 2026-10-10) ──
// Built from the SAME search the deals job already makes: one Browse search
// returns Buy It Now and auction rows together (buyingOptions FIXED_PRICE|
// AUCTION, server.js since T0) — confirmed 2026-10-10 on Umbreon VMAX 215:
// 42 Buy It Now + 2 auctions in one response, each auction carrying its
// current bid, bid count and eBay's end time. 0 extra calls to find them.
//   best    a live auction, its CURRENT BID (the item price — a threshold
//           judges the item price) MIN..MAX_DISCOUNT below our current
//           measured price, at least AUCTION_END_H.min hours left
//   ending  a live auction AUCTION_END_H.min..max hours from its end WHEN
//           FOUND (route 1: shown no longer than the 3-hour floor, so
//           nothing on the bar can have ended — it never lies)
// Both: every row check the deals bar makes (rowMarked, vouchEvidence).
// The back is NOT asked at supply (that would be a call): the click asks
// it, in the same getItem as the live listing, and refuses without a
// genuine back — the bar still vouches before anything of eBay's is shown.
// The discount and the end time CHOOSE; neither is stored or shown — the
// pick keeps a coarse band (endBand) for the ending bar's order and label.
const AUCTION_END_H = { min: 3, max: 48 };
const AUCTION_BARS = ['auctions', 'ending'];
function endHoursOf(l, now) {
  const t = Date.parse(l && l.endsAt);
  return Number.isFinite(t) ? (t - now) / 3600e3 : null;
}
const endBand = h => (h < 12 ? '3-12h' : h < 24 ? '12-24h' : '24-48h');
const bidOf = l => Number(l && l.price);
function auctionFree(l, payload, ref, bar, now) {
  if (!l || !l.live) return { skip: 'ended' };
  if (l.saleType !== 'auction') return { skip: 'not an auction' };
  if (l.suspect) return { skip: 'flagged: ' + l.suspect };
  const h = endHoursOf(l, now);
  if (h == null) return { skip: 'no end time' };
  if (h < AUCTION_END_H.min) return { skip: 'ends within ' + AUCTION_END_H.min + ' h — could end before it is shown' };
  if (bar === 'ending' && h > AUCTION_END_H.max) return { skip: 'ends more than ' + AUCTION_END_H.max + ' h out' };
  const marked = rowMarked(l, basePrintingOf(payload));
  if (marked) return { skip: marked };
  if (!refUsable(ref)) return { skip: 'no current measured price to stand beside' };
  if (!(bidOf(l) > 0)) return { skip: 'no current bid' };
  const q = 1 - bidOf(l) / ref.price;
  const cleared = ['live auction, ' + Math.round(h) + ' h left, unflagged, no other printing or edition stated'];
  if (bar === 'auctions') {
    if (q < MIN_DISCOUNT || q > MAX_DISCOUNT) return { skip: 'current bid not ' + Math.round(MIN_DISCOUNT * 100) + '-' + Math.round(MAX_DISCOUNT * 100) + '% below the ' + refLabel(ref) };
    cleared.push('current bid ' + Math.round(q * 100) + '% below the ' + refLabel(ref));
  }
  const ev = vouchEvidence(l, payload, cleared);
  return ev.skip ? ev : Object.assign(ev, { hours: h, q });
}
// One pick a card a bar: best = the largest gap (internal); ending = the soonest end.
function pickAuction(payload, ref, bar, now) {
  const skipped = {};
  let best = null;
  for (const l of (payload && payload.listings) || []) {
    const f = auctionFree(l, payload, ref, bar, now);
    if (f.skip) { const k = f.skip.replace(/-?\d+(\.\d+)?/g, 'N'); skipped[k] = (skipped[k] || 0) + 1; continue; }
    if (!best || (bar === 'ending' ? f.hours < best.hours : f.q > best.q)) best = { listing: l, hours: f.hours, q: f.q, cleared: f.cleared };
  }
  if (EXCLUDED[payload && payload.cardId]) return { pick: null, skipped: { 'card excluded from deals': 1 } };
  return { pick: best && { listing: best.listing, band: bar === 'ending' ? endBand(best.hours) : null, cleared: best.cleared }, skipped };
}
// The click (T5b): the auction live, from the one getItem the back check
// also reads. Why it is no longer shown, or null. live: certcheck.readLive.
function auctionClickRefusal(live, back, ref, bar, now) {
  if (!live) return 'This auction has ended.';
  const end = Date.parse(live.endsAt);
  if (!(live.buyingOptions || []).includes('AUCTION') || !Number.isFinite(end) || end <= now) return 'This auction has ended.';
  if (live.currentBid == null || live.currentBidCurrency !== 'USD') return 'This listing has changed.';
  if (bar === 'auctions') {
    const q = ref && ref.price > 0 ? 1 - live.currentBid / ref.price : null;
    if (q == null || q < MIN_DISCOUNT || q > MAX_DISCOUNT) return 'The bidding has moved — it is no longer below the market price.';
  }
  const p = vouchPhotos(back);
  if (p.skip) return 'We could not vouch for this listing\'s photos.';
  return null;
}

// A deal's band (TASK-account-and-bars, Roy 2026-10-10): the shelf orders the
// best discount first, and a pick may store OUR band, never the number (the
// discount stays internal — 2026-10-08). Three bands over the 15-60% window.
const DEAL_BANDS = ['45-60', '30-45', '15-30'];          // best first
function discountBand(q) {
  if (!(q >= MIN_DISCOUNT && q <= MAX_DISCOUNT)) return null;
  return q >= 0.45 ? '45-60' : q >= 0.30 ? '30-45' : '15-30';
}

// The shelf's order (Roy, 2026-10-10): best discount first — by OUR band, never
// the number — then our price, dearest first, then the card id, so the order is
// total and the same on every read: a reader paging through it never sees it move.
function orderShelf(rows) {
  const rank = b => { const i = DEAL_BANDS.indexOf(b); return i < 0 ? DEAL_BANDS.length : i; };
  return rows.slice().sort((a, b) => rank(a.band) - rank(b.band) || b.price - a.price || String(a.cardId).localeCompare(String(b.cardId)));
}

function rankDeals(deals) {
  return deals.slice().sort((a, b) => b.discount - a.discount || a.listing.landed - b.listing.landed);
}

function describeRule() {
  return 'The cheapest trusted Buy It Now listing (shipping stated, no check marked it, no stated damage, printing or '
    + 'edition other than the priced one, a seller with ' + VOUCH.minFeedbackScore + '+ feedback at ' + VOUCH.minFeedbackPercent
    + '%+, every photo check that applies run and passed, at least ' + VOUCH.minPhotos + ' photos and a genuine card back among them) '
    + 'on a card opened in the last 15 minutes, between ' + Math.round(MIN_DISCOUNT * 100) + '% and ' + Math.round(MAX_DISCOUNT * 100)
    + '% below the card\'s TCGplayer market price — further below is itself a warning. Nothing is fetched to fill this shelf; '
    + 'opening a card checks the backs of at most ' + DEAL_BACK_MAX + ' of its candidates (one eBay item lookup each, once).';
}

module.exports = { ENABLED, OFF_REASON, MIN_DISCOUNT, MAX_DISCOUNT, EXCLUDED, DEAL_BACK_MAX, BELOW_NM, basePrintingOf, notADeal,
  VOUCH, vouchFree, vouchPhotos, discountOf, refLabel, hpAmbiguous, pickVouched, rotate, rowMarked, vouchEvidence,
  AUCTION_END_H, AUCTION_BARS, DEAL_BANDS, discountBand, orderShelf, endHoursOf, endBand, auctionFree, pickAuction, auctionClickRefusal,
                   rankDeals, describeRule };
