// testcount.test.js — the assertion-count guard fires, and every test file has it
// (Roy, 2026-10-08). See testcount.js.
//
//   node testcount.test.js
'use strict';
require('./testcount')(15);
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  testcount.test.js\n');

// ── the guard, made to fire ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testcount-'));
const TC = JSON.stringify(path.join(__dirname, 'testcount.js'));
const run = (name, body) => {
  const f = path.join(dir, name + '.js');
  fs.writeFileSync(f, body);
  const r = cp.spawnSync(process.execPath, [f], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
let r = run('enough', `require(${TC})(3); console.log('3 passed, 0 failed'); process.exit(0);`);
ok('exactly the count: passes (exit 0)', r.code === 0, r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('more', `require(${TC})(3); console.log('5 passed, 0 failed');`);
ok('more than the count (a --db run): passes', r.code === 0, r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('short', `require(${TC})(4); console.log('3 passed, 0 failed'); process.exit(0);`);
ok('one short, even with process.exit(0): FAILS', r.code === 1 && /assertion count: 3 ran, this file runs at least 4/.test(r.out), r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('nosummary', `require(${TC})(4); console.log('ok one');`);
ok('no summary line (the file ended early): FAILS', r.code === 1 && /no summary line was printed/.test(r.out), r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('async', `require(${TC})(2); let pass = 0; const p = (async () => { await null; pass++; })(); pass++; console.log(pass + ' passed, 0 failed'); process.exit(0);`);
ok('the async shape that hid an assertion: FAILS', r.code === 1 && /1 ran/.test(r.out), r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('ownfail', `require(${TC})(1); console.log('0 passed, 1 failed'); process.exit(1);`);
ok('a file\'s own failure still fails (the guard never turns a 1 into a 0)', r.code === 1);
r = run('last', `require(${TC})(5); console.log('9 passed, 0 failed'); console.log('2 passed, 0 failed');`);
ok('the LAST summary line is the one read', r.code === 1);
r = run('guards', `require(${TC})(12); console.log('  12 guards fired, 0 did not');`);
ok('preservebreak\'s "N guards fired, M did not" is read', r.code === 0, r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('skipdeclared', `const tc = require(${TC})(3); tc.skip(1, 'a local-only file'); console.log('2 passed, 0 failed');`);
ok('a DECLARED skip lowers the minimum by exactly its count, and says SKIP and why', r.code === 0 && /SKIP  1 assertion — a local-only file/.test(r.out), r.out.replace(/\s+/g, ' ').trim().slice(0, 140));
r = run('skipshort', `const tc = require(${TC})(4); tc.skip(1, 'x'); console.log('2 passed, 0 failed');`);
ok('…and no further: one more missing still FAILS', r.code === 1 && /at least 3 \(4 less 1 declared skipped\)/.test(r.out), r.out.replace(/\s+/g, ' ').trim().slice(0, 160));
let skipThrew = false; try { require('./testcount')(5).skip(1); } catch (e) { skipThrew = true; }
ok('a skip without a reason is refused', skipThrew);
let threw = false; try { require('./testcount')(0); } catch (e) { threw = true; }
ok('no count given: refuses to start', threw);
fs.rmSync(dir, { recursive: true, force: true });

// ── every test file has it, with a number ──
const files = fs.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f) || f === 'jptest.js').sort();
const missing = [], table = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const m = /^(?:const TC = )?require\('\.\/testcount'\)\((\d+)\);/m.exec(src);
  if (!m) missing.push(f); else table.push(f + ' ' + m[1]);
  // Before anything that could print or exit: within the first 60 lines.
  if (m && src.slice(0, m.index).split('\n').length > 60) missing.push(f + ' (too late in the file)');
}
ok('every test file (' + files.length + ', with jptest.js) states its assertion count', missing.length === 0, missing.join(', '));
ok('the count module is tracked (a test that requires an untracked file breaks the clean checkout)',
  (() => { try { cp.execSync('git ls-files --error-unmatch testcount.js', { cwd: __dirname, stdio: 'ignore' }); return true; } catch (e) { return false; } })());
const total = table.reduce((s, x) => s + +x.split(' ')[1], 0);
ok('the counts add up to something real (' + total + ' across ' + table.length + ' files)', total > 3000);
if (process.argv.includes('--table')) console.log(table.map(x => '    ' + x).join('\n'));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
