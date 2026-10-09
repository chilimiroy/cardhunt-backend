// ══════════════════════════════════════════════════════════════
// scopeguard.test.js — a served module must survive the page's globals
//
// THE BUG THIS EXISTS FOR
// cardmatch.js, estimator.js and gradeprice.js each declared `const API`
// at top level. So does the page. A <script src> does not get its own
// scope — it shares the page's — so all three threw
//
//     Uncaught SyntaxError: Identifier 'API' has already been declared
//
// on line 1. Each file served 200, defined nothing, and every
// `window.X && window.X.f` guard fell through to the inline fallback it
// was supposed to replace. The modules were "shipped" and none of them ran.
//
// Node never saw it: require() gives every file its own scope, so the whole
// test suite passed against modules that were dead in the browser.
//
// So this test loads each served module the way a BROWSER does — one shared
// global scope, with the page's own 144 top-level identifiers already
// declared in it — and proves the export appears.
// ══════════════════════════════════════════════════════════════
require('./testcount')(28);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const chk = (l, c) => { c ? pass++ : fail++; console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l); };

const HERE = __dirname;
const read = f => fs.readFileSync(path.join(HERE, f), 'utf8');

// ── What is actually served to a browser ──────────────────────
// Read from server.js rather than a list kept here, so a module added
// tomorrow is covered without anyone remembering to add it.
const server = read('server.js');
const served = [...server.matchAll(/app\.get\('\/([\w.-]+\.js)'/g)].map(m => m[1]);

console.log('SERVED MODULES — discovered from server.js routes\n');
console.log('  ' + (served.join(', ') || '(none found)'));
chk('server.js serves at least one module', served.length > 0);
for (const f of served) {
  chk(f + ' exists on disk', fs.existsSync(path.join(HERE, f)));
}

// ── The page's top-level names ────────────────────────────────
const page = read('cardhunt_preview.html');
// The page's own script is the LARGEST inline one: the head carries a small
// theme script (T6, 2026-10-06) that must run before paint.
const inline = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).sort((a, b) => b.length - a.length)[0];
const pageNames = [...new Set(
  [...inline.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1])
)];

console.log('\nTHE PAGE\'S GLOBAL SCOPE\n');
console.log('  ' + pageNames.length + ' top-level identifiers, including: '
  + pageNames.filter(n => n.length <= 3).join(', '));
// The four the user named, plus the one that actually broke it. If the page
// stops declaring these the test should be updated deliberately, not pass
// quietly because it is now checking nothing.
// KEY left the page deliberately on 2026-10-08 (the pokemontcg.io key was a
// literal; nosecrets.test.js) — H, still a short page global, stands in.
// RP left with the page's estimator on 2026-10-09 (no estimate is shown) — CM stands in.
for (const n of ['API', 'H', 'S', 'CM']) {
  chk('page still declares ' + n + ' (the hazard is real)', pageNames.includes(n));
}

// ── Load each module the way the browser does ─────────────────
// One shared global scope. The page's identifiers are declared FIRST, with
// `let`, which collides with a later const/let/var/function/class of the
// same name exactly as the real page does.
function loadLikeBrowser(src, label) {
  const ctx = vm.createContext({ window: {}, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(pageNames.map(n => 'let ' + n + ';').join('\n'), ctx,
                  { filename: 'page-globals.js' });
  vm.runInContext(src, ctx, { filename: label });
  return ctx;
}

console.log('\nEACH MODULE, IN A SCOPE THAT ALREADY HAS THE PAGE IN IT\n');
const EXPECTED = { 'cardmatch.js': 'CardMatch', 'estimator.js': 'Estimator',
                   'gradeprice.js': 'GradePrice' };

for (const f of served) {
  const src = read(f);
  let ctx = null, err = null;
  try { ctx = loadLikeBrowser(src, f); } catch (e) { err = e; }

  chk(f + ' loads without throwing', !err);
  if (err) { console.log('        ' + err.name + ': ' + err.message); continue; }

  const added = Object.keys(ctx.window);
  chk(f + ' defines exactly one window export  (' + (added.join(', ') || 'NONE') + ')',
      added.length === 1);

  const want = EXPECTED[f];
  if (want) {
    chk(f + ' defines window.' + want, typeof ctx.window[want] === 'object' && ctx.window[want]);
  }
  // A module that quietly overwrote window.S or window.API would break the
  // page a different way. Nothing it exports may be named after a page global.
  chk(f + ' exports nothing named after a page global',
      !added.some(k => pageNames.includes(k)));
}

// ── And still loads where nothing is declared ─────────────────
console.log('\nTHE SAME MODULES, IN AN EMPTY SCOPE\n');
for (const f of served) {
  let ok = true;
  try {
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(read(f), ctx, { filename: f });
    ok = Object.keys(ctx.window).length === 1;
  } catch (e) { ok = false; }
  chk(f + ' loads standalone and exports', ok);
}

// ── node must still require() them ────────────────────────────
console.log('\nAND NODE STILL REQUIRES THEM\n');
for (const f of served) {
  let m = null;
  try { m = require(path.join(HERE, f)); } catch (e) { /* reported below */ }
  chk(f + ' require() returns its API', !!m && Object.keys(m).length > 0);
}
chk('require() does not leak onto the node global',
    typeof global.API === 'undefined' && typeof global.CardMatch === 'undefined' &&
    typeof global.Estimator === 'undefined' && typeof global.GradePrice === 'undefined');

// ── No control bytes in source ────────────────────────────────
// CLAUDE.md asks for `grep -cP '\x08' ... # must be 0` by hand. Two NUL
// bytes reached gradeprice.js's bucket key through an editing pipeline and
// survived every test, because a NUL is a perfectly good string separator.
// The file read as binary to grep and as correct to node.
console.log('\nNO CONTROL BYTES IN SOURCE\n');
const sources = fs.readdirSync(HERE)
  .filter(f => /\.(js|html|sql|json)$/.test(f) && !f.includes('.bak'));
const dirty = [];
for (const f of sources) {
  const buf = fs.readFileSync(path.join(HERE, f));
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c < 9 || (c > 13 && c < 32)) { dirty.push(f + ' @' + i + ' 0x' + c.toString(16)); break; }
  }
}
chk(sources.length + ' source files carry no control bytes'
    + (dirty.length ? ' — ' + dirty.join(', ') : ''), dirty.length === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
