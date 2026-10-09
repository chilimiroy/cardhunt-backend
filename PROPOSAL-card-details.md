# PROPOSAL — card-detail fields from TCGdex (TASK-tcgdex-fields T3)

Proposal only. **Nothing here is built and no column is added.** Roy approved
the column-versus-jsonb split on 2026-10-09; building waits for his go.

All of it comes out of the response the nightly already fetches for every
English card it prices (`ingest.js tcgdexPriceFor`): zero new requests. English
only — Japanese (14,463) and Chinese (8,313) cards would get none of it, and a
page showing these fields must say *not recorded* when they are absent.

## What TCGdex actually returns (measured 2026-10-09)

Shapes read from the card endpoint (`/v2/en/cards/{id}`); coverage and sizes
from all 21,256 visible English cards (21,255 on TCGdex: 17,824 Pokémon, 2,863
Trainer, 568 Energy), cross-checked against the card endpoint on 40 cards.

| field | shape (as returned) | on how many cards | size (JSON bytes, median / p95 / max) |
|---|---|---|---|
| `hp` | integer, e.g. `180` | 17,916 | 2 / 3 / 3 |
| `types` | array of strings, 1–2 items, e.g. `["Psychic"]` | 17,925 (2 types: 103) | 11 / 13 / 24 |
| `stage` | string: Basic, Stage1, Stage2, VMAX, VSTAR, MEGA, LEVEL-UP, BREAK, V-UNION, RESTORED, Baby | 17,110 (none: 4,145 — 2,863 Trainers, 449 Energy, 833 Pokémon, e.g. TAG TEAM cards) | 7 / 8 / 10 |
| `evolveFrom` | string, e.g. `"Charmeleon"` | 7,371 | 9 / 14 / 26 |
| `abilities` | array of `{type, name, effect}`, up to 3; `type` measured: Ability 2,677, Poke-POWER 634, Poke-BODY 632, Pokemon Power 170, Ancient Trait 36 | 4,134 | 202 / 353 / 682 |
| `attacks` | array of `{cost: [string], name, effect?, damage?}`, up to 4; `damage` is a NUMBER on the card endpoint (a string on GraphQL) | 17,721 | 225 / 437 / 790 |
| `weaknesses` | array of `{type, value}`, value like `"×2"` | 16,697 | 33 / 35 / 69 |
| `resistances` | array of `{type, value}`, value like `"-30"` | 4,913 | 35 / 36 / 70 |
| `retreat` | integer 0–5 | 17,753 | 1 / 1 / 1 |
| `legal` | `{standard: bool, expanded: bool}` | 21,255 | 34 / 35 / 35 |
| `description` | string (flavour text) | 10,429 | 104 / 143 / 200 |

All eleven, all English cards: about 8.1 MB of JSON.

Not on the task's list but in the same response, and needed if a Trainer or
Energy card is to show anything (added at Roy's request, 2026-10-09; measured
over all 2,863 Trainer and 568 Energy cards, GraphQL, 0 errors):

| field | shape (as returned) | on how many cards | size (JSON bytes, median / p95 / max) |
|---|---|---|---|
| `effect` | string, the card's rules text | Trainer 2,835 of 2,863 (none: 30th / 30th-c entries, dp5-91, …); Energy 211 of 568 (basic Energy has no text) | Trainer 142 / 339 / 588; Energy 265 / 437 / 562 |
| `energyType` | string: `Normal` 336, `Special` 196 | Energy 532 of 568 (36 none); one Trainer carries `Special` | 8 / 9 / 9 |

Also there, smaller: `trainerType` (Supporter 1,182, Item 863, Tool 331,
Stadium 258, Rocket's Secret Machine 5, Technical Machine 4, none 220),
`suffix`, `item`. Both `effect` and `energyType` go in `card_text` below, where
the approved split already put them; neither needs a column of its own unless a
filter ("Special Energy") is wanted.

### Attack damage — ONE shape: a string, as printed

The two endpoints disagree: GraphQL gives every damage as a string; the card
endpoint gives `10` as a NUMBER and `"10+"`, `"20×"`, `"?"` as strings — two
types in one field (checked on 2011bw-10 `[10, 20]`, 2011bw-6 `["10+"]`,
base1-40 `[20, "?"]`). **Standardise on the string exactly as printed** (the
GraphQL shape), written as `String(damage)` whichever endpoint answered.

Why: of 22,790 attacks with a damage value, 4,932 (22%) are not a bare number —
`N+` 3,202, `N×` 1,361, `Nx` 279, `N-` 59, `N＋` (full-width) 20, `N−` 4, `?` 3,
`n/a` 3, one energy-cost string `{L}{C}{C}` (xya-28a). A number cannot hold
"30+" or "?", and a field that is sometimes a number makes every reader branch.
The printed text is what the page shows; no reader does arithmetic on it. The
modifiers are kept as printed — `×` and `x`, `+` and `＋` are NOT folded
together, because folding is inventing. 5,838 attacks have no damage (an effect
only): stored without the key, never `"0"`.

Source defects to carry, not repair: 15 cards have 18 attack entries with no name
(GraphQL returns `null` in the list; the card endpoint a nameless
`{cost, damage}` — e.g. 2012bw-8, whose second attack is printed as text
inside the first's effect). The writer keeps an attack only when it has a name;
the dropped count is printed by the run.

## Recommendation: columns for what is filtered on, jsonb for what is only shown

**Columns** — single values, small, and the ones a search filter would use:

| column | type | from |
|---|---|---|
| `hp` | integer | `hp` |
| `types` | text[] (GIN-indexable for "Fire cards") | `types` |
| `stage` | text | `stage` |
| `evolve_from` | text | `evolveFrom` |
| `retreat` | smallint | `retreat` |
| `legal_standard`, `legal_expanded` | boolean | `legal` — note it CHANGES at each rotation; it is a reading with a date, not a fact about the card |
| `description` | text | `description` |

**One jsonb** — `card_text`: `{abilities, attacks, weaknesses, resistances,
effect, trainerType, energyType, suffix}`, stored as the card endpoint returns
them, except attack damage, always the printed string (above). These are lists of objects that are displayed, not queried: a column per
attack would be invented structure (a card has 0–4 attacks, each with a cost
list), and a child table would be a second write path for display text. jsonb is
the honest shape. If a filter on them is ever wanted (e.g. "has an ability"), a
generated column can be added then.

**One `card_details_checked_at`** for the lot — the same rule as the artist
and the regulation mark: NULL = never asked; set with NULL values = TCGdex had
none. A response without a field never erases a stored value.

**One migration for all of it** (`migration-card-details.sql`), run by Roy, if
taken. Writer: one function beside writeIllustrator / writeRegulationMark in
`tcgdexPriceFor`, no new request.

## How long until it is complete

The nightly asks TCGdex for every English card it prices. By tier, about
2,900 cards come due a night (hot 979 daily, active 2,151 every 3 days,
steady 3,697 weekly, slow 5,778 fortnightly, dormant 8,651 monthly) — under
the 4,000 cap — so every English card is asked within 30 days of the
migration; the most valuable within days. No early backfill.

## Open points for Roy

- `legal` is time-varying: store it as a dated reading, or leave it out.
- Display: the card page has room under the details row; a search filter by
  type or stage is a separate decision once the columns exist.
