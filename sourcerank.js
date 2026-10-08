/**
 * ══════════════════════════════════════════════════════════════
 * sourcerank.js — which price source is allowed to overwrite which
 *
 * `refresh` treated every source as interchangeable and simply wrote the
 * newest observation. It is not interchangeable.
 *
 * Yahoo returned master-ball mirror prices for 142 cards, up to 119x
 * wrong, with no visible symptom: the mirror genuinely shares the
 * collector number (`129/165`) and genuinely sells for $20-50. Yuyu-tei
 * corrected them because its set pages list each printing as a separate
 * SKU. An unattended `refresh ja` re-fetching those from Yahoo silently
 * reverses that correction — which is exactly what 33 unattended hours on
 * Aug 28 risked.
 *
 * So: a lower-confidence source never replaces a higher-confidence one.
 *
 * ── Why a blocked price is not recorded at all ──
 * The displayed price is, everywhere in this codebase, "the newest
 * non-estimate row for the card". There is no column that separates
 * stored-for-history from shown-to-users. So writing a lower-confidence
 * observation *is* displaying it. Recording it would require either a
 * schema change or rewriting every reader, and until then the honest
 * option is to skip the write and log it — which is what refresh now
 * prints, with both sources, for every skip.
 *
 * Standalone on purpose: ingest.js has been reverted twice by a
 * downloaded file, losing whole subsystems. See CLAUDE.md.
 * ══════════════════════════════════════════════════════════════
 */

const HIGH = 3, MEDIUM = 2, LOW = 1;

// Ordered — first match wins. Anchored so `yuyutei_shop_experimental`
// does not silently inherit `yuyutei_shop`'s confidence.
const SOURCE_RANKS = [
  { re: /^tcgplayer_/,   rank: HIGH,   why: 'real marketplace, collector-number matched' },
  { re: /^yuyutei_shop$/, rank: HIGH,  why: 'shop asking price; set page supplies number + printed total' },

  // ── TCGdex (TASK.md T1) ──────────────────────────────────────
  // Listed BEFORE the generic /^cardmarket/ rule. These do not match it
  // anyway (they start `tcgdex_`), and that is the point: they are a
  // SECOND, independent path and must stay distinguishable from the
  // scraped sources they are cross-checked against.
  //
  // TCGdex TCGplayer is HIGH, on evidence rather than assumption.
  // Cross-checked against our own tcgplayer_market on 40 English cards
  // spread across the value range (tcgdexprobe.js xcheck): median ratio
  // 1.020x, 37 of 37 in agreement, and the expensive cards — Pikachu
  // pl2-112 $328.45, M Charizard EX xy12-101 $125.56, Hypno ecard2-H12
  // $229.99 — matched to the cent. It also carries TCGplayer's own
  // productId, so it is keyed by the marketplace rather than matched by
  // our name-and-number logic. That is at least as trustworthy as the
  // scrape it agrees with.
  { re: /^tcgdex_tcgplayer_/, rank: HIGH,
    why: 'TCGplayer via TCGdex, productId-keyed; 37/37 agreement with our scrape, median 1.02x' },

  // TCGdex Cardmarket is MEDIUM, and deliberately below yuyutei_shop.
  // Cross-checked against held Japanese prices (tcgdexprobe.js cmcheck):
  // no gross mismatches, so the MATCH is right — but the median ran
  // 1.595x above the Japanese sources on the cards that were genuinely
  // comparable. That is a real EU premium on Japanese singles, not an
  // error, and precisely why it must not overwrite a Japanese shop
  // price: it would re-price the JP catalogue up ~60% to European
  // retail. A second opinion, not a replacement.
  { re: /^tcgdex_cardmarket/, rank: MEDIUM,
    why: 'EU marketplace aggregate; runs ~1.6x above JP sources, so it informs but never demotes them' },

  { re: /^cardmarket/,   rank: MEDIUM, why: 'EU marketplace aggregate' },
  { re: /^ebay/,         rank: MEDIUM, why: 'live listings, name-matched' },
  { re: /^yahoojp/,      rank: MEDIUM, why: 'auction median; cannot separate variants sharing a number' },
  { re: /^scraper/,      rank: MEDIUM, why: 'aggregate' },
  { re: /^estimate/,     rank: LOW,    why: 'derived from rarity, never a market observation' }
];

// An unrecognised source is treated as MEDIUM: high enough to replace an
// estimate, not high enough to quietly demote a verified shop or
// marketplace price. Fail toward preserving what we trust.
const DEFAULT_RANK = MEDIUM;

function sourceRank(source) {
  if (!source) return DEFAULT_RANK;
  const s = String(source);
  for (const r of SOURCE_RANKS) if (r.re.test(s)) return r.rank;
  return DEFAULT_RANK;
}

function rankLabel(rank) {
  return rank >= HIGH ? 'high' : rank <= LOW ? 'low' : 'medium';
}

/**
 * May `nextSource` become the displayed price, given what is there now?
 *
 *   - nothing stored yet          -> yes
 *   - same source                 -> yes (a genuine price move)
 *   - higher or equal confidence  -> yes
 *   - lower confidence            -> NO
 */
function canOverwrite(nextSource, currentSource) {
  if (!currentSource) return true;
  if (String(nextSource) === String(currentSource)) return true;
  return sourceRank(nextSource) >= sourceRank(currentSource);
}

// One line explaining a decision, for run logs.
function explain(nextSource, currentSource) {
  const n = sourceRank(nextSource), c = sourceRank(currentSource);
  const verdict = canOverwrite(nextSource, currentSource) ? 'allow' : 'SKIP';
  return `${verdict}  ${nextSource} (${rankLabel(n)}) vs held ${currentSource || 'none'} (${currentSource ? rankLabel(c) : '-'})`;
}

module.exports = {
  HIGH, MEDIUM, LOW, DEFAULT_RANK,
  SOURCE_RANKS, sourceRank, rankLabel, canOverwrite, explain
};
