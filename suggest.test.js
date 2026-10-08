// suggest.test.js — autocomplete reads our cards table, not pokemontcg.io
// (Roy, 2026-10-08).
//
//   node suggest.test.js
'use strict';
require('./testcount')(12);
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  suggest.test.js\n');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const route = S.slice(S.indexOf("app.get('/api/suggest'"), S.indexOf('\n});', S.indexOf("app.get('/api/suggest'")));
const fa = (() => { const i = H.indexOf('async function fetchAutocomplete('); return H.slice(i, H.indexOf('\n}\n', i)); })();

console.log('  the server');
ok('/api/suggest is catalogue (access.optional)', /app\.get\('\/api\/suggest', access\.optional/.test(S));
ok('…declared before /api/search, and not under /api/cards/ (which /api/cards/:cardId would catch)', S.indexOf("app.get('/api/suggest'") > 0 && !/app\.get\('\/api\/cards\/suggest'/.test(S));
ok('it reads cards: names or English names that START with the text', /FROM cards c/.test(route) && /c\.name ILIKE \$1 OR c\.name_en ILIKE \$1/.test(route) && /\+ '%'/.test(route));
ok('LIKE wildcards in what was typed are escaped (% _ and the escape itself)', /q\.replace\(\/\[\\\\%_\]\/g, m => '\\\\' \+ m\)/.test(route));
ok('TCG Pocket stays hidden (digital.visibleSql)', /digital\.visibleSql\('c'\)/.test(route));
ok('no price, no listing, and nothing recorded (a keystroke is not a search)', !/price|listing|search_log|logSearch/i.test(route.replace(/\/\/[^\n]*/g, '')));
ok('two characters at least, sixty at most', /q\.length < 2/.test(route) && /\.slice\(0, 60\)/.test(route));

console.log('\n  the page');
ok('autocomplete asks /api/suggest', /BACKEND\+'\/api\/suggest\?q='\+encodeURIComponent\(val\)/.test(fa));
ok('autocomplete never asks pokemontcg.io', !/\$\{API\}|API\+|pokemontcg/.test(fa));
ok('autocomplete never asks /api/search (it would fill Most searched)', !/\/api\/search/.test(fa));
ok('every value drawn is escaped; the name travels in a data attribute', /liveEsc\(item\.name\)/.test(fa) && /liveEsc\(val\)/.test(fa) && /selectAc\(this\.dataset\.name,this\.dataset\.drop\)/.test(fa) && !/item\.name\.replace/.test(fa));
ok('the old pokemontcg-shaped result list is gone', !/acResults/.test(H));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
