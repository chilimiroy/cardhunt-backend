// testcount.js — every test file states how many assertions it runs, and
// FAILS if fewer ran (Roy, 2026-10-08).
//
// Three times a suite reported passing without having run what it claimed:
// a source-reading test that sliced nothing, the deals photo count, and an
// async assertion that never ran because the file exited first. A printed
// count only helps a reader who remembers the last one; this compares.
//
//   require('./testcount')(N)      first line of a test file
//
// It reads the file's OWN summary line as it is printed — "N passed, M
// failed" (or preservebreak's "N guards fired, M did not") — and at exit:
//   * no summary line at all              -> FAIL (the file ended early)
//   * passed + failed < N                 -> FAIL (assertions were lost)
//   * otherwise                           -> nothing; the file's own exit code stands
// N is a MINIMUM for the plain run: --db / --live / --deployed add more.
// When a file gains assertions, raise N in the same commit
// (testcount.test.js lists every file and its N).
//
// A check that cannot run HERE (a local-only, gitignored file absent from a
// clean checkout) is declared, never silent:
//   const tc = require('./testcount')(N);  ...  tc.skip(k, 'why')
// prints "SKIP" with the reason and lowers this run's minimum by exactly k.
// The first clean-checkout run with this guard found three such checks that
// had vanished without a word (2026-10-08).
'use strict';
const SUMMARY = /(\d+) passed, (\d+) failed|(\d+) guards fired, (\d+) did not/g;

function counted(text) {
  const all = [...String(text).matchAll(SUMMARY)];
  const m = all[all.length - 1];
  return m ? (+(m[1] || m[3]) + +(m[2] || m[4])) : null;
}

module.exports = function expectAssertions(min) {
  if (!(Number.isInteger(min) && min > 0)) throw new Error('testcount: give the number of assertions this file runs');
  let tail = '', skipped = 0;
  const api = {
    skip(k, why) {
      if (!(Number.isInteger(k) && k > 0) || !why) throw new Error('testcount.skip: a count and a reason');
      skipped += k;
      console.log('  SKIP  ' + k + ' assertion' + (k === 1 ? '' : 's') + ' — ' + why);
    },
  };
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (chunk, ...rest) {
    tail += String(chunk);
    if (tail.length > 200000) tail = tail.slice(-100000);
    return write(chunk, ...rest);
  };
  process.on('exit', () => {
    const ran = counted(tail), need = min - skipped;
    if (ran == null || ran < need) {
      write('\n  FAIL  assertion count: ' + (ran == null ? 'no summary line was printed' : ran + ' ran')
        + ', this file runs at least ' + need + (skipped ? ' (' + min + ' less ' + skipped + ' declared skipped)' : '')
        + ' — an assertion stopped running\n');
      process.exitCode = 1;
    }
  });
  return api;
};
module.exports.counted = counted;
