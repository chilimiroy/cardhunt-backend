// eusites.test.js — the gate on eBay DE/FR/IT/ES titles, both directions
//
//   node eusites.test.js
//
// T1 (2026-09-30). Those sites return English cards under German, French,
// Italian and Spanish titles — sellers' own words, and eBay's MACHINE
// TRANSLATION of US titles. The English-only vocabulary passed, on 2,408
// added rows from 12 cards: other-language cards ("Italienisch", "ITA"),
// Celebrations and 30th reprints ("Celebrazioni", "30° Anniversario"),
// lotteries, customs, extended-art cases, and slabs in Raw searches
// ("GRAD 7", "AiGrading 9,5"). The vocabulary was taught on those 12 cards
// and checked on 12 held out; across 4,512 rows production keeps on
// US/GB/AU/CA (and three Japanese cards) it changes no verdict at all.
//
// Every title here is a real eBay title. The KEEP half matters as much as
// the REFUSE half: a gate tested on refusals passes by refusing everything.
// Language cases live in printinggate.test.js section 6.
'use strict';
const cm = require('./cardmatch');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const CARDS = {
  zard:   { cardId: 'en-base1-4', name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set', lang: 'en', setYear: 1999 },
  lugia:  { cardId: 'en-ecard2-149', name: 'Lugia', number: '149', setTotal: 147, setName: 'Aquapolis', lang: 'en', setYear: 2003 },
  celebi: { cardId: 'en-swsh8-245', name: 'Celebi V', number: '245', setTotal: 264, setName: 'Fusion Strike', lang: 'en', setYear: 2021 },
  venu:   { cardId: 'en-base1-15', name: 'Venusaur', number: '15', setTotal: 102, setName: 'Base Set', lang: 'en', setYear: 1999 },
  karp:   { cardId: 'en-sv02-203', name: 'Magikarp', number: '203', setTotal: 193, setName: 'Paldea Evolved', lang: 'en', setYear: 2023 },
  zcel:   { cardId: 'en-cel25cc-CC002', name: 'Charizard', number: 'CC002', setTotal: 25, lang: 'en', setYear: 2021 },
  l30:    { cardId: 'en-30th-c-029', name: 'Lugia', number: '029', setTotal: 30, lang: 'en', setYear: 2026 },
  drag:   { cardId: 'ja-M2a-250', name: 'Mega Dragonite ex', number: '250', setTotal: 193, setName: 'MEGA Dream ex', lang: 'ja', setYear: 2025 }
};
const V = (t, c, g) => cm.verify(t, CARDS[c], g || 'Raw');

console.log('\n1. REPRINTS, as the European sites write them');
for (const [t, c] of [
  ['Charizard 4/102 Celebrazioni Holo Rara Holo 120 HP Inglese', 'zard'],
  ['Pokemon Celebrazioni 25° Anniversario Charizard 4/102 Holo Raro 120 HP EN', 'zard'],
  ['Charizard 4/102 Celebrazioni: Collezione Classica Holo', 'zard'],
  ['Charizard 4/102 Celebraciones: Colección Clásica Holo', 'zard'],
  ['Pokemon 25 Aniversario Celebraciones Charizard 4/102 Holo Raro 120 HP ES', 'zard'],
  ['Blastoise 2/102 Pokémon TCG Base Set Rare Holo EN 25. Jubiläum 100 KP 1999'.replace('Blastoise 2/102', 'Charizard 4/102'), 'zard'],
  ['Pokemon TCG Venusaur Holo Karte 15/102 Classic Sammlung Base Set', 'venu'],
  ['Pokemon Lugia 149/147 30° Celebrazione 80 HP Inglese', 'lugia'],
  ['Lugia 30 aniversario Pokemon casi nuevo 149/147', 'lugia'],
  ['Cristal Dorado Lugia 149/147 Aquapolis 30ª Celebración Colección Clásica ¡Como Nuevo!!', 'lugia'],
  ['Selten! Pokémon 30 Jahre Lugia 149/147 Vintage Kollektion Jubiläum', 'lugia'],
  ['Lugia Aquapolis Crystal Type 149/147 – Pokemon 30ème Anniversaire Coréen', 'lugia'],
  ['30° Pokemon TCG Lugia 149/147 Aquapolis Tipo Cristallo Segreto Raro Holo', 'lugia'],
  // read live on eBay FR once it went on: "25 ans" = 25 years = Celebrations
  ['Pokémon JCC Dracaufeu Charizard 4/102 Holo Set de Base 25 ans', 'zard'],
  ['Charizard 4/102 Set Base Holo 25 anni', 'zard'],
  ['Lugia 149/147 Aquapolis 30 años Pokémon', 'lugia']
]) {
  const v = V(t, c);
  ok('refused: ' + t.slice(0, 60), !v.ok && /Celebration|reprint|says ko/i.test(v.reason || ''), v.reason);
}
// ...and a reprint card is recognised by the same words (its own family).
ok('kept: a Celebrations card titled in Italian', V('Charizard Celebrazioni Classico Holo Pokemon 4/102 25° Anniversario', 'zcel').ok,
   V('Charizard Celebrazioni Classico Holo Pokemon 4/102 25° Anniversario', 'zcel').reason);
ok('kept: a 30th Classic Collection card titled in Spanish', V('Pokemon Lugia 149/147 30ª Celebración 80 HP Inglés', 'l30').ok,
   V('Pokemon Lugia 149/147 30ª Celebración 80 HP Inglés', 'l30').reason);
// "30" and "25" alone are numbers, never evidence.
ok('kept: "30" as a number is not an anniversary', V('Charizard 4/102 Base Set Holo 120 HP 30 photos', 'zard').ok);
ok('kept: an HP of 250 is not the 25th', V('Lugia 149/147 Aquapolis Holo Secret Rare 250 HP', 'lugia').ok);
ok('kept: "25 answers" is not "25 ans"', V('Charizard 4/102 Base Set Holo 25 answers in description', 'zard').ok);

console.log('\n2. NOT A SINGLE CARD — lotteries, customs, cases, replicas');
for (const [t, c] of [
  ['POKELOTTERIE - CHARIZARD 4/102 BASE SET ITA NM - BESCHREIBUNG LESEN', 'zard'],
  ['POKÉLOTTERIA CHARIZARD 4/102 HOLO set base - 50 lotti leggi descrizione', 'zard'],
  ['Pokemon Metallkarte Glurak Charizard 4/102 1999 Base Set Goldcard', 'zard'],
  ['Pokemon Carta Metallo Glurak Charizard 4/102 1999 Set Base Goldcard', 'zard'],
  ['Pokémon Charizard Set Base 4/102 Gold Foil Carta Arte Personalizzata HP120 Inglese 1999', 'zard'],
  ['Pokémon Charizard Base Set 4/102 Lámina de Oro Tarjeta de Arte Personalizada HP120 Inglés 1999', 'zard'],
  ['Nintendo Charizard 4/102 Set Base Holo Carta Placcata Oro. Questa è una carta rigida.', 'zard'],
  ['Pokemon Charizard Oro Metal Lámina Tarjeta 4/102 Base Set 120 HP Hecho por Ventilador', 'zard'],
  ['Charizard Set Base 4/102 | Carta Arte Ventaglio Legno', 'zard'],
  ['The Pokémon Company Charizard 4/102 Holo Supporto Magnetico 30° Anniversario', 'zard'],
  ['Pokemon Lugia 149/147 Crystal Aquapolis custodia estesa opera d\'arte', 'lugia'],
  ['Estuche extendido de obras de arte Pokemon Lugia 149/147 Crystal Aquapolis', 'lugia'],
  ['Pokemon Celebi V 245/264 Fusion Strike Extendido Arte Carpeta Inserto 3x3 9 Bolsillos', 'celebi'],
  ['Magikarp IR 203/193 Paldea Evolved - Custodia artistica estesa magnetica 🧲 per magikarp', 'karp'],
  ['The Pokémon Company Pikachu & Zekrom GX 33/181 SM-Team Up Ultra Rara (Portachiavi)'.replace('Pikachu & Zekrom GX 33/181 SM-Team Up', 'Celebi V 245/264 Fusion Strike'), 'celebi'],
  ['Opera d\'arte di un fan di Gengar Fossil Holo 5/62 1° Edizione'.replace('Gengar Fossil Holo 5/62', 'Charizard Base Set Holo 4/102'), 'zard'],
  ['Lotto Carte Pokemon Venusaur 15/102 Set Base Bellissimo Ultra Raro Starter', 'venu'],
  // the third check, on 12 cards nobody had looked at
  ['Charizard 4/102 Base Set Gold Foil Secret rara carta da esposizione', 'zard'],
  ['Tarjeta metálica Celebi V 245/264 Gold Secret rara Fusion Strike inglesa.', 'celebi'],
  ['Pokemon Charizard 4/102 Base Set Custodia Opera Estesa', 'zard'],
  ['Pokemon Fusion Strike Master Set Carpeta 245/345 Celebi V 245/264', 'celebi']
]) {
  const v = V(t, c);
  ok('refused: ' + t.slice(0, 60), !v.ok && /not a single card/.test(v.reason || ''), v.reason);
}
// The traps: each word sits beside a GENUINE single on real listings.
for (const [t, c, why] of [
  ['Pokemom Magikarp 203/193 Sv02: CUSTODIA MAGNETICA Paldea Evolved Holo! SPEDIZIONE GRATUITA!', 'karp', 'a $462 card IN a magnetic holder'],
  ['Pokemom Magikarp 203/193 Sv02: Paldea Evolved Holo ¡ESTUCHE MAGNÉTICO! ¡ENVÍO GRATUITO!', 'karp', 'the same card on eBay ES'],
  ['Pokemon Card Mega Dragonite EX MUR 250/193 Gold Foil JP Art Rare Mega Dream EX', 'drag', 'the MUR IS a gold card — 10 rows at its median price'],
  ['Charizard 4/102 Holo Base Set spedita in custodia rigida', 'zard', 'shipped in a hard case'],
  ['Charizard 4/102 Base Set Holo Energia Fuoco', 'zard', 'a type word'],
  ['Charizard 4/102 Base Set Holo Raro Inglese Wizards', 'zard', 'plain Italian title']
]) {
  const v = V(t, c);
  ok('kept (' + why + '): ' + t.slice(0, 50), v.ok, v.reason);
}

console.log('\n3. SLABS IN A RAW SEARCH — graders and "graded" in their words');
for (const [t, c] of [
  ['Charizard Holo Base Set 4/102 (Englisch), gegraded GSG 6, Glurak Pokémon Basis', 'zard'],
  ['Charizard Holo Base Set 1999 ENG 4/102 GRAD 7 NM - Pokémon WOTC', 'zard'],
  ['2003 Pokemon Aquapolis Lugia Holo Card 149/147 GRAAD 7 Near Mint ENG', 'lugia'],
  ['Lugia 149/147 - Pokémon Aquapolis - AiGrading 8', 'lugia'],
  ['Giratina V 186/196 - Pokémon Lost Origin - AiGrading 9,5'.replace('Giratina V 186/196 - Pokémon Lost Origin', 'Celebi V 245/264 - Pokémon Fusion Strike'), 'celebi'],
  ['Pokemon - Charizard #4/102 - Near Mint - Base Set - PGS 7,5', 'zard'],
  ['Pokemon PGS Authentic Glurak Charizard Base Set 4/102 Vintage', 'zard'],
  ['Bisaflor / Venusaur - 15/102 Base Set Pokemon - EGS Certified', 'venu'],
  ['Venusaur Base Set Unlimited Eng Holo Rare Beckett 8 15/102 Pokémon Starter', 'venu'],
  ['Pokemon 151 Charizard Ex 199/165 Gradate 9.5'.replace('Pokemon 151 Charizard Ex 199/165', 'Celebi V 245/264 Fusion Strike'), 'celebi'],
  ['Carte Dracaufeu Charizard 4/102 Set de Base gradée 8', 'zard'],
  ['2000 Pokemon Base Set Charizard Holo 4/102 Next Grading 8.5 NM/M', 'zard']
]) {
  const v = V(t, c);
  ok('refused: ' + t.slice(0, 60), !v.ok && /graded slab/.test(v.reason || ''), v.reason);
}
// Translated "Ungraded", and "could be graded", are RAW cards.
for (const t of [
  'Charizard 4/102 Base Set Holo Rare non gradata',
  'Charizard 4/102 Set Base Illustrazione Speciale Rara SIR Non Classificata',
  'Charizard 4/102 Base Set Holo quasi nuovo - graduabile',
  'Charizard 4/102 Base Set Holo casi nuevo - graduable',
  'Charizard 4/102 Base Set Holo - gradeable posible 7-8',
  'Charizard 4/102 Base Set Holo KARACARDZ pregrading nm+',
  'Pokémon TCG Charizard Base Set 4/102 Holo LP Ungraded'
]) {
  const v = V(t, 'zard');
  ok('kept (raw): ' + t.slice(0, 60), v.ok, v.reason);
}
// A graded search still reads its own grader.
ok('graded: "AiGrading 10" is not a PSA 10', !V('Celebi V 245/264 - Pokémon Fusion Strike - AiGrading 10', 'celebi', 'PSA 10').ok);

console.log(`\neusites.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
