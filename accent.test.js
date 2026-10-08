// accent.test.js — the brand is red (Roy, 2026-10-08, TASK-reports-and-pages T5).
//
// The accent is a token; this pins its values, computes the contrast ratios
// FROM the tokens (so a later edit to a token is measured, not trusted), and
// holds the three things that must not simply become red:
//   - errors and warnings are amber (--warn), not the accent's red
//   - destructive buttons use weight (.btn-destroy) and name the action
//   - --crit / --re are the price-DOWN colour only, on a named list of sites
//
//   node accent.test.js
'use strict';
require('./testcount')(60);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  accent.test.js\n');

const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const style = H.slice(H.indexOf('<style'), H.indexOf('</style>'));

// ── the tokens, per theme ──
const block = (start) => { const i = style.indexOf(start); return i < 0 ? '' : style.slice(i, style.indexOf('}', i)); };
const light = block(':root{');
const darkPref = block(':root:not([data-theme="light"]){');
const darkPick = block(':root[data-theme="dark"]{');
const tok = (b, name) => { const m = new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})').exec(b); return m ? m[1].toUpperCase() : null; };
const THEMES = { light: light, 'dark (device)': darkPref, 'dark (chosen)': darkPick };

ok('light accent is the logo red #C62128', tok(light, 'accent') === '#C62128', tok(light, 'accent'));
ok('both dark blocks carry the same accent', tok(darkPref, 'accent') && tok(darkPref, 'accent') === tok(darkPick, 'accent'), tok(darkPref, 'accent') + ' / ' + tok(darkPick, 'accent'));
ok('both dark blocks carry the same warn', tok(darkPref, 'warn') && tok(darkPref, 'warn') === tok(darkPick, 'warn'));

function lum(h) { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function cr(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hue(h) { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; return x < 0 ? x + 360 : x; }

console.log('\n  contrast, computed from the tokens (text 4.5:1; focus ring and button edge 3:1)');
for (const [name, b] of Object.entries(THEMES)) {
  const T = n => tok(b, n) || tok(light, n);
  const rows = [
    ['link / accent text on the surface', T('accent'), T('surface'), 4.5],
    ['accent text on the page background', T('accent'), T('bg'), 4.5],
    ['accent text on --accent-soft (selected chips)', T('accent'), T('accent-soft'), 4.5],
    ['button text (--accent-ink) on the accent', T('accent-ink'), T('accent'), 4.5],
    ['button text on --accent-strong (hover)', T('accent-ink'), T('accent-strong'), 4.5],
    ['focus ring (accent) against the surface', T('accent'), T('surface'), 3],
    ['amber error text on --warn-soft', T('warn'), T('warn-soft'), 4.5],
    ['amber error text on the surface', T('warn'), T('surface'), 4.5],
    ['destructive button: ink on the surface', T('ink'), T('surface'), 4.5],
    ['destructive button hovered: surface on ink', T('surface'), T('ink'), 4.5],
  ];
  for (const [what, fg, bg, min] of rows) {
    const r = fg && bg ? cr(fg, bg) : 0;
    ok(name + ': ' + what + ' ' + r.toFixed(2) + ':1', r >= min, fg + ' on ' + bg);
  }
  const a = hue(T('accent'));
  ok(name + ': the accent is a red (hue ' + Math.round(a) + ')', a != null && (a < 15 || a > 345));
  const w = hue(T('warn'));
  ok(name + ': --warn is an amber, not a red or a yellow (hue ' + Math.round(w) + ')', w != null && w >= 25 && w <= 45);
}

console.log('\n  no blue left on our accent');
const OLD = ['#25459E', '#1B3478', '#E4E9FB', '#7C97EC', '#A8BCF5', '#232B47', '#2F4BA6'];
const code = H.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
for (const h of OLD) ok('the old accent ' + h + ' is gone', code.toUpperCase().indexOf(h) < 0);
ok('no rgba of the old chart blue or the old purple glow', !/rgba\(\s*(47,\s*75,\s*166|124,\s*58,\s*237)/.test(code));
ok('the price chart reads the accent token (accentColor), not a hex', /borderColor:\s*accentColor\(\)/.test(H) && /function accentColor\(/.test(H));
ok('a theme change redraws an open chart', /function applyTheme[\s\S]{0,700}S\.chart[\s\S]{0,80}initChart\(/.test(H));
ok('form controls (radios, checkboxes) follow the accent, not the browser blue', /:root \{ accent-color: var\(--accent\); \}/.test(style));
ok('focus rings follow the accent', /:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/.test(style));

console.log('\n  errors are amber, destructive is weight');
ok('a failed sign-in notice is amber (msg-warn), never --re', /AUTH\.notice\.bad \? 'role="alert" class="msg-warn"/.test(H) && !/AUTH\.notice\.bad \? 'var\(--re\)'/.test(H));
ok('the alert toast is amber when it failed', /bad \? 'background:var\(--warn-soft\);color:var\(--warn\)/.test(H));
ok('the approve-accounts error is amber', /ADMIN\.error\) h \+= '<div class="msg-warn"/.test(H));
ok('pending / rejected / unconfirmed doors are amber (door-warn)', /el\.classList\.toggle\('door-warn', warn\)/.test(H) && /\.price-door\.door-warn\s*\{[^}]*var\(--warn-soft\)/.test(style));
ok('.btn-destroy: outlined in ink, fills on hover', /\.btn\.btn-destroy\s*\{[^}]*background:\s*transparent[^}]*border:\s*1\.5px solid var\(--ink\)/.test(style)
  && /\.btn\.btn-destroy:hover[^{]*\{[^}]*background:\s*var\(--ink\)/.test(style));
ok('Reject is .btn-destroy and says "Reject account"', /action === 'reject' \? ' btn-destroy'/.test(H) && /'reject', 'Reject account'/.test(H) && !/'reject', 'Reject'\)/.test(H));
ok('deleting an alert is .btn-destroy and says "Delete alert"', /deleteAlert\([^\n]*class="btn sm btn-destroy">Delete alert</.test(H));
ok('no destructive button is painted red', !/deleteAlert[^\n]*color:var\(--re\)/.test(H));

// --crit / --re: price DOWN only. Every remaining use is on this list.
const reUses = (code.match(/[^\n]*var\(--(?:re|crit|crit-soft)\)[^\n]*/g) || []).map(s => s.trim());
const PRICE_DOWN = [/^\.cp\{.*\.dn\{color:var\(--re\)\}/, /id="cd-atl"/, /up\?'var\(--gr\)':'var\(--re\)'/, /pl>=0 \? 'var\(--gr\)' : 'var\(--re\)'/,
  /pos > 66 \? 'var\(--gr\)' : pos < 33 \? 'var\(--re\)'/, /^\.bg2\{.*\.bdn\{background:var\(--crit-soft\)/, /--re:var\(--crit\)/, /--crit:/];
const stray = reUses.filter(s => !PRICE_DOWN.some(re => re.test(s)));
ok('every --re / --crit use is a price-down colour (' + reUses.length + ' uses)', stray.length === 0, stray.map(s => s.slice(0, 90)).join(' | '));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
