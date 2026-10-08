// brand.test.js — the CardZon mark and wordmark (TASK-ui T6, T7, 2026-10-07)
//
//   node brand.test.js
//
// T7: every nav carries the CZ mark drawn clean (cardzon-mark.svg) as ONE
// inline <symbol> its uses point at — no image file, no plate, colours by
// token — at the sizes measured to leave the bar's height unchanged: 42px
// above 900px, 30px at or below (641-900 already overflowed sideways, so
// there the mark may be no wider than the old 42px-wide glyph).
// T6: the wordmark is a display name only — ids, the cardhunt_db tag and the
// Render hostname are untouched.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');

console.log('\n  T7: the logo');
// One bar since 2026-10-08 (TASK-reports-and-pages T7): nine copies had drifted.
const navs = H.match(/<nav class="nav"[^>]*>[\s\S]*?<\/nav>/g) || [];
ok('ONE nav, the shared top bar (was nine copies)', navs.length === 1 && /id="topbar"/.test(navs[0] || ''), navs.length);
const logos = navs.map(n => (n.match(/<div class="logo"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
const USE = '<svg class="logo-i" viewBox="0 0 124 92" aria-hidden="true" focusable="false"><use href="#cz-mark"/></svg>';
ok('every nav logo is the inline mark, a <use> of #cz-mark', logos.every(l => l.startsWith(USE)), logos.length);
const syms = H.match(/<symbol id="cz-mark"[\s\S]*?<\/symbol>/g) || [];
ok('ONE definition of the mark', syms.length === 1, syms.length);
const sym = syms[0] || '';
ok('the symbol is cardzon-mark.svg\'s drawing: its viewBox and both paths',
   /viewBox="0 0 124 92"/.test(sym) && sym.includes('d="M58 22 A 26 26 0 1 0 58 70"') && sym.includes('d="M62 22 H112 L76 70 H116"'));
ok('its colours are the tokens, nothing hardcoded beyond the fallback',
   sym.includes('stroke="var(--cz-c, #C62128)"') && sym.includes('stroke="var(--cz-z, #EBE7DB)"'));
const cz = [...H.matchAll(/--cz-c:(#[0-9A-F]{6}); --cz-z:(#[0-9A-F]{6});/g)].map(m => m[1] + '/' + m[2]);
ok('tokens per theme block: light #C62128/#686858, both dark #C62128/#EBE7DB',
   cz.join(' ') === '#C62128/#686858 #C62128/#EBE7DB #C62128/#EBE7DB', cz.join(' '));
ok('no logo image anywhere on the page: no PNG, no logo.jpg, no master',
   !/cardzon-logo|cardzon-mark[^"]*\.png|logo\.jpg/.test(H.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
ok('no glyph left in any nav', !/⚡/.test(navs.join('')));
const rule = (H.match(/\n\.logo-i\{[^}]*\}/) || [''])[0];
ok('width follows the mark: --logo-sz * 124/92', /width:calc\(var\(--logo-sz\)\*124\/92\)/.test(rule), rule.trim());
ok('no plate: .logo-i has no background and no border-radius', rule && !/background|border-radius/.test(rule));
ok('42px above 900px', /\n\.logo\{--logo-sz:42px\}/.test(H));
ok('30px at 641-900px: 40.4px wide, no wider than the old 42px glyph',
   /@media\(max-width:900px\)\{\.logo\{--logo-sz:30px\}\}/.test(H) && 30 * 124 / 92 <= 42);
const phone = H.slice(H.indexOf('@media(max-width:640px){\n  .nav{'), H.indexOf('}\n', H.indexOf('.nav-r .tbq{width:auto')) + 2);
ok('30px at or below 640px, inside the nav media block', /\.logo\{--logo-sz:30px\}/.test(phone));
ok('the sign-in panel shows the same mark',
   /<div class="llogo"><svg class="llogo-i" viewBox="0 0 124 92" aria-hidden="true" focusable="false"><use href="#cz-mark"\/><\/svg><\/div>\s*<div id="auth-body">/.test(H));
const ll = (H.match(/\n\.llogo-i\{[^}]*\}/) || [''])[0];
ok('no plate on the sign-in mark either', ll && !/background|border-radius/.test(ll), ll.trim());
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('the server serves no logo file, and never the whole folder',
   !/cardzon-logo|cardzon-mark|LOGO_FILES/.test(S) && !/app\.use\(\s*express\.static/.test(S));

console.log('\n  T6: the wordmark');
ok('every nav reads CardZon as ONE span (the flex gap split Card from Hunt)',
   logos.every(l => /<span class="wm">Card<em>Zon<\/em><\/span>$/.test(l.trim())), logos.length);
ok('no CardHunt wordmark left in a nav', !/Card<em>Hunt<\/em>/.test(H));
const tokens = /--brand-card:(#[0-9A-F]{6}); --brand-zon:(#[0-9A-F]{6});/g;
const pairs = [...H.matchAll(tokens)].map(m => m[1] + '/' + m[2]);
ok('a pair per theme block: light, device-dark, chosen-dark', pairs.length === 3, pairs.join(' '));
ok('light: #C62128 / #686858 (cream is 1.24:1 on white)', pairs[0] === '#C62128/#686858');
ok('dark, both blocks: #C54748 / #EBE7DB', pairs[1] === '#C54748/#EBE7DB' && pairs[2] === '#C54748/#EBE7DB');
ok('the wordmark uses only the tokens', /\.logo \.wm\{color:var\(--brand-card\)\}/.test(H) && /\.logo em\{color:var\(--brand-zon\);/.test(H));
// The rename covers everything a person reads; comments may keep the history.
const visible = H.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join('\n');
const left = visible.split('\n').filter(l => /CardHunt/.test(l));
ok('no CardHunt a person can read: title, sign-in heading, approval text, notes, translations', left.length === 0, left.map(l => l.trim().slice(0, 60)).join(' | '));
ok('the page title is CardZon', /<title>CardZon<\/title>/.test(H));
ok('structural names stay: the Render hostname, the cardhunt_db tag',
   /https:\/\/cardhunt-backend\.onrender\.com/.test(H) && /source === 'cardhunt_db'/.test(H));

console.log('\n  brand.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
