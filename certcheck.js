// ══════════════════════════════════════════════════════════════
// certcheck.js — is the cert number on a PSA listing real, and does it
// name this card at this grade?  ON DEMAND ONLY.
//
// Measured 2026-09-28 (/api/ebay/certprobe): the cert number is absent from
// titles (0 of 829) and search summaries, is not a search filter, and is on
// 183 of 232 genuine slabs (78.9%) via getItem — ONE eBay call per listing.
// So it is spent only when a person presses Verify on a row. Never on page
// load, never for a whole list.
//
// The flow:
//   1. eBay getItem on that listing  -> the cert number the SELLER entered
//   2. our cert store                -> seen this grader + number before?
//   3. PSA GetByCertNumber           -> only for a number never seen
//   4. compare PSA's card, grade and year with the card and grade viewed
//
// Steps 2-4 are NOT BUILT. PSA's limit (the 429 "100 per Day" reply came
// keyless, on the first request ever sent from this IP, so it says nothing
// about a keyed limit) and its storage terms are unanswered, and building
// against an assumed limit or assumed storage rights is the mistake this
// project has made before. Until then the answer stops at step 1 and says so.
//
// ── TWO STORES THAT LOOK LIKE ONE, AND MUST NOT BE MERGED ──
//
//   eBay: listing -> cert number.   15 MINUTES, IN MEMORY, NEVER PERSISTED.
//     It is eBay's data about a live listing, and eBay's terms allow serving
//     it for a request, not retaining it (the same rule that keeps every eBay
//     row out of price_history). A seller can also edit the number, or the
//     listing can end — it is not a fact about the slab.
//
//   PSA: grader + cert number -> card, grade, year.   PERMANENT (once built).
//     A cert's card and grade are fixed when the slab is sealed and can never
//     change, so each number is looked up once, ever. That is what makes PSA's
//     daily limit affordable. Keyed on grader + number, NEVER on the eBay item.
//     Subject to PSA's storage terms — unread until Roy has the answer.
//
// The next person will be tempted to cache "the verification result" per
// listing. Don't: that stores eBay's link past its 15 minutes AND ties PSA's
// permanent answer to a listing that will vanish. Two keys, two lifetimes.
//
// What a check can prove: the NUMBER exists in PSA's records and names this
// card at this grade. It cannot prove the seller holds that slab — anyone can
// type a real cert number. The badge says what it checked, never "trusted".
// ══════════════════════════════════════════════════════════════

// ── Step 1 — what the seller entered, from eBay's getItem ──
// Descriptor names as eBay returns them (live, 2026-09-28):
//   {"name":"Professional Grader","values":[{"content":"Professional Sports Authenticator (PSA)"}]}
//   {"name":"Grade","values":[{"content":"9"}]}
//   {"name":"Certification Number","values":[{"content":"170514194"}]}
// A slab with no number simply has no third descriptor — measured on the
// same Base Set Charizard search, one of two.
function descriptorValue(item, name) {
  const d = ((item && item.conditionDescriptors) || []).find(x => x && x.name === name);
  if (!d) return null;
  const v = (d.values || [])[0];
  if (v == null) return null;
  const s = String(typeof v === 'object' ? (v.content ?? v.value ?? '') : v).trim();
  return s || null;
}

// eBay's grader names are long-form; ours are the short codes.
const GRADER_CODES = [
  [/professional sports authenticator|\bpsa\b/i, 'PSA'],
  [/beckett|\bbgs\b|\bbvg\b/i, 'BGS'],
  [/certified guaranty|\bcgc\b/i, 'CGC'],
  [/sportscard guaranty|\bsgc\b/i, 'SGC'],
  [/technical authentication|\btag\b/i, 'TAG'],
];
function graderCode(s) {
  if (!s) return null;
  for (const [re, code] of GRADER_CODES) if (re.test(s)) return code;
  return 'OTHER';
}

// Cert shapes measured on real descriptors: PSA 8-9 digits.
// A number outside the shape is still reported, never "corrected".
const CERT_SHAPE = { PSA: /^\d{8,9}$/ };

function readCert(item) {
  const graderRaw = descriptorValue(item, 'Professional Grader');
  const grader = graderCode(graderRaw);
  const grade = descriptorValue(item, 'Grade');
  const certRaw = descriptorValue(item, 'Certification Number');
  const cert = certRaw ? certRaw.replace(/\s+/g, '') : null;
  const shape = CERT_SHAPE[grader];
  return {
    grader, graderRaw, grade, cert,
    certLooksValid: cert && shape ? shape.test(cert) : null
  };
}

// ── The four states the badge may show, plus the honest interim one ──
//   not-checked   nobody has pressed Verify              (page only)
//   no-cert       the seller entered no number
//   entered       a number was entered; NOT yet checked against PSA
//   verified      PSA's record names this card at this grade   (needs step 3)
//   mismatch      the cert names a different card or grade      (needs step 3)
// `entered` exists because steps 2-4 are not built: a number read from a
// listing proves nothing, and must never be drawn like `verified`.
function stateFromEbay(read, wantGrader) {
  if (!read.cert) return {
    state: 'no-cert',
    says: read.grader && read.grader !== 'OTHER'
      ? `The seller entered no ${read.grader} cert number on this listing.`
      : 'The seller entered no cert number on this listing.'
  };
  if (wantGrader && read.grader && read.grader !== wantGrader) return {
    state: 'entered',
    says: `The listing names ${read.graderRaw || read.grader} as the grader, cert ${read.cert}. ` +
          `Only PSA certs can be checked.`
  };
  return {
    state: 'entered',
    says: `${read.grader || 'Cert'} ${read.cert}${read.grade ? `, grade ${read.grade}` : ''} — ` +
          `as the SELLER entered it on eBay. Not yet checked against PSA's records.`
  };
}

// A link for the person's OWN browser — PSA's public cert page. We never
// fetch it: it serves a Cloudflare challenge to a script (measured
// 2026-09-28, 403 "Just a moment..."), and scraping a cert page is off the
// table regardless. Built only from a number that passed the shape check.
function psaCertUrl(cert) {
  return CERT_SHAPE.PSA.test(String(cert || '')) ? 'https://www.psacard.com/cert/' + cert : null;
}

// ── eBay's listing -> cert link: 15 minutes, in memory, never persisted ──
const EBAY_ITEM_TTL_MS = 15 * 60 * 1000;
const ebayItemCert = new Map();         // itemId -> { at, read }
function ebayCacheGet(itemId, now = Date.now()) {
  const hit = ebayItemCert.get(itemId);
  if (!hit) return null;
  if (now - hit.at >= EBAY_ITEM_TTL_MS) { ebayItemCert.delete(itemId); return null; }
  return hit;
}
function ebayCacheSet(itemId, read, now = Date.now()) {
  ebayItemCert.set(itemId, { at: now, read });
  if (ebayItemCert.size > 5000) {           // bound memory; oldest first
    for (const [k, v] of ebayItemCert) if (now - v.at >= EBAY_ITEM_TTL_MS || ebayItemCert.size > 4000) ebayItemCert.delete(k);
  }
}

// ── PSA: grader + number -> record. PERMANENT once built. NOT BUILT. ──
// Deliberately no table, no fetch and no assumed response shape: all three
// depend on PSA's answer about keys, limits and storage.
function psaLookup(/* cert */) {
  return { built: false,
    reason: 'PSA lookup not built yet: waiting on a PSA API key and PSA’s answer on daily limits and storage rights.' };
}

// Browse item ids look like v1|167236883977|0. Anything else is refused
// before a call is spent — the id is caller-supplied.
const ITEM_ID = /^v1\|\d{6,20}\|\d{1,20}$/;

module.exports = { readCert, graderCode, stateFromEbay, psaCertUrl, psaLookup,
                   ebayCacheGet, ebayCacheSet, EBAY_ITEM_TTL_MS, ITEM_ID, CERT_SHAPE };
