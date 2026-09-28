// gateaudit.test.js — every path that produces a listing or a price reaches
// the gates it needs, and reports what it refused (TASK T9, 2026-09-29).
//   node gateaudit.test.js           structure, plus the real functions where cheap
//   node gateaudit.test.js --live    also ask a running server
//                                    (CARDHUNT_API, default http://localhost:3001)
//
// The recurring failure in this project is not a wrong gate — it is a right
// gate that one path never calls: the year gate without set_release, the
// language gate without Yahoo, REPRINT_OF for listings and not for pricing,
// the search resolver fixed and the endpoint's guard still refusing first.
// Each assertion below names a path and the thing it must reach.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

const stripComments = s => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const server = stripComments(fs.readFileSync('server.js', 'utf8'));
const slice = (code, name) => {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(code);
  if (!m) return '';
  const re = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|\nconst\s|\nlet\s|\napp\./g;
  re.lastIndex = m.index + 1;
  const n = re.exec(code);
  return code.slice(m.index, n ? n.index : code.length);
};
const route = (method, path) => {
  const i = server.indexOf("app." + method + "('" + path + "'");
  if (i < 0) return '';
  const n = server.indexOf('\napp.', i + 5);
  return server.slice(i, n < 0 ? server.length : n);
};

// ── /api/search reaches the resolver for every reading ─────────
console.log('\n  /api/search — the endpoint reaches the resolver');
const search = route('get', '/api/search');
ok('/api/search route found', search.length > 200);
ok('the "nothing identifying" guard accepts a setHint-only parse',
  /!parsed\.name && !parsed\.setHint && !parsed\.number && !parsed\.certId/.test(search),
  'a set-marker word opening the name ("Shining Celebi") leaves only setHint — refused before resolveCard ran');
{
  const { parseCardQuery } = require('./cardparse');
  // The exact shape the guard must let through: the parser's own output.
  for (const q of ['Shining Celebi', 'Lost Remover', 'Detective Pikachu', 'Paldean Tauros']) {
    const p = parseCardQuery(q);
    const identifying = !!(p && (p.name || p.setHint || p.number || p.certId));
    ok(`parseCardQuery("${q}") is identifying to the guard`, identifying, JSON.stringify(p && { name: p.name, setHint: p.setHint }));
  }
}

(async () => {
  if (process.argv.includes('--live')) {
    const base = process.env.CARDHUNT_API || 'http://localhost:3001';
    console.log('\n  live — ' + base);
    const get = async p => (await fetch(base + p)).json();
    try {
      // Cards unreachable by their own name until 2026-09-29 (search audit).
      for (const [q, id] of [['Shining Celebi', 'en-neo4-106'], ['Lost Remover', 'en-col1-80'],
                             ['Detective Pikachu', 'en-det1-10'], ['Shining Ho-Oh', 'en-smp-SM70']]) {
        const r = await get('/api/search?q=' + encodeURIComponent(q) + '&listings=0&limit=25');
        const ids = (r.candidates || []).map(c => c.cardId);
        ok(`live search "${q}" finds ${id}`, ids.includes(id), ids.length + ' candidates');
      }
    } catch (e) { ok('live server reachable', false, e.message); }
  }

  console.log('\n  gateaudit.test.js — ' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;   // not exit(): open fetch sockets abort node on Windows
})();
