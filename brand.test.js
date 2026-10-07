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
// ?v=2: the plinth-free mark (2026-10-07) replaced the files under the same
// names, and the route caches a day — the query makes browsers fetch it.
ok('every nav logo is the 96px PNG with the 144px one for 2x, versioned',
   logos.every(l => /<img class="logo-i" src="cardzon-logo-96\.png\?v=2" srcset="cardzon-logo-96\.png\?v=2 1x, cardzon-logo-144\.png\?v=2 2x" alt="">/.test(l)), logos.length);
// The plinth is gone: the files are the C/Z mark alone, wider than tall.
const png = f => { const b = fs.readFileSync(__dirname + '/' + f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
ok('no plinth: each file is the C/Z mark alone (134x96, 201x144, 358x256)',
   String(png('cardzon-logo-96.png')) === '134,96' && String(png('cardzon-logo-144.png')) === '201,144' && String(png('cardzon-logo-256.png')) === '358,256');
ok('a hairline edge per theme: dark on light (the cream Z), light on dark (the deep red C)',
   /--logo-edge:drop-shadow\(0 0 \.6px rgba\(20,22,28,\.7\)\)/.test(H) && (H.match(/--logo-edge:drop-shadow\(0 0 \.6px rgba\(236,237,243,\.55\)\);/g) || []).length === 2
   && /@media\(max-width:900px\)\{\.logo\{--logo-sz:30px\}\}/.test(H)
   && /\.logo-i\{[^}]*filter:var\(--logo-edge\)\}/.test(H) && /\.llogo-i\{[^}]*filter:var\(--logo-edge\)\}/.test(H));
ok('no glyph left in any nav', !/⚡/.test(navs.join('')));
ok('never logo.jpg or the master on the page', !/logo\.jpg|cardzon-logo-master/.test(H.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
const rule = (H.match(/\n\.logo-i\{[^}]*\}/) || [''])[0];
ok('no plate: .logo-i has no background and no border-radius', rule && !/background|border-radius/.test(rule), rule.trim());
ok('42px above 640px', /\n\.logo\{--logo-sz:42px\}/.test(H));
const phone = H.slice(H.indexOf('@media(max-width:640px){\n  .nav{'), H.indexOf('}\n', H.indexOf('.nav-r .tbq{width:auto')) + 2);
ok('30px at or below 640px, inside the nav media block', /\.logo\{--logo-sz:30px\}/.test(phone));
ok('the sign-in panel shows the 256px file', /<div class="llogo"><img class="llogo-i" src="cardzon-logo-256\.png\?v=2" alt=""><\/div>\s*<div id="auth-body">/.test(H));
const ll = (H.match(/\n\.llogo-i\{[^}]*\}/) || [''])[0];
ok('no plate on the sign-in mark either', ll && !/background|border-radius/.test(ll), ll.trim());
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('the server serves exactly the three prepared PNGs, by name',
   /const LOGO_FILES = \['cardzon-logo-96\.png', 'cardzon-logo-144\.png', 'cardzon-logo-256\.png'\];/.test(S) && !/app\.use\(\s*express\.static/.test(S));

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
