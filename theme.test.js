// theme.test.js — T6, 2026-10-06: light and dark mode.
//
// Default follows the device (prefers-color-scheme, via the token layer's own
// block); a toggle overrides it: Auto -> Light -> Dark, kept in localStorage
// per device, never the database. The stored choice is applied by a script in
// the head BEFORE any stylesheet, so a dark-mode visitor never sees a flash.
// Contrast was checked by eye on every screen; what a test CAN hold is the
// structure, and the two classes of rule that broke dark mode:
//   - white text on an accent/status token (the token lightens in dark mode)
//   - a hardcoded light background under token text (the text lightens)
//
//   node theme.test.js
'use strict';
require('./testcount')(16);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ok    ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }
console.log('\n  theme.test.js\n');

const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const head = H.slice(0, H.indexOf('</head>'));

// ── before the first paint ──
const scriptAt = head.indexOf("localStorage.getItem('ch_theme')");
const firstStyle = Math.min(...['<style', '<link rel="stylesheet"', 'rel="preload"'].map(t => { const i = head.indexOf(t); return i < 0 ? Infinity : i; }));
ok(scriptAt > 0, 'the head reads the stored theme');
ok(scriptAt < firstStyle, 'it runs before any stylesheet — no flash of the wrong theme');
ok(/<meta name="color-scheme" content="light dark">/.test(head), 'color-scheme meta: form controls follow the theme');

// The head script, run against a fake document: each stored value -> the attribute
const headScript = head.slice(head.lastIndexOf('<script>', scriptAt) + 8, head.indexOf('</script>', scriptAt));
function runHead(stored, throws) {
  const attrs = {};
  const ctx = { document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
                localStorage: { getItem: () => { if (throws) throw new Error('blocked'); return stored; } } };
  vm.createContext(ctx); vm.runInContext(headScript, ctx);
  return attrs['data-theme'] || null;
}
ok(runHead('dark') === 'dark' && runHead('light') === 'light', 'a stored light/dark choice is applied');
ok(runHead(null) === null, 'nothing stored: no attribute — the device setting decides');
ok(runHead('purple') === null, 'an unknown stored value is ignored');
ok(runHead(null, true) === null, 'a blocked localStorage falls back to the device');

// ── the tokens ──
ok(/@media \(prefers-color-scheme: dark\)\{\s*:root:not\(\[data-theme="light"\]\)\{\s*color-scheme:dark;/.test(H), 'the device preference drives dark unless Light was chosen');
ok(/:root\[data-theme="dark"\]\{\s*color-scheme:dark;/.test(H), 'an explicit Dark choice wins over a light device');

// ── the toggle ──
const nav = H.slice(H.indexOf('id="theme-btn"') - 200, H.indexOf('id="currency-btn"') + 20);
ok(H.indexOf('id="theme-btn"') > 0 && H.indexOf('id="theme-btn"') < H.indexOf('id="currency-btn"') && nav.length < 400,
   'the toggle sits immediately before the currency control');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
const store = {}; const el = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] || null; } };
const btn = { textContent: '', title: '' };
const ctx = { document: { documentElement: el, getElementById: () => btn },
              localStorage: { setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
{ const a = H.indexOf('var THEMES = '); vm.runInContext(H.slice(a, H.indexOf('document.addEventListener', a)), ctx); }
const seq = [];
for (let i = 0; i < 3; i++) { ctx.cycleTheme(); seq.push(ctx.currentTheme() + ':' + (store.ch_theme || '-')); }
ok(seq.join(' ') === 'light:light dark:dark auto:-', 'Auto -> Light -> Dark -> Auto, Auto removing the stored choice: ' + seq.join(' '));
ok(!/fetch\(|\/api\//.test(fn('applyTheme')), 'the choice is never sent to the server');

// ── the two rule classes that broke dark mode ──
const runs = H.match(/[{"'`][^{}"'`]*[}"'`]/g) || [];
const whiteOnToken = runs.filter(r => /background:\s*var\(--(?:t|td|pu|accent|accent-strong|re|gr|am|crit|good|warn|money)\)/.test(r) && /color:\s*(?:#fff\b|#ffffff\b|white\b)/i.test(r));
ok(whiteOnToken.length === 0, 'no white text on an accent or status token (it lightens in dark mode)' + (whiteOnToken.length ? ' — ' + whiteOnToken[0].slice(0, 90) : ''));
const lightUnderToken = runs.filter(r => /background(?:-color)?:\s*(?:#fff\b|#ffffff\b|white\b|#F0F0F5)/i.test(r) && /color:\s*var\(--(?:tx|ink|mu|ink-2)\)/.test(r));
ok(lightUnderToken.length === 0, 'no hardcoded light background under token text' + (lightUnderToken.length ? ' — ' + lightUnderToken[0].slice(0, 90) : ''));
ok(/#main-ac|id="main-ac"/.test(H) && /id="main-ac"[^>]*background:var\(--surface\)/.test(H), 'the search autocomplete paints the surface token, not white');
ok(/\.nav\{[^}]*background:color-mix\(in srgb,var\(--surface\)/.test(H), 'the top bar follows the theme');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
