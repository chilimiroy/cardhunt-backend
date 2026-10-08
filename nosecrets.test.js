// nosecrets.test.js — no key-shaped literal in the code (Roy, 2026-10-08).
//
// The pokemontcg.io API key sat as a literal in ingest.js, server.js and
// cardhunt_preview.html — the page one public for as long as it was there.
// Keys come from the environment (POKEMONTCG_KEY, DATABASE_URL, the eBay and
// Supabase settings on Render), never from a file in git.
//
// Fails on, in ingest.js, server.js and cardhunt_preview.html — and in every
// other tracked non-test source file:
//   a quoted UUID (the pokemontcg.io key's shape), a quoted run of 32+ hex,
//   a JWT, a Stripe-style key, a database URL with a password, an
//   X-Api-Key / Authorization header built from a literal, and
//   KEY / TOKEN / SECRET / PASSWORD = '<16+ characters>'.
// Not a key: a Subresource Integrity hash (sha384-…) on a <script> tag.
// It never prints what it found — only where (file:line) and which shape.
//
//   node nosecrets.test.js [file ...]     (files: check these instead — how the test is made to fire)
'use strict';
require('./testcount')(11);
const fs = require('fs'), cp = require('child_process');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  nosecrets.test.js\n');

const SHAPES = [
  ['a quoted UUID (API-key shape)', /['"`][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"`]/i],
  ['a quoted run of 32+ hex', /['"`][0-9a-f]{32,}['"`]/i],
  ['a JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['a Stripe-style key', /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/],
  ['a database URL with a password', /postgres(ql)?:\/\/[^:\s'"`/]+:[^@\s'"`]{6,}@/i],
  ['an API-key header from a literal', /['"]?(x-api-key|apikey|api-key)['"]?\s*:\s*['"`][A-Za-z0-9_\-]{16,}['"`]/i],
  ['a Bearer header from a literal', /Bearer\s+[A-Za-z0-9_\-.]{20,}['"`]/],
  ['KEY / TOKEN / SECRET / PASSWORD set to a literal', /\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[:=]\s*['"`][^'"`\s]{16,}['"`]/],
];
const SRI = /sha(256|384|512)-[A-Za-z0-9+/=]{20,}/g;
function scan(file) {
  const hits = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const l = raw.replace(SRI, 'sri');
    for (const [what, re] of SHAPES) if (re.test(l)) hits.push(file + ':' + (i + 1) + ' ' + what);
  });
  return hits;
}

const asked = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (asked.length) {
  for (const f of asked) { const h = scan(f); ok(f + ': no key-shaped literal', h.length === 0, h.join('; ')); }
} else {
  console.log('  the three files that carried the pokemontcg.io key');
  for (const f of ['ingest.js', 'server.js', 'cardhunt_preview.html']) {
    const h = scan(f);
    ok(f + ': no key-shaped literal', h.length === 0, h.join('; '));
  }
  ok('ingest.js reads the key from the environment only', /const TCG_KEY\s+= process\.env\.POKEMONTCG_KEY \|\| null;/.test(fs.readFileSync('ingest.js', 'utf8')));
  ok('server.js reads the key from the environment only', /const TCG_KEY = process\.env\.POKEMONTCG_KEY \|\| null;/.test(fs.readFileSync('server.js', 'utf8')));
  ok('the page holds no key and sends no X-Api-Key', !/X-Api-Key/i.test(fs.readFileSync('cardhunt_preview.html', 'utf8')));
  ok('no key header is sent when the variable is unset (an empty header object)',
    /TCG_H\s+= TCG_KEY \? \{ 'X-Api-Key': TCG_KEY \} : \{\};/.test(fs.readFileSync('ingest.js', 'utf8'))
    && /TCG_H\s+= TCG_KEY \? \{ 'X-Api-Key': TCG_KEY \} : \{\};/.test(fs.readFileSync('server.js', 'utf8')));

  console.log('\n  every other tracked source file (tests excluded: they carry fake ids by design)');
  const tracked = cp.execSync('git ls-files', { cwd: __dirname }).toString().trim().split('\n')
    .filter(f => /\.(js|cjs|mjs|html|json|yml|yaml|cmd|ps1|sh|sql|md)$/.test(f) && !/\.test\.js$|^jptest\.js$/.test(f)
      && !['ingest.js', 'server.js', 'cardhunt_preview.html'].includes(f) && fs.existsSync(f) && fs.statSync(f).size < 20e6);
  const hits = [].concat(...tracked.map(scan));
  ok('no key-shaped literal in ' + tracked.length + ' tracked files', hits.length === 0, hits.slice(0, 10).join('; '));

  console.log('\n  the scan itself, made to fire (synthetic values, never a real key)');
  const tmp = require('path').join(require('os').tmpdir(), 'nosecrets-' + process.pid + '.js');
  const fake = (a, b) => a + b;   // assembled here so this file holds no literal of the shape
  const cases = [
    ['a UUID key in a const', 'const KEY=\'' + fake('0f0f0f0f-1e1e-4d4d-8c8c-', '2b2b2b2b2b2b') + '\';'],
    ['a key in a header object', '{ \'X-Api-Key\': \'' + fake('abcdefghij', 'klmnopqrst') + '\' }'],
    ['a database URL with a password', 'const u = "' + fake('postgres', 'ql://postgres:hunter22pass@db.example.co/x') + '";'],
    ['a long hex token', 'TOKEN = "' + fake('0123456789abcdef', '0123456789abcdef') + '"'],
  ];
  const caught = cases.filter(([, src]) => { fs.writeFileSync(tmp, src); return scan(tmp).length > 0; }).map(c => c[0]);
  fs.writeFileSync(tmp, '<script src="x.js" integrity="sha384-' + 'A'.repeat(64) + '"></script> const K = process.env.KEY;');
  const sriClean = scan(tmp).length === 0;
  fs.unlinkSync(tmp);
  ok('each synthetic key shape is caught (' + caught.length + '/' + cases.length + ')', caught.length === cases.length, cases.filter(c => !caught.includes(c[0])).map(c => c[0]).join(', '));
  ok('an SRI hash and an env read are not reported', sriClean);
  // The real thing: the last committed version of each file before 2026-10-08's change.
  let before = [];
  try {
    for (const f of ['ingest.js', 'server.js', 'cardhunt_preview.html']) {
      const old = cp.execSync('git show 4c6356e:' + f, { cwd: __dirname, maxBuffer: 1 << 26 }).toString();
      fs.writeFileSync(tmp, old); before.push(scan(tmp).length > 0); fs.unlinkSync(tmp);
    }
  } catch (e) { before = []; }
  ok('it catches the key in all three files as committed before the fix (4c6356e)', before.length === 3 && before.every(Boolean), JSON.stringify(before));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
