# CardHunt — Progress Log

## 2026-10-04 (later) — T0 missing listings, T1 comparative matching, T2 the Mew rows, T3 the card back BUILT

**T0 — listings missing everywhere, four causes, all fixed** (CLAUDE.md, THE
GATES "What the query ASKS").
- linkaudit live: Typhlosion ecard1-28 PSA 1 = A (eBay returned nothing),
  PSA * 1 kept of 1 (the reverse holo — kept because no printing was
  chosen; not a printing-filter bug). Umbreon neo2-32 PSA * 5 kept of 7.
  PSA 1 is in the grade list; nothing truncated; rejection counts present;
  the grade aspect filter loses 0 (gradecost on four cards).
- eBay's own site showed the missing rows: "2002 POKEMON EXPEDITION #28
  TYPHLOSION-HOLO PSA 1" and nine "2001 POKEMON NEO DISCOVERY #32 UMBREON PSA
  n" — PSA's label, no set total. Fixes, each measured on Render
  (marketprobe `?shape=`): a slab asks the bare number (`1c52ce1`); label set
  names read by set id + accents folded (`e7ed1de`); Base Set / Team Rocket
  slabs ask `(Base,Game)` / `Rocket` (`7f1a559`).
- The five-card spot-check against eBay's own results (Blastoise PSA 8, Dark
  Charizard PSA 9, Holon Mew ex Raw, Giratina V alt PSA 10, Charizard ex 199
  PSA 9) found the other two causes: **0 auctions in 258 rows** (Browse
  returns Buy It Now unless asked) and "PSA 8 Card" refused as an 8-card lot
  (`59f5a8a`). Left open: a raw title with the pair and no set name.
- Before -> after, kept: Typhlosion PSA 1 0->1, PSA * 1->3; Umbreon PSA *
  5->14; Base Charizard PSA 9 15->~50; Dark Charizard PSA 9 14->20;
  Blastoise PSA 8 41->43; Charizard ex 199 PSA * 163->190.
- A gotcha: right after a deploy linkaudit printed "B: all 112 rejected" on
  Base Charizard PSA 9 — 46 rows were HIDDEN awaiting the stamp check. It now
  prints `p` for hidden.

**T2 — not a mapping gap.** The $180/$190 rows on Paldean Fates Mew ex 232
were 30th Celebration Mew ex 152/128 (stamp visible, 160 HP), titled
"232/091" — a different card. REPRINT_OF complete (55, all originals held);
no 30th or Celebrations main-set card reprints an older one (TCGdex
illustrator + attacks; Celebrations #5 Pikachu looked at — new art).

**T1 — comparative matching built** (`53024f6`). 457 photos labelled by eye
(30th Mew's own listings + bubble Mew's). Whole card, margin 0.30: 0/276
genuine refused, 162/178 30th refused; shipped port = measurement 456/457.
On Aquapolis Lugia vs its 30th CC reprint (same art) it adds nothing over
the stamp. Live: gate ran on 40 bubble Mew rows, 0 refused (the 30th rows had
left eBay); Roy's two photos refuse at 0.37/0.41.

**T3 — card back built** (`0cbd390`). Re-measured first: 98 fresh listings
(tooling ran out at 80; Roy raised it to 700 for the day, `bf81c0b`),
templates from Bulbapedia's archive scans. EN 52/52 genuine, 0/17 metal, 0/12
JA, 0/15 none; JA 11/12, 0/52 EN. Search results carry no extra photos (0 of
63), so it is 1 getItem a row, shared with Verify/Photos. Live on Shining
Charizard: 20 rows in ~75 s, 9 labelled, 11 no claim, 20/20 right by eye; the
calls counted under the opener's origin. Limit found by the test: a
recoloured print of the genuine back reads as genuine (structure, not colour).

Also: escapes mangled by python heredocs three times today (a 0x08 in
matchparity.test.js caught by the byte check; two patch runs stopped by the
anchor asserts). Use the editor for anything with a backslash.


## 2026-10-04 — T2 the card back: measured (CLAUDE.md "THE CARD BACK"), not built

210 listings, every photo via /api/photos (210 getItem, tooling; 767 photos,
CDN s-l500), labelled by eye (sheets in the session scratchpad, sc/bks*.jpg).
**Share of listings showing a back: 164 of 190 (86%)** — genuine Shining
Charizard 23/26, its metal replicas 50/64, right raw rows of the T4 cards
37/40, wrong T4 rows 17/20, PSA 10 Umbreon VMAX slabs 37/40 (through the
case). Not 20%: sellers post the back.
- **The "POKÉMON twice, inverted" tell is wrong.** The genuine back prints the
  wordmark upright at the top and inverted at the bottom, by design (every
  genuine back photo here). The replicas copy that layout; what differs is
  colour and material — gold, black or silver metal on all 50 replica backs.
- **One template does NOT cover the catalogue.** Modern Japanese cards
  (and Korean/Chinese prints) carry a different back (rainbow swirl with
  orbs); pre-2001 Japanese cards a "Pocket Monsters" back. European-language
  copies share the English back.
- **So the back answers the kind "never a photo's job":** English Mew ex
  151/165 rows that were the Japanese SV2a print — 14 of 15 sampled show the
  Asian back. It cannot separate D (a different genuine card: genuine back),
  nor a European-language copy.
- Also seen: a "PSA 10" Umbreon VMAX row (i150) with a silver metal back; an
  Umbreon VMAX row with a pink/green fake back.
- Matcher (scores read after the limit reset): the inside of the back, colour
  NCC, best photo per listing. English back ≥0.50: genuine 104/107, metal
  0/58, JA 0/17, no back 0/26. Japanese back ≥0.65: 13/17, 0 elsewhere. A
  metal-back template scores ~0.75 on everything — useless. Shining
  Charizard: genuine back found on 25/26 genuine, 0/63 replicas.
- Labels corrected where the score disagreed: i16, i23, i141 posted a
  genuine back in photos past the 12 the sheet showed; i149 is a Japanese
  card (Japanese back). L2's pre-2001 Japanese back is a third design.

## 2026-10-04 — T1 the $72 Shining Charizards: the gate ran, the median was the fakes'

`node linkaudit.js en-neo4-107 --live --kept` (Raw NM, eBay US; 1 call +
token, tooling) and the same view with `sites=all` (7 more).
1. **They reach the gate and pass it.** US: 87 kept of 163 scanned (76
   rejected — the source block carries the count; the gate ran). All sites:
   144 kept of 579 scanned, 292 rejected. The $72.49 row ("Black Pokemon
   Shining Charizard … 1st Ed") is US; the Canadian one was C$100 that run
   (landed $70.23, "Rare 1st Edition Gold Shining Charizard") — the C$85
   listing was not in it.
2. **`outliers.applied` true.** 3. n/a.
4. **Median $350.00 of 87 (US) / $420.97 of 144 (all sites) — set by the
   fakes.** Every photo labelled by eye (sheets in the session scratchpad):
   ~116 gold/black metal replicas, 24 genuine English, 2 genuine foreign
   (DE, IT), 2 unclear (a $29.58 printed copy, a 3-card photo). Cheapest
   genuine $944.21; median of the genuine ~$2,500. $72.49 / $420.97 = 0.17x,
   above the 0.10 line. Stored number-matched price $1,700.99
   (tcgdex_tcgplayer_unlimited-holofoil, 2026-10-02, current).
5. Rejection counts present: the documented tell did not fire.

**Fix — the free check** (`outlier.js`, `judgeListings`): judge against the
stored raw price when it is real, current (pricequality, no flag) and above
the feed median; raw grades only; reported as `outliers.basis`,
`basisPrice`, `reference{used, why}`, and the page's price-check line
names the yardstick. Same 10% ratio — not tuned. Measured on the 1,010
labelled rows (12 cards, T4): right 0/864 flagged either way; D 10 -> 15/24,
R 5 -> 8/38, P 0 -> 1, X 0 -> 1. At 15%: R 14/38, still 0 right; 25%: 4
right — left at 10%. Base Charizard's feed median was $309 vs $944.53
stored: the same poisoning. Local server against Supabase: Shining Charizard
and Base Charizard references read as current; ja-SV8a-002's Yuyu-tei
reference refused ("stored price is old"); PSA 10 refused ("graded view").
eBay rows not exercised locally (no keys here). Not done: the tooling copy
of the outlier test in the `/api/ebay/marketprobe` tooling route
(server.js ~4925) still uses the feed median only.

**Title words** (`cardmatch.js`). Read on the 144 Shining Charizard titles
by label: replicas say gold/oro/dorado (50 of 116), "Not Real", "Plastic
Art", "Fan Gold Foil", "Metal Gold/Foil/Dorado"; genuine copies none of it.
Added: those phrases as terms, and `goldBeforeGold` — "gold" on a set from
before 2004 (no card was gold before the first Gold Star), after the
printing reasons. Old vs new gate on all 1,154 labelled titles (1,010 + 144):
53 replicas + 1 unclear newly refused, 0 right, 0 newly kept. The one test
title it broke ("Charizard 4/102 Base Set Gold Holo Rare Englisch", kept in
printinggate as an English DE title): the same seller's live DE listing,
"…Gold Foil Englisch…" €65, photo via /api/photos (1 getItem + 2 for the DE
probe) — a gold metal replica. Test title changed, noted.
Shining Charizard after both free checks: 82 of 116 replicas refused or
flagged, 0 of 26 genuine. Left: 34 replicas at $200-$22,000 whose titles say
nothing a genuine title does not. **Measured, not built:** judging a row
that states "1st Edition" against the stored 1st Edition price ($8,250):
+5 replicas on this card, 0 of 8 genuine claims; only 2 of the 13 labelled
cards hold an edition price and Neo Lugia's (~4925) still uses the feed median only.
64.80) is below its
Unlimited one — one card's sample.

## 2026-10-03 (night) — T1 artwork template measured (not built); T2 stamp verdicts kept, unchecked rows hidden

**T1** (CLAUDE.md "THE STAMP MATCHER ON THE ARTWORK"). The shipping
`stampcheck.nccMax` with a template cut from our scan — illustration,
artwork-only and core regions, 24/32 px — on 1,141 labelled photos, plus
colour at the located artwork. At 0/864 right flagged: illustration 0/24
different illustrations, artwork-only 0/24 (5/24 dropping one binder
shot), core 5/24; colour 0/24 and 0/72 of Roy's gold Shining Charizards.
The lowest right rows are genuine (glare, tilt, slab, crop), looked at.
Not built; stopped as TASK said. No eBay calls (photos already held).

**T2** (`2126277`). Verdicts in `listing_photo_verdicts` (hashed item id
and photo URL, card id, verdict, matcher version); one bounded read per
view before the gate; unchecked rows hidden and counted; the page says
"N listings shown, P still being checked". stampcheck.test.js 86 -> 107,
13 fail on the old code. Store round-trip run against Supabase locally
(dummy row, deleted). Render, Aquapolis Lugia, first open after the
deploy: 0 eBay rows shown, 79 hidden; shown count rose 0/10/13/14 as
verdicts landed, 65 refused, ~50 s; 79 rows written. **Restart check**
(the docs push redeployed; opened the moment the new process answered):
78 verdicts read from the table, 64 refused at once, 14 shown, 2 hidden
(listings new since the first pass) — no stamped reprint shown; 4.1 s
cold, 299 ms re-open; the 2 cleared within ~20 s, both reprints, refused.
eBay spent: ~6 calls (2 opens, each Lugia + 30th reprint + token).

## 2026-10-03 — T3 Japanese layout by template (measured, not built); T1 SIFT probe (blocked)

**T3** (CLAUDE.md "CAN THE STAMP MATCHER TELL A JAPANESE COPY?"). Rule box
+ name plate cut from JA and EN scans of four cards held in both languages;
`stampcheck.nccMax` on 374 labelled photos. rule d > 0.20 OR name d > 0.10:
80/108 Japanese, 0/249 English, at 90 px templates and 10.5 s a photo; at
60 px 31/108. Of 34 Japanese copies in the 1,010 rows the title gate
already refuses 31; of the 3 it misses, this catches 1. Not built.
Scripts: session scratchpad `measure.js`, `an3.js`, `an60.js`.

**T1** (CLAUDE.md "SIFT ON RENDER"). No prebuilt opencv.js has SIFT
(docs 4.5.5/4.9.0, techstark 4.12/5.0). Stopped; T2 (the filter) not
started — it depends on T1. Decision needed: custom WASM build, native
OpenCV on Render, or a re-measurement with a shipped detector.

## 2026-10-02 (night, 3) — T3 carried items; T4 sold-price options

**T3.**
- Lugia (en-neo1-9) 1st Edition: held, $164.80 `tcgdex_tcgplayer_1st-edition-holofoil`
  from the 09-29 harvest, kept out of the headline (Unlimited $531.39). The
  3 October nightly has not run (today is 10-02): its write is unconfirmed.
  Older `tcgplayer_market` rows alternate 826.60 / 164.80 — the two editions
  under one label before the T3 edition fix.
- Aquapolis a/b pairs: recorded as settled. McDonald's 78: decided, blank.
- EX-era ghost `normal` headlines: NOT corrected by the nightly (93 found, all
  written before af2f2c0; due-tier timing). Harvested 8 sets by hand (863
  rows, 0 eBay) → 7 left, 5 of them with an empty printings list the rule
  does not judge (my first count wrongly included them); real remainder 2
  (Rayquaza ☆ July import, hgss2-26). Last nightly (10-02 03:00) exit 2 —
  setyield naming empty sets, as before.

**T4** (CLAUDE.md "Sold data"). eBay Marketplace Insights: docs now behind
sign-in ("marketplace-insights-private"); third-party: 90 days, Limited
Release, not open to new users. PSA: API is cert lookup only (PSA's own
docs); APR is web-only; submission T&C make PSA exclusive owner of grading
data; site "compiled form" terms not found from PSA's links. PriceCharting:
Cloudflare challenge to curl and browser; secondary: Legendary ~$49/mo,
public use needs written permission, API = current values not sales.

## 2026-10-02 (night, 2) — T1 which prices are not current, and saying so

**Measured** (read-only, every visible card, the readers' headline rule):
EN 21,076 / 21,152 current and measured; 7 none, 10 estimates, 40 old,
19 alternating. JA 2,274 / 14,023: 278 none (six sets), 2,177 estimates
(vintage), 9,294 old — 9,058 are Yuyu-tei rows from the single 08-28 run.
Over $100: 130 of 1,148 not current (113 JA, 10 EN old, 7 EN alternating).
Internal-search listing counts: none stored yet (0b0ddfb post-dates the
last run). Script: session scratchpad `t1.js`.

**Shown.** `pricequality.js` classifies a headline (estimate / old / thin
/ unsettled) in one batched query; `/api/sets/:id/cards`,
`/api/cards/:id` and `/api/trending` carry it; the page's
`priceMarksHtml` draws it on set tiles, both trending grids, alert and
latest-search tiles, and the card page (spelled out). Four inline `est`
markers folded into it. Browser, local: Team Rocket Returns shows exactly
Mudkip ☆ old, Torchic ☆ / Treecko ☆ unsettled of 111; Torchic's card page
"unsettled: … between $1200.00 and $4500.00". +~220 ms on an uncached
207-card set.

**Found on the way:** the Search screen's trending tiles (`cardTile`)
still drew a % change, PSA 9/10 badge and deal flag from a hash of the
card id. Removed; nofabricated.test.js pins it. The page's fallback
estimator (`mockP`-style, ~line 1835) still jitters an estimate by a seed
of the id — labelled est, left for a decision.

## 2026-10-02 (night) — T2 wrong listings split by kind; T2b Base Set 2

**T2 — measured, not built** (CLAUDE.md "SPLIT BY KIND"). The 1,010
labelled rows' 89 wrong split by eye: 24 different illustration, 22 (later
38) right line-art in metal/recolour, 42 (later 43) other language, 2
magnets, 3 lots/backs. Colour histogram and pHash (pure JS, jpeg-js,
77 ms/photo with decode) do not separate anything: two different cards'
scans already score 0.7-0.9 against each other. SIFT re-run in a scratchpad
venv (OpenCV 5.0) reproduced the stored inliers 1,010/1,010; added an
illustration-only variant (scan keypoints in y 0.10-0.52) because every
whole-card SIFT miss on a different illustration was the same Pokémon with
the same card text.
- Art-only SIFT flagged "right" rows that were not: re-labelled 27 (16
  Pikachu VMAX — 14 metal replicas, a German, an Ivysaur — plus gold
  Umbreon/Lugia, a silver regular Umbreon, an EX Lugia, a dark JA Charizard
  ex, 6 Base Set 2). The rainbow-foil cluster was mostly replicas.
- Final: 864 right / 62 D+R / 43 L. Whole<25 AND art<8: 0/864, 34/62.
  Whole<47: 15/864, 48/62. Art<8: 8/864, 48/62 (D 23/24).
- Roy's cards, held out (2 eBay calls via Render, tooling origin):
  Shining Charizard 72 of 87 rows gold/black metal; bubble Mew's $190
  cheapest is the 30th Mew. Strict rule: 0/52 right, 30th Mew caught, 2/72
  gold. Colour <0.5: 43/72 gold, 0/10 genuine, 2/42 right Mews.
- Decision: D (different illustration) is a filter candidate; R needs a
  card-relative rule not yet measured; L stays with the title gates.

**T2b.** Base Set 2 / Legendary Collection print a set symbol where Base
Set prints none. SIFT-aligned crops of 374 Base Set photos: 6 BS2 copies
titled Base Set (3 Blastoise, 3 Pikachu), 0 LC. ~20 px at s-l500 — needs
alignment; not built.

## 2026-10-02 (evening) — T1 Render timing; T2 EX-era prices; T3 e-Card/McDonald's; T4 flag-not-hide on 12 cards

**T1 — the stamp gate on Render, measured.** Cold after a deploy restart,
1 worker: Venusaur 137 photos 166 s, Mew VMAX 177 photos 219 s (~1.2-1.3 s
a photo); top five rows resolved by ~12 s on both; re-open 98-125 ms.
Lugia (26 left of 85) 21.6 s. ~16 eBay calls spent opening cards.

**T2 — EX-era prices, diagnosed then fixed.** The three Gold Stars:
Rayquaza ☆ $2,500.99 `tcgplayer_normal` and Mudkip ☆ $3,999.99
`tcgplayer_holofoil_mid` are 2026-07-27 pokemontcg.io rows nothing has
replaced (TCGplayer has no market for either now; the internal search
refuses); Torchic ☆ $4,500 is TCGplayer's "market" on 0 listings,
alternating with an untraceable $1,200. TCGdex has no TCGplayer price for
any of the three; its Cardmarket price for Rayquaza ☆ ($16) is another
card. Gold Star rarity is "Rare" at the source. Widened to 2,745 EX-era
cards: 88 of 2,418 disagree >1.4x; 53 a ghost `normal` block on holo-only
cards (fixed `af2f2c0`, 92 catalogue-wide), 32 genuine two-printing
POP/promo cards, 3 same-day moves. `0b0ddfb`: internal-search rows record
their product. `8fdfcef`: the page shows a headline's age (12 cards of
$20+ are >30 days old).

**T3 — e-Card and McDonald's.** linkaudit --live: Skyridge H09 A ("H09"
misses "H9/H32"), McDonald's 2023 A ("1/15", "Collection"), McDonald's 2014
1 scanned; Aquapolis H01/50a and Skyridge 146 fine. `cc20e41` asks as
sellers write. Art: 18 H01-H09 + 5 sm3.5/sm7.5 from pokemontcg.io (ccfill,
exact-number match — the old fold gave 50a and 50b one image). McDonald's
2014/15/17/18/23/24: no host serves the art; not filled.

**T4 — flag-not-hide, 12 cards, 1,010 rows labelled by eye.** SIFT at 47:
35/89 wrong warned, 33/896 right warned (18 on rainbow Pikachu VMAX). Base
Charizard's cheapest is not made right at any threshold. Text: 19 of 56
wrong titles (outside Mew ex) carried a word; `5e14670` refuses 43 wrong
rows, 0 right. Cheapest-right 5/12 as shipped -> 8/12 with the text gate
and stamp. Photos kept in the scratchpad only.

**Not done:** Lugia's 1st Edition from the 3 October nightly — that run has
not happened yet (today is 2 October).

## 2026-10-02 (later) — T1 the stamp check is a gate; T2 the general photo check measured

**T1 — automatic.** `stampcheck.gate` in `judgeListings`, after the text
gates, before the outlier check. Found refuses (counted in sources.ebay and
`stampGate`), not-visible / unreadable keep. Verdicts by eBay item id, 7
days in memory; one worker pool (STAMP_WORKERS=1); checks run after the
response, the view is re-judged as they land (noFetch), the page re-reads
with `?poll=1` (now cache-only). "Check photo" button removed; `/api/stamp`
goes through the same `checkItem`.
- Render, measured BEFORE (old endpoint, 12 presses on Lugia): 4.2-5.9 s a
  photo; 8 concurrent all hit the 20 s timeout and the timeout was cached as
  "unreadable" — that was a bug, fixed.
- Matcher: lo 28 / 10 steps / largest first / stop at 0.70. 689 vs 2,179 ms
  a photo (same load), same totals on 906 photos, card back no longer flags.
- Local, costmeter, Lugia's 82 real photos: open 954 ms (82 pending), all
  checked at 41.7 s, 68 refused / 14 kept; cached re-open 342 ms, view cache
  78 ms. eBay: 2 searches + 1 token; stamp 0 (82 CDN fetches). Browser: rows
  fall away top-first, note says how many refused / still checking, polling
  stops; no console errors.
- **The 906-photo re-run (owed since it died at 800): done.** 879/906 agree
  with OpenCV; labelled 0/16 originals flagged, 68/69 reprints; card back
  o81 falsely "found" at the shipped settings (0.709), not at the new ones.
  The 22 flags in Base Charizard / Rayquaza-EX listings: all stamped, by eye.
- **Not yet on Render.** Render is ~4x slower per photo: a cold Lugia will
  take ~3 minutes to clear there. Measure after deploying.

**T2 — measured, not built** (CLAUDE.md "IS THIS PHOTO THIS CARD AT ALL?").
pHash 4/24, art-box 8/24, set-symbol 8/24 at zero false flags; SIFT inliers
21/24 at zero of 100 correct, ~0.2% (2/881) over every right-card photo,
but blind to same-art-other-set (1/40) and to printed counterfeits. Not
clean enough on this sample to hide listings automatically.
- Found on the way: Base Charizard Raw page 1 showed 20 wrong cards
  unflagged among 84 (gold metal replicas, modern Charizards, JP, FR, a lot);
  the headline cheapest $35.99 was a metal replica.

## 2026-10-02 — TASK T1 stamp detection; T2 the run's loose ends

**T1 — the reprint stamp, measured then built** (CLAUDE.md "REPRINT vs ORIGINAL").
- 14 eBay calls spent opening 7 cards (Aquapolis/30th Lugia, Base Set
  Pikachu/Charizard, Rayquaza-EX and their reprints); ~900 photos fetched
  from eBay's CDN (not the API) into the scratchpad, looked at, not kept.
- Labelled by eye (Claude, not Roy): of 86 Aquapolis rows, 69 reprints, 16
  originals, 1 card back. 18 reprints sat OUTSIDE the reprint price band,
  unflagged, $280-$2,100, the cheapest row among them. Rayquaza: 18 stamped
  reprints in 162 rows at the original's own price.
- s-l500 is the size. Template matching (OpenCV): one template fails across
  cards; a per-card template cut from OUR scan of the reprint works — at
  0.70, 345/373 reprint photos (92.5%), 0/16 labelled originals, 22/22 flags
  in originals' listings were reprints. Celebrations CC002 59/79, ~10 of the
  misses metal Charizards.
- Built: stampcheck.js + stamps.json (54 templates by stampbuild.js; 30th-c-020
  has no stamp on its scan) + /api/stamp + "Check photo for reprint stamp" on
  eBay rows of the 55 originals. 0 eBay calls, measured under costmeter (6
  presses). Verified in the browser on the metered local server: found on a
  reprint, "no stamp visible — not proof" on an original, no button on sv10-1.
- Found by the cross-check: the first JS port removed one mean across all
  channels and flagged all four original scans; fixed to OpenCV's per-channel
  form, and stampcheck.test.js fires on the old one. BREAK/LEGEND print
  sideways — the scan is turned to find the stamp. Cross-check JS vs OpenCV: 10 labelled photos side by side (scores within ~0.03, same verdicts), 6 through the real endpoint, 8 catalogue scans both ways. The FULL ~900-photo run was stopped by Claude Code for low memory and NOT re-run — still owed.
- Correction asked for: the "image matching cannot work" note is not in
  CLAUDE.md or its history; the corrected reasoning is recorded anyway.

**T2 — loose ends.**
- `0023b8b` refresh "due" reads the headline row: a second reading reset
  the clock of a card that got no price (mep 7/7). EN due 1,147 -> 1,188.
- `6b493f5` setyield.js: a set (3+ asked, nothing) or 200+ cards in a row
  with nothing is named, exit 2, refresh-empty-sets.log; Yahoo's answers
  counted. Fired on mep with its alias removed; silent when restored.
- `1465f6a` 1st Edition prices written again (they were dropped on the way
  out of tcgdexPriceFor). neo3: 7 rows. **Pikachu Star ex13-104 replaced**:
  $900 -> $1,899.99. **Lugia neo1-9 1st Edition NOT yet**: the refresh never
  wrote editions before this; Lugia is next due ~2026-10-02 22:00 UTC, so the
  3 Oct 03:00 nightly writes it. Check then.
- `f31734e` dpp and basep: the new report named both on its first run
  (alias added and still nothing). Cause: our set name in the query ranks
  the card out of TCGplayer's results. Asked again in TCGplayer's name on a
  miss: dpp 45/48, basep 49/51, each at TCGplayer's price for that number.
- The 222: 224 visible EN cards with no headline in 7 days (33 never). 88 were
  dpp+basep (now priced); the rest are promos (svp 7, np 5, xyp 4), trainer
  kits (~25), McDonald's (~17), lettered numbers (RC, 'a'). Mostly Commons.
- JA, 1 Oct: 110 priced of the first 1,200, then nothing for 1,500 in a row
  (time budget hit at 2,719). Yahoo answers from home now; most likely
  throttling mid-run. The streak report and the Yahoo counter now show it.
  Found with the counter: Yahoo's LIVE search page has no __NEXT_DATA__ —
  the live fallback returns nothing. Not rebuilt.
- Source probe drift (home): PriceCharting 403 now, Cardrush 200 now.
- Not done: Tyrantrum mep-066 -68% is the known stale hold, not chased.

## 2026-10-01 (evening) — after manifest: sources, cleanup, art, epid, images

- **Manifest's 125 not found:** 120 = the four duplicate `.5tg` sets
  (deleted, `55b62fb`); 4 transient; 1 encoding bug (Unown `exu-?`), fixed.
- **TCGplayer internal search kept as the labelled last resort** (`427ce50`,
  decided with Roy): it is the only TCGplayer price for 2,025 visible English
  cards and TCGplayer has no legitimate route. TCGdex first everywhere; rows
  carry `source_meta.via`; TCGdex Cardmarket stored as a second reading,
  never the headline (verified on Render: 38 cards whose newest row is a
  second reading still headline their TCGplayer price). Six set aliases
  probed and added — the 9/29 set check had stopped those sets refreshing.
  Re-check TCGdex coverage ~2027-01.
- **pricecheck per edition:** neo1 10/12 MISMATCH -> 1/24. Across 13 sets
  after safeprices: 148 comparisons, 2 MISMATCH (both stale holds TCGdex now
  prices: neo1-9 1st Edition $164.80 vs $1,134.85; ex13-104 $900 vs
  $1,899.99), 29 "not checkable" (TCGdex has no TCGplayer price).
- **safeprices en --all:** 672 priced (667 fallback, labelled; 5 TCGdex),
  222 no data, 0 TCGdex-unreachable skips; 409 second readings. New
  fallback prices vs each card's prior: median 1.00, 452/476 within 25%.
- **Yahoo mirror rows:** rerun gave 23 cards / 26 rows (not 48), deleted
  with backup; headlines fall to Yuyu-tei (Caterpie $9.55 -> $0.19).
- **Art:** ccfill pass 2 — 508 cards, 25 logos, `set_logo_source` migration.
- **epid:** different ids per print, but seller-chosen; ~12% of 30th CC
  listings carry the Aquapolis epid. Signal, not gate. Not built.
- **Images:** JA thumbnails -> `_SM` (8,359; 330 KB -> 58 KB); card page
  paints the thumbnail, swaps the full art in (local: 178ms / 1.95s). ZH: no
  smaller file exists.

## 2026-10-01 (late) — no auto-expansion; CLAUDE.md split

- **Opening a card is one eBay call** (`f14b50e`). AUTO_EXPAND_BELOW, the
  listingsFor branch, `open+auto`, `autoExpanded` and `?auto=0` deleted, not
  zeroed. Live on `en-ex15-95` (0 in the US): 1 call, was 8. The empty panel
  says only eBay US was asked, names the 7 not asked, carries the button;
  pressed, it found the one listing (AU, $574). noautoexpand.test.js 19
  (10 fail on the old files).
- **CLAUDE.md split.** Full copy -> `CLAUDE_ARCHIVE.md` (body byte-identical
  to 0f9f24a, frozen note on top). CLAUDE.md 2,883 -> ~1,290 lines: current
  state, open work, commands kept; 122 lesson/history sections rewritten as
  rules in LESSONS, each citing its archive heading. Restored from the .bak
  files: Sources are not interchangeable, Silent failures, "Nothing happened"
  is not proof, probe API shapes, verify the tool, Yahoo category filter.
  Stale and corrected: T3 "alerts still simulated" (the page calls
  /api/alerts 8 times; triggers record the listing); "one row violates the id
  convention" (zero). The 0x08 one-liner moved into COMMANDS. Rules 9-11
  added. `claudesplit.test.js` fails if an archive heading is neither kept
  nor cited (watched fail on a removed citation).

## 2026-10-01 (night) — TASK T1-T4: images, promos, subsets, eBay Set/Year

- **T1** (`6911f2a`): the biggest cost is TCGdex's asset throughput (~2
  images/s), multiplied by native lazy loading asking 3x more than is on
  screen. Tiles now load within 200px of the viewport. Local, xy6 uncached:
  17 requests, last 7.3s (was 36 requests, p50 11.9s / last 26.2s for 36).
- **T2** (`c62f7db`, `a6e13bc`, `0889df2`): promos asked "SWSH202/307" —
  ebayTotal 0. PROMO_SETS; live swshp/svp/smp all ok; McDonald's refused.
  `droppedSample` restored on /api/listings views (linkaudit had no reasons).
- **T3** (`350f24c`): no-logo sets = TCGdex has neither logo nor art for 49
  sets; the pokemontcg fallback covers 3. Links were a separate cause:
  TG16/TG30 refused. Four duplicate `.5tg` sets found, not deleted.
- **T4** (`477505a`): Set/Year are free refinement aspects; Set ~97-100%
  filled but seller-vocabulary, Year 34-48% on Lugia. Report only — not built.
- ~70 tooling calls spent on linkaudit/marketprobe/setprobe.
- T5 waits for manifest (still running at 03:43). T6: the 48 rows are not
  identified in any file — asked rather than guessed.

## 2026-10-01 (later) — pushed; token race fixed; tool defaults; Pocket out of manifest

- **Pushed** `5d1e6d4..5cffb73`: the quota protections and the call-cost chart.
- **Token race fixed** (`bf49963`): one exchange in flight, shared. Re-measured
  under costmeter at 600ms: cold Search-all 8 -> 1 exchange, 5 concurrent cold
  opens 5 -> 1. A guard refusal about the initiator's origin is not shared
  across origins. Found on the way: an explicit `origin` never reached the
  exchange. ebaytoken.test 49 -> 62 (6 fail with sharing removed).
- **sitecheck** (`8c5f7db`): 3 cards, 2 Load-more presses. 128 -> 41 light,
  89 busy; the old default had no ceiling on a busy card. `--wide` keeps the
  10. gradeprices default `--limit` 20 -> 5 (local, gitignored).
- **manifest skips TCG Pocket** (`35b8ad9`, ingest 5.9.1): the server's own
  series predicate. Read-only check: EN skips 15 sets / 2,480 cards, keeps 205
  / 21,272. Not run end to end — a `manifest en` was already running.
- CLAUDE.md: reprint cost on the open-a-card row; `--max` per language in the
  refresh section (up to 16,000 a night).

## 2026-10-01 — the call-cost chart, measured

CLAUDE.md now carries CALL COST: every user action, recurring job and tool
with its eBay cost, each EXERCISED under `costmeter.js` (new, tracked): eBay
stubbed and never sent, calls counted by origin, DB writes swallowed so no
production row moved. Page actions driven in the browser against the metered
server; scripts against a second one.

- **Recurring: nothing touches eBay.** Nightly refresh (credentials set, 60
  cards per language): 0. Alert evaluation: 0 network requests at all — it
  reads price_history. Server idle 6 min: 0 outbound. Page timers (alerts,
  quota, alert tiles): 0.
- **/api/search**: 1 per query that resolves to a card (+ reprints); 0 for an
  ambiguous name, nonsense, or `listings=0`. **Trending**: 0.
- **Hidden per-view costs**: the reprint check (+1 per known reprint —
  Charizard 4/102 costs 3 to open) and auto-expand (8).
- **The 393 token exchanges, explained**: no single-flight; 5 concurrent cold
  opens = 5 exchanges, a cold Search-all = 8. Only visible with a realistic
  600ms stub delay. Not fixed.
- `refresh all --max=N` caps per LANGUAGE (4 x N).
- Whole test suite: 0; with both `--live` variants: 1.

## 2026-09-30 (night) — three protections so the quota cannot be spent unnoticed

State at the start: 4,900 of 5,000 used (4,507 searches + **393 token
exchanges**), user requests refused at the reserve until 00:00 UTC.
`listing_views` by hour: the runaway hours were 723 and 713 calls; the
heaviest hour after the on-demand fix, 195.

**T1 — hourly ceiling** (`eaf6cea`). `HOURLY_LIMIT = 600` per UTC clock
hour, every origin, table `ebay_quota_hour`. Refusal: `limitHit: 'hourly'`,
"Lifts in N min", `liftsAt`. Tripped in ebayquota.test (10 assertions fail
with the check removed) and through the real fetchEbay.

**T2 — tooling allowance** (`eaf6cea`, wiring `45045d8`). Every call is
user/background/tooling; per-origin columns on `ebay_quota`. Tooling capped
at 300/day and refused past it (4 fail with the check removed); a user call
at the same moment goes through. Four concurrent tooling calls at 299: one
sent. Request-scoped origin in server.js: `/api/ebay/*` and
`X-CardHunt-Origin: tooling`. sitecheck/linkaudit/gradeprices send it and
stop on refusal; ebayprobe's raw-fetch token exchange now goes through
ebaycall. Verified on a local server against the real DB: /api/listings
answered `status quota, limitHit daily, liftsAt 2026-10-01T00:00Z,
retryable`; the probe route and the header both logged `[tooling]`.

**T3 — on the page** (`1de91ba`). Indicator bottom right, hidden under 50%,
visible from 50%, amber from 70%, red when stopped; click for today / hour /
app / background / tooling / before-tracking. Card panel: "eBay listings
are paused. Today's eBay allowance is used up. eBay listings return at 03:00
(in 7h 25m)" instead of "No listing matched". Browser-verified against the
real DB (stopped) and with injected 49/52/74% states. quotaui.test.js 24
(23 fail against the previous page).

Also: printinggate.test read CRLF server.js wrongly on this checkout
(`6b5e224`), 116/116 now.

**Not deployed** — commits are local until pushed. **Open:** 393 token
exchanges in one day; suspected concurrent exchanges with no single-flight.

## 2026-09-30 (evening) — the queue, on demand, editions re-harvested

**T1 — the queue** (`ea31877`). Live cause: 75,038ms queued, `calls: 0`,
quota fine — T1's every-site crawl held a one-slot queue. ebaycall now has
five slots, background capped at two, foreground first, 200ms pacing per
marketplace, a 4s foreground cap answered `busy` (never sent later), and the
quota check counts calls allowed but not recorded. Live: two cards at once
during a background job, 2.1-2.6s, one call each.

**T2 — on demand** (`f28274e`, tiles `c779b47`, threshold `f542953`). Open = eBay US page
1, one call; "Search 7 more marketplaces" (+7) and "Load more listings"
(+1 per site with more) on request; progress names every site not searched
and every result not examined. Background continuation and poller deleted.
- **Found live after deploy:** a home-page load opened 14 cards through the
  tiles' "avg listing" — ~45 calls, some sites answered busy. Tiles now read
  the cache only (`?cachedOnly=1`, 0 calls).
- **Threshold measured:** 20 random priced EN cards, US p1 vs all sites. <10
  expands 7/20 (~3.5 calls/open), <5 expands 5/20 (~2.75). Set to 5.
  ex15-95: 0 US, 13 AU.
- **Calls per view after:** plain opens 1 (11 of 11); open+auto 8; Search
  all 7; Load more 6. Browser-verified on sv03.5-199: 128 -> 301 -> 372.
- `listing_views`: +`action`, +`origin`. Marked (not deleted): 34 local test
  views, 538 T1-era views (`t1-every-site`), 40 measurement views.
- Quota: ~160 calls spent on the threshold measurement; 309 left at 12:00 UTC.

**T3 — editions.** The morning harvest (old key order) filed every 1st
Edition row correctly — 821 rows, 0 leaked into base — but wrote almost no
Unlimited rows for WOTC holos (7 unlimited-holofoil vs 157 1st-edition), so
11 of the 28 cards swinging ≥2x still showed a 1st Edition headline.
Re-harvested the ten edition sets with the fixed order (835 rows): **all 28
now take their headline from TCGdex Unlimited** (Lugia neo1-9 $531.39;
1st Edition $164.80 held separately). `pricecheck en neo1` then flagged 10
of 12 as MISMATCH — and its "live TCGPlayer" figure equals TCGdex's 1st
Edition price to the cent on 10 of 12 (Lugia $826.60 and Feraligatr #5
match neither). The tool asks the internal API the edition-blind question
path P asks; our stored price is the Unlimited one. TCGdex-first in
`safePriceFor` is now live (`loadProductConflicts` ready, 21 shared
TCGplayer products), so the nightly refresh writes Unlimited; the internal
API remains the fallback, still edition-blind. **Open:** give `pricecheck`
the edition (compare Unlimited to Unlimited), and stop the internal API.
- `manifest en` **stopped at the 2h tool limit after 62 of 220 sets** (last
  complete: swsh9.5tg; swsh9 cut off). Diffed against a before-snapshot: 45
  rarities corrected (swsh10tg/swsh11tg Trainer Gallery "Rare Holo" -> TCGdex
  "Rare"/"Ultra Rare", printed holo — checked on TCGdex), **0 to Common**;
  7,974 cards gained printings (880 -> 8,854). swsh9.5tg-swsh12.5tg: 30/30
  "not found" each — nothing written. The rest needs a run outside the tool
  limit.
- Known, not built: "Nachtara … Umbreon" (needs eBay's Language aspect, one
  getItem per listing); CMG (slab only with a grade number). Both in CLAUDE.md.

## 2026-09-30 (later) — T0 Lugia; every eBay site, every page; editions

**T0 — Aquapolis Lugia.** `linkaudit en-ecard2-149 --live --kept` and every
grade: the FETCHED rows were clean (the gate refused 10 of 132 Raw NM and 10
of 192 Graded as 30th Celebration; the page's 36 rows carried none). The
eBay DEEP LINK had no reprint exclusion, so clicking out showed exactly
those — all 20 refused titles say "30th". `11928c9`: links on a card a
family reprinted spend `-30th` / `-celebrations -25th -"classic collection"`.
Cause 1 (a deep link), not the gate. Not asked of Roy which he saw — both
remaining causes were answered by measurement.

**T1 — completeness.** Found first: `/api/listings` returned 25 rows while
`count` said 58, and `/api/search` cached its own 25-row copy under the same
key. Now one `listingsFor`, every row, page 1 of each site then every page
in the background, `progress` on the response, the page polling.
- Sites, in order, each verified live both ways with `sitecheck.js`:
  US+GB+AU+CA (English titles; GB +42%, AU +15%, CA +6% over US; 0 language
  suspects), then **DE** (after the language gate learned German/French/
  Italian/Spanish words, the junk/slab/reprint vocabulary was taught on 12
  cards, checked on 12 held out and 12 fresh through the production gate,
  and aspect names were localized — the English condition filter was being
  IGNORED there), **FR**, **IT**, **ES**. Reading DE's live rows found bare
  "DE" as a German-card marker; ES's found "Olanda", "italianos", "CMG 8".
- Two structural fixes found live: a translated title's refusal was
  removing English copies (8/8 wrong; now only US/GB/AU/CA refusals cross
  sites), and IT's "+26%" was attribution (total rows 2,942 -> 2,938) —
  the earlier site's copy now wins the row.
- Before -> after, US 3-page cap (25 shown) -> every site, every page:
  base1-4 Raw NM 25 shown (64 counted) -> 844 rows (478 NM-labelled; ES
  adds all conditions, grouped on the page); ecard2-149 25/58 -> 83;
  sm9-33 25/159 -> 328; sv10-1 25/165 -> 1,206; sv03.5-199 25/149 -> 371;
  sv03.5-199 PSA 10 25/66 -> 94. Every view complete.
- **Calls per view**: 8 minimum with eight sites (page 1 each), mean 7.6 over
  192 uncached production views today (mostly before IT/ES), max 32 on
  sv10-1 Raw NM (1,206 rows). ~550-650 uncached views/day fit in 5,000;
  cache hits cost 0. eBay's own 10,000-result ceiling was never reached.
  Views ending incomplete: 0 for eBay; 12 JA views for Yahoo's 403 (as
  always); 34 were my local server (no keys) — it shares `listing_views`.
- A higher eBay tier: worth applying for if views exceed ~500/day; the
  Browse getItems (bulk) API stays refused ("1100: Access denied").
- Not built: eBay's structured Language/Sprache aspect as a refusal source
  ("Nachtara Vmax … Drachenwandel Umbreon Vmax" names the card in German AND
  English — words cannot settle it; one extra call per site could).

**T3 — editions.** A dimension beside printing, on gradeprice's ten sets
only. One reader (`cardmatch.editionClaim`, five languages; old reader
missed 1,090 of 5,000). Gate refuses only a STATED other edition. 1st
Edition rows kept out of every headline: exactly the 10 cards whose
headline was one changed. Verified in a browser: Lugia 1st Edition
$1,299.96 vs base; Base Set 3 editions; Expedition printings only; sv10
none. Found: TCGdex's WOTC keys are `1st-edition-holofoil` /
`unlimited-holofoil` and BASE_PRINTINGS took the 1st Edition one — fixed;
the harvest running now loaded the old order, and its rows are classified
by `source_meta.printing`. **Not fixed**: `tcgplayer_market` flips between
editions on 27 of 924 edition-set cards (Lugia 164.80-1,299.96).

**T2 — not run.** `tcgdexharvest.js en` (started 05:41 by someone else) was
at 11,500 / 23,752 at the end of this session; `manifest en` waits for it,
then `manifest ja`. Nothing here needs to change before they run.

## 2026-09-30 — pushed; JA both-source check; eBay marketplaces measured; readers aligned

**T0.** 6 commits pushed; `/app` byte-identical to local (359,993 bytes,
`BUILD 20260929-28ea4be-typicalprinting`); `Porygon 103a/147` resolves live.
`cac7384` `jpcheck ja --both` (read-only). 191 JA cards hold both a base
Yahoo and a Yuyu-tei price; 148 differ >5x (143 Yahoo higher), 54 >20x;
every Yahoo row predates the printing split. Re-derived from both sources:
- **MIRROR 48** — no base Yahoo sale now, only a mirror; **42 of 48 store
  exactly today's mirror median** (39 Master Ball, 3 Poké Ball), all SV2a /
  SV8a. The T4 contamination, card by card. None is a headline (Yuyu-tei
  newer) but each is a "Yahoo" series on /api/history.
- **GONE 53** — no Yahoo comparable now; stored value unsupported. 3 are
  headlines, 2 clearly wrong: ja-SM1M-63 ブラッキーGX shows $30.57 vs
  Yuyu-tei $444.59, ja-XY4-92 $5.73 vs $38.09 (SR vs RR shape).
- **HOLDS 44** — Yahoo reproduces; mostly ¥300-600 Yahoo commons vs
  ¥30-120 Yuyu-tei ticks (28 at <=¥80) — two floors, not a wrong card. 12
  are headlines.
- MOVED 3, and 4 where Yahoo sits BELOW Yuyu-tei (EX/GX; ask vs auction).
**Not repaired** — deletion is Roy's call. Proposed: back up + delete the
Yahoo base rows of the 48 MIRROR cards; re-price the 3 GONE headlines.

**T1 — eBay marketplaces, measured** (`/api/ebay/marketprobe`, read-only,
real sourceEbay per site; 10 cards + 2 graded; ~500 calls over 5 runs).
- **EBAY_JP: eBay answers 409 "12019: marketplace not supported".**
- GB/AU/CA first failed in OUR code: fx.js had no GBP/AUD/CAD pin, so the
  calls were spent and discarded. `f98108b` pins them (ECB 2026-09-03).
- Marginal kept rows over US alone (839 rows, 23 calls):
  GB +432 (+51%, 22 calls) · DE +274 (+33%, 16) · AU +161 (+19%, 21) ·
  CA +55 (+7%, 22) · FR +79 (+9%, 12) · IT +417 · ES +108.
- **eBay machine-translates US titles for IT/ES/FR/DE, and the gate reads
  the translation.** IT/ES each kept 41 items the US search RETURNED AND
  REFUSED: "(Portachiavi)" (a keychain), "30° Celebrazione" (the 30th
  reprint US refused 47x), "DANNEGGIATO" / "Molto Giocato" in Raw NM. IT/ES
  are not addable without a translated-vocabulary gate.
- IT/ES also return ~630 US-seller rows US never returns. Not category
  (EBAY_US_NOCAT: +0-2) and not the set name in the query (EBAY_US_NOSET:
  +0-26, recovers none of IT's). Cause unknown; they arrive translated.
- **DE language gate is NOT ready**: LANG_WORDS is English-only. DE kept
  "…Spanisch", "…Italienisch", "…BASE SET ITA", "Neo Genesis🇩🇪", plus
  "Metallkarte … Goldcard" (a metal replica) and "POKELOTTERIE" (a lottery).
- Shipping on a non-US site is to THAT site's buyer — not measured; needs
  X-EBAY-C-ENDUSERCTX before any landed cost from GB/DE is comparable.
- Paging: US hit its 3-page cap on 3 of 12 cases (both busy raw EN cards
  and JP Leafeon); GB 4, IT/ES 6. No per-view page log exists, so the share
  of REAL views at the cap cannot be measured yet.
**Recommendation:** GB first (English titles, +51%, one more call per page).
AU next if the quota allows. DE only after a German-vocabulary gate measured
both ways. Not IT/ES/FR. Nothing built in /api/listings yet.

**T2.** `7826d35`: trending (both queries) and `evaluateAlerts` now use
`printsql.basePrintingSql`. Measured over every priced card: they agreed
with the card page except 6 EN cards whose only real row is a reverse (the
6 of 241: xy9-97/99/105 on estimates, basep-34/35 and bw6-118 none — all
without `variants`, so `manifest en` decides) and 33 hidden Pocket cards.
Alerts: 6 of 7 current_price = card page; the 7th is one refresh stale.
Portfolio renders nothing (adding holdings not built).
`c58b3d7` pricecheck fixed three ways (card page's number; the writer's
exact search — it sent the set ID as text; pre-2016 sets checked by value,
not an empty table). 151 0/12 -> **12/12 within 6%**, Silver Tempest 12/12,
Ascended Heroes 10/12 (Gengar #284 $864.53 vs $861.49), Base Set 11/12.
Alakazam #1 $233.32 (+ reverse $122.74), #33 $19.23 (+ reverse $71.39) —
the $67.18 is superseded. Found: **the internal-API fallback flips between
products night to night** — Base Set Clefairy Doll 8.39 / 71.91 / 7.27 /
9.30 / 82.66, Impostor Oak, SM1 Umbreon GX 101.85 <-> 239 — TCGdex-first
(after the harvest) is the fix; recheck after. And **10 cards show a
tcgplayer_1stEdition price as the headline** (no unlimited row) — the
reverse-as-base shape on the edition axis, not fixed.

## 2026-09-29 (later) — stored prices measured; set-blind match found; printings finished

**T1, measured first.** 3,684 cards (2,767 EN: 12 per set + all e-Card;
917 JA) stored vs TCGdex live. EN: 90% within 10%, 8% drift, 2.3% >40%.
By era every one 0-3% wrong except **Expedition 27/59**. H-number
hypothesis falsified — Aquapolis/Skyridge H-holos 54/54 agree. Cause:
`tcgPlayerSearch` set-blind; "Expedition Base Set" ranks Base Set first
(Alakazam 001 -> Base Set 2 $55.51 / Base Set $69.72, the exact stored
swing). TCGdex wrong the other way on TG16 Mimikyu V ($3.62 main-set
product vs $86.55). JA: TCGdex has 45% of cards, TCGplayer for none,
Cardmarket median 0.45x held — not a JA replacement.
`6d5bdad`: set check (`tcgsetname.js`, 22 aliases measured over 161 sets),
TCGdex-first (inert until a full harvest records shared products), harvest
two-phase with shared-product refusal (TCGplayer AND Cardmarket — T4's
Alakazam item), writers record source_meta. **Not yet run:** the full
`node tcgdexharvest.js en`; the internal API is still the fallback.

**T3.** `6d5bdad`: tcgdexharvest.js tracked (with its T1 change — its
pre-change text was never in git). `483afda`: cardhunt-redesign.html
tracked as the design reference, 404 asserted.

**T4.** `28ea4be` Yahoo medians split by printing — live, ja-SV2a-001
Bulbasaur: all 3 surviving sales were Master Ball mirrors (old: ~$22 base);
now base none, reverse-masterball $22.29 own row. Existing Yahoo base rows
NOT repaired (143/191 >5x Yuyu-tei, 54 >20x) — jpcheck owed.
`a9ba5e3` Typical follows the Printing box — browser: Alakazam #1 Reverse
PSA 10 $859.18 (=122.74x7, was 233.32x7); JA Master Ball "no price held".
`5a25539` letter-suffixed numbers 0/32 -> 32/32 findable by N/T; LPAD
truncation found on the way ('103A' -> '103').

**T2 (manifest en/ja) not started** — waiting for Chrome to close (369 MB
free with it open).

## 2026-09-29 — ingest.js tracked; sold scrape gone; every gate audited

**T2.** `17695f4`. ingest.js tracked (scanned first: env-only credentials,
0x08 clean). Never deployed: Render runs server.js, `/ingest.js` 404s.

**T8.** `9b8b3d9`, live. eBay sold-page scrape deleted; Last sold says "no
licensed sold source". Then `8cd01bb` (decided): `/api/market`'s ungated
`ebayActive`, TCGplayer internal-API call and dead PriceCharting scrape
deleted; Lowest listing comes only from `/api/listings`' `cheapestLive`;
the page makes no `/api/market` request. Browser: 0 market requests,
Charizard Lowest "$104.51 · checked listing", PSA 10 via the selector
"$775.00", no console errors.

**T2a.** Full English search audit: exact 102 / 21,272 fail, typed 126 /
1,946, numbered 70. 96 exact failures were `/api/search`'s guard refusing
setHint-only parses before `resolveCard` ran — the 2026-09-28 fix was in the
resolver and the test called the resolver directly. `cd9da50`: 102 -> 6 on
a recheck of all 218. New group: 69 alphanumeric numbers (`24a/119`).

**T9.** Table in CLAUDE.md "THE GATES". Holes closed, one commit each:
`/api/listings/:cardName` ungated fall-through (404); Yahoo's uncounted
rejections (`jpItemRejectReason`, "29 kept, 55 rejected of 84");
jpfilter's four-name grader list (+10 SGC slabs refused of 945 titles, 0
TAG TEAM lost); ingest's Yahoo median never ran `printingConflict` (0
changed on the 25 dearest — closed, not repaired); refresh dropped
`set_total`; ingest's name-only eBay (would have STORED eBay data — 0 rows,
keys absent locally) and Cardmarket fallbacks deleted; Chinese no longer
priced from Yahoo JP; jpfilter's second English gate deleted (dropped 4/4
genuine titles) — its cases now run `cardmatch.verify` and found "x4
Playset" kept and "$74" read as #74 (fixed; 0 of 516 kept titles changed).

**T10.** Read a real TCGdex response first (booleans hide the mirrors;
per-printing pricing is NOT always the repeated blob). `c1eceb6` + part 2:
cards.variants from manifest; printing gate on eBay/Yahoo/Yuyu-tei; reverse
and mirror prices as variant rows; `printsql.basePrintingSql` on every
headline reader — the 241 reverse-as-base cards: 235 real base prices now.
Browser (local API): Alakazam #33 Printing box Normal/Reverse, $19.23 /
$71.39; Exeggcute five options, Master Ball $1.32; SIR and Base Set
Charizard get no box. Open: Yahoo stored medians carry no printing; the
"Typical" grade-price block ignores the printing. Alakazam #1's stored
tcgplayer_market was $67.18 against TCGdex's $233.32 — now the headline
reads TCGdex's (source rank allowed it); worth a `pricecheck` on ecard1.

**Found, not acted on:** ingest's `tcgPlayerSearch` uses TCGplayer's
internal search API from the home IP — source of 72,174 `tcgplayer_market`
rows. Decision for Roy.

## 2026-09-28 — search reaches cards by their own name; cert check, eBay half

**T1.** "Pikachu Zekrom GX" found nothing. Parser over all 4,512 English
names: 209 names / 366 cards altered before SQL (set-marker words 99, number
in name 35, bare TAG/ACE 5); SQL name match was a single substring, and the
200-row cap was unordered. Fixed as causes in `cardparse.js` (fold both
sides, word-by-word; parser guesses scored, never filtered; rank before
cap). `cardparse.test.js --db` 170/170, 25 of the new assertions watched
failing on the old file. Browser (local): 6 Pikachu & Zekrom-GX candidates.
~150 -> ~210ms per search, unloaded. **Full-catalogue `searchaudit.js`
count not obtained** — both runs killed by memory pressure; tool now
checkpoints and resumes. Committed on the parser measurement at Roy's call.

Pushed `785ed60`; live on Render all three spellings find en-sm9-33,
Charizard still ambiguous (10, not confident).

**T2.** `cd3ba77`, pushed. `certcheck.js` + `GET /api/cert/:cardId` + a
Verify control beside each eBay PSA row's link. One foreground getItem per
press; eBay's item->cert link 15 min in memory, never persisted; PSA lookup
NOT built (key, limit, storage terms pending with Roy). Verified live on
Base Set Charizard PSA 9 (2 eBay calls): "Cert entered — not checked with
PSA" for 76243431, "No cert entered" for another row — distinct chips. The
psacard.com/cert/N link works in a real browser (a script gets a Cloudflare
challenge — never fetched server-side); PSA's page named the same 1st
Edition Charizard the listing did. `certcheck.test.js` 35.

**Seen, not confirmed:** after setting the grade dropdown programmatically
to PSA 9, the listings heading read "FOR SALE NOW — RAW — ALL" above PSA 9
rows (`LF.grade` was "PSA 9"). May be an artefact of form_input bypassing
the selector's own handler; check with a real click before calling it a bug.

## 2026-09-27 (night) — cap vs aspects measured; M/DMG back; card column

All pushed and deployed (`b4953b1`..`b96f1e3`).

**T1.** `/api/ebay/gradecost` on five busy cards: unset grade aspects lost 5
wanted slabs of 329 (one correctly); the 75 cap lost 79-82 on the one busy
card, at the expensive end, under either design. Filter kept as is; the cap
is the open lever. Found and fixed: a three-card "SAR Set" lot kept as PSA 10.

**T2.** eBay's condition policy re-read: four values, no Mint/Damaged. M and
DMG restored from the seller's title, labelled seller-stated end to end;
the old silent NM/HP substitution removed. Verified live in the browser.

**T3.** Card column: 305px dead space → 16px, one gap token, narrow order
fixed; before/after screenshots at 1366 and 390. `cdlayout.test.js`.

## 2026-09-27 (evening) — pushed; id producers traced; grade fields built

Pushed `d2c4cda..2fd8549`; deploy confirmed (205 sets, Pocket `hidden` with
no TCGdex fall-through, Aquapolis 17 of 31 flagged live, 30th CC art 30/30).

**T2 — foreign ids (`9c7c04f`).** Producer of alert 5 / `me55c-33`: the Add
Alert card picker (pokemontcg.io direct, newest first, result one) — replayed
exactly. `me2pt5-294`: the embedded `ME2PT5_PREMIUM` list. Three more
producers closed; refused loudly in page and API. Alert 5 re-pointed; both
rows deleted after the writer's removal was confirmed live; 0 remain.
Wrong first guess recorded: `doSearchLegacy` could never render.

**T3 — grade fields.** `2be20cd` probe measured the combined filter (22/25
agree; misses all stated in titles). `1849611` built filter + refuse-on-
disagreement; `a11196b` fixed the "(PSA 10 Contender)" false keep found live.
Net on 21 cases: +9 / −6 of 305; no drop by the rule, all six by the filter
excluding listings without grade aspects.

**Also `9f07cf7`:** grader-wide mode ("PSA *") accepted any card.

Open: our search misses "Zekrom-GX" vs "Zekrom GX" (hyphen), and the strict
grade reader misses "PSA10". Both now surface only as refusals or field-only
keeps, not wrong answers.

## 2026-09-27 (later) — Pocket hidden, reprint-priced flag, stray-row writer, slab aspects measured

Commits `d2c4cda` (T1), `262597d` (T2), `2fd8549` (T3). **Not pushed.**

**T1.** `digital.js`: Pocket by `set_series`, 15 sets / 2,480 cards, all en,
matching TCGdex's `tcgp` series. Every `cards` read filters; endpoints whose
not-found falls back elsewhere answer `hidden`. Local vs Render: en sets
220 → 205, Home 449 → 434, "Mega Rising" search 18/25 Pocket → 0, trending
eligible 21,195 → 21,162. setaudit en: 205 checked, 2 problems (30th-c,
swsh9tg coverage) — the 15 Pocket failures gone. Browser: sets page, search,
hidden set page, no console errors.

**T2.** `outlier.flagReprintPriced` on the 55 REPRINT_OF originals only.
Aquapolis Lugia live: 14 of 28 rows at $350-$500 → flagged; global ratio
untouched (still 0 flags there). Replay over all 55: 21 applied, 150 flagged.

**T3.** Writer of `me2pt5-294` and `me55c-33` found and removed (server's
only `cards` write). `image_source` column added. ccfill: 55 artwork + 30
rarity written, 0 refused, backup `ccfill-backup-2026-09-27113620.json`.
Two stray rows remain until deploy; alert 5 references `me55c-33`.

**T4.** Measured only — see CLAUDE.md "Slabs: measured 2026-09-27". The
filter exists for grader and grade at no extra quota; agreement with
descriptors 9/9 big-three, Ace 1/3, grade 13/15. Precedence rule needs a
decision before building.

## 2026-09-27 — Reprints by set id, print runs, eBay's own condition, every grade

Eight commits, suites green before each. Everything below measured live.

**T1 — reprints (2515a23).** `REPRINT_MARKERS` → `REPRINT_FAMILIES` (set ids)
+ `REPRINT_OF` (all 55 Classic Collection cards → original + printed number).
- Reverse direction added: a reprint search now refuses the original.
- Classic Collection cards were **unsearchable**: our numbers are `029/030` and
  `CC002/025`; the cards say `149/147` and `4/102`. Live after: 30th CC Lugia
  0 → 38 kept ($350–460, median $400); Celebrations CC Charizard 0 → 51.
- Aquapolis Lugia: 0 reprint titles kept, $385–15,050. **Residue:** three
  $385–425 rows whose titles never say 30th sit at 0.108× the median, just
  above outlier.js's 0.10 line, and still lead the list. Not fixed.
- "25th Anniversary" ($195) no longer sits on the 1999 Charizard.
- Data: `manifest en 30th` corrected 102 rarities (= the 102 pokemontcg.io
  disagrees on). `setmeta` gained a pokemontcg.io logo fallback; 30th, 30th-c
  and cel25cc now have logos. **30th is complete against TCGdex (158)** —
  the ingest did not stop short; pokemontcg.io's extra three are lettered
  R/G/B Mews TCGdex does not list. **30th-c and cel25cc still have no artwork
  and positional rarity** (TCGdex has "None", which `manifest` maps to
  Common) — not run on them for that reason.

**T2 — print runs (be4c02a).** Ten sets, from TCGdex `firstEd` counts. Base
Set Charizard Raw: Unlimited 2 · not stated 23; PSA 10 splits four ways.

**T3 — condition (7394449, 387c7dd, 849252b, 3235503).** Probe first, then
the feature. Summaries 0/400 carry descriptors, getItem 100/100, the aspect
filter agrees 36/36, "Not Specified" is ignored. Raw conditions now filter
at eBay at no extra quota; M and DMG removed (eBay cannot tell them apart).

**T4 — scales (c3cc8fc).** Every company's scale from its own page; PSA
halves, TAG/ISA/ACE/AGS no 9.5. ACE back in the UI. selector.test.js 92 → 517.

**Found on the way (96b193d):** async `cardmatch.js` made the page's `CM`
null whenever it loaded second. `liveCM()`.

## 2026-09-24 — Phase 2, and the single-writer guard that found four more bugs

Seven commits. `preserve.test.js` green before each; it grew 92 → 109.

### First: assert the single writer structurally

`#cd-listings` had been fixed three times and reintroduced twice. The guard is
now a **call graph built from the page**, not a grep. Proven by reintroducing
the bug in every form it has taken — including the regression I shipped myself
two phases ago — **five mutations, five failures**, page restored byte-for-byte
each time.

It found two things immediately:

- **`renderRealListings` deleted.** Zero callers, but it still wrote the gated
  element and sat beside the function that owns it. That is how it got wired up
  the first time.
- **My own guard was wrong about `setLTab`**, which early-returns for the live
  tab rather than guarding inline. The test was wrong and the code was right.

### Then Phase 2

| piece | what changed |
|---|---|
| Browse TCG sets | three tiers — logo (157), **the set's first card (229)**, name tile |
| set count | reads the live list in every language; **one** expression, not two |
| Set page | one row, consistent 158px sizing, **See all** at the end |
| `sd-count` | one writer, one meaning |
| Set Alert | **persists** — POST / PATCH / re-read |
| Compare | **works** — it had no markup to render into |

### Four more bugs, all found by looking

None of these was failing a test. Three were found by opening the page and one
by a guard written for something else.

1. **`sd-count` had two writers with different meanings.** Ascended Heroes
   opened reading **"295 of 217 cards"** — more shown than exist — and switched
   to "12 of 295" on the first filter. Noticed only because the number was
   impossible.
2. **Every alert write was local.** The bar read `/api/alerts`; `saveAlert`
   pushed onto an array and promised "We will notify you". A created alert
   vanished on the next refresh, a paused one un-paused itself, a deleted one
   came back.
3. **Compare threw on every click.** `openCompare()` referenced two elements
   that were not in the page.
4. **Two more dropped modals** — the photos viewer and a checkout flow — found
   by the guard written for Compare. Pinned as KNOWN so the set cannot grow;
   reported, not quietly allow-listed.

### The data was already there

TCGdex holds no logo for **any** Japanese or Chinese set. The set-list query was
already computing `(ARRAY_AGG(c.image_small ...))[1] AS sample_image` on every
request and throwing it away. Returning it gave 229 sets a real image at no
fetch cost.

### Verified in the browser

| screen | checked | result |
|---|---|---|
| Sets, English | 220 tiles | 157 logo + 11 card + 52 name, **0 empty** |
| Sets, Japanese | 138 tiles | 0 logo + **111 card** + 27 name, 0 empty, 0 broken |
| Set page, Ascended Heroes (295) | row | 1 row, **all tiles 158px**, scrolls, "See all · 284 more" |
| Set page, See all | expanded | 296 tiles, 50 rows, "Show less" |
| Set page, 30th-c (30) | row | 11 + See all, count "30 cards" |
| Set page, Mega Evolution Energy (8) | grid | 8 tiles, **no** See all, count "8 cards" |
| Set Alert, `en-30th-103` | create | DB 2 → 3, correct card/grade/target |
| Set Alert | pause | `status='paused'` **in the database** |
| Set Alert | delete | removed from the listing |
| Compare, `en-base1-4` | open | renders the card + an empty slot, no errors |

Console clean throughout.

### Still open

- **The photos viewer and checkout modals are still missing** their markup.
  Pinned at 7 ids so the set cannot grow. `viewListing()` is reachable from the
  listing rows, so clicking Photos still throws.
- A seller negation is read as a grade (`... (not cgc bgs 10 ...)` kept by a
  BGS 10 search at $4,899). Pre-existing, deliberately untouched.
- Phone width still cannot be rendered in this environment — the narrow rules
  were verified by forcing them on, not by seeing the breakpoint fire.


## 2026-09-23 — Phase 1b: the card page

Six commits. `preserve.test.js` green before each, and it grew 75 → 87 as the
page gained things worth guarding.

### The layout

`.dg` was a 300px | 1fr grid: the image pinned in a narrow left column and
everything else — prices, details, graph, listings — stacked on the right. The
image could never grow, and the details sat beside the prices rather than
under the card.

Now, in Roy's order: `.cdtop` puts the image (up to 380px wide, 520px tall,
was 340) beside the price boxes; `#cd-meta` follows underneath; the chart
follows that; then the selector; then the listings. Verified by measuring
rectangles, not by looking: `pricesRightOfImage`, `metaBelowImage`,
`chartBelowMeta`, `selectorBelowChart`, `listingsBelowSelector` — all true.

**Every element id survived.** The replacement script refused to write unless
every `id=` in the old block appeared in the new one. `openCard`, `selGrade`,
`renderMarketData`, `updateValueBar`, `applyMeasuredGrade` and
`renderListingFinder` all reach this page by `getElementById`, and a renamed
id disconnects the logic from the markup with no error at all.

### The selector

A status box and a condition box, exactly the specified table. The lists come
from `cardmatch` wherever cardmatch has an opinion, so the box cannot offer a
grade the gate has never heard of.

`selector.test.js` — 89 assertions — does not test the selector's opinion of
itself. It lifts the real functions out of the shipped page, runs them, and
feeds all 47 combinations into the real `cardmatch`. A grade the box offers
but the gate cannot parse would return an empty list and look like
"no listings".

### The filter

The grade goes to the server and the gate enforces it. The raw sub-condition
cannot — eBay's condition field is binary — so it is read from the seller's
title and filtered client-side, and it **cannot make a listing vanish**:

| | |
|---|---|
| stated and matching | shown |
| seller said nothing | shown, in an UNSTATED group that explains why |
| stated differently | counted and named |

Live on Giratina at Raw + NM: 1 matching, **UNSTATED CONDITION — 17** with all
17 rendered, and "4 listings hidden — the seller stated a different
condition."

### Three defects the browser found

The tests were green for all three. Each was caught by looking at the page.

1. **Two controls for one setting.** The flat 16-chip GRADES row was still
   rendered under the new selector. Removed from inside the listings panel one
   commit earlier, left behind one level up.
2. **Dead CSS is not inert when the name collides.** `.lbox` was defined twice
   — once by an old login design with `max-width:460px`. Nothing carries that
   class except the listings panel, but the 460px still applied, so after the
   port gave the panel a 1180px column it stayed 460px wide.
3. **The listings panel had two writers. Again.** `selGrade` called
   `renderListingFinder` and then `buildMockListings` unconditionally, and
   buildMockListings writes the same element. The synchronous one always won,
   so PSA + All showed the ungated deep-link block where the gated endpoint
   had real PSA rows. That is the defect CLAUDE.md already records, reintroduced
   by wiring the selector into `selGrade`.

Also found: `PSA *` is the grader-wide **wire format** and it was being printed
to the user in three places, each directly above a price. `gradeText()` renders
it as "PSA — any grade" wherever a grade is shown rather than sent.

### Verified in the browser

| Card | Grade | Result |
|---|---|---|
| `en-base1-4` | PSA + All | grades 1,2,3,4,5,10 — **all PSA**, zero BGS/CGC/SGC, 27 rows |
| `en-base1-4` | PSA 10 | only PSA 10 — **Shadowless and Unlimited both labelled** |
| `en-base1-4` | BGS 10 Black Label | nothing, and **no ordinary BGS 10s** (eBay has none for this card) |
| `en-base1-4` | BGS 10 | 1 row, **no Black Label in it** |
| `en-swsh11-186` | Raw + All | cheapest **$299.95**, 4 flagged and sorted last |
| `en-swsh11-186` | Raw + NM | 17 unstated shown, 4 hidden and named |
| `en-swsh11-186` | CGC 10 Pristine / SGC / TAG / Other / Raw DMG | no console errors or warnings |

Black Label on Charizard passes **vacuously** — eBay has no BGS 10 Black Label
for that card. The non-vacuous proof is 12 real Black Label titles through the
local gate: 12/12 kept, 0 ordinary tens leaked, 0 leakage the other way.

### Still open

- A seller negation is read as a grade: `CHARIZARD ... (not cgc bgs 10 ...)`
  is kept by a BGS 10 search at $4,899. Pre-existing, unrelated to this phase,
  and not fixed — teaching the gate to read negations is the `tag`/`ace` trap
  offering itself again and deserves its own measurement.
- Phone width could not be rendered: window resize does not change the
  viewport in this environment. The narrow **rules** were verified by forcing
  them on in a 414px column — zero elements overflow, the image stacks above
  the prices, the selector stacks — but the breakpoint itself was not seen
  firing.


## 2026-09-23 — Phase 1a of the redesign port, and the three grade dimensions

Eleven commits, each one green on preserve.test.js and every existing suite
before it landed. Nothing was ported two pieces at a time.

### Before porting: the guard

**preserve.test.js**, 73 assertions, standalone like the rest. It reads the
shipped page and the live API and fails if any preservation-checklist item is
lost. Proven by breaking it: **12 deliberate mutations, 12 guards fired**, and
the page restored byte-for-byte each time. It passed on the UNPORTED file
first, as TASK.md requires.

Two of its own assertions were wrong on the first try and the break tests said
so — one passed while the code it checked was gutted, the other over-ran into
a neighbouring function. Both are the failures **fnSrc** itself has had.

*(The two names above were eaten by shell command substitution when this entry
was written — backticks this time rather than backslashes. Sixth occurrence of
the escape-mangling bug in these notes, and the first to involve backticks.
The byte check does not catch it, because nothing invalid reaches disk: text
simply disappears. Read back what you wrote.)*

### The three grade dimensions (built, not faked)

1. **BGS 10 Black Label / CGC 10 Pristine** are distinct grades. Asymmetric on
   purpose: asking FOR a qualifier requires the title to state it; asking for a
   PLAIN 10 refuses a stated one. CGC Gem Mint never excludes — treating it as
   premium would empty every CGC 10 search while looking like a working filter.
   Verified on 12 real Black Label titles: **12/12 kept, 0 ordinary 10s leaked**.
2. **PSA * / PSA All** — one grader-wide query, not ten against the quota.
   Live: **25 kept of 75, grades 1-10, zero BGS/CGC/raw**.
3. **Raw sub-conditions are seller-stated** — eBay has no condition scale. See
   the CLAUDE.md lesson for the 447-row measurement and the HP/EX traps.

### What Phase 1a replaced

| was | now |
|---|---|
| 4 hardcoded alerts moving +/-3% every 30s | real rows from /api/alerts |
| 78 lines of invented TRENDING/DEALS/MOVERS | named, honest empty states |
| those arrays written into CARD_CACHE | nothing written to CARD_CACHE |
| 17 live images.pokemontcg.io requests | **0** |
| guessed set logo URLs that 404 | logo:null + a styled name tile |
| "350+ sets, 20,324+ cards" typed in | 449 sets, 46,088 cards, counted |
| "121 English" beside 220 tiles | 220 |
| renderSets() declared twice | once |

### Three defects the browser found that no test would have

- A **493x** wrong number: the listing average was cached per card, but it
  depends on the GRADE. PSA 10 $51,743.85 printed as the Raw NM figure, where
  the truth was 05.
- The Home set row drew the **EN_SETS fallback** — 121 pokemontcg-id sets that
  openSet() cannot resolve. The two-set-lists bug on a second screen, one
  commit after I shipped it.
- A **runaway loop** that froze the renderer, because loadLangSets resolves
  immediately while a request is in flight.

### Not done

**Phase 1b — the card page — has not been started.** The gate work it depends
on is built, deployed and verified against live eBay; the page layout, the
status/condition selector and the condition-filtered listings are not.


## 2026-09-22 — T0: why the 30th Anniversary sets stopped showing

**They were never in the database.** They showed for three days because the
page was browsing a different list, and the moment that was corrected they
had nothing to come from.

### Where they drop out, of the three steps

| step | result |
|---|---|
| 1. in the database? | **NO.** The only match for `30th` / `anniversary` / `30周年` across all 45,781 cards was `CP6`, a *20th* Anniversary JP set from 2016. |
| 2. does the API return them? | `/api/sets` **yes** — `me55` "30th Celebration" and `me55c` "30th Celebration: Classic Collection", released 2026/09/16. `/api/sets/lang/en` **no** (214 sets). `/api/sets/lang/ja` **no**. |
| 3. does the page show them? | No — the page browses `/api/sets/lang/en`. |

So they drop out at **step 1**, and step 2 explains why anyone ever saw them:
`/api/sets` is not our data. It is a live proxy to `api.pokemontcg.io`
(`server.js:246`), and pokemontcg.io had the sets six days after release while
our ingest did not.

### The cause, and the commit

Commit **`0c4da73`** "browse the set list the rest of the app can resolve",
**2026-09-19 03:02**, changed English browsing from `/api/sets` to
`loadLangSets('en')`. Confirmed in the diff, not inferred — line 1196 before
the commit reads `const r = await apiFetch('/api/sets');` and is gone after.

The sets released **2026-09-16**, three days earlier. So they appeared in the
old 176-set list for three days and vanished on the 19th. "Stopped showing"
fits the commit exactly — but the commit is not the fault. It is correct, and
it is on the preservation checklist. It simply stopped the app displaying a
set it holds no cards for, which is the honest behaviour.

Worth noting how fragile the old path was: `api.pokemontcg.io` returned **500**
throughout this investigation. The list that "had" the sets is one we do not
control and which was down at the time of asking.

### The fix — ingest, as TASK.md requires, not a revert

`node ingest.js setgap en` found both upstream on TCGdex as `30th`
(158 cards) and `30th-c` (30 cards). `--fix` is resumable and only re-walks
sets cleared from the progress file, so it was bounded to the 6 sets it had
just listed:

```
30th      30th Celebration          158 cards     0 real prices
30th-c    30th Classic Collection    30 cards     0 real prices
swsh9tg   swsh10tg  swsh11tg  swsh12tg   30 cards each, 90 real prices
```

English: **214 -> 220 sets, 23,444 -> 23,752 cards.**

`/api/sets/lang/en` now returns 220 with both sets present, and the browser
renders them at the top of Mega Evolution, newest first.

### Verified in the browser at /app

- Both tiles present, labelled **"128 cards · 0% priced"** and
  **"30 cards · 0% priced"**.
- Set page opens and announces its fallback: *"From the CardHunt database —
  0 of 158 cards (0%) have real market prices."*
- Prices carry the **`est`** badge — estimates stay visually distinct.
- Card page `en-30th-103` Dialga: real artwork from
  `assets.tcgdex.net/en/me/30th/103/…`, and a **live eBay listing at $3.53**.
- Gated listings confirmed by `linkaudit --live`: `en-30th-089` **66 kept of
  75**, `en-30th-103` **64 kept of 75**, every row the right card.

### Three gaps that are upstream, not ours

1. **No prices exist anywhere yet.** `tcgdexprices en --set=30th --dry` — 158
   cards, *"TCGdex had no price 158"*. The set is six days old. Estimates,
   correctly labelled, are the honest answer until a source carries it.
2. **`30th-c` has no artwork at all** — 0 of 30. TCGdex returns
   `rarity: "None"` and no image for those cards. That is also why all 30 read
   as rarity `Common`: `normRarity` falls back when the field is absent.
3. **`30th-c` numbering is TCGdex's sequential `001/030`, not what sellers
   write.** Real titles say `Charizard 137/103 … 30th Celebration Base Set`
   and `Crobat G 47/127 Platinum … Classic Collection` — the **original**
   set's numbering, exactly as Celebrations Classic Collection does. So
   `linkaudit en-30th-c-001` reports **A: eBay returned nothing** for
   `Charizard 001/030 30th Classic Collection pokemon`, and reports it
   correctly. The main `30th` set does not have this problem: its `089/128`
   and `103/128` are what sellers write, which is why both audits above work.

### What ingesting them broke — found by looking, not by a test

`30th Celebration` contains the word the Celebrations reprint marker matches.
See the CLAUDE.md lesson; in short, the guard was disabled for all 188 new
cards and every 30th listing became exempt on a 2021 card. Six of twenty real
2026 titles were being kept against `en-cel25cc-4`. Fixed in `241e6e9` with
`reNot` / `setNot`, measured in both directions against the old gate rebuilt
from `git show`: **no verdict changed on 80 real titles**, and 6 -> 0 on the
collision. `printinggate.test.js` 61 -> 69, each new assertion watched failing
first.

### Two further findings, recorded for the redesign port

- **Set logos are guessed.** `/api/sets/lang/:lang` constructs a URL when
  `set_logo` is null — **0 of 138 Japanese and 0 of 84 Chinese sets have a
  stored logo**, plus 63 of 220 English. Seven sampled JA URLs 404, and the
  series segment is guessed wrongly (`SM6b` -> `swsh`). `/api/cards/:id`
  returns `null` for the same fact. Phase 1a/2 need the name-tile fallback.
- **17 live requests to `images.pokemontcg.io`** from `#home-trending` and
  `#alerts-bar-items` — both hardcoded demo blocks that Phase 1a replaces.
  The other 139 occurrences of the string are inside `EN_SETS`, the sanctioned
  offline fallback. The checklist item is about *requests*, not the string.
- The Sets header reads **"121 English"** while the page renders 216 tiles and
  the API returns 220. A stale count, cosmetic, noted for the port.

## 2026-09-02 — T2: rarity backfill from Yuyu-tei

`node ingest.js rarityfill ja` — 11,630 cards examined, **8,681 now carry a
sourced rarity** where none did before, and a `rarity_source` column records
which source each came from.

| outcome | cards |
|---|---|
| confirmed by both TCGdex-era store and shop | 7,469 |
| changed, shop supplied it (TCGdex had none) | 881 |
| left as held, TCGdex backed it | 331 |
| shop states no rarity (`-`) | 2,358 |
| no shop entry | 591 |

### Three premises in T2 turned out to be wrong, and each changed the design

**1. `normRarity` does not handle the common codes.** TASK.md says it "already
handles most of these codes". It handles `RR/SR/SAR/UR/AR/CHR/CSR/HR/RRR` but
returns **null for plain `C`, `U` and `R`** — the three that cover most of the
backfill. A Yuyu-tei-specific table now maps them, deliberately leaving
`MA`, `TR`, `S-TD`, `K`, `PROMO` unmapped so they write nothing rather than
guess.

**2. `-` is the most common rarity value, and it means "not stated".** Across
1,755 sampled rows it appeared 1,041 times. Mapping it to Common would have
been catastrophic and superficially plausible. Labelling is **bimodal by era**:
older sets label everything including C/U/R (SM1M, CP6, XY2, SM9 all 100%),
modern sets label only the chase rarities (S8b 36%, SV8a 19%, M2a 17%). That
suits the task — the Limitless-ingested sets needing rarity are the old,
fully-labelled ones.

**3. Set membership is NOT a proxy for "rarity came from TCGdex".** The
progress file marks 68 sets `source: limitless` (5,876 cards) against TASK.md's
5,475, so I nearly used it. It is unusable: the 70 "TCGdex sets" still contain
plainly inferred values — shop code `AR` (Art Rare) sat against a stored
**"Common" 48 times**, and AR cards are never Common. TCGdex's *set* endpoint
omits rarity, which was the original defect; only `manifest`'s per-card calls
ever fixed any, and it corrected 521.

So provenance is established **per card, from TCGdex, and only where the shop
and our store disagree** — 1,212 calls, ~7 minutes. Agreements need no call:
two independent sources concurring is already the strongest evidence there is.
That is the only reading of "do not overwrite TCGdex" that can be honoured,
because it asks rather than assumes.

**TCGdex never contradicted us.** Of the 1,212 asked, it had a rarity for 331
and every one backed what we already held (`changed -> TCGdex: 0`). The 881
changes are all cases where TCGdex had nothing to say.

### Verified, all three of TASK.md's checks
- **Rarity spread shifted as predicted** — the largest transitions are
  `Common -> Rare Ultra` (58), `Common -> Special Illustration Rare` (55),
  `Common -> Illustration Rare` (48): secret rares leaving Common, which is the
  known mislabelling being corrected.
- **T1 regression holds** — `ja-SV2a-129` $0.51 and `ja-SV2a-093` $0.32, both
  still `yuyutei_shop`.
- **Spot-check: 10 of 10** backfilled cards match the shop's own label on an
  independent re-fetch.

Common/Uncommon over $100 excluding secret rares is still **2**, and both are
now `[confirmed]` — `ja-CP6-33` ピカチュウ at $221 and `ja-CP3-5` at $113 have
two independent sources agreeing they really are that rarity. Exactly the
exception TASK.md flagged, now with provenance behind it.

### The 39% -> 10% target was NOT met, and cannot be from this source
5,342 Japanese cards remain on inference (38%). The residual is structural:

| reason | cards |
|---|---|
| in sets Yuyu-tei does not carry (PCG, PMCG, neo, E-series, VS1) | 2,393 |
| shop lists the card but states no rarity | 2,358 |
| no shop entry for that card | 591 |

No amount of Yuyu-tei work reaches those. Worth noting the residual is largely
*unverified*, not *known-wrong*: where both sources could speak, they agreed
7,469 times against 1,195 disagreements — positional inference was right ~86%
of the time.

### estFix — deliberately NOT run, and the reason is a bug
T2 says to re-run estimates for cards whose rarity changed. **0 of the 881
changed cards are on an estimate** — they all carry real prices — so that step
is satisfied with no work.

Running it more broadly would do damage. `node ingest.js estfix ja` proposes
2,351 rewrites, e.g. `ja-PMCG1-100` (a **1996** Common) from $48.09 to $0.15.
CLAUDE.md documents "Vintage changes the floor — estimates scale by set age,
9x pre-2000, 5x pre-2003, 2.5x pre-2007".

**That scaling does not exist in the code.** `estimate()` in ingest.js takes
`(rarity, id, name)` — no release date — and `estimatePrice()` in server.js is
the same. Neither file can apply an age multiplier. **2,143 of the 2,503 JA
cards on estimates are pre-2007**, so running estfix would systematically
under-value the vintage catalogue by discarding scaling the code can no longer
reproduce.

Given `ingest.js` has verifiably lost `jpTitleIsSingleRaw`, then
`evaluateAlerts` and `estFix` to downloaded-file reverts, an age multiplier
that CLAUDE.md describes and no file implements is plausibly a third casualty.
**Not fixed here — it is a pricing-model change, not a rarity backfill.**

`estFix` was still routed through `sourcerank` as T2 asked: an estimate is the
lowest confidence and now cannot bury a real price even if the selection
widens. It reports refusals separately.

### Files
- `yuyutei.js` — `YT_RARITY` + `ytRarity()`, with the `-` and bimodal-labelling
  findings recorded at the point of use.
- `ingest.js` — `rarityFill()`, `estFix` gated.
- `cards` — new `rarity_source` and `rarity_checked_at` columns.

Suites: sourcerank 31/31 · filter 69/69 · cardparse 117/117. JA price coverage
unchanged at 80.1%.

### T0 confirmed healthy
Operational log enabled (84 records), `CardHunt task watch` running hourly, the
nightly refresh still Disabled with no state change since 08-29.

---


## 2026-09-01 — T0: audit trail for the nightly task

### The task files were sitting in Downloads again
There was no T0 in the project's `TASK.md`, and neither it nor `CLAUDE.md` had
changed since my own Aug 30 edits. Both had been rewritten on **Aug 31** and
left in `Downloads` — the same hazard CLAUDE.md documents for `ingest.js` and
the frontend, now on its third file class. Installed, with the previous copies
kept as `CLAUDE.md.bak-20260901` / `TASK.md.bak-20260901`.

**The incoming CLAUDE.md was not a superset**, which is why it was diffed
before adopting rather than after:
- **dropped** "Sources are not interchangeable — rank them" (only a passing
  mention of `sourcerank.test.js` survived, not the design rationale — in
  particular *why a refused price is not recorded at all*)
- **dropped** "Nothing happened is not proof a guard works" — no trace
- **re-added the stale TASKS section**, describing the listing finder, alert
  engine and scheduled refresh as still to build, contradicting its own
  TASK.md; and removed the "TASK.md is the live task list" pointer
- renamed two lessons harmlessly (grandchildren → "a time limit on the wrapper
  does not bind the work"; gate-testing → "Test what a gate ALLOWS")

Both dropped lessons restored, TASKS replaced with the pointer again, and the
note strengthened to record that it has now drifted **twice**.

### T0 — the elevated half cannot be done from here, and I was wrong about why
`chili` **is** in the local Administrators group. My first reading said it was
not: an unelevated session reports `IsInRole(Administrator) = False` and shows
zero admin SIDs, because UAC issues a filtered token in which
`BUILTIN\\Administrators` is present but marked **"Group used for deny only"**.
`whoami /groups` shows it plainly. Group membership and active privilege are
different questions; the correction matters because it means elevation *will*
work for you — this shell simply cannot raise a UAC prompt.

`enable-task-log.ps1` is ready and **self-elevating**: run it normally, accept
the prompt. It is idempotent, prints the resulting `IsEnabled`, and lists the
event ids worth knowing (140 registered/updated, 141 deleted, 129/200/201
action lifecycle, 111 terminated by time limit). Parse-checked without letting
it spawn a prompt this session cannot answer.

```powershell
cd C:\\Users\\chili\\cardhunt
powershell -NoProfile -ExecutionPolicy Bypass -File .\\enable-task-log.ps1
```

### Attribution from the task object is a dead end
T0 asks what already touched it. Nothing there to find:

```
Author : (empty)      Date : (empty)
State  : Disabled     UserId : chili   RunLevel : Limited
LastRunTime 8/29 11:16   LastTaskResult 267014   NumberOfMissedRuns 3
task XML  CreationTime 8/20 14:46   LastWriteTime 8/29 14:21
```

`Register-ScheduledTask` did not populate Author or Date on the Aug 20
registration, so the task carries no authorship record. The operational log is
the only route to *who*, and it is off.

### So I built the half that needs no privilege
TASK.md's re-enable criterion is "the log is on, a cause is established **or a
week passes with no unexplained state change**". That last clause only needs to
know *when* the state changed — and registering a task for your own user is an
unprivileged operation.

`task-watch.ps1` + the hourly **`CardHunt task watch`** task append one line per
check to `task-watch.log`:

```
2026-09-01 15:45:02  state=Disabled  lastRun=08/29/2026 11:16:16  lastResult=267014  ingestProcs=0
```

It also counts live `ingest.js` processes, because a node process outliving its
task is the other half of the Aug 28 incident.

**The change detector was tested by making it fire**, not by watching a quiet
log — the direct lesson from yesterday's three-attempt gate verification. A
prior state of `Ready` was written into the state file and the next check
produced:

```
… state=Disabled …   *** STATE CHANGED: Ready -> Disabled ***
```

Then verified end to end via the scheduler itself (`Start-ScheduledTask` wrote
a line at 15:45:02), not just by running the script by hand.

The real task was **not** toggled to test this. Enabling it even briefly would
have disturbed the exact state under investigation and polluted the audit trail
being established.

### State
`CardHunt nightly refresh` — **Disabled**, untouched, as T0 requires.
`CardHunt task watch` — Ready, hourly, next run 16:01.

Note: a Disabled task still reports a `NextRunTime` (9/2 03:00). It will not
fire while Disabled; the field is just the trigger's next nominal time.

### Still blocked on you
1. Run `enable-task-log.ps1` and accept UAC — the only step needing elevation.
2. Re-enable the nightly task only when T0's conditions are met. `task-watch.log`
   now supplies the "no unexplained state change" half.

Suites: sourcerank 31/31 · filter 69/69 · cardparse 117/117. All seven JS files
parse.

---


## 2026-08-30 — T1: source priority in refresh, and jpcheck made source-aware

### T1 — a lower-confidence source can no longer overwrite a higher one

`refresh` wrote whatever it fetched. Yahoo cannot separate printings that
share a collector number, so re-fetching any of the 142 cards `jpreconcile`
corrected would silently restore the master-ball mirror price.

**`sourcerank.js`** (standalone, like jptest.js) holds the order:

| source | rank | why |
|---|---|---|
| `tcgplayer_*` | high | real marketplace, collector-number matched |
| `yuyutei_shop` | high | set page supplies number + printed total |
| `cardmarket_*`, `ebay*`, `yahoojp_*` | medium | yahoo cannot separate variants sharing a number |
| `estimate` | low | derived from rarity, never an observation |

Rules implemented: nothing stored → allow · same source → allow (a real price
move) · equal or higher rank → allow · lower rank → **refuse**. An
unrecognised source gets MEDIUM — high enough to replace an estimate, never
high enough to quietly demote a verified price. Patterns are anchored so
`yuyutei_shop_experimental` cannot inherit `yuyutei_shop`'s confidence.

Gate applied to **both** writing paths — `refreshDue` and `safePrices`.
`safeprices --force` bypasses it for a deliberate rebuild (e.g. straight after
a `jppurge`); it should never appear in a scheduled run.

**Why a refused price is not recorded at all.** TASK.md allowed recording it
for history. It cannot be done honestly yet: the displayed price is, in every
reader in this codebase, "the newest non-estimate row". There is no column
separating stored-for-history from shown-to-users, so writing a lower-
confidence observation *is* displaying it. Recording it needs a schema change
or a rewrite of every reader. Until then the write is skipped and logged —
every skip prints both sources and both confidence levels, so a run's effect
is visible rather than inferred.

### Verified — and the first two attempts proved nothing
`refresh ja --set=SV2a` (added `--set` for exactly this) refreshed 13 cards
and displaced **0** Yuyu-tei prices; `ja-SV2a-129` コイキング still reads
**$0.51 yuyutei_shop**, as TASK.md requires. But the summary said
`0 kept — a lower-confidence source was refused`, i.e. **the gate never
fired**: those 14 due cards were already on Yahoo sources, so Yahoo→Yahoo was
legitimately allowed. Nothing had been proven.

Second attempt, `refresh ja --set=CP6` (98 of 103 cards on `yuyutei_shop`, 18
due): all 18 returned **no Yahoo data at all** — Yahoo does not carry vintage
CP6 singles. Still nothing proven.

Third attempt was a direct proof against the reconciled cards, using the exact
lateral join `refreshDue` runs:

```
held_source populated by the refresh query:
  ja-SV2a-058  $0.19  yuyutei_shop
  ja-SV2a-093  $0.32  yuyutei_shop
  ja-SV2a-129  $0.51  yuyutei_shop
  ja-SV2a-130  $0.76  yuyutei_shop
rows with a NULL held_source: 0   (must be 0, or the gate is blind)

ja-SV2a-058  Yahoo $19.11 yahoojp_3  held $0.19 yuyutei_shop -> REFUSED  ok
```

**Yahoo still returns $19.11 for ガーディ today** — 101x the correct $0.19,
the mirror price — and the gate refuses it. That is the T1 failure reproduced
live and blocked. `sourcerank.test.js` covers the decision table: 31
assertions, **9 of 15 decision cases assert an overwrite is ALLOWED**, because
a gate tested only on what it blocks would pass by blocking everything.

### The 33-hour run: the limit did fire, node outlived it
`ExecutionTimeLimit` is `PT6H` and `LastTaskResult` is **267014 =
SCHED_S_TASK_TERMINATED** — the limit fired as configured. The task launches
`refresh-daily.cmd`, which launches `node`. Terminating the task kills
`cmd.exe`; **node is a grandchild and survives orphaned**, which is how a run
under a 6-hour limit continued for 33.

Fixed where it can actually be enforced: `refresh` now takes `--hours=N`
(default 4) and stops itself at the deadline, reporting how far it got. The
remainder stays overdue and leads the next run, which the tier ordering
already handles. Verified with `--hours=0.0001`:
`TIME BUDGET REACHED — 0.0001h. Stopping after 0 of 50.` The wrapper now
passes `--hours=4`.

### Why it re-enabled itself — NOT ESTABLISHED
The **Task Scheduler operational log is disabled** (`IsEnabled: False`), so
there is no audit record of the enable. The task XML shows `CreationTime
2026-08-20` (original registration) and `LastWriteTime 2026-08-29 14:21`,
which is only the most recent change. I could not determine who or what
enabled it and will not guess.

The task is **left Disabled**. TASK.md conditions re-enabling on establishing
this, and that condition is not met. To make it answerable next time, run
**elevated**:
```powershell
$n='Microsoft-Windows-TaskScheduler/Operational'
$l=New-Object System.Diagnostics.Eventing.Reader.EventLogConfiguration $n
$l.IsEnabled=$true; $l.SaveChanges()
```
(attempted unelevated, refused with "Attempted to perform an unauthorized
operation").

### T1b — jpcheck now checks each price against its own source
It validated everything against Yahoo. Yuyu-tei prices are shop prices for
cards Yahoo does not carry, so correct prices came back as
`DROPPED -- no valid comparable` — 20 of 25 in one sample, every one reading
like a finding.

Now: `yahoojp_*` → re-derived from Yahoo · `yuyutei_shop` → re-derived from
the Yuyu-tei set page (cached per set, since one fetch serves a whole set) ·
`tcgplayer_*` / `cardmarket_*` / `ebay*` → **`CANNOT CHECK — no verification
path for source "X"`**, counted separately and labelled "not a finding".

Same 25-card sample, before and after:

| | before | after |
|---|---|---|
| agree | 5 | **25** |
| dropped / cannot check | 20 "DROPPED" | **0 dropped**, 0 cannot-check |

The prices were correct the whole time. `jpcheck en --n=6` exercises the other
branch: 6 of 6 `CANNOT CHECK`, none reported as a problem.

### State unchanged and intact
Japanese **11,236 of 14,023 (80%)**; displayed sources `yuyutei_shop` 9,188,
`yahoojp_*` the rest. `ingest.js` integrity verified at session start — all of
`evaluateAlerts`, `estFix`, `yuyuteiIngest`, `preflightFilter`, `jpCheck`,
`jpPurge` present, `jpfilter` required, filtertest 69/69.

Suites: sourcerank 31/31 · filter 69/69 · cardparse 117/117.

### CLAUDE.md needs attention (not fixed — it is the user's file)
- **Lines 52-60 are an orphaned duplicate STATE table** left by a merge:
  a stray `---|---|---|---|---|` followed by the *old* figures (JA 78%,
  Chinese 19%) directly contradicting the current table eight lines above.
- The **TASKS section is stale** — T1-T5 there describe building the listing
  finder, the alert engine and the scheduled refresh, all long since done.
  TASK.md is the live list; CLAUDE.md's copy now disagrees with it.
- **COMMANDS omits everything added since Aug 20**: `filtertest`, `ytest`,
  `jpcheck`, `jppurge`, `yuyutei`, `alerts`, `estfix`, and the standalone
  `jptest.js`, `cardparse.test.js`, `sourcerank.test.js`, `jpreconcile.js`.
- The architecture table lists four files; there are now ten.
- It says `server.js v5.6`; the file has no version constant and its banner
  prints v5.1.

---


## 2026-08-29 — TASK.md section B: Japanese coverage 15% → 80%

Yuyu-tei shop prices close the gap Yahoo Auctions structurally cannot.
**11,236 of 14,023 Japanese cards (80.1%)** now carry a real price, past the
50% target, and the additions survive listing inspection.

### Probe first — Yuyu-tei is wide open
| check | result |
|---|---|
| reachable | HTTP 200, real content, **no Cloudflare challenge**, no login |
| set page | `/sell/poc/s/{code}` — **one fetch returns the whole set** |
| card page | `/sell/poc/card/{code}/{cid}` |
| set index | search form carries all **292** sets as `vers[]` checkboxes |

Each card renders number, printed total, rarity, name, price and stock:
```
<img src="https://card.yuyu-tei.jp/poc/100_140/sv08a/10478.jpg"
     alt="233/187 UR テツノイサハex">
<span class="d-block border border-dark …">233/187</span>
<h4 …>テツノイサハex</h4>   <strong> 780 円 </strong>   在庫 : 3 点
```
A set page is one request for hundreds of cards, against one Yahoo search per
card — three orders of magnitude cheaper.

**Set mapping is exact, not guessed.** Each `vers[]` label begins with the
canonical code in brackets — `[SV8a] …`, `[M2a] …` — so ours maps directly
without inventing zero-padding rules. **108 of our 138 JA sets are carried,
covering 11,630 of 14,023 cards.** The 30 misses are almost all pre-2007
(PCG, PMCG, neo, E-series, VS1).

### Two parsing traps, both real
**The first `alt` in a card block is the star icon.** Matching `alt="…"`
loosely gives `alt="Star"` for every row — 482 cards parsed with names and
prices but **zero** numbers. The card's own alt hangs off the
`card.yuyu-tei.jp` image and must be matched specifically.

**One collector number carries several parallel printings.**
```
#100 トドロクツキ                              ¥80
#100 トドロクツキ(モンスターボール柄/ミラー仕様)   ¥120
#100 トドロクツキ(マスターボール柄/ミラー仕様)     ¥420
```
**144 of 237 numbers in SV8a** look like this, up to a 5x spread. Our database
holds one row per number — the base printing — so `pickVariant()` takes an
exact name match, else the entry with no parenthetical treatment, else
**nothing**. 229 cards were refused across the full run rather than guessed.

### Validated against prices we already trust
Shop asking price vs our Yahoo medians, per set:

| set | overlap | median ratio |
|---|---|---|
| SV8a | 94 | 1.45x |
| S12a | 97 | 1.40x |
| M2a | 77 | 1.19x |
| SV2a | 119 | **0.30x** ← outlier, investigated below |

A *consistent* margin is itself evidence both sources are pricing the same
cards; random ratios would mean broken matching. Stored as **`yuyutei_shop`**,
never `yuyutei`, so an asking price can never be mistaken for a realised sale.

Spot-checked against live pages, exact agreement on all three:

| card | shop page | stored |
|---|---|---|
| ja-SM1M-66 リーリエ SR `066/060` | ¥698,000 | $4,445.86 |
| ja-CP6-91 MリザードンEX SR `091/087` | ¥598,000 | $3,808.92 |
| ja-MC-766 メガリザードンYex `766/742` | ¥898,000 | $5,719.75 |

### The SV2a outlier exposed a real Yahoo defect
SV2a chase cards agreed (1.5–1.8x) but its cheap cards did not:

| card | Yahoo | shop | ratio |
|---|---|---|---|
| ja-SV2a-129 コイキング | $43.31 | $0.51 | 85x |
| ja-SV2a-093 ゴースト | $38.22 | $0.32 | 119x |
| ja-SV2a-130 ギャラドス | $48.41 | $0.76 | 64x |

SV2a is the 151 set, where every base card has a **master-ball mirror**
parallel sharing the same `129/165`. Yahoo's filter proves the listing names
the right card *and* the right set — and still returns the mirror, because
the mirror **is** card 129/165, just a different printing. The mirrors
genuinely sell for $20–50, so nothing looked anomalous in isolation.

Yuyu-tei lists each printing as its own SKU with the treatment in the name,
so it can separate them and we take the base deliberately.

`jpreconcile.js` (standalone, like jptest.js) measures this across every set:
**142 of 1,993 dual-priced cards (7.1%) had Yahoo ≥ 5x the shop price** —
concentrated in SV2a (52) and SV8a (28), the two sets with the heaviest
parallel treatments. Only 11 ran the other way. All 142 were corrected to the
shop price; `price_history` is append-only so the Yahoo rows remain.

### Decisive test — and a genuine exception to it
JA Common/Uncommon ≥ $100, excluding secret rares (`number > set_total`):
**2 remain**, down from 11 before this work. Both verified against the shop's
own rarity labels:

- `ja-CP6-33 ピカチュウ` — shop rarity **"C"**, ¥34,800 ($221.66). The
  Pokékyun Collection Pikachu really is a Common that trades in the hundreds.
- `ja-CP3-5 リザードン(キラ)` — shop rarity **"U"**, ¥17,800 ($113.38).

So **"no Common in the hundreds" has legitimate exceptions** and cannot be a
pass/fail gate on its own. Check the source's own rarity before calling it.

### Commands
```powershell
node ingest.js yuyutei [--set=SV8a] [--dry] [--all] [--max=N]
node ingest.js yuyutei --compare        # Yahoo vs shop disagreements
node jpreconcile.js [--write]           # correct parallel-printing errors
```
Default fills only cards with **no** real price, so a genuine auction median is
never overwritten by an asking price. 1.5s per page throughout.

### Mistakes made in this session, and their cleanup
Two patch attempts failed their anchor assertions but I launched the command
anyway, so `yuyutei --compare` ran as a **normal write** twice — 4,221
duplicate rows the first time, 91 the second. All duplicates were verified to
carry **identical** prices (0 cards disagreed) and were removed, leaving
exactly one row per card. Lesson recorded: check that a patch applied before
running the thing it was meant to change.

### Also found: ingest.js had lost two more functions
`evaluateAlerts` and `estFix` were **not** in ingest.js. They went in the
2026-08-21 revert; the 08-23 rebuild restored the JP filter subsystem but not
these. So **T3's alert engine had not run after any refresh for eight days**,
silently. The server routes and `alerts` columns survived (server.js was never
reverted), so nothing needed re-migrating. Both restored, re-registered, and
`refresh` calls `evaluateAlerts` again.

### Sources not pursued
Mercari and Cardmarket stay documented-dead (App Router / DPoP, Cloudflare
403) — not re-derived. **Cardrush, Rakuten Ichiba and Snkrdunk were not
probed**: Yuyu-tei alone took Japanese from 15% to 80%, and a second shop
source adds cross-checking rather than coverage. Rakuten is still the right
next step if a *sanctioned* API is wanted, and it needs a credential request.

### Two long-running jobs found in flight
- `ingest.js refresh all --max=4000` — the **nightly scheduled task, which is
  enabled and Running again** despite being disabled on 08-23. Started 08-28
  03:00 and still going 33h later, past its 6h `ExecutionTimeLimit`.
- `ingest.js manifest ja` — started 08-29 11:34, not by me.

Neither was stopped: `manifest ja` is wanted work (it fixes the secret-rare
rarity bug), and the refresh is the user's schedule. But `refresh` overwrites,
so it can churn the prices established here — see the CLAUDE.md warning about
never running it alongside a bulk price job.

---


## 2026-08-29 — TASK.md section A: search pipeline wired end to end

Free text now resolves to a card identity and lands on real listings.
`GET /api/search?q=` → cardparse → ranked candidates → (if confident)
`/api/listings/:cardId?grade=` in the same round trip.

### The project frontend was five weeks and 18 versions stale
`cardhunt_preview.html` in the project was a **Jul 15** snapshot: no BUILD
stamp, no backend URL, and no `renderListingFinder` — the function CLAUDE.md
and TASK.md both describe as existing. `Downloads/` held a versioned lineage
up to **v36 (Aug 22, BUILD 20260822-0833)** with a `BACKEND` const already
calling `/api/market/` and `/api/sets/`.

So the T2 frontend wiring from 08-26 went onto a file that is not the live UI.
Confirmed with the user, then adopted v36 (`cardhunt_preview.html.bak-t2work-20260827`
keeps the superseded work).

**v36 is not a superset** — the CLAUDE.md lesson held again. It adds 25
functions but is missing 8 from the old file (`heroSearch`, `doNavSearch`,
`tagSearch`, `renderResultsGrid`, `sortResults`, `filterByRarity`,
`renderMovers`, `pickGame`); its search screen was rebuilt around
`doSearch`/`screen-search`/`search-q` instead. Diff function inventories, not
sizes, before adopting any replacement.

### Two live data-corruption bugs found while testing A1

**1. `/api/market/:cardName` was writing name-matched prices into
`price_history` on every card view.** It persisted its aggregate with
`data.basis` as the source — the origin of 47 rows labelled
`"TCGPlayer market price"`. That aggregate comes from
`tcgplayerPrice(cardName, setName)`, which matches on **name and set only, no
collector number**.

Result: Mega Gengar ex **#284** (Special Illustration Rare, $1,056) was
overwritten with **$3.14**, the price of Mega Gengar ex **#125**, the Double
Rare. Pikachu ex #276 went $1,130 → $3.66. Xerneas EX went $105 → $2,503.
Ten cards were showing a wrong current price; the most recent bad write was
**2026-08-25**, i.e. from live use of the deployed app.

This is the v4.9 defect resurrected through a different code path — a read
endpoint injecting a weaker signal into the authoritative table. The write is
removed (`price_history` is the ingest pipeline's alone), the 47 rows are
purged (`namematched-purged-20260826.json`), and all ten cards are back to
their number-matched values.

**2. `name_en` was mis-assigned on 8 cards, in an off-by-N pattern.**
`ja-SV2a-199` マサキの転送 (Bill's Transfer, a Trainer) carried
`name_en = "Charizard ex"` — the name belonging to #201. That made the query
`Charizard ex 199/165 151` a **172-172 tie** between the real Charizard ex and
a Professor's-Research-style trainer.

| card | JA/ZH name | wrong name_en | belonged to |
|---|---|---|---|
| ja-SV2a-198 / zh-tw-SV2a-198 | ナナミの手助け | Venusaur ex | #200 |
| ja-SV2a-199 / zh-tw-SV2a-199 | マサキの転送 | Charizard ex | #201 |
| ja-SV2a-160 / zh-tw-SV2a-160 | たべのこし | Erika's Invitation | #196 |
| ja-SV2a-161 / zh-tw-SV2a-161 | エリカの招待 | Giovanni's Charisma | #197 |

Identical corruption in both `ja` and `zh-tw` — the English name list was
zipped against the card list with an offset. Nulled rather than guessed at
(backup: `nameen-nulled-20260826.json`); collision groups across every
language are now zero. This is the `name_en` poisoning the old CLAUDE.md note
warned `names <lang>` could cause.

### A third bug: "Raw NM" was not recognised as raw
`cardparse` emits `gradeString: 'Raw NM'` for every ungraded query, and the
frontend's `GRADE_GROUPS` uses `Raw NM`/`Raw LP`/`Raw MP`/`Raw HP`. But
`jpfilter.isRawGrade()` matched only bare `raw`/`ungraded`/`none`, so
`"Raw NM"` fell through to the **graded** branch and was matched against
titles as if it were a slab label. No title contains "Raw NM", so every
listing was rejected: `/api/search` returned **zero listings for every
ungraded query** while reporting `yahoo: ok`.

Caught because the same card returned 22 listings via `/api/listings` and 0
via `/api/search` — the discrepancy, not an error message, was the signal.
`isRawGrade` now accepts the whole `Raw *` family; 17 cases pin it.

The condition suffix is deliberately **not** filtered on: Yahoo states
condition in prose (状態B, やや傷あり), so claiming to separate LP from NM
would be a promise we cannot keep.

### A1 — `GET /api/search?q=`
Returns `query`, `parsed` (echoed so the UI can show what it understood and a
misparse is debuggable), `candidates[]` with `{cardId,name,number,setName,
rarity,image,price:{value,isReal},score}`, `grade`, `confident`, `gap`,
`resolved`. Empty results carry a `message` explaining *why* rather than
reading as "no mismatches".

### A2 — chaining
Top candidate must clear the runner-up by **40** to auto-resolve; below that
the candidates are returned for the user to choose. Confident hits fetch
listings inline through the same 15-minute cache, so text → buyable rows is
one round trip (3.0–5.9s cold, 0.45s cached).

### A3 — the search bar
`doSearch` now calls `/api/search`; the old catalogue search is preserved as
`doSearchLegacy` and runs automatically if our API is unreachable, so the bar
degrades instead of breaking. A confident hit calls `openCard` and presets
`LF.grade`. An ambiguous one renders candidate tiles with image, number/total,
set, price and score, plus an **UNDERSTOOD** chip row.

The real-listings panel is ported into v36's `renderListingFinder` — it fills
a `#cd-live` block above the marketplace search links, which are retained as
the fallback and retitled "SEARCH EVERY MARKETPLACE".

Also fixed while porting: the **"Live listings" tab called
`buildMockListings`**, which re-rendered simulated prices (`price*pct`, and a
`Math.random()` yen column) straight over the real listings
`renderListingFinder` had just fetched. It now re-renders the real panel.
The redundant `buildMockListings` call in `openCard` is gone too — it painted
fake prices for one frame before being overwritten.

### A4 — verified against reality, exact equality
`cardparse.test.js` (standalone, like jptest.js): **117 assertions, 0 failed.**
All eight required inputs resolve to the right card:

| query | resolves to |
|---|---|
| psa 10 Charizard VMAX Rainbow Rare Secret 074/073 Champion's Path GEM MINT | `en-swsh3.5-74` |
| Charizard ex 199/165 151 | `en-sv03.5-199` |
| bgs 9.5 Umbreon VMAX alt art 215/203 Evolving Skies | `en-swsh7-215` |
| cgc 10 Mega Gengar ex 284/217 | `en-me02.5-284` |
| raw near mint Pikachu ex 276 | `en-me02.5-276` |
| リザードンex 201/165 PSA10 | `ja-SV2a-201` |
| Mega Charizard Y ex 294 Ascended Heroes | `en-me02.5-294` |
| Charizard | **ambiguous — 10 candidates, no guess** |

TASK.md's illustrative id `en-swsh35-074` does not exist; the stored id is
`en-swsh3.5-74` (our set ids use `.5`, and that set stores numbers unpadded).
Tests assert what the database actually holds.

Regression guards added for: `psa10` unspaced, half-grades (`bgs 9.5`,
`cgc 8.5`), cert numbers, `lightly played` not leaving "lightly" in the name,
set codes (`s12a`), `mint` as a raw condition rather than a PSA label, and
empty input. The `raw near mint Pikachu ex 276` case is asserted by exact
equality specifically because a previous suite passed `"near pikachu ex"`
against an `includes()` check and hid that bug.

### Frontend verified without a browser
Renderers driven in node against the live API with a stubbed DOM:
- confident query → opens `en-me02.5-284`, sets `LF.grade = 'CGC 10'`
- `Charizard` → 24 candidate tiles, 20 images, scores shown, **no card opened**
- `ja-SV8a-202` Raw NM → 21 auction links, 21 thumbnails, ended section
  separated, source note, "ends in" rendered
- same card PSA 10 → different price band, 13 rows
- English card → explains why it is empty and lists every source's status

### Live auctions still need reading carefully
The cheapest PSA 10 for ja-SV8a-202 shows **$19.69** — a genuine
`1円～【PSA10】` auction mid-flight, correct card and grade, currently at
¥3,090 against a ~$90 market. `endsAt` is parsed from the live markup so the
row reads "auction · ends in 1d". `bidCount` is **not** present in the live
HTML (only in the ended JSON), so the UI omits the bid clause rather than
inventing one.

### Status
- Section A: **done and verified.**
- Section B (Japanese price sources): **not started.**

---


## 2026-08-26 — T2 listing finder: wired end to end, multi-source, cached

### The frontend had never called our backend at all
`cardhunt_preview.html` was a **pure pokemontcg.io client**. Its only API
constant was `const API='https://api.pokemontcg.io/v2'`; there was no Render
URL anywhere in the file, and all ten `fetch()` calls went to pokemontcg.io.
So "the frontend panel already exists" was true only in the sense that it
rendered six hard-coded search links with **simulated** prices
(`price*row.pct`, `'¥'+Math.round(price*(145+Math.random()*15))`).

Consequence for wiring: the frontend holds **pokemontcg.io card ids**
(`sv3pt5-4`), not ours (`en-sv03.5-004`). Rather than make the browser
translate, `/api/listings/:cardId` now resolves tolerantly —
`listingIdCandidates()` handles the `pt5`→`.5` convention, zero-padding
(`sv3`→`sv03`), and missing language prefixes. Verified:

| requested | resolved |
|---|---|
| `sv3pt5-4` | `en-sv03.5-004` Charmander |
| `sv3pt5-197` | `en-sv03.5-197` Giovanni's Charisma |
| `swsh12pt5gg-GG01` | `en-swsh12.5gg-GG01` Hisuian Voltorb |
| `base1-4` | `en-base1-4` Charizard |

Added `CH_API`, overridable for local work with
`localStorage.setItem('cardhunt_api','http://localhost:3111')`.

### Yahoo's LIVE search stopped serving __NEXT_DATA__
This is the big one. Verified 2026-08-26 with three consecutive fetches:
`/search/search` returns 525KB and **no** `__NEXT_DATA__`, while
`/closedsearch/closedsearch` still carries it.

Everything built on 08-20 was therefore reading **ended auctions only** — and
an ended auction cannot be bought. A listing finder whose entire purpose is
"the cheapest live listing, each link landing on the actual listing" was
serving dead links priced at whatever they closed for.

The live page does render structured attributes per result —
`data-auction-id / -title / -price / -img / -category / -isfreeshipping`,
plus `end:` epoch inside `data-cl-params`. `parseYahooLiveHtml()` reads those
into the same item shape the JSON produced, so **one filter serves both
feeds**. Live rows are now fetched first, ended rows are kept as comparables
but labelled and never sorted above something buyable.

For `ja-SV8a-202`: 32 listings, **15 buyable**, cheapest live $7.01.
Before this change: 17, all ended.

### Two more category bugs, found by mapping Yahoo's category ids
Sampling closed results for id→name pairs showed the old
"is it under トレーディングカードゲーム" test passing three things that are
not single cards:

| id | category | was | now |
|---|---|---|---|
| 2084317608 | シングルカード | pass | pass — this is the one we want |
| 25826 | トレーディングカードゲーム (root) | pass | pass |
| 2084309054 | **まとめ売り** (bulk sales) | **pass** | rejected |
| 2084317605 | **公式サプライ** (sleeves, binders) | **pass** | rejected |
| 2084317604 | パック、ボックス、特殊セット | rejected | rejected |

`まとめ売り` is a category whose entire purpose is lots. Title rules caught
most of them (まとめ is a lot word) but not all, and the category is decisive.

The live feed only exposes a numeric category id, so `jpItemIsCardCategory`
now falls back to an id allowlist when no names are present.

### Grade filtering — one real bug fixed
`jpTitleHasGrade` matched by substring after stripping whitespace, so
**"BGS 9" matched a "BGS 9.5" listing** — "BGS9" is a prefix of "BGS9.5".
Half-grades are real on BGS and CGC and a 9.5 sells well above a 9, so that
is a wrong-product match. Now boundary-checked with `(?![0-9.])`.

Both marketplace conventions run off the one definition — Yahoo writes
`PSA10リザードン` unspaced, eBay writes `PSA 10 Charizard` spaced; stripping
whitespace from both sides normalises them. `PSA鑑定10` also matches.

### Multi-source with a clean interface
`LISTING_SOURCES` is a registry: each entry has `id`, `label`, `applies(card)`
and `fetch(card, grade, limit)`, all returning the same normalised shape and
all run through `Promise.allSettled` with a 12s per-source timeout. A slow or
dead source degrades **that row only**; it cannot block or fail the response.
The response reports every source's status, so the UI can say *why* something
is missing instead of silently showing a short list.

eBay's slot is implemented and activates the moment `EBAY_CLIENT_ID` /
`EBAY_CLIENT_SECRET` appear — it reports `unconfigured` with the exact env
var names until then. **Its live API path is unverified** (no credentials to
test with); only its filter layer is covered by tests.

### Cache
15 minutes per card+grade, keyed `cardId|GRADE` on the resolved id.
Cold 3.0–3.8s, cached 0.45s. `?refresh=1` bypasses. Per-grade keys confirmed
separate. Map is capped at 500 entries so a long-lived dyno cannot leak.
The frontend mirrors the same TTL so re-renders don't re-hit the API.

### Verification — three real cards, listings inspected not counted

**Japanese chase — `ja-SV8a-217` ブラッキーex / Umbreon ex SAR #217 of 187**

| grade | count | price range | leakage |
|---|---|---|---|
| Raw | 20 (9 live) | $242–$382 | **0 slabs** |
| PSA 9 | 1 | $343.95 | **0 PSA 10** |
| PSA 10 | 37 (6 live) | $535–$891 | **0 PSA 9, 0 raw** |

All ten inspected PSA 10 titles state both `217/187` and PSA 10. The value
hierarchy is coherent — raw < PSA 9 < PSA 10 — which is the strongest single
signal that identity and grade matching are both right.

**Cheap common — `ja-SV8a-097` ゾロアーク, stored $1.08**
12 listings, cheapest live **$0.96**, every title carrying `097/187` or
`SV8a`. Stored price and live market agree.

**English chase — `en-me02.5-284` Mega Gengar ex, stored ~$1,066**
**Zero listings, and that is correct**: Yahoo is skipped (Japanese-language
marketplace), eBay is unconfigured, Cardmarket is 403, Mercari needs DPoP.
English cards have **no working live source** until eBay credentials exist.
The response says so per-source rather than returning an empty list.

### Frontend rendering verified without a browser
Ran the renderer in node against the real API with a stubbed DOM: 9,896 chars,
10 thumbnails, 10 real `page.auctions.yahoo.co.jp/jp/auction/` links, landed
prices $535.03–$636.95, ended section separated, deep links retained.

Degraded paths both keep the deep links:
- no matches → explains *why* ("we only show a listing when its title confirms
  the card AND the set — a near miss is worse than nothing")
- API unreachable → "Live listings unavailable — fetch failed. Search links
  below still work."

### A live auction's current bid is not its price
The cheapest row for `ja-SV8a-202` was $7.01 — a genuine `1円スタート`
auction mid-flight on the right card. Correct data, misleading if shown bare,
so `endsAt` and `bidCount` are parsed from the live markup and the UI renders
"auction · ends in 2h · 3 bids" rather than implying $7 is the price.

### Also noted
- `/ebay/deletion` returning 500 without `EBAY_VERIFICATION_TOKEN` is correct
  deliberate behaviour with a clear message, not a bug.
- Filter suite is now **52 cases, 18 of them asserting what it KEEPS**
  (was 32/13) — 20 new English/eBay cases.

### The JA price run finished while this was in progress
`768 priced, 11,933 without data`. JA now has **2,090 of 14,023** cards with a
real price (~15%). Consistent with the 08-20 run and with `jpcheck`'s measured
83% drop rate: most cheap Japanese cards have no single-card Yahoo market and
should carry estimates, not prices. Not investigated further here — T2 work
only touched server.js, jpfilter.js, jptest.js and the frontend.

---


## 2026-08-23 — JP refill investigation: the fix was reverted, not wrong

### The question was "did the refill die?" — it did not
`safeprices ja --all` (started 08-20) **ran to completion** on 08-21 at 10:57:
`2080 priced, 11943 without data`. No crash, no hang, no partial state. 15%
coverage was the honest output of the fixed filter, not a failure to finish.

### The real problem: ingest.js was replaced and silently lost the fix
`ingest.js` on disk was **174,082 bytes** — the pre-session size. The version
banner still read **v5.7.0**. Inside:

- no `require('./jpfilter')`
- `jpTitleIsSingleRaw` back to `if (!title) return true;   // can't judge — keep`
- none of `filtertest` / `ytest` / `jpcheck` / `jppurge` / `estfix` / `alerts`

Only `ingest.js` reverted. `server.js`, `jpfilter.js`, `CLAUDE.md` and
`refresh-daily.cmd` were untouched — consistent with a downloaded ingest.js
being moved over the top per the documented Windows workflow.

**Then the nightly task ran against the old filter for three nights** and
overwrote good rows with bad ones:

| night | `refresh ja` result |
|---|---|
| 08-21 | 682 refreshed |
| 08-22 | 71 refreshed |
| 08-23 | died instantly, task result `0xC000013A` |

`ja-S12a-105` (ラティアス, Uncommon) was rewritten to **$1,294.90** — worse
than the $993.63 the original bug produced, because `refresh` overwrites
rather than skips. This is why the decisive test still failed.

### Second defect found while re-checking: refreshDue never passed set_total
`refreshDue`'s query selected `set_api_id` but **not** `set_total`, so
`jpCtx()` handed the filter `setTotal: undefined`. `jpTitleMatchesNumber`
then skipped the total comparison entirely and `SM9 105/095` matched card
#105 again. Two independent paths to the same wrong answer.

Both are fixed:
- `set_total` added to the `refreshDue` select.
- `jpTitleMatchesNumber` now **fails closed**: with no `setTotal`, a title
  that states a number qualifies only if it also names the set. A check that
  cannot run must reject, never wave through.

### What changed, so this cannot repeat silently
- **`jptest.js`** — the 32 filter cases moved OUT of ingest.js into their own
  file, runnable as `node jptest.js`. Tests that live in the file being
  replaced disappear exactly when they are needed.
- **`preflightFilter()`** — `safeprices` and non-dry `refresh` run the filter
  self-test before writing anything and abort if it fails or if `jpfilter` /
  `jptest` cannot be loaded.
- 32 cases, **13 asserting what the filter KEEPS**.

### Cleanup
- Purged 1,550 JA yahoo rows recorded on/after 08-21 (backup:
  `yahoojp-purged-20260823092620.json`). The 08-21 block mixes good
  safeprices rows with bad refresh rows and cannot be separated by timestamp,
  so all of it went; the good ones refill.
- Left the 1,283 rows from 08-20, which are unambiguously fixed-code output.
- Nightly task **disabled** — it was the contamination vector, and running it
  alongside a full reprice is what caused the overlap on 08-21.

### Step 1 — SV8a proof (175 cards repriced, 30 priced)
| check | result |
|---|---|
| sample sizes spread, not piled at 45-50 | **PASS** — 3-4: 14, 5-9: 8, 10-19: 8, nothing above 19 |
| no Common in the hundreds | **PASS** — range $0.76 .. $16.82 |
| prices vary card to card | **PASS** — no clustering |

Direct listing inspection of `ja-SV8a-062` (エーフィ): all 16 survivors were
エーフィ 062/187 SV8a, ¥970-¥3,940, median ¥2,640 = $16.82. Real market data.

The disambiguation is demonstrably working: **サンダースex appears twice in
SV8a** — #052 at $0.76 and #209 at $31.86. Name-only matching gave both the
same number.

### Step 2 — M2a proof (179 cards repriced, 9 priced)
| check | result |
|---|---|
| sample spread | **PASS** — 3-4: 3, 5-9: 2, 10-19: 3, 20-34: 1 |
| no Common in the hundreds | **PASS** — Common tops out at $6.37 |
| prices vary | **PASS** |

Whole-set value hierarchy is now coherent, which it never was before:
SIR $4.59-$252 · Hyper Rare $140 · Rare Ultra $0.64-$27 · IR $0.71-$9.55 ·
Common $0.64-$6.37.

### Step 3 — full run
Launched detached via `Start-Process` (PID in `safeprices-ja.pid`), logging to
`safeprices-ja-20260823.log`. 12,701 cards need pricing, ~8.8 hours. Filter
self-test passed in-log before the first fetch. Confirmed writing to the
database, not just to the log.

### `pricecheck ja` does not work — it is English-only
`pricecheck ja SV8a` returns an empty table. The command matches against live
TCGPlayer by English name and has no Japanese path. It is not a verification
tool for JP data; use `ytest <cardId>` (shows the actual surviving listings)
or `jpcheck ja --set=X`.

### The remaining "Common in the hundreds" cases are a RARITY bug, not a price bug
11 JA cards still read Common/Uncommon above $100. Ten of them have
**number > set total** — they are secret rares mislabelled as Common:

| card | # of total | price |
|---|---|---|
| ja-MC-764 ピカチュウex | 764 of 742 | $955.41 |
| ja-SV8a-217 ブラッキーex | 217 of 187 | $302.55 |
| ja-SV9a-087 シロナのガブリアスex | 087 of 63 | $213.38 |

The eleventh, `ja-SM12a-159` レッドの挑戦 (#159 of 173), is a well-known SR
trainer worth ~$120. Their prices are plausible; their **rarity** is wrong.
`manifest ja` is the fix. Until it runs, "no Common in the hundreds" cannot be
used as a clean pass/fail signal — filter on `number > set_total` first.

---


## 2026-08-07 → 08-09 — T1/T2 session (ingest.js v5.2.0)

### Setup
- `node ingest.js status` → **v5.2.0** confirmed before starting.
- The rewritten `CLAUDE.md` was still sitting **unmoved in `Downloads`**; the
  project copy was the old 29,820-byte version. Installed it (old one kept as
  `CLAUDE.md.bak-20260803`).
- **v5.2.0 branched from before v4.7.1 and dropped those fixes** — no
  `official_tw`, no `fetchAll`, no `namefix`, no `JUNK_FLOOR_YAHOO`, no scraper
  retry. The *data* from those runs survives (zh-tw artwork 96%, `name_en`
  repaired), so nothing looks broken. But **`names <lang>` in v5.2.0 will
  re-poison `name_en`** — see the CLAUDE.md note. Not run.

---

## T1 · Rarity — English and Japanese DONE, Chinese running

Measured the claim first. Sampling 20 cards per set against TCGdex:

| set | mismatches before | after |
|---|---|---|
| me02.5 (already corrected) | — | **0** |
| sv08 | 9 / 20 | **0** |
| me05 | 11 / 20 | **0** |
| sv03.5 | 10 / 20 | **0** |

`manifest all` ran detached. **27,110 rarities corrected across 322 sets** —
roughly two thirds of the database was wrong. English (214 sets) and Japanese
(70) are complete and verified.

Rarity spread afterwards is healthy — 36.9% Common, far below the 70% that
signals a broken chain — and now contains `Promo` (3.0%), a real TCGdex value
that position-inference could never have produced.

### It crashed at set 322 of 375, and the cause was worth fixing
```
Error: Connection terminated unexpectedly
    throw er; // Unhandled 'error' event
Emitted 'error' event on BoundPool instance
```
Supabase's pooler drops idle connections. `pg` emits that on the **pool**, not
on the query, and in Node an `error` event with no listener is fatal — so a
four-hour job died and lost the remaining 53 sets. The pool replaces the dead
client on its own; it just needed someone listening. Added to `ingest.js`:

```js
db.on('error', e => console.log(`  [pool] idle client dropped: ${e.message} — continuing`));
```

Relaunched for `zh-tw` (83 sets) and `zh-cn` (8). This is the second time this
pooler drop has bitten; last session it killed a `names ja` run the same way.

### T1 COMPLETE — with an important caveat for Chinese
Both Chinese passes finished cleanly. **28,786 rarities corrected in total.**

Final spot checks: `en sv08` **0 mismatches of 21**, `ja SV11B` **0 of 22**.

But `zh-tw SI` first reported "**21 rarity mismatches of 20 sampled**" — more
mismatches than samples, on a set `manifest` had just reported 0 corrections
for. The two tools contradicted each other, so I checked the source directly:

```
zh-tw/cards/SI-001     妙蛙花V   rarity=(absent)
zh-tw/cards/SV8a-001   含羞苞    rarity=None      <- the literal string
ja/cards/SV11B-001     ツタージャ  rarity=Common
en/cards/sv08-001      Exeggcute rarity=Common
```

**TCGdex has no rarity for Chinese at all.** `manifest` was right to change
nothing; `verifyset` was wrong to call it a mismatch. Fixed — it now separates
"no rarity upstream" from a real disagreement, and zh-tw SI reads
`0 mismatches of 0 checkable, 21 with no rarity upstream`.

Two consequences worth carrying forward:
- **Chinese rarities remain position-inferred and unverifiable** — the same
  inference measured 19-31% accurate elsewhere, so treat Chinese rarity as
  unreliable. No TCGdex fix exists.
- The literal `"None"` is correctly discarded rather than stored: **0 rows** in
  the database hold it. Checked.

*(My first probe of this returned "absent" for every language including English
— because I had left `/cards/` out of the URL. Verify the tool before trusting
the output; the corrected probe is the one quoted above.)*

---

## T2 · Missing Japanese sets — the blocker is solved

`nameprobe ja S4` disproved this file's own prediction. TCGdex's per-card
endpoint — described as "the one to hope for" — returns **nothing, 0/3**. So it
can supply neither names nor rarity for these 107 sets, and `manifest` can never
repair them afterwards.

**`?display=list` is the answer.** One request per set returns a table with
number, name, type, **rarity** and an image. For S4: **111/111 with names,
images and real rarities**, against 0 names and 0 rarities from the grid.
107 sets becomes 107 requests instead of ~12,000 per-card fetches.

Implemented `extractLimitlessList`, tried ahead of the grid extractor:
- number read from the image **filename**, not row order — the same reasoning
  that fixed the grid's off-by-one image pairing;
- columns located from the `<th data-value>` header, so a re-ordered table
  can't silently shift name into rarity;
- `_XS` stripped for the full scan (15 KB → 343 KB, both verified HTTP 200).

`lmingest` now writes the real rarity and only infers as a last resort, and
`lmset` warns when it would — because that inference is permanent here.

**Verified both sides.** Names cross-checked against the independent per-card
pages (#1 タネボー, #2 コノハナ, #10 ヒトカゲ — all matched). Rarities sane:
44 Common / 34 Uncommon / 12 Double Rare / 11 Secret Rare / 10 Rare, every
VMAX a Double Rare, #111 Secret Rare. Not skewed, nothing left blank.

### A trap found before it could do damage
`lmingest` was about to write `inferRarity()` guesses for every card. Measured
against S4 and SV6a, where Limitless supplies the truth for all cards, that
inference agrees only **19-31%** of the time — it calls almost everything Common
when the real spread is Common/Uncommon/Rare. In these sets that would be
permanent, because `manifest` has no upstream to repair them from.

Limitless leaves the rarity cell blank for ordinary cards in the big reprint
sets (S8b: 140 of 277), and the per-card page has no rarity either — checked, so
the data genuinely isn't there. Those cards now store **`rarity = NULL`**, which
costs nothing: `estimate()` already does `normRarity(r) || 'Common'`, so an
unknown rarity prices exactly as the Common inference would have guessed —
without asserting it as fact.

Also fixed: `normRarity` mapped Limitless's **"Triple Rare"** to plain `Rare`
via a generic `includes('rare')` test — a $2.20 estimate for a VMAX that belongs
in the $20 band. Now maps to `Rare Ultra`, consistent with the existing `RRR`
entry.

### Canary before scale
Ingested **S8b alone** first — the worst case, 140 NULLs — and checked it end to
end before running the rest. 277 cards, 277 images, 0 placeholder names, and the
live API served it without complaint (`rarity: null` passes through; 277/277
images under `images.small`).

### Result
```
67 sets ingested from Limitless, 5,599 cards
39 sets not on Limitless either (ADV1-5, L1-L3, XY*a/b, SM1+..SM5+, CS* decks)
```

| Japanese | before | after |
|---|---|---|
| sets | 70 | **138** |
| cards | 8,159 | **14,023** |
| with a real rarity | — | 13,338 (95%) |
| with artwork | 71% | **83%** |
| placeholder names | — | **0** |

---

## T4 · Japanese prices ~2x too high — BUILT, and the stated cause was wrong

CLAUDE.md attributed this to multi-card lots. Measured first, on VSTAR Universe
ピカチュウ #205 — 50 closed listings:

| group | count | median | |
|---|---|---|---|
| everything | 50 | ¥92,000 | **$585.99** — what we stored |
| PSA/ARS graded | **38 (76%)** | ¥92,800 | |
| actual lots | **1** | ¥1,900 | |
| raw singles | 11 | ¥34,000 | **$216.56** (TCGPlayer $266) |

**Graded slabs, not lots.** A lot filter alone would have moved the median by
nothing. The second cause was a wrong-card match: `ラティアス 105` without a set
code returns ラティアス&ラティオスGX SR from **SM9**, a different and far dearer
card — that is where $1,261 for an Uncommon came from, not a bundle.

Two traps caught while building it:
- **`パック` and `BOX` are unusable as lot keywords** — ハイクラスパック is a set
  name. My first pass silently dropped valid ¥92,800 singles on that.
- Yahoo's own `avgPrice` covers every listing, graded included, so the fallback
  reproduced the same 2x error. Now only used when nothing was filtered.

```
ピカチュウ #205  $585.99 -> $203.82   (28 raw listings, 21 filtered out)
ラティアス #105  $1,261  ->   $7.01   (an Uncommon — plausible)
```

`node ingest.js yahootest` self-tests 4 must-keep and 5 must-drop titles.
It exists because a filter that only proves what it *catches* is exactly how the
bulk-commons regression happened.

**Not yet applied to stored data** — that needs `safeprices ja --all`, which is
T3's Japanese phase.

---

## T3 · Re-price — English phase RUNNING

English rarities were complete and verified before starting, which is the
dependency that actually matters here.

`pricefix en` found 3,387 card names duplicated within a set (Unown ×28,
Energy ×12, …) but only **360 TCGPlayer records** actually affected. Deleted,
and the blast radius checked on both sides:

```
tcgplayer  15,208 -> 14,848   (-360, exactly as reported)
yahoojp     6,395 ->  6,395   (untouched)
en cards with a real price  14,457 -> 14,105
```

`safeprices en --all` running detached — 17,588 cards (2,380 TCG Pocket
correctly skipped). **The 12.2-hour estimate is wrong**: at 22.8% after 10.5
hours the real figure is ~46 hours, because cards TCGPlayer doesn't have also
cost a 2.5s Cardmarket attempt. Logs to `safeprices-en.log`.

Output sanity-checked rather than assumed: two consecutive cards both priced
`$12.6` looked like the name-matching bug returning, but across 3,784 priced
cards there are **2,284 distinct prices**, and the most-repeated values are all
sub-$1 bulk commons — the legitimate floor pattern, not a broken matcher.

**Japanese phase also running** (`safeprices-ja.log`), with the T4 filter in
place — 12,034 cards, ~8.3 hours. Yahoo is a different host from TCGPlayer so
the two don't contend upstream. Early output looks right: source tags read
`yahoojp_22`, `yahoojp_24`, `yahoojp_25`, i.e. 22-25 *raw* listings surviving
the graded-slab filter out of the 50 fetched.

Chinese pricing is still to do.

---

## T5 · Simplified Chinese — CLOSED, no source exists
`lmingest zh-cn`: **0 of 49 sets.** Limitless carries no Chinese at all —
`/cards/zh`, `/cards/cn`, `/cards/tw`, `/cards/zh-cn`, `/cards/zh-tw`,
`/cards/sc` are every one **404**; only `/cards/jp/` and the international
`/cards/` exist.

Checked for contamination *before* running it: the non-`ja` branch of
`fetchLimitlessSet` falls back to the English path, so a Chinese set id that
happened to match an English set would have written English cards into Chinese
rows. `CSV1C`, `CS1aC`, `CSM1aC`, `CBB2C`, `CS4aC`, `SV7`, `SV8a` — all 404
there, so no risk. Keep that check if anyone retries this.

zh-cn stays at 8 sets / 877 cards. `setgap zh-tw` likewise: 15 empty upstream,
0 recoverable.

---

### Long jobs keep getting killed — launch them detached
Three harness-tracked background jobs were terminated mid-run in the previous
session. These are now started with `Start-Process -WindowStyle Hidden`, which
detaches them from the session:

```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',
  'cd C:\Users\chili\cardhunt; node ingest.js safeprices en --all *>&1 | Out-File safeprices-en.log'
```

---

## 2026-08-03 → 08-05 — autonomous session

### Where it ended up

| | start | end |
|---|---|---|
| English prices | 73.8% | **88.6%** — **99% of physical cards** |
| Japanese prices | 24.1% | 32.6% and climbing — fill still running |
| Chinese prices | 18.7% | queued behind Japanese in the same run |
| zh-tw artwork | 29% | **96%** — new source found and wired in |
| Japanese artwork | 71% | 71% — everything left is pre-2006, no source exists |
| name_en correctness | **69% of Japanese names wrong** | **0% wrong**, verified |

`ingest.js` **v4.6.0 → v4.7.1**. T4 and T6 both closed. Three defects found and
fixed that were not on the task list: wrong English names on most non-English
cards, a `clean --delete` that would have destroyed 46% of the real prices, and
a silent per-set failure in the new scraper. One left unfixed on purpose
(non-English set logos — the local `server.js` is behind production).

### Environment verified before starting
- `ingest.js` at **v4.6.0** (banner confirmed on startup output).
- `DATABASE_URL` present in User scope. Supabase connects.
- Project `CLAUDE.md` was **stale** (5,181 bytes, Jul 27 — predates the OPEN TASKS
  section entirely). Replaced with the current version from `Downloads`.

### Baseline (`node ingest.js status`)
```
en     214 sets  23,444 cards    17,292 real prices  73.8%
zh-tw   83 sets   7,436 cards \
zh-cn    8 sets     877 cards  >  1,552 real prices  18.7%
ja      70 sets   8,159 cards    1,967 real prices  24.1%
TOTAL            39,916 cards   20,811 real prices  52.1%
```

---

## Priority 1 — English price coverage

### Filter verification (per the "guard that rejected valid data" lesson)
Checked what the filters *keep*, not only what they catch:
- `isDigitalSet()` flagged exactly the 15 expected TCG Pocket sets
  (`A1 A1a A2 A2a A2b A3 A3a A3b A4 A4a B1 B1a B2 B2a P-A`) and **zero**
  physical sets. Not over-matching.
- `looksLikeJunk` / `JUNK_FLOOR = $5.00`: validation run on `mee` returned six
  bulk Energy cards at $0.10–$0.22 and **kept all six**. Repeated cheap prices
  survive the guard — precisely the regression that was fixed. Confirmed working.

### Run 1 — 12 sets, then interrupted
`run-prices-en.ps1` completed sv01, sv02, sv03, sv08, sv04, swsh12.5, sv03.5,
sv06, sv05, sv09, swsh4.5sv and was killed partway through sv07.

**Result of those 12 sets alone:**

| | before | after |
|---|---|---|
| English real prices | 17,292 | 18,809 |
| English coverage | 73.8% | **80.2%** |
| Physical-set coverage (`setcover en`) | 82% | **89%** |

Roughly 4 minutes per set, so the whole list is hours not days.

### Run 2 — resumed 2026-08-04 15:54, **FINISHED 2026-08-05 00:21**
`setcover en` re-measured after run 1; script rebuilt from the fresh numbers.
**64 physical sets** still below 80%, ordered by unpriced count descending:
`me01 (108) · lc (96) · sv08.5 (87) · sv04.5 (77) · swsh10.5 (75) · me02 (74) ·
sv07 (73) · me04 · me03 · sv10.5b · swsh12.5gg · sv10.5w · …`
down to the one-card `tk-hs-r` / `tk-hs-g` / `miscp` tails.

The 15 TCG Pocket sets (`A*`, `B*`, `P-A`, 2,480 cards) are **deliberately
excluded** — digital-only, no market exists, they can never be priced.

Logs to `prices-en.log`. Continues past per-set failures.

### P1 RESULT — done, and past the expected ceiling

| | start of session | now |
|---|---|---|
| English real prices | 17,292 | **20,767** |
| English coverage (all cards) | 73.8% | **88.6%** |
| **Physical-set coverage** (`setcover en`) | 82% | **99%** — 20,696 / 20,964 |

CLAUDE.md predicted a ceiling of 85–90%; physical coverage reached 99%. The
88.6% headline is held down only by the 2,480 TCG Pocket cards, which have no
market and never will. **English pricing is finished.** Nothing left to chase.

---

## Priority 2 — Chinese artwork — **SOURCE FOUND**

### What was ruled out first
- `imgprobe zh-tw` self-test passed 3/3 (checker verified working), then every
  URL-pattern candidate returned 0%. The pattern was never wrong —
  **TCGdex only exposes an `image` field when the asset actually exists.**
  `SV7a-053` has one → CDN 200. `SV6a-001` has none → CDN 404.
- The zh-tw set endpoint *does* carry `image` (unlike `rarity`), 64/64 for SV7a,
  so ingest was not dropping it.
- Dozens of zh-tw sets sit at exactly **20** images — a truncation signature.
  It isn't ours: TCGdex itself holds exactly 20 (localIds 001–020) for SV4a
  (of 314), SI (of 422), S12a (of 250), SV2a (of 207), and 0 for SC1a / SV-P /
  SV6a. **The DB already holds 100% of what TCGdex offers.** Exhausted, not
  misconfigured.
- Bulbapedia MediaWiki API: reachable, `File:CharizardBaseSet4.jpg` resolves
  (checker verified), but zero Chinese-character card files and no Chinese
  expansion pages. True negative.
- tcgcollector HTTP 403 (still blocking), ptcg.wiki and pokemon-cards.cn no
  response at all.

### The source: `asia.pokemon-card.com` — official Traditional Chinese database
```
POST https://asia.pokemon-card.com/tw/card-search/list/
     expansionCodes=<setId>&keyword=&pageNo=<n>      -> 20 cards per page
GET  https://asia.pokemon-card.com/tw/card-search/detail/<id>/
```
The list page carries the full-resolution image in `data-original`:
`https://asia.pokemon-card.com/tw/card-img/tw00009029.png` (verified HTTP 200,
image/png, 959 KB). The site lists 132 expansion codes and covers **all 71** of
our sets missing artwork.

### Guarding against the Limitless "card #1 got image #2" bug
That bug paired each `<img>` with a nearby `href` and silently mis-assigned
every card. Two rules applied here so it can't recur:
- the image is **never** paired with a nearby link — the card id is inside the
  filename (`tw00009029.png` → 9029), which is unambiguous;
- the collector number is read from that card's **own** detail page, and the
  page is confirmed to be the right one by checking its image id matches.
  Exactly one `N/N` string exists per detail page, so the first match is safe.

### Correctness proven before the bulk run
`verify-tw.js` compared the card name on the source page against our DB name for
the same collector number, sampling page 1 *and* page 5 so it wasn't only easy
early cards:

```
#  1  走路草      MATCH        #  4  飛天螳螂    MATCH
# 81  奇魯莉安    MATCH        # 91  蒼炎刃鬼    MATCH
```
4/4. This tests what the scraper **keeps**, not just that it returns rows.

### Implementation
`ingest.js` gained an optional **`fetchAll`** hook on `IMG_SCRAPERS` entries,
honoured by both `testScrapers` and `scrapeImages`, for sources that need POST /
pagination / per-card lookups instead of the GET `pages`+`extract` shape.
New scraper `official_tw` (`langs: ['zh-tw']`).

`node ingest.js imgsrc zh-tw SV4a` → **40/40 images from the first 2 pages.**

### Bulk run — **FINISHED** (`imgscrape-zhtw.log`)
71 sets walked at the unchanged 1.5 s rate limit.

**4,668 cards given real Traditional Chinese artwork.**

| | before | after |
|---|---|---|
| zh-tw artwork | 2,146 / 7,436 — **29%** | 6,814 / 7,436 — **92%** |
| 劍＆盾 series | partial | **99%** |
| 朱&紫 series | partial | 80% |

Three sets reported "no source": SV4a (294), SV4K (46), SV-P (94). **SV4a was a
silent transient failure** — it had returned 40/40 in the earlier `imgsrc` test.
A plain retry filled all 294. One failed HTTP call on page 1 was discarding a
whole set and reporting "no source", which is this project's recurring failure
mode, so `officialTWListRetry` now retries every page twice before giving up.

Final: **zh-tw artwork 6,814 → 7,108 of 7,436, ~96%.** Only SV4K (46) and SV-P
(94) genuinely have no match — their expansion codes differ from the TCGdex ids.
`imgscrape` only touches cards that still have no image, so it is safe to re-run.

### Verified end-to-end through the deployed API
```
GET /api/sets/SC1a/cards?lang=zh-tw
  source=cardhunt_db  count=172  with image=172
  sample: 飛天螳螂  https://asia.pokemon-card.com/tw/card-img/tw00002269.png
```
The language must go on the query string **after** the path. And the cards live
under `.data`, not `.cards` — reading the wrong key returns `undefined` and
looks exactly like an empty set. Both now recorded in CLAUDE.md.

**Simplified Chinese artwork is still unsolved** — `asia.pokemon-card.com`
serves Traditional only, and mainland Simplified is a separate CITIC site. But
see the duplication finding below: 829 of the 877 zh-cn cards are not really
Simplified data at all, so this matters less than the raw 0% suggests.

---

## Priority 4 — set-count investigations

### T4 · Simplified Chinese "missing" sets — **CLOSED, not a bug**
TCGdex lists 57 zh-cn sets, each with a plausible `cardCount.total`, but
**`GET /v2/zh-cn/sets/<id>` returns an empty `cards` array for 49 of them.**
Probed all 57 individually:

```
sets WITH card data: 8
CSMPiC:48  SV7:132  SV7a:64  SV8:106  SV8a:237  SV9:100  SV9a:92  SV10:98
total cards available: 877
```

**877 is exactly what our DB holds.** Nothing was skipped in error; there is
nothing to re-ingest. `CSV*C`, `CS*C`, `CSM*`, `CBB*` are catalogued upstream
without card data. The probe was proven to detect cards where they exist
(SV7a→64, SV8a→237, SV10→98), so this is a true negative, not a broken checker.

### T6 · "Japanese sets stop at 2022" — **CLOSED at the data layer**
The DB is correct. All 70 JP sets have `set_release` and `set_series` populated
(0 missing of either), running through **2026-05-22**:
```
M5 2026-05-22 · M4 2026-03-13 · M3 2026-01-23 · MC 2025-12-19 · M2a 2025-11-28
M2 2025-09-26 · M1L/M1S 2025-08-01 · SV11B/SV11W 2025-06-06 · SV10 2025-04-18
sets per year: … 2023:11  2024:10  2025:11  2026:3
```
Series buckets are correct too (26 Scarlet & Violet, 9 MEGA, 9 PCG, …), so the
symptom was T1 — ordering — which is already fixed in server v5.5. Re-check in
the browser against the build stamp; do not re-ingest.

### New finding: `set_logo` is empty for every non-English set
0/70 ja, 0/84 zh — but **that is upstream, not a `setmeta` bug**. TCGdex returns
no `logo` and no `symbol` field for ja or zh-tw sets at all, while English sets
return `https://assets.tcgdex.net/en/sv/sv08/logo`. Probe verified against both
sides. CLAUDE.md's claim that `setmeta` backfills logos holds for English only.

A source does exist if it's ever wanted: the official TW detail pages carry an
expansion mark, `.../tw/card-img/mark/twhk_sv4a_exp.png`.

---

---

## Found while investigating P4 — two real defects, both fixed

### A · `name_en` was wrong on most non-English cards — FIXED
`backfillNames` consulted an `EQUIV_EN_SET` partner's card **at the same
number** before ever consulting the dictionary. Different releases don't number
the same cards the same way, so the English name belonged to a different card —
and looked completely plausible in the UI.

Measured against the pokedex dictionary (ground truth for Pokémon names):

| | checkable | wrong |
|---|---|---|
| ja | 5,081 | **3,515 (69.2%)** |
| zh-tw | 5,675 | 1,922 (33.9%) |
| zh-cn | 551 | **501 (90.9%)** |

```
ja/SV11B-001  ツタージャ (Snivy)          stored "Ethan's Pinsir"
ja/M1L-006    セレビィ (Celebi)           stored "Tangela"
ja/M5-001     トロピウス (Tropius)        stored "Weedle"
zh-tw/SV7-001 芭瓢蟲 (Ledyba)             stored "Venusaur ex"
```

**First fix — and why it wasn't enough.** I restricted the number match to an
*exact set-id match*, assuming a shared id meant the same release. The audit
read 0% wrong. Then the next `names ja` run **put 299 wrong names back**, because
TCGdex reuses short ids across languages for different sets:

```
SM10  ja ダブルブレイズ    116 cards 2019-03   en Unbroken Bonds  234 2019-05
SM12  ja オルタージェネシス  117 cards 2019-09   en Cosmic Eclipse  271 2019-11
SV10  ja ロケット団の栄光    98 cards 2025-04   en Destined Rivals 244 2025-05
neo1  ja 金、銀、新世界へ    96 cards 2000-02   en Neo Genesis     111 2000-12
```
`neo1-002 チコリータ` (Chikorita) came back as "Azumarill".

**Final fix:** card names are never taken from an English release at all. The
dictionary decides; what it can't resolve stays NULL. The set *name* still comes
from an exact id match — 金、銀、新世界へ really is the set English calls Neo
Genesis.

**Verified the way the first attempt wasn't:** re-ran `names ja` from scratch
after the fix — `0 from English releases`, and the audit stayed at **0% wrong**.
A repair that passes its own audit isn't proof; the generating code has to be
re-run.

**New command `namefix <lang> [--apply]`** audits stored names against the
dictionary and repairs them.

*Both sides of the checker were verified before applying* — the flagged side
(dictionary values plainly right, stored values plainly wrong) **and** the kept
side, sampled across the whole list, which correctly preserved trainer
possessives (`サカキのニドクイン → Giovanni's Nidoqueen`) and regional forms
(`伽勒爾 火紅不倒翁 → Galarian Darumaka`).

Applied, across both rounds:
```
ja      3,814 corrected,  1,639 unprovable cleared
zh-tw   1,959 corrected,    618 unprovable cleared
zh-cn     538 corrected,    325 unprovable cleared
```
Final audit: **0.0% wrong in all three languages**, and it stays there after a
full re-run of `names`.

Coverage fell from a claimed 78% / 84% to a real **62.5% ja / 76.8% zh** — that
drop *is* the fix. The old number was counting wrong data.

### B · zh-cn is 829 duplicated Traditional cards — upstream, needs a decision
TCGdex's `zh-cn` endpoint returns **Traditional** text. Verified at the source:
`/v2/zh-cn/sets/SV7` and `/v2/zh-tw/sets/SV7` both return `001 芭瓢蟲` —
Traditional 蟲, not Simplified 虫.

In the DB all seven `SV*` sets are byte-identical to their zh-tw rows:
```
SV7 132/132 identical names   SV7a 64/64   SV8 106/106   SV8a 237/237
SV9 100/100   SV9a 92/92   SV10 98/98
```
Only **CSMPiC (48 cards, 对战派对组合 奖励包)** is genuinely Simplified.

So the Simplified tab still shows Traditional cards even though the frontend and
server substitution bugs were both fixed — **this copy is in the data, from
upstream.** Not fixable by us, and explicitly *not* to be papered over by
pasting zh-tw artwork or names onto those rows.

**Decision needed (product call, not a code fix):** hide the seven SV* sets from
the Simplified tab, or label them. Left in place for now.

---

## Priority 3 — old Japanese sets (pre-2006) — searched, no source
2,184 cards at 0%: PCG (722), ポケモンカードe / E1–E5 (492), PMCG (457),
neo (323), VS1 (143), web1 (47).

| Source | Result on `neo1` |
|---|---|
| limitless_jp | **404** — Limitless starts at Sword & Shield |
| pokemon_card_jp | HTTP 200, **0 images** — the official database doesn't reach back |
| pokellector_jp | `/jp/sets/*` 404; the set index lists English sets only |
| tcgcollector | **403** |
| pokecardex.com | has the cards, can't be read — below |

**PokéCardex is the near miss.** Its `sitemap_cartes_jp.xml` lists **28,093**
Japanese card pages at `/carte/jp/<id>`, covering exactly this era —
`/carte/jp/1` is Bulbizarre from Expansion Pack (PMCG1). There's a
`sitemap_cartes_chn.xml` for Chinese too. But the pages are entirely
client-rendered — no image URL anywhere in the HTML — and the React app's data
endpoint `/api/carte/jp/<id>` returns **403 with 0 bytes** even with the page's
own CSRF token, `X-Requested-With: XMLHttpRequest` and a matching `Referer`.

The images themselves are public: `/assets/images/sets/{SET}/HD/{num}.jpg`
verified at `.../sets/BS/HD/4.jpg` → HTTP 200, image/jpeg, 95 KB. **The missing
piece is the set-code vocabulary, not the URL** — and guessing those codes is
the exact failure mode this project has already hit twice. Stopped there.

These sets are 20+ years old and barely trade. The rarity tile stands.

---

## Priority 1b — ja / zh-tw / zh-cn price coverage — **RUNNING**
Started 2026-08-05 04:42, `run-prices-intl.ps1` → `prices-intl.log`.

161 set-jobs: 71 Japanese, 82 Traditional Chinese, 8 Simplified. Both languages
price from Yahoo Auctions, so they run **sequentially** — two parallel jobs
would double the request rate at one host. Modern sets first; the pre-2006
Japanese sets are last because they barely trade.

Starting point: ja 24% (12,384 unpriced), zh-tw 21% (11,768 unpriced),
zh-cn 0%. Expected ceilings per CLAUDE.md: Japanese ~70%, Chinese 40–60%.

Sanity check on the live output — prices vary card to card and the source column
varies (`yahoojp_36 / _40 / _44 / _50`), so the matcher is working rather than
repeating one lookup.

Progress so far: Japanese **24.1% → 32.8%** (1,967 → 2,675 real prices).

**Killed once at 15:11 after 7 sets; resumed 15:13 as 154 remaining set-jobs.**
Finished before the interruption — removed from the list:

| set | priced | no data |
|---|---|---|
| MC | 490 | 284 |
| SV4a | 174 | 146 |
| M2a | 142 | 108 |
| SV8a | 186 | 51 |
| S12a | 162 | 92 |
| SM12a | 157 | 69 |
| SV11B | 127 | 47 |
| | **1,438** | 797 |

`SV2a` was mid-run and was left in the list — on resume it started at 50%
complete, which is the resume behaviour working: `safeprices` only prices cards
that don't already have a real price, so re-running a partial set costs nothing.

**If the batch stops**, just start it again — nothing is lost and nothing is
repeated. `safeprices` only prices cards that still need pricing, and each set
is a separate `node` invocation:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\chili\cardhunt\run-prices-intl.ps1
```
To resume from a specific point instead, re-measure with `node ingest.js
setcover ja` (and `zh-tw`, `zh-cn`) and rebuild the arrays in that script —
that's how the English list was rebuilt after its interruption.

**Give this run the machine to itself.** MC took 8h56m — 41.5 s per card —
while three other node jobs were running. The next set ran at **3.0 s per card**,
exactly the Yahoo rate limit, once they finished. Same code, 14× the speed. At
3 s/card the remaining ~24,000 cards are roughly **20 hours**; at the contended
rate it would have been a fortnight.

---

## Also fixed this session

### C · `clean --delete` would have destroyed 46% of the real prices
`JUNK_FLOOR` was added to `looksLikeJunk` but never to `cleanBadPrices`, which
still deleted **every** price repeated across more than five cards at any value:

```
real price rows                       26,482
"clean --delete" would have removed   12,310   <- 46%
  of those, under $5 (bulk commons)   10,853   <- all legitimate
```

Raising the floor wasn't enough either — repetition never identified junk:
`$0.15` × 200 (TCGPlayer's floor), `$6.37` × 68 (¥1,000, Yahoo's minimum) and
`$5.00`/`$10.00`/`$25.00` × 10–24 (round seller prices on reverse holos) are all
real. Only `$5,399.95` × dozens — a sealed booster case — is junk, and what
marks it is the implausible **value**.

`clean --delete` now removes only prices over $50,000; the repeated-price list is
printed as advisory. Verified: it removed **0** rows and all 26,530 real prices
survive. `JUNK_FLOOR` is also currency-aware now (`$20` for Yahoo), because a
threshold tuned in dollars is wrong in yen.

### D · Concurrency limit on Supabase
Four concurrent `node ingest.js` processes killed one with
`FATAL: Connection terminated unexpectedly`. The `names ja` pass died there and
was re-run alone. Nothing corrupted — every command is resumable — but the
failure was one line in a log that otherwise looked complete. **Check a log's
tail for a stack trace before believing a job finished.** Keep it to two.

### E · Non-English set logos are broken images — NOT fixed, and read this first
`/api/sets/lang/zh-tw` returns a logo URL built from the set id
(`assets.tcgdex.net/zh-tw/swsh/S8a/logo.png`) which **404s**. Checked directly
rather than assumed: TCGdex's `/v2/zh-tw/sets` returns 98 sets and **0** carry a
`logo` field, so the URL is constructed, not passed through. Correct behaviour
is to emit no logo at all.

**Left unfixed deliberately — the local `server.js` is not what is deployed.**
It contains no reference to `set_logo` and none to `assets.tcgdex`, yet
production serves URLs on that host; its own logo line would return `''` for
zh-tw. Editing and redeploying the local copy would silently revert whatever
else the running version has. Pull the deployed file down and diff it first.

---

# 2026-09-04 · T1 — TCGdex pricing (Cardmarket + TCGplayer, no credentials)

TASK.md T1. Probed, cross-checked, built, **not yet written to production** —
every run so far has been `--dry`. `price_history` holds 0 rows with a
`tcgdex%` source.

## New files — all standalone, so a revert of ingest.js cannot take them

| File | Does |
|---|---|
| `tcgdexprice.js` | Parses the `pricing` block. No network, no database. |
| `tcgdexprice.test.js` | 70 assertions. |
| `fx.js` | EUR/JPY -> USD, returning the rate with every amount. |
| `tcgdexprobe.js` | `xcheck` `cmcheck` `census` `reverse` `coverage`. **Read-only — contains no INSERT or UPDATE.** |
| `tcgdexharvest.js` | The writer. `--dry` `--set=` `--max=` `--gaps-only` `--force`. |

`ingest.js` gained ~40 lines only: a `tcgdexprices` command that delegates, and
a `--prices` flag on `manifest`. Version banner still v5.7.0.

## What the probes found

**The documented shape is wrong in three ways.** The TCGplayer reverse key is
`reverse-holofoil`, not `reverse` (30 of 60 cards — reading `.reverse` reports
zero coverage). A provider can be present-but-**null**, not absent
(`"tcgplayer": null` on 11 of 60). **0 and null both mean "no data"** —
`ja/SV2a-201` carries `trend-holo: 0` on a €467 card.

**The cross-check validates both paths.** 40 English cards, TCGdex TCGplayer vs
our `tcgplayer_market`: median **1.020x, 37/37 agreement**, expensive cards to
the cent (Pikachu pl2-112 $328.45, Hypno ecard2-H12 $229.99). Cardmarket vs
Japanese sources: **no gross mismatches, median 1.595x** — a real EU premium,
so `tcgdex_cardmarket` is MEDIUM and cannot overwrite `yuyutei_shop`.

**Chinese looked like a 4,164-card win and was Japanese data.** See CLAUDE.md,
"A localised name does not mean localised data". `zh-tw/SV4a-001` returns 走路草
with `idProduct 746203` at €0.18 — identical to `ja/SV4a-001` ナゾノクサ.
`pricingAllowedFor()` now permits `en`/`ja` only and refuses anything unprobed.

**Yuyu-tei quotes shop ticks.** 56.4% of all 9,294 stored rows sit at or below
¥50 — a minimum listing price, not a valuation. `cmcheck` partitions them out
rather than reporting them as mismatches.

**The FX rate was 6.6% stale.** `1.09` inline in ingest.js against an ECB rate
of 1.1615. `fx.js` now fetches live and stamps its fallback.

## Two decisions taken deliberately

**Reverse-holo prices are collected and NOT written.** `price_history` has no
variant column and every reader takes the newest non-estimate row, so a reverse
row *is* the displayed base price. `tcgdexprobe.js reverse` shows **241 cards
already display a reverse price as their base** from existing
`tcgplayer_reverseHolofoil` rows — a pre-existing bug this would deepen. One
set alone (sv03.5) had 111 reverse prices withheld, so the value of adding a
variant column is now measurable.

**The FX rate is not stored per row.** TASK.md asks for it to be recorded.
`grades_json` is empty on all 86,843 rows but its *name* says grades, and
storing a rate there is the `/api/market/` mistake — a value that reads as one
thing and is another. `tcgdexharvest.js` writes to a `source_meta jsonb` column
if it exists and prints the rate to the log if it does not:
`ALTER TABLE price_history ADD COLUMN source_meta jsonb;`

## Measured value

| | English | Japanese |
|---|---|---|
| cards with no real price | 2,778 (11.8%) | 2,787 (19.9%) |
| of those, TCGdex prices | ~9% (≈240) | ~17% (≈465) |
| already-priced cards TCGdex also covers | 98% | — |

English gap-filling is modest because most English gaps are the digital-only
sets `isDigitalSet()` already excludes — "not every gap is a bug". **The English
value is cross-validation of ~20,000 existing prices, not new coverage.**

## Written to production 2026-09-05

`source_meta jsonb` added (`ADD COLUMN IF NOT EXISTS`, nullable; all 86,843
existing rows untouched, 0 non-null). Then `--gaps-only` for en and ja.

| | wrote | of which Cardmarket | TCGdex had no price | not on TCGdex |
|---|---|---|---|---|
| en | **298** | 78 | 2,478 | 2 |
| ja | **329** | 329 (all) | 2,178 | 280 |

Every row a gap fill — **0 overwrote an existing price**, and 0 disagreed with a
stored TCGplayer price by more than 40%. 135 English reverse-holo prices seen
and withheld. Coverage: **en 89.4%** (was 88), **ja 82.5%** (was 80).

Verified after the write: 0 rows with a non-positive price, 0 Cardmarket rows
missing an `fxRate`, and the three most valuable new English prices re-fetched
live and matched to the cent (Giratina V swsh11-186 $832.41, Victini
sv10.5b-171 $624.90, Mew ecard1-19 $466.66).

**Japanese additions are all Cardmarket**, which `cmcheck` measured at ~1.6x
above Japanese sources. They are EU retail — correct for what they are, and not
a JP market level. `sourcerank` keeps them from ever overwriting `yuyutei_shop`.

A canary of 10 rows was written first, found to carry `fxSource:"cache"` instead
of the rate's real provenance, deleted under an exact-count anchor check
(10 expected, 10 deleted, total back to 86,843), and `fx.js` fixed so a cache
hit preserves `source:'ecb'`. **A cache label is not provenance.**

### Two expensive Commons are real
`en-ex5.5-2` Wurmple $553 and `en-ex5.5-5` Pikachu $465 trip the "no Common in
the hundreds" gate. Both are genuine: **Poké Card Creator Pack, 2004, a 5-card
promo set**. TCGdex reports their rarity as `None` — our `Common` is the
positional inference CLAUDE.md warns about, not a source label.

Cardmarket's `low` on these is *higher* than its `trend` (1990 and 19999 against
476 and 400) — plainly bad data on their side. Taking `trend` as the headline
rather than `low` avoided it, for the reason documented in `readCardmarket`:
a low is one optimistic listing, not a market level.

## Not done
- `manifest --prices` is written and syntax-checked but has not been run against
  production, because `manifest` has no dry mode and would write.
- No full (non-gap) refresh run. That path would *update* existing prices rather
  than only fill gaps, and has not been exercised at scale.
- Reverse-holo prices still withheld pending a variant column on `price_history`.
- 280 Japanese gap cards are not on TCGdex at all — the Limitless-ingested sets.
- The `STATE` table in CLAUDE.md has an orphaned duplicate fragment (a stray
  `---|---|` header and a second, stale copy of the same table). Untouched.

---

# 2026-09-06 · eBay — the "credentials present / not set" contradiction

`/ebay/status` reported `ready: true`; `/api/listings/en-swsh3.5-74?grade=PSA 10`
reported `unconfigured: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set"`. Same
process, same variables. Reproduced against production before changing anything.

## It was not the module-load capture

The stale-const theory was right about the smell and wrong about the cause.
There is no `dotenv` in server.js, so on Render the environment is present
before the module body runs and the captured consts were populated.

The actual defect: **`getEbayToken()` returned a bare `null` for four unrelated
causes** and `sourceEbay` translated all four into one specific, confident and
usually false sentence about unset variables. The four:

1. credentials genuinely absent
2. eBay rejected the exchange (`if (!r.ok) return null`)
3. the host was unreachable (`catch { return null }`)
4. HTTP 200 carrying no `access_token`

Cases 2-4 are the ones that were happening, and all three said "not set".

## Fixed

- `getEbayTokenDetailed()` returns `{ token, error, unconfigured, status }`.
  `unconfigured` now means only case 1; 2-4 carry eBay's own `error` and
  `error_description`.
- Credentials read at call time via `ebayCreds()` / `ebayConfigured()`. The two
  module-load consts are gone. This was the reported theory and is correct
  hygiene regardless — it also removes the restart requirement.
- **Two token implementations existed** (`getEbayToken`, `scrEbayToken`) with
  separate caches and the same bug. `scrEbayToken` now delegates.
- A response without `expires_in` set the expiry to `NaN`; `Date.now() < NaN`
  is false, so **the token was never cached and every call re-authenticated**,
  spending the 5,000/day quota on token exchanges. Defaults to 7200s.
- The cache is keyed on the credentials, so changing them re-authenticates
  instead of serving a token minted from the old pair.
- `/ebay/status?probe=1` performs the real exchange. `readyMeans` says in the
  response that `ready` describes env vars, not eBay's opinion of them.
- The legacy `/api/listings/:cardName` route no longer reports `configured:
  false` when the credentials exist but were rejected.

Proved with deliberately invalid credentials — both endpoints now agree:

```
/ebay/status?probe=1   "credentials present", ready false,
                       "eBay rejected the token exchange: HTTP 401
                        — invalid_client: client authentication failed"
/api/listings          status "error", same reason
                       (was: status "unconfigured", "...not set")
```

That eBay answers `invalid_client` rather than `unsupported_grant_type` also
confirms the request itself — endpoint, Basic auth, grant type, scope — is
well-formed. **The remaining suspicion is a sandbox keyset against the
production endpoint.** One request after deploy settles it.

## Second bug, found while verifying the title gate

`jpTitleMatchesNumber` accepted a title with no `N/M` pair only if it contained
the set CODE (`swsh3.5`). English eBay titles state the set NAME
(`Champion's Path`) and never the code, so on eBay that branch could never fire
— only `74/73` was verifiable and every `#74 Champion's Path` title was dropped
silently. Set name is now accepted, **but only together with the number**,
which is stricter than the setId branch (that one checks no number at all).

Apostrophes are deleted rather than spaced: `Champion's Path` → `champion s
path` never matched the common seller spelling `Champions Path`.

`jptest.js` 69 → **81 cases**, 35 asserting the filter KEEPS a listing.
`filtertest` 17/17 unchanged.

## New files
- `ebaytoken.test.js` — 49 assertions, run against the shipped server.js source
  (extracted, not copied, so it cannot drift). Asserts WHICH reason is
  reported, not merely that a failure occurred — a test checking only "no
  token" passes against the broken version.
- `ebayprobe.js` — end-to-end, read-only, one card. Walks credentials → token →
  search → title gate and names the failing stage. Prints dropped titles WITH
  the reason, so "filtered everything away" cannot look like "no stock".

## Not verified — needs your action
**The live fetch is still unproven.** The credentials are on Render, not local,
and the deployed service runs the old code. After deploying:

```
/ebay/status?probe=1                     -> the real reason, in one request
node ebayprobe.js en-swsh3.5-74 "PSA 10" -> end to end, with credentials inline
```

If `tokenCheck.ok` is true and listings are still empty, it is the title gate or
the category filter, and `ebayprobe.js` stage 4 shows which.

---

# 2026-09-06 · eBay guards — T1 and T1b complete, T2 done, T3 BLOCKED on deploy

Precondition confirmed first: `ebayquota.js` and `ebayquota.test.js` were not
in the project root — they were sitting in `Downloads/` alongside a newer
`TASK.md`. Moved in (leaving `Downloads/server.js` alone: hash-identical to
local, and a downloaded file landing on local work has reverted this project
twice). **`node ebayquota.test.js` → 25 passed, 0 failed.**

## Built

`ebaycall.js` — the only path to eBay. Kill switch, serialising queue
(concurrency 1), 200ms pacing, quota check inside the lock, 429 breaker, 5xx
backoff, dry run, one log line per call, token redaction.
`ebaycall.test.js` — 70 assertions, every guard tripped.
`ebayratecheck.js` — asks eBay the real limit without needing a deploy.

All four eBay call sites routed: token exchange, `sourceEbay`, the legacy
by-name route, `ebayActive`. Verified no `await fetch(` to `api.ebay.com`
remains outside the guard.

## Guards verified by tripping them

| Guard | Forced how | Result |
|---|---|---|
| quota | `RESERVE` = `DAILY_LIMIT` | `status:'quota'`, reason + remaining + reset; blocked the token call too |
| kill switch | `EBAY_ENABLED=false` | `status:'disabled'`, eBay never contacted |
| serialisation | 2 concurrent requests | 2 sequential token exchanges (816ms, 911ms) |
| 429 | live stub on :4429 | breaker tripped, 2nd call refused off-network |
| 5xx | stub 503 | exactly 3 attempts then gave up |
| dry run | `?dryRun=1` | request returned, token `<redacted>`, quota unchanged |

**The quota trip nearly passed for the wrong reason.** Without credentials it
reported `unconfigured` — the credential check short-circuits before the gate.
Only with dummy credentials did it actually reach the gate.

`RESERVE` was restored and **hash-verified** against the pre-edit file
(`ea0646ad…`), with 25/25 re-run after.

## Two real bugs found

1. **`const body` shadowing** inside the retry loop put the request `body` in
   a temporal dead zone — every call, including every token exchange, threw
   `Cannot access 'body' before initialization`. The unit tests were written
   before POST support and **were not re-run after it landed**; a live stub
   found it immediately. Regression tests added for the POST path.
2. **Refactor downgraded the token diagnostics** — rejection, unreachable host
   and non-JSON collapsed into one generic message. Restored: `shortDetail`
   now parses eBay's OAuth dialect too, transport ≠ rejection, `nonJson` is
   distinct.

## T2 compliance — done
- No eBay rows in `price_history`: **zero** with an eBay `source` or
  `marketplace`. Yahoo's store-in-Supabase design deliberately NOT copied.
- `freshness` on every response with cache age ("cached 33s ago").
- Attribution per row and per response, `affiliated: false`, rows link to eBay.
- Deletion-handler obligation written in the code beside the handler.

## Adjacent finding, NOT fixed (not eBay, not in scope)
`/api/price/:cardId` writes to `price_history` on every view — the same
read-endpoint-writes pattern CLAUDE.md records as corrupting ten cards via
`/api/market/`, which *was* fixed. This one only fires for cards absent from
our DB and keys rows by the raw requested id, so it accumulates junk rather
than cross-contaminating prices. Flagged, left alone.

## BLOCKED — deploy is not happening
Commit `0a88dfd` pushed to `origin/main` (confirmed: remote head matches
local, nothing unpushed, all three files parse from the committed tree).
**Render has not picked it up after ~30 minutes** — `/api/ebay/quota` still
404s while `/ebay/status` still serves the previous build. The 13:56 commit
deployed automatically, so auto-deploy has worked before. Cannot see Render's
dashboard; check for a failed or paused deploy.

Blocked on that deploy:
- **T1 calibration** — `DAILY_LIMIT = 5000` remains an ASSUMPTION. Run
  `node ebayratecheck.js` with keys inline, or `/api/ebay/quota?probe=1`.
- **T3 live listings** — no eBay call has been made through the guards yet.
  The title gate's set-name matching still has not met a real eBay title.

No unguarded calls were made to verify T3 early, per the instruction that the
API must not be called until the guards are in place.

---

# 2026-09-09 · T1 exact matching, T1b labels, T3 refresh re-enabled, T4 fixed

Preconditions confirmed first: `cardmatch.test.js` 27, `listingparse.test.js`
26, `ebayquota.test.js` 25 — all passing before any change.

Also closed last session's open item: **`/api/ebay/quota?probe=1` asked eBay
directly and it reports a limit of 5000 over an 86400s window.** `DAILY_LIMIT`
is no longer an assumption; every threshold is calibrated to the right number.

## T1 — the query and the gate now describe the same card

Reproduced live first:
```
q    = "Charizard VMAX 74 PSA 10 pokemon card"
gate = { number:"74", setTotal:73, setName:"Champion's Path" }
```
Both dropped from the query. Now one `matchCard` feeds `cardmatch.buildQuery`
AND `cardmatch.verify`:
```
q = "Charizard VMAX 74/73 Champion's Path PSA 10 pokemon"
```
`cardmatch.js` is served at `GET /cardmatch.js` and the frontend's deep links
use that module rather than their own builder — asserted identical across 4
cards x 4 grades. Responses report `"N kept, M rejected of S scanned"` with a
reason per drop.

## Four bugs found by running the gate against REAL eBay titles

Synthetic titles found none of these.

**1. Reprints reuse the original numbering.** Base Set Charizard 4/102 PSA 10
kept 24 listings spanning **$536.75 to $249,999.95** — 19 were 2021
Celebrations reprints, which carry the original `4/102` and say "Base Set".
Fixed with `REPRINT_MARKERS` plus a release-year check (all 45,780 cards have a
date). **After: 4 kept, 22 rejected, zero Celebrations.**

**2. A hoped-for grade is not a grade.** `"(PSA 10 Contender)"` at $8,000 is an
UNGRADED card. Stripped before grades are read — and applied to the raw branch
too, so it is findable as raw rather than excluded from both searches.

**3. A different language is a different card.** The Japanese card kept 25
listings of which **6 were Korean** ($459-$632 vs $620-$715); Korean shares
SV2a numbering. **After: 66 kept, 9 rejected, zero Korean.**

**4. A Japanese set name was sent to eBay US.** `set_name_en` NULL meant the
query carried ポケモンカード151 and returned **zero** results — reported honestly
as "0 kept, 0 rejected". `buildQuery` now omits CJK set names specifically;
the first cut also dropped `"151"`, a real English set name.

## T1b — the parser labels, the gate decides
`edition`, `variant`, parsed rarity and year on every eBay row. 1st Edition,
Shadowless and Unlimited all read 4/102 and are all KEPT and labelled.

The cross-check needed narrowing: `listingparse.compare()` has **no name check
at all**, so every cardmatch rejection on name/reprint/year/language read as a
disagreement — 40 in the first live run, every one structural. Now compares
only number, set size, grade and lot/sealed/custom.

## Self-inflicted bug worth recording
A Python patch wrote a doubled-backslash `b` in a non-raw string, turning every
regex word boundary into a literal backspace. The file parsed, all tests
passed, and the language gate silently matched nothing. Same family as the
`'\D'` lesson, one level up — the bug was in the tool writing the code.

## T3 — nightly refresh RE-ENABLED
The condition was a clean week. The TaskScheduler Operational log only spans
**1.02 days** (unrelated tasks flood it) so it cannot answer that — but
`task-watch.log` covers **2026-09-01 to 09-09, 83 hourly observations, every
one `state=Disabled`**. The single "STATE CHANGED" is `Ready -> Disabled` on
09-01, the watch being established. No event 140 for CardHunt. Decisively,
`lastRun` never moved from 08/29 11:16:16, so the task did not fire even
during logging gaps.

Supervised bounded cycle (`refresh ja --max=40 --hours=1`): 6 refreshed, 34
without data, **0 demotions**, finished in ~2 min. Canary `ja-SV2a-129`
**unchanged at $0.51 `yuyutei_shop`** — its Aug 20 `yahoojp_3` row at $43.31
(85x wrong) is still refused.

Task re-enabled, **next run 2026-09-10 03:00**. `refresh-daily.cmd` verified to
pass `--hours=4` to node, so the budget binds where the work happens rather
than on the wrapper.

## T4 — done
`/api/price/:cardId` no longer writes to `price_history`. **server.js now
contains no price_history write at all.**

## NOT DONE — T2, graded pricing
Untouched. It needs a grade dimension in `price_history` (the same missing
dimension as the withheld reverse-holo variants, to be solved by one schema
change), a median per card per grade separated by edition, and a count so a
median of one is labelled as a data point rather than a market price. The
multiplier stays a labelled fallback. eBay now returns clean verified slab
listings, so the input this needs exists.

## 2026-09-18 — the frontend is served from Render at /app

`GET /app` sends `cardhunt_preview.html`. Live and verified in the browser:
the page loads, the build stamp reads `BUILD 20260918-3ab0529-dirty`, and
`[typeof window.CardMatch, typeof window.Estimator, typeof window.GradePrice]`
returns three `"object"` — the IIFE fix survived the move. All three modules
fetch 200 same-origin. The console is clean: not merely empty, but empty after
proving the capture works by emitting a probe first, since "no messages" from
a tool that is not listening looks identical to a clean page.

Cross-check, Base Set Charizard: set page `#4 · Rare · $882.02` and card page
`Rarity Rare / Market value $882.02`, same source `tcgplayer_market`, same
timestamp. Agreed.

A first run of that check read `#4 · Common · $7.67 est` — a 115x disagreement
that was **the harness, not the app**. The UI calls `openSet(id, aid||id)`; I
called `openSet('base1')`, so `apiSetId` was `undefined`, `/api/sets/undefined/
cards` 404'd, and the page fell through to the TCGdex estimate path exactly as
designed. Worth recording: a fallback firing correctly is indistinguishable
from a data bug if you do not check how you invoked the thing.

**No blanket static mount.** `approute.test.js` (standalone, gitignored with
the other tests) asserts both halves — 45 assertions, 24 of them naming a real
file in the project root that must 404. Temporarily adding
`express.static(__dirname)` turns 24 into `got 200 — EXPOSED`, so the exposure
half is known to fire. `.env` and `package-lock.json` were removed from that
list: they do not exist here, so their 404 proves nothing about the route.
Confirmed live too — `/server.js`, `/package.json` and `/cardhunt_preview.html`
are genuinely present on Render and all three 404.

Module `<script>` tags stay **absolute**. Under `file://` a root-relative
`/estimator.js` resolves to the filesystem root, so the offline fallback would
load none of them and silently drop to its inline tables.

**Not verified:** opening the local file in a browser. The Chrome extension
refuses `file://` URLs, so this was not checked and is not claimed. What is
checked: the served bytes are sha256-identical to the file on disk, and the
HTML diff is one comment block plus the build-stamp string — no code changed.

Also: the shell mangled a `
` inside a patch anchor mid-task — the `'\D'`
lesson for the third time. Anchors that carry no backslashes, and
`grep -c $'\x08'` on both files afterwards (0, 0).

## 2026-09-18 — both printing gates installed on the paths that lacked them

Inventory first, which is what found it. Two fixes, each correct, each wired
into one path:

| gate | eBay | Yahoo JP | deep links |
|---|---|---|---|
| reprint markers | yes | no | n/a |
| **year** | wired, **fed null** | no | n/a |
| **language** | yes | **no** | yes |

The year gate had **never fired on any live route**. `resolveListingCard` —
the single query behind both `/api/listings/:cardId` and `/api/search` — did
not SELECT `set_release`, so `setYear` was always null and `if (card.setYear)`
never passed. A 2021 Celebrations title was kept against a 1999 Base Set card.
`ebayprobe.js` does not select it either, so the probe agreed nothing was
wrong. CLAUDE.md's "22 rejected, zero Celebrations" was REPRINT_MARKERS alone.

The language gate ran on eBay and the frontend deep links but not on Yahoo JP,
where Korean prints actually appear — they share Japanese set codes.
`jpfilter.js` has zero hits for korean/hangul/setYear/reprint.

Fixed: `set_release` and `set_name_en` added to the resolver; `lang` and
`setYear` added to `filterCard`; `verify()`'s three printing steps factored
into `printingConflict()` and called by both marketplaces.

Two things that would have made the Yahoo install worse than the bug:
`languageOf` infers Chinese from bare CJK and Japanese IS CJK, so naively it
rejects any kanji-only Japanese title; and `LANG_WORDS` is built on \b, which
cannot match between CJK characters, so a Korean card listed as 韓国版 would
have sailed through a gate that was now "installed". `LANG_CJK_WORDS` plus
`cjkIsChinese:false` handle both.

**Verified live, both directions.** `yahoogate.js --query "ポケモンカード 韓国版"`
rejected 62 of 62, including `韓国版ポケモンカード メガフシギバナex RR M1L 003/063`
— Korean, Japanese set code, real collector number, the exact shape that used
to pass. `yahoogate.js ja-SV2a-201 ja-M2a-250` kept 28 of 28 ordinary
listings. On Render, `/api/listings/en-base1-4?dryRun=1` now reports
`setYear: 1999` where it reported null.

**Yahoo 403s Render**, so that half can only be checked locally — the deployed
API returns `yahoo: { status: 'error', reason: 'HTTP 403' }`. `yahoogate.js`
is the only way to exercise it and is gitignored with the other local probes.

**Partly blocked, stated rather than papered over:** `set_name_en` is now
selected, but only **7 of 138** Japanese sets have one. For the other 131 the
set name stays Japanese and `buildQuery` correctly omits it rather than asking
eBay US an unanswerable question. The code path is fixed; the data gap is not,
and no code change closes it.

`printinggate.test.js`, 28 assertions — blocks, allows (four Yahoo titles that
must survive), and a REACHABLE section asserting the SELECT and both card
builders. Reverting either fix fails exactly the four relevant assertions;
`api_card_id`, which was always selected, keeps passing as the control.
That section read the wrong text twice before it measured anything.

Escape-mangling hit twice more this session (five and six), both while writing
about it. The rule that works: build the literal from `chr()` codes, anchor
patches on lines with no backslashes, use a literal-text editor for whole
files carrying regex, and run the byte check every time.

## 2026-09-19 — the frontend browsed a set list half the app cannot resolve

`setaudit.js en`: 214 sets, every one served from `cardhunt_db`, no set-page
vs card-page price disagreements, listings resolve. 15 'problems', all of them
TCG Pocket (A1-B2a) and P-A promos — the documented digital-only gaps. **The
API is clean.** That is what made it certain the fault was in the page.

### Root cause

The page browsed `/api/sets` — 176 sets with pokemontcg.io ids — while cards,
prices and listings are keyed on `/api/sets/lang/en` (214, our ids). The server
aliases most of the old ids, so it worked on every set anyone checked. 33 had
no alias: 14 returned zero cards and fell through to `mockP()` estimates for
the whole set; 19 returned pokemontcg.io cards with ids like `base6-1` that
`/api/listings` cannot resolve. 92 database sets were unreachable entirely.

English was the only language not using `loadLangSets()`. It does now.

### Three silent substitutions, all fixed

`CARD_CACHE` has no expiry and takes whatever the set page drew, so one visit
to a fallback set pinned an estimate for the session and the card page
contradicted the set tile from the same click. English + `tcgdex` fell off the
end of `setSourceNote` and drew a set of pure estimates with no note. The card
page showed its headline bare while the tile said `est`.

### Found while verifying

Card page headline off by 1-2% from the tile, though the API agreed to the
cent. `renderMarketData()` was pasting `/api/market` over it — an aggregate
matched on **name and set only**. Ascended Heroes: Pikachu ex #057 $3.37 and
#276 $959.68, and `/api/market` answers **$3.17 for both**. The $959 card's
page showed ~$3 badged *high confidence*. Same defect v4.9 killed on the write
path, still live on the display path. Number-matched now always wins.

**`/api/market/:cardName` still ignores its `cardId` parameter.** The frontend
is safe regardless, which is the right place for the guarantee, but the
endpoint is wrong. Not fixed here — flagged.

### Verified in the browser, five set classes, 15 cards

| set | was | now |
|---|---|---|
| Base Set `en-base1` | ok | 102/102 priced, 3/3 match |
| 151 `en-sv03.5` | ok | 207/207 priced |
| Legendary Collection `en-lc` | browsed as `base6`, foreign ids | 110/110, 3/3 match |
| Dragon Majesty `en-sm7.5` | browsed as `sm75`, **0 cards -> estimates** | 78/78, 3/3 match |
| HGSS Promos `en-hgssp` | browsed as `hsp`, **0 cards -> estimates** | 25/25, 3/3 match |
| Ascended Heroes `en-me02.5` | headline overwritten by name match | Pikachu ex #276 $959.68, Mega Gengar ex #284 $870.68 |
| ja `ja-SV2a` | ok | 210/210, 3/3 match |

Listing gate, `en-base1-4` PSA 10 live: **5 kept, 23 rejected of 28 scanned**,
the rejections being Celebrations reprints and a 'Potential PSA 10'. Both
CLAUDE.md discriminators firing on real data.

### Cold start

The new fallback warning fired on a real cold start, which is the point of it,
and showed the gap it was reporting: Render sleeps, so the first visitor got
nothing from the API and was left on the broken embedded list with no retry.
Now five attempts over ~41s plus a visible on-page note. Confirmed live:
`[sets] database set list loaded on attempt 2`.

### Test notes

`setlist.test.js` (19 assertions, gitignored with the other tests) walks the
real endpoints and also parses the page's inline script — one syntax error
there breaks every screen and no other suite would notice.

Two own-goals worth recording. A fixed 2600-byte source slice truncated
`renderMarketData` and failed an assertion about code that was present. Then a
regex pinned `loadLangSets('en')` to zero arguments and went red when the
retry added one — **and that commit was pushed with the test failing because
only the last four lines of output were read.** Third and fourth time a
source-inspecting assertion here has measured the wrong text. Read the whole
result, not the tail.

## 2026-09-19b — three bounded follow-ups

### 1. /api/market uses the cardId it was already being given

The endpoint accepted `cardId` and never passed it anywhere. Every input it
did use is name-matched: `tcgplayerPrice()` searches `"{name} {set}"` and
takes `results[0]`; `ebayActive`/`ebaySold` run a name query through no title
gate.

Fixed via the same LATERAL join `/api/cards/:cardId` uses, so there is one
derivation of what a card is worth rather than a third. Live proof:

| cardId | before | after | nameMatched (kept) |
|---|---|---|---|
| Mega Hawlucha ex #116 | $230.48 | **$0.70** | 230.48 |
| Mega Hawlucha ex #268 | $230.48 | **$5.90** | 230.48 |
| Mega Hawlucha ex #283 | $230.48 | **$56.34** | 230.48 |
| Pikachu ex #057 | $3.17 | **$3.37** | 3.17 |
| Pikachu ex #276 | $3.17 | **$959.68** | 3.17 |

`matchedOn` is always present. With no cardId it returns `name+set` plus
`matchWarning`, rather than answering with whatever the name search found.
Still a read endpoint — `grep -c 'INSERT INTO price_history' server.js` is 0.

Browser-confirmed on the live page: #276 $959.68, Hawlucha #116 $0.70 and
#283 $56.34, each matching its set tile, badged 'matched on collector number'.
The frontend guard stays regardless; it is the right place for the guarantee.

### 2. The test helper that could report green about text it never read

`fnSrc` terminated only on `
function `, so `openCard`'s slice swallowed
`async function fetchMarketPrice`. Under-slicing is a false fail — noisy but
safe. Over-slicing is a **false pass**. It now stops at the next top-level
declaration including `async`, and has four assertions about itself; reverting
it fails two of them. Twenty other assertions read source through it.

### 3. setaudit.js stays tracked

Documented in its own header and beside a `!setaudit.js` negation in
`.gitignore`. Two things I got wrong and corrected in the notes rather than
leaving as folklore: the negation only helps against a rule added ABOVE it
(git is last-match-wins), and `git check-ignore` reports nothing for a tracked
file unless you pass `--no-index` — my first check said 'survives the hostile
pattern' and was measuring nothing. The durable guard is an assertion that the
file is in the index.

All 17 suites green: setlist 26, approute 45, printinggate 28, cardmatch 27,
matchparity 102, cardparse 101, jptest 81, plus the rest.

## 2026-09-19c — NOT_A_SINGLE_CARD lost its word boundaries

Reported by Roy, verified live with the new `linkaudit.js`.

The pattern was once `/\b(lot|box|tin|...)\b/i`. Splitting it into an array of
alternations joined with `|` dropped the boundaries; only four terms carrying
an inline `\b` survived. `tin` then matched inside Gira*tin*a and Des*tin*ed
Rivals, `lot` inside Lotad, `case` inside Casey, `box` inside Boxer.

Lost Origin's Giratinas and all of Destined Rivals: *all 75 scanned were
rejected — not a single card: tin*. Eight of twenty-five real card names.
Every suite passed, because none tested a card name containing a junk word as
a substring.

**Fix:** terms are a plain word list, `NOT_A_SINGLE_CARD_TERMS`, exported;
boundaries applied in code by `boundedTerm()`. They cannot be dropped again
because the terms never carry them.

**Measured both directions, against the old pattern read from `git show
HEAD:cardmatch.js` rather than retyped** — my hand-typed copy was wrong and
would have given a false comparison:

| corpus | old blocked | new blocked |
|---|---|---|
| genuine junk, 30 titles | 30 | 30 (no weakening) |
| real card names, 38 titles | 15 | **0** |

The plurals added (boxes, tins, cases, coins, pins, binders, toploaders,
stickers) are exactly what substring matching caught by accident.

**Live after deploy**, `linkaudit.js --live`:

| card | before | after |
|---|---|---|
| Giratina V #130 | all 75 rejected | 73 kept of 75 |
| Giratina VSTAR #131 | all 75 rejected | 72 kept of 75 |
| Giratina V #186 | all 75 rejected | 20 kept of 75 |
| Giratina VSTAR #201 | all rejected | 48 kept of 62 |
| Destined Rivals, 8 sampled | all rejected | 8/8 with links, 31-75 kept each |

`cardmatch3.test.js` 44/44. All other suites unchanged and green.

### Found while verifying: the listings panel had two writers

Giratina V #130's panel led with *2022 Pokémon Magnezone V #056 Lost Origin*
while `/api/listings` for that card returned 73 kept / 2 rejected of 75, all
genuine Giratina V 130/196.

`#cd-listings` had two writers — `renderListingFinder()` (gated) and
`renderMarketData()` calling `renderRealListings(m.listings)`, where
`m.listings` is `ebayActive()` on a NAME query with no title gate. Last
response won the element. That is T2c's tell: listings carrying no rejection
count have not run the gate. Ungated render removed.

Independent of, and older than, the boundary bug: `/api/market` never used the
gate, so wrong cards were shown on every card page that got a response from
it, including while the gate was rejecting everything.

Browser-confirmed: Giratina V #130 and Cynthia's Roserade #184 now show only
their own card, every row carrying the right number.

### Committed alongside

`linkaudit.js` — per-card diagnostic separating "eBay returned nothing" (A)
from "the gate rejected everything" (B) from "the card never resolved" (C).
Read-only, dry run by default. Tracked like `setaudit.js`.

Not merged from Roy's cardmatch.js: it lacks `stripSpeculative`,
`REPRINT_MARKERS`, `yearsIn` and `printingConflict`. Diff confined to two
hunks — the pattern block and the export line — and all four confirmed still
present afterwards.

---

## 2026-09-19 — the last gap in link accuracy: two keywords, one price test, and the deep links

`linkaudit.js --kept` printed the survivors rather than the rejections, which
is the only reason any of this was visible: **163 of 164 kept listings across
four cards were correct.** A gate measured on what it blocks reports 100%.

### T1 — the two keyword gaps

**`AiGrade 9.5` passed a Raw NM search at $987.** AiGrade was not in `GRADERS`,
so the slab was never recognised as a slab. `SLAB_WORDS` was a hand-typed
second copy of the grader list, and the two had drifted: ARS and HGA were in
one of them only.

`SLAB_WORDS` is now derived from `GRADERS_UNAMBIGUOUS` + `GRADERS_AMBIGUOUS`,
so a company cannot be half-installed again. Companies added, each checked to
exist first: AIGRADE / AI GRADE, ISA, KSA, PCA, CSG, BVG, BCCG, MNT. Refused:
GEM (it is in every "Gem Mint" title), RARE, MINT, TCG.

**Found while doing it — bare `tag` and `ace` were already in the slab list.**
`TAG TEAM` is a card mechanic, `ACE SPEC` is a rarity:

```
Pokemon Pikachu & Zekrom GX TAG TEAM 33/181 Team Up Ultra Rare NM
  -> wants raw, title indicates a graded slab: TAG
Master Ball ACE SPEC 086/064 Twilight Masquerade Secret Rare NM
  -> wants raw, title indicates a graded slab: ACE
```

Every TAG TEAM and every ACE SPEC card, unreachable in a raw search, with no
symptom but a short list. `GRADERS_AMBIGUOUS` (TAG, ACE, MNT — sellers write
`NM-MNT` on raw cards) is slab evidence only WITH a grade number.

**Fan art.** `Giratina V 186/196 Shiny Holo Lost Origin *Fan Art*` at $8.50.
Added: fan art, fanart, fan made, fanmade, art card, unofficial, not official,
handmade, homemade, inspired by. `art` alone is never a term.

`art card` is the dangerous one — sellers write **"Alt Art Card"** for the
most valuable cards in the game, this Giratina among them. `GENUINE_ART_PHRASES`
strips the genuine phrasing before the junk test, as `SET_NAME_PHRASES` does
for "Classic Collection". Measured in both directions; the strip replaces to
`~` rather than a space because `186/196 Alternate Art Card` reduced to
`186/196   Card` is matched by the `\d+\s*cards?` pattern — a genuine alt art
rejected as a 196-card lot.

`rawgate.test.js`, 55 assertions: 19 companies' slabs refused, and ordinary
raw titles, TAG TEAM, ACE SPEC, Alt Art, Full Art, Illustration Rare and
Special Art Rare all kept.

### T2 — the gap no keyword closes

Giratina V #186, one card, one grade, everything past the gate: **$2.08 to
$1,114.99, 536x.** The $2.08 title is word for word the shape of a genuine
one. Nothing in it can be matched against.

`outlier.js` compares each price to the median of the card's own listings:
implausible at or below 3% of it, unusually cheap at or below 10%, not applied
below a $15 median or under 5 priced listings. On the real #186 data it flags
$2.08, $8.50, $17, $20 and marks $25, leaving $299 and $1,114 alone.

Wired into `gatherListings` — after the gate, before the sort — so
`/api/listings` and `/api/search` cannot disagree. Flagged rows are **returned,
never removed**, sorted last ahead of buyable and ahead of price, greyed in the
UI with their reason. `cheapest` and `cheapestLive` skip them at both payload
sites. `usable()` in gradeprice.js drops `implausible` rows so the measured
grade price is not built on what was just flagged.

Live on `ja-SV2a-201` through Yahoo (local IP, 24 listings): median $273.26,
spread 9.7x, **0 flagged**, cheapest $50.84 left alone. A price test that fires
on an honest spread is worse than no price test.

`outlier.test.js` 12, `outlierwire.test.js` 32 — the second asserts the check
is REACHED, which is the failure this project repeats: a correct gate wired
into one path, or into none.

### T3 — the deep links, which are where the towels were

Roy's towels and fakes were not in the fetched listings, and `--kept` is why
that could be said with confidence. Three deep links never went through
`buildQuery` at all:

| row | query it sent |
|---|---|
| PriceCharting (sold tab) | the card name, alone |
| Amazon | `Pokemon <name> <grade>` |
| TCGPlayer / Yahoo JP | own concatenation, no collector number |

`Pokemon Giratina Raw NM` on Amazon asks for towels. All now go through
`cardQuery` → `cardmatch.buildQuery`; every eBay link carries `forLink: true`
and its negative keywords.

Presentation was the rest of it: the links sat beside the gated rows looking
equally trustworthy. They are now headed **UNFILTERED SEARCHES**, stating the
results are not checked by us, and the fetched block is marked *checked*.

All 21 standalone suites green.

### Found in the browser, verifying the above: eBay had already said it

The #186 panel showed

```
Pokemon 2022 Giratina V 186/196 Alternate Art Ultra Rare Lost Origin PCG 9
  $1,114.99   condition: Graded      — in a RAW NM search
```

The title gate could not reject it and must not be made to: `PCG` is how
sellers write "Pokémon Card Game", so adding it to `GRADERS` would eat
ordinary titles — the `tag`/`ace` mistake, volunteered.

**eBay itself labelled the item Graded, and nothing read that field.** The
same class as the missing `set_release` column: structured evidence present,
gate never reached it. `conditionSaysGraded()` now refuses a stated "Graded"
on a raw search, matching the leading `grad` so Gradata / Gradée count while
every negative form (Ungraded, Non gradée, Non gradata, Not graded) is
excluded explicitly.

One direction only. "eBay says ungraded, the title says PSA 10" is a sloppy
seller far more often than a fake, and rejecting on it would drop genuine
slabs. 14 assertions in `rawgate.test.js`, both directions.

### Reported: non-English listings on en-swsh11-186. Measured: the gate was fed

Checked before changing anything. The deployed dry-run gate block:

```
{ "setId":"swsh11", "grade":"Raw NM", "name":"Giratina V", "number":"186",
  "setTotal":196, "setName":"Lost Origin", "setYear":2022, "lang":"en" }
```

`lang: "en"` — and the same live run rejected
`Pokemon Giratina V Alternative Art Lost Origin 186/196 Spanish` with
*title says es, this card is en — a different language printing*. Of the 17
kept titles, `languageOf()` reads `en` on two and nothing on the rest; none
states another language.

**What is non-English in that panel is the condition string.** eBay localises
it to the seller's own site, so an English card sold from France reads
`Non gradée` and from Italy `Non gradata`. One of those titles says `ALT EN`.
Left as eBay returned it — it is the marketplace's own statement about the
item, and rewriting it is the substitution this project bans.

Every path audited, not just the reported one:

| path | language fed? |
|---|---|
| `/api/listings` -> `sourceEbay` | yes, `matchCard.lang` |
| `/api/listings` -> `sourceYahoo` | yes, `filterCard.lang` |
| frontend deep links | yes, `toMatchCard` — affects `forLink` negatives only |
| `/api/market`, `/api/listings/:cardName` | no card record at all, so no gate — and `renderRealListings` has had no caller since the two-writers fix |

Two real faults surfaced while looking:

**Three copies of "what language is this card".** `cardLanguage`'s regex, plus
`String(card.api_card_id || '').split('-')[0]` inline in BOTH card builders.
`languageFromCardId()` is the single implementation now. The split was also
looser: `'base1-4'` yields `'base1'` -> sliced to `'ba'`, so the gate would
compare every title against a language that does not exist. Present-but-wrong
beats null only until you notice null is now reported.

**The test asserted one builder and not the other.** `printinggate.test.js`
checked `filterCard` carried `lang` — because that was the one that had been
missing it — and never checked `matchCard`. The path that happened to be
right went unmeasured.

Fixed by making the skip observable rather than by rejecting on absence:
`verify()` returns `evidence: { language, year, setName, unchecked }`, both
sources return it as `sources.<id>.gate`, and a missing language adds a named
`gateWarning`. Nothing is refused over it.

`printinggate.test.js` 28 -> 55. The REACHABLE section now runs the real
derivation on real id shapes instead of grepping for a field name. Each new
assertion was watched failing first — `lang` deleted from `matchCard` (2 red),
the `split` restored (2 red, `base1-4` -> `"ba"`), the evidence field removed
(5 red, after making them null-safe: the first version aborted the suite
mid-run, and a test that cannot finish cannot say how much is broken).

---

## 2026-09-20 — Yuyu-tei answers Render, and five other sources asked once each

### The probe harness came first

`sourceprobe.js` runs the SAME module from a laptop and from Render, because
two implementations would leave "it is the IP" and "it is our code"
indistinguishable — the ambiguity the Yahoo Auctions result took weeks to
resolve. Fixed registry, no URL parameter: an endpoint that fetches a
caller-supplied URL is an SSRF hole into everything the server can reach,
including the platform's metadata service. Cached 30 minutes, because a
hammerable probe earns the block it is testing for.

**Its first run was wrong, and catching that is why the harness exists.** The
classifier matched `/cloudflare/` anywhere in the body and reported Yuyu-tei
as blocked. Yuyu-tei had served 1.17MB of Japanese shop page with 482 card
blocks; the word came from `cdnjs.cloudflare.com` in a stylesheet link.
`looksLikeJunk` in a new costume, and one edit from being written into
CLAUDE.md as fact. It now asks whether the expected markers are PRESENT
before diagnosing why not, and recognises a challenge structurally.

### T1 — Yuyu-tei serves Render

```
home IP   200   1,172,188 bytes
Render    200   1,172,188 bytes
```

Byte-identical. Yahoo Auctions blocking datacentre IPs said nothing about
this host and nobody had asked it in the two months since the parser was
written.

Japanese had deep links, a stored median and nothing live. It now has live
listings with per-card URLs, from a parser that already produced 9,294 stored
rows. `yuyutei.js` is tracked — it was gitignored as "local tooling", on the
stated reasoning "needs a database URL or a residential IP", and it needs
neither. That is the `estimator.js` mistake, recorded at the top of the very
file that was ignoring it.

Verified with `linkaudit --live --kept` on three cards, reading titles:

| card | result |
|---|---|
| `ja-SV8a-002` リーフィア | ¥80 base printing, beside 69 eBay rows at $1.20-1.89 |
| `ja-CP6-33` ピカチュウ | **eBay returns nothing**; Yuyu-tei is the only listing, $156.98 |
| `ja-SV2a-201` リザードンex | $441.83 vs an eBay median of $445.74 — **1% apart** |

The third is the strongest evidence in the session: two entirely independent
sources, one Japanese shop and one US marketplace, agreeing within 1% on a
$450 card. The second is the gap being filled — a card with no eBay presence
at all now has a real, linkable listing.

`ja-CP6-33` also re-proves an old lesson on a new source: it is rarity `C`
at ¥24,800, and nothing rejected it for being an expensive Common.

**The master-ball mirror, in a new place.** 144 of 482 numbers on one set page
carry parallel printings up to 37x apart — リーフィア ¥80 base, ¥680
monster-ball, ¥2,980 master-ball. Our catalogue holds one row per number, so
`pickVariants` keeps the base printing and never a mixture. Live: #001 and
#002 return ¥50 and ¥80, not ¥500 and ¥2,980.

**Counting honestly.** The first run reported "1 kept, 0 rejected of 482
scanned", which reads as a 99.8% rejection that never happened — 481 of those
are different cards. `scanned` is now what the gate examined, with
`pageEntries` and `atNumber` reporting the narrowing.

**Asking prices stay labelled.** `priceKind: 'shop-ask'` on the row and the
source block, rendered as "shop asking price" in the panel. The row carries it
rather than the envelope, for the same reason eBay's attribution does: a row
gets rendered far from anything that would otherwise explain it.

### T1b — the Yahoo Shopping credential is refused, and that is not a block

The first Render probe returned 403 and the harness called it `blocked` — the
Yahoo Auctions word, meaning "this IP is refused". Wrong, and it would have
killed a working source. The discriminator, found from a laptop with no
credential:

```
no appid     -> 401  "Authentication parameters in your request incompleted."
bogus appid  -> 403  "Your Request was Forbidden"
```

Render returns the second exactly. `shopping.yahooapis.jp` answers a
datacentre IP fine; the KEY is what it rejected. `YAHOO_SHOPPING_CLIENT_ID`
is set on Render (56 chars) and Yahoo does not accept it.

Nothing was built on it, deliberately. The shape cannot be verified without a
working key, and a parser written against documentation is the failure this
task was defined to avoid. One probe finishes it the moment the key works.

### T3 — there is no TCGplayer application to put in

`docs.tcgplayer.com/docs/getting-started`, verbatim: *"We are no longer
granting new API access at this time."* No form, no email, no partner route.
Checked at the primary source because a third-party summary is not evidence.
The mirror of the eBay lesson: there a barrier was assumed and false, here an
application is assumed and absent.

What it was wanted for we already hold — TCGdex pricing keyed by TCGplayer's
own productId, validated 37 of 37 at a median 1.020x.

### T4 — five probes, recorded either way

Troll and Toad, Card Kingdom and PriceCharting all answer Render. COMC and
Cardrush 403 **a residential IP too**, so neither is an IP problem to route
around — they belong with Facebook.

PriceCharting's `search-products` returns `{"products":[...]}` as JSON, so the
"reference deep link only" note beside it is out of date and it is the
cheapest of the three to adopt.

Not built: three parsers is three verification passes, and each deserves its
own rather than being tacked onto this one.

---

## 2026-09-21 — the Yahoo 403: four hypotheses, four requests, two of them mine and wrong

Roy confirmed the Client ID at 96 characters from the portal. Render reported
56 yesterday and reports **96 today**, so the value changed in between and
yesterday's reading was accurate when taken. The paste question is closed and
the 403 remains.

### Yahoo documents two auth methods; the probe was sending neither faithfully

From `developer.yahoo.co.jp/appendix/request/`, verbatim:

```
User-Agent: <元のUser-Agent文字列>; Yahoo AppID: <あなたのClient ID>
appid=<あなたのClient ID>
```

The probe sent a Chrome User-Agent with `appid` in the query. Six variants
now exist, each isolating one difference, and the baseline was established
**with a deliberately bogus key** so every reading is attributable:

| variant | bogus key | real key (Render) |
|---|---|---|
| V3 · appid query | 403 | 403 |
| V3 · Yahoo AppID in User-Agent | 403 | 403 |
| V3 · both | 401 "...conflicted" | 401 "...conflicted" |
| V3 · non-browser UA | 403 | 403 |
| V1 / V2 (旧仕様) | 500 「ページが表示できません」 | 403 + EEA notice |

UA-only returning **403 rather than 401** is the informative cell: Yahoo
found a credential in the User-Agent and rejected it, so that method is read.
Sending both is an error in its own right.

### The geo-block I was sure of, and the two requests that killed it

Render's V1/V2 probes return 403 carrying Yahoo JAPAN's withdrawal notice —
【お知らせ】欧州経済領域（EEA）およびイギリスからご利用のお客様へ — while
the same endpoints from a residential Israeli IP return a plain 500 with no
notice. A difference between the two IPs, in Yahoo's own words. I recorded it
as a geo-block and wrote it up.

The discriminator that settles it needs **no credential at all**: V3 with no
`appid`. From a served region Yahoo answers `401 "Authentication parameters
in your request incompleted"` — it looked for a key and found none.

**Render answers 401 too, identically.** So Yahoo examines credentials from
that IP and the refusal is not geographic. The EEA notice is an artefact of
two withdrawn endpoints. Render's egress is a US address whose geolocation
resolves to the geographic centre of the United States — unplaceable — which
is presumably what a decommissioned host reaches for.

Two confident wrong answers in one session, both from a probe reporting a
status the response did not support. The classifier now checks for a geo
notice **before** the credential branch, because a statement about the
request's ORIGIN cannot be changed by any credential.

### Length is not identity

"96 on the portal, 96 on Render" is weak evidence — any two 96-character
strings agree on length. The probe now fingerprints instead of measuring:
`sha256:b4248ac0169d`, 96 characters, no whitespace, no non-ASCII. Twelve hex
characters cannot be reversed into a credential, and whoever holds the portal
value runs the same one-liner and compares. Verified against an independent
computation, and the secret appears nowhere in the output.

**Built nothing.** No variant says `ok`. The one measurement still missing is
the real key from a served IP, which needs the value in a local shell —
`ok` there against 403 on Render would overturn all of the above and should
be believed over it.

---

## 2026-09-28 — T1-T3 shipped, T4 (cert verification) measured, not built

TASK.md was already in the project (gitignored) and was worked from.

- **T1 `ceadfbc`** — eBay paged past 75 when `total` says so, max 3 pages.
  Live: JP Charizard ex 201 PSA 10, 172 of 175 examined (was 75), 138 kept;
  Base Set Charizard Raw NM "first 225 of 677 examined", stoppedAtCap. Panel
  shows it. `ebaypaging.test.js` 19 pass; 13 fail on the pre-fix server.
- **T2 `7c3f856`** — unspaced "PSA10": 3/829 eBay slabs, 494/652 Yahoo graded.
  0 false matches on 1,212 raw TAG TEAM / ACE SPEC titles. 5,064 replayed
  verdicts: 7 gained, 0 lost. Unambiguous graders only; bare "?" = speculation.
  `unspaced.test.js` 41 pass; 12 fail on the old gate.
- **T3 `8be7a97`** — nav wraps under 640px; all nine screens overflowed.
  Content overflows remain on home/sets/alerts/portfolio (measured, listed in CLAUDE.md).
- **T4** — `/api/ebay/certprobe` (`e47fac8`). Cert number: 0/829 in titles,
  0/829 in summaries, not an aspect; getItem descriptor on 183/232 slabs
  (78.9%); getItems is 403 to our keyset. PSA API is the only one; its server
  says 100/day. BGS/CGC/SGC/TAG: no API. ~420 eBay calls spent measuring.
- Seen in passing: `/api/search?q=Pikachu Zekrom GX` returns **zero**
  candidates although `en-sm9-33` exists — the open "Zekrom-GX" item is wider
  than the hyphen.

---

## 2026-09-28 — T7: three features, three answers, and a sweep

- **Photos fixed**: `/api/photos/:cardId?item=` returns the listing's real
  eBay images (`image` + `additionalImages`, deduped, never padded). Shares
  ONE getItem cache entry with `/api/cert` (`ebayItemOnDemand`), 15 minutes,
  in memory. Every eBay row with an itemId gets a Photos button; Verify stays
  PSA-only on the same line. Browser: 25 of 25 rows offered Photos; the row's
  eBay thumbnail shows alone while loading, no strip for one image.
- **Checkout** → `checkout-disabled.js`; the fake **login** (any password ->
  "Alex") → `login-disabled.js`. Both tracked, never loaded, 404 on `/app`'s
  server. Every entry point gone (4 Login buttons, 6 "A" avatars, photos Buy).
- **Near you**: invented shops out, empty state in, recorded as planned.
- **Sweep**: alert savings `Math.random`, portfolio PORT, ME2PT5 typed
  prices (45), TCGdex est low/high, "Auto-refreshing", "20,324 cards", and
  buildMockListings' unreachable live branch (price x pct, random yen).
- Before deploy, `nofabricated.test.js --deployed` against Render: password
  input, card-number input and payment labels PRESENT — the check fires.

## 2026-09-28 — T1: measured on Render, biggest cost named and fixed

`dbeb1e1` deployed the timings. 12 cold listings views: mean 1,669ms server,
eBay 81%, queue-wait 512ms (31%). Cause found in the browser: every card
open fired /api/listings TWICE (panel + tile average) and /api/market with
it, all into one serial eBay queue. Fix: one shared fetchListings(); market
after listings. Browser after: 1 request, qwait 0, painted 0.9-2.7s.
Flagged, not touched: /api/market scrapes eBay completed-listings HTML.

## 2026-09-29 — T5, T6; T2 stopped

- T5: cel25cc 25 -> Classic Collection; "None"->"Common" removed from
  manifest's map; whole-catalogue diff clean. 201 JA secret-rare slots found
  stored as Common from earlier runs — measured, not repaired.
- T6: 30th-c 19 real / 11 estimate -> 30 / 30 real. Pricing now uses the
  printed number and TCGPlayer's exact reprint set; safeprices' undeclared
  `force` fixed. Charizard $0.71 -> $205.58, Lugia $41.90 -> $383.76.
- T2: search audit reached 5,500 of 21,272 numbered queries, then was
  stopped by the system for low memory (~400MB free; Chrome held 3.2GB).
  Checkpoint in sa-20260928.json; resume with --resume. No failure count yet.
