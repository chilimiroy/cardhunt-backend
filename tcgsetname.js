// tcgsetname.js — is this TCGplayer search hit in OUR set? (TASK T1, 2026-09-29)
//
// ingest.js's tcgPlayerSearch matched the collector number in ANY set. Our
// set name "Expedition Base Set" makes TCGplayer rank Base Set products
// first, so Expedition Alakazam 001 took Base Set 2 001/130 ($55.51) or
// Base Set 001/102 ($69.72) on alternate nights — the stored history swings
// between exactly those two — while the card is $233.32. Butterfree #5
// ($180) held $0.35: SM Base Set 3/149.
//
// Measured on 2,767 English cards against TCGdex: Expedition 27 of 59 wrong
// by more than 40%, every other era 1-3%. Aquapolis and Skyridge — the
// H-numbered sets the first hypothesis blamed — agreed 54 of 54.
//
// A hit now counts only in TCGplayer's own name for our set. Most names
// differ only by "&"/"and", a "SWSH09: " / "SM - " prefix or an "EX " prefix,
// which normTcgSetName removes. The rest were MEASURED, not guessed: for each
// set where our stored price and TCGdex agree within 2%, the set name of the
// search hit matching both number and price (scratch setnames.js, 2026-09-29,
// one search per card at the refresh's own 1.8s pace). A set not listed and
// not equal after normalising is refused — no price, never a guess.
'use strict';

function normTcgSetName(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')   // Pokémon -> Pokemon
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/^[a-z]{1,5}\d{0,3}[a-z]?\s*(?::|\s-)\s*/, '')
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Our set id -> TCGplayer's set name(s), where normalising is not enough.
// 161 of our English sets were probed; these are the ones where normalising
// was not enough. sm1 was read off the Butterfree probe ("SM Base Set",
// 3/149 — Sun & Moon is 149 cards).
//
// DELIBERATELY ABSENT — the trainer kits. TCGplayer merges both halves of a
// kit into ONE set ("BW Trainer Kit: Excadrill & Zoroark") and each half
// numbers from 1, so "#9" there is either half's card: the tk-bw-e Fighting
// Energy disagreements in the measurement are that collision. Refused here;
// TCGdex prices them by product id.
//
// Not probed (no card where both sources agreed, 2026-09-29) and so refused
// unless the name normalises equal: 2021swsh 2022swsh 2023sv 2024sv
// bw10 bwp ex5.5 fut2020 me01 mee mep mfb miscp sma sve svp swsh12.5gg
// swsh4.5sv tk-dp-l tk-dp-m tk-hs-g tk-sm-l xya xyp and the Trainer
// Galleries swsh9tg-swsh12.5tg (which DO normalise equal — "SWSH09:
// Brilliant Stars Trainer Gallery", measured).
const TCG_SET_NAME = {
  '2011bw': ["McDonald's Promos 2011"],
  '2012bw': ["McDonald's Promos 2012"],
  '2014xy': ["McDonald's Promos 2014"],
  '2015xy': ["McDonald's Promos 2015"],
  '2016xy': ["McDonald's Promos 2016"],
  '2017sm': ["McDonald's Promos 2017"],
  '2018sm': ["McDonald's Promos 2018"],
  '2019sm': ["McDonald's Promos 2019"],
  bog:      ['Best of Promos'],
  ecard1:   ['Expedition'],
  exu:      ['EX Unseen Forces'],
  hgssp:    ['HGSS Promos'],
  np:       ['Nintendo Promos'],
  ru1:      ['Rumble'],
  sm1:      ['SM Base Set'],
  smp:      ['SM Promos'],
  sv01:     ['SV01: Scarlet & Violet Base Set'],
  'sv03.5': ['SV: Scarlet & Violet 151'],
  swsh1:    ['SWSH01: Sword & Shield Base Set'],
  'swsh10.5': ['Pokemon GO'],
  swshp:    ['SWSH: Sword & Shield Promo Cards'],
  xy1:      ['XY Base Set'],
  // Probed 2026-10-01 — name AND number agree, price against what we held
  // before the 9/29 set check silently stopped refreshing these sets:
  //   svp  #085 Pikachu with Grey Felt Hat  $1019.29 vs $1031.27 (0.99)
  //   xyp  #XY124 Pikachu EX 1.00 · #XY60 Gyarados 1.33
  //   bwp  #BW97 Eevee 1.00
  //   mep  #028 Celebratory Fanfare 1.00 (#066 Tyrantrum 0.31 — a stale hold)
  //   sve  #001 Grass Energy 0.86 · mee #001 / #006 0.96 / 1.05
  // NOT dpp: its #DP50 Arceus hit is in "Jumbo Cards" — a different product.
  // ...superseded 2026-10-02: that was the search's ranking for one query.
  // Asked "<name> Diamond and Pearl Promos", TCGplayer answers its own
  // "Diamond and Pearl Promos" set, name and number agreeing:
  //   dpp    #DP01 Turtwig $31.26 vs $29.43 held (1.06) · #DP50 Arceus 1.36
  //          · #DP47 Rayquaza C LV.X 1.37 (holds two months old)
  //   basep  #23 Zapdos $22.02 vs $19.98 (1.10) · #12 Mewtwo "12/53" $150.16
  // These two sets were 88 of the 224 visible English cards with no headline
  // price in 7 days (44 each) — the largest cluster of unpriced cards.
  dpp:      ['Diamond and Pearl Promos'],
  basep:    ['WoTC Promo'],
  svp:      ['SV: Scarlet & Violet Promo Cards'],
  xyp:      ['XY Promos'],
  bwp:      ['Black and White Promos'],
  mep:      ['ME: Mega Evolution Promo'],
  sve:      ['SVE: Scarlet & Violet Energies'],
  mee:      ['MEE: Mega Evolution Energies'],
};

function sameTcgSet(hitSetName, setId, ourSetName) {
  const got = normTcgSetName(hitSetName);
  if (!got) return false;
  const ours = normTcgSetName(ourSetName);
  if (got === ours || got === 'ex ' + ours) return true;
  return (TCG_SET_NAME[setId] || []).some(n => normTcgSetName(n) === got);
}

module.exports = { normTcgSetName, sameTcgSet, TCG_SET_NAME };
