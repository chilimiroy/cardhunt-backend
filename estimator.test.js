require('./testcount')(29);   // assertions in a plain run — fewer fails the file (testcount.js)
const e = require('./estimator');
const fs = require('fs');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

const base1 = '1999/01/09', sv = '2023/09/22';

console.log('VINTAGE — the multiplier that existed in one estimator only\n');
chk('pre-2000 lifts 9x',      e.vintageFactor(base1) === 9);
chk('2001 Neo lifts 5x',      e.vintageFactor('2001/06/01') === 5);
chk('2005 EX lifts 2.5x',     e.vintageFactor('2005/02/14') === 2.5);
chk('2009 HGSS lifts 1.6x',   e.vintageFactor('2009/05/01') === 1.6);
chk('2015 XY lifts 1.2x',     e.vintageFactor('2015/08/12') === 1.2);
chk('2023 is not vintage',    e.vintageFactor(sv) === 1);
chk('no date is not vintage', e.vintageFactor(null) === 1);
chk('a date it cannot read is not vintage', e.vintageFactor('soon') === 1);

console.log('\nTHE SAME CARD, DATED AND UNDATED\n');
const dated   = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-15', name:'Ninetales', setRelease:base1 });
const undated = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-15', name:'Ninetales' });
console.log('  Ninetales, Base Set:  with the date $' + dated + '   without it $' + undated);
chk('the release date is worth 9x on a 1999 holo',
    Math.abs(dated / undated - 9) < 0.001);
chk('a missing date always reads LOW, never high', undated < dated);

console.log('\nCEILINGS SCALE WITH THE ERA\n');
const commons99 = [];
for (let i = 1; i <= 60; i++) {
  commons99.push(e.estimatePrice({ rarity:'Common', cardId:'en-base1-'+i, name:'Card'+i, setRelease:base1 }));
}
const commons24 = [];
for (let i = 1; i <= 60; i++) {
  commons24.push(e.estimatePrice({ rarity:'Common', cardId:'en-sv3pt5-'+i, name:'Card'+i, setRelease:sv }));
}
console.log('  1999 Common max $' + Math.max(...commons99) + ' · 2023 Common max $' + Math.max(...commons24));
chk('a 1999 Common may reach ~$18', Math.max(...commons99) <= 18 && Math.max(...commons99) > 2);
chk('a 2023 Common stays under $2', Math.max(...commons24) <= 2);

console.log('\nCHASE NAMES, AND THE TRAINERS THAT ONLY LOOK LIKE THEM\n');
const zard = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-4', name:'Charizard', setRelease:base1 });
const plain = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-4', name:'Nidoking', setRelease:base1 });
chk('Charizard carries a premium', zard > plain);
// A Rare with no chase premium cannot exceed base x the widest band
// (2.2 x 1.69). If the Mew multiplier had applied it would reach 6.3.
const CEIL_RARE_NO_PREMIUM = e.BASE_PRICE['Rare'] * (0.6 + 1.09);
const candy = e.estimatePrice({ rarity:'Rare', cardId:'en-sv3-1', name:'Mew Candy', setRelease:sv });
const mew   = e.estimatePrice({ rarity:'Rare', cardId:'en-sv3-1', name:'Mew Vessel', setRelease:sv });
console.log('  "Mew Candy" $' + candy + ' (a Trainer) vs "Mew Vessel" $' + mew);
chk('an item named like a chase card does not get the premium',
    candy > 0 && candy <= CEIL_RARE_NO_PREMIUM + 0.005);
chk('the same name without the Trainer word does get it',
    mew > CEIL_RARE_NO_PREMIUM);

console.log('\nRARITY IS INFERRED ONLY WHEN IT IS ABSENT\n');
chk('a stated Common stays Common',
    e.estimatePrice({ rarity:'Common', cardId:'x', name:'Pokegear 3.0', number:186, setTotal:198 })
      === e.estimatePrice({ rarity:'Common', cardId:'x', name:'Pokegear 3.0' }));
chk('an absent rarity is inferred from position',
    e.estimatePrice({ cardId:'y', name:'Charizard ex', number:215, setTotal:198 }) > 5);
// inferRarity DOES read #186 of 198 as Rare Ultra — that is the trap, and
// the guard is that a stated rarity is never second-guessed. Pokegear 3.0
// is a Common at #186, and it was priced at $46 by inference.
chk('position inference is the trap it is documented to be',
    e.inferRarity(186, 198, 'Pokegear 3.0') === 'Rare Ultra');
chk('a stated Common at #186 of 198 stays under $2',
    e.estimatePrice({ rarity:'Common', cardId:'en-sv3pt5-186', name:'Pokegear 3.0',
                      number:186, setTotal:198, setRelease:sv }) < 2);

console.log('\nDETERMINISM — the same card is always the same price\n');
const a = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-4', name:'Charizard', setRelease:base1 });
const b = e.estimatePrice({ rarity:'Rare Holo', cardId:'en-base1-4', name:'Charizard', setRelease:base1 });
chk('twice the same call, twice the same number', a === b);
chk('two cards in one set do not share a price',
    e.estimatePrice({ rarity:'Common', cardId:'en-base1-59', name:'Machop', setRelease:base1 }) !==
    e.estimatePrice({ rarity:'Common', cardId:'en-base1-60', name:'Metapod', setRelease:base1 }));

console.log('\nONE IMPLEMENTATION — no caller may keep a private copy\n');
// This is the test that would have caught the original split. Documentation
// said the vintage multiplier was a property of the system; it lived in one
// file. A grep is crude, and it is what noticed nothing for months.
// ingest.js is local-only (gitignored: it needs DATABASE_URL), so a clone
// does not have it. Say so and check the rest, rather than crash.
const HAVE_INGEST = fs.existsSync(__dirname + '/ingest.js');
if (!HAVE_INGEST) console.log('  SKIP  ingest.js checks — ingest.js is local-only and not in this checkout');
const callers = {
  'server.js': fs.readFileSync(__dirname + '/server.js', 'utf8'),
  'cardhunt_preview.html': fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8')
};
if (HAVE_INGEST) callers['ingest.js'] = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
for (const [f, src] of Object.entries(callers)) {
  const ownTable = /(const|var|let)\s+RP\s*=\s*\{[^}]*'Rare Holo'/.test(src) &&
                   f !== 'cardhunt_preview.html';
  chk(f + ' keeps no private price table', !ownTable);
}
chk('server.js requires the module',  /require\('\.\/estimator'\)/.test(callers['server.js']));
if (HAVE_INGEST) chk('ingest.js requires the module',  /require\('\.\/estimator'\)/.test(callers['ingest.js']));
// The page's estimator (mockP, RP) went 2026-10-09: no estimate is shown.
chk('the frontend loads the module async',
    /<script async src="[^"]*\/estimator\.js"><\/script>/.test(callers['cardhunt_preview.html']));
// The browser export goes through the IIFE wrapper's `root`, because a
// <script src> shares the page's scope and a top-level `const API` collided
// with the page's own. scopeguard.test.js proves this by executing the file
// in a page-like scope; this only checks the shape is still there.
const estSrc = fs.readFileSync(__dirname + '/estimator.js', 'utf8');
chk('the module body is wrapped, so it declares nothing globally',
    /^\(function \(root\) \{/m.test(estSrc));
chk('the module loads in a browser as well as in node',
    /root\.Estimator = API/.test(estSrc) &&
    /module\.exports = API/.test(estSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
