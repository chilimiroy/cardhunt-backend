// subset.test.js — prefixed subset numbering: TG16/TG30, SV107/SV122,
// GG01/GG70, SV49/SV94, and mixed-set RC5/RC32 (TASK T3, 2026-10-01).
//
// The Sword & Shield sets with no logo also had no links. Not the same
// cause: the gate REFUSED the true printing "TG16/TG30" ("set size does not
// match ... wanted TG16/30") and the query asked "TG16/30", which no seller
// writes. Asserted both ways, and against the pre-T2 module for every card
// this must NOT change.
//
//   node subset.test.js
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + msg); } }
const C = (id, name, num, set, tot) => ({ cardId: id, name, number: num, setName: set, setTotal: tot, lang: 'en' });

const tg  = C('en-swsh9tg-TG16', 'Mimikyu V', 'TG16', 'Brilliant Stars Trainer Gallery', 30);
const sv  = C('en-swsh4.5sv-SV107', 'Charizard VMAX', 'SV107', 'Shining Fates Shiny Vault', 122);
const gg  = C('en-swsh12.5gg-GG01', 'Grookey', 'GG01', 'Crown Zenith Galarian Gallery', 70);
const hf  = C('en-sma-SV49', 'Charizard GX', 'SV49', 'Hidden Fates Shiny Vault', 94);
const rc  = C('en-g1-RC5', 'Pikachu', 'RC5', 'Generations', 83);
const aq  = C('en-ecard2-H12', 'Kingdra', 'H12', 'Aquapolis', 147);
const ch  = C('en-base1-4', 'Charizard', '4', 'Base Set', 102);
const gir = C('en-swsh11-186', 'Giratina V', '186', 'Lost Origin', 196);

console.log('\n  subset.test.js\n');
const q = c => cm.buildQuery(c, 'Raw NM');
ok(/ TG16\/TG30 /.test(q(tg)), 'Trainer Gallery asked TG16/TG30: ' + q(tg));
ok(/ SV107\/SV122 /.test(q(sv)), 'Shiny Vault asked SV107/SV122: ' + q(sv));
ok(/ GG01\/GG70 /.test(q(gg)), 'Galarian Gallery asked GG01/GG70: ' + q(gg));
ok(/ SV49\/SV94 /.test(q(hf)), 'Hidden Fates SV asked SV49/SV94: ' + q(hf));
ok(/ RC5 /.test(q(rc)) && !/\//.test(q(rc)), 'Generations RC asked by number alone (83 is the main set): ' + q(rc));
ok(/ H12 /.test(q(aq)) && !/\//.test(q(aq)), 'Aquapolis H asked by number alone: ' + q(aq));

const keep = (c, t) => { const v = cm.verify(t, c, 'Raw NM'); ok(v.ok, 'KEEP ' + t + ' — got: ' + v.reason); };
const drop = (c, t, why) => { const v = cm.verify(t, c, 'Raw NM');
  ok(!v.ok && (!why || why.test(v.reason)), 'DROP ' + t + ' — got: ' + (v.ok ? 'kept' : v.reason)); };

keep(tg, 'Mimikyu V TG16/TG30 Brilliant Stars Trainer Gallery');
keep(tg, 'Pokemon Mimikyu V TG16/30 Brilliant Stars');                 // still accepted
keep(sv, 'Charizard VMAX SV107/SV122 Shining Fates Shiny Vault');
keep(gg, 'Grookey GG01/GG70 Crown Zenith Galarian Gallery');
keep(hf, 'Charizard GX SV49/SV94 Hidden Fates Shiny Vault');
keep(rc, 'Pikachu RC5/RC32 Generations Radiant Collection');
keep(aq, 'Kingdra H12/H32 Aquapolis Holo');

drop(tg, 'Mimikyu V TG16/TG40 Pokemon', /set size/);                    // another gallery's size
drop(tg, 'Mimikyu V TG16/GG70 Crown Zenith', /set size|wrong number/);
drop(sv, 'Charizard VMAX SV107/SV94 Hidden Fates', /set size/);
drop(hf, 'Charizard GX SV49/SV122 Shining Fates', /set size/);
drop(tg, 'Mimikyu V 068/172 Brilliant Stars', /wrong number/);          // the main-set Mimikyu
drop(rc, 'Pikachu 26/83 Generations', /wrong number/);

// Unchanged elsewhere — and against the module before T2/T3, read from git.
keep(ch, 'Charizard 4/102 Base Set Holo');
drop(ch, 'Charizard 4/130 Base Set 2', /set size|Base Set 2/);
keep(gir, 'Giratina V 186/196 Lost Origin Alt Art');
drop(gir, 'Giratina V 186/195 Silver Tempest', /set size/);
// ── T3, 2026-10-02: e-Card H01-H09 and McDonald's, from live linkaudit ──
// "Gengar H09 Skyridge" returned NOTHING (A) — sellers write H9/H32 as well
// as H09/H32 and eBay matches tokens. A zero-padded prefixed number in a
// mixed set is not asked; the gate still checks it, in both spellings.
const sk9 = C('en-ecard3-H09', 'Gengar', 'H09', 'Skyridge', 144);
const aq1 = C('en-ecard2-H01', 'Ampharos', 'H01', 'Aquapolis', 147);
ok(q(sk9) === 'Gengar Skyridge pokemon', 'Skyridge H09 asked without the padded number: ' + q(sk9));
ok(!/H0?1\b/.test(q(aq1)), 'Aquapolis H01 asked without the padded number: ' + q(aq1));
ok(/ H12 /.test(q(aq)), 'H12 (no padding) still asked by number: ' + q(aq));
keep(sk9, 'Pokemon Gengar H9/H32 Skyridge Holo Rare');
keep(sk9, 'Gengar H09/H32 Skyridge Holo');
keep(aq1, 'Ampharos H01/H32 Holo Rare Aquapolis Pokemon');
drop(sk9, 'Gengar H19/H32 Skyridge', /number/);
drop(sk9, 'Pokemon Skyridge Gengar Holo', /number/);          // the broader query must not let a numberless title in
// McDonald's: "Collection" is TCGdex's word, not a seller's; SV-era prints 001/015.
const mc14 = C('en-2014xy-5', 'Pikachu', '5', "McDonald's Collection 2014", 12);
const mc23 = C('en-2023sv-1', 'Sprigatito', '1', "McDonald's Collection 2023", 15);
ok(q(mc14) === "Pikachu 5/12 McDonald's 2014 pokemon", "McDonald's asked without 'Collection': " + q(mc14));
ok(q(mc23) === "Sprigatito 001/015 McDonald's 2023 pokemon", 'SV-era McDonald\'s asked 001/015: ' + q(mc23));
keep(mc14, 'Pikachu 5/12 McDonalds 2014 Holo');
keep(mc23, 'Pokemon Sprigatito 001/015 McDonalds 2023 Match Battle');
keep(mc23, "Sprigatito 1/15 McDonald's 2023 promo");
drop(mc23, 'Sprigatito 002/015 McDonalds', /number/);
// Nothing else's query moved.
ok(q(C('en-sv03.5-6', 'Charizard ex', '6', '151', 165)) === 'Charizard ex 6/165 151 pokemon', 'a main-set query is unchanged');

try {
  const src = require('child_process').execSync('git show 2292a9e:cardmatch.js',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = { exports: {} };
  new Function('module', 'exports', 'window', src)(m, m.exports, undefined);
  for (const c of [ch, gir]) for (const g of ['Raw NM', 'PSA 10'])
    // A slab's number form changed deliberately in T0 (pslabel.test.js); compare in the old form.
    ok(m.exports.buildQuery(c, g) === cm.buildQuery(c, g, { numberForm: 'pair' }), 'unprefixed query unchanged vs 2292a9e: ' + c.cardId + ' ' + g);
} catch (e) { console.log('  SKIP pre-T2 comparison — ' + String(e.message).split('\n')[0]); }

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
