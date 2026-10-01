// promo.test.js — Black Star Promos: asked and gated without a set total
// (TASK T2, 2026-10-01).
//
// Every promo was asked for as "Sylveon V SWSH202/307 SWSH Black Star
// Promos" — the 307 is our count of promos, printed on no card — and eBay
// US answered ebayTotal 0 for SWSH202, SM01 and SVP 001. What a query did
// return, the N/M gate refused. Both halves are asserted here, and the gate
// is asserted on what it KEEPS as well as what it refuses.
//
//   node promo.test.js
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + msg); } }

const C = (id, name, num, set, tot) => ({ cardId: id, name, number: num, setName: set, setTotal: tot, lang: 'en' });
const sy = C('en-swshp-SWSH202', 'Sylveon V', 'SWSH202', 'SWSH Black Star Promos', 307);
const ro = C('en-smp-SM01', 'Rowlet', 'SM01', 'SM Black Star Promos', 248);
const xy = C('en-xyp-XY39', 'Lugia EX', 'XY39', 'XY Black Star Promos', 211);
const sp = C('en-svp-001', 'Sprigatito', '001', 'SVP Black Star Promos', 225);
const pk = C('en-basep-1', 'Pikachu', '1', 'Wizards Black Star Promos', 53);
const ch = C('en-base1-4', 'Charizard', '4', 'Base', 102);
const tg = C('en-swsh11tg-TG12', 'Giratina', 'TG12', 'Lost Origin Trainer Gallery', 30);

console.log('\n  promo.test.js\n');

// ── every English promo set is known, by id ──
for (const s of ['basep', 'np', 'dpp', 'hgssp', 'bwp', 'xyp', 'smp', 'swshp', 'svp', 'mep', 'miscp']) {
  ok((cm.PROMO_SETS || {})[s], 'PROMO_SETS has ' + s);
}
ok(cm.promoOf && !cm.promoOf(ch), 'a numbered set card is not a promo');
ok(cm.promoOf && !cm.promoOf(tg), 'Trainer Gallery TG12 is not a promo (its TG30 total is real)');
ok(cm.promoOf && !cm.promoOf(Object.assign({}, sy, { cardId: 'ja-swshp-SWSH202' })), 'a non-English id is not read as an English promo');

// ── the query: printed number, no total, no full set name ──
const q = c => cm.buildQuery(c, 'Raw NM');
ok(q(sy) === 'Sylveon V SWSH202 pokemon', 'prefixed promo query: ' + q(sy));
ok(q(ro) === 'Rowlet SM01 pokemon', 'SM promo query: ' + q(ro));
ok(q(sp) === 'Sprigatito 001 promo pokemon', 'plain promo says promo: ' + q(sp));
ok(q(pk) === 'Pikachu 1 promo pokemon', 'Wizards promo query: ' + q(pk));
for (const c of [sy, ro, xy, sp, pk]) {
  ok(!/\/\d/.test(q(c)), 'no N/M in a promo query: ' + q(c));
  ok(!/Black Star Promos/.test(q(c)), 'no catalogue set name in a promo query: ' + q(c));
}
ok(q(ch) === 'Charizard 4/102 Base pokemon', 'numbered set card query unchanged: ' + q(ch));
// Non-promo queries identical to HEAD's cardmatch (read from git, not retyped).
try {
  // 2292a9e = the last commit before the promo rule.
  const head = require('child_process').execSync('git show 2292a9e:cardmatch.js', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = { exports: {} };
  new Function('module', 'exports', 'window', head)(m, m.exports, undefined);
  if (m.exports.promoOf) console.log('  SKIP HEAD comparison — HEAD already has the promo rule');
  // Trainer Gallery deliberately changed in T3 (TG12/TG30) — subset.test.js.
  else for (const c of [ch]) for (const g of ['Raw NM', 'PSA 10'])
    ok(m.exports.buildQuery(c, g) === cm.buildQuery(c, g), 'non-promo query unchanged vs HEAD: ' + c.cardId + ' ' + g);
} catch (e) { console.log('  SKIP HEAD comparison — ' + String(e.message).split('\n')[0]); }
ok(/SWSH202/.test(cm.buildQuery(sy, 'PSA 10', { forLink: true })), 'deep link carries the promo number');
ok(/PSA 10/.test(cm.buildQuery(sy, 'PSA 10')), 'grade still asked on a promo');

// ── the gate: KEEPS ──
const keep = (c, t, g) => { const v = cm.verify(t, c, g || 'Raw NM'); ok(v.ok, 'KEEP ' + t + ' — got: ' + v.reason); };
const drop = (c, t, why, g) => { const v = cm.verify(t, c, g || 'Raw NM');
  ok(!v.ok && (!why || why.test(v.reason)), 'DROP ' + t + ' — got: ' + (v.ok ? 'kept' : v.reason)); };

keep(sy, 'Pokemon Sylveon V SWSH202 Black Star Promo NM');
keep(sy, 'Sylveon V SWSH 202 Promo Pokemon Card');
keep(sy, 'Sylveon V #SWSH-202 promo');
keep(sy, 'Sylveon V swsh202 Ultra Rare');                      // the code alone is the set
keep(sy, 'Sylveon V SWSH202 PSA 10 Black Star Promo', 'PSA 10');
keep(ro, 'Rowlet SM01 Sun & Moon Black Star Promo Pokemon');
keep(ro, 'Pokemon Rowlet SM 01 promo holo');
keep(xy, 'Lugia EX XY39 Black Star Promo');
keep(sp, 'Sprigatito 001 SVP Black Star Promo Pokemon');
keep(sp, 'Pokemon Sprigatito SVP 001 Promo NM');
keep(sp, 'Sprigatito SVP001 Scarlet Violet');                   // the series code stands for "promo"
keep(pk, 'Pikachu #1 WOTC Black Star Promo Ivy Pikachu');
// Real titles kept against SVP 001 on the first live run (2026-10-01):
for (const t of [
  'Pokemon Scarlet & Violet Black Star Promo Sprigatito SVP 001',
  'SPRIGATITO 001 HOLO P SCARLET & VIOLET PROMO POKEMON NEAR MINT SPRIG',
  'Sprigatito Holofoil [SVP - 001]',
  'Sprigatito - 001 (001) Holofoil Promo NM SVP SV: Scarlet & Violet Pr',
  'Sprigatito 001 - Scarlet & Violet Promo Holo Pokemon NM/M',
  'Sprigatito Holo Black Star Promo - SVP001 - Scarlet & Violet Pokemon',
  'Pokemon Card Sprigatito Scarlet & Violet Promo 001 Near Mint',
]) keep(sp, t);

// ── the gate: REFUSES ──
drop(sy, 'Sylveon V SWSH020 promo', /promo number/);             // another promo
drop(sy, 'Sylveon V 074/203 Evolving Skies', /numbered set card/);
drop(sy, 'Sylveon V SM202 promo', /promo number|SM promo/);
drop(ro, 'Rowlet SM010 Promo', /promo number/);                   // SM10, not SM01
drop(sp, 'Sprigatito 001/198 Scarlet Violet', /numbered set card/);
drop(sp, 'Sprigatito #001 Pokemon card', /does not say promo/);   // any set's #1
drop(sp, 'Sprigatito 001 MEP promo', /MEP promo/);
drop(sp, 'Sprigatito 0010 promo', /promo number/);
drop(pk, 'Pikachu 58/102 Base Set', /numbered set card/);
// Real title, kept against SVP 001 on the first live run (2026-10-01):
drop(sp, 'POKEMON S&V McDonalds *2023* HOLO 1st PARTNER Gen9 Starter PROMO #001 Sprigatito', /McDonalds/);
drop(sp, 'Sprigatito 001 Happy Meal promo 2023', /Happy Meal/);
drop(pk, 'Pikachu Trick or Treat promo 1', /Trick or Treat/);
drop(pk, 'Pikachu Promo #11 Wizards', /promo number/);
drop(sy, 'Sylveon V SWSH202 promo lot of 5', /not a single card/); // earlier gates still run
drop(sy, 'Sylveon V SWSH202 promo', /slab|graded|PSA/i, 'PSA 10');

// ── numbered sets: the old rule is untouched ──
ok(cm.verify('Charizard 4/102 Base Set Holo', ch, 'Raw NM').ok, 'Charizard 4/102 still kept');
ok(!cm.verify('Charizard 4/130 Base Set 2', ch, 'Raw NM').ok, 'Base Set 2 still refused');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
