// printrun.test.js — 1st Edition, Shadowless and Unlimited as separate
// markets, and ONLY on the sets where they exist.
//
//   node printrun.test.js
//
// Base Set Charizard, Raw, live 2026-09-26: one list of 33 from $21 to
// $232, with the API already knowing editionsFound ["Unlimited",
// "1st Edition"] and the page rendering none of it. A 1st Edition and an
// Unlimited Charizard sell 10x+ apart; one list with one median describes
// neither.
//
// Asserted:
//   1. which sets get print runs — the ten TCGdex reports first-edition
//      cards for, and no others (a 2026 set gets none)
//   2. every row lands in exactly one group, nothing dropped, order kept
//      (so flagged rows stay last), and each run has its own median
//   3. a flagged-implausible row never moves a run's median
//   4. the page calls the grouping, and falls back to one list

const gp = require('./gradeprice');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}

console.log('\n1. WHICH SETS HAVE PRINT RUNS\n');
ok('Base Set: 1st Edition, Shadowless, Unlimited',
   JSON.stringify(gp.printRunsFor('base1', 'en')) === '["1st Edition","Shadowless","Unlimited"]');
for (const s of ['base2', 'base3', 'base5', 'gym1', 'gym2', 'neo1', 'neo2', 'neo3', 'neo4']) {
  ok(`${s}: 1st Edition and Unlimited, no Shadowless`,
     JSON.stringify(gp.printRunsFor(s, 'en')) === '["1st Edition","Unlimited"]');
}
// The sets a date rule would have got wrong: all pre-2003, none with a 1st Ed.
for (const s of ['base4', 'lc', 'ecard1', 'ecard2', 'ecard3', 'basep', 'si1']) {
  ok(`${s}: no print runs (pre-2003, never had a 1st Edition)`, gp.printRunsFor(s, 'en').length === 0);
}
for (const s of ['30th', '30th-c', 'me02.5', 'sv10', 'cel25cc']) {
  ok(`${s}: modern — no print runs`, gp.printRunsFor(s, 'en').length === 0);
}
ok('a Japanese Base Set id gets none (unchecked, so not offered)', gp.printRunsFor('base1', 'ja').length === 0);
ok('byPrintRun returns null for a modern set — the page shows one list',
   gp.byPrintRun([{ edition: '1st Edition', price: 5, live: true }], 'sv10', 'en') === null);

console.log('\n2. SEPARATE MARKETS, NOTHING DROPPED\n');
const L = (title, landed, edition, extra) => Object.assign(
  { title, price: landed, landed, shippingKnown: true, live: true, listingType: 'fixed', edition }, extra || {});
const rows = [
  L('Charizard 4/102 Base Set Unlimited Holo', 240, 'Unlimited'),
  L('1st Edition Charizard 4/102 Base Set', 9000, '1st Edition'),
  L('Charizard 4/102 Base Set Holo', 105, null),
  L('Shadowless Charizard 4/102', 1500, 'Shadowless'),
  L('Charizard 4/102 Base Set Unlimited', 260, 'Unlimited'),
  L('1st Edition Charizard 4/102 Holo', 11000, '1st Edition'),
  L('Charizard 4/102 Base Set Unlimited', 250, 'Unlimited'),
  L('Charizard 4/102 Holo 4th Print UK', 400, '4th Print'),
  L('1st Edition Charizard 4/102 PROXY-looking', 6.6, '1st Edition', { suspect: 'implausible' })
];
const g = gp.byPrintRun(rows, 'base1', 'en');
const by = Object.fromEntries(g.map(x => [x.run, x]));
ok('groups in order: 1st Edition, Shadowless, Unlimited, other, not stated',
   g.map(x => x.run).join('|') === '1st Edition|Shadowless|Unlimited|4th Print|' + gp.RUN_NOT_STATED,
   g.map(x => x.run).join('|'));
ok('every row lands in exactly one group',
   g.reduce((a, x) => a + x.count, 0) === rows.length);
ok('Unlimited has its own median ($250)', by['Unlimited'].median === 250, by['Unlimited'].median);
ok('1st Edition has its own median, 10x+ Unlimited', by['1st Edition'].median === 10000, by['1st Edition'].median);
ok('the unstated row is kept, in its own group, not folded into Unlimited',
   by[gp.RUN_NOT_STATED].count === 1 && by[gp.RUN_NOT_STATED].unstated === true);
ok('a print run the list does not name (4th Print) is kept under its own name',
   by['4th Print'] && by['4th Print'].count === 1);
ok('within a group, input order is kept (flagged row stays last)',
   by['1st Edition'].rows[by['1st Edition'].rows.length - 1].suspect === 'implausible');

console.log('\n3. A FLAGGED ROW DOES NOT MOVE A MEDIAN\n');
ok('the $6.60 implausible 1st Edition row is shown but not priced',
   by['1st Edition'].count === 3 && by['1st Edition'].priced === 2);
ok('a run with two priced rows says it is thin', by['1st Edition'].thin === true);
{
  const empty = gp.byPrintRun([L('Charizard 4/102', 100, null)], 'base1', 'en');
  ok('an empty run is still listed, with no median, rather than vanishing',
     empty.find(x => x.run === 'Shadowless').count === 0 && empty.find(x => x.run === 'Shadowless').median === null);
}

console.log('\n4. THE PAGE USES IT\n');
{
  const html = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
  const start = html.indexOf('function livePrintRuns(');
  const body = html.slice(start, html.indexOf('\nfunction ', start + 10));
  ok('livePrintRuns exists', start > 0);
  ok('it asks gradeprice.byPrintRun — one definition of which sets qualify',
     /GP\.byPrintRun\(/.test(body));
  ok('it falls back to one flat list when there are no runs',
     /if \(!groups\) return rows\.map\(liveRow\)\.join\(''\)/.test(body));
  ok('renderListingFinder renders live rows through it',
     /html \+= livePrintRuns\(live\)/.test(html));
  ok('no set list is pasted into the page',
     !/'neo4'/.test(html.slice(start, start + 4000)));
}

console.log('\n5. FILTER FIRST, GROUP AFTER (T2, 2026-10-04)\n');
// Base Set Charizard Raw, eBay US, 2026-10-04, as served: the price check
// (reference $944.53) had flagged the gold replicas and the modern Charizard
// ex titled "4/102 Base Set", and the page still grouped them — "Print run
// not stated — median $228.69, from $35.99", while the headline skipped them.
{
  const html = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8');
  const vm = require('vm');
  const fnSrc = name => { const s = html.indexOf('function ' + name + '('); return s < 0 ? '' : html.slice(s, html.indexOf('\nfunction ', s + 10)); };
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fnSrc('partitionLive'), ctx);
  ok('partitionLive exists in the page', typeof ctx.partitionLive === 'function');
  const R = (t, p, suspect, edition, live) => ({ title: t, price: p, landed: p, live: live !== false, suspect: suspect || null, edition: edition || null });
  const rows = [
    R('Pokémon TCG Charizard 4/102 Base Set Holo Rare 120HP ENG Mitsuhiro Arita', 4.97, 'implausible'),
    R('The Pokémon Company Charizard Base Set 4/102 Holo Rare Stage 2 EN Arita', 25.5, 'implausible'),
    R('Pokémon TCG Charizard Base Set 4/102 Holo Rare English Stage 2 120 HP Arita', 35.99, 'unusually-cheap'),
    R('The Pokémon Company Charizard 4/102 Base Set Holo Rare English Arita', 39.99, 'unusually-cheap'),
    R('Nintendo Charizard 4/102 Base Set 1999 Metal Holo Rare English Pokemon TCG', 47, 'unusually-cheap'),
    R('Charizard 4/102 Base Set Holo Rare Pokémon TCG Card 120 HP English', 105),
    R('Charizard 4/102 Base Set 120HP', 150),
    R('Pokemon TCG Charizard 4/102 Base Set Holo Rare English 120 HP', 200),
    R('1999 Pokemon Base Set Unlimited Charizard 4/102 MP PKL', 385, null, 'Unlimited'),
    R('Shadowless Base Set Charizard Holo 4/102 English 1999', 2000, null, 'Shadowless'),
    R('Charizard 4/102 Base Set ended', 300, null, null, false),
  ];
  const p = ctx.partitionLive ? ctx.partitionLive(rows) : { live: [], liveFlagged: [], ended: [] };
  ok('every row lands in exactly one part', p.live.length + p.liveFlagged.length + p.ended.length === rows.length);
  ok('no flagged row reaches the rows that are grouped', p.live.every(l => !l.suspect), p.live.filter(l => l.suspect).map(l => l.price).join(','));
  ok('the five flagged rows are drawn apart', p.liveFlagged.length === 5);
  const g = gp.byPrintRun(p.live, 'base1', 'en');
  const ns = g.find(x => x.unstated);
  ok('"Print run not stated" starts at the first unflagged row ($105), not a replica ($35.99)', ns.low === 105, 'low ' + ns.low);
  ok('…and its median is of unflagged rows only ($150)', ns.median === 150, 'median ' + ns.median);
  // The old page: every live row went in. Shown so the test is known to fire.
  const old = gp.byPrintRun(rows.filter(l => l.live), 'base1', 'en').find(x => x.unstated);
  ok('(the old arrangement put a $35.99 replica at the head of the group)', old.low === 35.99, 'low ' + old.low);
  const rl = fnSrc('renderLiveListings');
  ok('renderLiveListings partitions before it groups', /partitionLive\(rows\)/.test(rl)
     && rl.indexOf('partitionLive(rows)') < rl.indexOf('livePrintRuns(live)'));
  ok('flagged rows get their own block after the groups', /liveFlagged\.map\(liveRow\)/.test(rl)
     && rl.indexOf('livePrintRuns(live)') < rl.indexOf('liveFlagged.map(liveRow)'));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
