require('./testcount')(26);   // assertions in a plain run — fewer fails the file (testcount.js)
const lp = require('./listingparse');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

function show(t) {
  const p = lp.parseListingTitle(t);
  console.log('  "' + t.slice(0,66) + '"');
  console.log('     name=' + (p.name||'-') + '  #' + (p.number||'-') +
    (p.printedTotal ? '/'+p.printedTotal : '') +
    '  ' + (p.grader ? p.grader+' '+p.grade : (p.condition||'raw')) +
    (p.edition ? '  ['+p.edition+']' : '') +
    (p.variant ? '  ['+p.variant+']' : '') +
    (p.year ? '  '+p.year : ''));
  console.log('     set=' + (p.setName||'-') + (p.rarity ? '  rarity='+p.rarity : ''));
  console.log('');
  return p;
}

console.log('REAL SELLER TITLES\n');
const a = show("2020 Pokemon Champion's Path Card 74/73 Charizard Rainbow Vmax Graded PSA 10 Gem");
chk('number 74', a.number === '74');
chk('total 73', a.printedTotal === '73');
chk('PSA 10', a.grader === 'PSA' && a.grade === '10');
chk('year 2020', a.year === 2020);
chk('rarity Rare Rainbow', a.rarity === 'Rare Rainbow');
chk('names Charizard', /charizard/i.test(a.name));

console.log('');
const b = show("1999 Pokemon Base Set Charizard 4/102 Holo 1st Edition PSA 9");
chk('1st Edition detected', b.edition === '1st Edition');
chk('year 1999', b.year === 1999);
chk('PSA 9', b.grader === 'PSA' && b.grade === '9');

const c = show("Pokemon Base Set Charizard 4/102 Shadowless PSA 10 GEM MINT");
chk('Shadowless detected', c.edition === 'Shadowless');
chk('GEM MINT label', c.gradeLabel === 'GEM MINT');

const d = show("Japanese Pokemon Charizard ex 201/165 SV2a 151 Master Ball Reverse PSA 10");
chk('Japanese detected', d.language === 'ja');
chk('Master Ball variant', d.variant === 'Master Ball');

const e = show("Charizard VMAX 074/073 Champions Path Rainbow Rare NM/M Ungraded");
chk('no grader', e.grader === null);
chk('condition captured', !!e.condition);

console.log('DISQUALIFIERS\n');
[['Pokemon Card Lot 50 Cards Charizard Base Set','isLot'],
 ['Pokemon Champions Path ETB Sealed Box','isSealed'],
 ['Charizard 4/102 Custom Metal Card Gold','isCustom']].forEach(([t,f])=>{
  const p = lp.parseListingTitle(t);
  chk(f.padEnd(10)+'"'+t.slice(0,42)+'"', p[f] === true);
});

console.log('\nCOMPARE AGAINST THE CARD ASKED FOR\n');
const zard = { name:'Charizard', number:'004', setTotal:102, setName:'Base Set' };

let r = lp.compare(lp.parseListingTitle('1999 Pokemon Base Set Charizard 4/102 Holo Unlimited PSA 10'), zard, 'PSA 10');
chk('right card, right grade — match', r.match);
chk('  edition surfaced: ' + r.edition, r.edition === 'Unlimited');

r = lp.compare(lp.parseListingTitle('Pokemon Base Set Charizard 4/102 1st Edition PSA 10'), zard, 'PSA 10');
chk('1st Edition also matches (a variant, not a mismatch)', r.match);
chk('  and is surfaced: ' + r.edition, r.edition === '1st Edition');

r = lp.compare(lp.parseListingTitle('Charizard 4/130 Base Set 2 PSA 10'), zard, 'PSA 10');
chk('different set — rejected', !r.match);
console.log('        ' + r.disagree[0]);

r = lp.compare(lp.parseListingTitle('Base Set Charizard 4/102 PSA 9'), zard, 'PSA 10');
chk('wrong grade — rejected', !r.match);
console.log('        ' + r.disagree[0]);

r = lp.compare(lp.parseListingTitle('Base Set Charizard 4/102 CGC 10'), zard, 'PSA 10');
chk('wrong grader — rejected', !r.match);
console.log('        ' + r.disagree[0]);

r = lp.compare(lp.parseListingTitle('Pokemon Card Lot Charizard Base Set 4/102 PSA 10'), zard, 'PSA 10');
chk('a lot — rejected', !r.match);
console.log('        ' + r.disagree[0]);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
