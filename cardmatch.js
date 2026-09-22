// ══════════════════════════════════════════════════════════════
// cardmatch.js — does this listing show EXACTLY the card asked for?
//
// The product's promise is a link to one specific card in one specific
// grade. A Charizard 004/102 PSA 10 search must not return a different
// Charizard, the same card in PSA 9, or a CGC 10.
//
// Two jobs, and the second is the one that guarantees correctness:
//
//   buildQuery(card, grade)          — ask eBay a well-formed question
//   verify(title, card, grade)       — prove the answer is the right card
//
// A broad query with a strict gate beats a narrow query with a loose one:
// sellers write titles inconsistently, so over-constraining the search
// returns nothing, while a strict gate can always reject.
//
// Every rejection carries a reason. "No listings" and "everything was
// filtered out" must never look the same.
// ══════════════════════════════════════════════════════════════

// ── Scope ─────────────────────────────────────────────────────
// Everything below is inside this function on purpose. A <script src> does
// NOT get a scope of its own: it shares the page's, so a top-level `const`
// here collides with the page's own. `const API` did exactly that, in all
// three served modules at once, and a collision throws before the first
// statement runs — the module 200s, defines nothing, and every
// `window.X && ...` guard quietly uses the old inline code instead.
//
// Nothing is re-indented: the wrapper is the change, and a reindented body
// would hide it in the diff. Add nothing outside these parentheses.
(function (root) {

// ── Collector numbers ─────────────────────────────────────────
// "004" and "4" are the same card. "TG12" and "12" are not.
function normNum(n) {
  if (n === null || n === undefined) return null;
  const s = String(n).trim().split(/[\/／]/)[0].trim();
  const pre = s.match(/^([A-Za-z]{1,4})0*(\d{1,4})$/);
  if (pre) return pre[1].toUpperCase() + String(parseInt(pre[2], 10));
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return s.toUpperCase() || null;
  return String(parseInt(digits, 10));
}

// Every N/M pair in a title: "074/073", "4/102", "TG12/TG30"
function numberPairsIn(title) {
  const out = [];
  const re = /\b([A-Za-z]{0,4}\d{1,4})\s*\/\s*([A-Za-z]{0,4}\d{1,4})\b/g;
  let m;
  while ((m = re.exec(title))) {
    out.push({ num: normNum(m[1]), total: normNum(m[2]), raw: m[0] });
  }
  return out;
}

// ── A term, with boundaries, applied in ONE place ─────────────
// Used by the grader list below AND by NOT_A_SINGLE_CARD further down.
// It lives up here rather than beside the junk terms because both lists
// need it, and because the one thing this file has proved twice is that a
// boundary written by hand at each site is a boundary that goes missing.
//
// \b is applied only where the adjacent character is actually a word
// character. Every term today qualifies on both sides, but a future term
// like "+1" would make a leading \b mean the opposite of what was
// intended, and that is precisely the class of silent breakage the long
// comment above NOT_A_SINGLE_CARD_TERMS is about.
function boundedTerm(term) {
  const esc = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          .replace(/\s+/g, '\\s+');
  return (/^[A-Za-z0-9]/.test(term) ? '\\b' : '')
       + '(?:' + esc + ')'
       + (/[A-Za-z0-9]$/.test(term) ? '\\b' : '');
}

// ── Grades ────────────────────────────────────────────────────
// Real grading companies, each one checked to exist before it was added.
// A token here that is not a company turns every title containing it into
// a "slab" and hides the card from every raw search — so this list is
// additive only on evidence, never on a guess.
//
// AiGrade was missing, and "Giratina V 186/196 Lost Origin AiGrade 9.5" —
// a $987 slab — therefore passed a RAW NM search. The slab word list below
// is now DERIVED from these arrays rather than typed out a second time, so
// a company can no longer be half-installed: added to one list, absent
// from the other, with nothing reporting the difference.
//
// Deliberately NOT here: GEM (it is in every "Gem Mint" title), RARE (a
// rarity), MINT, TCG. None is a grading company and each would eat
// ordinary card vocabulary.
const GRADERS_UNAMBIGUOUS = [
  'PSA',        // Professional Sports Authenticator
  'BGS',        // Beckett Grading Services
  'BVG',        // Beckett Vintage Grading
  'BCCG',       // Beckett Collectors Club Grading
  'CGC',        // Certified Guaranty Company
  'CSG',        // Certified Sports Guaranty — closed 2023, its slabs still trade
  'SGC',        // Sportscard Guaranty Corporation
  'AGS',        // Automated Grading Systems
  'ARS',        // ARS Grading
  'GMA',        // Gem Mint Authentication
  'HGA',        // Hybrid Grading Approach
  'ISA',        // International Sports Authentication
  'KSA',        // KSA Certification
  'PCA',        // PCA Grading
  'AIGRADE',    // AiGrade — the one this list was missing
  'AI GRADE'    // the same company, spaced. \s+ via boundedTerm
];

// Companies whose name is ALSO ordinary card vocabulary. They grade, so
// "TAG 10" is a slab and must be read as one — but the bare token is not
// evidence of anything:
//
//   TAG TEAM   a card mechanic (Pikachu & Zekrom GX TAG TEAM)
//   ACE SPEC   a card mechanic, and a rarity
//   MNT        sellers' shorthand for Mint, written on RAW cards ("NM-MNT")
//
// Bare `tag` and `ace` were in the slab word list, which meant every TAG
// TEAM and every ACE SPEC card was rejected from every raw search.
// Measured before this fix: "Pokemon Pikachu & Zekrom GX TAG TEAM 33/181
// Team Up Ultra Rare NM" -> "wants raw, title indicates a graded slab:
// TAG". `looksLikeJunk` again — a guard written against bad data eating
// good data, with no symptom but a short list.
//
// These count as slab evidence only WITH a grade number beside them.
const GRADERS_AMBIGUOUS = ['TAG', 'ACE', 'MNT'];

const GRADERS = GRADERS_UNAMBIGUOUS.concat(GRADERS_AMBIGUOUS);

// A grade number as sellers write it: 10, 9, 9.5 — and not the 9 inside
// "9.5", which sells well above a whole grade.
const GRADE_NUM = '\\s*[-:]?\\s*(?:10|[1-9](?:\\.5)?)(?![\\d.])';

function parseGrade(g) {
  if (!g) return { kind: 'raw', condition: null };
  const s = String(g).trim();
  if (/^raw/i.test(s) || /^ungraded/i.test(s)) {
    return { kind: 'raw', condition: s.replace(/^raw\s*/i, '').toUpperCase() || 'NM' };
  }
  const m = s.match(/^([A-Za-z]+)\s*([\d.]+)$/);
  if (!m) return { kind: 'raw', condition: null };
  return { kind: 'graded', grader: m[1].toUpperCase(), grade: m[2] };
}

// ── Speculative grades ────────────────────────────────────────
// Sellers advertise RAW cards by the grade they hope one would earn:
//   "1999 Base Set Charizard 4/102 (PSA 10 Contender)"   — $8,000, ungraded
//   "BGS 9.5 ... QUAD TRUE GEM MINT (PSA 10 Pot?)"       — a BGS 9.5
// Both were found in live searches. Reading "PSA 10" out of those and
// showing an ungraded card in a PSA 10 list is a wrong answer of exactly
// the kind this module exists to prevent — a genuine PSA 10 Base Set
// Charizard runs $250,000 against $8,000 for a raw one.
//
// The phrase is removed BEFORE grades are read, so the speculation is not
// mistaken for the grade. A real "PSA 10 GEM MINT" is untouched.
const SPECULATIVE_GRADE =
  /\b(?:contender|candidate|potential|pot\.?\??|worthy|quality|ready|hopeful|gradeable|gradable|would\s+grade|could\s+grade|looks?\s+(?:like\s+)?a?)\b/gi;

function stripSpeculative(title) {
  // Only inside a bracketed aside or immediately after a grade token, which
  // is how sellers write it. Stripping the words everywhere would eat
  // "Gem Mint Quality" style phrasing on genuine slabs.
  return String(title)
    .replace(/\(([^)]*)\)/g, (whole, inner) =>
      SPECULATIVE_GRADE.test(inner) ? ' ' : whole)
    .replace(new RegExp('(?:' + GRADERS.map(boundedTerm).join('|') + ')' +
      '\\s*[-:]?\\s*(?:10|[1-9](?:\\.5)?)\\s*(?:' +
      'contender|candidate|potential|pot\\.?\\??|worthy|ready|hopeful)\\b', 'gi'), ' ');
}

// Find every grader+number in a title. Boundary-checked, so BGS 9 does
// not match "BGS 9.5" — a half grade sells well above a whole one.
function gradesIn(title) {
  const out = [];
  const t = stripSpeculative(title);
  for (const co of GRADERS) {
    const re = new RegExp(boundedTerm(co) + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.])', 'gi');
    let m;
    while ((m = re.exec(t))) out.push({ grader: co, grade: m[1] });
  }
  return out;
}

// ── "This card is in a slab" ──────────────────────────────────
// Used to reject slabs from a RAW search. DERIVED from the grader lists
// above: it used to be a hand-typed second copy of them, and AiGrade was
// in neither while ARS and HGA were in only one. Two lists of the same
// thing, and the drift is invisible until a $987 slab turns up in a raw
// search.
//
// Generic slab vocabulary, kept as plain words for the same reason the
// junk terms are: the boundaries are applied by boundedTerm, once.
// "gemmint" and "gemmt" are listed separately because the old pattern
// spelled them `gem\s*mint` — optional space — and dropping that would
// have quietly narrowed the filter.
const SLAB_GENERIC = ['graded', 'slab', 'slabbed', 'gem mint', 'gemmint',
                      'gem mt', 'gemmt', 'pristine', 'black label'];

const SLAB_WORDS = new RegExp('(?:' + [].concat(
  // An unambiguous company name is slab evidence on its own.
  GRADERS_UNAMBIGUOUS.map(boundedTerm),
  // An ambiguous one only with a grade beside it — see GRADERS_AMBIGUOUS.
  GRADERS_AMBIGUOUS.map(co => boundedTerm(co) + GRADE_NUM),
  SLAB_GENERIC.map(boundedTerm)
).join('|') + ')', 'i');

// Multi-card listings, sealed product, and anything that is not one card.
// Sellers list merchandise under card searches because that is where the
// buyers are: a "Charizard Keychain" answers a Charizard search and is not
// a card at all. Grouped by what the thing is, so a new case has one place
// to go.
//
// Bare `collection` is deliberately NOT here — it is half the set names in
// the game (see SET_NAME_PHRASES below, which exists because it was). Only
// the phrasings that actually mean a bundle: "collection of", "collection
// box", "premium collection".
// ── The terms. PLAIN WORDS ONLY — no regex, no boundaries ─────
//
// This list was once a single /\b(lot|box|tin|...)\b/i. Someone split it
// into an array of alternations joined with '|' for readability, and the
// two \b at the ends of the old pattern went with it: only four terms that
// happened to carry an inline \b survived.
//
// So `tin` matched inside Gira*tin*a and Des*tin*ed Rivals, `lot` inside
// Lotad, `case` inside Casey, `box` inside Boxer. Eight of twenty-five real
// card names were rejected, and Lost Origin's Giratinas and the whole of
// Destined Rivals returned "all 75 scanned were rejected — not a single
// card: tin". Every suite passed throughout, because not one of them tested
// a card name containing a junk word as a substring.
//
// The boundaries are now applied in code, below, once, to every term. Add
// plain words here; they cannot lose their boundaries because they never
// carry them.
const NOT_A_SINGLE_CARD_TERMS = [
  // multiples
  'lot', 'lots', 'bundle', 'set of', 'collection of', 'joblot', 'job lot', 'mystery',
  // sealed product
  'booster', 'box', 'boxes', 'pack', 'packs', 'tin', 'tins', 'etb', 'elite trainer',
  'sealed', 'case', 'cases', 'blister',
  'display', 'carton', 'crate', 'collection box', 'premium collection', 'build & battle',
  // merchandise, not cards
  'key chain', 'keychain', 'keyring', 'key ring', 'coin', 'coins', 'pin', 'pins',
  'badge', 'plush', 'figure', 'figurine',
  'statue', 'mug', 'shirt', 't-shirt', 'hoodie', 'poster', 'banner', 'flag', 'towel',
  'bag', 'wallet', 'phone case',
  'lamp', 'light', 'clock', 'puzzle', 'lego', 'funko', 'nanoblock', 'model kit',
  'stand', 'display case',
  // accessories
  'sleeve', 'sleeves', 'playmat', 'play mat', 'deck box', 'binder', 'binders',
  'album', 'portfolio', 'toploader', 'toploaders',
  'top loader', 'penny sleeve', 'card saver', 'magnetic', 'screwdown', 'storage',
  'organizer',
  // not genuine cards
  'proxy', 'proxies', 'orica', 'custom', 'fake', 'replica', 'repro', 'reprint card',
  'metal card', 'gold plated',
  // fan-made. "Giratina V 186/196 Shiny Holo Lost Origin *Fan Art*" was kept
  // at $8.50 against a card worth $800-1000.
  //
  // `art` alone must NEVER be a term — Alt Art, Full Art and Illustration
  // Rare are the genuine chase cards, and this card is one of them. Even
  // 'art card' is a hazard, because sellers write "Alt Art Card": the
  // genuine phrasings are removed by GENUINE_ART_PHRASES below BEFORE this
  // list is applied, exactly as SET_NAME_PHRASES protects "Classic
  // Collection" from `collection`.
  'fan art', 'fanart', 'fan made', 'fanmade', 'art card',
  'unofficial', 'not official', 'handmade', 'homemade', 'inspired by',
  'gold card', 'jumbo', 'oversized', 'oversize', 'sticker', 'stickers', 'tattoo',
  'stamp', 'cardboard cutout'
];

// The one entry that is genuinely a pattern rather than a word: "50 cards",
// "50cards". It carries its own boundaries deliberately and is kept apart
// from the word list so the word list stays free of regex.
const NOT_A_SINGLE_CARD_PATTERNS = ['\\d+\\s*cards?\\b'];

// The boundaries are applied by boundedTerm, defined once near the top of
// this file because the grader list needs it too.

const NOT_A_SINGLE_CARD = new RegExp(
  NOT_A_SINGLE_CARD_TERMS.map(boundedTerm).concat(NOT_A_SINGLE_CARD_PATTERNS).join('|'),
  'i');

// ── Set names that contain lot vocabulary ─────────────────────
// "Classic Collection" is a SET, not a bundle, and `collection` above
// rejected every one of them. Measured on a live search for Base Set
// Charizard: "2021 Pokemon Celebrations Base Set Classic Collection
// Charizard 4/102 PSA 10" was dropped as "not a single card".
//
// This is the `looksLikeJunk` failure again — a guard written against bad
// data eating good data, silently, with the count buried. So these phrases
// are removed from the title BEFORE the lot test rather than the test
// being weakened for everyone.
const SET_NAME_PHRASES = /\b(classic collection|trainer gallery|galarian gallery|shiny vault|hidden fates|celebrations|legendary collection|champions? path)\b/gi;

// ── Genuine art phrasing, protected the same way ──────────────
// 'art card' is on the junk list because a fan-made "Art Card" is not a
// Pokémon card. But "Alt Art Card" and "Alternate Art Card" are how
// sellers write the most valuable cards in the modern game, and
// `\bart card\b` matches inside both — which would have rejected the very
// Giratina this pass exists to price.
//
// So the genuine phrasings are removed from the title BEFORE the junk
// test, exactly as SET_NAME_PHRASES is. Removing the phrase is safer than
// weakening the term: "Fan Art Card" still carries a bare "art card"
// afterwards and is still refused.
//
// This is used ONLY for the lot/junk test. Nothing else sees the stripped
// title — the number, grade and set checks all read the original.
const GENUINE_ART_PHRASES =
  /\b(?:alt(?:ernate)?\s*art|full\s*art|special\s+illustration|illustration\s+rare|character\s+(?:rare|art)|secret\s+art|art\s+rare|special\s+art)\b/gi;

// ── Reprint sets that reuse another set's numbering ───────────
// The English form of the master-ball mirror problem, and it is worse than
// the original because the price gap is larger.
//
// Celebrations Classic Collection (2021) reprints Base Set cards with the
// ORIGINAL numbering: a Celebrations Charizard is genuinely "4/102" and
// genuinely says "Base Set" on the card. Number, set size and set name all
// match the 1999 card, so every check we had said yes.
//
// Live measurement, Base Set Charizard 4/102 PSA 10: 24 listings kept,
// spanning $536.75 to $249,999.95 — a 465x range. 19 of the 24 were
// Celebrations reprints at ~$550; the genuine 1999 cards ran $8,000 to
// $250,000. Presenting those as one market is exactly the failure the
// product exists to prevent.
//
// Keyed by the marker word, with the set it belongs to. A listing naming
// the marker is that reprint; if our card is not from that set, refuse.
//
// `reNot` / `setNot` exist because TWO anniversary sets now share the word.
// 30th Celebration and 30th Classic Collection (2026-09-16) reprint classics
// exactly as Celebrations (2021) did — and "30th Celebration" satisfies
// /celebrat/i, so ingesting them silently DISABLED the Celebrations guard for
// all 188 of their cards, and made every 30th listing exempt on a 2021 card.
// Measured, not assumed: "Dialga 103/128 Celebrations Holo" was kept against
// en-30th-103, and "Charizard 4/102 30th Classic Collection" against
// en-cel25cc-4. Both are the master-ball mirror with a five-year gap.
//
// A marker is skipped when the title ALSO names the other set (`reNot`), so a
// seller writing "30th anniversary ... Celebrations" is not read as the 2021
// set; and a set satisfies a marker only when it does not carry the
// disqualifier (`setNot`), so "30th Celebration" no longer counts as
// Celebrations. The bare `30th` marker is last and needs no `set` alias
// beyond its own, since no other set name contains it.
const REPRINT_MARKERS = [
  { re: /\bcelebrations?\b/i,        set: /celebrat/i,           setNot: /\b30th\b/i,
    reNot: /\b30th\b/i,              label: 'Celebrations' },
  { re: /\bclassic collection\b/i,   set: /classic collection/i, label: 'Classic Collection' },
  { re: /\blegendary collection\b/i, set: /legendary/i,          label: 'Legendary Collection' },
  { re: /\b30th\b/i,                 set: /\b30th\b/i,           label: '30th Celebration' }
];

// Han, Hiragana, Katakana, Hangul.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

// ── Language stated in a title ────────────────────────────────
// Korean and Japanese prints share set codes and numbering: a Korean
// Charizard ex is genuinely "201/165" from "SV2a". A live search for the
// JAPANESE card kept 25 listings of which 6 were Korean, $459-$632 against
// $620-$715 for the Japanese ones.
//
// Smaller than the Celebrations gap, and still the wrong card. CLAUDE.md:
// "Never substitute across languages. Cross-language matching is for
// FINDING equivalents, never for DISPLAYING them."
//
// Read only from what the title states. Most say nothing, and those are
// kept — inference is for absent data, and rejecting silence would empty
// the results.
const LANG_WORDS = {
  ja: /\b(japanese|japan|jpn|jp\b|nihongo)\b/i,
  ko: /\b(korean|korea|kor\b)\b/i,
  zh: /\b(chinese|china|traditional chinese|simplified chinese|t-chinese|s-chinese)\b/i,
  de: /\b(german|deutsch)\b/i,
  fr: /\b(french|francais|français)\b/i,
  it: /\b(italian|italiano)\b/i,
  es: /\b(spanish|espanol|español)\b/i,
  pt: /\b(portuguese|portugues)\b/i,
  ru: /\b(russian)\b/i,
  id: /\b(indonesian)\b/i,
  th: /\b(thai)\b/i
};

// The same evidence, written the way a Japanese marketplace writes it.
// LANG_WORDS is built on \b word boundaries, and there is no word boundary
// between CJK characters — so not one entry above can ever match a Yahoo JP
// title. A Korean card sold there says 韓国版, never "Korean". Without these
// the language gate could be installed on the Yahoo path and STILL never
// fire, which is the exact failure this pass exists to end.
const LANG_CJK_WORDS = {
  ko: /韓国|한국/,
  zh: /中国語|繁体字|簡体字|中文/,
  en: /英語版/,
  ja: /日本語版/
};

// What language does this title claim? null when it says nothing, and
// silence is accepted — most English sellers never write "English".
// Script is evidence too: a title in kana is a Japanese listing whether or
// not it says so.
// opts.cjkIsChinese — Japanese IS written in CJK, so on a Japanese
// marketplace "contains CJK" is not evidence of Chinese; it is evidence of
// nothing. Pass false there. Hangul and kana stay evidence either way
// because neither is ambiguous. Defaults true, so every existing caller is
// unchanged.
function languageOf(title, opts) {
  opts = opts || {};
  const t = String(title || '');
  if (/\bkorean?\b/i.test(t)) return 'ko';
  for (const code of Object.keys(LANG_WORDS)) {
    if (LANG_WORDS[code].test(t)) return code;
  }
  for (const code of Object.keys(LANG_CJK_WORDS)) {
    if (LANG_CJK_WORDS[code].test(t)) return code;
  }
  if (/[\uac00-\ud7af]/.test(t)) return 'ko';      // hangul
  if (/[\u3040-\u30ff]/.test(t)) return 'ja';      // kana
  if (opts.cjkIsChinese !== false && CJK.test(t)) return 'zh';
  if (/\benglish\b/i.test(t)) return 'en';
  return null;                                      // unstated
}

// Our card's own language. server.js passes `lang` explicitly; the frontend
// has only the card id, and ids are {lang}-{setId}-{number}, so the language
// is already in the id. Read in one place rather than at each call site.
// The id prefix, read in ONE place. This regex existed here, in
// server.js's matchCard and in server.js's filterCard — three copies of
// "what language is this card", which is the same shape of duplication
// that left SLAB_WORDS without AiGrade and the year gate fed null.
//
// server.js used `String(id).split('-')[0]`, which is looser in a way that
// matters: `'base1-4'` yields `'base1'`, cardLanguage slices that to
// `'ba'`, and the gate then compares every title against a language that
// does not exist. Only a known prefix counts; everything else is null, and
// null is reported by the caller rather than skipping the check in silence.
const CARD_ID_LANG = /^(en|ja|zh-tw|zh-cn|ko)-/;
function languageFromCardId(id) {
  const m = String(id || '').match(CARD_ID_LANG);
  return m ? m[1].slice(0, 2) : null;
}

function cardLanguage(card) {
  if (!card) return null;
  if (card.lang) return String(card.lang).slice(0, 2).toLowerCase();
  if (card.language) return String(card.language).slice(0, 2).toLowerCase();
  return languageFromCardId(card.cardId || card.api_card_id || card.id);
}

// Every 4-digit year a title states. ALL of them, not the first: a title
// can carry both the print year and a grading year ("1999 ... graded 2021"),
// and taking only the first would reject a correct card on a grading date.
function yearsIn(title) {
  const out = [];
  const re = /\b(19[89]\d|20[0-4]\d)\b/g;
  let m;
  while ((m = re.exec(String(title)))) out.push(parseInt(m[1], 10));
  return out;
}

// ── Sequel sets ───────────────────────────────────────────────
// "Base Set 2" CONTAINS "Base Set", so a substring test says the set name
// matches and a 4/130 Base Set 2 card is kept on a 4/102 Base Set search.
// Same family as the Celebrations problem above, one level subtler: the
// set name really is there, followed by the digit that makes it a
// different set.
function namesAConflictingSet(title, setName) {
  if (!setName) return null;
  const flat = String(title).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  const want = String(setName).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!want || want.length < 3) return null;

  const at = flat.indexOf(want);
  if (at < 0) return null;

  // What follows our set name? A trailing numeral means a sequel set.
  const after = flat.slice(at + want.length).trim();
  const seq = after.match(/^(2|3|ii|iii)\b/);
  if (seq) return setName + ' ' + seq[1].toUpperCase();

  return null;
}

// eBay's search keyword field is capped at 300 characters; anything past
// that is dropped without a word. Only deep links are affected — the API
// query carries no negative keywords and comes nowhere near it.
const EBAY_KEYWORD_LIMIT = 300;

// ── Query building ────────────────────────────────────────────
// Include the N/M pair and the set name. Both were missing, which is
// why "Charizard VMAX 74 PSA 10" returned whatever eBay felt like.
function buildQuery(card, grade, opts) {
  opts = opts || {};
  const bits = [];
  const name = card.nameEn || card.name || '';
  if (name) bits.push(name);

  if (card.number) {
    const num = String(card.number);
    const tot = card.setTotal ? String(card.setTotal) : null;
    if (tot) {
      // Sellers pad both halves alike: "074/073", never "074/73"
      const nd = num.replace(/[^0-9]/g, '');
      const td = tot.replace(/[^0-9]/g, '');
      const padded = nd.length > td.length ? tot.padStart(nd.length, '0') : tot;
      bits.push(num + '/' + padded);
    } else {
      bits.push(num);
    }
  }

  // Only a Latin-script set name goes into the query. A Japanese card whose
  // set_name_en is null falls back to its Japanese set name, and
  //   "Charizard ex 201/165 ポケモンカード151 PSA 10 pokemon"
  // returned ZERO results from eBay US — measured, not assumed. eBay carries
  // Japanese cards, but its sellers write the set in English or omit it.
  //
  // Dropping the token is the right move under "broad query, strict gate":
  // an unusable term guarantees nothing comes back, while the gate can still
  // reject whatever a broader search returns. The gate keeps the set name
  // regardless — this only affects what is ASKED.
  // Omit a CJK set name specifically — not merely one lacking Latin letters,
  // which would also drop "151", a perfectly searchable English set name.
  if (card.setName && !CJK.test(String(card.setName))) bits.push(card.setName);

  const g = parseGrade(grade);
  if (g.kind === 'graded') bits.push(g.grader + ' ' + g.grade);

  if (opts.suffix !== false) bits.push('pokemon');

  let q = bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  // ── Deep links ──
  // An API search is gated by verify() afterwards, so the query can be
  // broad. A deep link has no gate at all: it hands eBay a string and the
  // user sees whatever comes back. Negative keywords are the only filter
  // available there, so a link spends them on exactly the junk the gate
  // would otherwise have rejected.
  //
  // eBay syntax, eBay links only. Every other marketplace reads a leading
  // "-" as literal text and returns nothing.
  if (opts.forLink) {
    // Three tiers, spent in this order because eBay's keyword field is
    // capped (see EBAY_KEYWORD_LIMIT): a PSA 9 sitting in a PSA 10 list is
    // the expensive mistake, a Japanese print is the next one, and a
    // keychain is merely noise. If the budget runs out, noise is what goes.
    const gradeMinus = [];
    if (g.kind === 'graded') {
      for (const n of ['10', '9', '8', '7', '6', '5']) {
        if (n !== g.grade) gradeMinus.push('-"' + g.grader + ' ' + n + '"');
      }
    } else {
      gradeMinus.push('-psa', '-bgs', '-cgc', '-sgc', '-graded', '-slab');
    }

    const langMinus = [];
    const lang = cardLanguage(card);
    if (lang === 'en') langMinus.push('-japanese', '-korean', '-chinese', '-german', '-french');
    else if (lang === 'ja') langMinus.push('-korean', '-chinese');

    const junkMinus = ['-lot', '-bundle', '-box', '-pack', '-sealed', '-etb',
                       '-proxy', '-custom', '-keychain', '-coin', '-sleeve',
                       '-playmat', '-binder', '-jumbo', '-sticker'];

    // A card name and set name can be long: "Rayquaza VMAX (Alternate Art
    // Secret) TG20/TG30 Sword & Shield—Brilliant Stars Trainer Gallery
    // PSA 10" plus the full list measured 305 characters, and eBay would
    // have silently dropped the tail — which is where the grade exclusions
    // were. Fit what fits, best first.
    for (const term of gradeMinus.concat(langMinus, junkMinus)) {
      if (q.length + 1 + term.length <= EBAY_KEYWORD_LIMIT) q += ' ' + term;
    }
  }

  return q;
}

// ── Is this title a different PRINTING of the same card? ──────
//
// Reprint set, language and year. All three describe the same trap: number,
// set size and grade agree, the title looks right, and it is a different
// card. Base Set Charizard 4/102 PSA 10 returned 24 "matches" from $536 to
// $249,999 — 19 of them 2021 Celebrations. A Japanese SV2a search kept 25 of
// which 6 were Korean.
//
// One implementation, because eBay and Yahoo JP both need it. Everything
// here rejects on STATED evidence only: a title that says nothing is kept.
//
// opts.cjkIsChinese  — false on a Japanese marketplace, where CJK script is
//                      the local alphabet rather than evidence of Chinese.
// opts.scriptIsLanguageEvidence
//                    — false to skip the "wanted English, title is CJK"
//                      rule. Meaningless on a JP-only source and harmful if
//                      it ever fired there.
//
// Returns a reason string, or null when the title is not excluded.
function printingConflict(title, card, opts) {
  opts = opts || {};
  const t = String(title || '');

  // Reprint set that reuses this card's numbering. Checked BEFORE the
  // number, because the number WILL match — that is the whole problem.
  const ourSet = String(card.setName || '');
  for (const rp of REPRINT_MARKERS) {
    if (!rp.re.test(t)) continue;
    // The title names the OTHER anniversary set too — this marker is not
    // what it is describing.
    if (rp.reNot && rp.reNot.test(t)) continue;
    const ourSetMatches = rp.set.test(ourSet) && !(rp.setNot && rp.setNot.test(ourSet));
    if (!ourSetMatches) {
      return `title is a ${rp.label} reprint, which reuses this numbering — ` +
             `wanted ${ourSet || 'the original set'}`;
    }
  }

  // Language. Korean prints share Japanese set codes and numbering, so a
  // Korean Charizard ex is genuinely 201/165 from SV2a.
  const wantLang = cardLanguage(card);
  if (wantLang) {
    const said = languageOf(t, { cjkIsChinese: opts.cjkIsChinese });
    if (said && said !== wantLang) {
      return `title says ${said}, this card is ${wantLang} — a different language printing`;
    }
    // An English search must reject CJK script even when no language word
    // appears: a title written in kana is not selling the English card.
    if (opts.scriptIsLanguageEvidence !== false && wantLang === 'en' && CJK.test(t)) {
      return 'wanted English, title is in CJK script';
    }
  }

  // Year. A title with no year is NOT rejected — absence is not a mismatch.
  // Scans ALL stated years so "1999 ... graded 2021" survives.
  if (card.setYear) {
    const ys = yearsIn(t);
    if (ys.length && !ys.some(y => Math.abs(y - card.setYear) <= 1)) {
      return `title says ${ys.join('/')}, this set is from ${card.setYear} — a different printing`;
    }
  }

  return null;
}

// ── What the gate actually had to work with ───────────────────
// Every discriminator in printingConflict reads a field off the card, and
// each one is skipped — silently, by design — when that field is absent:
//
//   card.setYear   null -> the year check never runs
//   cardLanguage() null -> the language check never runs
//   card.setName   ''   -> the reprint check has nothing to compare
//
// The skip is correct. Rejecting on absent data is how `looksLikeJunk`
// destroyed ~80 valid prices per set. What is NOT correct is that the skip
// is invisible: the year gate sat dead on every live route for weeks
// because `resolveListingCard` did not SELECT `set_release`, and a gate
// that cannot fire looks exactly like a gate that found nothing.
//
// So verify() now says what it checked. `unchecked` names the
// discriminators that had no input — a caller can report it, a test can
// assert on it, and "the language check never ran" becomes a statement the
// system can make about itself rather than a thing someone has to notice.
function printingEvidence(card) {
  card = card || {};
  const language = cardLanguage(card);
  const year = card.setYear || null;
  const setName = card.setName ? String(card.setName) : null;
  const unchecked = [];
  if (!language) unchecked.push('language');
  if (!year) unchecked.push('year');
  if (!setName) unchecked.push('reprint set');
  return { language, year, setName, unchecked };
}

// ── Verification ──────────────────────────────────────────────
// Returns { ok, reason, confidence, matched:{}, evidence:{} }
//
// `evidence` is attached here, at the single exit, rather than inside
// verifyCore — which returns from fourteen different branches, and the one
// that forgot would be the one that mattered.
function verify(title, card, grade, opts) {
  const r = verifyCore(title, card, grade, opts) || { ok: false, reason: 'no verdict' };
  r.evidence = printingEvidence(card);
  return r;
}

function verifyCore(title, card, grade, opts) {
  opts = opts || {};
  const t = String(title || '');
  if (!t) return { ok: false, reason: 'no title' };

  const lower = t.toLowerCase();
  const want = parseGrade(grade);

  // 1. Not a single card at all.
  //    Legitimate set names containing lot vocabulary are removed first, so
  //    "Classic Collection" is not read as a bundle — and genuine art
  //    phrasing likewise, so "Alt Art Card" is not read as a fan-made
  //    "art card".
  //
  //    Removed to a `~` rather than to a space: a space lets the two
  //    halves of what is left become neighbours, and the one pattern in
  //    the junk list is `\d+\s*cards?`. "186/196 Alternate Art Card"
  //    stripped to spaces reads "186/196   Card" — which that pattern
  //    matches, rejecting a genuine alt art as a 196-card lot. A
  //    non-space, non-word character cannot be spanned by \s* or \b.
  const tForLot = t.replace(SET_NAME_PHRASES, ' ~ ').replace(GENUINE_ART_PHRASES, ' ~ ');
  if (NOT_A_SINGLE_CARD.test(tForLot)) {
    return { ok: false, reason: 'not a single card: ' +
      (tForLot.match(NOT_A_SINGLE_CARD) || [])[0] };
  }

  // 1b/1bb/1c. Reprint set, language and year — the three ways a title can
  //     name a genuinely different PRINTING of a card whose number, set size
  //     and grade all agree. Factored into printingConflict() because a
  //     second marketplace needs exactly these and must not grow its own
  //     copy: two implementations of one gate is how the estimator, the
  //     query builder and the title gate each drifted in this project.
  const printing = printingConflict(t, card, opts);
  if (printing) return { ok: false, reason: printing };

  // 2. Grade must match exactly — grader AND number
  const found = gradesIn(t);
  if (want.kind === 'graded') {
    if (!found.length) {
      return { ok: false, reason: `wants ${want.grader} ${want.grade}, title states no grade` };
    }
    const hit = found.find(f => f.grader === want.grader && f.grade === want.grade);
    if (!hit) {
      const got = found.map(f => f.grader + ' ' + f.grade).join(', ');
      return { ok: false, reason: `wants ${want.grader} ${want.grade}, title has ${got}` };
    }
    // A title naming two different grades is ambiguous — refuse it
    const others = found.filter(f => !(f.grader === want.grader && f.grade === want.grade));
    if (others.length) {
      return { ok: false, reason: 'title names more than one grade: ' +
        found.map(f => f.grader + ' ' + f.grade).join(', ') };
    }
  } else {
    // Raw: reject anything that says it is slabbed — but a card advertised
    // as "(PSA 10 Contender)" IS raw, and rejecting it here as well as from
    // the graded search would leave it findable in neither. Strip the
    // speculation first, exactly as the graded branch does.
    const tRaw = stripSpeculative(t);
    if (SLAB_WORDS.test(tRaw)) {
      return { ok: false, reason: 'wants raw, title indicates a graded slab: ' +
        (tRaw.match(SLAB_WORDS) || [])[0] };
    }
  }

  // 3. Card name must be present
  const wantName = String(card.nameEn || card.name || '').toLowerCase();
  if (wantName) {
    const core = wantName
      .replace(/\b(ex|gx|v|vmax|vstar|v-union|break|prime|lv\.?x|star)\b/g, '')
      .replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
    const firstWord = core.split(' ')[0];
    if (firstWord && firstWord.length > 2 && !lower.includes(firstWord)) {
      return { ok: false, reason: `title does not name ${firstWord}` };
    }
    // Mechanic suffix must agree — a plain Charizard is not a Charizard VMAX
    for (const suffix of ['vmax', 'vstar', 'v-union']) {
      const wants = wantName.includes(suffix);
      const has = lower.includes(suffix);
      if (wants !== has) {
        return { ok: false, reason: wants
          ? `wants ${suffix.toUpperCase()}, title does not say so`
          : `title is a ${suffix.toUpperCase()}, wanted the plain card` };
      }
    }
    // " ex" and " gx" need word boundaries — "ex" appears inside many words
    for (const suffix of ['ex', 'gx']) {
      const wants = new RegExp('\\b' + suffix + '\\b').test(wantName);
      const has = new RegExp('\\b' + suffix + '\\b').test(lower);
      if (wants && !has) {
        return { ok: false, reason: `wants ${suffix.toUpperCase()}, title does not say so` };
      }
    }
  }

  // 4. Collector number — the strongest signal available
  const wantNum = normNum(card.number);
  const wantTot = card.setTotal ? normNum(card.setTotal) : null;
  const pairs = numberPairsIn(t);

  if (pairs.length) {
    // A title with an N/M pair must carry OUR pair
    const exact = pairs.find(p => p.num === wantNum &&
                                  (!wantTot || p.total === wantTot));
    if (!exact) {
      const sameNum = pairs.find(p => p.num === wantNum);
      if (sameNum && wantTot) {
        // Right number, wrong set size — a different set entirely.
        // This is the master-ball mirror class of error.
        return { ok: false, reason:
          `number ${wantNum} matches but set size does not: title says ` +
          `${sameNum.raw}, wanted ${wantNum}/${wantTot}` };
      }
      return { ok: false, reason: `wrong number: title has ` +
        pairs.map(p => p.raw).join(', ') + `, wanted ${wantNum}` +
        (wantTot ? '/' + wantTot : '') };
    }
    // The number is ours — but "Base Set 2" also contains "Base Set"
    const conflict = namesAConflictingSet(t, card.setName);
    if (conflict) {
      return { ok: false, reason:
        `number matches but the title names ${conflict}, not ${card.setName}` };
    }
    return { ok: true, reason: null, confidence: 'number+total',
             matched: { number: exact.raw, grade: grade } };
  }

  // 5. No N/M pair. Accept only with a bare number AND the set name —
  //    either alone is too weak. "Charizard #4" appears in many sets.
  const bareNum = new RegExp('(?:^|[^0-9/])0*' + wantNum + '(?![0-9/])').test(t);
  const setName = String(card.setName || '').toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const titleFlat = lower.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  const setNamed = setName.length > 3 && titleFlat.includes(setName);

  if (bareNum && setNamed) {
    const conflict2 = namesAConflictingSet(t, card.setName);
    if (conflict2) {
      return { ok: false, reason:
        `title names ${conflict2}, not ${card.setName}` };
    }
    return { ok: true, reason: null, confidence: 'number+setname',
             matched: { number: wantNum, set: card.setName, grade: grade } };
  }

  if (!bareNum && !setNamed) {
    return { ok: false, reason: 'title states neither the card number nor the set' };
  }
  if (bareNum) {
    return { ok: false, reason: `title has the number but not the set ` +
      `(${card.setName}) — could be another set's #${wantNum}` };
  }
  return { ok: false, reason: 'title names the set but not the card number' };
}

// ── The marketplace's own condition field ─────────────────────
// Found in the browser, verifying the AiGrade fix: eBay returned
//   "Pokemon 2022 Giratina V 186/196 Alternate Art Ultra Rare Lost Origin
//    PCG 9"  —  $1,114.99, condition "Graded"
// in a RAW NM search. The title gate could not reject it: `PCG` is not a
// grading company we know, and it must not be added — PCG is how sellers
// write "Pokémon Card Game", so the token would eat ordinary titles.
//
// eBay had already said it. The condition field is structured data from
// the marketplace, stronger evidence than any word in a seller's title,
// and nothing read it. The same class as the missing `set_release`
// column: the evidence was there and the gate never saw it.
//
// Applied in ONE direction only. "eBay says graded, the user asked raw" is
// a flat contradiction. The reverse — "eBay says ungraded, the title says
// PSA 10" — is a sloppy seller far more often than a fake, and rejecting
// on it would drop genuine slabs. Absence of evidence is not evidence.
//
// Matched on the leading "grad" so the localised forms (Gradata, Gradée)
// count, while every negative form — "Ungraded", "Non gradée", "Non
// gradata" — is excluded explicitly rather than by hoping the prefix
// misses it.
function conditionSaysGraded(condition) {
  const c = String(condition || '').trim();
  if (!c) return false;
  if (/^(un|non|not|no)\b/i.test(c) || /^ungrad/i.test(c)) return false;
  return /^grad/i.test(c);
}

// Filter a list of listings, returning kept and dropped-with-reasons.
// The caller can then say "12 listings, 40 rejected" rather than "none".
function filterListings(listings, card, grade) {
  const kept = [], dropped = [];
  for (const l of listings) {
    const v = verify(l.title, card, grade);
    if (v.ok) kept.push(Object.assign({}, l, { matchConfidence: v.confidence }));
    else dropped.push({ title: l.title, reason: v.reason });
  }
  return { kept, dropped };
}

const API = {
  buildQuery, verify, filterListings,
  normNum, numberPairsIn, gradesIn, parseGrade, yearsIn, conditionSaysGraded,
  printingEvidence,
  languageOf, cardLanguage, languageFromCardId, namesAConflictingSet, printingConflict,
  GRADERS, GRADERS_UNAMBIGUOUS, GRADERS_AMBIGUOUS, SLAB_GENERIC,
  SLAB_WORDS, NOT_A_SINGLE_CARD, NOT_A_SINGLE_CARD_TERMS,
  SET_NAME_PHRASES, GENUINE_ART_PHRASES, REPRINT_MARKERS, boundedTerm,
  EBAY_KEYWORD_LIMIT
};

// ── Dual mode: Node require() AND a browser <script> ──────────
// The frontend's deep links used to build their own query string. That is
// the estimator split all over again — two implementations of one thing,
// drifting until they answer different questions about the same card.
//
// The frontend cannot require(), so server.js serves THIS FILE at
// /cardmatch.js and the browser picks it up as window.CardMatch. One file,
// one implementation, loaded two ways. A copy pasted into the HTML would
// defeat the entire point.
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (root) root.CardMatch = API;

})(typeof window !== 'undefined' ? window : null);
