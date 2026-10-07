// preserve.test.js — every item on the TASK.md preservation checklist,
// asserted mechanically, so a redesign port cannot drop one silently.
//
//   node preserve.test.js
//   CARDHUNT_API=http://localhost:3001 node preserve.test.js
//   node preserve.test.js --offline        skip the six live-API assertions
//
// ── Why this file exists ──
// When v36 of this page was adopted as the base it added 25 functions and
// DROPPED 8, including the entire old search UI, and nothing reported it. The
// redesign being ported now was built in another chat against API response
// shapes alone: it cannot know about the three served modules, the outlier
// flags, the edition split, the gated-vs-unfiltered labelling or the set-list
// fix, because none of those is visible in the markup.
//
// A checklist run by hand once per phase is the easiest thing in a long task
// to rush. This is the same checklist, run by a machine after every single
// piece.
//
// ── What this file will NOT do ──
// It asserts that the page still DOES these things. It cannot assert that the
// page still LOOKS right; that is the browser pass at the end of each phase,
// and the two are not substitutes for each other.
//
// Read the whole output. A commit in this project was once pushed green
// because only the last four lines were read.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const OFFLINE = process.argv.includes('--offline');
const PAGE = path.join(__dirname, 'cardhunt_preview.html');
const html = fs.readFileSync(PAGE, 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else {
    fail++; fails.push(name);
    console.log('  FAIL  ' + name + (detail ? '  — ' + detail : ''));
  }
}
// Live calls run SIGNED OUT, by decision (Roy, 2026-10-07): priced checks
// SKIP and say why; prices for an approved account are checked by hand.
const get = p => fetch(BASE + p).then(r => r.json()).catch(e => ({ _err: e.message }));

// ── Slice one function's source ───────────────────────────────
// Lifted deliberately from setlist.test.js rather than rewritten. That
// slicer has been wrong twice in opposite directions — a fixed byte count
// that TRUNCATED, and a terminator that OVER-RAN into the next function so a
// positive assertion could pass on code it never read. This is the corrected
// form, and it carries its own assertions below for the same reason it does
// there: everything here depends on it.
const FN_DECL = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/g;
const sliceFn = (src, name) => {
  const decl = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = decl.exec(src);
  if (!m) return '';
  const start = m.index;
  FN_DECL.lastIndex = start + 1;
  const next = FN_DECL.exec(src);
  // Bounded by the NEXT declaration, never by a byte count. A fixed window
  // over-runs into the following function, and then an "is this call gone?"
  // assertion matches that function's own declaration instead.
  return src.slice(start, next ? next.index : Math.min(start + 6000, src.length));
};
const fnSrc = name => sliceFn(html, name);
const fnCode = name => sliceFn(codeOnly, name);
const decls = src => (src.match(/\n(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g) || []);

// ── Two views of the page, because a raw grep lies in both directions ──
//
// codeOnly: comments stripped. An "is this gone?" assertion run against the
// raw file passes or fails on PROSE. renderRealListings(m.listings) was
// deleted and a comment recording the deletion left behind, so
// !/renderRealListings\(m\.listings\)/ reported the ungated writer as still
// present. That is the inspection form of the mistake this project has now
// made three times: a test that reads the comment above the code instead of
// the code. Absence is only ever asserted against this view.
const codeOnly = html
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map(l => (/^\s*\/\//.test(l) ? '' : l))
  .join('\n')
  .replace(/<!--[\s\S]*?-->/g, ' ');

// flatText: the prose a reader actually sees. The page builds it by
// concatenating string literals around HTML tags, so "The results are not
// <strong>checked by us</strong>" contains no contiguous "not checked"
// anywhere in the source. Presence of WORDING is only ever asserted here.
const flatText = html
  .replace(/['"]\s*\+\s*['"]/g, '')     // join ' + ' concatenation
  .replace(/<[^>]+>/g, ' ')             // drop tags
  .replace(/&mdash;|&middot;|&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

console.log('\npreserve.test.js — ' + PAGE);
console.log('  ' + html.length + ' bytes' + (OFFLINE ? '   [offline: live checks skipped]' : '   API ' + BASE));

// ══════════════════════════════════════════════════════════════
console.log('\n0. THE SLICER ITSELF');
// 14 assertions below read source through fnSrc(). If it slices the wrong
// text they report green about code they never looked at.
ok('fnSrc finds a plain function', /^function setLowestFromListings\s*\(/.test(fnSrc('setLowestFromListings')),
  JSON.stringify(fnSrc('setLowestFromListings').slice(0, 40)));
ok('fnSrc finds an async function', /^async function loadLangSets\s*\(/.test(fnSrc('loadLangSets')),
  JSON.stringify(fnSrc('loadLangSets').slice(0, 40)));
ok('fnSrc does not over-run into the next declaration',
  decls(fnSrc('loadAllSets')).length === 0,
  'swallowed: ' + decls(fnSrc('loadAllSets')).join(', '));
ok('fnSrc returns empty for a name that is not there', fnSrc('noSuchFunctionAnywhere') === '');
ok('fnSrc reaches the END of a long function (not truncated)',
  fnSrc('loadAllSets').length > 800 && /sets-fallback-note|fallback/i.test(fnSrc('loadAllSets')),
  fnSrc('loadAllSets').length + ' bytes');

// ══════════════════════════════════════════════════════════════
console.log('\n1. THE THREE SERVED MODULES');
// They are served by server.js and picked up as window.CardMatch /
// window.Estimator / window.GradePrice. A copy pasted inline defeats the
// entire point — that is the estimator split, which had four
// implementations disagreeing by up to 9x on one card.
for (const mod of ['cardmatch', 'estimator', 'gradeprice']) {
  const tag = new RegExp('<script[^>]*\\bsrc=["\'][^"\']*\\b' + mod + '\\.js["\'][^>]*>', 'i');
  const m = html.match(tag);
  ok(mod + '.js is loaded by a <script src> tag', !!m);
  if (m) {
    ok(mod + '.js tag carries async', /\basync\b/.test(m[0]), m[0]);
    // Absolute, not root-relative: under file:// a root-relative
    // "/estimator.js" resolves to the filesystem root, so the offline
    // fallback would load none of the three and drop to its inline tables
    // without saying so.
    ok(mod + '.js src is ABSOLUTE (works from file:// too)',
      /src=["']https?:\/\//i.test(m[0]), m[0]);
  }
}

// ══════════════════════════════════════════════════════════════
console.log('');
console.log('1b. THE WEBFONTS CANNOT BLOCK THE FIRST PAINT');
// The redesign loads three fonts with a plain <link rel="stylesheet">,
// which is render-blocking: nothing paints until fonts.googleapis.com
// answers. On a free tier that already cold-starts for 30-60s, a
// third-party stylesheet in front of the first paint is the difference
// between a slow page and a blank one. A blocking resource has frozen this
// page before.
(function () {
  const links = html.split(String.fromCharCode(60) + String.fromCharCode(108,105,110,107))
    .slice(1).map(function (p) { return String.fromCharCode(60) + String.fromCharCode(108,105,110,107) + p.slice(0, p.indexOf(String.fromCharCode(62)) + 1); })
    .filter(function (l) { return l.indexOf(String.fromCharCode(102,111,110,116,115,46,103,111,111,103,108,101,97,112,105,115)) >= 0; });
  ok('the Google Fonts stylesheet is present', links.length > 0, 'no font link at all');
  const blocking = links.filter(function (l) {
    // Only a STYLESHEET can block paint. preconnect and dns-prefetch are
    // hints and carry no media attribute, and an earlier version of this
    // check reported a preconnect as render-blocking.
    if (l.indexOf('stylesheet') < 0) return false;
    return l.indexOf('media=') < 0 || l.indexOf('print') < 0;
  });
  // The <noscript> copy is allowed to block: with JS off nothing can
  // promote a media=print sheet, and a noscript body does not run here.
  var nsStart = html.indexOf(String.fromCharCode(60,110,111,115,99,114,105,112,116,62));
  var nsEnd = html.indexOf(String.fromCharCode(60,47,110,111,115,99,114,105,112,116,62));
  const inNoscriptRaw = (nsStart >= 0 && nsEnd > nsStart) ? html.slice(nsStart, nsEnd) : String.fromCharCode(32);
  const inNoscript = inNoscriptRaw;
  const reallyBlocking = blocking.filter(function (l) { return inNoscript.indexOf(l) < 0; });
  ok('...and no font stylesheet outside <noscript> blocks paint',
    reallyBlocking.length === 0,
    'blocking: ' + reallyBlocking.join(' | ').slice(0, 160));
  ok('...and it is promoted to all once loaded',
    html.indexOf("this.media='all'") >= 0,
    'media=print without an onload never applies the fonts at all');
  ok('a <noscript> fallback exists for JS-disabled readers',
    inNoscript.indexOf('fonts.googleapis.com') >= 0,
    'otherwise the fonts never load without JS');
  // The page must be READABLE before the webfonts arrive, so every stack
  // names a real system fallback.
  const stacks = html.match(/font-family:[^;}]*/g) || [];
  const bare = stacks.filter(function (f) {
    if (f.indexOf("IBM Plex") < 0 && f.indexOf("Source Serif") < 0) return false;
    return !/serif|sans-serif|monospace|system-ui/.test(f);
  });
  ok('every webfont stack falls back to a system family',
    bare.length === 0,
    'no fallback in: ' + bare.join(' | ').slice(0, 160));
})();

// ══════════════════════════════════════════════════════════════
console.log('\n2. ENGLISH BROWSES OUR SET LIST, NOT POKEMONTCG\'S');
// /api/sets serves 176 sets with pokemontcg.io ids; 33 of them had no alias
// and each lost either its prices or its links. This is also what hid the
// 30th Anniversary sets — they were only ever in that other list.
const loadAll = fnSrc('loadAllSets');
ok('loadAllSets exists', loadAll.length > 0);
ok('loadAllSets calls loadLangSets(\'en\')', /loadLangSets\(\s*['"]en['"]/.test(loadAll),
  'the English path must be the same one ja/zh use');
ok('loadAllSets does NOT browse /api/sets',
  !/apiFetch\(\s*['"]\/api\/sets['"]\s*\)/.test(loadAll),
  'the 176-set pokemontcg list is not what the app can resolve');
ok('no call site anywhere browses /api/sets for the set list',
  !/apiFetch\(\s*['"]\/api\/sets['"]\s*\)/.test(html),
  'found: ' + (html.match(/apiFetch\(\s*['"]\/api\/sets['"]\s*\)/g) || []).join(', '));
ok('EN_SETS is still present as the offline fallback', /EN_SETS\s*=/.test(html));
ok('the fallback ANNOUNCES itself when it is what is showing',
  /sets-fallback-note/.test(html) && /pokemontcg\.io ids/i.test(loadAll),
  'a fallback that says nothing is the failure this checklist exists for');
// Asserting the variable EXISTS is not asserting a retry happens: a break
// test replaced the schedule with [0] — one attempt, no retry at all — and
// this passed. Count the attempts.
const waits = (loadAll.match(/WAITS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const nWaits = waits.split(',').map(x => x.trim()).filter(Boolean).length;
ok('cold-start retry is still there, with MORE THAN ONE attempt',
  nWaits >= 3 && /loadLangSets\(\s*['"]en['"]\s*,/.test(loadAll),
  nWaits + ' attempt(s) scheduled — Render free tier takes 30-60s to wake, '
  + 'and the FIRST visitor is the one most likely to get the broken list');
ok('the retry FORCES past the cached miss after the first try',
  /loadLangSets\(\s*['"]en['"]\s*,\s*i\s*>\s*0\s*\)/.test(loadAll),
  'without the force flag every retry re-reads the same cached empty answer');

// The Home set row is a SECOND place that browses sets, and a second place
// is where the two-set-lists bug comes back. Caught in the browser: it
// called getSetsData(), which falls back to EN_SETS - 121 sets with
// pokemontcg.io ids that openSet() cannot resolve - and its subtitle said
// so in plain sight.
ok('the Home set row reads LANG_SETS, never the EN_SETS fallback',
  fnCode('renderHomeSetRow').indexOf('LANG_SETS') >= 0
  && fnCode('renderHomeSetRow').indexOf('getSetsData') < 0,
  'EN_SETS ids are pokemontcg-shaped and cannot be opened');

// Every set tile must show SOMETHING relevant. TCGdex holds no logo for any
// Japanese or Chinese set, so 229 of 449 have none - they fall back to the
// set first card image, and only to a text tile when there is no artwork
// either (every Simplified Chinese set, and 30th Classic Collection).
ok('the set tile has all three tiers: logo, card image, name tile',
  fnCode('setTileHTML').indexOf('else if (x.lo)') >= 0
  && fnCode('setTileHTML').indexOf('else if (x.sampleImage)') >= 0
  && fnCode('setTileHTML').indexOf('slogtxt') >= 0,
  'a set with no logo must not render an empty box');
// Asserting the STRING appears is not asserting the branch exists: a break
// test changed the condition to else if (false) and this passed, because
// x.sampleImage still appeared in the branch body.
ok('the card image is rendered on its own plate, not as a logo',
  fnCode('setTileHTML').indexOf('class=' + String.fromCharCode(34) + 'scard' + String.fromCharCode(34)) >= 0,
  'a card stretched into a branding slot reads as branding');
ok('the name tile survives as the last resort',
  fnCode('setTileHTML').lastIndexOf('slogtxt') > fnCode('setTileHTML').indexOf('else if (x.sampleImage)'),
  'sets with no artwork at all still need it');

// The header said "49 Japanese" with 138 tiles on screen, because it read
// JP.length - the embedded fallback array - rather than the live list. The
// same bug was fixed for English earlier; this is the other three languages.
ok('the set-count line reads the LIVE list for every language',
  codeOnly.indexOf('function setCountLine') >= 0
  && fnCode('setCountLine').indexOf('LANG_SETS[lang]') >= 0
  && fnCode('setCountLine').indexOf('live ||') >= 0,
  'a break test changed the return to the fallback and this still passed');
// Counting call sites is not counting BUILDERS. The four-language string
// must be assembled in exactly one place; a second copy is what drifted.
// Matched on the rendered SHAPE - the middot separator - so a language
// label map and a prose comment do not count as builders.
ok('...and the four-language string is assembled in exactly ONE place',
  (function () {
    var MID = String.fromCharCode(183);
    var needle = 'English ' + MID;
    var n = 0, i = -1;
    while ((i = codeOnly.indexOf(needle, i + 1)) >= 0) {
      if (codeOnly.slice(i, i + 90).indexOf('Japanese ' + MID) >= 0) n++;
    }
    return n === 1;
  })(),
  'more than one place builds the English/Japanese/Chinese count line');

// The set page shows EVERY card. Roy's spec went one row + See all
// (049ab44) and then back: he preferred the open list. What that round got
// right - consistent tile sizing - stays, so the grid has fixed columns.
ok('the set page draws every filtered card - no See all, no Show less',
  fnCode('applyFilters').indexOf('tiles.join(') >= 0
  && fnCode('applyFilters').indexOf('.slice(0,') < 0
  && !/See all|Show less|seeall/.test(fnCode('applyFilters')),
  'a slice or a See all tile is the single row coming back');
ok('...and nothing still switches between a row and the full list',
  codeOnly.indexOf('function setSdView') < 0 && codeOnly.indexOf('S.sdView') < 0,
  'a view toggle with one view left is dead code aimed at the grid');
ok('tiles are built as an ARRAY, never by splitting HTML',
  fnCode('applyFilters').indexOf('tiles.push(') >= 0
  && fnCode('applyFilters').indexOf('.split(') < 0,
  'splitting on a tile terminator assumes no tile contains it internally');
ok('set tiles keep ONE size - fixed columns, not minmax(…,1fr)',
  fnCode('applyFilters').indexOf("grid.className = 'cgall'") >= 0
  && html.indexOf('.cgall{display:grid;grid-template-columns:repeat(auto-fill,158px)') >= 0,
  'a 1fr column stretches tiles so cards in one set stop matching');

// sd-count had two writers with DIFFERENT meanings - applyFilters wrote
// "filtered of loaded", openSet then wrote "held of printed total" - so a
// set opened reading 295 of 217 and switched to 12 of 295 on the first
// filter. Same element, two meanings, no warning. Same shape as the
// #cd-listings defect, on a different element.
ok('sd-count has exactly one writer',
  (function () {
    var n = 0, i = -1;
    while ((i = codeOnly.indexOf('sd-count', i + 1)) >= 0) {
      if (codeOnly.slice(i, i + 90).indexOf('textContent') >= 0) n++;
    }
    return n === 1;
  })(),
  'two writers of one element is how the listings panel kept breaking');
ok('...and it names the printed total separately, not instead',
  fnCode('applyFilters').indexOf(String.fromCharCode(39) + ' printed' + String.fromCharCode(39)) >= 0,
  'checking the variable exists is not checking it reaches the string');

// The alerts BAR reads /api/alerts (Phase 1a) but every WRITE was local:
// saveAlert pushed onto an array and showed a toast reading "We will notify
// you", pauseAlert flipped a field, deleteAlert spliced. Nothing was saved,
// so a created alert vanished on the next five-minute refresh - after
// promising to watch the card.
ok('creating an alert POSTs to the server',
  fnCode('saveAlert').indexOf('/api/alerts') >= 0
  && fnCode('saveAlert').indexOf('POST') >= 0,
  'a local push is not an alert - nothing evaluates it');
ok('...and claims nothing before the server accepted it',
  fnCode('saveAlert').indexOf('ALERTS.unshift') < 0
  && fnCode('saveAlert').indexOf('loadAlerts()') >= 0,
  'the success toast used to fire whether or not anything was stored');
ok('pause, resume and delete all persist',
  codeOnly.indexOf('function patchAlert') >= 0
  && fnCode('pauseAlert').indexOf('patchAlert') >= 0
  && fnCode('resumeAlert').indexOf('patchAlert') >= 0
  && fnCode('deleteAlert').indexOf('patchAlert') >= 0,
  'a paused alert un-paused itself on the next refresh');
ok('a failed write says so instead of showing the change',
  fnCode('patchAlert').indexOf('alertToast') >= 0,
  'the UI and the database must not disagree silently');

// openCompare() referenced #compare-grid and #compare-overlay and NEITHER
// was in the page, so the Compare button threw "Cannot set properties of
// null" on every click. Code addressing markup that is not there - the v36
// shape exactly, and invisible until someone clicks.
//
// The cd-* check earlier covers the card page. This covers EVERY id the
// script writes to, so the next dropped element is caught wherever it is.
(function () {
  const MARK = String.fromCharCode(103,101,116,69,108,101,109,101,110,116,66,121,73,100,40);
  const parts = codeOnly.split(MARK);
  const asked = {};
  for (let p = 1; p < parts.length; p++) {
    const seg = parts[p].slice(0, 46);
    // The argument must BE a literal: getElementById(id).classList.add('on')
    // has a variable argument, and scanning for the next quote picked up
    // 'on' as an element id. Require the quote to come first.
    if (!/^['"]/.test(seg.replace(/^s+/, ''))) continue;
    const q1 = seg.indexOf(String.fromCharCode(39));
    const q2 = seg.indexOf(String.fromCharCode(34));
    let qi = -1, qc = null;
    if (q1 >= 0 && (q2 < 0 || q1 < q2)) { qi = q1; qc = String.fromCharCode(39); }
    else if (q2 >= 0) { qi = q2; qc = String.fromCharCode(34); }
    if (qi < 0) continue;
    const rest = seg.slice(qi + 1);
    const end = rest.indexOf(qc);
    if (end < 0) continue;
    const id = rest.slice(0, end);
    // Only literal ids. A computed one (screen- + name) cannot be checked
    // statically, and an id the script CREATES is not expected in markup.
    if (id && /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]$/.test(id)) asked[id] = true;
  }
  // Created at runtime rather than declared - note.id = ... - so their
  // absence from the markup is correct.
  const CREATED = codeOnly;
  const names = Object.keys(asked).filter(function (id) {
    return CREATED.indexOf(String.fromCharCode(46,105,100,32,61,32,39) + id) < 0
        && CREATED.indexOf(String.fromCharCode(46,105,100,61,39) + id) < 0;
  });
  const missing = names.filter(function (id) {
    return html.indexOf(String.fromCharCode(105,100,61,34) + id + String.fromCharCode(34)) < 0
        && html.indexOf(String.fromCharCode(105,100,61,39) + id + String.fromCharCode(39)) < 0;
  });
  // KNOWN dropped markup, found by this very check on the day it was
  // written. The photos viewer and the checkout flow are addressed by
  // viewListing() and the checkout steps, and neither modal is in the page
  // - the same defect as Compare, which IS fixed. Pinned so the set cannot
  // GROW while these two are dealt with separately.
  // T7 (2026-09-28): the photos viewer now HAS its markup (real eBay
  // images), and the checkout moved out of the page to checkout-disabled.js.
  // Nothing is known-missing any more, so nothing may be.
  const KNOWN = [];
  const fresh = missing.filter(function (id) { return KNOWN.indexOf(id) < 0; });
  ok('no NEW element id is addressed but missing from the markup ('
    + names.length + String.fromCharCode(41),
    fresh.length === 0,
    'addressed but not in the page: ' + fresh.join(', '));
  ok('...and the known-missing set is empty',
    missing.length <= KNOWN.length,
    'still missing: ' + missing.join(', '));
})();
ok('...and it says so rather than drawing the fallback',
  fnCode('renderHomeSetRow').indexOf('fallback') >= 0,
  'a fallback must announce itself - or in this case, refuse to be used');

// ══════════════════════════════════════════════════════════════
console.log('\n3. NO POKEMONTCG REQUESTS — AS A RATCHET');
// The checklist item is about REQUESTS, not about the string: EN_SETS is a
// sanctioned offline fallback and is full of pokemontcg logo URLs it never
// fetches while the API is reachable.
//
// Measured in the browser on 2026-09-22, BEFORE any porting: 156 occurrences
// of the string, of which 17 become live <img> requests, all from two
// hardcoded demo blocks — #home-trending and #alerts-bar-items. Phase 1a
// replaces both with real data, so this baseline must FALL and must never
// rise. A ratchet, because asserting zero today would fail on the unported
// file and TASK.md requires it to pass on the unported file.
// 140 -> 135 on 2026-09-28: the five PORT demo cards went (TASK T7).
const BASELINE_IMG = 135;      // occurrences of images.pokemontcg.io
const BASELINE_API = 1;        // occurrences of api.pokemontcg.io
const nImg = (html.match(/images\.pokemontcg\.io/g) || []).length;
const nApi = (html.match(/api\.pokemontcg\.io/g) || []).length;
ok('images.pokemontcg.io references do not INCREASE (<= ' + BASELINE_IMG + ')',
  nImg <= BASELINE_IMG, 'now ' + nImg);
ok('api.pokemontcg.io references do not INCREASE (<= ' + BASELINE_API + ')',
  nApi <= BASELINE_API, 'now ' + nApi);
// The two demo blocks are the only things that turn the string into a
// request. Once Phase 1a replaces them this flips to asserting they are gone.
// Phase 1a removed both demo blocks' hardcoded cards, so the ratchet is
// now tight: every remaining occurrence must be a set LOGO inside an
// embedded fallback set list, never a card image on a live path. That is
// the difference between a string the page holds and a request it makes.
// Scanned on codeOnly, so this cannot pass or fail on a COMMENT that
// happens to mention the host — the inspection mistake this project has
// made three times.
//
// Two legitimate homes remain, and each is named rather than waved past:
//   * fallback set lists, where the URL is a set LOGO in a lo:/logo: field
//   * var PORT, the hardcoded Portfolio demo — 5 cards, a screen no phase
//     of this port touches. Pinned at 5 so it cannot grow, and it is the
//     next block of invented data to go.
const portStart = codeOnly.indexOf(String.fromCharCode(118,97,114,32,80,79,82,84));
let portEnd = portStart;
if (portStart >= 0) {
  let depth = 0;
  for (let i = codeOnly.indexOf(String.fromCharCode(91), portStart); i < codeOnly.length; i++) {
    const ch = codeOnly[i];
    if (ch === String.fromCharCode(91)) depth++;
    else if (ch === String.fromCharCode(93)) { depth--; if (!depth) { portEnd = i; break; } }
  }
}
const stray = [];
let inPort = 0;
const RE_PTCG2 = /images.pokemontcg.io/g;
let mm;
while ((mm = RE_PTCG2.exec(codeOnly))) {
  const before = codeOnly.slice(Math.max(0, mm.index - 30), mm.index);
  const isLogoField = before.indexOf(String.fromCharCode(108,111,58)) >= 0
                   || before.indexOf(String.fromCharCode(108,111,103,111,58)) >= 0;
  if (isLogoField) continue;
  if (portStart >= 0 && mm.index > portStart && mm.index < portEnd) { inPort++; continue; }
  stray.push(codeOnly.slice(Math.max(0, mm.index - 60), mm.index + 40).replace(/s+/g, String.fromCharCode(32)));
}
ok('no pokemontcg card image outside the fallback set lists and PORT',
  stray.length === 0, stray.length + ' stray: ' + stray.slice(0, 2).join(' | '));
// T7 (2026-09-28): the five invented holdings are gone. Pinned at zero.
ok('the Portfolio holds no hardcoded demo cards',
  inPort === 0, inPort + ' hardcoded portfolio cards');
ok('the alerts bar no longer holds hardcoded cards',
  !/images\.pokemontcg\.io/.test(html.slice(html.indexOf('function updateAlertsBar'),
                                            html.indexOf('function updateAlertsBar') + 5000)),
  'the +/-3% simulation carried four of them');
ok('Latest searches renders through the SHARED tile, not its own copy',
  /function renderLatestSearches/.test(codeOnly) && /cardSummaryTile\(/.test(fnCode('renderLatestSearches')),
  'two renderers of one structure is how this page got four estimators');
ok('Latest searches stores identity only - never a price',
  !/price|market|landed|usd/i.test(fnCode('pushSearchHistory')),
  'a price in localStorage goes stale and then cannot be told from a live one');

// Found in the browser: My alerts held Charizard at PSA 10 and Latest
// searches held the SAME card at Raw NM, and both printed $51,743.85 - the
// PSA 10 median - while the true Raw NM median was $105 across 25
// listings. 493x out, on the row a buyer reads. The average was cached per
// cardId, but it is a per-card-AND-GRADE quantity: one number standing in
// for the answer to two different questions, which is the /api/market
// defect wearing another hat.
ok('the listing average is keyed by card AND grade',
  codeOnly.indexOf('function listingAvgKey') >= 0
  && fnCode('fillListingAvg').indexOf('listingAvgKey') >= 0
  && fnCode('cardSummaryTile').indexOf('listingAvgKey') >= 0,
  'a card-only key lets a PSA 10 median land in a Raw NM row');
// Asserting the key function is CALLED is not asserting it uses the grade:
// a break test gutted its body to 'return cardId' and this still passed.
ok('...and listingAvgKey actually USES the grade it is given',
  (function () {
    // Bounded by the NEXT declaration, not by a byte count. A 220-char
    // window over-ran into cardListingAvg(cardId, grade), which mentions
    // both words, so a gutted key function still passed. Same over-slicing
    // failure fnSrc itself has had twice.
    const src = fnCode('listingAvgKey');
    return src.indexOf('grade') >= 0 && src.indexOf('cardId') >= 0;
  })(),
  'a key that ignores its grade is a key on the card alone');
ok('the tile does NOT read a grade-less average off the card summary',
  fnCode('cardSummaryTile').indexOf('s.listingAvg') < 0,
  'the card summary has no grade, so a value on it cannot identify its own question');
ok('both home sections pass a grade to the tile',
  fnCode('updateAlertsBar').indexOf('grade: a.grade') >= 0
  && fnCode('renderLatestSearches').indexOf('grade:') >= 0,
  'a tile with no grade falls back to one and mislabels the other');

// ══════════════════════════════════════════════════════════════
console.log('\n4. A NUMBER-MATCHED PRICE ALWAYS WINS');
// /api/market matches on name and set with NO collector number. Ascended
// Heroes carries Pikachu ex at #057 $3.37 and #276 $959.68; the aggregate
// returned $3.17 for both, and renderMarketData pasted it over the headline
// badged "high confidence". The set tile read $959.68 on the same click.
//
// 2026-09-29: the stand-in is gone altogether. The page no longer calls
// /api/market, the server no longer computes a name-matched aggregate, and
// the badge is drawn from the card's own price. The strongest form of
// "a number-matched price always wins" is that nothing else can be shown.
ok('the page never fetches /api/market', !/\/api\/market/.test(codeOnly));
ok('renderMarketData / marketAfterListings / fetchMarketPrice are gone',
  !/function (renderMarketData|marketAfterListings|fetchMarketPrice)\b/.test(codeOnly));
ok('no "name match" headline can be drawn', !/name match/.test(codeOnly));
const upd = fnSrc('updatePrices');
ok('the badge is decided by _priceIsReal, not by a fetched number',
  /_priceIsReal/.test(upd) && /cd-chg/.test(upd) && /matched on collector number/.test(upd));
ok('...and an estimate says so', /estimate/.test(upd));

// ══════════════════════════════════════════════════════════════
console.log('\n5. OUTLIERS ARE FLAGGED, NEVER REMOVED');
// Giratina V #186: $2.08 to $1,114.99 past the gate, a 536x spread, and
// nothing in the $2.08 title to reject. Its PEERS are the evidence.
// A genuine bargain exists, so this flags and never deletes — removal is
// what looksLikeJunk and clean --delete look like when they are wrong.
ok('rows carry a suspect flag', /l\.suspect/.test(html));
ok('flagged rows are GREYED, not dropped', /opacity:\.55|opacity:0?\.55/.test(html),
  'the styling that marks them');
ok('the flag distinguishes implausible from merely cheap',
  /implausible/.test(html), 'two levels, not one');
ok('flagged rows are still RENDERED (never filtered away)',
  !/\.filter\(function\(l\)\{\s*return\s*!l\.suspect/.test(html),
  'a filter that removes them would be the destructive form of this guard');
ok('the headline skips flagged rows AND says so',
  /flagged below, not counted here/.test(html),
  '"cheapest" must not read as a promise it is not making');
ok('cheapestLive is what the headline uses', /cheapestLive/.test(html));
ok('the outlier block reports when it did NOT run',
  /Not applied|not applied/.test(html),
  'a gate that skips silently is how the year check sat dead for weeks');

// ══════════════════════════════════════════════════════════════
console.log('\n6. GATED LISTINGS VS UNFILTERED DEEP LINKS');
// A deep link hands the marketplace a string and shows whatever comes back;
// nothing gates it, because the results never return to us. Roy reported
// towels and fakes, and they were coming from there, sitting beside the
// gated rows looking equally trustworthy.
ok('deep links sit under an UNFILTERED SEARCHES heading', /UNFILTERED/.test(html));
ok('...and say the results are not checked by us',
  /results are not checked by us/i.test(flatText),
  'asserted against the flattened prose, not the raw source');
ok('renderListingFinder owns the listings element',
  /renderListingFinder/.test(codeOnly));
ok('the ungated renderRealListings writer is GONE from #cd-listings',
  !/renderRealListings\(\s*m\.listings\s*\)/.test(codeOnly),
  'two writers, one ungated — whichever returned last won the element');
ok('...and there is no second writer left to call it (renderMarketData gone)',
  !/function renderMarketData\b/.test(codeOnly) && !/renderRealListings\s*\(/.test(codeOnly),
  'the ungated render must not come back through the other writer');
ok('every deep link query goes through cardmatch.buildQuery',
  /cardQuery/.test(html) && /buildQuery/.test(html),
  'nameQ handed the bare card name to Amazon and got towels');

// ══════════════════════════════════════════════════════════════
console.log('\n7. THE LABELS THAT STOP A NUMBER BEING MISREAD');
ok('shop asking prices are labelled ON THE ROW',
  /shop-ask/.test(html) && /shop asking price/.test(html),
  'a row gets rendered far from anything that would otherwise explain it');
ok('editions are kept apart (Shadowless is not Unlimited)',
  /\bedition\b/.test(html), 'p.edition on the aggregate');
ok('estimates are visually distinct from measured prices',
  /_priceIsReal/.test(html) && /\best\b/.test(html));
ok('the set-source note still explains what a set page is showing',
  /setSourceNote/.test(html));

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7c. THE CARD PAGE STILL HAS THE ELEMENTS ITS LOGIC ADDRESSES');
// A layout port moves markup around. openCard(), selGrade(),
// renderMarketData(), updateValueBar(), applyMeasuredGrade() and
// renderListingFinder() all reach this page by getElementById, and a
// renamed or dropped id disconnects the logic from the markup with no
// error at all - the call just returns null and the function carries on.
// That is the v36 adoption failure in miniature.
//
// So this reads the ids the SCRIPT asks for and checks the MARKUP has
// them, rather than trusting a hand-written list to stay current.
(function () {
  const script = codeOnly.slice(codeOnly.indexOf(String.fromCharCode(60) + String.fromCharCode(115,99,114,105,112,116,62)));
  // No regex: every attempt to write one here had its backslashes eaten by
  // a shell layer, which is the escape-mangling bug CLAUDE.md records. A
  // split carries no escapes for anything to eat.
  const asked = {};
  const MARK = String.fromCharCode(103,101,116,69,108,101,109,101,110,116,66,121,73,100,40);
  const parts = script.split(MARK);
  for (let p = 1; p < parts.length; p++) {
    const seg = parts[p].slice(0, 40);
    // The argument must BE a literal: getElementById(id).classList.add('on')
    // has a variable argument, and scanning for the next quote picked up
    // 'on' as an element id. Require the quote to come first.
    if (!/^['"]/.test(seg.replace(/^s+/, ''))) continue;
    const q1 = seg.indexOf(String.fromCharCode(39));
    const q2 = seg.indexOf(String.fromCharCode(34));
    let qi = -1, qc = null;
    if (q1 >= 0 && (q2 < 0 || q1 < q2)) { qi = q1; qc = String.fromCharCode(39); }
    else if (q2 >= 0) { qi = q2; qc = String.fromCharCode(34); }
    if (qi < 0) continue;
    const rest = seg.slice(qi + 1);
    const end = rest.indexOf(qc);
    if (end < 0) continue;
    const id = rest.slice(0, end);
    if (id.indexOf(String.fromCharCode(99,100,45)) === 0) asked[id] = true;
  }
  const names = Object.keys(asked);
  const missing = names.filter(function (id) {
    return html.indexOf(String.fromCharCode(105,100,61,34) + id + String.fromCharCode(34)) < 0;
  });
  ok('every cd-* element the script addresses exists in the markup ('
    + names.length + String.fromCharCode(41),
    missing.length === 0,
    'missing from the page: ' + missing.join(', '));
  ok('...and the script addresses a plausible number of them',
    names.length >= 15, names.length + String.fromCharCode(32) + String.fromCharCode(105,100,115));
})();

// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7d. THE CONDITION FILTER CANNOT MAKE A LISTING VANISH');
// Raw sub-conditions are read from the seller title, because eBay has no
// condition scale for ungraded cards. 49.7% of real titles state nothing,
// so a filter that dropped them would hide most of the market - the
// looksLikeJunk failure in its seventh costume.
(function () {
  const src = codeOnly.slice(codeOnly.indexOf(String.fromCharCode(118,97,114,32,114,111,119,115,32,61,32,100,46,108,105,115,116,105,110,103,115)));
  const win = src.slice(0, 9000);
  // Asserting the WORD appears is not asserting the collection happens: a
  // break test replaced the else-branch with a counter and this still
  // passed, because 'unstated' survives in the declaration and the block.
  ok('unparseable conditions are PUSHED to the unstated group',
    win.indexOf('unstated.push(') >= 0,
    'a listing whose condition cannot be read must be kept, not counted away');
  ok('the unstated group is RENDERED, not merely counted',
    codeOnly.indexOf('function unstatedBlock') >= 0
    && codeOnly.indexOf('unstated.map(liveRow)') >= 0,
    'counting them and not showing them is still hiding them');
  // Declaring it is not calling it. Renaming the declaration alone left
  // this green, because the old name was still a substring of the new one.
  ok('the excluded-count note is declared AND rendered',
    codeOnly.indexOf('function excludedNote()') >= 0
    && codeOnly.split('excludedNote()').length >= 4,
    'a short list must never be mistaken for a thin market');
  ok('the sub-condition filter reads sellerStated, not the grade string',
    win.indexOf('sellerStated') >= 0 && win.indexOf('sellerCondition') >= 0,
    'the gate never rejects on condition - it is a label');
  ok('the filter only applies to Raw (a graded status has a real gate)',
    win.indexOf(String.fromCharCode(83,69,76,46,115,116,97,116,117,115) + " === 'Raw'") >= 0,
    'applying a seller-stated filter to slabs would double-filter them');
})();
ok('the listings panel no longer renders a second grade chip grid',
  codeOnly.indexOf(String.fromCharCode(71,82,65,68,69,95,71,82,79,85,80,83)) < 0,
  'two controls for one setting is two places to disagree about it');
ok('there is exactly ONE grade control on the card page',
  codeOnly.indexOf(String.fromCharCode(99,100,45,103,114,97,100,101,115)) < 0,
  'the flat 16-chip GRADES row is gone - the selector owns the choice');
ok('the selector is drawn when a card opens',
  fnCode('openCard').indexOf('renderSelector()') >= 0,
  'without this the box shows the previous card selection, or nothing');
ok('changing the selection re-renders the listings',
  fnCode('selGrade').indexOf('renderListingFinder') >= 0,
  'otherwise prices and chart move and the listings keep the old grade');
// The listings panel has now had two writers TWICE. The first time it was
// renderMarketData calling renderRealListings(m.listings); the second time
// it was selGrade calling buildMockListings unconditionally after
// renderListingFinder, so the ungated deep-link block overwrote the gated
// rows a moment later and whichever finished last won.
ok('selGrade does not overwrite the gated panel on the live tab',
  fnCode('selGrade').indexOf("S.ltab !== 'live'") >= 0,
  'buildMockListings writes the same element renderListingFinder owns');
ok('the grader-wide wire format never reaches the screen raw',
  codeOnly.indexOf('function gradeText') >= 0
  && fnCode('buildMockListings').indexOf('gradeText(') >= 0,
  'the deep-link block rendered "— PSA * ONLY" to the user');
ok('...including the measured and typical grade headings',
  fnCode('applyMeasuredGrade').indexOf('gradeText(') >= 0
  && fnCode('renderListingFinder').indexOf('gradeText(') >= 0,
  'these two print the grade straight above the price a buyer reads');

// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7b. NO FUNCTION IS DECLARED TWICE');
// renderSets() was declared twice, 162KB apart. The second definition won
// silently and the first had been dead for an unknown length of time -
// editing it would have changed nothing on screen. That is the shape of
// the three 'the fix did not work' reports in CLAUDE.md, and it is exactly
// what a redesign port does by accident: paste the new renderer in and
// leave the old one above it.
(function () {
  const seen = {};
  const dups = [];
  const RE = new RegExp(String.fromCharCode(92) + String.fromCharCode(110)
    + '(?:async' + String.fromCharCode(92) + 's+)?function' + String.fromCharCode(92) + 's+'
    + '([A-Za-z0-9_$]+)' + String.fromCharCode(92) + 's*' + String.fromCharCode(92) + '(', 'g');
  let m;
  while ((m = RE.exec(codeOnly))) {
    seen[m[1]] = (seen[m[1]] || 0) + 1;
    if (seen[m[1]] === 2) dups.push(m[1]);
  }
  ok('every top-level function is declared exactly once',
    dups.length === 0,
    'declared twice: ' + dups.join(', ') + ' - the later one wins, the earlier is dead');
})();
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7d2. THE CARD PAGE IS ROY\'S T4 ARRANGEMENT');
// Moved markup is where ids and writers have broken before, so the
// arrangement itself is asserted, not only that the ids survive.
(function () {
  const g0 = html.indexOf('class="cdgrid"');
  const pos = function (id) { return html.indexOf('id="' + id + '"', g0); };
  // TASK-ui T2 (2026-10-07): the info panel under the image is gone; its
  // fields are in #cd-sub above the image, with the artist moved up.
  ok('the image, the price boxes and the graph share ONE grid; no info panel',
    g0 >= 0 && [pos('cd-img'), pos('cd-mkt'), pos('cd-chart')].every(function (p) { return p > g0; })
    && pos('cd-img') < pos('cd-mkt') && pos('cd-mkt') < pos('cd-chart') && html.indexOf('id="cd-meta"') < 0,
    'image | boxes | graph - in that order');
  ok('...and the selector and listings come AFTER it',
    html.indexOf('id="cd-selector"') > pos('cd-chart') && html.indexOf('id="cd-listings"') > html.indexOf('id="cd-selector"'));
  ok('the price table is gone, and nothing still writes to it',
    codeOnly.indexOf('cd-gpt') < 0 && codeOnly.indexOf('gpt-r') < 0,
    'raw price x a fixed multiplier, labelled as a market avg');
  const info = fnCode('renderCardSub');
  ok('above the image: set, number, year, rarity and artist',
    /set.name/.test(info) && /c.number/.test(info) && /releaseDate/.test(info) && /c.rarity/.test(info) && /id="cd-artist"/.test(info),
    'T2 moved the artist up');
  ok('a Japanese or Chinese set keeps its English name, which only the old panel showed', /set.nameEn && set.nameEn !== set.name/.test(info));
  ok('an absent artist says "not recorded", never a bare dash',
    info.indexOf('not recorded') >= 0);
  const rs = fnCode('renderSelector');
  ok('the condition box has no "more" button - every option is drawn',
    !/>\s*more\b|More</.test(rs) && rs.indexOf('conds.forEach') >= 0);
  ok('Other expands DOWNWARD - graders on a second line, the status row kept',
    rs.indexOf('TOP_STATUSES.forEach') >= 0 && rs.indexOf('selother') > rs.indexOf('TOP_STATUSES.forEach'));
  ok('listing thumbnails are the larger size',
    fnCode('liveRow').indexOf('width:72px;height:100px') >= 0);
})();
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7d3. THE BOXES, THE GRAPH AND THE BAR ARE MEASURED OR SAY NOTHING');
// Until T4b: Lowest listing = price x 0.74, Last sold = price x (0.9 +
// Math.random()*0.1) "2 days ago", a random % "this month", a graph that
// was price x a fixed curve plus Math.random(), and a position bar whose
// "52w" low and high were price x 0.67 and x 1.35 - every card at 48.5%.
(function () {
  const fns = ['updatePrices', 'initChart', 'updateValueBar', 'fillHistStats', 'setR', 'selGrade'];
  const rnd = fns.filter(function (f) { return /Math\.random/.test(fnCode(f)); });
  ok('no card-page price function calls Math.random', rnd.length === 0, 'in: ' + rnd.join(', '));
  ok('the synthetic curve is gone (genPD, PD, the All-conditions chart)',
    codeOnly.indexOf('function genPD') < 0 && !/\bconst PD\s*=/.test(codeOnly)
    && codeOnly.indexOf('function showAllConditionsChart') < 0);
  ok('updatePrices writes no multiple of the price into Lowest / Last sold',
    !/base\s*\*\s*\.?\d/.test(fnCode('updatePrices')));
  ok('the position bar has no invented low/high multipliers',
    !/0\.67|1\.35|\*\s*0\.6/.test(fnCode('updateValueBar')) && fnCode('updateValueBar').indexOf('HIST') >= 0);
  ok('Lowest listing is the GATED cheapest, set where the panel gets its answer',
    fnCode('renderLiveListings').indexOf('setLowestFromListings(d, grade)') >= 0
    && fnCode('setLowestFromListings').indexOf('cheapestLive') >= 0);
  // ...and nothing else puts a number there: the by-name lowest from
  // /api/market was the other writer, deleted 2026-09-29.
  const lowWriters = [...codeOnly.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)]
    .map(m => m[1]).filter(f => /getElementById\('cd-low'\)/.test(fnCode(f)));
  ok('only updatePrices (clears) and setLowestFromListings (gated) write #cd-low',
    lowWriters.includes('setLowestFromListings')      // not vacuous: it found the real writer
    && lowWriters.every(f => f === 'updatePrices' || f === 'setLowestFromListings'), lowWriters.join(', '));
  ok('the graph draws /api/history', fnCode('loadHistory').indexOf('/api/history/') >= 0);
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const h = server.slice(server.indexOf("app.get('/api/history/:cardId'"));
  ok('/api/history excludes estimates and keeps markets apart',
    h.indexOf("source NOT LIKE 'estimate%'") >= 0 && h.indexOf('GROUP BY 1, 2, 3, 4') >= 0);
})();
// ══════════════════════════════════════════════════════════════
console.log('');
console.log('7e. #cd-listings HAS EXACTLY ONE WRITER');
// This defect has been fixed three times and reintroduced twice.
//
//   1. renderMarketData called renderRealListings(m.listings) - ebayActive()
//      on a NAME query, no title gate. Giratina V #130's panel led with a
//      Magnezone V while the gated endpoint had 73 correct rows.
//   2. selGrade called renderListingFinder() and then buildMockListings()
//      unconditionally. buildMockListings writes the SAME element and is
//      synchronous, so it always won: Charizard at PSA + All showed the
//      ungated deep-link block.
//
// CLAUDE.md records it and that has not stopped it. So this asserts the
// structure rather than the intention: a call graph, not a grep for a
// comment saying the rule is understood.
(function () {
  // ── Build a call graph from the page ──
  // Every top-level function, and which other top-level functions its body
  // names. Crude but sufficient: a name appearing in a body is treated as a
  // call, which over-approximates and therefore never MISSES an edge.
  const fnNames = [];
  const bodies = {};
  const DECL = new RegExp(String.fromCharCode(92) + 'n(?:async'
    + String.fromCharCode(92) + 's+)?function' + String.fromCharCode(92) + 's+'
    + '([A-Za-z0-9_$]+)' + String.fromCharCode(92) + 's*'
    + String.fromCharCode(92) + '(', 'g');
  let m;
  const starts = [];
  while ((m = DECL.exec(codeOnly))) starts.push({ name: m[1], at: m.index });
  starts.forEach(function (s, i) {
    const end = (i + 1 < starts.length) ? starts[i + 1].at : codeOnly.length;
    fnNames.push(s.name);
    bodies[s.name] = codeOnly.slice(s.at, end);
  });

  ok('the call graph found the card page functions',
    bodies.renderListingFinder && bodies.buildMockListings && bodies.selGrade,
    'missing: ' + ['renderListingFinder', 'buildMockListings', 'selGrade']
      .filter(function (n) { return !bodies[n]; }).join(', '));

  function calls(fn, target) {
    const b = bodies[fn];
    if (!b) return false;
    return b.indexOf(target + String.fromCharCode(40)) >= 0;
  }

  // ── 1. Who writes the element at all? ──
  const HANDLE = String.fromCharCode(39) + 'cd-listings' + String.fromCharCode(39);
  const HANDLE2 = String.fromCharCode(34) + 'cd-listings' + String.fromCharCode(34);
  const writers = fnNames.filter(function (n) {
    const b = bodies[n];
    if (b.indexOf(HANDLE) < 0 && b.indexOf(HANDLE2) < 0) return false;
    return b.indexOf('.innerHTML') >= 0;
  });
  // openCard writes the loading spinner before any renderer runs, which is
  // initialisation, not a competing render. buildMockListings serves the
  // Recent sales and Near you tabs. renderListingFinder owns the live tab.
  const ALLOWED = ['openCard', 'buildMockListings', 'renderListingFinder'];
  const unexpected = writers.filter(function (n) { return ALLOWED.indexOf(n) < 0; });
  ok('no unexpected function writes #cd-listings',
    unexpected.length === 0,
    'writers: ' + writers.join(', ') + ' | unexpected: ' + unexpected.join(', '));

  // ── 2. The ungated renderer has no callers ──
  // renderRealListings renders whatever it is handed. It is kept for a
  // caller that has GATED rows; today nothing calls it, and anything that
  // starts to is the first defect returning.
  const callers = fnNames.filter(function (n) {
    return n !== 'renderRealListings' && calls(n, 'renderRealListings');
  });
  ok('renderRealListings - the ungated renderer - has NO callers',
    callers.length === 0,
    'called from: ' + callers.join(', '));

  // ── 3. Anything reaching renderListingFinder must not also let
  //       buildMockListings run unguarded ──
  const LIVE_GUARD = String.fromCharCode(39) + 'live' + String.fromCharCode(39);
  const both = fnNames.filter(function (n) {
    return calls(n, 'renderListingFinder') && calls(n, 'buildMockListings');
  });
  const unguarded = both.filter(function (n) {
    const body = bodies[n];
    const callAt = body.indexOf('buildMockListings' + String.fromCharCode(40));
    if (callAt < 0) return false;
    // Two shapes are both correct, and an earlier version of this check
    // only understood the first - it reported setLTab as unguarded when
    // setLTab early-returns for the live tab, which is the cleaner form.
    //
    //   inline:       if (S.ltab !== live) buildMockListings(...)
    //   early return: if (tab === live) { render...; return; } buildMockListings(...)
    const callLine = body.slice(body.lastIndexOf(String.fromCharCode(10), callAt), callAt);
    const inlineGuard = callLine.indexOf('ltab') >= 0 && callLine.indexOf(LIVE_GUARD) >= 0;
    const before = body.slice(0, callAt);
    const liveAt = before.lastIndexOf(LIVE_GUARD);
    const earlyReturn = liveAt >= 0
      && before.indexOf('return', liveAt) >= 0
      && before.indexOf('return', liveAt) < callAt;
    return !(inlineGuard || earlyReturn);
  });
  ok('every function calling BOTH renderers guards the ungated one by tab',
    unguarded.length === 0,
    'unguarded in: ' + unguarded.join(', ')
    + ' (functions calling both: ' + both.join(', ') + ')');

  // The guard is only meaningful if such a function actually exists - if
  // selGrade stopped calling renderListingFinder the check above would pass
  // vacuously, and the listings would stop following the selector.
  ok('...and selGrade is one of them (or the panel stops following the selector)',
    both.indexOf('selGrade') >= 0,
    'functions calling both: ' + both.join(', '));
})();


console.log('\n8. THE BUILD STAMP');
// Three separate "the fix didn't work" reports were a stale browser build.
const stamp = (html.match(/BUILD\s+([0-9]{8})-([0-9a-f]{7,})(?:-[\w.]+)?/) || []);
ok('a build stamp is present', stamp.length > 0, 'expected BUILD <date>-<sha>');
let headSha = '';
try { headSha = execSync('git rev-parse --short=7 HEAD', { cwd: __dirname }).toString().trim(); } catch (e) {}
if (stamp.length && headSha) {
  // Not an equality check: the stamp is bumped as part of the commit, so it
  // names the commit BEFORE this one until the port lands. What must not
  // happen is a stamp that never moves while the file does.
  const pageChanged = (() => {
    try { return execSync('git status --porcelain cardhunt_preview.html', { cwd: __dirname }).toString().trim().length > 0; }
    catch (e) { return false; }
  })();
  ok('if the page is modified, the stamp has been bumped to match',
    !pageChanged || stamp[2] === headSha || process.env.PRESERVE_ALLOW_STALE_STAMP,
    'page modified but stamp still ' + stamp[2] + ' while HEAD is ' + headSha
    + ' — bump it, or set PRESERVE_ALLOW_STALE_STAMP=1 for a work-in-progress run');
}

// ══════════════════════════════════════════════════════════════
// 9. LIVE — the two paths that must agree
// ══════════════════════════════════════════════════════════════
(async () => {
  if (!OFFLINE) {
    console.log('\n9. LIVE API — the set list the app can actually resolve');
    const sets = await get('/api/sets/lang/en');
    ok('/api/sets/lang/en answers', !sets._err && Array.isArray(sets.sets), sets._err);
    if (sets.sets) {
      ok('it is served from our database', sets.source === 'cardhunt_db', String(sets.source));
      const ours = sets.sets.filter(s => /^(sv|swsh|me|base|ex|xy|bw|dp|hgss|col|lc|pl|sm|b1|b2|a1|a2|a3|a4|30th|tk|np|pop|cel|neo|gym|si|ru)/i.test(s.id));
      ok('set ids are ours, not pokemontcg\'s (no sv3pt5 / base6 / swsh35)',
        !sets.sets.some(s => /^(sv3pt5|base6|swsh35|swsh12pt5gg)$/.test(s.id)),
        'found pokemontcg-shaped ids');
      ok('the 30th Anniversary sets are in the browsable list',
        sets.sets.some(s => s.id === '30th') && sets.sets.some(s => s.id === '30th-c'),
        'T0 — they must not disappear again');
    }

    console.log('\n10. LIVE API — card page and set tile cannot disagree');
    // Ascended Heroes Pikachu ex: #057 $3.37 and #276 $959.68 both read
    // $3.17 from the name-matched aggregate. The endpoint is fixed; this
    // asserts it stays fixed.
    for (const id of ['en-base1-4', 'en-swsh11-186']) {
      const card = await get('/api/cards/' + id);
      const d = card && card.data;
      ok(id + ' resolves', !!d && d.id === id, card._err || JSON.stringify(card).slice(0, 120));
      if (d && card.pricesWithheld) {
        // The door (2026-10-07): signed out, the card answers with no price at
        // all and says why. This run has no approved token, so the price flag
        // itself cannot be checked here — said, not passed.
        ok(id + ' signed out: no price field, and the answer says prices are withheld',
          !Object.keys(d).some(k => /price|tcgplayer|cardmarket/i.test(k)) && /approved/i.test(String(card.pricesWithheld)),
          Object.keys(d).join(','));
        console.log('  SKIP  ' + id + ' real-vs-estimate flag — prices withheld signed out; checked by hand for an approved account (no test credentials, by decision)');
      } else if (d) {
        ok(id + ' carries an explicit real-vs-estimate flag',
          typeof d._priceIsReal === 'boolean',
          '_priceIsReal is what the UI badges');
      }
      if (d) {
        ok(id + ' carries its set release (the year gate reads it)',
          !!(d.set && d.set.releaseDate),
          'setYear was null on every live route for weeks because of this');
      }
    }

    console.log('\n11. LIVE API — a source with no rejection count has not run the gate');
    const lst = await get('/api/listings/en-swsh11-186?dryRun=1');
    ok('/api/listings answers', !lst._err, lst._err);
    if (lst && lst.sources) {
      ok('every unavailable source states a reason',
        Object.values(lst.sources).every(s => s.status !== 'unavailable' || !!s.reason),
        'the UI offers these marketplaces and must explain each');
    }
  }

  // ════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(64));
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\n  FAILED:');
    fails.forEach(f => console.log('    - ' + f));
    console.log('\n  A checklist item was lost. Revert to the last commit rather');
    console.log('  than untangling it — every commit here is a known-good state.');
  }
  console.log('='.repeat(64) + '\n');
  process.exit(fail ? 1 : 0);
})();
