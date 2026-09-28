// marketwait.test.js — /api/market never races the gated listings (TASK T1)
//   node marketwait.test.js
// Measured on Render 2026-09-28: fired together, /api/market's eBay call took
// the serial eBay queue first and the listings waited 512ms mean (31% of a
// cold view). The page now starts market only after that card+grade's
// listings request settles. This runs the REAL function from the page.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

const html = fs.readFileSync('cardhunt_preview.html', 'utf8');
const code = html.split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const slice = name => {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(code);
  if (!m) return '';
  const re = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|\nvar\s|\n\/\/ /g;
  re.lastIndex = m.index + 1;
  const n = re.exec(code);
  return code.slice(m.index, n ? n.index : code.length);
};

console.log('\n  structure');
const calls = (code.match(/fetchMarketPrice\(/g) || []).length;
ok('fetchMarketPrice is called only by marketAfterListings (1 call + 1 declaration)', calls === 2, calls + ' occurrences');
ok('both card-view paths go through marketAfterListings', (code.match(/marketAfterListings\((S\.currentCard|c), /g) || []).length === 2);
ok('the listings request is published while in flight', /LIVE_INFLIGHT\[key\] = pr;/.test(code));
// Opening a card fired /api/listings twice ~110ms apart (panel + Latest-
// searches tile average), and the panel's copy queued behind its twin.
const listingFetches = (code.match(/fetch\(BACKEND \+ '\/api\/listings\/'/g) || []).length;
ok('exactly ONE place in the page fetches /api/listings', listingFetches === 1, listingFetches + ' places');
ok('...and it is fetchListings', /fetch\(BACKEND \+ '\/api\/listings\/'/.test(slice('fetchListings')));
ok('the panel and the tile average both go through it',
  /fetchListings\(/.test(slice('renderLiveListings')) && /fetchListings\(/.test(slice('cardListingAvg')));

console.log('\n  behaviour — the real function, stubbed network');
(async () => {
  const src = slice('marketAfterListings');
  const log = [];
  const LIVE_INFLIGHT = {};
  const fetchMarketPrice = async () => { log.push('market'); return { marketValue: 1 }; };
  // eslint-disable-next-line no-new-func
  const marketAfterListings = new Function('LIVE_INFLIGHT', 'fetchMarketPrice', src + '; return marketAfterListings;')(LIVE_INFLIGHT, fetchMarketPrice);
  const card = { id: 'en-base1-4' };

  let release;
  LIVE_INFLIGHT['en-base1-4|PSA 10'] = new Promise(r => { release = r; });
  const m = marketAfterListings(card, 'PSA 10');
  await new Promise(r => setTimeout(r, 20));
  ok('market does NOT start while listings are in flight', log.length === 0);
  log.push('listings'); release({});
  await m;
  ok('market starts after listings settle', log.join(',') === 'listings,market', log.join(','));

  log.length = 0;
  let reject;
  LIVE_INFLIGHT['en-base1-4|Raw NM'] = new Promise((_, j) => { reject = j; });
  const m2 = marketAfterListings(card, 'Raw NM');
  reject(new Error('API returned 500'));
  const got = await m2;
  ok('a FAILED listings request still lets market run (fallback headline survives)', log.join(',') === 'market' && got.marketValue === 1);

  log.length = 0;
  await marketAfterListings(card, 'PSA 9');
  ok('nothing in flight (cached listings) -> market runs at once', log.join(',') === 'market');

  log.length = 0;
  LIVE_INFLIGHT['en-base1-4|PSA 8'] = new Promise(() => {});    // never settles
  await marketAfterListings({ id: 'en-sv03.5-199' }, 'PSA 8');
  ok('another card’s listings do not hold market back', log.join(',') === 'market');

  // openCard resets S.activeGrade while listings keep LF.grade: the same
  // card's listings at a DIFFERENT grade must still hold market back.
  log.length = 0;
  let rel2;
  LIVE_INFLIGHT['en-swsh7-215|Raw LP'] = new Promise(r => { rel2 = r; });
  const m3 = marketAfterListings({ id: 'en-swsh7-215' }, 'Raw NM');
  await new Promise(r => setTimeout(r, 20));
  ok('the same card’s listings at another grade still hold market back', log.length === 0);
  log.push('listings'); rel2({}); await m3;
  ok('...and release it when they settle', log.join(',') === 'listings,market', log.join(','));

  console.log('\n  fetchListings — one request per card+grade, however many ask');
  {
    const src2 = slice('fetchListings');
    let calls = 0; const pending = [];
    const fetch = () => { calls++; return new Promise(r => { pending.push(r); }); };
    const LIVE_INFLIGHT2 = {}, LIVE_CACHE = {};
    // eslint-disable-next-line no-new-func
    const fetchListings = new Function('fetch', 'BACKEND', 'LIVE_INFLIGHT', 'LIVE_CACHE', 'LIVE_TTL',
      src2 + '; return fetchListings;')(fetch, 'https://x', LIVE_INFLIGHT2, LIVE_CACHE, 15 * 60e3);
    const a = fetchListings('en-sv05-181', 'Raw NM');
    const b = fetchListings('en-sv05-181', 'Raw NM');
    ok('two concurrent asks -> one network request', calls === 1, calls + ' requests');
    ok('...and both get the same promise', a === b);
    fetchListings('en-sv05-181', 'PSA 10');
    ok('a different grade is a different request', calls === 2);
    pending.forEach(r => r({ ok: true, json: async () => ({ listings: [] }) }));
    await b;
    ok('the answer is cached for the 15-minute window', !!LIVE_CACHE['en-sv05-181|Raw NM']);
    fetchListings('en-sv05-181', 'Raw NM');
    ok('...so asking again spends no request', calls === 2, calls + ' requests');
    await new Promise(r => setTimeout(r, 0));
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
})();
