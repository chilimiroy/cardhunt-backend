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

module.exports = { FILE, STALE_HOURS, EXIT_LOCKED, acquire, release, alive };
