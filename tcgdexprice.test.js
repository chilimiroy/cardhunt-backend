/**
 * ══════════════════════════════════════════════════════════════
 * tcgdexprice.test.js — tests for the TCGdex pricing parser
 *
 *   node tcgdexprice.test.js
 *
 * Standalone on purpose. Tests living inside ingest.js vanish exactly
 * when they are needed — that file has been reverted twice by a
 * downloaded copy landing on local work. See CLAUDE.md.
 *
 * `isUsablePrice` is a gate that REJECTS records, and CLAUDE.md is
 * explicit about how that goes wrong: `looksLikeJunk` was tested only
 * on what it blocked, passed, and silently destroyed ~80 valid prices
 * per set because a bulk common at TCGPlayer's $0.15 floor looked like
 * junk. So the ALLOW cases below are the important half of this file.
 * A gate tested only on refusals passes by refusing everything.
 *
 * Fixtures are real API responses, trimmed. Recorded 2026-09-03.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const T = require('./tcgdexprice.js');

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(label + (detail ? `\n        ${detail}` : ''));
}
function eq(actual, expected, label) {
  ok(actual === expected, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ══════════════════════════════════════════════════════════════
// FIXTURES — real responses, trimmed to the pricing block
// ══════════════════════════════════════════════════════════════

// en/swsh3-136 Furret, Uncommon. Has both normal and reverse-holofoil.
const FURRET = {
  id: 'swsh3-136', name: 'Furret', rarity: 'Uncommon',
  pricing: {
    cardmarket: {
      updated: '2026-09-02T15:19:36.992Z', unit: 'EUR', idProduct: 483559,
      avg: 0.08, low: 0.02, trend: 0.05, avg1: 0.16, avg7: 0.08, avg30: 0.09,
      'avg-holo': 0.26, 'low-holo': 0.04, 'trend-holo': 0.23
    },
    tcgplayer: {
      unit: 'USD', updated: '2026-09-02T15:20:18.178Z',
      normal: { productId: 219333, lowPrice: 0.02, midPrice: 0.25, highPrice: 25.23, marketPrice: 0.26, directLowPrice: 0.1 },
      'reverse-holofoil': { productId: 219333, lowPrice: 0.17, midPrice: 0.4, highPrice: 19.98, marketPrice: 0.43, directLowPrice: 0.42 }
    }
  }
};

// en/me02.5-284 Mega Gengar ex, SIR. Holo-only — NO `normal` key.
const GENGAR = {
  id: 'me02.5-284', name: 'Mega Gengar ex', rarity: 'Special illustration rare',
  pricing: {
    cardmarket: { unit: 'EUR', idProduct: 900001, avg: 893.36, low: 424.99, trend: 896.43 },
    tcgplayer: {
      unit: 'USD',
      holofoil: { productId: 700001, lowPrice: 895, midPrice: 980, marketPrice: 946.24, directLowPrice: 910 }
    }
  }
};

// ja/SV2a-201 Charizard ex. tcgplayer is present-but-NULL, and the
// holo fields carry 0/null on a card worth EUR 417.
const JA_CHARIZARD = {
  id: 'SV2a-201', name: 'リザードンex',
  pricing: {
    cardmarket: {
      updated: '2026-09-02T15:19:37.171Z', unit: 'EUR', idProduct: 719654,
      avg: 417.82, low: 235, trend: 467.64, avg1: 595, avg7: 433.85, avg30: 412.29,
      'avg-holo': null, 'low-holo': null, 'trend-holo': 0,
      'avg1-holo': null, 'avg7-holo': null, 'avg30-holo': null
    },
    tcgplayer: null
  }
};

// A card TCGdex knows but nobody lists.
const UNLISTED = { id: 'x-1', name: 'Nobody', pricing: {} };
const NO_PRICING_FIELD = { id: 'x-2', name: 'Nobody' };

// ══════════════════════════════════════════════════════════════
// 1. THE GATE — what isUsablePrice ALLOWS
//    These are the cases that matter. A gate that rejects them
//    passes every "blocks bad data" test and destroys the table.
// ══════════════════════════════════════════════════════════════

ok(T.isUsablePrice(0.02), 'ALLOW $0.02 — TCGPlayer floor, a real bulk-common price');
ok(T.isUsablePrice(0.15), 'ALLOW $0.15 — the exact price looksLikeJunk wrongly rejected');
ok(T.isUsablePrice(0.01), 'ALLOW $0.01');
ok(T.isUsablePrice(1),    'ALLOW $1');
ok(T.isUsablePrice(946.24), 'ALLOW $946.24 — Mega Gengar ex, genuinely that expensive');
ok(T.isUsablePrice(5399.95), 'ALLOW $5399.95 — a real card CAN cost this; lot detection is not this gate\'s job');
ok(T.isUsablePrice(0.0001), 'ALLOW a tiny positive value rather than inventing a floor');

// ── and what it blocks ──
ok(!T.isUsablePrice(0), 'BLOCK 0 — TCGdex uses 0 for "no data" (trend-holo on a EUR417 card)');
ok(!T.isUsablePrice(null), 'BLOCK null');
ok(!T.isUsablePrice(undefined), 'BLOCK undefined');
ok(!T.isUsablePrice(-1), 'BLOCK a negative price');
ok(!T.isUsablePrice(NaN), 'BLOCK NaN');
ok(!T.isUsablePrice(Infinity), 'BLOCK Infinity');
ok(!T.isUsablePrice('0.26'), 'BLOCK a numeric STRING — silently coercing invites a "0.26" > 100 bug');

// ══════════════════════════════════════════════════════════════
// 2. THE DOCUMENTED-SHAPE TRAP: `reverse-holofoil`, not `reverse`
// ══════════════════════════════════════════════════════════════

{
  const r = T.parsePricing(FURRET);
  ok(r.tcgplayerBase !== null, 'Furret: base printing found');
  eq(r.tcgplayerBase.printing, 'normal', 'Furret: base printing is `normal`');
  eq(r.tcgplayerBase.price, 0.26, 'Furret: base price is the marketPrice');
  eq(r.tcgplayerBase.lowPrice, 0.02, 'Furret: $0.02 low survives the gate');

  ok(r.tcgplayerReverse !== null,
    'Furret: reverse printing found under `reverse-holofoil` — TASK.md documents this key as `reverse`');
  eq(r.tcgplayerReverse.printing, 'reverse-holofoil', 'Furret: reverse key name recorded as returned');
  eq(r.tcgplayerReverse.price, 0.43, 'Furret: reverse price is its own, not the base');

  ok(r.tcgplayerBase.price !== r.tcgplayerReverse.price,
    'Furret: base and reverse are DIFFERENT numbers — the split is the point of T1');

  eq(r.cardmarket.price, 0.05, 'Furret: cardmarket takes trend first');
  eq(r.cardmarket.unit, 'EUR', 'Furret: cardmarket unit is EUR, not assumed USD');
  eq(r.unknownPrintings.length, 0, 'Furret: no unrecognised printings');
}

// ══════════════════════════════════════════════════════════════
// 3. HOLO-ONLY CARDS — `holofoil` IS the base printing
//    Treating only `normal` as base loses every SIR/SAR/Hyper Rare,
//    i.e. exactly the cards worth money.
// ══════════════════════════════════════════════════════════════

{
  const r = T.parsePricing(GENGAR);
  ok(r.tcgplayerBase !== null, 'Gengar: holo-only card still yields a base price');
  eq(r.tcgplayerBase.printing, 'holofoil', 'Gengar: `holofoil` serves as the base printing');
  eq(r.tcgplayerBase.price, 946.24, 'Gengar: $946.24');
  eq(r.tcgplayerReverse, null, 'Gengar: no reverse printing, reported as null not 0');
  eq(r.cardmarket.price, 896.43, 'Gengar: cardmarket trend');
  eq(r.cardmarket.low, 424.99, 'Gengar: cardmarket low carried but not used as headline');
}

// ══════════════════════════════════════════════════════════════
// 4. PRESENT-BUT-NULL PROVIDER, and 0/null meaning "no data"
// ══════════════════════════════════════════════════════════════

{
  let threw = null;
  let r;
  try { r = T.parsePricing(JA_CHARIZARD); } catch (e) { threw = e; }
  ok(threw === null, 'JA Charizard: `tcgplayer: null` does not throw',
    threw && threw.message);
  eq(r.tcgplayerBase, null, 'JA Charizard: null provider yields null, not a crash');
  eq(r.tcgplayerReverse, null, 'JA Charizard: null provider yields null reverse');

  ok(r.cardmarket !== null, 'JA Charizard: cardmarket still read when tcgplayer is null');
  eq(r.cardmarket.price, 467.64, 'JA Charizard: EUR 467.64 trend');
  eq(r.cardmarket.holo, null,
    'JA Charizard: `trend-holo: 0` with `avg-holo: null` reads as null — 0 is NOT a price');
  ok(r.cardmarket.holo !== 0,
    'JA Charizard: holo must not be 0 — a EUR417 card is not free, and 0 passes any `!= null` check');
}

// ══════════════════════════════════════════════════════════════
// 5. ABSENCE IS NOT ZERO, AND NOT AN ERROR
// ══════════════════════════════════════════════════════════════

for (const [label, fixture] of [['empty pricing', UNLISTED], ['no pricing field', NO_PRICING_FIELD]]) {
  const r = T.parsePricing(fixture);
  eq(r.cardmarket, null, `${label}: cardmarket null`);
  eq(r.tcgplayerBase, null, `${label}: base null`);
  eq(r.tcgplayerReverse, null, `${label}: reverse null`);
}

{
  let threw = null;
  try { T.parsePricing(null); T.parsePricing(undefined); T.parsePricing({}); }
  catch (e) { threw = e; }
  ok(threw === null, 'parsePricing survives null/undefined/{} input', threw && threw.message);
}

// ══════════════════════════════════════════════════════════════
// 6. AN UNRECOGNISED PRINTING IS REPORTED, NOT SWALLOWED
//    Silent dropping is how the reverse-holofoil key would have been
//    missed in the first place.
// ══════════════════════════════════════════════════════════════

{
  const odd = { pricing: { tcgplayer: { unit: 'USD',
    normal: { marketPrice: 1 },
    'some-future-printing': { marketPrice: 99 } } } };
  const r = T.parsePricing(odd);
  eq(r.tcgplayerBase.price, 1, 'unknown printing does not displace the base');
  ok(r.unknownPrintings.includes('some-future-printing'),
    'unknown printing is REPORTED so it can be classified, not silently dropped');
}

{
  // `unit` and `updated` are strings on the same object as the printing
  // blocks; they must never be mistaken for printings.
  const r = T.splitTcgplayer({ unit: 'USD', updated: '2026-01-01', normal: { marketPrice: 3 } });
  eq(r.keys.length, 1, 'splitTcgplayer: `unit`/`updated` are not counted as printings');
  eq(r.unknown.length, 0, 'splitTcgplayer: `unit`/`updated` are not reported as unknown printings');
}

// ══════════════════════════════════════════════════════════════
// 7. FALLBACK LADDER — a card with no marketPrice still prices
// ══════════════════════════════════════════════════════════════

{
  const r = T.parsePricing({ pricing: { tcgplayer: { unit: 'USD',
    normal: { lowPrice: 4, midPrice: 6, marketPrice: null } } } });
  eq(r.tcgplayerBase.price, 6, 'falls back marketPrice -> midPrice');
  eq(r.tcgplayerBase.marketPrice, null, 'and records that marketPrice itself was absent');
}

{
  const r = T.parsePricing({ pricing: { tcgplayer: { unit: 'USD',
    normal: { marketPrice: 0, lowPrice: 0, midPrice: 0 } } } });
  eq(r.tcgplayerBase, null, 'an all-zero printing yields null, never $0.00');
}

// ══════════════════════════════════════════════════════════════
// 8. SOURCE NAMES STAY DISTINCT FROM THE SCRAPED SOURCE
//    The cross-check is the entire value of this source. Reusing
//    `tcgplayer_market` would make the two paths indistinguishable.
// ══════════════════════════════════════════════════════════════

ok(T.SOURCE.tcgplayerBase !== 'tcgplayer_market',
  'TCGdex TCGplayer has its own source name, so it can be cross-checked against the scraper');
ok(T.SOURCE.tcgplayerBase !== T.SOURCE.tcgplayerReverse,
  'base and reverse are distinguishable in price_history');
for (const [k, v] of Object.entries(T.SOURCE)) {
  ok(/^tcgdex_/.test(v), `SOURCE.${k} is namespaced tcgdex_ (${v})`);
}

// ══════════════════════════════════════════════════════════════
// 9. THE LANGUAGE GUARD
//    zh-tw returns the JAPANESE card's Cardmarket product — same
//    idProduct, same price, Chinese name. Writing it would price the
//    Chinese catalogue at Japanese values while looking like a 4,164-card
//    win on a catalogue that is 0% priced.
// ══════════════════════════════════════════════════════════════

// ALLOW — the guard must not simply refuse everything.
ok(T.pricingAllowedFor('en').ok, 'ALLOW en — distinct set ids, no collision to inherit');
ok(T.pricingAllowedFor('ja').ok, 'ALLOW ja — canonical owner of the shared set ids');
ok(T.pricingAllowedFor('EN').ok, 'ALLOW uppercase EN — case must not change the decision');

// BLOCK
ok(!T.pricingAllowedFor('zh-tw').ok, 'BLOCK zh-tw — served the Japanese card\'s listing');
ok(!T.pricingAllowedFor('zh-cn').ok, 'BLOCK zh-cn');
ok(!T.pricingAllowedFor('fr').ok, 'BLOCK an unprobed language rather than assuming it is fine');
ok(!T.pricingAllowedFor('').ok, 'BLOCK empty');
ok(!T.pricingAllowedFor(null).ok, 'BLOCK null');

// A refusal must explain itself wherever it is printed.
for (const l of ['zh-tw', 'zh-cn', 'fr']) {
  const r = T.pricingAllowedFor(l);
  ok(typeof r.reason === 'string' && r.reason.length > 20,
    `refusal for ${l} carries a usable reason`);
}
ok(/idProduct|Japanese/i.test(T.pricingAllowedFor('zh-tw').reason),
  'the zh-tw refusal names the actual cause, not just "unsupported"');
eq(T.pricingAllowedFor('en').reason, null, 'an allowed language carries no reason');

// ══════════════════════════════════════════════════════════════
// A block for a printing the card does not have (T2, 2026-10-02).
// Real TCGdex blocks, fetched 2026-10-02. ex9-9 and ex8-108 are holo only
// by TCGdex's own variants, and carry a `normal` block anyway.
const ghost = (tcg, detailed) => ({ pricing: { tcgplayer: tcg }, variants_detailed: detailed });
const HOLO = [{ type: 'holo', size: 'standard' }, { type: 'reverse', size: 'standard' }];
const ex9_9 = ghost({ normal: { marketPrice: 49.99, lowPrice: 400, midPrice: 408.77, productId: 88626 },
  holofoil: { marketPrice: 431.32, lowPrice: 345.09, midPrice: 449.99, productId: 88626 },
  'reverse-holofoil': { marketPrice: 799.99, productId: 88626 } }, HOLO);
const ex8_108 = ghost({ normal: { marketPrice: null, lowPrice: 2300, midPrice: 2300, productId: 88785 },
  holofoil: { marketPrice: 284.99, lowPrice: 227.97, midPrice: 472.5, productId: 88785 } }, [{ type: 'holo', size: 'standard' }]);
// pop4-13 Pikachu: TCGdex lists normal AND holo — the normal block is real.
const pop4_13 = ghost({ normal: { marketPrice: 37.54, productId: 88083 }, holofoil: { marketPrice: 369.63, productId: 88083 } },
  [{ type: 'normal', size: 'standard' }, { type: 'holo', size: 'standard' }]);
{
  let b = T.parsePricing(ex9_9).tcgplayerBase;
  ok(b && b.printing === 'holofoil' && b.price === 431.32, 'SKIP: Emerald Rayquaza (holo only) is priced from holofoil, not the $49.99 normal SKU', JSON.stringify(b));
  ok((T.parsePricing(ex9_9).skippedPrintings || []).includes('normal'), 'the skipped block is reported, not dropped silently');
  b = T.parsePricing(ex8_108).tcgplayerBase;
  ok(b && b.price === 284.99, 'SKIP: Rocket\'s Raikou ex — the $2,300 lone ask on a ghost normal SKU is not the headline', JSON.stringify(b));
  // ALLOW: the same `normal` block where the card has a normal printing.
  b = T.parsePricing(pop4_13).tcgplayerBase;
  ok(b && b.printing === 'normal' && b.price === 37.54, 'KEEP: POP 4 Pikachu has a normal printing — its normal price stands', JSON.stringify(b));
  // ALLOW: printings unknown — absence of a list is not evidence.
  b = T.parsePricing({ pricing: ex9_9.pricing }).tcgplayerBase;
  ok(b && b.printing === 'normal', 'KEEP: no variants on the response — nothing is skipped (old behaviour)', JSON.stringify(b));
  // ALLOW: a reverse-only list does not know about normal/holo — skip nothing.
  b = T.splitTcgplayer(ex9_9.pricing.tcgplayer, ['reverse']).base;
  ok(b && b.printing === 'normal', 'KEEP: a printing list naming neither normal nor holo skips nothing', JSON.stringify(b));
  // The reverse block is untouched by the rule.
  eq(T.parsePricing(ex9_9).tcgplayerReverse.price, 799.99, 'the reverse block is read as before');
  // A normal-only card with a holofoil block: the same rule, the other way.
  b = T.splitTcgplayer({ normal: { marketPrice: 2 }, holofoil: { marketPrice: 90 } }, ['normal']).base;
  ok(b && b.price === 2, 'SKIP the other way: a holofoil block on a normal-only card', JSON.stringify(b));
  // Only a ghost block: no base price at all, rather than the ghost's.
  eq(T.splitTcgplayer({ normal: { marketPrice: 5 } }, ['holo']).base, null, 'only a ghost block: no price (a wrong price is worse than none)');
  // By edition: the same rule (pricecheck and the 1st Edition write read this).
  const ed = T.tcgplayerByEdition(ex9_9.pricing.tcgplayer, T.printingsFromTcgdex(ex9_9).printings);
  ok(ed.unlimited && ed.unlimited.price === 431.32, 'tcgplayerByEdition applies the same rule', JSON.stringify(ed));
  // WOTC keys: unlimited-holofoil / 1st-edition-holofoil on a holo card are kept.
  const lugia = T.tcgplayerByEdition({ '1st-edition-holofoil': { marketPrice: 1134.85 }, 'unlimited-holofoil': { marketPrice: 531.39 } },
    [{ key: 'holo' }]);
  ok(lugia.unlimited && lugia.unlimited.price === 531.39 && lugia.firstEdition && lugia.firstEdition.price === 1134.85,
     'KEEP: Neo Genesis Lugia, both editions of its holo printing', JSON.stringify(lugia));
}

// ══════════════════════════════════════════════════════════════

console.log('');
console.log(`  tcgdexprice.test.js — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('');
  failures.forEach(f => console.log('   FAIL  ' + f));
  console.log('');
  process.exit(1);
}
console.log('');
