// refreshrun.test.js — an incomplete nightly refresh fails and names what it missed
// (Roy, 2026-10-08). See refreshrun.js.
//
//   node refreshrun.test.js
'use strict';
require('./testcount')(26);
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const rr = require('./refreshrun');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  refreshrun.test.js\n');
const tmp = p => path.join(os.tmpdir(), 'refreshrun-' + process.pid + '-' + p + '.json');

console.log('  the verdict');
let run = rr.createRun(rr.LANGS, { marker: false });
for (const l of rr.LANGS) { rr.start(run, l); rr.finish(run, l, { state: 'complete', done: 10, of: 10 }); }
let v = rr.close(run);
ok('all four complete: ok, exit 0, "REFRESH COMPLETE"', v.ok && v.exitCode === 0 && /REFRESH COMPLETE/.test(v.lines[0]), v.lines[0]);

// The 08/10 shape: English stopped near the end, the other three never started.
run = rr.createRun(rr.LANGS, { marker: false });
rr.start(run, 'en'); rr.progress(run, 'en', 3950, 4000);
v = rr.verdict(run);
ok('the 08/10 shape: exit 3', !v.ok && v.exitCode === rr.EXIT_INCOMPLETE);
ok('…names English as interrupted, with how far it got', /did not finish: en \(interrupted at 3950 of 4000\)/.test(v.lines[0]), v.lines[0]);
ok('…and names every language that did not run', /did not run: ja, zh-tw, zh-cn/.test(v.lines[0]));
run = rr.createRun(['en'], { marker: false }); rr.start(run, 'en'); rr.finish(run, 'en', { state: 'stopped', done: 3000, of: 4000, why: 'the 4h budget ran out' });
v = rr.close(run);
ok('the --hours budget running out: exit 3, says where and why', v.exitCode === 3 && /en \(stopped at 3000 of 4000: the 4h budget ran out\)/.test(v.lines[0]), v.lines[0]);
run = rr.createRun(['en', 'ja'], { marker: false }); rr.start(run, 'en'); rr.finish(run, 'en', {}); rr.start(run, 'ja'); rr.finish(run, 'ja', { state: 'error', why: 'boom' });
v = rr.close(run);
ok('an error in one language: exit 3, named, and the others still count', v.exitCode === 3 && /ja \(error: boom\)/.test(v.lines[0]) && !/en/.test(v.lines[0].replace('REFRESH INCOMPLETE', '')), v.lines[0]);
run = rr.createRun(['ja'], { marker: false }); rr.start(run, 'ja'); rr.finish(run, 'ja', { state: 'complete', done: 0, of: 0 });
ok('nothing due is complete, not a failure', rr.close(run).ok);
ok('the codes: incomplete 3 (setyield keeps 2), interrupted 130', rr.EXIT_INCOMPLETE === 3 && rr.EXIT_INTERRUPTED === 130);

console.log('\n  a hard kill (no handler can run) is named by the next run');
const marker = tmp('marker');
const child = `const rr = require(${JSON.stringify(path.join(__dirname, 'refreshrun.js'))});
const run = rr.createRun(rr.LANGS, { marker: ${JSON.stringify(marker)} });
rr.start(run, 'en'); for (let i = 0; i <= 50; i++) rr.progress(run, 'en', i, 4000);
setInterval(() => {}, 1000); process.stdout.write('ready\\n');`;
const f = tmp('child').replace(/\.json$/, '.js'); fs.writeFileSync(f, child);
const r = cp.spawnSync(process.execPath, [f], { timeout: 1500, killSignal: 'SIGKILL', encoding: 'utf8' });
ok('the child was killed mid-English (no clean exit)', r.signal === 'SIGKILL' || r.status !== 0, r.signal + ' ' + r.status);
const prev = rr.previousUnfinished(marker);
ok('the next run finds the unfinished marker', !!prev);
ok('…and its first line names English as interrupted and the three that never ran',
  prev && /PREVIOUS REFRESH NEVER FINISHED/.test(prev.line) && /en \(interrupted at 50 of 4000\)/.test(prev.line) && /did not run: ja, zh-tw, zh-cn/.test(prev.line), prev && prev.line);
run = rr.createRun(['en'], { marker }); rr.start(run, 'en'); rr.finish(run, 'en', {}); rr.close(run);
ok('a run that closes leaves nothing for the next to report', rr.previousUnfinished(marker) === null);
ok('no marker file at all: nothing to report', rr.previousUnfinished(tmp('absent')) === null);
fs.unlinkSync(f); try { fs.unlinkSync(marker); } catch (e) {}

console.log('\n  ingest.js uses it');
const I = fs.readFileSync(path.join(__dirname, 'ingest.js'), 'utf8').replace(/\r/g, '');
const body = I.slice(I.indexOf('async function refreshDue('), I.indexOf('async function refreshOne('));
const one = I.slice(I.indexOf('async function refreshOne('), I.indexOf('\n}\n', I.indexOf('async function refreshOne(')));
ok('refresh all asks refreshrun for the four languages', /lang === 'all' \? refreshrun\.LANGS\.slice\(\)/.test(body));
ok('each language is started and finished in the run record', /refreshrun\.start\(run, L\)/.test(body) && /refreshrun\.finish\(run, L, o\)/.test(body));
ok('a language that throws is recorded as an error and the run goes on', /catch \(e\) \{ o = \{ state: 'error'/.test(body));
ok('the verdict sets a non-zero exit code when incomplete (the worse code wins)', /if \(!v\.ok\) process\.exitCode = Math\.max\(process\.exitCode \|\| 0, v\.exitCode\)/.test(body));
ok('interrupts (Ctrl+C, the console closing, terminate) print the line and exit 130',
  /\['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'\]/.test(body) && /process\.exit\(refreshrun\.EXIT_INTERRUPTED\)/.test(body));
ok('the previous run\'s unfinished marker is reported at the start', /refreshrun\.previousUnfinished\(\)/.test(body));
ok('the budget stop returns "stopped" with where it stopped', /ranOut \? \{ state: 'stopped', done: stoppedAt, of: batch\.length/.test(one));
ok('progress is recorded inside the card loop', /refreshrun\.progress\(run, lang, i, batch\.length\)/.test(one));
// ONE budget for the whole run (Roy, 2026-10-10): it was per language — refresh all = up to 4 x --hours awake.
ok('refreshDue makes the budget ONCE, before the language loop, and hands it to every language',
  (body.match(/refreshBudget\(flags\)/g) || []).length === 1 && body.indexOf('const budget = refreshBudget(flags);') < body.indexOf('for (const L of requested)')
  && /await refreshOne\(L, flags, run, budget\)/.test(body));
ok('refreshOne reads the run\'s deadline and makes none of its own (only a direct call, with no budget, gets one)',
  /const \{ hours: budgetHours, deadline \} = budget \|\| refreshBudget\(flags\);/.test(one) && !/Date\.now\(\) \+ budgetHours/.test(one));
{
  const fnSrc = I.slice(I.indexOf('function refreshBudget('), I.indexOf('\n}\n', I.indexOf('function refreshBudget(')) + 2);
  const refreshBudget = new Function(fnSrc + '; return refreshBudget;')();
  const t0 = Date.UTC(2026, 9, 10, 0, 0, 3), b = refreshBudget(['--hours=4'], t0);
  ok('the deadline is the run start + --hours (4 h default; wall-clock, so sleep counts)', b.hours === 4 && b.deadline === t0 + 4 * 3600e3
    && refreshBudget([], t0).hours === 4 && refreshBudget(['--hours=0.5'], t0).deadline === t0 + 1800e3);
}
ok('a failed preflight is an error, never a silent return', /return \{ state: 'error', why: 'the listing filter failed its preflight' \}/.test(one) && !/\n  if \(!dry && !preflightFilter\(\)\) return;\n/.test(one));
ok('the marker is local state, not committed', (() => { try { cp.execSync('git check-ignore -q refresh-run.json', { cwd: __dirname }); return true; } catch (e) { return false; } })());

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
