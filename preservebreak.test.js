// Prove preserve.test.js fires. For each checklist item, break exactly that
// one thing in the page, run the suite, and confirm it goes red on the
// EXPECTED assertion — then restore. A guard that has never fired is
// indistinguishable from one that cannot.
require('./testcount')(12);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const { execSync } = require('child_process');
const PAGE = 'C:/Users/chili/cardhunt/cardhunt_preview.html';
const original = fs.readFileSync(PAGE, 'utf8');

// [label, mutate(html) -> html, substring of the assertion that must fail]
const breaks = [
  ['served module loses its async attribute',
    h => h.replace('<script async src="https://cardhunt-backend.onrender.com/estimator.js">',
                   '<script src="https://cardhunt-backend.onrender.com/estimator.js">'),
    'estimator.js tag carries async'],

  ['served module src made root-relative (breaks file:// fallback)',
    h => h.replace('src="https://cardhunt-backend.onrender.com/gradeprice.js"',
                   'src="/gradeprice.js"'),
    'gradeprice.js src is ABSOLUTE'],

  ['English browsing reverted to /api/sets',
    h => h.replace("const live = await loadLangSets('en', i > 0);",
                   "const live = await apiFetch('/api/sets');"),
    "loadAllSets calls loadLangSets('en')"],

  ['the cold-start retry is removed',
    h => h.replace('const WAITS = [0, 3000, 6000, 12000, 20000];',
                   'const WAITS = [0];  /* no retry */'),
    'cold-start retry is still there'],

  ['a new pokemontcg image reference is introduced',
    h => h.replace('<body', '<img src="https://images.pokemontcg.io/base1/1.png"><body'),
    'images.pokemontcg.io references do not INCREASE'],

  // renderMarketData is gone (2026-09-29): the page no longer asks
  // /api/market for anything. The way that comes back is a fetch of it.
  ['a /api/market fetch comes back into the page',
    h => h.replace('function renderOtherSources(d) {',
                   "function fetchMarketPrice(card) { return fetch(BACKEND + '/api/market/' + card.name); }\n"
                   + 'function renderOtherSources(d) {'),
    'the page never fetches /api/market'],

  ['outlier rows are filtered away instead of greyed',
    h => h.replace('var flagged = rows.filter(function(l){ return l.suspect; });',
                   'var flagged = []; rows = rows.filter(function(l){ return !l.suspect; });'),
    'flagged rows are still RENDERED'],

  ['the headline stops saying it skipped flagged rows',
    h => h.replace('flagged below, not counted here', 'below'),
    'the headline skips flagged rows AND says so'],

  ['the UNFILTERED SEARCHES heading is dropped',
    h => h.replace("'UNFILTERED SEARCHES &mdash; '", "'MORE SEARCHES &mdash; '"),
    'deep links sit under an UNFILTERED SEARCHES heading'],

  ['the not-checked-by-us warning is dropped',
    h => h.replace('The results are not ', 'The results are '),
    'say the results are not checked by us'],

  // eBay's figure back in the price-box row, beside our data (§8.1(b)(2)).
  ['eBay\'s cheapest listing comes back into the price-box row',
    h => h.replace('<div class="pboxes">',
                   '<div class="pboxes"><div class="pbox"><div class="pbl">Cheapest trusted listing</div><div class="pbv" id="cd-low">—</div></div>'),
    'eBay\'s figure is not in the price-box row'],

  ['the shop-asking-price label is removed from the row',
    h => h.replace('shop asking price', 'price'),
    'shop asking prices are labelled ON THE ROW']
];

let good = 0, bad = 0;
for (const [label, mutate, expect] of breaks) {
  const broken = mutate(original);
  if (broken === original) {
    console.log('  SKIP  ' + label + '  — mutation anchor did not match, cannot test');
    bad++;
    continue;
  }
  fs.writeFileSync(PAGE, broken);
  let out = '';
  try {
    out = execSync('node preserve.test.js --offline', { cwd: 'C:/Users/chili/cardhunt' }).toString();
  } catch (e) {
    out = (e.stdout || '').toString();
  }
  fs.writeFileSync(PAGE, original);

  const failedLines = out.split('\n').filter(l => /^\s*FAIL/.test(l));
  const hit = failedLines.some(l => l.includes(expect));
  if (hit) {
    good++;
    console.log('  FIRED ' + label);
    console.log('          -> ' + failedLines.find(l => l.includes(expect)).trim().slice(0, 110));
    if (failedLines.length > 1) console.log('          (' + failedLines.length + ' assertions went red)');
  } else {
    bad++;
    console.log('  MISS  ' + label);
    console.log('          expected an assertion containing: ' + expect);
    console.log('          got: ' + (failedLines.length ? failedLines.map(l=>l.trim()).join(' | ').slice(0,200) : 'NOTHING FAILED'));
  }
}

// Paranoia: the file must be byte-identical to how it started.
const after = fs.readFileSync(PAGE, 'utf8');
console.log('\n  page restored byte-for-byte: ' + (after === original ? 'yes' : 'NO — RESTORE IT'));
console.log('  ' + good + ' guards fired, ' + bad + ' did not');
process.exit(bad ? 1 : 0);
