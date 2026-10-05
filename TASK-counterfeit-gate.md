# TASK — Counterfeit gold/black "foil" cards: keep them out of listings

## Problem
eBay is full of mass-produced novelty cards — **gold metal foil and black foil
versions of popular cards** (Shining Charizard 107/105, Magikarp & Wailord GX
167/181, etc.). The same gold/black template is reused across many different
cards, and sellers title them like the real thing ("1st Ed Holo Secret Rare",
"NM/M", "107/105"). They pass `cardmatch` (title text is right) and sit at
$70–85 beside a real card worth hundreds.

## What the evidence shows (6 photos from Roy, Magikarp & Wailord GX 167/181)
Gold front/back, black front/back, real front/back. A crude colour measurement on
the centre 60% of each image already separates them:

| photo | gold-hue fraction | near-black fraction |
|---|---|---|
| gold front | 0.57 | 0.02 |
| gold back | 0.89 | 0.01 |
| black front | 0.08 | 0.60 |
| black back | 0.00 | 0.48 |
| REAL front | 0.09 | 0.03 |
| REAL back | 0.17 | 0.01 |

(gold = HSV hue 30–65°, s>0.25, v>0.35; near-black = v<0.22.)
**n = 1 per class. This shows the signal exists; it does not validate a
threshold.** Do not copy these numbers into code — measure on real listings.

## Do NOT use "the back has POKÉMON twice" as a tell
Real card backs are symmetric — the real back (photo 6) also has the wordmark
upside-down at the bottom. An earlier note in the review chat called the
duplicated wordmark a fake indicator; that was wrong. The tell is the **foil
colour / material**, not the wordmark.

## Step 0 — find what already exists, report before writing
Roy says the **image identifier tool is working pretty well.** The review chat
has not seen its code (CLAUDE.md predates it). Before writing anything:
1. Find it (grep for image/vision/identify/hash/histogram in the repo) and
   report: module name, what it takes in, what it returns, where it is called.
2. **Extend it, don't build a second image pipeline** (duplicated definitions
   drift — see lessons). Reuse its image fetching and caching.
3. Check whether eBay image URLs (`i.ebayimg.com`) are reachable **from Render**,
   not just locally. If not, say so and stop on the image half.

## Design — compare to the reference, never to a fixed colour
Genuine gold and dark cards exist: Gold Star, SWSH/SV gold secret & hyper rares,
official Pokémon Center metal cards, black-bordered full arts (Darkrai, Umbreon
alt art). A rule of "gold = fake" would delete real, valuable cards.

So: the catalogue already has the authentic image for every `cardId`
(`card.images.small`). Compute the colour profile (gold fraction, near-black
fraction, dominant hue) for the **reference** and for the **listing photo**, and
flag only when the listing deviates strongly *from that card's own reference*.
A real Darkrai reference is already dark → a dark listing is fine. The real
Magikarp & Wailord reference is teal/yellow → an all-gold listing is not.

Layered signals, each reported separately in the rejection reason:
1. **Image vs reference** — as above. Centre-crop first (table/sleeve/mat
   backgrounds contaminate the edges). Check every photo the listing has;
   a gold/black *back* is as strong as a front.
2. **Title words** — `gold`, `metal`, `foil card`, `black`, `custom`, `novelty`,
   `replica`, `proxy`, `orica`, `fan made`. Protect genuine phrasings the way
   `GENUINE_ART_PHRASES` does: `Gold Star`, `Gold Rare`, `Hyper Rare`,
   `Golden`-set names, `Pokémon Center`/`official metal`. Measure both directions.
3. **Same photo across different cards** — hash listing images; the same
   gold/black template shows up under many cardIds. A hash seen under ≥3
   different cardIds is near-certain novelty. This is the cheapest strong
   signal and needs no colour thresholds.
4. **Price vs median** — already handled by `outlier.js`; use as a *corroborating*
   signal, not a standalone one.

## Policy (Roy to confirm — recommended default)
- **≥2 independent signals → reject at the gate**, counted in `rejected`, with the
  reason in `droppedSample` (same as a `cardmatch` rejection). This is "eliminate".
- **Exactly 1 signal → keep, `suspect: 'counterfeit-likely'`, sorted last, labelled**
  (same treatment as price outliers).
- Never silent: every drop appears in the source block's rejected count.

## Acceptance — test what it KEEPS, not only what it blocks
1. Fixtures: Roy's 6 Magikarp photos + the Shining Charizard listings
   ($72.49 ×2, C$85, $2,500 poor-condition real card). Expected: gold/black
   rejected or flagged; real kept — **including the $2,500 real Shining Charizard.**
2. A set of **genuine gold/dark cards must survive**: a Gold Star, an SWSH gold
   secret rare, a black-bordered full art, an official metal card. Show them kept.
3. Run `node linkaudit.js <card> --live --kept` on 5+ cards, including Charizard
   4/102 and Giratina V 186/196, and paste: kept/rejected before vs after, and
   every card that *flipped from kept to rejected* with its reason. A change that
   only shows blocked rows has not been tested.
4. **Reachability:** prove the check runs on `/api/listings/:cardId` **and**
   `/api/market` (the earlier bug was a correct gate that one path bypassed).
   A source block with no rejection count has not run the gate.
5. Performance: cache by image-URL hash; no image fetch on a cache hit; report
   added ms on a cold request. If it can't be fast, run it async and mark
   listings `imageChecked: false` rather than blocking the response.

## Out of scope
Authenticating real cards, grading, or judging card fronts of "Shining"-style
cards from a flat photo (their unusual colouring is part of the real design).
This task only removes the *gross, mass-produced gold/black novelty* class.

## Report back
Paste: Step 0 findings, the measured threshold data from real listings (not the
6-photo table above), the kept/rejected before-vs-after, and the list of any
genuine cards that were wrongly caught.
