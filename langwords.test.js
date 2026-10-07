// langwords.test.js — a card's language, named by country as well as by language (2026-10-07)
//
// "Mewtwo & Mew GX SM191 ... Pokemon Brazilian Card Mint NM+" reached the
// deals bar as an English card: the Portuguese list named the language, never
// the country Brazilian sellers write. Added as claims about the CARD:
// Brazilian / Brazil / Brasil / brasileiro / PT-BR; Polish (polski, polska,
// ...) and the 🇵🇱 flag; Mandarin. PLACES — Taiwan, Hong Kong, Thailand — are
// where a card is sold, not what it is (Roy, 2026-10-07): they count ONLY
// beside a printing or language claim ("Taiwan version"); alone, and the 🇭🇰
// flag, they say nothing, so "ships from Hong Kong" never refuses an English
// card. All on \b boundaries — an unanchored language word once ate Giratina
// ("ita") and Destined Rivals. Measured on 2,416 titles, old gate vs new: 1
// newly refused (that listing), 0 newly kept.

const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const lang = t => cm.languageOf ? cm.languageOf(t) : null;

console.log('\n  foreign copies, named by country');
for (const [t, want] of [['Mewtwo & Mew GX SM191 Pokemon Brazilian Card Mint NM+', 'pt'], ['Charizard VSTAR 174/172 Brasil', 'pt'],
  ['Pikachu VMAX 188/185 carta brasileira', 'pt'], ['Umbreon VMAX 215/203 PT-BR', 'pt'], ['Giratina V 186/196 Taiwan version', 'zh'],
  ['Mew ex 232/091 Hong Kong print', 'zh'], ['Charizard 4/102 Thailand print', 'th'], ['Pikachu 58/102 karta polska', 'pl'],
  ['Pikachu Polish edition', 'pl'], ['Charizard 🇵🇱', 'pl']])
  ok(want + ': ' + t, lang(t) === want, 'read ' + lang(t));

console.log('\n  English titles are not touched (the \\b lesson)');
for (const t of ['Giratina V 186/196 Lost Origin Alt Art', 'Destined Rivals Team Rocket Mewtwo ex', 'Charizard 4/102 Base Set Holo polished',
  'Pikachu VMAX 188/185 Vivid Voltage English NM', 'Mewtwo & Mew GX SM191 Promo',
  'Kingdra ex 94/101 Dragon Frontiers',
  // PLACES are where a card is sold (Roy, 2026-10-07): alone they say nothing.
  'Charizard 4/102 ships from Hong Kong', 'Giratina V 186/196 Taiwan seller', 'Umbreon VMAX 215/203 Thailand', 'Charizard 🇭🇰 seller'])
  ok('not foreign: ' + t, !['pt', 'zh', 'th', 'pl'].includes(lang(t)), 'read ' + lang(t));
ok('...and a title that does name the country reads it (stated: the seller wrote it)', lang('Brazilian Jiu-Jitsu? no — Charizard 4/102') === 'pt');

console.log('\n  the gate refuses them on an English card');
const mm = { cardId: 'en-smp-SM191', name: 'Mewtwo & Mew GX', nameEn: 'Mewtwo & Mew GX', number: 'SM191', setName: 'SM Black Star Promos',
             setId: 'smp', setYear: 2019, lang: 'en', printings: ['holo'] };
ok('Brazilian SM191 -> refused as pt', (r => !r.ok && /title says pt/.test(r.reason))(cm.verify('Mewtwo & Mew GX SM191 Sun & Moon Tag Team Up Pokemon Brazilian Card Mint NM+', mm, 'Raw NM')));
ok('English SM191 -> kept', cm.verify('Mewtwo & Mew GX SM191 Sun & Moon Tag Team Up Promo NM', mm, 'Raw NM').ok);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
