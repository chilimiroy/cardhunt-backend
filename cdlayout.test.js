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
ok(/grid-template-areas:"img top" "img chart" "info chart"/.test(grid),
   'wide: the graph spans under the price cell, not a shared second row');
ok(/gap:var\(--cd-gap\)/.test(grid), 'the grid row gap is the column token');
ok(/\.cdtop-r\{[^}]*display:flex;flex-direction:column;gap:var\(--cd-gap\)/.test(page),
   'prices -> bar spacing is the same token');
ok(/\.cdgrid > \[class\], \.cdtop-r > \[class\], \.cdgrid \.cview\{margin:0\}/.test(page),
   'no cell carries its own margin inside the grid (specificity beats later .chart-box)');
ok(!/\.cdtop-r \.pboxes\{[^}]*margin-bottom:14px/.test(page), 'the old 14px pboxes margin is gone');
const narrow = (page.match(/@media\(max-width:860px\)\{\s*\.cdgrid\{[^}]+\}/) || [''])[0];
ok(/grid-template-areas:"img" "top" "chart" "info"/.test(narrow),
   'narrow: prices, bar and graph stay together; info follows');
for (const id of ['cd-img', 'cd-mkt', 'cd-low', 'cd-sold', 'cd-trend-bar', 'cd-52low', 'cd-52high',
                  'cd-meta', 'cd-chart', 'cd-chart-src', 'cd-grade-lbl'])
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
