// brand.test.js — the CardZon mark and wordmark (TASK-ui T6, T7, 2026-10-07)
//
//   node brand.test.js
//
// T7: every nav carries the prepared transparent PNG (never logo.jpg, never
// the master), with no coloured plate behind it, at the sizes measured to
// leave the bar's height unchanged: 42px above 640px, 30px at or below.
// T6: the wordmark is a display name only — ids, the cardhunt_db tag and the
// Render hostname are untouched.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');

console.log('\n  T7: the logo');
const navs = H.match(/<nav class="nav">[\s\S]*?<\/nav>/g) || [];
ok('nine navs', navs.length === 9, navs.length);
const logos = navs.map(n => (n.match(/<div class="logo"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
ok('every nav logo is the 96px PNG with the 144px one for 2x',
   logos.every(l => /<img class="logo-i" src="cardzon-logo-96\.png" srcset="cardzon-logo-96\.png 1x, cardzon-logo-144\.png 2x" alt="">/.test(l)), logos.length);
ok('no glyph left in any nav', !/⚡/.test(navs.join('')));
ok('never logo.jpg or the master on the page', !/logo\.jpg|cardzon-logo-master/.test(H.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
const rule = (H.match(/\n\.logo-i\{[^}]*\}/) || [''])[0];
ok('no plate: .logo-i has no background and no border-radius', rule && !/background|border-radius/.test(rule), rule.trim());
ok('42px above 640px', /\n\.logo\{--logo-sz:42px\}/.test(H));
const phone = H.slice(H.indexOf('@media(max-width:640px){\n  .nav{'), H.indexOf('}\n', H.indexOf('.nav-r .tbq{width:auto')) + 2);
ok('30px at or below 640px, inside the nav media block', /\.logo\{--logo-sz:30px\}/.test(phone));
ok('the sign-in panel shows the 256px file', /<div class="llogo"><img class="llogo-i" src="cardzon-logo-256\.png" alt=""><\/div>\s*<div id="auth-body">/.test(H));
const ll = (H.match(/\n\.llogo-i\{[^}]*\}/) || [''])[0];
ok('no plate on the sign-in mark either', ll && !/background|border-radius/.test(ll), ll.trim());
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('the server serves exactly the three prepared PNGs, by name',
   /const LOGO_FILES = \['cardzon-logo-96\.png', 'cardzon-logo-144\.png', 'cardzon-logo-256\.png'\];/.test(S) && !/app\.use\(\s*express\.static/.test(S));

console.log('\n  brand.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
