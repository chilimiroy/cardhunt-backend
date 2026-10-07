// ebaypaging.test.js — eBay is paged until the results run out, on every site
//
//   node ebaypaging.test.js
//
// Measured 2026-09-27 (/api/ebay/gradecost): the 75-row cap lost 79-82 wanted
// rows on one busy card — ~20x what unset grade fields lose — and under
// sort=price it cuts the EXPENSIVE end, so every median built from the rows
// sat low while `cheapest` looked fine.
//
// T1 (2026-09-30) replaced the 3-page cap on /api/listings with: page 1 of
// every site in EBAY_SITES, then each site paged to exhaustion (or eBay's own
// 10,000-result ceiling), one page at a time, rows de-duplicated across sites
// and a refusal on any site sticky everywhere. EBAY_MAX_PAGES remains the
// DEFAULT for the bounded callers (marketprobe, gradecost).
//
// This runs the REAL sourceEbay and the REAL multi-site functions, sliced out
// of server.js, against a stubbed eBay — so it measures what the functions
// do, not what their source says.
'use strict';
const fs = require('fs');
const cm = require('./cardmatch');
const lp = require('./listingparse');
const jpf = require('./jpfilter');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

const src = fs.readFileSync('server.js', 'utf8').split('\r\n').join('\n');

// A top-level declaration runs to the first line that is exactly "}" — every
// function in server.js closes at column 0. Over-slicing would hand the test a
// neighbour's code (the setlist.test.js fnSrc lesson), so assert the slice.
function slice(decl) {
  const at = src.indexOf('\n' + decl);
  if (at < 0) throw new Error('not found: ' + decl);
  const end = src.indexOf('\n}\n', at + 1);
  return src.slice(at + 1, end + 2);
}
const fnEbay = slice('async function sourceEbay(');
// printingsOf / printingReport: T10's printing dimension, which the real
// sourceEbay now calls — the extraction has to carry them or the run crashes.
const fnMatch = slice('function gateLanguage(') + slice('function printingsOf(') + slice('function ebayMatchCard(')
  + slice('function printingReport(');
const fnNorm = slice('function normaliseListing(');
// languageExclusionFor and its two constants (2026-10-07): sourceEbay asks it
// what an English card's request leaves out. Top level in server.js, so the
// deployed module always has it; this extraction must carry it too — without
// it the run crashed here with "languageExclusionFor is not defined".
const fnLang = (src.match(/\nconst LANG_EXCLUDE_DEFAULT = [^\n]*\nconst LANG_ASPECT_SITES = [^\n]*/) || [''])[0]
  + '\n' + slice('function languageExclusionFor(')
  // The language union (2026-10-07): eBay US's first answer goes through it.
  + '\n' + (src.match(/\nconst LANG_UNION_SHARE = [^\n]*/) || [''])[0]
  + '\n' + (src.match(/\nconst LANG_UNION_OPEN_PAGES = [^\n]*/) || [''])[0]
  + '\n' + slice('async function sourceEbayLanguageUnion(');
ok(/const LANG_EXCLUDE_DEFAULT = 'none';/.test(fnLang) && /function languageExclusionFor\(/.test(fnLang),
   'the language exclusion (default and helper) is extracted with sourceEbay');
ok(!/\nasync function |\nfunction /.test(fnEbay.slice(1)), 'the sourceEbay slice holds one function');

// The constants block, EBAY_MAX_PAGES through ebaySite: the page size, the
// offset ceiling and the site list live there (T1).
const constStart = src.indexOf('\nconst EBAY_MAX_PAGES = ');
const constEnd = constStart < 0 ? -1 : src.indexOf('\n', src.indexOf('\nconst ebaySite = ', constStart) + 1);
const consts = constStart >= 0 && constEnd > constStart ? src.slice(constStart, constEnd) : '';
ok(/EBAY_OFFSET_CEILING = 10000;/.test(consts) && /EBAY_PAGE_MAX = 200;/.test(consts),
   'EBAY_PAGE_MAX and EBAY_OFFSET_CEILING are declared at top level');
const fnSites = ['function newEbayState(', 'function mergeEbaySite(', 'function ebaySiteFailed(',
  'function ebayStateResult(', 'async function sourceEbayAll(', 'async function ebayLoadMore(',
  'function listingsProgress(']
  .map(slice).join('\n') + '\n' + (src.match(/\nconst siteName = [^\n]*/) || [''])[0];

// One Charizard title that passes the gate at PSA 10, made unique per row.
const CARD = { api_card_id: 'en-base1-4', name: 'Charizard', name_en: 'Charizard', number: '4',
               set_total: 102, set_name: 'Base', set_api_id: 'base1', set_release: '1999-01-09' };
const title = i => `1999 Pokemon Base Set Charizard 4/102 Holo PSA 10 GEM MINT #${1000 + i}`;

// A deterministic fx stub: 1 GBP/AUD/CAD = 1.5 USD. The real fx.js is
// tested on its own; here the question is whether sourceEbay USES it.
const fx = {
  async toUsd(a, c) { if (!(a > 0)) return null; if (c === 'XXX') throw new Error('fx: no pinned fallback for XXX');
    return { usd: +(a * 1.5).toFixed(2), original: a, currency: c, rate: 1.5, rateDate: 'test', rateSource: 'stub' }; },
  describe: c => c ? `${c.currency}->USD @${c.rate}` : ''
};

// `sites`: per marketplace, { total, currency, titleFor(i), idFor(i), failAt }.
// Default: US only, `total` rows, USD.
function build(total, opts = {}) {
  const calls = [];
  const sites = opts.sites || { EBAY_US: { total } };
  const ebay = {
    ebayEnabled: () => true,
    async fetchEbay(_db, req) {
      const u = new URL(req.url);
      const limit = +u.searchParams.get('limit');
      const offset = +(u.searchParams.get('offset') || 0);
      const mp = (req.meta && req.meta.marketplace) || 'EBAY_US';
      calls.push({ offset, limit, mp, background: !!req.background, q: u.searchParams.get('q'),
                   aspect: u.searchParams.get('aspect_filter') });
      if (req.dryRun) return { dryRun: true, request: req.url };
      const site = sites[mp];
      if (!site) return { ok: false, reason: 'HTTP 409 marketplace not supported' };
      const nOnSite = calls.filter(c => c.mp === mp).length;
      if (site.failAt === nOnSite) return { ok: false, reason: 'HTTP 500' };
      if (site.blockAt === nOnSite) return { ok: false, blocked: 'quota', reason: 'soft stop reached' };
      if (opts.failAt === calls.length) return { ok: false, reason: 'HTTP 500' };
      const n = Math.max(0, Math.min(limit, site.total - offset));
      const itemSummaries = Array.from({ length: n }, (_, k) => {
        const i = offset + k - (opts.overlap && offset ? opts.overlap : 0);
        return { itemId: site.idFor ? site.idFor(i, u) : 'v1|' + i,
                 title: site.titleFor ? site.titleFor(i, u) : title(i),
                 price: { value: String(100 + i), currency: site.currency || 'USD' },
                 shippingOptions: [{ shippingCost: { value: '5.00', currency: site.currency || 'USD' } }],
                 condition: 'Graded', itemWebUrl: 'https://www.ebay.com/itm/' + i };
      });
      // eBay reports the SEARCH's total on every page, capped nowhere.
      return { ok: true, data: { total: site.total, itemSummaries } };
    }
  };
  const factory = new Function('ebay', 'cm', 'lp', 'jpf', 'db', 'getEbayTokenDetailed', 'timing', 'fx',
    `${consts}\n${fnLang}\n${fnMatch}\n${fnNorm}\n${fnEbay}\n${fnSites}\n` +
    'return { sourceEbay, sourceEbayAll, ebayLoadMore, ebayStateResult, listingsProgress, EBAY_SITES };');
  const mod = factory(ebay, cm, lp, jpf, null, async () => ({ token: 't' }), require('./timing'), fx);
  return { calls, ...mod };
}

// `pages` is absent on a build without paging: fail each assertion, don't abort.
const run = async (b, ...a) => { const r = await b.sourceEbay(...a); r.pages = r.pages || {}; return r; };
// Drive a multi-site view the way a user who presses everything does (T2):
// "Search all marketplaces", then "Load more" until nothing is owed. Each
// press is foreground and fetches ONE page per site.
async function fullView(b) {
  const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false, sites: 'all' });
  const st = r.ebayState;
  let presses = 0;
  while (Object.values(st.sites).some(s => s.status === 'ok' && s.nextOffset != null) && presses < 100) {
    await b.ebayLoadMore(CARD, 'PSA 10', { background: false }, st);
    presses++;
  }
  return { first: r, final: b.ebayStateResult(st), st, presses };
}

(async () => {
  // ═══ The bounded default (marketprobe, gradecost) — unchanged ═══
  {
    const b = build(40);
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(b.calls.length === 1, `40 on eBay -> 1 call (got ${b.calls.length})`);
    // LANG_EXCLUDE_DEFAULT = 'none' (2026-10-07): until the exclusion is
    // measured, the request a page sends is exactly what it was.
    ok(b.calls.every(c => c.q && !/(^| )-/.test(c.q) && !/Language/.test(c.aspect || '')),
       'the default request carries no language exclusion (q: ' + (b.calls[0] && b.calls[0].q) + ')');
    ok(r.pages.fetched === 1 && r.pages.truncated === false && r.pages.stoppedAtCap === false && r.pages.exhausted === true,
       'a complete single page is not truncated: ' + JSON.stringify(r.pages));
    ok(r.scanned === 40 && r.kept === 40, `every row reached the gate and passed it (${r.kept}/${r.scanned})`);
  }
  {
    const b = build(75);
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(b.calls.length === 1, `75 on eBay -> 1 call, no speculative second page (got ${b.calls.length})`);
    ok(r.pages.truncated === false && r.pages.nextOffset === null, '75 of 75 is complete, nothing owed');
  }
  {
    const b = build(145);
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(b.calls.length === 2, `145 on eBay -> 2 calls (got ${b.calls.length})`);
    ok(b.calls[1] && b.calls[1].offset === 75, 'page 2 starts at offset 75');
    ok(r.scanned === 145 && r.pages.truncated === false && r.pages.stoppedAtCap === false,
       `all 145 examined, complete: ${r.scanned} ${JSON.stringify(r.pages)}`);
    ok(r.listings.some(l => l.price >= 200), 'the expensive end past row 75 is now kept');
  }
  {
    const b = build(600);
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(b.calls.length === 3, `bounded default: 600 on eBay -> 3 calls (got ${b.calls.length})`);
    ok(r.pages.truncated === true && r.pages.stoppedAtCap === true && r.pages.nextOffset === 225,
       'a bounded call says where it stopped, so it can be resumed: ' + JSON.stringify(r.pages));
  }
  {
    const b = build(300, { failAt: 2 });
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(r.scanned === 75 && r.kept === 75, 'page 1 survives a failed page 2');
    ok(r.pages.truncated === true && /500/.test(r.pages.pageError || '') && r.pages.exhausted === false,
       'the failed page is reported, not a silent short list: ' + JSON.stringify(r.pages));
  }
  {
    const b = build(150, { overlap: 3 });
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(r.pages.duplicatesSkipped === 3 && r.scanned === 147,
       `3 repeated rows skipped (${r.pages.duplicatesSkipped}, scanned ${r.scanned})`);
  }
  {
    const b = build(600);
    const r = await run(b, CARD, 'PSA 10', 25, { dryRun: true });
    ok(r.dryRun === true && b.calls.length === 1, 'dry run builds one request and pages nothing');
  }

  // ═══ Paging to exhaustion (T1) ═══
  {
    const b = build(677);
    const r = await run(b, CARD, 'PSA 10', 25, { pageSize: 200, maxPages: Infinity });
    ok(b.calls.length === 4 && b.calls.every(c => c.limit === 200),
       `677 on eBay at 200 a page -> 4 calls (got ${b.calls.length}: ${JSON.stringify(b.calls.map(c => c.offset))})`);
    ok(r.scanned === 677 && r.pages.exhausted === true && r.pages.truncated === false && r.pages.nextOffset === null,
       'every one of 677 examined and nothing owed: ' + JSON.stringify(r.pages));
  }
  {
    const b = build(677);
    const r = await run(b, CARD, 'PSA 10', 25, { pageSize: 200, maxPages: 1, offset: 400 });
    ok(b.calls.length === 1 && b.calls[0].offset === 400, 'a continuation resumes at its offset');
    ok(r.pages.nextOffset === 600 && r.scanned === 200, 'and says where the next page starts: ' + JSON.stringify(r.pages));
  }
  {
    const b = build(677);
    const r = await run(b, CARD, 'PSA 10', 25, { pageSize: 999, maxPages: 1 });
    ok(b.calls[0].limit === 200, `a page is never asked for more than eBay's 200 (asked ${b.calls[0].limit})`);
  }
  {
    // eBay's own ceiling: offset + limit may not pass 10,000.
    const b = build(25000);
    const r = await run(b, CARD, 'PSA 10', 25, { pageSize: 200, maxPages: Infinity });
    ok(b.calls.length === 50 && Math.max(...b.calls.map(c => c.offset)) === 9800,
       `25,000 results -> 50 pages, the last at offset 9,800 (got ${b.calls.length})`);
    ok(r.pages.atEbayCeiling === true && r.pages.exhausted === true && r.pages.truncated === true,
       'the ceiling is stated as truncation, not passed off as complete: ' + JSON.stringify(r.pages));
  }

  // ═══ Currency and shipping destination (T1) ═══
  {
    const b = build(0, { sites: { EBAY_GB: { total: 3, currency: 'GBP' } } });
    const r = await run(b, CARD, 'PSA 10', 25, { marketplace: 'EBAY_GB' });
    const l = r.listings[0] || {};
    ok(l.price === 150 && l.currency === 'USD' && l.priceOriginal === 100 && l.currencyOriginal === 'GBP',
       'a GBP row is converted, its own price and currency kept: ' + JSON.stringify({ p: l.price, c: l.currency, po: l.priceOriginal, co: l.currencyOriginal }));
    ok(l.shipping === 7.5 && l.landed === 157.5, `shipping converted too (${l.shipping}, landed ${l.landed})`);
    ok(l.shippingTo === 'GB' && l.marketplace === 'EBAY_GB' && /GBP->USD/.test(l.fx || ''),
       'the row says whose shipping quote it is, where it came from, and the rate');
  }
  {
    const b = build(0, { sites: { EBAY_GB: { total: 2, currency: 'XXX' } } });
    const r = await run(b, CARD, 'PSA 10', 25, { marketplace: 'EBAY_GB' });
    ok(r.kept === 0 && r.rejected === 2 && r.dropped.every(d => /currency not convertible/.test(d.reason)),
       'an unconvertible currency is refused WITH its reason, never shown as USD');
  }
  {
    const b = build(3);
    const r = await run(b, CARD, 'PSA 10', 25);
    ok(r.listings[0].currencyOriginal === null && r.listings[0].shippingTo === 'US', 'a US row is untouched, shipping to US');
  }

  // ═══ On demand (T2): opening a card is ONE call ═══
  {
    const b0 = build(0);
    const sites = {};
    for (const x of b0.EBAY_SITES) sites[x.id] = { total: 300, currency: x.currency };
    const b = build(0, { sites });
    const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false });
    ok(b.calls.length === 1 && b.calls[0].mp === 'EBAY_US' && b.calls[0].offset === 0 && !b.calls[0].background,
       'the default view is eBay US page 1 — one foreground call: ' + JSON.stringify(b.calls));
    const pg = b.listingsProgress(r.ebayState, r.kept);
    const others = b0.EBAY_SITES.length - 1;
    ok(pg.complete === false && pg.notSearched.length === others && !pg.notSearched.includes('EBAY_US'),
       'and it says the other sites were NOT searched: ' + JSON.stringify(pg.notSearched));
    ok(pg.actions.searchAllSites && pg.actions.searchAllSites.calls === others
       && pg.actions.searchAllSites.label === 'Search ' + others + ' more marketplaces',
       'the control says what it will do and cost: ' + JSON.stringify(pg.actions.searchAllSites));
    ok(pg.actions.loadMore && pg.actions.loadMore.calls === 1 && pg.actions.loadMore.notExamined === 100,
       'and that US has 100 more results not examined: ' + JSON.stringify(pg.actions.loadMore));
    ok(new RegExp(others + ' more marketplaces not searched').test(pg.note) && /100 more results on eBay not yet examined/.test(pg.note),
       'the note says what is not shown, in words: ' + pg.note);
    ok(pg.loading.length === 0, 'nothing is "still loading" — nothing runs by itself');

    // "Search all marketplaces" on the same view: only the sites not held.
    await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false, sites: 'all', state: r.ebayState });
    ok(b.calls.length === 1 + others && !b.calls.slice(1).some(c => c.mp === 'EBAY_US'),
       'Search all marketplaces asks the ' + others + ' others, not US again (' + (b.calls.length - 1) + ' calls)');
    // "Load more": one page of each site searched that has more.
    const n0 = b.calls.length;
    await b.ebayLoadMore(CARD, 'PSA 10', { background: false }, r.ebayState);
    const more = b.calls.slice(n0);
    ok(more.length === b0.EBAY_SITES.length && more.every(c => c.offset === 200 && !c.background),
       'Load more fetches ONE more page per searched site, foreground: ' + JSON.stringify(more.map(c => c.mp + '@' + c.offset)));
    const pg2 = b.listingsProgress(r.ebayState, 0);
    ok(pg2.complete === true && !pg2.actions.loadMore && !pg2.actions.searchAllSites,
       'complete only once every site is searched and every page examined');
  }
  {
    // A refused site is not "searched": the next press asks it again.
    const b = build(0, { sites: { EBAY_US: { total: 5 }, EBAY_GB: { total: 5, currency: 'GBP', blockAt: 1 } } });
    const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false, sites: 'all' });
    ok(r.ebayState.sites.EBAY_GB.status === 'quota', 'a refused site keeps its status: ' + r.ebayState.sites.EBAY_GB.status);
    const pg = b.listingsProgress(r.ebayState, r.kept);
    ok(pg.notSearched.includes('EBAY_GB') && pg.incomplete.some(i => i.marketplace === 'EBAY_GB'),
       'and is reported as not searched, with its reason');
    const n0 = b.calls.length;
    await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false, sites: 'all', state: r.ebayState });
    ok(b.calls.slice(n0).some(c => c.mp === 'EBAY_GB') && !b.calls.slice(n0).some(c => c.mp === 'EBAY_US'),
       'pressing again retries GB and does not re-ask US');
  }

  // ═══ Every site, every page — when asked (T1, T2) ═══
  {
    // US and GB share items 0-149; GB also has 150-349 of its own. Every
    // other site in the REAL EBAY_SITES answers with nothing (total 0), so
    // this keeps working as sites are added.
    const b0 = build(0);
    const siteIds = b0.EBAY_SITES.map(x => x.id);
    const sites = {};
    for (const id of siteIds) sites[id] = { total: 0, currency: (b0.EBAY_SITES.find(x => x.id === id) || {}).currency };
    Object.assign(sites, { EBAY_US: { total: 150 }, EBAY_GB: { total: 350, currency: 'GBP' },
                           EBAY_CA: { total: 10, currency: 'CAD' } });
    const b = build(0, { sites });
    const v = await fullView(b);
    const n = siteIds.length;
    const firstMps = b.calls.slice(0, n).map(c => c.mp).sort().join(',');
    ok(firstMps === siteIds.slice().sort().join(',') && b.calls.slice(0, n).every(c => c.offset === 0 && !c.background),
       'page 1 of every site first, foreground: ' + JSON.stringify(b.calls.slice(0, n)));
    ok(v.first.pending.length === 1 && v.first.pending[0].marketplace === 'EBAY_GB' && v.first.pending[0].nextOffset === 200,
       'the first answer says what is still owed: ' + JSON.stringify(v.first.pending));
    const cont = b.calls.slice(n);
    ok(cont.length === 1 && cont[0].mp === 'EBAY_GB' && cont[0].offset === 200 && !cont[0].background,
       'Load more fetches only what is owed, foreground, on request: ' + JSON.stringify(cont));
    ok(v.final.kept === 350 && v.final.listings.length === 350,
       `350 distinct items, each once (got ${v.final.kept})`);
    ok(v.st.sites.EBAY_GB.duplicates === 150 && v.st.sites.EBAY_US.kept === 150,
       'a row on two sites keeps its US copy: ' + JSON.stringify(v.st.sites.EBAY_GB));
    ok(v.final.pages.complete === true && v.final.pending.length === 0, 'complete once every site is exhausted');
    ok(v.final.pages.calls === n + 1, `calls counted: ${n + 1} (got ${v.final.pages.calls})`);
    ok(v.final.sitesNotSearched && v.final.sitesNotSearched.EBAY_JP, 'the sites NOT searched are named, with reasons');
  }
  {
    // A refusal is sticky: US refuses item 7 (a Celebrations title), GB's
    // copy of the same item reads clean. The item stays refused.
    const bad = i => `Pokemon Celebrations Charizard 4/102 Classic Collection PSA 10 #${i}`;
    const b = build(0, { sites: { EBAY_US: { total: 10, titleFor: i => i === 7 ? bad(i) : title(i) },
                                  EBAY_GB: { total: 10, currency: 'GBP' } } });
    const v = await fullView(b);
    ok(!v.final.listings.some(l => l.itemId === 'v1|7'),
       'an item US refused is not let back in by another site\'s title');
    ok(v.final.kept === 9, `9 kept (got ${v.final.kept})`);
  }
  {
    // ...but a refusal read from a TRANSLATED title is not sticky. Measured:
    // eBay ES turned "ENG" into "ESP" and IT "Ethan's Pinsir" into "Pinsir di
    // Ethan" — 8 of 8 such refusals were the translation's fault. IT refuses
    // item 3 on its translated title; the US copy stays. IT's own item 20,
    // which only IT has, is refused — its own copy, its own verdict.
    const badIt = i => `Pokemon Carta Charizard 4/102 Set Base Holo ESP #${i}`;
    const b = build(0, { sites: { EBAY_US: { total: 10 },
      EBAY_IT: { total: 21, currency: 'EUR', titleFor: i => (i === 3 || i === 20) ? badIt(i) : title(i) } } });
    const v = await fullView(b);
    ok(v.final.listings.some(l => l.itemId === 'v1|3'), 'a translated site\'s refusal does not remove the English copy');
    ok(!v.final.listings.some(l => l.itemId === 'v1|20'), 'and its own copy of an item only it has is still refused');
    ok(v.final.kept === 20, `20 kept: 10 from US, 10 more from IT (got ${v.final.kept})`);
  }
  {
    // The same item from an earlier site replaces a later site's copy,
    // whatever order pages arrive in: IT's page 1 lands first carrying US's
    // items 200-399 (translated); US's page 2 then brings them in English.
    const b = build(0, { sites: {
      EBAY_US: { total: 400 },
      EBAY_IT: { total: 200, currency: 'EUR', idFor: i => 'v1|' + (i + 200),
                 titleFor: i => `Pokemon Charizard 4/102 Set Base Holo PSA 10 Inglese #${1200 + i}` } } });
    const v = await fullView(b);
    const it = v.final.listings.filter(l => l.marketplace === 'EBAY_IT').length;
    ok(v.final.kept === 400 && it === 0,
       `every shared item shown as its US copy (IT rows ${it}, total ${v.final.kept})`);
    ok(v.st.sites.EBAY_IT.kept === 0 && v.st.sites.EBAY_US.kept === 400,
       'and the counts move with it: ' + JSON.stringify({ us: v.st.sites.EBAY_US.kept, it: v.st.sites.EBAY_IT.kept }));
  }
  {
    // A quota refusal on the third page (the second "Load more"): what
    // arrived stays, the page stays OWED so pressing again retries it, and
    // the progress says why it did not load.
    const b = build(0, { sites: { EBAY_US: { total: 1000, blockAt: 3 } } });
    const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false });
    await b.ebayLoadMore(CARD, 'PSA 10', { background: false }, r.ebayState);
    await b.ebayLoadMore(CARD, 'PSA 10', { background: false }, r.ebayState);
    const s = r.ebayState.sites.EBAY_US;
    const fin = b.ebayStateResult(r.ebayState);
    ok(fin.kept === 400 && s.nextOffset === 400 && /quota|soft stop/.test(s.lastError || ''),
       'a refused page keeps what arrived, stays owed, and says why: ' + JSON.stringify({ kept: fin.kept, s }));
    const pg = b.listingsProgress(r.ebayState, fin.kept);
    ok(pg.complete === false && pg.morePages[0] && /quota|soft stop/.test(pg.morePages[0].lastError || ''),
       'and the view is not called complete');
    await b.ebayLoadMore(CARD, 'PSA 10', { background: false }, r.ebayState);
    ok(b.ebayStateResult(r.ebayState).kept === 600 && !s.lastError, 'pressing again fetches it');
  }
  {
    // One site failing does not empty the view; every site failing reports
    // the source's status as before.
    const b = build(0, { sites: { EBAY_US: { total: 5 } } });   // GB/AU/CA answer 409
    const v = await fullView(b);
    ok(v.final.kept === 5 && v.st.sites.EBAY_GB.status === 'error' && /409/.test(v.st.sites.EBAY_GB.reason),
       'a refusing site is reported, the others still answer: ' + JSON.stringify(v.st.sites.EBAY_GB));
    const b2 = build(0, { sites: {} });
    let threw = null; try { await b2.sourceEbayAll(CARD, 'PSA 10', 25, {}); } catch (e) { threw = e; }
    ok(threw && /409/.test(threw.message), 'every site failing throws, so the status is reported, never an empty list');
  }
  {
    // A dry run asks one site and sends nothing.
    const b = build(0, { sites: { EBAY_US: { total: 5 } } });
    const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { dryRun: true });
    ok(r.dryRun === true && b.calls.length === 1, 'a dry run builds one request');
  }

  // ═══ Wiring ═══
  ok(/if \(r\.value\.pages\) sources\[s\.id\]\.pages = r\.value\.pages;/.test(src),
     'gatherListings carries `pages` onto the source block');
  ok(/id: 'ebay', label: 'eBay', fetch: sourceEbayAll,/.test(src), 'the eBay listing source is the every-site one');
  ok(!/listings: listings\.slice\(0, (limit|25)\)/.test(src), 'no listings response is sliced to a row limit');
  ok(/const lp = await listingsFor\(card, top\.cardId, grade, null, \{\}\);/.test(src),
     '/api/search answers through listingsFor — never a trimmed copy in the shared cache');

  // ── The language union on a card's first US answer (2026-10-07) ──
  // Unfiltered: Japanese copies fill the page (refused). Filtered
  // (Language:{English}): English copies. The real sourceEbayAll must spend
  // exactly ONE extra call, ask for the English aspect on one 200-row page,
  // keep the English rows, and lose nothing the first query kept.
  {
    const lang = u => /Language:\{English\}/.test(u.searchParams.get('aspect_filter') || '');
    const sites = { EBAY_US: { total: 1300,
      titleFor: (i, u) => lang(u) ? title(i) : '1999 Pokemon Japanese Charizard 4/102 Holo PSA 10 #' + (5000 + i),
      idFor: (i, u) => (lang(u) ? 'v1|en' : 'v1|ja') + i } };
    const b = build(0, { sites });
    const r = await b.sourceEbayAll(CARD, 'PSA 10', 25, { background: false });
    ok(b.calls.length === 2, 'a polluted first answer costs exactly ONE extra call: ' + b.calls.length);
    ok(b.calls[1] && /Language:\{English\}/.test(b.calls[1].aspect || '') && b.calls[1].limit === 200 && b.calls[1].offset === 0,
       'the extra call asks Language:{English}, one 200-row page');
    ok(r.kept > 0 && r.listings.every(l => /^v1\|en/.test(l.itemId)), 'it keeps the English copies (' + r.kept + ')');
    ok(r.pages.calls === 2 && r.union && r.union.triggered && r.union.extraPages === 1, 'the cost is counted and reported (pages.calls, union)');
    const pg = b.listingsProgress(r.ebayState, r.kept);
    ok(pg && JSON.stringify(pg).length > 0, 'progress still builds');
    // A clean first answer (no language refusals): one call, exactly as before.
    const b2 = build(0, { sites: { EBAY_US: { total: 1300 } } });
    await b2.sourceEbayAll(CARD, 'PSA 10', 25, { background: false });
    ok(b2.calls.length === 1, 'a clean first answer: still exactly one call');
  }

  console.log(`\nebaypaging: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + e.stack); process.exit(1); });
