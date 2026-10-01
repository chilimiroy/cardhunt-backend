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
  'AI GRADE',   // the same company, spaced. \s+ via boundedTerm
  // Named by eBay DE/IT's own grader aspect, and seen in raw searches there
  // (T1, 2026-09-30): "gegraded GSG 6", "PGS 7,5", "GRAAD 7", "AiGrading 9,5".
  'AIGRADING',  // AiGrade's own name for it on eBay IT ("AiGrading")
  'GSG',        // Gold Standard Grading
  'PGS',        // Platin Grading Service
  'GRAAD',      // GRAAD (eBay IT's grader list)
  'EGS'         // "EGS Certified"
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

// A grader name as it may stand before its grade. "PSA10" has no word
// boundary between A and 1, so boundedTerm alone never read it. Measured
// 2026-09-28 on real titles: unspaced in 3 of 829 eBay slabs (all
// Japanese cards) and 494 of 652 Yahoo graded titles; across 868 eBay raw
// and 344 Yahoo TAG TEAM / ACE SPEC titles the unspaced form fired on
// PSA/BGS/CGC/ARS grades only — never on a card name.
//
// UNAMBIGUOUS graders only. TAG, ACE and MNT keep the strict boundary:
// their strictness is what keeps TAG TEAM and ACE SPEC reachable, no title
// in the sample wrote "TAG10", and loosening them would buy nothing.
function graderToken(co) {
  const b = boundedTerm(co);
  if (GRADERS_AMBIGUOUS.includes(co) || !/\\b$/.test(b)) return b;
  return b.slice(0, -2) + '(?:\\b|(?=\\d))';
}

// ── Qualified tens ────────────────────────────────────────────
// "BGS 10" is not one grade. A BGS 10 Black Label — all four subgrades a
// perfect 10 — sells for several times an ordinary BGS 10, and CGC 10
// Pristine sits likewise above CGC 10 Gem Mint. Reading both as "10" puts
// them in one list and quotes the wrong one as the market.
//
// Treated as a distinct grade STRING rather than a flag, because every
// caller already passes grades around as text ("PSA 10", "BGS 9.5") and a
// flag would be the field that one of the two marketplaces forgets to
// forward — which is exactly how the year gate sat dead.
//
// Only these two combinations exist. A qualifier is meaningful solely on a
// 10: there is no "BGS 9.5 Black Label".
const GRADE_QUALIFIERS = [
  { grader: 'BGS', name: 'BLACK LABEL', re: /\bblack\s*label\b/i, aliases: ['black label', 'blacklabel', 'bl'] },
  { grader: 'CGC', name: 'PRISTINE',    re: /\bpristine\b/i,      aliases: ['pristine'] },
  // CGC's ordinary 10 is branded "Gem Mint". Naming it explicitly lets a
  // caller ask for the ordinary one and get the Pristine ones refused.
  { grader: 'CGC', name: 'GEM MINT',    re: /\bgem\s*mint\b/i,    aliases: ['gem mint', 'gemmint', 'gem mt'] },
  // SGC and TAG publish the same split as CGC — a Pristine 10 above an
  // ordinary Gem Mint 10 (gosgc.com, taggrading.com/pages/scale: Pristine is
  // TAG's 990-1000). AGS calls its top ten "Legendary" (agscard.com). Each
  // offered in the selector, so each must parse here, or picking it would
  // silently return the ordinary ten's list — or nothing.
  { grader: 'SGC', name: 'PRISTINE',    re: /\bpristine\b/i,      aliases: ['pristine'] },
  { grader: 'SGC', name: 'GEM MINT',    re: /\bgem\s*mint\b/i,    aliases: ['gem mint', 'gemmint', 'gem mt'] },
  { grader: 'TAG', name: 'PRISTINE',    re: /\bpristine\b/i,      aliases: ['pristine'] },
  { grader: 'TAG', name: 'GEM MINT',    re: /\bgem\s*mint\b/i,    aliases: ['gem mint', 'gemmint', 'gem mt'] },
  // "Legendary" is also Legendary Collection and Legendary Treasures, so a
  // bare word would refuse every ordinary AGS 10 of those sets. Only beside
  // the ten does it mean the grade.
  { grader: 'AGS', name: 'LEGENDARY',   re: /\b(?:10\s*legendary|legendary\s*10)\b/i, aliases: ['legendary'] },
  { grader: 'AGS', name: 'GEM MINT',    re: /\bgem\s*mint\b/i,    aliases: ['gem mint', 'gemmint', 'gem mt'] }
];

function qualifierFor(grader, text) {
  const s = String(text || '').trim().toLowerCase();
  return GRADE_QUALIFIERS.find(q => q.grader === grader &&
    q.aliases.some(a => a === s)) || null;
}

function parseGrade(g) {
  if (!g) return { kind: 'raw', condition: null };
  const s = String(g).trim();
  if (/^raw/i.test(s) || /^ungraded/i.test(s)) {
    return { kind: 'raw', condition: s.replace(/^raw\s*/i, '').toUpperCase() || 'NM' };
  }

  // ── Grader-wide: "PSA *", "PSA All", "PSA any" ──
  // "PSA + All" in the UI must be ONE query that accepts any PSA grade and
  // refuses BGS, CGC and raw. Ten queries, one per grade, would spend ten
  // calls of a 5,000/day quota on a single card view — and the quota is
  // shared with every other card anyone looks at that day.
  const anyM = s.match(/^([A-Za-z]+)\s*(?:\*|all|any)$/i);
  if (anyM) return { kind: 'graded', grader: anyM[1].toUpperCase(), grade: null, anyGrade: true };

  // ── A qualified ten: "BGS 10 Black Label", "CGC 10 Pristine" ──
  const qM = s.match(/^([A-Za-z]+)\s*([\d.]+)\s+(.+)$/);
  if (qM) {
    const grader = qM[1].toUpperCase();
    const q = qualifierFor(grader, qM[3]);
    // A qualifier only means anything on a 10 — there is no BGS 9.5 Black
    // Label. Trailing text that is not a recognised qualifier, or one on
    // the wrong number, is IGNORED and the plain grade still stands.
    //
    // It must not fall through to the plain parse below, which requires the
    // string to END at the number: "BGS 9.5 Black Label" failed that, and a
    // failed parse returns kind:'raw'. Asking for a slab and being handed a
    // raw search is the worst available answer, and it is silent.
    return (q && qM[2] === '10')
      ? { kind: 'graded', grader, grade: '10', qualifier: q.name }
      : { kind: 'graded', grader, grade: qM[2] };
  }

  const m = s.match(/^([A-Za-z]+)\s*([\d.]+)$/);
  if (!m) return { kind: 'raw', condition: null };
  return { kind: 'graded', grader: m[1].toUpperCase(), grade: m[2] };
}

// Which qualifiers does this title state, for this grader?
function qualifiersIn(title, grader) {
  const t = String(title || '');
  return GRADE_QUALIFIERS
    .filter(q => (!grader || q.grader === grader) && q.re.test(t))
    .map(q => q.name);
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
    // A bare "?" after the grade is the same claim: live, an Ungraded
    // Umbreon VMAX titled "... | PSA10 ?" (2026-09-28).
    .replace(new RegExp('(?:' + GRADERS.map(graderToken).join('|') + ')' +
      '\\s*[-:]?\\s*(?:10|[1-9](?:\\.5)?)(?![\\d.])\\s*(?:(?:' +
      'contender|candidate|potential|pot\\.?\\??|worthy|ready|hopeful)\\b|\\?)', 'gi'), ' ');
}

// ── Raw sub-condition, as the SELLER stated it ────────────────
// TASK.md asked which this turned out to be. Measured on 2026-09-22 across
// 447 live rows from six cards at Raw NM / LP / MP:
//
//   eBay's structured `condition` field is BINARY, not a scale.
//   441 "Ungraded", 3 "Non gradée", 3 "Non gradata" — three values, all
//   meaning ungraded, and identical whichever condition was requested.
//
// So there is no structured data to filter on, and the filter has to read
// the seller's prose. That makes it a SELLER-STATED condition and it must
// say so — the number is a claim by the person selling the card, not a
// measurement, and nothing verifies it.
//
// Two traps, both measured rather than guessed, and both the shape that has
// destroyed good data in this project before:
//
//   HP  9 titles contained it. EIGHT were "120 HP" — the card's Hit
//       Points, printed on essentially every Pokémon card. Exactly one
//       meant Heavily Played. A bare \bHP\b filter would be 89% wrong, and
//       wrong in the direction of calling mint cards damaged.
//   EX  25 titles contained it. TWENTY-FOUR were the card mechanic —
//       "Charizard ex 199/165". EX as "Excellent" is unrecoverable from a
//       Pokémon title, so it is not read at all. Deliberately absent, like
//       GEM and MINT from the slab words.
//
// And the reason the "unstated" group is not optional: 74 of 149 titles —
// 49.7% — state no condition vocabulary whatsoever. A filter that dropped
// them would hide half the market, silently, which is the looksLikeJunk
// failure wearing its sixth costume.
const RAW_CONDITIONS = ['M', 'NM', 'LP', 'MP', 'HP', 'DMG'];

// Order matters: the most specific spelling wins, so "Near Mint" is not
// read as "Mint".
// The European forms (T1, 2026-09-30): eBay ES has no condition aspect at
// all, so every ES row's condition is its title's — "Dañado", "Jugado
// Moderadamente", "Casi Nuevo" were read as nothing and sat in the unstated
// group. Italian, German and French as eBay IT/DE/FR sellers write them.
// Phrases only: bare "nuevo"/"neu" (new) and "gebraucht" (used) are not a
// grade of condition.
const RAW_CONDITION_PATTERNS = [
  { code: 'DMG', re: /\b(?:damaged|dmg|poor)\b/i },
  { code: 'DMG', re: /\b(?:dañad[oa]|danad[oa]|danneggiat[oa]|beschädigt|beschaedigt|endommagée?|abîmée?|mauvais\s+[ée]tat|pobre)(?![a-z])/i },
  { code: 'HP',  re: /\bheav(?:y|ily)\s*(?:played|play)\b/i },
  { code: 'HP',  re: /\b(?:muy\s+jugad[oa]|molto\s+giocat[oa]|pesantemente\s+giocat[oa]|stark\s+bespielt|tr[eè]s\s+jou[ée])(?![a-z])/i },
  { code: 'MP',  re: /\bmoderat(?:e|ely)\s*(?:played|play)\b/i },
  { code: 'MP',  re: /\b(?:moderadamente\s+jugad[oa]|jugad[oa]\s+moderadamente|moderatamente\s+giocat[oa]|m[äa]ßig\s+bespielt|moyennement\s+jou[ée])(?![a-z])/i },
  { code: 'LP',  re: /\blight(?:ly)?\s*(?:played|play)\b/i },
  { code: 'LP',  re: /\b(?:ligeramente\s+jugad[oa]|leggermente\s+giocat[oa]|leicht\s+bespielt|l[ée]g[eè]rement\s+jou[ée])(?![a-z])/i },
  { code: 'NM',  re: /\b(?:near\s*mint|nm)\b/i },
  { code: 'NM',  re: /\b(?:casi\s+nuev[oa]|quasi\s+nuov[oa]|nahezu\s+neuwertig|proche\s+du\s+neuf)(?![a-z])/i },
  // "Excellent-Mint" / "EX-MT" is the grade BELOW Near Mint — eBay's own
  // "Lightly played (Excellent)". Read as Mint, it sat in the Raw M list
  // (live: "Blastoise … EX MT Excellent-Mint", 2026-09-27). Only the
  // explicit spellings: a bare "ex" is the card mechanic ("Charizard ex
  // Mint" really does claim Mint), and "EX MT" with a space is left alone.
  { code: 'LP',  re: /\b(?:excellent[\s-]*(?:mint|mt)|ex-(?:mint|mt)|exmt)\b/i },
  { code: 'M',   re: /\bmint\b/i },
  // Bare abbreviations last, and only after the hit-points strip below.
  { code: 'HP',  re: /\bhp\b/i },
  { code: 'MP',  re: /\bmp\b/i },
  { code: 'LP',  re: /\blp\b/i }
];

// "120 HP" is the card's Hit Points, not Heavily Played. Removed to a `~`
// for the same reason GENUINE_ART_PHRASES is: a space would let the
// neighbours join up and match something else.
function stripHitPoints(title) {
  // Both orders: "120 HP", and "HP 120" as eBay ES writes it ("Holo Raro HP
  // 120 Inglés" was labelled Heavily Played). German/French/Italian "KP" /
  // "PV" / "PS" are hit points too and were never condition words.
  return String(title || '').replace(/\b\d{1,3}\s*hp\b/gi, ' ~ ').replace(/\bhp\s*\d{2,3}\b/gi, ' ~ ');
}

// Returns { code, stated }. `stated:false` means the seller said nothing —
// those rows belong in an "unstated" group and must never be dropped.
function sellerCondition(title) {
  const t = stripHitPoints(title);
  for (const p of RAW_CONDITION_PATTERNS) {
    if (p.re.test(t)) return { code: p.code, stated: true };
  }
  return { code: null, stated: false };
}

// ── eBay's OWN card condition — structured, and filterable in search ──
//
// Measured 2026-09-27 through /api/ebay/conditions, superseding the title
// reading above for eBay:
//   * item SUMMARIES carry no conditionDescriptors — 0 of 400;
//   * full items (getItem) carry them — 100 of 100: every ungraded item a
//     "Card Condition", every slab a grader, grade and cert number;
//   * search takes aspect_filter on "Card Condition", and the filtered
//     results agreed with each item's own descriptor 36 of 36 times on
//     ungraded rows (the only strays were slabs, which the raw gate refuses);
//   * "Not Specified" is NOT a filter — eBay ignores it and returns
//     everything — so the unstated group can never be asked for this way.
// So a raw condition costs ONE search, the same as it always has; reading
// descriptors per listing would cost 25-75 getItem calls per view.
//
// eBay's scale, read from eBay's own condition POLICY for category 183454
// (Sell Metadata get_item_condition_policies, 2026-09-27 — the list a seller
// picks from, not a sample of results): Ungraded -> Card Condition (40001) =
// Near mint or better | Lightly played (Excellent) | Moderately played (Very
// good) | Heavily played (Poor). Four values. Five raw-heavy cards' live
// distributions (401 to 3,328 listings each) showed nothing else.
//
// There is NO Mint and NO Damaged. Until 2026-09-27 this map answered M with
// Near-Mint results and DMG with Heavily-Played ones — a silent substitution
// — and then the M and DMG chips were removed. Both were wrong: eBay not
// having a value is a reason to ask the TITLE, not to drop the option.
const EBAY_CARD_CONDITION = {
  NM:  'Near Mint or Better',
  LP:  'Lightly Played (Excellent)',
  MP:  'Moderately Played (Very Good)',
  HP:  'Heavily Played (Poor)'
};
const EBAY_CONDITION_CODES = ['NM', 'LP', 'MP', 'HP'];   // what eBay can actually tell apart

// Conditions eBay has no value for, offered from the SELLER'S OWN WORDS and
// labelled seller-stated. The term goes into the search itself — measured
// (T1, 2026-09-27): on a busy card the 75-row cap, not a missing field, is
// what loses listings, and a mint raw copy sits at the expensive end of a
// price sort; asking eBay for the word keeps it inside the cap. The title is
// then read by sellerCondition, and the panel keeps rows that state it,
// groups rows that state nothing, and counts rows that state another.
// No aspect filter: a listing whose Card Condition field is empty still
// counts if the seller's title says it.
const TITLE_ONLY_CONDITIONS = {
  M:   { term: 'mint',    label: 'Mint',
         why: 'eBay has no Mint value — its top is "Near mint or better"' },
  DMG: { term: 'damaged', label: 'Damaged',
         why: 'eBay has no Damaged value — its lowest is "Heavily played (Poor)"' }
};
function titleOnlyCondition(grade) {
  const g = parseGrade(grade);
  if (g.kind !== 'raw' || !/^\s*raw\s+\S/i.test(String(grade))) return null;
  return TITLE_ONLY_CONDITIONS[g.condition] ? Object.assign({ code: g.condition }, TITLE_ONLY_CONDITIONS[g.condition]) : null;
}

// ── Each eBay site names its aspects in its own language (T1) ──
// Read from each site's own ASPECT_REFINEMENTS (/api/ebay/aspects,
// 2026-09-30, en-base1-4). An English aspect name sent to eBay DE/FR/IT/ES
// is IGNORED, not refused: base1-4 on DE returned 264 for Raw, Raw NM and
// Raw HP alike, while GB went 1,441 -> 394 -> 125. So a site missing here
// gets NO filter — and then no row may claim eBay stated its condition or
// grade. GB/AU/CA use US's names (measured: identical, and the filter bites).
// ES carries no condition or grade aspect at all in category 183454 — only
// Material and Vintage — so ES rows are title-stated, always.
// Grader values are eBay's English names on every site; grades are numbers.
const EBAY_SITE_ASPECTS = {
  EN: { condition: 'Card Condition', conditionValues: null, grader: 'Professional Grader', grade: 'Grade' },
  EBAY_DE: { condition: 'Kartenzustand', grader: 'Bewertungsexperte', grade: 'Bewertung',
             conditionValues: { NM: 'Nahezu neuwertig oder besser (Near Mint or Better)',
                                LP: 'Leicht bespielt (Exzellent/Excellent)',
                                MP: 'Gebraucht (Sehr gut/Very Good)',
                                HP: 'Stark bespielt (Minderwertig/Poor)' } },
  EBAY_FR: { condition: 'État de la carte', grader: 'Société de gradation professionnelle', grade: 'Note',
             conditionValues: { NM: 'Near Mint or Better (Quasi neuf ou mieux)',
                                LP: 'Lightly Played/Excellent (légers défauts)',
                                MP: 'Moderately Played/Very Good (état moyen)',
                                HP: 'Heavily Played/Poor (très abîmée)' } },
  EBAY_IT: { condition: 'Condizione della carta', grader: 'Valutatore professionista', grade: 'Classificazione',
             conditionValues: { NM: 'Near Mint o migliore', LP: 'Lightly Played (Excellent)',
                                MP: 'Moderately Played (Very Good)', HP: 'Heavily Played (Poor)' } },
  EBAY_ES: null
};
function siteAspects(marketplace) {
  const mp = String(marketplace || 'EBAY_US').toUpperCase();
  if (['EBAY_US', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA'].includes(mp)) return EBAY_SITE_ASPECTS.EN;
  return EBAY_SITE_ASPECTS[mp] || null;     // unknown site: no filter, never a guess
}

// The aspect_filter for a raw grade, or null (Raw All, a graded search, a
// condition eBay has no value for, or a site whose aspects we have not read).
function ebayConditionFilter(grade, marketplace) {
  const g = parseGrade(grade);
  if (g.kind !== 'raw' || !g.condition) return null;
  const site = siteAspects(marketplace);
  if (!site) return null;
  // parseGrade reads a bare "Raw" as NM. That is "every raw listing", not
  // a filter — only an explicitly stated condition narrows.
  if (!/^\s*raw\s+\S/i.test(String(grade))) return null;
  // M and DMG have no eBay value: null here, TITLE_ONLY_CONDITIONS instead.
  const value = site.conditionValues ? site.conditionValues[g.condition] : EBAY_CARD_CONDITION[g.condition];
  if (!value) return null;
  return {
    asked: g.condition, code: g.condition, value,
    aspectFilter: 'categoryId:183454,' + site.condition + ':{' + value + '}',
    note: null
  };
}

// ── A slab's grader and grade, asked of eBay's own aspects ──
// Measured 2026-09-27 on live Base Set Charizard (/api/ebay/conditions
// ?combo=3&verify=3): search summaries carry no grader or grade (0 of 100);
// getItem does, at one call per listing. But `aspect_filter` narrows on
// BOTH together at no extra cost: BGS 8 -> 28, CGC 8 -> 30, TAG 8 -> 5.
// Of 25 filtered items checked against their own descriptor, 22 agreed; all
// three misses were the filter returning a different GRADE (two BGS 9.5 under
// "BGS | 10", a TAG 5.5 under "TAG | 10"), and in all three the TITLE stated
// the true grade. So the filter narrows the search and the title is checked
// against it: where they disagree, neither is authoritative and the row is
// refused (verify, opts.structuredGrade). Where the title is silent — "TAG
// Graded 8", which gradesIn cannot read — the field answers.
//
// eBay's names, verbatim from its Professional Grader distribution. Only
// graders we hold a code for AND saw eBay name; any other grader keeps the
// title-only gate it has always had.
const EBAY_GRADER = {
  PSA:  'Professional Sports Authenticator (PSA)',
  BGS:  'Beckett Grading Services (BGS)',
  BVG:  'Beckett Vintage Grading (BVG)',
  BCCG: 'Beckett Collectors Club Grading (BCCG)',
  CGC:  'Certified Guaranty Company (CGC)',
  SGC:  'Sportscard Guaranty Corporation (SGC)',
  AGS:  'Automated Grading Systems (AGS)',
  GMA:  'Gem Mint Authentication (GMA)',
  HGA:  'Hybrid Grading Approach (HGA)',
  PCA:  'Professional Card Authenticator (PCA)',
  TAG:  'Technical Authentication & Grading (TAG)',
  ACE:  'Ace Grading (Ace)',
  MNT:  'MNT Grading (MNT)'
};

function ebayGradeFilter(grade, marketplace) {
  const g = parseGrade(grade);
  if (g.kind !== 'graded') return null;
  // A site whose aspect names we have not read gets no filter — and so no
  // row there can be kept "on eBay's grade field alone" (verify's
  // structuredGrade), because eBay never checked that field for us.
  const site = siteAspects(marketplace);
  if (!site) return null;
  const value = EBAY_GRADER[g.grader];
  if (!value) return null;
  // eBay's Grade values are the bare numbers, halves included ("9.5").
  // "Authentic" and "Not Specified" exist too — never asked for.
  if (!g.anyGrade && !/^(10|[1-9](\.5)?)$/.test(String(g.grade))) return null;
  return {
    grader: g.grader, grade: g.anyGrade ? null : String(g.grade), graderValue: value,
    aspectFilter: 'categoryId:183454,' + site.grader + ':{' + value + '}' +
                  (g.anyGrade ? '' : ',' + site.grade + ':{' + g.grade + '}')
  };
}

// Every grade a title CLAIMS, read more loosely than gradesIn: the grader,
// then only grading filler words, then the number — "TAG Graded 8", "TAG
// graded 5.5 population 10" (-> TAG 5.5, never the pop count), "SGC Gem Mint
// 10". Used ONLY to detect disagreement with a structured grade; the strict
// reader still decides everything else. A number followed by a digit, a dot
// or a slash is a collector number or a fraction, not a grade.
const GRADE_FILLER = '(?:\\s+(?:graded|grade|gem|mint|nm|mt|nm-mt|near|pristine))*';
function titleGradeClaims(title) {
  const t = stripSpeculative(String(title || ''));
  const out = gradesIn(t).map(f => ({ grader: f.grader, grade: f.grade }));
  for (const co of GRADERS) {
    const re = new RegExp(graderToken(co) + GRADE_FILLER + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.\\/])', 'gi');
    let m;
    while ((m = re.exec(t))) {
      if (!out.some(o => o.grader === co && o.grade === m[1])) out.push({ grader: co, grade: m[1] });
    }
  }
  return out;
}

// Find every grader+number in a title. Boundary-checked, so BGS 9 does
// not match "BGS 9.5" — a half grade sells well above a whole one.
function gradesIn(title) {
  const out = [];
  const t = stripSpeculative(title);
  for (const co of GRADERS) {
    const re = new RegExp(graderToken(co) + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.])', 'gi');
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

// "Graded" in the languages of eBay DE/IT/ES/FR, and Beckett by name — slab
// evidence ONLY with a grade beside it (T1, 2026-09-30: "GRAD 7", "Grad 7
// Near Mint", "Gradate 9.5", "Beckett 8" were kept in Raw NM on eBay DE/IT).
// Never alone: eBay translates a US "Ungraded" to "non gradata" / "Non
// Classificata" on those sites, and "graduabile"/"gradeable" ("could be
// graded") is a RAW card. A comma decimal is how Europe writes 9,5.
const SLAB_WITH_GRADE = ['grad', 'gradate', 'gradata', 'gradato', 'gradati', 'graduada', 'graduado',
                         'gradée', 'gradé', 'gegraded', 'gegradet', 'beckett',
                         // "Black Grading 9", "cardmarket grading 9 Mint" (eBay DE/IT, Raw NM)
                         'grading',
                         // "CMG 8 Casi Como Nuevo" — $1,078 in Raw NM on eBay ES
                         'cmg'];
const GRADE_NUM_EU = '\\s*[-:]?\\s*(?:10|[1-9](?:[.,]5)?)(?![\\d.,])';

const SLAB_WORDS = new RegExp('(?:' + [].concat(
  // An unambiguous company name is slab evidence on its own.
  GRADERS_UNAMBIGUOUS.map(boundedTerm),
  // ...including written against its grade: "PSA10" (see graderToken).
  GRADERS_UNAMBIGUOUS.map(co => graderToken(co) + GRADE_NUM),
  // An ambiguous one only with a grade beside it — see GRADERS_AMBIGUOUS.
  GRADERS_AMBIGUOUS.map(co => boundedTerm(co) + GRADE_NUM),
  SLAB_WITH_GRADE.map(w => boundedTerm(w) + GRADE_NUM_EU),
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
  'stamp', 'cardboard cutout',
  // several copies sold as one. jptest asserted "x4 Playset" was refused —
  // of an English gate production never ran (T9, 2026-09-29). Measured on
  // 516 titles production keeps: 0 carry it. NOT "quantity": the one kept
  // title with it ("… #74/73 … Quantity (5)") is a single, five in stock.
  'playset', 'play set', 'playsets',
  // ── eBay DE/FR/IT/ES (T1, 2026-09-30) ──
  // Read on the titles those sites returned for English cards — sellers'
  // own words and eBay's machine translation of US titles. Each is a phrase
  // or a word with no card meaning; bare "metal" is NOT here (a Pokémon
  // type), nor bare "oro"/"gold" (Gold Star, gold secret rares).
  // lotteries: one "ticket" sold per listing, ~$6-10 against a $400 card
  'pokelotterie', 'pokelotteria', 'pokélotteria', 'pokélotterie', 'lotteria', 'lotterie', 'lotería',
  // lots
  'lotto', 'lotti', 'lote', 'lotes', 'konvolut',
  // customs, fan-made, replicas — and the translations of "fan made" /
  // "fan art" that eBay produced literally ("made by fan" = a ventilator)
  'personalizzata', 'personalizzato', 'personalizada', 'personalizado', 'personnalisée', 'personnalisee',
  'hecho por ventilador', 'ventaglio', 'fälschung', 'faelschung', 'réplica', 'replika',
  // NOT bare "metallo": the Metal TYPE in a translated title ("Energia
  // Metallo") is a genuine card.
  'metallkarte', 'carta metallo', 'lámina de metal', 'lamina de metal',
  // NOT "gold foil" (nor "lámina de oro", its translation): measured, the
  // genuine Mega Dragonite ex MUR 250/193 — a gold card — is sold as "Gold
  // Foil" at the card's median price, 10 rows. The fake gold Charizards at
  // $50 are the outlier check's job, not a word's.
  'goldcard', 'carta oro', 'tarjeta de oro', 'placcata oro', 'chapada en oro',
  // extended-art cases and holders. NOT bare "custodia"/"estuche": a genuine
  // single "spedita in custodia rigida" ships in one.
  'custodia estesa', 'estuche extendido', 'estuche de arte',
  // "extended art" display cases, as translated: "Vitrina de Arte
  // Extendido", "Carpeta de Arte Extendida Inserto", "Custodia Arte Estesa"
  'arte extendido', 'arte extendida', 'arte estesa', 'arte esteso', 'estenso espositore', 'vitrina',
  // held-out check (12 more cards): the same cases, other word orders. NOT
  // "custodia magnetica"/"estuche magnético": a genuine $462 Magikarp IR is
  // sold "¡ESTUCHE MAGNÉTICO!" — in a holder, not as one.
  'extendido arte', 'artistica estesa', 'ilustraciones extendido', 'carpeta inserto',
  // "fan art" as eBay translates it: "Opera d'arte di un fan", "Obra de arte de un fan"
  'di un fan', 'de un fan',
  'personalizzate', 'personalizzati', 'personalizadas', 'personalizados', 'carta de metal',
  // third check (12 fresh cards, production gate): display and metal cards,
  // art-case wordings, and a whole master set in a binder as one listing
  'carta da esposizione', 'tarjeta de exhibición', 'tarjeta de exhibicion',
  'scheda metallo', 'carta metallica', 'tarjeta metálica', 'tarjeta metalica', 'tarjeta de metal',
  'opera estesa', 'arte inserto', 'master set',
  // NOT "tarjeta dorada" ("gold card"): tried on eBay ES's gold fakes at
  // $42-48, and it refused the GENUINE Ultra Ball 186/172 and Shining
  // Charizard 107/105 gold secret rares too — the "gold foil" trap again.
  'supporto magnetico', 'soporte magnético', 'soporte magnetico', 'espositore',
  // keychains
  'portachiavi', 'llavero', 'porte-clés', 'porte-cles', 'schlüsselanhänger',
  // sealed — plural only: "busta"/"sobre" is also the envelope a single is
  // posted in
  'pacchetti'
];

// The one entry that is genuinely a pattern rather than a word: "50 cards",
// "50cards". It carries its own boundaries deliberately and is kept apart
// from the word list so the word list stays free of regex.
// The second: a rarity or mechanic word followed by "set" — "Charizard
// Venusaur Blastoise ex SAR Set 201/165", a three-card lot kept as one PSA 10
// Charizard (live, $1,289 and $1,699.99, 2026-09-27). A bare "set" would
// be wrong: of 727 real kept titles exactly one carried a standalone "set",
// and it was a genuine single ("Dracaufeu Charizard - 4/102 - Set de Base").
// The third: a multiplier, "x4" / "4x" / "x 3", standing alone — 0 of 516
// kept production titles carry one (2026-09-29). 2-9 only: "x1" is a single.
const NOT_A_SINGLE_CARD_PATTERNS = ['\\d+\\s*cards?\\b',
  '(?:^|[\\s(\\[])(?:x\\s?[2-9]|[2-9]\\s?x)(?=[\\s)\\]]|$)',
  '\\b(?:ex|gx|vmax|vstar|sar|sir|chr|csr|ur|hr)\\s+set\\b'];

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
// ── Which sets reprint which: keyed by SET ID, never by a set's name ──
//
// The first version keyed this on words. A title naming "celebrations" was
// the reprint, and our card was exempt when its SET NAME matched
// /celebrat/i. Then 30th Celebration and 30th Classic Collection
// (2026-09-16) were ingested, "30th Celebration" satisfied /celebrat/i, and
// the guard was silently disabled for all 188 of their cards. The patch for
// that (`reNot` / `setNot`) was more words about words.
//
// And it only ever worked in ONE direction. Searching the original rejected
// a title naming the reprint; searching the REPRINT accepted the original,
// because an Aquapolis Lugia title names no reprint at all. The original is
// usually the far more valuable card, so that is the expensive direction:
// live, Aquapolis Lugia 149/147 ran $385 to $15,050 on one Raw search.
//
// So the relationship now lives in set ids, which cannot collide:
//
//   REPRINT_FAMILIES   the anniversary sets, the set ids that belong to each,
//                      and what a SELLER writes to say "this printing".
//   REPRINT_OF         for each Classic Collection card, the original it
//                      reprints and the number PRINTED on it — which is the
//                      original's, not our catalogue's ordinal.
//
// Words still appear, because a listing title is all a listing has. But they
// are only ever evidence about the LISTING; which family OUR card belongs to
// is read from its set id, and a family's words are tested in a fixed order
// (30th first) so that "30th Celebration" can never be read as Celebrations.
//
// Adding a set: give it an id here. A new set whose NAME happens to contain
// another family's word changes nothing, because nothing reads set names.
const REPRINT_FAMILIES = [
  // First, deliberately: every 30th title also tends to say "Celebration",
  // "Classic Collection" or "CC". Whatever else it says, "30th" decides.
  { id: '30th', label: '30th Celebration (2026)', year: 2026,
    sets: ['30th', '30th-c'],
    // T1 (2026-09-30): eBay IT/ES/DE/FR machine-translate US titles, and a
    // German or Italian seller writes their own words. Measured on eBay IT
    // and ES for Aquapolis Lugia: "30° Anniversario", "30ª Celebración",
    // "30 aniversario", "30 Jahre … Jubiläum" — every one kept on the 1999
    // card until these were read. "30" alone is never evidence (a card
    // number, an HP); only with an ordinal mark or an anniversary word.
    says: [/\b30th\b/i, /\b30c\b/i,
           /\b30\s*(?:°|º|ª|\.|e|eme|ème)?\s*(?:anniversario|aniversario|anniversaire|celebrazion[ei]|celebraci[oó]n(?:es)?|c[ée]l[ée]bration|jubil[äa]um|jahre|ans|anni|a[ñn]os)\b/i,
           /(?:^|[\s(])30\s*[°ºª]/i],
    ask: '30th Celebration',
    // eBay negative keywords for a DEEP LINK on a card this family reprinted
    // (T0, 2026-09-30). A link has no gate: the Aquapolis Lugia link returned
    // the 30th reprints the API search refused (10 of 132). The FromReprint
    // list is what is safe on ANOTHER family's reprint card — "celebration"
    // is in every 30th title, so a 30th card cannot exclude Celebrations by it.
    linkMinus: ['-30th'], linkMinusFromReprint: ['-30th'] },
  // "25th Anniversary" is how sellers describe a Celebrations reprint too —
  // live, "Charizard 4/102 Base Set Holo 25th Anniversary" at $195 was kept
  // on the 1999 card. But McDonald's 2021 is ALSO a 25th Anniversary set,
  // and reprints nothing. So `saysOnOriginal`: evidence only when our card
  // is one REPRINT_OF says this family reprinted, where there is no other
  // 25th Anniversary card it could be.
  { id: 'cel25', label: 'Celebrations (2021)', year: 2021,
    sets: ['cel25', 'cel25cc'],
    // The same words in the languages of eBay IT/ES/FR/DE (T1): measured,
    // "Celebrazioni: Collezione Classica", "Celebraciones 25 Aniversario",
    // kept on Base Set Charizard at Celebrations prices.
    says: [/\bcelebrations?\b/i, /\bclassic collection\b/i,
           /\bcelebrazion[ei]\b/i, /\bcelebraci[oó]n(?:es)?\b/i, /\bc[ée]l[ée]brations?\b/i,
           /\bcollezione classica\b/i, /\bcolecci[oó]n cl[aá]sica\b/i, /\bcollection classique\b/i,
           /\b(?:classic|klassische) sammlung\b/i],
    saysOnOriginal: [/\b25th\b/i,
           /\b25\s*(?:°|º|ª|\.|e|eme|ème)?\s*(?:anniversario|aniversario|anniversaire|jubil[äa]um|jahre|ans|anni|a[ñn]os)\b/i,
           /(?:^|[\s(])25\s*[°ºª]/i],
    ask: 'Celebrations',
    linkMinus: ['-celebrations', '-25th', '-"classic collection"'],
    linkMinusFromReprint: ['-25th'] },
  { id: 'lc', label: 'Legendary Collection (2002)', year: 2002,
    sets: ['lc'],
    says: [/\blegendary collection\b/i],
    ask: 'Legendary Collection',
    linkMinus: ['-"legendary collection"'],
    linkMinusFromReprint: ['-"legendary collection"'] }
];

// Classic Collection cards: our catalogue number -> [original card, the
// number PRINTED on the reprint]. The printed number is the original's
// "149/147", which is what every seller writes; our catalogue holds TCGdex's
// ordinal ("029" of 30), which no seller has ever written — so until this
// table existed a 30th Classic Collection search asked eBay for
// "Lugia 029/030" and got nothing back at all.
//
// Built 2026-09-26 from pokemontcg.io's printed numbers (me55c, cel25c)
// matched to our own catalogue by name and number, and where more than one
// original carried that number, by attacks, HP and illustrator on TCGdex:
// the 30th Metagross is Delta Species 11/113 (same attack, same artist), not
// Hidden Legends or Deoxys, which also carry an 11. Darkrai & Cresselia
// LEGEND is two cards (99 and 100); 019/020 are taken in that order.
const REPRINT_OF = {
  '30th-c': {
    '001': ['base1-4',     '4/102'],     // Charizard
    '002': ['ex1-5',       '5/109'],     // Delcatty
    '003': ['ex11-11',     '11/113'],    // Metagross δ
    '004': ['bw10-11',     '11/101'],    // Genesect-EX
    '005': ['gym1-18',     '18/132'],    // Misty
    '006': ['ex7-19',      '19/109'],    // Dark Tyranitar
    '007': ['neo1-25',     '25/111'],    // Sneasel
    '008': ['sm9-33',      '33/181'],    // Pikachu & Zekrom-GX
    '009': ['xy9-41',      '41/122'],    // Greninja BREAK
    '010': ['dp6-43',      '43/146'],    // Uxie
    '011': ['pl1-47',      '47/127'],    // Crobat G
    '012': ['swsh4-50',    '50/185'],    // Raikou (Amazing Rare)
    '013': ['sm4-57',      '57/111'],    // Buzzwole-GX
    '014': ['base1-58',    '58/102'],    // Pikachu
    '015': ['gym2-69',     '69/132'],    // Erika's Jigglypuff
    '016': ['bw6-85',      '85/124'],    // Rayquaza-EX
    '017': ['sm1-89',      '89/149'],    // Solgaleo-GX
    '018': ['hgss4-94',    '94/102'],    // Gengar
    '019': ['hgss4-99',    '99/102'],    // Darkrai & Cresselia LEGEND (top)
    '020': ['hgss4-100',   '100/102'],   // Darkrai & Cresselia LEGEND (bottom)
    '021': ['bw3-101',     '101/101'],   // N
    '022': ['dp4-106',     '106/106'],   // Palkia (LV.X era)
    '023': ['xy5-106',     '106/160'],   // M Gardevoir-EX
    '024': ['neo4-106',    '106/105'],   // Shining Celebi
    '025': ['ex10-108',    '108/115'],   // Scizor ex
    '026': ['swsh8-114',   '114/264'],   // Mew VMAX
    '027': ['swsh9-123',   '123/172'],   // Arceus VSTAR
    '028': ['swsh1-138',   '138/202'],   // Zacian V
    '029': ['ecard2-149',  '149/147'],   // Lugia
    '030': ['sv02-203',    '203/193']    // Magikarp
  },
  'cel25cc': {
    'CC001': ['base1-2',   '2/102'],     // Blastoise
    'CC002': ['base1-4',   '4/102'],     // Charizard
    'CC003': ['base1-15',  '15/102'],    // Venusaur
    'CC004': ['base1-73',  '73/102'],    // Imposter Professor Oak
    'CC005': ['base5-8',   '8/82'],      // Dark Gyarados
    'CC006': ['base5-15',  '15/82'],     // Here Comes Team Rocket!
    'CC007': ['gym2-15',   '15/132'],    // Rocket's Zapdos
    'CC008': ['basep-24',  '24'],        // _____'s Pikachu (a promo: no total)
    'CC009': ['neo1-20',   '20/111'],    // Cleffa
    'CC010': ['neo3-66',   '66/64'],     // Shining Magikarp
    'CC011': ['ex4-9',     '9/95'],      // Team Magma's Groudon
    'CC012': ['ex7-86',    '86/109'],    // Rocket's Admin.
    'CC013': ['ex12-88',   '88/92'],     // Mew ex
    'CC014': ['ex15-93',   '93/101'],    // Gardevoir ex δ
    'CC015': ['pop5-17',   '17/17'],     // Umbreon ☆
    'CC016': ['dp4-15',    '15/106'],    // Claydol
    'CC017': ['pl2-109',   '109/111'],   // Luxray GL LV.X
    'CC018': ['pl3-145',   '145/147'],   // Garchomp C LV.X
    'CC019': ['hgss1-107', '107/123'],   // Donphan
    'CC020': ['bw1-113',   '113/114'],   // Reshiram
    'CC021': ['bw1-114',   '114/114'],   // Zekrom
    'CC022': ['bw4-54',    '54/99'],     // Mewtwo-EX
    'CC023': ['xy1-97',    '97/146'],    // Xerneas-EX
    'CC024': ['xy6-76',    '76/108'],    // M Rayquaza-EX
    'CC025': ['sm2-60',    '60/145']     // Tapu Lele-GX
  }
};

// A card's set id: stated, or read from its {lang}-{setId}-{number} id.
// Never from its set NAME — that is the whole point of this section.
const CARD_ID_PARTS = /^(?:en|ja|zh-tw|zh-cn|ko)-(.+)-([^-]+)$/;
function setIdOf(card) {
  if (!card) return null;
  if (card.setId) return String(card.setId);
  const m = String(card.cardId || card.api_card_id || card.id || '').match(CARD_ID_PARTS);
  return m ? m[1] : null;
}

function familyOfSet(setId) {
  if (!setId) return null;
  return REPRINT_FAMILIES.find(f => f.sets.includes(setId)) || null;
}

// Which families reprinted THIS card? By id: 'base1-4' is reprinted by both
// Celebrations and 30th Celebration. Empty for nearly every card.
function familiesReprinting(card) {
  const set = setIdOf(card);
  if (!set || card.number == null) return [];
  const key = set + '-' + normNum(card.number);
  const out = [];
  for (const rset of Object.keys(REPRINT_OF)) {
    const hit = Object.values(REPRINT_OF[rset]).some(([orig]) => {
      const i = orig.lastIndexOf('-');
      return orig.slice(0, i) + '-' + normNum(orig.slice(i + 1)) === key;
    });
    if (hit) out.push(familyOfSet(rset));
  }
  return out;
}

// The reprint CARDS of this card, as our catalogue ids — what a caller needs
// to fetch the reprint's own listings. 'en-ecard2-149' (Aquapolis Lugia) ->
// [{ cardId: 'en-30th-c-029', family: <30th> }]. Empty for nearly every card.
function reprintCardsOf(card) {
  const set = setIdOf(card);
  if (!set || card.number == null) return [];
  const key = set + '-' + normNum(card.number);
  const lang = cardLanguage(card) || 'en';
  const out = [];
  for (const rset of Object.keys(REPRINT_OF)) {
    for (const [catNum, [orig]] of Object.entries(REPRINT_OF[rset])) {
      const i = orig.lastIndexOf('-');
      if (orig.slice(0, i) + '-' + normNum(orig.slice(i + 1)) !== key) continue;
      out.push({ cardId: `${lang}-${rset}-${catNum}`, family: familyOfSet(rset) });
    }
  }
  return out;
}

// Which family does a LISTING say it is? First match wins, in table order.
// `card` only widens the evidence (saysOnOriginal); it never decides.
function familyNamedBy(title, card) {
  const t = String(title || '');
  // The reprint's own family counts too: "25th Anniversary" on a Celebrations
  // card is that card saying what it is.
  const reprinted = card ? familiesReprinting(card).concat(familyOfSet(setIdOf(card)) || []) : [];
  return REPRINT_FAMILIES.find(f =>
    f.says.some(re => re.test(t)) ||
    (f.saysOnOriginal && reprinted.includes(f) && f.saysOnOriginal.some(re => re.test(t)))
  ) || null;
}

// The original a Classic Collection card reprints, and the number printed on
// it. null for every other card — which is nearly all of them.
function reprintOf(card) {
  const set = setIdOf(card);
  const table = set && REPRINT_OF[set];
  if (!table || card.number == null) return null;
  const want = normNum(card.number);
  const key = Object.keys(table).find(k => normNum(k) === want);
  if (!key) return null;
  const [original, printed] = table[key];
  const [num, tot] = printed.split('/');
  const lang = cardLanguage(card) || 'en';
  return { set, family: familyOfSet(set), originalId: lang + '-' + original,
           number: num, setTotal: tot ? parseInt(tot, 10) : null, printed };
}

// The card as a seller would describe it: a Classic Collection card carries
// its original's number. Everything else passes through untouched.
// ── Black Star Promos (T2, 2026-10-01) ────────────────────────
// A promo card prints NO set total. Our catalogue's set_total for a promo
// set is a count of promos (swshp 307), so every promo was asked for as
// "Sylveon V SWSH202/307 SWSH Black Star Promos" — a string no seller has
// ever written. Measured live: eBay US answered ebayTotal 0 for SWSH202,
// SM01 and SVP 001, with the set name dropped as well; what little a
// query did return, the gate refused on the N/M rule.
//
// Keyed by SET ID, never by name (the REPRINT_FAMILIES rule). Two shapes:
//   prefixed  SWSH202 · SM01 · XY39 · BW01 · DP01 · HGSS01 — the prefix
//             IS the set, so the number alone identifies the card;
//   plain     basep 1 · np 1 · svp 001 · mep 001 — a bare number says
//             nothing about which promo series, so the title must also
//             say "promo" / "black star" (or the series code) and must not
//             name another promo series' code.
const PROMO_SETS = {
  basep: { code: null },  np: { code: null }, miscp: { code: null },
  svp:   { code: 'SVP' }, mep: { code: 'MEP' },
  dpp:   { code: 'DP' },  hgssp: { code: 'HGSS' }, bwp: { code: 'BW' },
  xyp:   { code: 'XY' },  smp: { code: 'SM' },     swshp: { code: 'SWSH' },
};
// Another series' promo number in the title: "SWSH202", "SM 01", "XY-39".
const PROMO_CODE_IN_TITLE = {
  SVP: /\bsvp(?![a-z])/i, MEP: /\bmep(?![a-z])/i,   // "SVP001" as well as "SVP 001"
  DP: /\bdp[\s-]?\d{1,3}\b/i, HGSS: /\bhgss[\s-]?\d{1,3}\b/i, BW: /\bbw[\s-]?\d{1,3}\b/i,
  XY: /\bxy[\s-]?\d{1,3}[a-z]?\b/i, SM: /\bsm[\s-]?\d{1,3}\b/i, SWSH: /\bswsh[\s-]?\d{1,3}\b/i,
};
const PROMO_WORDS = /\bpromos?\b|\bblack\s*star\b/i;
// Other giveaway sets sellers ALSO call "promo", plain-numbered like svp:
// "POKEMON S&V McDonalds *2023* HOLO ... PROMO #001" was kept against SVP
// 001 Sprigatito on the first live run. Each is its own catalogue set.
const NOT_BLACK_STAR = /\bmc\s*donald'?s?\b|\bhappy\s*meal\b|\btrick\s*or\s*treat\b/i;

function promoOf(card) {
  if (!card || reprintOf(card)) return null;
  const id = String(card.cardId || card.api_card_id || card.id || '');
  if (id && !/^en-/.test(id)) return null;           // English catalogue only
  const setId = setIdOf(card);
  const spec = setId && PROMO_SETS[setId];
  if (!spec || !card.number) return null;
  const m = String(card.number).trim().match(/^([A-Za-z]{0,4})0*(\d{1,4})([A-Za-z]?)$/);
  if (!m) return null;
  return { setId, code: spec.code, prefix: m[1].toUpperCase(), digits: m[2],
           suffix: m[3].toLowerCase(), number: String(card.number).trim() };
}

// The promo's own number in a title, as sellers write it: "SWSH202",
// "SWSH 202", "#SWSH-202", "SM01", "SVP 001", "#1".
function promoNumberIn(t, p) {
  const sfx = p.suffix ? p.suffix + '(?![0-9a-z])' : '(?![0-9a-z])';
  if (p.prefix) {
    return new RegExp('(?:^|[^a-z0-9])' + p.prefix + '[\\s#-]*0*' + p.digits + sfx, 'i').test(t);
  }
  // Plain: not inside another number, not a price, not one half of an N/M.
  return new RegExp('(?:^|[^0-9/$€£¥.,])0*' + p.digits + sfx.replace('a-z', '/a-z'), 'i').test(t);
}

function verifyPromoNumber(t, card, grade, p) {
  const pairs = numberPairsIn(t).filter(x => !(p.prefix && x.num === normNum(p.number)));
  if (pairs.length) {
    return { ok: false, reason: 'title has ' + pairs.map(x => x.raw).join(', ') +
      ' — a numbered set card, wanted promo ' + p.number };
  }
  const other = t.match(NOT_BLACK_STAR);
  if (other) {
    return { ok: false, reason: `title names ${other[0]} — another promo set, wanted ${card.setName || p.setId}` };
  }
  if (!promoNumberIn(t, p)) {
    return { ok: false, reason: 'title does not state promo number ' + p.number };
  }
  for (const [code, re] of Object.entries(PROMO_CODE_IN_TITLE)) {
    if (code === p.code) continue;
    // A prefixed series's own code is fine; another series' code is not.
    if (re.test(t)) return { ok: false, reason: `title names a ${code} promo, wanted ${p.number} (${card.setName || p.setId})` };
  }
  if (!p.prefix && !PROMO_WORDS.test(t) && !(p.code && PROMO_CODE_IN_TITLE[p.code].test(t))) {
    return { ok: false, reason: `title has #${p.digits} but does not say promo — could be any set's #${p.digits}` };
  }
  return { ok: true, reason: null, confidence: p.prefix ? 'promo-number' : 'promo-number+word',
           matched: { number: p.number, set: card.setName, grade: grade } };
}

function asPrinted(card) {
  const rp = reprintOf(card);
  if (!rp) return card;
  return Object.assign({}, card, { number: rp.number, setTotal: rp.setTotal,
                                   catalogueNumber: card.number });
}

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
// T1 (2026-09-30): every language named in the languages eBay's European
// sites are written in. A marketplace is where a card is SOLD, a language is
// what the card IS — so a German seller's "Italienisch" is an Italian card,
// exactly as "Italian" is. On eBay DE 78 of 383 added titles were other-
// language cards the English-only list let through ("Italienisch", "ITA",
// "Französisch", "Spanisch", "Portugiesisch", "GER", "Holland"). The words
// for ENGLISH (Englisch, inglese, inglés, anglais) are deliberately absent:
// they are the right answer. Bare "IT", "DE", "ES" are absent too — each is
// an ordinary word in some language ("de" is "of" in three of them).
const LANG_WORDS = {
  ja: /\b(japanese|japan|jpn|jp\b|nihongo|japanische?|japonais|japonaise|giapponese|giapponesi|japon[eé]s|japonesa|japoneses|japonesas)\b/i,
  ko: /\b(korean|korea|kor\b|koreanische?|coréen|coreen|coreano|coreana)\b/i,
  zh: /\b(chinese|china|traditional chinese|simplified chinese|t-chinese|s-chinese|chinesische?|chinois|cinese)\b/i,
  de: /\b(german|deutsch|deutsche|deutsches|ger|allemand|allemande|tedesco|tedesca|tedeschi|tedesche|alem[aá]n|alemana|alemanes|alemanas)\b/i,
  // "VF" is "version française" — how French sellers mark a French card.
  fr: /\b(french|francais|français|française|francaise|vf|franz[öo]sische?|francese|francesi|franc[eé]s|francesa|franceses|francesas)\b/i,
  // Plurals, and the country: eBay ES, live — "Pokémon italianos",
  // "Charizard base set pokemon card 4/102 holo Italia" ($851), both kept.
  it: /\b(italian|italiano|italiana|italianos|italianas|italiani|italiane|italia|ita|italienische?|italien|italienne)\b/i,
  es: /\b(spanish|espanol|español|española|espanola|esp|spanische?|espagnol|espagnole|spagnolo|spagnola)\b/i,
  pt: /\b(portuguese|portugues|português|portugiesische?|portugais|portoghese|portoghesi|portugu[eé]s|portugueses)\b/i,
  // "Olanda" / "Holanda" — eBay ES, live: "Charizard bs4 holo set base Olanda".
  nl: /\b(dutch|nederlands|holland|holländische?|hollandische?|niederländische?|niederlandische?|olandese|olandesi|olanda|holanda|holand[eé]s|holandeses|néerlandais)\b/i,
  ru: /\b(russian|russische?|russe|russo|ruso)\b/i,
  // "Indonesia" and "Bahasa": how sellers actually write it (T1, 2026-09-30).
  // Four Indonesian Mega Dragonite ex MA3 250/193 were kept on the Japanese
  // M2a 250/193 ("Pokemon Indonesia", "Bahasa Indonesia Language") — found
  // by sitecheck.js's independent reader. Across 4,097 kept rows on 13 cards
  // those 4 were the only titles carrying either word.
  id: /\b(indonesian|indonesia|bahasa)\b/i,
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

// Language CODES as European sellers write them, CASE-SENSITIVE (T1,
// 2026-09-30). Read live on eBay DE: "Pikachu & Zekrom-GX … Holo DE 33/181
// 240 KP", "Turtok # 2/102 … DE Near Mint", "Gengar 5/62 | FO | DE | RARE" —
// German cards, kept, because bare "de" is a preposition in three languages
// and was left out. Measured over every title collected (58 distinct with an
// uppercase DE, none from US/GB/AU/CA): the only non-German uses were the
// preposition before its noun — "SET DE BASE", "DE COLECCIÓN", "FUNDA DE
// ARTE" — so those nouns are excluded. "FR" is how French sellers mark a
// French card ("Carte Pokémon FR ED. 2"). "IT" and "ES" are NOT read: "IT"
// is an English word in any all-caps title.
const LANG_CASE_TOKENS = [
  [/(?<![A-Za-z])DE(?![A-Za-z])(?!\s+(?:BASE|COLECCI[OÓ]N|ARTE|CARTAS?|JUEGO|LA|LAS|LOS|EL|UN|UNA)\b)/, 'de'],
  [/(?<![A-Za-z])FR(?![A-Za-z])/, 'fr']
];

// Country flags as language evidence (T1, 2026-09-30, eBay DE/FR). The US
// and UK flags are absent: an English card is the right answer, and a US
// seller's 🇺🇸 is decoration.
const LANG_FLAGS = [
  ['🇩🇪', 'de'], ['🇦🇹', 'de'], ['🇫🇷', 'fr'], ['🇮🇹', 'it'], ['🇪🇸', 'es'], ['🇵🇹', 'pt'],
  ['🇧🇷', 'pt'], ['🇳🇱', 'nl'], ['🇯🇵', 'ja'], ['🇰🇷', 'ko'], ['🇨🇳', 'zh'], ['🇹🇼', 'zh'],
  ['🇮🇩', 'id'], ['🇹🇭', 'th']
];

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
  // A flag is how a European seller states the card's language ("Neo
  // Genesis\ud83c\udde9\ud83c\uddea", "CARTE POKEMON \ud83c\uddeb\ud83c\uddf7"). After the words, so a title that
  // SAYS its language is read by what it says.
  for (const [flag, code] of LANG_FLAGS) if (t.includes(flag)) return code;
  for (const [re, code] of LANG_CASE_TOKENS) if (re.test(t)) return code;
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

// ── Printings — the variant a copy of the card was printed as ─
// Rarity belongs to the CARD; printing belongs to the COPY. Expedition
// Alakazam #1 is Holo Rare printed as holo and as reverse; #33 is Rare
// printed as normal and as reverse — four products, two numbers (TASK T10).
//
// Keys are TCGdex's own words, read from a real response (2026-09-29), not
// its docs: variants_detailed[].type is normal | holo | reverse, and a
// reverse carries `foil` for its pattern — pokeball, masterball, cosmos,
// energy. The `variants` booleans HIDE those patterns (ja SV2a-001 says only
// "reverse: true" for what are the Poké Ball and Master Ball mirrors), so
// the key is `type` + `-` + `foil`. Print RUN (subtype unlimited/shadowless,
// the 1st-edition stamp) is a separate dimension — gradeprice.byPrintRun —
// and size "jumbo" is a different product; neither is a printing.
const PRINTINGS = {
  'normal':             { label: 'Normal (non-holo)' },
  'holo':               { label: 'Holo' },
  'reverse':            { label: 'Reverse Holo' },
  'reverse-pokeball':   { label: 'Poké Ball reverse', jp: 'モンスターボール' },
  'reverse-masterball': { label: 'Master Ball reverse', jp: 'マスターボール' },
  'reverse-cosmos':     { label: 'Cosmos reverse' },
  'reverse-energy':     { label: 'Energy reverse' }
};
// A key TCGdex adds later still gets a readable label rather than vanishing.
function printingLabel(key) {
  if (PRINTINGS[key]) return PRINTINGS[key].label;
  const m = /^reverse-(.+)$/.exec(String(key || ''));
  return m ? 'Reverse (' + m[1] + ')' : String(key || 'unstated');
}

// What a TITLE says about its printing: { key, stated, said }.
//
// THE MASTER BALL TRAP — the tag/ace lesson again. "Master Ball" and "Poké
// Ball" are pattern words AND card names: "Master Ball ACE SPEC 153/167" is
// the Master Ball card, not a Master Ball mirror of something. So the card's
// OWN name is removed from the title before any pattern word is read, the
// way GENUINE_ART_PHRASES protects "Alt Art Card" from `art card`.
//
// Order matters: a pattern before "reverse" ("Poke Ball Reverse Holo" is
// the pattern), "reverse" before "holo" ("Reverse Holo" is not Holo), and
// "non-holo" before "holo".
const PRINTING_WORDS = [
  ['reverse-masterball', /\bmaster\s*-?\s*ball\b|マスターボール/i],
  ['reverse-pokeball',   /\bpoke\s*-?\s*ball\b|モンスターボール/i],
  ['reverse-cosmos',     /\bcosmos\s*(?:holo|foil|reverse)?\b/i],
  ['reverse',            /\breverse\b|\brev\.?\s*holo\b|ミラー/i],
  ['normal',             /\bnon[\s-]*(?:holo|foil)\b/i],
  ['holo',               /\bholo(?:foil|graphic)?\b|キラ/i]
];
// NFKD to drop Latin accents (Poké -> Poke), then NFC to RECOMPOSE kana:
// NFKD splits ボ into ホ + a combining dakuten, and a composed pattern like
// マスターボール can then never match — measured, "マスターボールミラー" read
// as a bare mirror until this recomposed.
function foldPrintingText(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC')
    .toLowerCase().replace(/[’'`]/g, '');
}
function printingKeysOf(card) {
  const p = card && card.printings;
  return Array.isArray(p) && p.length ? p : null;       // null = not yet read
}
function printingClaim(title, card) {
  let t = foldPrintingText(title);
  // The card's own name out first — every spelling a seller uses for it.
  for (const n of [card && card.name, card && card.nameEn]) {
    const f = foldPrintingText(n).replace(/\b(?:ex|gx|v|vmax|vstar)\b/g, '').trim();
    if (f.length < 3) continue;
    const loose = f.replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '\\s*-?\\s*');
    t = t.replace(new RegExp(loose, 'gi'), ' ~ ');
  }
  for (const [key, re] of PRINTING_WORDS) {
    const m = t.match(re);
    if (m) {
      // A bare "holo" on a card with NO holo printing but a reverse one is
      // the seller's word for the reverse: Expedition Alakazam #33 exists
      // only as normal and reverse, so "33/165 Holo" is the reverse.
      const keys = printingKeysOf(card);
      if (key === 'holo' && keys && !keys.includes('holo') && keys.includes('reverse')) {
        return { key: 'reverse', stated: true, said: m[0], reading: 'holo on a card with no holo printing' };
      }
      return { key, stated: true, said: m[0] };
    }
  }
  return { key: null, stated: false, said: null };
}
// Refuse only a STATED different printing. Silence is kept and marked
// unstated — as raw conditions are — never assumed to be the one asked for.
function printingRefusal(claim, want, card) {
  if (!want || !claim || !claim.key || claim.key === want) return null;
  const keys = printingKeysOf(card);
  // "Mirror" / "reverse holo" with no pattern, on a card whose only
  // reverses ARE patterns (JP SV2a: pokeball + masterball): ambiguous, not
  // a conflict. Unknown printings -> also not a conflict.
  if (claim.key === 'reverse' && want.startsWith('reverse-') && (!keys || !keys.includes('reverse'))) return null;
  return `title says ${printingLabel(claim.key)} ("${claim.said}"), wanted ${printingLabel(want)} — a different printing`;
}
// A printing key as asked for in a request: a known key or reverse-<word>.
// ── Edition (print run) — TASK T3, 2026-09-30 ─────────────────
// A 1st Edition Base Set Charizard and an Unlimited one are different
// products at very different prices; averaging them describes neither. The
// same argument as holo vs reverse, on an independent axis: a card can be
// 1st Edition AND reverse, so this never folds into PRINTINGS.
//
// WHERE editions exist is gradeprice.printRunsFor — the ten English sets
// TCGdex counts first-edition cards in, Base Set to Neo Destiny, plus
// Shadowless on Base Set. This module only reads what a TITLE states.
//
// The words, as sellers on every site write them: "1st Edition", German
// "1. Edition" / "Erste Edition", Italian "Prima Edizione" / "1° Edizione",
// Spanish "1ª Edición", French "Édition 1" / "ED1". French "Édition 2" /
// "ED2" is UNLIMITED — measured on eBay FR: "Set de Base Édition 2".
// "4th Print" (the 1999-2000 UK print run) is an Unlimited print.
const EDITIONS = { '1st-edition': '1st Edition', 'shadowless': 'Shadowless', 'unlimited': 'Unlimited' };
const EDITION_WORDS = [
  ['1st-edition', /\b1st\s*ed(?:ition|\.)?(?![a-z])|\bfirst\s*ed(?:ition)?\b|(?:^|[\s(|,\/-])1\.?\s*(?:edition|ed\.|auflage)\b|\berste\s+(?:edition|auflage)\b|\bprima\s+edizione\b|\bprimera\s+edici[oó]n|\bpremi[eè]re\s+[ée]dition|(?:^|[\s(|,\/-])1\s*[ªa°º]\s*(?:edizione|edici[oó]n|[ée]dition)|[ée]dition\s*1(?!\d)|\bed\.?\s*1(?!\d)|\b1(?:ère|ere|re)\s+[ée]dition/i],
  ['shadowless', /\bshadowless\b|\bohne\s+schatten\b|\bsenza\s+ombra\b|\bsin\s+sombra\b/i],
  ['unlimited', /\bunlimited\b|\bunlimitiert\b|\billimitat[oa]\b|\bilimitad[oa]\b|\b4th\s*print\b|[ée]dition\s*2(?!\d)|\bed\.?\s*2(?!\d)|\b2(?:nde|nd|e)\s+[ée]dition/i]
];
// "not 1st edition", "no shadowless", "kein 1. Edition": a statement about
// what the card is NOT is removed before anything is read.
const EDITION_NEGATION = /\b(?:not|no|non|kein|keine|nicht|pas)\s+(?:a\s+|an\s+|la\s+|une\s+)?(?:1st|first|shadowless|prima|erste|1\.|1[ªa°º])(?:\s*(?:ed(?:ition|izione)?|edici[oó]n|[ée]dition))?/gi;
function editionClaim(title) {
  const t = String(title || '').replace(EDITION_NEGATION, ' ');
  for (const [key, re] of EDITION_WORDS) if (re.test(t)) return { key, stated: true };
  return { key: null, stated: false };
}
function editionLabel(key) { return EDITIONS[key] || key || null; }
function parseEditionParam(p) {
  const k = String(p || '').trim().toLowerCase();
  if (!k || k === 'all') return null;
  return EDITIONS[k] ? k : null;
}
// The gate: refuse only a title that STATES another edition. Silence is
// kept and labelled unstated — on Base Set most titles say nothing, and a
// filter that dropped them would hide the market.
function editionRefusal(claim, want) {
  if (!want || !claim || !claim.stated || claim.key === want) return null;
  return `title states ${editionLabel(claim.key)}, asked for ${editionLabel(want)} — a different print run`;
}

function parsePrintingParam(p) {
  const k = String(p || '').trim().toLowerCase();
  if (!k || k === 'all') return null;
  return (PRINTINGS[k] || /^reverse-[a-z]+$/.test(k)) ? k : null;
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
  // A Classic Collection card is asked for by its printed number and its
  // family's name ("Lugia 149/147 30th Celebration"): sellers write "30th
  // Celebration CC", rarely the full set name, and eBay needs every word.
  const rp = reprintOf(card);
  // Reprint families a deep link excludes: on an original, every family that
  // reprinted it; on a reprint, the other families that reprinted its
  // original. Read before asPrinted rewrites the number.
  const reprintMinus = [];
  if (opts.forLink) {
    const orig = rp ? { cardId: rp.originalId, number: rp.number } : card;
    for (const f of familiesReprinting(orig)) {
      if (rp && f === rp.family) continue;
      for (const t of (rp ? f.linkMinusFromReprint : f.linkMinus) || []) {
        if (!reprintMinus.includes(t)) reprintMinus.push(t);
      }
    }
  }
  card = asPrinted(card);
  if (rp) card = Object.assign({}, card, { setName: rp.family.ask });
  const bits = [];
  const name = card.nameEn || card.name || '';
  if (name) bits.push(name);

  const promo = promoOf(card);
  if (promo) {
    // The number as printed, no total; a plain number also says "promo",
    // since "Pikachu 1" alone is every set's #1. The set name is not asked:
    // sellers write "Promo" or "Black Star Promo", rarely "SWSH Black Star
    // Promos" — measured, ebayTotal 0 with it and without the total too.
    bits.push(promo.number);
    if (!promo.prefix) bits.push('promo');
  } else if (card.number) {
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
  if (card.setName && !promo && !CJK.test(String(card.setName))) bits.push(card.setName);

  const g = parseGrade(grade);
  if (g.kind === 'graded') {
    // Grader-wide asks for the COMPANY only — one call, not one per grade.
    // "Charizard 4/102 Base Set PSA pokemon" returns PSA slabs at every
    // grade and the gate sorts out which; ten queries would spend ten of a
    // 5,000/day quota on one card view.
    if (g.anyGrade) bits.push(g.grader);
    // The qualifier goes IN the query. A Black Label seller always writes
    // it — it is most of the price — so asking for it surfaces them,
    // whereas asking for a bare "BGS 10" returns ordinary tens that the
    // gate then rejects one by one.
    else bits.push(g.grader + ' ' + g.grade + (g.qualifier ? ' ' + g.qualifier : ''));
  }

  // A condition eBay has no value for is ASKED as the seller's own word, so
  // the search itself narrows to it (see TITLE_ONLY_CONDITIONS). Every
  // marketplace link asks it too — one question, wherever it is sent.
  const tOnly = titleOnlyCondition(grade);
  if (tOnly) bits.push(tOnly.term);

  // A printing asked for is asked of the marketplace too (TASK T10) — the
  // 225-row cap otherwise fills with the base printing before a reverse is
  // reached. Normal and holo add nothing: sellers rarely write "normal", and
  // "holo" is on half of every holo-only chase card's titles anyway.
  const PRINTING_TERMS = { 'reverse': 'reverse holo', 'reverse-pokeball': 'poke ball',
                           'reverse-masterball': 'master ball', 'reverse-cosmos': 'cosmos' };
  if (opts.printing && PRINTING_TERMS[opts.printing]) bits.push(PRINTING_TERMS[opts.printing]);
  // An edition asked for is asked of the marketplace too (TASK T3) — on a
  // busy Base Set card the 1st Edition rows are a small, expensive slice.
  // Unlimited adds nothing: sellers rarely write it, and asking would drop
  // every silent title.
  const EDITION_TERMS = { '1st-edition': '1st edition', 'shadowless': 'shadowless' };
  if (opts.edition && EDITION_TERMS[opts.edition]) bits.push(EDITION_TERMS[opts.edition]);

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
    // A reprint is the next expensive mistake after a wrong grade: Aquapolis
    // Lugia ~$400, its 30th reprint a fraction of that.
    for (const term of gradeMinus.concat(reprintMinus, langMinus, junkMinus)) {
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
  // Our side is a set id; only the listing's side is words.
  const ourSet = String(card.setName || '');
  const ourFamily = familyOfSet(setIdOf(card));
  const named = familyNamedBy(t, card);
  if (named && named !== ourFamily) {
    return `title is a ${named.label} reprint, which reuses this numbering — ` +
           `wanted ${ourSet || 'the original set'}`;
  }

  // ...and the other direction. A Classic Collection card shares its number
  // with an original that is usually worth far more, and a title for the
  // original names no reprint — so silence is NOT neutral here the way it
  // is everywhere else in this gate. The listing has to say it is the
  // reprint, by the family's words or by the reprint's own year.
  const rp = reprintOf(card);
  if (rp && !named) {
    const ys = yearsIn(t);
    const saysOurYear = ys.some(y => Math.abs(y - rp.family.year) <= 1);
    if (!saysOurYear) {
      return `title does not say it is the ${rp.family.label} reprint — ` +
             `${rp.printed} is also ${rp.originalId}, the original`;
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
  // The reprint check reads the set ID. Without one, our card is treated as
  // belonging to no reprint family — so a reprint card would reject its own
  // listings. Say so rather than let that pass for "nothing matched".
  const setId = setIdOf(card);
  const rp = reprintOf(card);
  const unchecked = [];
  if (!language) unchecked.push('language');
  if (!year) unchecked.push('year');
  if (!setId) unchecked.push('reprint set');
  return { language, year, setName, setId,
           reprintOf: rp ? { originalId: rp.originalId, printed: rp.printed } : null,
           unchecked };
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
  // Printing (TASK T10): every verdict says what the title claimed, so kept
  // rows can be grouped stated / unstated. Only opts.printing refuses.
  const claim = printingClaim(title, card);
  r.printing = claim.key;
  r.printingStated = claim.stated;
  if (r.ok && opts && opts.printing) {
    const why = printingRefusal(claim, opts.printing, card);
    if (why) { r.ok = false; r.reason = why; r.printingConflict = true; }
  }
  // Edition (TASK T3): the same rule on its own axis — every verdict says
  // what the title stated; only opts.edition refuses.
  const ed = editionClaim(title);
  r.edition = ed.key;
  r.editionStated = ed.stated;
  if (r.ok && opts && opts.edition) {
    const why = editionRefusal(ed, opts.edition);
    if (why) { r.ok = false; r.reason = why; r.editionConflict = true; }
  }
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

  // From here on the card is compared as PRINTED: a 30th Classic Collection
  // Lugia is "149/147" on the card and in every title, not our "029".
  card = asPrinted(card);

  // 2. Grade must match exactly — grader AND number
  const found = gradesIn(t);
  let gradeSource = found.length ? 'title' : null;
  let anyHit = null;
  // Every accepting return goes through here, so the grade and where it came
  // from ride on the verdict whichever branch accepted.
  const accept = r => Object.assign(r, anyHit || {}, gradeSource ? { gradeSource } : {});
  if (want.kind === 'graded') {
    // ── eBay's own grader + grade, where the search was filtered on them ──
    // Honoured only when it is exactly what was asked (the filter is ours).
    // Two seller-typed sources, neither authoritative: WHERE THEY DISAGREE,
    // REFUSE. Where the title is silent, the field answers — but only for a
    // specific grade, and never for a signed card, whose "Auto 10" is an
    // autograph grade (measured: "PSA/DNA Auto 10 … SIGNED" under PSA | 10).
    const sg = opts && opts.structuredGrade;
    if (sg && sg.grader === want.grader && (want.anyGrade ? !sg.grade : sg.grade === want.grade)) {
      const claims = titleGradeClaims(t);
      const clash = claims.find(c => c.grader !== sg.grader || (sg.grade && c.grade !== sg.grade));
      if (clash) {
        return { ok: false, reason: `title says ${clash.grader} ${clash.grade}, eBay's grade fields say ` +
          `${sg.grader} ${sg.grade || '(any)'} — they disagree and neither is authoritative`, gradeConflict: true };
      }
      if (!found.length && sg.grade) {
        const other = GRADERS_UNAMBIGUOUS.find(co => co !== sg.grader && new RegExp(graderToken(co), 'i').test(t));
        if (other) {
          return { ok: false, reason: `title names ${other}, eBay's grader field says ${sg.grader} — refused`,
                   gradeConflict: true };
        }
        // A hoped-for grade is the title saying the card is UNGRADED — a
        // disagreement, not silence. Measured live after deploy: "1999 Base
        // Set Charizard 4/102 (PSA 10 Contender)", $6,100, arrived under the
        // PSA | 10 filter; stripSpeculative removed the phrase, the title then
        // looked silent, and the field kept it as a PSA 10 (real: ~$250,000).
        if (stripSpeculative(t) !== t) {
          return { ok: false, gradeConflict: true, reason: `title speculates about a grade ("contender"/"pot") — ` +
            `it says the card is ungraded; eBay's grade fields say ${sg.grader} ${sg.grade}` };
        }
        if (/\b(?:auto(?:graph(?:ed)?)?|signed|dna)\b/i.test(t)) {
          return { ok: false, reason: `title states no grade and mentions an autograph — eBay's ` +
            `"${sg.grader} ${sg.grade}" may grade the signature, not the card` };
        }
        gradeSource = claims.length ? 'title+ebay' : 'ebay';
        found.push({ grader: sg.grader, grade: sg.grade, structured: true });
      } else if (found.length) {
        gradeSource = 'title+ebay';
      }
    }
    if (!found.length) {
      return { ok: false, reason: `wants ${want.grader} ${want.anyGrade ? 'any grade' : want.grade}` +
        ', title states no grade' };
    }

    // ── Grader-wide ("PSA *") ──
    // Accept ANY grade from this grader, and refuse every other grader.
    // Raw is already refused by the "title states no grade" branch above.
    if (want.anyGrade) {
      const mine   = found.filter(f => f.grader === want.grader);
      const theirs = found.filter(f => f.grader !== want.grader);
      if (!mine.length) {
        return { ok: false, reason: `wants any ${want.grader} grade, title has ` +
          found.map(f => f.grader + ' ' + f.grade).join(', ') };
      }
      // A title naming a second COMPANY is ambiguous — "PSA 10 / BGS 9.5"
      // is one slab in one holder and we cannot tell which. Two grades from
      // the SAME grader ("PSA 10 PSA 10") is just a repeated token.
      if (theirs.length) {
        return { ok: false, reason: 'title names more than one grading company: ' +
          found.map(f => f.grader + ' ' + f.grade).join(', ') };
      }
      // NOT a return. This used to return ok here — before the name,
      // number and set checks below ever ran — so in "PSA + All" mode any
      // PSA slab of ANY card passed: "Pikachu 58/102 Base Set PSA 9" was
      // kept as Base Set Charizard (found 2026-09-27). The grade is settled;
      // the card still has to be the card.
      anyHit = { grade: want.grader + ' ' + mine[0].grade, qualifiers: qualifiersIn(t, want.grader) };
    }

    // The specific-grade checks. Grader-wide mode settled its grade above.
    if (!want.anyGrade) {
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

    // ── The qualified ten ──
    // Both directions matter, and the asymmetry is deliberate.
    //
    // Asking FOR a qualifier requires the title to state it: a Black Label
    // seller always says so, because it is most of the price.
    //
    // Asking for a PLAIN 10 refuses a title that states a qualifier — an
    // ordinary BGS 10 list must not be led by a Black Label at several
    // times the money. But CGC's ordinary 10 is branded "Gem Mint", so
    // that qualifier is not evidence of anything unusual and never
    // excludes.
    const stated = qualifiersIn(t, want.grader);
    if (want.grade === '10') {
      if (want.qualifier) {
        if (!stated.includes(want.qualifier)) {
          return { ok: false, reason: `wants ${want.grader} 10 ${want.qualifier}, ` +
            (stated.length ? 'title states ' + stated.join(', ')
                           : 'title states no qualifier — an ordinary 10') };
        }
      } else {
        const premium = stated.filter(q => q !== 'GEM MINT');
        if (premium.length) {
          return { ok: false, reason: `wants an ordinary ${want.grader} 10, ` +
            `title states ${premium.join(', ')} — a different grade` };
        }
      }
    }
    }   // !want.anyGrade
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

  // 4. Collector number — the strongest signal available. A promo prints
  //    no set total, so it has its own rule (T2, PROMO_SETS above).
  const promo = promoOf(card);
  if (promo) {
    const v = verifyPromoNumber(t, card, grade, promo);
    return v.ok ? accept(v) : v;
  }
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
    return accept({ ok: true, reason: null, confidence: 'number+total',
             matched: { number: exact.raw, grade: grade } });
  }

  // 5. No N/M pair. Accept only with a bare number AND the set name —
  //    either alone is too weak. "Charizard #4" appears in many sets.
  // Not after a currency sign: "Champion's Path $74 PSA 10" states a PRICE,
  // and read as #74 it passed for Charizard VMAX #74 (T9, 2026-09-29; 0 of
  // 516 kept production titles carry a currency sign before a number).
  const bareNum = new RegExp('(?:^|[^0-9/$€£¥])0*' + wantNum + '(?![0-9/])').test(t);
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
    return accept({ ok: true, reason: null, confidence: 'number+setname',
             matched: { number: wantNum, set: card.setName, grade: grade } });
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
  qualifiersIn, sellerCondition, stripHitPoints,
  EBAY_CARD_CONDITION, EBAY_CONDITION_CODES, ebayConditionFilter, EBAY_SITE_ASPECTS, siteAspects,
  TITLE_ONLY_CONDITIONS, titleOnlyCondition,
  EBAY_GRADER, ebayGradeFilter, titleGradeClaims,
  GRADE_QUALIFIERS, RAW_CONDITIONS, RAW_CONDITION_PATTERNS,
  printingEvidence,
  languageOf, cardLanguage, languageFromCardId, namesAConflictingSet, printingConflict,
  GRADERS, GRADERS_UNAMBIGUOUS, GRADERS_AMBIGUOUS, SLAB_GENERIC,
  SLAB_WORDS, NOT_A_SINGLE_CARD, NOT_A_SINGLE_CARD_TERMS,
  SET_NAME_PHRASES, GENUINE_ART_PHRASES, boundedTerm,
  REPRINT_FAMILIES, REPRINT_OF, setIdOf, familyOfSet, familyNamedBy, familiesReprinting, reprintCardsOf,
  reprintOf, asPrinted,
  PROMO_SETS, promoOf, promoNumberIn,
  PRINTINGS, printingLabel, printingClaim, printingRefusal, parsePrintingParam,
  EDITIONS, editionClaim, editionLabel, editionRefusal, parseEditionParam,
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
