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
require('./testcount')(63);   // assertions in a plain run — fewer fails the file (testcount.js)
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
