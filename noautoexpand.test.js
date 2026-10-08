// noautoexpand.test.js — opening a card is ONE eBay call, always
// (2026-10-01). The automatic all-marketplace expansion (US page 1 under 5
// kept -> 8 calls) is deleted, not set to zero: a dormant branch is how
// renderRealListings kept a path to a gated element with no callers. So this
// asserts the branch is GONE, and that the page, when US finds nothing, says
// only US was asked and offers the button — never "No listing matched".
//
//   node noautoexpand.test.js
//   node noautoexpand.test.js <server.js> <page.html>   (e.g. files from git show, to watch it fail)
require('./testcount')(19);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const serverFile = process.argv[2] || 'server.js';
const pageFile = process.argv[3] || 'cardhunt_preview.html';
const server = fs.readFileSync(serverFile, 'utf8');
const page = fs.readFileSync(pageFile, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } }

// A top-level function's source: from its declaration to the first "}" at
// column 0. Asserted on itself below — a slicer that over-runs passes on
// the next function's text (the setlist.test.js fnSrc lesson).
function fnSrc(src, name) {
  const re = new RegExp('\\n(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return '';
  const end = src.indexOf('\n}', m.index + 1);
  return end < 0 ? '' : src.slice(m.index, end + 2);
}

console.log('\n  noautoexpand.test.js\n');

// ── the slicer, checked first ──
const lf = fnSrc(server, 'listingsFor');
ok(lf.length > 500, 'listingsFor found (' + lf.length + ' chars)');
ok(!/\nasync function expandView/.test(lf), 'listingsFor slice stops before expandView');

// ── the server: no automatic expansion, in any form ──
ok(!/AUTO_EXPAND/.test(server), 'no AUTO_EXPAND threshold anywhere in server.js');
ok(!/autoExpanded/.test(server), 'no autoExpanded payload field');
ok(!/open\+auto/.test(server), "no 'open+auto' view action");
ok(!/req\.query\.auto\b/.test(server), 'no ?auto= switch on the route');
ok(!/opts\.auto\b/.test(lf), 'listingsFor reads no auto option');
ok(!/sourceEbayAll\s*\(/.test(lf), 'listingsFor never calls sourceEbayAll — every other site is a button');
ok(/sites:\s*wantSites\s*\|\|\s*\[\s*'EBAY_US'\s*\]/.test(lf), "a plain open asks ['EBAY_US'] only");

// ── the page ──
ok(!/autoExpanded/.test(page), 'the page renders no autoExpanded reason');
const note = fnSrc(page, 'onlyUsNote');
ok(note.length > 0, 'onlyUsNote exists');
const rl = fnSrc(page, 'renderLiveListings');
ok(/onlyUsNote\(d\)/.test(rl), 'the empty panel asks onlyUsNote before saying "No listing matched"');
ok(/liveProgressLine\(d,\s*!rows\.length\s*&&\s*!!onlyUsNote\(d\)\)/.test(rl),
   'the header drops its button when the empty message carries it (one #cd-sites-btn)');

// onlyUsNote, run for real on payload shapes listingsProgress produces.
if (note) {
  const liveEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = new Function('liveEsc', note + '\nreturn onlyUsNote;')(liveEsc);
  const usOnly = { progress: { searched: ['EBAY_US'], notSearched: ['EBAY_GB', 'EBAY_AU'],
    actions: { searchAllSites: { calls: 7, label: 'Search 7 more marketplaces', sites: ['GB', 'AU', 'CA', 'DE', 'FR', 'IT', 'ES'] } } } };
  const h = f(usOnly);
  ok(/No listing of this exact card on eBay US/.test(h), 'names the one marketplace asked');
  ok(/7 more marketplaces were not searched: GB, AU, CA, DE, FR, IT, ES/.test(h), 'names the seven not asked');
  ok(/id="cd-sites-btn"[^>]*onclick="liveExpand\('sites'\)"/.test(h), 'carries the Search button liveExpand finds');
  ok(/Search 7 more marketplaces/.test(h), "the button says what it does");
  ok(f({ progress: { searched: ['EBAY_US', 'EBAY_GB'], notSearched: [], actions: {} } }) === '',
     'every site searched -> no note (then "no listing" is true)');
  ok(f({}) === '' && f(null) === '', 'no progress -> no note');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
