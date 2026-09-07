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

// Find every grader+number in a title. Boundary-checked, so BGS 9 does
// not match "BGS 9.5" — a half grade sells well above a whole one.
function gradesIn(title) {
  const out = [];
  for (const co of GRADERS) {
    const re = new RegExp('\\b' + co + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.])', 'gi');
    let m;
    while ((m = re.exec(title))) out.push({ grader: co, grade: m[1] });
  }
  return out;
}

// Words meaning "this is in a slab", used to reject slabs from raw searches
const SLAB_WORDS = /\b(psa|bgs|cgc|sgc|tag|ace|ags|ars|gma|hga|graded|slab|slabbed|gem\s*mint|gem\s*mt|pristine|black\s*label)\b/i;

// Multi-card listings, sealed product, and anything that is not one card
const NOT_A_SINGLE_CARD = /\b(lot|lots|bundle|set of|collection|binder|album|booster|box|pack|packs|tin|etb|elite trainer|sealed|case|proxy|proxies|custom|fake|repl(ica)?|proxy|orica|proxi|metal card|gold card replica|sticker|jumbo|oversized|playmat|sleeve|deck box|toploader)\b/i;

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

  // 1. Not a single card at all
  if (NOT_A_SINGLE_CARD.test(t)) {
    return { ok: false, reason: 'not a single card: ' +
      (t.match(NOT_A_SINGLE_CARD) || [])[0] };
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
    // Raw: reject anything that says it is slabbed
    if (SLAB_WORDS.test(t)) {
      return { ok: false, reason: 'wants raw, title indicates a graded slab: ' +
        (t.match(SLAB_WORDS) || [])[0] };
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
  normNum, numberPairsIn, gradesIn, parseGrade,
  GRADERS, SLAB_WORDS, NOT_A_SINGLE_CARD
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
