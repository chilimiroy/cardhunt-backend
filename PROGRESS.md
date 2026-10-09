# CardHunt — Progress Log

## 2026-10-09 (night) — one TCGplayer product, one card; dex numbers stored; TCGdex fields settled

- **Migrations run (Roy):** `cards.illustrator`, `illustrator_checked_at`,
  `regulation_mark`, `regulation_mark_checked_at` exist (information_schema);
  the writers' UPDATEs plan cleanly (EXPLAIN, nothing executed), so the
  "column is missing" branch no longer fires. All four were empty (0 of 23,736
  English cards) before tonight's run; tonight's English batch is 1,333 cards
  (`refresh en --dry`), each priced through TCGdex stores artist, mark, and —
  once migration-dex-ids.sql runs — the dex numbers.
- **Regulation mark falsified as a reprint key** (CLAUDE.md, beside Option S):
  50 of 55 REPRINT_OF pairs carry no mark on either side; 30th and Classic
  Collection carry none. Kept as printing era.
- **Dex number stored as integer[]** (`writeDexIds`, migration-dex-ids.sql for
  Roy): every number kept in TCGdex's order (TAG TEAM [25, 644]); '{}' = none
  known; checked_at NULL = never asked; an empty answer never erases; a
  non-integer array refused whole. All 21,255 measured arrays pass (3,613
  empty, 121 several, max 1025).
- **PROPOSAL-card-details.md:** effect (Trainer 2,835 of 2,863; Energy 211 of
  568) and energyType (Normal 336, Special 196) added. Attack damage: ONE shape,
  the printed string — the card endpoint gives `10` as a number and `"10+"` as a
  string; 4,932 of 22,790 damage values (22%) are not a bare number. 15 cards
  have 18 nameless attack entries (a source defect, dropped and counted).
- **nofabricated.test.js:** the alert form's 85% default carries why it is
  exempt and who decided (Roy, kept), printed on every run.

### TASK-product-matching

**The loose comparisons, both in ingest.js `tcgPlayerSearch`:**
1. its private `normNum` reduced a number with a trailing letter to its digits
   (50a and 50b both "50"; XY177a "177") — Aquapolis halves matched one
   product "exactly";
2. when no hit stated our number, the rarity and name-unique fallbacks took a
   hit WHATEVER number it stated (H09 took Gengar (10); RC6 Piplup 33; Garchomp
   146/228/247 took 114; svp 106 took Pikachu 190; sm2-169 Fighting Energy
   took Energy Recycler 123; np-23 took Metang 49; BW77 took BW54; DP05/DP25
   took DP48). Not only lettered/prefixed: plain numbers too.

Fixed: `cardnumber.js` (one definition; ingest's copy deleted) compares whole —
only padding and case fold; over 23,736 English cards it reads only the 37
lettered numbers differently, and no two cards of a set share a key. The
fallbacks take only a hit stating NO readable number. Rows carry
`source_meta.numberRule`. No search budget changed.

**Same fold elsewhere, NOT changed:** `cardmatch.normNum` (the listing gate —
guarded by `verifyLetterNumber` first), `listingparse.normNum`, ingest's image
fill (`parseInt(num)` fallback key, ~line 3890). **Another loose comparison in
the same function, not this bug:** the sealed-product word list has no word
boundaries — 273 English card names can never match (253 on "tin": Dratini,
Victini, Giratina, every "Basic Fighting Energy"; Iron Bundle, Secret Box,
Clemont's Backpack, Aaron's Collection).

**Stored rows** (append-only, nothing deleted): collisionscan holds every
tcgplayer_market row to the rule — refused when its product states another
number (the name first, since old rows stored the folded number; reprints held
to their printed number), and, on a card so proven mismatched, when it states
none and the fixed matcher did not write it. 274 rows on 37 cards, by row id
in pricehold-collisions.json; `pricehold.notRefusedSql` keeps them out of
basePrintingSql. Across all 77,366 search rows the rule found no other card
(73,255 old rows carry no metadata and cannot be judged).

**Re-measured:** 23 products on 47 cards remain (16 TCGdex alone, 6 TCGdex +
our search agreeing by number, 1 = 97703: our search HGSS18 by its own number
vs TCGdex's pricing for np-36) — all held. Of the 106: **47 held, 37 mapped to
one product id, 22 with none.**

**The 59 released**, headline before (hold lifted) -> after:

| card | before | after | change |
|---|---|---|---|
| sm2-169 Fighting Energy | $0.29 search | $25.60 TCGdex | +8728% |
| sm11-247 Garchomp & Giratina GX | $3.06 search | $126.28 TCGdex | +4027% |
| xy6-77a Shaymin EX | $10.71 search | $257.50 cardmarket_avg (07-27) | +2304% |
| sm11-228 | $3.06 search | $62.43 TCGdex | +1940% |
| sm11-146 | $3.06 search | $54.69 TCGdex | +1687% |
| xyp-XY198a M Camerupt-EX | $7.33 | $47.45 cardmarket_avg | +547% |
| xyp-XY177a Karen | $11.38 | $62.98 cardmarket_avg | +453% |
| g1-28a Jolteon-EX | $32.72 | $174.10 cardmarket_avg | +432% |
| xyp-XY200a M Sharpedo-EX | $25.49 | $85.00 cardmarket_avg | +233% |
| np-27 Tropical Tidal Wave | $223.50 | $504.50 cardmarket_avg | +126% |
| g1-RC5 Charizard | $28.42 | $60.86 tcgplayer_holofoil (07-27) | +114% |
| ecard3-H09 Gengar | $509.99 | $0.30 stored ESTIMATE | -100% |
| dpp-DP25 Tropical Wind | $249.00 | $0.24 stored ESTIMATE | -100% |
| bwp-BW77 Pikachu | $99.99 | $0.44 stored ESTIMATE | -100% |
| xy4-24a M Manectric EX | $13.55 | $26.00 cardmarket_avg | +92% |
| sm4-63a Guzzlord-GX | $6.84 | $1.00 cardmarket_avg | -85% |
| xy3-55a M Lucario EX | $48.20 | $9.50 cardmarket_avg | -80% |
| g1-RC15 Meowstic | $6.40 | $9.31 tcgplayer_holofoil | +45% |
| svp-106 Pikachu ex | $9.60 | $13.84 cardmarket_avg | +44% |

28 unchanged (the other side of each pair: TCGdex or a search row stating the
right number). 12 have no headline row: bw11-RC6/8/9/18/19/25, g1-RC9, dpp-DP05,
ecard3-H10/H11/H20/H30 — the page falls to pokemontcg.io's per-card blob
(H10 $1,249.94, H11 $1,000, H20 $338, H30 $659.99 — June/July; RC6 $14.48;
DP05 $575 from 2026/03/09). The "after" rows dated 07-27 are pokemontcg.io
readings, marked old by pricequality. Every one of the 59 is due tonight (no
current headline), asked again by the fixed matcher.

**Deals:** pool unchanged (80, floor $750); HGSS18 and np-36 stay held (97703),
neither re-enters.

**Tests:** cardnumber.test.js (the measured cases through the real matcher,
and through the old one from git to show they catch it); pricehold.test.js
--db fails on any product mapped to two cards not all held, and on any
collision from our search alone.

## 2026-10-09 (evening) — 106 cards held, invented low/high removed, TCGdex fields measured

- **Hold extended to every collision:** `collisionscan.js` (read-only) writes
  `pricehold-collisions.json` — 53 products, 106 cards — and pricehold.js holds
  all of them (a card in two collisions names both products; four do).
  `pricehold.test.js --db` fails when the file and the database disagree.
  Deals: only en-hgssp-HGSS18 and en-np-36 of the 106 would be in the 80-card
  pool; no live pick (7) is among the 106.
- **Invented TCGplayer low/high removed** from the set-cards payload and the
  server's live TCGdex fallback (that one around an ESTIMATE). nofabricated.test
  had read only the page, and only the spelling `est*0.65|est*1.7`. Widened to
  the page and server.js: no price-like field built as x a constant; any price
  x a constant (not 100) only at reviewed sites — one, the alert form's
  editable 85% default target. Shown to catch both as committed in b0b041a.
- **TCGdex fields** (read-only over all 21,256 visible English cards; 21,255 on
  TCGdex; GraphQL cross-checked against the card endpoint on 40 cards, 40/40):
  - **Dex number — NOT stored.** It is an ARRAY: 17,642 cards have one, 121
    have several (2: 109, 3: 10, 4: 1, 5: 1 — TAG TEAM, LEGEND halves,
    ecard3-47 [138,140,142]); 3,613 none (2,862 Trainer, 568 Energy, 183
    Pokémon — mostly 30th Celebration, where TCGdex leaves it out); 1 not on
    TCGdex. The task says stop on several numbers: Roy decides integer[] or not.
  - **Regulation mark — stored** (`writeRegulationMark`,
    migration-regulation-mark.sql for Roy). 8,293 have a mark, 12,962 none, 1
    not on TCGdex; marks D 1,256 · E 1,181 · F 1,156 · G 1,647 · H 1,303 ·
    I 1,278 · J 469, plus "j" 1 and the string "None" 2, which the writer
    refuses. Across the 55 REPRINT_OF pairs: 50 have no mark on either side,
    5 have a mark on the original (D x2, E, F, G) and none on the reprint;
    30th, 30th-c, cel25cc, base4 and lc carry no mark at all. On TCGdex's data
    the mark does not tell an original from its reprint.
  - **Card details:** PROPOSAL-card-details.md — shapes, coverage, sizes
    (~8.1 MB for all eleven), columns for filterable single values, one jsonb
    for the displayed lists. Nothing built.
  - Coverage of any new field: about 2,900 English cards come due a night,
    under the 4,000 cap — every card within 30 days of a migration.

## 2026-10-09 (later) — both sides of a collision held; how many collisions there are

- **Held, both sides:** `pricehold.js` takes the nine cards of the four
  collisions out of the headline (printsql.basePrintingSql), the card/set
  payloads say priceHeld with no price blob, the page draws a dash and the
  reason. Two were in the 80-card deals pool (en-hgssp-HGSS18 25th, en-np-36
  26th); none was a live pick.
- **The no-product-id threshold (5), measured:** Yahoo medians at most 4
  cards at one exact price on any day (3,884 prices, 45 days); 08/10's 274
  no-product-id cards at most 3. NOT covered by it: product-id'd prices repeat
  genuinely (6 products at $6.49 on 08/10), and Yuyu-tei's yen points put 71
  cards on $6.24 (08/28) — Yuyu-tei writes outside safePriceFor.
- **Collisions across the catalogue (read-only):** of 46,512 cards, 22,950
  carry a TCGplayer product id (24,433 distinct ids, from TCGdex's
  variants_detailed, TCGdex's pricing block and our internal search). **53 ids
  map to more than one card, 106 cards** (50 ids x2, 2 x3, 1 x4). Origin: 15
  the source (TCGdex gives both cards the id — Brilliant Stars Trainer Gallery
  vs main set, the two halves of the SM trainer kits, Rumble); 24 our search
  onto a TCGdex id (TCGdex gives it to one card, our search to another); 7 our
  search alone; 7 both. Our search's pattern: a lettered or prefixed number
  matched to the plain one — Skyridge H09/H10/H11/H20/H30 vs 10/11/12/21/32,
  Legendary Treasures RC6/RC8/RC18/RC19 vs 33/59/104/105, Aquapolis a/b,
  XY177/198/200 vs their "a" promos. Ten highest-value: np-36 / HGSS18 $1,400,
  ecard3-10 / H09 $509.99, ru1-3 Ninetales $373.41 (with ru1-5, ru1-6),
  ecard3-32 / H30 $354.93, ru1-6 $324.98, dpp-DP05 / DP25 $249. Not changed:
  the matching is a task of its own; only the nine above are held.

## 2026-10-09 — the duplicate-price guard replaced, the push gate committed, the key's last local copies deleted

- **The guard (`pricedupe.js`, replacing `looksLikeJunk`).** The old test
  rejected a price >= $5 within 1.5% of 5 of the last 12 — in a run ordered by
  value, that measures sort order. Now: refused when an earlier card in the
  run got the same price for the same TCGplayer product id (TCGdex and the
  internal search share the id space); with no product id, the same exact
  price from the same source on 5+ cards at >= $5. Different product ids
  always pass; no proximity, no window. A refusal names the card.
- **Replayed on the 08/10 run.** The batch was rebuilt from the database as
  it stood at 00:00:01Z (same selection, prices recorded before the run): 4,884
  due and every tier count equal to the log, 2,555 of the reached 3,952
  written — equal to the log. The 1,285 warnings carry no card, so they were
  matched in run order as two streams (TCGdex-priced cards to the 898
  tcgdex_* warnings, the rest to the 387 tcgplayer_market warnings): 1,272
  matched (881 of 885 TCGdex pairs within 25% of TCGdex's price today), 13
  TCGdex warnings unplaced, 125 unwritten cards genuinely without data. The
  old rule replayed on that sequence agrees with the run on 3,352 of 3,827
  priced cards (88%: its window is sensitive to small order differences).
  **The new rule refuses 0 of the 1,272**, and 5 cards the old guard WROTE —
  each a second card given the same product at the same price:
  en-dpp-DP25 and en-dpp-DP05 Tropical Wind = DP48 (product 90056, $249,
  TCGplayer search); en-np-36 Tropical Tidal Wave = en-hgssp-HGSS18 (97703,
  $1,400, TCGdex); en-ecard3-10 Gengar = en-ecard3-H09 (85669, $509.99,
  TCGdex); en-ecard3-H11 Houndoom = en-ecard3-12 (86201, $111.04, search).
  **Open:** the first claimant of each product is kept, though either card may
  be the wrong one; their stored prices are unchanged.
- **The three deal exclusions were wrong.** None of en-bwp-BW28, en-bw5-107,
  en-ex12-91 was in the 08/10 batch (written 07/10 00:01, due a minute after
  that run began): the old guard never touched them. Each product id belongs
  to that card alone in all of price_history; en-ex12-91 answers TCGdex again
  (200, $799, the stored price). All three are back in the pool.
- **The push gate** was a scratch script on one machine. `gatedpush.sh` is
  committed (full suite on a clean worktree of HEAD; pushes only on all-green
  with no suite missing; shown to refuse a commit with a failing suite) and
  CLAUDE.md now says: no push without it. The five times something went out
  or read green without running: the source-reading test, the deals photo
  count, the async assertion (reports.test.js), the 51 + 1 found by the
  assertion count, and 32e0cd3 pushed over a failing scopeguard.test.js.
- **The six local .bak files holding the old pokemontcg.io key are deleted**
  (three of cardhunt_preview.html, two of server.js, one of ingest.js; all
  untracked). No other file in the project holds it; git history still does —
  rotation is still Roy's.

## 2026-10-08 (night) — a leaked key, a guard that discards good prices, a nightly that dies quietly, tests that did not run

- **The pokemontcg.io API key was a literal** in `ingest.js`, `server.js` and
  `cardhunt_preview.html` — the page one public for as long as it was there;
  in git since `0ef2e73`, and in six local `.bak` files (untracked, not
  served). Now `POKEMONTCG_KEY` from the environment only; the page holds no
  key and calls pokemontcg.io keyless. `nosecrets.test.js` scans those three
  and every tracked source file for key shapes, and is shown to catch the key
  in all three as committed before (`4c6356e`). **The old key must be
  rotated** — removing it from the code does not take it out of history.
  Process: the fix was pushed with a failing suite (`scopeguard.test.js`
  named the removed `KEY` global) because the push was not gated on the
  result; fixed in the next commit, and every push since goes through a script
  that pushes only when the clean-checkout suite is all green.
- **The "same price for 5+ cards" warnings (1,285 in the 08/10 run, 486 on
  07/10) are a guard misfiring, not a fallback writing one price.**
  `looksLikeJunk` keeps the last 12 prices and rejects any >= $5 with 5 of
  them within 1.5%; the nightly works in descending value order, so
  neighbouring cards are genuinely close. 08/10: 1,079 distinct exact prices,
  no exact price more than 5 times, 1,239 of 1,284 consecutive warnings at or
  below the one before; by source tcgdex_tcgplayer_holofoil 536, _normal 288,
  _unlimited-holofoil 58, _unlimited 16 (898 product-matched TCGdex prices),
  tcgplayer_market 387; $5-10 264, $10-20 380, $20-50 386, $50-100 113,
  $100+ 142. A rejected price is NOT written — nothing junk reached the
  table — but the card keeps its older price. Deals: of the 80 pool cards 71
  were rewritten that night, 4 still equal TCGdex's price now (incl. live pick
  en-col1-20); en-bwp-BW28, en-bw5-107 (TCGplayer-search prices) and
  en-ex12-91 (TCGdex 503) could not be confirmed and are in `deals.EXCLUDED`
  until the nightly rewrites them. None was a live pick. **Open: the guard
  itself** — it should not judge product-matched TCGdex prices, or should not
  judge value-ordered neighbours; not changed this round.
- **The 08/10 nightly** reached 98.8% of English (2,555 priced, 1,395 no data)
  and ended in `^C` (LastTaskResult 0xC000013A); Japanese and Chinese never
  started; the log said nothing. `refreshrun.js`: a language not run, stopped
  at the --hours budget or errored -> exit 3 and "REFRESH INCOMPLETE — did not
  finish: …; did not run: …"; Ctrl+C / console close / terminate -> the same
  line and exit 130; a hard kill -> `refresh-run.json`, named by the next
  run's first line. A language that throws no longer aborts the rest.
- **Assertions that were not running while the suite said green: 51, plus 1
  that passed on an error.** Every test file now pins its assertion count
  (`testcount.js`, all 103 needed it). Found by V8 coverage of a plain run:
  preserve.test.js "every unavailable source states a reason" never ran
  signed out, and "/api/listings answers" passed on the 401 refusal body. Found
  by the guard's first clean-checkout run: gateaudit's ebayprobe.js check (1)
  and setyield's refresh-daily.cmd check (1) vanished silently, and
  sourcerank.test.js skipped all 48 and exited 0. Those three files hold no
  secret and no eBay content: now tracked, the skips removed — a missing file
  fails. Everything else coverage found never ran is behind --db / --live /
  --deployed or an error path.
- **TCGdex and languages (settled):** the same card id answers in en, fr, es,
  it, pt, de (TCGdex's set code and number are shared, so they give nothing to
  exclude); ja, ko, zh-tw, zh-cn, nl, pl, ru, id, th, es-mx, pt-br, pt-pt
  answer 404 for all five cards measured (sv03.5-151, sv03.5-199, base1-4,
  det1-10, ru1-10 — the last English only). No field links a card to another
  language; Japanese by dex number returns every card of the species (29 Mew,
  44 Charizard), the counterpart among several same-name cards of one set
  (SV2a: 4 Mew ex, 3 Charizard ex). No language map is built;
  TASK-query-language.md stays on keyword exclusion.
- **Artist and autocomplete:** the card page asked TCGdex for the artist on
  every view; the nightly now stores it from the card response it already
  fetches (`writeIllustrator`; `migration-illustrator.sql`, Roy runs it).
  Measured read-only on all 21,256 visible English cards (TCGdex GraphQL card(id) in batches of 50, agreeing with the card endpoint on 1,050 of 1,050 overlapping cards): 20,535 have an artist on TCGdex (96.6%), 720 are on TCGdex with none (90 sets — swshp 133, the XY and BW trainer kits, sve energy, ru1 Rumble), 1 is not on TCGdex (exu). Stored today: 0 — the migration has not run; after it, the nightly reaches them as each comes due (~4,000 a night, every card within the 30-day dormant tier). Japanese (14,463) and Chinese (8,313) get none: the nightly asks TCGdex only for English, and the page no longer fetches it live. Autocomplete asked pokemontcg.io from the browser on every
  keystroke (pokemontcg ids, typed text into the HTML unescaped); now
  `/api/suggest` reads our cards table, records nothing, escapes everything.
- Also: trending cards joined trending sets behind the door
  (`/api/trending/search`, approved only); the 30-day report-price rule runs
  on the deals-refresh clock; the search page's breadcrumb no longer shows
  "Search › —" on a fresh page. Suite: 108 files, all green on a clean
  checkout.

## 2026-10-08 (reports and pages) — compare off, one bar, one search page, red, reports, three logos

TASK-reports-and-pages.md, eight items, one session on main.

- **T1 Compare parked**: `openCompare`, its overlay and its i18n entries
  moved to `compare-disabled.js` (tracked, not loaded, not served), the
  checkout pattern. It never had a second side — "Choose card to compare"
  went to the search screen and nothing came back — and no endpoint
  (`POST /api/listings/:id/compare` is the photo check). `nofabricated.test.js`.
- **T5 Red**: the accent token, light `#C62128`, dark `#EB6B6C` (the logo red
  is 2.86:1 on the dark surface). Hard-coded colours that bypassed the token:
  4 of ours (the chart line, 3 values; the old purple glow) + 2 hard-coded
  cert reds. Left alone as categorical / third-party: source chips
  (TCGplayer blue), the TW tag, rarity gradients, Chinese set placeholders.
  Errors and warnings amber (`--warn` `#B45309` on `#FFF8E1`, 4.73:1; dark
  `#F3B35B` on `#332711`, 7.93:1); destructive buttons outlined in ink and
  named ("Reject account", "Delete alert"); `--crit` is price-down only.
  Radios/checkboxes were still the browser's blue: `:root accent-color`.
  Ratios per theme are computed from the tokens by `accent.test.js`.
- **T7 One top bar**: nine per-screen `<nav>` copies -> one `#topbar` outside
  the screens; `TOPBAR` (per screen: lit item, Back, search box, extras) is
  applied by `topbarFor()` from `SS()`. Account, theme, currency (price-only)
  and language now on every screen. No sideways scroll at 390px on any screen.
- **T2/T6 One search page**: the game picker and `#screen-results` merged
  into `#screen-search`; the bar's Search item, the home box and the bar's
  box all reach it via `doSearch`. Found dead: `pickGame` (the picker's
  Pokémon tile) and `sortResults` (the results sort) were never defined.
  Search terms were recorded nowhere server-side (only the visitor's own
  browser): `search_log` (migration-search-log.sql — NOT YET RUN), query
  capped at 120, the card when ONE matched, candidate count, no user, no IP.
  "Most searched" says not-recording / gathering (<20 resolved searches in 30
  days), never views. Trending cards: the % gain risers, public, no price.
- **Trending sets are approved-only (Roy)**: the risers list is our own data
  — `price_history` rows from TCGdex's TCGplayer block (`tcgdex_tcgplayer_*`);
  `price_history` held 0 eBay rows of 176,494 today — but a ranking by price
  movement is price information without a number. `/api/trending/sets`
  (access.priced), drawn behind the page's `.price-door`.
  **Open (Roy):** Trending cards is the same ranking and is still public.
- **T3 Reports**: Report under View listing (outside the row's link) -> reason
  + details (cap 1,000, refused over, not cut). `listing_reports`
  (migration-reports.sql — NOT YET RUN): RLS on, a user SELECTs own rows, no
  API-role write. Approved-only route; rate limit 5 / 10 min and 30 / 24 h,
  counted in the table. Masters: "Listing reports" beside Approve accounts,
  state changes only, built with DOM nodes + textContent. `reportprobe.js`
  (migration applied inside a rolled-back transaction) measured: A reads own
  1 row; B's 0; A inserts directly, updates B, inserts as B, deletes own ->
  42501 each; anon sees 0; hostile details round-trip byte for byte.
  Deviation from the task text: no RLS INSERT policy — it would let a pending
  account skip the approval check and the rate limit.
- **Report prices (Roy)**: listing id + URL kept; the eBay price is cleared
  when a report is actioned/dismissed and on any report >30 days old
  (`reports.clearPrices`, run on file / before the masters' list / after a
  state change — no scheduler). On real Postgres (rolled back), 7 rows, rule
  and SQL agreed on all: 4 cleared, 3 kept (incl. a Yuyu-tei row — not eBay).
  Gap: with no report activity, an old price waits in the table until the next
  read; nothing displays it before it is cleared.
- **T4 Logos**: `ex5.5` Poké Card Creator Pack (5 cards), `mfb` My First
  Battle (34), `exu` Unseen Forces Unown Collection (28, the file's Unown O;
  Roy) — served by name from `SET_LOGOS` (`/set-logos/<id>.png`),
  `set_logo_source 'cardzon:<file>'` via `setlogo.js`. ex10 keeps TCGdex's.
- **T8 Set link**: the card page's breadcrumb set link was
  `onclick="SS('setdetail')"` — no set named, so it showed the last set opened
  or an empty page (measured: "—", 0 cards). Removed with the breadcrumb; the
  details row's set name opens `<lang>-<set id>` (Japanese/Chinese lists
  loaded first). `setlink.test.js` also fails page-wide on any handler calling
  an undefined function — on the pre-session page it names the breadcrumb,
  `pickGame` and `sortResults`.
- **Test tooling lesson:** an unawaited assertion followed by `process.exit`
  never runs and the suite still says "passed" (caught in reports.test.js).
- Suite: 98 -> 103 suites (5 new test files), all green on a clean checkout before each push.

## 2026-10-08 (deals supply) — a shelf with its own supply and no eBay data on it

- **The design (Roy):** the shelf shows OUR data only — card, TCGplayer market
  price, "Deal found 2 h ago". Nothing of eBay's until a click; the click IS
  the check (`/api/deals/:id/live`, 1 getItem, 0 within 15 min): sold, ended,
  out of stock or no longer 15-60% below at its live price -> the pick is
  deleted and the tile says why. Otherwise eBay's own zone: "From eBay",
  delivered price, link — never a comparison number; the reader sees the gap.
- **The deal % is internal** (it chooses which listings qualify): never shown,
  never stored — the same ruling as the outlier medians (§8.1(d)). The shelf
  is ordered by OUR price, not by it.
- **Supply:** `POST /api/deals/refresh` (tooling key) runs `deals.pickVouched`
  over 80 English cards by TCGplayer price (current, back-check family, not
  EXCLUDED), waiting up to 90 s a card for its photo checks; `deal_picks`
  holds card, item id, found_at, run (RLS on at first use). A GitHub Actions
  schedule (`30 */3 * * *`) starts it and polls `/status` every 2 min — the
  polling keeps the free-tier instance awake. Calls are BACKGROUND:
  `ebaycall` now treats a background context as background for every call in
  it (before, only a tooling context overrode a call's own flag — the job's
  searches would have counted as user and never yielded at the soft stop).
- **getItems (multi-item lookup) is closed to our keys**: `statusprobe`,
  2026-10-08, HTTP 403 "1100: Access denied" at 20 and 21 ids; the search in
  the same probe answered. Not applied for (Roy); the click design needs none.
- **Removed while building:** the view-time deals back follow-up (it spent
  getItem calls for the old cached-view shelf) and the probe's legacy pickDeal
  path. Then (same day) `deals.pickDeal`, `backCandidates`, `solidRows`,
  `noGenuineBack`, `MIN_TRUSTED` deleted; their row-level cases moved onto
  `deals.notADeal` both ways (deals.test.js 85 -> 68 assertions: the 17 gone
  tested only the deleted picker).

### QUEUED — after the UI task (TASK-reports-and-pages.md), in this order (Roy, 2026-10-08)
1. **PRERELEASE stamp template** in stampcheck (same machinery as the 25th
   stamp), measured both ways before it ships; first count how many cards
   have a prerelease printing at all. It is the removal condition for
   `deals.EXCLUDED['en-base5-8']` (Dark Gyarados).
2. **Set headline flag** — stashed (`git stash list`: "WIP set headline
   flag"): `sourceEbay` asks the reprint family's eBay Set values (+1 call, US
   page 1, the 55 originals), rows filed there cannot set the headline (still
   listed, still deal candidates). Option S (refusing on Set) is FALSIFIED.
3. **Lugia sibling-check investigation** — 185/195 sold as 186/195 passed
   the sibling check: was 185 in the reference set, or is the comparison too
   tolerant? Then how widespread: cards with same-name, same-set siblings of
   different artwork, and what the check scores on deliberate swaps.
4. **40-size stamp grid** on the 55 REPRINT_OF originals only (the reprint
   stamp check applies nowhere else); re-measure the 0.70 threshold against
   the 491 genuine photos before shipping (`stampmiss.fixture.json`: 9/16
   misses recovered at 40 scales, genuine max unchanged at 0.592).
- **§9.5, found while building:** card tiles (Latest searches, My alerts)
  showed "avg listing $X median of N" — an eBay median computed IN THE PAGE.
  Removed (`cardListingAvg`, `fillListingAvg`, the cache); tiles keep a
  card+grade key (`tileKey`) for our price.
- **§8.1(b)(2) layout:** "Cheapest trusted listing" left our price-box row;
  eBay's listings sit in a bordered "Listings from eBay" section headed by
  eBay's own cheapest trusted listing (`cheapestBySource.ebay`); every other
  marketplace gets its own section (`renderOtherSources`).
- `listing_views.caller` (user / tooling / background) records who opened a
  card, so "most-opened" can count real users later.

## 2026-10-08 (licence) — the eBay API License Agreement, read, and what it removed

Read in the browser (developer.ebay.com/join/api-license-agreement answers 403
to scripts) on 2026-10-08. Roy's rule: never risk API access; where a reading
is uncertain, remove the thing. Allowed: a listing's own price, and a link to it.
Pinned by `ebayterms.test.js`.

- **§9.5** (Restricted Activities, 5th item): "Use eBay Content, either alone
  or in combination with third-party information, to suggest or model prices
  for items listed on eBay Site." Removed: the grade value box's eBay median
  (`gradePrice`, never computed now; the estimate box stays, labelled
  estimate); "median $X" in the print-run groups ("from $Y" stays);
  `gradeprices.js --write` (exits 2 before running; the INSERT is deleted;
  0 `ebay_median` rows ever existed). Kept and relabelled: the headline is
  "the cheapest trusted listing" (a listing's own price), never "this price";
  every discount says "below the TCGplayer market price" (`deals.refLabel`).
- **§8.1(d)**: "You must have eBay's express prior written permission to use
  or display eBay Content in any way that enables derivation of, including
  without limitation, any of the following: Any site-wide statistics across
  eBay Sites or within any eBay Site; Take-up rates for enhanced listings ...;
  Statistics relating to the performance (financial or otherwise) of any eBay
  Service (for example, gross merchandise sales); Average selling price or
  gross merchandise sold for any eBay category." **Ruling (Roy): outlier.js's
  medians are per card, per view, of asking prices, never shown, never
  stored — outside every listed item.** To keep them "never shown",
  `publicOutliers` strips median/low/high/spread/bands from the payload, and
  no flag reason prints an eBay-derived number (it names the yardstick).
- **§8.1(c)**: listing information at most 6 h older than eBay's, the age
  disclosed. **§8.1(b)(1)**: delete content no longer publicly available.
  **§3.1(b)**: intermediate copies only as needed, deleted after. So the deals
  shelf may store picks: refreshed every 3 h, found-at shown, a listing no
  longer live removed (multi-item status check). The archive's "never
  stored" note is corrected in place.
- **§8.1(b)(2)**: eBay Content "may not be co-mingled or combined with
  non-eBay Content ... must be visually isolated from third-party listings or
  other non-eBay information" — a layout proposal is owed to Roy, not built.
- Moved out of CLAUDE.md for budget (pinned by `brand.test.js`): mark C
  `#C62128` both themes, Z `#686858` light / `#EBE7DB` dark; wordmark Card
  `#C62128` light / `#C54748` dark, Zon as the Z; hairline edge in dark only
  (the C is 2.86:1 on the bar).

## 2026-10-08 (deals on) — the shelf, its ceiling, and prerelease

- On for approved accounts, on the vouching bar (`deals.pickVouched`, one
  definition for shelf / follow-up / probe). 15-60% below; past 60% skipped
  (Lugia 185 sold as 186 at 85%). "HP" away from a hit-point number skipped.
- "Prerelease" a printing conflict outside a set's first 12 months: 9,958
  kept titles, 86 newly refused (83 Dark Gyarados, PRERELEASE stamp seen on
  5 of 5 looked at; Uxie, 2 Rocket's Zapdos with reprint stamps), 0 newly
  kept; 3 early-copy SIRs kept. No catalogue card is a prerelease printing.
- Live bar, 40 cards: 6 picks; 5 look clean, Dark Gyarados again prerelease-
  stamped under a silent title -> excluded (`deals.EXCLUDED`, with its removal
  condition) until a PRERELEASE stamp template catches it.
- Stamp misses (`stampmiss.fixture.json`): the 16 visible stamps scored
  0.542-0.699 at 50-89 px — on the stamp in every crop, under 0.70. 40 scales
  instead of 10: 9/16 reach 0.70, genuine max unchanged (0.592). Not shipped.

## 2026-10-08 (Set split) — eBay's Set field cannot refuse; and the deals bar could not pick twice

### Option S, measured both ways (`setprobe ?split=1`, `114d87b`; ~150 tooling calls)
54 originals (55 REPRINT_OF pairs): production raw query (1 call) plus the same
query filtered to each reprint-sounding Set value (<=3 a card). Scored on the
card's OWN family's values only (Celebrations / 30th); "EX-01 Booster: Classic
Collection" and "McDonald's 25th Anniversary" are not our families. Photos:
reprint-stamp check run locally (0 calls, nothing stored), then by eye.
- Rows filed under the reprint's Set: 3,036; the title gate keeps 349 today.
  Stamp found on 307 (reprints, already refused by the photo gate).
- **False refusals: the other 42, looked at one by one — 25 GENUINE originals**
  (Base Charizard $1,000, Birthday Pikachu $420/$550, Shining Magikarp
  $400-$850, Blastoise $46-$232, 1st Edition Cleffa, Reshiram FA x3, ...), 16
  reprints with the stamp plainly visible, 1 unclear. Sellers file real
  originals under Celebrations: Classic Collection. **Refusing on Set would
  remove 25 genuine rows of 42 that no photo check can vouch either way.**
- **Misses: 1,264 of the 1,464 kept rows the stamp check finds reprinted (86%)
  are NOT filed under the reprint's Set.** Set catches 14% of visible reprints.
- The compound rule ("reprint Set and not the original's") cannot be measured
  this way: inside a Set-filtered search eBay's Set histogram lists only the
  filtered value, at count 0.
- Coverage gaps: 6 cards (30th family) never had their own value fetched (the
  probe took the top 3 by count); some filtered results capped at 200.
- **Second finding: the stamp check said "not-visible" on 16 photos with the
  25th stamp plainly visible** (Blastoise $16.52-$60, Venusaur $28, Rocket's
  Zapdos x3, M Rayquaza x2, Umbreon, Tapu Lele, Mewtwo EX, Groudon $2.50,
  Dark Gyarados $10) — ~5% of the 324 reprints in this sample, consistent with
  the measured 92.5%. Both Blastoise rows Roy settled are among them.

### Deals: no row could be picked twice (`1616a53`)
The production-path run (40 cards, zip=none, current build) picked **0** — run
2 picked 1, run 1 four. Cause: a back verdict from the cache or the store kept
no photo count, and the bar read the absence as "0 photos (needs 2+)" — every
row whose back had been checked once was skipped forever after. The cache now
keeps the count; a stored verdict gets it from the shared 15-min getItem when
the bar asks (within DEAL_BACK_MAX); unknown says "not known".

### Also (`fd42266`)
The stampcheck hide line judges the item price (third laundered threshold);
the deals discount stays delivered, pinned by a test.

## 2026-10-07 (ZIP union) — more deals, and shipping that launders a too-cheap row

Probe only, not production: `/api/ebay/dealsprobe/:id?zip=none|union&bar=vouch`
(`15bd02d`) builds an isolated view (no cache write, no production follow-up);
`union` asks eBay US twice, with and without `X-EBAY-C-ENDUSERCTX`
(ZIP 10001), merged ZIP-first. 40 cards recorded in `zipunion-cards.json`
(the 80 of runs 1-2 were never written down). 172 tooling calls in all.

### Five cards, both modes (marketprobe, US page 1, 20 calls)
Blastoise 2/102, Base Charizard, Dark Charizard 4/82, Charizard GX 150,
Giratina V 186: no-ZIP kept 183 rows, 93 with stated shipping; ZIP kept
230, 229 stated. Shared 122; no-ZIP only 61 (dearer), ZIP only 108 (every
one inside the no-ZIP page's price range). Union 291 rows, 282 stated.

### 40 cards, vouching bar, both modes
| | no ZIP | union |
|---|---|---|
| eligible picks | 4 | 7 |
| rows examined | 3,441 | 4,174 |
| "shipping not stated" skips | 1,426 | 73 |
| "photo not checked yet" skips | 168 | 707 |
| search calls per view | 1.00 | 2.00 (2.25 with reprint/language pages) |

Headlines (cheapestLive): 6 unchanged, 28 up 1-25% (shipping now in the
delivered price), Lugia Aquapolis $230 -> $8,674 (enough rows for the outlier
check to flag the $230), and **5 down**.

### Shipping launders a too-cheap row
The cheap floor flags a row under 10% of the median, judged on the DELIVERED
price. Four of the five drops were rows the no-ZIP view had flagged, lifted
over the line by the ZIP's shipping quote: Blastoise $20 (< $26) -> $25.82
(> $21.52); Dragonite ex $50 (< $52.49) -> $55.71; Pikachu SM162 $10 (< $17)
-> $18.80 (> $18.00, by 80 cents); Charizard VSTAR SWSH262 $8 (< $9.70) ->
$14.07, title "GOLD FOIL". Gameable by any seller: move money from price
into postage. The fifth, Charizard CC002 $35.72, is a ZIP-only row from a
seller at 78 feedback, 0% positive.

### The headline never looks at the seller
Headline rows tonight came from sellers at feedback 1, 4, 5, -4 (0%) and 78
(0%) on cards worth $150-$525. `outlier.trustworthy` is the whole test.

### Deals and the top-25 rule
707 rows skipped "photo not checked yet": past a view's top 25 nothing is
compared until a visitor scrolls (`deb83b7`), so the shelf can never vouch
for such a row. 7 is a floor, not the yield. Shape agreed with Roy: deals is a
background job and asks for comparisons of the rows it judges; not built.

### The fixes, measured on the same 40 (rows=1 capture, 136 calls)
- **Item price for the floor** (`baff795`, deployed): both rules replayed on
  identical rows of all 80 views — 7 rows newly flagged, **0 un-flagged**;
  all 7 are union rows lifted by ZIP shipping (the four above, and three
  Charizard GX 150 at $76-80 under a $80.61 line, sellers at 0-1 feedback).
  Replay matched the live flag count on 70 of 80 views (in 10 the live view
  flagged slightly more, rows later gates remove).
- **Headline seller floor** (`e2b91c4`, branch only, threshold Roy's):
  19 of 40 headlines were sellers under 10 feedback. At 10 @ 95%: 20 change,
  median +123% (Umbreon VMAX $800 -> $1,981 against $2,292). 20 @ 97%: 23;
  50 @ 98%: 27.
- **Union drops** under both: 5 -> 2, both ZIP-only rows. Charizard VSTAR
  SWSH262 $40.27 (251 @ 100%, 59% of market — plausibly a real cheaper ask);
  Blastoise $30.06 (69 @ 100%, 13.5% of market) — unexplained; several
  established sellers ask ~$25. Union NOT shipped.

### Blastoise: the ~$25 rows are Celebrations reprints (Roy, by eye + eBay's Set)
- Both rows carry eBay Set "Celebrations: Classic Collection" and link to
  eBay's Classic Collection product; titles say "Base Set ... 1999".
- `0ab77cb` (deployed) moves the reprint band check to item price, band and
  rows. **That alone does not catch them.** My earlier "$23.99 sits inside
  $16.06-$25.37" compared an item price with a band built from DELIVERED
  prices. On item prices the CC001 band is **$13.59-$22.99** (median $18.03):
  the reprints ask $23.99 and $25.00, the top of the reprint's own market.
  Union headline still $30.06; the union is NOT shipped.
- A third delivered-price threshold: `stampcheck.gate` hides an unchecked
  row under 55% of market on the delivered price (`stampcheck.js:890`).
  Reported, not changed.
- eBay Set, Blastoise query (setprobe, 3 calls): not in the search summary;
  a refinement aspect, multi-valued (counts sum to 129% of 1,684): Base Set
  1,486, Celebrations: Classic Collection 217; filtered searches 1,457 / 199.

### Gate work, found by the picks (not fixed)
- "PRERELEASE" in a Dark Gyarados 8/82 title passed as the base card — a
  prerelease stamp is another printing.
- "Rare Regular" on Dark Gyarados 8/82 — may name the non-holo version.
- "Alakazam EX 125/124 HP" — HP after the number may mean Heavily Played,
  not hit points. A genuine ambiguity; needs a rule (the condition gate reads
  "120 HP" as hit points by design).

## 2026-10-07 (two sessions) — one branch, two writers

The photo-speed session and the logo session both had `server.js` open on
`main`. Roy: it cost interleaved commits, a mutual test break, and a near-miss
on `server.js`. The Claude Code tab in the desktop app was one of the writers —
it is a full session with write access, so closing the terminals did not leave
one. Rule in CLAUDE.md (Deploying): one session on `main` at a time, or
separate branches.

Checked after the logo push (`a10ccdc`): its parent is `51b0486`, the speed
session's last commit; `git diff 51b0486 a10ccdc -- server.js` removes only
the three logo routes; the page diff touches only the logo, its tokens and the
stamp. The speed work is present in `a10ccdc` (`POST
/api/listings/:cardId/compare`, `stampcheck.PRIO`, s-l400 comparisons); no
other branch, stash, worktree or commit outside `main`. Full suite on a clean
checkout of `a10ccdc`: 95 suites, all exit 0.

## 2026-10-07 (vouching bar, run 2) — the same 80 cards with the clean gate

128 tooling calls (views partly cached), no ZIP (production path). 2,906
listings examined, **3 eligible** (Blastoise 2/102 $119, 47% under; Base
Charizard $725.08, 20%; Dark Charizard 4/82 $307.74, 19%). Skips: shipping not
stated 1,143 · not 15% under 1,069 · current bid 163 · other printing 110 ·
implausible 93 · condition below NM 55 · unusually-cheap 48 · year-stated 47 ·
counterfeit-likely 22 · seller feedback 19 · other edition 6 · reprint-priced 6
· too few photos 4 · back no-claim 1 · metal photo 1.
- None of run 1's five wrong picks returned (MP Blastoise, MP/HP Dark
  Charizard, NM/LP M Charizard EX, Brazilian SM191, Magnemite: gone or refused).
- **Defect in the bar:** run 1's two valid picks (Charizard GX 150, Giratina
  V 186) are still listed and now skip "0 photos (needs 2+)" with 0 back calls —
  the back verdict was stored, the getItem not re-read, and the photo count read
  0 from absent data. Absence of a READ is not absence of photos. Not fixed.
- Blastoise looked at by eye: the right card (Unlimited), visible holo
  scratches under eBay's "NM" field.

## 2026-10-07 (buyer location) — a ZIP states shipping AND changes which listings come back

`marketprobe ?zip=10001&pages=1` sends `X-EBAY-C-ENDUSERCTX:
contextualLocation=country=US,zip=10001` on the same search (0 extra calls).
Card en-me05-116 (Mega Darkrai ex SIR; 78 of its 176 rows had no stated
shipping in the first vouching run). US, Raw NM, one 75-row page, each mode
run twice (6 tooling calls in all):

| | kept | shipping stated |
|---|---|---|
| no ZIP | 69 | 59 |
| ZIP 10001 | 69 | **69** |

- Each mode returned the same 69 kept items both times; the two modes share
  only **31**. On those 31: 29 identical shipping, 2 gained a calculated cost
  ($5.61, $5.96), 0 changed.
- The 38 ZIP-only rows run $31-$200, all with odd-cent (calculated) shipping;
  the 38 no-ZIP-only rows run $200-$322, 8 with no shipping. 34 of the 38
  ZIP-only titles appear nowhere in the no-ZIP answer. So **without a buyer
  location the price-sorted first page left out cheaper listings** that use
  calculated shipping; with one, they come back with a cost.
- One card. Production does NOT send the header: it changes the result set of
  every view, and a quote to one ZIP is an estimate for every other buyer —
  Roy's decision, measured on more cards first.

## 2026-10-07 (gate fixes) — three holes the vouching bar found, closed and measured

First vouching run (80 cards, /api/ebay/dealsprobe?bar=vouch): 2,966 listings
examined, 7 eligible, 2 held up (Charizard GX 150, Giratina V 186). The other
five passed through the GATE, not the bar:

- **Condition** (3: MP, MP/HP, NM/LP in the title, eBay dropdown said NM).
  Now the worse of dropdown and title stands; a range states its lower end
  (`worstStatedCondition`, `conditionConflict` on the row). 939 rows: title-
  stated condition 23 -> 36. **Headline price: 0 of 9 cheapest changed** — the
  fix matters for the condition filter and the deals bar, not the headline
  (Roy's price hypothesis, checked and wrong). condition.test.js (19).
- **Kit names** (Magnemite 4/10 under Latias #4 via "Latias & Latios"). Name
  check is a bounded word with the kit pair masked. 1,777 titles: 36 newly
  refused, all different cards; 0 newly kept. kitname.test.js (11).
- **Language words** (a "Brazilian" SM191). Added Brazilian/Brasil/PT-BR,
  Polish (+ flag), Mandarin. Taiwan/Hong Kong/Thailand only beside a printing
  word (Roy: a place is not a language); 🇭🇰 removed. 2,416 titles: 1 newly
  refused, 0 newly kept. langwords.test.js (23).

Skips on the first run: 1,122 shipping not stated, 703 not 15% under our price,
427 photo not checked yet. Deals: OFF, blocked on a clean re-run plus yield.
Quota: tooling 1,000 for 2026-10-07 UTC, authorised by Roy (fffa5ba); reserve
and hourly cap unchanged.

## 2026-10-07 (language exclusion) — measured on five cards: neither route ships as a replacement

marketprobe, EBAY_US, Raw NM, titles=1, sort=price, 75 x up to 3 pages;
53 tooling calls (243 -> 296 of 300), 2026-10-07 23:2x UTC. The gate unchanged
throughout; "kept" = passed it.

| card | none: total/kept | words: total/kept | aspect: total/kept | kept-before LOST, words | LOST, aspect |
|---|---|---|---|---|---|
| Mew ex sv03.5-151 | 1,297 / 11 | 515 / 214 | 853 / 182 | 4 of 11 | 0 of 11 |
| Charizard ex sv03.5-199 | 321 / 151 | 220 / 145 (not capped) | 299 / 160 | 41 of 130 | 9 of 130 |
| Pikachu sv03.5-025 | 2,481 / 150 | 1,588 / 170 | 1,971 / 160 | 40 of 112 | 3 of 112 |
| Charizard xy12-11 (EN only) | 784 / 132 | 394 / 141 | 735 / 140 | 51 of 130 | 9 of 130 |
| Pikachu on the Ball fut2020-1 (EN only) | 42 / 7 | 31 / 6 | 41 / 7 | 1 of 7 | 0 of 7 |

- "LOST" = kept under none, absent under the mode. Results come cheapest first
  and an exclusion only removes items, so a row kept inside the none window
  stays inside it unless excluded. Every lost title is plainly English and NONE
  contains an excluded word: eBay's `-term` matches beyond the title (which
  field is unconfirmed — item specifics such as a country of manufacture are
  the likely one). On Charizard ex the words probe was not capped (219 of 220
  scanned), so its 41 are gone from eBay's answer entirely.
- Recovery is real (Mew 11 -> 214 words / 182 aspect; foreign refusals 209 ->
  0 words, 36 aspect), but both modes drop genuine English listings, including
  on English-only sets where there is nothing to exclude. Per the rule set
  before measuring, aspect is ruled out by its 21 lost (0+9+3+9+0 of 390),
  words by its 137.
- `?lang=notspecified` (Language:{Not Specified}) returned totals identical to
  none on all five: eBay ignores the value; those five probes measured nothing.
- Cap: still hit by every 151 / Evolutions probe in every mode (225 of 515 to
  2,481). Whether to page further is a quota decision.
- Production unchanged: LANG_EXCLUDE_DEFAULT = 'none'.

## 2026-10-07 (night) — fcfade6 red on a clean checkout; node_modules deleted through a junction

- `fcfade6` (other-language exclusion, default off) left ebaypaging,
  gradefilter and selector red on a clean checkout of HEAD (found by the roles
  session). I had run four related suites, not the full suite. ebaypaging
  slices sourceEbay and a listed set of helpers out of server.js; the new
  top-level `languageExclusionFor` was not listed -> ReferenceError in the
  harness only — in the module it is a top-level declaration beside
  sourceEbay, so no deployed path (open, Load more, other sites, marketprobe)
  could reach an undefined symbol. Fixed in `cbb9be1`; the paging test now
  also pins that the default request carries no exclusion.
- The clean-checkout run then showed two more red suites, pricecheck and
  refused, red at dc82d46 too: a fresh checkout here is CRLF
  (core.autocrlf=true), the working tree LF, and their slicers end on
  "\n}\n". Fixed in `6212fec` (strip CR). Fresh checkout of 6212fec:
  **85/85 suites, 4,500 assertions, jptest 88/0**.
- My error while doing that: the first clean worktree had a junction to the
  real node_modules; `git worktree remove --force` deleted through it and
  emptied node_modules (01:45 local). The sibling backfill then recorded 19
  cards 'unbuildable: Cannot find module jpeg-js' in 44 s before I stopped
  it. The 19 rows deleted (exactly that reason and window); `npm ci` restored
  86 packages from the unchanged lockfile; backfills restarted. Clean
  checkouts now resolve packages through NODE_PATH, no link.

## 2026-10-07 (later) — The door (catalogue public, prices approved-only) and the per-user record

Notes here only: CLAUDE.md was being compressed by the speed session.

- **Master display** (`68a58a7`, pushed): `roles.displayRole` — a listed email is
  master whatever `user_access.state` says; the masters' list files masters under
  Masters only (the page never drew that section), and approve/reject on another
  master is 409. Nothing writes 'master' to the state column.
- **The door** (`b24a9ca`): `access.priced` on 11 routes (price, history,
  listings, graded, market, trending, deals, cert, photos, stamp, back) — no token
  401 `{"error":"sign-in required","reason":"no token"}`, pending/rejected 403;
  the tooling key passes (audit scripts send it), never as a user.
  `access.optional` on the catalogue (sets, set cards, card, search, sets/lang,
  diagnostic): `pricegate.strip` removes every price/listing/link key for anyone
  not approved; private,no-store + Vary Authorization; search does not chain into
  listings for them (no eBay call). `pricegate.test.js --db`: none of the master's
  price numbers reach anonymous or pending under any key, 10 routes.
- **The page**: prices start closed; one note where each price block was; no dash,
  $0 or estimate (`getBase` and the page's own `mockP` return nothing while
  closed — the set page had shown mockP estimates and pokemontcg.io prices fetched
  by the browser, which no server gate can reach). Pending/rejected browse the
  catalogue; their waiting screen is in the account panel. Chrome, local server,
  signed out: home, Pokémon, sets, set page, results, card pages — no currency
  figure; no priced endpoint called. **The approved path was not seen in a
  browser** (no sign-in locally) — check on /app after deploy.
- **Per-user record** (`505c879`): `/api/admin/users/:id/record`, master,
  read-only; approved non-master -> 403 `{"error":"masters only","state":"approved"}`.
  **Claimed browser ids are not recorded** (the claim overwrites alerts.user_id;
  no anon id, no date) — the record says so; nothing new recorded to fill it.
- **A data-deletion request would touch:** `user_access` (the row; other rows'
  `decided_by` may point at a deleted master), `alerts` and `portfolio` (by
  user_id), legacy `users` (0 rows, nothing writes it), and the Supabase Auth
  account itself (auth schema, via Supabase's admin API — not our tables).
  No user column in `listing_views`, `listing_photo_verdicts`, `price_history`.
- **Contradictions found:** `/api/trending` was LIVE (home movers, Pokémon
  trending), not off — gated now; `/api/deals` was off (`enabled:false`), gated
  now. `fcfade6` (language exclusion, other session) fails ebaypaging (CRASH
  languageExclusionFor is not defined), gradefilter and selector on a clean HEAD.
  `/api/sets` proxies pokemontcg.io, which 500s intermittently.
- **The tooling key is now a bearer token for the whole product** (Roy, 2026-10-07):
  `CARDZON_TOOLING_KEY` opens every priced route, not just the probes — accepted
  because the audit scripts need it. It must never enter the repo, a log, or a
  shared machine. Lost or exposed: rotate it on Render AND in the local
  environment (both, same value), then confirm a probe with the old key -> 401.
- Left public, said: `/` and `/api/db/check` (counts of price records, not
  prices), `/api/listings-log` (calls per view, no price or link).

## 2026-10-07 — Security follow-up (TASK-security-followup.md): tooling key, emails, schema guard, live RLS

- **T1, tooling key** (`5585d39`, rename `65d4fff`): the seven `/api/ebay/*`
  probes and `quota?probe=1` need `X-CardHunt-Key` = env `CARDZON_TOOLING_KEY`,
  checked on the route line before cache/token/quota. Deployed 2026-10-07: all 8
  -> 401 with no key, wrong key -> 401, ledger read 200; tooling count 238/300
  before and after (0 spent). `toolingkey.test.js` under costmeter: 24 refusals,
  0 eBay HTTP; the right key spends 3.
- **T2, auth.users "0"**: DATABASE_URL ref = SUPABASE_URL ref (`opztouqaetxyfyhcwvwa`);
  `auth.users` counted 2 from DATABASE_URL (postgres, BYPASSRLS) — the 0 did not
  reproduce; nothing granted. Masters' list now reads `user_access.email`,
  written from the verified token at sign-in (`5842293`). After deploy: 2 of 3
  rows captured on sign-in, 1 awaiting its next sign-in.
- **Tests cannot change the schema** (`aac5992`): `roles.test.js --db` had added
  `user_access.email` to production via first-use migration. `schemaguard.js`
  refuses DDL on every test connection before sending; 14 db tests moved to it.
- **T3, RLS over a real session** (Roy's token, run by Roy): read/update/delete
  of another user's alert matched 0 rows, insert-as-other 403 `42501`,
  self-approval 403 `42501` permission denied. Identity is the token's sub
  (PostgREST reads it from the JWT; 403 vs anon's 401). Not shown: a positive
  read of the token's own rows over REST.
- **T4**: deployed `/api/deals` -> `enabled:false`. Signed-out `POST /api/alerts`
  -> 401. Of the "8 alerts on 3 anon ids", 5 were claimed by account
  2fb0f327 on 2026-10-06; 3 remain on 1 anon id (1 active, evaluated nightly).
- **Decided 2026-10-07 (Roy):** the unclaimed active alert keeps being
  evaluated; signed-out visitors stay unable to create alerts (anonymous
  alerts are what created the orphans).

## 2026-10-06 (late night) — Speed: the card page waited on our own reference scans

The rule this work enforces: **a visitor's request never waits on a
third-party host**, whatever that host's speed on a given day.

### Measured first (TASK-speed.md, Chrome against Render, `?debug=1`)
- Card page cold: Charizard ex sv03.5-199 server 6,314 ms, of which 4.1 s
  (65%) fetching and decoding our own scans of the card and its same-name
  siblings (`photoChecksFor` -> `wholeTemplateOf`); Mew ex sv03.5-151 3.8 s of
  5,857 ms. eBay itself 1.2-1.5 s. `SIBLING_BUILD_MS` (3 s) overran by ~1 s:
  the synchronous JPEG decode blocks the timer.
- Set page cold: data in 0.4-0.5 s on an 8-10 KB payload; >90% of the visible
  wait is thumbnails from assets.tcgdex.net (3.6-20 s each). Not yet fixed (T4).
- Warm card page: 423 ms (15-minute view cache).

### T1 — is the sibling check actually running? (20 cold cards, 20 sets)
- Build timeout fired 0/20 that afternoon; references built 26/26.
- Sibling VERDICTS in the visitor's answer: 0 of 969 rows. First verdict
  ~12 min after the views; 600/969 (62%) by +20 min. Cause: up to 300
  colour-profile jobs per cold view go to the FRONT of the one photo worker
  (`stampcheck.js` queueMaterial, `5160962`); queue 1,749 deep; 984 profiles
  ran before the first sibling job. Not changed — a decision for Roy.
- Stored-verdict hits on cold cards: 0/969 (new listings; expected).
- A timed-out or failed scan used to drop the sibling check with no trace.

### What shipped (local, held until the roles session pushes)
`1f3651d` references built ahead (`refbuild.js` -> `card_reference_scans`,
24-px template, 600/600 + 18/18 scores identical to the 96-px one) ·
`61d6a6e` photo-job time split in `poolState` (measurement only) ·
`feb5788` `version` column (`ref-1-w24`; 2,806 rows stamped after checking
all were 24x33) · `d935f9f` live fallback for unbuilt cards, exactly the old
path, failures now reported · `29ebecd` PNG scans decoded · `aa1c831` page:
"Not checked yet", and a check that could not run is named.
- Storage: Supabase Postgres, ~2.9 KB a row with overhead, ~20 MB for 6,962;
  database 148 MB (price_history 62 MB / 172,239 rows, cards 55 MB, verdicts
  10 MB / 32,013 rows).
- Backfill: resumable by construction (a hard kill lost nothing: 17 stored,
  restart at 6,780 - 17). 0.3-0.5 scans/s, slowing to 0.12/s with timeouts;
  paused when free RAM on the Windows machine fell under 1 GB.
- Unbuildable is a moving set: 78 -> 136 as the backfill went on (PNG 67 ->
  86, no scan URL 10 -> 48, HTTP 404 1 -> 2).

### PNG references — measured in ONE direction only
- Alakazam EX fixture, 18 synthetic photos: every genuine kept, every swap
  found; margins ~1.2x wider both ways than with JPEG references.
- Real eBay photos of sm3.5-39, ecard3-H01, cel25-25: 0/111 refused, highest
  margin 0.175. **No swap among them: the catching direction on PNG is
  untested. Not equivalent to JPEG.**

### Open
T3 re-measurement and the two queue questions (what the 300 colour profiles
per view are for; is the worker CPU-bound on Render) wait on the push. Then
`node refbuild.js --retry-unbuildable`, reporting what comes back. T4
(thumbnails through our own cache) after T3 is confirmed.

## 2026-10-06 (night) — T6 step 2: roles, the gate, the closed door, approval, RLS, alerts

Six commits: `3fee684` roles · `6af3bc6` gate · `f68c278` door · `a608e75`
approval · `180e3dd` RLS · `f842ab7` alerts. Pushed; see "Deploy" below.

### Found: RLS was off on every table, and the anon key could write all of them
Before `migration-rls.sql`: `relrowsecurity = false` on all 12 public tables;
`anon` and `authenticated` held INSERT/UPDATE/DELETE/TRUNCATE on each. The anon
key is public (served by `/api/auth/config` so the page can start a sign-in).
With that key alone, over PostgREST (`node rlsprobe.js`, before):
- `GET alerts` -> 206, `Content-Range 0-0/8` (every alert); `GET cards` -> 0-0/46512.
- B's alert: `PATCH` -> 200 with the row changed; `DELETE` -> 200 with the row.
- `POST user_access {state:'approved'}` -> **201** — self-approval, once the table existed.
- `PATCH cards` (written back with its own name) -> 200, row returned.
Test rows removed after; en-base1-4 still "Charizard"; alerts back to 8.

### RLS — after (`rlsprobe.js`, applied 2026-10-06)
User tables: SELECT own rows (auth.uid()), no write policy (a write policy on the
id alone would let a PENDING user write round the door). user_access writes
revoked; catalogue tables RLS on with no policy; TRUNCATE revoked everywhere.
In the database, as PostgREST runs user A's request (role authenticated, sub=A):
- read B's alert -> `SELECT 0`; update B's -> `UPDATE 0`; insert as B ->
  `ERROR 42501: new row violates row-level security policy for table "alerts"`;
  delete B's -> `DELETE 0`; A approving A -> `ERROR 42501: permission denied for
  table user_access`; A reads A's own -> 1 row (rls.test.js --db).
Over PostgREST, anon key alone: GET -> 200 `[]`; PATCH -> 200 `[]`; POST -> 401
`{"code":"42501",...,"message":"new row violates row-level security policy for
table \"alerts\""}`; DELETE -> 200 `[]`; POST user_access -> 401 42501 permission
denied; PATCH cards -> 200 `[]`. B's row unchanged (target_price 100.00).
**Not run: the same over PostgREST with a REAL user session** — no session token
is available to the session; `node rlsprobe.js --token=<access token>` does it.
The server's role: deployed `/api/db/check` read en-base1-4 straight after the
migration, so its role bypasses RLS (local: `postgres`, rolbypassrls true).

### The gate (`access.js`) — every route classified
53 routes: 10 gated (7 approved, 3 master), 43 public with a reason
(`node access.test.js --table`). Old `/api/alerts/:userId` and
`/api/portfolio/:userId` took the user from the URL: anyone with a browser's
anon id could read and change its alerts. Gone (404). A loop-generated route
was written while building approval and caught by the "every app.METHOD( is a
readable declaration" check before commit.

### Approval
Approved non-master `POST /api/admin/users/<id>/approve` -> `403 {"error":"masters
only","state":"approved"}`; pending approving themselves -> `403 approval pending`
(access.test.js, live server, memory store). Reject is reversible ("Not approved"
list); the page says so before the click.

### Alerts (T6)
8 alerts on 3 anon ids (3 / 4 / 1). Migrated 0, deleted 0, all 8 untouched:
nothing ties an anon id to an account. Each moves when the browser holding its
`ch_user` signs in approved (`POST /api/alerts/claim`); an id never claimed stays.

### Checked in a browser (local server, test tokens, memory store)
Signed out: no door, home shown, alerts bar "Sign in to create and see them".
Pending session: only `#door` visible ("Awaiting approval", the email, Sign
out); Sign out cleared the session and reopened the site. Master: open,
"Approve accounts" listed and approved a pending account.

### Open
- `select count(*) from auth.users` returned **0** from DATABASE_URL (same project
  ref as SUPABASE_URL) although Roy signed in twice. The masters' list reads
  emails from auth.users: if it stays 0, it shows "email not readable". Roy: check
  Authentication -> Users in the dashboard.
- `/api/ebay/*` tooling probes are public and spend the 300/day tooling quota.
- An address with no mailbox in the master list is claimable by whoever first
  controls that mailbox — keep cardzon.com's mail under Roy's control.

## 2026-10-06 (evening) — T6 step 1: Google and email sign-in

- **The key, measured:** <SUPABASE_URL>/auth/v1/.well-known/jwks.json publishes
  one ES256 key — user tokens are signed with it, not the legacy HS256
  secret. A server checking SUPABASE_JWT_SECRET alone would have refused
  every real sign-in. auth.js accepts ES256 (JWKS) and HS256 (secret), each
  for its own algorithm; no new dependency (node crypto).
- Email is a one-time link (signInWithOtp), not a password: the page has no
  password field, so nofabricated.test.js's guard stands unchanged.
- Deployed (build 716a315-t6signin): /api/auth/config enabled; Supabase
  settings say google on, email on, autoconfirm off (confirmation on);
  supabase-js 2.117.2 loaded under its integrity hash; "Continue with
  Google" reached Google's account chooser with redirect_uri = the Supabase
  callback and redirect_to = /app — no redirect_uri_mismatch. Not completed:
  the session cannot sign in to Google or send mail on Roy's behalf — the
  end-to-end sign-in is Roy's.
- package-lock.json committed by Roy (716a315): Render had resolved
  dependencies fresh every build (its audit found 4, local 0).

## 2026-10-06 (later) — T0 the empty panels (pairs and stamps), Mew pair 0.40; T2 SQL landed; T3 Unown "!"; T4 cello slab; T5 language started; T1 OCR measured, 228 pair shipped one-way

**eBay spend:** ~240 tooling calls (300 allowance): 54 + 20 reprint originals
live (the measurement), Mew / Evolutions / Charizard views across grades,
16-card T3 sweep, 2 T0 re-checks. User budget untouched.

### T0 — "no links at all": the photo gate HID every unchecked row
Not reproducible on the bubble Mew at the moment of looking (85 of 166 kept,
Raw NM; PSA 10 102, PSA 9 109). Reproducible as TIMING, and far wider than
the Mew: a lookalike or stamp card hid every row whose photo was not yet
checked, and the checks queue on ONE worker (~1.2 s a photo on Render).
- bubble Mew CGC 10: 0 of 32 shown on open; 25 shown ~80 s later, 0 refused.
- Evolutions Mewtwo xy12-51: **0 of 190**; Evolutions Dragonite-EX: **0 of 192**.
- 54 reprint originals opened cold: **49 showed nothing** (Base Pikachu 0 of
  177, Brilliant Stars Charizard 0 of 190, Base Blastoise 0); Base Pikachu
  still 0 of 177 twenty minutes later behind a ~3,600-photo queue (my burst
  made the queue; one cold card alone blanks for a minute or more).
- After a verdict-version bump, every stored verdict for those cards is void
  — every card opens cold.
Fix (`34a854c`, `2ee6ad3`): every kind of check uses the sibling rule —
unchecked rows shown "Photo being compared", hidden only below 0.55× a
current measured raw price. Deployed and checked: bubble Mew cold 81 shown
at once (6 held below $480), Base Pikachu PSA 9 51 of 51, Evolutions
Dragonite PSA 9 22 of 22 — each previously 0.

### T0 — the Mew pair DID fail backwards, once
505 photos (bubble Mew Raw NM / PSA 10 / PSA 9 / CGC 10 / BGS 10; 30th Mew
Raw NM / PSA 10), scored locally, refusals looked at by eye.
- 30th Mew's own page: 0 refused; every photo ≤ -0.149 toward the bubble Mew.
- bubble Mew's page: 2 refusals — a real 30th Mew 152/128 ($190, 0.413) and
  **a genuine bubble Mew 232/091 in a dim binder photo ($1,050, 0.352)**.
  Next-hardest genuine 0.254. A synthetic dimmed scan does NOT reproduce it
  (NCC ignores a linear dimming) — the failure is the pocket and the glare.
- 30th photos from the bubble side: 157/178 at 0.30, 146 at 0.35, **113 at
  0.40**, 72 at 0.45.
Shipped (`5e67974`): the pair's own margin 0.40; verdict key `~m0.4` so only
that pair's verdicts re-run. Deployed: the genuine binder photo shown, the
30th photo refused, 86 shown, 1 refused.

### T0 — the other pairs, both ways
- Mewtwo ☆ ↔ Evolutions Mewtwo: Evolutions page max -0.084 (safe). Mewtwo ☆
  page: 11 refusals, all 18 photos ≥ 0.25 looked at — every one Evolutions
  Mewtwo (130 HP). 7 more Evolutions photos at 0.25-0.29 kept (leak).
- Dragonite ex ↔ Evolutions Dragonite-EX: Evolutions page max -0.017. 11
  refusals; all 27 photos ≥ 0.22 are Evolutions Dragonite-EX (180 HP).
- Stamps, 20 originals live: **186 refusals, all 186 show the Celebrations /
  30th stamp** (Base Charizard 3, Lugia 87, Dark Tyranitar 44, Sneasel 40,
  Greninja BREAK 12). A reprint's own page runs no photo check
  (`photoChecksOf` = []), so nothing there can fail backwards.

### T2 — Roy's SQL landed
30 McDonald's 2023/24 rows, 315 MEP/SVP rows with logos; Unown number '?'.
On /app: MEP, SVP, McDonald's 2023 and 2024 show their logos. 2022, 2019 and
older McDonald's years are still blank (not in the SQL; 2022 deliberately).

### T3 — sweep of the sets found broken
| set | card(s) | result |
|---|---|---|
| My First Battle | 1, 2 | no eBay market (A) — the page says so |
| Poké Card Creator Pack | 1, 3 | working: the only listing is a PSA 9 slab, correctly refused for raw |
| Unown Collection | A 2/5, ? 2/164, ! 3/164 | **"!" broken: kept Unown Q and P** — fixed `c00078e` |
| McDonald's 2023 / 2024 | 2023sv-1, -5, 2024sv-1, -10 | working (153-196 kept, right card) |
| Trainer kits | Latias, Lucario, Gyarados, Pikachu Libre, Alolan Raichu | working (1-40 kept) |
Unown "!": eBay's "Q/28" is not parsed as a pair, so the bare-number check
ran and found "!" in "NM+ CLEAN!" / "SWIRL!!!". A punctuation number now
counts only standing alone. Unown "?" had the same exposure ("real?").

**Base Charizard's raw page shows ≥7 wrong cards** (34 kept, labelled by
eye): 3 gold Charizard ex 228, 2 silver Charizard ex 215/SVP 056, a 30th
Celebration reprint with a clearly visible stamp (scored 0.68, threshold
0.70), a Japanese Base Charizard (English back found among the seller's
photos). On 491 genuine Base Charizard photos the stamp score tops at
0.613 — 0.65 would have caught the reprint here, but the threshold is
shared by 55 originals and needs their genuine photos measured first.

### T4 — Ancient Mew "Sealed Cello Pack – PSA 8" allowed (`f0f946b`)
A slab asked + a grader and grade stated: singular "sealed" / "(cello) pack"
are not sealed product. "booster", "box", "packs", "lot" still refuse.

### T5 — page language started (`04b1d74`)
EN/JA button between currency and the bell (both navs); `ch_lang`; exact-
text table of ~150 static strings + 15 placeholders/titles; MutationObserver
for re-rendered content; options keep English values. Checked in the
browser: 232 nodes translated, card data untouched, reload persists,
switching back restores. Not yet: ~90 built sentences; server explanations.

### T1 — the 228 lead widened and shipped ONE-WAY (`461f83d`)
60 gold 228 photos (its own page), 491 genuine Base Charizard (27 raw + 464
PSA 5-9 / CGC 8 slabs), labelled by eye, measured on the shipped templates:
at 0.10, 28/60 gold refused, 0/491 genuine (hardest a PSA 5 at 0.031). On
the live raw page 1 of the 3 gold rows (0.156; the others 0.071, 0.034).
Reverse: a genuine 228 reaches 0.195 toward Base Charizard (3 of 60 at 0.10)
— so the pair is checked on Base Charizard only. 215/197 photos do not
score like 228 (max 0.067): same illustration, different foil structure.

### T1 — OCR, measured before building (tesseract.js 5.1.1, eng)
**Closed: OCR cannot read the number off a 500px photo, and on the photos it
would exist for it reads it 0 times at any size.** Labelled set: 113 photos
(≤20 per card) of 7 known cards, identity by eye — Evolutions Mewtwo 51/108
(18) and Dragonite-EX 72/108 (20) listed as ex-era cards, Celebrations
reprints printing their originals' numbers (Charizard 4/102, Lugia 149/147,
Dark Tyranitar 19/109, Sneasel 25/111, Greninja BREAK 41/122).

| read | name | N/M number | both | time/photo (local) | RSS |
|---|---|---|---|---|---|
| whole photo, s-l500 | 51/113 (45%) | **1/113 (0.9%)** | — | 1.4 s | 156 MB |
| whole photo, s-l1600 | 80/113 (71%) | 21/113 (19%) | 17/113 | 7.5-8.9 s | 342-354 MB |
| name/number strips, card located by its OWN scan, s-l500 | 42/101 | 0/101 | — | 0.9 s | 422 MB |
| same, s-l1600 | 41/101 | 15/101 | — | 3.7 s | 430 MB |
| strips, located by the CLAIMED card's scan (production), s-l1600 | **0/38** | **0/38** | — | 1.3 s | 381 MB |

- **The different-card photos (Evolutions, 38): number read 0/38** at every
  size and method. Located by the claimed card's scan — the only scan
  production has — the strips land where the claimed card's name would be:
  0 names, 0 numbers. The "looking for your face" problem, again.
- **Both directions:** no photo produced a different catalogue name AND
  that card's number (0/113 accusations). But 46/113 photos also read
  ANOTHER catalogue name at confidence ≥80 (attack text, "Evolves from
  Dark Pupitar", Charmeleon) and 8/113 a pair not ours — a name alone, or
  a number alone, would accuse genuine listings.
- Render: not measured there (no deploy for a closed question); Render runs
  the photo checks ~2.4× slower than here — ~20 s a photo at s-l1600, at
  ~350 MB on top of the server.
Per TASK T1's rule, the identification question is closed. Whole-photo
OCR at s-l1600 could still LABEL a row (a name read, never a refusal) —
not built; that would be a decision, not a gate.

### Process
- The photo queue is one worker; a burst of tooling opens queues thousands
  of photos for an hour — measure on few cards, or expect the wait.
- Refused rows carry no imageUrl — rebuild it from the URL's `g:` hash.

## 2026-10-06 — T1 "which card is this" measured and STOPPED; logos/Unown SQL; Ancient Mew; energy; T6 dark mode; T7 counted; T8 waiting on Roy

**eBay spend:** ~10 user calls (Ancient Mew raw ×2, PSA 9, PSA 8, CGC 8, the
card page with ?api=render). Day at ~790 of 5,000 at the check.

### WHICH CARD IS THIS? — measured 2026-10-06 (T1), NOT built
Question: name the card in a seller's photo from all English scans, not "is
it card X". Shortlist (cheap) -> the existing matcher on the shortlist ->
best match wins by a margin. Stop rule (Roy): if the shortlist does not
reliably keep the right card, stop — a confident wrong name is worse than
silence. **It does not keep it, so nothing was wired in.**

Data: 20,360 English scans (TCGdex low.jpg / pokemontcg.io .png, 142 of
20,502 failed both hosts). Labelled photos: the 1,010 rows of 2026-10-02
(final kinds, "SPLIT BY KIND") + the 67 Base Charizard rows of 2026-10-05,
labelled again by eye; 955 used (837 right, 21 different card with the true
card identified by eye, 43 metal/recoloured, 45 other language). The
different-card truths: Charizard ex 228/197 gold ×7 photos (3 distinct
items: base1-4 #0, #7, #20 + 2026-10-05 #0, #5, #57, #62, several the same
listing), Charizard ex 215/197 **or SVP 056** silver ×6 (same illustration,
two cards — one photo shows "SVP 056"), Vivid Voltage Charizard 025,
Umbreon VMAX 095 ×2, Pikachu VMAX 044, Giratina V 130 / 185 ×2, Lugia V
185. Five D rows left out (not identifiable with certainty).

Shortlist = find the card with the claimed card's scan (wholeScore's sweep,
photo padded 15%, card 30-110% of width), 16×22 colour descriptor ×27
jitters against all scans. Tried and no better: mean-card localisation
(top-20 35.6%), several boxes (87.9%), fill-the-frame boxes (53%), a height
prior + 48 px refinement (88.6%), 10×14 / art-only / grey descriptors
(89-92%). The ceiling is localisation: on clean full-card photos the box
lands on the inner art frame.

| | n | top-1 | top-5 | top-20 | top-50 | top-200 |
|---|---|---|---|---|---|---|
| genuine: rank of the right card in 20,360 | 837 | 48.1% | 87.9% | 91.5% | 92.8% | 94.9% |
| different card: rank of the TRUE card | 21 | 4.8% | 4.8% | 4.8% | 4.8% | — |

Different-card ranks: 1,151-13,714 for 20 of 21 (the box is found with the
WRONG card's scan, and a 16×22 descriptor reads layout and colour, not
identity). **Gold 228: rank 11,303-13,714 on every photo — never shortlisted.**

End to end, stage 2 = the existing matcher (wholeScore, free sweep) or the
same NCC held to the located box (40 px, ±10% scale, ±8% position):

| stage 2 | K | margin | genuine named as another card | different card: right / wrong / silent | metal named | other language named |
|---|---|---|---|---|---|---|
| wholeScore | 20 | 0.10 | 91 / 837 | 1 / 15 / 5 | 23 / 43 | 22 / 45 |
| wholeScore | 20 | 0.30 | 9 / 837 | 0 / 1 / 20 | 2 / 43 | 0 / 45 |
| wholeScore | 20 | 0.40 | 1 / 837 | 0 / 0 / 21 | 2 / 43 | 0 / 45 |
| aligned | 20 | 0.20 | 38 / 837 | 0 / 8 / 13 | 14 / 43 | 2 / 45 |
| aligned | 20 | 0.40 | 0 / 837 | 0 / 0 / 21 | 0 / 43 | 0 / 45 |

K = 10 or 50 changes little. Why: with tens of candidates the max of
whole-card NCC noise beats the right answer — wholeScore's sweep matches any
card against a SUB-region of the photo (a metal Pikachu VMAX was "Charizard
ex 199" by 0.29; a Japanese Base Charizard "sm6-100" by 0.24). Timing here:
stage 1 ~4.4 s, stage 2 on 51 candidates ~7 s a photo (both slower under
4-way load). Not a production path in any form measured.

**The lead, NOT shipped:** as a PAIR, the shipped matcher does prefer 228
over Base Charizard: 61 distinct genuine Base Charizard photos, hardest at
-0.118 (0 refused at any margin ≥ 0.15); 3 distinct gold 228 photos at
+0.155, +0.033, +0.376 — 2 of 3 at 0.15, 1 of 3 at the shipped 0.30. A
`LOOKALIKES` pair (CLAUDE.md: the cheap route for a recurring wrong card)
is the way forward for 228, but three photos is not a rate: widen first
(more 228 photos, the 215/SVP 056 silver twins) before setting a margin.
Scripts: session scratchpad `lib.js`, `e2e.js`, `analyse.js`, `pair228.js`,
`truth.js` (labels); outputs `full-*.jsonl`.

### Logos and Unown — SQL for Roy (`roy-writes-20261006.sql`, `7e780f7`)
Logos copied, not new: mcd23/mcd24 -> pokemontcg.io mcd21 plain arches (30
rows); mep/svp -> the generic Black Star Promos star (TCGdex swshp/smp/xyp/bwp
are the same 15,737-byte file; 315 rows). Unown '%3F' -> '?' (1 row, id kept,
4 price_history rows). Each: backup SELECT, expected count, guarded UPDATE,
undo. Code side shipped first: TCGdex answers `/cards/exu-%253F`, not
`exu-%3F` (404) — `cardid.tcgdexLocalId` on every per-card ask (5 sites),
manifest/cardgap fold '%3F' to '?' so a re-ingest neither 404s nor re-adds.

### Ancient Mew (`aa44c71`, `fbd0dbc`, `d6f3193`) — grouped, not moved
Prints no number: `cardmatch.PRINTS_NO_NUMBER` (by card id) asks "Ancient
Mew pokemon", gates on the name, refuses any N/M pair, reads the year as
2000 (set release 1995-12-31 UTC refused every "2000" title).
ebayMatchCard/filterCard now carry cardId. Live, both directions:

| ask | kept | of which the card | refused | note |
|---|---|---|---|---|
| Raw, name only | 59 / 200 | 3 | 141 | 56 = paper "details" insert (~30) + metal replicas |
| Raw, + notThis | 3 / 200 | 3 | 197 | 0 previously refused now kept |
| PSA 9 | 165 / 200 | ~all | 35 | JA/KO copies, an insert |
| PSA 8 | 128 / 165 | all but 1 | 37 | "ANCIENT Mewtwo" kept -> refused |
| CGC 8 | 8 / 16 | 8 | 8 | 5 inserts, 3 JA |

Open for Roy: "Sealed Cello Pack – PSA 8" (the card graded in its 2000
cellophane) is refused as sealed. Image: TCGdex has no image field (asset
path 404); pokemontcg.io has no Ancient Mew in any of its 176 sets (its
search API returned 500/502; read from its GitHub data) — blank, like the
McDonald's art. Page: the Wizards Black Star Promos tile opens basep + miscp
(54 cards, chip per set), header says Ancient Mew is not a Black Star Promo;
opened in the browser.

### Energy (T5) — confirmed
TCGdex English, 220 sets: exactly two energy sets, sve (24) and mee (8), both
held. Basic energies elsewhere print inside main sets (EX 36 in 6 sets, XY
27, SM 18, DP 14, Base 12, Gym 12 …; 49 in trainer kits) — re-measured, same
as 2026-10-05. "Every era's energy sets" is a UI grouping, not data.

### T6 dark mode (`bcc9c28`)
Tokens already followed prefers-color-scheme; added the before-paint head
script (localStorage `ch_theme`), Auto/Light/Dark toggle before currency,
color-scheme. Eye + in-page audit (text under 3:1) on home, sets, set page,
card page with live rows and the refused list, search, results, alerts,
portfolio, promo group, autocomplete, both themes. Broken and fixed: white
top bar (the "Card" wordmark vanished), white autocomplete, light nav hover
and skeleton under light text, white text on accent/status tokens (6),
amber literal text 2.97:1, light source notes/badges -> soft tokens. No new
colours; brand chips that paint their own background left as they are.

### T7 translation — counted, not started
~300 page strings (±50; ~900 words): 200 static text nodes, 12
placeholders/titles, ~90 JS-built sentences, after removing catalogue data
(set names, rarities, card names embedded in the page) and markup
fragments. Plus server-written explanations shown on the page (refusal
reasons, panel notes: cardmatch.js has 46 reason templates) — a second pool.

### T8 accounts — not started; needs Roy (see the session report)

**Process:** `git stash` rewrote touched files' endings again (restored);
Git Bash `grep -c $'\r$'` miscounts CR — count with node.

---

## 2026-10-05 (late) — T1 genuine-back rule, deals on and off again, T2 empty-panel kinds, T5 trainer kits

**eBay spend:** ~170 calls (4 raw views + 107 getItem for the measurement, 10
views for the shelf, ~18 marketprobe, 46 T2/T5 views). Day at ~760 of 5,000.

**T1 — require a genuine back, per card.** US page 1, raw, every eBay row
back-checked (`/api/back`, stored) and every photo labelled by eye (contact
sheets, zooms where unsure), blind to the verdict:

| card | rows | metal | metal w/o genuine back | genuine | genuine hidden | decision |
|---|---|---|---|---|---|---|
| Shining Charizard neo4-107 | 35 | 22 | 22 | 13 | 0 | REQUIRE |
| Base Charizard base1-4 | 67 | 6 | 6 | ~50 | 1 (doubtful, faded) | REQUIRE |
| Magikarp & Wailord GX sm9-161 | 15 | 4 | 4 | 10 | 1 (11 photos, none of the back) | not required |
| Pikachu VMAX swsh4-188 | 94 | 18 | 18 | 72 | 10 | not required |

0 metal rows anywhere had a genuine back. M&W: with the 2026-10-04 labelled set
(8 of 32 genuine without a back seen) it is ~21% of genuine hidden. Pikachu:
14% of genuine hidden to remove 19% metal. Shipped (`7e80854`):
`backcheck.REQUIRE_GENUINE_BACK` = Shining + Base Charizard, raw only; a
no-claim row there is refused with its reason and listed in refused[].
Live after deploy: Shining Charizard raw shows 13 rows, all genuine-back; 39
refused by the rule, the gold $180.17 (v1|407260752181) among them.
Not caught by the back, seen on Base Charizard: 6 genuine Charizard ex cards
(gold 228/197, 199 SIR) sold under "Charizard 4/102" — kind D, genuine backs.

**Deals — genuine back required, turned on, turned OFF again.** The rule
(`deals.noGenuineBack`) and the candidate check (`backCandidates`, ≤2 getItem a
raw view, background, `dealBackFollowUp`) shipped in `7e80854`. Live with 10
views: the gold Shining Charizard was gone; 2 deals shown — #1 Base Charizard
$208 vs $944 = a gold **Charizard ex 228/197** (genuine back; colour on our warm
Base scan 0.244 so not above 0.40); #2 Pikachu VMAX $85 vs $169, genuine with a
visible crease the title does not state. Off again (`dbc579f`). A genuine back
says real, not THIS card. Also found: kept rows never carried `back.metal`, so
the bar's metal test could not fire on the server path (fixed).

**T2 — catalogue gaps.** marketprobe (US, US without the set name, US without
the category, titles=1):

| set | logo | images | links before | cause | after |
|---|---|---|---|---|---|
| My First Battle (mfb) | none (TCGdex none) | 0/34 (TCGdex none) | 0 | **eBay has nothing**: 0 rows in all three asks | page says so (`NO_EBAY_MARKET`) |
| Poké Card Creator Pack (ex5.5) | none | 0/5 | 0 | asked "Pack"; titles say "Kids' WB Poke Card Creator" | asks "Creator": Pikachu 1 kept; Treecko 3 rows, all slabs |
| Unown Collection (exu) | none | 0/28 | 0 | asked "Unown Collection"; titles say "Unseen Forces" | Unown A 0 -> 8 kept, G 0 -> 7 |
| Unown "?" | — | — | 0 | number stored `%3F` (TCGdex localId); and "?" was a regex wildcard in the bare-number test (kept ANY title) | escape fixed; query still `%3F` until the row's number is '?' |
| McDonald's 2023 / 2024 | none | 0/15, 0/15 | work (190, 193 kept) | pokemontcg.io mcd23/mcd24 logo + card images 404 (like mcd14/mcd17); TCGdex none | logo: mcd21/logo.png is the plain arches (2019, 2021 use it; 2022's is "Match Battle") — NOT written, see below |

Empty panel now says which kind: `payload.market` none-returned / all-refused /
listed, plus noMarket (`90ab24b`, emptymarket.test.js).

**Not done — production DB writes refused by the session's permission
classifier:** (1) `set_logo = mcd21/logo.png` on 2023sv/2024sv; (2) `number = '?'`
on en-exu-%3F (id unchanged). Both small, backup first.

**T3 — energy sets.** TCGdex English has exactly two energy SETS: sve (24) and
mee (8); both are in our DB and listed (/api/sets/lang/en serves every set). Older
eras print basic energies inside their main sets (EX 36 cards in 6 sets, XY 27,
SM 18, DP 14, Base 12 ...; 49 in trainer kits). "Every era's energy sets" therefore
means a UI grouping like T5, not data that exists — Roy's call. sve/mee samples
were "choose your card" pickers (querygap B); their panel now reads all-refused.

**T4 — Ancient Mew.** References to en-miscp-001: alerts 0, portfolio 0,
price_history 12, listing_views 5. price_history is append-only, so moving the
card under a basep id strands those 12 rows; keeping the id under set basep breaks
{lang}-{set}-{number}. Rename "Wizards Black Star Promos" -> "WOTC Black Star
Promos" is a set_name write. Both need the DB permission and a decision; the
no-number query is not built.

**T5 — Trainer Kits** (`742e707`): every kit holds all the cards TCGdex lists
(SM Lycanroc: TCGdex 18 of 30). Live, 2 random cards per kit: 38 of 40 returned
listings (HS Gyarados Croconaw, XY Bisharp Metal Energy: none-returned). One grid
tile, 475 cards, chip per kit; opened in the browser.

**Process slips:** a `| tail -1` hid deals.test failures in one commit (fixed
`e910dd6`); `git stash`/`pop` rewrote working copies CRLF and refused.test's
slicer failed — restored LF.

---

## 2026-10-05 (night) — deals off, Evolutions lookalike pairs shipped, PNG references

**Deals OFF** (`dc890ca`). Bar in `deals.notADeal`, each rule fails the
suite when removed. Why the gold card got through: on the live Shining
Charizard view the row (v1|407260752181, $180.17 BIN) carries no mark in the
panel either — no `suspect`, back `no-claim`, colour 0.059 above our scan
(blue-white light), price not low enough to flag. Under the new bar it is
still the pick (that view: 27 rows excluded — 3 stated condition, 1 edition,
12 price flags, 3 novelty flags, 7 shipping unknown, 1 bid). So deals stay off.

**Lookalike pairs at 0.30** (`6bbf149`), `VERDICT_VERSION` stamp-2. Shipped
templates (from TCGdex high.png) vs the measurement's (.jpg): margins within
0.014. Live re-score with the shipped `judge()`: Mewtwo ☆ 23/80 refused,
Dragonite ex 15/122, all 38 looked at — all Evolutions; genuine side 0/5 and
0/34; reverse on xy12-51 (195 rows) and xy12-72 (188) 0 refused. eBay: 6 calls.

**PNG references** (`c2b68c1`): 806/806 pokemontcg.io scans profile through the
shipped worker path. Host agreement on 30 cards held on both: median |Δgold|
0.003; Jolteon ☆ −0.137, Torchic ☆ −0.058 (pokemontcg.io reads less gold).
Before/after, CC002 / Shiny Vault Charizard VMAX / GG69 (244 rows): 0 refused,
2 newly flagged — both gold metal (looked at). 754 cards have no image at all.

---

## 2026-10-05 (later) — T1 colour alone measured, T2 cross-set lookalikes, T3 spec tracked, T4 deals seen live

**eBay spend:** 151 US-page-1 card views on Render (30 gold/dark/warm cards,
Mewtwo ☆, 120 highest-priced English cards); day at 257 of 5,000 after.
Every photo was read from eBay's CDN (0 calls).

**T1 — colour alone does NOT refuse.** On the 378 labelled rows, colour excess
above the shipped 0.40 with no other signal hits 2 genuine: $610 Magikarp &
Wailord GX 161 (0.424, no back) and $758 Shining Charizard (0.416, genuine back
seen). First genuine falls at 0.424; at 0.45 colour alone catches 44/95 metal,
at 0.50 34/95 (two signals: 51).

| threshold | metal caught (95) | genuine hit (195) | union with two-signal rule |
|---|---|---|---|
| 0.30 | 65 | 3 | — |
| 0.40 | 51 | 2 | 58 metal / 2 genuine |
| 0.45 | 44 | 0 | 56 / 0 |
| 0.50 | 34 | 0 | 56 / 0 |

Widened: 30 more cards (6 Gold Stars, gold items/SV gold hyper rares incl. gold
energies, SWSH gold VSTAR, Umbreon/Gengar VMAX alts, M Gengar EX, Darkrai GX,
Mewtwo-EX FA, warm arts: Charizard V CP 79, Charizard ex 199, Blaziken VMAX alt,
R&C GX). 1,623 rows profiled; all 41 above 0.30 looked at: **37 metal, 4
genuine gold hyper rares** — Reversal Energy sv04-266 at **0.491**, 0.352, 0.310
and Basic Water Energy sv02-279 at **0.470**. Why: our TCGdex scan of a gold
hyper rare is not read as gold (Water Energy's scan 0.000, Reversal 0.191) —
the scan renders the foil flat. So no threshold refuses colour alone without a
genuine card: two signals stay. The 4 rows are in `material.fixture.json`
(`widen-hr`); material.test.js fails 4 assertions with colour standalone.
Gold Stars on eBay are thin (1-8 rows each) — the Gold Star sample is still small.

Coverage: **1,590 English cards have no reference profile** — 806 use
pokemontcg.io art (PNG, and `SCAN_HOST` admits TCGdex .jpg only: Shiny Vault
122, Hidden Fates/Dragon Majesty 156, Crown Zenith GG 70, Trainer Galleries
120, SM promos 67, Classic Collection incl. CC002), 754 have no image (B2a 131,
mep 89, trainer kits, svp 34, mfb 34), 30 scrydex. Fix = a PNG decode path for
pokemontcg.io scans (not built). Metal-photo signal: only rows the back check
fetched (MOST_FAKED + flagged, ≤20 a view). **Rainbow-foil metal is uncovered**
by colour (Pikachu VMAX, PROGRESS 2026-10-05). **Washed-out gold is uncovered
too**: the top `/api/deals` pick (below) is a gold metal Shining Charizard at
excess 0.059 — blue-white light desaturates gold below the HSV bound.

On Render: every first view had the novelty check 100% `pending` (by design —
profiled after the answer); the poll answer applied it (Charizard V CP: 2
refused, 9 flagged of ~26 metal above 0.30 — most metal there is kept).

**T2 — Mewtwo ☆: the other card is XY Evolutions Mewtwo 51/108** (130 HP,
Psychic/Barrier, Base Set art). 80 rows (US page 1, 2026-10-05), labelled by
eye: 5 genuine ☆, 75 Evolutions. `wholeScore` vs both scans, margin = Evolutions − ☆:

| | genuine ☆ (5) | Evolutions (75) |
|---|---|---|
| margin range | −0.454 … **−0.073** (hardest: a sharp $4,500 raw) | **+0.043** … +0.39 |
| caught at 0.30 (LOOKALIKE_MARGIN) | 0 | 22 |
| caught at 0.40 (SIBLING_MARGIN) | 0 | 0 |
| caught at 0.10 | 0 | 71 |

Base Set / Base Set 2 Mewtwo scans are the same art: a near-tie with
Evolutions by construction. The rows that matter most are not caught at 0.30:
the $25 headline-cheapest row (+0.156) and the unflagged $900-$3,500
Evolutions rows (+0.135 … +0.39, 2 of 10 at ≥0.30).

**How general — one more found, same shape.** Of 150 views, 104 had ≥8 rows;
cards whose kept rows are ≥40% price-flagged: Mewtwo ☆ and **Dragonite ex
EX Dragon 90/97** (122 rows, 69 flagged) only. Scoring the flagged rows against
every same-Pokémon English scan (50-120 per card) named the other card with no
hint: **XY Evolutions Dragonite-EX 72/108** (51 of 58 rows at margin ≥0.10).
Labelled: 31 genuine (hardest −0.182), ~79 Evolutions, ~12 third cards (BW
Dragonite, Roaring Skies Dragonite-EX, a Giratina) near zero — undecided, kept.
At 0.30: 17 Evolutions caught, 0 genuine. Both are 2016 Evolutions cards sold
under an ex-era card's catalogue title — eBay's catalogue mapping, not sellers
typing. **The cheap finder:** "most kept rows price-flagged" per view, then
the cross-set scan scorer names the other card (0 extra eBay calls once a view
exists). **Not shipped:** at the measured 0.30 the pairs catch ~25% and miss
the rows that set the headline; a margin near 0.10 catches 71/75 and 64/79
with 0/36 genuine, but 36 genuine rows on two cards (the ☆ has 5 on eBay at
all) is too thin to ship a new margin. Also `verdictKey` would reuse
xy12-72's stored sibling verdicts (keyed `@ours+s`) made without the new pair.

**T3** — `TASK-counterfeit-gate.md` tracked (`8be954b`; it was already in the
root, untracked). T1 pinned in `52fb48f`.

**T4 — `/api/deals` with real cached views (first time):** 52 considered, 8
shown — and at most 2 are like-for-like (Lugia ex $558, Skyridge Charizard
crystal $1,698). #1 is a **gold metal novelty Shining Charizard** ($180 vs
$1,701; no signal saw it); Mewtwo ☆ $1,690 is an **Evolutions Mewtwo** (row 9,
margin +0.21); Golem "Damaged", Dialga EX "DMG/PEELING", Rayquaza CoL "MP" are
**seller-stated damage** priced against a near-mint headline; LC Charizard
"Non-Holo" against the holo price. The shelf recommends; it needs a stricter
bar than "no check flagged it" — Roy's call (stated damage out; a deal on a
MOST_FAKED card only with a genuine back seen).
`safeprices ja --all` on SM6b/SM8b/S10a: 22 of 370 priced (Yahoo only), 348
no Yahoo data — Yuyu-tei is the source that covers them (the open decision).
PSA: nothing new to measure; the email to collectors-apis@collectors.com is
Roy's (ask about population data in the same message).

---

## 2026-10-05 — T0 budget, T1 gold/black novelty cards, T2 movers, T3 deals, T4, T5

**T0 — CLAUDE.md 163k -> 50k, under a 60k budget** that `claudesplit.test.js`
now enforces (fires on the old file: 162,084 of 60,000). Measurements moved
verbatim to the 2026-10-05 block below; settled narratives and the full old
LESSONS to the archive ("MOVED FROM CLAUDE.md, 2026-10-05"). `7a75348`.

**eBay spend for T1.** Roy lifted the hourly ceiling and tooling allowance for
the last hour of 2026-10-04 UTC (`ce6c28a`, keyed on the day, lapsed at
midnight). Spent: 343 listing views (335 cards US page 1, plus all-sites and
Load-more on 15 novelty-prone cards) and 1,697 getItem photo fetches; the day
ended at 4,589 of 5,000 (soft stop). Side effect on Render: bulk opening queued
thousands of sibling/stamp photo checks in the one-worker pool, and the back
check's automatic getItem ran in background on flagged rows.

**T1 — repeated-photo hash: measured, carries nothing.** dHash (64-bit) of
19,054 distinct photos from 19,499 rows. Clusters spanning 3+ cards: 2 at
Hamming 0, 6 at <=2 — every one an extended-art case, a "choose your card"
listing or a lot, ALREADY refused by title. At <=4 the big clusters (25, 10
cards) are different GENUINE cards colliding (Charizard ex SIR, Gold Stars,
Sylveon SIR). Same photo under 2 cards was almost always ONE listing in two
searches. Not built.

**T1 — what the gate showed.** Shining Charizard (US page 1, 2026-10-04): 52
rows shown, **41 gold/black/silver metal**, 11 genuine (all >= $1,347); title
gate had refused 148. All sites + more: 143 shown. Magikarp & Wailord GX 161:
25 metal of 63. Mewtwo ☆ ex13-103: ~75 of 88 kept rows are a 130 HP
Base-style Mewtwo under "Mewtwo Star 103/110 … 80 HP" catalogue titles,
$2-$1,112 (kind D; open). Gold Mew ex 205: 118 genuine (control).

Labelled by eye (contact sheets, zoom where unsure): 378 rows — Shining
Charizard 70 metal / 36 genuine, M&W 25 / 32 (+6 other cards), Mewtwo ☆ 9
genuine / 78 other card, gold Mew ex 118 genuine. Colour = gold fraction of
the centre 60% of the s-l225 search photo minus the same on our TCGdex scan.

| signal (labelled set) | Shining metal | Shining genuine | M&W metal | M&W genuine | ☆ page | gold Mew |
|---|---|---|---|---|---|---|
| colour excess > 0.30 | 44/70 | 2/36 | 21/25 | 1/32 | 1/87 | 0/118 |
| outlier flag | 36/70 | 1/36 | 8/25 | 0/32 | 67/87 (wrong cards) | 0/118 |
| genuine back found | 0/70 | 32/36 | 0/25 | 24/32 | 66/87 | — |
| metal-coloured other photo | 29/70 | 3/36 | 15/25 | 2/32 | 3/87 | — |
| 2 of {colour, price, metal photo}, no genuine back, 0.35 | 37 | 0 | 16 | 0 | 1 (wrong card $4.50) | 0 |

Shipped at **0.40** (`materialJudge`): labelled 51/95 metal refused + 22
flagged; 0/195 genuine refused, 6 flagged; $2,525 genuine Shining Charizard
untouched. Why 0.40 not 0.35: the 12-card before/after at 0.35 refused one
GENUINE Charizard ex 199 SIR ($446.73, warm sunset art in warm light, excess
0.352, no back posted).

**Before/after at 0.40** (rows shown before -> refused / flagged; offline,
same profiles and back photos, shipped functions):

| card | shown | refused | flagged | metal-photo signal |
|---|---|---|---|---|
| Shining Charizard neo4-107 | 143 | 38 | 23 | 143/143 |
| Magikarp & Wailord GX sm9-161 | 63 | 16 | 6 | 63/63 |
| Base Charizard base1-4 | 175 | 8 | 10 | 175/175 |
| Pikachu VMAX swsh4-188 | 250 | 4 | 22 | 218/250 |
| Umbreon VMAX alt swsh7-215 (dark) | 94 | 0 | 4 | 94/94 |
| Charizard ex 199 SIR | 269 | 0 | 12 | 269/269 |
| Mew ex 205 gold hyper rare | 390 | 0 | 10 | 385/390 |
| Mewtwo ☆ (Gold Star) | 88 | 0 | 1 | 88/88 |
| Celebrations CC002 (official metal) | 221 | 0 | 0 | — no scan profile |
| Mewtwo-EX FA bw4-98 (dark) | 49 | 0 | 3 | — |
| Charizard ex 234 SIR | 175 | 1 | 13 | 175/175 |
| Rayquaza VMAX alt | 73 | 1 | 6 | 73/73 |

Every one of the 68 flips was looked at (contact sheet, zooms): 66 gold/black
metal (incl. $1,500-$3,000 "Shining Charizards"), 1 gold Charizard ex under
Base Charizard, 1 $8 wrong card; **0 genuine**. Weak spot: rainbow-foil metal
(Pikachu VMAX) is colour-alike — only price + metal photo catch it. In
production the metal-photo signal exists only where the back check fetched
getItem (most-faked cards and flagged rows, <=20 a view). `5160962`, `ce494c9`.

**T2 — movers** (`45747a4`): TCGdex-path only, productId at both ends, marked
prices left out. 2026-10-05: 7d 0 pairs, 30d 0, 24h 250 of 2,510 current.
Home shows four lists over 24 hours and says why. Note: digital.test's
literal scanner only passed on trending.js because the file was CRLF.

**T3 — deals** (`9cf27f3`): `/api/deals`, cache only, 0 calls; rule in
deals.js. Unverified with real cached views (local has no eBay keys).

**T4** — decisions recorded, nothing built (Yellow A Alternate kept; no 0.2x flag).

**T5** — manifest on the 12 JA sets: 1,107 cards, 31 rarities corrected (SM6b
9, SM8b 4, S10a 18), 0 not found. PSA pair test 09:10 UTC (window reset 06:29,
nothing of ours called PSA): keyed fp ac5277fe6cf6 and corrupted fp
e7f42681d6d0 both 429 "100 per Day", Retry-After 76,748 s. The pool is spent
by others before auth is read.

---

## 2026-10-05 — measurements moved verbatim out of CLAUDE.md (T0)

CLAUDE.md now has a 60k-character budget (claudesplit.test.js). These blocks
were its measurement sections, copied before cutting; CLAUDE.md keeps one-line
rules that point here as "PROGRESS 2026-10-05: <heading>".

### Is the headline current and measured? — 2026-10-02 (T1)

Every visible card's headline (ungraded, `basePrintingSql`, real before
estimate, newest — the rule every reader uses), classified. "Not current"
= older than 30 days, Yahoo median of ≤2 items, or alternating (≥1.5x
moves that return, 60 days).

| | cards | current & measured | no price | estimate | not current |
|---|---|---|---|---|---|
| English | 21,152 | 21,076 (99.6%) | 7 | 10 | 59 (40 old, 19 alternating) |
| Japanese | 14,023 | 2,274 (16%) | 278 | 2,177 | **9,294 old** |
| Chinese (parked) | 8,313 | 0 | 0 | 8,313 | 0 |

- **Over $100: 130 of 1,148 not current** — 113 Japanese, 10 English old
  (Mudkip ☆ $3,999.99, Championship Arena $2,999, Rayquaza ☆, Espeon ☆,
  Pokémon Center…), 7 English alternating (Torchic ☆ 4500/1200, Treecko ☆
  2400/900, Tropical Beach 800/481, Charizard ☆ δ…).
- **Japanese "old" is one job not repeating**: 9,058 of the 9,294 are
  `yuyutei_shop` rows from the single 2026-08-28 run; the nightly asks only
  Yahoo for Japanese. `node ingest.js yuyutei` re-run — or scheduled — is
  the fix; not done (a decision, below in OPEN).
- Japanese estimates are vintage: 1,427 of 1,462 WOTC-era and 715 of 722
  EX-era cards. "No price" is six sets: SM7a 63, SM10b 59, XY8b 55, XY11b
  50, SM8b 25, S8a 15.
- English alternation is the TCGplayer internal search (svp/xyp/mep/bwp
  promos, Gold Stars) — two products under one number, presumably;
  `source_meta.productId` from the 2026-10-03 nightly will say.
- **"0 listings behind it" is not countable yet**: no stored internal-search
  row carries a listing count (`0b0ddfb` landed after the last run). Yahoo's
  is in its source name; no headline is a Yahoo median of ≤2.

**Shown** (`pricequality.js`): set tile, card page, both trending grids,
alert tiles and latest searches say est / old / thin / unsettled with the
reason in the tooltip. Alert EVALUATION is unchanged — an unsettled price
can still trigger an alert (open).

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
`listing_photo_verdicts` (T2, 2026-10-03) holds OUR stamp verdicts keyed on a
sha256 of the eBay item id and of the photo URL — no title, price, URL or
photo; `stampcheck.test.js` asserts the row carries neither.

**Chinese is parked** and shows 0% priced. Rarity is 19-31% accurate with no
source, Chinese cards barely trade anywhere reachable, and TCGdex's apparent
Chinese pricing is the Japanese card's listing with a translated name — see the
localised-name lesson, which is the reason it stays parked.

**5,475 Japanese cards (39%) are not on TCGdex** — the Limitless-ingested sets.
Their rarity is positional inference. Yuyu-tei can supply it; still open.

### The gates

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
| **outliers** | an order of magnitude below the card's own median — or below the stored raw price when that is current and HIGHER (a feed of fakes sets its own median; 2026-10-04) — **flags, never removes** | `flagOutliers` in `gatherListings` | same | same | — | IQR + `YAHOO_MAX_SPREAD` refusal | ≥5 priced, ≥$15 median | `outliers{}` |
| **reprint-priced** | a row at the known reprint's price level | `flagReprintPriced` where `REPRINT_OF` | same | same | — | — | the reprint's own listings | `outliers.reprints[]` |
| **printing** (T10) | normal / holo / reverse / reverse-pokeball / reverse-masterball … — a STATED other printing is refused, silence kept as *unstated* | `verify(opts.printing)`; `buildQuery` asks for it | the asked mirror's own entries, else `pickVariants` | `printingRefusal` | base printing only — `printsql.basePrintingSql` on every headline reader | — | `cards.variants` (manifest) — **must be SELECTed** | `sources.<id>.printing{asked, keptStated, keptUnstated, refused}` |

| **reprint stamp** | the photo shows a 30th / Celebrations stamp | `stampcheck.gate` on the 55 originals; unchecked HIDDEN | — | — | — | — | the row's own photo (CDN) | `stampGate`, `ebay.stampRefused` |
| **lookalike** (2026-10-04) | the photo matches a DIFFERENT card sellers list under this one better, by 0.30 | same gate, `cardmatch.LOOKALIKES` (bubble Mew ↔ 30th Mew) | — | — | — | — | both whole-card scans | `stampGate.kind: 'lookalike'` |
| **card back** (2026-10-04) | another language family's back refuses; own back labels | `backcheck` verdicts applied in `judgeListings`; unchecked SHOWN | — | — | — | — | the listing's getItem photos | `backCheck`, `ebay.backRefused` |

**What the query ASKS decides what the gate can ever see** (T0, 2026-10-04).
Four causes of listings never shown, each general, each fixed:
- **A slab is asked by its bare number** (`28`, not `28/165`): most graded
  titles copy PSA's label — "2002 POKEMON EXPEDITION #28 TYPHLOSION-HOLO
  PSA 1" — which prints no total. Kept, pair -> bare (marketprobe `?shape=`):
  Typhlosion PSA 1 0 -> 1, Umbreon #32 PSA * 4 -> 14, Base Charizard PSA 9
  15 -> 45, Charizard ex 199 PSA * 163 -> 190. **Raw keeps the pair**: bare
  on Base Charizard Raw returned 4,977 rows and kept 0 of the first 225.
- **Set names as the label writes them** (`cardmatch.SET_WRITTEN_AS`, by set
  id): GAME (Base Set), ROCKET, EXPEDITION, BASE 2, EN-151 are read as
  naming the set; a slab asks `(Base,Game)` / `Rocket` / `Expedition`. Our
  "Expedition Base Set" is in no title; "151" was too short to read.
  Accents folded ("Pokémon GO" could never match). Modern labels carry the
  full set name and need no entry.
- **Auctions.** eBay Browse returns Buy It Now only unless asked: 0 auctions
  in 258 rows over four cards. Now `buyingOptions:{FIXED_PRICE|AUCTION}`,
  same call. A current bid is labelled and is never the cheapest or an
  outlier baseline (`outlier.isCurrentBid`).
- **"PSA 8 Card" is a grade, not an 8-card lot** (`GRADE_PHRASES` masked for
  the lot test only).
Still open: a RAW title with the pair and no set name ("Mew ex - 100/110
HOLO - English") is accepted by the gate but never fetched — raw asks the
set name. Not measured.

**Every set asked at once** (T2, 2026-10-04, `querygap.js`): 201 English
sets, one card each, three where it failed. 185 answer. Fixed by cause:
the lot test read the card's OWN set/card name (all of Forbidden Light;
236 of 21,152 cards — now masked, `maskOwnIdentity`); `δ` empties an eBay
search (191 cards — not asked); a lettered number ("24a", "50a") was read
as its digits, both ways (31 cards — `verifyLetterNumber`); xya asks "24a
Alternate Art" and takes the original set's total (`LETTER_TOTAL_NOT_HELD`);
Futsal asks "002/005" and no set name. Open: Unown `%3F` (stored encoded),
Ancient Mew (no printed number); ex5.5 and mfb have no listings at all.
Re-run `node querygap.js en` after any change to `buildQuery` or a set's
vocabulary — ~200 tooling calls.

**Reporting.** Every registered listing source now returns `kept`,
`rejected`, `dropped[]` (reasons), `gate` (what the gate had) — Yahoo did not
until T9 (`jpItemRejectReason`). Stored-price paths report to the console
only; that is a script run deliberately, the `gradeprices.js` shape.

### WHAT CATCHES A WRONG LISTING — coverage, per problem (2026-10-04)

Read this before another photo session: what is covered, on which cards,
and what is not.

| problem | caught by | on which cards | measured |
|---|---|---|---|
| reprint with a stamp (30th / Celebrations) | stamp gate (photo) + `REPRINT_FAMILIES` title words + reprint price band | the 55 originals in `REPRINT_OF` (54 templates; `30th-c-020` has no stamp on our scan) | 92.5% of reprint photos, 0 of 16 originals |
| a different card sellers list under ours, both scans held | lookalike comparison (photo) | ONE pair: bubble Mew ex 232/091 ↔ 30th Mew ex 152/128 | 162/178 refused, 0/276 genuine |
| a SAME-NAME card of the same set, under our number (2026-10-04) | sibling comparison (photo), margin 0.40 | 6,891 English cards (2,993 groups, 150 sets) | **7 of 11 swaps, 0 of ~1,470 genuine** — a reduction, not a solve |
| named replica ("gold metal", "proxy", gold before 2004…) | title words (`NOT_A_SINGLE_CARD`, `goldBeforeGold`) | all | 0 of 896 right titles refused |
| implausible price | outlier check (flags, never removes) | all with ≥5 priced and ≥$15 median, or a current stored price | 0 of 864 right rows flagged |
| other-language copy | title (language words, Japanese set codes on an English card) — and the **card back** when the back is posted | all / back: on demand, flagged rows, most-faked cards | back: 11 of 12 Japanese, 0 of 52 English |
| metal replica, title silent | **partly**: outlier check when cheap; the back check finds NO genuine back on it (no claim — it never refuses), while genuine copies get the label | back: on demand, flagged rows, most-faked cards | 0 of 17 metal backs labelled genuine; 52/52 genuine labelled |
| different illustration of the same Pokémon (kind D), outside lookalike pairs | **NOTHING** | — | see below |
| a printed counterfeit of the real card, real back | **NOTHING** — the back check would LABEL it | — | not measured |

**The different-illustration case outside a held pair stays unsolved.
Measured twice** (THE STAMP MATCHER ON THE ARTWORK; IS THIS PHOTO THIS CARD
AT ALL?): a genuine card under glare, tilt or a slab scores 0.36-0.45 on
the artwork template; a different illustration 0.31-0.59 — the
distributions overlap at the floor, so no absolute threshold separates
them. SIFT would (0/916 false at the strict rule), and **no `opencv.js`
build from 4.5.5 to 5.0 ships SIFT**. Do not spend another session on it
without one of: building opencv.js with SIFT (emsdk), native OpenCV on
Render (Docker), or re-measuring with ORB/AKAZE — each is infrastructure.
What DID work is asking comparatively where both scans are held (next
section) — so the cheap route for a recurring wrong card is a new
`LOOKALIKES` pair, measured first.

### COMPARATIVE MATCHING — BUILT 2026-10-04 (T1), for held pairs

Every earlier photo measurement asked "does this photo match card X?" with
one template and an absolute threshold, and failed at the floor. Where we
hold BOTH scans, ask which side wins: a badly shot genuine card scores low
against both, but higher against its own. Same matcher (`stampcheck.nccMax`
sweep, 24 px), two comparisons, d = score(ours) − score(other).

**Bubble Mew ex 232/091 vs 30th Celebration Mew ex 152/128** — Roy's two
"$180/$190" rows were 30th Mews (stamp visible, 160 HP) titled "232/091".
457 photos labelled by eye (276 bubble, 178 30th; the 30th card's own
listings supplied most of them):

| region | zero-false margin | 30th caught at it | genuine called 30th at margin 0 |
|---|---|---|---|
| whole card | 0.254 | 173/178 | 42/276 |
| illustration (y .10-.52) | 0.222 | 147/178 | 31/276 |
| artwork only | 0.104 | 163/178 | 19/276 |
| core | 0.183 | 155/178 | 29/276 |

Shipped: whole card, margin **0.30** (slack above the hardest genuine photo,
a glared raw card at 0.254): **0 of 276 genuine refused, 162 of 178 30th
refused** on the bubble Mew search, 0 of 178 on the 30th card's own search.
Both of Roy's photos are refused (margins 0.37, 0.41). Live 2026-10-04 the
gate ran on all 40 bubble Mew rows (0 refused — the two 30th rows had left
eBay). The verdict is keyed on item + our card: the same photo is right
under the other card.

**On the Classic Collection pairs it adds nothing**: a reprint reproduces
the artwork. Aquapolis Lugia vs 30th CC Lugia, illustration region, margin
0.02: 0 of 16 originals called reprint, 56 of 69 reprints — the stamp gate
already finds 68 of 69. Not wired there.

**T2 settled 2026-10-04 — the bubble Mew rows were never a mapping gap.**
30th #152 is a new card (Kuroimori, 160 HP, Teleportation Burst), not a
reprint of Paldean Fates #232 (USGMEN, 180 HP). `REPRINT_OF` is complete:
30 + 25, every original in the catalogue; no card of the 30th Celebration
(158) or Celebrations (25) main sets shares illustrator AND attacks with an
older card except a TCG Pocket promo (checked on TCGdex; Celebrations #5
Pikachu is a new Arita illustration, looked at).

### SAME-NAME SIBLINGS — BUILT 2026-10-04 (T1), a reduction not a solve

**The diagnosis was not the one expected.** Alakazam EX #125/124 showed
#117/124 rows and #117 showed #25. `linkaudit --live --kept` on all three,
Raw and PSA, then all eight eBay sites (361 rows): **every kept title
stated the right number.** The photos did not: #125's five cheapest were an
SVP 050 Alakazam ex, a Japanese Alakazam ex SAR, a Doctor Strange fan card,
and two #117 full arts; #117's cheapest ($10) a #25. Many such titles read
like eBay's catalogue ("The Pokémon Company Alakazam EX 125/124 … 160 HP")
— what the seller picked, not what they hold. No title gate can see it.

**Built:** `stampcheck` kind `sibling` — every other English card of the
same name in the same set (`server.js photoChecksFor`, one DB query,
cached 6 h) is compared like a lookalike pair, from OUR scans, templates
built at runtime from TCGdex's `.jpg` (fetched and checked; within ±0.015 of
the `.png` measurement). Rides the stamp gate and its stored verdicts (key
`item@ours+s`). 0 eBay calls.

**Measured** on 1,478 photos of six groups (Alakazam EX xy10, Umbreon VMAX
swsh7, Charizard ex sv03.5, Giratina V swsh11, Raichu sv02; Greninja GX sm6
returned no rows), every row with margin ≥ 0.10 looked at:

| margin | swaps refused (of 11) | genuine refused |
|---|---|---|
| ≥ 0.30 (bubble Mew's) | 9 | **1** — Charizard ex 183 at 0.307 (prefers the 199 SIR) |
| **≥ 0.40 (shipped)** | **7** | **0** |

**Misses at 0.40, stated:** the $25 #117 under #125 (0.282) and the $10 #25
under #117 (0.266) — **two of Roy's own examples** — plus a Giratina V 130
under 186 at $2.08 (0.315, price-flagged anyway) and a 185 under 186 at
$300 (0.320). Candidate, NOT built: margin ≥ 0.20 AND the row's price
log-nearer the sibling's stored price than ours caught 10 of 11 with 0
genuine on this sample — but it was read off this sample. **Measured on a
fresh one 2026-10-04: 2 of 14 swaps, 0 genuine — NOT built** (six new
groups, 1,357 photos; nine gold Mew ex #205 listed as #193 price like
#193). Lowest genuine margin over both samples: 0.307. A different
illustration that is not a sibling (Alakazam #125's $24 Doctor Strange fan
card, 0.13x the price) is caught by nothing. **Siblings only**: a fan card, another set's card or a
foreign copy matches neither scan and stays. Same art in another foil
(rainbow/gold of one illustration) is a near-tie by construction: kept.

**Unchecked rows (Roy, 2026-10-04):** where siblings are the only check, an
unchecked row is HIDDEN only below `SIBLING_HIDE_FRACTION` (0.55) of the
card's current, measured raw price (the Alakazam swaps sat at 14%); every
other unchecked row is shown, chip "Photo being compared". No current
stored price (or a graded view) hides nothing — no baseline, as outlier.js.
A card with a stamp or a held pair keeps "unchecked is hidden".
**Load:** the follow-up checks every row of every view of these 6,891
cards through the one worker pool, cheapest first (~2.5 s/photo with 2-3
templates on Render, est.); a busy sibling card delays a stamp card's
checks. Watch `poolState()` before raising `STAMP_WORKERS`.

### THE STAMP MATCHER ON THE ARTWORK — measured 2026-10-03 (T1), NOT built

The question: the art-box score (8/24) mixed kinds — does the SHIPPING
matcher (`stampcheck.nccMax`/`resize`, no OpenCV) separate a **different
illustration** (D) from the right card, at 0 false flags on the 864 right
rows? Template cut from OUR scan, scale sweep 25-95% of the photo width,
coarse-then-refine, template shrunk to 24 or 32 px wide; 1,141 photos (the
1,010 labelled rows + Roy's 131), ~1.7 s a photo for all six variants.
Regions (fractions of the card): **illustration** x .06-.94 y .10-.52;
**artwork only**, away from name plate and text box, x .12-.88 y .14-.47;
**core** x .22-.78 y .18-.42.

| rule (flag below) | right flagged | D | R (metal/recolour) | L |
|---|---|---|---|---|
| illustration NCC < 0.233 (lowest right) | 0/864 | **0/24** | 0/38 | 0/43 |
| illustration NCC < 0.308 | 4/864 | 8/24 | 0/38 | 1/43 |
| artwork-only NCC < 0.293 (lowest right) | 0/864 | **0/24** | 0/38 | 0/43 |
| artwork-only NCC < 0.364 (lowest right but a binder shot) | 1/864 | 5/24 | — | — |
| artwork-only NCC < 0.397 | 4/864 | 9/24 | 4/38 | 0/43 |
| core NCC < 0.373 (lowest right) | 0/864 | 5/24 | 2/38 | 0/43 |
| colour (52-bin and hue-only) at the LOCATED artwork, any region | 0/864 | 0/24 | 0/38 | 0/43 |
| colour, only where the art was located (NCC ≥ 0.6), ~1% false | ~8/806 | — | 1/20 | 0/41 |

Medians: right 0.83, D 0.44, R 0.63, L 0.84 (artwork-only, 24 px). The
separation is real on average and useless at the floor: the lowest right
rows are genuine cards under glare, tilted, slabbed, close-cropped or tiny
in frame (looked at, `low-art24.jpg` in the session scratchpad), scoring
0.36-0.45 — exactly where different illustrations sit (0.31-0.59).
**Colour does not separate gold from red once the background is gone**:
right rows' artwork colour reaches near-0 similarity (white balance, holo
glare), so Roy's 72 gold/black Shining Charizards are caught 0 of 72 at
any zero- or 1%-false threshold (Shining right 0.52-0.77, replicas median
0.44 — overlapping even on one card). Held out, the 30th Mew under bubble
Mew scores 0.32 artwork-only: below every D median, above the zero-false
floor. **Not built. By TASK's rule SIFT's three options (CLAUDE.md "SIFT ON
RENDER") are now the photo route, and TASK T3 (what the 10 title-silent
wrong rows on Base Charizard share) is the cheaper one.** Scripts: session
scratchpad `art.js`, `an.js`, `an2.js`, `look.js`.

### IS THIS PHOTO THIS CARD AT ALL? — measured 2026-10-02, NOT built (TASK T2)

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

**Widened to 12 cards, 2026-10-02 (T4) — and the 0/100 does not hold.**
1,010 eBay rows (Raw, US page 1: Base Charizard/Blastoise/Pikachu, Neo
Lugia, Moonbreon, Charizard ex 199, Pikachu VMAX 188, Giratina V alt, Lugia
V alt, Mew ex 151, Umbreon ex 161, JA Charizard ex 201), **every photo
labelled by eye**: 896 right, 89 wrong, 12 stamped reprints, 13 unclear.
SIFT as a WARNING at 47 inliers: **35 of 89 wrong warned (39%), 33 of 896
right warned (3.7%)** — 18 of those 33 on Pikachu VMAX, then read as
"rainbow foil defeats SIFT". **Wrong: most of those 18 were metal
replicas labelled right** (re-labelled below, "SPLIT BY KIND"). At 75:
48% / 6.5%; at 30: 33% / 2.1%. 33 of the 89 wrong are Mew ex's Japanese
copies (same art: SIFT 0 of 33). **Base Charizard's `cheapest` is not made
right at any threshold tried**: $35.99 replica -> $100 replica (47) ->
$150 unidentifiable crop (75); right is $204.50. The cheapest-right count
across the 12: 5 as shipped, **8 after the text gate (5e14670) and the
stamp verdicts, 8 with SIFT at 47, 9 at 75**. Not built: it needs OpenCV
on Render. (The "3.7%, one foil type" reason is superseded below.)

### SPLIT BY KIND — re-measured 2026-10-02 (T2), NOT built

The 35-of-89 above mixed problems a photo can and cannot solve. Every
wrong row, sorted by eye (sheets in the session scratchpad):

| kind | rows | can a photo tell? |
|---|---|---|
| **D** different illustration (Charizard ex 228 under Base Charizard, regular Giratina/Lugia/Umbreon under the alt arts, Ivysaur, EX-era Lugia) | 24 | yes |
| **R** the right line-art in the wrong material/colour (gold/black/silver metal, recoloured foil) | 38 | yes — that is Roy's gold Shining Charizard |
| **L** same art, other language (Mew ex SV2a ×33, JP/FR/DE/PT/CN/KR copies) | 43 | not from the FRONT — the back separates Asian prints (THE CARD BACK) |
| **S** same art, set mark differs (Base Set 2 titled as Base Set) | 6 | the mark, not the art (T2b below) |
| P stamped reprint · M magnet · X lot/card back · U unclear | 12 · 2 · 3 · 18 | |

**The labels were wrong where SIFT disagreed with them.** Art-only SIFT
flagged "right" rows that, looked at again, were not: of Pikachu VMAX's
99, **14 metal replicas, 1 German, 1 Ivysaur, 3 unclear**; plus a gold
Umbreon VMAX, a silver regular-art Umbreon, a gold Lugia V, an EX-era
Lugia, a different JA Charizard ex, and the 6 Base Set 2 copies. Final:
864 right · 62 different-artwork (D+R) · 43 L. Measured on the 1,010 rows
(OpenCV re-run reproduces the stored inliers exactly, 1,010/1,010):

| rule (flag below / above) | right flagged | D | R | L | S+P |
|---|---|---|---|---|---|
| colour histogram < 0.4 (centre of photo vs our scan) | 15/864 (1.7%) | 1/24 | 6/38 | 3/43 | 0/18 |
| colour histogram < 0.5 | 41/864 (4.7%) | 3/24 | 11/38 | 4/43 | 2/18 |
| perceptual hash > 38 bits | 11/864 (1.3%) | 2/24 | 2/38 | 1/43 | 1/18 |
| SIFT whole card < 47 | 15/864 (1.7%) | 18/24 | 30/38 | 2/43 | 0/18 |
| SIFT whole card < 30 | 4/864 (0.5%) | 17/24 | 23/38 | 1/43 | 0/18 |
| SIFT **illustration only** < 8 | 8/864 (0.9%) | **23/24** | 25/38 | 0/43 | 0/18 |
| **SIFT whole < 25 AND illustration < 8** | **0/864** | 16/24 | 18/38 | 0/43 | 0/18 |
| SIFT whole < 30 OR illustration < 3 | 7/864 (0.8%) | 23/24 | 27/38 | 1/43 | 0/18 |

"Illustration only" keeps our scan's keypoints in the art band (y
0.10-0.52 of the card): **a regular and an alt-art of one Pokémon share
every word of card text**, and whole-card SIFT scored Giratina/Lugia/
Umbreon regulars 45-82 inliers on the text alone. Colour after SIFT
alignment was worse than either (right photos' colour moves with light
and holo far more than the art does).

**Roy's two cards, held out** (labelled by eye; thresholds NOT tuned on
them). Shining Charizard Raw: **72 of 87 rows are gold/black metal
replicas**, priced up to $949.99; 10 genuine. Bubble Mew ex 232: the
cheapest row ($190) is the 30th Celebration Mew; 42 right.
- SIFT strict rule: 0/52 right flagged, the 30th Mew caught, **2 of 72
  gold replicas**. Whole < 47: 7 of 72. Replicas copy the line art (median
  81 inliers); genuine copies score 252-589 — an absolute threshold
  cannot use that gap, since a right photo elsewhere scores 4.
- Colour < 0.5: **43 of 72 gold replicas, 0 of 10 genuine** — but 2 of 42
  right bubble Mews, and 4.7% of right rows on the 12 cards.

**What this says, per kind.**
- **D, different illustration — a filter candidate.** The strict rule
  flags 0 of 916 right photos over 14 cards and catches 16 of 24 + the
  30th Mew; it misses the same-Pokémon-other-art cases (Giratina/Lugia V
  regulars), which illustration-only SIFT catches (23/24) at 0.9% false.
  At 0/916 the 95% upper bound on the false rate is ~0.3%. Not built:
  OpenCV is not on Render (opencv.js/wasm, then timed THERE — the stamp
  lesson), ~420 ms a photo here.
- **R, right art in the wrong material — no clean rule.** SIFT keeps
  them (the line art IS the card's); colour catches gold-on-red at 4.7%
  false elsewhere. A warning at best; the per-card gap above (genuine
  250+, replicas ≤155) suggests a rule relative to the card's own best
  matches — not measured.
- **L, other language — not the FRONT's job; the BACK's.** The front is
  the same artwork: 0 of 43 at the strict rule. But Asian-language prints
  carry another back, and sellers post it — 14 of 15 Japanese Mew ex SV2a
  copies showed it; on 98 fresh listings the Japanese back was found on 11
  of 12, 0 of 52 English. Built: `backcheck.js` refuses a Japanese-family
  back on an English card (THE CARD BACK). A European-language copy shares
  the English back, so it stays the title gates' job (they refuse 33 of 34
  Mew ex by "SV2a").
- **The rainbow-foil "blind spot" mostly was not one**: with the
  replicas re-labelled, Pikachu VMAX's right rows flagged at 47 fall from
  18 to 4.

**T2b — Base Set 2 carries a mark; 6 copies found.** Our scans: Base Set
2 and Legendary Collection both print a set symbol right of the
length/weight bar; Base Set prints nothing there. Aligning every Base
Set photo by SIFT and cropping that spot (63/84 Charizard, 124/128
Blastoise, 187/187 Pikachu aligned): **3 Blastoise and 3 Pikachu "Base
Set" rows were Base Set 2**, titles all saying 2/102 or 58/102 Base Set;
0 Charizard; no Legendary Collection. The symbol is ~1/3 the stamp's
size (~20 px at s-l500), so the unaligned stamp matcher will not see it;
a check needs alignment first. Not built.

**What T2 found that matters more.** The text gates do NOT catch nearly
everything on the most-faked card. Base Charizard Raw, eBay US page 1
(2026-10-02): **20 wrong cards shown unflagged among 84 rows**, and the
headline cheapest ($35.99) was a gold-metal replica. Four were flagged by
price, three by the stamp. Some titles say "Metal" or "Gold Foil"; ten say
nothing ("Pokémon cards, Charizard Holo 4/102 Base Set 1999 ... 120 HP
Rare", $289.99, gold metal). "Gold" alone is not a gate (genuine gold
rares — LESSONS §1).

**Read across 12 cards (T4, `5e14670`).** Of the 89 wrong rows, 56 outside
Mew ex; 19 of those titles say what they are, 37 say nothing. Added, each
at 0 of 896 right titles: gold metal / black metal / novelty / magnet /
fridge magnet / wall art; "Portugese"; a case-sensitive `CN`; a Japanese
set code (SV2a, S12a, SM12a…) on an ENGLISH card — 33 of English Mew ex's
34 rows were the Japanese SV2a print; and a bare V straight after the name
of a plain card. 43 wrong newly refused, 0 right. Still in: bare "metal",
"gold foil", "textured" — each is also a genuine card's description.
Raw searches also kept 4 slabs of the right card (a "GRADE 6.5", a PGC 10,
two PSA) — the raw/slab gate's misses, not this section's.

### SIFT ON RENDER — probed 2026-10-03 (T1): no opencv.js build carries it

Every prebuilt opencv.js loaded in node and asked for `new cv.SIFT()`:
docs.opencv.org 4.5.5 and 4.9.0 (4.10 is 404), `@techstark/opencv-js`
4.12.0 and 5.0.0. **None has SIFT** ("cv.SIFT is not a constructor");
4.x builds carry ORB, KAZE, AKAZE, BRISK, BFMatcher, findHomography (5.0
only ORB). Load: ~1 s, 43-66 MB RSS. Stopped there, as TASK said: the
thresholds (whole < 25 AND illustration < 8) belong to SIFT, and another
detector would need its own measurement. The remaining routes are each a
decision, not a fix: **(a)** build opencv.js ourselves with SIFT added to
the JS whitelist (emsdk, a WASM binary we then maintain), **(b)** native
OpenCV on Render (Docker image or a build step; build-time and image
size unmeasured), **(c)** re-measure with a detector the builds do ship.
Also: listing photos are s-l500 (≤500 px), so "resize to 800 first" is a
no-op here — the native run used the photo as fetched and the scan at
360 px wide; a port must do the same.

### CAN THE STAMP MATCHER TELL A JAPANESE COPY? — measured 2026-10-03 (T3), NOT built

Roy's question: if a template finds a stamp, why not the language?
Reading text is OCR. But SV/SWSH Japanese and English cards share their
layout and differ in FIXED text in fixed places, so the stamp matcher
(`stampcheck.nccMax`, unchanged; wider scales, since these marks are half
the card wide) was tried on three regions cut from OUR scans of four cards
held in both languages (Mew ex SV2a/151, Charizard ex SV2a 201/151 199,
Lugia V S12 110/SIT 186, Giratina V S11 111/LOR 186). Each photo is
scored against the JA cut and the EN cut; **d = JA − EN**. Photos: 374
s-l500 rows of the six cards those cuts apply to — 108 Japanese (31 Mew
ex copies + Lugia V + 76 genuine JA Charizard ex), 249 English right,
3 Korean, 1 Chinese. Labels by eye (sheet + zoom), not by title.

| rule (template width 90 px) | JA caught | EN flagged | KR |
|---|---|---|---|
| rule box (exルール / Vルール vs "Pokémon ex rule"), d > 0.15 | 87/108 | 2/249 | 1/3 |
| rule box, d > 0.20 | 36/108 | **0/249** | 0/3 |
| name plate (stage tag + name), d > 0.10 | 64/108 | **0/204** | 0/3 |
| **rule d > 0.20 OR name d > 0.10** | **80/108 (74%)** | **0/249** | 0/3 |
| attack text block, d > 0.05 | 37/108 | 1/204 | — |
| same OR rule, **template width 60 px** | 31/108 | 1/249 | — |

The 2 English flagged at 0.15 are genuine English cards (looked at; small
in frame / toploader). The 28 JA misses are small, angled or slabbed.
Mew ex: 28 of its 31 Japanese copies. The rule box is the real "fixed
furniture" (one line under a big tab in JA, text beside the tab in EN —
identical on every ex/V card of a language); the name plate is per card.

**Why it is NOT built:**
- **Cost.** It works only at ~90 px templates: **10.5 s a photo** here
  (rule + name), ~25 s on Render by the stamp check's 2.5x. At 60 px (3.4
  s here) the glyphs blur and the catch falls 80 → 31. The stamp check is
  ~0.5 s. Not "nearly free".
- **Coverage.** It needs a rule box (ex / V / VMAX… — no plain Pokémon,
  nothing WOTC) and, for the name plate, OUR Japanese scan of the same
  card, i.e. a cross-language pairing we do not store. The rule box alone
  is the generic part, and alone it is 36/108 at 0 false.
- **Yield on what nothing else catches.** Of the 34 Japanese copies in the
  1,010 rows, the title gate already refuses 31 ("SV2a"). The 3 it misses:
  Lugia V (caught here, name d 0.106 — just over) and two Base Set copies
  (no JA scan held, no rule box) — **1 row** in 1,010.
- Korean prints follow the Japanese layout: the rule box reads Korean as
  Japanese (KR 3/3 at d > 0.10). Fine on an English card, useless for
  telling a Korean copy on a JA card.
Revisit only if title-silent foreign copies are measured to be common;
then the rule box (generic, no pairing) is the piece to cost first.

### THE CARD BACK — BUILT 2026-10-04 (T3), `backcheck.js`

**Re-measured as the first step of building, on 98 FRESH listings** (none
of the 210 below; the tooling allowance stopped it short of 100), templates
cut from PUBLISHED SCANS (Bulbapedia's archive: `Cardback.jpg` and `TCG Card
Back Japanese.jpg` — never a listing photo), every listing labelled by eye
(Shining Charizard 28, Base Charizard 18, Japanese Mew ex SV2a 14, Charizard
ex 199 12, PSA 10 Umbreon VMAX 12, Pikachu VMAX 14). Per photo, a family's
back is SEEN when its template scores ≥ 0.55 (English) / ≥ 0.65 (Japanese)
AND beats the other family's by 0.10 — the comparison, not a bare threshold
(Japanese photos reach 0.53 on the English template; English slab close-ups
0.575 on the Japanese one):

| listings | genuine-back label | other-back refusal | no claim |
|---|---|---|---|
| genuine English, back shown (52) | **52** | 0 | 0 |
| metal / printed-fake back shown (17) | 0 | 0 | 17 |
| replica, no back (8) · no back (7) | 0 | 0 | 15 |
| genuine Japanese, back shown, on its own card (12) | 11 | 0 | 1 |
| the same 12 as if on an English card | — | **11** | 1 |
| English Mew ex listed under the Japanese card (1) | — | 1 | — |

The shipped port reproduces the measurement (scores within 0.019 on 295
photos). **Live on Render** (Shining Charizard Raw, first open): the first
20 rows checked in ~75 s in the background, 9 labelled, 11 no claim, 0
refused — 20 of 20 agree with the photos by eye (every "no claim" a gold
metal replica, every label a genuine card).

- **Two positive verdicts, two actions.** A back of ANOTHER language family
  refuses the row (counted in `ebay.rejected`, `backRefused`, droppedSample);
  this card's own family's back labels it "Back photo matches a genuine
  card" — never "verified". **Nothing found claims nothing**: a metal back
  and no back look alike here.
- **A limit, pinned in `backcheck.test.js`**: the matcher reads STRUCTURE,
  not colour — a recoloured print of the genuine back scores 0.73. Real
  metal backs fail because embossing loses the swirl. A printed counterfeit
  with an accurate back would be labelled.
- **Where it runs.** On demand ("Check card back" on any eBay row,
  `/api/back/:cardId?item=`), and automatically after the answer, BACKGROUND
  (yields at the soft stop), at most 20 rows a view, on rows the outlier
  check flagged and every row of `backcheck.MOST_FAKED` (Shining Charizard,
  Base Charizard, Pikachu VMAX). Unchecked rows are SHOWN (unlike the stamp
  gate): a paid optional check is not a gate every row waits on.
- **Cost.** 1 getItem per row checked — the SAME call Verify and Photos
  make (15-minute cache) — and 0 once its verdict is stored (`check_kind
  'back'`, version `back-1`, hashed item id + our card id; no eBay data).
  The calls take the origin of whoever opened the card (a user's view
  counts as user). Photos scored in the stamp worker pool (~0.8 s each
  here). See CALL COST.

### The first measurement (T2, 2026-10-04), kept for the record

The question: every genuine card shares a back, so does one template judge
the whole catalogue? 210 eBay listings, every photo fetched by getItem
(/api/photos, 210 tooling calls; 767 photos at s-l500), every listing
labelled by eye: Shining Charizard 107/105 (26 genuine, 64 metal replicas),
60 rows of the 12 T4 cards, 40 PSA 10 Umbreon VMAX slabs, 20 other-language
rows (15 Japanese Mew ex SV2a on the English card).

- **Sellers post the back: 88%** (184 of 210; 167 of the first 190). Raw
  genuine 23/26 and 37/40, replicas 50/64, slabs 37/40 (through the case).
- **The doubled wordmark is the GENUINE design.** "POKÉMON" upright at the
  top and inverted at the bottom is on every real back; replicas copy it.
  What differs is the material (all 50 replica backs gold/black/silver).
- **One back per language family, not per catalogue.** English and every
  European language share one; modern Japanese/Korean/Chinese print another
  (rainbow swirl, orbs); pre-2001 Japanese a "Pocket Monsters" one.

Matcher: `stampcheck.nccMax`/`resize` (shipping, no OpenCV), template the
INSIDE of the back (border removed) cut from listing photos, shrunk to 24 px,
22-95% of the photo width, upright and a quarter turn. Best photo per
listing:

| check | genuine EN back | metal back | JA back | no back shown |
|---|---|---|---|---|
| English back, NCC ≥ 0.44 | 106/107 | 0/58 | 0/17 | 0/26 |
| English back, NCC ≥ 0.50 | **104/107** | 0/58 | 0/17 | 0/26 |
| Japanese back, NCC ≥ 0.60 | 0/107 | 0/58 | 16/17 | 0/26 |
| Japanese back, NCC ≥ 0.65 | 0/107 | 0/58 | **13/17** | 0/26 |
| metal back template | ~0.75 on every kind — useless | | | |

Medians: English template on genuine 0.77, metal 0.29, JA 0.35, none 0.30;
the closest wrong row is a JA back at 0.43. Japanese template on JA 0.83,
everything else ≤ 0.59. The JA miss is the pre-2001 back (another design).
**Shining Charizard: a genuine back found on 25 of 26 genuine listings and 0
of 63 replicas.** Japanese Mew ex SV2a on the English card: 14 of 15 show
the Japanese back — the "other language" kind IS the back's job when the
back is posted (the lesson in SPLIT BY KIND is corrected to say so).

**What it cannot do.** A metal back and no back both read "no genuine back
found": absence is weak evidence (26 listings posted none), never a refusal.
A different GENUINE card (kind D) has a genuine back. A European-language
copy has the English back. A printed counterfeit with a printed back is not
measured.

**Cost and the rule it suggests.** 1 getItem per listing — the same call
Verify and Photos make, shared 15-minute cache — plus ~0.7 s a photo a
template here (~4 photos a listing; ~2.5x on Render). Worth it on suspect
rows, not across the board: e.g. rows the outlier check flags or the 55
reprint-sensitive and most-faked cards, on demand. Strong evidence: a
JAPANESE back on an English card (refuse, like the stamp) and a GENUINE back
(the row may say "back photo matches a genuine card", never "verified").
Thresholds then were read off this sample (the genuine template came from
one of its photos, i2) — which is why the fresh re-measurement above came
first, with scan templates.

### CALL COST — what spends eBay quota, measured (2026-10-01)

**Every row was exercised, not read from the code.** Server and scripts ran
under `node -r ./costmeter.js`: eBay stubbed (never sent), every guarded call
counted by origin and kind, every outbound request counted by host, every DB
write swallowed. The page was driven in a real browser against the metered
server. Numbers are eBay HTTP calls. **Re-measure with costmeter.js before
changing any row** — how to use it is at the top of that file.

Budget: 5,000/day · 600/hour (all origins) · tooling 300/day inside the day.

#### Recurring — runs whether anyone is there or not
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

#### User — costs only when someone acts
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
| Lookalike check (bubble Mew ↔ 30th Mew) | automatic, same gate | **0** — CDN photos only |
| Same-name sibling check (2026-10-04) | automatic, same gate, on 6,891 English cards | **0** eBay — CDN photos + our scans from TCGdex (once per process per card) |
| Auctions (2026-10-04) | part of every search | **0 extra** — `buyingOptions` is a filter on the same call |
| **Back check, automatic** (2026-10-04) | after opening a most-faked card (Shining Charizard, Base Charizard, Pikachu VMAX), or rows the outlier check flagged | **+1 getItem per row not yet checked, at most 20 a view**, background (yields at the soft stop); **0** once a row's verdict is stored. Measured live: Shining Charizard Raw first open = 1 search + 20 getItem; its 52 rows clear over three opens, then 1 a view. Counted under the opener's origin |
| "Check card back" (one row) | `/api/back` | **1** getItem — **0** if Verify or Photos fetched it in the last 15 min, or the verdict is stored |
| Search, query resolving to one card | `/api/search?q=` | **1 per resolved card** (+ reprints: "Charizard 4/102 Base Set" = 3); graded query 1 |
| Search, ambiguous name ("Pikachu") / nonsense / `listings=0` | same | **0** — listings only when the query resolves |
| Trending · cards · history · sets · set page · market · alerts (list, triggered) · portfolio · quota read · listings-log · `dryRun=1` | | **0** each |
| Alerts screen, 6 alerts | render from the loaded list | **0** |

#### Tooling — counted against the 300/day allowance

A one-day raise goes in `ebayquota.TOOLING_OVERRIDES`, keyed on the UTC day,
so it lapses by itself (2026-10-04: 700 then 2,000, Roy, for the card-back and query audits —
re-measurement).

| tool / route | typical invocation | eBay |
|---|---|---|
| `/api/ebay/conditions` | `?items=25` | **26** (1 search + 25 getItem) |
| `/api/ebay/conditions` | `?aspects=1&aspect=Card%20Condition&verify=4` | **>= 2** — the stub returns no aspect values, so the per-value verify loop did not run; real cost is higher |
| `/api/ebay/conditionvalues` | default | **7** (5 search + 2 metadata) |
| `/api/ebay/certprobe` | `?grader=PSA&single=12` | **13** (1 + 12 getItem) |
| `/api/ebay/gradecost` | `?grade=PSA%2010` | **2** on a light card; more pages on a busy one |
| `/api/ebay/marketprobe` | default sites | **11 per card** (8 sites + NOCAT/NOSET variants) — the 12-card run was ~132 |
| `/api/ebay/marketprobe` | `?mp=EBAY_US&shape=pair\|bare\|or` | **1 per site** — how the number is asked (T0); `extraPhotos` says whether search rows carry the seller's other photos (they do not: 0 of 63) |
| `/api/ebay/marketprobe` | `?mp=EBAY_DE` | **2** |
| `/api/ebay/marketprobe` | `?mp=EBAY_US_NOSET&shape=bare&titles=1` | **2** — `titles=1` returns every title each site returned, kept and refused with the reason, at no extra call |
| `node querygap.js en` | every visible set, 1 card (3 where it failed) | **~230** (201 sets, 2026-10-04); `--dry` **0**; `--resume` continues a stopped run |
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

### The test suite — all green 2026-09-29

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
node outlier.test.js         # 22   the price test, on the real Giratina #186 spread; Shining Charizard's fake-set median (6 fail on the old code)
node outlierwire.test.js     # 34   ...and that it is actually REACHED: both payloads; the catalogue reference only raw + current
node printinggate.test.js    # 116   reprint/language/year, BOTH marketplaces (CRLF-tolerant)
node reprint.test.js         # 126  reprints by SET ID, both directions, real titles
node printrun.test.js        # 39   1st Edition / Shadowless / Unlimited, only where they existed
node selector.test.js        # 531  every grader, every published grade, through the real gate
node rawgate.test.js         # 74   every grader's slab refused from a raw search — AND
                             #      TAG TEAM / ACE SPEC / Alt Art kept
node scopeguard.test.js      # 28
node setlist.test.js         # 27   the browsed set list resolves; set page == card page; ingest.js tracked
node sourcerank.test.js      # 48   9 of 15 decision cases PERMITTED, not only blocked
node tcgdexprice.test.js     # 81   + a TCGdex block for a printing the card does not have is skipped (both directions)
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
node nofabricated.test.js    # 54   no password/card input, no invented shops/holdings/prices, no tile badge from a hash of the id (--deployed: Render's HTML too)
node nosoldscrape.test.js    # 17   no eBay sold-page scrape; real /api/market handler, network stubbed (--live: +3)
node gateaudit.test.js       # 62   T9: every path reaches the gates it needs, and reports (--live: +8)
node variants.test.js        # 81   T10: printings from the REAL TCGdex shape; the gate; every reader; the page; Typical follows the printing (--db: +6)
node pricesource.test.js     # 56   T1/T4: set-checked TCGplayer match; shared products refused; Yahoo mirrors kept out of the base
node eusites.test.js         # 80   T1: eBay DE/FR/IT/ES titles — reprints, junk, slabs, conditions; both directions, real titles
node quotaui.test.js         # 24   T3: a quota refusal reaches the panel in words; indicator wiring (23 fail on the old page)
node edition.test.js         # 76   T3: 1st Edition/Shadowless/Unlimited — reader, gate, query, headline rule, page (--db: +2)
node promo.test.js           # 69   Black Star Promos: no set total asked or checked; real live titles kept; McDonald's refused
node subset.test.js          # 42   TG16/TG30, SV107/SV122, GG01/GG70 asked and kept; Generations RC by number alone; H01-H09 and McDonald's asked as sellers write them
node noautoexpand.test.js    # 19   opening a card is one call: no auto-expansion in any form; empty panel names the sites not asked
node claudesplit.test.js     # 23   every CLAUDE_ARCHIVE.md heading kept or cited here; the restored lessons present
node pricecheck.test.js      # 34   editions compared like for like; the internal search only where TCGdex cannot price, labelled; Cardmarket a second reading (--db: +2, rolled back)
node setyield.test.js        # 42   a set (or 200+ cards in a row) that priced nothing is NAMED and exits 2; scattered gaps are not; the due-clock reads the headline row
node priceage.test.js        # 11   the card page says when its headline was recorded, and when it is old
node pricequality.test.js    # 36   old / thin / unsettled both ways; the page's REAL priceMarksHtml; every headline screen wired; 30 days one definition (--db: +3)
node fakewords.test.js       # 48   T4: what the wrong cards said (merch phrases, CN, Portugese, a JA set code on an EN card, a bare V) and the genuine phrasings kept; 2026-10-04 gold before 2004 + Shining Charizard phrases (13 fail on the old gate)
node stampcheck.test.js      # 107  the stamp GATE: found refuses, weak keeps, unchecked HIDDEN; verdicts survive a restart (store, hashed keys, version, photo change); one job per item; poll never searches; both directions on our scans (--live: +8)
node pslabel.test.js         # 29   T0: PSA-label titles ("#28", GAME/ROCKET/EXPEDITION/EN-151) kept, other cards' labels refused; a slab asks the bare number, raw the pair; "PSA 8 Card" is not a lot (12 fail on the old gate)
node auction.test.js         # 10   T0: auctions asked for; a current bid labelled, never the cheapest or a baseline (6 fail on the old code)
node lookalike.test.js       # 17   T1: bubble Mew ↔ 30th Mew both directions on our scans; verdict keyed on item + our card; the page says "matches … better", never "stamp"
node refused.test.js         # 24   T4: refused rows carried with price, link and reason; never counted; drawn collapsed at the end (22 fail on the old code)
node sibling.test.js         # 25   T1 2026-10-04: a same-name card's photo under our number refused at 0.40; unchecked hidden only below 55% of a current price; nothing hidden without one (20 fail on the old code)
node ownname.test.js         # 27   T2: the card's own name/set name is never lot vocabulary; "partial set" is; δ not asked (--db: every English card, 0 refused on its own identity)
node lettered.test.js        # 17   T2: a lettered number is its own card, both ways; xya / Futsal asked as sellers write them (7 fail on the old gate)
node saletype.test.js        # 22   T5: Buy It Now / Auctions — saleType, a bid never cheapest, the two tabs (19 fail on the old code)
node backcheck.test.js       # 25   T3: English/Japanese backs both ways; other-language back refuses, own back labels, nothing claims nothing; never "verified"; the structure-not-colour LIMIT pinned; shared getItem, background, stored hashed
```

Run them all:

```powershell
Get-ChildItem *.test.js | ForEach-Object { node $_.Name } ; node jptest.js
```

**`node ingest.js scrape` is deleted** (2026-10-01) — it parsed eBay's
completed-listings HTML and risked an IP block; it now refuses. Never bring it
back in any form. Use `safeprices` or `refresh`.

---

## 2026-10-04/05 (night) — T1 PSA, T2 the catalogue query audit, T3 missing cards, T4, T5 sale type, T6 diagnosed

**T1 — PSA: the 429 does not read the key.** From the home IP, 20:02 UTC:
keyed `GetByCertNumber/170514194` → **429** "maximum admitted 100 per Day",
`Retry-After: 37631` (reset ~06:29 UTC — the window Render got). Keyless and
a deliberately corrupted key: **the identical 429 and Retry-After.** So the
limiter answers before authentication, and "429 means the key's pool is
spent" does not follow. Either PSA counts per IP and this home IP is shared
too (carrier NAT), or the bucket is shared wider. **Not decided; nothing
built.** The test that decides it is still the first call after the reset
from home: keyed first, then a corrupted key.

**T2 — every set's query, measured** (`querygap.js`, `6add397`; tooling
allowance raised to 2,000 for the day, Roy). One card per set (dearest
$2-150, not a reprint original), two more where it failed; 201 visible
English sets. **185 answered; 10 failed on every card; 6 partly.** By cause:

| cause | sets / cards | fix | after |
|---|---|---|---|
| the card's OWN set name or card name is lot vocabulary | **sm6 Forbidden Light (all 168)**, ex5.5, + 67 cards by name (Gym Badge, Mystery Garden, Tool Box, Iron Bundle, Booster Energy Capsule, Energy Coin, Hop's Bag, Reset Stamp, Custom Catcher, Jumbo Ice Cream, Suspicious Food Tin, Puzzle of Time, Team Yell Towel, Light Toxtricity…) — **236 of 21,152** | the lot test masks the card's own name + set name (`243fb77`) | 0 of 21,152; Forbidden Light Lucario GX 23 kept of 28 |
| `δ` in the name — eBay answers NOTHING with it | **191 cards** (ex13, ex15, ex16, pop5…) | δ not asked (`dfe1eea`) | Kingdra ex δ 0→19 kept, Raichu δ 0→42, Mew δ 0→14, Charizard ☆ δ 0→4 |
| a lettered number read as its digits | **31 cards** (ecard2 50a/50b…, XY alt arts 24a, 55a…) — both directions | verifyLetterNumber (`9b88cfc`) | lettered.test.js |
| set written differently + the original set's total | xya Yellow A Alternate ("24a/119 … Alternate Art Promos") | ask "24a Alternate Art", any total | 0 of 105 → 36 of 135 kept |
| number padded, set name not written | fut2020 ("Eevee on the Ball 002/005 Promo") | QUERY_PAD3, no set name | 0 → 7 kept |
| a set listed as one item | — | "partial set", "complete set", "full set", "set lot" (T4) | 0 of 896 right titles carry them |
| no market | ex5.5 Poké Card Creator Pack, mfb My First Battle — not one copy even asked bare | none | — |
| not fixed | exu `Unown %3F/28` (stored URL-encoded; 1 card); miscp Ancient Mew (no number printed) | open | — |

☆, ◇, ♂/♀, [G], "+", "_" and "#" in names each returned rows — measured
before/after on the same 16 cards, only δ cards moved. The 6 partial sets
were correct refusals (30th binder inserts, energy "choose your card"
listings, Alph Lithograph ONE/TWO printed as words, a δ card). Measured on
the 1,010 labelled rows: no verdict changed by any gate edit tonight.
Seen, not fixed: Dragon Frontiers Flygon ex keeps a "World Championships"
deck copy (a different product).
**Data question for Roy:** Yellow A Alternate's 6 cards are ALSO held in
their parent sets (xy4-24a, xy3-55a, xy10-54a, g1-28a, xy9-107a, xy6-92a) —
the swsh9.5tg duplicate case. Not deleted.

**T3 — cards missing INSIDE held sets.** `setgap` only ever asked which
SETS were missing, and the progress file marks a set done after its first
ingest — cards TCGdex added later were never asked for. `node ingest.js
cardgap <lang> [--fix]` (`f12d72d`), insert-only. Measured: **English 6
sets / 104 cards** (tk-hs-g 1→30, tk-hs-r 1→30, mep 60→89, tk-sm-r 19→30,
swshp SWSH299-305, ecard2 128) — all inserted, rarity from manifest, **104
of 104 priced** (tcgdexprices). **Japanese 36 sets / 440 cards**, nearly
all the secret-rare tails (SV8 107-138, S8b 278-285, every SM GX tail) —
inserted, rarity from manifest, prices: estimates until the refresh / Yuyu-
tei reaches them. Logs `cardgap-en-20261004.log`, `cardgap-ja-20261004.log`
(every inserted id; they are the backup — delete by id to undo).
**Found doing it: manifest had never rated 37 Japanese sets (3,432 cards).**
Limitless-ingested sets store "1" where TCGdex lists "001"; manifest asked
`S8-1` and got nothing — exactly #1-99 "not found" on S8/S8b/SM6/SM7/SM8,
every card on SM1M/SM6b/S7D… Fixed (`40e374b`: ask by TCGdex's own
localId); re-run on all 37: 0 not found, 3-19 rarities corrected a set.

**T4.** The $24 cheapest on Alakazam #125 is a Doctor Strange fan card
titled "The Pokémon Company Alakazam EX 125/124 Fates Collide Secret Rare
Holo EN 160 HP": a perfect title, a different illustration (kind D, which
nothing catches — CLAUDE.md). It sits at 0.13x the current price ($181.89),
inside the outlier floor (0.10x). A softer price rule is the T6 "cheap vs
wrong" question — Roy's. **The "Partial Set" lot** passed because no lot
term covered a set sold as one listing; the earlier "0" was a false-POSITIVE
count. Fixed (`243fb77`). **The 10-of-11 rule, fresh sample** (sibling
groups never measured before: Mew ex 151/193/205, Charizard ex 054/234,
Lugia V 138/185/186, Pikachu VMAX 44/188, Rayquaza VMAX 111/217/218, Mew
VMAX 114/268/269; 1,357 photos, the shipping matcher, every row with margin
≥ 0.20 looked at): 17 rows — **14 swaps**, 2 genuine (Rayquaza #111 at
0.218, 0.216), 1 unclear. Shipped ≥0.40: 1 of 14, 0 genuine. **"≥0.20 AND
price nearer the sibling": 2 of 14** — fails: nine are gold Mew #205 listed
as #193 (205/165 read on the photo) and the two are priced alike ($26.88 vs
$29.46); Lugia #138 under #186 at $425 and Pikachu #44 under #188 at $117
are priced as OUR card. **Not shipped.** Across both samples the lowest
genuine margin is 0.307 (Charizard ex 183) — margin ≥0.31 would catch 3 of
14 here.

**T5 — Buy It Now and Auctions** (`bba69f3`). Rows carry `saleType` (an
auction with a Buy It Now price is Buy It Now, its bid in `currentBid`),
the payload `saleTypes`; a live Yahoo auction's yen is now a current bid.
`cheapest` was already Buy It Now only (outlier.trustworthy). Page: the bar
reads "Buy It Now (n) · Auctions (n)"; auctions ending soonest first, bid,
bids, time left, no cheapest; condition/printing/edition filters apply to
both. Live: Mew δ POP 5 — a $90 auction below the $136.83 cheapest, which
stays $136.83; Umbreon VMAX 215 — two auctions, 2d and 5d, 24 bids.
Rows still behind a photo check appear when checked (tab counts follow).

**T6 — diagnosed, not rebuilt.**
- *The home tiles never call `/api/trending`.* They draw "Top gainers is not
  live yet — needs /api/movers, which the API does not serve" (written when
  that was true). The Search screen's sort uses `/api/trending`.
- *Movers today* (`gain-pct`): 24h 326 pairs, 40 ranked, 8 moved ≥10% — all
  TCGdex-path rows, clean. **7d: 1,196 pairs, every one `tcgplayer_market`
  — the TCGplayer internal search;** 30d the same. Until 2026-09-29 the
  nightly priced EVERY English card through the internal search (unlabelled
  `tcgplayer_market`, ~2,500/day); since 09-30 TCGdex comes first
  (`tcgdex_*` sources) and the internal search runs only for the ~2,000
  fallback cards, labelled. So the 7d/30d lists compare the old every-card
  search with the fallback cards' new rows: promos, staff variants
  (Oranguru SM13 $20.72 → $79.99 = "Oranguru - SM13 (Prerelease) [Staff]"),
  Torchic ☆ 1200/4500. Quality flags are attached (5 of the top 60
  unsettled/thin) but not excluded. TCGdex-path 7d pairs cannot exist until
  ~2026-10-06 (the 19,052-card harvest was 09-29; the window wants 7-11 days).
- *Proposed movers rule, for Roy:* TCGdex-path sources only (or the same
  internal-search productId at both ends), quality flags excluded at either
  end, the existing floors kept.
- *Best deals:* no endpoint, no rule. "Below this card's price" IS what
  outlier.js flags as suspect (the fan card above sits at 0.13x). A deals
  shelf also needs listings for many cards, and eBay rows may not be stored
  past 15 minutes: it could only draw from views someone opened in the last
  15 minutes, or spend calls. Both are Roy's to decide before a build.

Calls tonight (tooling): querygap ~230, re-measurements ~60, marketprobe
~30, sibling sample 16. Commits: 6add397 243fb77 f12d72d 8b7901d dfe1eea
431b523 bba69f3 40e374b 9b88cfc.

## 2026-10-04 (evening) — T1 siblings, T2 filter first, T3 the back verdicts read

**T1 — Alakazam EX, Fates Collide.** linkaudit `--live --kept` on xy10-125,
-117, -25 (Raw: 55/65, 49/52, 85/88 kept; PSA *: 48/51, 9/15, 7/7) and all
eight sites (#125 222 rows, #117 139): **0 kept titles with a wrong or
missing N/124.** The card page, search and set page resolve the right ids
(checked in the browser). The wrong rows are photos: #125's cheapest five
are an SVP 050 Alakazam ex ($3, flagged), a Japanese Alakazam ex SAR ($10,
flagged), a Doctor Strange fan card ($24 — the headline cheapest), two #117
full arts ($25, $26.72); #117's $10 is a #25. 6,891 English cards share a
name with another card of their set (2,993 groups, 150 sets). Sibling photo
comparison measured on 1,478 photos / six groups and built at margin 0.40:
7 of 11 swaps, 0 genuine (CLAUDE.md "SAME-NAME SIBLINGS"). Hide rule Roy's:
unchecked hidden only below 55% of a current price. Also seen, not fixed:
"Fates Collide Partial Set | Alakazam EX 125/124" (a 100-card lot photo)
kept — "partial set" is not lot vocabulary yet.

**T2 — the order was right on the server, wrong on the page.** Server:
text gates → stamp → back verdicts → outlier → payload. The page then
grouped EVERY live row by print run: "Print run not stated — median
$228.69, from $35.99" on Base Charizard came from flagged rows (gold
replicas; Charizard ex 228/197 and SVP 056 titled "4/102 Base Set").
`partitionLive` now splits before grouping; flagged rows drawn after
(`44c6394`). The back check covers every group: its 20-a-view budget is per
VIEW (an edition request is its own view) and groups partition one view.

**T4 — refused listings shown** (`270cbc7`): payload `refused[]`, page
"N listings we believe are wrong", collapsed. Live: Alakazam #117 Raw shows
3 (two CGC 9 slabs, an SGC). Live after T1: Alakazam #125 US page 1 — 55
photos compared in ~2 min, 1 refused (a #25 at $150); the $24 Doctor
Strange fan card is back as the cheapest once checked (not a sibling).

**T5 — the set gaps, table first** (logo / art / links measured 2026-10-04;
links = linkaudit --live, 2 cards a set):

| set | logo | art | links | cause |
|---|---|---|---|---|
| sv01, xy10, ecard1 | 404 → **fixed** | full | ok | TCGdex serves .webp, not .png (`7136652`) |
| svp | none | 192/226 | ok | TCGdex no logo; 34 cards no art anywhere held |
| mep | none | 0/60 | ok | no host; TCGdex lists 89 cards, we hold 60 |
| 2023sv, 2024sv | none | 0 | ok | no host (DECIDED 2026-10-02: leave blank) |
| mee (8), sve (8 of 24 artless) | none | 0 / 16 | B | the only listings are "Choose your card" pickers, refused correctly. Real cards; keep |
| mfb | none | 0/34 | A | no host; we hold 34 of 48; query asks "1/48 My First Battle" |
| xya | none | 0/6 | A | **Yellow A Alternate** = alt-art XY Mega-EX (May 2017), printed 24a/**119**, 55a/**111** (the original set's total); we ask "24a/06". TCGplayer: "Alternate Art Promos" |
| ex5.5 | none | 0/5 | A | **Poké Card Creator Pack** = 2004 Kids' WB! contest set, 5 cards, ~5,000 printed (Mudkip raw ~$533). Sellers write "Kids WB Poke Card Creator 1/5"; we ask "…Creator **Pack**" |
| exu | none | 0/28 | A/B | Unown "M/28" — the letter, not a number |
| miscp | none | 0/1 | A | "Ancient Mew 001 promo": no number is printed |
| tk-xy-*, tk-bw-e, tk-sm-r | none | 0 | ok | no host |
| tk-hs-g/-r, tk-dp-l | none | 0 | A | we hold 1 of 30 (hs-g, hs-r), 11 of 11 (dp-l); "HS trainer Kit (Gyarados)" is our name, not the sellers' |
| tk-sm-r/-l | none | 0 | ok | we hold 19 / 18 of 30 |
| sm6 Greninja GX (not on the list) | — | — | A | 0 rows on all three — found by the T1 spot-check, not investigated |

Shared causes: (A) TCGdex .png 404 — fixed; (B) no image host at all —
blank is correct; (C) the query asks our set name / catalogue total, not
what the card prints or sellers write — xya, ex5.5, trainer kits, exu,
miscp, mfb; (D) catalogue incomplete — mep, mfb, tk-hs-*, tk-sm-*. C and D
not fixed: each query change needs measuring both ways (the T0 lesson).

**T3 — the back verdicts on Base Charizard (53 rows shown, 152 hidden for
the stamp check):** 40 genuine back, 10 no claim, 3 unchecked. The $289.99
"Pokémon cards, Charizard Holo 4/102 Base Set 1999 … 120 HP Rare" (the
example among the original ten) is gold metal: **no claim**, as designed —
the back check never refuses an English back. The $35.99, $43.84 and $60
"genuine back" rows are genuine cards of the WRONG Charizard (ex 228/197,
SVP 056): kind D, which a genuine back cannot reveal. What the wrong rows
share: catalogue-shaped titles ("The Pokémon Company … Stage 2 120 HP
Arita") and prices the outlier check already flags against $944.53.

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
