// cdlayout.test.js — the card page's price column has ONE spacing rule
//
//   node cdlayout.test.js
//
// Measured in the browser 2026-09-27, Base Set Charizard:
//   before  1366px: boxes->bar 14, bar->graph 305 (dead space), shared rows
//           800px:  graph->info 36 (.chart-box margin beat the reset)
//           390px:  info panel sat BETWEEN the bar and the graph
//   after   1366 / 800 / 390px: every gap in the column 16; bar then graph
// A source test cannot see arrangement — the browser pass is the check, and
// CLAUDE.md records why. This pins the rule so a later edit cannot quietly
// put the shared rows, the second margin or the split column back.
'use strict';
require('./testcount')(37);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const page = fs.readFileSync('cardhunt_preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } }

const grid = (page.match(/\.cdgrid\{--cd-gap:[^}]+\}/) || [''])[0];
// TASK-ui T2 (2026-10-07): the information panel is gone — its fields are above the image.
// TASK-ui T1: the graph is one of the price column's two views, not a cell.
ok(/grid-template-areas:"img top";/.test(grid) && !/info|chart/.test(grid),
   'wide: one row — the image and the price column; no info or chart cell');
ok(/align-items:stretch/.test(grid), 'the row stretches, so the column ends level with the image panel');
ok(/gap:var\(--cd-gap\)/.test(grid), 'the grid row gap is the column token');
ok(/\.cdtop-r\{[^}]*display:flex;flex-direction:column;gap:var\(--cd-gap\)/.test(page),
   'prices -> bar spacing is the same token');
ok(/\.cdgrid > \[class\], \.cdtop-r > \[class\], \.cdgrid \.cview, \.cd-view > \[class\], \.cd-pricecol > \[class\], \.cd-pricecol \.selwrap\{margin:0\}/.test(page),
   'no cell carries its own margin inside the grid (specificity beats later .chart-box)');
ok(!/\.cdtop-r \.pboxes\{[^}]*margin-bottom:14px/.test(page), 'the old 14px pboxes margin is gone');
const narrow = (page.match(/@media\(max-width:860px\)\{\s*\.cdgrid\{[^}]+\}/) || [''])[0];
ok(/grid-template-areas:"img" "top";/.test(narrow) && !/info|chart/.test(narrow),
   'narrow: the image, then the price column');

// TASK-ui T1: the toggle. Both views in ONE grid cell (no jump), the hidden
// one invisible and inert; switching fetches nothing.
ok(/\.cd-view\{grid-row:1;grid-column:1;/.test(page), 'both views share one grid cell');
ok(/\.cd-viewwrap\[data-view="boxes"\] \.cd-view-chart,\.cd-viewwrap\[data-view="chart"\] \.cd-view-boxes\{visibility:hidden\}/.test(page),
   'the other view is visibility:hidden, so it keeps its space');
const fnSrc = n => { const i = page.indexOf('function ' + n + '('); return i < 0 ? '' : page.slice(i, page.indexOf('\n}', i) + 2); };
const tog = fnSrc('toggleCardView') + fnSrc('applyCardView');
ok(tog.length > 200 && !/fetch|apiFetch|initChart|loadHistory|renderListingFinder|selGrade|openCard/.test(tog),
   'switching views fetches and redraws nothing');
ok(/p\[0\]\.inert = !p\[1\]/.test(fnSrc('applyCardView')), 'the hidden view is inert (no focus, no clicks)');
const box = page.slice(page.indexOf('id="cd-viewwrap"'), page.indexOf('<div class="lbox'));
ok(box.indexOf('id="cd-sold"') > 0 && box.indexOf('id="cd-vtog"') > box.indexOf('id="cd-chart"'), 'the toggle sits beside the views, after Last sold');
// Roy, 2026-10-10: the filter box sits directly under the price position bar, inside the boxes view.
{
  const bv = page.slice(page.indexOf('<div class="cd-view cd-view-boxes">'), page.indexOf('<div class="cd-view cd-view-chart"'));
  ok(bv.indexOf('id="cd-52high"') > 0 && bv.indexOf('id="cd-selector"') > bv.indexOf('id="cd-52high"') && (page.match(/id="cd-selector"/g) || []).length === 1,
     'the selector is in the boxes view, right after the price position bar — one selector');
  ok(/@media\(min-width:861px\)\{\.cd-imgcell \.cview\{align-items:flex-end;padding-bottom:0\}\}/.test(page),
     'side by side, the card picture sits at the foot of its frame, so it ends on the filter box line (measured live: 1100 px 745 / 746, 1366 px 732 / 733 — the frame border, 1 px)');
}
// TASK-ui T3: the links area directly under the grid, full width, nothing between.
ok(/<\/div><!-- \/\.cdgrid -->\s*<!-- 2\. the links area[\s\S]*?-->\s*<div class="lbox price-only">/.test(page),
   'the listings panel follows the grid directly, at the grid\'s width');
ok(['id="ltab-bin"', 'id="ltab-auction"', 'id="cd-listings"'].every(s => page.slice(page.indexOf('<div class="lbox price-only">')).indexOf(s) > 0
   && page.indexOf(s) > page.indexOf('<div class="lbox price-only">')), 'its tabs and the listings host moved with it, ids unchanged');
ok(!/id="cd-meta"/.test(page) && !/function renderCardInfo/.test(page), 'T2: the details box and its writer are gone, not left dormant');
for (const id of ['cd-img', 'cd-mkt', 'cd-sold', 'cd-trend-bar', 'cd-52low', 'cd-52high',
                  'cd-sub', 'cd-chart', 'cd-chart-src', 'cd-grade-lbl'])
  ok(page.includes('id="' + id + '"'), 'element id unchanged: ' + id);

// T4 (2026-09-28): 390px phones. Measured in a 390px iframe: all nine
// screens 0px of sideways scroll after these rules (home was +354, Pokémon
// and Sets +19, Search +4, portfolio clipped its last two columns). The
// browser measurement is the real check; these keep the rules from going.
const phone = (page.match(/\/\* T4 \(2026-09-28\)[\s\S]*?@media\(max-width:640px\)\{[\s\S]*?\n\}/) || [''])[0];
ok(/\.hero-stats\{flex-wrap:wrap/.test(phone), 'phone: hero stats wrap');
ok(/\.gg\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(phone), 'phone: the game grid is two minmax(0,1fr) columns');
ok(/\.ltabs\{flex-wrap:wrap\}/.test(phone), 'phone: language tabs wrap');
ok(/\.ptable \.pth,\.ptable \.ptr\{grid-template-columns:minmax\(0,1\.7fr\)/.test(phone),
   'phone: the portfolio grid rule is .ptable-scoped (unscoped, the later .pth rule won)');
ok(!/class="sgg"/.test(page), 'the search page has no game picker (T6, 2026-10-08)');
// TASK-account-and-bars T6c (2026-10-10): measured on en-swsh7-215 signed in, 1366 px 1629 -> 1563, 390 px 2644 -> 2553.
ok(/\.cd-view-boxes \.pboxes\{flex:0 0 auto\}/.test(page) && /\.cd-view-boxes \.pbox\{[^}]*align-items:center;text-align:center;padding:10px 14px\}/.test(page),
   'card page: the boxes hold their content (no stretching to the image), centred');
ok(/\.cd-view-boxes \.pbv\{font-size:21px/.test(page) && /\.cd-view-boxes \.pbs\{font-size:11\.5px/.test(page) && /\.pbv\{font-size:26px/.test(page),
   '...the figure a little larger than the detail, card page only (portfolio and alerts boxes keep 26 px)');
ok(/\.cdgrid\{--cd-gap:16px;display:grid;grid-template-columns:minmax\(220px,280px\) 1fr;/.test(page) && /\.cd-imgcell \.cview img\{max-height:360px\}/.test(page),
   'card page: the image is smaller (280 px column, 360 px cap)');
ok(/\.cd-view-chart \.cwrap\{flex:1;min-height:110px\}/.test(page) && /\.cd-view-chart \.cwrap canvas\{position:absolute;inset:0\}/.test(page),
   '...and the hidden history view no longer holds the area open with its 150 px canvas');
ok(!/id="cd-low"/.test(page), 'no lowest-listing box in our price row — eBay\'s figure heads the eBay section (§8.1(b)(2), 70b2058)');

console.log(`\ncdlayout.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
