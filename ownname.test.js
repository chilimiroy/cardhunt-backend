// ownname.test.js — a card's OWN name and set name are not lot vocabulary
// (T2, 2026-10-04), and a set sold as one listing is not one card (T4).
//
// Every English card's "name number/total set name" was run through the lot
// test: 236 of 21,152 were refused on their own identity — all 168 of
// Forbidden Light ("light"), Gym Badge, Mystery Garden, Tool Box, Iron
// Bundle, Booster Energy Capsule, the Poké Card Creator Pack set… The
// titles below are real (querygap.js, eBay US, 2026-10-04). The KEEP cases
// fail on the old gate; the REFUSE cases prove the words still bite.
//
//   node ownname.test.js          offline
//   node ownname.test.js --db     + every English card's own identity (needs DATABASE_URL)

const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) pass++; else { fail++; console.log('  FAIL ' + label + (extra ? '  — ' + extra : '')); }
}
const card = (name, number, setTotal, setName, setId, setYear) =>
  ({ name, number, setTotal, setName, setId, setYear, lang: 'en' });
const lotReason = (title, c, grade) => {
  const v = cm.verify(title, c, grade || 'Raw');
  return /not a single card/.test(v.reason || '') ? v.reason : null;
};

const LUCARIO = card('Lucario GX', '135', 131, 'Forbidden Light', 'sm6', 2018);
const GRENINJA = card('Greninja GX', '133', 131, 'Forbidden Light', 'sm6', 2018);
const EXEGG = card('Alolan Exeggutor', '2', 131, 'Forbidden Light', 'sm6', 2018);
const BUNDLE = card('Iron Bundle', '056', 182, 'Paradox Rift', 'sv04', 2023);
const BADGE = card('Elemental Badge', '147', 203, 'Evolving Skies', 'swsh7', 2021);
const MUDKIP = card('Mudkip', '4', 5, 'Poké Card Creator Pack', 'ex5.5', 2004);
const BLAINE = card('Blaine’s Last Stand', '58', 70, 'Dragon Majesty', 'sm7.5', 2018);
const ALAKAZAM = card('Alakazam EX', '125', 124, 'Fates Collide', 'xy10', 2016);
const MEW = card('Mew ex', '152', 128, '30th Celebration', '30th', 2026);

// ── KEEP: the card's own name / set name was the only "lot" word ──
const KEEP = [
  [LUCARIO, 'Pokémon TCG Lucario GX 135/131 SM-Forbidden Light 210 HP Secret Rare Holo English'],
  [LUCARIO, 'Lucario GX 135/131 Forbidden Light Secret Rare Rainbow Pokemon Card'],
  [GRENINJA, 'Pokemon - Forbidden Light - Greninja Gx - Rainbow Rare - 133/131'],
  [GRENINJA, 'GRENINJA GX 133/131 RAINBOW FORBIDDEN LIGHT POKEMON HOLO NM'],
  [EXEGG, 'Alolan Exeggutor 2/131 Rare Forbidden Light Pokemon Moderately Played'],
  [EXEGG, 'Alolan Exeggutor 2/131 Rare Forbidden Light Pokemon Reverse Holo Lightly Played'],
  [BUNDLE, 'Iron Bundle 056/182 Paradox Rift Pokemon Card NM'],
  [BADGE, 'Elemental Badge 147/203 Evolving Skies Pokemon'],
  [MUDKIP, 'Mudkip 4/5 Poke Card Creator Pack Kids WB 2004 Pokemon'],
  [BLAINE, "Blaine's Last Stand 58/70 Dragon Majesty Pokemon NM"],
  [BLAINE, 'Blaines Last Stand 58/70 Dragon Majesty'],
];
for (const [c, t] of KEEP) check('KEEP ' + t, !lotReason(t, c), lotReason(t, c));

// ── REFUSE: lot words beside the card's own name still bite ──
const REFUSE = [
  [LUCARIO, 'Pokemon🔥LUCARIO GX 135/131🔥GOLD FOIL Custom Card🔥Forbidden Light🔥'],
  [LUCARIO, 'Forbidden Light Booster Box Lucario GX 135/131'],
  [EXEGG, 'Forbidden Light lot of 10 Alolan Exeggutor 2/131'],
  [BUNDLE, 'Iron Bundle 056/182 Paradox Rift x4 playset'],
  [BADGE, 'Elemental Badge 147/203 Evolving Skies pin'],
  [MUDKIP, 'Poke Card Creator Pack sealed Mudkip 4/5'],
  // T4: a set sold as one listing
  [ALAKAZAM, 'Fates Collide Partial Set | Alakazam EX 125/124'],
  [MEW, '30th Celebration Partial Set | Mew ex 152/128 SIR + Binder | Pokemon TCG'],
  [ALAKAZAM, 'Fates Collide Complete Set 125/124 Alakazam EX included'],
  [ALAKAZAM, 'Alakazam EX 125/124 Fates Collide full set'],
];
for (const [c, t] of REFUSE) check('REFUSE ' + t, !!lotReason(t, c), 'kept');

// The mask never reaches past the lot test: a title naming the set but the
// wrong number is still refused, for that reason.
{
  const v = cm.verify('Lucario GX 122/131 Forbidden Light Pokemon', LUCARIO, 'Raw');
  check('wrong number still refused', !v.ok && !/not a single card/.test(v.reason || ''), v.reason);
}
// A slab is still a slab on a raw search.
{
  const v = cm.verify('Lucario GX 135/131 Forbidden Light PSA 10', LUCARIO, 'Raw');
  check('slab still refused on raw', !v.ok, v.reason);
}

(async () => {
  if (process.argv.includes('--db')) {
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const r = await p.query(`SELECT api_card_id, name, number, set_api_id, set_name, set_total, set_release
      FROM cards WHERE api_card_id LIKE 'en-%' AND COALESCE(set_series,'') <> 'Pokémon TCG Pocket'`);
    let refused = [];
    for (const c of r.rows) {
      const k = card(c.name, c.number, c.set_total, c.set_name, c.set_api_id,
        c.set_release ? new Date(c.set_release).getFullYear() : null);
      const why = lotReason(`${c.name} ${c.number}/${c.set_total} ${c.set_name} Pokemon Card`, k);
      if (why) refused.push(c.api_card_id + ' ' + why);
    }
    check(`--db: 0 of ${r.rows.length} English cards refused on their own identity`, !refused.length,
      refused.length + ': ' + refused.slice(0, 5).join('; '));
    await p.end();
  }
  console.log(`  ownname.test.js — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
