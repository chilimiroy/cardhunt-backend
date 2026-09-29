// nosoldscrape.test.js — the server never scrapes eBay's sold pages (TASK T8)
//   node nosoldscrape.test.js            source + the real getMarketPrice, stubbed
//   node nosoldscrape.test.js --live     also ask a running server (CARDHUNT_API,
//                                        default http://localhost:3001)
// /api/market fetched www.ebay.com/sch/...LH_Sold=1 from Render on every card
// view and regex-parsed the HTML: the scrape `node ingest.js scrape` is banned
// for, while holding eBay API credentials under eBay's terms. Deleted
// 2026-09-29. This fails if it, or anything like it, comes back — and checks
// that the page SAYS there is no sold source rather than showing a number.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

// Comments removed line-wise and block-wise: the history of the scrape is
// written up in comments on purpose, and must not count as the scrape.
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const server = stripComments(fs.readFileSync('server.js', 'utf8'));
const html = stripComments(fs.readFileSync('cardhunt_preview.html', 'utf8'));
const slice = (code, name) => {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(code);
  if (!m) return '';
  const re = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|\nconst\s|\nlet\s|\nvar\s|\napp\./g;
  re.lastIndex = m.index + 1;
  const n = re.exec(code);
  return code.slice(m.index, n ? n.index : code.length);
};

console.log('\n  server — no sold scrape anywhere');
ok('no LH_Sold / LH_Complete in server code', !/LH_Sold|LH_Complete/.test(server));
ok('no fetch of www.ebay.com/sch (eBay HTML search) in server code', !/ebay\.com\/sch/.test(server));
ok('ebaySold is gone — never called', !/ebaySold\s*\(/.test(server));
ok('SOLD_UNAVAILABLE is declared, available:false, with a reason',
  /const SOLD_UNAVAILABLE = Object\.freeze\(\{\s*available: false,[\s\S]{0,80}reason:/.test(server));
ok('/api/market/:cardName/sold answers 410', /app\.get\('\/api\/market\/:cardName\/sold'[\s\S]{0,120}status\(410\)/.test(server));

console.log('\n  page — Last sold says why, never shows a number');
const upd = slice(html, 'updatePrices');
ok('updatePrices exists', upd.length > 200, upd.length + ' chars');
ok('the page never reads recentSales', !/recentSales/.test(html));
ok('the page never writes a price into #cd-sold',
  !/getElementById\('cd-sold'\)\.textContent\s*=\s*fmtCurrency/.test(html) && !/sd\.textContent\s*=\s*fmtCurrency/.test(html));
ok('updatePrices states the missing source on every card and grade',
  /getElementById\('cd-sold'\)\.textContent = '—'/.test(upd) && /no licensed sold source/.test(upd));
ok('the "eBay — sold" DEEP LINK is kept (user\'s own browser, not a fetch)', /id: 'ebay_sold'/.test(html));

// The REAL /api/market handler (2026-09-29: getMarketPrice and its four
// outbound calls are gone), run with the network stubbed. Any fetch at all
// fails this — a sold scrape coming back would have to fetch.
console.log('\n  behaviour — the REAL /api/market handler, network stubbed');
(async () => {
  const i = server.indexOf("app.get('/api/market/:cardName', ");
  const j = server.indexOf("\napp.", i + 5);
  const handlerSrc = i >= 0 ? server.slice(server.indexOf('async', i), server.lastIndexOf(');', j)) : '';
  const decl = /const SOLD_UNAVAILABLE = Object\.freeze\(\{[\s\S]*?\}\);/.exec(server);
  const wdecl = /const MARKET_WITHDRAWN = Object\.freeze\(\{[\s\S]*?\}\);/.exec(server);
  ok('handler, SOLD_UNAVAILABLE and MARKET_WITHDRAWN extracted', !!handlerSrc && !!decl && !!wdecl);
  const fetched = [];
  const fakeFetch = async (u) => { fetched.push(String(u)); return { ok: false, status: 599 }; };
  const run = async (nmAnswer, query) => {
    let body = null;
    const res = { json: b => { body = b; }, status: () => res };
    try {
      // eslint-disable-next-line no-new-func
      const h = new Function('fetch', 'numberMatchedPrice',
        (decl ? decl[0] : '') + '\n' + (wdecl ? wdecl[0] : '') + '\nreturn (' + handlerSrc + ');')(
        fakeFetch, async () => nmAnswer);
      await h({ params: { cardName: 'Charizard' }, query }, res);
    } catch (e) { ok('the handler runs', false, e.message); }
    return body || {};
  };
  const held = { cardId: 'en-base1-4', number: '4', price: 944.53, source: 'tcgplayer_market', isReal: true, recordedAt: '2026-09-29' };
  const r = await run(held, { cardId: 'en-base1-4', set: 'Base Set' });
  ok('no network fetch made by /api/market', fetched.length === 0, fetched.join(' '));
  ok('sold.available === false with a stated reason', r.sold && r.sold.available === false && /Marketplace Insights/.test(r.sold.reason));
  ok('recentSales empty, soldCount 0, soldMedian null',
    Array.isArray(r.recentSales) && r.recentSales.length === 0 && r.soldCount === 0 && r.soldMedian === null);
  ok('the held number-matched price answers', r.marketValue === 944.53 && r.matchedOn === 'collector number', r.marketValue + ' ' + r.matchedOn);
  ok('basis never claims eBay sales', !/sale/i.test(String(r.basis)), r.basis);
  const none = await run(null, {});
  ok('no cardId -> no number, no name-matched stand-in, and says why',
    none.marketValue === null && none.matchedOn === 'none' && /no cardId/.test(none.matchWarning || ''));

  if (process.argv.includes('--live')) {
    const base = process.env.CARDHUNT_API || 'http://localhost:3001';
    console.log('\n  live — ' + base);
    try {
      const m = await (await fetch(base + '/api/market/Charizard?set=Base%20Set&cardId=en-base1-4')).json();
      ok('live /api/market: sold.available false', m.sold && m.sold.available === false, JSON.stringify(m.sold));
      ok('live /api/market: recentSales empty', Array.isArray(m.recentSales) && m.recentSales.length === 0);
      const s = await fetch(base + '/api/market/Charizard/sold');
      ok('live /api/market/:name/sold is 410', s.status === 410, 'HTTP ' + s.status);
    } catch (e) { ok('live server reachable', false, e.message); }
  }

  console.log('\n  nosoldscrape.test.js — ' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;   // not exit(): open fetch sockets abort node on Windows
})();
