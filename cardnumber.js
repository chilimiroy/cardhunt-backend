// cardnumber.js — is this product's collector number OUR card's number?
// (TASK-product-matching T1, 2026-10-09)
//
// The TCGplayer internal search (ingest.js tcgPlayerSearch) compared numbers
// through a private normNum that kept a PREFIX only when nothing followed the
// digits, and otherwise reduced the number to its digits: "50a" and "50b"
// both became "50", "XY177a" became "177". Two Aquapolis cards then matched
// one product "exactly". And when no hit matched, a fallback took the single
// name hit WHATEVER number it stated: Skyridge Gengar H09 took Gengar (10),
// Legendary Treasures Piplup RC6 took Piplup 33, Garchomp 146 / 228 / 247 all
// took Garchomp 114. 53 TCGplayer products ended up on 106 of our cards
// (PROGRESS 2026-10-09).
//
// The rule: a collector number is compared WHOLE. Only zero padding and
// letter case are folded ("H09" = "H9", "002" = "2", "tg07" = "TG7"). A prefix
// or a suffix letter is part of the number: H09 is not 9, RC6 is not 6,
// XY177a is not XY177, 50a is not 50b. A number of any other shape ("!", "?")
// is compared as written, never reduced to its digits.
//
// Over all 23,736 English cards this reads only the 37 lettered numbers
// differently from the old fold, and gives no two cards of one set the same
// key (the old fold gave 50a/50b, 74a/74b, 95a/95b, 103a/103b one each).
//
// This is NOT cardmatch.normNum. That one belongs to the listing gate, which
// reads letters separately (verifyLetterNumber) and is not changed here.
'use strict';

function numberKey(n) {
  if (n === null || n === undefined) return null;
  const s = String(n).trim().split(/[\/／]/)[0].trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z]*)[-\s]?0*(\d+)([A-Za-z]*)$/);
  if (m) return m[1].toUpperCase() + String(parseInt(m[2], 10)) + m[3].toUpperCase();
  return s.toUpperCase();
}

function sameNumber(a, b) {
  const x = numberKey(a), y = numberKey(b);
  return x !== null && x === y;
}

// The collector number a TCGplayer search hit states, or null when it states
// none we can read. TCGplayer is inconsistent about which key holds it.
function tcgHitNumber(hit) {
  const ca = (hit && hit.customAttributes) || {};
  for (const k of ['number', 'Number', 'cardNumber', 'CardNumber', 'card_number', 'collectorNumber']) {
    if (ca[k]) return numberKey(ca[k]);
  }
  // Sometimes only in the display name: "Charizard ex (199/165)", "... - 199/165",
  // "Golduck (50a)", "#XY177a". A letter after the digits stays on the number.
  const pn = String((hit && hit.productName) || '');
  let m = pn.match(/[\(\-\s]([A-Z]{0,4}\d{1,4}[a-z]?)\s*\/\s*[A-Z]*\d{1,4}\)?/);
  if (m) return numberKey(m[1]);
  // "Gengar (10)", "Golduck (50a)": TCGplayer's way of telling two same-name
  // products apart. Up to three digits, so a year in brackets is not read.
  m = pn.match(/\(([A-Z]{0,4}\d{1,3}[a-z]?)\)/);
  if (m) return numberKey(m[1]);
  m = pn.match(/#\s*([A-Z]{0,4}\d{1,4}[a-z]?)(?![A-Za-z0-9])/i);
  if (m) return numberKey(m[1]);
  // Promos: "Pikachu - BW54", "Tropical Wind - DP48 (Worlds 09)", "Pikachu - 190".
  m = pn.match(/\s-\s([A-Z]{0,4}\d{1,4}[a-z]?)(?=\s|$)/);
  if (m) return numberKey(m[1]);
  return null;
}

// Stamped on every row the fixed matcher writes (source_meta.numberRule), so
// a row it wrote is never mistaken for one the loose matcher wrote.
const RULE = 'whole-number-2026-10-09';

// A STAMPED product — "[Staff]", "(Prerelease)" — is another card, the way H09
// is not 9 (Roy, 2026-10-09): Delcatty SM132 took "(Prerelease) [Staff]" at
// $82.98 against $8.20 for the card. EXCEPT where TCGdex maps our card to that
// very product: 33 Sun & Moon promos were only ever printed with the
// Prerelease stamp, TCGdex's own id for them IS the "(Prerelease)" product,
// and its price agrees with pokemontcg.io's within ~1.3x. tcgdexIds: the
// card's TCGplayer ids from cards.variants (tcgdexProductIds).
const STAMPED = /\[staff\]|\bpre-?release\b/i;
function isStampedProduct(productName) { return STAMPED.test(String(productName || '')); }
function tcgdexProductIds(variants) {
  return ((variants && variants.printings) || []).map(p => p && p.tcgplayer).filter(Boolean).map(String);
}
function stampedNotOurs(productName, productId, tcgdexIds) {
  return isStampedProduct(productName) && !(tcgdexIds || []).includes(String(productId));
}

module.exports = { numberKey, sameNumber, tcgHitNumber, RULE, isStampedProduct, tcgdexProductIds, stampedNotOurs };
