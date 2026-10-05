// movers.test.js — Biggest movers on TCGdex prices only (TASK T2, 2026-10-05).
//
// 59 of the top 60 seven-day movers on 2026-10-04 were a METHOD change: the
// internal-search label tcgplayer_market was written by two different paths
// either side of 09-29 (Oranguru $20.72 -> $79.99 = its Staff prerelease).
// Roy's decisions: TCGdex-sourced prices only, flagged prices left out at
// either end, four lists (gainers / fallers by % and by value), the window
// stated on each, and a thin list SAYS it is not the whole market.
//
//   node movers.test.js          offline
//   node movers.test.js --db     + the real query: no ranked row from another source
'use strict';
const fs = require('fs');
const tr = require('./trending.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
console.log('\n  movers.test.js\n');

const p = tr.parseParams({ sort: 'gain-pct', window: '7d', lang: 'en' });
const sql = tr.moverSql(p).text;
if (!tr.TCGDEX_PATH) tr.TCGDEX_PATH = '0000no TCGdex path';
const cur = sql.slice(sql.indexOf('cur AS'), sql.indexOf('prev AS')), prev = sql.slice(sql.indexOf('prev AS'), sql.indexOf('SELECT c.api_card_id') > 0 ? sql.indexOf('SELECT c.api_card_id') : sql.length);
ok(/tcgdex!_tcgplayer!_%' ESCAPE '!'/.test(tr.TCGDEX_PATH), 'the TCGdex path is tcgdex_tcgplayer_* — Cardmarket (a second reading) is not in it');
ok(cur.includes(tr.TCGDEX_PATH), 'the current price is a TCGdex price');
ok(prev.includes(tr.TCGDEX_PATH), 'the earlier price is a TCGdex price');
ok(/cur\.source = ph\.source/.test(sql), 'both ends share the source (the printing key is in it)');
ok(/productId/.test(prev), 'both ends share the TCGplayer product where both rows name one');
ok(/visibleSql|set_series/.test(cur), 'digital-only cards are left out of the current set');

const rows = [
  { id: 'a', price: 20, prev_price: 10 },   // +100%
  { id: 'b', price: 15, prev_price: 10 },   // +50%
  { id: 'c', price: 90, prev_price: 18 },   // +400%, unsettled
  { id: 'd', price: 5, prev_price: 10 },    // -50%
];
const q = new Map([['c', { flags: ['unsettled'] }], ['a', { flags: [] }]]);
const g = tr.rankMovers(rows, 'gain-pct', q);
ok(g.cards.map(c => c.id).join() === 'a,b', 'a marked price (unsettled) is left out, not ranked: ' + g.cards.map(c => c.id).join());
ok(g.excluded.flagged === 1, 'and counted as excluded');
ok(tr.rankMovers(rows, 'fall-pct', q).cards.map(c => c.id).join() === 'd', 'fallers rank the falls');
ok(tr.rankMovers(rows, 'gain-usd', q).cards[0].id === 'a', 'by value ranks the dollar change');
ok(tr.rankMovers(rows, 'gain-pct').cards.length === 3, 'without a quality map nothing is left out (the old behaviour, still available)');
ok(['gain-pct', 'fall-pct', 'gain-usd', 'fall-usd'].every(s => tr.SORTS[s] && tr.SORTS[s].kind === 'move'), 'the four lists exist');

const cov = (pp, e, c) => (typeof tr.coverage === 'function' ? tr.coverage(pp, e, c) : { thin: false, note: undefined });
const thin7 = cov(tr.parseParams({ window: '7d', sort: 'gain-pct' }), 0, 2500);
ok(thin7.thin && /late September/.test(thin7.note) && /not the whole market/.test(thin7.note), '7 days, no pairs: thin, and says why');
const thin1 = cov(tr.parseParams({ window: '24h', sort: 'gain-pct' }), 250, 2500);
ok(thin1.thin && /re-priced every 3 to 30 days/.test(thin1.note), '24 hours: thin for its own reason (tiers), stated');
ok(cov(tr.parseParams({ window: '7d', sort: 'gain-pct' }), 2000, 2500).note === null, 'a full list carries no note');
ok(/TCGdex/.test(tr.describeRule(p)) && /old, thin or unsettled/.test(tr.describeRule(p)), 'the rule printed on the page says TCGdex and what is left out');

console.log('\n  wiring');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8');
const route = src.slice(src.indexOf("app.get('/api/trending'"), src.indexOf('// ── SEARCH'));
ok(/pricequality\.annotate\(db, r\.rows/.test(route) && /trending\.rankMovers\(r\.rows, p\.sort, q\)/.test(route), '/api/trending hands the quality marks to rankMovers');
ok(/coverage: trending\.coverage\(p, eligible, current\)/.test(route) && /trending\.currentSql\(p\)/.test(route), 'and reports coverage against the cards priced now');
const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
const home = page.slice(page.indexOf('async function loadHome()'), page.indexOf('async function loadSearchTrending'));
ok(/loadHomeMovers\(\)/.test(home) && !/notYet\('gainers'|\/api\/movers/.test(page), 'the home tiles call /api/trending — no "needs /api/movers" left');
const mv = page.slice(page.indexOf('async function moverList'), page.indexOf('// ── LATEST SEARCHES'));
ok(/'gain-pct', 'fall-pct', 'gain-usd', 'fall-usd'/.test(page) && /\/api\/trending\?lang=/.test(mv), 'four lists, each from /api/trending');
ok(/windowLabel/.test(mv) && ['gain-pct', 'fall-pct', 'gain-usd', 'fall-usd'].every(s => page.includes('id="mv-' + s + '-w"')), 'each list states its window');
ok(/so the lists show 24 hours/.test(mv), 'a fall back from 7 days to 24 hours announces itself');
ok(/coverage\.note/.test(mv) && page.includes('id="movers-note"'), 'a thin list says it is not the whole market');

if (process.argv.includes('--db')) {
  (async () => {
    const { Pool } = require('pg');
    const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    for (const w of ['24h', '7d']) {
      const r = await db.query(tr.moverSql(tr.parseParams({ sort: 'gain-pct', window: w })));
      ok(r.rows.every(x => /^tcgdex_tcgplayer_/.test(x.price_source)), w + ': every pair is TCGdex at the current end (' + r.rows.length + ' pairs)');
    }
    const n = (await db.query(tr.currentSql(tr.parseParams({})))).rows[0].n;
    ok(n > 0, 'cards with a current TCGdex price: ' + n);
    await db.end();
    console.log(`\n  ${pass} passed, ${fail} failed\n`); process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('  FAIL  --db: ' + e.message); process.exit(1); });
} else { console.log(`\n  ${pass} passed, ${fail} failed\n`); process.exit(fail ? 1 : 0); }
