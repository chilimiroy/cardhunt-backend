// kitname.test.js — a kit's product name is not the card's name (2026-10-07)
//
// Trainer kits come in two halves, each numbered from 1, and the product name
// ("EX Trainer Kit 1: Latias & Latios") puts BOTH mascots in every title of
// either half. The name check also matched by substring. Measured on 1,777
// titles (8 kit mascot cards + 9 others): 36 newly refused — every one a
// different card (15 Magnemite under Latias #4, 7 Combusken under Latios #2,
// 3 Machoke, 11 Suicune / Pikachu Libre across) — and 0 newly kept.

require('./testcount')(15);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const card = (id, name, number, total, setName, setId, year) => ({ cardId: id, name, nameEn: name, number, setTotal: total, setName, setId, setYear: year, lang: 'en', printings: ['normal'] });
const latias = card('en-tk-ex-latia-4', 'Latias', '4', 10, 'EX trainer Kit (Latias)', 'tk-ex-latia', 2004);
const libre = card('en-tk-xy-p-14', 'Pikachu Libre', '14', 30, 'XY trainer Kit (Pikachu Libre)', 'tk-xy-p', 2016);
const suicune = card('en-tk-xy-su-14', 'Suicune', '14', 30, 'XY trainer Kit (Suicune)', 'tk-xy-su', 2016);
const v = (t, c) => cm.verify(t, c, 'Raw NM');

console.log('\n  the other half\'s card, named only through the kit -> refused');
for (const [t, c] of [['💥 Magnemite 4/10 EX Trainer Kit 1: Latias & Latios Regular Pokemon 2004', latias],
                      ['Pokemon | EX Trainer Kit 1: Latias & Latios | Magnemite | 4/10 | Normal | NM', latias],
                      ['Suicune (Non-Holo) 14/30 Pokemon XY Trainer Kit: Pikachu Libre & Suicune NM', libre],
                      ['non-holo Suicune 14/30 Pokemon card XY Suicune/Pikachu Libre Trainer Kit NM', libre],
                      ['Pikachu Libre 14/30 XY Trainer Kit Pikachu Libre & Suicune 2016 Pokemon NM', suicune]])
  ok(t.slice(0, 70), (r => !r.ok && /does not name/.test(r.reason))(v(t, c)), v(t, c).reason || 'KEPT');

console.log('\n  the card itself, named outside the kit -> kept');
ok('Latias 4/10 EX Trainer Kit Latias & Latios Holo 2004', v('Latias 4/10 EX Trainer Kit Latias & Latios Holo 2004', latias).ok);
ok('Suicune 14/30 XY Trainer Kit Pikachu Libre & Suicune NM', v('Suicune 14/30 XY Trainer Kit Pikachu Libre & Suicune NM', suicune).ok);
ok('a TAG TEAM card is never masked (its own name has &)', v('Pikachu & Zekrom GX 33/181 Team Up Holo',
  card('en-sm9-33', 'Pikachu & Zekrom GX', '33', 181, 'Team Up', 'sm9', 2019)).ok);

console.log('\n  a name is a word, not a substring');
const mew = card('en-sv03.5-151', 'Mew ex', '151', 165, '151', 'sv03.5', 2023);
ok('"Mewtwo ex 151/165" does not name Mew', !v('Mewtwo ex 151/165 Pokemon 151', mew).ok);
ok('"Mew ex 151/165" does', v('Mew ex 151/165 Pokemon 151 Double Rare NM', mew).ok);
// The clean-checkout run caught both (variants.test.js): "Poké" flattened to
// "pok", and a name run together has no boundary after its first word.
const pb = card('en-sv01-185', 'Poké Ball', '185', 198, 'Scarlet & Violet', 'sv01', 2023);
const mb = card('en-sv06-153', 'Master Ball', '153', 167, 'Twilight Masquerade', 'sv06', 2024);
ok('"Poke Ball" names Poké Ball (accents folded)', v('Poke Ball 185/198 Scarlet & Violet', pb).ok);
ok('"Poké Ball" names it too', v('Poké Ball 185/198 Scarlet & Violet', pb).ok);
ok('"Masterball" names Master Ball (run together)', v('Pokemon Masterball 153/167 Twilight Masquerade', mb).ok);
ok('"Mewtwo" is still not Mew run together', !v('Mewtwo 151/165 Pokemon 151', mew).ok);

console.log('\n  the trade-off, stated: named ONLY through the kit is refused (either half could be meant)');
ok('"EX Trainer Kit Latias & Latios 4/10 Holo" -> refused', !v('EX Trainer Kit Latias & Latios 4/10 Holo 2004', latias).ok);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
