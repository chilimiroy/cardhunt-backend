// toolingkeycli.test.js — `node toolingkey.js /api/...` exits cleanly (2026-10-07)
//
// The CLI printed its answer and then aborted on Windows: process.exit()
// inside the fetch callback, while the socket was still closing, tripped
// libuv's "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" with exit
// 127 — every local tooling probe looked broken. It now sets
// process.exitCode and lets the process end. This runs the real CLI against
// a local server: a 200 must exit 0, a 401 must exit 1, neither may abort.

const http = require('http');
const { spawnSync } = require('child_process');
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const src = fs.readFileSync(__dirname + '/toolingkey.js', 'utf8');
const cli = src.slice(src.indexOf('if (require.main === module)'));
ok('after the request, the CLI sets process.exitCode and never calls process.exit()',
   /process\.exitCode = r\.ok \? 0 : 1/.test(cli) && !/\.then[\s\S]*process\.exit\(/.test(cli));

const srv = http.createServer((req, res) => {
  const okKey = req.headers['x-cardhunt-key'] === 'k'.repeat(40);
  res.writeHead(okKey ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: okKey }));
}).listen(0, '127.0.0.1', () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const run = env => new Promise(resolve => {
    const { spawn } = require('child_process');
    const p = spawn(process.execPath, [__dirname + '/toolingkey.js', '/api/ebay/quota'],
      { env: Object.assign({}, process.env, { CARDHUNT_API: base }, env) });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
  (async () => {
    const a = await run({ CARDZON_TOOLING_KEY: '' });
    ok('no key: 401 printed, exit 1, no abort', a.code === 1 && /^401/m.test(a.out) && !/Assertion failed/.test(a.out), 'exit ' + a.code);
    const b = await run({ CARDZON_TOOLING_KEY: 'k'.repeat(40) });
    ok('with the key: 200 printed, exit 0, no abort', b.code === 0 && /^200/m.test(b.out) && !/Assertion failed/.test(b.out), 'exit ' + b.code);
    srv.close();
    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exitCode = fail ? 1 : 0;
  })();
});
