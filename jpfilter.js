/**
 * ══════════════════════════════════════════════════════════════
 * CardHunt — Japanese listing filter, shared.
 *
 * ONE definition of "is this Yahoo/Mercari result a single raw copy of the
 * card I asked about". Both the price pipeline (ingest.js) and the listings
 * endpoint (server.js) import it, because a lot that is excluded from a
 * median must also never be shown as a single card for sale.
 *
 * Run `node ingest.js filtertest` after touching anything in here.
 * ══════════════════════════════════════════════════════════════
 */

const JPY_PER_USD = 157;

// Widest ratio between the cheapest and dearest surviving comparable that
// still plausibly describes one product. Beyond this we decline to price.
const YAHOO_MAX_SPREAD = 10;

// ── Titles that are not a single raw card ─────────────────────
// Without this a 50-card lot at ¥40,000 reads as one card at ¥40,000, which
// is why Japanese prices ran 35-75% high and a Common surfaced at $573.
const JP_LOT_WORDS = [
  'セット', 'まとめ', '一括', 'コンプ', '以上', '点', '枚セット', '大量',
  'BOX', 'ボックス', '未開封', 'シュリンク', 'パック', 'デッキ',
  '引退', 'コレクション', '詰め合わせ', 'おまとめ', 'まとめ売り',
  'ジャンク', '傷あり', 'プレイ用', '複数', '各種', '全種'
];
// A graded slab sells for a multiple of the raw card — a different product.
const JP_GRADED_WORDS = ['PSA', 'BGS', 'CGC', 'ARS', '鑑定', '鑑定品'];

// opts.allowGraded — keep slabs. Used only when the caller has ASKED for a
// grade ("show me PSA 10s"), where a slab is the product, not contamination.
// Pricing never sets it: a graded sale is not a comparable for a raw card.
function jpTitleIsSingleRaw(title, opts = {}) {
  // A listing we cannot read is a listing we cannot judge, and an unjudged
  // listing must never enter a median. Yahoo sometimes returns an item whose
  // `title` is not the listing title at all (a bare "19" for the query
  // "コータス 19"); the old `return true` default let every one of those
  // through, which is why sample sizes sat at 45-50 of 50 and nothing was
  // ever rejected. Absent evidence, exclude.
  if (!title) return false;
  const t = String(title);
  for (const w of JP_LOT_WORDS) if (t.includes(w)) return false;
  if (!opts.allowGraded)
    for (const w of JP_GRADED_WORDS) if (t.includes(w)) return false;
  // "3枚" / "10点" style quantity markers
  if (/[0-9]{1,3}\s*(枚|点|パック|個)/.test(t)) return false;

  // A title citing two or more different "number/total" cards is a bundle,
  // however politely it is worded. Neither of these uses lot vocabulary:
  //   "s8 075/100 ラティオス 074/100 ラティアス s12a 105/172 ラティアス"
  //   "M2a 127/193 レックウザ S12a 105/172 ラティアス 他"
  // Selling four cards for ¥41,250 says nothing about one of them.
  const cited = new Set((t.match(/\d{1,4}\s*\/\s*\d{1,4}/g) || []).map(x => x.replace(/\s+/g, '')));
  if (cited.size >= 2) return false;

  return true;
}

// ── Category ──────────────────────────────────────────────────
// Yahoo search is a loose OR match over the whole site, not a card
// catalogue. A bare query for リザードン returns UNIQLO T-shirts, PVC
// figures, furikake stickers and Minecraft merchandise alongside cards —
// none of which any title rule rejects, because none of them are lots.
// Category is decisive, and it is already in the payload.
const JP_CARD_CATEGORY = 'トレーディングカードゲーム';
// Children of トレーディングカードゲーム that are NOT a single card. Being
// under the card tree is not enough — measured 2026-08-26, these three all
// passed the old "contains トレーディングカードゲーム" test:
//   パック、ボックス、特殊セット  sealed product. A ¥30,000 booster box is not
//                                a data point about a ¥50 Common — this is
//                                what put every SM7 card at ~¥30,000.
//   まとめ売り                    bulk-sale category. Its whole purpose is lots.
//   公式サプライ                  sleeves, binders, playmats. Not cards at all.
const JP_SEALED_CATEGORIES = ['パック、ボックス、特殊セット', 'まとめ売り', '公式サプライ'];

// Yahoo's LIVE search page gives a numeric category id and no name, so the
// name test cannot run there. Measured ids, same tree:
//   2084317608  シングルカード              single card — exactly what we want
//   25826       トレーディングカードゲーム    the category root
//   2084317604  パック、ボックス、特殊セット  sealed
//   2084309054  まとめ売り                  lots
//   2084317605  公式サプライ                accessories
const JP_CARD_CATEGORY_IDS = new Set(['2084317608', '25826']);
const JP_EXCLUDED_CATEGORY_IDS = new Set(['2084317604', '2084309054', '2084317605']);

function jpItemIsCardCategory(item) {
  if (!item) return false;
  const names = [];
  if (item.category && item.category.name) names.push(String(item.category.name));
  for (const c of (item.categoryPath || [])) if (c && c.name) names.push(String(c.name));

  if (names.length) {
    for (const bad of JP_SEALED_CATEGORIES)
      if (names.some(n => n.includes(bad))) return false;
    return names.some(n => n.includes(JP_CARD_CATEGORY));
  }

  // No names — fall back to the numeric id (live search).
  const id = item.category && item.category.id != null ? String(item.category.id) : null;
  if (!id) return false;                                 // unjudgeable — exclude
  if (JP_EXCLUDED_CATEGORY_IDS.has(id)) return false;
  return JP_CARD_CATEGORY_IDS.has(id);
}

// ── Identity ──────────────────────────────────────────────────
// The listing must actually name the card, or nothing ties the result to the
// card we asked about and a degenerate query silently returns the same
// generic pool for every card in a set.
function jpTitleMentionsCard(title, cardName) {
  if (!title || !cardName) return false;
  return String(title).includes(String(cardName).trim());
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// The name alone is not enough either. ラティアス #105 of S12a (an Uncommon
// worth a few dollars) matched ラティアス＆ラティオスGX SR "SM9 105/095" —
// same name, same number, different card, ¥140,000. That one collision is
// most of why Japanese Uncommons read in the hundreds.
//
// Japanese listings almost always print "number/total", and the TOTAL is what
// separates the sets: 105/172 is ours, 105/095 is not. Where a title states a
// number at all, it must be ours. Where it states none, the set code must
// appear instead — an unqualified "ポケモンカード コータス" could be any of
// six printings and is not a comparable for a specific one.
// Does the title state this set by NAME? ("Champion's Path")
//
// The setId check below looks for a set CODE — `swsh3.5`, `SM9`. That is a
// Yahoo and Japanese-listing convention. English eBay sellers write the set
// NAME and essentially never the code, so on eBay that fallback can never
// fire: only the `74/73` form could ever match, and every title using the
// equally common `#74 Champion's Path` form was silently rejected.
//
// Apostrophes vary ("Champion's" / "Champions" / "Champion`s") and so does
// spacing, so both sides are normalised to alphanumerics before comparing.
function titleNamesSet(title, setName) {
  if (!setName || String(setName).trim().length < 4) return false;  // too short to be evidence
  // Apostrophes are DELETED, not turned into a space. Replacing them with a
  // space makes "Champion's Path" normalise to "champion s path" while the
  // very common seller spelling "Champions Path" becomes "champions path",
  // and the two never match — which is most of the titles this was added for.
  const norm = s => String(s).toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const t = ' ' + norm(title) + ' ';
  const s = norm(setName);
  return s.length >= 4 && t.includes(' ' + s + ' ');
}

// Does the bare number appear as its own token? `#74`, ` 74 `, `no. 74`.
// Excludes a preceding `$` so a $74 price is not read as card 74, and
// requires a non-digit on both sides so 74 does not match 174 or 2074.
function titleHasBareNumber(title, want) {
  return new RegExp('(^|[^0-9$])#?0*' + escapeRe(want) + '([^0-9]|$)').test(String(title));
}

function jpTitleMatchesNumber(title, cardNumber, setTotal, setId, setName) {
  if (!cardNumber) return true;                     // nothing to check against
  const t = String(title);
  const bare = n => String(n).replace(/^0+/, '') || '0';
  const want = bare(cardNumber);

  const namesSet = setId && new RegExp('(^|[^A-Za-z0-9])' + escapeRe(setId) + '([^A-Za-z0-9]|$)', 'i').test(t);

  const pairs = [...t.matchAll(/(\d{1,4})\s*\/\s*(\d{1,4})/g)];
  if (pairs.length) {
    for (const m of pairs) {
      if (bare(m[1]) !== want) continue;
      if (setTotal) {
        if (bare(setTotal) !== bare(m[2])) continue;             // wrong set
        return true;
      }
      // No setTotal to check against. The number alone does NOT identify the
      // card — ラティアス #105 matched "SM9 105/095" precisely this way, and
      // it came back the moment a caller forgot to pass set_total (refreshDue
      // selected set_api_id but not set_total, and rewrote that card to
      // $1,294.90 on 2026-08-22). A missing check must fail closed: demand
      // the set code in the title instead.
      if (namesSet) return true;
      continue;
    }
    return false;              // it states a number, and none of them are ours
  }
  if (namesSet) return true;

  // No `N/M` pair anywhere. Accept the set NAME as the disambiguator, but
  // ONLY together with the number — deliberately stricter than the setId
  // branch above, which returns true without checking the number at all.
  //
  // Both halves are required for the reason in the comment above: a number
  // alone does not identify a card (ラティアス #105 matched "SM9 105/095"),
  // and a set name alone does not either — Champion's Path contains more
  // than one Charizard. Demanding both is the same standard the `N/M` +
  // setTotal path applies.
  if (titleNamesSet(t, setName) && titleHasBareNumber(t, want)) return true;

  return false;
}

// The single gate. `card` is { name, number, setTotal, setId }; number,
// setTotal and setId may be absent, in which case that check is skipped.
function jpItemIsSingleCard(item, card) {
  const c = (typeof card === 'string') ? { name: card } : (card || {});
  const title = (item && item.title) || '';
  return jpItemIsCardCategory(item)
    && jpTitleMentionsCard(title, c.name)
    && jpTitleIsSingleRaw(title)
    && jpTitleMatchesNumber(title, c.number, c.setTotal, c.setId, c.setName);
}

// ── Grade ─────────────────────────────────────────────────────
// A grade request inverts one rule: slabs stop being contamination and
// become the thing being asked for. Everything else still applies — a
// "PSA10 まとめ 10枚" lot is still a lot.
//
// Both marketplace conventions must work off ONE definition:
//   Yahoo  "PSA10リザードン"     — unspaced, no separator
//   eBay   "PSA 10 Charizard"   — spaced
// Stripping whitespace from both sides normalises them.
//
// The number needs a boundary or grades swallow their own decimals: a
// search for BGS 9 matched "BGS 9.5" because "BGS9" is a prefix of
// "BGS9.5". Half-grades are real on BGS and CGC, and a 9.5 sells well
// above a 9, so this is a wrong-product match, not a rounding detail.
function jpTitleHasGrade(title, grade) {
  if (!title || !grade) return false;
  const t = String(title).toUpperCase().replace(/\s+/g, '');
  const g = String(grade).toUpperCase().replace(/\s+/g, '');

  const m = g.match(/^([A-Z]+)(\d+(?:\.\d+)?)$/);
  if (!m) return t.includes(g);
  const [, company, num] = m;
  // Allow a short separator ("PSA鑑定10", "PSA-10") but never a trailing
  // digit or decimal, so 9 cannot match 9.5 and 1 cannot match 10.
  const re = new RegExp(escapeRe(company) + '[^0-9]{0,4}' + escapeRe(num) + '(?![0-9.])');
  return re.test(t);
}

// ══════════════════════════════════════════════════════════════
// ENGLISH-LANGUAGE MARKETPLACES (eBay, and anything else Latin-script).
//
// Same principle as the Japanese rules, different vocabulary. This lives
// here rather than in server.js so there is exactly ONE answer to "is this
// listing a single copy of this card" no matter which marketplace asked —
// which is the whole reason jpfilter is a shared module.
// ══════════════════════════════════════════════════════════════
const EN_LOT_WORDS = [
  'lot', 'lots', 'bundle', 'bulk', 'joblot', 'job lot', 'collection',
  'set of', 'playset', 'complete set', 'master set', 'binder',
  'booster box', 'booster', 'etb', 'elite trainer', 'sealed', 'pack',
  'blister', 'tin', 'random', 'mystery', 'repack', 'you pick', 'u pick',
  'choose', 'your choice', 'proxy', 'custom', 'fan art', 'orica',
  'reprint', 'counterfeit', 'not real'
];
const EN_GRADED_WORDS = ['PSA', 'BGS', 'CGC', 'SGC', 'ACE', 'TAG', 'GRADED', 'SLAB'];

function enTitleIsSingleRaw(title, opts = {}) {
  if (!title) return false;                        // unjudgeable — exclude
  const t = String(title).toLowerCase();
  for (const w of EN_LOT_WORDS) if (t.includes(w)) return false;
  if (!opts.allowGraded) {
    const T = String(title).toUpperCase();
    for (const w of EN_GRADED_WORDS) if (T.includes(w)) return false;
  }
  // "x4", "4x", "qty 3", "3 cards" — quantity markers
  if (/\b(x\s?\d{1,3}|\d{1,3}\s?x)\b/.test(t)) return false;
  if (/\bqty\b|\bquantity\b/.test(t)) return false;
  if (/\b\d{1,3}\s+cards?\b/.test(t)) return false;
  // Two or more different "number/total" citations is a bundle
  const cited = new Set((t.match(/\d{1,4}\s*\/\s*\d{1,4}/g) || []).map(x => x.replace(/\s+/g, '')));
  if (cited.size >= 2) return false;
  return true;
}

// English titles rarely repeat the Japanese exactness, so the name test is
// token-based: every significant word of the card name must appear.
function enTitleMentionsCard(title, cardName) {
  if (!title || !cardName) return false;
  const t = String(title).toLowerCase();
  const tokens = String(cardName).toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/).filter(w => w.length > 1);
  if (!tokens.length) return false;
  return tokens.every(w => t.includes(w));
}

// The English gate. Mirrors jpItemMatchesRequest exactly, including the
// fail-closed number rule — an eBay title that cites a number must cite
// OURS, and one that cites none must name the set.
function enItemMatchesRequest(item, card, grade) {
  const c = (typeof card === 'string') ? { name: card } : (card || {});
  const title = (item && item.title) || '';
  if (!enTitleMentionsCard(title, c.name)) return false;
  if (!jpTitleMatchesNumber(title, c.number, c.setTotal, c.setId, c.setName)) return false;
  if (isRawGrade(grade)) return enTitleIsSingleRaw(title);
  return enTitleIsSingleRaw(title, { allowGraded: true })
      && jpTitleHasGrade(title, grade);
}

// "Raw" arrives in several vocabularies and they must all mean ungraded:
//   frontend GRADES[]   'Raw NM', 'Raw LP', 'Raw MP'
//   cardparse.js        'Raw NM' … 'Raw DMG'  (gradeString for any
//                       ungraded query, including a bare card name)
//   callers/tests       'Raw', 'ungraded', '' , null
//
// Only bare 'raw'/'ungraded'/'none' used to match, so a request for
// "Raw NM" fell through to the GRADED branch and was matched against
// listing titles as if "Raw NM" were a slab label — which no title
// contains, so every listing was rejected and the panel showed nothing.
// /api/search hit this for every ungraded query, because that is exactly
// the string cardparse emits.
//
// The condition suffix is deliberately ignored rather than filtered on:
// Yahoo titles state condition inconsistently and in prose (状態B, やや傷),
// so claiming to filter LP from NM would be a promise we cannot keep.
function isRawGrade(grade) {
  if (!grade) return true;
  const g = String(grade).trim();
  return /^(raw|ungraded|none)$/i.test(g) || /^raw[\s_-]/i.test(g);
}

// The gate the listings endpoint uses. Raw behaves exactly as pricing does.
function jpItemMatchesRequest(item, card, grade) {
  const c = (typeof card === 'string') ? { name: card } : (card || {});
  if (isRawGrade(grade)) return jpItemIsSingleCard(item, c);
  const title = (item && item.title) || '';
  return jpItemIsCardCategory(item)
    && jpTitleMentionsCard(title, c.name)
    && jpTitleIsSingleRaw(title, { allowGraded: true })
    && jpTitleMatchesNumber(title, c.number, c.setTotal, c.setId, c.setName)
    && jpTitleHasGrade(title, grade);
}

// ══════════════════════════════════════════════════════════════
// Yahoo LIVE search — HTML, not JSON.
//
// The live search page stopped embedding __NEXT_DATA__ (verified 2026-08-26:
// three consecutive fetches, 525KB each, no payload — while closedsearch
// still carries it). Only ENDED auctions come back as JSON, and an ended
// auction cannot be bought, so a listing finder built on it alone shows
// prices you cannot act on.
//
// The live page does render clean structured attributes on each result:
//   data-auction-id / -title / -price / -img / -category / -isfreeshipping
// Parsing those is not screen-scraping prose; it is reading the same fields
// the JSON would have given us. This yields the same item shape, so one
// filter serves both feeds.
// ══════════════════════════════════════════════════════════════
function parseYahooLiveHtml(html) {
  const items = [];
  if (!html) return items;
  const attr = (block, name) => {
    const m = block.match(new RegExp('data-auction-' + name + '="([^"]*)"'));
    return m ? m[1] : null;
  };
  // Each result anchor carries the whole record in its attributes.
  const re = /<a[^>]*data-auction-id="[^"]+"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[0];
    const id = attr(block, 'id');
    const title = attr(block, 'title');
    const price = attr(block, 'price');
    if (!id || !title) continue;
    // The tracking blob carries the auction's end time and bid count. A
    // 1円スタート auction mid-flight shows a current bid far below market
    // (ブースターex SAR sat at ¥1,100 against a ~¥5,000 market), so the UI
    // must be able to say "auction, ends in 2h" rather than imply that is
    // the price.
    const cl = (block.match(/data-cl-params="([^"]*)"/) || [])[1] || '';
    const endEpoch = (cl.match(/(?:^|;)end:(\d+)/) || [])[1];
    const bidCount = (block.match(/data-auction-bids="(\d+)"/) || [])[1];
    items.push({
      auctionId: id,
      title: decodeHtmlEntities(title),
      price: parseInt(price || '0', 10),
      imageUrl: attr(block, 'img'),
      category: { id: attr(block, 'category') },
      isFreeShipping: attr(block, 'isfreeshipping') === '1',
      isFleamarketItem: attr(block, 'isflea') === '1',
      isFixedPrice: /(?:^|;)bnpsf:/.test(cl) && !/(?:^|;)sfst:now/.test(cl),
      endTime: endEpoch ? new Date(Number(endEpoch) * 1000).toISOString() : null,
      bidCount: bidCount != null ? parseInt(bidCount, 10) : null,
      _live: true
    });
  }
  return items;
}

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

// ── Shapes ────────────────────────────────────────────────────
// Yahoo item -> the shape /api/listings returns. Shipping is frequently
// absent on Yahoo; null means unknown, which the caller must not silently
// read as free — hence shippingKnown.
function yahooItemToListing(item, yen) {
  const shipYen = (item.buyNowPriceShippingFee != null)
    ? Number(item.buyNowPriceShippingFee)
    : (item.currentPriceShippingFee != null ? Number(item.currentPriceShippingFee) : null);
  const shipping = item.isFreeShipping ? 0
    : (Number.isFinite(shipYen) && shipYen !== null ? +(shipYen / JPY_PER_USD).toFixed(2) : null);
  const price = +(yen / JPY_PER_USD).toFixed(2);
  return {
    source: 'yahoo',
    title: item.title || '',
    price,
    currency: 'USD',
    priceOriginal: yen,
    currencyOriginal: 'JPY',
    shipping,
    landed: +(price + (shipping || 0)).toFixed(2),
    shippingKnown: shipping !== null,
    condition: 'Raw',
    seller: (item.seller && (item.seller.displayName || item.seller.id)) || null,
    url: item.auctionId ? 'https://page.auctions.yahoo.co.jp/jp/auction/' + item.auctionId : null,
    imageUrl: item.imageUrl || null,
    endsAt: item.endTime || null,
    bids: Number.isFinite(item.bidCount) ? item.bidCount : null
  };
}

module.exports = {
  JPY_PER_USD, YAHOO_MAX_SPREAD,
  JP_LOT_WORDS, JP_GRADED_WORDS, JP_CARD_CATEGORY, JP_SEALED_CATEGORIES,
  jpTitleIsSingleRaw, jpItemIsCardCategory, jpTitleMentionsCard,
  jpTitleMatchesNumber, jpItemIsSingleCard, yahooItemToListing, escapeRe,
  titleNamesSet, titleHasBareNumber,
  jpTitleHasGrade, isRawGrade, jpItemMatchesRequest,
  JP_CARD_CATEGORY_IDS, JP_EXCLUDED_CATEGORY_IDS, parseYahooLiveHtml,
  EN_LOT_WORDS, EN_GRADED_WORDS,
  enTitleIsSingleRaw, enTitleMentionsCard, enItemMatchesRequest
};
