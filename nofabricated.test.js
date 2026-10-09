// nofabricated.test.js — nothing on the page that no source produced (TASK T7)
//   node nofabricated.test.js              the local page
//   node nofabricated.test.js --deployed   ALSO the HTML Render serves at /app
//
// The fourth, fifth ... instances of invented data, after the fake last-sold,
// price graph and position bar. Each block below pins one thing that was on a
// public URL until 2026-09-28:
//   checkout  - asked for an eBay password and a card number, then confirmed
//               an order that was never placed (moved to checkout-disabled.js)
//   login     - accepted any password and "signed in" an invented Alex
//               (moved to login-disabled.js)
//   photos    - our own artwork, sepia'd, presented as a seller's photos
//   near you  - three invented shops with prices of price x .95 / 1.02 / .9
//   sweep     - alert "savings" from Math.random, five invented portfolio
//               holdings, 45 hand-typed Ascended Heroes prices, an est-derived
//               low/high, "Auto-refreshing", a card count 26,000 stale
//
// "Is it gone?" is asserted against the page with comments stripped, because
// the comments recording each removal name what was removed.
'use strict';
require('./testcount')(83);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  cond ? pass++ : fail++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + name + (cond || !detail ? '' : '  — ' + detail));
}

const html = fs.readFileSync(path.join(__dirname, 'cardhunt_preview.html'), 'utf8');
const stripComments = h => h
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const code = stripComments(html);

// Inputs that must never ship. Checked on raw HTML, including strings the
// script would inject — a template literal building <input type="password">
// ships the form just as surely as static markup does.
function sensitiveInputs(h) {
  const found = [];
  if (/<input[^>]*type=["']?password/i.test(h)) found.push('password input');
  if (/<input[^>]*(cc-number|card-?number|class=["']cni)/i.test(h)) found.push('card-number input');
  if (/<label>\s*(Card number|CVV|Expiry)\s*<\/label>/i.test(h)) found.push('card-payment label');
  if (/autocomplete=["']?(cc-|current-password|new-password)/i.test(h)) found.push('payment/password autocomplete');
  return found;
}

console.log('\n  checkout and login — not in the served page at all');
ok('no password or card-number input anywhere in the page', sensitiveInputs(html).length === 0,
  sensitiveInputs(html).join(', '));
for (const fn of ['startCheckout', 'renderCoStep', 'selPM', 'openLoginModal', 'closeLoginModal', 'doLogin'])
  ok(fn + ' is not defined in the page', !new RegExp('function\\s+' + fn + '\\s*\\(').test(code));
for (const fn of ['startCheckout', 'renderCoStep', 'openLoginModal', 'doLogin'])
  ok('...and nothing calls ' + fn, !new RegExp('\\b' + fn + '\\s*\\(').test(code));
ok('no fabricated order confirmation', !/Order confirmed|Order #CH-/.test(code));
ok('no invented signed-in user', !/Alex|class="av">A</.test(code));
ok('no screen named checkout', !/SS\(['"]checkout['"]\)|id="screen-checkout"/.test(code));

for (const f of ['checkout-disabled.js', 'login-disabled.js']) {
  const src = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  ok(f + ' exists — preserved, not deleted', src.length > 1000);
  ok(f + ' says it must not return without a real backend', /MUST NOT RETURN WITHOUT A REAL/.test(src));
  ok(f + ' says it is not loaded or served', /NOT LOADED BY ANY PAGE\. NOT SERVED\./.test(src));
  ok('the page does not load ' + f, html.indexOf(f) < 0);
  let tracked = false;
  try { execSync('git ls-files --error-unmatch ' + f, { stdio: 'ignore' }); tracked = true; } catch (e) {}
  ok(f + ' is tracked in git', tracked, 'git add ' + f);
}
const server = fs.readFileSync('server.js', 'utf8');
ok('server.js never names the disabled files (it serves one page by name)',
  !/checkout-disabled|login-disabled/.test(server));
ok('the preserved checkout still holds the functions (a move, not a loss)',
  /function startCheckout/.test(fs.readFileSync('checkout-disabled.js', 'utf8'))
  && /function renderCoStep/.test(fs.readFileSync('checkout-disabled.js', 'utf8')));

// Compare (Roy, 2026-10-08, TASK-reports-and-pages T1): parked like checkout.
// It never had a second side — the "Choose card to compare" slot went to the
// search screen and nothing came back.
console.log('\n  compare — parked, unreachable, preserved');
ok('no Compare button in the page', !/openCompare|⚖️ Compare|&#9878;&#65039; Compare/.test(html));
ok('no compare overlay or grid in the page', !/id="compare-(overlay|grid)"/.test(html));
ok('openCompare is not defined in the page', !/function\s+openCompare\s*\(/.test(code));
ok('nothing in the page links to the compare overlay', !/compare-overlay|compare-grid|compare-disabled/.test(html));
{
  const src = fs.existsSync('compare-disabled.js') ? fs.readFileSync('compare-disabled.js', 'utf8') : '';
  ok('compare-disabled.js exists and still holds openCompare and its overlay (a move, not a loss)',
    /function openCompare\(/.test(src) && /compare-overlay/.test(src) && /compare-grid/.test(src));
  ok('compare-disabled.js says it is not loaded or served', /NOT LOADED BY ANY PAGE\. NOT SERVED\./.test(src));
  let tracked = false;
  try { execSync('git ls-files --error-unmatch compare-disabled.js', { stdio: 'ignore' }); tracked = true; } catch (e) {}
  ok('compare-disabled.js is tracked in git', tracked, 'git add compare-disabled.js');
  ok('server.js never names compare-disabled.js', !/compare-disabled/.test(server));
  // The only compare route on the server is the PHOTO comparison of a card's
  // own listings (POST /api/listings/:cardId/compare); no card-vs-card endpoint.
  const routes = (server.match(/app\.(?:get|post|put|patch|delete)\('[^']*compare[^']*'/gi) || []);
  ok('the server has no card-compare endpoint (only the photo compare)',
    routes.length === 1 && /\/api\/listings\/:cardId\/compare'/.test(routes[0]), routes.join(', '));
}

// gradeprices (Roy, 2026-10-10): parked like compare. Graded prices cannot be
// derived from eBay under §9.5, so a run spent eBay calls to produce nothing.
// What would be observably different if the guard did nothing: the run would
// reach the network. So the run happens here, under a trap on every way out
// (fetch, http, https, net — pg too), and the trap is made to fire first.
console.log('\n  gradeprices — parked, refuses to run, spends nothing');
{
  const f = 'gradeprices-disabled.js';
  const src = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  ok(f + ' exists and still holds the measuring code (a move, not a loss)',
    /async function listingsFor\(/.test(src) && /async function hotTier\(/.test(src) && /function ebayBlocked\(/.test(src));
  ok(f + ' says it is not loaded, served or run, and must not return reading eBay',
    /NOT LOADED BY ANY PAGE\. NOT SERVED\. NOT RUN/.test(src) && /MUST NOT RETURN READING EBAY/.test(src) && /§9\.5/.test(src));
  ok('the refusal comes before the first require and the first statement of the parked code',
    src.indexOf('process.exit(2);') > 0 && src.indexOf("throw new Error('gradeprices-disabled.js is parked") > src.indexOf('process.exit(2);')
    && src.indexOf("throw new Error('gradeprices-disabled.js is parked") < src.indexOf("require('./gradeprice')"));
  let tracked = false;
  try { execSync('git ls-files --error-unmatch ' + f, { stdio: 'ignore' }); tracked = true; } catch (e) {}
  ok(f + ' is tracked in git (so this runs on a clean checkout)', tracked, 'git add ' + f);
  ok('the old runnable name is gone (gradeprices.js neither on disk nor in the index)',
    !fs.existsSync('gradeprices.js') && !execSync('git ls-files gradeprices.js').toString().trim());
  const os = require('os'), { spawnSync } = require('child_process');
  const mark = path.join(os.tmpdir(), 'gp-trap-' + process.pid + '.txt');
  const trap = path.join(os.tmpdir(), 'gp-trap-' + process.pid + '.js');
  fs.writeFileSync(trap, [
    "const fs = require('fs'); const hit = w => fs.appendFileSync(" + JSON.stringify(mark) + ", w + '\\n');",
    "for (const m of ['http', 'https']) { const x = require(m); const r = x.request, g = x.get;",
    "  x.request = function () { hit(m); return r.apply(this, arguments); }; x.get = function () { hit(m); return g.apply(this, arguments); }; }",
    "const net = require('net'); const c = net.connect; net.connect = net.createConnection = function () { hit('net'); return c.apply(this, arguments); };",
    "if (globalThis.fetch) { const f0 = globalThis.fetch; globalThis.fetch = function () { hit('fetch'); return f0.apply(this, arguments); }; }",
  ].join('\n'));
  const run = (args) => { try { fs.unlinkSync(mark); } catch (e) {}
    const r = spawnSync(process.execPath, ['-r', trap].concat(args), { cwd: __dirname, encoding: 'utf8', timeout: 20000,
      env: Object.assign({}, process.env, { CARDHUNT_API: 'http://127.0.0.1:9' }) });
    return { status: r.status, err: String(r.stderr || ''), hits: fs.existsSync(mark) ? fs.readFileSync(mark, 'utf8').trim() : '' }; };
  const ctl = run(['-e', "fetch('http://127.0.0.1:9/').catch(() => {})"]);
  ok('the trap fires: a plain fetch under it is recorded (else the next check proves nothing)', /fetch/.test(ctl.hits), JSON.stringify(ctl));
  const r = run([f, '--limit=1', '--cards=en-base1-4']);
  ok('running it refuses: exit 2, says it is parked, and makes NO network attempt (no eBay call, no API, no database)',
    r.status === 2 && /is parked/.test(r.err) && /no eBay call was made/.test(r.err) && r.hits === '', JSON.stringify(r));
  const rw = run([f, '--write']);
  ok('...with --write too', rw.status === 2 && rw.hits === '', JSON.stringify(rw));
  let threw = '';
  try { require('./' + f); } catch (e) { threw = e.message; }
  ok('requiring it throws before anything runs', /is parked: nothing may require it/.test(threw));
  const names = execSync('git grep -l -e gradeprices-disabled -e "gradeprices\\.js" -- "*.js" "*.html" "*.cmd" "*.yml"').toString().trim().split(/\r?\n/).filter(Boolean);
  ok('nothing that runs names it: only the file itself and tests', names.every(n => n === f || /\.test\.js$/.test(n)), names.join(', '));
  try { fs.unlinkSync(trap); fs.unlinkSync(mark); } catch (e) {}
}

console.log('\n  photos — the seller’s images, never our artwork dressed up');
const fnSlice = name => {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(code);
  if (!m) return '';
  const re = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/g;
  re.lastIndex = m.index + 1;
  const n = re.exec(code);
  return code.slice(m.index, n ? n.index : code.length);
};
const vl = fnSlice('viewListing'), dp = fnSlice('drawPhotos');
ok('viewListing asks /api/photos', /\/api\/photos\//.test(vl));
ok('viewListing never reads the catalogue artwork', !/images\?*\.(large|small)|S\.currentCard/.test(vl));
ok('no photo is filtered to look like a different photo', !/sepia|brightness\(/.test(vl + dp));
ok('no Buy button from the photos into anything', !/photos-buy-btn/.test(code));
ok('the overlay markup exists', ['photos-overlay', 'photos-title', 'photos-src', 'photo-main', 'photo-grid', 'photos-link']
  .every(id => html.indexOf('id="' + id + '"') >= 0));
// Run the real drawPhotos: what it ALLOWS matters as much as what it blocks.
{
  const els = { 'photo-main': { style: {}, src: '' }, 'photo-grid': { innerHTML: '' } };
  const document = { getElementById: id => els[id] };
  const liveEsc = s => String(s);
  // eslint-disable-next-line no-new-func
  const drawPhotos = new Function('document', 'liveEsc', dp + '; return drawPhotos;')(document, liveEsc);
  drawPhotos(['https://i.ebayimg.com/1.jpg']);
  ok('one photo -> one photo, no strip, nothing padded',
    els['photo-main'].src === 'https://i.ebayimg.com/1.jpg' && els['photo-grid'].innerHTML === '');
  drawPhotos(['https://i.ebayimg.com/1.jpg', 'https://i.ebayimg.com/2.jpg', 'https://i.ebayimg.com/3.jpg']);
  ok('three photos -> all three, in order',
    (els['photo-grid'].innerHTML.match(/<img/g) || []).length === 3
    && els['photo-grid'].innerHTML.indexOf('1.jpg') < els['photo-grid'].innerHTML.indexOf('3.jpg'));
  drawPhotos([]);
  ok('no photos -> nothing drawn, not a stand-in', els['photo-main'].style.display === 'none' && els['photo-grid'].innerHTML === '');
}
const cl = fnSlice('certLine');
ok('Photos is offered on eBay rows with an item id', /l\.source === 'ebay' && l\.itemId/.test(cl) && /viewListing\(this\)/.test(cl));
ok('Verify stays PSA-only inside the same line', /certRowEligible\(l\)/.test(cl));

console.log('\n  near you — the feature stays, the shops do not');
const bml = fnSlice('buildMockListings');
ok('the Near you tab still exists', /setLTab\(this,'local'\)/.test(html));
ok('no invented shop names', !/Dragon's Lair|Gaming Vault|Collector Corner/.test(code));
ok('the local tab computes no price', !/price\s*\*/.test(bml.slice(bml.indexOf("tab==='local'"))));
ok('...and says local shops are coming', /Local card shops are coming/.test(bml));

console.log('\n  sweep — numbers no source produced');
const randoms = (code.match(/Math\.random\(\)/g) || []).length;
// It made the anonymous alerts id; since T6 step 2 (2026-10-06) alerts
// belong to an account and no anon id is made, so the page has none at all.
ok('Math.random() is not called anywhere in the page', randoms === 0, randoms + ' calls');
ok('no "Avg savings found"', !/alert-stat-savings|Avg savings/.test(code));
ok('buildMockListings holds no marketplace price multipliers', !/pct:\s*[0-9.]+/.test(bml) && !/price\*\(row/.test(bml));
ok('the embedded Ascended Heroes list carries no typed-in prices',
  !/ME2PT5_PREMIUM[\s\S]{0,40000}?tcgplayer:\{prices/.test(code.slice(code.indexOf('const ME2PT5_PREMIUM'), code.indexOf('ME2PT5_PREMIUM.forEach'))));
ok('the TCGdex fallback invents no low/high around its estimate', !/est\*0\.65|est\*1\.7/.test(code));

// ── Prices made by multiplying a price by a constant — page AND server ──
// (2026-10-09) The set-cards payload and the server's live TCGdex fallback
// built a "tcgplayer" block of low = price x 0.65, high = price x 1.7 — under
// TCGplayer's name. The check above read only the PAGE, and only the literal
// spelling est*0.65 / est*1.7: `price * 0.65` on the server passed it.
// A: a price-like FIELD computed as something x a constant: never, anywhere.
// B: any price-like VALUE multiplied by a constant other than 100 (a
//    percentage): only the reviewed sites in REVIEWED_MULTIPLIERS, each with
//    why it is not a price claim — a new one fails until someone reviews it.
console.log('\n  prices made by multiplying a price by a constant (page and server)');
const PRICE_FIELD = /\b(low|high|mid|market|marketPrice|lowPrice|highPrice|midPrice|directLow|price|avg\d*|trend|value)\s*:\s*[^,}\n]*?[\w)\]]\s*\*\s*(\d*\.\d+|\d+)\b/i;
const PRICE_VALUE = /\b(price|_price|base|market|est|estimate|headline|landed|cost|value)\b\s*\*\s*(\d*\.\d+|\d+)\b/i;
// Each entry names why it is exempt and who decided; the test prints both.
const REVIEWED_MULTIPLIERS = [
  { re: /getElementById\('alert-price'\)\.value=\(base\*0\.85\)/,
    why: 'the alert form\'s TARGET default — 85% of the headline written into the target-price input the user edits ' +
         'before saving. It is the user\'s own threshold, a starting value for "tell me when it drops to", never shown ' +
         'as a market, low or TCGplayer figure, and stored only as the target the user saves',
    decided: 'Roy, 2026-10-09: kept as the one reviewed exception' },
];
function multiplied(text, file) {
  const out = { fields: [], values: [] };
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(\/\/|\*|<!--)/.test(raw)) return;
    const l = raw.replace(/\/\/.*$/, '');
    if (PRICE_FIELD.test(l)) out.fields.push(file + ':' + (i + 1) + ' ' + l.trim().slice(0, 90));
    const m = PRICE_VALUE.exec(l);
    if (m && m[2] !== '100' && !REVIEWED_MULTIPLIERS.some(r => r.re.test(l))) out.values.push(file + ':' + (i + 1) + ' ' + l.trim().slice(0, 90));
  });
  return out;
}
const scanned = [multiplied(html, 'cardhunt_preview.html'), multiplied(server, 'server.js')];
const fields = [].concat(...scanned.map(s => s.fields)), values = [].concat(...scanned.map(s => s.values));
ok('A: no price-like field is built as a price x a constant (page and server)', fields.length === 0, fields.join(' | '));
ok('B: no price is multiplied by a constant outside the reviewed sites (' + REVIEWED_MULTIPLIERS.length + ' reviewed)', values.length === 0, values.join(' | '));
ok('…and every reviewed site still exists (a stale allowance is removed, not kept)', REVIEWED_MULTIPLIERS.every(r => r.re.test(html) || r.re.test(server)));
ok('…and every reviewed site says why it is exempt and who decided',
  REVIEWED_MULTIPLIERS.every(r => typeof r.why === 'string' && r.why.length > 60 && /\d{4}-\d{2}-\d{2}/.test(r.decided || '')),
  'an entry without both');
for (const r of REVIEWED_MULTIPLIERS) console.log('        exempt: ' + r.why + ' (' + r.decided + ')');
// Made to fire: the server as committed before this fix, and the shape itself.
let before = null;
try { before = multiplied(require('child_process').execSync('git show b0b041a:server.js', { maxBuffer: 1 << 26 }).toString(), 'server.js@b0b041a'); } catch (e) {}
ok('it catches the set page\'s and the fallback\'s invented low/high in server.js as committed before (b0b041a)',
  before && before.fields.length >= 2 && before.fields.some(f => /0\.65/.test(f)) && before.fields.some(f => /1\.7/.test(f)), before ? before.fields.length + ' fields' : 'git show failed');
ok('it catches the shape whatever the variable is called or how it is spaced',
  multiplied('x = { low: +(headlineUsd * 0.65).toFixed(2), high: +(foo*1.7) }', 't').fields.length === 1
  && multiplied('const shown = price * 0.95;', 't').values.length === 1 && multiplied('const pct = price * 100;', 't').values.length === 0);
// ── C: ARITHMETIC on source figures, in every tracked file (Roy, 2026-10-10) ──
// A and B above match ONE shape: a price-like name times a constant. The
// page's pokemontcg.io fallback returned ((b.high + b.low) / 2) — two source
// figures added and halved, no `*`, on a variable called `b` — so it passed
// both, as the x 0.65 / x 1.7 block had passed the literal est*0.65 check
// before it. And A and B read only the page and server.js. C reads every
// tracked file except tests, for four shapes: two price-like figures combined
// by + - * /, a figure and a constant (any operator; a lone * or / 100 is a
// percentage), an average of two, and a median by index. Sort comparators and
// cent rounding are not figures. Every hit is either REVIEWED (why it is not
// a number shown or stored as a price) or OPEN (found, listed, not yet fixed:
// Roy decides) — a new one fails until it is one or the other.
console.log('\n  C: arithmetic on source figures (every tracked file)');
const FIG = String.raw`(?:\b(?:[\w$]+\.)*(?:low|high|mid|market|marketPrice|lowPrice|highPrice|midPrice|directLowPrice|averageSellPrice|trendPrice|avg1|avg7|avg30|price|price_usd|_price|priceUsd|landed|base|est|median|yen|usd)\b(?:\(\))?)`;
const ARITH = {
  'two figures': new RegExp(FIG + String.raw`\s*[-+*/]\s*` + FIG, 'i'),
  'figure and constant': new RegExp(FIG + String.raw`\s*[-+*/]\s*(\d*\.\d+|\d+)\b`, 'i'),
  'average of two': /\([^()]*\+[^()]*\)\s*\/\s*2\b/,
  'median by index': /\[\s*Math\.floor\(\s*[\w.]+\.length\s*\/\s*2\s*\)\s*\]/,
};
function arithmetic(text, file) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(\/\/|\*|<!--)/.test(raw)) return;
    const l = raw.replace(/\/\/.*$/, '');
    if (/\.sort\(|\(a, ?b\) =>/.test(l) || /\*\s*100\)\s*\/\s*100/.test(l)) return;
    const k = Object.keys(ARITH).filter(s => ARITH[s].test(l));
    if (k.length === 1 && k[0] === 'figure and constant' && /[*/]\s*100\b/.test(l)
        && !/[*/]\s*\d/.test(l.replace(/[*/]\s*100\b/g, ''))) return;   // a percentage
    if (k.length) out.push({ at: file + ':' + (i + 1), shapes: k, line: l.trim() });
  });
  return out;
}
const PROPOSED = 'proposed 2026-10-10 (Claude) — not yet confirmed by Roy';
const REVIEWED_ARITHMETIC = [
  { file: 'cardhunt_preview.html', re: /alert-price'\)\.value=\(base\*0\.85\)/, why: 'the alert form\'s target default (REVIEWED_MULTIPLIERS above)', decided: 'Roy, 2026-10-09' },
  { file: 'gradeprice.js', re: /\(\(s\[mid - 1\] \+ s\[mid\]\) \/ 2\)/, why: 'a median of live listing prices, used only inside the server to choose; never shown or stored (§9.5, ebayterms.test.js)', decided: PROPOSED },
  { file: 'gradeprice.js', re: /^b\.median - a\.median\);$/, why: 'the second line of a sort comparator', decided: PROPOSED },
  { file: 'outlier.js', re: /\(s\[m - 1\] \+ s\[m\]\) \/ 2/, why: 'outlier.js\'s median: per card, per view, never shown or stored (§8.1(d), ebayterms.test.js)', decided: 'Roy, 2026-10-08 (the §8.1(d) ruling)' },
  { file: 'outlier.js', re: /stats\.spread = stats\.high && stats\.low/, why: 'a ratio inside the outlier check (how spread a view is), never a price', decided: PROPOSED },
  { file: 'server.js', re: /\(a\.landed - b\.landed\) \|\| \(a\.price - b\.price\)\);$/, why: 'the last line of a sort comparator', decided: PROPOSED },
  { file: 'ingest.js', re: /const delta = card\.price \? \(\(res\.price - card\.price\) \/ card\.price\) \* 100/, why: 'a percentage change printed to the refresh log, never stored or shown', decided: PROPOSED },
  { file: 'ingest.js', re: /medianYen: use\[Math\.floor\(use\.length \/ 2\)\]/, why: 'the Yahoo Auctions median: a median of N real results, stored as yahoojp_N with N in its name (the thin mark reads N) — a measured statistic, labelled', decided: PROPOSED },
  { file: 'ingest.js', re: /const medianYen = use\[Math\.floor\(use\.length \/ 2\)\];/, why: 'the same Yahoo median, for a reverse printing\'s own row', decided: PROPOSED },
];
const OPEN_ARITHMETIC = [
  { file: 'server.js', re: /e\.median = e\.prices\.length \? e\.prices\[Math\.floor\(e\.prices\.length \/ 2\)\]/,
    found: '2026-10-10: /api/ebay/setprobe (tooling, key-protected) returns a median of eBay listing prices per epid — §9.5 says no eBay price median is shown. Listed, not fixed (Roy decides)' },
  { file: 'ingest.js', re: /\.yen \/ 157\)/,
    found: '2026-10-10: Yuyu-tei rows converted at a hardcoded 157 JPY/USD with no rate recorded — fixed by the next commit (fx.js, rate per row)' },
];
const tracked = execSync('git ls-files "*.js" "*.html"').toString().split(/\r?\n/).filter(f => f && !/\.test\.js$|^jptest\.js$|-disabled\.js$/.test(f));
const hits = [].concat(...tracked.map(f => arithmetic(fs.readFileSync(f, 'utf8'), f)));
const known = (h, list) => list.some(r => h.at.startsWith(r.file + ':') && r.re.test(h.line));
const unknown = hits.filter(h => !known(h, REVIEWED_ARITHMETIC) && !known(h, OPEN_ARITHMETIC));
ok('C: no arithmetic on source figures outside the reviewed and open lists (' + tracked.length + ' files, ' + hits.length + ' hits)',
  unknown.length === 0, unknown.map(h => h.at + ' [' + h.shapes.join(', ') + '] ' + h.line.slice(0, 100)).join(' | '));
ok('…every reviewed and open entry still matches a line (a stale entry is removed)',
  REVIEWED_ARITHMETIC.concat(OPEN_ARITHMETIC).every(r => hits.some(h => h.at.startsWith(r.file + ':') && r.re.test(h.line))),
  REVIEWED_ARITHMETIC.concat(OPEN_ARITHMETIC).filter(r => !hits.some(h => h.at.startsWith(r.file + ':') && r.re.test(h.line))).map(r => r.file + ' ' + r.re).join(' | '));
for (const r of OPEN_ARITHMETIC) console.log('        OPEN: ' + r.file + ' — ' + r.found);
let oldPage = null;
try { oldPage = arithmetic(execSync('git show 0aaff72:cardhunt_preview.html', { maxBuffer: 1 << 26 }).toString(), 'page@0aaff72'); } catch (e) {}
ok('C catches the low-high midpoint in the page as committed before (0aaff72)',
  oldPage && oldPage.some(h => h.shapes.includes('average of two') && /b\.high \+ b\.low/.test(h.line)), oldPage ? oldPage.length + ' hits' : 'git show failed');
ok('C catches the shapes whatever the names: (x.low + y.high) / 2, lo * 0.65, a - b on figures, s[Math.floor(s.length / 2)]',
  arithmetic('return ((q.low + q.high) / 2);', 't').length === 1 && arithmetic('const v = q.low * 0.65;', 't').length === 1
  && arithmetic('const d = a.market - b.market;', 't').length === 1 && arithmetic('m = s[Math.floor(s.length / 2)];', 't').length === 1
  && arithmetic('const pct = (now - was) / was * 100;', 't').length === 0 && arithmetic('xs.sort((a, b) => a.price - b.price);', 't').length === 0);

ok('the portfolio holds no invented holdings', /var PORT = \[\];/.test(code) && !/paid:\s*\d/.test(code));
ok('nothing claims to auto-refresh', !/Auto-refreshing/.test(code));
ok('no stale hardcoded catalogue count', !/20,324 cards/.test(code));
ok('no hand-typed hero stats (markets live, real-time, a stale build)',
  !/Markets live|Real-time<\/strong>|v20260822-0833/.test(code));
ok('the hero stats that remain are the two computed ones',
  (code.match(/class="hstat"/g) || []).length === 2 && /id="hstat-sets"/.test(code) && /id="hstat-cards"/.test(code));

// The Search screen's trending tiles (cardTile) drew a "% change", a "PSA
// 9/10" badge and a "deal" flag from a hash of the card id until
// 2026-10-02 — live, and missed by every block above (T1).
console.log('\n  tiles — no badge or movement from a hash of the card id');
{
  const i = code.indexOf('function cardTile(');
  const body = i > 0 ? code.slice(i, code.indexOf('\n}', i)) : '';
  ok('cardTile is defined (the Search trending grid draws with it)', i > 0);
  ok('cardTile computes nothing from the card id\'s characters', body && !/charCodeAt|hash/.test(body), body.slice(0, 120));
  ok('cardTile draws no PSA badge, deal flag or % change', body && !/PSA |b-teal|b-pur|chgSym|%<\/span>/.test(body));
  ok('no `hash %` arithmetic anywhere in the page code', !/\bhash\s*%/.test(code));
}

(async () => {
  if (process.argv.includes('--deployed')) {
    console.log('\n  deployed — the HTML Render actually serves');
    try {
      const r = await fetch('https://cardhunt-backend.onrender.com/app');
      const live = await r.text();
      const stamp = (live.match(/BUILD [0-9]+-[0-9a-f]+-[a-z0-9]+/) || [''])[0];
      console.log('        ' + r.status + ', ' + live.length + ' bytes, ' + stamp);
      ok('deployed /app answers', r.status === 200 && live.length > 100000);
      ok('deployed page: no password or card-number input', sensitiveInputs(live).length === 0,
        sensitiveInputs(live).join(', '));
      ok('deployed page: no checkout or login code', !/function (startCheckout|renderCoStep|doLogin)\b/.test(live));
      ok('deployed page: no invented shops', !/Dragon's Lair|Gaming Vault|Collector Corner/.test(live));
    } catch (e) { ok('deployed /app reachable', false, e.message); }
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  // exitCode, not exit(): exiting with fetch's handles still closing trips
  // a libuv assertion on Windows.
  process.exitCode = fail ? 1 : 0;
})();
