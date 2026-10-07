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
// (Plain strings: marketprobe's call now also carries endUserZip and maxPages, 2026-10-07.)
const passers = src.split('langExclude, unionPages').length - 1;
ok('only marketprobe passes a mode to sourceEbay', src.includes('background: true, allDropped: true, langExclude, unionPages, endUserZip, maxPages: probePages });')
   && (src.match(/opts\.langExclude/g) || []).length === 1 && passers === 1, 'passed from marketprobe ' + passers + 'x');
// The union's callers (2026-10-07, shipped at one page): marketprobe, and
// eBay US's FIRST answer on a card open — never Load more or another site.
ok('...the union runs from marketprobe and eBay US\'s first answer only', (src.match(/\? sourceEbayLanguageUnion : sourceEbay\)/g) || []).length === 2
   && /site\.id === 'EBAY_US' && !opts\.offset \? sourceEbayLanguageUnion : sourceEbay/.test(src)
   && /unionPages: LANG_UNION_OPEN_PAGES/.test(src) && /const LANG_UNION_OPEN_PAGES = 1;/.test(src));


console.log('\n  the language UNION (server.js sourceEbayLanguageUnion, run as written)');
const useg = src.slice(src.indexOf('const LANG_UNION_SHARE'), src.indexOf('async function sourceEbayAll('));
const mk = (ids, keptN, langN, cap, pages) => ({
  listings: ids.slice(0, keptN).map(i => ({ itemId: i })), kept: keptN,
  dropped: ids.slice(keptN).map((i, k) => ({ itemId: i, reason: k < langN ? 'title says ja, this card is en — a different language printing' : 'not a single card' })),
  rejected: ids.length - keptN, languageRefused: langN, scanned: ids.length, scannedIds: ids,
  pages: { fetched: pages, stoppedAtCap: cap, ebayTotal: 1000 }, queryExclusion: { mode: 'none', applied: false } });
const runUnion = async (base, extra, opts, lang) => {
  const calls = [];
  const fakeSource = async (c, g, l, o) => { calls.push(o.langExclude + (o.maxPages ? ':' + o.maxPages : '')); return o.langExclude === 'aspect' ? extra : base; };
  const fakeMatch = () => ({ cardId: (lang || 'en') + '-x-1', setId: 'x', lang: lang || 'en' });
  const U = new Function('sourceEbay', 'cm', 'ebayMatchCard', useg + '\nreturn sourceEbayLanguageUnion;')(fakeSource, cm, fakeMatch);
  return { r: await U({}, 'Raw', 25, Object.assign({ allDropped: true }, opts || {})), calls };
};
(async () => { try {
  const ids = n => Array.from({ length: n }, (_, i) => 'a' + i);
  let x = await runUnion(mk(ids(42), 7, 0, false, 1), null);
  ok('not capped: one query, nothing added, says why', x.calls.join() === 'none' && !x.r.union.triggered && x.r.kept === 7 && /did not hit the cap/.test(x.r.union.why));
  x = await runUnion(mk(ids(42), 7, 30, false, 1), null);
  ok('language-dominated but NOT capped: one query (eBay had no more to give)', x.calls.join() === 'none' && !x.r.union.triggered && x.r.union.share > 0.5);
  x = await runUnion(mk(ids(225), 150, 12, true, 3), null);
  ok('capped but language 16% of refusals: one query, says why', x.calls.join() === 'none' && !x.r.union.triggered && /not most/.test(x.r.union.why));
  const base = mk(['b1', 'b2', 'j1', 'j2', 'j3', 'j4', 'j5'], 2, 5, true, 3);
  const extra = mk(['b2', 'e1', 'e2', 'j1'], 3, 1, false, 1);           // b2 kept by both; j1 refused by both
  x = await runUnion(base, extra, { unionPages: 1 });
  ok('capped and language dominates: the filtered query runs too, with unionPages', x.calls.join() === 'none,aspect:1' && x.r.union.triggered);
  ok('NOTHING of the unfiltered query is lost', ['b1', 'b2'].every(i => x.r.listings.some(l => l.itemId === i)));
  ok('kept rows unioned by item id, no duplicates', x.r.kept === 4 && x.r.union.gained === 2 && new Set(x.r.listings.map(l => l.itemId)).size === 4);
  ok('a kept item is never also counted refused; a twice-refused item once', !x.r.dropped.some(d => ['b2', 'e1', 'e2'].includes(d.itemId)) && x.r.dropped.filter(d => d.itemId === 'j1').length === 1);
  ok('cost reported: the extra pages', x.r.union.extraPages === 1 && x.r.pages.fetched === 4);
  ok('stated on the source block', x.r.queryExclusion.mode === 'union' && x.r.queryExclusion.applied && x.r.queryExclusion.aspect === 'Language:{English}');
  ok('refusedIds: both runs\' refusals, never a kept item', x.r.refusedIds === undefined || !x.r.refusedIds.some(i => ['b1', 'b2', 'e1', 'e2'].includes(i)));
  x = await runUnion(mk(['b1', 'b2', 'j1', 'j2', 'j3', 'j4', 'j5'], 2, 5, true, 3), null, { unionPages: 1 }, 'ja');
  ok('a JAPANESE card never triggers (the "filtered" query would ask the same again)', x.calls.join() === 'none' && !x.r.union.triggered && /not an English card/.test(x.r.union.why));
  ok('the gate is not touched: language refusals counted in sourceEbay over ALL refusals', /languageRefused: dropped\.filter\(d => cm\.refusalLanguage\(d\.reason\)\)\.length/.test(src));
  } catch (e) { ok('the union checks ran to the end', false, String(e && e.message).slice(0, 80)); }
  finish();
})();

console.log('\n  the trigger, recorded on every real view (langTriggerOf) — measured, not projected');
{
  const i = src.indexOf('\nfunction langTriggerOf(');
  const T = new Function('cm', 'LANG_UNION_SHARE', src.slice(i + 1, src.indexOf('\n}\n', i + 1) + 2) + '\nreturn langTriggerOf;')(cm, 0.5);
  const ja = 'title says ja, this card is en — a different language printing';
  const st = more => ({ sites: { EBAY_US: { exhausted: !more, nextOffset: more ? 200 : null } } });
  const p = (nl, no) => ({ refused: Array(nl).fill({ source: 'ebay', stage: 'title', reason: ja })
    .concat(Array(no).fill({ source: 'ebay', stage: 'title', reason: 'not a single card' }), [{ source: 'ebay', stage: 'photo', reason: ja }]) });
  ok('capped + language-dominated: would trigger', T(st(true), p(150, 10)).wouldTrigger === true);
  ok('language-dominated but eBay had no more: would not', T(st(false), p(150, 10)).wouldTrigger === false);
  ok('capped, language a minority: would not', T(st(true), p(5, 40)).wouldTrigger === false);
  ok('title refusals only (a photo refusal is not counted)', T(st(true), p(150, 10)).refused === 160);
  ok('no state, no refusals: would not, and does not throw', T(null, {}).wouldTrigger === false);
  ok('recorded on every logged view (lang column)', /lang: langTriggerOf\(st, payload\)/.test(src) && /ADD COLUMN IF NOT EXISTS lang jsonb/.test(src)
     && /v\.lang \? JSON\.stringify\(v\.lang\) : null/.test(src));
}

console.log('\n  never silent');
const se = src.slice(src.indexOf('async function sourceEbay('), src.indexOf('async function sourceEbayAll('));
ok('the request uses the exclusion (q and aspect_filter)', /const qAsk = qMint \+ langEx\.q;/.test(se) && /aspectAsk \? '&aspect_filter='/.test(se));
ok('every eBay source block states it (queryExclusion)', /queryExclusion: \{ mode: langEx\.mode, applied: langEx\.applied, terms: langEx\.terms/.test(se)
   && /sources\[s\.id\]\.queryExclusion = r\.value\.queryExclusion/.test(src));
ok('marketprobe measures each mode, and caches them apart', /const langExclude = \['none', 'words', 'aspect', 'notspecified', 'union'\]/.test(src) && src.includes('langExclude || null, unionPages || null, endUserZip || null, probePages || null]);'));

// The union checks above are async: the summary waits for them.
function finish() {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
}
