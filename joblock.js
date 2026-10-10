// ══════════════════════════════════════════════════════════════
// joblock.js — the nightly and the weekly Yuyu-tei job cannot overlap (2026-10-10)
//
// "They can't overlap" was arithmetic: the nightly starts 03:00 with a 4 h
// budget, the weekly 08:00. It never held. The budget is per LANGUAGE (four of
// them: up to 16 h awake), and it is wall-clock, so a PC that sleeps through
// the night resumes a run that is still "in progress" at 13:15 (2026-10-10:
// asleep 05:41 -> 13:14, PROGRESS 2026-10-10 (nightly)). Now ONE lock file:
// a job takes it exclusively before it starts, and a second job refuses to
// start while a live process holds it — loudly, exit 4, naming the holder.
//
// The lock: ingest-job.lock beside this file (gitignored), created with 'wx'
// (fails if it exists — no read-then-write race), holding { pid, job,
// startedAt }. Released on process exit. A lock whose pid is not running, or
// older than STALE_HOURS (no run can legitimately last that long: 4 languages
// x 4 h), is stale — a hard kill — and is taken over, said aloud.
// ══════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'ingest-job.lock');
const STALE_HOURS = 20;
const EXIT_LOCKED = 4;

function alive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }   // exists, not ours to signal
}
function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

// -> { ok: true, took?: 'stale lock ...' } | { ok: false, holder, why }
function acquire(job, opts) {
  const file = (opts && opts.file) || FILE;
  const now = (opts && opts.now) || Date.now();
  const isAlive = (opts && opts.alive) || alive;
  const mine = { pid: process.pid, job, startedAt: new Date(now).toISOString() };
  let took = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify(mine), { flag: 'wx' });
      if (!(opts && opts.noRelease)) process.once('exit', () => release(file));
      return took ? { ok: true, took } : { ok: true };
    } catch (e) {
      if (e.code !== 'EEXIST') return { ok: false, holder: null, why: 'the lock file could not be created: ' + e.message };
      const h = read(file);
      const age = h && h.startedAt ? (now - Date.parse(h.startedAt)) / 3600e3 : Infinity;
      if (h && isAlive(h.pid) && age < STALE_HOURS) {
        return { ok: false, holder: h, why: `"${h.job}" holds the job lock (pid ${h.pid}, since ${h.startedAt}) — `
          + `"${job}" is not started, so the two never run at once. Delete ${path.basename(file)} only if no ingest.js is running.` };
      }
      took = 'took over a stale job lock (' + (h ? `"${h.job}", pid ${h.pid}, since ${h.startedAt}` : 'unreadable')
        + (h && isAlive(h.pid) ? `, older than ${STALE_HOURS} h` : ', process not running') + ')';
      try { fs.unlinkSync(file); } catch (e2) { /* another taker won; the next attempt says so */ }
    }
  }
  return { ok: false, holder: read(file), why: 'another job took the lock at the same moment' };
}

function release(file) {
  const f = file || FILE;
  const h = read(f);
  if (h && h.pid === process.pid) { try { fs.unlinkSync(f); } catch (e) { /* gone already */ } }
}

// ── A locked job WAITS, and a skip is never silent (Roy, 2026-10-10) ──
// The weekly runs once a week: refused at 08:00 because the nightly still held
// the lock, it lost the week and the only trace was exit code 4. Now it retries
// every intervalMs for `tries` attempts (the weekly: hourly, 7 attempts, 08:00 to
// 14:00), saying when it will try again. If it still cannot run, the skip is
// written to SKIPPED_FILE, and every later nightly and weekly prints it at its
// top until that job completes — the next run reports what was lost.
const SKIPPED_FILE = path.join(__dirname, 'ingest-skipped.json');
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
async function acquireWaiting(job, opts) {
  const tries = Math.max(1, (opts && opts.tries) || 1), interval = (opts && opts.intervalMs) || 3600e3;
  const log = (opts && opts.log) || console.log, sleep = (opts && opts.sleep) || sleepMs;
  let r;
  for (let n = 1; n <= tries; n++) {
    r = acquire(job, opts);
    if (r.ok) return Object.assign(r, { attempts: n });
    if (n < tries) {
      log('  JOB LOCKED — waiting (attempt ' + n + ' of ' + tries + '): ' + r.why + ' Next try at '
        + new Date(Date.now() + interval).toISOString().slice(11, 16) + ' UTC.');
      await sleep(interval);
    }
  }
  return Object.assign(r, { attempts: tries });
}
function noteSkipped(job, why, file) {
  const f = file || SKIPPED_FILE, all = read(f) || {};
  all[job] = { at: new Date().toISOString(), why };
  fs.writeFileSync(f, JSON.stringify(all, null, 1));
}
// Lines to print at the top of a run: every scheduled job skipped and not run since.
function skippedLines(file) {
  const all = read(file || SKIPPED_FILE) || {};
  return Object.keys(all).map(j => '  A SCHEDULED JOB WAS SKIPPED and has not run since: "' + j + '" at ' + all[j].at + ' — ' + all[j].why);
}
function clearSkipped(job, file) {
  const f = file || SKIPPED_FILE, all = read(f);
  if (!all || !all[job]) return;
  delete all[job];
  if (Object.keys(all).length) fs.writeFileSync(f, JSON.stringify(all, null, 1)); else { try { fs.unlinkSync(f); } catch (e) {} }
}

module.exports = { FILE, SKIPPED_FILE, STALE_HOURS, EXIT_LOCKED, acquire, acquireWaiting, release, alive, noteSkipped, skippedLines, clearSkipped };
