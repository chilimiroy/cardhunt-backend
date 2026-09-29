// marketwait.test.js — a card view asks the server once (TASK T1, then 2026-09-29)
//   node marketwait.test.js
// Measured on Render 2026-09-28: /api/market and a duplicate /api/listings
// fired with every card view, and the gated listings queued behind them on
// eBay's serial queue — 512ms mean (31% of a cold view). T1 made market wait
// for listings and shared one listings request. On 2026-09-29 /api/market's
// last answer the page used (the ungated "lowest listing") was replaced by
// /api/listings' own cheapestLive, so the page no longer calls /api/market
// at all — there is nothing left to order. What this pins now: no market
// request, and one listings request per card+grade. Runs the REAL function.
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
ok('the page makes no /api/market request', !/\/api\/market/.test(code));
ok('marketAfterListings / fetchMarketPrice / renderMarketData are gone',
  !/function\s+(marketAfterListings|fetchMarketPrice|renderMarketData)\b/.test(code));
ok('the listings request is published while in flight', /LIVE_INFLIGHT\[key\] = pr;/.test(code));
// Opening a card fired /api/listings twice ~110ms apart (panel + Latest-
// searches tile average), and the panel's copy queued behind its twin.
const listingFetches = (code.match(/fetch\(BACKEND \+ '\/api\/listings\/'/g) || []).length;
ok('exactly ONE place in the page fetches /api/listings', listingFetches === 1, listingFetches + ' places');
ok('...and it is fetchListings', /fetch\(BACKEND \+ '\/api\/listings\/'/.test(slice('fetchListings')));
ok('the panel and the tile average both go through it',
  /fetchListings\(/.test(slice('renderLiveListings')) && /fetchListings\(/.test(slice('cardListingAvg')));
ok('Lowest listing is filled from that same answer (setLowestFromListings)',
  /setLowestFromListings\(/.test(slice('renderLiveListings')));

(async () => {
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
