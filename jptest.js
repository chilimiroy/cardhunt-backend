/**
 * ══════════════════════════════════════════════════════════════
 * CardHunt — JP listing filter self-test.
 *
 *   node jptest.js            <- works even if ingest.js has been replaced
 *   node ingest.js filtertest <- same thing, via the CLI
 *
 * A filter that rejects records needs a test proving what it KEEPS. The old
 * lot filter passed 45-50 of every 50 listings and nobody noticed, because
 * only its rejections were ever examined. Every title below is real, taken
 * from a live Yahoo response.
 *
 * This lives OUTSIDE ingest.js on purpose. A downloaded ingest.js silently
 * reverted the whole filter fix once (2026-08-21), and three nights of
 * `refresh` re-contaminated the database before anyone noticed. Tests that
 * live in the file being replaced disappear exactly when they are needed.
 * ══════════════════════════════════════════════════════════════
 */
const jpf = require('./jpfilter');

const CARD_CAT   = { category: { name: jpf.JP_CARD_CATEGORY } };
const SEALED_CAT = { category: { name: jpf.JP_SEALED_CATEGORIES[0] } };
const SHIRT_CAT  = { category: { name: 'イラスト、キャラクター' },
                     categoryPath: [{ name: 'ファッション' }, { name: 'Tシャツ' }] };

const FILTER_CASES = [
  // ── MUST KEEP: a single raw copy of the card we asked about ──
  { keep: true,  card: 'リザードン',
    item: { ...CARD_CAT, title: 'ポケモンカード リザードン 旧裏面 初版' } },
  { keep: true,  card: 'リザードン',
    item: { ...CARD_CAT, title: 'リザードンex SAR 黒炎の支配者 美品' } },
  { keep: true,  card: 'コータス',
    item: { ...CARD_CAT, title: 'ポケモンカード コータス 19/95 SM7' } },
  { keep: true,  card: 'ピカチュウ',
    item: { ...CARD_CAT, title: 'ピカチュウ プロモ 極美品 送料無料' } },
  { keep: true,  card: 'ミュウツー',
    item: { ...CARD_CAT, title: 'ミュウツーex 134/108 SAR' } },

  // ── MUST REJECT: lots, sealed product, slabs, wrong card, non-cards ──
  { keep: false, card: 'リザードン',
    item: { ...CARD_CAT, title: 'ポケモンカード キラカード 100枚セット まとめ売り リザードンex' } },
  { keep: false, card: 'リザードン',
    item: { ...CARD_CAT, title: 'PSA10 リザードンex SAR 黒炎の支配者 134/108' } },
  { keep: false, card: 'リザードン',
    item: { ...SEALED_CAT, title: '新品未開封 5パックセット リザードン' } },
  { keep: false, card: 'リザードン',
    item: { ...SHIRT_CAT, title: 'ユニクロ UT ポケモン ギャラドス＆リザードン Tシャツ XXL' } },
  { keep: false, card: 'リザードン',
    item: { ...CARD_CAT, title: 'ポケモン モンコレ フィギュア メガリザードンX 3体セット' } },
  { keep: false, card: 'コータス',
    item: { ...CARD_CAT, title: 'ポケモンカード ピカチュウ 25/100' } },
  { keep: false, card: 'コータス', item: { ...CARD_CAT, title: '' } },
  { keep: false, card: 'コータス', item: { title: 'ポケモンカード コータス 19/95' } },
  // Yahoo's bare-number title — the case the old "can't judge, keep" default let through
  { keep: false, card: 'コータス', item: { ...CARD_CAT, title: '19' } },
  { keep: false, card: 'リザードン',
    item: { ...CARD_CAT, title: 'リザードン 引退品 大量 まとめ' } },

  // ── NUMBER / SET-TOTAL: the ラティアス collision and its inverse ──
  { keep: true,  card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ラティアス ミラー [S12a 105/172] ポケモンカード' } },
  { keep: false, card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ラティアス＆ラティオスGX SR SM9 105/095 タッグボルト' } },
  { keep: true,  card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ポケモンカード ラティアス S12a 美品' } },
  { keep: false, card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ポケモンカード ラティアス キラ' } },
  { keep: true,  card: { name: 'アサナン', number: '084', setTotal: 193, setId: 'M2a' },
    item: { ...CARD_CAT, title: 'ポケモンカード アサナン M2a 084/193' } },
  { keep: true,  card: { name: 'アサナン', number: '084', setTotal: 193, setId: 'M2a' },
    item: { ...CARD_CAT, title: 'ポケモンカード アサナン 84/193' } },
  { keep: false, card: { name: 'アサナン', number: '084', setTotal: 193, setId: 'M2a' },
    item: { ...CARD_CAT, title: 'ポケモンカード アサナン 084/165' } },
  { keep: true,  card: { name: 'コータス' },
    item: { ...CARD_CAT, title: 'ポケモンカード コータス キラ' } },

  // ── MULTI-CARD BUNDLES that use no lot vocabulary ──
  { keep: false, card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ポケモンカード s8 075/100 ラティオス 074/100 ラティアス s12a 105/172 ラティアス' } },
  { keep: false, card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: '1円〜 ポケモンカード M2a 127/193 レックウザ S12a 105/172 ラティアス 他' } },
  { keep: true,  card: { name: 'ラティアス', number: '105', setTotal: 172, setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ラティアス 105/172 S12a ( 105/172 ) 美品' } },

  // ── A MISSING setTotal MUST FAIL CLOSED ──
  // refreshDue selected set_api_id but not set_total, so setTotal arrived
  // undefined, the total check switched itself off, and "SM9 105/095" matched
  // #105 again. ja-S12a-105 was rewritten to $1,294.90 on 2026-08-22 — worse
  // than the $993 the original bug produced. A check that cannot run must
  // reject, never wave through.
  { keep: false, card: { name: 'ラティアス', number: '105', setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ラティアス＆ラティオスGX SR SM9 105/095' } },
  { keep: true,  card: { name: 'ラティアス', number: '105', setId: 'S12a' },
    item: { ...CARD_CAT, title: 'ポケモンカード ラティアス S12a 105/172' } },
  { keep: false, card: { name: 'ラティアス', number: '105' },
    item: { ...CARD_CAT, title: 'ラティアス＆ラティオスGX SR SM9 105/095' } },

  // ── GRADE REQUESTS invert exactly one rule ──
  { keep: true,  grade: 'PSA 10', card: { name: 'リザードン', number: '134', setTotal: 108, setId: 'sv3' },
    item: { ...CARD_CAT, title: 'PSA10 リザードンex SAR 134/108' } },
  { keep: false, grade: 'PSA 10', card: { name: 'リザードン', number: '134', setTotal: 108, setId: 'sv3' },
    item: { ...CARD_CAT, title: 'PSA10 リザードンex 134/108 まとめ 10枚' } },
  { keep: false, grade: 'PSA 9',  card: { name: 'リザードン', number: '134', setTotal: 108, setId: 'sv3' },
    item: { ...CARD_CAT, title: 'PSA10 リザードンex SAR 134/108' } }
];

// ══════════════════════════════════════════════════════════════
// ENGLISH / eBay cases. Same rules, different vocabulary. eBay states
// grades spaced ("PSA 10") where Yahoo states them unspaced ("PSA10") —
// both must work off the one definition.
// ══════════════════════════════════════════════════════════════
const CHARIZARD = { name: 'Charizard ex', number: '223', setTotal: 197, setId: 'sv03' };
const PIKA      = { name: 'Pikachu', number: '025', setTotal: 165, setId: 'sv2a' };

// Champion's Path #74 — a secret rare, so number 74 exceeds setTotal 73.
// Carries setName because English sellers state the set by NAME and never by
// the code `swsh3.5`; see jpTitleMatchesNumber.
const CZVMAX = { name: 'Charizard VMAX', number: '74', setTotal: 73,
                 setId: 'swsh3.5', setName: "Champion's Path" };

const EN_CASES = [
  // ── KEEP: a single raw copy ──
  { keep: true,  card: CHARIZARD, item: { title: 'Pokemon Charizard ex 223/197 Obsidian Flames SIR NM' } },
  { keep: true,  card: CHARIZARD, item: { title: 'Charizard ex - 223/197 - Special Illustration Rare' } },
  { keep: true,  card: PIKA,      item: { title: 'Pikachu 025/165 Pokemon 151 Near Mint' } },

  // ── REJECT: lots, sealed, fakes, wrong card ──
  { keep: false, card: CHARIZARD, item: { title: 'Pokemon Card Lot 100 Cards Charizard ex 223/197 Guaranteed' } },
  { keep: false, card: CHARIZARD, item: { title: 'Charizard ex 223/197 Booster Box Sealed ETB' } },
  { keep: false, card: CHARIZARD, item: { title: 'Charizard ex 223/197 Custom Proxy Orica Card' } },
  { keep: false, card: CHARIZARD, item: { title: 'Charizard ex 223/197 x4 Playset' } },
  { keep: false, card: CHARIZARD, item: { title: 'Pokemon Charizard ex 223/197 and Pikachu 025/165 Bundle' } },
  { keep: false, card: CHARIZARD, item: { title: 'Blastoise ex 200/197 Obsidian Flames' } },   // wrong card
  { keep: false, card: CHARIZARD, item: { title: 'Charizard ex 125/197 Obsidian Flames' } },   // wrong number
  { keep: false, card: CHARIZARD, item: { title: '' } },                                        // unreadable
  // raw request must never return a slab
  { keep: false, card: CHARIZARD, item: { title: 'PSA 10 Charizard ex 223/197 Obsidian Flames' } },

  // ── GRADE: eBay spacing, and no bleed between neighbouring grades ──
  { keep: true,  grade: 'PSA 10', card: CHARIZARD,
    item: { title: 'PSA 10 Charizard ex 223/197 Obsidian Flames GEM MINT' } },
  { keep: false, grade: 'PSA 10', card: CHARIZARD,
    item: { title: 'PSA 9 Charizard ex 223/197 Obsidian Flames' } },

  // ── SET NAME as the disambiguator, for titles with no "N/M" pair ──
  // English sellers write "#74 Champion's Path", not "74/73" and never
  // "swsh3.5". Only the N/M form could previously be verified, so every
  // title in this shape was dropped with no error and no count.
  { keep: true,  grade: 'PSA 10', card: CZVMAX,
    item: { title: "Charizard VMAX #74 Champion's Path PSA 10 Gem Mint" } },
  { keep: true,  grade: 'PSA 10', card: CZVMAX,
    item: { title: 'Charizard VMAX 74 Champions Path PSA 10' } },          // no apostrophe
  { keep: true,  grade: 'PSA 10', card: CZVMAX,
    item: { title: 'Charizard VMAX 74 CHAMPIONS PATH PSA 10' } },          // shouty
  { keep: true,  grade: 'PSA 10', card: CZVMAX,
    item: { title: "PSA 10 Charizard VMAX Champion's Path #074 Secret Rare" } },  // zero-padded
  { keep: true,  grade: 'PSA 10', card: CZVMAX,
    item: { title: "Pokemon Champion's Path Charizard VMAX 074/073 PSA 10" } },   // N/M still works

  // The set name must not become a licence to skip the number. Champion's
  // Path holds more than one Charizard, and the setId branch above returns
  // true with no number check at all — this branch must be stricter.
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: "Charizard VMAX Champion's Path PSA 10" } },            // no number
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: 'Charizard VMAX #74 Darkness Ablaze PSA 10' } },        // wrong set
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: "Charizard VMAX #174 Champion's Path PSA 10" } },       // 174 is not 74
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: 'Charizard VMAX 2074 Champions Path PSA 10' } },        // nor is 2074
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: "Charizard VMAX Champion's Path $74 PSA 10" } },        // a price, not a number
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: "Charizard VMAX #74 Champion's Path PSA 9" } },         // wrong grade
  { keep: false, grade: 'PSA 10', card: CZVMAX,
    item: { title: "Champions Path Lot of 10 Cards Charizard VMAX #74 PSA 10" } }, // a lot
  { keep: false, grade: 'PSA 9',  card: CHARIZARD,
    item: { title: 'PSA 9.5 Charizard ex 223/197' } },          // 9 must not eat 9.5
  { keep: false, grade: 'BGS 9',  card: CHARIZARD,
    item: { title: 'BGS 9.5 Charizard ex 223/197' } },
  { keep: true,  grade: 'BGS 9.5', card: CHARIZARD,
    item: { title: 'BGS 9.5 Charizard ex 223/197 Gem Mint' } },
  { keep: false, grade: 'PSA 10', card: CHARIZARD,
    item: { title: 'PSA 10 Charizard ex 223/197 LOT OF 3 SLABS' } },
  { keep: false, grade: 'PSA 10', card: CHARIZARD,
    item: { title: 'Charizard ex 223/197 Raw Ungraded NM' } },  // raw when a grade was asked for
  // a grade request must still not cross card identity
  { keep: false, grade: 'PSA 10', card: CHARIZARD,
    item: { title: 'PSA 10 Blastoise ex 200/197' } }
];

// The "Raw NM" family must all mean ungraded. cardparse emits these for
// every ungraded query; the frontend GRADES[] uses them too. When only
// bare "raw" counted, /api/search returned zero listings for every
// ungraded search because "Raw NM" was matched as if it were a slab label.
const RAW_GRADE_CASES = [
  ['Raw',       true],  ['raw',      true],  ['ungraded', true],
  ['none',      true],  ['',         true],  [null,       true],
  ['Raw NM',    true],  ['Raw LP',   true],  ['Raw MP',   true],
  ['Raw HP',    true],  ['Raw DMG',  true],  ['raw nm',   true],
  ['PSA 10',    false], ['PSA10',    false], ['BGS 9.5',  false],
  ['CGC 10',    false], ['SGC 9',    false]
];

function rawGradeTest() {
  let pass = 0, fail = 0;
  console.log('\n  -- isRawGrade --');
  for (const [g, want] of RAW_GRADE_CASES) {
    const got = require('./jpfilter').isRawGrade(g);
    const ok = got === want;
    ok ? pass++ : fail++;
    if (!ok) console.log(`  FAIL  ${JSON.stringify(g)} -> ${got}, want ${want}`);
  }
  console.log(`  ${pass}/${RAW_GRADE_CASES.length} ok`);
  return { pass, fail, keeps: RAW_GRADE_CASES.filter(c => c[1]).length, total: RAW_GRADE_CASES.length };
}

function enTest() {
  let pass = 0, fail = 0;
  console.log('\n  -- English / eBay --');
  for (const c of EN_CASES) {
    const got = require('./jpfilter').enItemMatchesRequest(c.item, c.card, c.grade);
    const ok = got === c.keep;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  want ${c.keep ? 'KEEP  ' : 'REJECT'}  got ${got ? 'KEEP  ' : 'REJECT'}  ` +
      `[${c.card.name}${c.grade ? ' ' + c.grade : ''}] ${String(c.item.title || '(empty)').slice(0, 38)}`);
  }
  return { pass, fail, keeps: EN_CASES.filter(c => c.keep).length, total: EN_CASES.length };
}

function filterTest() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  JP LISTING FILTER SELF-TEST');
  console.log(`${'='.repeat(70)}\n`);
  let pass = 0, fail = 0;
  for (const c of FILTER_CASES) {
    const got = c.grade
      ? jpf.jpItemMatchesRequest(c.item, c.card, c.grade)
      : jpf.jpItemIsSingleCard(c.item, c.card);
    const ok = got === c.keep;
    ok ? pass++ : fail++;
    const label = (typeof c.card === 'string') ? c.card : c.card.name;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  want ${c.keep ? 'KEEP  ' : 'REJECT'}  got ${got ? 'KEEP  ' : 'REJECT'}  ` +
      `[${label}${c.grade ? ' ' + c.grade : ''}] ${String(c.item.title || '(empty)').slice(0, 38)}`);
  }
  const en = enTest();
  pass += en.pass; fail += en.fail;
  const rg = rawGradeTest();
  pass += rg.pass; fail += rg.fail;

  const keeps = FILTER_CASES.filter(c => c.keep).length + en.keeps + rg.keeps;
  const total = FILTER_CASES.length + en.total + rg.total;
  console.log(`\n  ${pass} passed, ${fail} failed  ` +
    `(${keeps} of ${total} cases assert the filter KEEPS a valid listing)`);
  console.log(fail ? '\n  Filter is NOT safe to price with.\n' : '');
  return fail === 0;
}

module.exports = { filterTest, enTest, rawGradeTest, FILTER_CASES, EN_CASES, RAW_GRADE_CASES };

if (require.main === module) process.exit(filterTest() ? 0 : 1);
