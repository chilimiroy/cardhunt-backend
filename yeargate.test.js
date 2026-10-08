// yeargate.test.js — a stated year refuses only when it is a reprint year (2026-10-07)
//
// Measured (PROGRESS 2026-10-07 (year gate)): raw, the year alone refused 3
// genuine cards and 0 reprints — "1995 ... Base Set Charizard 4/102" is the
// copyright line Base Set prints; graded, the year alone caught the 2021
// Celebrations slabs ("2021 ... Charizard 4/102 Base Set ... CGC 10").
// Roy's rule: on an ORIGINAL in a RAW view, refuse only when a stated year is
// a reprint year of a family that reprinted THIS card (data:
// REPRINT_FAMILIES[].year); otherwise keep the row, flagged. Graded, a reprint
// card, and any caller that does not say the view is raw keep the refusal.

require('./testcount')(18);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const base4 = { cardId: 'en-base1-4', name: 'Charizard', nameEn: 'Charizard', number: '4', setTotal: 102, setName: 'Base',
                setId: 'base1', setYear: 1999, lang: 'en', printings: ['holo'] };
const pk = { cardId: 'en-sv03.5-025', name: 'Pikachu', nameEn: 'Pikachu', number: '025', setTotal: 165, setName: '151',
             setId: 'sv03.5', setYear: 2023, lang: 'en', printings: ['normal'] };
const ev = { cardId: 'en-xy12-11', name: 'Charizard', nameEn: 'Charizard', number: '11', setTotal: 108, setName: 'Evolutions',
             setId: 'xy12', setYear: 2016, lang: 'en', printings: ['holo'] };
const v = (t, c, g) => cm.verify(t, c, g);

console.log('\n  raw: the three measured genuine cards are KEPT, flagged');
for (const [t, c] of [['1995 Pokemon Base Set Charizard  Foil 4/102', base4],
                      ['Pikachu SV: Scarlet & Violet 151 Common #025/165 Pokemon 2025 NM', pk],
                      ['Charizard 11/108 Holo 2019 Pokémon card XY evolutions', ev]]) {
  const r = v(t, c, 'Raw NM');
  ok('kept + yearFlag: ' + t.slice(0, 50), r.ok && r.yearFlag && /may be the purchase, a typo or the copyright line/.test(r.yearFlag.says), r.ok ? '' : r.reason);
}
console.log('\n  raw: a reprint year of THIS card still refuses');
for (const y of [2021, 2026]) {
  const r = v(y + ' Pokemon Charizard 4/102 Base Set Holo', base4, 'Raw NM');
  ok(y + ' on Base Charizard (a family that reprinted it) -> refused', !r.ok && /^title says /.test(r.reason));
}
ok('...and 2020/2022 too (within one, as every year check here)', !v('2022 Pokemon Charizard 4/102 Base Set Holo', base4, 'Raw NM').ok);
console.log('\n  graded: the year alone keeps refusing (the 2021 slabs)');
ok('2021 ... Base Set ... CGC 10 under Base Charizard CGC 10 -> refused', !v('2021 Pokemon Charizard 4/102 Base Set Holo CGC 10 Gem Mint', base4, 'CGC 10').ok);
ok('any graded stated year -> refused (no "wants raw" to corroborate)', !v('1995 Pokemon Base Set Charizard Holo 4/102 PSA 10', base4, 'PSA 10').ok);
console.log('\n  unchanged');
ok('no year: kept, no flag', (r => r.ok && !r.yearFlag)(v('Charizard 11/108 Holo XY evolutions', ev, 'Raw NM')));
ok('the right year: kept, no flag', (r => r.ok && !r.yearFlag)(v('Charizard 11/108 Holo 2016 XY evolutions', ev, 'Raw NM')));
ok('a caller that does not say "raw" (ingest, the gate audit) still refuses', !!cm.printingConflict('1995 Pokemon Base Set Charizard Foil 4/102', base4));
const rp = cm.REPRINT_OF['cel25cc'] && Object.keys(cm.REPRINT_OF['cel25cc'])[0];
if (rp) {
  const cc = { cardId: 'en-cel25cc-' + rp, name: 'Charizard', nameEn: 'Charizard', number: rp, setTotal: 25, setName: 'Celebrations',
               setId: 'cel25cc', setYear: 2021, lang: 'en', printings: ['holo'] };
  ok('a REPRINT card keeps the year refusal (its original is the other printing)', !!cm.printingConflict('1999 Pokemon Charizard 4/102 Base Set', cc, { wantKind: 'raw' }));
}

const am = cm.PRINTS_NO_NUMBER && Object.keys(cm.PRINTS_NO_NUMBER)[0];
if (am) {
  const mew = { cardId: am, name: 'Ancient Mew', nameEn: 'Ancient Mew', number: '001', setTotal: 1, setName: 'Miscellaneous Promos',
                setId: am.split('-')[1], setYear: 2000, lang: 'en', printings: ['holo'] };
  ok('a card that PRINTS NO NUMBER keeps the year refusal (nothing else vouches for it)', !v('Ancient Mew 1996 promo', mew, 'Raw').ok);
}

console.log('\n  reprint years are DATA (REPRINT_FAMILIES[].year), not literals in the gate');
const fam = cm.REPRINT_FAMILIES.find(f => f.id === 'cel25'), was = fam.year;
fam.year = 2030;
const moved = v('2021 Pokemon Charizard 4/102 Base Set Holo', base4, 'Raw NM');
const nowRefused = v('2030 Pokemon Charizard 4/102 Base Set Holo', base4, 'Raw NM');
fam.year = was;
ok('move the family year: 2021 stops refusing (flagged) and 2030 refuses', moved.ok && moved.yearFlag && !nowRefused.ok);
// CRLF stripped: a clean Windows checkout is CRLF, and the split ends on "\n}\n".
ok('no reprint year literal in the year rule', !/\b20(21|26)\b/.test(fs.readFileSync(__dirname + '/cardmatch.js', 'utf8')
  .split('\r\n').join('\n').split('function statedYearIsReprintYear(')[1].split('\n}\n')[0]));

console.log('\n  the server keeps the row, flagged; the colour check does not read it as a price');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
ok('a yearFlag row is marked suspect year-stated, after normaliseListing', /if \(v\.yearFlag\) Object\.assign\(listings\[listings\.length - 1\],\s*\{ suspect: 'year-stated', suspectReason: v\.yearFlag\.says \}\);/.test(S));
ok('materialJudge: a year flag is not "priced far below"', /priceFlag: !!l\.suspect && l\.suspect !== 'year-stated'/.test(S));
const P = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
ok('the page shows any suspect row with its reason, in the flagged group', /liveEsc\(l\.suspectReason/.test(P) && /l\.suspect \? out\.liveFlagged/.test(P));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
