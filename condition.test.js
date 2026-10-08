// condition.test.js — the title's condition is the stronger signal (2026-10-07)
//
// eBay's Card Condition filter reads the seller's DROPDOWN, which sellers set
// to "Near Mint or Better" freely while typing the honest condition in the
// title. In a Raw NM view that dropdown used to REPLACE the title's claim, so
// "Blastoise 2/102 MP", "Dark Charizard MP/HP" and "M Charizard EX NM/LP"
// reached the deals bar as near mint. Measured on 939 kept Raw NM rows: 23
// stated lower (first condition read), 36 with every stated condition read
// (13 were slash ranges). Now the WORSE of the two claims stands.

require('./testcount')(19);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

console.log('\n  the worst condition a title states');
for (const [t, want] of [
  ['M Charizard EX 108/106 XY Flash Fire Secret Rare NM/LP', 'LP'],
  ['Charizard 11/108 Evolutions Reverse Holo Rare English LP/NM', 'LP'],
  ['Charizard 11/108 LP+-NM Holo Rare XY Evolutions', 'LP'],
  ['2000 Pokemon Team Rocket Dark Charizard 4/82 MP/HP PKL', 'HP'],
  ['Pokemon Blastoise Base Set Unlimited Holo Rare 2/102 MP', 'MP'],
  ['Pokemon Blastoise 2/102 Base Set Holo HP/Damaged', 'DMG'],
  ['Charizard GX 150/147 Secret Rare Card NM', 'NM'],
  ['Charizard Base Set Near Mint', 'NM'],              // "near mint" also matches bare "mint": NM is the worse
  ['Blastoise EX MT Excellent-Mint', 'LP'],
  ['Charizard ex 199/165 Mint', 'M'],
  ['M Charizard EX 108/106 Secret Rare', null],        // "M" is Mega, never Mint
  ['Charizard V 220 HP Holo', null],                   // hit points, never Heavily Played
  ['Pikachu 025/165 151 Common', null]]) {
  const w = cm.worstStatedCondition(t).code;
  ok((want || 'nothing') + ': ' + t.slice(0, 56), w === want, 'read ' + w);
}
ok('worse of two claims', cm.worseCondition('NM', 'LP') === 'LP' && cm.worseCondition('LP', 'NM') === 'LP' && cm.worseCondition('NM', null) === 'NM' && cm.worseCondition(null, 'MP') === 'MP');

console.log('\n  the server takes the worse claim, and says so on the row');
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
ok('a filtered (eBay dropdown) row: the worse of the dropdown and the title', /sellerCondition: condFilter \? cm\.worseCondition\(condFilter\.code, scWorst\.code\) : scWorst\.code/.test(S));
ok('...read with every condition the title states', /const scWorst = cm\.worstStatedCondition\(it\.title\);/.test(S));
ok('...conditionSource says the title won when it did', /scWorst\.stated && cm\.CONDITION_RANK\[scWorst\.code\] > cm\.CONDITION_RANK\[condFilter\.code\] \? 'title' : 'ebay'/.test(S));
ok('...and the disagreement survives normaliseListing (conditionConflict)', /conditionConflict: o\.conditionConflict \|\| null/.test(S) && /\{ ebay: condFilter\.code, title: scWorst\.code \}/.test(S));

console.log('\n  the deals bar now sees it');
const deals = require('./deals.js');
const r = { live: true, saleType: 'fixed', shippingKnown: true, landed: 50, source: 'ebay', sellerStated: true, conditionSource: 'title', sellerCondition: 'MP' };
ok('a row the title calls MP is not a deal', /below near mint/.test(deals.notADeal(r, 'holo') || ''));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
