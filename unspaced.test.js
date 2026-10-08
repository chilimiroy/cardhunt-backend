// unspaced.test.js — "PSA10" is read; TAG TEAM and ACE SPEC stay reachable
//
//   node unspaced.test.js
//
// Measured 2026-09-28 on real titles (/api/ebay/certprobe on Render, Yahoo
// Auctions locally):
//
//   eBay graded   829 titles   unspaced grade in 3   (0.4%, all Japanese cards)
//   Yahoo graded  652 titles   unspaced grade in 494 (75.8%)
//   eBay raw      868 titles   (incl. TAG TEAM + ACE SPEC cards) — unspaced
//   Yahoo raw     344 titles   TAG TEAM / ACE SPEC queries      — forms fired
//                              on PSA/BGS/CGC/ARS grades only, never on a name
//
// Replayed old gate (git show) vs new on 5,064 eBay verdicts: 7 gained,
// 0 lost. Yahoo's grade path (jpfilter.jpTitleHasGrade) already stripped
// whitespace, so it needed no change; asserted below so that stays true.
//
// The rule: an UNAMBIGUOUS grader may touch its grade. TAG / ACE / MNT keep
// the strict boundary — that strictness is what keeps TAG TEAM and ACE SPEC
// reachable, and not one sampled title wrote "TAG10".
'use strict';
require('./testcount')(41);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch');
const jpf = require('./jpfilter');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }
const read = t => cm.gradesIn(t).map(g => g.grader + ' ' + g.grade).join(',');

const JZ = { name: 'Charizard ex', nameEn: 'Charizard ex', number: '201', setTotal: 165, setName: 'ポケモンカード151',
             setId: 'SV2a', lang: 'ja', cardId: 'ja-SV2a-201', setYear: 2023 };
const ZARD = { name: 'Charizard', number: '4', setTotal: 102, setName: 'Base', setId: 'base1',
               lang: 'en', cardId: 'en-base1-4', setYear: 1999 };
const PZ = { name: 'Pikachu & Zekrom GX', number: '33', setTotal: 181, setName: 'Team Up', setId: 'sm9',
             lang: 'en', cardId: 'en-sm9-33', setYear: 2019 };
const PC = { name: 'Prime Catcher', number: '157', setTotal: 162, setName: 'Temporal Forces', setId: 'sv05',
             lang: 'en', cardId: 'en-sv05-157', setYear: 2024 };
const UMB = { name: 'Umbreon VMAX', number: '215', setTotal: 203, setName: 'Evolving Skies', setId: 'swsh7',
              lang: 'en', cardId: 'en-swsh7-215', setYear: 2021 };

// ── READ: unspaced, from live eBay and Yahoo titles ──
for (const [t, want] of [
  ['PSA10 Charizard ex SAR SV2a Pokemon Card 151 Japanese 2023 [201/165]', 'PSA 10'],      // eBay
  ['PSA8 Charizard ex SAR 201/165 SV2a Pokemon Card 151 JAPAN 2023 TCG NM/MT', 'PSA 8'],   // eBay
  ['PSA10 ルギアV SR SA 110/098 パラダイムトリガー ポケモンカード', 'PSA 10'],               // Yahoo
  ['【PSA10】 ポケモンカード　ミミッキュvmax　CSR ポケカ', 'PSA 10'],                          // Yahoo
  ['BGS9.5 リザードン', 'BGS 9.5'],                                                        // (constructed)
  ['ARS10 ピカチュウ', 'ARS 10'],                                                          // (constructed)
  ['CGC10 Pikachu', 'CGC 10'],                                                             // (constructed)
  ['PSA 10 Charizard 4/102', 'PSA 10'],                                                    // spaced, unchanged
]) ok(read(t) === want, `reads ${want}: ${t} -> "${read(t)}"`);

// ── NOT READ ──
for (const t of [
  'Pokemon Pikachu & Zekrom GX TAG TEAM 33/181 Team Up',     // the mechanic
  'Prime Catcher 157/162 Temporal Forces ACE SPEC Rare Pokemon Holo LP',
  'TAG10 Charizard',                                         // ambiguous grader stays strict
  'ACE10 Charizard',
  'NM-MNT9 Charizard',
  'PSA123 Charizard',                                        // not a grade
  'BGS9.55 Charizard',
  'PSA2023 Charizard',
]) ok(read(t) === '', `reads nothing: ${t} -> "${read(t)}"`);

// ── The gate, end to end ──
// Graded searches keep the unspaced slab (live: 3 eBay rows that were lost).
ok(cm.verify('PSA10 Charizard ex SAR 201/165 SV2a 151 Pokemon Card Japanese', JZ, 'PSA 10').ok, 'PSA 10 keeps "PSA10 …"');
ok(cm.verify('PSA8 Charizard ex SAR 201/165 SV2a Pokemon Card 151 JAPAN 2023 TCG NM/MT', JZ, 'PSA *').ok, 'grader-wide keeps "PSA8 …"');
ok(!cm.verify('PSA8 Charizard ex SAR 201/165 SV2a Pokemon Card 151 JAPAN 2023 TCG NM/MT', JZ, 'PSA 10').ok, 'PSA 10 refuses "PSA8 …"');
ok(!cm.verify('PSA10 Charizard ex SAR 201/165 SV2a 151 Pokemon Card Japanese', JZ, 'BGS *').ok, 'BGS refuses a "PSA10" slab');
// A raw search refuses the unspaced slab (it was not slab evidence before).
ok(!cm.verify('PSA10 Charizard ex SAR 201/165 SV2a 151 Pokemon Card Japanese', JZ, 'Raw NM').ok, 'Raw NM refuses "PSA10 …"');
// ...and keeps the raw card whose seller only HOPES — live, eBay condition Ungraded.
{
  const v = cm.verify('Umbreon VMAX | 215/203 | Evolving Skies | Mint | Alt Art | Pokemon TCG | PSA10 ?', UMB, 'Raw');
  ok(v.ok, 'Raw keeps the Ungraded "… PSA10 ?" card: ' + (v.reason || ''));
  const s = cm.verify('Umbreon VMAX 215/203 Evolving Skies Alt Art PSA 10?', UMB, 'Raw');
  ok(s.ok, 'and its spaced form "PSA 10?" (refused as a slab before): ' + (s.reason || ''));
  ok(!cm.verify('Umbreon VMAX | 215/203 | Evolving Skies | Mint | Alt Art | Pokemon TCG | PSA10 ?', UMB, 'PSA 10').ok,
     'and PSA 10 does not take it as a PSA 10');
}
// A slab hoping to cross over is still what its label says.
ok(cm.verify('1999 Pokémon Base Set Charizard 4/102 Holo BGS 8.5 NM-MINT FRESH GRADE PSA 9?', ZARD, 'BGS *').ok,
   'BGS 8.5 "… PSA 9?" is a BGS slab (live; refused as two graders before)');

// ── ALLOWS: real raw TAG TEAM / ACE SPEC titles stay reachable ──
for (const [t, c] of [
  ['Pokemon TCG Pikachu & Zekrom GX 33/181 SM Team Up TAG TEAM Holo English MP', PZ],
  ['Pokémon Pikachu & Zekrom GX 33/181 SM-Team Up Ultra Rare Holo Tag Team GX', PZ],
  ['Pikachu & Zekrom GX 33/181 Team Up TAG TEAM Holo UR 240 HP EN', PZ],
  ['Prime Catcher 157/162 Temporal Forces ACE SPEC Rare Pokemon Holo LP', PC],
  ['Prime Catcher 157/162 ACE SPEC NM Temporal Forces 2024 Pokemon', PC],
  ['Prime Catcher 157/162 SV05 Temporal Forces Ace SPEC Holo Eng', PC],
]) { const v = cm.verify(t, c, 'Raw NM'); ok(v.ok, `raw keeps ${t} -> ${v.reason || 'ok'}`); }

// ── Yahoo already read it, and did not over-read TAG TEAM ──
ok(jpf.jpTitleHasGrade('PSA10リザードン', 'PSA 10'), 'Yahoo: jpTitleHasGrade reads "PSA10リザードン"');
for (const t of ['【26】リーリエ ノーマル 虹 PSA9 タッグチーム GX',
                 'ポケモン 日本語版 サン＆ムーン タッグチームGX オールスター ピカチュウ＆ゼクロムGX PSA10 海外 即決',
                 '★PSA10★GEM MINT【マスターボール/ACESPEC/エーススペック/K+K】2013 MASTER BALL 017/018'])
  for (const g of ['TAG 10', 'TAG 9', 'ACE 10'])
    ok(!jpf.jpTitleHasGrade(t, g), `Yahoo: ${g} not read from ${t}`);

console.log(`\nunspaced: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
