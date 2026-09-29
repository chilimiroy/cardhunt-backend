// digital.test.js — Pokémon TCG Pocket is hidden at the read layer, everywhere
//
//   node digital.test.js
//
// 1. isDigitalSeries: what it hides AND what it keeps. "Pocket" alone is not
//    evidence — ポケットモンスター is Pocket Monsters, the 1996 physical game.
// 2. STRUCTURE: every `FROM cards` / `JOIN cards` in the three modules that
//    serve reads either carries digital.visibleSql() or a
//    /* digital:unfiltered - why */ marker. A comment saying "remember to
//    filter" is not a thing that fails; this is.
// 3. DATABASE (when DATABASE_URL is set): the filter hides exactly the Pocket
//    series — 15 sets, 2,480 cards measured 2026-09-27 — and nothing else,
//    and TCGdex's own `tcgp` series names the same set ids.
'use strict';
const fs = require('fs');
const digital = require('./digital');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

// ── 1. the predicate, both directions ──
const HIDE = ['Pokémon TCG Pocket', 'pokémon tcg pocket', ' Pokémon TCG Pocket ', 'tcgp', 'TCGP',
              { id: 'tcgp', name: 'Pokémon TCG Pocket' }, { id: 'tcgp' }, { name: 'Pokémon TCG Pocket' },
              'Pokémon TCG Pocket'];   // decomposed é — NFC must fold it
HIDE.forEach(s => ok(digital.isDigitalSeries(s) === true, 'should hide ' + JSON.stringify(s)));

const KEEP = ['Scarlet & Violet', 'Base', 'Mega Evolution', 'Trainer kits', 'PCG', 'POP', 'web',
              'ポケットモンスターカードゲーム', 'Pocket Monsters', 'Pokémon TCG', 'Pocket',
              'Miscellaneous', '', null, undefined, { id: 'sv', name: 'Scarlet & Violet' }, {}];
KEEP.forEach(s => ok(digital.isDigitalSeries(s) === false, 'should keep ' + JSON.stringify(s)));

const sql = digital.visibleSql('c');
ok(/c\.set_series IS NULL OR c\.set_series NOT IN \('Pokémon TCG Pocket'\)/.test(sql),
   'visibleSql renders the series filter: ' + sql);
ok(!/\$\d/.test(sql), 'visibleSql carries no $n placeholder (would renumber the host query)');
ok(/^\(set_series IS NULL/.test(digital.visibleSql()), 'visibleSql() without alias');
ok(/set_series IS NULL/.test(sql), 'a NULL series stays visible (absent data is not evidence)');

// ── 2. structure ──
// The SQL literal around each match: back to the call that owns it, forward
// to where the literal closes. `')}` inside ${digital.visibleSql('c')} is
// deliberately not a terminator.
function literalAround(src, i) {
  const back = Math.max(src.lastIndexOf('query(', i), src.lastIndexOf('text:', i));
  const ends = ['`,', '`)', '`;', "');", "',\n", "')\n"]
    .map(t => src.indexOf(t, i)).filter(x => x >= 0);
  const end = ends.length ? Math.min(...ends) : src.length;
  return src.slice(back < 0 ? i : back, end);
}
function unfilteredReads(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /\b(FROM|JOIN)\s+cards\b/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    const pre = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
    if (/^\s*(\/\/|\*)/.test(pre)) continue;                  // prose in a comment
    const lit = literalAround(src, m.index);
    if (!/visibleSql\(/.test(lit) && !/digital:unfiltered/.test(lit)) out.push(file + ':' + line);
  }
  return { out, src };
}
let reads = 0;
for (const f of ['server.js', 'cardparse.js', 'trending.js']) {
  const { out, src } = unfilteredReads(f);
  reads += (src.match(/\b(FROM|JOIN)\s+cards\b/g) || []).length;
  ok(out.length === 0, 'unfiltered read of cards with no stated reason: ' + out.join(', '));
  ok(/require\('\.\/digital'\)/.test(src), f + ' requires ./digital');
}
ok(reads >= 14, `scanned ${reads} reads of cards — fewer than 14 means the scanner went blind`);

// The scanner must be able to FAIL. Strip the filter from a copy and look.
(function selfTest() {
  const src = fs.readFileSync('trending.js', 'utf8').replace(/\$\{digital\.visibleSql\('c'\)\}/g, 'TRUE');
  const tmp = require('path').join(require('os').tmpdir(), 'digital-selftest-trending.js');
  fs.writeFileSync(tmp, src);
  const { out } = unfilteredReads(tmp);
  fs.unlinkSync(tmp);
  // Every card join in trending.js — 4 since the base-printing rule joined
  // cards inside each CTE (T2). Counted, not hard-coded, so a new read
  // cannot shrink the self-test silently.
  const all = (src.match(/\b(FROM|JOIN)\s+cards\b/g) || []).length;
  ok(all >= 2 && out.length === all, 'scanner catches every trending read once the filter is removed (got ' + out.length + ' of ' + all + ')');
})();

// The server READS the catalogue; ingest writes it, under our ids. The one
// writer server.js had (/api/cards INSERTing pokemontcg.io's card under
// pokemontcg.io's id) produced both stray rows, me2pt5-294 and me55c-33.
{
  const s = fs.readFileSync('server.js', 'utf8');
  const writes = s.match(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+cards\b/gi) || [];
  ok(writes.length === 0, 'server.js writes to `cards`: ' + writes.join(', '));
}

// Hidden must be an ANSWER where "not found" leads to a fallback that would
// fetch the card elsewhere and show it anyway.
const server = fs.readFileSync('server.js', 'utf8');
ok(/hidden:\s*\{\s*setId,\s*reason:\s*digital\.REASON/.test(server), 'set endpoint answers hidden from the DB');
ok(/isDigitalSeries\(probe\.data\.serie\)/.test(server), 'set endpoint asks TCGdex serie before its fallback');
ok(/series\/\$\{sid\}/.test(server), 'set-list TCGdex fallback removes the series\' sets');
ok((server.match(/await hiddenReason\(/g) || []).length >= 3, 'cards, price and listings report hidden rather than falling through');
const page = fs.readFileSync('cardhunt_preview.html', 'utf8');
ok(/if \(bd\.hidden\)/.test(page), 'the set page stops on hidden instead of trying TCGdex-direct');

// ── 3. database ──
(async () => {
  if (!process.env.DATABASE_URL) {
    console.log('  (DATABASE_URL not set — database section skipped)');
    return done();
  }
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const r = await db.query(`
      SELECT set_api_id, MAX(set_series) AS series, COUNT(*)::int AS n,
             MIN(substring(api_card_id from '^(en|ja|zh-tw|zh-cn)-')) AS lang
      FROM cards WHERE NOT ${digital.visibleSql()} GROUP BY 1 ORDER BY 1`);
    const cards = r.rows.reduce((a, x) => a + x.n, 0);
    console.log(`  hidden: ${r.rows.length} sets, ${cards} cards — ${r.rows.map(x => x.set_api_id).join(' ')}`);
    ok(r.rows.length === 15, 'hidden set count is 15 (got ' + r.rows.length + ')');
    ok(Math.abs(cards - 2480) <= 50, 'hidden card count near the known 2,480 (got ' + cards + ')');
    ok(r.rows.every(x => digital.isDigitalSeries(x.series)), 'every hidden row is Pocket by series');
    // Nothing physical is hidden: the visible set count plus hidden equals all.
    const all = await db.query(`SELECT COUNT(DISTINCT set_api_id)::int AS n FROM cards`);
    const vis = await db.query(`SELECT COUNT(DISTINCT set_api_id)::int AS n FROM cards WHERE ${digital.visibleSql()}`);
    ok(vis.rows[0].n + r.rows.length === all.rows[0].n, 'visible + hidden = all sets (no set half-hidden)');
    // The source's own word: TCGdex's `tcgp` series names the same ids.
    try {
      const t = await (await fetch('https://api.tcgdex.net/v2/en/series/tcgp')).json();
      const td = new Set((t.sets || []).map(s => s.id));
      const ours = new Set(r.rows.map(x => x.set_api_id));
      ok([...td].every(x => ours.has(x)) && [...ours].every(x => td.has(x)),
         'TCGdex tcgp series and our hidden sets are the same ids');
    } catch (e) { console.log('  (TCGdex unreachable — series cross-check skipped: ' + e.message + ')'); }
  } finally { await db.end(); }
  done();
})().catch(e => { console.log('  ERROR ' + e.message); fail++; done(); });

function done() {
  console.log(`\ndigital.test.js — ${pass} passed, ${fail} failed`);
  // exitCode, not exit(): exiting while fetch's sockets close trips a libuv
  // assertion on Windows and reports 127 over a green run.
  process.exitCode = fail ? 1 : 0;
}
