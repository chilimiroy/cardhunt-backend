// trending.test.js — what /api/trending ranks, and what it refuses to.
//   node trending.test.js
//
// Tests what the mover rules ALLOW as well as what they block: a filter
// tested only on refusals passes by refusing everything.

require('./testcount')(47);   // assertions in a plain run — fewer fails the file (testcount.js)
const T = require('./trending');
const fs = require('fs');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('\n1. PARAMETERS');
const d = T.parseParams({});
ok('default sort is price high to low', d.sort === 'price-desc');
ok('default window is 7d, stated rather than ambiguous', d.window === '7d');
ok('default language is English', d.lang === 'en');
ok('an unknown sort falls back, never passes through', T.parseParams({ sort: 'x; DROP' }).sort === 'price-desc');
ok('an unknown language falls back', T.parseParams({ lang: "en' OR 1=1" }).lang === 'en');
ok('limit is capped at 60', T.parseParams({ limit: '9999' }).limit === 60);
ok('all four languages are accepted', ['en', 'ja', 'zh-tw', 'zh-cn'].every(l => T.parseParams({ lang: l }).lang === l));
ok('there is NO most-viewed sort — nothing records a view',
  !Object.keys(T.SORTS).some(k => /view/i.test(k)));
ok('every window names its length', Object.keys(T.WINDOWS).every(k => T.WINDOWS[k].label));

console.log('\n2. SQL — measured prices only, one market at a time');
const ps = T.priceSql(T.parseParams({}));
const ms = T.moverSql(T.parseParams({ sort: 'gain-pct' }));
for (const [n, s] of [['price', ps.text], ['movers', ms.text]]) {
  ok(n + ': estimates excluded', /source NOT LIKE 'estimate%'/.test(s));
  ok(n + ': ungraded only', /grade IS NULL/.test(s));
  ok(n + ': language is a bound parameter, not interpolated', /LIKE \$1/.test(s));
}
ok('movers compare the SAME source', /cur\.source = ph\.source/.test(ms.text));
ok('...the same edition — editions are separate markets', /COALESCE\(cur\.edition, ''\) = COALESCE\(ph\.edition, ''\)/.test(ms.text));
ok('...and the same variant', /COALESCE\(cur\.variant, ''\) = COALESCE\(ph\.variant, ''\)/.test(ms.text));
ok('the earlier price is bounded on BOTH sides of the window',
  /<= cur\.recorded_at - make_interval\(days => \$3\)/.test(ms.text)
  && />= cur\.recorded_at - make_interval\(days => \$4\)/.test(ms.text));
const w24 = T.moverSql(T.parseParams({ sort: 'gain-pct', window: '24h' })).values;
ok('a 24h mover cannot rest on points a month apart', w24[2] === 1 && w24[3] <= 2, JSON.stringify(w24));
ok('zh-tw and zh-cn are separate patterns', T.priceSql(T.parseParams({ lang: 'zh-tw' })).values[0] === 'zh-tw-%');

console.log('\n3. RANKING — what is KEPT');
const row = (id, was, now, readings) => ({ id, prev_price: was, price: now, readings: readings == null ? 5 : readings });
const rows = [
  row('gain-big', 100, 180),      // +80%, +$80
  row('gain-small-pct', 1000, 1100), // +10%, +$100
  row('fall', 100, 50),
  row('cheap-gain', 0.40, 0.90),  // under the $1 floor for % sorts
  row('noise', 10, 10.10),        // $0.10 move
  row('suspect', 10, 80),         // 8x
];
let r = T.rankMovers(rows, 'gain-pct');
ok('a genuine % gain is KEPT and ranked first', r.cards[0] && r.cards[0].id === 'gain-big', r.cards.map(c => c.id).join(','));
ok('a genuine smaller % gain is KEPT too', r.cards.some(c => c.id === 'gain-small-pct'));
ok('eligible counts every pair examined', r.eligible === rows.length);
r = T.rankMovers(rows, 'gain-usd');
ok('value sort ranks the larger dollar gain first', r.cards[0].id === 'gain-small-pct', r.cards.map(c => c.id).join(','));
ok('value sorts KEEP a cheap card that moved >= $0.25', r.cards.some(c => c.id === 'cheap-gain'));
r = T.rankMovers(rows, 'fall-pct');
ok('fallers are kept and gains are not', r.cards.length === 1 && r.cards[0].id === 'fall');
ok('a fall reports a negative change', r.cards[0].change === -50 && r.cards[0].change_pct === -50);

console.log('\n4. RANKING — what is refused, and flagged');
r = T.rankMovers(rows, 'gain-pct');
ok('% sorts leave out a card under $1', !r.cards.some(c => c.id === 'cheap-gain') && r.excluded.floor === 1);
ok('a move under $0.25 is noise, not a mover', !r.cards.some(c => c.id === 'noise') && r.excluded.small === 1);
const sus = r.cards.find(c => c.id === 'suspect');
ok('a >5x move is FLAGGED, not removed', sus && sus.suspect === true);
ok('...and sorted after every unflagged card although its % is the largest',
  r.cards[r.cards.length - 1].id === 'suspect');
ok('zero or missing prices never rank', T.rankMovers([row('z', 0, 5), row('n', null, 5)], 'gain-usd').cards.length === 0);

console.log('\n4b. THE % FLOOR AND THE READINGS GUARD (TASK-account-and-bars T3, 2026-10-10)');
ok('the % floor is $10 and the readings minimum 3', T.PCT_MIN_PREV === 10 && T.MIN_READINGS === 3);
r = T.rankMovers([row('at10', 10, 14), row('under10', 9.99, 14), row('dollar', 2, 6)], 'gain-pct');
ok('% sorts KEEP a card at $10 and leave out one at $9.99 or $2', r.cards.map(c => c.id).join() === 'at10' && r.excluded.floor === 2, r.cards.map(c => c.id).join());
ok('value sorts are not floored: the $2 -> $6 card ranks by dollars', T.rankMovers([row('dollar', 2, 6)], 'gain-usd').cards.length === 1);
r = T.rankMovers([row('three', 100, 300, 3), row('two', 100, 300, 2), row('none', 100, 300, undefined)].map(x => x.id === 'none' ? Object.assign(x, { readings: undefined }) : x), 'gain-pct');
ok('3 readings are KEPT; 2 are one bad row away from a fake move, and leave', r.cards.map(c => c.id).join() === 'three', r.cards.map(c => c.id).join());
ok('a row with no readings count is refused — the guard fails closed', r.excluded.readings === 2);
ok('the guard binds the value sorts too', T.rankMovers([row('two', 100, 300, 2)], 'gain-usd').cards.length === 0);
{
  const t = T.moverSql(T.parseParams({ sort: 'gain-pct' })).text;
  ok('moverSql counts the readings on the current end\'s source and printing, unrefused, no asks',
    /AS readings/.test(t) && /rd\.source = cur\.source/.test(t) && /COALESCE\(rd\.edition, ''\) = COALESCE\(cur\.edition, ''\)/.test(t)
    && t.includes(require('./pricehold').notRefusedSql('rd')) &&/COALESCE\(rd\.source_meta->>'basis', ''\) <> 'ask'/.test(t));
  ok('the rule a reader sees names both', /Cards under \$10\.00/.test(T.describeRule(T.parseParams({ sort: 'gain-pct' }))) && /3 or more readings/.test(T.describeRule(T.parseParams({ sort: 'gain-pct' }))));
}

console.log('\n5. WIRING');
const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok('server.js requires trending.js', /require\('\.\/trending'\)/.test(server));
ok('/api/trending is a GET route', /app\.get\('\/api\/trending'/.test(server));
// Bounded by the deals block that follows it (2026-10-08) — that block writes deal_picks.
// From trendingBody (T6, 2026-10-08: the body both trending routes share) to the deals block.
const route = server.slice(server.indexOf('async function trendingBody('), server.indexOf('// BEST DEALS — its own supply'));
ok('the route never writes (no INSERT / UPDATE / DELETE)', !/\b(INSERT|UPDATE|DELETE)\b/.test(route));
ok('the response states the rule it ranked by', /rule: trending\.describeRule/.test(route));
ok('the response says most-viewed is unavailable and why', /most-viewed/.test(route));
let tracked = '';
try { tracked = execSync('git ls-files trending.js', { cwd: __dirname }).toString().trim(); } catch (e) {}
ok('trending.js is TRACKED — the server requires it', tracked === 'trending.js',
  'a required module left untracked crashes the deploy with MODULE_NOT_FOUND');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
