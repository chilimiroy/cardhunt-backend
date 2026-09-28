/**
 * ══════════════════════════════════════════════════════════════
 * cardparse.test.js — free text -> card identity, end to end.
 *
 *   node cardparse.test.js          parse assertions only (no DB)
 *   node cardparse.test.js --db     also resolve against Supabase
 *
 * Standalone on purpose, like jptest.js: a downloaded ingest.js silently
 * reverted the whole JP filter fix once, and tests that live inside the
 * file being replaced disappear exactly when they are needed.
 *
 * ASSERT EXACT EQUALITY, NEVER includes(). A previous suite passed
 * "near pikachu ex" against a check for "pikachu ex" and hid a real bug —
 * the raw-condition stripper was leaving "near" in the card name.
 * ══════════════════════════════════════════════════════════════
 */
const { parseCardQuery, resolveCard } = require('./cardparse');

let pass = 0, fail = 0;
const failures = [];

function eq(label, got, want) {
  const ok = got === want;
  ok ? pass++ : (fail++, failures.push(`${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`));
  return ok;
}

// ── PARSE CASES ───────────────────────────────────────────────
// Every field asserted by exact equality. `undefined` in an expectation
// means "not asserted"; use null to assert the field IS null.
const PARSE_CASES = [
  {
    q: "psa 10 Charizard VMAX Rainbow Rare Secret 074/073 Champion's Path GEM MINT",
    want: { name: 'charizard vmax', number: '074', printedTotal: '073',
            grader: 'PSA', grade: '10', gradeString: 'PSA 10', gradeLabel: 'GEM MINT',
            rarity: 'Rare Rainbow', setHint: "champion's path", certId: null,
            language: null, setCode: null, condition: null }
  },
  {
    q: 'Charizard ex 199/165 151',
    want: { name: 'charizard ex', number: '199', printedTotal: '165',
            grader: null, grade: null, gradeString: 'Raw NM', rarity: null,
            setHint: '151', language: null, condition: null }
  },
  {
    q: 'bgs 9.5 Umbreon VMAX alt art 215/203 Evolving Skies',
    want: { name: 'umbreon vmax', number: '215', printedTotal: '203',
            grader: 'BGS', grade: '9.5', gradeString: 'BGS 9.5',
            rarity: 'Illustration Rare', setHint: 'evolving skies', language: null }
  },
  {
    q: 'cgc 10 Mega Gengar ex 284/217',
    want: { name: 'mega gengar ex', number: '284', printedTotal: '217',
            grader: 'CGC', grade: '10', gradeString: 'CGC 10',
            rarity: null, setHint: null, language: null }
  },
  {
    // The case that hid a bug: "near" must not survive into the name.
    q: 'raw near mint Pikachu ex 276',
    want: { name: 'pikachu ex', number: '276', printedTotal: null,
            grader: null, grade: null, condition: 'Raw NM', gradeString: 'Raw NM',
            rarity: null, setHint: null, language: null }
  },
  {
    q: 'リザードンex 201/165 PSA10',
    want: { name: 'リザードンex', number: '201', printedTotal: '165',
            grader: 'PSA', grade: '10', gradeString: 'PSA 10', language: 'ja' }
  },
  {
    q: 'Mega Charizard Y ex 294 Ascended Heroes',
    want: { name: 'mega charizard y ex', number: '294', printedTotal: null,
            grader: null, gradeString: 'Raw NM', setHint: 'ascended heroes', language: null }
  },
  {
    q: 'Charizard',
    want: { name: 'charizard', number: null, printedTotal: null,
            grader: null, grade: null, gradeString: 'Raw NM',
            rarity: null, setHint: null, condition: null, language: null }
  },

  // ── Regression guards ───────────────────────────────────────
  { q: 'psa10 charizard', want: { grader: 'PSA', grade: '10', name: 'charizard' } },
  { q: 'PSA 9 Blastoise', want: { grader: 'PSA', grade: '9', gradeString: 'PSA 9', name: 'blastoise' } },
  { q: 'bgs 9.5 Lugia',   want: { grader: 'BGS', grade: '9.5', gradeString: 'BGS 9.5' } },
  // half-grades must not be truncated to their integer
  { q: 'cgc 8.5 Mewtwo',  want: { grader: 'CGC', grade: '8.5', gradeString: 'CGC 8.5' } },
  // cert numbers
  { q: 'psa cert 12345678 Charizard', want: { certId: '12345678', grader: 'PSA', name: 'charizard' } },
  // lightly played must not leave "lightly" behind
  { q: 'lightly played Snorlax', want: { condition: 'Raw LP', gradeString: 'Raw LP', name: 'snorlax' } },
  // set code recognition
  { q: 'リザードン s12a 105', want: { setCode: 's12a', number: '105', language: 'ja' } },
  // "mint" alone is a raw condition, not a PSA grade label
  { q: 'mint Charizard', want: { grader: null, condition: 'Raw NM', name: 'charizard' } },
  // empty input must not throw
  { q: '', want: null },

  // ── Card names the parser used to eat (searchaudit.js, 2026-09-28) ──
  // A bare TAG / ACE is a card-name word; only "tag 10" is a grader.
  { q: 'Spell Tag',   want: { name: 'spell tag', grader: null, grade: null } },
  { q: 'Ace Trainer', want: { name: 'ace trainer', grader: null } },
  { q: 'tag 10 Pikachu', want: { grader: 'TAG', grade: '10', name: 'pikachu' } },
  { q: 'psa Charizard',  want: { grader: 'PSA', name: 'charizard' } },
  // A number is only CERTAIN in N/T form; the others are guesses.
  { q: 'Alakazam 4',        want: { number: '4', numberFrom: 'bare', name: 'alakazam' } },
  { q: "Blaine's Quiz #2",  want: { number: '2', numberFrom: 'hash' } },
  { q: 'Alakazam 4 1/111',  want: { number: '1', numberFrom: 'slash', printedTotal: '111', name: 'alakazam 4' } },
  // Set-marker words are recorded as such, so the resolver can try them as name.
  { q: 'Paldean Clodsire ex', want: { name: null, setHint: 'paldean clodsire ex', setHintFrom: 'words' } },
  { q: 'リザードン s12a 105',   want: { setHintFrom: 'code' } },
  // Identity symbols survive into the name.
  { q: 'Shaymin ◇',  want: { name: 'shaymin ◇' } },
  { q: 'Nidoran ♀',  want: { name: 'nidoran ♀' } }
];

// ── NAME NORMALISER — one folding for typed text and stored names ──
const { normName, nameTokens } = require('./cardparse');
const NORM_CASES = [
  ['Pikachu & Zekrom GX',   ['pikachu', 'zekrom', 'gx']],
  ['Pikachu & Zekrom-GX',   ['pikachu', 'zekrom', 'gx']],
  ['Pikachu and Zekrom GX', ['pikachu', 'zekrom', 'gx']],
  ["Farfetch'd",            ['farfetchd']],
  ['Farfetch’d',            ['farfetchd']],
  ['Mr. Mime',              ['mr', 'mime']],
  ['Flabébé',               ['flabebe']],
  ['Pokémon Center Lady',   ['center', 'lady']],
  ['Urn of Vitality',       ['urn', 'vitality']],
  ['Shaymin◇',              ['shaymin', '◇']],
  ['Latios δ',              ['latios', 'δ']],
  ['リザードンex',           ['リザードンex']]
];
function runNorm() {
  if (typeof nameTokens !== 'function') { eq('cardparse exports nameTokens', false, true); return; }
  console.log(`\n${'='.repeat(70)}\n  NORMALISE — typed and stored names fold the same way\n${'='.repeat(70)}\n`);
  for (const [s, want] of NORM_CASES) {
    const ok = eq(`nameTokens(${s})`, JSON.stringify(nameTokens(s)), JSON.stringify(want));
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${s.padEnd(24)} -> ${nameTokens(s).join(' ')}`);
  }
}

function runParse() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  PARSE — free text to card identity');
  console.log(`${'='.repeat(70)}\n`);
  for (const c of PARSE_CASES) {
    const got = parseCardQuery(c.q);
    if (c.want === null) { eq(`[${c.q || '(empty)'}] returns null`, got, null); continue; }
    const label = c.q.length > 42 ? c.q.slice(0, 42) + '…' : c.q;
    let allOk = true;
    for (const [k, v] of Object.entries(c.want)) {
      if (!eq(`[${label}] .${k}`, got ? got[k] : undefined, v)) allOk = false;
    }
    console.log(`  ${allOk ? 'ok  ' : 'FAIL'}  ${label}`);
  }
}

// ── RESOLUTION CASES ──────────────────────────────────────────
// The card each query MUST resolve to, by exact api_card_id. Verified
// against the live database 2026-08-26.
//
// NOTE: TASK.md's illustrative example writes "en-swsh35-074". The real
// stored id is `en-swsh3.5-74` — our set ids use ".5", not "pt5"/"35",
// and this set stores numbers unpadded. Assert what the database holds.
const RESOLVE_CASES = [
  { q: "psa 10 Charizard VMAX Rainbow Rare Secret 074/073 Champion's Path GEM MINT",
    id: 'en-swsh3.5-74', confident: true },
  { q: 'Charizard ex 199/165 151',                         id: 'en-sv03.5-199', confident: true },
  { q: 'bgs 9.5 Umbreon VMAX alt art 215/203 Evolving Skies', id: 'en-swsh7-215', confident: true },
  { q: 'cgc 10 Mega Gengar ex 284/217',                    id: 'en-me02.5-284', confident: true },
  { q: 'raw near mint Pikachu ex 276',                     id: 'en-me02.5-276', confident: true },
  { q: 'リザードンex 201/165 PSA10',                        id: 'ja-SV2a-201',   confident: true },
  { q: 'Mega Charizard Y ex 294 Ascended Heroes',          id: 'en-me02.5-294', confident: true },
  // Must NOT pick one — a bare Pokemon name is genuinely ambiguous.
  { q: 'Charizard',                                        id: null, confident: false }
];

// Top candidate wins outright only when it clears the runner-up by this
// much. Below it we return candidates and let the user choose — guessing
// between close candidates is how prices got scrambled before.
const CONFIDENT_GAP = 40;

async function runResolve() {
  const { Pool } = require('pg');
  if (!process.env.DATABASE_URL) {
    console.log('\n  (skipping resolution — DATABASE_URL not set)\n');
    return;
  }
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log(`\n${'='.repeat(70)}`);
  console.log('  RESOLVE — identity against the real database');
  console.log(`${'='.repeat(70)}\n`);

  for (const c of RESOLVE_CASES) {
    const parsed = parseCardQuery(c.q);
    const cands = await resolveCard(db, parsed);
    const top = cands[0], second = cands[1];
    const gap = top ? (second ? top.score - second.score : 999) : 0;
    const isConfident = !!top && gap >= CONFIDENT_GAP;
    const label = c.q.length > 40 ? c.q.slice(0, 40) + '…' : c.q;

    eq(`[${label}] confident`, isConfident, c.confident);
    if (c.id !== null) {
      eq(`[${label}] resolves to`, top ? top.api_card_id : null, c.id);
    } else {
      // Ambiguous: must return several candidates rather than pick one.
      const many = cands.length > 1;
      eq(`[${label}] returns multiple candidates`, many, true);
    }
    console.log(`  ${isConfident === c.confident ? 'ok  ' : 'FAIL'}  ` +
      `${(top ? top.api_card_id : '(none)').padEnd(16)} gap=${String(gap).padEnd(5)} ` +
      `n=${String(cands.length).padEnd(3)} ${label}`);
  }

  // ── Reachable by its own name (searchaudit.js, 2026-09-28) ──
  // Each query must list the card among its candidates. One per cause.
  console.log(`\n  -- reachable by name --`);
  for (const [q, id] of FIND_CASES) {
    const cands = await resolveCard(db, parseCardQuery(q), { limit: 25 });
    const ids = cands.map(c => c.api_card_id);
    const ok = eq(`[${q}] candidates include ${id}`, ids.indexOf(id) >= 0, true);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${id.padEnd(18)} n=${String(cands.length).padEnd(3)} ${q}`);
  }

  // ── The SQL fold and the JS one must agree ──
  // Two implementations of one rule is the drift this project keeps
  // recording; this is the cross-check, on real names with punctuation.
  const { foldSql, fold } = require('./cardparse');
  if (typeof foldSql !== 'function') { eq('cardparse exports foldSql', false, true); await db.end(); return; }
  const nr = await db.query(`SELECT name, ${foldSql('name')} AS n FROM cards
                             WHERE name ~ '[^A-Za-z0-9 ]' LIMIT 4000`);
  const bad = nr.rows.filter(r => r.n !== fold(r.name));
  eq(`SQL and JS folds agree on ${nr.rows.length} punctuated names`, bad.length, 0);
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  SQL and JS folds agree on ${nr.rows.length} names` +
    (bad.length ? ` — e.g. ${JSON.stringify(bad.slice(0, 3).map(r => [r.name, r.n, fold(r.name)]))}` : ''));
  // ...and the claim the SQL rests on: every word of the normalised name is
  // a substring of the fold, so matching a word against the fold is exact.
  const lost = nr.rows.filter(r => normName(r.name).split(' ').some(w => w && !fold(r.name).includes(w)));
  eq('every normalised word is findable in the fold', lost.length, 0);
  console.log(`  ${lost.length ? 'FAIL' : 'ok  '}  every normalised word is findable in the fold` +
    (lost.length ? ` — e.g. ${JSON.stringify(lost.slice(0, 3).map(r => r.name))}` : ''));
  await db.end();
}

const FIND_CASES = [
  ['Pikachu Zekrom GX',     'en-sm9-33'],   // the report
  ['Pikachu & Zekrom-GX',   'en-sm9-33'],
  ['Pikachu and Zekrom GX', 'en-sm9-33'],
  ['Paldean Clodsire ex',   'en-sv02-130'], // set-marker word opens the name
  ['Shining Lugia',         'en-smp-SM82'],
  ['Iron Crown ex',         'en-sv05-081'], // set-marker word mid-name
  ['Alakazam 4',            'en-pl2-103'],  // number in the name
  ['Metal Cube 01',         'en-ecard2-129'],
  ["Blaine's Quiz #2",      'en-gym2-111'],
  ['Spell Tag',             'en-sm8-190'],  // bare TAG
  ['Ace Trainer',           'en-xy7-69'],   // bare ACE
  ['Urn of Vitality',       'en-swsh5-139'],// noise word inside the name
  ['Farfetchd',             'en-base1-27'], // apostrophe typed without
  ['Mr Mime 22/64',         'en-base2-22']  // period typed without
];

(async () => {
  runParse();
  runNorm();
  if (process.argv.includes('--db')) await runResolve();
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\n  FAILURES:');
    for (const f of failures) console.log('    ' + f);
    console.log('');
  } else console.log('');
  process.exit(fail ? 1 : 0);
})();
