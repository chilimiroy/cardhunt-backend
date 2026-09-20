/**
 * ══════════════════════════════════════════════════════════════
 * yuyutei.js — Japanese shop prices from yuyu-tei.jp
 *
 * Yahoo Auctions tops out around 15% coverage of our Japanese catalogue:
 * most cheap cards never reach auction as a single lot. Yuyu-tei is a
 * large Japanese card shop that lists a price for essentially every card
 * it stocks, including the commons, which is where the gap is.
 *
 * ⚠ THESE ARE ASKING PRICES, NOT SALE PRICES.
 * A shop's sell price carries a retail margin. Measured against our
 * Yahoo medians over 94 overlapping SV8a cards, the median ratio is
 * 1.40x and the spread is tight (1.17-1.81) — consistent, not random,
 * which is itself good evidence both sources are pricing the same cards.
 * They are stored as `yuyutei_shop` so the distinction survives into the
 * UI and nothing can mistake one for a realised sale.
 *
 * Lives outside ingest.js on purpose — a downloaded ingest.js reverted a
 * whole filter subsystem once. See CLAUDE.md.
 *
 * Probed and verified 2026-08-29:
 *   set page      https://yuyu-tei.jp/sell/poc/s/{code}     one fetch = whole set
 *   card page     https://yuyu-tei.jp/sell/poc/card/{code}/{cid}
 *   set index     https://yuyu-tei.jp/sell/poc/s/search?... (vers[] checkboxes)
 *   HTTP 200, no Cloudflare challenge, no login required.
 * ══════════════════════════════════════════════════════════════
 */
const jpf = require('./jpfilter');

const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YT_BASE = 'https://yuyu-tei.jp';
const YT_DELAY = 1500;          // never faster than one page per 1.5s

let lastHit = 0;
async function ytFetch(url) {
  const wait = YT_DELAY - (Date.now() - lastHit);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHit = Date.now();
  const r = await fetch(url, { headers: {
    'User-Agent': YT_UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
  } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.text();
}

// ── Set index ─────────────────────────────────────────────────
// The search form carries every set as a vers[] checkbox, and each label
// starts with the canonical set code in brackets — "[SV8a] 熱風のアリーナ".
// Parsing the bracket is far safer than transforming yuyu-tei's own code
// (sv08a) back into ours (SV8a) by guessing the zero-padding rules.
async function fetchSetIndex() {
  const html = await ytFetch(YT_BASE + '/sell/poc/s/search?search_word=&rare=&type=&kizu=0');
  const map = new Map();          // OUR set id (upper) -> { code, label }
  for (const m of html.matchAll(/name="vers\[\]" value="([^"]+)"[^>]*>\s*<label[^>]*>([^<]+)<\/label>/g)) {
    const code = m[1], label = m[2].trim();
    const b = label.match(/^\[([^\]]+)\]/);
    if (!b) continue;
    const key = b[1].toUpperCase();
    if (!map.has(key)) map.set(key, { code, label });
  }
  if (map.size < 50) throw new Error('set index looks wrong — only ' + map.size + ' sets parsed');
  return map;
}

// ── Set page ──────────────────────────────────────────────────
// Each card renders as:
//   <img src="https://card.yuyu-tei.jp/poc/100_140/{ver}/{cid}.jpg"
//        alt="233/187 UR テツノイサハex">
//   <span class="d-block border border-dark ...">233/187</span>
//   <h4 ...>テツノイサハex</h4>
//   <strong ...> 780 円 </strong>
//   在庫 : 3 点
//
// NOTE: the first alt inside a card block is the star/favourite icon
// (alt="Star"). Match the alt on the card image specifically or every
// row parses as rarity "Star" with no number.
function parseSetPage(html) {
  const out = [];
  for (const b of html.split('class="card-product').slice(1)) {
    const alt = (b.match(/card\.yuyu-tei\.jp\/poc\/[^"]+"\s+alt="([^"]+)"/) || [])[1];
    const numSpan = (b.match(/<span class="d-block border border-dark[^"]*">\s*([^<]+?)\s*<\/span>/) || [])[1];
    const price = (b.match(/<strong[^>]*>\s*([\d,]+)\s*円\s*<\/strong>/) || [])[1];
    const name = (b.match(/<h4[^>]*>([^<]+)<\/h4>/) || [])[1];
    const href = b.match(/\/sell\/poc\/card\/([a-z0-9_-]+)\/(\d+)/i) || [];
    const stock = (b.match(/在庫\s*:\s*(\d+)\s*点/) || [])[1];
    if (!price || !(alt || numSpan)) continue;

    const am = alt ? alt.match(/^\s*([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)\s+(\S+)\s+(.+?)\s*$/) : null;
    const nm = numSpan ? numSpan.match(/^([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)$/) : null;

    out.push({
      number: (am && am[1]) || (nm && nm[1]) || null,
      printedTotal: (am && am[2]) || (nm && nm[2]) || null,
      rarity: am ? am[3] : null,
      name: (name || (am ? am[4] : '') || '').trim(),
      yen: parseInt(String(price).replace(/,/g, ''), 10),
      stock: stock ? parseInt(stock, 10) : null,
      ver: href[1] || null,
      cid: href[2] || null,
      url: href[1] ? `${YT_BASE}/sell/poc/card/${href[1]}/${href[2]}` : null
    });
  }
  return out;
}

// ── Rarity ────────────────────────────────────────────────────
// The set page carries a rarity code in the same alt text as the number,
// so a rarity backfill costs no extra requests.
//
// TWO THINGS TO KNOW BEFORE RELYING ON IT (measured 2026-09-02):
//
// 1. `-` means "not stated", not "common". It is the MOST common value
//    overall (1,041 of 1,755 sampled rows). Never map it.
// 2. Labelling is bimodal by era. Older sets label everything including
//    C/U/R — SM1M, CP6, XY2, SM9 all came back 100% labelled. Modern sets
//    label only the chase rarities and leave base cards `-` — S8b 36%,
//    SV8a 19%, M2a 17%. That happens to suit us: the Limitless-ingested
//    sets that need rarity are the older, fully-labelled ones.
//
// `normRarity` in ingest.js handles RR/SR/SAR/UR/AR/CHR/CSR/HR/RRR but
// returns null for plain C, U and R — the three that cover most of the
// backfill. Hence this table.
//
// Codes we are NOT confident about are deliberately absent so they map to
// null and write nothing: MA, TR, S-TD, K, PROMO. Guessing a rarity is how
// prices got wrong in the first place.
const YT_RARITY = {
  'C':   'Common',
  'U':   'Uncommon',
  'R':   'Rare',
  'RR':  'Double Rare',
  'RRR': 'Rare Ultra',
  'SR':  'Rare Ultra',
  'SAR': 'Special Illustration Rare',
  'UR':  'Hyper Rare',
  'MUR': 'Hyper Rare',
  'HR':  'Hyper Rare',
  'AR':  'Illustration Rare',
  'CHR': 'Illustration Rare',
  'CSR': 'Rare Secret',
  'ACE': 'ACE SPEC Rare'
};

function ytRarity(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (!c || c === '-' || c === '(NONE)') return null;   // not stated
  return YT_RARITY[c] || null;
}

// ── Variant selection ─────────────────────────────────────────
// A single collector number carries several parallel printings, and they
// are NOT the same product:
//   #100 トドロクツキ                             ¥80
//   #100 トドロクツキ(モンスターボール柄/ミラー仕様)  ¥120
//   #100 トドロクツキ(マスターボール柄/ミラー仕様)    ¥420
// 144 of 237 numbers in SV8a look like this, up to a 5x spread. Our
// database holds ONE row per number — the base printing — so taking an
// arbitrary or maximum entry would inflate prices in exactly the way the
// Yahoo bugs did.
//
// Prefer an exact name match against our stored name; failing that, the
// entry with no parenthetical treatment suffix. If neither is decidable,
// return nothing — a wrong price is worse than no price.
const TREATMENT_RE = /[（(].*?[)）]/;

function pickVariant(entries, ourName) {
  if (!entries.length) return null;
  if (entries.length === 1) return entries[0];

  if (ourName) {
    const exact = entries.filter(e => e.name === ourName);
    if (exact.length === 1) return exact[0];
  }
  const plain = entries.filter(e => !TREATMENT_RE.test(e.name));
  if (plain.length === 1) return plain[0];
  // Several plain candidates, or none — undecidable.
  return null;
}

// ── The same rule, for LISTINGS rather than for one price ─────
// A price needs exactly one answer, so pickVariant returns nothing when
// the choice is undecidable. A listings panel can show several rows — but
// only rows that are genuinely THIS card.
//
// It must not simply return everything sharing the number. That is the
// master-ball mirror: #100 トドロクツキ is ¥80 and the same number in
// マスターボール柄/ミラー仕様 is ¥420, a different product that our
// catalogue does not hold a row for. Showing it as this card's price is
// the 119x error that took cross-checking two sources to find.
//
// So: an exact name match wins outright and takes every entry that shares
// it (a shop can stock one card at two conditions). Failing that, the
// entries with no parenthetical treatment — the base printing. Never a
// mixture, and never a treatment we cannot name.
function pickVariants(entries, ourName) {
  if (!entries || !entries.length) return [];
  if (ourName) {
    const exact = entries.filter(e => e.name === ourName);
    if (exact.length) return exact;
  }
  return entries.filter(e => !TREATMENT_RE.test(e.name));
}

// The SHOP's own words for this row, not ours.
//
// The title is what the gate reads, so it has to be the source's text. A
// title built from our own card record would be the gate checking our
// output against our input and passing every time — a guard that cannot
// fail. Everything here comes off yuyu-tei's page.
function entryTitle(e) {
  return [e.name,
          e.number && e.printedTotal ? e.number + '/' + e.printedTotal : e.number,
          e.rarity && e.rarity !== '-' ? e.rarity : null]
    .filter(Boolean).join(' ');
}

// ── Matching ──────────────────────────────────────────────────
// Same rule as Yahoo: the number alone does not identify a card, the
// printed TOTAL is what separates sets. Fail closed when it disagrees.
function matchesOurCard(entry, card) {
  const bare = n => String(n == null ? '' : n).replace(/^0+/, '') || '0';
  if (!entry.number || bare(entry.number) !== bare(card.number)) return false;
  if (card.set_total && entry.printedTotal &&
      bare(entry.printedTotal) !== bare(card.set_total)) return false;
  // A shop page is singles by construction, but it also sells bundles.
  // Run the shared lot vocabulary over the product name so a "まとめ" or
  // "BOX" row can never be stored as a single card's price.
  if (!jpf.jpTitleIsSingleRaw(entry.name)) return false;
  return true;
}

async function fetchSet(code) {
  return parseSetPage(await ytFetch(`${YT_BASE}/sell/poc/s/${code}`));
}

module.exports = {
  YT_UA, YT_BASE, YT_DELAY,
  ytFetch, fetchSetIndex, parseSetPage, fetchSet,
  pickVariant, pickVariants, entryTitle, matchesOurCard, TREATMENT_RE,
  YT_RARITY, ytRarity
};
