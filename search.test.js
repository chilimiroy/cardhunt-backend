// search.test.js — ONE search page, reached two ways, with its own content
// (Roy, 2026-10-08, TASK-reports-and-pages T2 + T6).
//
// Before: the Search item opened a game picker with a search box, and every
// search drew its answer on a second screen (#screen-results). Now one
// screen; the bar's Search item, the home search box and the bar's box all
// end in doSearch(), which draws on it. Its content: Most searched cards
// (search_log, gathering until there is data — never views), Trending cards
// and Trending sets (the trending builder, without prices).
//
//   node search.test.js
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  search.test.js\n');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
const markup = H.slice(H.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const code = H.replace(/<!--[\s\S]*?-->/g, '');
const fn = name => { const m = new RegExp('(?:async\\s+)?function ' + name + '\\(').exec(H); if (!m) return ''; return H.slice(m.index, H.indexOf('\n}', m.index) + 2); };

console.log('  one page');
ok('no results screen', !/id="screen-results"/.test(markup) && !/SS\('results'\)/.test(code));
ok('one search screen', (markup.match(/id="screen-search"/g) || []).length === 1);
const page = markup.slice(markup.indexOf('id="screen-search"'), markup.indexOf('<div id="screen-', markup.indexOf('id="screen-search"') + 10));
ok('the answer is drawn ON the search screen (results-grid inside it)', /id="search-results"/.test(page) && /id="results-grid"/.test(page));
ok('doSearch shows the search screen, never another', /SS\('search'\)/.test(fn('doSearch')) && !/SS\('(?!search)/.test(fn('doSearch').replace(/openCard/g, '')));
ok('doSearch asks /api/search with listings=0 (no listings fetched from search)', /\/api\/search\?listings=0/.test(fn('doSearch')));
ok('the home search box submits through doSearch', /doSearch\(q, heroLang\)/.test(fn('heroSearch')) && /onclick="heroSearch\(\)"/.test(markup));
ok('the bar: a Search item between Home and Sets, opening the search screen',
  /data-nav="home"[^]*?<button class="nl" data-nav="search" onclick="SS\('search'\)">Search<\/button>[^]*?data-nav="sets"/.test(markup));
ok('the bar\'s search box submits through doSearch', /id="nav-q"[^>]*doSearch\(this\.value\)/.test(markup));
ok('no game picker, no "Coming soon" alert, no pickGame (never defined)', !/class="sgg"|Choose a game|alert\('Coming soon!'\)|pickGame\(/.test(markup + code));
ok('no second set of language chips (results-lang-chip)', !/results-lang-chip|switchResultsLang/.test(code));
ok('the breadcrumb and the answer start hidden, and hidden wins over .bc{display:flex}',
  /<div class="bc" id="search-bc" hidden>/.test(H.replace(/\r/g, '')) && /#search-bc\[hidden\],#search-results\[hidden\]\{display:none!important\}/.test(H));
ok('Back from a card returns to the search screen with its answer (no reset on SS)', !/search-results'\)\.hidden = true/.test(fn('SS')));

console.log('\n  its content: three sections, in order');
const iPop = page.indexOf('Most searched cards'), iTc = page.indexOf('Trending cards'), iTs = page.indexOf('Trending sets');
ok('Most searched, then Trending cards, then Trending sets', iPop > 0 && iTc > iPop && iTs > iTc);
ok('nothing on the page is labelled most-viewed', !/most[- ]viewed/i.test(page));
const ls = fn('loadSearchSections');
const lt = fn('loadSearchTrend');
ok('Most searched reads /api/search/popular; trending reads /api/trending/search', /\/api\/search\/popular/.test(ls) && /\/api\/trending\/search/.test(lt));
ok('not recording / gathering are said in words, nothing drawn', /!d\.recording/.test(ls) && /d\.gathering/.test(ls) && /Still gathering/.test(ls));
ok('every tile there is a catalogue tile: no price slot for anyone', (ls + lt).match(/cardTile\(/g).length === 2 && (ls + lt).match(/noPrice: true/g).length === 2);
ok('cardTile: noPrice skips getBase (no estimate) and the price row', /var showPrice = pricesOpen\(\) && !opts\.noPrice;/.test(fn('cardTile')) && /var price = showPrice \? getBase\(c\) : 0;/.test(fn('cardTile')));
ok('the old pokemontcg-shaped loader is gone', !/loadSearchTrending/.test(code));

console.log('\n  the server');
const route = (path) => { const i = S.indexOf("app.get('" + path + "'"); return i < 0 ? '' : S.slice(i, S.indexOf('\n});', i) + 4); };
const pop = route('/api/search/popular'), cat = route('/api/trending/search'), tr = route('/api/trending');
ok('/api/search/popular is catalogue (access.optional)', /app\.get\('\/api\/search\/popular', access\.optional/.test(S));
ok('no public trending route is left (catalogue, sets)', !/\/api\/trending\/(catalogue|sets)'/.test(S));
ok('/api/trending stays priced', /app\.get\('\/api\/trending', access\.priced/.test(S));
ok('popular reads search_log only — not listing_views', /FROM search_log/.test(pop) && !/listing_views/.test(pop));
ok('popular answers gathering below the threshold, with the count so far', /t\.resolved < SEARCH_POPULAR_MIN/.test(pop) && /gathering: true, cards: \[\]/.test(pop));
ok('popular says "not recording" when the table is missing (42P01)', /42P01/.test(pop) && /recording: false/.test(pop));
ok('trending cards and sets are approved-only: /api/trending/search is access.priced (a ranking by price movement)', /app\.get\('\/api\/trending\/search', access\.priced/.test(S));
ok('the page: Trending cards AND Trending sets inside one door — a .price-door, then .price-only around both',
  /<div class="price-door" role="note"[^>]*><\/div>\s*<div class="price-only">\s*<div class="sec-h"[^>]*><div><div class="sec-t">Trending cards[\s\S]*?Trending sets[\s\S]*?<\/div><!-- \/\.price-only \(trending cards and sets\) -->/.test(H.replace(/\r/g, '')));
ok('the page asks for trending only when prices are open (whenPrices) — signed out, no request', /if \(!whenPrices\(loadSearchTrend\)\) return;/.test(lt)
  && !/\/api\/trending/.test(ls));
ok('the trending route sends no price, change or date', /cards: b\.cards\.slice\(0, 12\)\.map\(c => \(\{ id: c\.id, name: c\.name, nameEn: c\.nameEn, number: c\.number,\s*rarity: c\.rarity, image: c\.image, set: c\.set \}\)\)/.test(cat)
  && !/price|change/i.test(cat.replace(/access\.priced|measured TCGplayer price rose|\/\/[^\n]*/g, '')));
ok('every trending route shares ONE builder (trendingBody)', /await trendingBody\(p\)/.test(tr) && /await trendingBody\(p\)/.test(cat) && (S.match(/async function trendingBody\(/g) || []).length === 1);
ok('trending sets are derived from the same list and say so (setRule)', /bySet/.test(cat) && /setRule:/.test(cat));
const srch = route('/api/search');
ok('every resolved search is recorded (logSearch) — query, card if ONE, candidate count', /logSearch\(q, confident \? top\.cardId : null, candidates\.length\)/.test(srch));
const log = S.slice(S.indexOf('function logSearch('), S.indexOf('\n}', S.indexOf('function logSearch(')) + 2);
ok('the record holds no user id and no IP, the query capped', !/userId|account|req\.ip|x-forwarded/i.test(log) && /slice\(0, SEARCH_LOG_MAX_Q\)/.test(log));
ok('recording never blocks or fails the search (not awaited)', !/await logSearch/.test(srch));
ok('a confident search still withholds listings from a signed-out caller', /confident && wantListings && !req\.seesPrices\) payload\.listingsWithheld = true/.test(srch));

console.log('\n  the migration (Roy runs it)');
const M = fs.readFileSync(__dirname + '/migration-search-log.sql', 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '');
ok('creates search_log', /CREATE TABLE IF NOT EXISTS search_log/.test(M));
ok('RLS on in the same file, no policy (API roles read and write nothing)', /ALTER TABLE search_log ENABLE ROW LEVEL SECURITY/.test(M) && !/CREATE POLICY/.test(M) && /REVOKE ALL ON search_log FROM anon, authenticated/.test(M));
ok('query capped at 120 in the schema too', /CHECK \(char_length\(query\) <= 120\)/.test(M) && /SEARCH_LOG_MAX_Q = 120/.test(S));
ok('no user column', !/user_id|email|ip/i.test(M));
ok('the server never creates it', !/CREATE TABLE[^;]*search_log/.test(S));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
