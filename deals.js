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
//                its photo check, and the cheapest of at least MIN_TRUSTED
//                such rows in its view
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
// of a raw view only: backCandidates() below, at most DEAL_BACK_MAX a view.
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
const MIN_TRUSTED = 3;
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
  if (l.materialPending) return 'novelty check not run yet';
  if (l.stamp && l.stamp.state === 'pending') return 'photo not checked yet';
  if (l.back && (l.back.state === 'other-back' || l.back.metal)) return 'back check marked it';
  if (l.sellerStated && BELOW_NM.has(l.sellerCondition)) return 'stated condition below near mint';
  if (l.printingStated && (/^reverse/.test(l.printing || '') || l.printing !== base)) return 'states another printing';
  if (l.editionStated && l.editionKey && l.editionKey !== 'unlimited') return 'states another edition';
  return null;
}

// Why this row, otherwise solid, still is not a deal: no genuine back seen.
// A row the back check has not reached and one it found nothing on are told
// apart — the first may become a deal, the second will not.
function noGenuineBack(l) {
  if (l.back && l.back.state === 'genuine-back') return null;
  return l.back ? "no genuine back in the seller's photos" : 'back not checked yet';
}

// The rows that clear every bar except the back, cheapest first, and the
// discount each would be. Shared by pickDeal and backCandidates.
function solidRows(payload, ref, excluded) {
  const base = basePrintingOf(payload), solid = [];
  for (const l of (payload && payload.listings) || []) {
    const no = notADeal(l, base);
    if (no) { if (excluded) excluded[no] = (excluded[no] || 0) + 1; } else solid.push(l);
  }
  return solid.sort((a, b) => Number(a.landed) - Number(b.landed));
}
const discountOf = (l, ref) => 1 - Number(l.landed) / ref.price;
const refUsable = ref => ref && ref.isReal !== false && ref.price > 0 && ref.current;

// One view's best candidate. payload: a cached /api/listings payload; ref:
// { price, current, isReal } for the card. Returns { deal } or { why },
// and `excluded`: how many rows each reason kept out.
function pickDeal(payload, ref) {
  if (!ref || !ref.isReal || !(ref.price > 0)) return { why: 'no measured price for this card' };
  if (!ref.current) return { why: 'the stored price is ' + (ref.quality || 'not current') };
  const excluded = {}, solid = solidRows(payload, ref, excluded);
  if (solid.length < MIN_TRUSTED) return { why: `${solid.length} solid listing${solid.length === 1 ? '' : 's'} (needs ${MIN_TRUSTED})`, excluded };
  if (discountOf(solid[0], ref) < MIN_DISCOUNT) return { why: `cheapest solid listing is ${Math.round(discountOf(solid[0], ref) * 100)}% below the price`, excluded };
  // The genuine-back rule: the cheapest solid row WITH a genuine back seen.
  let best = null;
  for (const l of solid) {
    const no = noGenuineBack(l);
    if (!no) { best = l; break; }
    excluded[no] = (excluded[no] || 0) + 1;
  }
  if (!best) return { why: 'no solid listing has a genuine back seen', excluded };
  const discount = discountOf(best, ref);
  if (discount < MIN_DISCOUNT) return { why: `cheapest listing with a genuine back is ${Math.round(discount * 100)}% below the price`, excluded };
  return { deal: { listing: best, price: ref.price, discount: Math.round(discount * 1000) / 1000, solidCount: solid.length }, excluded };
}

// Which rows' backs a raw view should check so the shelf can judge it: the
// solid rows at least MIN_DISCOUNT below the price, cheapest first, with no
// back verdict yet, up to the first row already holding a genuine back (it
// is the deal; nothing dearer matters). `budget` is what the view may still
// spend (DEAL_BACK_MAX minus what it has). 0 calls when there is no deal to make.
function backCandidates(payload, ref, budget) {
  if (!refUsable(ref) || !(budget > 0)) return [];
  const solid = solidRows(payload, ref);
  if (solid.length < MIN_TRUSTED) return [];
  const out = [];
  for (const l of solid) {
    if (discountOf(l, ref) < MIN_DISCOUNT || out.length >= budget) break;
    if (l.back && l.back.state === 'genuine-back') break;
    if (!l.back && l.source === 'ebay' && l.itemId) out.push(l);
  }
  return out;
}

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
  if (!refUsable(ref) || discountOf(l, ref) < MIN_DISCOUNT) return { skip: 'not ' + Math.round(MIN_DISCOUNT * 100) + '% below a current measured price' };
  if (discountOf(l, ref) > MAX_DISCOUNT) return { skip: 'more than ' + Math.round(MAX_DISCOUNT * 100) + '% below a current measured price — a discount that large is itself evidence something is wrong' };
  cleared.push(Math.round(discountOf(l, ref) * 100) + '% below the current measured price');
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

function rankDeals(deals) {
  return deals.slice().sort((a, b) => b.discount - a.discount || a.listing.landed - b.listing.landed);
}

function describeRule() {
  return 'The cheapest trusted Buy It Now listing (shipping stated, no check marked it, no stated damage, printing or '
    + 'edition other than the priced one, a seller with ' + VOUCH.minFeedbackScore + '+ feedback at ' + VOUCH.minFeedbackPercent
    + '%+, every photo check that applies run and passed, at least ' + VOUCH.minPhotos + ' photos and a genuine card back among them) '
    + 'on a card opened in the last 15 minutes, between ' + Math.round(MIN_DISCOUNT * 100) + '% and ' + Math.round(MAX_DISCOUNT * 100)
    + '% below the card\'s current measured price — further below is itself a warning. Nothing is fetched to fill this shelf; '
    + 'opening a card checks the backs of at most ' + DEAL_BACK_MAX + ' of its candidates (one eBay item lookup each, once).';
}

module.exports = { ENABLED, OFF_REASON, MIN_DISCOUNT, MAX_DISCOUNT, MIN_TRUSTED, DEAL_BACK_MAX, BELOW_NM, basePrintingOf, notADeal, noGenuineBack,
  VOUCH, vouchFree, vouchPhotos, discountOf, hpAmbiguous, pickVouched,
                   pickDeal, backCandidates, rankDeals, describeRule };
