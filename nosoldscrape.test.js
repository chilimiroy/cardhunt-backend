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
ok('ebaySold is gone — not declared, not called', !/ebaySold/.test(server));
ok('SOLD_UNAVAILABLE is declared, available:false, with a reason',
  /const SOLD_UNAVAILABLE = Object\.freeze\(\{\s*available: false/.test(server) && /reason:/.test(slice(server, 'getMarketPrice') + server));
ok('/api/market/:cardName/sold answers 410', /app\.get\('\/api\/market\/:cardName\/sold'[\s\S]{0,120}status\(410\)/.test(server));

console.log('\n  page — Last sold says why, never shows a scraped number');
const rmd = slice(html, 'renderMarketData');
ok('renderMarketData exists', rmd.length > 200, rmd.length + ' chars');
ok('renderMarketData never reads recentSales', !/recentSales/.test(rmd));
ok('the page never writes a price into #cd-sold',
  !/getElementById\('cd-sold'\)\.textContent\s*=\s*fmtCurrency/.test(html) && !/sd\.textContent\s*=\s*fmtCurrency/.test(html));
ok('renderMarketData states the missing source from m.sold', /m\.sold && m\.sold\.available === false/.test(rmd) && /no licensed sold source/.test(rmd));
ok('the "eBay — sold" DEEP LINK is kept (user\'s own browser, not a fetch)', /id: 'ebay_sold'/.test(html));

console.log('\n  behaviour — the REAL getMarketPrice, network stubbed');
(async () => {
  const src = slice(server, 'getMarketPrice');
  const decl = /const SOLD_UNAVAILABLE = Object\.freeze\(\{[\s\S]*?\}\);/.exec(server);
  ok('getMarketPrice and SOLD_UNAVAILABLE extracted', !!src && !!decl);
  const fetched = [];
  const fakeFetch = async (u) => { fetched.push(String(u)); return { ok: false, status: 599 }; };
  const stubs = {
    ebayActive: async () => ({ listings: [{ price: 10 }, { price: 20 }, { price: 30 }] }),
    tcgplayerPrice: async () => ({ market: 0 }),
    priceChartingGraded: async () => ({ grades: {} })
  };
  // If a sold scraper is ever back in the source, run IT (network stubbed),
  // so the assertions below catch it by behaviour, not only by grep.
  const soldSrc = slice(server, 'ebaySold');
  let r = {};
  try {
    // eslint-disable-next-line no-new-func
    const f = new Function('fetch', 'ebayActive', 'tcgplayerPrice', 'priceChartingGraded',
      'sGet', 'sSet', 'throttle', 'SUA',
      (decl ? decl[0] : '') + '\n' + soldSrc + '\n' + src + '; return getMarketPrice;')(
      fakeFetch, stubs.ebayActive, stubs.tcgplayerPrice, stubs.priceChartingGraded,
      () => null, () => {}, async () => {}, 'test');
    r = await f('Charizard', 'Base Set', 'PSA 9');
  } catch (e) { ok('getMarketPrice runs', false, e.message); }
  ok('no network fetch made by getMarketPrice itself', fetched.length === 0, fetched.join(' '));
  ok('sold.available === false with a stated reason', r.sold && r.sold.available === false && /Marketplace Insights/.test(r.sold.reason));
  ok('recentSales empty, soldCount 0, soldMedian null',
    Array.isArray(r.recentSales) && r.recentSales.length === 0 && r.soldCount === 0 && r.soldMedian === null);
  ok('basis never claims eBay sales', !/sale/i.test(String(r.basis)), r.basis);
  ok('the legitimate tiers still answer (active median here)', r.marketValue === 20 && r.confidence === 'low', r.marketValue + ' ' + r.confidence);

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
