// approute.test.js — /app serves the frontend, and NOTHING else in the
// project root is reachable.
//
// Standalone on purpose: a test living inside server.js vanishes exactly
// when a downloaded file lands on top of local work, which has happened
// twice here.
//
// This asserts BOTH halves. A route test that only checks 404s passes if
// /app itself is broken — the same failure that let `looksLikeJunk` reject
// ~80 valid prices per set while every "it blocks bad data" check was green.
//
//   node approute.test.js
//
// Boots the real server on a spare port with no DATABASE_URL (db = null,
// which the server already handles) and makes real HTTP requests. The
// project root holds ingest.js, CLAUDE.md, ingest-progress-*.json, logs and
// .bak files; express.static(__dirname) would publish every one, so the
// exposure check requests them rather than reading the route table.

const { spawn } = require('child_process');
const path = require('path');
const vm = require('vm');

// What each served module must put on `window`. The page reads these three
// and silently falls back to its inline tables when one is missing, so a
// broken module has no symptom beyond wrong numbers.
const WINDOW_GLOBAL = {
  'cardmatch.js': 'CardMatch',
  'estimator.js': 'Estimator',
  'gradeprice.js': 'GradePrice'
};

const PORT = process.env.TEST_PORT || 3999;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}

async function get(p) {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  return { status: r.status, headers: r.headers, body: await r.text() };
}

async function waitForBoot(server, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(BASE + '/app', { redirect: 'manual' });
      if (r.status) { await r.text(); return true; }
    } catch (_) { /* not listening yet */ }
    if (server.exitCode !== null) return false;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '', EBAY_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverErr = '';
  server.stderr.on('data', d => { serverErr += d; });
  server.stdout.on('data', () => {});

  const booted = await waitForBoot(server);
  if (!booted) {
    // A tool that cannot check something must say so.
    console.log('\nCOULD NOT BOOT server.js — nothing was tested.');
    if (serverErr) console.log(serverErr.trim());
    server.kill();
    process.exit(2);
  }

  try {
    // ── What the route must ALLOW ────────────────────────────
    console.log('\nALLOWED — the frontend and its three modules');
    const app = await get('/app');
    ok('/app returns 200', app.status === 200, 'got ' + app.status);
    ok('/app is HTML',
      (app.headers.get('content-type') || '').includes('text/html'),
      app.headers.get('content-type'));
    ok('/app is the real page, not an error body',
      /<!DOCTYPE html>/i.test(app.body) && app.body.includes('id="build-banner"'));
    ok('/app carries the build stamp', /BUILD \d{8}-/.test(app.body));
    ok('/app must revalidate — a cached copy is the problem this route solves',
      /no-cache/.test(app.headers.get('cache-control') || ''),
      app.headers.get('cache-control'));

    for (const m of Object.keys(WINDOW_GLOBAL)) {
      const r = await get('/' + m);
      ok(`/${m} returns 200`, r.status === 200, 'got ' + r.status);
      ok(`/${m} is javascript`,
        (r.headers.get('content-type') || '').includes('javascript'),
        r.headers.get('content-type'));
      // The IIFE fix: three modules passed every node test while failing on
      // line 1 in a browser, so a regex over the text proves nothing —
      // EVALUATE the served bytes the way a browser would: no `module`, no
      // `require`, only a window. If the wrapper is lost again this throws
      // here rather than in someone's console.
      const w = {};
      let evalErr = null;
      try {
        vm.runInNewContext(r.body, { window: w, globalThis: w, console },
          { filename: m, timeout: 5000 });
      } catch (e) { evalErr = e.message; }
      ok(`/${m} evaluates in a browser-shaped context`, !evalErr, evalErr);
      ok(`/${m} exports window.${WINDOW_GLOBAL[m]} as an object`,
        typeof w[WINDOW_GLOBAL[m]] === 'object' && w[WINDOW_GLOBAL[m]] !== null,
        'typeof window.' + WINDOW_GLOBAL[m] + ' = ' + typeof w[WINDOW_GLOBAL[m]]);
    }

    const root = await get('/');
    ok('/ still answers', root.status === 200, 'got ' + root.status);
    ok('/ points at /app', root.body.includes('"/app"'));

    // ── What must stay UNREACHABLE ───────────────────────────
    console.log('\nBLOCKED — everything else in the project root');
    const mustNotServe = [
      '/ingest.js', '/CLAUDE.md', '/TASK.md', '/PROGRESS.md',
      '/ingest-progress-en.json', '/ingest-progress.json', '/package.json',
      '/package-lock.json', '/server.js', '/refresh.log',
      // NOTE: '.env' and 'package-lock.json' do not exist in this tree, so a
      // 404 for them proves nothing about the route — they would 404 under a
      // blanket static mount too. Kept out of the list rather than counted as
      // a pass for the wrong reason; the files listed above all exist.
      '/pokedex-ja-en.json', '/yahoo.html', '/sourcerank.js', '/yuyutei.js',
      '/jpfilter.js', '/listingparse.js', '/ebayquota.js', '/cardparse.js',
      '/fx.js', '/approute.test.js', '/cardhunt_preview.html',
      // T7: preserved, disabled, and never to reach a browser.
      '/checkout-disabled.js', '/login-disabled.js',
      // T3 (2026-09-29): tracked, and still never served — a design mockup
      // full of sample prices, and a script that writes prices.
      '/cardhunt-redesign.html', '/tcgdexharvest.js', '/tcgsetname.js',
      // T1 (2026-10-02): the stamp matcher, its templates and their builder.
      '/stampcheck.js', '/stamps.json', '/stampbuild.js', '/setyield.js',
      '/server.js.bak-v4.1-20260820',
      // The logo is inline SVG (#cz-mark): no logo file is served — not the
      // old PNGs, not the render they were cut from, not the SVG's source.
      '/cardzon-logo-96.png', '/cardzon-logo-144.png', '/cardzon-logo-256.png',
      '/cardzon-logo-master.png', '/logo.jpg', '/cardzon-mark.svg',
      // traversal, both spellings a client can send
      '/app/../package.json', '/app%2f..%2fpackage.json',
      '/static/../CLAUDE.md', '/..%2fCLAUDE.md'
    ];
    for (const p of mustNotServe) {
      const r = await get(p);
      ok(`${p} is not served`, r.status === 404,
        'got ' + r.status + (r.status === 200 ? ' — EXPOSED' : ''));
    }
  } finally {
    // Wait for the child to actually go. Killing it and calling process.exit
    // in the same tick trips a libuv assertion on Windows, which prints after
    // the summary and reads as a failure when every test passed.
    const gone = new Promise(r => server.once('close', r));
    server.kill();
    await Promise.race([gone, new Promise(r => setTimeout(r, 3000))]);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
