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

// ── Grades ────────────────────────────────────────────────────
const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC', 'TAG', 'ACE', 'AGS', 'ARS', 'GMA', 'HGA'];

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
    .replace(new RegExp('\\b(' + GRADERS.join('|') + ')\\s*[-:]?\\s*(?:10|[1-9](?:\\.5)?)\\s*(?:' +
      'contender|candidate|potential|pot\\.?\\??|worthy|ready|hopeful)\\b', 'gi'), ' ');
}

// Find every grader+number in a title. Boundary-checked, so BGS 9 does
// not match "BGS 9.5" — a half grade sells well above a whole one.
function gradesIn(title) {
  const out = [];
  const t = stripSpeculative(title);
  for (const co of GRADERS) {
    const re = new RegExp('\\b' + co + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.])', 'gi');
    let m;
    while ((m = re.exec(t))) out.push({ grader: co, grade: m[1] });
  }
  return out;
}

// Words meaning "this is in a slab", used to reject slabs from raw searches
const SLAB_WORDS = /\b(psa|bgs|cgc|sgc|tag|ace|ags|ars|gma|hga|graded|slab|slabbed|gem\s*mint|gem\s*mt|pristine|black\s*label)\b/i;

// Multi-card listings, sealed product, and anything that is not one card
const NOT_A_SINGLE_CARD = /\b(lot|lots|bundle|set of|collection|binder|album|booster|box|pack|packs|tin|etb|elite trainer|sealed|case|proxy|proxies|custom|fake|repl(ica)?|proxy|orica|proxi|metal card|gold card replica|sticker|jumbo|oversized|playmat|sleeve|deck box|toploader)\b/i;

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
const REPRINT_MARKERS = [
  { re: /\bcelebrations?\b/i,        set: /celebrat/i,           label: 'Celebrations' },
  { re: /\bclassic collection\b/i,   set: /classic collection/i, label: 'Classic Collection' },
  { re: /\blegendary collection\b/i, set: /legendary/i,          label: 'Legendary Collection' }
];

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

  if (card.setName) bits.push(card.setName);

  const g = parseGrade(grade);
  if (g.kind === 'graded') bits.push(g.grader + ' ' + g.grade);

  if (opts.suffix !== false) bits.push('pokemon');

  return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// ── Verification ──────────────────────────────────────────────
// Returns { ok, reason, confidence, matched:{} }
function verify(title, card, grade, opts) {
  opts = opts || {};
  const t = String(title || '');
  if (!t) return { ok: false, reason: 'no title' };

  const lower = t.toLowerCase();
  const want = parseGrade(grade);

  // 1. Not a single card at all.
  //    Legitimate set names containing lot vocabulary are removed first, so
  //    "Classic Collection" is not read as a bundle.
  const tForLot = t.replace(SET_NAME_PHRASES, ' ');
  if (NOT_A_SINGLE_CARD.test(tForLot)) {
    return { ok: false, reason: 'not a single card: ' +
      (tForLot.match(NOT_A_SINGLE_CARD) || [])[0] };
  }

  // 1b. A reprint set that reuses this card's numbering.
  //     Checked BEFORE the number, because the number will match — that is
  //     the whole problem. See REPRINT_MARKERS.
  const ourSet = String(card.setName || '');
  for (const rp of REPRINT_MARKERS) {
    if (rp.re.test(t) && !rp.set.test(ourSet)) {
      return { ok: false, reason:
        `title is a ${rp.label} reprint, which reuses this numbering — ` +
        `wanted ${ourSet || 'the original set'}` };
    }
  }

  // 1c. Year conflict. Only ever rejects on stated evidence: a title with no
  //     year is not rejected, because absence is not a mismatch. If a title
  //     states years and NONE of them is within a year of the set's release,
  //     it is a different printing.
  if (card.setYear) {
    const ys = yearsIn(t);
    if (ys.length && !ys.some(y => Math.abs(y - card.setYear) <= 1)) {
      return { ok: false, reason:
        `title says ${ys.join('/')}, this set is from ${card.setYear} — a different printing` };
    }
  }

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
  normNum, numberPairsIn, gradesIn, parseGrade, yearsIn,
  GRADERS, SLAB_WORDS, NOT_A_SINGLE_CARD, SET_NAME_PHRASES, REPRINT_MARKERS
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
if (typeof window !== 'undefined') window.CardMatch = API;
