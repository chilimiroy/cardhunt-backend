// reprint.test.js — reprints identified by SET ID, in BOTH directions.
//
//   node reprint.test.js
//
// Why this file exists. The reprint gate was keyed on words: a title naming
// "celebrations" was the reprint, and OUR card was exempt when its set NAME
// matched /celebrat/i. Ingesting "30th Celebration" satisfied that pattern
// and silently disabled the guard for 188 cards. And it only ever worked one
// way: searching the ORIGINAL rejected a title naming the reprint, but
// searching the REPRINT accepted the original — which names no reprint at
// all, and is usually worth ten to a hundred times more.
//
// Every title below is REAL, from live eBay searches on 2026-09-26:
//   Aquapolis Lugia 149/147        16 kept, 59 rejected of 75, $385-$15,050
//   Neo Destiny Shining Celebi     15 kept, 60 rejected of 75
//   Base Set Charizard 4/102       34 kept, 41 rejected of 75
// The 30th Classic Collection and Celebrations CC searches for the same
// cards returned "0 kept, 0 rejected" — they asked eBay for "Lugia 029/030"
// and "Charizard CC002/025", numbers no seller has ever written.
//
// Asserted:
//   1. each title lands on exactly the card it describes, for three pairs,
//      both directions — and titles that say nothing are KEPT on the original
//   2. the reprint card is asked for, and matched, by its PRINTED number
//   3. nothing about our side is read from a set name
//   4. the table itself is consistent, and (with DATABASE_URL) agrees with
//      the catalogue it names

const cm = require('./cardmatch');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}

// Catalogue shapes, exactly as filterCard / matchCard build them.
const EN = { lang: 'en' };
const CARDS = {
  aquapolis: { ...EN, name: 'Lugia', number: '149', setTotal: 147, setId: 'ecard2',
               setName: 'Aquapolis', setYear: 2003 },
  lugia30c:  { ...EN, name: 'Lugia', number: '029', setTotal: 30, setId: '30th-c',
               setName: '30th Classic Collection', setYear: 2026 },
  neo:       { ...EN, name: 'Shining Celebi', number: '106', setTotal: 105, setId: 'neo4',
               setName: 'Neo Destiny', setYear: 2002 },
  celebi30c: { ...EN, name: 'Shining Celebi', number: '024', setTotal: 30, setId: '30th-c',
               setName: '30th Classic Collection', setYear: 2026 },
  base:      { ...EN, name: 'Charizard', number: '4', setTotal: 102, setId: 'base1',
               setName: 'Base Set', setYear: 1999 },
  zard21:    { ...EN, name: 'Charizard', number: 'CC002', setTotal: 25, setId: 'cel25cc',
               setName: 'Celebrations Classic Collection', setYear: 2021 },
  zard30c:   { ...EN, name: 'Charizard', number: '001', setTotal: 30, setId: '30th-c',
               setName: '30th Classic Collection', setYear: 2026 }
};

// title -> which of the pair's cards it belongs to ('none' = neither)
function lands(pair, rows) {
  for (const [title, want] of rows) {
    const got = pair.filter(k => cm.verify(title, CARDS[k], 'Raw NM').ok);
    const expect = want === 'none' ? [] : [want];
    ok(`${(want + '        ').slice(0, 9)} ${title.slice(0, 66)}`,
       JSON.stringify(got) === JSON.stringify(expect),
       'kept on [' + got.join(', ') + ']' +
       (got.length ? '' : ' — ' + pair.map(k => k + ': ' + cm.verify(title, CARDS[k], 'Raw NM').reason).join(' | ')));
  }
}

console.log('\n1a. AQUAPOLIS LUGIA  vs  30th CLASSIC COLLECTION LUGIA — both directions\n');
lands(['aquapolis', 'lugia30c'], [
  // The originals. Stating nothing about a reprint, they are KEPT on the
  // original and REFUSED on the reprint — silence is not neutral there.
  ['Lugia Aquapolis 149/147 Crystal Type Holo Rare 80 HP Pokemon TCG English', 'aquapolis'],
  // "ITA" is an Italian card (T1, 2026-09-30: eBay DE/IT sellers write it
  // that way; 65 of 407 eBay DE rows). Written as kept before the language
  // gate read "ITA" — neither card is the Italian printing.
  ['2003 Pokemon Lugia 149/147 Aquapolis ITA GRADE 3 Crystal Holo Secret Rare', 'none'],
  ['Lugia Crystal Type 149/147 Aquapolis Secret Rare WOTC 2002 Pokemon HOLO e-Card', 'aquapolis'],
  ['Lugia Crystal 149/147 Aquapolis Holo Secret Rare Vintage Pokemon TCG WOTC MP', 'aquapolis'],
  ['2003 Pokemon Aquapolis Crystal Lugia Secret Rare 149/147 - Raw NM/EX  Grail Holo', 'aquapolis'],
  ['*HALO SWIRL* Lugia 149/147 Aquapolis Pokemon Card Rare Holo Foil LP', 'aquapolis'],
  ['Pokémon Crystal Lugia Aquapolis 149/147 Holo Secret Rare English 2002 NM Swirl', 'aquapolis'],
  // The reprints. Every phrasing measured, including the ones that ALSO
  // name Aquapolis — the reprint says "Aquapolis" on it, that is the point.
  ['Lugia 149/147 30th celebration', 'lugia30c'],
  ['The Pokemon Company 30th Celebration CC Lugia 149/147 Secret Rare Holo English', 'lugia30c'],
  ['Pokemon TCG 30th Celebration Classic Collection Aquapolis Lugia 149/147', 'lugia30c'],
  ['The Pokémon Company 30th celebration holo Lugia 149/147 80 HP English rare', 'lugia30c'],
  ['Lugia 149/147 Aquapolis Holo 30th Anniversary Pokemon Card', 'lugia30c'],
  ['Pokemon Aquapolis Lugia 149/147 Secret Rare Holo 30th celebration 2026', 'lugia30c'],
  ['Pokemon 30th Anniversary Celebration Classic Collection Crystal Lugia 149/147 NM', 'lugia30c'],
  ['Pokemon 30th Anniversary Celebration Crystal Lugia 149/147 Classic Collection NM', 'lugia30c'],
  // Neither: a Korean 30th print is a third card.
  ['Lugia Aquapolis Crystal Type 149/147  – Pokemon 30th Anniversary korean', 'none']
]);

console.log('\n1b. NEO DESTINY SHINING CELEBI  vs  30th CLASSIC COLLECTION — both directions\n');
lands(['neo', 'celebi30c'], [
  ['Pokemon TCG Shining Celebi 106/105 Neo Destiny Secret Rare Holo Unlimited EN', 'neo'],
  ['Shining Celebi - 106/105 - Pokemon Neo Destiny Unlimited Holo Rare Card WOTC LP', 'neo'],
  ['SHINING CELEBI NEO DESTINY MP 106/105 2002 UNLIMITED HOLO RARE 106', 'neo'],
  ['Pokemon TCG Shining Celebi 106/105 Shining Neo Destiny Near Mint/perfect holo', 'neo'],
  ['Shining Celebi 106/105 30th Celebration Pokémon TCG', 'celebi30c'],
  ['Pokemon TCG Shining Celebi 106/105 30th Classic Collection', 'celebi30c'],
  ['Pokémon Shining Celebi Shining Rare Holo Neo Destiny 106/105 30TH CELEBRATIONS', 'celebi30c'],
  ['Shining Celebi  106/105 30th Celebration: Classic Collection English', 'celebi30c'],
  ['Shining Celebi 106/105 30th anniversary - Celebrations - Pokemon TCG card', 'celebi30c'],
  ['Shining Celebi 106/105 - 2026 Pokemon 30th Anniversary Gold NM', 'celebi30c'],
  // Says 30th AND 2000: contradicts itself, so it is neither. Refusing it
  // on both is the safe outcome; keeping it on either would be a guess.
  ['30th Shining Celebi 106/105 Neo Destiny Holo Secret Rare English 2000 50 HP', 'none']
]);

console.log('\n1c. BASE SET CHARIZARD  vs  CELEBRATIONS CC (2021)  vs  30th CC (2026) — three ways\n');
lands(['base', 'zard21', 'zard30c'], [
  ['Charizard 4/102 Base Set Holo Rare English Stage 2 120 HP Mitsuhiro Arita', 'base'],
  ['1999 Pokemon Base Set Charizard 4/102 Unlimited Holo Rare WOTC DAMAGED', 'base'],
  ['Pokemon TCG Charizard 4/102 Base Set Holo Rare 1999 English Arita', 'base'],
  // Live, $195, kept on the 1999 card before this change. "25th
  // Anniversary" is Celebrations — but only evidence on a card Celebrations
  // actually reprinted (see the McDonald's case in section 3).
  ['Charizard 4/102 Base Set Holo 25th Anniversary', 'zard21'],
  ['2021 Pokemon Celebrations Base Set Classic Collection Charizard 4/102', 'zard21'],
  ['Pokemon TCG: Charizard Holo 4/102 Celebrations Base Set', 'zard21'],
  ['Pokemon Charizard 4/102 30th Classic Collection Holo', 'zard30c'],
  ['Charizard 4/102 30th Celebration Classic Collection Base Set Holo NM', 'zard30c'],
  // The case that disabled the old guard: "30th Celebration" contains
  // "Celebration". It is the 30th card, and ONLY the 30th card.
  ['Pokemon 30th Celebration Charizard 4/102 Holo', 'zard30c']
]);

console.log('\n2. THE REPRINT IS ASKED FOR, AND MATCHED, BY ITS PRINTED NUMBER\n');
{
  const q = cm.buildQuery(CARDS.lugia30c, 'Raw NM');
  ok('30th CC Lugia query carries 149/147, not our ordinal 029/030', /149\/147/.test(q) && !/029/.test(q), q);
  ok('...and the family name sellers write ("30th Celebration")', /30th Celebration/.test(q), q);
  const q2 = cm.buildQuery(CARDS.zard21, 'Raw NM');
  ok('Celebrations CC Charizard query carries 4/102, not CC002/025', /\b4\/102\b/.test(q2) && !/CC002/.test(q2), q2);
  const q3 = cm.buildQuery(CARDS.aquapolis, 'Raw NM');
  ok('an ordinary card\'s query is unchanged', q3 === 'Lugia 149/147 Aquapolis pokemon', q3);
  // The frontend passes only a cardId; the set id must come from it.
  const q4 = cm.buildQuery({ cardId: 'en-30th-c-029', name: 'Lugia', number: '029', setTotal: 30 }, null);
  ok('the deep-link shape (cardId only) reaches the same printed number', /149\/147/.test(q4), q4);
  const v = cm.verify('Lugia 029/030 30th Classic Collection', CARDS.lugia30c, 'Raw NM');
  ok('our catalogue ordinal in a title is NOT the card (no seller writes it)', !v.ok, v.reason);
  const rp = cm.reprintOf(CARDS.lugia30c);
  ok('reprintOf names the original', rp && rp.originalId === 'en-ecard2-149' && rp.printed === '149/147',
     JSON.stringify(rp));
  ok('reprintOf is null for an ordinary card', cm.reprintOf(CARDS.aquapolis) === null);
  const ev = cm.verify('Lugia 149/147 30th Celebration', CARDS.lugia30c, 'Raw NM').evidence;
  ok('evidence reports the set id and the reprint relationship',
     ev.setId === '30th-c' && ev.reprintOf && ev.reprintOf.originalId === 'en-ecard2-149', JSON.stringify(ev));
}

console.log('\n3. NOTHING ABOUT OUR SIDE IS READ FROM A SET NAME\n');
{
  // A future set whose NAME contains a family word gains no exemption —
  // exactly the shape of the 30th Celebration ingest. Only its id counts.
  const future = { ...EN, name: 'Pikachu', number: '4', setTotal: 102, setId: 'zz99',
                   setName: 'Celebrations Returns', setYear: 2031 };
  ok('a set NAMED "Celebrations …" with an unrelated id is not Celebrations',
     !!cm.printingConflict('Pikachu 4/102 Celebrations Classic Collection', future, {}));
  // And a real family member renamed in the catalogue keeps its membership.
  const renamed = { ...CARDS.lugia30c, setName: 'ME: 30th Anniv. CC' };
  ok('a family set keeps its membership whatever its name says',
     cm.printingConflict('Lugia 149/147 30th Celebration CC', renamed, {}) === null);
  // No set id at all: treated as no family, and the evidence SAYS so.
  const bare = { ...EN, name: 'Lugia', number: '149', setTotal: 147, setName: 'Aquapolis', setYear: 2003 };
  ok('no set id -> evidence names "reprint set" as unchecked',
     cm.printingEvidence(bare).unchecked.includes('reprint set'));
  // "25th" only counts on an original a Celebrations card reprints.
  const mcd = { ...EN, name: 'Pikachu', number: '25', setTotal: 25, setId: '2021swsh',
                setName: "McDonald's Collection 2021", setYear: 2021 };
  ok("McDonald's 25th Anniversary Pikachu is KEPT on its own card",
     cm.verify("McDonald's 25th Anniversary Pikachu 25/25 Holo", mcd, 'Raw NM').ok,
     cm.verify("McDonald's 25th Anniversary Pikachu 25/25 Holo", mcd, 'Raw NM').reason);
  const other = { ...EN, name: 'Pikachu', number: '58', setTotal: 102, setId: 'base1',
                  setName: 'Base Set', setYear: 1999 };
  ok('"25th" on a card Celebrations did NOT reprint is not evidence',
     cm.printingConflict('Pikachu 58/102 Base Set 25th anniversary binder find', other, {}) === null);
  // The source itself: printingConflict must not test a family against setName.
  const src = fs.readFileSync(__dirname + '/cardmatch.js', 'utf8');
  const body = src.slice(src.indexOf('function printingConflict('), src.indexOf('function printingEvidence('));
  ok('printingConflict decides family membership by setIdOf(), not by setName',
     /familyOfSet\(setIdOf\(card\)\)/.test(body) && !/\.set\.test\(/.test(body) && !/setNot|reNot/.test(body));
}

console.log('\n4. THE TABLE ITSELF\n');
{
  const famSets = cm.REPRINT_FAMILIES.flatMap(f => f.sets);
  ok('no set belongs to two families', new Set(famSets).size === famSets.length);
  ok('30th is tested before Celebrations (order is the disambiguator)',
     cm.REPRINT_FAMILIES.findIndex(f => f.id === '30th') < cm.REPRINT_FAMILIES.findIndex(f => f.id === 'cel25'));
  for (const [set, table] of Object.entries(cm.REPRINT_OF)) {
    ok(`${set} is in a family`, !!cm.familyOfSet(set));
    const bad = Object.entries(table).filter(([, [orig, printed]]) =>
      !/^[a-z0-9.]+(-[a-z0-9.]+)*-[A-Za-z0-9]+$/.test(orig) || !/^\d+(\/\d+)?$/.test(printed));
    ok(`${set}: every row is [original id, printed N/M]`, !bad.length, JSON.stringify(bad));
    // A printed number must be the original's own number.
    const mism = Object.entries(table).filter(([, [orig, printed]]) =>
      cm.normNum(orig.slice(orig.lastIndexOf('-') + 1)) !== cm.normNum(printed.split('/')[0]));
    ok(`${set}: printed number == the original's number`, !mism.length, JSON.stringify(mism));
  }
  ok('30th Classic Collection maps all 30 cards', Object.keys(cm.REPRINT_OF['30th-c']).length === 30);
  ok('Celebrations Classic Collection maps all 25 cards', Object.keys(cm.REPRINT_OF['cel25cc']).length === 25);
}

async function catalogue() {
  console.log('\n5. THE TABLE AGREES WITH THE CATALOGUE\n');
  if (!process.env.DATABASE_URL) { console.log('  (skipped — DATABASE_URL not set; section 5 did NOT run)'); return; }
  let Pool; try { Pool = require('pg').Pool; } catch (e) { console.log('  (skipped — pg not installed)'); return; }
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const norm = s => String(s || '').toLowerCase().replace(/\s*(lv\.?x|δ|☆|★)\s*/g, ' ')
    .replace(/-(ex|gx)\b/g, ' $1').replace(/[^a-z0-9&]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/impostor/, 'imposter').replace(/^_+/, '');
  try {
    for (const [set, table] of Object.entries(cm.REPRINT_OF)) {
      for (const [num, [orig, printed]] of Object.entries(table)) {
        const r = await db.query(
          `SELECT api_card_id, name, set_total FROM cards WHERE api_card_id = ANY($1)`,
          [[`en-${set}-${num}`, `en-${orig}`]]);
        const mine = r.rows.find(x => x.api_card_id === `en-${set}-${num}`);
        const theirs = r.rows.find(x => x.api_card_id === `en-${orig}`);
        const tot = printed.split('/')[1];
        const good = mine && theirs &&
          norm(theirs.name).replace(/[^a-z]/g, '').includes(norm(mine.name).replace(/[^a-z]/g, '').replace(/^s/, '').slice(0, 5)) &&
          (!tot || String(theirs.set_total) === tot);
        ok(`en-${set}-${num} ${mine ? mine.name : '?'}  ->  en-${orig} ${theirs ? theirs.name + ' /' + theirs.set_total : 'MISSING'}`,
           !!good);
      }
    }
  } finally { await db.end(); }
}

// T0 (2026-09-30): the gate refused the 30th reprints on Aquapolis Lugia, but
// the eBay DEEP LINK — which nothing gates — handed eBay the same string and
// showed them. Every one of the 20 refused titles said "30th".
{
  console.log('\n6. DEEP LINKS EXCLUDE THE CARD\'S REPRINTS\n');
  const Q = (c, g) => cm.buildQuery(c, g || 'Raw NM', { forLink: true });
  const lugia = { cardId: 'en-ecard2-149', name: 'Lugia', number: '149', setTotal: 147, setName: 'Aquapolis' };
  const zard  = { cardId: 'en-base1-4', name: 'Charizard', number: '4', setTotal: 102, setName: 'Base Set' };
  const l30   = { cardId: 'en-30th-c-029', name: 'Lugia', number: '029', setTotal: 30 };
  const z30   = { cardId: 'en-30th-c-001', name: 'Charizard', number: '001', setTotal: 30 };
  const zcel  = { cardId: 'en-cel25cc-CC002', name: 'Charizard', number: 'CC002', setTotal: 25 };
  const pins  = { cardId: 'en-sv10-1', name: "Ethan's Pinsir", number: '1', setTotal: 182, setName: 'Destined Rivals' };
  ok('Aquapolis Lugia link excludes -30th', / -30th\b/.test(Q(lugia)));
  ok('Aquapolis Lugia link excludes -30th at PSA 10 too', / -30th\b/.test(Q(lugia, 'PSA 10')));
  ok('Aquapolis Lugia link does not exclude Celebrations (never reprinted it)', !/-celebrations/.test(Q(lugia)));
  ok('Base Set Charizard link excludes both families',
     / -30th\b/.test(Q(zard)) && /-celebrations/.test(Q(zard)) && /-25th/.test(Q(zard)));
  // What the link KEEPS: a reprint's own link must not exclude its own family.
  ok('30th Lugia link does not exclude its own family', !/-30th|-celebration/.test(Q(l30)) && /30th Celebration/.test(Q(l30)));
  ok('30th Charizard link excludes Celebrations by -25th only, never -celebrations',
     /-25th/.test(Q(z30)) && !/-celebrations|-"classic collection"/.test(Q(z30)));
  ok('Celebrations Charizard link excludes -30th, not itself', / -30th\b/.test(Q(zcel)) && !/-celebrations|-25th/.test(Q(zcel)));
  ok('a card nobody reprinted gains no reprint terms', !/-30th|-celebrations|-25th|legendary/.test(Q(pins)));
  ok('the API query (no forLink) is unchanged — the gate still decides', !/ -/.test(cm.buildQuery(lugia, 'Raw NM')));
  ok('the link fits eBay\'s keyword limit', Q(zard, 'PSA 10').length <= 300, Q(zard, 'PSA 10').length);
}

catalogue().then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
