// refused.test.js — refused listings shown, collapsed, at the end (T4, 2026-10-04)
//
// Roy: show what was refused rather than have it vanish — "N listings we
// believe are wrong", each with its reason, collapsed by default, and NEVER
// counted in cheapest, the median, a print run or the listing count. The
// server sends them as a separate list (payload.refused); the page draws
// them in a <details> after everything else.
//
// Runs the REAL refusedRowsOf (server.js) and liveRefusedBlock (page).

const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

// CRLF stripped: a clean checkout on Windows (core.autocrlf=true) has CRLF
// endings, and fnS ends on "\n}\n" — it found nothing there.
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r\n/g, '\n');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');
const fnS = (src, decl) => { const i = src.indexOf('\n' + decl); return i < 0 ? '' : src.slice(i + 1, src.indexOf('\n}\n', i + 1) + 2); };

console.log('\n  the server: one refused list, every stage');
const rro = fnS(S, 'function refusedRowsOf(');
ok('refusedRowsOf exists', !!rro);
const ctx = { REFUSED_MAX: 300 }; vm.createContext(ctx);
vm.runInContext(rro || 'function refusedRowsOf(){ return { rows: [], total: 0 }; }', ctx);   // null-safe: count, don't crash
const kept = { itemId: 'v1|1|0', title: 'Alakazam EX 125/124 kept', landed: 180 };
const j = {
  listings: [kept],
  stamp: { refusedRows: [{ itemId: 'v1|2|0', title: 'Alakazam EX 125/124 (a #25 in the photo)', landed: 150, currency: 'USD',
                           url: 'https://www.ebay.com/itm/2', reason: 'photo matches Alakazam EX #25/124 (Rare Ultra), not this card', source: 'ebay' }] },
  back: { refusedRows: [{ itemId: 'v1|3|0', title: 'Mew ex 151', landed: 9, currency: 'USD', url: 'https://www.ebay.com/itm/3',
                          reason: 'photo shows a Japanese-language card back — a different printing', source: 'ebay' }] }
};
const sources = {
  ebay: { rejected: 6, refusedRows: [
    { itemId: 'v1|4|0', title: 'Alakazam EX 117/124 Fates Collide', price: 20, currency: 'USD', url: 'https://www.ebay.com/itm/4', reason: 'number 117/124, wanted 125/124' },
    { itemId: 'v1|2|0', title: 'duplicate of the photo refusal', price: 150, reason: 'x' },
    { itemId: 'v1|1|0', title: 'refused on a translated site, kept from US', price: 180, reason: 'translated' },
    { itemId: 'v1|5|0', title: 'Fates Collide lot', price: 12.5, currency: 'EUR', url: 'https://www.ebay.de/itm/5', reason: 'not a single card' }] },
  yuyutei: { rejected: 1, droppedSample: [{ title: 'アラカザムEX まとめ', reason: 'lot' }] }
};
const r = ctx.refusedRowsOf(sources, j);
const at = i => r.rows[i] || {};
ok('photo refusals come first, then the back, then titles', at(0).stage === 'photo' && at(1).stage === 'back' && at(2).stage === 'title');
ok('each row keeps its reason, price and link', String(at(0).reason).includes('#25/124') && at(0).price === 150 && /ebay\.com\/itm\/2/.test(at(0).url));
ok('one row per item (the photo refusal is not repeated as a title refusal)', r.rows.filter(x => x.price === 150).length === 1);
ok('an item that is also in listings is not "wrong"', !r.rows.some(x => /translated site/.test(x.title)));
ok('a foreign price keeps its currency', r.rows.some(x => x.currency === 'EUR' && x.price === 12.5));
ok('a source with only a sample still contributes (Yuyu-tei)', r.rows.some(x => x.source === 'yuyutei'));
ok('total counts every refusal the sources report', r.total === 7, 'total ' + r.total);
ctx.REFUSED_MAX = 2;
ok('capped at REFUSED_MAX, total still says how many', ctx.refusedRowsOf(sources, j).rows.length === 2 && ctx.refusedRowsOf(sources, j).total === 7);

console.log('\n  the payload: refused is never counted');
const blp = fnS(S, 'function buildListingsPayload(');
ok('the payload carries refused and refusedTotal', /refused: refused\.rows,/.test(blp) && /refusedTotal: refused\.total,/.test(blp));
ok('count and cheapest are computed from listings only', /count: listings\.length,/.test(blp) && /cheapest: trusted\.length \? trusted\[0\]\.landed/.test(blp)
   && !/refused[\s\S]{0,40}trusted/.test(blp));
ok('the bulky per-source copies are stripped from sources', /delete c\.refusedRows/.test(blp));
const se = fnS(S, 'async function sourceEbay(');
ok('every eBay text-gate refusal keeps price and link (refusedOf)', (se.match(/dropped\.push\(\{ \.\.\.refusedOf\(it\)/g) || []).length === 5
   && !/dropped\.push\(\{ title/.test(se), (se.match(/dropped\.push\(/g) || []).length + ' pushes');
ok('the site layer keeps every refusal up to REFUSED_MAX, one per item (was a 40-row sample)',
   /st\.dropped\.length >= REFUSED_MAX/.test(fnS(S, 'function mergeEbaySite(')) && !/st\.dropped\.length < 40/.test(S));
ok('photo and back refusals are kept in full, not only the 12-row sample',
   /report\.refusedRows \|\| \(report\.refusedRows = \[\]\)/.test(fs.readFileSync(__dirname + '/stampcheck.js', 'utf8'))
   && /backReport\.refusedRows \|\| \(backReport\.refusedRows = \[\]\)/.test(S));

console.log('\n  the page: collapsed, at the end, with reasons');
const pctx = {}; vm.createContext(pctx);
const fnH = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
// fmtCurrency reads the page's currency tables; a plain USD stand-in here.
vm.runInContext('var REFUSED_STAGE = { title: "title", photo: "photo", back: "card back" };' + fnH('liveEsc')
  + 'function fmtCurrency(u){ return "$" + Number(u).toFixed(2); }' + fnH('liveRefusedBlock'), pctx);
let html = '';
try { html = pctx.liveRefusedBlock({ refused: r.rows, refusedTotal: r.total }); } catch (e) { html = 'ERR ' + e.message; }
ok('liveRefusedBlock draws', typeof html === 'string' && html.length > 0 && !/^ERR/.test(html), /^ERR/.test(html) ? html : '');
ok('a <details>, collapsed by default (no open)', /^<details/.test(html) && !/<details[^>]*\bopen\b/.test(html));
ok('the summary says "N listings we believe are wrong"', /7 listings we believe are wrong<\/summary>/.test(html));
ok('each row shows its reason', /photo: photo matches Alakazam EX #25\/124/.test(html) && /title: number 117\/124, wanted 125\/124/.test(html));
ok('…with a link to the listing', /href="https:\/\/www\.ebay\.com\/itm\/4"/.test(html));
ok('it says it is not counted, and how many are not listed', /Not counted in anything above/.test(html) && /more refused/.test(html));
ok('nothing refused: nothing drawn', typeof pctx.liveRefusedBlock === 'function' && pctx.liveRefusedBlock({ refused: [], refusedTotal: 0 }) === '');
const rl = fnH('renderLiveListings');
// T5 added the auction endings: EVERY ending that draws the source note
// draws the refused block before it (at least the original two).
ok('every panel ending appends it after the listings', (rl.match(/liveRefusedBlock\(d\) \+ liveSourceNote\(d\)/g) || []).length >= 2
  && (rl.match(/liveRefusedBlock\(d\) \+ liveSourceNote\(d\)/g) || []).length === (rl.match(/liveSourceNote\(d\)/g) || []).length);
ok('the panel never reads d.refused for a count or a price', !/d\.refused/.test(rl.replace(/liveRefusedBlock\(d\)/g, '')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
