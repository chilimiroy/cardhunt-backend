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
const GRADERS = [
  { id: 'PSA',  patterns: ['psa'] },
  { id: 'BGS',  patterns: ['bgs', 'beckett'] },
  { id: 'CGC',  patterns: ['cgc'] },
  { id: 'SGC',  patterns: ['sgc'] },
  { id: 'TAG',  patterns: ['tag'] },
  { id: 'ACE',  patterns: ['ace'] },
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
    certId: null, number: null, printedTotal: null, rarity: null, setCode: null,
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
      if (!out.grader && bare.test(text)) {
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
  m = text.match(/\b([a-z]{0,4}\d{1,4})\s*\/\s*([a-z]{0,4}\d{1,4})\b/i);
  if (m) {
    out.number = m[1].toUpperCase();
    out.printedTotal = m[2].toUpperCase();
    text = text.replace(m[0], ' ');
  } else {
    m = text.match(/#\s*([a-z]{0,4}\d{1,4})\b/i);
    if (m) { out.number = m[1].toUpperCase(); text = text.replace(m[0], ' '); }
    else {
      // A bare trailing number is almost always the collector number:
      // "Pikachu ex 276", "Mega Charizard Y ex 294 Ascended Heroes".
      // Skip it when it is part of the card's own name — Pokegear 3.0,
      // Rotom V, Team Rocket's Meowth.
      const trailing = text.match(/\s(\d{1,4})(?=\s)/g);
      if (trailing && trailing.length) {
        const last = trailing[trailing.length - 1].trim();
        const n = parseInt(last);
        if (n >= 1 && n <= 999 && !/\d\.\d/.test(text)) {
          out.number = last;
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
  const KEEP = /[^\w'&é.\-\u3040-\u30ff\u4e00-\u9faf\uff66-\uff9f]/g;
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

  // Normalise the grade into the app's canonical form
  if (out.grader && out.grade) out.gradeString = out.grader + ' ' + out.grade;
  else if (out.condition) out.gradeString = out.condition;
  else out.gradeString = 'Raw NM';

  return out;
}

// ── Resolve a parse against the database ──────────────────────
// Returns candidates ranked by how much of the parse they satisfy.
async function resolveCard(db, parsed, opts) {
  opts = opts || {};
  if (!db || !parsed) return [];
  const limit = opts.limit || 10;

  const conds = [], params = [];
  let i = 1;

  if (parsed.name) {
    conds.push(`(LOWER(c.name) LIKE $${i} OR LOWER(COALESCE(c.name_en,'')) LIKE $${i})`);
    params.push('%' + parsed.name.toLowerCase() + '%'); i++;
  }
  if (parsed.number) {
    conds.push(`(c.number = $${i} OR c.number = LPAD($${i}, 3, '0')
                 OR REGEXP_REPLACE(c.number, '^0+', '') = REGEXP_REPLACE($${i}, '^0+', ''))`);
    params.push(parsed.number); i++;
  }
  if (parsed.language) {
    conds.push(`c.api_card_id LIKE $${i}`);
    params.push(parsed.language + '-%'); i++;
  }
  if (!conds.length) return [];

  const rows = await db.query(`
    SELECT c.api_card_id, c.name, c.name_en, c.number, c.rarity,
           c.set_api_id, c.set_name, c.set_name_en, c.set_total, c.image_small,
           (SELECT price_usd FROM price_history p
            WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
            ORDER BY recorded_at DESC LIMIT 1) AS price
    FROM cards c
    WHERE ${conds.join(' AND ')}
    LIMIT 200`, params);

  // Score each candidate against everything the parse told us
  const scored = rows.rows.map(r => {
    let score = 0;
    const nm = String(r.name || '').toLowerCase();
    const nmEn = String(r.name_en || '').toLowerCase();

    // A card's OWN name is stronger evidence than a translation of it.
    // name_en is a backfilled convenience field and it has been wrong:
    // ja-SV2a-199 マサキの転送 (Bill's Transfer) carried name_en
    // "Charizard ex", which tied it 172-172 with the real Charizard ex for
    // the query "Charizard ex 199/165 151". Scoring the two identically
    // means a translation error becomes a resolution error.
    if (parsed.name) {
      const want = parsed.name.toLowerCase();
      if (nm === want) score += 50;
      else if (nmEn === want) score += 42;
      else if (nm.startsWith(want)) score += 30;
      else if (nmEn.startsWith(want)) score += 25;
      else score += 10;
    }
    // Script affinity: a query typed in Latin script with no explicit
    // language is far more likely to mean the English printing, and vice
    // versa. Deliberately small — it breaks ties, it never outranks the
    // printed total.
    if (!parsed.language) {
      const isJaCard = String(r.api_card_id).startsWith('ja-');
      const queryHasCJK = /[぀-ヿ一-龯]/.test(parsed.raw || '');
      if (queryHasCJK === isJaCard) score += 8;
    }
    if (parsed.number && String(r.number).replace(/^0+/, '') === String(parsed.number).replace(/^0+/, '')) score += 40;
    // Printed total is the strongest disambiguator across sets sharing a number
    if (parsed.printedTotal && r.set_total &&
        String(r.set_total).replace(/^0+/, '') === String(parsed.printedTotal).replace(/^0+/, '')) score += 45;
    if (parsed.rarity && r.rarity === parsed.rarity) score += 25;
    if (parsed.setHint) {
      const hint = parsed.setHint.toLowerCase();
      const sn = String(r.set_name || '').toLowerCase();
      const sne = String(r.set_name_en || '').toLowerCase();
      if (sn.includes(hint) || sne.includes(hint)) score += 35;
      else if (hint.split(' ').some(w => w.length > 3 && (sn.includes(w) || sne.includes(w)))) score += 15;
    }
    if (r.price) score += 2;   // a card with market data is the likelier intent
    return Object.assign({}, r, { score });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { parseCardQuery, resolveCard, GRADERS, RARITY_TERMS };
