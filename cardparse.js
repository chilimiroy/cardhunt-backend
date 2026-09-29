// ══════════════════════════════════════════════════════════════
// cardparse.js — free text -> structured card identity
//
// Turns what a person types or pastes into the fields needed to resolve
// an exact card and grade:
//
//   "psa 10 Charizard VMAX Rainbow Rare Secret 074/073 Champion's Path GEM MINT"
//     -> { grader:'PSA', grade:'10', gradeLabel:'GEM MINT',
//          number:'074', printedTotal:'073', rarity:'Rare Rainbow',
//          setHint:"Champion's Path", name:'Charizard VMAX', certId:null }
//
// Extraction order matters. Grade, cert and number are removed first
// because they are unambiguous; whatever survives is the card name.
//
// Usage:
//   const { parseCardQuery, resolveCard } = require('./cardparse');
//   const parsed = parseCardQuery(input);
//   const card   = await resolveCard(db, parsed);
// ══════════════════════════════════════════════════════════════

// ── Grading companies, with the spellings people actually type ──
// Pocket (digital-only) cards are never a search candidate — digital.js.
const digital = require('./digital');
const cardid = require('./cardid');

// `needsGrade`: the word is also an ordinary card-name word, so it counts as
// a grader only with a grade number beside it — "tag 10", never "Spell Tag",
// "Tag Call" or "Ace Trainer". The same rule as cardmatch's
// GRADERS_AMBIGUOUS; searchaudit.js found the bare forms eating 5 names.
const GRADERS = [
  { id: 'PSA',  patterns: ['psa'] },
  { id: 'BGS',  patterns: ['bgs', 'beckett'] },
  { id: 'CGC',  patterns: ['cgc'] },
  { id: 'SGC',  patterns: ['sgc'] },
  { id: 'TAG',  patterns: ['tag'], needsGrade: true },
  { id: 'ACE',  patterns: ['ace'], needsGrade: true },
  { id: 'AGS',  patterns: ['ags'] },
  { id: 'ARS',  patterns: ['ars'] }
];

// Grade words that imply a numeric grade
const GRADE_LABELS = {
  'gem mint': '10', 'gem-mt': '10', 'gemmint': '10', 'pristine': '10',
  'black label': '10', 'perfect': '10',
  'nm-mt': '8', 'near mint': null, 'nm': null, 'mint': null,
  'lightly played': null, 'lp': null, 'moderately played': null, 'mp': null,
  'heavily played': null, 'hp': null, 'damaged': null, 'dmg': null
};

// Raw condition terms — these mean ungraded, not a grade
// Longest first — "near mint" must win over "mint", or "near" survives
// into the card name.
const RAW_CONDITIONS = [
  ['moderately played', 'Raw MP'], ['lightly played', 'Raw LP'],
  ['heavily played', 'Raw HP'], ['near mint', 'Raw NM'],
  ['ungraded', 'Raw NM'], ['damaged', 'Raw DMG'],
  ['mint', 'Raw NM'], ['raw', 'Raw NM'],
  ['nm', 'Raw NM'], ['lp', 'Raw LP'], ['mp', 'Raw MP'],
  ['hp', 'Raw HP'], ['dmg', 'Raw DMG']
];

// Rarity phrases, longest first so "Rare Secret" wins over "Rare"
const RARITY_TERMS = [
  ['special illustration rare', 'Special Illustration Rare'],
  ['illustration rare',        'Illustration Rare'],
  ['rainbow rare secret',      'Rare Rainbow'],
  ['rainbow rare',             'Rare Rainbow'],
  ['secret rare',              'Rare Secret'],
  ['rare secret',              'Rare Secret'],
  ['hyper rare',               'Hyper Rare'],
  ['ultra rare',               'Rare Ultra'],
  ['double rare',              'Double Rare'],
  ['amazing rare',             'Amazing Rare'],
  ['radiant rare',             'Radiant Rare'],
  ['shiny rare',               'Rare Shiny'],
  ['ace spec rare',            'ACE SPEC Rare'],
  ['trainer gallery',          'Trainer Gallery Rare Holo'],
  ['full art',                 'Rare Ultra'],
  ['alt art',                  'Illustration Rare'],
  ['alternate art',            'Illustration Rare'],
  ['gold card',                'Hyper Rare'],
  ['rare holo',                'Rare Holo'],
  ['holo rare',                'Rare Holo'],
  ['reverse holo',             'Reverse Holo'],
  ['uncommon',                 'Uncommon'],
  ['common',                   'Common']
];

// Words that carry no identifying value once everything else is stripped
const NOISE = new Set([
  'pokemon','pokémon','card','cards','tcg','the','a','an','of','and',
  'english','japanese','jp','eng','en','graded','slab','cert','certified',
  'looking','for','want','wtb','buy','sell','price','value','worth',
  'set','number','no','pack','fresh','psa10','psa9'
]);

function parseCardQuery(input) {
  const original = String(input || '').trim();
  if (!original) return null;

  let text = ' ' + original.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const out = {
    raw: original, grader: null, grade: null, gradeLabel: null,
    certId: null, number: null, numberFrom: null, printedTotal: null, rarity: null, setCode: null,
    setHint: null, name: null, condition: null, language: null
  };

  // ── 1. Certification number — "PSA cert 12345678", "#98765432" ──
  let m = text.match(/\b(?:cert|certification|serial)\s*#?\s*(\d{7,10})\b/);
  if (m) { out.certId = m[1]; text = text.replace(m[0], ' '); }

  // ── 2. Grader + numeric grade ──
  for (const g of GRADERS) {
    for (const p of g.patterns) {
      // "psa 10", "psa10", "bgs 9.5", "cgc 8.5"
      const re = new RegExp('\\b' + p + '\\s*(10|[1-9](?:\\.5)?)\\b');
      const hit = text.match(re);
      if (hit) {
        out.grader = g.id;
        out.grade = hit[1];
        text = text.replace(hit[0], ' ');
        break;
      }
      // Grader named with no number — "psa graded"
      const bare = new RegExp('\\b' + p + '\\b');
      if (!out.grader && !g.needsGrade && bare.test(text)) {
        out.grader = g.id;
        text = text.replace(bare, ' ');
      }
    }
    if (out.grade) break;
  }

  // ── 3. Grade words — "GEM MINT", "PRISTINE", "BLACK LABEL" ──
  // Only when a grading company was named. Otherwise "mint" here eats the
  // word out of "near mint", which is a raw condition, and strands "near"
  // in the card name.
  if (out.grader) for (const [label, implied] of Object.entries(GRADE_LABELS)) {
    if (implied === null) continue;
    const re = new RegExp('\\b' + label.replace(/[-\s]/g, '[-\\s]?') + '\\b');
    if (re.test(text)) {
      out.gradeLabel = label.toUpperCase();
      if (!out.grade) out.grade = implied;
      text = text.replace(re, ' ');
      break;
    }
  }

  // ── 4. Raw condition, only when nothing graded was found ──
  if (!out.grader) {
    // "raw" and "ungraded" only say it is not slabbed — remove them first so
    // the phrase match below still sees "near mint" rather than just "mint".
    if (/\b(raw|ungraded)\b/.test(text)) {
      out.condition = 'Raw NM';
      text = text.replace(/\b(raw|ungraded)\b/g, ' ');
    }
    for (const [term, cond] of RAW_CONDITIONS) {
      const re = new RegExp('\\b' + term.replace(/\s/g, '\\s+') + '\\b');
      if (re.test(text)) { out.condition = cond; text = text.replace(re, ' '); break; }
      
    }
  }

  // ── 5. Collector number — "074/073", "199/165", "#294", "TG12/TG30" ──
  // [a-z]? after the digits: a letter-suffixed collector number — "103a/147"
  // (Aquapolis Porygon 103a and 103b are two cards), "28a/83", "105a/124".
  m = text.match(/\b([a-z]{0,4}\d{1,4}[a-z]?)\s*\/\s*([a-z]{0,4}\d{1,4})\b/i);
  // `numberFrom` says how sure that is. Only "N/T" is certain. "#2" and a
  // bare trailing number are guesses — "Blaine's Quiz #2", "Alakazam 4",
  // "Metal Cube 01" carry the number in the NAME — so resolveCard accepts
  // a card whose name holds it, not only one whose collector number is it.
  if (m) {
    out.number = m[1].toUpperCase();
    out.printedTotal = m[2].toUpperCase();
    out.numberFrom = 'slash';
    text = text.replace(m[0], ' ');
  } else {
    m = text.match(/#\s*([a-z]{0,4}\d{1,4}[ab]?)\b/i);
    if (m) { out.number = m[1].toUpperCase(); out.numberFrom = 'hash'; text = text.replace(m[0], ' '); }
    else {
      // A bare trailing number is almost always the collector number:
      // "Pikachu ex 276", "Mega Charizard Y ex 294 Ascended Heroes".
      // Skip it when it is part of the card's own name — Pokegear 3.0,
      // Rotom V, Team Rocket's Meowth.
      // An a/b suffix only ("Porygon 103b"): every suffixed card we hold is
      // a or b, and a wider letter would read "4x" and the like.
      const trailing = text.match(/\s(\d{1,4}[ab]?)(?=\s)/gi);
      if (trailing && trailing.length) {
        const last = trailing[trailing.length - 1].trim();
        const n = parseInt(last);
        if (n >= 1 && n <= 999 && !/\d\.\d/.test(text)) {
          out.number = last.toUpperCase();
          out.numberFrom = 'bare';
          const idx = text.lastIndexOf(' ' + last + ' ');
          text = text.slice(0, idx) + ' ' + text.slice(idx + last.length + 2);
        }
      }
    }
  }

  // ── 6. Rarity ──
  for (const [term, canon] of RARITY_TERMS) {
    const re = new RegExp('\\b' + term.replace(/\s/g, '\\s+') + '\\b');
    if (re.test(text)) { out.rarity = canon; text = text.replace(re, ' '); break; }
  }

  // ── 7. Language ──
  if (/\b(japanese|japan|jpn|jp)\b/.test(text)) { out.language = 'ja'; text = text.replace(/\b(japanese|japan|jpn|jp)\b/g, ' '); }
  else if (/\b(chinese|zh|traditional chinese)\b/.test(text)) { out.language = 'zh-tw'; }
  if (/[\u3040-\u30ff]/.test(original)) out.language = 'ja';   // kana present

  // ── 8. What survives is the card name, plus possibly a set hint ──
  // Keep CJK ranges — \w excludes kana and kanji, which erased
  // "リザードンex" down to "ex".
  // δ ◇ ☆ ♀ ♂ are card identity (see normName), not punctuation.
  const KEEP = /[^\w'’&é.\-δ◇☆♀♂\u3040-\u30ff\u4e00-\u9faf\uff66-\uff9f]/g;
  const words = text.split(/\s+/).map(w => w.replace(new RegExp('^' + KEEP.source + '+|' + KEEP.source + '+$', 'g'), ''))
                    .filter(w => w && !NOISE.has(w));

  // A possessive or "path/journey/evolutions" style word suggests a set name
  // Words that begin a set name. Anything from here on is the set.
  const SET_MARKERS = /^(path|journey|evolutions|evolving|origins|destinies|destined|voltage|styles|reign|astral|brilliant|lost|silver|crown|zenith|fates|heroes|flames|rising|order|blaze|force|masquerade|twilight|surging|sparks|prismatic|rivals|together|expedition|aquapolis|skyridge|legends|guardians|celestial|cosmic|eclipse|unified|unbroken|bonds|detective|hidden|dragon|majesty|forbidden|prism|burning|shadows|crimson|invasion|shining|base|jungle|fossil|skies|ascended|phantasmal|chaos|perfect|pitch|temporal|paradox|paldean|obsidian|scarlet|violet|sword|shield|champion|champion's|151)$/;
  let setWords = [], nameWords = [];
  let seenSetMarker = false;
  for (const w of words) {
    if (SET_MARKERS.test(w)) seenSetMarker = true;
    (seenSetMarker ? setWords : nameWords).push(w);
  }
  // A trailing possessive like "champion's" belongs with the set
  if (setWords.length && nameWords.length) {
    const last = nameWords[nameWords.length - 1];
    if (/'s$/.test(last)) setWords.unshift(nameWords.pop());
  }

  // A bare set code — s12a, sv03.5, swsh7, me02.5 — is a set id, not a name
  const SET_CODE = /^(sv|swsh|sm|xy|bw|me|s|m|cp|pcg|pmcg|neo|base|ex|hgss|dp|pl|col|g|dc|det|cel|smp|svp)\d{0,2}(\.\d)?[a-z]?$/i;
  const codes = [];
  for (let i = nameWords.length - 1; i >= 0; i--) {
    if (SET_CODE.test(nameWords[i]) && /\d/.test(nameWords[i])) {
      codes.unshift(nameWords.splice(i, 1)[0]);
    }
  }
  if (codes.length) out.setCode = codes[0].toLowerCase();

  out.name = nameWords.join(' ').trim() || null;
  out.setHint = (setWords.join(' ').trim() || (codes.length ? codes[0] : null)) || null;
  // Words split off by SET_MARKERS may be the card's own name — "Paldean
  // Clodsire ex", "Shining Lugia", "Lost City", "Iron Crown ex". The parser
  // cannot know; resolveCard asks the database, so it needs the source.
  out.setHintFrom = setWords.length ? 'words' : (codes.length ? 'code' : null);

  // Normalise the grade into the app's canonical form
  if (out.grader && out.grade) out.gradeString = out.grader + ' ' + out.grade;
  else if (out.condition) out.gradeString = out.condition;
  else out.gradeString = 'Raw NM';

  return out;
}

// ── One normaliser for both sides of a name comparison ────────
// Measured 2026-09-28 (searchaudit.js): the name reached SQL as one
// substring, LIKE '%pikachu zekrom gx%', against "Pikachu & Zekrom GX" —
// so any difference in punctuation between what was typed and what is
// stored meant NO candidates at all, not a worse rank. Both sides now go
// through the same folding and are compared word by word:
//   é -> e (the only accent in our English names), apostrophes and periods
//   DELETED ("Farfetch'd" -> farfetchd, "Mr. Mime" -> mr mime — people type
//   it without, and spacing it gives "farfetch d"), everything else that is
//   not a letter, digit, CJK or an identity symbol becomes a space.
// δ ◇ ☆ ♀ ♂ are KEPT: Delta Species, Prism Star, Gold Star, Nidoran's sex.
// They are card identity, not decoration.
//
// The SQL side does only the FOLD — lower case, accents, apostrophes and
// periods deleted — in one TRANSLATE (a from-string longer than its
// to-string deletes the extras). It does not split on punctuation, and does
// not need to: a query word never contains a space or punctuation, so it is
// a substring of the fully normalised name exactly when it is a substring
// of the folded one. The first cut ran the whole normaliser as two
// REGEXP_REPLACEs over all 46k rows, per word and per column: 3.5s of a
// 3.6s query (EXPLAIN ANALYZE, 2026-09-28).
//
// foldSql must fold exactly as fold() does — cardparse.test.js --db asserts
// the two agree on real names. No backslashes in either, deliberately (see
// the '\D' and 0x08 lessons in CLAUDE.md).
const ACCENTS_FROM = 'éèêëáàâäíìîïóòôöúùûüñç';
const ACCENTS_TO   = 'eeeeaaaaiiiioooouuuunc';
const DELETED      = "'’.";
const KEEP_CLASS   = 'a-z0-9δ◇☆♀♂぀-ヿ一-龯ｦ-ﾟ';
function fold(s) {
  let o = '';
  for (const ch of String(s || '').toLowerCase()) {
    if (DELETED.includes(ch)) continue;
    const k = ACCENTS_FROM.indexOf(ch);
    o += k >= 0 ? ACCENTS_TO[k] : ch;
  }
  return o;
}
function normName(s) {
  return fold(s).replace(new RegExp('[^' + KEEP_CLASS + ']+', 'g'), ' ').trim();
}
function foldSql(col) {
  return `TRANSLATE(LOWER(COALESCE(${col},'')), '${ACCENTS_FROM}${DELETED.replace(/'/g, "''")}', '${ACCENTS_TO}')`;
}
// Words that decide identity. NOISE comes out of BOTH sides, so "Urn of
// Vitality" and "urn vitality" compare equal, and "Pikachu and Zekrom GX"
// meets "Pikachu & Zekrom GX". An identity symbol is its own word, so
// "Shaymin◇" and "Shaymin ◇" agree.
function nameTokens(s) {
  return normName(s).replace(/([δ◇☆♀♂])/g, ' $1 ')
    .split(' ').filter(w => w && !NOISE.has(w));
}

// ── Resolve a parse against the database ──────────────────────
// Returns candidates ranked by how much of the parse they satisfy.
//
// The parser GUESSES in two places, and a guess must never be a filter:
//   · words after a SET_MARKERS word become a set hint — but "Paldean",
//     "Shining", "Lost", "Crown", "Fossil" begin 99 card names;
//   · a bare or "#" number becomes the collector number — but it is part of
//     35 names ("Alakazam 4", "Metal Cube 01", "Blaine's Quiz #2").
// So each card is scored under every reading of those words and keeps its
// best, and the SQL admits a card under any of them. 209 of 4,512 English
// names were altered by the parser before this; all were unreachable
// by their own name.
async function resolveCard(db, parsed, opts) {
  opts = opts || {};
  if (!db || !parsed) return [];
  const limit = opts.limit || 10;

  const qName = nameTokens(parsed.name);
  const qSet  = parsed.setHintFrom === 'words' ? nameTokens(parsed.setHint) : [];
  const softNum = parsed.number && parsed.numberFrom !== 'slash'
    ? String(parsed.number).toLowerCase() : null;

  // With no name words left, the "set" words WERE the name ("Shining Lugia").
  const filterTokens = qName.length ? qName : qSet;

  const conds = [], params = [];
  let i = 1;
  const nm = foldSql('c.name'), nmEn = foldSql('c.name_en');

  for (const t of filterTokens) {
    conds.push(`(${nm} LIKE $${i} OR ${nmEn} LIKE $${i})`);
    params.push('%' + t + '%'); i++;
  }
  if (parsed.number) {
    // UPPER: the parser upper-cases ("103A", "TG12") and 32 English cards
    // store a lower-case suffix ("103a" / "103b" — Aquapolis Porygon, 2026-09-29).
    // GREATEST: Postgres LPAD TRUNCATES — LPAD('103A', 3) is '103', which
    // matched plain #103, and LPAD('TG12', 3) is 'TG1'. Pad, never cut.
    const numMatch = `(UPPER(c.number) = $${i} OR UPPER(c.number) = LPAD($${i}, GREATEST(3, LENGTH($${i})), '0')
                 OR REGEXP_REPLACE(UPPER(c.number), '^0+', '') = REGEXP_REPLACE($${i}, '^0+', ''))`;
    params.push(parsed.number); i++;
    if (softNum) {
      // The number as a whole word of the name: "#2" and "4" count, "42" and
      // "v4" do not. softNum is [a-z0-9] only (the parser's own pattern), so
      // it is safe inside a regex and needs no escaping.
      conds.push(`(${numMatch} OR ${nm} ~ $${i} OR ${nmEn} ~ $${i})`);
      params.push('(^|[^a-z0-9])' + softNum + '([^a-z0-9]|$)'); i++;
    } else conds.push(numMatch);
  }
  if (parsed.language) {
    conds.push(`c.api_card_id LIKE $${i}`);
    params.push(parsed.language + '-%'); i++;
  }
  if (!conds.length) return [];

  // The cap applies AFTER a rough rank, never before. "Pikachu" alone
  // matches 304 rows; an unordered LIMIT 200 dropped an arbitrary hundred,
  // so whether the plain Pikachu you meant was a candidate was chance.
  // Rank: most of the typed words present in the name, then the shortest
  // name (the closest to exactly what was typed).
  const allTokens = [...new Set(qName.concat(qSet, softNum ? [softNum] : []))];
  const rankParts = allTokens.map(t => {
    params.push('%' + t + '%');
    const p = `$${i++}`;
    return `(CASE WHEN ${nm} LIKE ${p} OR ${nmEn} LIKE ${p} THEN 1 ELSE 0 END)`;
  });
  const rankSql = rankParts.length ? rankParts.join(' + ') : '0';

  const rows = await db.query(`
    SELECT c.api_card_id, c.name, c.name_en, c.number, c.rarity,
           c.set_api_id, c.set_name, c.set_name_en, c.set_total, c.image_small,
           (SELECT price_usd FROM price_history p
            WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
            ORDER BY recorded_at DESC LIMIT 1) AS price
    FROM (SELECT c.* FROM cards c
          WHERE ${conds.join(' AND ')}
            AND ${digital.visibleSql('c')}
            AND ${cardid.ourIdSql('c')}   -- a stray foreign-id row once won this search: me55c-33
          ORDER BY ${rankSql} DESC, LENGTH(c.name) ASC, c.api_card_id
          LIMIT 200) c`, params);

  const queryHasCJK = /[぀-ヿ一-龯]/.test(parsed.raw || '');
  const same = (a, b) => a.length === b.length && a.every((w, k) => w === b[k]);

  // How well a set of wanted words names this card. A card's OWN name is
  // stronger evidence than a translation of it. name_en is a backfilled
  // convenience field and it has been wrong: ja-SV2a-199 マサキの転送
  // (Bill's Transfer) carried name_en "Charizard ex", which tied it 172-172
  // with the real Charizard ex for the query "Charizard ex 199/165 151".
  // Scoring the two identically means a translation error becomes a
  // resolution error.
  function nameScore(want, own, en) {
    if (!want.length) return 0;
    if (same(own, want)) return 50;
    if (en.length && same(en, want)) return 42;
    const starts = (have) => want.every((w, k) => have[k] === w);
    if (starts(own)) return 30;
    if (en.length && starts(en)) return 25;
    const has = (have) => want.every(w => have.some(h => h.includes(w)));
    if (has(own)) return 20;
    if (en.length && has(en)) return 16;
    return 10;                      // admitted by SQL on a looser reading
  }
  const numEq = (r) => parsed.number &&
    String(r.number).replace(/^0+/, '').toLowerCase() === String(parsed.number).replace(/^0+/, '').toLowerCase();

  // Every reading of the guessed words: [name words, set words, number counts?]
  const readings = [];
  const pushReading = (n, s, useNum) => { if (n.length || (useNum && parsed.number)) readings.push([n, s, useNum]); };
  pushReading(qName, qSet, true);
  if (qSet.length) pushReading(qName.concat(qSet), [], true);
  if (softNum) {
    pushReading(qName.concat([softNum]), qSet, false);
    if (qSet.length) pushReading(qName.concat(qSet, [softNum]), [], false);
  }

  const scored = rows.rows.map(r => {
    const own = nameTokens(r.name), en = nameTokens(r.name_en);
    const sn = normName(r.set_name), sne = normName(r.set_name_en);
    let best = -1;
    for (const [n, s, useNum] of readings) {
      let score = nameScore(n, own, en);
      if (useNum && numEq(r)) score += 40;
      if (s.length) {
        const hint = s.join(' ');
        if (sn.includes(hint) || sne.includes(hint)) score += 35;
        else if (s.some(w => w.length > 3 && (sn.includes(w) || sne.includes(w)))) score += 15;
      } else if (parsed.setHintFrom === 'code' && parsed.setHint) {
        const hint = normName(parsed.setHint);
        if (sn.includes(hint) || sne.includes(hint)) score += 35;
      }
      if (score > best) best = score;
    }
    let score = best;
    // Script affinity: a query typed in Latin script with no explicit
    // language is far more likely to mean the English printing, and vice
    // versa. Deliberately small — it breaks ties, it never outranks the
    // printed total.
    if (!parsed.language) {
      const isJaCard = String(r.api_card_id).startsWith('ja-');
      if (queryHasCJK === isJaCard) score += 8;
    }
    // Printed total is the strongest disambiguator across sets sharing a number
    if (parsed.printedTotal && r.set_total &&
        String(r.set_total).replace(/^0+/, '') === String(parsed.printedTotal).replace(/^0+/, '')) score += 45;
    if (parsed.rarity && r.rarity === parsed.rarity) score += 25;
    if (r.price) score += 2;   // a card with market data is the likelier intent
    return Object.assign({}, r, { score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { parseCardQuery, resolveCard, fold, normName, nameTokens, foldSql, GRADERS, RARITY_TERMS };
