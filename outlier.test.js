const o = require('./outlier');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

// The real Giratina V #186 data from the audit
const gira186 = [2.08, 8.5, 17, 20, 25, 299.95, 569.01, 745, 778.17, 792.31,
                 817.61, 825, 873.99, 900, 925, 942.85, 987, 987.8, 1024.99,
                 1050.98, 1114.99].map((p,i) => ({ landed: p, title: 'listing ' + i }));

console.log('Giratina V #186 — the real spread from the audit\n');
const r = o.flagOutliers(gira186);
console.log(`  median $${r.stats.median.toFixed(2)}  low $${r.stats.low}  high $${r.stats.high}  spread ${r.stats.spread}x`);
console.log(`  flagged ${r.stats.flagged} of ${r.stats.count}\n`);
r.listings.filter(l => l.suspect).forEach(l =>
  console.log(`    ${l.suspect.padEnd(16)} $${l.landed}  — ${l.suspectReason}`));

chk('$2.08 flagged', r.listings.find(l => l.landed === 2.08).suspect);
chk('$8.50 flagged (the Fan Art one)', r.listings.find(l => l.landed === 8.5).suspect);
chk('$17 flagged', !!r.listings.find(l => l.landed === 17).suspect);
chk('$299 NOT flagged', !r.listings.find(l => l.landed === 299.95).suspect);
chk('$1114 NOT flagged', !r.listings.find(l => l.landed === 1114.99).suspect);

console.log('\nA genuinely cheap card must NOT be flagged\n');
const grimer = [0.99,0.99,0.99,0.99,0.99,0.99,0.99,1,1.12,1.12,1.12]
  .map(p => ({ landed: p }));
const r2 = o.flagOutliers(grimer);
chk('median $' + r2.stats.median + ' below the floor — test not applied', !r2.stats.applied);
chk('  reason: ' + r2.stats.reason, r2.stats.flagged === 0);

console.log('\nA thin sample must NOT be judged\n');
const thin = [900, 950, 2.5].map(p => ({ landed: p }));
const r3 = o.flagOutliers(thin);
chk('3 listings — not applied', !r3.stats.applied);
chk('  nothing flagged on a sample of 3', r3.stats.flagged === 0);

console.log('\nAn honest spread must survive\n');
const honest = [42,45,48,50,52,55,58,60,65,70].map(p => ({ landed: p }));
const r4 = o.flagOutliers(honest);
chk('normal variation — 0 flagged', r4.stats.flagged === 0);

console.log('\nFlagged listings sort last, not by price\n');
const sorted = o.sortWithSuspectsLast(r.listings);
chk('cheapest trustworthy row is first ($' + sorted[0].landed + ')', !sorted[0].suspect);
chk('flagged rows are at the end', !!sorted[sorted.length-1].suspect);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
