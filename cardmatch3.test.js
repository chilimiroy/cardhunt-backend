// ══════════════════════════════════════════════════════════════
// cardmatch3.test.js — word boundaries in NOT_A_SINGLE_CARD
//
// Regression for a bug that emptied two whole sets of links.
//
// The pattern was rewritten from a single /\b(lot|box|tin|...)\b/i into
// an array of alternations joined with '|', which dropped the boundaries.
// "tin" then matched inside Gira*tin*a and Des*tin*ed Rivals, "lot"
// inside Lotad, "case" inside Casey, "box" inside Boxer.
//
// Eight of twenty-five real card names were rejected. Every suite passed
// throughout, because none of them tested a card name containing a
// junk word as a substring.
//
// This asserts BOTH directions. A filter tested only on what it blocks
// passes by blocking everything — which is exactly what happened.
// ══════════════════════════════════════════════════════════════

const m = require('./cardmatch');
let pass = 0, fail = 0;
const chk = (l, c) => { c ? pass++ : fail++;
  console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l); };

// Card and set names containing a junk term as a substring
const REAL_NAMES = [
  ['Giratina V',        'tin'],  ['Destined Rivals',  'tin'],
  ['Lotad',             'lot'],  ['Ludicolo',         'lot'],
  ['Tinkaton',          'tin'],  ['Tinkatink',        'tin'],
  ['Platinum',          'tin'],  ['Casey',            'case'],
  ['Boxer',             'box'],  ['Pinsir',           'pin'],
  ['Pincurchin',        'pin'],  ['Spinarak',         'pin'],
  ['Spinda',            'pin'],  ['Pineco',           'pin'],
  ['Cofagrigus',        'cof'],  ['Combusken',        'bus'],
  ["Ethan's Pinsir",    'pin'],  ["Cynthia's Roserade",'rose'],
  ['Arrokuda',          'rok'],  ['Bellossom',        'loss']
];

console.log('\nREAL CARD NAMES — must be kept\n');
REAL_NAMES.forEach(([name, contains]) => {
  const title = 'Pokemon ' + name + ' 123/456 Some Set NM';
  const hit = title.match(m.NOT_A_SINGLE_CARD);
  chk(name.padEnd(22) + `(contains "${contains}")` +
      (hit ? '  REJECTED on "' + hit[0] + '"' : ''), !hit);
});

console.log('\nGENUINE JUNK — must be rejected\n');
[ 'Pokemon Booster Box Sealed',
  'Charizard Keychain Official Pokemon',
  'Pokemon Coin Set Collection',
  'Card Sleeves 65ct Pokemon',
  'Pokemon Plush Figure Charizard',
  'Elite Trainer Box ETB Sealed',
  'Pokemon Card Lot 50 Cards',
  'Charizard Custom Metal Card Gold',
  'Pokemon Tin Sealed New',
  'Giratina V Deck Box Storage',
  'Charizard Jumbo Oversized Card',
  'Pokemon Binder Portfolio 9 Pocket',
  'Mystery Pack Charizard Chance',
  'Pokemon Playmat Giratina Mat',
  'Charizard Toploader Top Loader 35pt',
  'Pokemon Proxy Orica Charizard'
].forEach(t => {
  chk(('"' + t.slice(0, 40) + '"').padEnd(44) +
      (m.NOT_A_SINGLE_CARD.test(t) ? 'rejected' : 'KEPT'),
      m.NOT_A_SINGLE_CARD.test(t));
});

console.log('\nTHE TITLES THAT EXPOSED IT — live from the audit\n');
const gira = { cardId: 'en-swsh11-130', name: 'Giratina V', number: '130',
               setTotal: 196, setName: 'Lost Origin' };
[ 'POKEMON Giratina V 130/196 ULTRA RARE Lost Origins M/NM Never Played',
  'GIRATINA V 130/196 V RARE LOST ORIGIN POKEMON NEAR MINT',
  'Giratina V 130/196 SWSH Lost Origin'
].forEach(t => {
  const v = m.verify(t, gira, 'Raw NM');
  chk(('"' + t.slice(0, 48) + '"').padEnd(52) +
      (v.ok ? 'kept' : 'REJECTED: ' + v.reason), v.ok);
});

const ros = { cardId: 'en-sv10-184', name: "Cynthia's Roserade", number: '184',
              setTotal: 182, setName: 'Destined Rivals' };
[ "CYNTHIA'S ROSERADE 184/182 ILLUSTRATION RARE DESTINED RIVALS POKEMON HOLO",
  "Pokemon TCG Cynthia's Roserade 184/182 Illustration Rare Destined Rivals"
].forEach(t => {
  const v = m.verify(t, ros, 'Raw NM');
  chk(('"' + t.slice(0, 48) + '"').padEnd(52) +
      (v.ok ? 'kept' : 'REJECTED: ' + v.reason), v.ok);
});

console.log('\nTHE PATTERN ITSELF\n');
// Every term must be boundary-wrapped. Catches the rewrite directly.
const src = m.NOT_A_SINGLE_CARD.source;
chk('pattern contains word boundaries', src.includes('\\b'));
const terms = m.NOT_A_SINGLE_CARD_TERMS || [];
chk('terms are exported for inspection', terms.length > 20);
const unbounded = terms.filter(t => {
  const probe = 'xx' + t.replace(/\s+/g, ' ') + 'xx';
  return m.NOT_A_SINGLE_CARD.test(probe);
});
chk('no term matches mid-word' +
    (unbounded.length ? ': ' + unbounded.slice(0, 5).join(', ') : ''),
    unbounded.length === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
