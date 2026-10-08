> **ARCHIVE — frozen 2026-10-01.** This is CLAUDE.md exactly as it stood at
> commit 0f9f24a, kept for the measurements and incidents behind each rule.
> Do not work from it: CLAUDE.md is current, and every lesson below is stated
> there as a rule that cites its heading here. Do not edit; add new history to
> PROGRESS.md.

# CardHunt — Project Context

Pokémon TCG price tracker and cross-marketplace listing finder. English,
Japanese, Traditional and Simplified Chinese.

**The product's reason to exist:** search any card, see the cheapest live
listing from every reachable marketplace, for every condition from raw through
graded by company and grade, with each link landing on the actual listing.

Everything below was verified against the live database, the deployed API and a
full test run on **2026-09-22**. Where a number is stated, it was measured, not
remembered. Re-measure rather than re-derive.

---

# ARCHITECTURE

```
Browser  →  https://cardhunt-backend.onrender.com/app
    ↓
Render API (server.js v5.6.0)
    ↓  reads Supabase FIRST
Supabase Postgres  ← 45,781 cards
    ↓  live listings, fetched per request
eBay Browse API · Yuyu-tei (JP shop) · Yahoo Auctions JP (local only)
    ↓  falls back only for sets not yet ingested
TCGdex · pokemontcg.io · Limitless
```

| Piece | File | Runs on |
|---|---|---|
| Frontend | `cardhunt_preview.html` | Render, at **`/app`** — local file is the fallback |
| API | `server.js` v5.6.0 | Render |
| Database | Supabase Postgres | `cards`, `price_history`, `alerts`, `portfolio`, `users` |
| Ingestion | `ingest.js` v5.9.1 | Local only — never deploy. **Tracked** in git (T2) |

## The module map

Every one of these is `require`d by `server.js` or by `ingest.js`, and most by
both. **Shared, never copied** — every pair of implementations in this project
has drifted apart eventually, and each drift is a lesson below.

| Module | Answers |
|---|---|
| `cardmatch.js` | does this listing show EXACTLY the card asked for? Builds the query, runs the gate |
| `cardparse.js` | free text → structured card identity |
| `listingparse.js` | a seller's title → structured card data (the cross-check path) |
| `jpfilter.js` | is this Yahoo/Yuyu-tei result a single raw copy? Lot vocabulary |
| `outlier.js` | which listings are too cheap to be the real card? Flags, never rejects |
| `gradeprice.js` | what is a grade actually worth, from real listings |
| `estimator.js` | the ONE price estimator, shared by every caller |
| `sourcerank.js` | which price source may overwrite which |
| `tcgdexprice.js` | read TCGdex's embedded `pricing` block |
| `yuyutei.js` | Japanese shop prices and listings from yuyu-tei.jp |
| `fx.js` | currency conversion, with the rate recorded not buried |
| `ebaycall.js` | the ONLY way this codebase talks to eBay |
| `ebayquota.js` | stay inside eBay's limits, by their count not ours — daily, **hourly (600)**, and a **tooling allowance (300)**, counted per origin |
| `sourceprobe.js` | does this source answer RENDER, or only a home IP? |
| `digital.js` | is this set digital-only (Pokémon TCG Pocket)? — by SERIES, hidden at every read |
| `certcheck.js` | what cert number did the seller enter on this eBay slab, and what photos did they post? — on demand, ONE shared getItem per listing (Verify + Photos), 15 min; PSA answer permanent (PSA half NOT built) |

## What ships and what does not

`git ls-files` is the authority. Tracked:

```
cardhunt_preview.html  server.js  cardmatch.js  cardparse.js  ebaycall.js
ebayquota.js  ebayratecheck.js  estimator.js  fx.js  gradeprice.js
jpfilter.js  linkaudit.js  listingparse.js  outlier.js  setaudit.js
sourceprobe.js  tcgdexprice.js  yuyutei.js  digital.js  trending.js
searchaudit.js  certcheck.js  sitecheck.js  costmeter.js
checkout-disabled.js  login-disabled.js   (preserved, never loaded or served)
migration-grade-dimension.sql  migration-image-source.sql  migration-variants.sql
printsql.js  variants.fixture.json  variants.pricing.fixture.json
package.json  .gitignore
```

Gitignored, because each needs a database URL or a residential IP:
`sourcerank.js`, `jpreconcile.js`, `tcgdexprobe.js`,
`ebayprobe.js`, `yahoogate.js`, `gradeprices.js`.

**Tracked since 2026-09-29 (T3):** `tcgdexharvest.js` (it writes prices —
the `ingest.js` case), `tcgsetname.js` (ingest requires it) and
`cardhunt-redesign.html` (the design reference; sample data, never served,
never a base). None is served; `approute.test.js` asserts the 404s.

**`ingest.js` is TRACKED since 2026-09-29 (TASK T2) — and still never
deployed.** Those are different questions. Render runs `npm start` →
`server.js`; nothing requires `ingest.js` and `/ingest.js` 404s
(`approute.test.js`). Ignoring it bought nothing and cost twice: it was
silently reverted by downloads landing on it, and it held the T5/T6 pricing
fixes on one machine with no backup. `setlist.test.js` asserts it is in the
index. It reads `DATABASE_URL` from the environment and carries no secret —
keep it that way.

**`*.test.js`, `jptest.js`, `CLAUDE.md` and `PROGRESS.md` are TRACKED**
(since 2026-09-28, TASK T3). All four were gitignored as "local tooling",
so a fresh clone had no test suite and no handoff document — this file
existed on one machine. `.gitignore` now covers data, logs, credentials and
scratch only (TASK.md is scratch). `setlist.test.js` asserts every
`*.test.js` on disk is in the index, so a new suite cannot be forgotten.

`setaudit.js`, `linkaudit.js`, `sourceprobe.js` and `yuyutei.js` are
**deliberately tracked** against that pattern:

- the three audit tools are read-only over the public API and run from
  anywhere, and they are what established the API was clean while the frontend
  was not. That argument is only reproducible if they ship with the code.
- `yuyutei.js` was gitignored as "local tooling" on the stated reasoning
  "needs a database URL or a residential IP" — and it needs neither. `server.js`
  now requires it, so ignoring it meant a deployed server that crashes on boot
  with `MODULE_NOT_FOUND`. That is the `estimator.js` mistake, recorded at the
  top of the very file that was ignoring it. **A file the server requires is
  not local tooling.**

The `!setaudit.js` negation only helps against a rule added ABOVE it — git is
last-match-wins. And `git check-ignore` reports nothing for a tracked file
unless you pass `--no-index`, so the obvious check says "fine" whether or not
it is. Being in the index is the real guarantee; `setlist.test.js` asserts it.

## Checking the frontend

**https://cardhunt-backend.onrender.com/app** — that is the whole answer.
A URL cannot be stale, which is the point: there were 41 copies of this page in
Downloads and a five-week-old one was once adopted as the base.

The build stamp bottom-left says which commit you are looking at, so the page
answers "is this what is deployed" by itself. Today: deployed and local are both
`BUILD 20260920-628cf4d-yuyutei`, 289,698 bytes each — byte for byte.

`cardhunt_preview.html` on disk remains the **offline fallback** and is how the
page is debugged. It is the same file — `/app` serves it byte for byte, no copy
and no build step. The three module `<script>` tags (`estimator.js`,
`cardmatch.js`, `gradeprice.js`) therefore stay **absolute**
(`https://cardhunt-backend.onrender.com/estimator.js`): under `file://` a
root-relative `/estimator.js` resolves to the filesystem root, so the fallback
would load none of them and silently drop to its inline tables. Absolute is the
only form that works from both origins.

Serve ONE file by name. **Never `express.static(__dirname)`** — the project root
holds `ingest.js`, `CLAUDE.md`, `ingest-progress-*.json`, logs and `.bak` files,
and a blanket mount publishes every one of them. `node approute.test.js` asserts
both halves in 45 assertions: `/app` and the three modules ARE served, and 26
real files and traversal shapes are NOT. Adding the static mount turns most of
those into `got 200 — EXPOSED`, so the exposure half is known to fire rather
than merely known to be green.

```powershell
node approute.test.js                      # /app serves; the root does not leak
```

---

# STATE

Measured 2026-09-22 against Supabase directly, not from a progress file.

| Language | Sets | Cards | Real prices | Artwork |
|---|---|---|---|---|
| English | 220 | 23,752 | **88.6%** | 93.8% |
| Japanese | 138 | 14,023 | **82.5%** | 83.1% |
| Chinese Trad. | 83 | 7,436 | 0% | 95.6% |
| Chinese Simp. | 8 | 877 | 0% | **0%** |
| | | **46,089** | 70.8% | |

English gained **6 sets and 308 cards on 2026-09-22** — `node ingest.js setgap
en --fix`. Two of them are the 30th Anniversary sets (see the lesson below);
the other four are the Sword & Shield Trainer Galleries (`swsh9tg`,
`swsh10tg`, `swsh11tg`, `swsh12tg`), which `setgap` had been reporting as
recoverable and which came along with the same sanctioned command.

English coverage fell 89.4% -> 88.6% because those 308 cards arrived with 90
real prices between them. **That is the number getting better, not worse** —
the missing cards were always missing; only now are they counted.

Japanese artwork was last written here as 71%; it is 83.1%. Simplified Chinese
artwork was written as "low"; it is **zero** — not one of the 877 cards has an
image. Both are why the table gets re-measured rather than carried forward.

Top price sources, by stored row count:

```
tcgplayer_market            50,878      yahoojp_3                  655
yuyutei_shop                 9,294      tcgplayer_1stEdition       539
tcgplayer_reverseHolofoil    7,113      tcgplayer_normal           488
tcgplayer_holofoil           2,503      yahoojp_4                  448
```

`price_history` holds 102,636 rows, 75,596 of them real prices.
**Zero carry an eBay source or marketplace** — verified by query, and that is a
terms-of-service requirement, not an accident. See the eBay caching lesson.

**Chinese is parked** and shows 0% priced. Rarity is 19-31% accurate with no
source, Chinese cards barely trade anywhere reachable, and TCGdex's apparent
Chinese pricing is the Japanese card's listing with a translated name — see the
localised-name lesson, which is the reason it stays parked.

**5,475 Japanese cards (39%) are not on TCGdex** — the Limitless-ingested sets.
Their rarity is positional inference. Yuyu-tei can supply it; still open.

## Known blemishes, measured today

- **English names are thin where they matter most.** Japanese cards carry
  `name_en` on 5,097 of 14,023 (36%) and `set_name_en` on **653 (4.7%)**.
  eBay is searched with the English name, so for ~64% of Japanese cards the
  query falls back to the Japanese name and eBay US answers nothing. The
  response correctly reports `0 kept, 0 rejected` — nothing is broken, the
  question is simply unanswerable. `node ingest.js names ja` is the fix, and it
  is the single highest-yield data job outstanding.
- **Foreign ids: zero, and refused loudly** (2026-09-27, `9c7c04f`). The two
  stray rows (`me2pt5-294`, `me55c-33`) are deleted (backup
  `strayids-purged-20260927.json`) and alert 5 re-pointed to `en-30th-c-008`.
  Writer: `/api/cards/:id`'s INSERT (`2fd8549`). **Producers, in the page:**
  the Add Alert card picker searched pokemontcg.io directly, newest set first,
  and took result one — "Pikachu & Zekrom-GX" → `me55c-33`, alert 5's fields
  exactly; and the embedded `ME2PT5_PREMIUM` list carried `me2pt5-*` ids.
  Also closed: the Search screen trending grid (pokemontcg tiles), the set
  page's pokemontcg-direct fallback, TCGdex-direct ids without a language,
  the `/api/cards?q=` proxy (410). `cardid.js` is the rule; `cardid.test.js`
  asserts it both ways and counts cards/alerts/portfolio at zero.
  **Not the producer:** `doSearchLegacy` fetched pokemontcg cards but could
  never draw them — `renderResultsGrid` was never defined in any commit.
  Deleted anyway. Check that a function RENDERS before blaming it.
- **Pokémon TCG Pocket is hidden, not deleted.** 15 sets, 2,480 cards, all
  English, `set_series = 'Pokémon TCG Pocket'` (TCGdex series `tcgp` lists the
  same 15). Every read of `cards` carries `digital.visibleSql()`; English
  browses 205 sets, Home 434. The rows stay; 33 of them carry
  `tcgplayer_market` prices up to $498.88 matched against physical promos.
  `manifest` skips them too since ingest 5.9.1 (`35b8ad9`), with the same
  predicate, and prints the skip.

---

# WHICH SOURCES ANSWER, AND FROM WHERE

Re-measured from Render 2026-09-22 via `/api/probe/sources`, and from this
machine via `node sourceprobe.js`. **Do not re-derive these — re-run the probe.**

| Source | Home IP | Render | Status |
|---|---|---|---|
| **Yuyu-tei** | 200 | **200, markers present** | **LIVE in production** — listings + prices |
| **eBay Browse API** | 200 | **200** | **LIVE in production** — credentials work |
| eBay Browse, other sites | — | GB/DE/AU/CA/FR/IT/ES 200; **JP 409** | **All eight LIVE since 2026-09-30** (`EBAY_SITES`). `EBAY_JP`: "12019: marketplace not supported" |
| PriceCharting | 200, JSON | **200, JSON** | viable, not built — `search-products` returns `{"products":[…]}` |
| Troll and Toad | 200, 61 KB | **200, 61 KB** | viable, not built — needs an HTML parser |
| Card Kingdom | 200, 201 KB | **200, 201 KB** | viable, not built — needs an HTML parser |
| Yahoo Auctions JP | 200 | **403** | local fetch only; `/api/listings` reports `yahoo: error HTTP 403` |
| Yahoo Shopping V3 | auth | **auth** — key refused | reachable; the KEY is refused, not the IP |
| Yahoo Shopping V1/V2 | 500 | 403 + EEA notice | **withdrawn endpoints**, not a geo-block |
| COMC | **403** | **403** | closed to automation — refuses a home IP too |
| Cardrush | **403** | **403** | same |
| Cardmarket | 403 | 403 | Cloudflare refuses a plain fetch |
| Mercari JP | — | — | App Router, no `__NEXT_DATA__`; API needs DPoP signing |
| Facebook Marketplace | — | — | login-gated — deep link only, never scraped |

COMC and Cardrush are not IP problems to route around: they refuse a home
connection as well, which puts them with Facebook — closed to automation, deep
link only. Mercari and Facebook block automation deliberately; deep links are
the correct integration for both, since they open in the user's own browser
carrying the full query. **Do not build bypasses.**

The probe endpoint takes **no URL parameter and must never take one.** A server
that fetches a caller-supplied URL is an SSRF hole into everything it can reach,
including the platform's own metadata service. The caller picks a registered
source id and nothing else. Results cache 30 minutes, because a probe endpoint
that can be hammered is an excellent way to earn the block it is testing for.

---

# THE GATES — which path reaches which (T9 audit, 2026-09-29)

Traced from the code, not from this file. The question asked of every row:
**is it called on every path that produces a listing or a stored price, does
it get the inputs it needs, and does it report what it refused?** A gate
that is right and not reached is not a gate. `gateaudit.test.js` pins the
structure (57 offline, +8 `--live`).

## The paths

| id | path | what it produces |
|---|---|---|
| **E** | `/api/listings/:cardId` and `/api/search` → `gatherListings` → `sourceEbay` | live eBay rows (Render only — the keys live there) |
| **Y** | same → `sourceYuyutei` | Japanese shop asks, `ja-` cards |
| **H** | same → `sourceYahoo` | Yahoo JP rows — **local only** (Render is 403'd) |
| **D** | the page's deep links, `cardQuery` → `cm.buildQuery(forLink)` | a search string; results never return to us, so nothing can gate them — shown under UNFILTERED SEARCHES |
| **P** | ingest `safePriceFor` / `refresh` → `tcgPlayerSearch` (or `reprintPricing`) | stored English prices, by collector number |
| **Q** | ingest `yahooJapanSearch` (safeprices, refresh, jpcheck, ytest, alerts) | stored Japanese medians |
| **T** | ingest `tcgdexprices` / `manifest --prices` | stored prices keyed by TCGdex card id |
| **G** | `gradeprices.js` | stored grade aggregates — reads **E/Y/H via `/api/listings`**, so it inherits every row below |

Gone, and why: `/api/listings/:cardName` (ungated eBay name search on any
id that did not resolve — 404 now), `/api/market`'s `ebayActive` /
`tcgplayerPrice` / `ebaySold` / PriceCharting scrape, ingest's `ebayBrowseActive`
and `cardmarketSearch` name-only fallbacks, jpfilter's second English gate.

## The gates

| gate | checks | E | Y | H | P | Q | needs | reports |
|---|---|---|---|---|---|---|---|---|
| **lot / sealed / merch** | not one card: lots, boxes, playsets, x4, merch, fakes | `NOT_A_SINGLE_CARD` | `jpfilter` lot words via `matchesOurCard` | `JP_LOT_WORDS` + 枚/点 | n/a — TCGplayer product catalogue | `JP_LOT_WORDS` | title | E/Y/H `dropped[]` |
| **card name** | the title names this card; ex/GX/V/VMAX/VSTAR agree | `verify` §3 | `pickVariants(name)` | `jpTitleMentionsCard` | number match, name tiebreak | `jpTitleMentionsCard` | `name` / `nameEn` | E/Y/H |
| **number + set total** | our N/M, not another set's (master-ball mirror class) | `verify` §4-5 | `matchesOurCard` | `jpTitleMatchesNumber` | `tcgPlayerSearch` by number, rarity tiebreak, else nothing | `jpTitleMatchesNumber` — **fails closed without `setTotal`** | `number`, `setTotal` (**refresh dropped it until T9**) | E/Y/H |
| **set-name conflict** | "Base Set 2" is not "Base Set" | `namesAConflictingSet` | n/a (set page) | via `jpTitleMatchesNumber` | — | via `jpTitleMatchesNumber` | `setName` | E |
| **reprint family** | Celebrations / 30th / Classic Collection, both directions | `printingConflict` | `printingConflict` | `printingConflict` | `reprintPricing` + `TCG_REPRINT_SET` (T6) | `printingConflict` (**T9**) | `setId` | `gate.unchecked` |
| **year** | a stated year ±1 of the set's | `printingConflict` | same | same | n/a | same (**T9**) | `setYear` ← `set_release` (**must be SELECTed**) | `gate.unchecked` |
| **language** | Korean/Chinese/etc. print of a JP/EN card | `printingConflict` | same, CJK not evidence | same, CJK not evidence | n/a (EN catalogue) | same (**T9**) | `lang` ← card id | `gate.unchecked`, `gateWarning` |
| **grade + grader** | exact grade, qualifiers, one grader; eBay's aspect fields cross-checked | `verify` §2 + `ebayGradeFilter` | raw only — says so | `jpTitleHasGrade` | raw only | raw only | grade string | E `gradeFilter{}` |
| **raw vs slab** | a raw search refuses slabs | `SLAB_WORDS` + `conditionSaysGraded` | shop singles | `jpTitleIsSingleRaw` ← `SLAB_WORDS` (**T9**) | n/a | same (**T9**) | title (+ eBay `condition`) | E/H |
| **raw condition** | NM/LP/MP/HP (M/DMG seller-stated) | eBay aspect filter | page groups: unstated | page groups: unstated | NM only | — | selection | page: "N stated otherwise", UNSTATED group |
| **outliers** | an order of magnitude below the card's own median — **flags, never removes** | `flagOutliers` in `gatherListings` | same | same | — | IQR + `YAHOO_MAX_SPREAD` refusal | ≥5 priced, ≥$15 median | `outliers{}` |
| **reprint-priced** | a row at the known reprint's price level | `flagReprintPriced` where `REPRINT_OF` | same | same | — | — | the reprint's own listings | `outliers.reprints[]` |
| **printing** (T10) | normal / holo / reverse / reverse-pokeball / reverse-masterball … — a STATED other printing is refused, silence kept as *unstated* | `verify(opts.printing)`; `buildQuery` asks for it | the asked mirror's own entries, else `pickVariants` | `printingRefusal` | base printing only — `printsql.basePrintingSql` on every headline reader | — | `cards.variants` (manifest) — **must be SELECTed** | `sources.<id>.printing{asked, keptStated, keptUnstated, refused}` |

**Reporting.** Every registered listing source now returns `kept`,
`rejected`, `dropped[]` (reasons), `gate` (what the gate had) — Yahoo did not
until T9 (`jpItemRejectReason`). Stored-price paths report to the console
only; that is a script run deliberately, the `gradeprices.js` shape.

## Open, and a decision rather than a fix
- **`tcgPlayerSearch` (path P) uses TCGplayer's internal search API** —
  `mp-search-api.tcgplayer.com`, the endpoint withdrawn from Render on
  2026-09-29 — from the home IP, nightly. It is the source of
  **72,174 `tcgplayer_market` rows** (last written 2026-09-28); TCGdex has
  supplied ~220. The premise "we get TCGplayer prices via TCGdex and
  pokemontcg.io" is true of the Render path and not of the stored prices.
  Moving P to TCGdex (`tcgdexprices`, validated 37/37 at 1.020x) is the
  legitimate route; it has not been run at catalogue scale.
  **2026-09-29 (T1): measured, and half moved.** See the lesson "The stored
  price was right 90% of the time — and wrong by SET, not by H-number".
  `safePriceFor` now asks TCGdex FIRST and the internal API only as a
  set-checked fallback — but TCGdex-first is **inert until one full
  `node tcgdexharvest.js en` has recorded shared products**
  (`tcgdex_product_conflicts`); until then it says so and falls back.
  The internal API is not stopped: stop it once that harvest's coverage is
  measured.
- **`yahoojp_avg_N`** — Yahoo's own average, lots and slabs included, used
  only when a search returns no items. Ungated by construction; 0 rows held.
- **`node ingest.js scrape`** still exists (`scrapeEbaySold`). Banned, never
  run — T8's reasoning says delete it.
- ~~Variant is gated nowhere~~ — built in T10. ~~Stored Yahoo medians carry no printing~~ — T4 `28ea4be`: a title stating a reverse/mirror leaves the base median and gets its own `variant` row. **Existing** Yahoo base rows are NOT repaired: of 191 JP cards holding both, 143 Yahoo bases sit >5x the Yuyu-tei base, 54 >20x — `jpcheck` over them is the measurement still owed. ~~"Typical" ignores the printing selector~~ — `a9ba5e3`.

---

# CALL COST — what spends eBay quota, measured (2026-10-01)

**Every row was exercised, not read from the code.** Server and scripts ran
under `node -r ./costmeter.js`: eBay stubbed (never sent), every guarded call
counted by origin and kind, every outbound request counted by host, every DB
write swallowed. The page was driven in a real browser against the metered
server. Numbers are eBay HTTP calls. **Re-measure with costmeter.js before
changing any row** — how to use it is at the top of that file.

Budget: 5,000/day · 600/hour (all origins) · tooling 300/day inside the day.

## Recurring — runs whether anyone is there or not
| what | when | eBay | measured |
|---|---|---|---|
| Nightly refresh `refresh all --max=4000 --hours=4` | 03:00, Task Scheduler | **0** | 60 cards per language with dummy credentials SET (so an eBay path could not hide behind "no credentials"): 0 eBay. Per card: EN 1 TCGdex + 1 TCGplayer internal API; JA 2 Yahoo; ZH none. **`--max` is per language** — `all` loops en/ja/zh-tw/zh-cn, so the nightly cap is 4 x 4,000 cards |
| Alert evaluation (inside refresh, per language; also `node ingest.js alerts all`) | nightly | **0 per alert** | 3 active alerts checked: **zero network requests of any kind** — it reads `price_history`. An alert costs nothing per refresh |
| Render server, idle | always | **0** | 6 min idle under the meter: 0 outbound requests. No `setInterval` in any shipped module |
| A page left open, any screen | every 5 min | **0** | `/api/alerts` + `/api/ebay/quota` (1 min while stopped) + alert tiles `cachedOnly` — 4 tiles, 0 eBay |
| "CardHunt task watch" | hourly | **0** | no network |
| **Token exchange** | per process per 2h, and **every Render cold start** | **1** — shared by every concurrent caller since `bf49963` | see below |

**The token race (the 393) — FIXED 2026-10-01 (`bf49963`).**
`getEbayTokenDetailed` had no single-flight: callers arriving while no token
was cached each exchanged. With a realistic 600ms exchange, 5 concurrent
cold opens made **5 exchanges** and a cold "Search 7 more marketplaces" **8
+ 8 searches**. Render sleeps when idle, so every wake was cold. Now one
exchange is in flight and the rest await it: re-measured, **1 and 1**. A
guard refusal made for the initiator's origin (tooling allowance, soft stop)
is not handed to a waiter of another origin — it tries under its own. At a
5ms stub the race never opens (1 exchange either way) — measure tokens with
`tokenDelayMs`, or the fix and the bug look the same.

## User — costs only when someone acts
| action | request | eBay |
|---|---|---|
| Home page load | 12 tiles `?cachedOnly=1` + trending + sets + alerts | **0** |
| Open a card, US page 1 kept >= 5 | `/api/listings/:id` | **1** (Raw, Raw NM, PSA 10 alike; JA card 1 — Yuyu-tei is not eBay) |
| **Open a card that has a known reprint** | same | **1 + 1 per reprint** — Blastoise 2 (Celebrations), Charizard 4/102 **3** (Celebrations + 30th). `flagReprintPriced` fetches each reprint's listings; the 55 originals in `REPRINT_OF` |
| Open, US kept < 5 (auto-expand) | same | **8** (+ reprints: Venusaur 9); US empty: 8 |
| Same card + grade again within 15 min | cache | **0** |
| "Search 7 more marketplaces" | `?sites=all` | **7** (+1 token if cold; was +8) |
| "Load more listings" | `?more=1` | **1 per site with more** (8 measured) |
| Verify (PSA cert) | `/api/cert` | **1** getItem |
| Photos, same listing as Verify | `/api/photos` | **0** — shared 15-min getItem cache; another listing 1 |
| Search, query resolving to one card | `/api/search?q=` | **1 per resolved card** (+ reprints: "Charizard 4/102 Base Set" = 3); graded query 1 |
| Search, ambiguous name ("Pikachu") / nonsense / `listings=0` | same | **0** — listings only when the query resolves |
| Trending · cards · history · sets · set page · market · alerts (list, triggered) · portfolio · quota read · listings-log · `dryRun=1` | | **0** each |
| Alerts screen, 6 alerts | render from the loaded list | **0** |

## Tooling — counted against the 300/day allowance
| tool / route | typical invocation | eBay |
|---|---|---|
| `/api/ebay/conditions` | `?items=25` | **26** (1 search + 25 getItem) |
| `/api/ebay/conditions` | `?aspects=1&aspect=Card%20Condition&verify=4` | **>= 2** — the stub returns no aspect values, so the per-value verify loop did not run; real cost is higher |
| `/api/ebay/conditionvalues` | default | **7** (5 search + 2 metadata) |
| `/api/ebay/certprobe` | `?grader=PSA&single=12` | **13** (1 + 12 getItem) |
| `/api/ebay/gradecost` | `?grade=PSA%2010` | **2** on a light card; more pages on a busy one |
| `/api/ebay/marketprobe` | default sites | **11 per card** (8 sites + NOCAT/NOSET variants) — the 12-card run was ~132 |
| `/api/ebay/marketprobe` | `?mp=EBAY_DE` | **2** |
| `/api/ebay/aspects` | `?mp=EBAY_DE` | **1** |
| `/api/ebay/setprobe` | `?single=N&verify=1` | **1 + N (+2)** — 20 sampled = 23 |
| `/api/ebay/quota?probe=1` · `node ebayratecheck.js` | | **1** rate_limit (+1 token cold; ratecheck always exchanges its own: **2**) |
| `/ebay/status?probe=1` · `/api/scraper/test` · `/api/health/full` | | **0** with a cached token, **1** cold |
| `/api/probe/sources` · `node sourceprobe.js` | | **0** — eBay is not a probed source |
| `node sitecheck.js` | default: 3 cards, 2 Load-more presses (`8c5f7db`) | **41** light · **89** busy (5,000 listings per site). Was 10 cards / 50 presses: **128** light, no practical ceiling busy. `--wide` = the old 10 |
| `node sitecheck.js <card>` | one fresh card, Raw NM | **8** light · **40** busy (8 sites x 5 pages) · `--grade=all` **16** · a card already cached **0** |
| `node linkaudit.js sv10 --live --limit=8` | | **8** (1 per card); without `--live` **0** |
| `node gradeprices.js --limit=2` | 4 default grades | **8** (1 per card per grade). Default `--limit` lowered 20 -> **5** = **20** calls (local file, gitignored) |
| `node ebayprobe.js en-swsh3.5-74 "PSA 10"` | | **2** (token + search) |
| `node setaudit.js` · `node searchaudit.js` | `--set=sv10` · `--set=sm9` (369 requests) | **0** — dryRun / `listings=0` |
| `node yahoogate.js` · `tcgdexharvest.js` · `tcgdexprobe.js` | | **0** (yahoogate reads Render `/api/cards` only) |
| Every `node ingest.js` command measured — status, audit, setcover, pricecheck, safeprices, tcgdexprices, manifest, setgap, names, lmingest, yuyutei, jpcheck, clean, imgreport, refresh, alerts | | **0** (credentials present) |
| The whole test suite, `*.test.js` + jptest | | **0** |
| `gateaudit.test.js --live` + `nosoldscrape.test.js --live` | against `CARDHUNT_API` | **1** |
| `node ingest.js scrape` | **never run** | banned — not exercised |

**What this says.** Nothing recurring touches eBay. Every call is someone
pressing something — the token race, which multiplied whatever a cold burst
was going to spend, is fixed (`bf49963`). The hidden per-view costs are the
reprint check (+1/+2 on 55 cards) and auto-expand (8 on thin cards). The big
spenders are all tooling: marketprobe (11 per card), conditions `?items=`
(1 + items), and sitecheck — its defaults cut from 128 to 41 (`8c5f7db`).
Pick a tool's sample size from its row here before running it.

---

# TASKS

## T1 · Verify English and Japanese — standing check, not a one-off
Two full price runs completed with number-matching, the Yahoo lot filter and the
rarity tiebreaker. Coverage holds at 89.4% / 82.5%. Re-verify before building on
top of it:

```powershell
node ingest.js status
node ingest.js audit en --bad
node ingest.js audit ja --bad
node ingest.js setcover en
node ingest.js pricecheck en me02.5      # ours vs live TCGPlayer
node ingest.js pricecheck en sv03.5
```

`pricecheck` flags anything more than 40% from live data. Known checks:
Mega Gengar ex #284 ≈ $1,176 · Mega Charizard Y ex #294 ≈ $438 ·
Pokégear 3.0 #186 under $1.

Then spot-check Japanese for the lot-inflation problem — but read the source's
own rarity label first: `ja-CP6-33` ピカチュウ is genuinely rarity `C` at
¥24,800, so "no Common in the hundreds" cannot be a pass/fail gate.

## T2 · Listing finder — SHIPPED, with named gaps

`GET /api/listings/:cardId?grade=PSA+10` returns live listings sorted by landed
cost, gated, outlier-flagged, from every source that answers Render. Verified
live today on `ja-SV8a-002`: Yuyu-tei ¥80 base printing at $0.51 beside three
eBay rows at $1.19-1.23.

Response envelope:

```
cardId, requestedId, card, grade, count, liveCount, cheapest, cheapestLive,
outliers, gradePrice, listings[], sources{}, tookMs, cached, cachedAgeSec,
freshness, attribution, fetchedAt
```

Each listing row:

```
source, sourceLabel, title, price, currency, priceOriginal, currencyOriginal,
shipping, shippingKnown, landed, condition, seller, url, imageUrl, endsAt,
bids, listingType, live, country, attribution, priceKind, edition, variant,
parsedRarity, parsedYear, matchConfidence
```

Each source block reports `status, count, scanned, kept, rejected, gate,
summary, droppedSample, query`. **A set of listings carrying no rejection count
has not run the gate** — that is the tell, and it has caught a defect twice.

`?dryRun=1` builds the request, sends nothing and spends no quota.

### On demand — US page 1, the rest when asked (T2, 2026-09-30)
`/api/listings` and `/api/search` both answer through `listingsFor` — one
payload builder, **every row returned** (it had sliced to 25 while
`count` said 58).

| action | request | eBay calls |
|---|---|---|
| open a card | default | **1** — `EBAY_US`, page 1, 200 rows. **2-3 on the 55 cards with a known reprint** (`REPRINT_OF`): the reprint check fetches each reprint's own listings, +1 per reprint — Base Set Charizard costs **3** (Celebrations + 30th), Blastoise 2. Measured, CALL COST |
| "Search 7 more marketplaces" | `?sites=all` | one per site not yet answered |
| "Load more listings" | `?more=1` | one page per searched site that has more |
| US page 1 kept **< 5** | automatic, same request | +7 (`AUTO_EXPAND_BELOW`, measured — lesson below) |
| home-page tiles | `?cachedOnly=1` | **0** — cache or "open the card to check listings" |

Buttons extend the cached view (`VIEW_STATE`, 15 min) and re-judge every row
together (`rebuildView`). Nothing runs by itself afterwards — T1's
`continueListings` background crawl and the page's poller are deleted.
`progress` says what is NOT shown: `searched`, `notSearched`, `morePages`
(`notExamined` per site), and `actions` carrying each button's label and
call cost — "128 listings from eBay US. 7 more marketplaces not searched
(GB, AU, CA, DE, FR, IT, ES). 99 more results on eBay not yet examined".
A refused site (busy, quota, 409) stays in `notSearched` and the next press
asks it again; a busy/error answer is not cached, server or page
(`retryable`). eBay's own ceiling (offset+limit ≤ 10,000) is STATED as
incomplete. Also `?edition=` (T3), `?auto=0` (measurement only).

- **Shipping is never a filter.** Rows carry `shippingTo` (whose buyer the
  site quotes) and `shippingKnown`; every non-USD row goes through `fx.js`
  with `priceOriginal`/`currencyOriginal`/`fx` on the row.
- **One item, one row.** De-duplicated by item id; the copy from the site
  EARLIER in `EBAY_SITES` wins whatever page lands first (IT re-returns US
  listings under machine-translated titles).
- **A refusal on an English-titled site (US/GB/AU/CA) is sticky
  everywhere**; a refusal on a translated site (`originalTitles: false`)
  drops only its own copy — see the lesson below.
- **Calls per view are recorded**: `listing_views` (counts only, no eBay
  item data) with `action` (open / open+auto / all-sites / more) and
  `origin` (render / local), summarised at `GET /api/listings-log`
  (render only by default; `byAction`, `callsPerCardOpened`). Marked, not
  deleted: 34 local test views `origin=local`, 538 T1-era views
  `action=t1-every-site`, 40 threshold-measurement views `measure:*` —
  reported under byAction, never averaged into browsing.
- `node sitecheck.js [--grade=all] [--pages=N]` presses every button (all
  sites, then Load more until nothing is owed) and reports rows per site
  plus an INDEPENDENT language reader's suspects. Expensive by design —
  run it after any change to `EBAY_SITES` or the gate's vocabulary.

Measured 2026-09-30 after deploy: 11 plain opens **1 call each**; two cards
opened at once during a background job answered in 2.1-2.6s (was: 75s and
zero rows); Search all on sv03.5-199 7 calls (128 -> 301 rows), Load more
6 (-> 372). Under T1 the same views cost mean 7.6, max 32.

### The registry

`LISTING_SOURCES` in `server.js` — every source is one function returning the
same normalised shape, through `cardmatch` and `outlier.js`, reporting
kept/rejected/scanned:

| id | applies to | note |
|---|---|---|
| `yahoo` | `ja-` cards | Japanese-language marketplace. **403 from Render** — local only |
| `yuyutei` | `ja-` cards | shop ASKING prices, `priceKind: 'shop-ask'` |
| `ebay` | anything with an English name | the only English source |

`UNAVAILABLE` holds mercari / cardmarket / facebook / localshops with a stated
reason each, so the response always explains every marketplace the UI offers
rather than silently returning a short list.

### What remains

1. **`node ingest.js names ja`** — 64% of Japanese cards cannot be asked about
   on eBay. Biggest single win, no credentials, no new code.
2. **PriceCharting** — already JSON, no parser to write, and it carries graded
   price history, which is the weakest data we hold.
3. **Troll and Toad / Card Kingdom** — English singles, a second and third
   source beside eBay for a catalogue that currently has one. Each is an HTML
   parser and each deserves its own verification pass.
4. **Auctions from Render.** No API covers them: Yahoo Auctions 403s Render and
   its Web API was withdrawn in January 2020. If auction listings are wanted in
   production, the design is fetch locally → store in Supabase → serve from
   Render, showing the fetch age so a stored listing is never presented as live.

### eBay — live, guarded, and its data is never stored

The free tier is 5,000 calls/day, no approval, and it is **in production now**.
`GET|POST /ebay/deletion` plus `GET /ebay/status?probe=1` for real readiness.
Credentials are `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_VERIFICATION_TOKEN`
on Render. Every call routes through `ebaycall.js` → `ebayquota.js`; see the
quota lesson for the four properties that are not obvious.

## T3 · Alert engine on real data — STILL OPEN, and still simulated
`ALERTS` in the frontend simulates ±3% movement every 30 seconds. The `alerts`
table exists and `/api/alerts` works; **the frontend never calls it** —
`grep -c "api/alerts" cardhunt_preview.html` returns 0, confirmed today.

Needs: persist alerts to Supabase, evaluate them against real prices on each
refresh cycle, record `triggered_at` and the listing that triggered it, and
surface the listing link in the UI. Alert types already modelled: price below,
price above, new listing, percentage below market. `evaluateAlerts` exists in
`ingest.js` (`node ingest.js alerts`) and has been lost to a revert once.

## T4 · Scheduled refresh — running nightly
`node ingest.js refresh <lang>` prices whatever is overdue. Tiers:

| Tier | Interval | Qualifies |
|---|---|---|
| hot | 24h | ≥ $100, or Hyper Rare / SIR |
| active | 72h | ≥ $20, or Illustration Rare / Secret / Ultra |
| steady | 7d | ≥ $5, or Double Rare / Rare Holo / ACE SPEC |
| slow | 14d | ≥ $1, or Rare / V / VMAX / VSTAR / GX |
| dormant | 30d | everything else — Common, Uncommon, Promo |

**Price beats rarity when they disagree** — a $700 Base Set Charizard is Rare
Holo on paper but belongs in `hot`. Within a run, cards are ordered by how
overdue they are relative to their own interval, weighted by value, so a partial
run always covers what matters most. Roughly 3,700 cards a day, about 2.6 hours.
Cards moving 10%+ are logged.

**`--max` applies PER LANGUAGE** (measured 2026-10-01): `refresh all` loops
en, ja, zh-tw, zh-cn and gives each its own cap, so the nightly
`--max=4000` allows up to **16,000 cards**, not 4,000. `--hours=4` is the
bound that actually holds the whole run. Alerts are evaluated at the end of
each language's pass. The refresh touches no eBay (CALL COST).

```powershell
node ingest.js refresh en --dry              # what is due, change nothing
node ingest.js refresh en                    # price it
node ingest.js refresh all --max=2000        # cap a run
node ingest.js refresh all --max=4000 --hours=4
```

**This box is Windows: there is no cron.** A crontab line sat in these notes for
weeks and never ran anywhere. The real schedule is `refresh-daily.cmd`,
registered with Task Scheduler as **"CardHunt nightly refresh"**, 03:00:

```powershell
schtasks /Query  /TN "CardHunt nightly refresh" /V /FO LIST
schtasks /Run    /TN "CardHunt nightly refresh"
schtasks /Change /TN "CardHunt nightly refresh" /ST 04:00
```

`DATABASE_URL` is read from the *user* environment, so the task must run as this
user; it is not set machine-wide. `--hours=4` caps the run from inside node —
see the lesson on why the scheduler's own limit does not bind it.
`task-watch.ps1` logs task state hourly to `task-watch.log`.

## Near you (local card shops) — PLANNED, needs a real data source
The card page keeps a "Near you" tab. Until 2026-09-28 it listed three
invented shops with invented distances, hours and prices (price x .95 / 1.02
/ .9). Now it shows an honest empty state. **Do not fill it with anything a
source did not return.** Roy is connecting a source; candidates to PROBE
first (rule 1): Google Places (free tier, real card shops near a location),
TCGplayer's store locator if reachable, or manual curation starting with one
city. Whatever it is: one function, a stated source on every row, and no
price unless the shop published one.

## Sold data — NO SOURCE, and the page says so
Since T8 (2026-09-29) nothing supplies realised sale prices: the eBay
sold-page scrape is gone and must not return in any form, server or ingest.
Legitimate routes, none built:
- **eBay Marketplace Insights API** — sold items, but a RESTRICTED API
  needing a business application to eBay. Probe/read the terms first.
- **PriceCharting** — paid; `search-products` answers JSON from Render
  (see WHICH SOURCES ANSWER), carries graded sale history.
Whatever it is: one function, a stated source on every row, and the Last
sold box stays "no licensed sold source" until it exists.

## Checkout and login — DISABLED, preserved outside the page
`checkout-disabled.js` (asked for an eBay password and a card number, then
confirmed an order that was never placed) and `login-disabled.js` (accepted
any password and "signed in" an invented Alex). Tracked, never loaded, never
served (`approute.test.js` asserts 404). Neither returns without a real
payment flow / auth backend — each file's header says what that means.
`nofabricated.test.js` fails if a password or card-number input reappears,
and `--deployed` checks the HTML Render actually serves.

## T5 · Chinese — parked
Do not spend time here. Rarity is unfixable without a source, prices need eBay,
and TCGdex's Chinese pricing is the Japanese card's — priced in EUR, translated
name only. `pricingAllowedFor()` permits `en` and `ja` only.

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
node ingest.js lmingest <lang> [set]                # sets TCGdex lacks, via Limitless
node ingest.js names <lang>                         # English card names  <- T2 gap
node ingest.js pokedex                              # JP/CN -> EN dictionary

# prices
node ingest.js refresh <lang> [--dry] [--max=N] [--hours=N]
node ingest.js safeprices <lang> --all [--set=X]    # full backfill
node ingest.js yuyutei [--dry] [--all] [--set=X] [--max=N] [--force]
node ingest.js pricefix <lang> [--delete]           # purge name-matched prices
node ingest.js clean [--delete]                     # junk price audit
node ingest.js jpcheck <lang> [...]                 # JP prices vs Yahoo
node ingest.js jppurge [...]                        # remove bad JP rows
node ingest.js alerts <userId> [...]                # evaluate alerts (T3)
node gradeprices.js --limit=20 [--write]            # what each grade is worth

# TCGdex pricing — no credentials, works from Render
node ingest.js tcgdexprices <lang> [--dry] [--set=X] [--max=N] [--gaps-only]
node tcgdexharvest.js <lang> --dry                  # same, standalone
node ingest.js manifest <lang> --prices             # harvest during the rarity pass
node tcgdexprobe.js xcheck en 40                    # ours vs TCGdex, same marketplace
node tcgdexprobe.js cmcheck ja 30                   # cardmarket EUR->USD vs held
node tcgdexprobe.js census en 60                    # which printing keys exist
node tcgdexprobe.js reverse                         # reverse-holo display hazard
node tcgdexprobe.js coverage <lang> 80              # what TCGdex would add

# which sources answer a server  (the same module, both ends)
node sourceprobe.js                        # every source, from here (home IP)
node sourceprobe.js yuyutei                # one source
node sourceprobe.js yahoo                  # the whole yahoo_* family, as a table
curl '<host>/api/probe/sources'            # the same module, from Render
curl '<host>/api/probe/sources?id=yahoo&refresh=1'

# eBay — guards, quota, live checks
node ebayquota.test.js                     # 25 assertions, the quota gate
node ebaycall.test.js                      # 86, every guard tripped; lanes, slots, busy cap
node ebayratecheck.js                      # ask eBay the REAL limit (needs keys)
node ebayprobe.js en-swsh3.5-74 "PSA 10"   # credentials -> token -> search -> gate
node yahoogate.js ja-SV2a-201              # the Yahoo gate, live (LOCAL ONLY - Render is 403'd)
node yahoogate.js --query "ポケモンカード 韓国版"   # make that gate actually fire
curl '<host>/api/ebay/quota'               # spend so far, by eBay's count
curl '<host>/api/ebay/quota?probe=1'       # + ask eBay the real limit (1 call)
curl '<host>/api/ebay/conditions/en-base1-4?items=25'            # descriptors: summary vs getItem (26 calls)
curl '<host>/api/ebay/conditions/en-base1-4?aspects=1&aspect=Card%20Condition&verify=4'  # filter vs descriptor
curl '<host>/ebay/status?probe=1'          # does eBay ACCEPT the credentials
curl '<host>/api/listings/en-swsh3.5-74?grade=PSA%2010&dryRun=1'   # spends nothing

# what does an action cost in eBay calls? — measures, spends nothing (CALL COST)
# eBay stubbed, calls counted by origin, DB writes swallowed; see the file header
node -r ./costmeter.js server.js            # then exercise the action, read costmeter.out.json

# end-to-end audits — tracked, read-only, run from anywhere
node setaudit.js en --broken               # every set end to end, failures only
node setaudit.js all --limit=40
node linkaudit.js sv10 --live --limit=8    # why a card has no links: A/B/C
node linkaudit.js swsh11 --name=Giratina --kept
node linkaudit.js en-sv10-1 --grade="PSA 10"
# can /api/search find every card by its own name? ~27k queries, ~1h+
CARDHUNT_API=http://localhost:3001 node searchaudit.js en --json=sa.json --concurrency=4
node searchaudit.js en --json=sa.json --resume   # continue a killed run

# artwork
node ingest.js imgscrape <lang> [--force]
node ingest.js imgreport <lang>
```

## The test suite — all green 2026-09-29

Standalone by design, so a revert of `ingest.js` cannot take them with it.
Counts are today's; a suite that suddenly reports fewer has lost assertions.

```powershell
node approute.test.js        # 50   /app serves, and the project root does not leak
node cardmatch.test.js       # 27   the gate
node cardmatch2.test.js      # 29
node cardmatch3.test.js      # 44   NOT_A_SINGLE_CARD word boundaries, both directions
node cardparse.test.js       # 156  free text -> card identity (191 with --db:
                             #      reachable-by-name cases + SQL/JS fold agree)
node ebaycall.test.js        # 103  every guard tripped; two lanes, five slots, 4s foreground cap; hourly + tooling through fetchEbay
node ebayquota.test.js       # 69   the quota gate; hourly ceiling and tooling allowance TRIPPED; what the app shows
node ebaytoken.test.js       # 62   which failure is reported, not merely that one was; ONE exchange shared by concurrent callers
node estimator.test.js       # 31   the one estimator
node gradeprice.test.js      # 27
node jptest.js               # 88   39 of them assert the filter KEEPS; English cases run cardmatch.verify
node listingparse.test.js    # 26
node matchparity.test.js     # 102  /api/listings and /api/search cannot disagree
node outlier.test.js         # 12   the price test, on the real Giratina #186 spread
node outlierwire.test.js     # 33   ...and that it is actually REACHED: both payloads
node printinggate.test.js    # 116   reprint/language/year, BOTH marketplaces (CRLF-tolerant)
node reprint.test.js         # 126  reprints by SET ID, both directions, real titles
node printrun.test.js        # 39   1st Edition / Shadowless / Unlimited, only where they existed
node selector.test.js        # 531  every grader, every published grade, through the real gate
node rawgate.test.js         # 74   every grader's slab refused from a raw search — AND
                             #      TAG TEAM / ACE SPEC / Alt Art kept
node scopeguard.test.js      # 28
node setlist.test.js         # 27   the browsed set list resolves; set page == card page; ingest.js tracked
node sourcerank.test.js      # 48   9 of 15 decision cases PERMITTED, not only blocked
node tcgdexprice.test.js     # 70
node digital.test.js         # 49   Pocket hidden at every read; server never writes `cards`
node reprintprice.test.js    # 98   reprint-price band, both directions, on live rows
node cardid.test.js          # 51   foreign ids refused; producers closed; DB count zero
node gradefilter.test.js     # 58   eBay grade fields; refuse where title and field disagree
node anygrade.test.js        # 27   grader-wide mode still checks the card
node cdlayout.test.js        # 17   one spacing rule down the card page's price column
node ebaypaging.test.js      # 66   the REAL sourceEbay + site layer: US-only default, Search all, Load more, fx, sticky refusals, one row per item
node unspaced.test.js        # 41   "PSA10" read; TAG TEAM / ACE SPEC still reachable raw
node certcheck.test.js       # 47   cert + photos from one getItem; never claims verified; never padded; nothing eBay persisted
node reprintpricing.test.js  # 13   reprints priced by printed number in their own TCGPlayer set (SKIP w/o ingest.js)
node manifestmap.test.js     # 12   manifest never maps "None" to Common (SKIP w/o ingest.js)
node marketwait.test.js      # 14   no /api/market request; one /api/listings per card+grade; tiles read the cache only
node nofabricated.test.js    # 48   no password/card input, no invented shops/holdings/prices (--deployed: Render's HTML too)
node nosoldscrape.test.js    # 17   no eBay sold-page scrape; real /api/market handler, network stubbed (--live: +3)
node gateaudit.test.js       # 62   T9: every path reaches the gates it needs, and reports (--live: +8)
node variants.test.js        # 81   T10: printings from the REAL TCGdex shape; the gate; every reader; the page; Typical follows the printing (--db: +6)
node pricesource.test.js     # 49   T1/T4: set-checked TCGplayer match; shared products refused; Yahoo mirrors kept out of the base
node eusites.test.js         # 80   T1: eBay DE/FR/IT/ES titles — reprints, junk, slabs, conditions; both directions, real titles
node quotaui.test.js         # 24   T3: a quota refusal reaches the panel in words; indicator wiring (23 fail on the old page)
node edition.test.js         # 69   T3: 1st Edition/Shadowless/Unlimited — reader, gate, query, headline rule, page (--db: +2)
node promo.test.js           # 69   Black Star Promos: no set total asked or checked; real live titles kept; McDonald's refused
node subset.test.js          # 27   TG16/TG30, SV107/SV122, GG01/GG70 asked and kept; Generations RC by number alone
```

Run them all:

```powershell
Get-ChildItem *.test.js | ForEach-Object { node $_.Name } ; node jptest.js
```

**Never run `node ingest.js scrape`** — it parses eBay's completed-listings HTML
and risks an IP block. Use `safeprices` or `refresh`.

## Windows: replacing ingest.js
```powershell
cd C:\Users\chili\Downloads; move ingest.js C:\Users\chili\cardhunt\ -Force; cd C:\Users\chili\cardhunt; node ingest.js status
```
**Confirm the version banner before running anything.** If the move errors with
"cannot find path", the download did not happen and the old file is still there.

## Deploying

```powershell
git add -A ; git commit -m "..." ; git push
```

Render redeploys from `main`. Then check the build stamp at `/app` and
`GET /` for the version.

---

# HARD-WON LESSONS

## Build the authoritative card list first
Price matching, estimates and variant disambiguation all depend on knowing each
card's number, name and rarity. Inferring rarity from position was wrong for
**over half** the cards in a set, and every price built on it was wrong too.

## Match on collector number, and refuse to guess
TCGPlayer lookup once matched on name alone. Where a name repeats in a set —
which chase cards almost always do — every variant got the same arbitrary price.
Phantasmal Flames had #109 at $324.67 and #130 at $31.01 with the true values
reversed. Now: match by number, then rarity as a tiebreaker, then **return
nothing**. A wrong price is worse than no price.

## A guard against bad data can destroy good data
`looksLikeJunk` was built to catch a sealed booster box matching dozens of cards
at $5,399.95. It also fired on bulk commons — twenty cards at TCGPlayer's $0.15
floor is normal market data. It silently rejected ~80 valid prices per set.
`clean --delete` would have deleted 46% of all real prices for the same reason.
**Any filter that rejects records needs a test proving what it keeps.**

This is the most repeated failure in the project. It has now recurred as
`NOT_A_SINGLE_CARD` eating card names, as `SLAB_WORDS` making TAG TEAM cards
unsearchable, and as a probe classifier reporting a working source as blocked.
Expect it again.

## Don't let inference override known data
`mockP` re-inferred rarity from card position even when the stored rarity was
correct, pricing Pokégear 3.0 — a Common at #186 of 198 — as a Rare Ultra at
$46. Inference is for absent data only.

## Not every gap is a bug
2,100 English cards sat at 0-3% price coverage: Pokémon TCG Pocket, digital-only,
no market anywhere. `isDigitalSet()` excludes them. Establish that data *can*
exist before chasing it.

## Vintage changes the floor
A 1999 Base Set common trades far above a 2024 common. Estimates scale by set
age — 9x pre-2000, 5x pre-2003, 2.5x pre-2007 — and the ceilings scale with it.

## Vintage Commons can be genuinely valuable
`ja-CP6-33` ピカチュウ is rarity `C` at ¥24,800. "No Common in the hundreds"
cannot be a pass/fail gate — check the source's own rarity label.

## Japanese listings are full of lots
Yahoo Auctions counts 100-card lots and PSA slabs as single-card sales, which
inflated Japanese prices 35-75% and put a Common at $573. Titles containing
まとめ, セット, 一括, 引退, BOX, 未開封, PSA, BGS, 鑑定 or any 枚/点 quantity
marker are excluded before the median. `jpTitleIsSingleRaw()` in `jpfilter.js`
is the one definition, and Yuyu-tei's parser calls it too — a shop page is
singles by construction, but it also sells bundles.

## Don't guess URLs — read them
Four rounds of constructing image URLs from set id and card number returned 0%,
while 3,297 Japanese cards already had working artwork whose pattern was never
examined. Look at what already works first. And verify the tool before trusting
its output — the first image probe used HEAD only, which some CDNs reject, so
every result was a false negative.

### …and the set-list endpoint is still doing it, measured 2026-09-22

`/api/sets/lang/:lang` falls back to a **constructed** logo URL whenever
`set_logo` is null:

```
logo: r.logo || `https://assets.tcgdex.net/${lang}/${tcgdexSeriesFor(r.id)}/${r.id}/logo.png`
```

Coverage of the real, captured value:

| | sets | with a stored `set_logo` |
|---|---|---|
| English | 220 | 157 |
| Japanese | 138 | **0** |
| Chinese | 84 | **0** |

So **222 Japanese and Chinese sets, plus 63 English ones, are served a URL
that was guessed**. Seven sampled JA logos all 404, and `tcgdexSeriesFor`
guesses the series wrongly as well — `SM6b` resolves to `swsh`. TCGdex simply
has no logo for those sets (`logo: undefined` on the set payload); where it
does have one, the real URL carries **no `.png` extension**.

Two paths therefore disagree about one fact, which is the cross-check failure
this file keeps recording: `/api/cards/:id` returns `logo: null` honestly,
while `/api/sets/lang/en` returns a 404 URL for the same set. A guessed URL is
indistinguishable from a real one until it is rendered, so the browser shows a
blank tile and nothing reports why.

The fix belongs with the set tiles (TASK.md Phase 1a/2: "where a set has no
logo, show its name in a styled tile rather than a broken image") — the
endpoint must return `null` and the page must render the fallback **visibly**,
rather than the two of them conspiring to produce a silent blank.

## Never substitute across languages
Simplified Chinese was served Traditional Chinese sets. English artwork was
placed on Japanese cards. Cross-language matching is for *finding* equivalents,
never for *displaying* them.

## `'\D'` is just `'D'` in a JS string
An unrecognised escape drops the backslash silently. `regexp_replace(number,'\D','','g')`
became `'D'`, left `"FIG"` intact and crashed the `::int` cast. Numeric handling
now uses `CASE WHEN number ~ '^[0-9]+$'` — and note that stripping non-digits
would have made `TG12` collide with card #12 anyway.

## The TCGplayer API has no application to put in
Checked at the primary source on 2026-09-20, `docs.tcgplayer.com/docs/getting-started`,
because a third-party summary is not evidence:

> "We are no longer granting new API access at this time."

No form, no email, no partner route stated, no reopening date. `developer.tcgplayer.com`
301s to the docs, and the docs cover only how to use credentials you already hold.
**There is nothing to apply for**, so nobody should spend time hunting for the page.

This is the eBay lesson's mirror image, and both directions matter: eBay's
barrier was assumed and false, TCGplayer's application is assumed and absent.
Read the primary source either way.

What was wanted from it — TCGplayer market prices — **we already have
legitimately**: TCGdex serves pricing keyed by TCGplayer's own `productId`,
validated at a median 1.020x against our scraped `tcgplayer_market` with
37 of 37 in agreement. Recheck only if TCGdex's pricing stops.

## Read the terms before writing a source off
eBay's Browse API looked gated behind an approval process. It is not — 5,000
calls/day is the default for individuals, available immediately with a keyset.
The only prerequisite is an account-deletion notification endpoint, roughly
thirty lines. An assumed barrier cost weeks of working around it, and eBay is
now the only English listing source in production.

## Scraping is not a production strategy
Yahoo Auctions returns **403 to Render and 200 to a home IP** — verified both
ways. Cardmarket 403s identically. Every scraper in this project worked
throughout development only because it ran on a residential connection.
Anything the deployed server must fetch has to be a sanctioned API, or fetched
locally and stored in Supabase.

### …but "datacentre IP" is a per-source fact, not a law
Measured 2026-09-20 and re-confirmed 2026-09-22, the same module run from both
places — `node sourceprobe.js` here, `GET /api/probe/sources` there.

**Yuyu-tei serving Render is the significant one.** 200 from both, and on the
first measurement byte-identical at 1,172,188 bytes from each. It is already
parsed and trusted (9,294 `yuyutei_shop` rows), one fetch returns a whole set
with number, printed total, rarity, price, stock **and a per-card URL** — so it
is a listings source, not only a price source, and Japanese stops depending on
a residential IP. Yahoo Auctions blocking datacentre IPs said nothing about it,
and nobody had asked in the two months since the parser was written.

The full table lives under **WHICH SOURCES ANSWER** above. Re-run the probe
rather than re-deriving it.

### The probe's first run was wrong, and catching that is why it exists
The classifier matched `/cloudflare/` anywhere in the body and reported
Yuyu-tei as **blocked**. Yuyu-tei had served 1.17MB of Japanese shop page with
482 card blocks; the word came from `cdnjs.cloudflare.com` in a stylesheet link.
`looksLikeJunk` in a new costume, and one edit from being written into CLAUDE.md
as fact and killing the best source found all year.

It now asks whether the expected markers are **present** before diagnosing why
not, and recognises a challenge page structurally rather than by keyword.

**One module, run from both ends.** Two implementations would leave "it is the
IP" and "it is our code" indistinguishable — exactly the ambiguity the Yahoo
Auctions result took weeks to resolve.

## Yuyu-tei quotes shop ticks, not valuations
Across all 9,294 stored `yuyutei_shop` rows the prices cluster on discrete
points: ¥30 ($0.19) 2,821 rows, ¥50 ($0.32) 2,423, ¥80 ($0.51) 1,445, ¥120
($0.76) 928. **56.4% sit at or below ¥50.** At that level the number is the
shop's minimum listing price — what it costs to have a bulk common on a shelf —
not what the card is worth.

Cardmarket valuing the same card at $0.02 is not a disagreement about which card
it is; it is the only one of the two making a valuation. Comparing across that
floor and calling the result a mismatch is the `jpcheck` failure: reporting a
missing comparison path as a finding. `cmcheck` partitions them out.

**So every Yuyu-tei row is an ASK, and says so.** `priceKind: 'shop-ask'` rides
on the row and on the source block, rendered as "shop asking price" in the
panel. It runs ~1.40x over Yahoo medians. If it is ever averaged into anything
describing realised sales, that is the mistake already made once with stored
prices. The row carries the label rather than the envelope, for the same reason
eBay's attribution does: a row gets rendered far from anything that would
otherwise explain it.

## The stored price was right 90% of the time — and wrong by SET, not by H-number (T1, 2026-09-29)
2,767 English cards (12 per set, all of e-Card), stored non-TCGdex price vs
TCGdex live: **90% within 10%**, 8% drift 10-40% (mostly sub-$1 and newest
sets), 2.3% wrong by >40%. By era, >40% wrong: every era 0-3% **except
Expedition, 27 of 59**.

The hypothesis was H-numbering (Aquapolis/Skyridge holos are H1-H32). It
was **falsified**: those H-numbered holos agreed **54 of 54**. Expedition
numbers plainly 1-165, and its holos AND rares were wrong.

One search showed why: `tcgPlayerSearch` accepted the collector number in
ANY set, and "Expedition **Base Set**" ranks Base Set products first.
Alakazam 001 took Base Set 2 001/130 ($55.51) or Base Set 001/102 ($69.72)
— the stored history alternates between exactly those — for a $233.32
card. Same class: Sun & Moon is "SM Base Set" on TCGplayer.

**But TCGdex was wrong in the other direction on a subset:** Trainer
Gallery TG16 Mimikyu V ($86.55, which we held correctly) is mapped to the
main-set 068/172 product ($3.62). Neither source is blindly right, which is
why the fix has two halves:
- `tcgsetname.js` — a search hit counts only in TCGplayer's own name for
  our set (normaliser + 22 aliases measured on 161 sets; trainer kits
  deliberately refused — the merged kit set numbers each half from 1).
- `tcgdexprice.productConflicts` — a product id TCGdex gives to two cards
  is trusted for neither; the same rule catches T4's Alakazam #1/#33
  sharing one Cardmarket product.

Japanese: TCGdex has 45% of the sampled JA cards at all, TCGplayer pricing
for none, Cardmarket at a median 0.45x of what we hold. It is no
replacement for Yuyu-tei/Yahoo; the 72,174 rows are an English question.

## The master-ball mirror, found for the third time
A collector number does not identify one card. Master-ball mirrors share the
number with the base card — `129/165` matches both. Every disambiguator built on
name + set + number confirmed the listing was correct and returned the mirror
anyway. 142 cards, up to 119x wrong, no visible symptom, because those mirrors
genuinely sell for $20-50.

Found only by cross-checking Yuyu-tei against Yahoo and asking why one set
disagreed: SV8a 1.45x, S12a 1.40x, M2a 1.19x, **SV2a 0.30x**. No test would have
caught it.

**And then again on Yuyu-tei's own pages.** 144 of 482 numbers on one set page
carry parallel printings up to 37x apart — リーフィア ¥80 base, ¥680
monster-ball, ¥2,980 master-ball. Our catalogue holds one row per number, so
`pickVariants` keeps the base printing our catalogue has a row for, and never a
mixture. Verified live: #001 and #002 return ¥50 and ¥80, not ¥500 and ¥2,980.

## Count what the gate examined, not what the page held
Yuyu-tei's first run reported "1 kept, 0 rejected of 482 scanned", which reads
as a 99.8% rejection that never happened — 481 of those are different cards.
`scanned` is now what the gate actually examined, with `pageEntries` and
`atNumber` reporting the narrowing. A number that invites a wrong reading is a
defect even when every digit is correct.

## Cross-check two paths that should agree
The highest-yield technique in this project. It found the mirror collision
above, and the Raw NM bug — 22 listings via `/api/listings`, 0 via `/api/search`
for the same card, neither reporting an error. Wherever two paths compute the
same thing, assert they match (`matchparity.test.js`, 102 assertions).

It also produced the strongest positive evidence in the project: on
`ja-SV2a-201` リザードンex, Yuyu-tei says $441.83 and the eBay median says
$445.74 — **1% apart**, one Japanese shop and one US marketplace, entirely
independent, on a $450 card.

## A tool that cannot check something must say so
`jpcheck` validates against Yahoo and reported correct Yuyu-tei prices as
`DROPPED -- no valid comparable` — 20 of 25 in one sample. The prices were fine;
Yahoo simply does not carry ¥30 commons. Wording that implies a finding where
there is only a missing path is the same failure as `pricecheck ja` returning an
empty table.

## A read endpoint must never write
`/api/market/` persisted its own aggregate on every card view, matched on name
and set with no collector number, and corrupted ten cards through ordinary use.
Mega Gengar ex #284 at $1,056 was overwritten with $3.14 — the price of #125.
Invisible because it fired on views, wrote through the same endpoint that reads,
and labelled itself "TCGPlayer market price".

`gradeprices.js` is the shape that is allowed: a script, run deliberately, that
says what it did. `/api/listings` computes the same aggregate and returns it
without storing it.

## Yahoo Shopping: what the 403 is NOT
Four hypotheses, each killed by one request. Recorded so nobody re-runs them —
and because two of the four were stated confidently and wrong.

| Hypothesis | Test | Result |
|---|---|---|
| Wrong endpoint | V3 vs V1 vs V2 | V1/V2 are gone — HTTP 500 「ページが表示できません」 from a served IP |
| Wrong auth method | `appid` query vs `Yahoo AppID` in User-Agent | **both are read.** UA-only returns 403, not 401, so Yahoo finds the key there |
| Sending both is safer | query + UA together | **401 "Authentication parameters in your request conflicted"** — sending both is an error |
| Browser User-Agent | `cardhunt/1.0` instead of Chrome | no change, still 403 |
| **Geo-block** | V3 with **no credential at all** | **Render gets 401, identical to home** |

Yahoo documents two auth methods verbatim at
`developer.yahoo.co.jp/appendix/request/`, and the probe was sending neither
faithfully. Six variants now exist, each isolating one difference, and the
baseline was established **with a deliberately bogus key** so every reading is
attributable.

That last row is the one that matters, and it needs no credential. Yahoo answers
`401 "Authentication parameters ... incompleted"` to a keyless request from
**both** IPs — so it examines credentials from Render's IP, and the refusal is
not geographic. Two requests, no secrets, and the question is settled in either
direction.

**The opposite had been concluded an hour earlier.** Render's V1/V2 probes
return 403 carrying Yahoo JAPAN's EEA/UK withdrawal notice
(【お知らせ】欧州経済領域（EEA）およびイギリスからご利用のお客様へ), and the
same endpoints from a residential Israeli IP return a plain 500 with no such
notice. It reads exactly like a geo-block. It is an artefact of two withdrawn
endpoints; V3 validates credentials from that IP perfectly well. Render's egress
is a US address whose geolocation resolves to the geographic centre of the
United States — i.e. unplaceable — which is presumably why a decommissioned host
reaches for that notice.

The classifier now checks for a geo notice **before** the credential branch,
because a statement about the request's ORIGIN cannot be changed by any
credential.

**So the key itself is what Yahoo refuses.** `sha256:b4248ac0169d`, 96
characters, no whitespace, no non-ASCII.

### Length is not identity
"96 on the portal, 96 on Render" is weak evidence — any two 96-character strings
agree on length. The probe fingerprints the value instead of measuring it;
twelve hex characters cannot be reversed into a credential, and the secret
appears nowhere in the output. The holder of the portal value compares with:

```
node -e "console.log(require('crypto').createHash('sha256').update('PASTE').digest('hex').slice(0,12))"
```

If those match, the string on Render is the portal's, and what remains is at
Yahoo's end: an application not authorised for the Shopping API, or registered
as a type that cannot make server-side calls.

**The one measurement still missing** is the real key from a *served* IP, which
needs the value in a local shell:

```powershell
$env:YAHOO_SHOPPING_CLIENT_ID="<the id>" ; node sourceprobe.js yahoo
```

`ok` there against 403 on Render would overturn all of the above and should be
believed over it. **Nothing has been built on Yahoo Shopping** — no variant says
`ok`, and a parser written against documentation is the failure this whole task
was defined to avoid.

## A 403 from an API you hold a key for is not the Yahoo Auctions 403
The first Render probe of the Yahoo Shopping API returned 403 and the probe
called it `blocked` — the Yahoo Auctions word, meaning "this IP is refused".
That was one edit away from being written here as fact and killing a working
source.

The discriminator costs nothing and needs no credential:

```
no appid     -> 401  "Authentication parameters in your request incompleted."
bogus appid  -> 403  "Your Request was Forbidden"
```

Render returned the **second**, exactly — so `shopping.yahooapis.jp` answers a
datacentre IP perfectly well, and what it refused was the key. The probe reports
`auth` for this, never `blocked`, and quotes the service's own message. The
response now carries a `statusMeans` block spelling out all seven statuses,
because a bare "blocked" invites the reader to supply their own explanation.

**The Auctions Web API genuinely is gone** — Yahoo withdrew it in January 2020
(オークションWeb API提供終了), which is why that path scrapes and why it 403s
from Render. Shopping is a different, live service and needs only a Client ID,
no approval.

## Documentation is not implementation
CLAUDE.md described estimates scaling by set age — 9x pre-2000 — as a property
of the system. It existed only in the frontend's `mockP()`; `ingest.js` and
`server.js` had no age multiplier at all. Two estimators disagreed by up to 9x
on the same card, and the discrepancy read as a revert casualty rather than
something never written. `estimator.js` is now the single implementation; any
inlined copy must name it as the source of truth.

## A time limit on the wrapper does not bind the work
The nightly task ran 33 hours against a 6h `ExecutionTimeLimit`. The limit
*fired* — `SCHED_S_TASK_TERMINATED`, LastTaskResult 267014 — and killed
`cmd.exe`. But the wrapper launches node, so node was a grandchild and survived
orphaned. A budget is only enforceable where the work happens:
`refresh --hours=N` now stops from inside node.

## Test what a gate ALLOWS, not only what it blocks
A gate tested only on refusals passes by refusing everything. `sourcerank.test.js`
asserts 9 of 15 decision cases are permitted; `jptest.js` has 35 of 81 cases
asserting the filter KEEPS a valid listing; `rawgate.test.js` asserts TAG TEAM
and ACE SPEC survive. This is the same failure that made `looksLikeJunk` destroy
~80 valid prices per set and nearly let `clean --delete` remove 46% of the price
table.

## An assertion that gets overridden is not an assertion
Two patch scripts failed their anchor check and were launched anyway, creating
4,312 duplicate rows. If an anchor fails, stop.

## Reverts lose functions silently, and versions do not catch it
`ingest.js` has been reverted twice by a downloaded file landing on top of local
work — losing `jpTitleIsSingleRaw`, then `evaluateAlerts` and `estFix`. Alerts
did not fire for eight days and nothing reported it. Both times the version
banner matched, so the check we relied on was blind. Keep tests in standalone
files — tests inside the replaced file vanish exactly when needed.

## A newer file is not a superset
v36 of the frontend added 25 functions and **dropped 8**, including the entire
old search UI. Diff before adopting, do not assume.

## Check the build stamp
Three separate "the fix didn't work" reports were a stale browser build. The
frontend shows its build bottom-left, and `/app` is served from the same bytes
as the local file — compare the two before debugging anything else.

## `null` is not a diagnosis
`getEbayToken()` returned a bare `null` for four unrelated causes — credentials
absent, eBay rejecting the exchange, an unreachable host, and a 200 with no
token — and `sourceEbay` reported every one of them as
`EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set`.

So the deployed service said `ready: true` on `/ebay/status` and
`"unconfigured": "...not set"` on `/api/listings`, **in the same process, for
the same variables**, and the hunt went to Render's environment where nothing
was wrong. A confident wrong answer costs more than an admitted unknown.

`getEbayTokenDetailed()` now returns `{ token, error, unconfigured, status }`
and `unconfigured` means only that the credentials are genuinely absent.
Everything else is an `error` carrying eBay's own `error` / `error_description`.

## Presence is not readiness
`/ebay/status` reported `ready: true` on the strength of two non-empty
environment variables. It never once asked eBay whether they worked. A readiness
check that cannot fail for the reason you care about is decoration.

`?probe=1` now performs the real token exchange, and `readyMeans` states in the
response that `ready` describes the variables, not eBay's opinion of them.

## Read credentials at call time
Two module-level consts captured `process.env` at import; `/ebay/status` read
`process.env` live. That alone can produce two truths in one process, and it
buys nothing — reading live costs nothing and lets a credential take effect
without a restart. There were also **two separate token implementations** with
two caches (`getEbayToken` and `scrEbayToken`), both carrying the same bug.
One now delegates to the other.

Related: a token response with no `expires_in` set the expiry to `NaN`, and
`Date.now() < NaN` is false — so the token was never cached and every call
re-authenticated, quietly spending the 5,000/day quota on token exchanges.

## Guard a metered API before the first bulk call, not after
Every eBay request goes through `ebaycall.js` -> `ebayquota.js`. There are four
call sites — the token exchange, the listings source, the legacy by-name route
and `ebayActive` — and all four are routed; nothing reaches `api.ebay.com`
unguarded.

The pieces that are not obvious:

- **The count lives in Supabase, not memory.** Render's free tier restarts on
  idle, so an in-memory counter resets to zero on every cold start and the
  process could spend 5,000 calls several times over believing it had made a
  few hundred.
- **Token exchanges count** (`kind: 'token'`). The `expires_in` bug spent the
  daily quota on authentication and nothing recorded it. `/api/ebay/quota`
  now shows `token_calls` separately, so that failure is visible next time.
- **The quota check happens at the moment of spending.** Checking before
  joining the queue is the classic time-of-check bug: three jobs at 99
  remaining each check, each sees "allowed", all three spend. Since the
  queue has five slots (T1, 2026-09-30) the check runs under its own short
  lock and counts calls allowed but not yet recorded (`pending`);
  `ebaycall.test.js` sends eight at RESERVE+2 and asserts exactly two go.
- **Two lanes, five slots — a user never waits behind background.**
  `EBAY_CONCURRENCY` 5; background holds at most 2; a free slot goes to the
  foreground queue first; pacing is 200ms per ENDPOINT (marketplace, token
  host); a foreground call that gets no slot in 4s is refused as `busy`
  (never sent later) rather than queued. `/api/ebay/quota` shows `queue`.
- **Background yields, foreground does not.** Ingestion and `ebayActive` are
  `background: true` and stop at the 92% soft stop; a live user request runs
  down to the 100-call reserve. `DAILY_LIMIT * (1 - SOFT_STOP)` must stay
  comfortably above `RESERVE` or the hard stop always wins and background work
  never yields early — `ebayquota.test.js` asserts it.
- **`EBAY_ENABLED=false` is read at call time and defaults ON.** A missing
  variable must never silently disable a working integration.

**`DAILY_LIMIT = 5000` is still an assumption.** `node ebayratecheck.js` (or
`/api/ebay/quota?probe=1`) asks eBay for the real figure. If it differs, every
threshold is calibrated to the wrong number.

## The guard worked and nobody saw it (2026-09-30, TASK T1-T3)
The daily 5,000 went in twelve hours: the every-marketplace design spent
**723 and 713 calls in two consecutive hours** on card views, probes ~950
more. Warn at 70%, soft stop at 92%, the reserve — every guard held, and
every one spoke only to a server log. Roy saw an empty panel reading "No
listing matched this exact card", which was false: eBay was never asked.
Three protections, all in `ebayquota.js` + `ebaycall.js`:

- **Hourly ceiling `HOURLY_LIMIT = 600`**, UTC clock hours, EVERY origin (a
  runaway looks like a user). Heaviest post-fix browsing hour measured at 195
  (`listing_views`), so ~3x headroom; both runaway hours would have tripped.
  Table `ebay_quota_hour`.
- **Origins: user / background / tooling**, counted per origin in
  `ebay_quota` (`user_calls` …) and the hour table. **Tooling has its own
  `TOOLING_DAILY = 300`** inside the daily limit; past it a tool is refused
  (`limitHit: 'tooling'`) and never borrows from the user budget. Tooling also
  yields at the soft stop. Origin comes from the REQUEST (`ebaycall.withOrigin`,
  server.js middleware): `/api/ebay/*`, `/ebay/status`, `/api/scraper/test`,
  `/api/health/full`, and anything sending `X-CardHunt-Origin: tooling`
  (sitecheck, linkaudit, setaudit, searchaudit, gradeprices — the spending
  ones STOP on refusal). Only `tooling` can be claimed; it only narrows. A
  `background: true` call inside a user request stays background.
  **A new tool that drives /api/listings must send the header.**
- **The number is on the page**: bottom-right indicator from
  `/api/ebay/quota` (`level` quiet/notice/warn/stopped — visible from 50% of
  the day or the hour), click for the breakdown, and the listings panel says
  "eBay listings are paused … return at HH:MM" instead of an empty list.
  Calls made before origins existed show as `unattributed`, never as user.
  A quota refusal is no longer cached (`TRANSIENT`): the hour lifts sooner.

Every refusal carries `limitHit` ('daily' | 'hourly' | 'tooling' |
'soft-stop') and `liftsAt`. Tripped in `ebayquota.test.js` and through the
real `fetchEbay` in `ebaycall.test.js`; watched failing under mutation.
Found on the way: `ebayprobe.js` exchanged its token with a raw `fetch` —
uncounted, outside every guard. Now through `ebaycall`.

**Fixed 2026-10-01 (`bf49963`):** 393 of that day's 4,900 were TOKEN
exchanges (8%). Cause measured (CALL COST above): no single-flight in
`getEbayTokenDetailed`, so each concurrent caller on a cold token exchanged
— a cold Search-all was 8. Now one exchange in flight, shared: 1.

**The cost of a change is calls per card view — state it before shipping.**

## eBay DOES state raw condition — in a field we never read (2026-09-27)
The 2026-09-22 conclusion below ("binary, filter from titles") was right
about the coarse `condition` field and wrong about eBay. Measured through
`GET /api/ebay/conditions/:cardId` (Render only — it needs the keys):

| | result |
|---|---|
| search item **summaries** carrying `conditionDescriptors` | **0 of 400** — key absent |
| full items (`getItem`) carrying them | **100 of 100** — Card Condition on every ungraded item; Grader + Grade + Cert on every slab |
| `aspect_filter=categoryId:183454,Card Condition:{…}` | works; filtered rows agreed with each item's own descriptor **36 of 36** (strays were slabs, which the raw gate refuses) |
| `Card Condition:{Not Specified}` | **ignored by eBay** — returns everything. Never send it |

So Raw NM/LP/MP/HP are now asked of eBay directly: `cardmatch.ebayConditionFilter`,
**no extra quota** (each condition was already its own search; per-row getItem
would have cost 25-75 calls a view). Live, Base Set Charizard Raw LP went from a
handful of title matches to 64 kept; LP and NM share 1 row in 25.

eBay's scale is four values: **it does not separate Mint from Near Mint and has
no Damaged**, so the M and DMG chips were removed rather than backed by nothing.
Rows carry `conditionSource: 'ebay' | 'title'`. The title reading below still
serves the Japanese shops, which have no such field.

### Slabs: measured 2026-09-27, NOT yet used
Same probe, `en-base1-4?grade=Graded&items=10&aspects=1&verify=3` (82 calls):

| | result |
|---|---|
| summaries carrying grader/grade | **0 of 100** |
| `getItem` | `Professional Grader` + `Grade` + `Certification Number` on every slab |
| `aspect_filter` `Professional Grader:{…}` | works — PSA/BGS/CGC **9 of 9** agree with the item's descriptor; **Ace 1 of 3** (two "Ace 6" titles are descriptor-tagged AGS) |
| `aspect_filter` `Grade:{…}` | works — **13 of 15** agree; "PSA 6" title with descriptor 5.5; a Grade-1 filter returned a raw HP card |
| `Graded:{Yes/No}` | a third aspect; `Not Specified` ignored, as with condition |

TAG is in eBay's vocabulary as `Technical Authentication & Grading (TAG)`, so
"TAG Graded 8" is reachable by filter at no extra quota. **But the structured
fields are seller-entered too and disagree with titles both ways** — one CGC
slab titled "Gem Mint 9" carries Grade 10.

### Slabs: BUILT 2026-09-27 — filter narrows, disagreement is refused
The combined filter (`?combo=`): AND semantics hold; 22 of 25 filtered items
matched their descriptor, and all 3 misses were a different grade the TITLE
stated. So `ebayGradeFilter` narrows the search (query unchanged, so titles
still carry the grader/grade tokens) and `verify(…, {structuredGrade})` checks
the title against it via `titleGradeClaims`: **disagree → refused**; title
silent → the field answers (`gradeSource: 'ebay'`, labelled in the panel) —
never for a signed card, a speculated grade, grader-wide mode or an unstated
qualifier. Each source block reports `keptOnEbayFieldAlone` /
`refusedOnDisagreement`.

Net effect on 21 live card/grade cases: 305 → 308 rows, 299 unchanged,
**+9 gained, −6 dropped**. Gains on the field alone: "CGC NM Mint", "PSA🔥🔥",
two "PSA10" (no space — the strict reader misses it). **No drop was the rule**:
all six were never returned, because a filter on grade aspects cannot match a
listing whose seller never filled them. That is the filter's own cost, not
foreseen by "lose ~2 in 15". And the first deploy kept a **"(PSA 10
Contender)" raw card at $6,100 as a PSA 10** — the seller filled the aspects,
the speculation was stripped, the title read as silent. Speculation now counts
as disagreement (`a11196b`). **Measure after deploying, not only before.**

### Narrowing vs the 75-row cap — measured 2026-09-27 (`/api/ebay/gradecost`)
Both searches paged deep on five busy cards, the real gate on every row:

| | wanted | lost: aspects unset | lost: past cap (old / filtered) |
|---|---|---|---|
| Base Set Charizard PSA 8 | 54 | 2 (one a **$46,999** 1st Ed PSA 8) | 0 / 0 |
| Moonbreon PSA 10 | 47 | 0 | 0 / 0 |
| JP Charizard ex 201 PSA 10 | 145 | 3 (one correctly — "Ace 10, not PSA") | **79 / 82** |
| 151 Charizard ex SIR PSA 10 | 65 | 0 | 0 / 0 |
| Prismatic Umbreon ex PSA 10 | 18 | 0 | 0 / 0 |

**The cap loses ~20x more than unset fields — and filtering neither causes
nor cures it**: the text query already carries "PSA 10", so the filter trims
eBay's totals only ~4%. Under `sort=price` the cap cuts the EXPENSIVE end
($741-$900 above the cut) — harmless for "cheapest", but it biases any median
built from these rows low on a busy card. Delivered: old 250, filtered 251,
two-call "filter to verify" 254 (2x quota on every graded view for +3).
Not switched; the lever worth pulling is the cap (a second page only when
eBay's `total` exceeds it), which is a quota decision.

The measurement also found a three-card "ex SAR Set" lot kept as one PSA 10
(`16d767a`, lot pattern measured on 727 real titles first), and that the
strict reader misses "PSA10" (no space) — the field-only keeps were mostly that.

### The cap is paged now (`ceadfbc`, 2026-09-28)
A second page only when eBay's `total` exceeds what was fetched, never more
than `EBAY_MAX_PAGES = 3` (225 rows). `sources.ebay.pages` carries `fetched,
ebayTotal, truncated, stoppedAtCap, pageError, duplicatesSkipped`; the panel
says "ebay: 65 (first 225 of 677 examined)". Live, JP Charizard ex 201 PSA 10:
172 of 175 examined, 138 kept (was 75 examined). A failed later page keeps
page 1 and reports it. `ebaypaging.test.js` runs the REAL `sourceEbay`
against a stubbed eBay.

### "PSA10" unspaced — read for unambiguous graders only (`7c3f856`)
Measured first: unspaced in 3 of 829 eBay slabs (0.4%, all Japanese cards)
and 494 of 652 Yahoo graded titles (75.8%). Across 868 eBay raw and 344 Yahoo
TAG TEAM / ACE SPEC titles it fired on PSA/BGS/CGC/ARS grades only. Old vs
new gate on 5,064 eBay verdicts: **7 gained, 0 lost**. `graderToken()` lets an
UNAMBIGUOUS grader touch its grade; **TAG / ACE / MNT keep the strict
boundary** — nobody wrote "TAG10", and their strictness is what keeps TAG
TEAM and ACE SPEC reachable. A grade followed by a bare "?" is speculation
("… PSA10 ?" was a live Ungraded card). Yahoo's `jpTitleHasGrade` already
stripped whitespace — no change there.

## Cert verification — measured 2026-09-28, NOT built
`GET /api/ebay/certprobe/:cardId?grader=PSA&single=12` (Render; read-only,
catalogue id + grader from our list, never a URL).

| where | cert number present |
|---|---|
| search **summary** | **0 of 829** graded listings — no such key |
| search **aspect** | not among eBay's 29 refinement aspects |
| **title** | **0 of 829** (one says "New Cert", no number) |
| `getItem` descriptor `Certification Number` | **183 of 232 true slabs (78.9%)** — PSA 53/65, BGS 39/47, CGC 53/66, SGC 9/13, TAG 29/41 |
| `getItems` (bulk, 20/call) | **403 "1100: Access denied"** — restricted API, not ours |

So the number exists on ~4 of 5 slabs but costs **one eBay call per listing**.
Shapes: PSA 8-9 digits, BGS and CGC 10 (CGC also 13), SGC 7, TAG a letter + 7.

Graders: **PSA only** has an API — `api.psacard.com/publicapi/cert/GetByCertNumber/{n}`.
Its docs state no limit; the SERVER does. A keyless request answered
`429 "API calls quota exceeded! maximum admitted 100 per Day. Please contact
collectors-apis@collectors.com"` — on the first request ever made from this
IP, so the anonymous pool looks shared. Re-measure with a token. The End User
Agreement sits behind login and is unread — its storage terms decide the
"store forever" design. Beckett, CGC, SGC, TAG: web lookup pages only, no
documented API (SGC is owned by Collectors, PSA's parent — ask the same
address). **Never scrape a cert page.**

eBay's terms bind the other half: the cert number is read FROM an eBay item,
so itemId→cert is eBay data and lives in the 15-minute cache only. The PSA
result keyed on cert number is PSA data — storable if PSA's agreement allows.

### Raw M and DMG: back, seller-stated (`08a05d0`, `d60dc0e`, `b96f1e3`)
eBay's condition POLICY (Sell Metadata, category 183454) — the list sellers
pick from — has four Ungraded values and no Mint or Damaged. Removing the
chips was still wrong, and before removal M/DMG had been silently answered
with NM/HP rows. Now: the seller's word goes into the search ("mint" minus
"near mint"; "damaged"), the title decides, rows say "…, seller-stated", the
chip is dashed with the reason. Live: Pikachu DMG 15 of 18 stated Damaged;
Pikachu M 2 → 19 once "near mint" was excluded. "Excellent-Mint"/"EX-MT" is
LP, not Mint; a bare "ex" is still the mechanic.

### Card page column: one spacing rule (`d082983`)
Shared grid rows left 305px of dead space under the price bar at 1366px, and
`.chart-box`'s later margin silently beat the cell reset. Named areas + one
`--cd-gap`; narrow keeps prices, bar and graph together. 16px everywhere at
1366/800/390.

**The nav wraps under 640px (`8be7a97`).** Measured in a real 390px viewport —
a same-origin iframe of `/app`, since a Chrome window will not shrink that far
— **all nine** screens scrolled sideways (501-893px), each exactly as wide as
its nav. After: the nav fits on all nine. Still wider than 390, and it is
CONTENT, not the nav: home stats ~464px, Pokémon/Sets tiles 394, alert stat
boxes 428, portfolio 507. **Fixed 2026-09-28 (T4)**, re-measured in a 390px
iframe (375px of content): all nine screens 0px sideways. Home had been
+354 (hero stats in one row, five game tiles in five `1fr` columns — a bare
`1fr` has a min-content floor), Pokémon/Sets +19 (four language tabs),
Search +4, and the portfolio CLIPPED its last two columns rather than
scrolling, which a scrollWidth check reports as 0 — check clipping too.
Alerts already fit once T7 removed the invented fourth stat box.

### Grader-wide mode never checked the card (fixed `9f07cf7`)
"PSA *" returned ok on the grade alone, before name/number/set/printing ran:
"Pikachu 58/102 Base Set PSA 9" passed as Base Set Charizard. No suite asked
grader-wide mode about cards; `anygrade.test.js` asks every case in both modes.

### The original measurement, still true of the coarse field
Measured 2026-09-22 across 447 live rows from six cards at Raw NM / LP / MP:
**441 `Ungraded`, 3 `Non gradee`, 3 `Non gradata`** — three values, all meaning
ungraded, and the distribution is *identical* whichever condition was requested.

For sources with no structured condition, raw sub-conditions are read from the
seller's prose and labelled **seller-stated**.

Two traps, measured rather than guessed, both the shape that has eaten good
data here before:

- **HP** — 9 live titles carried it, **8 were "120 HP"**, the Hit Points
  printed on essentially every Pokemon card. Exactly one meant Heavily Played.
  A bare word-boundary HP filter is 89% wrong, in the direction of calling
  mint cards damaged. `stripHitPoints()` removes `\d+ HP` first.
- **EX** — 25 live titles carried it, **24 were the card mechanic**
  ("Charizard ex 199/165"). EX is never read as Excellent. Deliberately
  absent, like GEM and MINT from the slab words.

And **49.7% of titles state no condition at all** (74 of 149). Those get
`{code: null, stated: false}` and belong in an **"unstated" group**. A filter
that dropped them would hide half the market silently.

## Every grading company's scale, read from the company (2026-09-27)
The selector offers each company's full published scale; `selector.test.js`
drives every option through the real gate (517). Three were not what we
assumed, which is why each was read from the source:

| | scale | source |
|---|---|---|
| PSA | 10, 9, 8.5 … 2.5, 2, 1.5, 1 — halves "between PSA 2 and PSA 9", **no 9.5** | psacard.com/gradingstandards |
| BGS | 10 Black Label, 10 Pristine, 9.5 … 1 | beckett.com via search (site in maintenance) |
| CGC | 10 Pristine, 10 Gem Mint, 9.5 … 1.5, 1 | cgccards.com |
| SGC | 10 Pristine, 10 Gem Mint, 9.5 … 1 | gosgc.com via search (page renders client-side) |
| TAG | 10 Pristine, 10 Gem Mint, 9, 8.5 … 1 — **no 9.5** | taggrading.com/pages/scale |
| ACE | 10 … 1, **whole only, no Pristine** | acegrading.com/grading-scale |
| AGS | 10 Legendary, 10 Gem Mint, 9 … 2 whole, 1.5, 1 | agscard.com/grading-standards |
| ISA | 10, 9, 8.5 … 1.5, 1 — halves "from ISA 1 to ISA 8" | isagrading.com/grading-scale |

Unchecked graders (BVG, CSG, HGA …) offer **All only**, and say why. ACE was
never missing from cardmatch — it is in `GRADERS_AMBIGUOUS` for ACE SPEC — only
from the UI list, which read the unambiguous graders alone. `AGS Legendary`
counts only beside the ten: "Legendary Collection" is a set.

## An async module read once at parse time is null half the time
`cardmatch.js` loads `async`; the page captured `var CM = window.CardMatch`
at parse. Whenever the module arrived second, every `CM && …` guard took its
fallback silently — the Other grader list shrank to three names and eBay
condition labels became bare codes, on a load identical to one that had worked.
`liveCM()` reads it at call time. Found only in the browser.

## 1st Edition is a market where it existed, and nowhere else
Ten English sets, Base Set to Neo Destiny — **exactly the ten TCGdex reports
`cardCount.firstEd > 0` for**. Base Set 2, Legendary Collection and the e-Card
sets are pre-2003 and never had one, so a date rule would be wrong on four
sets. `gradeprice.byPrintRun` splits live rows into 1st Edition / Shadowless
(Base Set only) / Unlimited / not stated, each with its own median. The API
had grouped by edition for weeks; the page had never rendered it.

## A number cached per card is wrong when it depends on the grade
My alerts held Charizard at PSA 10 and Latest searches held the SAME card at
Raw NM. Both printed **$51,743.85** — the PSA 10 median — while the true Raw NM
median was **$105** across 25 gated listings. **493x out**, on the row a buyer
reads, with nothing on screen to suggest a problem.

The average was keyed on `cardId` alone, so whichever section fetched first
wrote its grade's median into the other's tile. One cached number standing in
for the answer to two different questions — the `/api/market` name-matched
aggregate wearing another hat. The grade now rides on the cache key, the
lookup AND the DOM slot.

**Found in the browser.** No test in this repo would have caught it.

## A promise that resolves immediately is a loop
`updateHeroStats()` called `loadLangSets(l).then(updateHeroStats)` for any
missing language. `loadLangSets` returns **immediately** when a request for
that language is already in flight — so the promise resolved at once, the
function re-entered, found the list still missing, and asked again. A tight
loop that **froze the renderer**.

Reproduced rather than assumed: the previous version, extracted with
`git show` and run against a stub that resolves instantly, exhausts node's
memory and crashes. The fixed version makes exactly 3 calls and stops.

Ask once, track the asking explicitly, and never schedule a redraw on an
empty result.

## Two definitions of one function, 162KB apart
`renderSets()` was declared **twice** in `cardhunt_preview.html`. The second
won silently — it is the one with `seriesRank()` ordering — and the first had
been dead for an unknown length of time. **Editing it would have changed
nothing on screen**, which is the shape of the three "the fix didn't work"
reports already recorded here.

`preserve.test.js` now fails if any top-level function is declared twice. That
is the single guard most likely to catch a redesign port going wrong, because
pasting a new renderer in and leaving the old one above it is exactly how it
happens.

## The listings panel has had two writers TWICE
First time: `renderMarketData` called `renderRealListings(m.listings)`, which
is `ebayActive()` on a NAME query with no title gate at all.

Second time, 2026-09-23: wiring the new grading selector into `selGrade()`
meant `selGrade` called `renderListingFinder()` and then `buildMockListings()`
unconditionally — and `buildMockListings` writes the SAME element. The
synchronous one always wins, so Charizard at PSA + All showed the ungated
deep-link block while the gated endpoint had real PSA rows waiting.

**One element, one writer.** `renderListingFinder` owns `#cd-listings` on the
live tab; `buildMockListings` serves the other tabs only. `preserve.test.js`
asserts it, because knowing the rule has not been enough twice.

## Dead CSS is not inert when the name collides
`.lbox` was defined twice in the frontend: once by an old login design
(backdrop-filter, 52px padding, **max-width:460px**) and once by the card page
listings panel. Nothing carries that class except the listings panel, so the
login rule looked dead. The `max-width` still applied — and after the Phase 1b
layout port gave the panel a 1180px column, it silently stayed 460px wide.

Delete a colliding rule rather than overriding it. An override leaves two
rules to reason about; the collision *is* the bug.

## A wire format is not a label
`PSA *` is what `buildQuery` and `verify` speak for the grader-wide mode. It
reached the screen in three places — the deep-link title, the "Typical …"
heading and the measured-price heading — each of them directly above a price a
buyer reads, rendering as "— PSA * ONLY".

`gradeText()` turns it into "PSA — any grade" wherever a grade is **shown**
rather than **sent**. Anything with a wire format needs a display function, and
the place it leaks is the heading nobody re-read after the value started coming
from somewhere new.

## Three defects in one phase that every test passed through
Phase 1b shipped three bugs that `preserve.test.js`, `selector.test.js` and
every existing suite were green for, and all three were caught by opening the
page:

- two controls for one setting (the old 16-chip grade row left under the new
  selector),
- the 460px CSS collision above,
- the two writers above.

They are all **arrangement** bugs — which element is where, which of two
functions ran last, which rule won. A suite that reads source can assert a
thing exists; it cannot see that something else is sitting on top of it. That
is what the browser pass is for, and it earned its place three times in one
phase.

## Assert the STRUCTURE, not the intention
`#cd-listings` had been fixed three times and reintroduced twice. CLAUDE.md
recorded the rule both times and that did not stop it — because a comment
saying "one element, one writer" is not a thing that fails.

`preserve.test.js` now builds a **call graph from the page** and asserts:
no function outside `{openCard, buildMockListings, renderListingFinder}`
writes the element; `renderRealListings` has no callers; and any function
calling both renderers guards the ungated one by tab. Proven by reintroducing
the bug in every form it has taken — five mutations, five failures.

The first version of that guard was **wrong about `setLTab`**: it demanded the
tab test sit on the same line as the call, and `setLTab` early-returns for the
live tab instead, which is the cleaner shape. The test was wrong and the code
was right. A structural assertion has to understand every correct shape, not
just the one in front of it.

`renderRealListings` was **deleted** rather than allow-listed. Its own comment
claimed it was "kept for a caller that has GATED rows"; nothing had called it
since the first fix, but it remained a function aimed at the gated element,
sitting next to the one that owns it. That is how it got wired up originally.

## Code addressing markup that is not there
`openCompare()` referenced `#compare-grid` and `#compare-overlay` and **neither
was in the page**. The Compare button threw `Cannot set properties of null` on
every click, and had done for a long time. Found by clicking it.

The guard for the class — every **literal** element id the script addresses
must exist in the markup — immediately found **two more dropped modals**: the
photos viewer (`photos-title`, `photos-src`, `photo-main`, `photo-grid`,
`photos-buy-btn`, written by `viewListing()`) and a checkout flow (`co-steps`,
`co-body`). Pinned as KNOWN so the set cannot grow; a new one fails.

The scanner needed two corrections, both revealed by its own output:
- ids the script **creates** at runtime (`note.id = 'sd-lang-note'`) are not
  expected in static markup;
- `getElementById(id).classList.add('on')` has a **variable** argument, and
  scanning for the next quote read `'on'` as an element id.

## One element, one MEANING
`sd-count` had two writers that disagreed about the question, not just the
answer. `applyFilters` wrote "filtered of loaded"; `openSet` called it and then
immediately rewrote the element as "cards we hold of the set's printed total".
Ascended Heroes opened reading **"295 of 217 cards"** — more shown than exist —
and switched to "12 of 295" on the first filter.

Both facts are real and they genuinely disagree for most modern sets, because
secret rares are numbered past the printed total. The line names both:
`295 cards · 217 printed`.

Noticed only because the number was impossible. A second writer that happens to
produce a *plausible* number would still be there.

## Where a card view's time went — measured on Render 2026-09-28 (TASK T1)
`?debug=1` on any API route adds `timings` (every db query by table, every
outbound fetch by host, each source, eBay queue/pace/http, gate, outlier,
serialise); `?debug=1` on the page logs TTFB/done per API call and paint
marks. `timing.js` is required by the server — tracked, like `yuyutei.js`.

| | server ms |
|---|---|
| set pages (`/api/sets/:id/cards`) cold / warm | 20-123 / 1-2 — one query, not the problem |
| `/api/cards`, `/api/history` | 11-15 (one cold outlier 607) |
| `/api/market` | 520-2,226, **every view, even warm** |
| `/api/listings` cold | 1,084-8,097; mean 1,669 over 12 views; eBay 81% |

**Biggest contributor: the page competing with itself for eBay's serial
queue.** Opening a card fired `/api/listings` twice (the panel and the
Latest-searches tile average, same card, same grade) and `/api/market`
(an eBay call of its own) at the same moment; the server merges neither,
so the panel's request waited 512ms mean (31%) and up to 1,857ms behind
its twin. Alone, the same cold listings took 544-832ms with zero wait.
Fixed page-side: `fetchListings()` is the ONE fetch of `/api/listings`
(shares the in-flight request and the 15-minute cache), and
`marketAfterListings()` starts market only once that card's listings
settle. Browser after: one request, queue-wait 0, painted 0.9-2.7s.
`marketwait.test.js` runs both real functions.

Not the cause: Yuyu-tei is never called for English cards; the sets page;
the gate (18ms summed per view). Left alone deliberately: eBay paging (2 of
12 cold views went past page 1) and the reprint check (Base Set Charizard
family only, +1.2-3.2s). Yuyu-tei's index now survives restarts
(Supabase `yuyutei_index`): 4,601 -> 172ms after a restart.

**Closed 2026-09-29 (TASK T8): `/api/market` scraped eBay's completed-
listings HTML (`ebaySold`, `www.ebay.com/sch/...LH_Sold=1`) from Render on
every card view** — the scrape `node ingest.js scrape` is banned for, and
worse, because we hold eBay API credentials under eBay's terms. `ebaySold`
is DELETED, not switched off; `/api/market` returns `sold: SOLD_UNAVAILABLE`
(`available: false`, with the reason), `/api/market/:name/sold` answers 410,
and the card page's Last sold box says "no licensed sold source". Nothing
was lost — it never wrote to the database. `nosoldscrape.test.js` runs the
real `getMarketPrice` with the network stubbed and fails on any sold fetch;
watched failing (12) against the pre-fix files. The page's "eBay — sold"
deep link stays: it opens in the user's own browser.

**And the rest of `/api/market` went the same day** (`8cd01bb`, decided):
the ungated `ebayActive` name search (the "Lowest listing" fallback — now
only `/api/listings`' gated `cheapestLive` writes that box, one eBay call
fewer per view), `tcgplayerPrice` (TCGplayer's internal search API from
Render — the T8 terms question; we hold their prices via TCGdex and
pokemontcg.io) and the dead PriceCharting HTML scrape. `/api/market` now
answers from the stored number-matched price and the sold status with no
outbound call, and **the page no longer calls it at all**.

## Reprints were priced by catalogue number (2026-09-29, TASK T6)
30th Classic Collection held 30 cards: 19 real prices, 11 estimate-only.
The 19 were RIGHT — all TCGPlayer's own "ME: 30th Celebration Classic
Collection" products, within a few % of live — but only by luck: they
matched on name alone, because pricing searched with our catalogue number
(`001`) while the card and TCGPlayer say `4/102`. Every repeated name was
refused, so the chase cards sat on estimates from the ORIGINAL's rarity
("LEGEND", "Rare Prime" — no estimator entry, $1 base): Charizard $0.71
(live $205.58), Gengar Prime $0.55 ($78.05), Lugia $41.90 ($383.76).

The listings path had `REPRINT_OF` since 2026-09-26; the pricing path did
not — rule 5 again. And the printed number is NOT enough on its own:
"Charizard 4/102" is three TCGPlayer products — Base Set, 2021
"Celebrations: Classic Collection" ($155) and 2026 "ME: 30th Celebration
Classic Collection" ($206). Now (ingest 5.7.2): `reprintPricing()` searches
with the printed number, accepts only a hit whose TCGPlayer set name equals
`TCG_REPRINT_SET[set]` exactly, and a reprint gets NO name-only eBay /
Cardmarket fallback. Replayed on 55 cards (30th-c + cel25cc): 55 matched by
number in the right set. Re-priced 30th-c: 11 written, all equal to the
replay, **30 of 30 real**. `refresh` goes through the same `safePriceFor`.
A new reprint set needs a `TCG_REPRINT_SET` entry — `reprintpricing.test.js`
fails until it has one.

Found on the way: `safeprices` read a `force` flag it never declared
(copied from refresh), so **every `safeprices` run threw "force is not
defined" at the first card it priced**. Declared now.

## "None" is not "Common" — manifest's rarity map (2026-09-28, TASK T5)
`TCGDEX_RARITY` in ingest.js mapped TCGdex's `"None"` to `"Common"`. "None"
is TCGdex saying it HAS no rarity (591 English, 2,110 Japanese cards —
`/v2/{lang}/cards?rarity=None`), so every manifest run wrote Common over
whatever we held. That is what stopped the Classic Collection fix, and
"Classic Collection" itself was missing from the map, so `normRarity()`
returned null and manifest silently skipped all 25. Now: None is dropped
before mapping, Classic Collection maps, and manifest records
`rarity_source='tcgdex'` (ingest 5.7.1; `manifestmap.test.js`, SKIP where
ingest.js is absent). Run on cel25cc: 25 -> Classic Collection, and a
whole-catalogue before/after diff of 46,088 rows changed exactly those 25,
none to Common.

**Damage from earlier runs, measured, NOT repaired:** 1,737 Japanese cards
read "Common" where TCGdex says None (188 with `rarity_source='tcgdex'`),
**201 of them numbered past their set's printed total** — secret-rare slots
in SV8a, M2a, S12a, SV7a, SV9a… stored as Common (`ja-SV8a-232` ネリネ
232/187). 198 of the 201 have real prices, so the harm is the label and any
estimate; Yuyu-tei carries the real rarity per card and is the fix. English:
430 visible cards, mostly genuinely unrated products (McDonald's, trainer
kits, energies), where Common is at worst imprecise.

## Invented data, the fourth sweep (2026-09-28, TASK T7)
After the fake last-sold, price graph and position bar: the Photos viewer
(our artwork three times, one sepia, as "seller photos"), a checkout
collecting a card number, a login accepting any password, three invented
shops, alert "savings" from `Math.random()`, five invented portfolio
holdings, 45 hand-typed Ascended Heroes prices that `getBase()` read as
market data, an estimate-derived low/high, an "Auto-refreshing" label on a
panel nothing refreshes, and "20,324 cards" 26,000 stale. Photos now shows
the listing's real eBay images via the same getItem as Verify. The rest were
removed or given an honest empty state. `Math.random()` now appears once in
the page — the anonymous user id — and `nofabricated.test.js` pins that.
**Look for the next one with `grep Math.random` and `price\s*\*` first.**

## A UI that writes only to itself
The alerts **bar** read `/api/alerts` from Phase 1a while every **write** stayed
local: `saveAlert` pushed onto an array and showed "We will notify you when X
hits $Y", `pauseAlert` flipped a field, `deleteAlert` spliced. Nothing left the
browser, so a created alert vanished on the next five-minute refresh, a paused
one un-paused itself, and a deleted one came back.

The screen and the database disagreed, and **the screen lost quietly, later,
when nobody was looking** — the worst available shape for a bug.

Nothing is claimed before the server accepts it: the button says "Saving…", a
failure says "Alert NOT created — nothing is being watched", and the success
message only appears after a re-read. The local array is a cache of the
server's answer, never a second source of truth.

## The data was already there, fetched and discarded
TCGdex holds no logo for **any** Japanese or Chinese set — 0 of 138 and 0 of 84
— so 229 of 449 sets had nothing but a text tile. The set-list query was already
selecting `(ARRAY_AGG(c.image_small ...))[1] AS sample_image` on every request
and dropping it from the mapped response.

Returning it gave 229 sets a real picture of themselves at no fetch cost.
Before inventing a source, check what the current query already computes.

## A guard that has never fired is indistinguishable from one that cannot
Each guard was verified by tripping it, not by watching a quiet log:

| Guard | How it was forced | Result |
|---|---|---|
| quota | `RESERVE` temporarily set to `DAILY_LIMIT` | `status: 'quota'` with reason, remaining, reset — and it blocked the token call too |
| kill switch | `EBAY_ENABLED=false` | `status: 'disabled'`, eBay never contacted |
| serialisation | two concurrent requests | two sequential token exchanges, never overlapping |
| 429 | a live stub returning 429 | breaker tripped, second call refused without touching the network |
| 5xx | stub returning 503 | exactly 3 attempts, then gave up |
| dry run | `?dryRun=1` | request returned, token redacted, quota unchanged |

The quota trip is the one that mattered: run WITHOUT credentials it reported
`unconfigured`, because the credential check short-circuits before the gate. It
only proved anything once dummy credentials were set. **A guard test that cannot
reach the guard passes for the wrong reason.**

## A refactor can quietly downgrade a diagnosis
Routing the token exchange through `ebaycall` replaced three distinct messages
with one generic one: a rejected exchange, an unreachable host and a non-JSON
body all became `eBay returned HTTP ...`. Nothing failed — the tests caught it
because they assert WHICH reason is reported, not merely that a failure was
detected.

`shortDetail` now parses both eBay dialects (`errors[]` for Browse,
`error`/`error_description` for OAuth), a transport failure is never labelled a
rejection, and `nonJson` separates "unparseable" from "valid JSON without the
field". Losing `invalid_client: client authentication failed` would have thrown
away the single most useful string in this integration.

## Shadowing a parameter inside a retry loop
`const body = await r.text()` inside the retry loop put the destructured request
`body` into a temporal dead zone for that whole block, so every call — including
every token exchange — threw `Cannot access 'body' before initialization` and
was reported as an unreachable host.

The unit suite missed it entirely: the tests were written before POST support
existed and **were not re-run after it landed**. A live 429 stub found it on the
first call. Integration tests find what unit tests written against an earlier
shape cannot.

## Another eBay site shows US listings with MACHINE-TRANSLATED titles (2026-09-30)
Every search sends `X-EBAY-C-MARKETPLACE-ID: EBAY_US`. Measured with
`/api/ebay/marketprobe` (real `sourceEbay` per site, overlap by item id,
10 cards + 2 graded): over US's 839 kept rows, GB adds +51%, DE +33%, AU
+19%, CA +7%, FR +9% (each marginal on the sites before it).

**IT and ES cannot simply be added.** eBay translates US sellers' titles
for those sites and our gate reads the translation: IT kept items the US
search had returned and REFUSED — "(Portachiavi)" (a keychain), "30°
Celebrazione" (the 30th reprint, refused 47x on US), "DANNEGGIATO" in a Raw
NM search. Every English-vocabulary rule (reprint, junk, condition,
language) is defeated by a translated title. IT/ES also return ~630 US
rows the US search never returns — not the category (`EBAY_US_NOCAT` +0-2)
and not the set name in the query (`EBAY_US_NOSET`); cause unknown.

**DE needs a German-vocabulary language gate first.** `LANG_WORDS` is
English words only, so a German seller's "Spanisch", "Italienisch", "ITA"
or a 🇩🇪 flag is silence and the card is kept. Also seen on DE:
"Metallkarte … Goldcard" (metal replica) and "POKELOTTERIE" (a lottery).

Before any other site reaches `/api/listings`: every currency through
`fx.js` (GBP/AUD/CAD pinned since `f98108b` — fx refuses an unpinned
currency, which first threw away every GB/AU/CA call), and shipping is to
THAT site's buyer unless `X-EBAY-C-ENDUSERCTX` says otherwise — unmeasured.

## Completeness plus a single lane is starvation (T1/T2, 2026-09-30)
Live: zero listings, `calls: 0`, `tookMs: 75038`, quota fine. The morning's
"every site, every page" made one card view 8-40 paced calls, background
paging shared a queue of ONE, and a user's request sat 75 seconds behind a
crawl and never reached eBay. Not a pre-existing bug — the consequence of
the design that preceded it. Two fixes, both needed:
- **The queue** (ebaycall): foreground and background lanes, five slots,
  background capped at two, a 4s foreground cap answered as `busy`.
- **The design**: fetch what was asked. Open = 1 call; everything else is a
  button that says what it costs, and the response says what was not
  fetched. Measured after deploy: 11 plain opens, 1 call each.

**Then the page did it again from another direction.** The first live
reading after deploy showed a home-page load opening 14 cards nobody clicked
— the Latest-searches and alert tiles fetch each card's listings for an
"avg listing" line — 45 calls, and the burst filled the slots enough that
sites answered busy. Tiles now read the cache only (`?cachedOnly=1`).
**Look for every caller of a metered path, not only the one you changed.**

### The auto-expand threshold, measured
20 random priced English cards (5 per price tier, Raw): US page 1, then all
8 sites. US 0-4 kept (5 cards): the rest added 0, 0, +2, +3, +13 — ex15-95
has none in the US and 13 in AU. US 5-9 (2): +1, +12. 10-60 (5): +4..+38.
60+ (8): +4..+340. `< 10` expands 7 of 20 opens (~3.5 calls/open, over the
1-3 target); `< 5` expands 5 of 20 (~2.75). **5.** Random cards over-weight
obscure ones; re-read `/api/listings-log` `callsPerCardOpened` on real
traffic before moving it.

### Known, deliberately not built
- **A card named twice in two languages** — "Nachtara Vmax … Umbreon Vmax"
  on eBay DE. Words cannot settle German vs English; eBay's structured
  Language aspect could, at one getItem per listing per site. Not worth
  that under the budget above.
- **CMG** — seen once ("CMG 8"), unconfirmed as a grading company. Counted
  as a slab only with a grade number beside it (the TAG/ACE rule). Leave it.

## A promo prints no total; a subset's total carries its prefix (2026-10-01)
Every Black Star Promo was asked as "Sylveon V SWSH202/307 SWSH Black Star
Promos" — 307 is our COUNT of promos. eBay US: ebayTotal 0, with or without
the set name. And the gate refused "TG16/TG30" on a Trainer Gallery card
because our set_total is a bare 30. `cardmatch.PROMO_SETS` (11 sets, by id)
and `SUBSET_SETS` (TG/GG/SV); a prefixed number in a MIXED set (Generations
RC, Aquapolis H) is asked by number alone — its subset total is not held.
Live after deploy: swshp A1 B2 -> 3 ok, svp A3 -> ok, smp A1 B2 -> 3 ok.
The first survivors held a McDonald's 2023 "PROMO #001" against SVP 001.
**`set_total` is the catalogue's count, not what the card prints.**

## Images: TCGdex's asset host is throughput-bound (T1, 2026-10-01)
~1.5-2.5 thumbnails/s however many are asked: 12 at once 4.7-7.6s, 36 at
once 26.2s; pokemontcg.io 36 in 4.3s. All hosts HTTP/2; tiles already used
low.png and loading="lazy" — but native lazy fetches ~1,250px ahead (36 on
opening sv06, ~12 visible). Tiles now carry data-src and load within 200px
of the viewport (`watchImgs`). Still unchanged, by choice: the card page
loads high.png (385 KB); Japanese Limitless art is full-size where a
`_SM` (54 KB vs 330 KB) exists; zh-tw art is 257 KB with no thumbnail.

## TCGdex has no art and no logo for 49 English sets (T3, 2026-10-01)
Trainer kits (20), McDonald's (12), Shiny Vaults (swsh4.5sv), Trainer and
Galarian Galleries, Shining Legends, Dragon Majesty, bog, exu… — the set
endpoint returns no `logo` and 0 card images. setmeta's pokemontcg.io
fallback is a 3-set map (`PTCG_LOGO_SET`), so it was never asked for the
rest. Their LINK failures were a different cause (the subset numbering
above). **And `swsh9.5tg`/`10.5tg`/`11.5tg`/`12.5tg` (2026-07-27) duplicate
`swsh9tg`…`12tg` (setgap, 2026-09-22) card for card** — no images,
"30 not found" in manifest. Not deleted: awaiting a decision.

## eBay's Set and Year: where they live (T4, 2026-10-01, `/api/ebay/setprobe`)
Not in the search summary. `Set` and `Year Manufactured` ARE refinement
aspects: free histogram over eBay's whole result, and `aspect_filter=Set:{…}`
agreed with getItem 19/19. Fill: Set ~97-100% on five cards, US and GB.
**Year: 38% Aquapolis Lugia US, 34% GB, 48% 30th CC Lugia** (87% Base Set
Charizard, 82% Umbreon VMAX) — not a gate. Set is seller vocabulary: of 10
genuine 30th CC Lugias, 3 say "Celebrations" (the 2021 family), 2 are blank,
and one $450 row kept as Aquapolis by its TITLE carried Set "30th
Anniversary Edition". Unmeasured lead: `epid` (eBay catalogue product) is in
135 of 200 summaries — free, and possibly per-product.

## eBay listings are cached, never stored
**CORRECTED 2026-10-08 (Roy read the API License Agreement; quoted from
developer.ebay.com/join/api-license-agreement the same day).** The note below
was stricter than the terms. What they say:
- §3.1(b): "limited intermediate copies of eBay Content only as necessary to
  perform an activity permitted ... All intermediate copies must be deleted when
  they are no longer required for the purpose for which they were created".
- §8.1(c): "Displayed item listing information may not be more than six (6) hours
  older than information displayed on the eBay Site ... If your displayed item
  listing is not as current as the listing on the eBay Site, you will disclose
  in your Application how much older your displayed item listing is".
- §8.1(b)(1): "When the eBay Content is no longer publicly available, you must
  delete it from your Application."
- §8.1(b)(2): eBay Content in a Public Display "may not be co-mingled or
  combined with non-eBay Content ... must be visually isolated from third-party
  listings or other non-eBay information".
So listings MAY be stored for display (the deals shelf: refreshed every 3 h,
found-at shown, a listing no longer live removed). Still binding: §8.1(d)
(derived statistics need written permission) and §9.5 ("Use eBay Content,
either alone or in combination with third-party information, to suggest or
model prices for items listed on eBay Site"). The original note, as written:

eBay's terms allow serving item data for a request, not retaining it. So:
- The 15-minute in-memory cache is the limit. `price_history` receives **no**
  eBay rows — re-verified 2026-09-22: zero rows with an eBay `source` or
  `marketplace`, out of 102,636.
- **Yahoo's local-fetch-and-store design must not be copied for eBay.** Yahoo is
  stored in Supabase because Render is 403'd; eBay is an API that works from
  Render and its data may not be persisted.
- Aggregates derived from eBay would be fine to store; the listings are not.
  `gradeprices.js` stores the aggregate and never the rows.
- Every response carries `freshness` with the cache age, so a 14-minute-old
  price is never presented as live.
- Attribution rides on every row and on the response, with `affiliated: false`.
  "Listings from eBay" states the source; nothing implies a partnership.
- `/ebay/deletion` only acknowledges, which is correct **because we store no
  eBay user data**. If that ever changes it must actually delete — noted in the
  code beside the handler, where it will be seen.

## A reprint reuses the original numbering
Celebrations Classic Collection (2021) reprints Base Set cards with the
**original** numbering. A Celebrations Charizard is genuinely `4/102` and
genuinely says "Base Set" in the title, so number, set size and set name all
matched and every check we had said yes.

Live search, Base Set Charizard 4/102 PSA 10: **24 listings kept, $536.75 to
$249,999.95 — a 465x range.** 19 were Celebrations at ~$550; the genuine 1999
cards ran $8,000-$250,000. This is the master-ball mirror in English, and the
price gap makes it worse.

Two discriminators, both in `cardmatch.js`:
- `REPRINT_MARKERS` — a Celebrations / Classic Collection / Legendary Collection
  listing is refused when our card is not from that set, and is kept when it is.
- **Year.** 45,780 of 45,781 cards carry a release date. A title stating a year
  more than one off the set's release is a different printing. Rejects only on
  stated evidence, and scans ALL years so "1999 … graded 2021" survives.

After the fix: 4 kept, 22 rejected, zero Celebrations.

### Ingesting a set can disable a gate that names it

**30th Celebration** and **30th Classic Collection** released 2026-09-16 and
were never ingested. Ingesting them on 2026-09-22 silently broke the
Celebrations guard **in both directions**, because the string
`30th Celebration` satisfies that marker's `/celebrat/i` set alias:

- the guard was **disabled for all 188 cards of the two new sets** — a 2021
  Celebrations title was kept against `en-30th-103`;
- every 30th listing became **exempt on a 2021 card**. Measured on live eBay
  traffic before the fix: **6 of 20** real 2026 "30th Celebration" titles were
  kept against `en-cel25cc-4`, now 0.

Nothing failed and no test caught it. The numbers and set sizes agree, because
that is what a reprint *is* — so this is the master-ball mirror with a
five-year gap instead of a parallel printing.

`REPRINT_MARKERS` entries now carry optional `reNot` / `setNot`: a marker is
skipped when the title *also* names the other anniversary set, and a set
satisfies a marker only when it does not carry the disqualifier. A bare `30th`
marker sits last.

**The lesson is not about these two sets.** A new set whose NAME contains
another set's marker word disables that marker for its own cards, and the
symptom is invisible.

### Superseded 2026-09-26: reprints are keyed by SET ID, both directions

`REPRINT_MARKERS` is gone. `REPRINT_FAMILIES` lists each anniversary family's
**set ids** (`30th`/`30th-c`, `cel25`/`cel25cc`, `lc`); our card's membership
is `familyOfSet(setIdOf(card))` and nothing reads a set name. Words are only
evidence about the *listing*, tested 30th-first. `REPRINT_OF` maps every
Classic Collection card to its original and its **printed** number.

Two defects that table fixed, both measured live:
- **The reverse direction never existed.** A reprint search kept the
  original, which names no reprint. Now a `REPRINT_OF` card requires the
  title to name its family or its year — silence is not neutral there.
- **Classic Collection cards were unsearchable.** Our catalogue numbers them
  `029`/`CC002` (TCGdex ordinals); the card and every seller say `149/147`
  and `4/102`. Both searches returned `0 kept, 0 rejected`.

`25th` is Celebrations evidence **only on a card Celebrations reprinted**
(`saysOnOriginal`) — McDonald's 2021 is also "25th Anniversary". A new
reprint set means one `REPRINT_FAMILIES` entry and, if it reuses numbering,
a `REPRINT_OF` table; `node reprint.test.js` checks each row against the
catalogue when `DATABASE_URL` is set.

Measured in both directions with the old gate rebuilt from `git show` rather
than retyped: on 80 real eBay titles across four cards, **no verdict changed
at all** — the fix costs nothing on genuine traffic. The three new blocking
assertions in `printinggate.test.js` (61 -> 69) were each watched failing
against the pre-fix file before being believed.

## A hoped-for grade is not a grade
`"1999 Base Set Charizard 4/102 (PSA 10 Contender)"` — $8,000, **ungraded**.
The seller is advertising what they think it would earn. Also seen:
`"(PSA 10 Pot?)"` written on a BGS 9.5.

Reading that as the grade puts a raw card in a list where the real article is
$250,000. `stripSpeculative()` removes the phrasing before grades are read —
inside a bracketed aside, or immediately after a grade token, which is how
sellers write it. Applied to the **raw** branch too, or the card would be
excluded from both searches, which is worse than the bug being fixed.

## A different language is a different card
Korean prints share Japanese set codes and numbering: a Korean Charizard ex is
genuinely `201/165` from `SV2a`. A live search for the **Japanese** card kept
25 listings of which **6 were Korean**, $459-$632 against $620-$715.

Card ids already carry the language (`{lang}-{setId}-{number}`), so the gate
refuses a stated language that conflicts. Only on stated evidence — most titles
say nothing and those are kept.

## Ask a question the marketplace can answer
`ja-SV2a-201` has `name_en` but `set_name_en` NULL, so the set name fell back to
Japanese and the query became
`"Charizard ex 201/165 ポケモンカード151 PSA 10 pokemon"` — **zero results from
eBay US.** The response correctly read "0 kept, 0 rejected": nothing filtered,
nothing returned. That distinction is the point of reporting both numbers.

`buildQuery` omits a **CJK** set name — specifically CJK, not merely one lacking
Latin letters, because the first cut also dropped `"151"`, a perfectly
searchable English set name. The gate keeps the set name regardless; only what
is ASKED changes. Under "broad query, strict gate" an unusable term is worse
than a missing one.

**This is a data problem more than a code problem**, and it is quantified in
STATE: 653 of 14,023 Japanese cards have `set_name_en`. `node ingest.js names ja`
is the fix.

## English listings name the set; they never state its code
`jpTitleMatchesNumber` accepted a title with no `N/M` pair only if it contained
the set **code** (`swsh3.5`, `SM9`) — a Yahoo convention. English eBay sellers
write the set **name**: `Charizard VMAX #74 Champion's Path PSA 10`. That
fallback could therefore never fire on eBay, so only the `74/73` form was ever
verifiable and every `#74 <set name>` title was dropped with no error, no count
and no symptom beyond a short list.

The set name is now accepted as a disambiguator, but **only together with the
number** — deliberately stricter than the setId branch, which returns true
without checking the number at all. A set name alone is not enough: Champion's
Path holds more than one Charizard.

Normalise apostrophes by **deleting** them, not replacing them with a space:
`Champion's Path` → `champion s path` never matches the very common seller
spelling `Champions Path`.

## Two lists of the same thing, and only one of them resolves
The page browsed `/api/sets` — 176 sets carrying **pokemontcg.io** ids
(`sv3pt5`, `base6`, `swsh35`) — while cards, prices and listings are all keyed
on our own ids from `/api/sets/lang/en` (214 sets: `sv03.5`, `lc`, `swsh3.5`).
The server aliases most of the old ids, which is exactly why it survived: it
worked on the sets anyone checked. **33 of the 176 had no alias**, and each
broke one of two ways:

- **14 returned zero cards**, so `openSet` fell through to `tcgdexFetchSet` and
  drew the whole set as `mockP()` estimates. A real price collapsing to a few
  dollars, depending on the SET rather than the card. Dragon Majesty, Shining
  Legends, Shining Fates Shiny Vault, Black Bolt, HGSS Black Star Promos.
- **19 returned pokemontcg.io cards** whose ids are `base6-1`, not `en-lc-1`, so
  `/api/listings` could not resolve them and no links appeared. Legendary
  Collection, Champion's Path, Pokémon GO, every Trainer Gallery, the trainer
  kits.

And **92 sets that ARE in the database could not be reached from the UI at
all.** English was the only language with its own path — ja/zh-tw/zh-cn have
always gone through `loadLangSets()`.

**English now browses `/api/sets/lang/en` like every other language.** `EN_SETS`
embedded in the page is the offline fallback only; its ids are pokemontcg.io's
and must never be what we browse when the API is reachable. Render's free tier
sleeps, so `loadAllSets` retries five times over ~41s and puts a visible note on
the page if it still has nothing — the first visitor is the one most likely to
get the broken list.

One artefact of this era is still in the database: the stray `me2pt5-294` row
recorded under STATE. A pokemontcg.io-shaped id reached `cards`, and the writer
has not been identified.

### The silent substitutions that hid it

- **`CARD_CACHE` has no expiry** and `setCacheSet` writes every set-page card
  into it, whichever path drew them. One visit to a fallback set pinned an
  estimate for that card for the rest of the session, so the card page showed a
  few dollars while `/api/cards/:id` had the real price all along. The set page
  was right and the card page was wrong from the same click. `openCard` now
  prefers the cache only when the cached price is real.
- **English + `tcgdex` fell off the end of `setSourceNote`'s chain** and hit a
  bare `return`, so a set of pure estimates was drawn with no note at all.
- **The card page showed the headline number bare** while the set tile labelled
  it `est`. The one screen a buyer decides on was the one that did not say.

### And the one found while verifying the fix

The card page headline disagreed with the set tile by 1-2%. The API agreed to
the cent from both endpoints, so the difference was being introduced **on
screen**: `renderMarketData()` pasted `/api/market`'s value over it.

That aggregate comes from `tcgplayerPrice(cardName, setName)` — **name and set
only, no collector number**. Ascended Heroes carries Pikachu ex at #057 $3.37
and #276 $959.68; `/api/market` returned **$3.17 for both**. So the card page
for a $959 card showed about $3, badged *high confidence · TCGPlayer market
price*, beside a set tile reading $959.68.

This is the defect v4.9 killed on the WRITE path, alive on the display path.
`server.js` refuses to persist that aggregate and explains why at length;
nothing stopped the page from showing it. **A number-matched price always wins.**
The aggregate may stand in only when the card has none of its own, and is
labelled `name match` when it does. The confidence badge reports the
collector-number match rather than vouching for a number it did not produce.

`/api/market/:cardName` accepted `cardId` and never used it. **Fixed**: a
number-matched price now outranks the name-matched one, through the same LATERAL
join `/api/cards/:cardId` uses — one derivation of what a card is worth, not a
third. The aggregate is still returned under `nameMatched`, so nothing that read
it lost anything, and `matchedOn` is always present: `collector number` or
`name+set`. When it is `name+set` the response carries `matchWarning` naming the
cardId it could not match — a response that cannot identify the card must not
imply it did.

Live, Ascended Heroes: Mega Hawlucha ex #116/#268/#283 now answer $0.70 / $5.90
/ $56.34 where all three answered $230.48, and Pikachu ex #276 answers $959.68
where it answered $3.17. The frontend guard stays regardless — it is the right
place for the guarantee even with the endpoint fixed.

### A helper inside a test is not exempt from being tested

`setlist.test.js` reads the shipped page's source to assert what the frontend
does. Its `fnSrc(name)` slicer has now been wrong twice, in opposite directions:

- a **fixed 2600-byte** slice truncated `renderMarketData`, failing an assertion
  about code that was present;
- terminating only on `\nfunction ` **over-ran**, because `openCard` is followed
  by `async function fetchMarketPrice` — so any positive assertion about
  `openCard` could have passed on a different function's code.

Under-slicing gives a false FAIL: noisy, safe. **Over-slicing gives a false
PASS** — a guard reporting green about text it never read. It now stops at the
next top-level declaration including `async`, and carries four assertions about
itself, because twenty other assertions depend on it.

A third: a regex pinned `loadLangSets('en')` to zero arguments and went red when
a retry added one. The page was right and the test was wrong, **and that commit
was pushed anyway because only the last four lines of output were read.** Read
the whole result.

### What would have caught it

Every unit suite passed throughout. `cardmatch` and `estimator` were never
wrong — the bug was in WHICH list the page walked and WHICH function last wrote
to the DOM. `setlist.test.js` walks the real endpoints and asserts the two paths
agree; `setaudit.js` audits every set end to end and proved the API was clean,
which is what made it certain the fault was in the page.

## A pattern rewritten for readability lost its boundaries

`NOT_A_SINGLE_CARD` was once a single `/\b(lot|box|tin|...)\b/i`. Splitting it
into an array of alternations joined with `|` dropped the two `\b` at the ends —
only the four terms carrying an inline `\b` survived.

So `tin` matched inside Gira**tin**a and Des**tin**ed Rivals, `lot` inside
Lotad, `case` inside Casey, `box` inside Boxer. Lost Origin's Giratinas and
**the whole of Destined Rivals** reported *all 75 scanned were rejected — not a
single card: tin*. Eight of twenty-five real card names were rejected.

Every suite passed throughout, because **not one of them tested a card name
containing a junk word as a substring.** `looksLikeJunk` for the third time: a
filter written against bad data quietly eating good data.

The terms are now a plain word list — `NOT_A_SINGLE_CARD_TERMS`, exported — and
the boundaries are applied in code, once, by `boundedTerm()`. They cannot be
dropped again because the terms never carry them. `cardmatch3.test.js` probes
every exported term mid-word and fails if any matches.

**Measure a filter change in both directions, against the pattern read from
source rather than retyped.** A hand-typed copy of the old pattern was wrong and
would have produced a false comparison; rebuilding it from `git show
HEAD:cardmatch.js` gave: genuine junk 30 titles, old blocked 30, new blocks 30 —
no weakening; real card names 38 titles, old blocked 15, new blocks 0. The
plurals added to the list (boxes, tins, cases, coins, pins, binders, toploaders,
stickers) are exactly what substring matching caught by accident, and without
them the fix would have loosened the filter silently.

### The listings panel had two writers, one ungated

Found verifying the above in a browser. Giratina V #130's panel led with
*2022 Pokémon Magnezone V #056 Lost Origin* while `/api/listings` for the same
card returned **73 kept, 2 rejected of 75 scanned**, all genuine Giratina V
130/196.

`#cd-listings` had two writers: `renderListingFinder()` (gated by cardmatch) and
`renderMarketData()` calling `renderRealListings(m.listings)` — and `m.listings`
is `ebayActive()` on a NAME query with no title gate. Whichever request returned
last won the element.

**A set of listings carrying no rejection count has not run the gate.** It
carried none because nothing ever rejected anything. The ungated render is gone;
`renderListingFinder` owns that element.

### linkaudit.js

`node linkaudit.js <setId|cardId> [--live] [--kept]` separates the three causes
of "no links" that look identical in the UI: **A** eBay returned nothing, **B**
the gate rejected everything, **C** the card never resolved. It is what found the
boundary bug — a whole set reading `B: all 75 scanned were rejected` is a
different fact from `A: eBay has none`, and the UI showed both as an empty panel.
`--kept` prints survivors, which is how the Yuyu-tei variant rule was verified.
Tracked, like `setaudit.js`, and read-only with dry run by default.

## A fix is not installed until every path that needs it HAS it

Two gates, each correct, each wired into exactly one of the two marketplaces —
and one of those two could not run at all.

**The year discriminator never fired anywhere.** It lived in `sourceEbay`'s
`matchCard` and read `card.set_release`, but `resolveListingCard` — the one
query behind BOTH `/api/listings/:cardId` and `/api/search` — never selected
that column. So `setYear` was always `null`, `if (card.setYear)` never passed,
and a 2021 Celebrations title was kept against a 1999 Base Set card: the
$536-to-$249,999 spread the gate was written to prevent. `ebayprobe.js` does not
select it either, so the probe agreed that everything was fine. The
"22 rejected, zero Celebrations" result above was `REPRINT_MARKERS` working
alone.

**The language gate ran on eBay and not on Yahoo JP** — and Korean prints share
JAPANESE set codes, so Yahoo is where they actually appear. `jpfilter.js` had no
concept of language or year: `grep -c` returned 0.

The gate logic was never wrong. Both failures were upstream of it, in what the
caller handed it, which is why nothing failed and no test caught either.

Two traps in installing it on the second path, both worse than the bug:

- `languageOf` infers Chinese from bare CJK, **and Japanese is written in CJK**.
  Installed naively it rejects any kanji-only Japanese title — most of the feed.
  `cjkIsChinese:false` on that path; hangul and kana stay evidence because
  neither is ambiguous.
- `LANG_WORDS` is built on `\b`, and **there is no word boundary between CJK
  characters**, so not one entry could ever match a Yahoo title. A Korean card
  there says 韓国版, never "Korean". Without `LANG_CJK_WORDS` the gate would have
  been installed on Yahoo and still unable to fire — the same non-event as the
  missing column, one layer along.

`printingConflict()` is now the one implementation, called by both.

Verified by making it fire on real data, not by reading it: `node yahoogate.js
--query "ポケモンカード 韓国版"` rejected 62 of 62, including
`韓国版ポケモンカード メガフシギバナex RR M1L 003/063` — a Korean card with a
Japanese set code and a real collector number. And `node yahoogate.js
ja-SV2a-201 ja-M2a-250` kept 28 of 28 ordinary listings, because a gate that
empties the feed passes every blocking test ever written.

**Yahoo 403s Render, so that half can only ever be checked locally.** The
deployed API reports `yahoo: { status: 'error', reason: 'HTTP 403' }` — still
true on 2026-09-22. Poking the live endpoint tells you nothing about this gate.

`printinggate.test.js` has a REACHABLE section that asserts the SELECT and both
card builders, because the logic was never the problem. It read the wrong text
twice before it measured anything — first the comment above the SQL, which names
the columns, then a backtick inside that comment. A test that inspects source is
one typo from asserting nothing; revert the fix and watch it fail before
believing it.

## The price is evidence about the title when the title carries none
Giratina V #186 — one card, one set, one grade, every listing past the gate:
**$2.08 to $1,114.99, a 536x spread.** #186 is the alt-art Giratina, $800-1000.
The $2.08 title is word for word the shape of a genuine one:
`Giratina V 186/196 Lost Origin SWSH11 Ultra Rare Full Art`. There is nothing in
it to match against, so no keyword can ever reject it.

Its peers can. `outlier.js` compares each price to the median of the card's own
listings and flags what is an order of magnitude below it. On the real audit data
it flags $2.08, $8.50, $17 and $20 as implausible and $25 as unusually cheap, and
leaves $299 and $1,114 alone.

- **Flags, never rejects.** A genuine bargain exists. `looksLikeJunk` and
  `clean --delete` are what removal looks like when it is wrong.
- **Not below a $15 median** — Team Rocket's Grimer sits at $0.99 and cheap cards
  spread widely for honest reasons.
- **Not under 5 priced listings.** A median of three means nothing.
- **Flagged sorts last, ahead of buyable and ahead of price**, and `cheapest` /
  `cheapestLive` skip flagged rows. That headline is what people act on.
- Run live on `ja-SV2a-201`: 24 listings, median $273, spread 9.7x, **0 flagged**
  — the cheapest at $50.84 was left alone. A price test that fires on an honest
  spread would be worse than none.

Wired in `gatherListings`, so `/api/listings` and `/api/search` cannot disagree.
`usable()` in `gradeprice.js` drops `implausible` rows too, or the measured grade
price is built partly on the thing we just flagged.

## Search could not find cards we hold by their own name (2026-09-28)
"Pikachu Zekrom GX" returned **no candidates at all** with `en-sm9-33` in
the database. The name reached SQL as one substring,
`LIKE '%pikachu zekrom gx%'`, against `Pikachu & Zekrom GX` — so any
punctuation difference was a total miss, not a worse rank. Running
`parseCardQuery` over all **4,512 English names** found the parser altering
**209 of them (366 cards)** before SQL was reached, in three causes:

| cause | names | e.g. |
|---|---|---|
| a SET_MARKERS word inside the name became the set hint | 99 (52 left with NO name) | Paldean Clodsire ex, Shining Lugia, Lost City, Iron Crown ex, Detective Pikachu |
| a number in the name taken as the collector number | 35 | Alakazam 4, Metal Cube 01, Blaine's Quiz #2 |
| bare TAG / ACE taken as a grader | 5 | Spell Tag, Ace Trainer |

Plus the unordered `LIMIT 200` before scoring: "Pikachu" matches 304 rows,
so whether the plain Pikachu was a candidate was chance.

Fixed as causes: one fold for both sides, word-by-word (`&` `-` `and`
`of` apostrophes periods `é` all irrelevant); the parser's two guesses are
**scored under every reading, never used as filters**; TAG/ACE need a grade
number (cardmatch's `GRADERS_AMBIGUOUS` rule, now in both); rank before the
cap. δ ◇ ☆ ♀ ♂ are identity, kept as words.

**The full-catalogue before/after count was NOT obtained.** Both runs were
killed by memory pressure (before at 11,000 of 21,272 numbered queries) and
the tool held its results until the end. `searchaudit.js` now checkpoints
and resumes. Re-run it before calling the failure rate "near zero".

Performance, unloaded: ~150ms -> ~210ms per search. The first cut ran the
whole normaliser as REGEXP_REPLACE over all 46k rows per word (3.5s); a
query word contains no punctuation, so matching it against a one-pass
TRANSLATE fold is exact — `cardparse.test.js --db` asserts that claim on
4,000 real names. Timing measured under audit load reads 10x worse; do not
compare timings while a bulk job is running.

## Two lists of grading companies, and one of them was never updated
`AiGrade 9.5` — a $987 slab — passed a **Raw NM** search. `SLAB_WORDS` was a
hand-typed copy of `GRADERS` and AiGrade was in neither; the slab was therefore
not recognised as a slab at all.

`SLAB_WORDS` is now **derived** from the grader arrays, so a company cannot be
added to one and missed by the other. But deriving it also widened what a raw
search refuses, and that direction is where the damage is:

**Bare `tag` and `ace` were already in that list.** `TAG TEAM` is a card mechanic
and `ACE SPEC` is a rarity, so `Pokemon Pikachu & Zekrom GX TAG TEAM 33/181` was
answered with *wants raw, title indicates a graded slab: TAG* — every TAG TEAM
and every ACE SPEC card, unreachable raw, with no symptom but a short list.
`GRADERS_AMBIGUOUS` (TAG, ACE, MNT — sellers write MNT for Mint on raw cards)
counts as slab evidence **only with a grade number beside it**.

Never added: `GEM` (in every "Gem Mint" title), `RARE`, `MINT`, `TCG`.
`rawgate.test.js` asserts each is absent, and asserts 19 companies' slabs are
refused while ordinary raw titles survive.

## A gate that skips says nothing; now it says what it skipped
Every discriminator in `printingConflict` reads a field and is skipped when that
field is absent — correctly, because rejecting on absent data is the
`looksLikeJunk` mistake. What was wrong is that the skip was **invisible**, which
is how the year gate sat dead on every live route for weeks.

`verify()` now returns `evidence: { language, year, setName, unchecked }`, and
both sources report it as `sources.<id>.gate`. Live today on `ja-SV8a-002`:
`{"language":"ja","year":2024,"setName":"テラスタルフェスex","unchecked":[]}`.
A missing language adds `gateWarning` naming the check that did not run. It
reports; it never refuses — the feed is unchanged.

Checked while investigating a report of non-English listings on `en-swsh11-186`.
**The gate was being fed**: the live gate block read `lang: "en"` and that same
run rejected `Pokemon Giratina V Alternative Art Lost Origin 186/196 Spanish`
with *title says es, this card is en*. What looked non-English was the
**condition string**, which eBay localises to the seller's site — `Non gradée`
(FR), `Non gradata` (IT) — on English cards; one of those titles says `ALT EN`
outright. Worth knowing before reading a language fault into a panel.

Two real faults came out of looking:
- **Three copies of "what language is this card"** — `cardLanguage`'s regex, and
  `String(api_card_id).split('-')[0]` inline in each of the two card builders.
  `languageFromCardId()` is the one implementation now. The split was also looser
  than the regex: `'base1-4'` yields `'base1'`, sliced to `'ba'`, and the gate
  then compares every title against a language that does not exist. A
  present-but-wrong value is worse than null, because null is now reported.
- **`printinggate.test.js` asserted `filterCard` carried `lang` and never
  asserted `matchCard` did** — the path that happened to be right went
  unmeasured. That is the inspection form of testing a gate on refusals only.

The REACHABLE section now runs the real derivation on real id shapes
(`en-swsh11-186` → `en`, `base1-4` → null), not only greps for the field. Each
new assertion was watched failing: `lang` removed from `matchCard`, the `split`
restored, the evidence field deleted. The third aborted the suite mid-run until
the assertions were made null-safe — a test that cannot finish cannot say how
much is broken.

## The marketplace had already said it, and the gate never read it
Found in the browser while verifying the AiGrade fix:
`Pokemon 2022 Giratina V 186/196 ... Lost Origin PCG 9` — **$1,114.99, eBay
condition `Graded`, sitting in a RAW NM search.** The title gate could not reject
it, and must not be taught to: `PCG` is how sellers write "Pokémon Card Game", so
the token would eat ordinary titles. That is the `tag` / `ace` mistake offering
itself again.

eBay's `condition` field is structured data from the marketplace — stronger
evidence than any word in a seller's title — and it was displayed in the UI while
no gate consulted it. Same class as the missing `set_release` column.

`conditionSaysGraded()` refuses a stated "Graded" on a raw search, matching the
leading `grad` so `Gradata` and `Gradée` count while every negative form is
excluded explicitly. **One direction only**: "eBay says ungraded, the title says
PSA 10" is a sloppy seller far more often than a fake, and rejecting on it would
drop genuine slabs.

## `art` is in the name of every expensive card
`Giratina V 186/196 Shiny Holo Lost Origin *Fan Art*` at $8.50 was kept.
`fan art`, `fanart`, `fan made`, `unofficial`, `handmade`, `homemade`,
`not official`, `inspired by` and `art card` now reject it.

`art card` is the one that nearly did real damage: sellers write **"Alt Art
Card"** and **"Alternate Art Card"** for the most valuable cards in the modern
game — including this very Giratina. Rather than weaken the term,
`GENUINE_ART_PHRASES` removes the genuine phrasing before the junk test, exactly
as `SET_NAME_PHRASES` protects "Classic Collection" from `collection`. "Fan Art
Card" still carries a bare `art card` afterwards.

Removed to a `~`, not to a space: the one pattern in the junk list is
`\d+\s*cards?`, and stripping "Alternate Art" out of `186/196 Alternate Art Card`
to spaces leaves `186/196   Card` — which that pattern matches, rejecting a
genuine alt art as a 196-card lot. Found by measuring the change in both
directions, not by reading it.

## A deep link is not a result, and must not be dressed as one
Roy reported towels and fakes; `--kept` showed almost none in the fetched
listings, because they were not coming from there. A deep link hands the
marketplace a string and shows whatever it returns — nothing gates it, because
the results never come back to us.

Three rows never went through `buildQuery` at all. `nameQ` was the card name
**alone**, handed to PriceCharting and to Amazon, and the Yahoo and TCGPlayer
rows concatenated their own. `Pokemon Giratina Raw NM` on Amazon asks for towels,
and it got them. Every query on the page now goes through `cardQuery` →
`cardmatch.buildQuery`, so each carries the collector number and the set; the
eBay links additionally spend `forLink`'s negative keywords, which is the only
filtering a link can have.

Presentation was the other half: the links sat beside the gated rows looking
equally trustworthy. They are now under **UNFILTERED SEARCHES**, stating that the
results are not checked by us, while the fetched block is marked *checked*.

## A cross-check must compare only what both sides examine
`listingparse.compare()` has **no name check at all** — by design, since its
name/set split is approximate. So every `cardmatch` rejection on name, reprint,
year or language looked like a disagreement when listingparse simply had no
opinion. The first live run produced 40, every one structural.

A signal that is always noisy gets ignored, which is worse than not having it.
The check now compares only number, set size, grade and lot/sealed/custom.

## An escape swallowed by the patching tool, not the code
A Python patch wrote a doubled-backslash `b` inside a **non-raw** string, so every
regex word boundary became a literal backspace (0x08) and none of the language
patterns could ever match — while the file still parsed and every existing test
passed.

Exactly the `'\D'` lesson one level up: the bug was in the tool writing the code,
not in the code. Writing the note about it reproduced it a third time — the shell
mangled the very command being documented — so:

```powershell
node -e "for(const f of ['CLAUDE.md','cardmatch.js','server.js','jpfilter.js']){const b=require('fs').readFileSync(f);let n=0;for(const c of b)if(c===8)n++;console.log(f,n)}"
```

All zero on 2026-09-22. **The `grep -cP '\x08' …` form written here previously
does not run in this environment** — Git Bash answers
`grep: -P supports only unibyte and UTF-8 locales` and exits non-zero, which
reads as "no matches" to anyone skimming. A check that cannot run is worse than
no check, so the node form above is the one to use; it depends on no locale.

Use a literal-text editor for anything carrying regex escapes, or check the bytes
afterwards. Passing an escape through Python, then a shell, then into JavaScript
gives three chances to lose it silently.

Fourth occurrence, 2026-09-18: the PROGRESS.md sentence documenting this very
check was itself corrupted — the escape in it reached disk as a real 0x08 byte,
inside a **quoted** heredoc that should have passed it through untouched.
Quoting the heredoc is not sufficient protection in this environment.

What works: write the file with a literal-text editor rather than a shell
heredoc; or build the literal from character codes so no escape exists for a
layer to eat — `chr(39) + chr(92) + "x08"` — and anchor patches on lines that
carry no backslashes at all. Then run the byte check. It has now caught this
twice.

## A localised name does not mean localised data
TCGdex serves **the Japanese card's Cardmarket listing on the Chinese locales**.
`zh-tw/cards/SV4a-001` returns 走路草 with `idProduct 746203` at €0.18 — byte for
byte the same product and price as `ja/cards/SV4a-001` ナゾノクサ. Only the name
is translated. Traditional Chinese sets reuse Japanese set ids (SV4a, S12a,
SV8a), so there is nothing to distinguish them by.

It presented as the best news in the project: a coverage probe found TCGdex
pricing 56% of unpriced Chinese cards, ~4,164 of them, against a catalogue that
is **0% priced and parked in T5 for want of any source at all**. Writing it would
have read as unparking Chinese and would have priced the Traditional Chinese
catalogue at Japanese market values.

`pricingAllowedFor()` in `tcgdexprice.js` permits `en` and `ja` only, and refuses
anything unprobed rather than assuming. English is safe because its set ids are
distinct; Japanese is safe because it owns the shared ids.

**The size of an apparent win is a reason to check it harder, not less.**

## TCGdex embeds pricing, and the docs are wrong about its shape
`GET /v2/{lang}/cards/{setId}-{number}` carries a `pricing` block. No key, same
URL the catalog already fetches, works from Render. Three deviations from the
documented shape, each of which silently corrupts a price:

- The TCGplayer reverse key is **`reverse-holofoil`**, not `reverse`. A parser
  reading `.reverse` finds nothing and reports zero reverse coverage. It is on
  30 of 60 sampled cards.
- A provider can be **present-but-null**, not merely absent — `"tcgplayer": null`
  on 11 of 60. `Object.keys(pricing)` reports it available, then the next
  property access throws.
- **0 and null both mean "no data"**. `ja/SV2a-201` carries `trend-holo: 0`
  beside `avg-holo: null` on a €467 card. Zero is not a price, and it satisfies
  every `!= null` check.

Holo-only cards (every SIR/SAR/Hyper Rare — the cards worth money) have **no
`normal` key**; `holofoil` is their base printing. `variants_detailed[].pricing`
looks like per-variant pricing and is not — every entry repeats the same
card-level blob.

## Two paths to one marketplace agreed, and that is the validation
TCGdex TCGplayer vs our scraped `tcgplayer_market`, 40 English cards spread
across the value range: **median 1.020x, 37 of 37 in agreement**, with the
expensive cards matching to the cent — Pikachu pl2-112 $328.45, Hypno ecard2-H12
$229.99, M Charizard EX xy12-101 $125.56/$125.31. TCGdex is keyed by TCGplayer's
own `productId` rather than by our name-and-number matching, so it is at least as
trustworthy as the scrape it agrees with. Hence HIGH in `sourcerank.js`.

Cardmarket ran a **median 1.595x above** the Japanese sources with no gross
mismatches — the match is right, the premium is real EU retail. Hence MEDIUM: it
must never overwrite a Japanese shop price or it marks the JP catalogue up ~60%.
The +329 Japanese cards that gained a first price in the TCGdex gap pass are
**all Cardmarket**, so they are EU retail, correct for what they are but not a JP
market level.

## A ratio is meaningless at the price floor
The first cross-check flagged Corphish me01-033 as a 0.40x failure: $0.05 versus
$0.02. That is three cents on a bulk common sitting on TCGPlayer's minimum. A
disagreement now has to be **both proportionally large and worth ≥ $0.25**.
Proportion alone, applied to the cheapest cards, manufactures findings out of
rounding — the `looksLikeJunk` failure in a different hat.

## The FX rate was hardcoded at two vintages and never printed
`JPY_PER_USD = 157` in `jpfilter.js`, and a bare `* 1.09` inline in `ingest.js`'s
cardmarket path. The ECB reference rate on 2026-09-03 was **1.1615**, so that
1.09 understated every Cardmarket price by 6.6%, silently, for as long as it had
been there. A constant that reads as a fact, drifts, and is never revisited
because nothing ever prints it.

`fx.js` fetches ECB rates from `api.frankfurter.dev` (free, no key; the `.app`
host 301s without a redirect follow), falls back to a **stamped** pin, and
returns the rate alongside every converted amount so a caller cannot store a
price without having its rate to hand.

**Still outstanding:** `jpfilter.js` converts Yahoo yen at the hardcoded 157
while Yuyu-tei uses the live ECB rate via `fx.js` — around 158 today, so the two
differ by ~0.6% **in the same panel**. Small now; frozen forever if nothing ever
prints it.

## The page was still inventing numbers where nobody looked — found 2026-09-24
Moving the card page (TASK T1–T4) meant reading every writer of every box,
and most of them were fabricating. All are gone; `preserve.test.js` 7d3
asserts it and three mutations were watched failing:

- **Lowest listing** was `price × 0.74`, **Last sold** `price × (0.9 +
  Math.random()×0.1)` "2 days ago" — Charizard read $925.45, then $859.57.
- **The price history graph** was `genPD()`: price × a fixed curve plus
  `Math.random()` as "sold". Every card rose smoothly to today's price.
- **The position bar's "52w" low/high** were `price × 0.67` / `× 1.35`, so
  every card sat at 48.5% reading "Mid range".
- **Set-page tiles** carried a % change, a "deal" badge and a "PSA 9/10"
  badge, all from a hash of the card id.
- The **price table** (removed at Roy's request) and the **All conditions
  chart** were raw price × a fixed per-grade multiplier.

The graph, stats and bar now read `/api/history` (estimates excluded, one
series per source/edition/variant, `yahoojp_N` folded into one Yahoo
series). Lowest listing is the gated `cheapestLive` the panel itself leads
with. **A number that changes on reload is the cheapest test there is.**

## Trending, measured 2026-09-24 — `/api/trending`, rules in `trending.js`
- **Nothing records a card view.** No table, column or endpoint, so "most
  viewed" is not offered and the page says why.
- **Movers are English only.** 7-day pairs: 812 (563 changed); 30-day
  6,482. One Japanese card had a measured price in the last four days —
  Japanese cards are not being re-priced, so no Japanese movement exists.
- **`sample_n` is NULL on every one of the 83,974 real rows**, so it cannot
  be a thin-data filter. Same source/edition/variant at both ends, a $1
  floor for % sorts, a $0.25 minimum move and a >5× flag stand in for it.

## Hidden is an answer, not an absence (2026-09-27)
Filtering Pocket out of the set query alone would have made it come back:
zero rows falls through to live TCGdex, which carries Pocket, and the set
would be redrawn as estimates. So every endpoint whose "not found" leads to a
fallback returns `hidden: { reason }`, and the set page stops on it. The
English set count going 220 → 205 was the check; "Mega Rising" search going
18 of 25 Pocket → 0 was the other.

Also: the premise was that Crimson Blaze and Mega Rising were missing from
`isDigitalSet`'s list. They were in it (`B1`, `B1a`) — the list excluded them
from pricing correctly; nothing ever hid them. `isDigitalSet` in ingest now
derives from the series at startup anyway.

## A price band is evidence only where the card prices apart (2026-09-27)
`flagReprintPriced` flags rows at a known reprint's price level. First cut
checked only "≥3 rows above the band"; replayed over all 55 mapped originals
it flagged 165 rows, including a $1.99 "MP" Claydol (market $5) and a
"Damaged" Zekrom. Some high rows exist in any feed, so that test was too easy.
Now four conditions, including the stored market price as a second path and
the $15 floor `flagOutliers` already had: 150 flags on 21 cards, Aquapolis
exactly its 14, Base Set Charizard raw none. Looking at N 101/101 — 29 genuine-
looking $20 rows flagged — it read as a false positive until the stored price
($233) said otherwise: those sit on the 30th CC reprint's $25 median, released
11 days earlier. **Read the catalogue before calling a flag wrong.**

`ccfill.js` (local) filled 30th-c/cel25cc artwork and 30th-c rarity from
pokemontcg.io under our ids, `image_source`/`rarity_source = 'pokemontcg'`.
TCGdex DOES have a rarity for cel25cc (`Classic Collection`) — our rows still
say inferred "Common"; that is a `manifest` question, left alone.

## Verifying an unreleased endpoint
`BACKEND` is same-origin when the page is served from localhost, so
`PORT=3001 node server.js` + `http://localhost:3001/app` exercises new
server code in the browser. Append `?api=render` to use Render instead —
eBay credentials exist only there. And the shell escape trap bit five more
times this round: `\s`, `\'` and `$'` (a `String.replace` pattern) were
each mangled; the editor tool, not `node -e`, for anything with a backslash.

## Rarity is the card's; printing is the copy's (T10, 2026-09-29)
Expedition Alakazam #1 is Holo Rare, printed holo ($233.32) and reverse
($122.74); #33 is Rare, printed normal ($19.23) and reverse ($71.39) — four
products, two numbers, and the reverse can outprice the base. Our catalogue
had #1 as plain "Rare" (manifest corrected 32 Expedition holo rares) and no
notion of printing at all.

**Read the real response.** TCGdex's `variants` booleans hide the mirrors —
ja SV2a-001 says only `reverse: true` for the Poké Ball and Master Ball
mirrors. `variants_detailed[]` carries `type` + `foil` (the pattern), and
mixes in print run (`subtype`, `stamp: 1st-edition` — a different dimension,
`byPrintRun` owns it) and `size: jumbo` (another product). And **the
"per-variant pricing is the repeated card blob" line above is only true when
a printing shares the card's product**: Prismatic Exeggcute's Poké Ball and
Master Ball entries carry their own products and prices ($0.31 / $1.32 vs
$0.04). `printingPrices` takes a pattern's price only when the block names
the pattern's OWN product id. Also: TCGdex maps Alakazam #1 and #33 to ONE
Cardmarket product (274876) — its Cardmarket price is wrong for one of them.

Built, in order: `cards.variants` from manifest; the gate
(`cardmatch.printingClaim` / `printingRefusal`, `verify(opts.printing)`) on
eBay, Yahoo and Yuyu-tei; per-printing prices written as
`price_history.variant` rows; `printsql.basePrintingSql` on **every**
headline reader — the missing half of the variant column: 7,117 reverse rows
existed and no reader looked, so **241 cards showed a reverse price as the
card's price, and none of them held a base price at all**. 235 now do (TCGdex
`--gaps-only` over their 56 sets), 3 estimate, 3 none. The page offers a
Printing box only when a card has more than one.

**The Master Ball trap** is the TAG/ACE lesson: "Master Ball" and "Poké
Ball" are pattern words AND card names. The card's own name is removed from
the title before pattern words are read, so the Master Ball ACE SPEC card
(EN and JP マスターボール) is never read as a mirror. And a kana fold must
**recompose**: NFKD splits ボ into ホ + dakuten, and マスターボール never
matched until the fold ended in NFC.

`variants.test.js` 71 (+6 `--db`); 19 wiring assertions watched failing.

---

## The base-price rule lives outside server.js too (T2, 2026-09-30)
`variants.test.js` counted `basePrintingSql` in server.js (5) and was
green while `trending.js` and `ingest.js evaluateAlerts` read the latest
real row of ANY printing — 6 cards whose only real price was a reverse
showed it in trending and in an alert's current price, and an estimate on
their own page. And `pricecheck` checked a number the page never showed
(any grade, any printing) against a search the writer never makes (set ID
as text, no set check), reading "no match" on 151 where both agree to the
cent. **A verification tool is a reader: give it the page's rule and the
writer's question.**

## A marketplace is where a card is sold; a language is what it is (T1, 2026-09-30)
Adding eBay DE/FR/IT/ES changed WHERE we look, never what the gate accepts
— and every one of them needed teaching first, because the English-only
vocabulary passed their wrong cards. Measured on 2,408 rows those four
added for 12 English cards: "Italienisch", "ITA", "Französisch", "GER",
"Holland", "VF"; Celebrations and 30th reprints ("Celebrazioni",
"30° Anniversario", "30 Jahre … Jubiläum", "25 ans"); lotteries, customs,
extended-art cases, "fan made" as eBay translates it ("Hecho por
Ventilador", "Ventaglio"); slabs in Raw ("GRAD 7", "AiGrading 9,5").
Taught on one set of 12 cards, checked on 12 held out, then on 12 more
through the production gate; across 4,512 rows US/GB/AU/CA keep, not one
verdict changed. `eusites.test.js` holds the real titles, both directions.

Four things that are not obvious:
- **eBay's aspect NAMES are localized, and an English one is IGNORED.**
  base1-4 on DE returned 264 for Raw, Raw NM and Raw HP alike; the English
  "Card Condition" filter did nothing and every row claimed eBay said NM.
  `cardmatch.EBAY_SITE_ASPECTS` holds each site's own names, read with
  `/api/ebay/aspects/:cardId?mp=`. **ES has no condition or grade aspect at
  all** — no filter, so no ES row may claim eBay stated a condition.
- **Bare "DE" and "FR" are language codes on eBay DE/FR** ("… Holo DE
  33/181", "Carte Pokémon FR") — found only by reading every DE row after it
  went live, when the independent reader had reported 0. Case-sensitive, and
  "DE" before its noun ("SET DE BASE", "DE COLECCIÓN") is the preposition.
- **A translated title's refusal must not cross sites.** 8 of 8 items
  IT/ES/DE refused that an English site kept were the translation's fault:
  "ENG" -> "ESP", "WALL ART" -> "ARTE DE PARED", "Ethan's Pinsir" ->
  "Pinsir di Ethan". Only US/GB/AU/CA refusals are sticky
  (`originalTitles: false` marks the rest).
- **"+26% from IT" was attribution, not listings.** Total rows went 2,942
  -> 2,938 when IT went on; IT re-returns US listings, and whichever page
  landed first owned the row — with an Italian title and a EUR price. The
  earlier site's copy now wins. Measure a new site by the TOTAL, not by
  the rows labelled with its name.

And the gold-foil trap, twice in one day: "gold foil" and "tarjeta dorada"
(gold card) each refused a GENUINE gold card (Mega Dragonite ex MUR at its
median; Ultra Ball 186/172). A word cannot tell a real gold rare from a $50
fake; the outlier check can. Both were measured, then removed.

## Edition is its own axis — and TCGdex names it differently on WOTC sets (T3)
1st Edition / Shadowless / Unlimited sit BESIDE printing (a card can be 1st
Edition and holo), only on gradeprice.printRunsFor's ten sets.
`cardmatch.editionClaim` is the one reader (listingparse labels from it) —
the old reader disagreed on 1,090 of 5,000 real titles, missing every
European form. French "Édition 2" is UNLIMITED.

Stored prices: 1st Edition rows carry the edition only in their source name
(`tcgplayer_1stEdition*`; the `edition` column is empty on all 611), and no
headline reader excluded them — 10 cards showed a 1st Edition price as
their price. `printsql.basePrintingSql` now carries `baseEditionSql`, so
every reader got the rule at once; exactly those 10 changed.

**Read from TCGdex, not assumed:** on WOTC holos there is no plain
`holofoil` key, only `1st-edition-holofoil` and `unlimited-holofoil`, and
`BASE_PRINTINGS` tried the 1st Edition key first — the harvest's "base" was
the 1st Edition price (Sabrina's Gengar 549.50 = TCGdex's 1st Edition
figure). Order fixed; rows written before the fix are classified by
`source_meta.printing`, so they land as 1st Edition, not base.

**The swing, re-measured after the harvest (2026-09-30 evening).** The
internal-API writer (path P) stored `tcgplayer_market` flipping between the
1st Edition and Unlimited products — 28 of 924 edition-set cards swing ≥2x.
The morning harvest (old key order) filed its 821 1st Edition rows
correctly but wrote almost no Unlimited rows for WOTC holos, so 11 of the 28
still headlined a 1st Edition price. The ten sets were re-harvested with the
fixed order: **all 28 now headline TCGdex Unlimited** (Lugia neo1-9
$531.39; its 1st Edition $164.80 held apart). TCGdex-first in
`safePriceFor` is live (conflicts recorded), so the nightly refresh writes
Unlimited; the internal API is the fallback only.

**`pricecheck` asks the wrong edition.** On neo1 it flagged 10 of 12 as
MISMATCH; its "live TCGPlayer" figure equals TCGdex's **1st Edition** price
to the cent on 10 of 12 (Lugia's $826.60 and Feraligatr #5 match neither).
On edition sets its MISMATCH means "we hold Unlimited", not "we are wrong".
Open: give pricecheck the edition, and stop the internal API.

# CONVENTIONS
- Card ids: `{lang}-{setId}-{number}` — `en-me02.5-294`, `ja-M5-081`.
  One row in the database violates this; see STATE.
- Prices in USD; the frontend converts for display
- `price_history` is append-only — always INSERT, never UPDATE
- `name_en` / `set_name_en` hold English equivalents; UI shows them in brackets
- `image_lang` records which language artwork came from
- `_priceIsReal` distinguishes market data from estimates; UI shows `est`
- `priceKind: 'shop-ask'` marks an asking price, never a realised sale
- Every new source: one function, the same normalised shape, through the gate
  and `outlier.js`, reporting kept/rejected/scanned. **A source returning
  listings with no rejection count has not run the gate.**

# THE RULES THAT KEEP BEING RE-LEARNED
1. **Probe before building.** Four APIs in this project were asserted from
   documentation and found wrong. One request answers the question.
2. **Test what a gate ALLOWS, not only what it blocks.**
3. **A fallback must announce itself.**
4. **Cross-check two paths that should agree** — the highest-yield technique here.
5. **A fix is not installed until every path that needs it HAS it.**
6. **The size of an apparent win is a reason to check it harder.**
7. **Never run `node ingest.js scrape`.**
8. **Use a literal-text editor for anything carrying regex escapes**, then run
   the 0x08 byte check (the node one-liner — `grep -P` does not work here).

# LOGGING
Keep `PROGRESS.md` current — it is the narrative record, dated, with what was
measured. `TASK.md` holds the current piece of work only. When you learn
something durable — a working source, a set-id mapping, a site that blocks you —
**write it into CLAUDE.md and into the code**, not only into PROGRESS.md.


---

# MOVED FROM CLAUDE.md, 2026-10-05 (T0, the 60k budget)

Verbatim, copied before CLAUDE.md was cut to its budget. Each block keeps its
heading at level 2 (inner headings demoted) and CLAUDE.md cites it. Settled
narratives and decisions with their history; the measurements went to
PROGRESS.md under 2026-10-05.

## Known blemishes, measured today

- **2026-10-02, e-Card and McDonald's (T3):** Skyridge 182/182 artwork,
  Aquapolis 177/185 — the 18 H01-H09 from pokemontcg.io's H1-H9 (each
  fetched first; `ccfill-backup-2026-10-02123815.json`), plus 5 sm3.5/sm7.5
  cards the old letter-folding match had refused. The 8 left are Aquapolis
  50a/50b-style pairs: pokemontcg.io has one #50 for two cards, so none.
  **SETTLED — do not retry**: one image for two cards is the fold-merge
  lesson (LESSONS §5); blank is correct until a host serves each separately.
  **McDonald's 2014/2015/2017/2018 (48 cards) and 2023/2024 (30, no logo
  either) have no host**: TCGdex `image: null`, pokemontcg.io 404s (and
  has no 2023/2024 set). TCGplayer's CDN carries them. **DECIDED 2026-10-02
  (Roy): leave them blank** — that is a marketplace's product photography,
  its API is closed to new access, and 78 cards is not worth a terms
  question we would have to guess the answer to. Do not fill from
  TCGplayer's CDN. Links: queries fixed `cc20e41`.

- **2026-10-01, data changes (each with a backup in the project root):**
  the four duplicate Trainer Gallery sets `swsh9.5tg`…`swsh12.5tg` deleted
  (120 cards, 729 price rows; every twin held its own price, median ratio
  1.000 — `dupsets-purged-20261001.json`); 26 Yahoo base rows on 23 SV2a/SV8a
  cards deleted where `jpcheck ja --both` showed the stored base price EQUAL
  to today's Master Ball mirror median (`yahoojp-mirror-purged-20261001.json`;
  "48" was the whole MIRROR class across all sets, not this criterion);
  8,359 Japanese thumbnails pointed at `_SM` (`jpthumbs-backup-20261001.json`);
  508 artworks + 25 logos from pokemontcg.io (`ccfill-backup-*.json`).
  Manifest's 125 "not found" were those 120 duplicates, 4 transient fetch
  failures and Unown `exu-?` (stored `%3F`, URL built unencoded — fixed).

- **English names are thin where they matter most.** Japanese cards carry
  `name_en` on 5,097 of 14,023 (36%) and `set_name_en` on **653 (4.7%)**.
  eBay is searched with the English name, so for ~64% of Japanese cards the
  query falls back to the Japanese name and eBay US answers nothing. The
  response correctly reports `0 kept, 0 rejected` — nothing is broken, the
  question is simply unanswerable. `node ingest.js names ja` is the fix, and it
  is the single highest-yield data job outstanding.
- **Foreign ids: zero, and refused loudly** (2026-09-27, `9c7c04f`). The two
  stray rows (`me2pt5-294`, `me55c-33`) are deleted (backup
  `strayids-purged-20260927.json`) and alert 5 re-pointed to `en-30th-c-008`.
  Writer: `/api/cards/:id`'s INSERT (`2fd8549`). **Producers, in the page:**
  the Add Alert card picker searched pokemontcg.io directly, newest set first,
  and took result one — "Pikachu & Zekrom-GX" → `me55c-33`, alert 5's fields
  exactly; and the embedded `ME2PT5_PREMIUM` list carried `me2pt5-*` ids.
  Also closed: the Search screen trending grid (pokemontcg tiles), the set
  page's pokemontcg-direct fallback, TCGdex-direct ids without a language,
  the `/api/cards?q=` proxy (410). `cardid.js` is the rule; `cardid.test.js`
  asserts it both ways and counts cards/alerts/portfolio at zero.
  **Not the producer:** `doSearchLegacy` fetched pokemontcg cards but could
  never draw them — `renderResultsGrid` was never defined in any commit.
  Deleted anyway. Check that a function RENDERS before blaming it.
- **Pokémon TCG Pocket is hidden, not deleted.** 15 sets, 2,480 cards, all
  English, `set_series = 'Pokémon TCG Pocket'` (TCGdex series `tcgp` lists the
  same 15). Every read of `cards` carries `digital.visibleSql()`; English
  browses 205 sets, Home 434. The rows stay; 33 of them carry
  `tcgplayer_market` prices up to $498.88 matched against physical promos.
  `manifest` skips them too since ingest 5.9.1 (`35b8ad9`), with the same
  predicate, and prints the skip.

---

## Open, and a decision rather than a fix
- **TCGplayer's internal search — KEPT as the last-resort fallback, decided
  2026-10-01.** TCGdex is asked first for every English card (reprints
  included); `tcgPlayerSearch` runs only where TCGdex answers no-tcgplayer,
  not-on-tcgdex or shared (`TCGDEX_FALLBACK_OK`) — never when TCGdex is
  unreachable. Measured that day: **2,025 visible English cards (9.6%) have
  only ever been priced by it**, and TCGdex returns `tcgplayer: null` for
  them — promos (svp 214, xyp 210, bwp 100, mep 60…), 30th (156), Shiny
  Vaults (216), Galarian Gallery (69), the 55 Classic Collection reprints.
  **Why kept, when the eBay sold scrape was deleted:** with eBay we held
  credentials under its terms AND were scraping, so a sanctioned route
  existed and we moved to it. TCGplayer has no route at all ("We are no
  longer granting new API access at this time" — no form, no partner path),
  so stopping it moves those cards to NO source, not a better one. It runs
  from the home machine during ingest, never from Render on a page view.
  Every row it writes carries `source_meta.via = 'tcgplayer-internal-search'`
  and `tcgdexNone`, so the cards can be found and re-priced the day TCGdex
  fills them or TCGplayer reopens access. Every other caller is gone:
  pricecheck says NOT CHECKABLE for these cards, the `test` command shows
  TCGdex, and the banned scrape path is deleted.
  Where TCGdex has a Cardmarket price for one of these, it is stored as a
  **second reading** (`source_meta.role = 'second-reading'`, converted by
  fx.js) — EU retail at ~1.6x, a different market, never the headline:
  `printsql.basePrintingSql` excludes it from every headline reader
  (`pricecheck.test.js --db` proves a newer one does not take over).
  The 9/29 set check had silently stopped svp/xyp/bwp/mep/sve/mee refreshing
  (their TCGplayer set names were unmapped); probed and aliased 2026-10-01 in
  `tcgsetname.js`. NOT dpp: its hit was "Jumbo Cards".
  **Re-check TCGdex coverage around 2027-01**: promos, Shiny Vaults and
  Galarian Gallery are the kind of gap that gets filled —
  `SELECT count(*) FROM price_history WHERE source_meta->>'via' =
  'tcgplayer-internal-search' AND recorded_at > now() - interval '30 days'`,
  then `node tcgdexharvest.js en --dry` on those sets.
- **`yahoojp_avg_N`** — Yahoo's own average, lots and slabs included, used
  only when a search returns no items. Ungated by construction; 0 rows held.
- **`node ingest.js scrape`** — DELETED 2026-10-01 (scrapeEbaySold, scrapeTcgPlayer,
  scrapePrices). The command now refuses and exits 1.
- ~~Variant is gated nowhere~~ — built in T10. ~~Stored Yahoo medians carry no printing~~ — T4 `28ea4be`: a title stating a reverse/mirror leaves the base median and gets its own `variant` row. **Existing** Yahoo base rows are NOT repaired: of 191 JP cards holding both, 143 Yahoo bases sit >5x the Yuyu-tei base, 54 >20x — `jpcheck` over them is the measurement still owed. ~~"Typical" ignores the printing selector~~ — `a9ba5e3`.

---

## REPRINT vs ORIGINAL — settled, and the stamp (2026-10-02)

**Settled — do not explore a fourth time.** No eBay field separates a 30th
Celebration / Celebrations reprint from its original. Three measurements,
one answer: **Set** says "Celebrations" on 3 of 10 genuine 30th CC Lugias;
**Year** is filled on 34-48%; **epid** (catalogue product) is seller-chosen
and ~12% of 30th listings carry the Aquapolis one. All three are
seller-entered signals, not gates. The title gate (`REPRINT_FAMILIES`,
`printingConflict`) stays the answer; the photo is the second check.

**The photo can tell them apart.** A note that "image matching cannot work
because a reprint reproduces the artwork" was the wrong conclusion — it is
not in this file or its git history today, but it is recorded here so it
is not re-derived: we are not comparing artwork, we look for a mark present
on one card and absent on the other. 30th Celebration reprints carry a
Pikachu emblem with "3"/"0" cheeks beside the art; Celebrations Classic
Collection the same emblem with "2"/"5". Measured on real listing photos
(eBay CDN, 0 API calls; photos looked at, never kept):

| question | answer |
|---|---|
| size | **s-l500** — legible when the card fills the frame at s-l225, gone on small/angled cards there (the row thumbnail is s-l225); s-l1600 rescued one glare photo |
| framing | the stamp is visible to a person on ~97% of reprint photos (Aquapolis listings: 68 of 69 reprints at s-l500; the one: glare); slabs fine; 1 of 86 was a card back |
| one template for all cards | **fails** — a Lugia-cut template caught 2/66 30th Pikachus, 0/57 Charizards, 0/77 Rayquazas; a bare masked emblem matched any yellow blob (Lugia originals median 0.69 vs reprints 0.81) |
| a template per card, cut from OUR scan of the reprint with its surrounding art | **works.** At 0.70: 345 of 373 reprint photos (92.5%) across Lugia, Pikachu, Charizard, Rayquaza; **0 of 16 hand-labelled Aquapolis originals flagged**; every one of 22 flags inside the originals' own listings was a stamped reprint on inspection. 0.66 flags 3 Rayquaza originals |
| Celebrations (CC002 Charizard) | 59 of 79 (75%) — but ~10 of the 20 misses are **metal** Charizards (a different product the gate keeps on the CC card) — ~86% of real CC photos |

Labels are Claude's, by eye from the photos, with zooms where unsure — not
Roy's. Re-label a sample before moving the threshold.

**What it found that nothing else could.** Of the 86 Aquapolis Lugia rows
on 2026-10-02, **69 were reprints**: 52 inside the reprint price band
(flagged) and **18 outside it, unflagged**, $280-$2,100 — including the
cheapest row on the page. Rayquaza-EX's reprint sells at the original's
price ($25-30), so no price band can ever separate those two; 18 stamped
reprints sat unflagged in its 162 rows.

**Built, and AUTOMATIC since 2026-10-02 (TASK T1)** — a gate, not a
button. `stampcheck.gate` runs in `judgeListings` after the text gates and
BEFORE the outlier check, on every eBay row of the 55 originals. A stamp
**found** is a refusal: the row is not shown and is counted in
`sources.ebay.rejected` / `stampRefused` / `droppedSample` and in the
payload's `stampGate`. **Not visible** and **unreadable** KEEP the row
(weak evidence never refuses; 2 of 86 Aquapolis photos show no usable stamp
area). 0 eBay calls; the row's own photo from `i.ebayimg.com` only, never
a caller's URL. 54 of 55 templates built; `30th-c-020` (bottom half of
Darkrai & Cresselia LEGEND) has no stamp on our scan (`notBuilt`).
BREAK/LEGEND print sideways and are matched a quarter turn round too.

- **Verdicts are permanent and kept in the database** (TASK T2,
  2026-10-03): `listing_photo_verdicts`, keyed on sha256(item id) +
  sha256(photo URL) + `VERDICT_VERSION` (bump it when a template, the
  threshold or MATCH changes — older rows are then ignored). Each view
  reads the verdicts it lacks in ONE query before the gate (bounded 2.5 s;
  a miss is not re-asked for a minute); each definite verdict is written
  once; a retryable failure (CDN down, timeout) is never written, held 2
  minutes in memory. Memory stays the fast path (7 days). Until 2026-10-03
  a restart forgot every verdict.
- **One persistent worker pool** (`STAMP_WORKERS`, default 1), a queue, one
  job per item however many views ask. Measured on Render before this: one
  check 4.2-5.9 s there vs ~1.2 s here, and **8 parallel workers all ran
  past 20 s** — then the 20 s timeout was CACHED as "unreadable" (fixed:
  retryable, never a verdict).
- **The answer never waits, and never shows an unchecked row.** An
  unchecked row is HIDDEN (T2, 2026-10-03 — it used to be shown "Photo
  being checked" and then vanish), counted in `stampGate.pending` and the
  eBay summary, and the panel says "N listings shown, P still being
  checked"; rows APPEAR as verdicts land. The checks run after the
  response (`stampFollowUp`,
  display order — the cheapest rows first), the view is re-judged as
  verdicts land (`rebuildView` with `noFetch`: it can never spend), and the
  page re-reads with `?poll=1` while `stampGate.pending > 0`. `poll=1` is
  now cache-only: on a miss it says "not fetched", never searches.
- **Faster matcher** (`stampcheck.MATCH`): scales from 28 px not 14 (real
  stamps measure 36-88 px at s-l500; the small scales cost most and found
  only false scores), largest first, stop at the threshold. 689 vs 2,179
  ms a photo on the same loaded machine, same totals on 906 photos, and the
  card back (o81, 0.709 "found" before) no longer flags.
- **Measured, Lugia (82 real photos, local, costmeter):** cold open 954 ms
  with 82 pending; all 82 checked **41.7 s** later (~490 ms each, 1
  worker), 68 refused, 14 kept; re-open with verdicts cached **342 ms**, from
  the view cache **78 ms**. eBay: 2 searches + 1 token for the open,
  **0 for the stamp work** (82 CDN fetches, once each).
- **Measured on Render, 2026-10-02** (cold, after a deploy restart, 1
  worker): Base Set Venusaur 137 photos **166 s** to clear; Mew VMAX 177
  photos **219 s**; ~1.2-1.3 s a photo (`poolState().meanMs` 1,274 over
  399) — ~2.5x this machine, not 4x. **The top five rows were resolved by
  ~12 s on both**: ordering does its job, the headline settles long before
  the tail. Re-open with verdicts held **98-125 ms**. (A restart then
  forgot every verdict — fixed by T2, below.) Raise STAMP_WORKERS only if
  the instance has the cores.
- **Measured on Render after T2, 2026-10-03** (Aquapolis Lugia, Raw): the
  first open after the deploy, empty table — **0 eBay rows shown, 79
  hidden**, 3.8 s; polled every 15 s: shown 0 -> 10 -> 13 -> 14 (only ever
  rising), 65 refused, cleared in ~50 s; 79 verdicts written. **After the next deploy**:
  78 verdicts read from the table on the first open, 64 refused at once, 14
  shown, 2 new listings hidden then refused — no reprint shown; 299 ms re-open.

**The full re-run — done 2026-10-02**, all 906 s-l500 photos, shipped JS
vs the OpenCV measurement: same verdict on 879 (97%); labelled Aquapolis
**0 of 16 originals flagged**, 68 of 69 reprints found; reprint listings
288/304; the 22 flags inside the originals' own listings (3 Base Charizard,
19 Rayquaza-EX) **all show the stamp, checked by eye**. The JS port is a
little more lenient than OpenCV at the threshold (F156: JS found, OpenCV
missed — a reprint). Its first version removed one mean across all three
channels and called four original SCANS reprints — `stampcheck.test.js`
fires on that.

Open: the metal Charizards (a different product the gate keeps on CC002).

## EX-ERA PRICES — diagnosed 2026-10-02 (T2)

Every 2003-2007 English card (2,745; 2,418 comparable) against TCGdex's
TCGplayer figure the same day. **88 disagree by >1.4x.** Grouped:
- **53: a `normal` block on a holo-only card.** TCGdex returns one (same
  product id — a TCGplayer SKU a holo was listed under) and `normal` was
  first in BASE_PRINTINGS: Emerald Rayquaza $49.99 vs $431.32; Rocket's
  Raikou ex took a lone $2,300 ask (the ghost had no market). 92 headlines
  catalogue-wide, 83 of them this era. **Fixed `af2f2c0`**: a block is used
  only for a printing the card's own variants list. On the same blocks 81
  EX-era cards move normal->holofoil, none loses its price. **The nightly
  had not reached them** (2026-10-02: 93 ghost headlines, every one written
  before the fix; the refresh re-prices a card only when its tier is due —
  up to 30 days). Harvested by hand that evening (`tcgdexharvest.js en
  --set=` ex6 ex7 ex8 ex9 col1 np hgss2 swshp; 863 rows, 0 disagreements
  >40%): **93 -> 7**, and 5 of those 7 have an EMPTY printings list (np
  ×4, SWSH296), which the rule deliberately does not judge — the first
  count included them. Real remainder 2: Rayquaza ☆ (the July import, not
  this) and hgss2-26. Kingdra ex7-12 $5.00 -> $52.79.
- **32: POP Series / Nintendo promos with two genuine printings**, normal
  stored as the base — the convention, not a defect.
- **3: holofoil, moved within the day** (thin cards: Regice ☆ $1,250 ->
  $649.98).
- Every disagreeing row was ≤7 days old: **age is not the cause there.**
**Gold Stars (28) are not this.** 13 of 14 comparable agree with TCGdex to
the cent; the problem is the market itself. TCGdex has no TCGplayer price
for 14; for those the internal search finds Torchic ☆ and Latias ☆ at
"market" $4,500 / $1,650 **on 0 listings** (a stale last sale), and
Rayquaza ☆ / Mudkip ☆ with **no market at all** — so they keep a
2026-07-27 pokemontcg.io row (`tcgplayer_normal` $2,500.99,
`tcgplayer_holofoil_mid` $3,999.99) that nothing has re-priced. Roy's
$23,600 / $9,513 / $6,199.99 come from no source we hold; a sold-price
source (open, below) is the only fix. Since `0b0ddfb` internal-search rows
record the product, number, set, listing count and low; since `8fdfcef`
the page says a headline's age (12 cards of $20+ are >30 days old).
Gold Star rarity is "Rare" because TCGdex says "Rare" (TCGplayer: "Ultra
Rare"); it changes no match or estimate here — every Gold Star has a real
price, and the internal search refuses Rayquaza ☆ either way.
Torchic ☆ alternated $4,500 / $1,200 nightly from 9/16 to 10/01 under one
label; the rows carry no product, so the second value is unexplained.

## T2 · Listing finder — SHIPPED, with named gaps

`GET /api/listings/:cardId?grade=PSA+10` returns live listings sorted by landed
cost, gated, outlier-flagged, from every source that answers Render. Verified
live today on `ja-SV8a-002`: Yuyu-tei ¥80 base printing at $0.51 beside three
eBay rows at $1.19-1.23.

Response envelope:

```
cardId, requestedId, card, grade, count, liveCount, cheapest, cheapestLive,
outliers, gradePrice, listings[], refused[], refusedTotal, sources{}, tookMs,
cached, cachedAgeSec, freshness, attribution, fetchedAt
```

**`refused[]` (T4, 2026-10-04)**: every row a gate refused in this view —
`stage` (title / photo / back), `source`, `marketplace`, `title`, `price`,
`currency`, `url`, `reason` — photo refusals first, one row per item, an
item also in `listings` left out, capped at `REFUSED_MAX` (300) with
`refusedTotal` saying how many exist. A SEPARATE list: it never enters
`count`, `cheapest`, a median or a print run. The page draws it collapsed
at the end ("N listings we believe are wrong", `liveRefusedBlock`) — the
gate auditable from the page, not only from linkaudit.

Each listing row:

```
source, sourceLabel, title, price, currency, priceOriginal, currencyOriginal,
shipping, shippingKnown, landed, condition, seller, url, imageUrl, endsAt,
bids, listingType, live, country, attribution, priceKind, edition, variant,
parsedRarity, parsedYear, matchConfidence, saleType, currentBid
```

**Buy It Now and Auctions** (T5, 2026-10-04): `saleType` is `auction` only
where the number is a current bid (`priceKind: 'current-bid'`; a live Yahoo
auction too); an auction with a Buy It Now price is `buy-it-now`, its bid in
`currentBid`. The payload's `saleTypes {buyItNow, auction}` counts live
rows; `cheapest` is Buy It Now only (outlier.trustworthy). The page's bar is
"Buy It Now (n) · Auctions (n)" — one request, one gate, the split applied
before the condition/printing/edition filters; auctions ending soonest
first, never a cheapest.

Each source block reports `status, count, scanned, kept, rejected, gate,
summary, droppedSample, query`. **A set of listings carrying no rejection count
has not run the gate** — that is the tell, and it has caught a defect twice.

`?dryRun=1` builds the request, sends nothing and spends no quota.

#### On demand — US page 1, the rest when asked (T2, 2026-09-30)
`/api/listings` and `/api/search` both answer through `listingsFor` — one
payload builder, **every row returned** (it had sliced to 25 while
`count` said 58).

| action | request | eBay calls |
|---|---|---|
| open a card | default | **1** — `EBAY_US`, page 1, 200 rows. **2-3 on the 55 cards with a known reprint** (`REPRINT_OF`): the reprint check fetches each reprint's own listings, +1 per reprint — Base Set Charizard costs **3** (Celebrations + 30th), Blastoise 2. Measured, CALL COST |
| "Search 7 more marketplaces" | `?sites=all` | one per site not yet answered |
| "Load more listings" | `?more=1` | one page per searched site that has more |
| home-page tiles | `?cachedOnly=1` | **0** — cache or "open the card to check listings" |

Buttons extend the cached view (`VIEW_STATE`, 15 min) and re-judge every row
together (`rebuildView`). Nothing runs by itself afterwards — T1's
`continueListings` background crawl and the page's poller are deleted.
`progress` says what is NOT shown: `searched`, `notSearched`, `morePages`
(`notExamined` per site), and `actions` carrying each button's label and
call cost — "128 listings from eBay US. 7 more marketplaces not searched
(GB, AU, CA, DE, FR, IT, ES). 99 more results on eBay not yet examined".
A refused site (busy, quota, 409) stays in `notSearched` and the next press
asks it again; a busy/error answer is not cached, server or page
(`retryable`). eBay's own ceiling (offset+limit ≤ 10,000) is STATED as
incomplete. Also `?edition=` (T3).

**Nothing expands by itself — not even when US finds nothing** (2026-10-01;
`noautoexpand.test.js`). Then the empty panel says only eBay US was asked,
names the seven sites not asked, and carries the Search button
(`onlyUsNote`). It never says "No listing matched" until every site has been
searched.

- **Shipping is never a filter.** Rows carry `shippingTo` (whose buyer the
  site quotes) and `shippingKnown`; every non-USD row goes through `fx.js`
  with `priceOriginal`/`currencyOriginal`/`fx` on the row.
- **One item, one row.** De-duplicated by item id; the copy from the site
  EARLIER in `EBAY_SITES` wins whatever page lands first (IT re-returns US
  listings under machine-translated titles).
- **A refusal on an English-titled site (US/GB/AU/CA) is sticky
  everywhere**; a refusal on a translated site (`originalTitles: false`)
  drops only its own copy — see the lesson below.
- **Calls per view are recorded**: `listing_views` (counts only, no eBay
  item data) with `action` (open / all-sites / more; `open+auto` rows are
  from before 2026-10-01) and
  `origin` (render / local), summarised at `GET /api/listings-log`
  (render only by default; `byAction`, `callsPerCardOpened`). Marked, not
  deleted: 34 local test views `origin=local`, 538 T1-era views
  `action=t1-every-site`, 40 threshold-measurement views `measure:*` —
  reported under byAction, never averaged into browsing.
- `node sitecheck.js [--grade=all] [--pages=N]` presses every button (all
  sites, then Load more until nothing is owed) and reports rows per site
  plus an INDEPENDENT language reader's suspects. Expensive by design —
  run it after any change to `EBAY_SITES` or the gate's vocabulary.

#### The registry

`LISTING_SOURCES` in `server.js` — every source is one function returning the
same normalised shape, through `cardmatch` and `outlier.js`, reporting
kept/rejected/scanned:

| id | applies to | note |
|---|---|---|
| `yahoo` | `ja-` cards | Japanese-language marketplace. **403 from Render** — local only |
| `yuyutei` | `ja-` cards | shop ASKING prices, `priceKind: 'shop-ask'` |
| `ebay` | anything with an English name | the only English source |

`UNAVAILABLE` holds mercari / cardmarket / facebook / localshops with a stated
reason each, so the response always explains every marketplace the UI offers
rather than silently returning a short list.

#### What remains

1. **`node ingest.js names ja`** — 64% of Japanese cards cannot be asked about
   on eBay. Biggest single win, no credentials, no new code.
2. **PriceCharting** — already JSON, no parser to write, and it carries graded
   price history, which is the weakest data we hold.
3. **Troll and Toad / Card Kingdom** — English singles, a second and third
   source beside eBay for a catalogue that currently has one. Each is an HTML
   parser and each deserves its own verification pass.
4. **Auctions from Render.** No API covers them: Yahoo Auctions 403s Render and
   its Web API was withdrawn in January 2020. If auction listings are wanted in
   production, the design is fetch locally → store in Supabase → serve from
   Render, showing the fetch age so a stored listing is never presented as live.

#### eBay — live, guarded, and its data is never stored

The free tier is 5,000 calls/day, no approval, and it is **in production now**.
`GET|POST /ebay/deletion` plus `GET /ebay/status?probe=1` for real readiness.
Credentials are `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_VERIFICATION_TOKEN`
on Render. Every call routes through `ebaycall.js` → `ebayquota.js`; see the
quota lesson for the four properties that are not obvious.

## Sold data — NO SOURCE, and the page says so
Since T8 (2026-09-29) nothing supplies realised sale prices: the eBay
sold-page scrape is gone and must not return in any form, server or ingest.
Legitimate routes, none built. **Read 2026-10-02 (T4)** — what each would
give, what it costs, and what we could NOT read:
- **eBay Marketplace Insights API** (`item_sales/search`). Its own docs are
  now private: `developer.ebay.com/api-docs/buy/marketplace-insights/…`
  redirects to sign-in at `/api-docs/marketplace-insights-private/…`
  (read in a browser 2026-10-02; nothing entered). Third-party summaries,
  not verified: sold items, last **90 days**, by keyword/GTIN/epid/
  category; "Limited Release", approval by eBay business units, and
  "restricted and not open to new users at this time"; developers in
  eBay's forum report refusals outside major partners. **Cost: free if
  granted; the cost is the application.** Next step is Roy's: sign in to
  the developer account Render's keys belong to and read the private page
  and the application route. Even granted, 90 days does not reach a Gold
  Star that last sold a year ago.
- **PSA Auction Prices Realized.** PSA's own API documentation (read
  2026-10-02): "We currently offer access to data from Cert Verification
  for single item searches by cert number." **APR is not in the API** —
  only on psacard.com/auctionprices, where reading it by machine is
  scraping. The submission T&C (§23, linked from the APR page) make PSA
  "the exclusive owner of all Submission Content" (the grading Data and
  images) with the right to publish it; the site terms with the "compiled
  form" clause Roy cites were not found from PSA's own links (psacard.com/
  terms 404s) — not read, so not quoted. **Display would need PSA's
  written permission**; enrollment does not obviously grant it. Ask PSA
  directly, in writing, before any build.
- **PriceCharting.** Its pages (api-documentation, pricecharting-pro)
  answer a Cloudflare challenge to us now, curl AND a real browser (not
  attempted further — no bot-check bypass). Secondary sources only: API
  is in the **"Legendary" subscription, ~$49/month**; public-facing use
  needs that plus **express written permission**; and the API returns
  **current values by condition/grade, not historic sales** — which, if
  true, contradicts "carries graded sale history" written here before. Roy
  should read the two pages in his own browser before paying.
Whatever it is: one function, a stated source on every row, and the Last
sold box stays "no licensed sold source" until it exists.

## LESSONS — the rule, why, and where the full story is

(The archive calls this section "HARD-WON LESSONS".)

Every lesson this project has paid for is here as a rule. The incident's
measurements, tables and dates live in `CLAUDE_ARCHIVE.md` under the heading
quoted after *Archive:* — read it when the rule alone does not settle a case.
A bug's history may be archived; **its lesson may not.** If you fix something
and learn a rule, the rule goes here; the narrative goes in PROGRESS.md.

#### 1 · Gates and filters

**A filter that rejects records needs a test proving what it KEEPS.** The most
repeated failure in the project: `looksLikeJunk` ate ~80 valid prices per set
(twenty commons at $0.15 is normal); `clean --delete` would have removed 46% of
real prices; `NOT_A_SINGLE_CARD` ate Giratina ("tin") and all of Destined
Rivals; bare `tag`/`ace` made every TAG TEAM and ACE SPEC card unsearchable
raw; a probe classifier called a working source blocked. A gate tested only on
refusals passes by refusing everything. Expect it again.
*Archive:* "A guard against bad data can destroy good data", "Test what a gate ALLOWS, not only what it blocks", "A pattern rewritten for readability lost its boundaries", "Two lists of grading companies, and one of them was never updated"

**Measure a filter change in both directions, against the OLD pattern read
from `git show`, never retyped.** A hand-typed copy of the old pattern was
wrong. Rebuilt from git: junk 30/30 still blocked, real names 15 -> 0 wrongly
blocked. Word lists carry no boundaries; `boundedTerm()` applies them once.
*Archive:* "A pattern rewritten for readability lost its boundaries"

**A gate that is right and never reached is not a gate. A fix is not installed
until every path that needs it HAS it — and a shared table must be reached by
every path that needs it.** The year gate read `card.set_release`, which the
one SELECT behind both listing routes never selected: dead for weeks, every
test green. The language gate ran on eBay, not on Yahoo, where Korean prints
actually appear. `REPRINT_OF` served listings for days and was never used by
pricing, so Classic Collection Charizard sat at $0.71 (live $205). The base-
printing rule was in server.js and missing from `trending.js` and alerts. When
you add a rule, list every path that produces a listing or a stored price
(THE GATES table) and check each one gets the inputs it needs.
*Archive:* "A fix is not installed until every path that needs it HAS it", "Reprints were priced by catalogue number (2026-09-29, TASK T6)", "The base-price rule lives outside server.js too (T2, 2026-09-30)"

**A guard that has never fired is indistinguishable from one that cannot.
Make it fire before believing it — and "nothing happened" is not proof.** The
quota trip, run without credentials, reported `unconfigured`: the credential
check short-circuited before the gate. The source-rank gate "displaced 0" on a
set where it had nothing to displace; only a direct test showed it refusing
$19.11 against a correct $0.19. Revert the fix and watch the test fail.
*Archive:* "A guard that has never fired is indistinguishable from one that cannot"; dropped in an earlier rewrite, restored from `CLAUDE.md.bak-20260901`: "Nothing happened" is not proof a guard works

**A gate that skips must say what it skipped.** Rejecting on absent data is
the `looksLikeJunk` mistake, so discriminators skip when a field is missing —
but invisibly is how the year gate died. `verify()` returns `evidence` and
`unchecked`; a missing language raises `gateWarning`.
*Archive:* "A gate that skips says nothing; now it says what it skipped"

**A guard that over-blocks fails invisibly — make an empty result report.**
The 9/29 set-name check stopped six sets for two days and the run said
"N refreshed, M without data". Now `setyield.js` names a set that priced
nothing (exit 2), and a 200-card run of nothing; on its first real run it
named dpp and basep, whose cause was not the alias but our set name in the
QUERY ranking the card out of TCGplayer's results (fixed: ask again in
TCGplayer's own name, on a miss only). Every silent `continue` in a fetch
is an over-block nobody can see: count what the source answered.
*Archive:* none — 2026-10-02, PROGRESS.md

**A row that is not the headline must not move the headline's clock.** The
refresh judged "due" on the newest row of any kind, so a Cardmarket second
reading written for a card that got NO price made it look freshly priced
(mep 7/7). Read the headline row (`basePrintingSql`, ungraded) wherever
freshness is judged. And a value dropped on the way out is a value frozen:
TCGdex's 1st Edition price came in every refresh response and was
discarded, so every 1st Edition price was what a harvest once left.
*Archive:* none — 2026-10-02, PROGRESS.md

**A set of listings carrying no rejection count has not run the gate.** Every
source reports `kept`, `rejected`, `scanned`, `dropped[]`, `gate`. Count what
the gate EXAMINED ("1 kept of 482 scanned" read as a 99.8% rejection that
never happened). A view that drops `droppedSample` makes "B: all rejected"
undiagnosable (fixed 2026-10-01).
*Archive:* "Count what the gate examined, not what the page held", "linkaudit.js"

**Read the structured field the marketplace already gives.** eBay said
`condition: Graded` on a raw-search slab no title word could catch (`PCG` is
also "Pokémon Card Game"). One direction only: "graded" refuses a raw search;
"ungraded" never refuses a slab title. eBay's Card Condition, Grader and Grade
aspects are filters at no extra cost; seller-entered, so a title that
DISAGREES with them is refused. Never send `{Not Specified}` — eBay ignores it
and returns everything; aspect names are per site (an English name on DE is
silently ignored); eBay ES has no condition or grade aspect at all, so no ES
row may claim eBay stated a condition. eBay has no Mint and no Damaged —
those are seller-stated, from the title.
*Archive:* "The marketplace had already said it, and the gate never read it", "eBay DOES state raw condition — in a field we never read (2026-09-27)", "Slabs: measured 2026-09-27, NOT yet used", "Slabs: BUILT 2026-09-27 — filter narrows, disagreement is refused"

**Words that are also card names, mechanics or set names need protecting
before they are read as evidence.** "120 HP" is hit points (8 of 9 "HP"
titles); "ex" is the mechanic (24 of 25); TAG TEAM / ACE SPEC need a grade
number beside TAG/ACE; "Alt Art Card" is not a fan "art card"; "Master Ball"
is a card name as well as a mirror pattern (remove the card's own name first,
and a kana fold must recompose with NFC); "Classic Collection" is a set, not a
bundle; "gold card" refused genuine gold rares — the outlier check, not a
word, settles fakes. Strip replaced text to `~`, not a space, or `\d+\s*cards?`
spans the gap.
**A word that is genuine in one era can be evidence in another.** "Gold" is
not a term — but no card was gold before the first Gold Star (2004), so on a
set from before 2004 it names the object: `goldBeforeGold` reads the set
year (2026-10-04; 50 of 116 Shining Charizard replicas, 0 of 890 right
titles; "Gold & Silver", HeartGold, "gold stamp" kept). A test that KEPT
"Base Set Gold Holo Rare Englisch" was keeping a gold metal replica — looked
at, not assumed.
*Archive:* "The original measurement, still true of the coarse field", "`art` is in the name of every expensive card", "Rarity is the card's; printing is the copy's (T10, 2026-09-29)", "\"PSA10\" unspaced — read for unambiguous graders only (`7c3f856`)"

**A word list must never read the card's own identity.** "light" (the
lamp) refused every listing of Forbidden Light — 168 cards that had never
shown one — and the lot list refused 236 of 21,152 English cards on their
own name or set (Gym Badge, Tool Box, Iron Bundle, Poké Card Creator Pack…).
SET_NAME_PHRASES protected six sets by hand; the card being asked about is
now masked every time (`maskOwnIdentity`). Test a vocabulary change by
running every catalogue card's own "name number/total set" through it
(`ownname.test.js --db`), not only by the titles at hand.
*Archive:* none — 2026-10-04, PROGRESS.md

**A filter measured at "0 wrong" may only have been measured one way.** The
lot words' "0 of 896" counted right titles refused; a 100-card "Partial
Set" passed because nobody counted the misses. Say which direction a
number is.
*Archive:* none — 2026-10-04, PROGRESS.md

**A hoped-for grade is not a grade.** "(PSA 10 Contender)" on an $8,000 raw
card; `stripSpeculative()` runs on raw searches too. A seller's filled grade
aspects plus a speculative title kept a $6,100 raw card as a PSA 10 until
speculation counted as disagreement — found only on the live run after
deploying. **Measure after deploying, not only before.**
*Archive:* "A hoped-for grade is not a grade", "Slabs: BUILT 2026-09-27 — filter narrows, disagreement is refused"

**Every mode of a gate must still check the card.** Grader-wide "PSA *"
returned ok on the grade before name/number/set ran.
*Archive:* "Grader-wide mode never checked the card (fixed `9f07cf7`)"

**A different language is a different card; a stated year ±1 off is a
different printing** — on stated evidence only. CJK is ambiguous on a Japanese
path (`cjkIsChinese:false`), and `\b` does not exist between CJK characters.
*Archive:* "A different language is a different card", "A fix is not installed until every path that needs it HAS it"

**When the title carries nothing to match, the price is evidence — flag, never
remove.** Giratina V #186: $2.08 to $1,114.99 behind identical titles.
`outlier.js` flags an order of magnitude below the card's own median (≥5
priced, ≥$15 median); headlines skip flagged rows. A price band is evidence
only where the card prices apart from its reprint — check the stored price
before calling a flag wrong.
*Archive:* "The price is evidence about the title when the title carries none", "A price band is evidence only where the card prices apart (2026-09-27)"

**A median computed from mostly-fake listings is not a baseline.** Shining
Charizard Raw NM, all sites, 2026-10-04: ~116 of 144 rows past the gate were
gold/black metal replicas (labelled by eye); their median, $420.97, let a
$72.49 replica through at 0.17x while every genuine copy asked $944+ and the
stored price was $1,700.99. The check now judges against the stored,
number-matched raw price when it is current (pricequality: no flag) and
ABOVE the feed's median — never to lower the bar; graded views keep the feed.
On the 1,010 labelled rows: 0/864 right flagged before and after; different
illustrations 10 -> 15 of 24, metal 5 -> 8 of 38. Shining Charizard: 27 -> 53
of 116 replicas, 0 of 26 genuine. It still leaves replicas priced at genuine
levels ($177-$1,600) — those are the title and photo checks' job.
*Archive:* none — 2026-10-04, PROGRESS.md

**Japanese listings are full of lots.** まとめ/セット/一括/引退/BOX/未開封/
PSA/BGS/鑑定 and any 枚/点 quantity: `jpTitleIsSingleRaw()` is the one
definition, used by Yahoo and Yuyu-tei.
*Archive:* "Japanese listings are full of lots"

#### 2 · What identifies a card

**Build the authoritative card list first; match on collector number; refuse
to guess.** Positional rarity was wrong for over half a set. Name-only
TCGplayer matching swapped #109 and #130. Number, then rarity tiebreak, then
NOTHING — a wrong price is worse than none. Inference is for absent data
only (`mockP` re-inferred a stored rarity and priced a $1 Common at $46).
*Archive:* "Build the authoritative card list first", "Match on collector number, and refuse to guess", "Don't let inference override known data"

**A collector number does not identify one card.** Master-ball mirrors share
the number (142 cards up to 119x wrong, found only by cross-checking two
sources). Reprints reuse the original numbering AND set name (Celebrations
Charizard is genuinely 4/102 "Base Set": 465x range in one search). Reprints
are keyed by SET ID (`REPRINT_FAMILIES`, `REPRINT_OF`), never by set name: a
new set whose name contains another set's marker word ("30th Celebration"
matching `/celebrat/`) silently disabled the gate both ways. A new reprint set
needs a family entry and, if it reuses numbering, a `REPRINT_OF` table.
*Archive:* "The master-ball mirror, found for the third time", "A reprint reuses the original numbering", "Ingesting a set can disable a gate that names it", "Superseded 2026-09-26: reprints are keyed by SET ID, both directions", "A collector number does not identify one card"

**A lettered number is its own card.** normNum folds "24a" to "24" and
"24a/119" was not read as a pair, so the alt-art M Manectric-EX took the
regular card's listings and the reverse (31 English cards, Aquapolis 50a/
50b among them). A fold that helps matching must not cross into another
card's identity — the fold-merge lesson in the gate (`verifyLetterNumber`).
*Archive:* none — 2026-10-04, PROGRESS.md

**A set ingested once is never re-read — compare card by card.** setgap
asked which SETS were missing; the progress file marked each set done after
its first pass; TCGdex later added cards. 104 English and 440 Japanese
cards (the secret-rare tails — the valuable ones) were missing for weeks.
`cardgap` compares per card, insert-only. And a number form that differs
between two sources fails silently per card: manifest asked TCGdex for
"S8-1" (TCGdex: "001") and 37 Limitless-ingested Japanese sets, 3,432 cards,
never got its rarity. Ask a source by ITS id, read off its own listing.
*Archive:* none — 2026-10-04, PROGRESS.md

**`set_total` is our catalogue's count, not what the card prints.** Promos
print no total (swshp's 307 is a count — "SWSH202/307" returned nothing);
Trainer Gallery prints TG16/TG30; a prefixed card in a mixed set (Generations
RC5) prints a subset total we do not hold. `PROMO_SETS`, `SUBSET_SETS`.
*Archive:* "A promo prints no total; a subset's total carries its prefix (2026-10-01)"

**Rarity is the card's; printing is the copy's; edition is a third axis.**
Normal/holo/reverse/mirrors per copy (`cards.variants`); 1st Edition /
Shadowless / Unlimited only on the ten sets TCGdex reports `firstEd` for. Every
headline reader uses `printsql.basePrintingSql` (base printing, Unlimited) —
241 cards once showed a reverse price as the card's price.
*Archive:* "Rarity is the card's; printing is the copy's (T10, 2026-09-29)", "Edition is its own axis — and TCGdex names it differently on WOTC sets (T3)", "1st Edition is a market where it existed, and nowhere else"

**A price for a printing the card does not have is not the card's price.**
TCGdex returns a `normal` block on holo-only cards (one product id, a SKU a
holo was listed under) and `normal` was read first: Emerald Rayquaza at
$49.99 against $431.32, a lone $2,300 ask on Rocket's Raikou ex. 53 of the
88 EX-era disagreements, 92 headlines in all. Read the card's own printing
list before its price list; an unknown list skips nothing.
*Archive:* none — 2026-10-02, PROGRESS.md ("EX-ERA PRICES" above)

**A thin market's "market price" is a stale sale, not a valuation.**
TCGplayer quotes Torchic ☆ at $4,500 on 0 listings and Rayquaza ☆ at
nothing; Roy's sold figures were 2-9x higher. Record the listing count
beside the price, and do not expect a better match to fix a market that
is not there.
*Archive:* none — 2026-10-02, PROGRESS.md

**A source's "no value" is not a value.** TCGdex rarity "None" mapped to
Common overwrote real rarities; 0 and null in TCGdex pricing both mean no data.
*Archive:* "\"None\" is not \"Common\" — manifest's rarity map (2026-09-28, TASK T5)", "TCGdex embeds pricing, and the docs are wrong about its shape"

**A price can be right for the number and wrong for the SET.** TCGplayer's
search accepted the number in any set: Expedition Alakazam took Base Set's
price. A hit counts only in TCGplayer's own name for our set
(`tcgsetname.js`); a product id given to two cards is trusted for neither.
*Archive:* "The stored price was right 90% of the time — and wrong by SET, not by H-number (T1, 2026-09-29)"

**Establish that data CAN exist before chasing it.** 2,100 cards at 0% were
TCG Pocket (digital). Vintage changes the floor (set-age multipliers);
a vintage Common can be ¥24,800 — read the source's own rarity label.
Hidden is an answer: a set filtered out of one query fell through to a live
fallback and came back as estimates, so hidden returns `hidden: {reason}`.
*Archive:* "Not every gap is a bug", "Vintage changes the floor", "Vintage Commons can be genuinely valuable", "Hidden is an answer, not an absence (2026-09-27)"

**A reprint is told apart by what is ON the card, not what sellers type.**
Set, Year and epid are seller-entered (REPRINT vs ORIGINAL). The
commemorative stamp is printed on every 30th / Celebrations reprint: a
per-card template cut from our own scan finds it in 92.5% of photos with
no false flags at 0.70. One template for every card does not work, and a
port of a measured algorithm is not the algorithm until it is cross-checked
against it on the same inputs (one channel mean vs three: 4 originals
flagged). Absence of the stamp is weak evidence and is never shown as a pass.
*Archive:* none — 2026-10-02, PROGRESS.md

**Every grading scale is read from the company, not assumed.** PSA has no
9.5; TAG no 9.5; ACE whole grades only; AGS "Legendary" only beside a 10.
*Archive:* "Every grading company's scale, read from the company (2026-09-27)"

#### 3 · Sources

**Probe before building; read the primary source, never a summary.** Four
APIs were asserted from documentation and wrong. eBay's barrier was assumed
and false (5,000/day, no approval); TCGplayer's application is assumed and
absent ("no longer granting new API access"). PokéAPI's language codes are
lowercase. TCGdex's pricing keys differ from its docs (`reverse-holofoil`,
present-but-null providers).
*Archive:* "Read the terms before writing a source off", "The TCGplayer API has no application to put in", "TCGdex embeds pricing, and the docs are wrong about its shape"; restored from `CLAUDE.md.bak-20260820`: "Never assume external API shapes — probe them"

**Don't guess URLs — read them; verify the tool before trusting its output.**
Four rounds of constructed image URLs returned 0% while working URLs sat
unexamined. A HEAD-only probe reported every image missing. The set-list
endpoint served guessed logo URLs (404) while the card endpoint said null —
two paths disagreeing about one fact.
*Archive:* "Don't guess URLs — read them", "…and the set-list endpoint is still doing it, measured 2026-09-22"; restored from `CLAUDE.md.bak-20260820`: "Verify the tool before trusting its output"

**Scraping is not a production strategy, but "datacentre IP" is a per-source
fact.** Yahoo Auctions 403s Render, Yuyu-tei serves it byte-identically. One
module (`sourceprobe.js`) run from both ends tells IP from code. A probe must
check for the expected markers BEFORE diagnosing — `/cloudflare/` in a CDN
stylesheet link nearly killed Yuyu-tei. Never build bypasses for sources that
refuse automation; deep-link them. No probe endpoint ever takes a URL (SSRF).
Yahoo Auctions also rejects a category filter from a foreign IP — never add
`auccat`; parse `__NEXT_DATA__`.
*Archive:* "Scraping is not a production strategy", "…but \"datacentre IP\" is a per-source fact, not a law", "The probe's first run was wrong, and catching that is why it exists"; restored from `CLAUDE.md.bak-20260803`: "Yahoo Auctions rejects category filters from foreign IPs"

**Before stopping a source, ask where its cards go.** Where a sanctioned
route exists, take it: eBay's sold-page scrape was deleted because we hold
Browse API credentials under eBay's terms. Where none exists, stopping moves
the cards to NO source: TCGplayer grants no API access to anyone, and its
internal search is the only TCGplayer price for 2,025 cards TCGdex cannot
price — so it is kept as a labelled last resort, run from the home machine,
never from Render (OPEN WORK). Measure the dependants first: "the reason to
keep it has gone" was true of 90% of cards and false of the other 10%.
A tightened check can also stop a source silently — the 9/29 set check left
six promo/energy sets unrefreshed until probed and aliased.
*Archive:* "The TCGplayer API has no application to put in", "Read the terms before writing a source off"

**A status code means what the service says, not what it meant elsewhere.**
Yahoo Shopping's 403 with a key is the KEY refused (keyless gets 401 from
both IPs); a geo notice is checked before the credential branch. Length is
not identity — compare a 12-hex sha256 fingerprint, never the secret.
*Archive:* "Yahoo Shopping: what the 403 is NOT", "Length is not identity", "A 403 from an API you hold a key for is not the Yahoo Auctions 403"

**Sources are not interchangeable — rank them.** A Yahoo median cannot
separate printings that share a number; a Yuyu-tei price is a shop ASK
(`priceKind: 'shop-ask'`, ticks at ¥30/¥50/¥80 are the shelf minimum, not a
valuation); Cardmarket is EU retail (~1.6x). `sourcerank.js` gates every
writing path: lower confidence never becomes the displayed price; an unknown
source is MEDIUM. A refused price is not stored, because storing IS displaying.
*Archive:* "Yuyu-tei quotes shop ticks, not valuations", "Two paths to one marketplace agreed, and that is the validation"; restored from `CLAUDE.md.bak-20260901`: "Sources are not interchangeable — rank them"

**Never substitute across languages; a localised name is not localised data.**
TCGdex serves the Japanese card's Cardmarket listing on zh-tw with a
translated name; `pricingAllowedFor()` is en/ja only. Cross-language matching
is for finding equivalents, never for display. A marketplace is where a card
is sold, not what language it is: every non-English eBay site needed its own
vocabulary (language words, reprint names, junk, slabs) and its own aspect
NAMES — an English aspect name is silently ignored. A translated title's
refusal must not cross sites. Measure a new site by TOTAL rows, not rows
labelled with its name.
*Archive:* "Never substitute across languages", "A localised name does not mean localised data", "A marketplace is where a card is sold; a language is what it is (T1, 2026-09-30)", "Another eBay site shows US listings with MACHINE-TRANSLATED titles (2026-09-30)"

**The size of an apparent win is a reason to check it harder.** "TCGdex
prices 56% of unpriced Chinese cards" was the Japanese price in disguise.
*Archive:* "A localised name does not mean localised data"

**Ask a question the marketplace can answer.** eBay matches tokens: "H09"
does not find "H9/H32", "1/15" does not find "001/015", and one word no
seller writes ("McDonald's *Collection* 2014") empties the result —
linkaudit `A` on all three (2026-10-02). When sellers write a number two
ways, leave it out and let the gate check it. A CJK set name in an eBay US
query returns zero; English sellers write the set NAME, never its code
(apostrophes deleted, not spaced); a deep link has no gate, so every link goes
through `cardmatch.buildQuery` and sits under UNFILTERED SEARCHES.
*Archive:* "Ask a question the marketplace can answer", "English listings name the set; they never state its code", "A deep link is not a result, and must not be dressed as one"; restored from `CLAUDE.md.bak-20260803`: "English marketplaces can't match Japanese names"

**Measure the question across the catalogue, not the instance.** Four
query mismatches were found one at a time by accident; asking every set
once (`querygap.js`, ~200 calls) found the rest in an evening — including
a gate failure no query fix would ever have reached (Forbidden Light). One
character can empty a search: eBay answers nothing for any query carrying
"δ" (191 cards), while ☆, ◇, ♂/♀ and [G] are ignored. Measure each symbol
before and after on the same cards.
*Archive:* none — 2026-10-04, PROGRESS.md

**A status code that answers before authentication says nothing about
the key.** PSA's 429 came back identical for our key, no key and a
corrupted key, with one reset time from two networks. "429 = the key's pool
is spent" was the test's premise; send a wrong key beside the right one
before reading a refusal as being about you.
*Archive:* none — 2026-10-04, PROGRESS.md

**Ask in the form most titles copy — for a slab, that is PSA's label.**
"2002 POKEMON EXPEDITION #28 TYPHLOSION-HOLO PSA 1" prints no set total and
its own set name, so a query asking "28/165 Expedition Base Set" never saw
it, and the gate refused it when it did. Roy's PSA 1 and 9 of Umbreon #32's
~14 PSA listings were that shape. A slab asks the bare number; the label's
set names are read by set id (`SET_WRITTEN_AS`). Measure a query change in
both conditions: the same bare number that quadrupled slab results kept 0
of 225 on a raw search.
*Archive:* none — 2026-10-04, PROGRESS.md

**A search returns only what it was asked for, and a default is a
filter.** eBay Browse returns Buy It Now only unless `buyingOptions` names
auctions: 0 auctions in 258 rows over four cards, for as long as the
listing finder has existed, while eBay's own site listed them. Compare a
card's rows against the marketplace's own page and read every row it shows
that you do not — "the gate never ran" and "the query never asked" look
the same from inside.
*Archive:* none — 2026-10-04, PROGRESS.md

**A read endpoint must never write.** `/api/market` persisted a name-matched
aggregate on every view and overwrote Mega Gengar's $1,056 with $3.14. eBay
data is cached 15 minutes and never stored (terms); aggregates may be.
*Archive:* "A read endpoint must never write", "eBay listings are cached, never stored"

**Before inventing a source, check what the current query already
computes** (the set list was selecting a sample image and discarding it).
And before adding a third source, check why the second was never asked —
setmeta's pokemontcg.io fallback covered 3 sets while 49 had no art. Filled
2026-10-01 by `ccfill.js` pass 2 (explicit `ART_SETS` map read off
pokemontcg.io's /v2/sets): 508 cards' art, 25 sets' logos
(`set_logo_source`), every URL fetched before writing — which refused four
McDonald's sets whose listed image URLs answer 404. Still artless: McDonald's
2023/2024, mep, mfb, xya, ex5.5, miscp, the BW/DP/HS/SM/XY trainer kits
(no pokemontcg.io set), and sm7.5 #60/60a-style ambiguous numbers.
*Archive:* "The data was already there, fetched and discarded", "TCGdex has no art and no logo for 49 English sets (T3, 2026-10-01)"

**A ratio is meaningless at the price floor; a constant that is never printed
drifts.** Disagreements need ≥$0.25 as well as a large ratio. `* 1.09` EUR
understated Cardmarket 6.6% for months; `fx.js` returns the rate with every
amount. (Still open: `jpfilter.js` uses a hardcoded 157 JPY.)
*Archive:* "A ratio is meaningless at the price floor", "The FX rate was hardcoded at two vintages and never printed"

**Measured facts about sources, kept for reference:** cert numbers are only
in getItem (~79% of slabs), PSA alone has an API (100/day keyless); eBay Set
is a free filter aspect, Year is filled 34-48% (not a gate); TCGdex's asset
host is throughput-bound (~2 images/s); trending has no view data.
**eBay's catalogue product id (epid) is seller-chosen** (2026-10-01,
`setprobe?epidSearch=`): Aquapolis Lugia (6043385009) and 30th Celebration
Lugia (9100724204, 19100822444) DO get different ids, but searching by the
Aquapolis epid returns 30th CC listings first, ~12% of 30th listings carrying
an epid carry the Aquapolis one, and 26-32% carry none. Errors run reprint ->
original (the dangerous way); none seen the other way. A signal like Set,
not a gate; the only safe one-way use is "a REPRINT product's epid on an
original's search". Not built.
**Image weights** (2026-10-01): Japanese grid thumbnails now Limitless's own
`_SM` (274x381, mean 58 KB; was the 736x1024 330 KB full art) — 8,359 of
8,360, each fetched first, `image_large` unchanged; the card page paints the
thumbnail then swaps in the full art when loaded (`showCardArt`). Chinese
art (asia.pokemon-card.com) is already 299x418 — a heavy 257 KB PNG with no
smaller file; the site's own pages use the same one. Only re-encoding on our
host would shrink it.
*Archive:* "Cert verification — measured 2026-09-28, NOT built", "eBay's Set and Year: where they live (T4, 2026-10-01, `/api/ebay/setprobe`)", "Images: TCGdex's asset host is throughput-bound (T1, 2026-10-01)", "Trending, measured 2026-09-24 — `/api/trending`, rules in `trending.js`", "Narrowing vs the 75-row cap — measured 2026-09-27 (`/api/ebay/gradecost`)", "The cap is paged now (`ceadfbc`, 2026-09-28)", "Raw M and DMG: back, seller-stated (`08a05d0`, `d60dc0e`, `b96f1e3`)", "Known, deliberately not built"

#### 4 · The page

**One definition per thing.** Two implementations always drift: estimators 9x
apart (`estimator.js` is the one), two token caches, three copies of "what
language is this card", `SLAB_WORDS` hand-copied from `GRADERS` (now derived),
`renderSets()` declared twice 162KB apart — editing the first changed nothing.
Documentation is not implementation: CLAUDE.md described an age multiplier
that existed only in the page. `preserve.test.js` fails on any duplicate
top-level function.
*Archive:* "Two definitions of one function, 162KB apart", "Documentation is not implementation", "Read credentials at call time", "Two lists of grading companies, and one of them was never updated"

**One element, one writer, one meaning — asserted structurally.** `#cd-listings`
had an ungated second writer three times; a comment saying "one writer" did
not stop it, a call-graph assertion did. Delete a dead path to a gated element
(`renderRealListings`) rather than allow-list it; delete a dormant branch
rather than zero its threshold (the auto-expansion, 2026-10-01). `sd-count`
had two writers answering different questions ("295 of 217 cards").
*Archive:* "The listings panel has had two writers TWICE", "The listings panel had two writers, one ungated", "Assert the STRUCTURE, not the intention", "One element, one MEANING"

**A fallback must announce itself.** `CARD_CACHE` pinned an estimate over a
real price; a missing source note fell off a chain into a bare `return`; the
card page showed a name-matched aggregate badged "high confidence" for a $959
card ($3.17). A number-matched price always wins, and anything else says so.
Two lists of the same thing (176 pokemontcg.io set ids vs 214 ours) worked on
every set anyone checked.
*Archive:* "Two lists of the same thing, and only one of them resolves", "The silent substitutions that hid it", "And the one found while verifying the fix", "What would have caught it"; restored from `CLAUDE.md.bak-20260803`: "Set ids differ between sources"

**No number on screen that a source did not produce.** `price × 0.74` as
lowest listing, `Math.random()` last-sold, invented shops, holdings, graphs,
badges from a hash of the id. `grep Math.random` and `price\s*\*` first;
`nofabricated.test.js` pins it. A number that changes on reload is the
cheapest test there is. A UI that writes only to itself loses quietly later:
claim nothing before the server accepts it.
*Archive:* "The page was still inventing numbers where nobody looked — found 2026-09-24", "Invented data, the fourth sweep (2026-09-28, TASK T7)", "A UI that writes only to itself"

**A price says when it was measured.** The card page never showed a
headline's date, so a July import nothing could re-price read as today's
($2,500.99 Rayquaza ☆). Every displayed price carries its date; past 30
days it says it is old (`priceAgeHtml`). An old price is a fallback, and a
fallback announces itself.
*Archive:* none — 2026-10-02, PROGRESS.md

**…on every screen, not the one that was fixed.** The card page said a
price's age; the set tile, trending and alert tiles drew the same $4,500
bare, and 130 cards over $100 were old or swinging. Quality is decided
once (`pricequality.js`), attached to every payload that carries a
headline, and drawn by one function — a tile that draws its own `est` is
the second definition. While there: the Search screen's trending tiles
still drew a % change and PSA badge from a hash of the card id; check
every renderer of a number, not the ones already audited.
*Archive:* none — 2026-10-02, PROGRESS.md

**Cache keys carry everything the value depends on.** A per-card cache served
the PSA 10 median as Raw NM: 493x out, nothing on screen to suggest it.
*Archive:* "A number cached per card is wrong when it depends on the grade"

**Browser-only bug classes — arrangement, timing, collisions.** An async
module captured at parse time is null half the time (read at call time); a
promise that resolves immediately is a loop that froze the renderer; dead CSS
with a colliding name capped a panel at 460px (delete, don't override); a wire
format (`PSA *`) leaked into headings (display through `gradeText()`); code
addressed modals not in the markup; three arrangement bugs passed every suite
in one phase. Open the page.
*Archive:* "An async module read once at parse time is null half the time", "A promise that resolves immediately is a loop", "Dead CSS is not inert when the name collides", "A wire format is not a label", "Code addressing markup that is not there", "Three defects in one phase that every test passed through", "Card page column: one spacing rule (`d082983`)"

**Check the build stamp before debugging; a newer file is not a superset.**
Three "fix didn't work" reports were a stale build; v36 added 25 functions and
dropped 8. Diff before adopting.
*Archive:* "Check the build stamp", "A newer file is not a superset"

**The page can compete with itself, and every caller of a metered path
counts.** A card view fired `/api/listings` twice plus `/api/market`; the
home page opened 14 cards nobody clicked. `fetchListings()` is the one fetch;
tiles read the cache only. Look for every caller, not the one you changed.
*Archive:* "Where a card view's time went — measured on Render 2026-09-28 (TASK T1)", "Completeness plus a single lane is starvation (T1/T2, 2026-09-30)"

**Verify unreleased server code in the browser** with `PORT=3001 node
server.js` and `http://localhost:3001/app` (`?api=render` for eBay).
*Archive:* "Verifying an unreleased endpoint"

#### 5 · Code, tooling, tests

**Escapes are mangled by every layer between you and the file.** `'\D'` in a
JS string is `'D'`; a Python patch turned `\b` into a 0x08 byte; a quoted
heredoc still corrupted one; the shell ate `\s`, `\'`, `$'`. Use the editor
tool for anything with a backslash, then run the byte check (COMMANDS) —
`grep -P` does not run here and its failure reads as "no matches".
*Archive:* "`'\D'` is just `'D'` in a JS string", "An escape swallowed by the patching tool, not the code", "Verifying an unreleased endpoint"

**Silent failures first.** An empty catch reported four sets written that
were not; health said "connected" without a query; a search returning -1
truncated `ingest.js` and node ran an empty program. RUN a file after editing
it, not only `--check` it. When something looks like missing data, look for a
swallowed error.
*Archive:* restored from `CLAUDE.md.bak-20260803`: "Silent failures are the recurring theme"

**`null` is not a diagnosis; presence is not readiness.** One `null` for four
token failures sent the hunt to a healthy environment. A readiness check that
cannot fail for the reason you care about is decoration. A refactor that
merges error messages downgrades the diagnosis — test WHICH reason is
reported. Read credentials at call time; `Date.now() < NaN` is false.
*Archive:* "`null` is not a diagnosis", "Presence is not readiness", "Read credentials at call time", "A refactor can quietly downgrade a diagnosis"

**Integration tests find what unit tests written against an earlier shape
cannot.** A `const body` inside a retry loop shadowed the parameter and broke
every POST; the suite predated POST and was not re-run.
*Archive:* "Shadowing a parameter inside a retry loop"

**A budget binds only where the work runs.** Task Scheduler killed cmd.exe;
node, a grandchild, ran 33 hours. `refresh --hours=N` stops from inside node.
*Archive:* "A time limit on the wrapper does not bind the work"; also "A killed task does not kill its grandchildren" (`CLAUDE.md.bak-20260901`)

**Keep tests outside the file they test; versions do not catch reverts.**
Downloads replaced `ingest.js` twice, losing `jpTitleIsSingleRaw`,
`evaluateAlerts`, `estFix`; the version banner matched both times.
*Archive:* "Reverts lose functions silently, and versions do not catch it"

**An assertion that gets overridden is not an assertion.** Patch scripts that
failed their anchor check were run anyway: 4,312 duplicate rows. If an anchor
fails, stop.
*Archive:* "An assertion that gets overridden is not an assertion"

**A test that inspects source is one slip from asserting nothing.** A slicer
that over-runs passes on the next function's text (false PASS); one test read
the comment above the SQL instead of the SQL. Test the helper itself, revert
the fix and watch the test fail, and read the WHOLE output — a red line was
pushed because only the last four were read. A test that crashes cannot say
how much is broken: make it null-safe.
*Archive:* "A helper inside a test is not exempt from being tested", "A fix is not installed until every path that needs it HAS it", "A gate that skips says nothing; now it says what it skipped"

**A tool that cannot check something must say so; a verification tool is a
reader.** `jpcheck` reported correct prices "DROPPED" for want of a Yahoo
comparable; `pricecheck` checked a number the page never shows, with a query
the writer never makes, and asks the wrong edition.
*Archive:* "A tool that cannot check something must say so", "The base-price rule lives outside server.js too (T2, 2026-09-30)"

**Cross-check two paths that should agree — and compare only what both
examine.** The highest-yield technique here: it found the mirror collision,
the Raw NM bug (22 vs 0 listings), and the strongest positive evidence (Yuyu-
tei and eBay 1% apart on a $450 card). `listingparse.compare` has no name
check, so comparing names produced 40 false disagreements.
*Archive:* "Cross-check two paths that should agree", "A cross-check must compare only what both sides examine", "Two paths to one marketplace agreed, and that is the validation"

**Search must find a card by its own name.** The parser altered 209 of 4,512
English names (set words, numbers, TAG/ACE in names) before SQL; guesses are
scored under every reading, never used as filters; rank before the cap.
Never compare timings while a bulk job is running (10x worse under load).
*Archive:* "Search could not find cards we hold by their own name (2026-09-28)"

**Measure a check's time where it runs, and a timeout is not a verdict.**
The stamp check took ~1.2 s here and 4.2-5.9 s on Render; eight at once,
one worker each, all ran past 20 s — and the timeout was cached as
"unreadable" for 15 minutes. One pool sized to the instance, a queue, one
job per item; a failure is retryable and held briefly, never kept as an
answer. A check that cannot finish inside the response runs after it, and
the page says what is still being checked.
*Archive:* none — 2026-10-02, PROGRESS.md

**A verdict that cannot change is stored, not cached — and an unchecked
row is hidden, not shown.** The stamp verdicts lived in memory: every
deploy forgot them and the first viewer watched stamped reprints appear
and then vanish. A photo never changes under its URL, so its verdict is a
fact: in the database, keyed on a hash, with the matcher's version so a
new template re-checks. Strong evidence refuses; unchecked waits out of
sight, counted; weak evidence stays.
*Archive:* none — 2026-10-03, PROGRESS.md


**A zero-false threshold is set by the hardest genuine photo.** The
artwork template separates different illustrations on average (median
0.44 vs 0.83) and catches none at zero false: glare, tilt, slabs and
close crops put genuine cards at 0.36. Look at the bottom of the right
distribution before reading the medians.
*Archive:* none — 2026-10-03, PROGRESS.md

**Where both answers are held, ask which wins — not how high one scores.**
Every photo measurement asked "does this match card X?" and died at the
floor. Asked comparatively — our scan or the other card's? — the same
matcher separated bubble Mew from 30th Mew at 0 of 276 genuine refused and
162 of 178 caught: a glared genuine photo scores low against both, but
higher against its own. Use a margin so a near-tie is undecided, and set it
above the hardest genuine photo, not at it.
*Archive:* none — 2026-10-04, PROGRESS.md

**A title can state the right number over a photo of another card.**
"Alakazam EX shows #117 listings" read as a number-gate failure; every one
of 361 kept titles stated the right number, and the photos were siblings,
other sets and fan art. Read the kept titles AND look at the photos of the
cheapest rows before deciding which layer failed — the hypothesis in the
task ("titles with no number") was wrong, and the fix it prescribed would
have changed nothing.
*Archive:* none — 2026-10-04, PROGRESS.md

**Know what a matcher cannot see.** Normalised cross-correlation reads
structure, not colour: a recoloured print of the genuine card back scores
0.73 and would be labelled genuine. Metal backs fail because embossing
loses the swirl, not because they are gold. Say the limit where the claim
is made ("matches a genuine card", never "verified"), and pin it in a test
so a change to it is noticed.
*Archive:* none — 2026-10-04, PROGRESS.md

**A source label two paths write is not "the same source".** Trending
pairs prices "from the same source" — and `tcgplayer_market` was written
by the old every-card internal search until 09-29 and by the fallback-only
search after: 59 of the top 60 seven-day movers were a method change
(Oranguru SM13 → its Staff prerelease product, $20.72 → $79.99). Label the
path on the row (`source_meta.via`, productId) and pair on it.
*Archive:* none — 2026-10-04, PROGRESS.md

**One card's sample is not a rate.** The sibling "margin ≥ 0.20 AND price
nearer the sibling" rule caught 10 of 11 on the sample it was read from
and 2 of 14 on a fresh one (2026-10-04): siblings priced alike (Mew ex
#193/#205) and swaps priced as our card defeat the price half. SIFT's "0 of 100 correct flagged"
on four cards became 33 of 896 on twelve. A technique measured on one
card's wrong listings and four cards' right ones has measured those
cards. Widen before quoting a rate, and look at where the misses cluster.
*Archive:* none — 2026-10-02, PROGRESS.md

**Split a mixed denominator by kind before judging a technique.** "35
of 89 wrong caught" counted 43 other-language copies no photo can ever
separate; on the 62 different-artwork rows alone the same SIFT caught 48.
State what each kind of failure is, then measure each technique on the
kind it could catch — and report false flags per kind.
*Archive:* none — 2026-10-02, PROGRESS.md

**Where a technique and a label disagree, look again before blaming
the technique.** The "rainbow foil defeats SIFT" cluster (18 false
warnings on Pikachu VMAX) was mostly metal replicas labelled right;
re-labelled, it is 4. 27 "right" rows across seven cards were wrong
(5 more unclear).
Labelling by eye at thumbnail size misses gold-on-rainbow — zoom.
*Archive:* none — 2026-10-02, PROGRESS.md

**A fold that helps matching can merge two cards.** `normNum` folds
"H01" to "H1" (needed) and "50a" to "50" (not): ccfill would have given
Aquapolis Golduck 50a and 50b one image. Fold only what the comparison
needs — padding — when a number identifies an artifact.
*Archive:* none — 2026-10-02, PROGRESS.md

**A "known correct" sample is labelled by eye, not by the gate that kept
it.** 11 of 30 Base Charizard rows drawn as "correct" for T2 were metal
replicas, modern Charizards and foreign copies the text gate had kept —
measured against them, any technique would have scored as wrong what was
right. Look at every photo in a labelled set.
*Archive:* none — 2026-10-02, PROGRESS.md

#### 6 · Metered APIs (eBay)

**Guard a metered API before the first bulk call, count by THEIR count, and
check at the moment of spending.** The count lives in Supabase (Render
restarts); token exchanges count; the check runs under a lock including
pending calls; background yields at the soft stop, foreground runs to the
reserve; `EBAY_ENABLED` defaults on. One token exchange in flight, shared.
*Archive:* "Guard a metered API before the first bulk call, not after"

**A guard nobody can see is half a guard.** The daily quota went in twelve
hours and every guard held — speaking only to a server log while the page said
"No listing matched", which was false. Hourly ceiling, per-origin counts, a
tooling allowance, and the number on the page.
*Archive:* "The guard worked and nobody saw it (2026-09-30, TASK T1-T3)"

**Fetch what was asked; completeness plus a single lane is starvation.** "Every
site, every page" made a view 8-40 calls and a user waited 75s behind a crawl.
Open = 1 call; everything else is a button stating its cost; the response says
what was NOT fetched; nothing runs by itself (the auto-expansion is deleted).
**State the calls per card view before shipping a change.**
*Archive:* "Completeness plus a single lane is starvation (T1/T2, 2026-09-30)", "The auto-expand threshold, measured"



## MOVED FROM CLAUDE.md, 2026-10-07 (TASK-ui, third pass)

Moved verbatim from the committed CLAUDE.md (59,651 of 60,000 characters) after
the TASK-ui layout rules were added. Each rule stays in CLAUDE.md in a line;
this is the detail behind it.

Measured under `node -r ./costmeter.js` (eBay stubbed, calls counted by origin,
DB writes swallowed). **Re-measure before changing a row.** Full tables:
PROGRESS 2026-10-05: "CALL COST — what spends eBay quota, measured
(2026-10-01)" (its sections:
"Recurring — runs whether anyone is there or not",
"User — costs only when someone acts",
"Tooling — counted against the 300/day allowance"). Budget: 5,000/day · 600/hour all origins · tooling 300/day;
one-day raises in `ebayquota.TOOLING_OVERRIDES` keyed on the UTC day.

---

| `/api/ebay/conditions?items=N` · `marketprobe` default | 1+N · 11 per card |
| `/api/ebay/dealsprobe/:card` (measurement; deals stay off) | ≤ 4 per card: 1 search, +1 language union, ≤ 2 back getItem |
| `node sitecheck.js` default · `node querygap.js en` · `linkaudit --live` | 41-89 · ~230 · 1 per card |

---

`pricecheck` flags >40% from live. Known: Mega Gengar ex #284 ≈ $1,176 · Mega
Charizard Y ex #294 ≈ $438 · Pokégear 3.0 #186 < $1. Read a source's own rarity
label before calling a vintage price wrong (`ja-CP6-33` is a ¥24,800 Common).

---

`node ingest.js refresh <lang>` prices whatever is overdue: hot 24h (≥$100 or
Hyper Rare/SIR) · active 72h (≥$20, IR/Secret/Ultra) · steady 7d (≥$5, Double
Rare/Holo/ACE SPEC) · slow 14d (≥$1, Rare/V/VMAX/VSTAR/GX) · dormant 30d.
**Price beats rarity.**

---

`auth.js` verifies the token: **ES256 via the project's JWKS** (legacy
`SUPABASE_JWT_SECRET` only for HS256). `/api/me` is the ONLY source of the
signed-in state AND the role. `user_access.email` is captured from the verified token at sign-in (id + email only); nothing reads the `auth` schema.
- **master** = token email in `CARDZON_MASTER_EMAILS` (Render env, read per request,
  never stored; `roy@cardzon.com` has no mailbox yet — intentional). approved /
  pending / rejected in `user_access`, keyed on the auth user id (`roles.js`).

## MOVED FROM CLAUDE.md, 2026-10-07 (compression)

Moved verbatim when CLAUDE.md reached 59,436 of its 60,000 characters. Each rule
these carried stays in CLAUDE.md as one line; this is the detail behind it.

- 2026-10-05: manifest re-run on the 12 stopped JA sets (SM6b … SM9): 1,107
  cards, 31 rarities corrected (SM6b 9, SM8b 4, S10a 18); safeprices re-run: 22 of 370 priced, the rest have no Yahoo data.

---

- Data changes of 2026-10-01 (duplicate TG sets, Yahoo mirror rows, JP
  thumbnails, pokemontcg.io art) each have a backup JSON in the project root.

---

Open: raw titles with the pair and no set name are never fetched (unmeasured);
Ancient Mew prints no number: `cm.PRINTS_NO_NUMBER` (name only, year 2000, refuses its
paper insert / metal / Mewtwo); grouped with basep on the page, not moved; a slab
is one card whatever is sealed inside ("Sealed Cello Pack – PSA 8" kept, Roy). Unown "?"
number and the mcd23/24 + mep/svp logos: Roy ran `roy-writes-20261006.sql` 2026-10-06, confirmed
on /app. A punctuation number (Unown ! ?) must stand alone ("CLEAN!" passed Unown Q as "!"). TCGdex is asked via `cardid.tcgdexLocalId`. mfb: eBay has nothing (`NO_EBAY_MARKET`);
an empty panel says none-returned / all-refused / no market (`payload.market`).
Trainer kits: ONE grid tile, filter by kit — UI only (`groupTrainerKits`).

---

- **Decided 2026-10-05 (Roy):** Yellow A Alternate (xya) is NOT deleted — own
  printed numbers (24a/119) and own listings (36 kept), unlike the TG twins;
  and **no softer 0.2x price flag** — it would catch genuine damaged copies.
- **Cross-set lookalikes — SHIPPED at 0.30 (Roy, 2026-10-05), a reduction:**
  Mewtwo ☆ ex13-103 ↔ Evolutions Mewtwo xy12-51, Dragonite ex ex3-90 ↔
  Evolutions Dragonite-EX xy12-72 (Evolutions cards under ex-era catalogue
  titles). 23/80 and 15/122 refused, all Evolutions; 0 genuine; 0 on the
  Evolutions cards' own pages. Most Evolutions rows (margin 0.04-0.30) stay —
  a lower margin needs more genuine photos. Finder: >=40% of a view
  price-flagged, then score against same-Pokémon scans (PROGRESS 2026-10-05).
- 754 EN cards have no image, so no material reference (B2a, mep, trainer kits).

---

- **Found refuses; not visible / unreadable keep. Unchecked rows of EVERY kind
  (stamp, pair, sibling) are shown "Photo being compared"**, hidden only below
  `SIBLING_HIDE_FRACTION` (0.55) of a current measured raw price. Hiding all of
  them emptied 49 of 54 originals' panels on a cold open (T0, PROGRESS 2026-10-06).

---

- **Not built, measured** (PROGRESS 2026-10-05 blocks): artwork template
  ("THE STAMP MATCHER ON THE ARTWORK…" — overlaps at the floor); SIFT ("IS
  THIS PHOTO THIS CARD AT ALL?…", "SPLIT BY KIND…" — strict rule 0/916 right,
  but **no opencv.js build ships SIFT**: "SIFT ON RENDER…"; routes are
  emsdk build, native OpenCV on Render, or re-measure ORB/AKAZE — each
  infrastructure); Japanese layout by template ("CAN THE STAMP MATCHER TELL A
  JAPANESE COPY?…" — 10.5 s a photo, 1 row of yield); sibling+price rule
  (2/14 on a fresh sample). Base Set 2's set mark needs alignment first.
  **"Which card is this" across all 20,360 scans — STOPPED** (PROGRESS
  2026-10-06: "WHICH CARD IS THIS?…"): the true card of a different-card photo
  reached the shortlist 1 of 21 (gold 228: rank ~12,000); the 228 lead shipped as a one-way pair.
  **OCR of name and number — CLOSED** (PROGRESS 2026-10-06 (later): "T1 — OCR"):
  number read 1/113 at s-l500, 19% at s-l1600, **0/38 on the different-card photos**.
- **Sibling references are stored, not fetched** (`refscans.js`, versioned).
  "Unbuildable" is a MOVING set — 78 -> 136 during the first backfill (PNG
  67 -> 86, no URL 10 -> 48, 404 1 -> 2): re-count with `node refbuild.js
  --dry`, never quote it; `--retry-unbuildable` after a decoder change.
  A check not run is reported (`stampGate.notRun`), on the page too
  (PROGRESS 2026-10-06 (late night)).
- **HARD LIMIT: one sibling worker.** Render gives 0.15 core (cgroup, 2026-10-07);
  a compare is CPU (68 ms -> ~450 ms wall). Faster cold sibling coverage means a
  paid Render tier, not code. Colour downloads overlap (5 lanes) — not CPU.

---

- `GET /api/listings/:cardId?grade=` and `/api/search` both answer through
  `listingsFor` (one payload builder, every row returned). `?dryRun=1` spends
  nothing. Envelope: `cardId, card, grade, count, cheapest, outliers,
  gradePrice, listings[], refused[], refusedTotal, sources{}, progress,
  saleTypes, stampGate, freshness, fetchedAt`.
- Each source block: `status, count, scanned, kept, rejected, gate, summary,
  droppedSample, query`. **No rejection count = the gate did not run.**
- `saleType` auction only where the number is a current bid; `cheapest` is Buy
  It Now only; the page splits "Buy It Now (n) · Auctions (n)".

**On demand — US page 1, the rest when asked (T2, 2026-09-30)**
Open = 1 call. "Search 7 more marketplaces" (`?sites=all`), "Load more"
(`?more=1`) extend the cached view (`VIEW_STATE`, 15 min) and re-judge every
row (`rebuildView`). `progress` names what was NOT fetched and each button's
cost. **Nothing expands by itself, not even on zero US results**
(`noautoexpand.test.js`). Home tiles `?cachedOnly=1` = 0 calls. Shipping is
never a filter; non-USD via `fx.js` with the rate on the row; one item one row
(earlier site in `EBAY_SITES` wins); a refusal on an English-titled site is
sticky everywhere, on a translated site only its own copy. Calls per view in
`listing_views`, summarised at `/api/listings-log`.

**The registry**
`LISTING_SOURCES` in server.js: `yahoo` (ja-, local only), `yuyutei` (ja-,
`priceKind: 'shop-ask'`), `ebay` (anything with an English name).
`UNAVAILABLE` states a reason for mercari / cardmarket / facebook / localshops.

**What remains**
1. `node ingest.js names ja` (64% of JP cards unaskable on eBay).
2. PriceCharting (JSON). 3. Troll and Toad / Card Kingdom (HTML parsers).
4. Auctions from Render: fetch locally -> store -> serve, with fetch age.

**eBay — live, guarded, and its data is never stored**
5,000 calls/day free tier, in production. `GET|POST /ebay/deletion`,
`/ebay/status?probe=1`. Credentials on Render only (`EBAY_CLIENT_ID`,
`EBAY_CLIENT_SECRET`, `EBAY_VERIFICATION_TOKEN`). Every call via `ebaycall.js`
-> `ebayquota.js`. Cached 15 min, never stored.

---

- **Movers** (`trending.js`, Roy's decisions): both ends `tcgdex_tcgplayer_*`,
  same printing and productId; pricequality-marked cards left out; four lists
  on the home page, window stated; `coverage` says when a list is thin and
  why. 2026-10-05: 7d **0 pairs** (TCGdex nightly since ~09-28), 24h 250 of
  2,510 — the page shows 24 hours and says so. Re-check after 2026-10-06.
- **Best deals — OFF** (`deals.ENABLED`; `/api/deals` answers `enabled:false`
  + reason). Bar (`deals.notADeal`): stated LP/MP/HP/DMG, other printing/edition,
  pending/marked photos refused, and **a genuine back required** (a view checks
  ≤2 candidates' backs, `DEAL_BACK_MAX`, background). Turned on 2026-10-05: gold
  Shining Charizard gone, but #1 was a gold Charizard ex 228/197 under Base
  Charizard (genuine back) — a real card is not THIS card. Switch on only with
  an "is this photo this card" answer (PROGRESS 2026-10-05 (late)).

---

**PSA cert lookups — the free bucket is not ours**
2026-10-05 09:10 UTC, 2h41m after the 06:29 reset, nothing of ours having
called PSA: keyed and corrupted-key calls BOTH 429 "100 per Day", same
Retry-After (76,748 s). The limiter answers before reading the key and the
bucket we are counted in is spent by others (shared IP or global). An
allocation means writing to collectors-apis@collectors.com — Roy's call.
Nothing calls PSA; certcheck steps 2-4 stay NOT BUILT.

---

The eBay sold scrape is gone and must not return in any form. Options read
2026-10-02 (*Archive:* "Sold data — NO SOURCE, and the page says so"): eBay
Marketplace Insights (restricted, 90 days, application is Roy's), PSA APR (not
in PSA's API; display needs PSA's written permission), PriceCharting
(~$49/month + written permission; current values, not sales). Last sold box
says "no licensed sold source" until one exists.

---

- **TCGplayer internal search — KEPT as last resort (2026-10-01).** Runs only
  where TCGdex answers no-tcgplayer / not-on-tcgdex / shared, never when
  TCGdex is unreachable, from home during ingest, never on Render. 2,025
  English cards (9.6%) have no other source. Rows carry
  `source_meta.via = 'tcgplayer-internal-search'`. TCGdex's Cardmarket price
  for these is a **second reading**, never the headline. **Re-check TCGdex
  coverage around 2027-01** (`tcgdexharvest.js en --dry` on those sets).

---

- Japanese "old" is one job not repeating: 9,058 are `yuyutei_shop` rows from
  the single 2026-08-28 run; the nightly asks only Yahoo for Japanese.
  `node ingest.js yuyutei` re-run or scheduled is the fix — a decision, open.
- English "alternating" is the TCGplayer internal search (promos, Gold Stars):
  two products under one number; `source_meta.productId` will say.

---

- **English names are thin**: Japanese `name_en` 36%, `set_name_en` 4.7% — eBay
  answers nothing for ~64% of Japanese cards. `node ingest.js names ja` is the
  highest-yield data job outstanding.

## MOVED FROM CLAUDE.md, 2026-10-07 (budget, second pass)

Moved verbatim when CLAUDE.md reached 58,976 of its 60,000 characters. Each rule
these carried stays in CLAUDE.md in one or two lines; this is the measurement
and the PROGRESS block names behind them. (Superseded on the way out: "an
unchecked row is hidden" — since T0 an unchecked row is SHOWN "Not checked yet".)

| `refscans.js` | the sibling check's references, built AHEAD by `refbuild.js` into `card_reference_scans` (24 px, identical scores): a visitor's request never waits on a third-party host; missing = `notRun`, reported, never a pass |

---

| `stampcheck.js` (material) | gold/black NOVELTY card? photo colour vs OUR scan + outlier flag + a metal photo among the seller's others: two refuse, one flags, a genuine back never refuses (`materialJudge`, 0.40) |

---

Settled — do not retry (full story: *Archive:* "Known blemishes, measured
today"):
- Aquapolis 50a/50b-style pairs (8): pokemontcg.io has one image for two
  cards — blank is correct (fold-merge lesson).
- McDonald's 2014-2018 and 2023/2024 (78 cards) have no host. **DECIDED
  2026-10-02 (Roy): leave blank; do not fill from TCGplayer's CDN.**
- Data changes of 2026-10-01 have backup JSONs in the project root.

---

**What the query asks decides what the gate can see** (2026-10-04): a slab
asks the bare number (PSA's label prints no total), raw keeps the pair; label
set names by set id (`SET_WRITTEN_AS`); auctions asked via `buyingOptions`;
"PSA 8 Card" is a grade not a lot; `δ` empties an eBay search (not asked);
lettered numbers are their own card. Re-run `node querygap.js en` (~200
tooling calls) after any change to `buildQuery` or a set's vocabulary.
Open: raw titles with the pair and no set name are never fetched (unmeasured).
A card that prints no number is asked by name only (`cm.PRINTS_NO_NUMBER`, Ancient
Mew); a slab is one card whatever is sealed inside (Roy); a punctuation number
(Unown ! ?) must stand alone; TCGdex is asked via `cardid.tcgdexLocalId`; an
empty panel says none-returned / all-refused / no market (`payload.market`).

---

| 30th / Celebrations reprint | stamp template from OUR scan, 0.70 + title words + price band | 55 originals (`30th-c-020` no stamp) | 92.5% of reprint photos; 2026-10-06: 186/186 refusals were reprints; 0/491 genuine Base Charizard (max 0.613); a visible 30th stamp missed at 0.68 |
| a different card listed under ours, both scans held | lookalike, per-pair margin (`LOOKALIKES`) | bubble Mew ↔ 30th Mew (0.40); Mewtwo ☆ and Dragonite ex ↔ their Evolutions cards (0.30); Base Charizard ← gold Charizard ex 228 (**one way**, 0.10) | 2026-10-06, both ways: Mew 113/178 at 0.40 (a genuine binder photo hit 0.352); Evolutions 22/22 refusals right; 228 28/60, 0/491 genuine |
| same-name card of the same set | sibling, margin 0.40 | 6,962 English cards (2026-10-06) | JPEG refs: 7/11 swaps, 0/~1,470 genuine. **PNG refs (86 cards): ONE direction only** — 0/111 genuine refused, no swap seen; catching untested, NOT equivalent to JPEG |

---

| gold/black/silver metal novelty, title silent (2026-10-05) | material check: colour vs our scan, outlier flag, metal photo — two refuse, one flags | English cards with a scan (TCGdex .jpg, or pokemontcg.io .png for 806) | labelled: 51/95 refused + 22 flagged, **0/195 genuine refused**; 12 cards, 1,990 rows: 68 refused, all looked at, 0 genuine |

---

  measured raw price. Hiding all of them emptied 49 of 54 originals' panels on a
  cold open (T0, PROGRESS 2026-10-06). A check that could not run is NAMED

---

  `check_kind 'material'`. A repeated-photo hash was measured and NOT built: no
  novelty template recurred across cards in 19,054 photos (PROGRESS 2026-10-05).

---

  Charizard (22/22 metal, 0/13 genuine hidden), Base Charizard (6/6, 1 doubtful);
  NOT Pikachu VMAX (10/72 genuine) or M&W GX (~21%). Measure both ways to add one.

---

- **FALSIFIED — do not retry without a new idea** (PROGRESS 2026-10-05/06 blocks):
  artwork template ("THE STAMP MATCHER ON THE ARTWORK…": overlaps at the floor);
  SIFT ("IS THIS PHOTO THIS CARD AT ALL?…", "SPLIT BY KIND…": 0/916 right, but
  **no opencv.js build ships SIFT** — "SIFT ON RENDER…"); Japanese layout by
  template ("CAN THE STAMP MATCHER TELL A JAPANESE COPY?…": 10.5 s a photo, 1 row);
  sibling+price rule (2/14); **"which card is this" over 20,360 scans — STOPPED**
  ("WHICH CARD IS THIS?…": true card shortlisted 1 of 21); **OCR — CLOSED**
  ("T1 — OCR": 0/38 numbers on different-card photos). Base Set 2's mark needs
  alignment first.

---

(*Archive:* "EX-ERA PRICES — diagnosed 2026-10-02 (T2)".) A `normal` TCGdex
block on a holo-only card was read first — fixed `af2f2c0` (a block is used
only for a printing the card lists); 93 ghost headlines -> 7. Gold Stars:
TCGplayer's "market" is a stale sale on 0 listings; only a sold-price source
fixes them.

---

- **Best deals — OFF, BLOCKED (not shelved)** (`deals.ENABLED`). The bar is now
  the VOUCHING bar (`deals.vouchFree`/`vouchPhotos`, Roy): skip anything without
  evidence to vouch for it. First run: 7 eligible of 2,966 listings on 80 cards,
  5 of them wrong through three GATE holes (title condition, kit names,
  "Brazilian") — fixed 2026-10-07. Blocked on a re-run with the clean gate and
  on yield (38% of listings lack a landed price). Measure with
  `/api/ebay/dealsprobe?bar=vouch` (PROGRESS 2026-10-07 (gate fixes)).

---

- **Live suites run SIGNED OUT — decided (Roy, 2026-10-07)**: priced checks SKIP and say why;
  prices for an approved account are checked by hand. **Never** a service_role key or a test
  account on a dev machine (it bypasses RLS and can mint any session). Unattended priced checks
  would need a separate Supabase project for testing, not production credentials.

---

nothing — then verify that, not the code.** Three cases: a sibling timeout that
was not firing, yet the check still never produced a verdict within a visit; a
gate correct on all 213 refusals while the query spent the budget on cards it
would refuse; a suite green in a working tree and red on a clean checkout
(PROGRESS 2026-10-06 (late night), 2026-10-07 (night)).

---

which direction a number is. (PROGRESS 2026-10-04) A shortlist that keeps the
right card 91.5% on genuine photos kept it 4.8% on the photos it exists for
(PROGRESS 2026-10-06).

---

English query** (Mew ex 151/165 = en/ja SV2a/ko: 208 of 225 scanned were
foreign, every refusal right; sort=price puts them first). **Neither exclusion
is safe, measured both ways on 5 cards**: eBay `-term` matches beyond the title
(dropped 4/11, 41/130, 40/112, 51/130, 1/7 genuine English rows with no excluded
word — 51 on English-only Evolutions); `Language:{English}` dropped 0, 9, 3, 9,
0; `Language:{Not Specified}` is not a filterable value (eBay ignores it).
Production asks with no exclusion (`LANG_EXCLUDE_DEFAULT = 'none'`)
(PROGRESS 2026-10-07 (language exclusion)).

---

listings**: with `X-EBAY-C-ENDUSERCTX` (ZIP 10001) every row stated shipping and
38 of 69 were different, cheaper rows (one card, reproducible; `marketprobe
?zip=`). Production sends none — open, Roy's (PROGRESS 2026-10-07 (buyer location)).

---

- Measure a check's time where it runs; a timeout is not a verdict.
- A verdict that cannot change is stored, not cached; an unchecked row is hidden.
- A zero-false threshold is set by the hardest genuine photo, not the medians.
- Where both answers are held, ask which wins (margin above the hardest genuine).
- A title can state the right number over a photo of another card — look at
  the cheapest rows' photos before deciding which layer failed.
- Know what a matcher cannot see (NCC reads structure, not colour); say it
  where the claim is made, pin it in a test.
- One card's sample is not a rate; widen before quoting one.
- Split a mixed denominator by kind before judging a technique.
- Where a technique and a label disagree, look again (zoom) before blaming it.
- A fold that helps matching can merge two cards (fold only padding).
- A "known correct" sample is labelled by eye, not by the gate that kept it.
- Widen before shipping a threshold: 0.35 was clean on 378 labelled rows and
  refused a genuine SIR on 1,990 more; set it above the hardest one found (0.40).
- Compare to the card's own scan, never a fixed colour: a gold Mew ex photo is
  gold, and 0 of 118 were touched.
