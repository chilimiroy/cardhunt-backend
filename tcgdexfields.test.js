// tcgdexfields.test.js — fields kept from the TCGdex card the nightly already
// fetches (TASK-tcgdex-fields, 2026-10-09).
//
// T2, the regulation mark: stored, same pattern as the artist. T1, the dex
// number: stored as an ARRAY, every number kept (Roy, 2026-10-09) — a TAG TEAM
// card depicts two Pokémon ([25, 644] for Pikachu & Zekrom GX) and keeping the
// first would be a lie about the card. T3: a proposal only. This pins all three.
//
//   node tcgdexfields.test.js
'use strict';
require('./testcount')(19);
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  tcgdexfields.test.js\n');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8').replace(/\r/g, '');
const I = rd('ingest.js'), S = rd('server.js'), H = rd('cardhunt_preview.html');
const M = rd('migration-regulation-mark.sql').replace(/--.*$/gm, '');
const fnOf = name => { const i = I.indexOf('function ' + name + '('); return i < 0 ? '' : I.slice(i, I.indexOf('\n}\n', i)); };
const READERS = S + H + rd('cardmatch.js') + rd('printsql.js') + rd('stampcheck.js');

console.log('  T2 — the regulation mark, stored');
ok('the migration adds regulation_mark and regulation_mark_checked_at', /ADD COLUMN IF NOT EXISTS regulation_mark text;/.test(M) && /ADD COLUMN IF NOT EXISTS regulation_mark_checked_at timestamptz;/.test(M));
ok('nothing but the migration creates them', !/ADD COLUMN[^;]*regulation_mark/.test(I + S));
const tp = fnOf('tcgdexPriceFor'), wr = fnOf('writeRegulationMark');
ok('the nightly\'s TCGdex call stores it from the response it already has (one fetch)', /await writeRegulationMark\(card, d\.regulationMark\);/.test(tp) && (tp.match(/fetch\(/g) || []).length === 1);
ok('…before any early return on the price', tp.indexOf('await writeRegulationMark(') < tp.indexOf("none: 'no-tcgplayer'"));
ok('a response without a mark never erases a stored one (COALESCE)', /regulation_mark = COALESCE\(\$2, regulation_mark\)/.test(wr));
ok('"none known" and "never asked" stay apart (checked_at set on every ask)', /regulation_mark_checked_at = NOW\(\)/.test(wr));
ok('only a letter is stored (no stray text in the column)', /\/\^\[A-Z\]\{1,2\}\$\//.test(wr));
ok('no column yet: it says so once and writes nothing', /run migration-regulation-mark\.sql/.test(wr));
ok('storage only: no gate, estimator, headline or page reads it', !/regulation_?[mM]ark/.test(READERS));

console.log('\n  T1 — the dex number, every number kept');
const MD = rd('migration-dex-ids.sql').replace(/--.*$/gm, '');
ok('the migration adds dex_ids integer[] and dex_ids_checked_at', /ADD COLUMN IF NOT EXISTS dex_ids integer\[\];/.test(MD) && /ADD COLUMN IF NOT EXISTS dex_ids_checked_at timestamptz;/.test(MD));
ok('nothing but the migration creates them', !/ADD COLUMN[^;]*dex_ids/.test(I + S));
ok('the nightly\'s TCGdex call stores it from the response it already has, before any early return',
   /await writeDexIds\(card, d\.dexId\);/.test(tp) && tp.indexOf('await writeDexIds(') < tp.indexOf("none: 'no-tcgplayer'") && (tp.match(/fetch\(/g) || []).length === 1);

// Run the writer itself against a recording db — what would observably differ
// if it silently did nothing: the statement sent and the array it carries.
const runDex = async (dexId, hasCol = true) => {
  const sent = [], logs = [];
  const fdb = { query: async (q, p) => { if (/information_schema/.test(q)) return { rows: hasCol ? [1] : [] }; sent.push({ q, p }); return { rows: [] }; } };
  const f = new Function('db', 'console', 'let _dexCol = null, _dexWarned = false;\nasync ' + fnOf('writeDexIds') + '\n}\nreturn writeDexIds;')(fdb, { log: s => logs.push(s) });
  await f({ api_card_id: 'en-x-1' }, dexId);
  if (!hasCol) await f({ api_card_id: 'en-x-2' }, dexId);
  return { sent, logs };
};

(async () => {
  let r = await runDex([25, 644]);
  ok('a TAG TEAM card keeps BOTH numbers, in TCGdex\'s order', r.sent.length === 1 && JSON.stringify(r.sent[0].p[1]) === '[25,644]', JSON.stringify(r.sent.map(s => s.p)));
  r = await runDex(undefined);
  ok('no numbers -> an empty array, "none known", with checked_at set', r.sent.length === 1 && JSON.stringify(r.sent[0].p[1]) === '[]' && /dex_ids_checked_at = NOW\(\)/.test(r.sent[0].q));
  ok('an empty answer never erases stored numbers (CASE ... ELSE COALESCE(dex_ids, \'{}\'))',
     r.sent.length === 1 && /CASE WHEN cardinality\(\$2::int\[\]\) > 0 THEN \$2::int\[\] ELSE COALESCE\(dex_ids, '\{\}'\) END/.test(r.sent[0].q));
  r = await runDex([25, 'Pikachu']);
  ok('an array holding anything but a dex number is refused whole, nothing written', r.sent.length === 0 && /not stored/.test(r.logs.join(' ')));
  r = await runDex([25], false);
  ok('no column yet: it says so once and writes nothing', r.sent.length === 0 && r.logs.filter(l => /run migration-dex-ids\.sql/.test(l)).length === 1);
  ok('storage only: no gate, estimator, headline or page reads it', !/\bdex_ids\b|\bdexId\b/.test(READERS));

  console.log('\n  T3 — proposal only');
  ok('no card-detail column is added (hp, types, stage, attacks, ...)', !/ADD COLUMN[^;]*\b(hp|types|stage|evolve_from|abilities|attacks|weaknesses|resistances|retreat|legal|description)\b/i.test(
    fs.readdirSync(__dirname).filter(f => /^migration-.*\.sql$/.test(f)).map(rd).join('\n')));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
