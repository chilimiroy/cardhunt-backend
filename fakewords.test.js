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

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
