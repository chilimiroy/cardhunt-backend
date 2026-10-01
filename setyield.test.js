// setyield.test.js — a refresh that prices nothing for a whole set says so (TASK T2)
//   node setyield.test.js
// The 29 Sept set-name check stopped svp, xyp, bwp, mep, sve and mee
// refreshing for two days, and the run ended "N refreshed, M without data".
// Both directions: a silent set IS named, and a set that answered — even
// once, even with a refusal — is NOT. A report that names every set is as
// useless as one that names none.
'use strict';
const fs = require('fs');
const sy = require('./setyield');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

const card = (set, price) => ({ set_api_id: set, set_name: set.toUpperCase(), price });
function run(spec) {
  const t = sy.createTally();
  for (const [set, outcomes, held] of spec)
    outcomes.forEach((o, i) => t.add(card(set, held[i] || 0), o));
  return t.report();
}

console.log('\n  The svp case: every card had a price, every card came back empty');
{
  const r = run([['svp', ['missed', 'missed', 'missed', 'missed', 'missed'], [3.1, 2.2, 9, 1, 4]],
                 ['sv10', ['priced', 'priced', 'missed'], [1, 2, 3]]]);
  ok('svp is named as regressed', r.regressed.length === 1 && r.regressed[0].set === 'svp', JSON.stringify(r.regressed));
  ok('svp: 5 asked, 5 had a price', r.regressed[0] && r.regressed[0].asked === 5 && r.regressed[0].heldBefore === 5);
  ok('sv10 (2 of 3 priced) is NOT named', !r.regressed.concat(r.never).some(s => s.set === 'sv10'));
  ok('2 sets judged', r.judged === 2, r.judged);
}

console.log('\n  What it must leave alone');
{
  const r = run([['a', ['missed', 'missed', 'missed', 'priced'], [1, 1, 1, 1]]]);
  ok('one price in the set: not reported', !r.regressed.length && !r.never.length);
}
{
  const r = run([['b', ['missed', 'missed', 'kept', 'missed'], [1, 1, 1, 1]]]);
  ok('one REFUSED price (sourcerank kept the held one): the source answered, not reported',
     !r.regressed.length && !r.never.length);
}
{
  const r = run([['c', ['missed', 'missed'], [5, 5]]]);
  ok('2 cards due, both empty: below MIN_ASKED, not judged', !r.regressed.length && r.unjudged === 1);
  ok('MIN_ASKED is 3', sy.MIN_ASKED === 3);
}
{
  const r = run([]);
  ok('an empty run reports nothing and does not throw', !r.regressed.length && !r.never.length && r.judged === 0);
  ok('format of an empty report is no lines', sy.format(r, 'en').length === 0);
}

console.log('\n  Never priced vs regressed');
{
  const r = run([['zh1', ['missed', 'missed', 'missed'], [0, 0, 0]],
                 ['mix', ['missed', 'missed', 'missed'], [0, 0, 7]]]);
  ok('never-priced set is "never", not regressed', r.never.length === 1 && r.never[0].set === 'zh1');
  ok('one card in the set had a price: regressed', r.regressed.length === 1 && r.regressed[0].set === 'mix');
  const lines = sy.format(r, 'en').join('\n');
  ok('format names the regressed set under the loud heading', /SETS THAT PRICED NOTHING THIS RUN[\s\S]*mix/.test(lines));
  ok('format lists the never set separately', /never priced before either[\s\S]*zh1/.test(lines));
  ok('format says how to diagnose', /refresh en --set=/.test(lines));
}
{
  const r = run([['zh1', ['missed', 'missed', 'missed'], [0, 0, 0]]]);
  ok('only never-priced sets: no loud heading', !/SETS THAT PRICED NOTHING/.test(sy.format(r, 'zh-tw').join('\n')));
}

console.log('\n  A source that stops part-way (the 1 Oct ja run: 110 priced, then 1,500 nothing)');
{
  // Urgency order interleaves sets, so every set keeps an early answer.
  const t = sy.createTally();
  const sets = ['SV2a', 'SV8a', 'S12a', 'M5'];
  for (let i = 0; i < 1200; i++) t.add(card(sets[i % 4], 5), i % 11 === 0 ? 'priced' : 'missed');
  for (let i = 0; i < 1500; i++) t.add(card(sets[i % 4], 5), 'missed');
  const r = t.report();
  ok('no SET is empty — the per-set report alone would say nothing', !r.regressed.length && !r.never.length);
  ok('the streak is found: 1,500+ in a row', r.streak.length >= 1500, r.streak.length);
  ok('...and ran to the end of the run', r.streak.toEnd === true && r.streak.of === 2700);
  const lines = sy.format(r, 'ja').join('\n');
  ok('format names it loudly with positions', /CARDS IN A ROW GOT NOTHING \(ja\) — cards \d+-2700 of 2700, to the end of the run/.test(lines), lines.slice(0, 200));
}
{
  // What it must leave alone: scattered gaps, however many.
  const t = sy.createTally();
  for (let i = 0; i < 4000; i++) t.add(card('x' + (i % 40), 1), i % 3 === 0 ? 'priced' : 'missed');
  const r = t.report();
  ok('scattered misses (2 of 3, all night) are NOT a streak', r.streak.length < sy.STREAK_MIN && sy.format(r, 'en').length === 0, r.streak.length);
}
{
  const t = sy.createTally();
  for (let i = 0; i < sy.STREAK_MIN - 1; i++) t.add(card('a' + i, 1), 'missed');
  t.add(card('z', 1), 'priced');
  ok('STREAK_MIN - 1 in a row is not reported', !/IN A ROW/.test(sy.format(t.report(), 'en').join('\n')));
  ok('STREAK_MIN is 200', sy.STREAK_MIN === 200);
}

console.log('\n  Wired into the real refresh (ingest.js)');
if (!fs.existsSync(__dirname + '/ingest.js')) {
  console.log('  SKIP  ingest.js not in this checkout');
} else {
  const src = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
  const a = src.indexOf('async function refreshDue(');
  const b = src.indexOf('\nasync function ', a + 10);
  const body = a >= 0 ? src.slice(a, b > a ? b : undefined) : '';
  ok('refreshDue found, and the slice ends before the next function', body.length > 2000 && !/async function main\(/.test(body));
  ok('ingest requires ./setyield', /require\('\.\/setyield'\)/.test(src));
  ok('a tally per run', /setyield\.createTally\(\)/.test(body));
  // All three outcomes, each in the branch that produces it.
  ok('"kept" is tallied beside demoted++', /demoted\+\+;\s*tally\.add\(card, 'kept'\)/.test(body));
  ok('"priced" is tallied beside priced++', /priced\+\+;\s*tally\.add\(card, 'priced'\)/.test(body));
  ok('"missed" is tallied beside missed++', /missed\+\+;\s*tally\.add\(card, 'missed'\)/.test(body));
  ok('the report is printed', /setyield\.format\(yieldRep, lang\)/.test(body));
  ok('a regressed set OR a long streak makes the run exit non-zero',
     /if \(yieldRep\.regressed\.length \|\| longStreak\) \{\s*process\.exitCode = 2;/.test(body));
  ok('longStreak is judged against STREAK_MIN', /yieldRep\.streak\.length >= setyield\.STREAK_MIN/.test(body));
  ok('what Yahoo answered is printed with the report', /yahooSawSummary\(\)/.test(body));
  // Every silent refusal in the Yahoo fetch is now counted, not just skipped.
  const ys = (() => { const a = src.indexOf('async function yahooJapanSearch('); return src.slice(a, src.indexOf('\n}\n', a)); })();
  ok('Yahoo: a non-200 is counted', /if \(!r\.ok\) \{ yahooSaw\('HTTP ' \+ r\.status\); continue; \}/.test(ys));
  ok('Yahoo: a page without __NEXT_DATA__ is counted', /yahooSaw\('200, no __NEXT_DATA__'\)/.test(ys));
  ok('Yahoo: a payload with no listing block is counted', /yahooSaw\('200, no listing block'\)/.test(ys));
  ok('Yahoo: a thrown fetch is counted', /catch \(e\) \{ yahooSaw\('threw: /.test(ys));
  ok('Yahoo: a real answer is counted too (so refusals have a denominator)', /yahooSaw\('200, answered'\)/.test(ys));
  ok('and is appended to refresh-empty-sets.log', /refresh-empty-sets\.log/.test(body));
  // What is "due" must be judged on the headline price. A second reading
  // written while the TCGplayer match was blocked reset the clock: mep's 7
  // cards got no price and were "not due" the next run (2026-10-02).
  const lat = (body.match(/LEFT JOIN LATERAL \(([\s\S]*?)\) lp ON TRUE/) || [])[1] || '';
  ok('the due-clock reads the headline row: base printing, not a second reading',
     /basePrintingSql\('p', 'c'\)/.test(lat), lat.slice(0, 200));
  ok('the due-clock ignores grade aggregates (grade IS NULL)', /p\.grade IS NULL/.test(lat));
  // The wrapper must pass node's exit code to Task Scheduler: node is the LAST command.
  if (fs.existsSync(__dirname + '/refresh-daily.cmd')) {
    const cmd = fs.readFileSync(__dirname + '/refresh-daily.cmd', 'utf8').trim().split(/\r?\n/).filter(l => l.trim() && !/^\s*(REM|@echo)/i.test(l));
    ok('refresh-daily.cmd ends on the node line (its exit code is the task result)', /^node ingest\.js refresh/.test(cmd[cmd.length - 1]), cmd[cmd.length - 1]);
  }
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
