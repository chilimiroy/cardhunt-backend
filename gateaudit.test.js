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

// ── Every listing source reports what its gate refused ─────────
// "A source returning listings with no rejection count has not run the gate."
console.log('\n  listing sources — each one reports rejected + dropped');
const registry = /const LISTING_SOURCES = \[([\s\S]*?)\n\];/.exec(server);
ok('LISTING_SOURCES found', !!registry);
const fetchers = registry ? [...registry[1].matchAll(/fetch:\s*([A-Za-z0-9_]+)/g)].map(m => m[1]) : [];
ok('registry names sourceYahoo, sourceYuyutei, sourceEbay',
  ['sourceYahoo', 'sourceYuyutei', 'sourceEbay'].every(f => fetchers.includes(f)), fetchers.join(','));
for (const f of fetchers) {
  const src = slice(server, f);
  ok(`${f} returns rejected:`, /\brejected:\s/.test(src));
  ok(`${f} returns dropped:`, /\bdropped:\s/.test(src));
  ok(`${f} returns gate: (what the gate had)`, /\bgate:\s/.test(src));
}
const yahoo = slice(server, 'sourceYahoo');
ok('sourceYahoo gates through jpItemRejectReason (the reason, not a bare boolean)', /jpf\.jpItemRejectReason\(/.test(yahoo));
ok('sourceYahoo has no silent `continue` on the jpfilter gate', !/if \(!jpf\.jpItemMatchesRequest\([^)]*\)\) continue;/.test(yahoo));
ok('sourceYahoo runs printingConflict (language / year / reprint)', /cm\.printingConflict\(/.test(yahoo));
ok('sourceYuyutei runs printingConflict', /cm\.printingConflict\(/.test(slice(server, 'sourceYuyutei')));
ok('sourceEbay runs cm.verify', /cm\.verify\(/.test(slice(server, 'sourceEbay')));
ok('gatherListings flags outliers on every source\'s rows', /outlier\.flagOutliers\(listings\)/.test(slice(server, 'gatherListings')));
{
  const jpf = require('./jpfilter');
  ok('jpfilter exports jpItemRejectReason', typeof jpf.jpItemRejectReason === 'function');
  if (typeof jpf.jpItemRejectReason === 'function') {
  // One decision, two faces: the boolean is "no reason" on every case.
  const card = { name: 'リザードンex', number: '201', setTotal: '165', setId: 'SV2a' };
  const cat = { category: { name: jpf.JP_CARD_CATEGORY } };   // the real category string, not a guess
  const cases = [
    ['ポケモンカード リザードンex SAR 201/165 SV2a', 'Raw NM'],
    ['ポケモンカード リザードンex SAR 201/165 まとめ 3枚', 'Raw NM'],
    ['ポケモンカード リザードンex 201/165 PSA10', 'Raw NM'],
    ['ポケモンカード リザードンex 201/165 PSA10', 'PSA 10'],
    ['ポケモンカード リザードンex 200/165', 'Raw NM'],
    ['ポケモンカード ピカチュウ 201/165', 'Raw NM']
  ];
  let agree = 0, kept = 0;
  for (const [title, g] of cases) {
    const it = Object.assign({ title }, cat);
    const why = jpf.jpItemRejectReason(it, card, g);
    if ((why === null) === jpf.jpItemMatchesRequest(it, card, g)) agree++;
    if (why === null) kept++;
  }
  ok(`jpItemMatchesRequest === (jpItemRejectReason === null) on ${cases.length} cases`, agree === cases.length, agree + ' agree');
  ok('...and it KEEPS the genuine raw and the genuine PSA 10 (2 of 6)', kept === 2, kept + ' kept');
  }
}

// ── One list of grading companies, reached from both marketplaces ──
console.log('\n  graders — one list, both marketplaces');
{
  const jpsrc = stripComments(fs.readFileSync('jpfilter.js', 'utf8'));
  ok('jpfilter.jpTitleIsSingleRaw refuses on cardmatch.SLAB_WORDS (not only its own hand-typed list)',
    /cardmatch\.SLAB_WORDS\.test\(/.test(slice(jpsrc, 'jpTitleIsSingleRaw')));
  const jpf = require('./jpfilter');
  ok('...SGC is refused raw on Yahoo', !jpf.jpTitleIsSingleRaw('リザードン 旧裏 SGC 10'));
  ok('...TAG TEAM is kept raw on Yahoo', jpf.jpTitleIsSingleRaw('コイキング&ホエルオーGX SR SM9 098/095 TAG TEAM'));
}

// ── No route hands back eBay rows that skipped the gate ────────
console.log('\n  routes — nothing serves eBay search rows ungated');
const nameRoute = route('get', '/api/listings/:cardName');
ok('/api/listings/:cardName (unresolvable id) answers 404', /status\(404\)/.test(nameRoute));
ok('...and never calls eBay', !/fetchEbay|item_summary|getEbayToken/.test(nameRoute));
// Every eBay Browse search in the server, by the function that makes it.
// sourceEbay is gated. The rest are named here so a new one cannot appear
// unnoticed: ebayActive is the KNOWN ungated name search behind /api/market's
// "lowest listing · by name, ungated" (labelled as such on the page); the
// /api/ebay/* routes are diagnostics that report, never render as listings.
const searchSites = [];
{
  const re = /item_summary\/search/g; let m;
  while ((m = re.exec(server))) {
    const before = server.slice(0, m.index);
    const fn = [...before.matchAll(/\n(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|\napp\.get\('([^']+)'/g)].pop();
    searchSites.push(fn ? (fn[1] || fn[2]) : '?');
  }
}
const ALLOWED = ['sourceEbay', 'ebayActive', '/api/ebay/conditions/:cardId', '/api/ebay/certprobe/:cardId', '/api/ebay/gradecost/:cardId', '/api/ebay/conditionvalues'];
const unknown = searchSites.filter(s => !ALLOWED.includes(s));
ok('every eBay search site is a known one', unknown.length === 0, 'unexpected: ' + unknown.join(', '));

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
      const nr = await fetch(base + '/api/listings/Charizard');
      ok('live /api/listings/Charizard (not an id) is 404, no listings', nr.status === 404, 'HTTP ' + nr.status);
      // Yahoo only answers a residential IP; from Render it is an error, and
      // that is reported as such rather than asserted on.
      const jl = await get('/api/listings/ja-SV2a-201?grade=Raw%20NM');
      const y = (jl.sources || {}).yahoo || {};
      if (y.status === 'ok') ok('live Yahoo reports "kept, rejected of scanned"', /kept, \d+ rejected of \d+ scanned/.test(y.summary || ''), y.summary);
      else console.log('  skip  Yahoo not reachable from this server (' + (y.reason || y.status) + ')');
      for (const [id, s] of Object.entries(jl.sources || {})) {
        if (s.status === 'ok') ok(`live ${id} carries a rejected count`, typeof s.rejected === 'number', JSON.stringify(s).slice(0, 120));
      }
    } catch (e) { ok('live server reachable', false, e.message); }
  }

  console.log('\n  gateaudit.test.js — ' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;   // not exit(): open fetch sockets abort node on Windows
})();
