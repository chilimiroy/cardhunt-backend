// printsql.js — which stored price is a card's BASE price (TASK T10, 2026-09-29)
//
// ONE rule, used by every query that picks a card's headline price. It was
// the missing half of the variant column: price_history could hold a
// reverse-holo row (variant 'reverse', 7,117 of them), and no reader ever
// looked at the column — so 241 cards showed their tcgplayer_reverseHolofoil
// price as the card's price. None of the 241 held a real base-printing row.
//
// The rule: a reverse or mirror row (variant 'reverse' / 'reverse-<pattern>')
// is NEVER the base price — unless cards.variants says this card exists ONLY
// in reverse printings. Unknown printings (manifest not yet run) count as
// "has a base printing": every card TCGdex has shown us has one, and a
// reverse price standing in for a base is the error being fixed.
//
// Reverse rows are not deleted and not hidden: /api/history charts them as
// their own series, and /api/cards returns them under printingPrices.
//
// A module, not a string pasted into five queries: five copies of one rule
// is how every pair in this project has drifted.

// ── Edition (TASK T3, 2026-09-30) ──
// The same rule on the edition axis. A 1st Edition price is NEVER the
// card's headline: measured, 10 cards showed a tcgplayer_1stEdition price
// as their price (PROGRESS 2026-09-30), the reverse-as-base shape again.
// Stored 1st Edition prices carry the edition only in their SOURCE name
// (tcgplayer_1stEdition, _1stEditionHolofoil, _mid): the `edition` column
// is empty on all 611. Both are read, so a row written either way is kept
// out. The base is Unlimited; a card holding ONLY a 1st Edition price shows
// no headline price rather than another edition's.
// Three spellings, all real: the scraped `tcgplayer_1stEdition*`, and
// TCGdex's `1st-edition-holofoil` — in the harvest's source name
// (`tcgdex_tcgplayer_1st-edition-holofoil`) and in source_meta.printing.
// Read 2026-09-30 from TCGdex itself: on WOTC sets there is NO plain
// `holofoil` key, only `1st-edition-holofoil` and `unlimited-holofoil`, and
// tcgdexprice.BASE_PRINTINGS tried the 1st Edition key first — so a harvest
// started before that was fixed writes 1st Edition prices under the base
// name. Reading the printing makes every such row land in its own edition.
function editionOfSql(ph = 'ph') {
  return `(CASE WHEN ${ph}.edition IS NOT NULL AND ${ph}.edition <> '' THEN ${ph}.edition
                WHEN ${ph}.source ILIKE '%1stedition%' OR ${ph}.source ILIKE '%1st-edition%'
                  OR COALESCE(${ph}.source_meta->>'printing', '') LIKE '1st-edition%' THEN '1st-edition'
                ELSE NULL END)`;
}
function baseEditionSql(ph = 'ph') {
  return `(COALESCE(${editionOfSql(ph)}, 'unlimited') NOT IN ('1st-edition', 'shadowless'))`;
}

// ── Second readings (2026-10-01) ──
// A price from ANOTHER market, stored beside the headline and never as it:
// source_meta.role = 'second-reading'. First use: TCGdex's Cardmarket price
// on the cards TCGdex has no TCGplayer price for (promos, Shiny Vaults,
// Galarian Gallery …) — EU retail at ~1.6x, a different market; shown as the
// card's (US) price it would be wrong. /api/history still charts it as its
// own series. Headline readers are "the newest real row", so without this
// rule the newer Cardmarket row WOULD have become the headline.
function notSecondReadingSql(ph = 'ph') {
  return `(COALESCE(${ph}.source_meta->>'role', '') <> 'second-reading')`;
}

// ph: the price_history alias. c: the cards alias (must carry `variants`).
// Base printing AND base edition AND not a second reading: every headline
// reader already calls this, so each rule reaches all of them at once (rule 5).
// A HELD card (pricehold.js: two of our cards priced as one TCGplayer
// product, mapping unconfirmed) has no headline at all — not a real row and
// not an estimate. Here, so every headline reader drops it at once. So is a
// REFUSED row (pricehold.notRefusedSql): one our search wrote for a product
// stating another collector number than the card's (TASK-product-matching).
// And NO estimate row is ever a headline (Roy, 2026-10-09): the estimator missed
// the measured price by 4x for the typical card and 17x for a quarter of them.
const pricehold = require('./pricehold');
function basePrintingSql(ph = 'ph', c = 'c') {
  return `((COALESCE(${ph}.variant, '') NOT LIKE 'reverse%'
     OR (${c}.variants IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(${c}.variants->'printings') vp
           WHERE vp->>'key' NOT LIKE 'reverse%')))
     AND ${baseEditionSql(ph)}
     AND ${notSecondReadingSql(ph)}
     AND ${pricehold.notHeldSql(ph)}
     AND ${pricehold.notRefusedSql(ph)}
     AND ${ph}.source NOT LIKE 'estimate%')`;
}

// ── A MARKED headline: shown, with its marker, and fed to NOTHING ──
// (Roy, 2026-10-10.) A price that may be out of date is still worth showing,
// labelled; it must not move anything. ph is the headline row ALREADY CHOSEN
// (the latest basePrintingSql row) — never a filter applied before choosing,
// which would quietly fall back to an older, unmarked price. Marked when:
//   old      recorded more than MARK_DAYS ago (45; at 30, one Yuyu-tei run
//            nobody repeated marked 9,516 Japanese cards — a stopped job)
//   ask      the cheapest listing where there is no market price (basis 'ask',
//            or a pokemontcg.io `_low` row)
//   product  a TCGplayer-sourced row with no recorded product: which product
//            it priced cannot be checked (1,011 English headlines, 2026-10-10)
//   history  an English card with no measured, unrefused row naming a product
//            at all (1,191 cards) — the whole history is unverifiable
// Measured and chosen 2026-10-10 (PROGRESS). Dropped: "most rows unknown"
// (78% of English — the pre-October search rows dominate every chart) and
// lowest-listing multiples read from our stored July pokemontcg.io copy.
// Twin in JS: pricequality.markOf (the reasons, for the page).
const MARK_DAYS = 45;
const TCG_SOURCE_SQL = ph => `(${ph}.source LIKE 'tcgplayer!_%' ESCAPE '!' OR ${ph}.source LIKE 'tcgdex!_tcgplayer!_%' ESCAPE '!' OR ${ph}.source = 'TCGPlayer market price')`;
function markedSql(ph = 'ph') {
  return `(${ph}.recorded_at < NOW() - make_interval(days => ${MARK_DAYS})
     OR COALESCE(${ph}.source_meta->>'basis', '') = 'ask' OR ${ph}.source ~ '^tcgplayer_.*_low$'
     OR (${TCG_SOURCE_SQL(ph)} AND ${ph}.source_meta->>'productId' IS NULL)
     OR (${ph}.card_api_id LIKE 'en-%' AND NOT EXISTS (
           SELECT 1 FROM price_history pk WHERE pk.card_api_id = ${ph}.card_api_id AND pk.grade IS NULL
             AND pk.source NOT LIKE 'estimate%' AND pk.price_usd > 0 AND pk.source_meta->>'productId' IS NOT NULL
             AND ${pricehold.notRefusedSql('pk')})))`;
}

// The same rule in JS, for a row already in hand — used ONLY by tests to
// check the SQL against it on real rows (printsql.test via variants.test).
function isBasePrintingRow(variant, cardVariants) {
  if (!String(variant || '').startsWith('reverse')) return true;
  const p = cardVariants && Array.isArray(cardVariants.printings) ? cardVariants.printings : null;
  return !!(p && p.length && p.every(x => String(x.key).startsWith('reverse')));
}

// JS twin of editionOfSql, for rows already in hand.
function editionOfRow(r) {
  if (r && r.edition) return r.edition;
  if (/1st-?edition/i.test(String((r && r.source) || ''))) return '1st-edition';
  const pr = r && r.source_meta && r.source_meta.printing;
  return /^1st-edition/.test(String(pr || '')) ? '1st-edition' : null;
}

module.exports = { basePrintingSql, isBasePrintingRow, editionOfSql, baseEditionSql, editionOfRow, notSecondReadingSql,
                   MARK_DAYS, markedSql, TCG_SOURCE_SQL };
