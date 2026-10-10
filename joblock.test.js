// joblock.test.js — the nightly and the weekly cannot run at once (joblock.js).
// Both ways: what the lock lets start, and what it refuses — then made to fire
// for real: two node processes, the second refused with exit 4 while the first
// holds the lock, and started once it has gone.
//
//   node joblock.test.js
'use strict';
require('./testcount')(23);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const J = require('./joblock');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const tmp = name => path.join(os.tmpdir(), 'joblock-test-' + process.pid + '-' + name + '.lock');

(async () => {
  console.log('\n  in one process');
  const f1 = tmp('a');
  const a = J.acquire('refresh all', { file: f1, noRelease: true });
  ok('a free lock is taken', a.ok && fs.existsSync(f1) && JSON.parse(fs.readFileSync(f1, 'utf8')).job === 'refresh all');
  const b = J.acquire('yuyutei', { file: f1, noRelease: true, alive: () => true });
  ok('a second job is REFUSED while a live holder has it', !b.ok && b.holder && b.holder.job === 'refresh all' && /is not started/.test(b.why), b.why && b.why.slice(0, 70));
  ok('...and the lock still names the first job', JSON.parse(fs.readFileSync(f1, 'utf8')).job === 'refresh all');
  const c = J.acquire('yuyutei', { file: f1, noRelease: true, alive: () => false });
  ok('a lock whose process is gone (a hard kill) is taken over, and said', c.ok && /stale job lock/.test(c.took) && /process not running/.test(c.took));
  ok('...now held by the new job', JSON.parse(fs.readFileSync(f1, 'utf8')).job === 'yuyutei');
  const d = J.acquire('refresh all', { file: f1, noRelease: true, alive: () => true, now: Date.now() + (J.STALE_HOURS + 1) * 3600e3 });
  ok('a live holder older than ' + J.STALE_HOURS + ' h is stale too (no run lasts that long)', d.ok && /older than/.test(d.took));
  J.release(f1);
  ok('release removes the lock it holds', !fs.existsSync(f1));
  fs.writeFileSync(f1, JSON.stringify({ pid: process.pid + 1, job: 'other', startedAt: new Date().toISOString() }));
  J.release(f1);
  ok('release never removes a lock another process holds', fs.existsSync(f1));
  fs.unlinkSync(f1);
  ok('the exit code for "locked" is 4 (distinct from 2 empty sets, 3 incomplete, 130 interrupted)', J.EXIT_LOCKED === 4);

  console.log('\n  made to fire: two real processes on one lock file');
  const f2 = tmp('b');
  const holder = `const J = require(${JSON.stringify(path.join(__dirname, 'joblock.js'))});
    const r = J.acquire('refresh all', { file: ${JSON.stringify(f2)} }); console.log(r.ok ? 'HELD' : 'NOPE'); setTimeout(() => {}, 4000);`;
  const taker = `const J = require(${JSON.stringify(path.join(__dirname, 'joblock.js'))});
    const r = J.acquire('yuyutei', { file: ${JSON.stringify(f2)} });
    if (!r.ok) { console.log('REFUSED: ' + r.why); process.exit(J.EXIT_LOCKED); } console.log('STARTED' + (r.took ? ' ' + r.took : ''));`;
  const h = spawn(process.execPath, ['-e', holder]);
  await new Promise(res => h.stdout.once('data', res));
  const t1 = spawnSync(process.execPath, ['-e', taker], { encoding: 'utf8' });
  ok('while the nightly holds it, the weekly prints its refusal and exits 4', t1.status === 4 && /REFUSED: "refresh all" holds the job lock/.test(t1.stdout), 'exit ' + t1.status + ' ' + t1.stdout.trim().slice(0, 60));
  ok('...and the lock file still belongs to the nightly', JSON.parse(fs.readFileSync(f2, 'utf8')).job === 'refresh all');
  await new Promise(res => h.on('exit', res));
  ok('the nightly exiting releases the lock', !fs.existsSync(f2));
  const t2 = spawnSync(process.execPath, ['-e', taker], { encoding: 'utf8' });
  ok('afterwards the weekly starts', t2.status === 0 && /^STARTED$/.test(t2.stdout.trim()), t2.stdout.trim());
  try { fs.unlinkSync(f2); } catch (e) {}

  console.log('\n  a locked job waits, and a skip is never silent (2026-10-10)');
  {
    const f3 = tmp('c'), sk = tmp('skipped');
    fs.writeFileSync(f3, JSON.stringify({ pid: 999999, job: 'refresh all', startedAt: new Date().toISOString() }));
    let liveFor = 2;                                   // the holder is alive for the first two tries
    const logs = [], slept = [];
    const w = await J.acquireWaiting('yuyutei --wait-lock=6', { file: f3, noRelease: true, tries: 7, intervalMs: 3600e3,
      alive: () => liveFor-- > 0, log: m => logs.push(m), sleep: async ms => { slept.push(ms); } });
    ok('KEPT: the holder finishes during the wait — the weekly starts on attempt 3, having waited an hour twice',
       w.ok && w.attempts === 3 && slept.join() === '3600000,3600000' && /JOB LOCKED — waiting \(attempt 1 of 7\)/.test(logs[0]) && /Next try at \d\d:\d\d UTC/.test(logs[0]));
    fs.writeFileSync(f3, JSON.stringify({ pid: 999999, job: 'refresh all', startedAt: new Date().toISOString() }));
    const slept2 = [];
    const x = await J.acquireWaiting('yuyutei', { file: f3, noRelease: true, tries: 7, intervalMs: 3600e3, alive: () => true, log: () => {}, sleep: async ms => { slept2.push(ms); } });
    ok('REFUSED: held for all seven tries (08:00 to 14:00) — refused after 7 attempts and six hourly waits', !x.ok && x.attempts === 7 && slept2.length === 6);
    fs.unlinkSync(f3);
    J.noteSkipped('yuyutei', 'not started after 7 attempt(s): held', sk);
    const lines = J.skippedLines(sk);
    ok('the skip is written down and every later run prints it', lines.length === 1 && /A SCHEDULED JOB WAS SKIPPED and has not run since: "yuyutei"/.test(lines[0]));
    J.clearSkipped('refresh', sk);
    ok('another job completing does not clear it', J.skippedLines(sk).length === 1);
    J.clearSkipped('yuyutei', sk);
    ok('the job itself completing clears it', J.skippedLines(sk).length === 0 && !fs.existsSync(sk));
  }

  console.log('\n  wiring');
  {
    const I0 = fs.readFileSync(path.join(__dirname, 'ingest.js'), 'utf8').replace(/\r/g, '');
    ok('ingest.js: --wait-lock=N tries N+1 times hourly; a final refusal is noted; every run prints outstanding skips',
       /jl\.acquireWaiting\(cmd \+ ' ' \+ process\.argv\.slice\(3\)\.join\(' '\), \{ tries: waitH \+ 1, intervalMs: 3600e3 \}\)/.test(I0)
       && /jl\.noteSkipped\(cmd, /.test(I0) && /jl\.skippedLines\(\)\.forEach/.test(I0));
    ok('a yuyutei run that completed (no FATAL, not dry) clears its skip; its FATALs exit 1, never 0',
       /if \(!process\.exitCode && !process\.argv\.includes\('--dry'\)\) require\('\.\/joblock'\)\.clearSkipped\('yuyutei'\);/.test(I0)
       && (I0.slice(I0.indexOf('async function yuyuteiIngest('), I0.indexOf('async function yuyuteiIngest(') + 3000).match(/process\.exitCode = 1;/g) || []).length === 3);
    const W = fs.readFileSync(path.join(__dirname, 'refresh-weekly.cmd'), 'utf8');
    ok('the weekly task passes --wait-lock=6', /node ingest\.js yuyutei --wait-lock=6 >> yuyutei-weekly\.log 2>&1/.test(W));
  }
  const I = fs.readFileSync(path.join(__dirname, 'ingest.js'), 'utf8').replace(/\r/g, '');
  ok('ingest.js takes the lock for refresh and yuyutei, before dispatching (not for --dry)',
    /if \(\(cmd === 'refresh' \|\| cmd === 'yuyutei'\) && !process\.argv\.includes\('--dry'\)\) \{\s*const jl = require\('\.\/joblock'\);/.test(I)
    && I.indexOf('jl.acquireWaiting(') > 0 && I.indexOf('jl.acquireWaiting(') < I.indexOf("if (cmd === 'status')"));
  ok('a refusal prints JOB LOCKED and exits with the lock code', /JOB LOCKED — NOT STARTED' \+ \(waitH/.test(I) && /process\.exitCode = jl\.EXIT_LOCKED;/.test(I));

  console.log(`\n  joblock.test.js — ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
