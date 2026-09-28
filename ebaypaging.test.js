// ebaypaging.test.js — /api/listings pages past eBay's first 75, and says so
//
//   node ebaypaging.test.js
//
// Measured 2026-09-27 (/api/ebay/gradecost): the 75-row cap lost 79-82 wanted
// rows on one busy card — ~20x what unset grade fields lose — and under
// sort=price it cuts the EXPENSIVE end, so every median built from the rows
// sat low while `cheapest` looked fine.
//
// The rule: a second page only when eBay's `total` exceeds what was fetched;
// never more than EBAY_MAX_PAGES; a truncated result says it is truncated.
//
// This runs the REAL sourceEbay, sliced out of server.js, against a stubbed
// eBay — so it measures what the function does, not what its source says.
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
const fnMatch = slice('function gateLanguage(') + slice('function ebayMatchCard(');
const fnNorm = slice('function normaliseListing(');
ok(!/\nasync function |\nfunction /.test(fnEbay.slice(1)), 'the sourceEbay slice holds one function');
const maxPagesDecl = (src.match(/\nconst EBAY_MAX_PAGES = \d+;/) || [''])[0];
ok(maxPagesDecl, 'EBAY_MAX_PAGES is declared at top level');

// One Charizard title that passes the gate at PSA 10, made unique per row.
const CARD = { api_card_id: 'en-base1-4', name: 'Charizard', name_en: 'Charizard', number: '4',
               set_total: 102, set_name: 'Base', set_api_id: 'base1', set_release: '1999-01-09' };
const title = i => `1999 Pokemon Base Set Charizard 4/102 Holo PSA 10 GEM MINT #${1000 + i}`;

function build(total, opts = {}) {
  const calls = [];
  const ebay = {
    ebayEnabled: () => true,
    async fetchEbay(_db, req) {
      const u = new URL(req.url);
      const limit = +u.searchParams.get('limit');
      const offset = +(u.searchParams.get('offset') || 0);
      calls.push({ offset, limit });
      if (req.dryRun) return { dryRun: true, request: req.url };
      if (opts.failAt === calls.length) return { ok: false, reason: 'HTTP 500' };
      const n = Math.max(0, Math.min(limit, total - offset));
      const itemSummaries = Array.from({ length: n }, (_, k) => {
        const i = offset + k - (opts.overlap && offset ? opts.overlap : 0);
        return { itemId: 'v1|' + i, title: title(i), price: { value: String(100 + i), currency: 'USD' },
                 condition: 'Graded', itemWebUrl: 'https://www.ebay.com/itm/' + i };
      });
      return { ok: true, data: { total, itemSummaries } };
    }
  };
  // timing: the ?debug=1 recorder (T1). A no-op outside a debug request.
  const factory = new Function('ebay', 'cm', 'lp', 'jpf', 'db', 'getEbayTokenDetailed', 'timing',
    `${maxPagesDecl}\n${fnMatch}\n${fnNorm}\n${fnEbay}\nreturn { sourceEbay };`);
  const mod = factory(ebay, cm, lp, jpf, null, async () => ({ token: 't' }), require('./timing'));
  return { calls, ...mod };
}

// `pages` is absent on a build without paging: fail each assertion, don't abort.
const run = async (b, ...a) => { const r = await b.sourceEbay(...a); r.pages = r.pages || {}; return r; };

(async () => {
  // ── under one page: one call, nothing claimed truncated ──
  {
    const b = build(40);
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(b.calls.length === 1, `40 on eBay -> 1 call (got ${b.calls.length})`);
    ok(r.pages.fetched === 1 && r.pages.truncated === false && r.pages.stoppedAtCap === false,
       'a complete single page is not truncated: ' + JSON.stringify(r.pages));
    ok(r.scanned === 40 && r.kept === 40, `every row reached the gate and passed it (${r.kept}/${r.scanned})`);
  }
  // ── exactly one full page: eBay's total says there is nothing more ──
  {
    const b = build(75);
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(b.calls.length === 1, `75 on eBay -> 1 call, no speculative second page (got ${b.calls.length})`);
    ok(r.pages.truncated === false, '75 of 75 is complete');
  }
  // ── the busy card: 145 wanted, as on JP Charizard ex 201 ──
  {
    const b = build(145);
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(b.calls.length === 2, `145 on eBay -> 2 calls (got ${b.calls.length})`);
    ok(b.calls[1] && b.calls[1].offset === 75, 'page 2 starts at offset 75');
    ok(r.scanned === 145 && r.pages.truncated === false && r.pages.stoppedAtCap === false,
       `all 145 examined, complete: ${r.scanned} ${JSON.stringify(r.pages)}`);
    ok(r.listings.some(l => l.price >= 200), 'the expensive end past row 75 is now kept');
  }
  // ── past the cap: three calls, and the response says it stopped there ──
  {
    const b = build(600);
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(b.calls.length === 3, `600 on eBay -> exactly 3 calls, the cap (got ${b.calls.length})`);
    ok(r.scanned === 225, `225 examined (got ${r.scanned})`);
    ok(r.pages.truncated === true && r.pages.stoppedAtCap === true && r.pages.ebayTotal === 600,
       'a capped result says truncated and stoppedAtCap: ' + JSON.stringify(r.pages));
  }
  // ── a later page fails: page 1 is kept, and the failure is reported ──
  {
    const b = build(300, { failAt: 2 });
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(r.scanned === 75 && r.kept === 75, 'page 1 survives a failed page 2');
    ok(r.pages.truncated === true && /500/.test(r.pages.pageError || ''),
       'the failed page is reported, not a silent short list: ' + JSON.stringify(r.pages));
  }
  // ── a row that shifted between pages is counted once ──
  {
    const b = build(150, { overlap: 3 });
    const r = await run(b,CARD, 'PSA 10', 25);
    ok(r.pages.duplicatesSkipped === 3 && r.scanned === 147,
       `3 repeated rows skipped (${r.pages.duplicatesSkipped}, scanned ${r.scanned})`);
  }
  // ── dry run still sends nothing ──
  {
    const b = build(600);
    const r = await run(b,CARD, 'PSA 10', 25, { dryRun: true });
    ok(r.dryRun === true && b.calls.length === 1, 'dry run builds one request and pages nothing');
  }
  // ── wired: gatherListings forwards the block to sources.ebay ──
  ok(/if \(r\.value\.pages\) sources\[s\.id\]\.pages = r\.value\.pages;/.test(src),
     'gatherListings carries `pages` onto the source block');

  console.log(`\nebaypaging: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + e.stack); process.exit(1); });
