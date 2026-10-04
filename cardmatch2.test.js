const m = require('./cardmatch');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

const zard = { cardId:'en-base1-4', name:'Charizard', number:'004',
               setTotal:102, setName:'Base Set' };

console.log('2. BASE SET 2 — the case you reported\n');
[['Charizard Base Set 2 4/130 PSA 10',        'Base Set 2, 4/130'],
 ['Pokemon Charizard 4/130 PSA 10',           'bare 4/130'],
 ['Charizard 4/102 Base Set 2 PSA 10',        'says Base Set 2 with our number']
].forEach(([t,why]) => {
  const v = m.verify(t, zard, 'PSA 10');
  chk(why.padEnd(32) + (v.ok ? 'WRONGLY KEPT' : 'rejected'), !v.ok);
  if (!v.ok) console.log('        ' + v.reason);
});

console.log('\n3. SEALED AND MERCHANDISE\n');
['Pokemon Base Set Booster Box Charizard',
 'Charizard Keychain Pokemon Official',
 'Pokemon Charizard Coin Set Collection',
 'Charizard 4/102 Card Sleeves 65ct',
 'Pokemon Charizard Plush Figure',
 'Charizard Base Set ETB Sealed',
 'Pokemon Charizard Jumbo Oversized Card',
 'Charizard 4/102 Custom Metal Card',
 'Pokemon Charizard Binder Portfolio 4/102',
 'Charizard Base Set Mystery Pack PSA 10'
].forEach(t => {
  const v = m.verify(t, zard, 'PSA 10');
  chk('"' + t.slice(0,44).padEnd(46) + '" ' + (v.ok?'WRONGLY KEPT':'rejected'), !v.ok);
});

console.log('\n4. LANGUAGE\n');
[['Japanese Pokemon Charizard 4/102 Base Set PSA 10', 'Japanese in an English search'],
 ['Korean Pokemon Charizard 4/102 PSA 10',            'Korean'],
 ['German Pokemon Charizard 4/102 PSA 10',            'German'],
 ['ポケモン リザードン 4/102 PSA 10',                   'CJK script']
].forEach(([t,why]) => {
  const v = m.verify(t, zard, 'PSA 10');
  chk(why.padEnd(30) + (v.ok?'WRONGLY KEPT':'rejected'), !v.ok);
  if (!v.ok) console.log('        ' + v.reason);
});

console.log('\n  and the reverse:\n');
const jp = { cardId:'ja-SV2a-201', name:'Charizard ex', number:'201',
             setTotal:165, setName:'151' };
chk('Japanese search keeps a Japanese listing',
    m.verify('Japanese Pokemon Charizard ex 201/165 PSA 10', jp, 'PSA 10').ok);
chk('Japanese search rejects Korean',
    !m.verify('Korean Pokemon Charizard ex 201/165 PSA 10', jp, 'PSA 10').ok);
chk('unstated language still accepted',
    m.verify('Pokemon Charizard 4/102 Base Set PSA 10', zard, 'PSA 10').ok);

console.log('\nDEEP LINK — negative keywords\n');
const link = m.buildQuery(zard, 'PSA 10', { forLink: true });
console.log('  ' + link + '\n');
chk('excludes lots and sealed', link.includes('-lot') && link.includes('-box'));
chk('excludes merchandise', link.includes('-keychain') && link.includes('-coin'));
chk('excludes other languages', link.includes('-japanese') && link.includes('-korean'));
chk('excludes PSA 9', link.includes('-"PSA 9"'));
chk('keeps the card identity', / 004 /.test(link) && link.includes('(Base,Game)'));   // a slab asks the bare number (T0)

const rawLink = m.buildQuery(zard, 'Raw NM', { forLink: true });
chk('raw link excludes slabs', rawLink.includes('-psa') && rawLink.includes('-graded'));

console.log('\nSTILL ACCEPTS THE RIGHT CARD\n');
['Pokemon Base Set Charizard 4/102 PSA 10 Gem Mint',
 '1999 Pokemon Base Set Charizard Holo 004/102 PSA 10',
 'PSA 10 Charizard #4 Base Set Holo Rare Unlimited'
].forEach(t => chk('"' + t.slice(0,50) + '"', m.verify(t, zard, 'PSA 10').ok));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
