// prerelease.test.js — "Prerelease" is a printing conflict, except near a
// set's release (Roy, 2026-10-08; PROGRESS "Set split").
// Measured on 9,958 kept titles: 86 newly refused (83 Dark Gyarados with the
// gold PRERELEASE stamp, an Uxie and two Rocket's Zapdos whose photos show
// reprint stamps), 0 newly kept; the 3 early-copy SIRs of sets released
// within 12 months stay.
'use strict';
require('./testcount')(10);   // assertions in a plain run — fewer fails the file (testcount.js)
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (what, cond, got) => { if (cond) { pass++; console.log('  ok    ' + what); } else { fail++; console.log('  FAIL  ' + what + (got ? '   ' + got : '')); } };

const NOW = new Date('2026-10-08T00:00:00Z');
const gyarados = { name: 'Dark Gyarados', number: '8', setTotal: 82, setName: 'Team Rocket', setId: 'base5', setYear: 2000, setReleased: '2000-04-24', lang: 'en' };
// verify() reads the real clock: the early-copy sets' release dates are kept
// 3 and 11 months before NOW, as they were when measured.
const monthsAgo = m => new Date(Date.now() - m * 30.44 * 86400000).toISOString().slice(0, 10);
const darkrai  = { name: 'Mega Darkrai ex', number: '116', setTotal: 84, setName: 'Pitch Black', setId: 'me05', setYear: 2026, setReleased: monthsAgo(3), lang: 'en' };
const zardX    = { name: 'Mega Charizard X ex', number: '125', setTotal: 94, setName: 'Phantasmal Flames', setId: 'me02', setYear: 2025, setReleased: monthsAgo(11), lang: 'en' };
const v = (t, c) => cm.verify(t, c, 'Raw');

console.log('  what it refuses');
for (const t of ['Dark Gyarados 8/82 PRERELEASE Holo Pokémon Team Rocket WOTC 2000 Vintage NM',
                 'Pokemon TCG Prerelease Dark Gyarados 8/82 Team Rocket Pre-release Holo NM SWIRL',
                 'POKEMON DARK GYARADOS 8/82 NM HOLO PRE RELEASE PROMO NEVER PLAYED ACTUAL PICS'])
  ok('stamped printing refused: ' + t.slice(0, 60), !v(t, gyarados).ok && /Prerelease/.test(v(t, gyarados).reason || ''), v(t, gyarados).reason);

console.log('\n  what it keeps');
ok('the same card with no prerelease word', v('Dark Gyarados 8/82 Holo Rare Team Rocket WOTC 2000 NM', gyarados).ok, v('Dark Gyarados 8/82 Holo Rare Team Rocket WOTC 2000 NM', gyarados).reason);
ok('an early copy of a set released 3 months ago (Mega Darkrai ex SIR)',
   v('Mega Darkrai ex SIR 116/084 Pokemon Pitch Black English EARLY COPY Prerelease NM', darkrai).ok);
ok('an early copy of a set released 11 months ago (Mega Charizard X ex SIR)',
   v('Mega Charizard X ex 125/094 SIR NM - Phantasmal Flames Pokemon Pre-Release', zardX).ok);
ok('"release" alone is not the word', v('Dark Gyarados 8/82 Holo Team Rocket 2000 first release', gyarados).ok);

console.log('\n  the release window');
ok('13 months after release: outside', !cm.releasedWithin({ setReleased: '2025-09-01' }, 12, NOW));
ok('11 months after release: inside', cm.releasedWithin({ setReleased: '2025-11-14' }, 12, NOW));
ok('no date and no year: absence keeps (never refuses)', cm.releasedWithin({}, 12, NOW));

console.log(`\n  prerelease.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
