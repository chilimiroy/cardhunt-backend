// ══════════════════════════════════════════════════════════════
// refreshrun.js — a nightly refresh that did not finish says so, and fails
// (Roy, 2026-10-08).
//
// The 08/10 nightly stopped at 98.8% of English with ^C and never started
// Japanese or Chinese. Its log ended mid-line and nothing named what was
// missed — a silent partial refresh is how prices go stale unnoticed.
//
// ingest.js `refresh` records each language's outcome here:
//   complete      every due card in the batch was asked (or nothing was due)
//   stopped       the --hours budget ran out before the batch did
//   not-run       never started (an earlier language stopped the run, or an error)
//   error         threw
// verdict() turns them into the closing lines and the exit code:
//   0  every requested language complete
//   3  any language stopped / not run / errored — "REFRESH INCOMPLETE" names them
// (2 stays setyield's "a set came back empty"; the worse code wins.)
// An interrupt (Ctrl+C, the console closing, a terminate) prints the same
// line naming what did not run and exits 130. A hard kill cannot print, so
// the run leaves a marker (refresh-run.json) and the NEXT run's first lines
// name the run that never finished.
// Local tooling's helper: REQUIRED BY ingest.js, so it is tracked.
// ══════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const LANGS = ['en', 'ja', 'zh-tw', 'zh-cn'];
// What `refresh all` runs (Roy, 2026-10-10): the languages pricing may be written
// for (tcgdexprice.pricingAllowedFor — en, ja). Chinese priced nothing every night
// and only logged its gaps; it is out of the nightly. `refresh zh-tw` by name still
// runs it, on purpose.
const NIGHTLY_LANGS = ['en', 'ja'];
const EXIT_INCOMPLETE = 3, EXIT_INTERRUPTED = 130;
const MARKER = path.join(__dirname, 'refresh-run.json');

function createRun(requested, opts) {
  const run = { startedAt: new Date().toISOString(), requested: requested.slice(), outcomes: {}, current: null, finished: false };
  for (const l of requested) run.outcomes[l] = { state: 'not-run' };
  run.marker = opts && opts.marker === false ? null : (opts && opts.marker) || MARKER;
  save(run);
  return run;
}
function save(run) {
  if (!run.marker) return;
  try { fs.writeFileSync(run.marker, JSON.stringify({ startedAt: run.startedAt, requested: run.requested, outcomes: run.outcomes, current: run.current, finished: run.finished }, null, 1)); }
  catch (e) { /* a marker that cannot be written must not stop the refresh */ }
}
function start(run, lang) { run.current = lang; run.outcomes[lang] = { state: 'running', startedAt: new Date().toISOString() }; save(run); }
function finish(run, lang, outcome) {
  run.outcomes[lang] = Object.assign({ state: 'complete' }, outcome || {}, { finishedAt: new Date().toISOString() });
  run.current = null; save(run);
}
// Inside a language's loop: how far it got (written to the marker every 25 cards).
function progress(run, lang, done, of) {
  if (!run || !run.outcomes[lang]) return;
  run.outcomes[lang].done = done; run.outcomes[lang].of = of;
  if (done % 25 === 0) save(run);
}
function describe(lang, o) {
  if (o.state === 'stopped') return lang + ' (stopped at ' + (o.done != null ? o.done + ' of ' + o.of : '?') + (o.why ? ': ' + o.why : '') + ')';
  if (o.state === 'running') return lang + ' (interrupted' + (o.done != null ? ' at ' + o.done + ' of ' + o.of : '') + ')';
  if (o.state === 'error') return lang + ' (error: ' + (o.why || '?') + ')';
  return lang;
}
// -> { ok, exitCode, lines }
function verdict(run) {
  const req = run.requested;
  const notRun = req.filter(l => run.outcomes[l].state === 'not-run');
  const partial = req.filter(l => ['stopped', 'running', 'error'].includes(run.outcomes[l].state));
  const ok = !notRun.length && !partial.length;
  const lines = ok
    ? ['  REFRESH COMPLETE — every requested language ran to the end: ' + req.join(', ')]
    : ['  REFRESH INCOMPLETE — '
        + [partial.length ? 'did not finish: ' + partial.map(l => describe(l, run.outcomes[l])).join(', ') : null,
           notRun.length ? 'did not run: ' + notRun.join(', ') : null].filter(Boolean).join('; ')
        + '. Their prices were not refreshed this run.'];
  return { ok, exitCode: ok ? 0 : EXIT_INCOMPLETE, lines, notRun, partial };
}
function close(run) {
  const v = verdict(run);
  run.finished = true; save(run);
  return v;
}
// The previous run, if it never reached close() — read at the next start.
function previousUnfinished(file) {
  try {
    const m = JSON.parse(fs.readFileSync(file || MARKER, 'utf8'));
    if (m.finished) return null;
    const v = verdict({ requested: m.requested, outcomes: Object.fromEntries(m.requested.map(l => [l, m.outcomes[l] && m.outcomes[l].state === 'running' ? m.outcomes[l] : (m.outcomes[l] || { state: 'not-run' })])) });
    return { startedAt: m.startedAt, line: '  PREVIOUS REFRESH NEVER FINISHED (started ' + m.startedAt + ', killed without a word) — '
      + v.lines[0].replace(/^\s*REFRESH INCOMPLETE — /, '') };
  } catch (e) { return null; }
}
module.exports = { LANGS, NIGHTLY_LANGS, EXIT_INCOMPLETE, EXIT_INTERRUPTED, MARKER, createRun, start, progress, finish, verdict, close, previousUnfinished };
