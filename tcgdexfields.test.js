// tcgdexfields.test.js — fields kept from the TCGdex card the nightly already
// fetches (TASK-tcgdex-fields, 2026-10-09).
//
// T2, the regulation mark: stored, same pattern as the artist. T1, the dex
// number: NOT stored — TCGdex returns an ARRAY, several numbers for a TAG TEAM
// card ([25, 644] for Pikachu & Zekrom GX), and the task says to stop there
// rather than keep the first. T3: a proposal only. This pins all three.
//
//   node tcgdexfields.test.js
'use strict';
require('./testcount')(11);
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  tcgdexfields.test.js\n');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8').replace(/\r/g, '');
const I = rd('ingest.js'), S = rd('server.js'), H = rd('cardhunt_preview.html');
const M = rd('migration-regulation-mark.sql').replace(/--.*$/gm, '');
const fnOf = name => { const i = I.indexOf('function ' + name + '('); return i < 0 ? '' : I.slice(i, I.indexOf('\n}\n', i)); };

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
ok('storage only: no gate, estimator, headline or page reads it', !/regulation_?[mM]ark/.test(S + H + rd('cardmatch.js') + rd('estimator.js') + rd('printsql.js') + rd('stampcheck.js')));

console.log('\n  T1 — the dex number, stopped');
ok('no code path writes a dex number (TCGdex gives an array, several for TAG TEAM — Roy decides the storage)', !/dex_?id|dexId|dex_number/i.test(I.replace(/\/\/[^\n]*/g, '')) && !fs.existsSync(__dirname + '/migration-dex.sql'));

console.log('\n  T3 — proposal only');
ok('no card-detail column is added (hp, types, stage, attacks, ...)', !/ADD COLUMN[^;]*\b(hp|types|stage|evolve_from|abilities|attacks|weaknesses|resistances|retreat|legal|description)\b/i.test(
  fs.readdirSync(__dirname).filter(f => /^migration-.*\.sql$/.test(f)).map(rd).join('\n')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
