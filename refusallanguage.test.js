// refusallanguage.test.js — which refusals are LANGUAGE refusals (2026-10-07)
//
// marketprobe grouped refusals with a loose title-says pattern and labelled the
// year gate ("title says 2025, this set is from 2023"), printing, set-size and
// grade-clash reasons as languages ("language:2025"). Reporting only — no row
// was refused by it — but the language union's trigger reads these counts.
// cm.refusalLanguage matches the gate's own wording; run here on the gate's
// REAL reasons (cm.verify), never on retyped strings.

const fs = require('fs');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const src = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');

console.log('\n  which refusals are LANGUAGE refusals (cm.refusalLanguage, on the gate\'s real reasons)');
const pk = { cardId: 'en-sv03.5-025', name: 'Pikachu', nameEn: 'Pikachu', number: '025', setTotal: 165, setName: '151',
             setId: 'sv03.5', setYear: 2023, lang: 'en', printings: ['normal'] };
const why = t => cm.verify(t, pk, 'Raw').reason;
ok('"Japanese" -> ja', cm.refusalLanguage(why('Pikachu 025/165 151 Japanese NM')) === 'ja');
ok('"Korean" -> ko', cm.refusalLanguage(why('Pikachu 025/165 151 Korean')) === 'ko');
ok('a Japanese set code -> ja-set-code', cm.refusalLanguage(why('Pikachu 025/165 Pokemon Card 151 SV2a NM')) === 'ja-set-code');
const yr = why('Pikachu SV: Scarlet & Violet 151 Common #025/165 Pokemon 2025 NM');
ok('a YEAR is not a language (was "language:2025")', /^title says 2025/.test(yr) && cm.refusalLanguage(yr) === null, yr);
const sz = why('Pikachu 025/130 151 NM');
ok('a set size is not a language', /title says 025\/130/.test(sz) && cm.refusalLanguage(sz) === null, sz);
ok('marketprobe groups with it, not the loose /title says (\\w+)/', /const lang = cm\.refusalLanguage\(d\.reason\);/.test(src) && !/\.test\(d\.reason\) \? 'language:'/.test(src));

console.log(`
  ${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
