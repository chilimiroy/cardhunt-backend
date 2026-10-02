# CardHunt — Project Context

Pokémon TCG price tracker and cross-marketplace listing finder. English,
Japanese, Traditional and Simplified Chinese.

**The product's reason to exist:** search any card, see the cheapest live
listing from every reachable marketplace, for every condition from raw through
graded by company and grade, with each link landing on the actual listing.

Where a number is stated, it was measured, not remembered; tables carry their
date. Re-measure rather than re-derive.

**Two files.** This one is what you need to work here: how the system is now,
what is open, how to check it, and every lesson as a rule (LESSONS, near the
end — read it before changing a gate, a source, the page or anything metered).
`CLAUDE_ARCHIVE.md` is the full history: the measurements, incidents and
narratives behind each rule, frozen 2026-10-01. Lessons cite their archive
heading. **A bug's history may move to the archive; its lesson may not** —
`claudesplit.test.js` fails if any archive heading is neither kept here nor
cited from here.

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
| `stampcheck.js` | does this listing's PHOTO show a reprint's commemorative stamp? — **a gate on every eBay row of the 55 originals** (found refuses; pool + item-id cache), **0 eBay calls** (eBay's image CDN), per-card templates in `stamps.json` (built by `stampbuild.js` from OUR scans); found / not visible / unreadable, never "verified original" |
| `setyield.js` | did a refresh price NOTHING for a whole set, or for 200+ cards in a row? — names it, exits 2 |

## What ships and what does not

`git ls-files` is the authority. Tracked:

```
cardhunt_preview.html  server.js  cardmatch.js  cardparse.js  ebaycall.js
ebayquota.js  ebayratecheck.js  estimator.js  fx.js  gradeprice.js
jpfilter.js  linkaudit.js  listingparse.js  outlier.js  setaudit.js
sourceprobe.js  tcgdexprice.js  yuyutei.js  digital.js  trending.js
searchaudit.js  certcheck.js  sitecheck.js  costmeter.js
stampcheck.js  stamps.json  stampbuild.js  stamp.fixture.json  setyield.js
checkout-disabled.js  login-disabled.js   (preserved, never loaded or served)
migration-grade-dimension.sql  migration-image-source.sql  migration-variants.sql
printsql.js  variants.fixture.json  variants.pricing.fixture.json
package.json  .gitignore  CLAUDE.md  CLAUDE_ARCHIVE.md
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

**Re-probed from home 2026-10-02** (`node sourceprobe.js`): PriceCharting now
**403** (a Cloudflare "Just a moment" page — it was 200 JSON) and Cardrush now
**200** with markers (it was 403). Render not re-probed. Yahoo **Auctions** is not
in the probe's registry at all; `yahoogate.js` answered 200 from home. And
Yahoo's LIVE search page (`/search/search`) no longer carries `__NEXT_DATA__`
(closed search still does): `yahooJapanSearch`'s live-listings fallback has been
returning nothing, silently, for every card with no closed sales. Not rebuilt.

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

# REPRINT vs ORIGINAL — settled, and the stamp (2026-10-02)

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

- **Verdicts cached by eBay item id, 7 days, in memory** (photo URL held
  beside it — a changed photo is checked again). A retryable failure (CDN
  down, timeout) is held 2 minutes, so a view is never left pending. A
  Render restart forgets everything: the first viewer after a cold start
  pays again.
- **One persistent worker pool** (`STAMP_WORKERS`, default 1), a queue, one
  job per item however many views ask. Measured on Render before this: one
  check 4.2-5.9 s there vs ~1.2 s here, and **8 parallel workers all ran
  past 20 s** — then the 20 s timeout was CACHED as "unreadable" (fixed:
  retryable, never a verdict).
- **The answer never waits.** An unchecked row is shown marked "Photo
  being checked", the checks run after the response (`stampFollowUp`,
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
  **0 for the stamp work** (82 CDN fetches, once each). Render is ~4x
  slower per photo — **expect ~3 minutes to clear a cold Lugia there;
  re-measure after deploying**, and raise STAMP_WORKERS only if the
  instance has the cores.

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

# IS THIS PHOTO THIS CARD AT ALL? — measured 2026-10-02, NOT built (TASK T2)

The stamp technique cannot generalise: it looks for a mark cut from the
reprint's own scan, and a card with no reprint has nothing to look for.
Four techniques, each comparing a listing photo with OUR catalogue scan,
on **100 correct photos** (labelled by eye: 16 Aquapolis Lugia, 30 Base
Pikachu, 30 Base Charizard, 24 Rayquaza-EX) and **24 real wrong listings**
(Base Charizard rows the text gate KEPT: metal replicas, modern Charizards,
a Japanese and a French copy, a 3-card lot), plus 40 "same artwork, other
set" pairs (Base Set 2 / Legendary Collection / promo) and 40 "same name,
other artwork" pairs. Flagged = similarity below the threshold.

| technique | wrongly flags correct | catches real wrong | same art, other set | ms |
|---|---|---|---|---|
| perceptual hash, whole photo | 0 at thr 24 | **4/24** | 0/40 | 5 |
| art-box template match | 0 at 0.263 | 8/24 (22/24 at 5 flagged) | 5/40 | 766 |
| **SIFT + RANSAC inliers** | **0 at 47** | **21/24** | **1/40** | 455 |
| set-symbol strip, after SIFT alignment | 0 at 0.152 | 8/24 (11 unaligned) | 0/40 | — |

SIFT is the only candidate, and only for one class. Run over every photo
of the right card held (881), **2 correct photos fall below 47** — a tiny
slab and a glared one (~0.2%) — and 6 more wrong cards the text gate kept
are found (metal Charizards in the CC listings). It misses gold-metal
replicas scoring 64-85, and it **cannot separate the same artwork in
another set** (Base Set 2, Legendary Collection) or, by construction, a
printed counterfeit of the real art. Not built: one card's wrong listings,
four cards' correct ones; 0/100 still allows ~3% at 95%; and there is no
OpenCV on Render (opencv.js or a JS port, then measured again, at ~4x the
CPU). Next step if wanted: the same measurement on 10+ cards including
modern and Japanese ones.

**What T2 found that matters more.** The text gates do NOT catch nearly
everything on the most-faked card. Base Charizard Raw, eBay US page 1
(2026-10-02): **20 wrong cards shown unflagged among 84 rows**, and the
headline cheapest ($35.99) was a gold-metal replica. Four were flagged by
price, three by the stamp. Some titles say "Metal" or "Gold Foil"; ten say
nothing ("Pokémon cards, Charizard Holo 4/102 Base Set 1999 ... 120 HP
Rare", $289.99, gold metal). "Gold" alone is not a gate (genuine gold
rares — LESSONS §1).

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
| Open a card — any card, however few US listings | `/api/listings/:id` | **1** (Raw, Raw NM, PSA 10 alike; JA card 1 — Yuyu-tei is not eBay). Re-measured live 2026-10-01 on `en-ex15-95` (0 in the US): **1**, was 8 |
| **Open a card that has a known reprint** | same | **1 + 1 per reprint** — Blastoise 2 (Celebrations), Charizard 4/102 **3** (Celebrations + 30th). `flagReprintPriced` fetches each reprint's listings; the 55 originals in `REPRINT_OF` |
| Same card + grade again within 15 min | cache | **0** |
| "Search 7 more marketplaces" | `?sites=all` | **7** (+1 token if cold; was +8) |
| "Load more listings" | `?more=1` | **1 per site with more** (8 measured) |
| Verify (PSA cert) | `/api/cert` | **1** getItem |
| Photos, same listing as Verify | `/api/photos` | **0** — shared 15-min getItem cache; another listing 1 |
| Reprint stamp gate, on opening one of the 55 originals | automatic | **0** — measured 2026-10-02 under costmeter: Lugia open = 2 searches + 1 token, stamp work 82 `i.ebayimg.com` fetches (CDN, not the API), once per item; the page's ~30 `?poll=1` re-reads **0** |
| `/api/stamp` (one row, by hand) | | **0** — same queue and cache as the gate |
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
reprint check (+1/+2 on 55 cards); the auto-expansion (8 on thin cards) is
deleted (2026-10-01). The big
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

## T3 · Alert engine on real data — BUILT
Checked 2026-10-01 against the code: the page reads AND writes `/api/alerts`
(nothing claimed before the server accepts it — LESSONS §4), alerts are
evaluated at the end of each language's nightly refresh from `price_history`
(zero network, CALL COST), and a trigger records `triggered_at` plus the
listing — `triggered_url`, `_title`, `_price`, `_source` — which the page
shows. `evaluateAlerts` lives in `ingest.js` and was once lost to a revert;
`ingest.js` is tracked now. Not re-verified end to end today: the "new
listing" alert type, which would need live listings rather than stored prices.
*Archive (the open version of this section):* "T3 · Alert engine on real data — STILL OPEN, and still simulated"

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

**A refresh that prices nothing says so** (2026-10-02, `setyield.js`). At
the end of each language: every set with 3+ cards asked and NONE priced
or refused is named — loud, `refresh-empty-sets.log`, **exit code 2** (so
Task Scheduler's LastTaskResult and task-watch.log carry it) when those
cards HAD prices; quietly when they never did. Also any run of 200+
consecutive cards with nothing (a source stopping mid-run — sets interleave
by urgency, so no single set looks empty), and what Yahoo answered, by
kind. Made to fire on the real refresh (mep with its alias removed: exit 2;
restored: exit 0), and it named dpp/basep on its first real run. "Due" is
judged on the headline row only (`basePrintingSql`, ungraded): a second
reading used to reset the clock of a card that got no price.

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

# after ANY edit carrying a backslash: count 0x08 bytes (must be 0).
# grep -P does not run in this Git Bash and its failure reads as "no matches".
node -e "for(const f of ['CLAUDE.md','cardmatch.js','server.js','jpfilter.js']){const b=require('fs').readFileSync(f);let n=0;for(const c of b)if(c===8)n++;console.log(f,n)}"
```

## The test suite — all green 2026-09-29

Standalone by design, so a revert of `ingest.js` cannot take them with it.
Counts are today's; a suite that suddenly reports fewer has lost assertions.

```powershell
node approute.test.js        # 54   /app serves, and the project root does not leak
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
node pricesource.test.js     # 56   T1/T4: set-checked TCGplayer match; shared products refused; Yahoo mirrors kept out of the base
node eusites.test.js         # 80   T1: eBay DE/FR/IT/ES titles — reprints, junk, slabs, conditions; both directions, real titles
node quotaui.test.js         # 24   T3: a quota refusal reaches the panel in words; indicator wiring (23 fail on the old page)
node edition.test.js         # 76   T3: 1st Edition/Shadowless/Unlimited — reader, gate, query, headline rule, page (--db: +2)
node promo.test.js           # 69   Black Star Promos: no set total asked or checked; real live titles kept; McDonald's refused
node subset.test.js          # 27   TG16/TG30, SV107/SV122, GG01/GG70 asked and kept; Generations RC by number alone
node noautoexpand.test.js    # 19   opening a card is one call: no auto-expansion in any form; empty panel names the sites not asked
node claudesplit.test.js     # 23   every CLAUDE_ARCHIVE.md heading kept or cited here; the restored lessons present
node pricecheck.test.js      # 34   editions compared like for like; the internal search only where TCGdex cannot price, labelled; Cardmarket a second reading (--db: +2, rolled back)
node setyield.test.js        # 42   a set (or 200+ cards in a row) that priced nothing is NAMED and exits 2; scattered gaps are not; the due-clock reads the headline row
node stampcheck.test.js      # 86   the stamp GATE: found refuses, weak keeps, pending never waits; item-id cache; one job per item; poll never searches; both directions on our scans (--live: +8)
```

Run them all:

```powershell
Get-ChildItem *.test.js | ForEach-Object { node $_.Name } ; node jptest.js
```

**`node ingest.js scrape` is deleted** (2026-10-01) — it parsed eBay's
completed-listings HTML and risked an IP block; it now refuses. Never bring it
back in any form. Use `safeprices` or `refresh`.

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


# LESSONS — the rule, why, and where the full story is

(The archive calls this section "HARD-WON LESSONS".)

Every lesson this project has paid for is here as a rule. The incident's
measurements, tables and dates live in `CLAUDE_ARCHIVE.md` under the heading
quoted after *Archive:* — read it when the rule alone does not settle a case.
A bug's history may be archived; **its lesson may not.** If you fix something
and learn a rule, the rule goes here; the narrative goes in PROGRESS.md.

## 1 · Gates and filters

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
*Archive:* "The original measurement, still true of the coarse field", "`art` is in the name of every expensive card", "Rarity is the card's; printing is the copy's (T10, 2026-09-29)", "\"PSA10\" unspaced — read for unambiguous graders only (`7c3f856`)"

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

**Japanese listings are full of lots.** まとめ/セット/一括/引退/BOX/未開封/
PSA/BGS/鑑定 and any 枚/点 quantity: `jpTitleIsSingleRaw()` is the one
definition, used by Yahoo and Yuyu-tei.
*Archive:* "Japanese listings are full of lots"

## 2 · What identifies a card

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

## 3 · Sources

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

**Ask a question the marketplace can answer.** A CJK set name in an eBay US
query returns zero; English sellers write the set NAME, never its code
(apostrophes deleted, not spaced); a deep link has no gate, so every link goes
through `cardmatch.buildQuery` and sits under UNFILTERED SEARCHES.
*Archive:* "Ask a question the marketplace can answer", "English listings name the set; they never state its code", "A deep link is not a result, and must not be dressed as one"; restored from `CLAUDE.md.bak-20260803`: "English marketplaces can't match Japanese names"

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

## 4 · The page

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

## 5 · Code, tooling, tests

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

**A "known correct" sample is labelled by eye, not by the gate that kept
it.** 11 of 30 Base Charizard rows drawn as "correct" for T2 were metal
replicas, modern Charizards and foreign copies the text gate had kept —
measured against them, any technique would have scored as wrong what was
right. Look at every photo in a labelled set.
*Archive:* none — 2026-10-02, PROGRESS.md

## 6 · Metered APIs (eBay)

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

# CONVENTIONS
- Card ids: `{lang}-{setId}-{number}` — `en-me02.5-294`, `ja-M5-081`.
  `cardid.js` is the rule; `cardid.test.js` counts violations at zero.
- Prices in USD; the frontend converts for display
- `price_history` is append-only — always INSERT, never UPDATE
- `name_en` / `set_name_en` hold English equivalents; UI shows them in brackets
- `image_lang` records which language artwork came from
- `_priceIsReal` distinguishes market data from estimates; UI shows `est`
- `priceKind: 'shop-ask'` marks an asking price, never a realised sale
- Every new source: one function, the same normalised shape, through the gate
  and `outlier.js`, reporting kept/rejected/scanned. **A source returning
  listings with no rejection count has not run the gate.**
- Every new eBay call site: tooling origin if it is a tool, its cost in the
  CALL COST table, and an entry in `gateaudit.test.js`'s allow-list.

# THE RULES THAT KEEP BEING RE-LEARNED
1. **Probe before building.** Four APIs in this project were asserted from
   documentation and found wrong. One request answers the question.
2. **Test what a gate ALLOWS, not only what it blocks.**
3. **A fallback must announce itself.**
4. **Cross-check two paths that should agree** — the highest-yield technique here.
5. **A fix is not installed until every path that needs it HAS it** — and a
   shared table is reached by every path that needs it.
6. **The size of an apparent win is a reason to check it harder.**
7. **Never scrape eBay** — `node ingest.js scrape` is deleted; it stays deleted.
8. **Use a literal-text editor for anything carrying regex escapes**, then run
   the 0x08 byte check (COMMANDS — `grep -P` does not work here).
9. **One definition per thing.** A second implementation drifts; derive, or
   delete. A dormant branch is deleted, not zeroed.
10. **Make a guard fire before believing it** — revert the fix, watch the test
    fail, read the whole output.
11. **State an eBay change's calls per card view before shipping it.**

# LOGGING
Keep `PROGRESS.md` current — it is the narrative record, dated, with what was
measured. `TASK.md` holds the current piece of work only. When you learn
something durable — a working source, a set-id mapping, a site that blocks you —
**write the rule into LESSONS here and into the code**; the incident's story
goes in PROGRESS.md (and, when this file is next split, the archive).
