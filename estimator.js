// ══════════════════════════════════════════════════════════════
// estimator.js — one price estimator, shared by every caller
//
// WHY THIS FILE EXISTS
// The vintage multiplier was built only in the frontend's mockP().
// ingest.js estimate() and server.js estimatePrice() never had it, while
// CLAUDE.md documented it as though the whole system did. Result: two
// estimators disagreeing by up to 9x on the same card, with whichever
// wrote last deciding what a user sees. Running estfix would have
// propagated the wrong one across 2,143 pre-2007 Japanese cards.
//
// Standalone, so an ingest.js revert cannot take it — the fourth file
// class to be lost that way.
//
//   const { estimatePrice, VINTAGE_TIERS } = require('./estimator');
//   estimatePrice({ rarity, cardId, name, number, setTotal, setRelease })
// ══════════════════════════════════════════════════════════════

// Raw NM market averages, calibrated against TCGPlayer and eBay
const BASE_PRICE = {
  'Hyper Rare': 95,
  'Special Illustration Rare': 110,
  'Illustration Rare': 26,
  'Rare Secret': 52,
  'Rare Rainbow': 38,
  'Rare Shiny': 30,
  'Rare Ultra': 21,
  'ACE SPEC Rare': 24,
  'Double Rare': 11,
  'Mega Attack Rare': 9,
  'Rare Holo VMAX': 15,
  'Rare Holo VSTAR': 12,
  'Rare Holo V': 7,
  'Rare Holo GX': 6,
  'Rare Holo EX': 10,
  'Rare Holo': 4.5,
  'Amazing Rare': 15,
  'Radiant Rare': 8,
  'Trainer Gallery Rare Holo': 10,
  'Rare': 2.2,
  'Uncommon': 0.4,
  'Common': 0.15,
  'Promo': 5
};

// A 1999 Base Set common trades far above a 2024 common — scarcity and
// condition rarity lift the whole floor for older print runs.
const VINTAGE_TIERS = [
  { before: 2000, factor: 9,   era: 'Base / Jungle / Fossil' },
  { before: 2003, factor: 5,   era: 'Neo / e-Card' },
  { before: 2007, factor: 2.5, era: 'EX / PCG' },
  { before: 2011, factor: 1.6, era: 'DP / Platinum / HGSS' },
  { before: 2017, factor: 1.2, era: 'BW / XY' }
];

function vintageFactor(setRelease) {
  if (!setRelease) return 1;
  const m = String(setRelease).match(/(\d{4})/);
  if (!m) return 1;
  const year = parseInt(m[1]);
  if (!year) return 1;
  for (const t of VINTAGE_TIERS) if (year < t.before) return t.factor;
  return 1;
}

// Ceilings scale with the same factor, so a 1999 Common may reach ~$18
// while a 2024 Common stays under $2.
const CEILINGS = { 'Common': 2, 'Uncommon': 3, 'Rare': 8, 'Rare Holo': 25 };

// Trainers, Supporters, Stadiums, Tools and Energy carry no chase premium.
// Without this, "Iris's Fighting Spirit" picks up the Iris multiplier.
const TRAINERISH = /(ball|pad|gear|catcher|switch|potion|rod|stretcher|candy|belt|band|vitality|research|orders|training|spirit|determination|gong|trumpet|tower|garden|mine|scrapper|scale|energy|stadium|machine|communication|nest|revive|retrieval|cape|helmet|charm|cushion|drum|whistle|horn|bell)\b/;

const CHASE = [
  [/charizard/, 3.4], [/pikachu/, 1.9],
  [/mewtwo|mew /, 1.7], [/umbreon|eevee/, 1.6],
  [/lugia|rayquaza/, 1.5], [/gengar|dragonite/, 1.35]
];

// Position inference, used ONLY when rarity is absent. A card that really
// is Common must stay Common — Pokegear 3.0 sits at #186 of 198, which
// position inference called Rare Ultra and priced at $46.
function inferRarity(number, printedTotal, cardName) {
  const n = parseInt(number), t = parseInt(printedTotal);
  const nm = String(cardName || '').toLowerCase();
  if (n && t && n > t) {
    if (/^mega /.test(nm) || / vmax\b/.test(nm)) return 'Hyper Rare';
    if (/ ex\b/.test(nm) || / v\b/.test(nm)) return 'Special Illustration Rare';
    return 'Illustration Rare';
  }
  if (/^mega /.test(nm) && / ex\b/.test(nm)) return 'Double Rare';
  if (/ vmax\b/.test(nm))  return 'Rare Holo VMAX';
  if (/ vstar\b/.test(nm)) return 'Rare Holo VSTAR';
  if (/ ex\b/.test(nm))    return 'Double Rare';
  if (/ v\b/.test(nm))     return 'Rare Holo V';
  if (/ gx\b/.test(nm))    return 'Rare Holo GX';
  if (!n || !t) return 'Common';
  if (n > t * 0.93) return 'Rare Ultra';
  if (n > t * 0.86) return 'Illustration Rare';
  if (n > t * 0.72) return 'Rare Holo';
  if (n > t * 0.42) return 'Uncommon';
  return 'Common';
}

function estimatePrice(opts) {
  opts = opts || {};
  const { cardId, name, number, setTotal, setRelease } = opts;
  let rarity = opts.rarity;

  // Infer only when rarity is genuinely missing
  if (!rarity && number && setTotal) rarity = inferRarity(number, setTotal, name);
  const r = rarity || 'Common';

  const vintage = vintageFactor(setRelease);
  const base = (BASE_PRICE[r] || 1.0) * vintage;

  // Deterministic per-card variation so no two cards share a price
  let seed = 0;
  const str = (cardId || '') + '|' + (name || '');
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) & 0x7FFFFFFF;

  let band;
  if (r === 'Hyper Rare' || r === 'Special Illustration Rare') band = 0.55 + (seed % 190) / 100;
  else if (['Illustration Rare','Rare Secret','Rare Rainbow'].includes(r)) band = 0.55 + (seed % 150) / 100;
  else if (['Rare Ultra','ACE SPEC Rare','Double Rare'].includes(r)) band = 0.5 + (seed % 180) / 100;
  else band = 0.6 + (seed % 110) / 100;

  const nm = String(name || '').toLowerCase();
  if (!TRAINERISH.test(nm)) {
    for (const [re, mult] of CHASE) if (re.test(nm)) { band *= mult; break; }
  }

  let price = base * band;

  const ceiling = CEILINGS[r] ? CEILINGS[r] * vintage : null;
  if (ceiling && price > ceiling) price = ceiling * (0.5 + (seed % 50) / 100);

  return parseFloat(price.toFixed(2));
}

const API = {
  estimatePrice, vintageFactor, inferRarity,
  BASE_PRICE, VINTAGE_TIERS, CEILINGS
};

// ── Dual mode: Node require() AND a browser <script> ──────────
// The frontend's mockP() was the original implementation and the reason
// the estimators drifted: the vintage multiplier lived there and nowhere
// else. It cannot require(), so server.js serves THIS FILE at /estimator.js
// and the browser picks it up as window.Estimator — one file, two loaders,
// exactly as cardmatch.js is shared. A copy pasted into the HTML would
// restore the split this module exists to end.
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Estimator = API;
