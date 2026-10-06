// langexclude.test.js — other-language printings left out of an English card's request (2026-10-07)
//
// Mew ex is 151/165 in the English, Japanese (SV2a) and Korean 151 sets: 208
// of 225 scanned rows were foreign copies, every refusal correct. The fix is
// in the QUERY, never the gate. A row excluded in the request never reaches
// the gate, so it can never be counted as refused — every source block must
// state the exclusion. English cards only. Offline.

const fs = require('fs');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

console.log('\n  the vocabulary (cardmatch.otherLanguageExclusions)');
const en151 = { cardId: 'en-sv03.5-151', setId: 'sv03.5', lang: 'en' };
ok('an English 151 card excludes the language words and SV2a', JSON.stringify(cm.otherLanguageExclusions(en151)) === JSON.stringify(['japanese', 'japan', 'jp', 'korean', 'korea', 'sv2a']));
ok('an English card of another set: the words only', JSON.stringify(cm.otherLanguageExclusions({ cardId: 'en-xy12-11', setId: 'xy12', lang: 'en' })) === JSON.stringify(cm.OTHER_LANGUAGE_WORDS));
ok('a Japanese card is never touched', cm.otherLanguageExclusions({ cardId: 'ja-SV2a-151', setId: 'SV2a', lang: 'ja' }).length === 0);
ok('no word is "english" or a language the card IS', !cm.OTHER_LANGUAGE_WORDS.some(w => /^eng/.test(w)));

console.log('\n  the request (server.js languageExclusionFor, run as written)');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r\n/g, '\n');
const seg = src.slice(src.indexOf('const LANG_EXCLUDE_DEFAULT'), src.indexOf('async function sourceEbay('));
const L = new Function('cm', seg + '\nreturn { languageExclusionFor, LANG_EXCLUDE_DEFAULT };')(cm);
ok('production default is unchanged until measured: none', L.LANG_EXCLUDE_DEFAULT === 'none' && L.languageExclusionFor(en151, 'EBAY_US').q === '');
const w = L.languageExclusionFor(en151, 'EBAY_US', 'words');
ok('words: eBay "-term" exclusions appended to q', w.applied && w.q === ' -japanese -japan -jp -korean -korea -sv2a', w.q);
const a = L.languageExclusionFor(en151, 'EBAY_US', 'aspect');
ok('aspect: Language:{English} on an English-language site', a.applied && a.aspect === 'Language:{English}' && a.q === '');
const de = L.languageExclusionFor(en151, 'EBAY_DE', 'aspect');
ok('aspect on a site that names it in another language: not applied, and says why', !de.applied && /EBAY_DE/.test(de.why));
const ja = L.languageExclusionFor({ cardId: 'ja-SV2a-151', lang: 'ja' }, 'EBAY_US', 'words');
ok('a Japanese card: nothing excluded, and says why', !ja.applied && ja.q === '' && /not an English card/.test(ja.why));

const ns = L.languageExclusionFor(en151, 'EBAY_US', 'notspecified');
ok('notspecified (measurement): asks for exactly the listings Language:{English} would drop', ns.applied && ns.aspect === 'Language:{Not Specified}' && ns.measurement === true);
// Only marketprobe may pass a mode: every other caller of sourceEbay gets the
// production default, so "Not Specified" can never become a live filter.
const passers = (src.match(/langExclude \}\)/g) || []).length;
ok('only marketprobe passes a mode to sourceEbay', /background: true, allDropped: true, langExclude \}\);/.test(src)
   && (src.match(/opts\.langExclude/g) || []).length === 1 && passers === 1, 'passed to sourceEbay ' + passers + 'x');

console.log('\n  never silent');
const se = src.slice(src.indexOf('async function sourceEbay('), src.indexOf('async function sourceEbayAll('));
ok('the request uses the exclusion (q and aspect_filter)', /const qAsk = qMint \+ langEx\.q;/.test(se) && /aspectAsk \? '&aspect_filter='/.test(se));
ok('every eBay source block states it (queryExclusion)', /queryExclusion: \{ mode: langEx\.mode, applied: langEx\.applied, terms: langEx\.terms/.test(se)
   && /sources\[s\.id\]\.queryExclusion = r\.value\.queryExclusion/.test(src));
ok('marketprobe measures each mode, and caches them apart', /const langExclude = \['none', 'words', 'aspect', 'notspecified'\]/.test(src) && /langExclude \|\| null\]\);/.test(src));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
