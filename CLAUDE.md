# CardHunt — Project Context

Pokémon TCG price tracker and cross-marketplace listing finder. English,
Japanese, Traditional and Simplified Chinese.

**The product's reason to exist:** search any card, see the cheapest live
listing from every reachable marketplace, for every condition from raw through
graded by company and grade, with each link landing on the actual listing.

## THE BUDGET — read before you add a line

**This file has a 60,000-character budget. `claudesplit.test.js` fails above
it.** CLAUDE.md holds what a session needs to work correctly. Nothing else.

| belongs here | belongs elsewhere |
|---|---|
| a rule, in one or two lines | the measurement that produced it -> PROGRESS.md |
| current state and counts | the history of how they changed -> CLAUDE_ARCHIVE.md |
| the commands list | a session's narrative -> PROGRESS.md |
| settled decisions, one line each | the investigation behind them -> archive |
| the gates and coverage tables | per-run before/after numbers -> PROGRESS.md |

**A finding gets one line and a pointer:** "a word list must never read the
card's own name — Forbidden Light refused 236 cards (PROGRESS 2026-10-04)".
The 201-set audit table is not. Over budget? Move detail out before adding.

Where a number is stated it was measured; tables carry their date. Re-measure
rather than re-derive. `CLAUDE_ARCHIVE.md` is the full history (frozen
2026-10-01, plus "MOVED FROM CLAUDE.md, 2026-10-05 (T0, the 60k budget)" and
"MOVED FROM CLAUDE.md, 2026-10-07 (compression)",
"MOVED FROM CLAUDE.md, 2026-10-07 (budget, second pass)",
"MOVED FROM CLAUDE.md, 2026-10-09 (budget, third pass)" — with "Windows: replacing ingest.js",
"MOVED FROM CLAUDE.md, 2026-10-09 (budget, fourth pass)").
"PROGRESS 2026-10-05: X" means the block headed X in PROGRESS.md's 2026-10-05
entry — the verbatim measurements this file carried until then. **A bug's
history may move to the archive; its lesson may not** — `claudesplit.test.js`
fails if an archive heading is neither kept here nor cited from here.

---

# ARCHITECTURE

```
Browser  ->  https://cardhunt-backend.onrender.com/app
Render API (server.js v5.6.0)  -- reads Supabase FIRST (45,781 cards)
  live listings per request: eBay Browse API · Yuyu-tei · Yahoo Auctions JP (local only)
  fallback only for sets not yet ingested: TCGdex · pokemontcg.io · Limitless
```

| Piece | File | Runs on |
|---|---|---|
| Frontend | `cardhunt_preview.html` | Render at **`/app`**; local file is the fallback |
| API | `server.js` v5.6.0 | Render |
| Database | Supabase Postgres | `cards`, `price_history`, `alerts`, `portfolio`, `users`, `listing_photo_verdicts`, `listing_views` |
| Ingestion | `ingest.js` v5.10.4 | Local only — never deployed; **tracked** in git |

## The module map

Shared, never copied — every duplicated implementation here has drifted.

| Module | Answers |
|---|---|
| `cardmatch.js` | does this listing show EXACTLY the card? builds the query, runs the gate; `REPRINT_OF`, `LOOKALIKES`, `SET_WRITTEN_AS` |
| `cardparse.js` · `listingparse.js` | free text -> card identity · a seller's title -> card data |
| `jpfilter.js` | Yahoo/Yuyu-tei: a single raw copy? lot vocabulary |
| `outlier.js` | too cheap to be the real card? flags, never rejects |
| `gradeprice.js` | a grade's worth from real listings, or nothing — NO estimator (deleted 2026-10-09) |
| `sourcerank.js` | which price source may overwrite which |
| `tcgdexprice.js` · `yuyutei.js` · `fx.js` | TCGdex pricing block · JP shop · currency with the rate recorded |
| `ebaycall.js` · `ebayquota.js` | the ONLY eBay path · daily, hourly (600), tooling (300) limits by origin |
| `sourceprobe.js` | does a source answer RENDER or only a home IP? |
| `digital.js` | TCG Pocket hidden by SERIES at every read |
| `certcheck.js` | cert number + photos from ONE shared getItem (15 min); PSA half NOT built |
| `stampcheck.js` | photo checks on eBay's CDN (0 API calls), one worker pool, verdicts stored: reprint **stamp** (55 originals), **lookalike** pairs, same-name **siblings**; templates in `stamps.json` from OUR scans |
| `refscans.js` | sibling references, built ahead by `refbuild.js`: a request never waits on a third-party host; missing = `notRun`, never a pass |
| `backcheck.js` | card BACK: other family's back refuses, own back labels, nothing found claims nothing |
| `stampcheck.js` (material) | gold/black NOVELTY card? (`materialJudge`; rules in PHOTO CHECKS) |
| `deals.js` | best deals: cheapest trusted Buy It Now vs a current measured price, from cached views only |
| `pricequality.js` | is a headline current and measured? est / old (>30 d) / thin / unsettled; drawn by `priceMarksHtml` |
| `setyield.js` | a refresh that priced nothing for a set or 200+ cards in a row: named, exit 2 |
| `printsql.js` | `basePrintingSql` — the headline rule every reader uses |
| `cardnumber.js` · `pricehold.js` | is a product's number OUR card's (whole)? · cards on a shared product held, refused rows out (incl. a stamped product not TCGdex's) |
| `trending.js` · `querygap.js` | movers · every set's query asked once |

## What ships and what does not

`git ls-files` is the authority; `setlist.test.js` asserts every `*.test.js`,
`ingest.js`, `CLAUDE.md`, `PROGRESS.md`, `jptest.js` are in the index.
Gitignored (need a DB URL or residential IP):
`jpreconcile.js`, `tcgdexprobe.js`, `yahoogate.js`,
`gradeprices.js`. `.gitignore` covers data, logs, credentials, scratch only.

- **Tracked is not deployed.** Render runs `server.js`; nothing requires
  `ingest.js`, and `/ingest.js` 404s (`approute.test.js`). Keys come from env
  only (`nosecrets.test.js`); the pokemontcg.io key once in the code awaits
  rotation (Roy).
- **A file the server requires is not local tooling** (`yuyutei.js` ignored =
  `MODULE_NOT_FOUND` on boot). The audit tools are tracked so their findings
  are reproducible.
- `checkout-disabled.js`, `login-disabled.js`: preserved, never loaded/served.
- git is last-match-wins; `git check-ignore` says nothing for a tracked file
  without `--no-index`. Being in the index is the guarantee.

## Checking the frontend

**https://cardhunt-backend.onrender.com/app** — a URL cannot be stale. The
build stamp bottom-left names the commit (bump it with every page edit). `/app` serves `cardhunt_preview.html` byte for byte; the module
`<script>` tags stay **absolute** so the `file://` fallback still loads them.
Theme: Auto/Light/Dark, `localStorage ch_theme`, set by a head script before
paint; colours only through the tokens (`theme.test.js`).
Serve ONE file by name — **never `express.static(__dirname)`**
(`node approute.test.js`: what IS served and 26 paths that are NOT).

---

# STATE

**What every card shows, 2026-10-09** (46,512 cards; 2,480 TCG Pocket hidden;
PROGRESS 2026-10-09 (no estimates)). **No estimate is shown anywhere.**

| | visible | measured price | pokemontcg.io figure | withheld | **no price recorded** |
|---|---|---|---|---|---|
| English | 21,256 | 21,162 | 28 | 45 | 21 |
| Japanese | 14,463 | 11,730 | 0 | 0 | 2,733 |
| Chinese (parked) | 8,313 | 0 | 0 | 0 | 8,313 |

- Japanese "old" = one Yuyu-tei run (2026-08-28) never repeated; the nightly
  asks only Yahoo. Re-running or scheduling `node ingest.js yuyutei` is an
  open decision.
- Alert evaluation still triggers on an unsettled price (open).

- `price_history`: **zero rows carry an eBay source** (terms).
  `listing_photo_verdicts` holds hashed keys only — no title, price, URL, photo.
- **Chinese is parked**: no rarity source, TCGdex's Chinese pricing is the
  Japanese card's under a translated name. `pricingAllowedFor()` = en, ja.

- **5,475 Japanese cards (39%) are not on TCGdex** (Limitless-ingested);
  rarity positional; Yuyu-tei could supply it (open).
- **English names are thin**: Japanese `name_en` 36%, `set_name_en` 4.7% —
  `node ingest.js names ja` is the highest-yield data job outstanding.
- **Foreign ids: zero, refused loudly** (`cardid.js`, `cardid.test.js`). Check
  that a function RENDERS before blaming it.
- **TCG Pocket hidden, not deleted** (15 sets, 2,480 cards): every read of
  `cards` carries `digital.visibleSql()`; manifest skips them.

## Known blemishes, measured today
Settled — do not retry (*Archive:* "Known blemishes, measured today"): Aquapolis
50a/50b-style pairs stay blank (one image for two cards); McDonald's 2014-2018,
2023/2024 have no host — **DECIDED 2026-10-02 (Roy): blank, never TCGplayer's CDN.**

---

# WHICH SOURCES ANSWER, AND FROM WHERE

From Render 2026-09-22 (`/api/probe/sources`) and home (`node sourceprobe.js`).
**Do not re-derive — re-run the probe.**

| Source | Home | Render | Status |
|---|---|---|---|
| Yuyu-tei | 200 | 200 | **LIVE** — listings + prices |
| eBay Browse | 200 | 200 | **LIVE** — US/GB/DE/AU/CA/FR/IT/ES (`EBAY_SITES`); JP 409 |
| PriceCharting | 403 (10-02, Cloudflare) | 200 JSON (09-22) | viable, not built |
| Troll and Toad · Card Kingdom | 200 | 200 | viable, need HTML parsers |
| Yahoo Auctions JP | 200 | **403** | local only; live-search `__NEXT_DATA__` gone (fallback silently empty, not rebuilt) |
| Yahoo Shopping V3 / V1-V2 | key refused / withdrawn | same | not usable |
| COMC · Cardrush · Cardmarket | 403 (Cardrush 200 from home 10-02) | 403 | closed to automation |
| Mercari JP · Facebook | — | — | deep link only |

**Do not build bypasses.** The probe endpoint takes **no URL parameter, ever**
(SSRF); caller picks a registered id; results cache 30 min.

---

# THE GATES — which path reaches which (T9 audit, 2026-09-29)

Asked of every row: is it called on every path that produces a listing or a
stored price, does it get its inputs, does it report what it refused?
`gateaudit.test.js` pins the structure. Full table with per-path detail:
PROGRESS 2026-10-05: "The gates".

## The paths

| id | path | produces |
|---|---|---|
| **E** | `/api/listings/:cardId`, `/api/search` -> `gatherListings` -> `sourceEbay` | live eBay rows (Render only) |
| **Y** | same -> `sourceYuyutei` | JP shop asks |
| **H** | same -> `sourceYahoo` | Yahoo JP rows — local only |
| **D** | page deep links via `cm.buildQuery(forLink)` | a search string; ungateable — shown under UNFILTERED SEARCHES |
| **P** | ingest `safePriceFor`/`refresh` -> TCGdex, else `tcgPlayerSearch`/`reprintPricing` | stored English prices |
| **Q** | ingest `yahooJapanSearch` | stored Japanese medians |
| **T** | `tcgdexprices` / `manifest --prices` | stored prices by TCGdex id |
| **G** | `gradeprices.js` | grade aggregates via `/api/listings` |

## The gates

| gate | E | Y | H | P | Q | needs |
|---|---|---|---|---|---|---|
| lot / sealed / merch / fakes | `NOT_A_SINGLE_CARD`, `goldBeforeGold`, own identity masked | jpfilter | `JP_LOT_WORDS` + 枚/点 | n/a | `JP_LOT_WORDS` | title |
| card name | `verify` §3 | `pickVariants` | `jpTitleMentionsCard` | number, name tiebreak | same as H | name/nameEn |
| number + set total | `verify` §4-5, `verifyLetterNumber` | `matchesOurCard` | `jpTitleMatchesNumber` (fails closed w/o `setTotal`) | by number, rarity tiebreak, else nothing | same as H | number, setTotal |
| set-name conflict | `namesAConflictingSet` | n/a | via number | — | via number | setName |
| reprint family | `printingConflict` | same | same | `reprintPricing` + `TCG_REPRINT_SET` | same | setId |
| year (±1) | `printingConflict` | same | same | n/a | same | `set_release` **SELECTed** |
| language | `printingConflict` | CJK not evidence | CJK not evidence | n/a | same | lang from id |
| grade + grader | `verify` §2 + `ebayGradeFilter` | raw only | `jpTitleHasGrade` | raw | raw | grade |
| raw vs slab | `SLAB_WORDS` + `conditionSaysGraded` | singles | `jpTitleIsSingleRaw` | n/a | same | title, condition |
| printing (T10) | `verify(opts.printing)` | mirror entries | `printingRefusal` | `basePrintingSql` | — | `cards.variants` **SELECTed** |
| outliers (flag) | `flagOutliers` vs own median, or stored raw price when current and higher | same | same | — | IQR + spread | ≥5 priced, ≥$15 |
| reprint-priced (flag) | `flagReprintPriced` | same | same | — | — | reprint's listings |
| stamp / lookalike / sibling (photo) | `stampcheck.gate` in `judgeListings` | — | — | — | — | the row's CDN photo |
| card back (photo) | `backcheck` verdicts in `judgeListings` | — | — | — | — | getItem photos |

**Reporting.** Every listing source returns `kept`, `rejected`, `scanned`,
`dropped[]`, `gate`; the payload carries `refused[]` (title / photo / back,
capped at 300, never counted). Stored-price paths report to the console.

**What the query asks decides what the gate can see** (2026-10-04): a slab asks
the bare number, raw keeps the pair; set names by set id (`SET_WRITTEN_AS`);
auctions via `buyingOptions`; "PSA 8 Card" is a grade not a lot; a slab is one
card whatever is sealed inside (Roy); no-number cards by name only
(`cm.PRINTS_NO_NUMBER`); a punctuation number (Unown ! ?) must stand alone;
TCGdex via `cardid.tcgdexLocalId`; an empty panel says none-returned /
all-refused / no market (`payload.market`). Re-run `node querygap.js en` after
any change to `buildQuery` or a set's vocabulary. Open: raw titles with the
pair and no set name are never fetched (unmeasured).

## Open, and a decision rather than a fix
(Full text: *Archive:* "Open, and a decision rather than a fix".)
- **TCGplayer internal search — KEPT as last resort** (2,025 EN cards, 9.6%,
  have no other source): only where TCGdex has no price, from home during
  ingest, never on Render; rows carry `source_meta.via`. **Re-check TCGdex
  coverage around 2027-01** (`tcgdexharvest.js en --dry`).
- `yahoojp_avg_N` ungated by construction, 0 rows. `ingest.js scrape` DELETED.
- **Decided (Roy, 2026-10-05):** Yellow A Alternate (xya) is NOT deleted (own
  printed numbers, own listings); **no softer 0.2x price flag** — it would
  catch genuine damaged copies.
- Cross-set lookalike FINDER: >=40% of a view price-flagged, then score against
  same-Pokémon scans (PROGRESS 2026-10-05). Shipped pairs: PHOTO CHECKS.
- 754 EN cards have no image, so no material reference (B2a, mep, trainer kits).
- Existing Yahoo base rows were not repaired for printing (143 of 191 JP cards
  holding both sit >5x the Yuyu-tei base) — `jpcheck` over them is owed.

---

# PHOTO CHECKS — what catches a wrong listing (2026-10-04)

All photo work: eBay CDN photos (0 API calls) except the back (1 shared
getItem), one worker pool (`STAMP_WORKERS`, default 1), queue, one job per
item, verdicts in `listing_photo_verdicts` (hashed item + photo, versioned —
bump `VERDICT_VERSION` when a template, threshold or matcher changes). Checks
run after the response; `?poll=1` is cache-only. A timeout is retryable, never
a verdict.
- **Queue order (`stampcheck.PRIO`, Roy 2026-10-07):** top-25 (`compareOrder`) colour,
  then top-25 comparisons + hidden rows + backs, then the rest; past 25 only when scrolled
  into view.
- **Comparison photos s-l400, stamps s-l500, never smaller** (a smaller photo
  drops a stamp under the matcher's 28 px floor and still reports it ran);
  identity stays the s-l500 URL; s-l350 is an 80x80 placeholder.

| problem | caught by | on which cards |
|---|---|---|
| 30th / Celebrations reprint | stamp template from OUR scan, 0.70 + title words + price band | 55 originals (`30th-c-020` no stamp) |
| a different card listed under ours, both scans held | lookalike, per-pair margin (`LOOKALIKES`) | bubble Mew ↔ 30th Mew (0.40); Mewtwo ☆ and Dragonite ex ↔ their Evolutions cards (0.30); Base Charizard ← gold Charizard ex 228 (**one way**, 0.10) |
| same-name card of the same set | sibling, margin 0.40 | 6,962 English cards (2026-10-06); **PNG refs (86) tested ONE direction only** |
| named replica | title words | all |
| implausible price | outlier (flag) | ≥5 priced or current stored price |
| other-language copy | title; Japanese-family **back** | all / on demand, flagged rows, `MOST_FAKED` |
| gold/black/silver metal novelty, title silent (2026-10-05) | material check: colour vs our scan, outlier flag, metal photo — two refuse, one flags | English cards with a scan (TCGdex .jpg, or pokemontcg.io .png for 806) |
| rainbow / silver metal (colour like the card) | price + metal photo only | same |
| different illustration outside a held pair | **NOTHING** | — |
| printed counterfeit, real back | **NOTHING** (back would LABEL it) | — |

Measured: each row's numbers (92.5% of reprint photos, 0/491 genuine; 0/195 genuine novelty
refused …) are in *Archive:* "MOVED FROM CLAUDE.md, 2026-10-09 (budget, fourth pass)".

Rules of the gate:
- **Found refuses; not visible / unreadable keep. Unchecked rows of EVERY kind
  (stamp, pair, sibling) are shown "Not checked yet"** (never a word implying a
  check ran), hidden only below `SIBLING_HIDE_FRACTION` (0.55) of a current
  measured raw price (T0, PROGRESS 2026-10-06). A check that could not run is NAMED
  (`stampGate.notRun`), on the page too — never a pass.
- **A pair is measured both ways before it ships; a pair that cannot be safe
  both ways is one-way (`oneWay`) or not shipped.**
- **Material (novelty): two of {colour > 0.40 above our scan, outlier flag, metal
  photo} refuse; one flags `counterfeit-likely`; a genuine back never refuses.**
  **Colour alone never refuses** (genuine gold hyper rares reach 0.491;
  `material.test.js`) (PROGRESS 2026-10-05 (later)).
  Unprofiled rows shown (`materialPending`), profiled after the answer, stored
  `check_kind 'material'`. A repeated-photo hash: NOT built (LESSONS 3).
- **Back: other family refuses, own family labels "matches a genuine card"
  (never "verified"), nothing found claims nothing.** Unchecked rows shown.
  Automatic ≤20 rows a view (outlier-flagged + `MOST_FAKED`), background.
  **Per card, absence refuses** (`REQUIRE_GENUINE_BACK`, raw only): Shining
  and Base Charizard; NOT Pikachu VMAX or M&W GX. Measure both ways to add one.
- **Settled, do not re-explore**: no eBay field (Set, Year, epid) separates a
  reprint from its original —
  *Archive:* "REPRINT vs ORIGINAL — settled, and the stamp (2026-10-02)". Metal Charizards on CC002 are kept (open).
- **FALSIFIED — do not retry without a new idea**: artwork template; SIFT (no
  opencv.js build ships it); Japanese layout by template; sibling+price rule;
  "which card is this" over all scans (STOPPED); OCR (CLOSED); **refusing on
  eBay's Set aspect** (Option S: 25 of 42 unstamped rows filed under the
  reprint's Set were genuine originals, a $1,000 Base Charizard among them; Set
  is a headline flag only — PROGRESS 2026-10-08 (Set split)); **the regulation
  mark** (50 of 55 `REPRINT_OF` pairs have none on either side; 30th and
  Classic Collection carry none — kept as printing era, PROGRESS 2026-10-09
  (evening)). Base Set 2's mark
  needs alignment first. Numbers and PROGRESS block names:
  *Archive:* "MOVED FROM CLAUDE.md, 2026-10-07 (budget, second pass)".
- **References are stored, never fetched in a request** (`refscans.js`,
  versioned; `refbuild.js [--colour]`, resumable): sibling templates
  (`card_reference_scans`) and our scan's colour (`card_colour_refs`); an
  unbuilt card uses the old live path, bounded. "Unbuildable" is a MOVING set:
  re-count with `--dry`, never quote it.
- **HARD LIMIT: one sibling worker** (Render: 0.15 core; a compare is CPU). More
  throughput means a paid tier; code can only waste less (queue order above).
- **The cheap route for a recurring wrong card is a new `LOOKALIKES` pair,
  measured first.**

# EX-ERA AND GOLD STAR PRICES
(*Archive:* "EX-ERA PRICES — diagnosed 2026-10-02 (T2)".) A TCGdex block is used
only for a printing the card lists (`af2f2c0`). Gold Stars need a sold-price source.

---

# CALL COST — what spends eBay quota, measured (2026-10-01)

Measured with `node -r ./costmeter.js`. **Re-measure before changing a row.**
Budget 5,000/day · 600/hour · tooling 300/day (`ebayquota.TOOLING_OVERRIDES`).
Method, tooling rows: *Archive:* "MOVED FROM CLAUDE.md, 2026-10-07 (TASK-ui, third pass)"; full tables:
"Recurring — runs whether anyone is there or not",
"User — costs only when someone acts",
"Tooling — counted against the 300/day allowance".

| action | eBay calls |
|---|---|
| nightly refresh, alert evaluation, idle server, page left open, home page | **0** |
| token exchange | 1 per process per 2 h / cold start, shared single-flight (`bf49963`) |
| open a card (any) | **1** (US page 1); **+1 per reprint** on the 55 `REPRINT_OF` originals; **+1 language union** on an English card whose page 1 hit the cap with >50% language refusals (one `Language:{English}` page; share measured in `listing_views.lang`) |
| same card + grade within 15 min | 0 |
| "Search 7 more marketplaces" · "Load more" | 7 · 1 per site with more |
| Verify (cert) · Photos (same item) · "Check card back" | 1 getItem · 0 · 1 (0 if fetched in 15 min or stored) |
| back check, automatic | +1 getItem per unchecked row, ≤20 a view, background |
| stamp / lookalike / sibling / auctions / novelty (material) | 0 |
| home movers (4 × `/api/trending`) · the deals shelf (`/api/deals`, stored picks) | 0 |
| deals refresh (GitHub Action, every 3 h, background origin) | ~104 a run (80 cards × 1.3), ~830/day |
| open a deal (`/api/deals/:id/live`) | 1 getItem (0 within 15 min) |
| search resolving to one card · ambiguous | 1 per card (+reprints) · 0 |
| tooling probes and audits | tooling origin, 300/day — rows in the archive |
| every `node ingest.js` command, the test suite | 0 |

**Only the deals refresh recurs (3-hourly, background).** State an eBay change's calls per card view
before shipping it. Every new eBay call site: tooling origin if a tool, a row
here, an entry in `gateaudit.test.js`'s allow-list.

---

# TASKS

## T1 · Verify English and Japanese — standing check, not a one-off
```powershell
node ingest.js status
node ingest.js audit en --bad ; node ingest.js audit ja --bad
node ingest.js setcover en
node ingest.js pricecheck en me02.5 ; node ingest.js pricecheck en sv03.5
```
`pricecheck` flags >40% from live. Read a source's own rarity label before
calling a vintage price wrong (known values: archive, third pass).

## T2 · Listing finder — SHIPPED, with named gaps
Full spec, envelope and row fields: *Archive:* "T2 · Listing finder — SHIPPED,
with named gaps", "On demand — US page 1, the rest when asked (T2, 2026-09-30)",
"The registry", "What remains", "eBay — live, guarded, and its data is never stored".
- `/api/listings/:cardId?grade=` and `/api/search` answer through ONE builder
  (`listingsFor`); `?dryRun=1` spends nothing. **No rejection count on a source
  block = the gate did not run.** `cheapest` is Buy It Now only.
- **Open = 1 call; nothing expands by itself, not even on zero US results**
  (`noautoexpand.test.js`); "Search 7 more" / "Load more" are buttons stating
  their cost; home tiles `?cachedOnly=1` = 0 calls. Shipping is never a filter.
- Sources: `LISTING_SOURCES` (yahoo local only, yuyutei shop-ask, ebay);
  `UNAVAILABLE` gives a reason for the rest. eBay credentials on Render only;
  every call via `ebaycall.js` -> `ebayquota.js`; cached 15 min, never stored.
- Remaining: auctions from Render (fetch locally -> store -> serve, with fetch
  age); the rest is in STATE and the sources table.

## T3 · Alert engine on real data — BUILT
The page reads and writes `/api/alerts`; evaluated at the end of each
language's nightly refresh from `price_history` (0 network); a trigger records
`triggered_at` + the listing. Not re-verified: the "new listing" alert type.
*Archive (the open version of this section):* "T3 · Alert engine on real data — STILL OPEN, and still simulated"

## T4 · Scheduled refresh — running nightly
`node ingest.js refresh <lang>` prices whatever is overdue, in five tiers from
hot 24h to dormant 30d (thresholds: archive, third pass). **Price beats rarity.** Ordered by overdue-ness weighted by value. "Due" is
judged on the headline row only. **`--max` is per language** (`all` = 4
caps); `--hours=4` is the bound that holds. An empty set or 200-card gap is
named and exits 2 (`setyield.js`, `refresh-empty-sets.log`). A language not run
or not finished exits 3 and is named; an interrupt exits 130; a hard kill is
named by the next run (`refreshrun.js`).

**Windows, no cron:** Task Scheduler "CardHunt nightly refresh" runs
`refresh-daily.cmd` at 03:00 as this user (`DATABASE_URL` is a user env var).
```powershell
schtasks /Query /TN "CardHunt nightly refresh" /V /FO LIST
schtasks /Run   /TN "CardHunt nightly refresh"
```
`task-watch.ps1` logs task state hourly to `task-watch.log`.

## Movers and best deals — BUILT 2026-10-05
- **Movers** (`trending.js`): both ends `tcgdex_tcgplayer_*`, same printing and
  productId; pricequality-marked cards left out; window stated; `coverage` says
  when a list is thin and why.
- **Best deals — ON (Roy, 2026-10-08), approved accounts.** A 3-hourly job
  (`.github/workflows/deals-refresh.yml`) runs `deals.pickVouched` on 80 cards
  by value; `deal_picks` keeps card, item id, found_at. The shelf shows OUR data;
  a click fetches live, deletes a sold pick (PROGRESS 2026-10-08 (deals supply)).

## Page language — EN/JA/zh-TW/zh-CN (T5; TASK-ui 2026-10-07)
Picker between currency and bell; `ch_lang` set before paint. One exact-text table
per language over ONE key set, whole-node match, **never card data**
(`i18n.test.js --db`); split sentences in `LANG_GROUPS`: all or none. Coverage is
counted (`i18n.test.js` prints it). Built sentences, server text: English.

## Page layout — rules (TASK-ui, 2026-10-07)
- A price control is `.price-only`: absent, never disabled. Check signed out AND in.
- Card: image | ONE view area (boxes+bar OR history: `toggleCardView` fetches
  nothing; both in one cell, no jump) + selector, level with the image; listings
  full width below. Artist above the image; no details box (`cdlayout.test.js`).
- Back restores scroll; a reopened card restores grade, tab, view, range, scroll
  BEFORE its first listings call, else Raw NM (`restore.test.js`).
- Home: search, deals (hidden while off), games, movers, alerts (`door.test.js`).
- CardZon is display only; the CZ mark is ONE inline `<symbol id="cz-mark">` (no
  image file), 42px nav, 30px at <=900 (`brand.test.js`, which pins the
  colours sampled from Roy's render and the dark-only hairline; values: PROGRESS 2026-10-08).

## Accounts — step 1 (sign-in) and step 2 (roles) SHIPPED 2026-10-06 (T6)
`auth.js` verifies the token (ES256, JWKS); `/api/me` is the ONLY source of signed-in
state and role (mechanics: archive, third pass).
- **master** = `CARDZON_MASTER_EMAILS`; approved / pending / rejected in `user_access`.
- **ONE gate, `access.js`**, on each protected route's line (401 / 403 / 503 fail-closed);
  `access.test.js` fails on an unclassified route — add every new route there.
- **RLS ON for every public table**; API roles read own rows, write nothing (`rls.test.js
  --db`; `node rlsprobe.js`). **Tests cannot change the schema** (`schemaguard`).
- **Live suites run SIGNED OUT** (Roy, 2026-10-07); **never** a service_role key or test
  account on a dev machine. (PROGRESS 2026-10-06 (night).)

## Near you (local card shops) — PLANNED, needs a real data source
Honest empty state. **Do not fill it with anything a source did not return.**
Candidates to probe: Google Places, TCGplayer store locator, manual curation.

## PSA cert lookups — the free bucket is not ours
PSA's limiter answers 429 before reading the key; the free bucket is spent by
others (2026-10-05). An allocation is Roy's email to PSA. Nothing calls PSA;
certcheck steps 2-4 NOT BUILT.

## Sold data — NO SOURCE, and the page says so
The eBay sold scrape is gone and must not return in any form. Every licensed
option needs Roy's application or written permission (*Archive:* "Sold data —
NO SOURCE, and the page says so"). The page says "no licensed sold source".

## Checkout and login — DISABLED, preserved outside the page
Never loaded, never served; neither returns without a real payment/auth
backend. `nofabricated.test.js` fails if a password or card input reappears.

## T5 · Chinese — parked
Do not spend time here.

---

# COMMANDS

```powershell
# state and verification
node ingest.js status                      # coverage, sources, rarity spread
node ingest.js audit <lang> [--bad|<set>]  # completeness per set, or card by card
node ingest.js setcover <lang>             # price coverage per set
node ingest.js imgreport <lang>            # artwork coverage per set
node ingest.js pricecheck <lang> <set>     # ours vs live TCGPlayer
node ingest.js verifyset <lang> <set>      # sample 20 rarities against TCGdex

# card data
node ingest.js manifest <lang> [set|all|--recent]   # authoritative rarity
node ingest.js setmeta <lang> [--force]             # logos, series, release dates
node ingest.js setgap <lang> [--fix]                # sets missing vs TCGdex
node ingest.js cardgap <lang> [--fix] [--set=X]     # cards missing INSIDE held sets; insert-only
node ingest.js lmingest <lang> [set]                # sets TCGdex lacks, via Limitless
node ingest.js names <lang>                         # English card names
node refbuild.js [--dry] [--set=X]                  # sibling references; resumable; after ANY English ingest
node ingest.js pokedex                              # JP/CN -> EN dictionary

# prices
node ingest.js refresh <lang> [--dry] [--max=N] [--hours=N]
node ingest.js safeprices <lang> --all [--set=X]    # full backfill
node ingest.js yuyutei [--dry] [--all] [--set=X] [--max=N] [--force]
node ingest.js pricefix <lang> [--delete]           # purge name-matched prices
node ingest.js clean [--delete]                     # junk price audit
node ingest.js jpcheck <lang> [...]                 # JP prices vs Yahoo
node ingest.js jppurge [...]                        # remove bad JP rows
node ingest.js alerts <userId> [...]                # evaluate alerts
node gradeprices.js --limit=5 [--write]             # what each grade is worth
node ingest.js tcgdexprices <lang> [--dry] [--set=X] [--max=N] [--gaps-only]
node tcgdexharvest.js <lang> --dry                  # same, standalone
node tcgdexprobe.js xcheck en 40                    # ours vs TCGdex

# sources
node sourceprobe.js [yuyutei|yahoo]        # from here (home IP)
curl '<host>/api/probe/sources[?id=yahoo&refresh=1]'   # the same module, from Render

# eBay — guards, quota, live checks
node ebayratecheck.js                      # ask eBay the REAL limit (needs keys)
node ebayprobe.js en-swsh3.5-74 "PSA 10"   # credentials -> token -> search -> gate
node yahoogate.js ja-SV2a-201              # Yahoo gate, live (LOCAL ONLY)
curl '<host>/api/ebay/quota'             # spend so far (open); ?probe=1 needs the key
node toolingkey.js /api/ebay/quota?probe=1   # the 7 /api/ebay/* probes: X-CardHunt-Key from env CARDZON_TOOLING_KEY
curl '<host>/ebay/status?probe=1'          # does eBay ACCEPT the credentials
curl '<host>/api/listings/en-swsh3.5-74?grade=PSA%2010&dryRun=1'   # spends nothing
node -r ./costmeter.js server.js           # what an action costs; read costmeter.out.json

# end-to-end audits — tracked, read-only
node setaudit.js en --broken               # every set end to end, failures only
node linkaudit.js sv10 --live --limit=8    # why a card has no links: A/B/C
node linkaudit.js swsh11 --name=Giratina --kept
node querygap.js en [--dry|--resume|--set=a,b|--report]   # every set's query; ~230 calls live
CARDHUNT_API=http://localhost:3001 node searchaudit.js en --json=sa.json --concurrency=4 [--resume]
node sitecheck.js [card] [--grade=all]     # presses every button; 41-89 calls

# after ANY edit carrying a backslash: count 0x08 bytes (must be 0).
# grep -P does not run in this Git Bash and its failure reads as "no matches".
node -e "for(const f of ['CLAUDE.md','cardmatch.js','server.js','jpfilter.js']){const b=require('fs').readFileSync(f);let n=0;for(const c of b)if(c===8)n++;console.log(f,n)}"
```

## The test suite — all green 2026-09-29

Standalone by design (a revert of `ingest.js` cannot take them with it). Each
prints its assertion count; **a suite that suddenly reports fewer has lost
assertions.** Per-suite descriptions and counts: PROGRESS 2026-10-05: "The test
suite — all green 2026-09-29". Several take `--db`, `--live` or `--deployed`.

```powershell
Get-ChildItem *.test.js | ForEach-Object { node $_.Name } ; node jptest.js
```

Never run `node ingest.js scrape` — deleted, refuses, stays deleted.

## Deploying
**No push unless every suite passed on a clean checkout: push ONLY with
`bash gatedpush.sh`** (full suite on a clean worktree of HEAD; pushes only on
all-green; why: PROGRESS 2026-10-09). Render redeploys from `main`; check the build stamp at
`/app` and `GET /` for the version.

**ONE session on `main` at a time, or separate branches** — the desktop app's
Claude Code tab is a full session (PROGRESS 2026-10-07 (two sessions)). Before
committing, check the parent is the commit you expect and that `git diff HEAD~1`
holds only your work.

---

# LESSONS — the rule, why, and where the full story is

(The archive calls this section "HARD-WON LESSONS".) One or two lines each.
The narratives these were compressed from (as of 2026-10-04) are in the
archive under *Archive:* "LESSONS — the rule, why, and where the full story
is"; each lesson cites its incident's heading. New lesson: one rule, one
pointer — the story goes in PROGRESS.md.

## 1 · Gates and filters

**A filter that rejects records needs a test proving what it KEEPS.** A gate
tested only on refusals passes by refusing everything (`looksLikeJunk`, "tin"
in Giratina, bare `tag`/`ace`). *Archive:* "A guard against bad data can destroy good data", "Test what a gate ALLOWS, not only what it blocks", "Two lists of grading companies, and one of them was never updated"

**Measure a filter change both ways against the OLD pattern from `git show`,
never retyped**; word lists get boundaries from `boundedTerm()`. *Archive:* "A pattern rewritten for readability lost its boundaries"

**A gate that is right and never reached is not a gate. A fix is not installed
until every path that needs it HAS it — and a shared table must be reached by
every path that needs it** (year gate never SELECTed; `REPRINT_OF` unused by
pricing). List every path (THE GATES) when adding a rule. *Archive:* "A fix is not installed until every path that needs it HAS it", "Reprints were priced by catalogue number (2026-09-29, TASK T6)", "The base-price rule lives outside server.js too (T2, 2026-09-30)"

**A guard that has never fired is indistinguishable from one that cannot.
Make it fire before believing it**; revert the fix and watch the test fail.
*Archive:* "A guard that has never fired is indistinguishable from one that cannot"; restored from `CLAUDE.md.bak-20260901`: "Nothing happened" is not proof a guard works

**A check that looks correct is not a check that ran. For any gate, guard or
test, state what would be observably different if it were silently doing
nothing — then verify that, not the code.** (PROGRESS 2026-10-06 (late night),
2026-10-07 (night).)

**A gate that skips must say what it skipped** (`evidence`, `unchecked`,
`gateWarning`). *Archive:* "A gate that skips says nothing; now it says what it skipped"

**A gate that hides while it works over-blocks for as long as it works** —
show pending rows marked; an absent row is never reported (T0, PROGRESS 2026-10-06).

**A guard that over-blocks fails invisibly — make an empty result report**;
every silent `continue` in a fetch is an unseen over-block (`setyield.js`).
(PROGRESS 2026-10-02)

**A row that is not the headline must not move the headline's clock**; judge
freshness on `basePrintingSql` rows; a value dropped on the way in is frozen.
(PROGRESS 2026-10-02)

**A set of listings carrying no rejection count has not run the gate.** Count
what the gate EXAMINED. *Archive:* "Count what the gate examined, not what the page held", "linkaudit.js"

**Read the structured field the marketplace already gives** (eBay condition,
Grader, Grade aspects; a title that DISAGREES is refused). Never send
`{Not Specified}`; aspect names are per site; ES has none. *Archive:* "The marketplace had already said it, and the gate never read it", "eBay DOES state raw condition — in a field we never read (2026-09-27)", "Slabs: measured 2026-09-27, NOT yet used", "Slabs: BUILT 2026-09-27 — filter narrows, disagreement is refused"

**Words that are also card names, mechanics or set names are protected before
they are evidence** ("120 HP", "ex", TAG TEAM, "Master Ball", "Classic
Collection", "Gold Star"). Strip to `~`, not a space. **A word genuine in one
era can be evidence in another**: no card was gold before 2004
(`goldBeforeGold`). *Archive:* "The original measurement, still true of the coarse field", "`art` is in the name of every expensive card", "Rarity is the card's; printing is the copy's (T10, 2026-09-29)", "\"PSA10\" unspaced — read for unambiguous graders only (`7c3f856`)"

**A word list must never read the card's own identity** — "light" refused all
of Forbidden Light (`maskOwnIdentity`; `ownname.test.js --db`; PROGRESS
2026-10-04); "tin" in the TCGplayer sealed list, 273 cards (`tcgSealedProduct`;
PROGRESS 2026-10-09 (late)).

**A filter measured at "0 wrong" may only have been measured one way** — say
which direction a number is. (PROGRESS 2026-10-04, 2026-10-06)

**A hoped-for grade is not a grade** (`stripSpeculative()`); **measure after
deploying, not only before.** *Archive:* "A hoped-for grade is not a grade", "Slabs: BUILT 2026-09-27 — filter narrows, disagreement is refused"

**Every mode of a gate must still check the card.** *Archive:* "Grader-wide mode never checked the card (fixed `9f07cf7`)"

**A different language is a different card; a stated year ±1 off is a
different printing** — on stated evidence only; CJK is ambiguous on a JP path.
*Archive:* "A different language is a different card"

**When the title carries nothing to match, the price is evidence — flag,
never remove**; a price band is evidence only where the card prices apart.
*Archive:* "The price is evidence about the title when the title carries none", "A price band is evidence only where the card prices apart (2026-09-27)"

**A threshold judges the ITEM price; shipping launders a cheap row over it**
(`outlier.itemPriceOf`: outlier floor, reprint band, stampcheck hide line).
Only the deals discount is delivered — it is what the buyer pays. (PROGRESS 2026-10-07 (ZIP union))

**A price band cannot separate two cards whose markets overlap at the edges**
— that is what a structured field (eBay Set) is worth a call for. (PROGRESS
2026-10-07 (ZIP union))

**A median of mostly-fake listings is not a baseline** — judge against the
stored current raw price when it is higher, never to lower the bar.
(PROGRESS 2026-10-04)

**Japanese listings are full of lots** — `jpTitleIsSingleRaw()` is the one
definition. *Archive:* "Japanese listings are full of lots"

## 2 · What identifies a card

**Build the authoritative card list first; match on collector number; refuse
to guess** — number, rarity tiebreak, then NOTHING; inference only for absent
data. *Archive:* "Build the authoritative card list first", "Match on collector number, and refuse to guess", "Don't let inference override known data"

**A collector number does not identify one card** (master-ball mirrors,
reprints reusing number and set name). Reprints keyed by SET ID
(`REPRINT_FAMILIES`, `REPRINT_OF`), never set name. *Archive:* "The master-ball mirror, found for the third time", "A reprint reuses the original numbering", "Ingesting a set can disable a gate that names it", "Superseded 2026-09-26: reprints are keyed by SET ID, both directions", "A collector number does not identify one card"

**A lettered number is its own card** ("24a" ≠ "24"; `verifyLetterNumber`).
(PROGRESS 2026-10-04) **So is a prefixed one, on the PRICING path too**: the
TCGplayer search compares numbers whole (`cardnumber.js`) and never takes a hit
stating another number; wrong rows are refused by id (`pricehold.notRefusedSql`).
A collision scan cannot see a product of a card we do not hold — count the
fallback's rows by `matchedBy`; 74k unlabelled rows cannot be judged (shown with
their age, re-asked first by value). **A stamped product ([Staff], (Prerelease))
is another card unless TCGdex maps ours to it** (`stampedNotOurs`).
(PROGRESS 2026-10-09 (night), (late))

**The title's condition beats eBay's dropdown — the worse claim stands**; a range
("NM/LP") states its lower end (`worstStatedCondition`); it matters for the
condition filter and the deals bar, not the headline. **A card's name is a word,
outside a kit's product name** (`KIT_NAME_PAIRS`); names fold accents and may be
run together. (PROGRESS 2026-10-07 (gate fixes))

**A set ingested once is never re-read — compare card by card** (`cardgap`);
ask a source by ITS id, read off its own listing. (PROGRESS 2026-10-04)

**`set_total` is our count, not what the card prints** (`PROMO_SETS`,
`SUBSET_SETS`). *Archive:* "A promo prints no total; a subset's total carries its prefix (2026-10-01)"

**Rarity is the card's; printing is the copy's; edition is a third axis.**
Every headline reader uses `printsql.basePrintingSql`. *Archive:* "Rarity is the card's; printing is the copy's (T10, 2026-09-29)", "Edition is its own axis — and TCGdex names it differently on WOTC sets (T3)", "1st Edition is a market where it existed, and nowhere else"

**A price for a printing the card does not have is not the card's price** —
read its printing list before its price list. (PROGRESS 2026-10-02)

**A thin market's "market price" is a stale sale** — record the listing count
beside it. (PROGRESS 2026-10-02)

**A source's "no value" is not a value** ("None" ≠ Common; 0 = null in TCGdex
pricing). *Archive:* "\"None\" is not \"Common\" — manifest's rarity map (2026-09-28, TASK T5)", "TCGdex embeds pricing, and the docs are wrong about its shape"

**A price can be right for the number and wrong for the SET** — a hit counts
only in TCGplayer's name for our set (`tcgsetname.js`). *Archive:* "The stored price was right 90% of the time — and wrong by SET, not by H-number (T1, 2026-09-29)"

**Establish that data CAN exist before chasing it**; hidden is an answer
(`hidden: {reason}`). *Archive:* "Not every gap is a bug", "Vintage changes the floor", "Vintage Commons can be genuinely valuable", "Hidden is an answer, not an absence (2026-09-27)"

**A reprint is told apart by what is ON the card, not what sellers type**; a
port is not the algorithm until cross-checked on the same inputs. (PROGRESS
2026-10-02)

**Every grading scale is read from the company.** *Archive:* "Every grading company's scale, read from the company (2026-09-27)"

## 3 · Sources

**Probe before building; read the primary source, never a summary.** *Archive:* "Read the terms before writing a source off", "The TCGplayer API has no application to put in", "TCGdex embeds pricing, and the docs are wrong about its shape"; restored from `CLAUDE.md.bak-20260820`: "Never assume external API shapes — probe them"

**Don't guess URLs — read them; verify the tool before trusting its output.**
*Archive:* "Don't guess URLs — read them", "…and the set-list endpoint is still doing it, measured 2026-09-22"; restored from `CLAUDE.md.bak-20260820`: "Verify the tool before trusting its output"

**Scraping is not a production strategy, but "datacentre IP" is a per-source
fact** — one probe module from both ends; check markers before diagnosing;
never bypass; never `auccat`. *Archive:* "Scraping is not a production strategy", "…but \"datacentre IP\" is a per-source fact, not a law", "The probe's first run was wrong, and catching that is why it exists"; restored from `CLAUDE.md.bak-20260803`: "Yahoo Auctions rejects category filters from foreign IPs"

**Before stopping a source, ask where its cards go** — take a sanctioned route
where one exists; where none does, stopping moves cards to NO source.
*Archive:* "The TCGplayer API has no application to put in", "Read the terms before writing a source off"

**A status code means what the service says** — and a code that answers
before authentication says nothing about the key (PSA 429, PROGRESS
2026-10-04). Length is not identity. *Archive:* "Yahoo Shopping: what the 403 is NOT", "Length is not identity", "A 403 from an API you hold a key for is not the Yahoo Auctions 403"

**Sources are not interchangeable — rank them.** `sourcerank.js` gates every
writing path; a refused price is not stored. *Archive:* "Yuyu-tei quotes shop ticks, not valuations", "Two paths to one marketplace agreed, and that is the validation"; restored from `CLAUDE.md.bak-20260901`: "Sources are not interchangeable — rank them"

**Never substitute across languages; a localised name is not localised data;
a marketplace is where a card is sold, not its language** — every eBay site
needs its own vocabulary and aspect names. *Archive:* "Never substitute across languages", "A localised name does not mean localised data", "A marketplace is where a card is sold; a language is what it is (T1, 2026-09-30)", "Another eBay site shows US listings with MACHINE-TRANSLATED titles (2026-09-30)"
**A country can name a language (Brazilian, PT-BR, Polish); a place cannot** —
Taiwan / Hong Kong / Thailand count only beside "version/print/edition" (Roy,
2026-10-07; `langwords.test.js`).

**The size of an apparent win is a reason to check it harder.**

**Ask a question the marketplace can answer** — eBay matches tokens; leave out
a number sellers write two ways; every link through `cardmatch.buildQuery`.
*Archive:* "Ask a question the marketplace can answer", "English listings name the set; they never state its code", "A deep link is not a result, and must not be dressed as one"; restored from `CLAUDE.md.bak-20260803`: "English marketplaces can't match Japanese names"

**A number pair shared across languages pulls the foreign printings into an
English query; neither exclusion is safe** (eBay `-term` matches beyond the
title; `Language:{English}` drops genuine rows) — production asks with none
(`LANG_EXCLUDE_DEFAULT = 'none'`) (PROGRESS 2026-10-07 (language exclusion)).

**Without a buyer location, eBay's cheapest page drops calculated-shipping
listings** (`X-EBAY-C-ENDUSERCTX`; `marketprobe ?zip=`). Production sends none —
open, Roy's (PROGRESS 2026-10-07 (buyer location)).

**Measure the question across the catalogue, not the instance**
(`querygap.js`); one symbol (`δ`) can empty a search. (PROGRESS 2026-10-04)

**Ask in the form most titles copy — for a slab, PSA's label**; measure a
query change in both conditions. **A default is a filter** (Browse returned
no auctions until asked). (PROGRESS 2026-10-04)

**A read endpoint must never write**; eBay listings may be stored only to
display them: <= 6 h old with the age shown, deleted once not public (API
licence §8.1(b)(c), read 2026-10-08 — the old "never stored" was stricter).
**Licence rulings (Roy, 2026-10-08; quotes: PROGRESS 2026-10-08 (licence)):**
§9.5 — no eBay price median shown or stored (grade box, print-run median
and tile medians removed); no combined number shown — the deal % only CHOOSES.
§8.1(d) — outlier.js medians and the deal % are per card, per view, never
shown, never stored: OUTSIDE the clause (`ebayterms.test.js`). Uncertain reading = remove the thing.
*Archive:* "A read endpoint must never write", "eBay listings are cached, never stored"

**Before inventing a source, check what the current query already computes.**
*Archive:* "The data was already there, fetched and discarded", "TCGdex has no art and no logo for 49 English sets (T3, 2026-10-01)"

**A ratio is meaningless at the price floor; a constant never printed drifts**
(`fx.js` returns the rate; `jpfilter.js` still hardcodes 157 JPY — open).
*Archive:* "A ratio is meaningless at the price floor", "The FX rate was hardcoded at two vintages and never printed"

**Measured source facts** (cert numbers only in getItem; eBay Year 34-48%
filled; epid is seller-chosen — a signal not a gate; TCGdex asset host ~2
images/s). *Archive:* "Cert verification — measured 2026-09-28, NOT built", "eBay's Set and Year: where they live (T4, 2026-10-01, `/api/ebay/setprobe`)", "Images: TCGdex's asset host is throughput-bound (T1, 2026-10-01)", "Trending, measured 2026-09-24 — `/api/trending`, rules in `trending.js`", "Narrowing vs the 75-row cap — measured 2026-09-27 (`/api/ebay/gradecost`)", "The cap is paged now (`ceadfbc`, 2026-09-28)", "Raw M and DMG: back, seller-stated (`08a05d0`, `d60dc0e`, `b96f1e3`)", "Known, deliberately not built"

**The cheapest signal is only cheap if it fires** — measure the hypothesis
before building on it (repeated-photo hash, PROGRESS 2026-10-05).

**A source label two paths write is not "the same source"** — label the path
on the row (`source_meta.via`, productId) and pair on it. (PROGRESS 2026-10-04)

## 4 · The page

**One definition per thing.** Derive or delete; `preserve.test.js` fails on a
duplicate top-level function. *Archive:* "Two definitions of one function, 162KB apart", "Documentation is not implementation", "Read credentials at call time"

**One element, one writer, one meaning — asserted structurally**; delete a
dormant branch rather than zero it. *Archive:* "The listings panel has had two writers TWICE", "The listings panel had two writers, one ungated", "Assert the STRUCTURE, not the intention", "One element, one MEANING"

**A fallback must announce itself**; a number-matched price always wins.
*Archive:* "Two lists of the same thing, and only one of them resolves", "The silent substitutions that hid it", "And the one found while verifying the fix", "What would have caught it"; restored from `CLAUDE.md.bak-20260803`: "Set ids differ between sources"

**No number on screen that a source did not produce**; claim nothing before
the server accepts it (`nofabricated.test.js`). *Archive:* "The page was still inventing numbers where nobody looked — found 2026-09-24", "Invented data, the fourth sweep (2026-09-28, TASK T7)", "A UI that writes only to itself"

**No price is computed in the page or fetched by the browser from a third
party** — no server gate can reach either (`door.test.js`; PROGRESS 2026-10-07 (later)).

**A price says when it was measured — on every screen**, decided once
(`pricequality.js`), drawn by one function. (PROGRESS 2026-10-02) **And whose
figure it is**: a Cardmarket price says EU, a pokemontcg.io figure says so with
its date — never "est" (`originOf`, `getBase(c, out)`). (PROGRESS 2026-10-09 (late))
**No estimate is shown, stored as a headline, or computed** — no measured price
says "no price recorded" (`noPriceHtml`). The estimator missed 4x for the typical
card, 17x for a quarter; estimator.js and the grade multipliers are deleted.
(PROGRESS 2026-10-09 (no estimates))

**Cache keys carry everything the value depends on.** *Archive:* "A number cached per card is wrong when it depends on the grade"

**Browser-only bug classes — arrangement, timing, collisions. Open the page.**
*Archive:* "An async module read once at parse time is null half the time", "A promise that resolves immediately is a loop", "Dead CSS is not inert when the name collides", "A wire format is not a label", "Code addressing markup that is not there", "Three defects in one phase that every test passed through", "Card page column: one spacing rule (`d082983`)"

**Check the build stamp before debugging; a newer file is not a superset.**
*Archive:* "Check the build stamp", "A newer file is not a superset"

**The page can compete with itself; every caller of a metered path counts.**
*Archive:* "Where a card view's time went — measured on Render 2026-09-28 (TASK T1)"

**Verify unreleased server code in the browser**: `PORT=3001 node server.js`,
`http://localhost:3001/app` (`?api=render` for eBay). *Archive:* "Verifying an unreleased endpoint"

## 5 · Code, tooling, tests

**A source-reading test can depend on line endings** (slicers ending on a
quote-paren-newline or a newline-brace-newline): keep a file's endings as
they were, and make new slicers strip carriage returns. (PROGRESS 2026-10-05)

**Escapes are mangled by every layer** — a quoted heredoc still corrupted one;
use the editor tool for anything with a backslash, then run the byte check
(COMMANDS). *Archive:* "`'\D'` is just `'D'` in a JS string", "An escape swallowed by the patching tool, not the code"

**Silent failures first.** RUN a file after editing it, not only `--check` it.
*Archive:* restored from `CLAUDE.md.bak-20260803`: "Silent failures are the recurring theme"

**`null` is not a diagnosis; presence is not readiness**; test WHICH reason is
reported. *Archive:* "`null` is not a diagnosis", "Presence is not readiness", "A refactor can quietly downgrade a diagnosis"

**Integration tests find what unit tests of an earlier shape cannot.** *Archive:* "Shadowing a parameter inside a retry loop"

**A budget binds only where the work runs** (`refresh --hours=N`). *Archive:* "A time limit on the wrapper does not bind the work"; also "A killed task does not kill its grandchildren" (`CLAUDE.md.bak-20260901`)

**Keep tests outside the file they test; versions do not catch reverts.**
*Archive:* "Reverts lose functions silently, and versions do not catch it"

**An assertion that gets overridden is not an assertion** — if an anchor
fails, stop. *Archive:* "An assertion that gets overridden is not an assertion"

**A test that inspects source is one slip from asserting nothing** — read the
WHOLE output; make tests null-safe. *Archive:* "A helper inside a test is not exempt from being tested"

**A tool that cannot check something must say so.** *Archive:* "A tool that cannot check something must say so"

**Cross-check two paths that should agree — compare only what both examine.**
*Archive:* "Cross-check two paths that should agree", "A cross-check must compare only what both sides examine"

**Search must find a card by its own name**; never time things during a bulk
job. *Archive:* "Search could not find cards we hold by their own name (2026-09-28)"

**A limit nobody checks gets exceeded** — this file's budget is a test, not a
request (T0, PROGRESS 2026-10-05).

**Green in your tree is not green: run the full suite on a clean checkout of
HEAD before calling a commit done** (slicers; CRLF vs LF). **Never link `node_modules` into a worktree: `git worktree remove
--force` deletes THROUGH a junction** — use `NODE_PATH` (PROGRESS 2026-10-07 (night)).

## Photo-check lessons (all PROGRESS 2026-10-02 … 10-04)
- Measure a check's time where it runs; a timeout is not a verdict; a verdict
  that cannot change is stored, not cached (an unchecked row is SHOWN, PHOTO CHECKS).
- A zero-false threshold is set by the hardest genuine photo, found by widening.
  One card's sample is not a rate. Where both answers are held, ask which wins.
- A title can state the right number over a photo of another card — look at the
  cheapest rows' photos, and zoom, before deciding which layer failed.
- Know what a matcher cannot see (NCC reads structure, not colour); pin it in a
  test. Compare to the card's own scan, never a fixed colour.
- Split a mixed denominator by kind; label samples by eye, not by the gate; fold
  only padding (a fold can merge two cards).
- A smaller input can make a check stop finding things while still reporting it
  ran — check the feature's size against the matcher's floor first (stamps,
  PHOTO CHECKS). A size the CDN does not serve answers a placeholder, not an error.

## 6 · Metered APIs (eBay)

**Guard a metered API before the first bulk call; count by THEIR count; check
at the moment of spending** (count in Supabase, lock incl. pending, background
yields at the soft stop, one token exchange in flight). *Archive:* "Guard a metered API before the first bulk call, not after"

**A guard nobody can see is half a guard** — the number is on the page.
*Archive:* "The guard worked and nobody saw it (2026-09-30, TASK T1-T3)"

**Fetch what was asked; completeness plus a single lane is starvation.** Open
= 1 call; everything else is a button stating its cost. *Archive:* "Completeness plus a single lane is starvation (T1/T2, 2026-09-30)", "The auto-expand threshold, measured"

# CONVENTIONS
- Card ids `{lang}-{setId}-{number}` (`cardid.js`). Prices in USD.
- `price_history` is append-only — INSERT, never UPDATE.
- `name_en` / `set_name_en` English equivalents; `image_lang` artwork's language.
- `_priceIsReal` a measured headline (no estimate exists); `priceKind: 'shop-ask'` = asking price.
- Every new source: one function, same normalised shape, through the gate and
  `outlier.js`, reporting kept/rejected/scanned.
- Every new eBay call site: tooling origin if a tool, a CALL COST row, a
  `gateaudit.test.js` allow-list entry.

# THE RULES THAT KEEP BEING RE-LEARNED
Probe first · test what a gate ALLOWS · a fallback announces itself · cross-check two
paths · a fix reaches every path · a big win is checked harder · never scrape eBay · a
literal editor for escapes, then the byte check · one definition · make a guard fire ·
state eBay calls per view · compare with the marketplace's own page · 60k.

# LOGGING
THE BUDGET (top) says where things go; `PROGRESS.md` is newest first, `TASK.md` current work only.
