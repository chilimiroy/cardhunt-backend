// fakewords.test.js — what the wrong cards on 12 real eBay pages SAID (T4, 2026-10-02)
//
//   node fakewords.test.js
//
// 1,010 eBay rows of 12 cards were labelled by eye. Of the 89 wrong cards,
// these titles said what they were and the gate kept them anyway. Every
// refusal below is a real title from that run; every KEEP is either a real
// right-card title from it or a genuine phrasing the vocabulary notes in
// cardmatch.js already protect (gold cards sold as "Gold Foil", the Metal
// type, textured full arts). On all 1,010 rows the change refused 43 wrong
// cards and 0 right ones.
'use strict';
require('./testcount')(48);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch');
let pass = 0, fail = 0;
const C = (id, name, number, setTotal, setName, extra) => Object.assign(
  { cardId: id, setId: id.split('-').slice(1, -1).join('-'), lang: id.split('-')[0], name, number, setTotal, setName }, extra || {});
const drop = (c, t, why) => { const v = cm.verify(t, c, 'Raw');
  if (!v.ok && (!why || why.test(v.reason))) pass++; else { fail++; console.log('  FAIL DROP ' + t + ' — got: ' + (v.ok ? 'kept' : v.reason)); } };
const keep = (c, t) => { const v = cm.verify(t, c, 'Raw');
  if (v.ok) pass++; else { fail++; console.log('  FAIL KEEP ' + t + ' — got: ' + v.reason); } };

const zard = C('en-base1-4', 'Charizard', '4', 102, 'Base Set', { setYear: 1999 });
const blas = C('en-base1-2', 'Blastoise', '2', 102, 'Base Set', { setYear: 1999 });
const pika = C('en-swsh4-188', 'Pikachu VMAX', '188', 185, 'Vivid Voltage', { setYear: 2020 });
const umb  = C('en-swsh7-215', 'Umbreon VMAX', '215', 203, 'Evolving Skies', { setYear: 2021 });
const gir  = C('en-swsh11-186', 'Giratina V', '186', 196, 'Lost Origin', { setYear: 2022 });
const mew  = C('en-sv03.5-151', 'Mew ex', '151', 165, '151', { setYear: 2023 });
const zardV = C('en-swsh3.5-79', 'Charizard V', '79', 73, "Champion's Path", { setYear: 2020 });
const jaZard = C('ja-SV2a-201', 'リザードンex', '201', 165, 'ポケモンカード151', { nameEn: 'Charizard ex', setYear: 2023 });
const mdrag = C('en-me02-250', 'Mega Dragonite ex', '250', 193, 'Mega Evolution', { setYear: 2025 });

console.log('\n  fakewords.test.js\n');
// ── refused: merchandise and replicas, by a phrase that names them ──
drop(zard, 'Charizard 4" Holo Fridge Magnet 4/102 Vintage Pokémon TCG Shadowless 1st Edition', /single card/);
drop(blas, 'Blastoise 4" Holo Fridge Magnet 2/102 Vintage Pokémon TCG Shadowless 1st Edition', /single card/);
drop(pika, 'Pokémon Pikachu VMAX Gold Metal Holo Secret Rare 188/185 Vivid Voltage 2020', /single card/);
drop(pika, 'Pokémon Pikachu VMAX Secret Rare Gold Metal Swsh04 Vivid Voltage 188/185 310HP', /single card/);
drop(pika, 'Pikachu inspired Metal Novelty card Rainbow rare VMAX 188/185 Vivid Voltage READ', /single card/);
drop(pika, 'Collectable Pokemon Pikachu VMAX 188/185 Secret Rare Rainbow – Black Metal Foil', /single card/);
drop(umb, 'ULTRA RARE Umbreon "VMAX GLITCH" 215/203 Evolving Skies Pokemon Alt Art WALL ART', /single card/);
// ── refused: another language, stated ──
drop(blas, 'Blastoise 2/102 Holo Rare Base Set Unlimited Pokemon LP (Portugese)', /pt/);
drop(gir, 'Pokémon TCG Giratina V 186/196 Lost Origin Alt Art Full Art Holo UR CN', /zh/);
drop(mew, 'Mew ex Double Rare SV2a: Pokemon Card 151 151/165 NM', /Japanese set code SV2a/);
drop(mew, 'SV2a: Pokemon Card 151 #151/165 Mew ex', /Japanese set code/);
drop(mew, 'Mew ex - 151/165 - SV2a: Pokemon Card 151 (SV2a) - (KR)', /Japanese set code|ko/);
// ── refused: a V for a plain card ──
drop(zard, 'Pokemon TCG Charizard V 4/102 Holo Rare English New Mint NM', /is a V/);

// ── KEPT: the right cards, as their sellers wrote them in the same run ──
keep(zard, 'Pokemon TCG Charizard 4/102 Base Set Holo Rare 1999 English Arita');
keep(zard, 'Charizard 4/102 Holo Rare Base Set Unlimited WOTC');
keep(pika, 'Pokémon Pikachu VMAX 188/185 Vivid Voltage Rainbow Rare Secret');
keep(mew, 'Mew ex Pokemon SV: Scarlet & Violet 151 151/165');
keep(jaZard, 'Charizard ex 201/165 Sv2a: Pokemon Card 151 Holo (Japanese)');      // the code IS the card on a Japanese card
keep(jaZard, 'Charizard ex Holo Special Art Rare SV2a: Pokemon Card 151 201/165 NM');
// ── KEPT: genuine phrasings the narrow words must not reach ──
keep(zardV, "Charizard V 079/073 Champion's Path Holo Rare");                       // a V card, asked as one
keep(mdrag, 'Mega Dragonite ex MUR 250/193 Gold Foil Mega Evolution');               // a genuine gold card, as sold
keep(gir, 'Giratina V 186/196 Lost Origin Alt Art Textured Full Art');               // textured is the genuine finish
keep(zard, 'Charizard 4/102 Base Set Holo Rare Stage 2 Fire HP 120');               // "Stage" / "HP" untouched
keep(pika, 'Pikachu VMAX 188/185 Vivid Voltage Secret Rare English');               // a stated English is not refused
keep(gir, 'Giratina V 186/196 Lost Origin Alt Art Full Art NM Metal type card');     // bare "metal" stays out (a type)
keep(blas, 'Blastoise 2/102 Holo Rare Base Set Unlimited Pokemon LP Portugal shipping ok'); // the country is not the language word

// ── 2026-10-04: Shining Charizard 107/105, 144 rows labelled by eye ──
// ~116 metal replicas, 26 genuine. Every DROP is a real title from that run.
const shz  = C('en-neo4-107', 'Shining Charizard', '107', 105, 'Neo Destiny', { setYear: 2002 });
const lugN = C('en-neo1-9', 'Lugia', '9', 111, 'Neo Genesis', { setYear: 2000 });
const rayS = C('en-ex8-107', 'Rayquaza ☆', '107', 107, 'Deoxys', { setYear: 2005 });
drop(shz, 'Pokemon TCG Shining Charizard 107/105  (Collectors Edition Not Real)', /not real/i);
drop(shz, 'Plastic Art Pokemon TCG Shining Charizard 107/105 Neo Destiny Holo EN', /plastic art/i);
drop(shz, 'Shining Charizard 107/105 Fan Gold Foil Pokemon Card First Edition Rare', /single card/);
drop(shz, 'Nintendo Pokémon TCG Shining Charizard 107/105 Metal Gold HP 100', /metal gold/i);
drop(shz, 'Wizards Pokémon TCG Shining Charizard 107/105 Neo Destiny Metal Foil', /metal foil/i);
drop(shz, 'Tarjeta Pokémon Shining Charizard Metal Dorado 107/105 Nintendo Creatures GAMEFREAK', /metal dorado/i);
// gold on a set from before any gold card existed — the price-blind half
drop(shz, 'Pokémon TCG Neo Destiny Shining Charizard 107/105 Gold Holo', /before any gold card/);
drop(shz, '(GOLD) Shining Charizard 107/105 Neo Destiny Foil (Mint)', /before any gold card/);
drop(shz, 'Shining Charizard 1st Edition Gold Pokemon Card 107/105 MINT', /before any gold card/);
drop(shz, 'Tarjeta dorada rara secreta Holograma Holograma Neo Destino Shining Charizard 107/105', /before any gold card/);
drop(shz, 'Shining Charizard 107/105 Gold Foil Pokemon Card 1st Edition', /before any gold card/);
drop(zard, 'Charizard 4/102 Base Set Gold Foil Holo Rare 1999', /before any gold card/);
// KEPT: the genuine copies from the same run, and what gold means elsewhere
keep(shz, 'Shining Charizard 107/105 Neo Destiny Secret Raro Holo Ilimitado Inglés');
keep(shz, 'MINT -- Shining Charizard 107/105 Neo Destiny Holo (Unlimited)');
keep(shz, '2002 Pokemon Neo Destiny Shining Charizard Holo 107/105 Secret Rare LP/NM');
keep(shz, 'Shining Charizard 107/105 Neo Destiny Holo, ships with plastic protection');              // bare "plastic" stays out
keep(lugN, 'Lugia 9/111 Neo Genesis Holo Rare Gold & Silver era 2000');             // the games Neo is named after
keep(lugN, 'Lugia 9/111 Neo Genesis Holo HeartGold collector pull');
keep(rayS, 'Rayquaza Gold Star 107/107 EX Deoxys Holo 2005');                       // 2004 on: gold is genuine
keep(mdrag, 'Mega Dragonite ex MUR 250/193 Gold Foil Mega Evolution');               // still kept
const noYear = Object.assign({}, shz, { setYear: null });
keep(noYear, 'Shining Charizard 107/105 Neo Destiny Gold Holo');                    // no year: the rule does not run
if (cm.goldBeforeGold && cm.goldBeforeGold('Gold Holo', shz) && !cm.goldBeforeGold('Gold Holo', rayS)) pass++;
else { fail++; console.log('  FAIL goldBeforeGold reads the set year'); }

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
