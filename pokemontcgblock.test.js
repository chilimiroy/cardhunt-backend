require('./testcount')(17);   // assertions in a plain run — fewer fails the file (testcount.js)
// pokemontcgblock.test.js — ONE reader of pokemontcg.io's price blocks (Roy, 2026-10-10).
//
// Our stored copy (cards.tcgplayer_data / cardmarket_data, 12,697 dated
// 2026-07-27) was quoted as pokemontcg.io's current answer, read with the MID
// listing as a market price, and turned into a low-high midpoint no source
// produced. What would be different if this guard did nothing: some file
// would read a block itself. So every tracked file is scanned for one.
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const B = require('./pokemontcgblock');
let pass = 0, fail = 0;
const ok = (c, label, d) => { if (c) { pass++; console.log('  ok    ' + label); } else { fail++; console.log('  FAIL  ' + label + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } };
const NOW = Date.parse('2026-10-10T12:00:00Z');
const F = (tp, cm, o) => B.figureOf(tp, cm, Object.assign({ now: NOW }, o));

console.log('\n  the one figure a block supports');
// Charizard ☆ δ, our July copy and pokemontcg.io live (2026-10-09).
const julyCopy = { updatedAt: '2026/07/27', prices: { holofoil: { low: 20000, mid: 29750, high: 39500, market: 4000 } } };
const live = { updatedAt: '2026/10/09', prices: { holofoil: { low: 18500, mid: 27500, high: 39500, market: null } } };
const a = F(julyCopy, null);
ok(a.price === 4000 && a.basis === 'market' && a.copy === true && a.date === '2026-07-27' && a.ageDays === 75 && a.marked
   && /our stored copy of pokemontcg\.io's figure, dated 2026-07-27 \(75 days ago\)/.test(a.text) && /over 45/.test(a.text),
   'our July copy: its market price, said to be OUR COPY, dated, 75 days old, marked', a);
const b = F(live, null, { copy: false });
ok(b.price === 18500 && b.basis === 'ask' && b.what === 'cheapest listing' && b.source === 'tcgplayer_holofoil_low' && b.copy === false && b.marked
   && /fetched now/.test(b.text) && /cheapest listing, not a sale/.test(b.text),
   'listings but no market price: the cheapest listing, an ASK, marked — never the $27,500 mid', b);
ok(F({ updatedAt: '2026/10/09', prices: { holofoil: { mid: 27500, high: 39500 } } }, null) === null,
   'a mid (or a high) alone is no price — the middle ask is not a market price');
ok(F({ updatedAt: '2026/10/09', prices: { holofoil: { high: 30, low: 10 } } }, null).price === 10,
   'low and high: the low, as an ask — never their midpoint (20), a number no source produced');
ok(F({ updatedAt: '2026/10/01', prices: { reverseHolofoil: { market: 9 } } }, null) === null,
   'a reverse printing is never the card\'s base figure (T10)');
// Charizard ☆ δ live (2026-10-09): TCGplayer no market, listings from $18,500; Cardmarket's block of 2026-01-16.
const cz = F(live, { updatedAt: '2026/01/16', prices: { averageSellPrice: 1653.33, trendPrice: 838.41 } }, { copy: false });
ok(cz.basis === 'ask' && cz.price === 18500 && cz.market === 'TCGplayer (US)',
   'TCGplayer\'s own answer first, ask or not: Charizard ☆ δ is its $18,500 floor, not Cardmarket\'s January $1,653.33', cz);
const eu = F({ updatedAt: '2026/10/01', prices: { holofoil: { mid: 50 } } }, { updatedAt: '2026/10/01', prices: { averageSellPrice: 30, trendPrice: 28 } });
ok(eu.basis === 'market' && eu.price === 30 && eu.market === 'Cardmarket (EU)' && /European retail figure/.test(eu.text),
   'no TCGplayer figure at all (a mid is none): Cardmarket\'s average sell, said to be European');
const fresh = F({ updatedAt: '2026/10/05', prices: { normal: { market: 2.5, mid: 3 } } }, null);
ok(fresh.price === 2.5 && !fresh.marked && fresh.ageDays === 5, 'KEEP: a 5-day-old market price is not marked');
ok(F({ prices: { normal: { market: 2 } } }, null).marked && /its date was not given/.test(F({ prices: { normal: { market: 2 } } }, null).text),
   'an undated block is marked: its age cannot be known');
ok(B.storedFigure({ tcgplayer_data: julyCopy }).copy === true && B.liveFigure({ tcgplayer: live }).copy === false,
   'storedFigure reads our row (copy), liveFigure a card fetched now');

console.log('\n  nothing else reads a block');
const files = execSync('git ls-files "*.js" "*.html"', { cwd: __dirname }).toString().split(/\r?\n/)
  .filter(f => f && !/\.test\.js$/.test(f) && f !== 'pokemontcgblock.js');
// The columns may be NAMED only to select or write them whole — never read.
const ALLOWED = ['c.tcgplayer_data, c.cardmarket_data', 'tcgplayer_data,cardmarket_data',
                 'tcgplayer_data=EXCLUDED.tcgplayer_data', 'cardmarket_data=EXCLUDED.cardmarket_data'];
const colHits = [], blockHits = [];
for (const f of files) {
  let src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  for (const a of ALLOWED) src = src.split(a).join('');
  // comment lines may name them
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');
  if (/tcgplayer_data|cardmarket_data/.test(code)) colHits.push(f);
  if (/\b(tcgplayer|cardmarket)\s*(\.|&&\s*\w+\.)\s*(tcgplayer\.|cardmarket\.)?prices\b|\.prices\s*\.\s*(holofoil|normal|averageSellPrice|trendPrice|avg7)\b/.test(code)) blockHits.push(f);
}
ok(colHits.length === 0, 'the stored columns are only selected or written whole, then read by pokemontcgblock.js', colHits);
ok(blockHits.length === 0, 'no file reads a block\'s prices itself (server, ingest, collisionscan, the page)', blockHits);
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');
const gb = H.slice(H.indexOf('function getBase(c, out) {'), H.indexOf('\n}\n', H.indexOf('function getBase(c, out) {')));
const gbCode = gb.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
ok(/var f = c\._stored;/.test(gbCode) && !/midpoint|\.mid\b|\.high\b|\.prices\b/.test(gbCode), 'the page draws the server\'s figure: no mid, no midpoint');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok((S.match(/_stored: ptblock\.storedFigure\(/g) || []).length === 2 && /stored: ptblock\.storedFigure\(c\)/.test(S),
   'the set and card payloads and /api/price send the stored copy only as its figure');
ok(!/tcgplayer: r\.tcgplayer_data|cardmarket: c\.cardmarket_data|tcgplayer_prices:/.test(S), '...and never the raw block');
ok(!/new Date\(\)\.toISOString\(\),?\s*$/m.test(S.slice(S.indexOf("app.get('/api/price/:cardId'"), S.indexOf('// EBAY BROWSE API'))),
   '/api/price never dates a pokemontcg.io figure "now" when the source gave no date');
const C = fs.readFileSync(__dirname + '/collisionscan.js', 'utf8');
ok(/require\('\.\/pokemontcgblock'\)\.storedFigure\(row\)/.test(C) && /f && f\.basis === 'market'/.test(C),
   'collisionscan\'s yardstick is the reader\'s figure, a market price only (an ask judges no sale)');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
