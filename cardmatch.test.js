const m = require('./cardmatch');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

// The exact card from your example
const zard = { name:'Charizard', nameEn:null, number:'004', setTotal:102,
               setName:'Base Set', setId:'base1' };

console.log('QUERY BUILDING\n');
console.log('  ' + m.buildQuery(zard, 'PSA 10'));
console.log('  ' + m.buildQuery({name:'Charizard VMAX',number:'074',setTotal:73,
                                 setName:"Champion's Path"}, 'PSA 10'));
console.log('');
chk('N/M pair padded to match', m.buildQuery(zard,'Raw NM').includes('004/102'));
// A slab asks the number alone: PSA's label prints "#4", never "4/102" (T0, pslabel.test.js)
chk('a slab asks the bare number', / 004 /.test(m.buildQuery(zard,'PSA 10')) && !m.buildQuery(zard,'PSA 10').includes('/102'));
chk('set name included', m.buildQuery(zard,'PSA 10').includes('Base Set'));
chk('grade included', m.buildQuery(zard,'PSA 10').includes('PSA 10'));

console.log('\nMUST ACCEPT — the right card, right grade\n');
[
 'Pokemon Base Set Charizard 4/102 PSA 10 Gem Mint',
 '1999 Pokemon Base Set Charizard Holo 004/102 PSA 10',
 'Charizard 4/102 Base Set Unlimited PSA 10',
 'PSA 10 Pokemon Charizard #4 Base Set Holo Rare'
].forEach(t => {
  const v = m.verify(t, zard, 'PSA 10');
  chk('"' + t.slice(0,52) + '"', v.ok);
  if (!v.ok) console.log('        rejected: ' + v.reason);
});

console.log('\nMUST REJECT — wrong grade\n');
[
 ['Base Set Charizard 4/102 PSA 9',            'PSA 9 not PSA 10'],
 ['Base Set Charizard 4/102 CGC 10',           'CGC not PSA'],
 ['Base Set Charizard 4/102 BGS 10',           'BGS not PSA'],
 ['Base Set Charizard 4/102 PSA 10 or CGC 9',  'two grades named'],
 ['Base Set Charizard 4/102 Near Mint',        'ungraded']
].forEach(([t, why]) => {
  const v = m.verify(t, zard, 'PSA 10');
  chk(why.padEnd(22) + '"' + t.slice(0,44) + '"', !v.ok);
});

console.log('\nMUST REJECT — wrong card\n');
[
 ['Pokemon Charizard VMAX 074/073 PSA 10',        'different card entirely'],
 ['Charizard ex 199/165 PSA 10',                  'different set'],
 ['Pokemon Blastoise 2/102 Base Set PSA 10',      'different Pokemon'],
 ['Charizard 4/130 Base Set 2 PSA 10',            'same number, other set'],
 ['Charizard PSA 10 Pokemon Holo',                'no number, no set'],
 ['Pokemon Card Lot Charizard Base Set PSA 10',   'a lot'],
 ['Charizard 4/102 Custom Metal Card PSA 10',     'not a real card']
].forEach(([t, why]) => {
  const v = m.verify(t, zard, 'PSA 10');
  chk(why.padEnd(24) + '"' + t.slice(0,40) + '"', !v.ok);
  if (v.ok) console.log('        WRONGLY ACCEPTED');
});

console.log('\nTHE REAL LISTING THAT CAME BACK\n');
const vmax = { name:'Charizard VMAX', number:'074', setTotal:73,
               setName:"Champion's Path" };
const real = "2020 Pokemon Champion's Path Card 74/73 Charizard Rainbow Vmax Graded PSA 10 Gem";
const rv = m.verify(real, vmax, 'PSA 10');
chk('accepted, confidence=' + rv.confidence, rv.ok);

console.log('\nSAME NAME, DIFFERENT NUMBER IN ONE SET\n');
// Ascended Heroes has Mega Hawlucha ex at #268 and #283
const h268 = { name:'Mega Hawlucha ex', number:'268', setTotal:217, setName:'Ascended Heroes' };
chk('#268 accepts its own listing',
    m.verify('Mega Hawlucha ex 268/217 Ascended Heroes PSA 10', h268, 'PSA 10').ok);
chk('#268 rejects #283',
    !m.verify('Mega Hawlucha ex 283/217 Ascended Heroes PSA 10', h268, 'PSA 10').ok);

console.log('\nRAW EXCLUDES SLABS\n');
chk('raw rejects a PSA slab',
    !m.verify('Base Set Charizard 4/102 PSA 9', zard, 'Raw NM').ok);
chk('raw accepts an ungraded card',
    m.verify('Pokemon Base Set Charizard 4/102 Holo Near Mint', zard, 'Raw NM').ok);

console.log('\nHALF GRADES\n');
const g = m.gradesIn('Charizard BGS 9.5 gem');
chk('BGS 9.5 read as 9.5 not 9', g.length===1 && g[0].grade==='9.5');
chk('BGS 9 does not match a 9.5 listing',
    !m.verify('Charizard 4/102 Base Set BGS 9.5', zard, 'BGS 9').ok);

console.log('\nEVERY REJECTION EXPLAINS ITSELF\n');
const drops = ['Charizard 4/102 PSA 9','Charizard VMAX 074/073 PSA 10','Pokemon Lot PSA 10']
  .map(t => m.verify(t, zard, 'PSA 10'));
chk('all carry a reason', drops.every(d => !d.ok && d.reason && d.reason.length > 10));
drops.forEach(d => console.log('        ' + d.reason));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
