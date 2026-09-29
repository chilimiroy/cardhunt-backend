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

// ph: the price_history alias. c: the cards alias (must carry `variants`).
function basePrintingSql(ph = 'ph', c = 'c') {
  return `(COALESCE(${ph}.variant, '') NOT LIKE 'reverse%'
     OR (${c}.variants IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(${c}.variants->'printings') vp
           WHERE vp->>'key' NOT LIKE 'reverse%')))`;
}

// The same rule in JS, for a row already in hand — used ONLY by tests to
// check the SQL against it on real rows (printsql.test via variants.test).
function isBasePrintingRow(variant, cardVariants) {
  if (!String(variant || '').startsWith('reverse')) return true;
  const p = cardVariants && Array.isArray(cardVariants.printings) ? cardVariants.printings : null;
  return !!(p && p.length && p.every(x => String(x.key).startsWith('reverse')));
}

module.exports = { basePrintingSql, isBasePrintingRow };
