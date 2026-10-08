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
const box = page.slice(page.indexOf('id="cd-viewwrap"'), page.indexOf('id="cd-selector"'));
ok(box.indexOf('id="cd-sold"') > 0 && box.indexOf('id="cd-vtog"') > box.indexOf('id="cd-chart"'), 'the toggle sits beside the views, after Last sold');
ok(page.indexOf('id="cd-selector"') > page.indexOf('id="cd-vtog"') && page.indexOf('id="cd-selector"') < page.indexOf('<div class="lbox'),
   'the selector is below the toggle area, in the price column');
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
ok(/\.gg,\.sgg\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(phone), 'phone: both game grids are two minmax(0,1fr) columns');
ok(/\.ltabs\{flex-wrap:wrap\}/.test(phone), 'phone: language tabs wrap');
ok(/\.ptable \.pth,\.ptable \.ptr\{grid-template-columns:minmax\(0,1\.7fr\)/.test(phone),
   'phone: the portfolio grid rule is .ptable-scoped (unscoped, the later .pth rule won)');
ok(/class="sgg"/.test(page), 'the search game picker carries .sgg');

console.log(`\ncdlayout.test.js — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
