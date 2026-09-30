const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// eBay guards. Both standalone: server.js is deployed, and this project has
// twice lost whole subsystems to a downloaded file landing on local work.
//   ebayquota — may we spend a call? (count lives in Supabase, not memory)
//   ebaycall  — everything else: one at a time, paced, kill switch, 429, logs
const quota = require('./ebayquota');
const ebay = require('./ebaycall');
// One query builder and one gate, shared with the frontend's deep links so a
// link and an API call ask eBay the same question. cardmatch decides;
// listingparse labels. See TASK.md T1/T1b.
const cm = require('./cardmatch');
const estimator = require('./estimator');
const gp = require('./gradeprice');
const lp = require('./listingparse');
// The gap no keyword can close: a title indistinguishable from a genuine one
// at 1/400th of the price. The card's own listings are the only evidence.
// See TASK.md T2 and outlier.js.
const outlier = require('./outlier');
// Pokémon TCG Pocket sets are hidden at THIS layer — every read of `cards`
// carries digital.visibleSql(), so no screen can forget to filter them.
// The rows stay in the database. See digital.js; preserve.test.js asserts
// every `FROM cards` / `JOIN cards` here either filters or says why not.
const digital = require('./digital');
const printsql = require('./printsql');   // T10: which stored row is a card's BASE price
// A card id not matching ^(en|ja|zh-tw|zh-cn)- is a bug, not a card:
// refused at every entry point that takes one, never served. cardid.js.
const cardid = require('./cardid');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ?debug=1 — where the time goes (TASK T1). Every db.query, eBay call, gate
// and outlier pass inside this request records into it; the JSON response
// gains a `timings` key. Without the flag nothing is recorded.
const timing = require('./timing');
timing.instrumentFetch();
app.use((req, res, next) => {
  if (req.query.debug !== '1') return next();
  timing.run(store => {
    const json = res.json.bind(res);
    res.json = body => {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const a = timing.now();
        JSON.stringify(body);
        timing.add('serialise', timing.now() - a);
        body = Object.assign({}, body, { timings: timing.report(store) });
      }
      return json(body);
    };
    next();
  });
});

// ── DATABASE (Supabase) ───────────────────────────────────────
const db = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;
timing.instrumentPool(db);

// ── DATA SOURCES ──────────────────────────────────────────────
const TCG_KEY = process.env.POKEMONTCG_KEY || '4c777c95-8a61-407e-b16e-48bd2f827478';
const TCG_API = 'https://api.pokemontcg.io/v2';
const TCG_H   = { 'X-Api-Key': TCG_KEY };
const TCGDEX  = 'https://api.tcgdex.net/v2';   // free, multilingual, no key

// Map our set ids -> TCGdex set ids
// TCGdex set id candidates. We try each in order until one returns cards.
// Japanese sets use their own official codes (sv1a, sv2a, me1 ...), so a
// single flat map is not enough — we probe.
const TCGDEX_SETS = {
  'me2pt5':'me02.5','me2':'me02','me1':'me01','me3':'me03','me4':'me04',
  'sv10':'sv10','sv9':'sv09','sv8pt5':'sv08.5','sv8':'sv08','sv7':'sv07',
  'sv6pt5':'sv06.5','sv6':'sv06','sv5':'sv05','sv4pt5':'sv04.5','sv4':'sv04',
  'sv3pt5':'sv03.5','sv3':'sv03','sv2':'sv02','sv1':'sv01',
  'swsh12pt5':'swsh12.5','swsh12':'swsh12','swsh11':'swsh11','swsh10':'swsh10',
  'swsh9':'swsh09','swsh8':'swsh08','swsh7':'swsh07','swsh6':'swsh06',
  'swsh5':'swsh05','swsh4':'swsh04','swsh3':'swsh03','swsh2':'swsh02','swsh1':'swsh01',
  'sm12':'sm12','sm115':'sm11.5','sm11':'sm11','sm10':'sm10',
  'base1':'base1','base2':'base2','base3':'base3','base5':'base5',
  'neo1':'neo1','xy12':'xy12','xy1':'xy01','bw1':'bw01','hgss1':'hgss1'
};

// Japanese-exclusive TCGdex ids, keyed by our jp-* set id
const TCGDEX_JP = {
  // ── Mega Evolution (confirmed live from TCGdex) ──
  'jp-me-abyss':      ['M5'],        // アビスアイ Abyss Eye        118/81
  'jp-me-ninja':      ['M4'],        // ニンジャスピナー Ninja Spinner 120/83
  'jp-me-nihil':      ['M3'],        // ムニキスゼロ Nihil Zero      117/80
  'jp-me-dream':      ['M2a'],       // MEGAドリームex               250/193
  'jp-me-inferno':    ['M2'],        // インフェルノX Inferno X      116/80
  'jp-me-megsym':     ['M1S'],       // メガシンフォニア Mega Symphonia 92/63
  'jp-me-megbrave':   ['M1L'],       // メガブレイブ Mega Brave      92/63
  'jp-me-promo':      ['M-P'],       // メガ プロモカード

  // ── Scarlet & Violet ──
  'jp-sv-whiteflare': ['SV11W'],     // ホワイトフレア              174/86
  'jp-sv-blackbolt':  ['SV11B'],     // ブラックボルト              174/174
  'jp-sv-teamrocket': ['SV10'],      // ロケット団の栄光             98/98
  'jp-sv-hotair':     ['SV9a'],      // 熱風のアリーナ               92/63
  'jp-sv-battlep':    ['SV9'],       // バトルパートナーズ           132/100
  'jp-sv-terafest':   ['SV8a'],      // テラスタルフェスex          237/187
  'jp-sv-superelec':  ['SV8'],       // 超電ブレイカー              106/106
  'jp-sv-paradise':   ['SV7a'],      // 楽園ドラゴーナ               94/64
  'jp-sv-stellar':    ['SV7'],       // ステラミラクル              135/102
  'jp-sv-night':      ['SV6a'],      // ナイトワンダラー             64/64
  'jp-sv-mask':       ['SV6'],       // 変幻の仮面                  101/101
  'jp-sv-crimson':    ['SV5a'],      // クリムゾンヘイズ             96/66
  'jp-sv-cyber':      ['SV5M'],      // サイバージャッジ             71/71
  'jp-sv-wild':       ['SV5K'],      // ワイルドフォース             71/71
  'jp-sv-shiny':      ['SV4a'],      // レイジングサーフ            320/190
  'jp-sv-future':     ['SV4M'],      // 未来の一閃                   95/66
  'jp-sv-ancient':    ['SV4K'],      // 古代の咆哮                   95/66
  'jp-sv-raging':     ['SV3a'],      // レイジングサーフ             92/62
  'jp-sv-blackflame': ['SV3'],       // 黒炎の支配者                141/108
  'jp-sv-151':        ['SV2a'],      // ポケモンカード151           210/165
  'jp-sv-clay':       ['SV2D'],      // クレイバースト               99/71
  'jp-sv-snow':       ['SV2P'],      // スノーハザード               99/71
  'jp-sv-triplet':    ['SV1a'],      // トリプレットビート          103/73
  'jp-sv-scarlet':    ['SV1S','SV1V'], // スカーレットex / バイオレットex

  // ── Sword & Shield ──
  'jp-swsh-vstar':    ['S12a'],      // VSTARユニバース             254/172
  'jp-swsh-paradigm': ['S12'],       // パラダイムトリガー          125/98
  'jp-swsh-vmaxclim': ['S8b'],       // VMAXクライマックス          184/184
  'jp-swsh-startbirth':['S9'],       // スターバース                127/100
  'jp-swsh-dark':     ['S10a'],      // ダークファンタズマ           71/71
  'jp-swsh-lostabyss':['S11'],       // ロストアビス                100/100
  'jp-swsh-fusion':   ['S8'],        // フュージョンアーツ          100/100
  'jp-swsh-silver':   ['S6H','S6K'], // 白銀のランス / 漆黒のガイスト
  'jp-swsh-shiny':    ['S4a'],       // シャイニースターV           190/190
  'jp-swsh-sword':    ['S1W','S1H'], // ソード / シールド

  // ── Sun & Moon ──
  'jp-sm-tagteam':    ['SM12a'],     // TAG TEAM GX タッグオールスターズ 226/173
  'jp-sm-alter':      ['SM12'],      // オルタージェネシス          117/95
  'jp-sm-double':     ['SM10'],      // ダブルブレイズ              116/95
  'jp-sm-dream':      ['SM11b'],     // ドリームリーグ               75/49
  'jp-sm-remix':      ['SM11a'],     // リミックスバウト             64/64
  'jp-sm-miracle':    ['sn11'],      // ミラクルツイン               94/94

  // ── XY ──
  'jp-xy-evol':       ['CP6'],       // 20th Anniversary            87/87
  'jp-xy-premium':    ['CP4'],       // プレミアムチャンピオンパック 131/131

  // ── Older ──
  'jp-bw-black':      ['BW1'],
  'jp-hgss':          ['L1a','L1b'], // ハートゴールド / ソウルシルバー
  'jp-neo1':          ['neo1'],
  'jp-base1':         ['PMCG1']      // 拡張パック 第1弾            102/102
};

// Chinese sets map onto their JP/EN equivalents
const TCGDEX_ZH = {
  'zh-sv10':'sv10','zh-sv9':'sv09','zh-sv8pt5':'sv08.5','zh-sv8':'sv08',
  'zh-sv7':'sv07','zh-sv6pt5':'sv06.5','zh-sv5':'sv06','zh-sv3':'sv03',
  'zh-sv2':'sv02','zh-sv1':'sv01','zh-swsh15':'swsh12.5','zh-swsh7':'swsh06'
};

// Build the ordered candidate list for a given set + language
function tcgdexCandidates(setId, apiSetId, lang) {
  const out = [];
  if (lang === 'ja' && TCGDEX_JP[setId]) out.push(...TCGDEX_JP[setId]);
  if (lang === 'zh-tw' && TCGDEX_ZH[setId]) out.push(TCGDEX_ZH[setId]);
  if (TCGDEX_SETS[apiSetId]) out.push(TCGDEX_SETS[apiSetId]);
  out.push(apiSetId);
  if (TCGDEX_SETS[setId]) out.push(TCGDEX_SETS[setId]);
  // de-duplicate, preserve order
  return out.filter((v, i) => v && out.indexOf(v) === i);
}

// Probe candidates until one returns cards
async function tcgdexResolve(setId, apiSetId, lang) {
  const cands = tcgdexCandidates(setId, apiSetId, lang);
  for (const c of cands) {
    try {
      const r = await fetch(`${TCGDEX}/${lang}/sets/${c}`);
      if (!r.ok) continue;
      const d = await r.json();
      if (d && d.cards && d.cards.length) return { data: d, resolvedId: c };
    } catch (e) { /* next */ }
  }
  return null;
}

// ── CACHE ─────────────────────────────────────────────────────
const CACHE = {};
const TTL = 15 * 60 * 1000;
const cGet = k => { const e = CACHE[k]; return (e && Date.now() - e.ts < TTL) ? e.d : null; };
const cSet = (k, d) => { CACHE[k] = { d, ts: Date.now() }; };

const GM = {
  'Raw NM':1,'Raw LP':0.72,'Raw MP':0.48,
  'PSA 5':0.78,'PSA 6':1.05,'PSA 7':1.35,'PSA 8':1.95,'PSA 9':3.40,'PSA 10':7.20,
  'CGC 8':1.70,'CGC 9':2.90,'CGC 9.5':4.20,'CGC 10':6.20,
  'BGS 8':1.55,'BGS 9':2.65,'BGS 9.5':4.00,'SGC 9':2.20,'SGC 10':4.50
};

// ── HEALTH ────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  let dbState = 'not configured';
  let dbCounts = null;
  if (db) {
    try {
      const t0 = Date.now();
      const c = await db.query('SELECT COUNT(*)::int AS cards FROM cards /* digital:unfiltered - rows stored, not rows shown */');
      const p = await db.query('SELECT COUNT(*)::int AS prices FROM price_history');
      const real = await db.query(
        "SELECT COUNT(*)::int AS n FROM price_history WHERE source NOT LIKE 'estimate%'");
      dbState = `connected (${Date.now() - t0}ms)`;
      dbCounts = {
        cards: c.rows[0].cards,
        priceRecords: p.rows[0].prices,
        realPrices: real.rows[0].n
      };
    } catch (e) {
      dbState = 'QUERY FAILED: ' + e.message;
    }
  }
  res.json({
    status: 'ok',
    service: 'CardHunt API',
    version: '5.6.0',
    app: '/app',      // the frontend, served from here
    db: dbState,
    data: dbCounts,
    sources: ['cardhunt_db','pokemontcg.io','tcgdex.net','yahoo-jp','ebay-api','tcgplayer'],
    cache: Object.keys(CACHE).length + ' entries'
  });
});

// ── DB DEBUG — exactly what the database can see ─────────────
app.get('/api/db/check', async (req, res) => {
  if (!db) return res.json({ ok: false, reason: 'DATABASE_URL not set on this server' });
  const out = { ok: true, checks: {} };
  try {
    const v = await db.query('SELECT version()');
    out.checks.postgres = String(v.rows[0].version).split(' ').slice(0,2).join(' ');
  } catch (e) { return res.json({ ok: false, reason: e.message }); }

  try {
    const t = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' ORDER BY table_name`);
    out.checks.tables = t.rows.map(r => r.table_name);
  } catch (e) { out.checks.tables = 'ERROR ' + e.message; }

  try {
    const c = await db.query(`
      SELECT split_part(api_card_id,'-',1) AS lang, COUNT(*)::int AS n
      FROM cards /* digital:unfiltered - storage diagnostic */ GROUP BY 1 ORDER BY n DESC`);
    out.checks.cardsByLang = c.rows;
  } catch (e) { out.checks.cardsByLang = 'ERROR ' + e.message; }

  try {
    const s = await db.query(
      `SELECT api_card_id, name, set_api_id FROM cards /* digital:unfiltered - base1 probe */
       WHERE set_api_id = 'base1' ORDER BY api_card_id LIMIT 5`);
    out.checks.sampleBase1 = s.rows;
  } catch (e) { out.checks.sampleBase1 = 'ERROR ' + e.message; }

  try {
    const one = await db.query(
      `SELECT api_card_id, name FROM cards /* digital:unfiltered - base1 probe */ WHERE api_card_id = 'en-base1-4'`);
    out.checks.lookup_en_base1_4 = one.rows.length ? one.rows[0] : 'NOT FOUND';
  } catch (e) { out.checks.lookup_en_base1_4 = 'ERROR ' + e.message; }

  res.json(out);
});



// ── SETS ──────────────────────────────────────────────────────
app.get('/api/sets', async (req, res) => {
  try {
    const cached = cGet('sets');
    if (cached) return res.json(cached);
    const r = await fetch(`${TCG_API}/sets?pageSize=250&orderBy=-releaseDate`, { headers: TCG_H });
    const d = await r.json();
    cSet('sets', d);
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SET CARDS: TCGdex catalog + pokemontcg.io prices, MERGED ──
const RARITY_MAP = {
  'Special illustration rare':'Special Illustration Rare',
  'Illustration rare':'Illustration Rare',
  'Ultra Rare':'Rare Ultra','Ultra rare':'Rare Ultra',
  'Double rare':'Double Rare','Hyper rare':'Hyper Rare',
  'Secret Rare':'Rare Secret','Secret rare':'Rare Secret',
  'Rainbow Rare':'Rare Rainbow','Rainbow rare':'Rare Rainbow',
  'ACE SPEC rare':'ACE SPEC Rare','Holo Rare':'Rare Holo','Rare holo':'Rare Holo',
  'SAR':'Special Illustration Rare','SR':'Rare Ultra','UR':'Hyper Rare',
  'AR':'Illustration Rare','CHR':'Illustration Rare','CSR':'Rare Secret',
  'RRR':'Rare Ultra','RR':'Double Rare','HR':'Hyper Rare',
  'Mega hyper rare':'Hyper Rare','Mega attack rare':'Illustration Rare'
};
function normRarity(r) {
  if (!r) return 'Common';
  if (RARITY_MAP[r]) return RARITY_MAP[r];
  const l = String(r).toLowerCase();
  if (l.includes('special illustration')) return 'Special Illustration Rare';
  if (l.includes('illustration')) return 'Illustration Rare';
  if (l.includes('hyper')) return 'Hyper Rare';
  if (l.includes('secret')) return 'Rare Secret';
  if (l.includes('rainbow')) return 'Rare Rainbow';
  if (l.includes('ultra')) return 'Rare Ultra';
  if (l.includes('double')) return 'Double Rare';
  if (l.includes('holo')) return 'Rare Holo';
  if (l.includes('uncommon')) return 'Uncommon';
  if (l.includes('common')) return 'Common';
  if (l.includes('rare')) return 'Rare';
  return 'Common';
}

// Estimates come from estimator.js — the single implementation, shared with
// ingest.js and (over /estimator.js) the frontend. The table that used to sit
// here had no vintage multiplier while the frontend's had a 9x one, so the
// card page and the set page priced the same 1999 card differently depending
// on which had answered last.
//
// setRelease is what makes the difference, so every caller must pass it.
function estimatePrice(rarity, cardId, cardName, setRelease, number, setTotal) {
  return estimator.estimatePrice({
    rarity: normRarity(rarity), cardId, name: cardName,
    number, setTotal, setRelease
  });
}

function extractPrice(card) {
  const t = (card.tcgplayer && card.tcgplayer.prices) || {};
  for (const k of ['holofoil','1stEditionHolofoil','reverseHolofoil','1stEdition','unlimited','normal']) {
    if (t[k] && t[k].market > 0) return { price: t[k].market, source: 'tcgplayer_' + k };
    if (t[k] && t[k].mid > 0)    return { price: t[k].mid,    source: 'tcgplayer_' + k + '_mid' };
  }
  const cm = (card.cardmarket && card.cardmarket.prices) || {};
  if (cm.averageSellPrice > 0) return { price: cm.averageSellPrice, source: 'cardmarket_avg' };
  if (cm.trendPrice > 0)       return { price: cm.trendPrice,       source: 'cardmarket_trend' };
  return null;
}

app.get('/api/sets/:setId/cards', async (req, res) => {
  const { setId } = req.params;
  const lang = (req.query.lang || 'en').toLowerCase();
  const key = `set_${setId}_${lang}_v5`;
  try {
    const cached = cGet(key);
    if (cached) return res.json(cached);

    // ══ 1. OUR DATABASE — 39k+ cards with real market prices ══
    if (db) {
      try {
        const dbLang = lang;   // exact match only; zh-cn != zh-tw

        // The ingestion stored TCGdex's own set ids ("me02.5"), while the
        // frontend sends pokemontcg-style ids ("me2pt5"). Try every alias.
        const aliases = new Set([setId]);
        if (TCGDEX_SETS[setId]) aliases.add(TCGDEX_SETS[setId]);
        for (const [k, v] of Object.entries(TCGDEX_SETS)) {
          if (v === setId) aliases.add(k);
        }
        if (req.query.uiSetId && TCGDEX_JP[req.query.uiSetId]) {
          TCGDEX_JP[req.query.uiSetId].forEach(x => aliases.add(x));
        }
        if (TCGDEX_ZH[setId]) aliases.add(TCGDEX_ZH[setId]);
        // pt5 <-> .5 and zero-padding variants
        aliases.add(setId.replace('pt5', '.5'));
        aliases.add(setId.replace('.5', 'pt5'));
        const numMatch = setId.match(/^([a-z]+)(\d+)(.*)$/i);
        if (numMatch) {
          const [, pre, num, suf] = numMatch;
          aliases.add(`${pre}${String(num).padStart(2, '0')}${suf}`);
          aliases.add(`${pre}${String(num).replace(/^0+/, '')}${suf}`);
          aliases.add(`${pre}${String(num).padStart(2, '0')}${suf}`.replace('pt5', '.5'));
        }
        aliases.add(setId.toUpperCase());
        aliases.add(setId.toLowerCase());

        const rows = await db.query(`
          SELECT c.api_card_id, c.name, c.name_en, c.number, c.rarity, c.supertype,
                 c.image_small, c.image_large, c.image_lang,
                 c.set_api_id, c.set_name, c.set_name_en,
                 c.set_logo, c.set_series, c.set_release,
                 c.set_total, c.tcgplayer_data, c.cardmarket_data,
                 lp.price_usd, lp.source AS price_source, lp.recorded_at
          FROM cards c
          LEFT JOIN LATERAL (
            SELECT price_usd, source, recorded_at
            FROM price_history ph
            WHERE ph.card_api_id = c.api_card_id
              AND ph.grade IS NULL          -- the ungraded card, not a slab
              AND ${printsql.basePrintingSql('ph', 'c')}   -- never a reverse as the base (T10)
            ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
            LIMIT 1
          ) lp ON TRUE
          WHERE c.set_api_id = ANY($1)
            AND c.api_card_id LIKE $2
            AND ${digital.visibleSql('c')}
          ORDER BY NULLIF(regexp_replace(c.number,'[^0-9]','','g'), '')::int NULLS LAST,
                   c.number
        `, [[...aliases], dbLang + '-%']);

        // Hidden is an ANSWER, not an absence. Zero rows falls through to
        // live TCGdex below — which carries Pocket — so without this a
        // hidden set would be redrawn from TCGdex as estimates, the way 14
        // unaliased sets once collapsed to mockP().
        if (!rows.rows.length) {
          const hid = await db.query(`
            SELECT 1 FROM cards c /* digital:unfiltered - detects the hidden set */
            WHERE c.set_api_id = ANY($1) AND c.api_card_id LIKE $2
              AND NOT ${digital.visibleSql('c')} LIMIT 1`, [[...aliases], dbLang + '-%']);
          if (hid.rows.length) {
            return res.json({ totalCount: 0, data: [], lang: dbLang,
                              hidden: { setId, reason: digital.REASON } });
          }
        }

        if (rows.rows.length) {
          const cards = rows.rows.map(r => {
            const price = r.price_usd ? parseFloat(r.price_usd) : 0;
            const isEstimate = !r.price_source || /^estimate/.test(r.price_source);
            return {
              id: r.api_card_id,
              name: r.name,
              nameEn: r.name_en || null,
              number: r.number,
              rarity: r.rarity,
              supertype: r.supertype,
              set: { id: r.set_api_id, name: r.set_name,
                     nameEn: r.set_name_en || null, total: r.set_total,
                     logo: r.set_logo || null, serie: r.set_series || null,
                     releaseDate: r.set_release || null },
              images: { small: r.image_small, large: r.image_large },
              imageLang: r.image_lang || null,
              tcgplayer: r.tcgplayer_data || (price > 0 ? { prices: { holofoil: {
                market: price, low: +(price * 0.65).toFixed(2),
                mid: price, high: +(price * 1.7).toFixed(2) } } } : null),
              cardmarket: r.cardmarket_data || null,
              _price: price,
              _priceSource: r.price_source || 'estimate',
              _priceIsReal: !isEstimate,
              _priceDate: r.recorded_at,
              _source: 'cardhunt_db',
              _lang: dbLang
            };
          });
          const realCount = cards.filter(c => c._priceIsReal).length;
          const result = {
            totalCount: cards.length,
            data: cards,
            source: 'cardhunt_db',
            lang: dbLang,
            realPrices: realCount,
            resolvedSetId: cards[0].set.id,
            printedTotal: cards[0] ? cards[0].set.total : cards.length
          };
          cSet(key, result);
          return res.json(result);
        }
      } catch (e) {
        console.error('DB set query failed:', e.message);
      }
    }

    // ══ 2. FALLBACK — live TCGdex + pokemontcg.io for sets not ingested ══
    const pIndex = {};
    let enCards = [];
    try {
      let page = 1, total = 9999;
      while (enCards.length < total && page <= 10) {
        const r = await fetch(
          `${TCG_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`,
          { headers: TCG_H });
        if (!r.ok) break;
        const d = await r.json();
        if (!d.data || !d.data.length) break;
        enCards = enCards.concat(d.data);
        total = d.totalCount || enCards.length;
        page++;
      }
      enCards.forEach(c => {
        const p = extractPrice(c);
        const raw = String(c.number), bare = raw.replace(/^0+/, '');
        const rec = {
          price: p ? p.price : null, source: p ? p.source : null,
          tcgplayer: c.tcgplayer || null, cardmarket: c.cardmarket || null,
          rarity: c.rarity, supertype: c.supertype, images: c.images
        };
        pIndex[raw] = rec; pIndex[bare] = rec;
      });
    } catch (e) { /* continue */ }

    const setTotal = enCards.length
      ? Math.max(...enCards.map(c => parseInt(c.number) || 0)) : 0;

    function inferRarity(num, printedTotal, cardName) {
      const n = parseInt(num), t = parseInt(printedTotal);
      const nm = (cardName || '').toLowerCase();
      if (n && t && n > t) {
        if (nm.startsWith('mega ') || / vmax\b/.test(nm)) return 'Hyper Rare';
        if (/ ex\b/.test(nm) || / v\b/.test(nm)) return 'Special Illustration Rare';
        return 'Illustration Rare';
      }
      if (/^mega /.test(nm) && / ex\b/.test(nm)) return 'Double Rare';
      if (/ vmax\b/.test(nm))  return 'Rare Holo VMAX';
      if (/ vstar\b/.test(nm)) return 'Rare Holo VSTAR';
      if (/ ex\b/.test(nm))    return 'Double Rare';
      if (/ v\b/.test(nm))     return 'Rare Holo V';
      if (/ gx\b/.test(nm))    return 'Rare Holo GX';
      if (!n || !t) return 'Common';
      if (n > t * 0.93) return 'Rare Ultra';
      if (n > t * 0.86) return 'Illustration Rare';
      if (n > t * 0.72) return 'Rare Holo';
      if (n > t * 0.42) return 'Uncommon';
      return 'Common';
    }

    const tdLang = ['ja','zh-tw','fr','de','it','es','pt','ko'].includes(lang) ? lang : 'en';
    let tdCards = null, tdName = null, tdPrinted = 0, tdResolved = null, tdRelease = null;
    const probe = await tcgdexResolve(req.query.uiSetId || setId, setId, tdLang);
    // A set we never ingested can still be Pocket. TCGdex says so itself.
    if (probe && probe.data && digital.isDigitalSeries(probe.data.serie)) {
      return res.json({ totalCount: 0, data: [], lang: tdLang,
                        hidden: { setId, reason: digital.REASON } });
    }
    if (probe) {
      tdName = probe.data.name;
      tdRelease = probe.data.releaseDate || null;
      tdPrinted = (probe.data.cardCount &&
        (probe.data.cardCount.official || probe.data.cardCount.total)) || probe.data.cards.length;
      tdCards = probe.data.cards;
      tdResolved = probe.resolvedId;
    }

    if (tdCards && tdCards.length) {
      const printed = tdPrinted || setTotal || tdCards.length;
      const out = tdCards.map(c => {
        const num = String(c.localId), bare = num.replace(/^0+/, '');
        const pi = pIndex[num] || pIndex[bare] || {};
        const rarity = normRarity(pi.rarity || c.rarity) !== 'Common'
          ? normRarity(pi.rarity || c.rarity)
          : (inferRarity(num, printed, c.name) || normRarity(pi.rarity || c.rarity));
        const price = (pi.price && pi.price > 0)
          ? pi.price : estimatePrice(rarity, `${setId}-${num}`, c.name, tdRelease, num, printed);
        return {
          id: `${setId}-${num}`, name: c.name, number: num, rarity,
          supertype: pi.supertype || null,
          set: { id: setId, name: tdName, total: printed, releaseDate: tdRelease },
          images: {
            small: c.image ? `${c.image}/low.png` : (pi.images ? pi.images.small : ''),
            large: c.image ? `${c.image}/high.png` : (pi.images ? pi.images.large : '')
          },
          tcgplayer: pi.tcgplayer || { prices: { holofoil: {
            market: price, low: +(price*0.65).toFixed(2), mid: price, high: +(price*1.7).toFixed(2) } } },
          cardmarket: pi.cardmarket || null,
          _price: price,
          _priceSource: (pi.price && pi.price > 0) ? (pi.source || 'tcgplayer') : 'estimate',
          _priceIsReal: !!(pi.price && pi.price > 0),
          _source: 'tcgdex+pokemontcg', _lang: tdLang
        };
      });
      const result = { totalCount: out.length, data: out,
        source: 'tcgdex+pokemontcg', lang: tdLang,
        printedTotal: printed, tcgdexId: tdResolved };
      cSet(key, result);
      return res.json(result);
    }

    // ══ 3. pokemontcg.io only ══
    const out = enCards.map(c => {
      const p = extractPrice(c);
      let rarity = normRarity(c.rarity);
      if (!c.rarity) rarity = inferRarity(c.number, setTotal, c.name) || rarity;
      return Object.assign({}, c, {
        rarity,
        _price: p ? p.price : estimatePrice(rarity, c.id, c.name,
                    c.set && c.set.releaseDate, c.number, c.set && c.set.total),
        _priceSource: p ? p.source : 'estimate',
        _priceIsReal: !!p
      });
    });
    const result = { totalCount: out.length, data: out,
      source: 'pokemontcg', lang: 'en', printedTotal: setTotal };
    cSet(key, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/cards/:cardId', async (req, res) => {
  const { cardId } = req.params;
  try {
    if (db) {
      const variants = [cardId];
      const mm = String(cardId).match(/^([a-z-]+)-(.+)-(\w+)$/i);
      if (mm) {
        const [, lang, setId, num] = mm;
        variants.push(`${lang}-${setId}-${String(num).replace(/^0+/, '')}`,
                      `${lang}-${setId}-${String(num).padStart(3,'0')}`);
      }
      if (!/^[a-z]{2}(-[a-z]{2})?-/i.test(cardId)) {
        for (const L of ['en','ja','zh-tw','zh-cn']) variants.push(`${L}-${cardId}`);
      }
      // The same LATERAL join the set endpoint uses, and for the same
      // reason: prices live in price_history, not on the card row. Without
      // it this endpoint returned a card with no price at all, the frontend
      // fell through to its own estimator, and a card worth $45 on the set
      // page showed $0.66 on its own page. Two screens, one card, two
      // numbers — from one missing join.
      const row = await db.query(`
        SELECT c.*, lp.price_usd, lp.source AS price_source, lp.recorded_at
        FROM cards c
        LEFT JOIN LATERAL (
          SELECT price_usd, source, recorded_at
          FROM price_history ph
          WHERE ph.card_api_id = c.api_card_id
            AND ph.grade IS NULL            -- the ungraded card, not a slab
            AND ${printsql.basePrintingSql('ph', 'c')}   -- never a reverse as the base (T10)
          ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
          LIMIT 1
        ) lp ON TRUE
        WHERE c.api_card_id = ANY($1)
          AND ${digital.visibleSql('c')} AND ${cardid.ourIdSql('c')} LIMIT 1`, [[...new Set(variants)]]);
      if (!row.rows.length) {
        const hidden = await hiddenReason([...new Set(variants)]);
        if (hidden) return res.status(404).json({ error: 'hidden', hidden: { cardId, reason: hidden } });
      }
      if (row.rows.length) {
        const c = row.rows[0];
        const price = c.price_usd ? parseFloat(c.price_usd) : 0;
        const isEstimate = !c.price_source || /^estimate/.test(c.price_source);
        // T10: the printings this card exists in, and each NON-base
        // printing's latest real price. The headline (_price) is the base
        // printing — printsql.basePrintingSql — and these never replace it.
        const pkeys = printingsOf(c);
        const other = await db.query(`
          SELECT DISTINCT ON (variant) variant, price_usd::float AS price, source, recorded_at
          FROM price_history
          WHERE card_api_id = $1 AND grade IS NULL AND variant LIKE 'reverse%'
            AND source NOT LIKE 'estimate%' AND price_usd > 0
          ORDER BY variant, recorded_at DESC`, [c.api_card_id]).catch(() => ({ rows: [] }));
        const printingPrices = other.rows.map(r => ({ printing: r.variant, label: cm.printingLabel(r.variant),
          price: r.price, source: r.source, date: r.recorded_at }));
        return res.json({ data: {
          printings: pkeys ? pkeys.map(k => ({ key: k, label: cm.printingLabel(k) })) : null,
          printingPrices,
          id: c.api_card_id, name: c.name, nameEn: c.name_en || null,
          number: c.number, rarity: c.rarity,
          supertype: c.supertype,
          images: { small: c.image_small, large: c.image_large },
          imageLang: c.image_lang || null,
          // releaseDate is not decoration: the estimator's vintage multiplier
          // reads it, and withholding it priced a 1999 card as a 2024 one.
          set: { id: c.set_api_id, name: c.set_name,
                 nameEn: c.set_name_en || null, total: c.set_total,
                 logo: c.set_logo || null, serie: c.set_series || null,
                 releaseDate: c.set_release || null },
          // What we hold, or nothing. This used to INVENT a TCGplayer block
          // when none was held — low = price x 0.65, high = price x 1.7,
          // labelled `tcgplayer` — the T7 fabricated-numbers pattern on the
          // server side (found 2026-09-29, T10). The page never drew it; any
          // other reader of this API would have taken it as TCGplayer's.
          tcgplayer: c.tcgplayer_data || null,
          cardmarket: c.cardmarket_data || null,
          _price: price,
          _priceSource: c.price_source || 'estimate',
          _priceIsReal: !isEstimate,
          _priceDate: c.recorded_at,
          _source: 'cardhunt_db'
        }});
      }
    }
    // ── Not one of ours: refuse, never fetch it from pokemontcg.io ──
    // This used to fetch pokemontcg.io's card and (until 2fd8549) INSERT it
    // under pokemontcg.io's own id — the writer of me2pt5-294 and me55c-33.
    // Serving it without the INSERT was still serving a foreign-id card the
    // page would then alert on. A foreign id is a bug, not a card.
    if (!cardid.isOurCardId(cardId)) return res.status(400).json(cardid.refusal(cardId));
    res.status(404).json({ error: 'card not in catalogue', cardId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRENDING ─────────────────────────────────────────────────
// GET /api/trending?lang=en&sort=price-desc|price-asc|gain-pct|fall-pct|
//                   gain-usd|fall-usd&window=24h|7d|30d&limit=24
//
// Read-only. The rules about what may be ranked live in trending.js, with
// the measurements that justify them. There is no "most viewed": nothing
// records a card view, and the response says so rather than inventing an
// order. Cached like everything else here (15 min) — the price table
// changes nightly, and the cold query takes ~5s.
const trending = require('./trending');
app.get('/api/trending', async (req, res) => {
  const p = trending.parseParams(req.query);
  const key = `trending_${p.lang}_${p.sort}_${p.window}_${p.limit}`;
  const hit = cGet(key);
  if (hit) return res.json(Object.assign({}, hit, { cached: true }));
  if (!db) return res.status(503).json({ error: 'database not configured', cards: [] });
  const t0 = Date.now();
  try {
    let cards, eligible, extra = {};
    if (p.kind === 'price') {
      const r = await db.query(trending.priceSql(p));
      cards = r.rows;
      eligible = r.rows.length ? Number(r.rows[0].eligible) : 0;
    } else {
      const r = await db.query(trending.moverSql(p));
      const k = trending.rankMovers(r.rows, p.sort);
      cards = k.cards.slice(0, p.limit);
      eligible = k.eligible;
      extra = { ranked: k.cards.length, excluded: k.excluded, suspect: k.suspect };
    }
    const body = Object.assign({
      sort: p.sort, sortLabel: trending.SORTS[p.sort].label,
      window: p.kind === 'move' ? p.window : null,
      windowLabel: p.kind === 'move' ? trending.WINDOWS[p.window].label : null,
      lang: p.lang, count: cards.length, eligible,
      rule: trending.describeRule(p),
      unavailable: { 'most-viewed': 'Nothing records card views yet, so there is no data to rank by.' },
      cards: cards.map(c => ({
        id: c.id, name: c.name, nameEn: c.name_en || null, number: c.number,
        rarity: c.rarity, image: c.image_small || null,
        set: { id: c.set_api_id, name: c.set_name, nameEn: c.set_name_en || null },
        price: Number(c.price), priceSource: c.price_source, priceDate: c.price_date,
        priceIsReal: true,
        prevPrice: c.prev_price != null ? Number(c.prev_price) : undefined,
        prevDate: c.prev_date || undefined,
        change: c.change, changePct: c.change_pct, suspect: c.suspect || undefined,
      })),
      tookMs: Date.now() - t0, generatedAt: new Date().toISOString(), cached: false,
    }, extra);
    cSet(key, body);
    res.json(body);
  } catch (err) { res.status(500).json({ error: err.message, cards: [] }); }
});

// ── SEARCH ────────────────────────────────────────────────────
app.get('/api/cards', async (req, res) => {
  // ── Retired 2026-09-27: this was a straight proxy to pokemontcg.io ──
  // Every card it returned carried a pokemontcg.io id. Its only caller was
  // the page's legacy "full catalogue" search (deleted, and never able to
  // render). /api/search searches OUR catalogue under OUR ids; there is no
  // second catalogue to fall back to.
  res.status(410).json({ error: 'gone', data: [],
    reason: 'This proxied pokemontcg.io search, whose card ids are not ours. Use /api/search.' });
});

// ── PRICE ─────────────────────────────────────────────────────
app.get('/api/price/:cardId', async (req, res) => {
  const { cardId } = req.params;
  try {
    const cached = cGet(`price_${cardId}`);
    if (cached) return res.json(cached);

    // ══ 1. OUR DATABASE — real prices with full history ══
    if (db) {
      try {
        // Card ids vary in zero-padding and language prefix, so try
        // the obvious variants before falling back to a live lookup.
        const variants = [cardId];
        const m = String(cardId).match(/^([a-z-]+)-(.+)-(\w+)$/i);
        if (m) {
          const [, lang, setId, num] = m;
          const bare = String(num).replace(/^0+/, '');
          variants.push(
            `${lang}-${setId}-${bare}`,
            `${lang}-${setId}-${String(num).padStart(2,'0')}`,
            `${lang}-${setId}-${String(num).padStart(3,'0')}`
          );
        }
        // Also accept a bare pokemontcg-style id like "base1-4"
        if (!/^[a-z]{2}(-[a-z]{2})?-/i.test(cardId)) {
          for (const L of ['en','ja','zh-tw','zh-cn']) variants.push(`${L}-${cardId}`);
        }

        const card = await db.query(
          `SELECT * FROM cards WHERE api_card_id = ANY($1) AND ${digital.visibleSql()} AND ${cardid.ourIdSql()} LIMIT 1`,
          [[...new Set(variants)]]);
        if (!card.rows.length) {
          const hidden = await hiddenReason([...new Set(variants)]);
          if (hidden) return res.status(404).json({ error: 'hidden', hidden: { cardId, reason: hidden } });
        }
        if (card.rows.length) {
          const c = card.rows[0];
          const realId = c.api_card_id;
          const hist = await db.query(`
            SELECT ph.price_usd, ph.source, ph.marketplace, ph.recorded_at
            FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
            -- digital:unfiltered — this card was resolved through visibleSql just
            -- above; the join only reads its variants for the base-printing rule.
            WHERE ph.card_api_id = $1 AND ph.grade IS NULL
              AND ${printsql.basePrintingSql('ph', 'c')}   -- never a reverse as the base (T10)
            ORDER BY ph.recorded_at DESC LIMIT 60`, [realId]);

          const real = hist.rows.filter(h => !/^estimate/.test(h.source || ''));
          const best = real[0] || hist.rows[0];
          const rawNm = best ? parseFloat(best.price_usd) : 0;

          const grades = {};
          Object.entries(GM).forEach(([g, m]) => {
            grades[g] = parseFloat((rawNm * m).toFixed(2));
          });

          const prices = real.map(h => parseFloat(h.price_usd)).filter(v => v > 0);
          const result = {
            cardId: realId, requestedId: cardId,
            name: c.name, nameEn: c.name_en || null, rarity: c.rarity,
            set: { id: c.set_api_id, name: c.set_name,
                   nameEn: c.set_name_en || null, total: c.set_total },
            images: { small: c.image_small, large: c.image_large },
            rawNm: parseFloat(rawNm.toFixed(2)),
            source: best ? best.source : 'none',
            isReal: !!real.length,
            marketplace: best ? best.marketplace : null,
            grades,
            observations: real.length,
            low: prices.length ? Math.min(...prices) : null,
            high: prices.length ? Math.max(...prices) : null,
            history: hist.rows.map(h => ({
              price: parseFloat(h.price_usd),
              source: h.source,
              date: h.recorded_at
            })),
            tcgplayer_prices: c.tcgplayer_data || null,
            cardmarket_prices: c.cardmarket_data || null,
            updated: best ? best.recorded_at : null,
            _source: 'cardhunt_db'
          };
          cSet(`price_${cardId}`, result);
          cSet(`price_${realId}`, result);
          return res.json(result);
        }
      } catch (e) { console.error('DB price query failed:', e.message); }
    }

    // ══ 2. FALLBACK — live pokemontcg.io ══
    // Strip our language prefix; pokemontcg uses bare ids like "base1-4"
    const bareId = String(cardId).replace(/^(en|ja|zh-tw|zh-cn)-/, '');
    let c = null;
    for (const tryId of [...new Set([bareId, cardId])]) {
      try {
        const r = await fetch(`${TCG_API}/cards/${tryId}`, { headers: TCG_H });
        if (!r.ok) continue;
        const txt = await r.text();
        if (!txt) continue;
        const d = JSON.parse(txt);
        if (d && d.data) { c = d.data; break; }
      } catch (e) { /* try next */ }
    }
    if (!c) return res.status(404).json({
      error: 'Not found',
      requestedId: cardId,
      note: 'Not in the CardHunt database and not found on pokemontcg.io'
    });

    const t = (c.tcgplayer && c.tcgplayer.prices) || {};
    let rawNm = 0, source = 'none';
    for (const key of ['holofoil','1stEditionHolofoil','reverseHolofoil','1stEdition','unlimited','normal']) {
      if (t[key] && t[key].market > 0) { rawNm = t[key].market; source = key; break; }
      if (t[key] && t[key].mid > 0)    { rawNm = t[key].mid;    source = key + '_mid'; break; }
    }
    if (!rawNm && c.cardmarket && c.cardmarket.prices) {
      rawNm = c.cardmarket.prices.averageSellPrice || c.cardmarket.prices.trendPrice || 0;
      if (rawNm) source = 'cardmarket';
    }

    const grades = {};
    Object.entries(GM).forEach(([g, m]) => { grades[g] = parseFloat((rawNm * m).toFixed(2)); });

    // ── DO NOT WRITE THIS INTO price_history ──────────────────
    // A read endpoint must never write. This fired on every view of a card
    // absent from our database, inserting a pokemontcg.io-derived price
    // keyed by the RAW REQUESTED id (`sv3pt5-4`, not `en-sv03.5-004`) —
    // so it accumulated rows under ids that match no card we hold.
    //
    // Milder than the /api/market/ incident, which matched on name and set
    // with no collector number and overwrote Mega Gengar ex #284 at $1,056
    // with $3.14 — the price of #125. Same pattern though, and the reason
    // that one was invisible for so long: it fired on views, wrote through
    // the endpoint that reads, and labelled itself a market price.
    //
    // price_history is written by the ingest pipeline ONLY, which matches on
    // collector number and refuses to guess. If this fallback price is worth
    // keeping, ingest it deliberately — do not let a page view persist it.

    const result = {
      cardId, name: c.name, rarity: c.rarity,
      rawNm: parseFloat(rawNm.toFixed(2)), source, grades,
      isReal: rawNm > 0,
      tcgplayer_url: (c.tcgplayer && c.tcgplayer.url) || null,
      cardmarket_url: (c.cardmarket && c.cardmarket.url) || null,
      tcgplayer_prices: t,
      updated: (c.tcgplayer && c.tcgplayer.updatedAt) || new Date().toISOString(),
      _source: 'pokemontcg'
    };
    cSet(`price_${cardId}`, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════════════════════
// EBAY BROWSE API  — real active listings + sold comparables
// Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Render env vars.
// Get them free at https://developer.ebay.com (10 min signup)
// ══════════════════════════════════════════════════════════════
// ── Credentials are read AT CALL TIME, never captured at module load ──
//
// They used to be two module-level consts. `/ebay/status` read
// process.env inside its handler and reported "credentials present";
// `sourceEbay` read the consts and reported "not set" — same process,
// same variables, opposite answers, which is what sent us looking here.
//
// Reading live costs nothing and removes the whole class of question.
// It also means a credential added without a restart takes effect.
function ebayCreds() {
  return {
    id: process.env.EBAY_CLIENT_ID || '',
    secret: process.env.EBAY_CLIENT_SECRET || ''
  };
}
function ebayConfigured() {
  const c = ebayCreds();
  return !!(c.id && c.secret);
}

let ebayToken = null, ebayTokenExp = 0, ebayTokenCredKey = '';

/**
 * Acquire an eBay OAuth token, SAYING WHY when it cannot.
 *
 * The old version returned a bare `null` for four unrelated causes:
 * credentials missing, eBay rejecting the exchange, a network failure,
 * and a malformed response. `sourceEbay` then reported all four as
 * "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set" — a specific,
 * confident, and frequently false diagnosis. That is the CLAUDE.md
 * failure "a tool that cannot check something must say so": a missing
 * path reported as a finding.
 *
 * Returns { token, error, unconfigured, detail }.
 *   unconfigured true  ONLY when the credentials are genuinely absent.
 *   error             what actually went wrong, in eBay's own words.
 */
async function getEbayTokenDetailed(opts) {
  const { id, secret } = ebayCreds();
  if (!id || !secret) {
    const missing = [!id && 'EBAY_CLIENT_ID', !secret && 'EBAY_CLIENT_SECRET']
      .filter(Boolean).join(' and ');
    return { token: null, unconfigured: true, error: `${missing} not set` };
  }

  // Re-authenticate if the credentials changed under us, rather than
  // serving a token minted from the old pair.
  const credKey = `${id}:${secret.length}`;
  if (ebayToken && Date.now() < ebayTokenExp && ebayTokenCredKey === credKey) {
    return { token: ebayToken, cached: true };
  }

  const auth = Buffer.from(`${id}:${secret}`).toString('base64');

  // Through ebaycall like every other eBay request, so the token exchange
  // is queued, paced, kill-switched and — above all — COUNTED. TASK.md T1:
  // the expires_in bug re-authenticated on every call and spent the daily
  // quota on auth rather than searches, invisibly, because nothing counted
  // token calls. `kind: 'token'` makes that spend visible in /api/ebay/quota.
  const call = await ebay.fetchEbay(db, {
    url: 'https://api.ebay.com/identity/v1/oauth2/token',
    method: 'POST',
    basic: auth,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' +
          encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    kind: 'token',
    background: !!(opts && opts.background),
    meta: { cardId: 'token-exchange' }
  });

  if (call.blocked) {
    // A guard refusing is not a credential problem. Reporting it as one is
    // the `null is not a diagnosis` failure that cost days.
    return { token: null, blocked: call.blocked, error: call.error || call.reason,
             reason: call.reason, remaining: call.remaining,
             resetsInMinutes: call.resetsInMinutes };
  }
  if (!call.ok) {
    // Keep the wording that made this diagnosable. "eBay rejected the token
    // exchange: HTTP 401 — invalid_client: client authentication failed"
    // names the failing step AND eBay's own reason; a bare HTTP code sends
    // the reader back to checking environment variables that are correct.
    // A host we could not reach never rejected anything. Prefixing it with
    // "rejected the token exchange" points at the credentials when the fault
    // is the network — the same misdirection that cost days last time.
    if (call.transport || call.status === undefined) {
      return { token: null, error: call.reason };
    }
    const detail = String(call.reason || '').replace(/^eBay returned /, '');
    return { token: null, status: call.status,
             error: `eBay rejected the token exchange: ${detail}` };
  }

  const d = call.data;
  // A 200 carrying something unparseable is a different fault from a 200
  // carrying valid JSON without the field — a proxy error page versus eBay
  // changing its response. Reporting both as "no access_token" loses that.
  if (call.nonJson) {
    return { token: null, error: 'eBay returned a non-JSON token response' };
  }
  if (!d || !d.access_token) {
    return { token: null, error: 'eBay returned 200 with no access_token' };
  }
  // expires_in absent would make the expiry NaN, and `Date.now() < NaN`
  // is false — the token would be re-fetched on every single call
  // rather than cached. Default to eBay's documented 7200s.
  const ttl = Number.isFinite(d.expires_in) ? d.expires_in : 7200;

  ebayToken = d.access_token;
  ebayTokenExp = Date.now() + (ttl - 60) * 1000;
  ebayTokenCredKey = credKey;
  return { token: ebayToken, expiresIn: ttl };
}

// Back-compat wrapper for callers that only want the token.
async function getEbayToken() {
  return (await getEbayTokenDetailed()).token;
}

// ══════════════════════════════════════════════════════════════
// ALERTS  ·  PORTFOLIO  ·  HISTORY
//
// These three groups existed in v4.1 and were dropped from the v5.x
// rewrite — six routes lost silently, including every alerts route, while
// the notes still said "/api/alerts works". Restored here.
//
// An alert records WHICH listing tripped it (triggered_url / _title /
// _price / _source), because "Charizard hit $400" is not actionable
// without the link to the $400 copy. `node ingest.js alerts` does the
// evaluating; see T3 in CLAUDE.md.
// ══════════════════════════════════════════════════════════════
app.get('/api/alerts/:userId', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = await db.query(
      "SELECT * FROM alerts WHERE user_id=$1 AND status<>'deleted' ORDER BY created_at DESC",
      [req.params.userId]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'database not configured' });
  try {
    const b = req.body || {};
    if (!b.card_api_id || !b.alert_type)
      return res.status(400).json({ error: 'card_api_id and alert_type are required' });
    // Alert 5 was created on me55c-33, a pokemontcg.io id. Never again.
    if (!cardid.isOurCardId(b.card_api_id)) return res.status(400).json(cardid.refusal(b.card_api_id));
    const row = await db.query(`
      INSERT INTO alerts (user_id,card_api_id,card_name,card_img,set_name,grade,
        alert_type,target_price,marketplace,notify,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') RETURNING *`,
      [b.user_id, b.card_api_id, b.card_name, b.card_img, b.set_name,
       b.grade, b.alert_type, b.target_price, b.marketplace, b.notify]);
    res.json(row.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/alerts/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'database not configured' });
  try {
    await db.query('UPDATE alerts SET status=$1,updated_at=NOW() WHERE id=$2',
      [req.body.status, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Everything that has fired, newest first — what the bell badge reads.
app.get('/api/alerts/:userId/triggered', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = await db.query(`
      SELECT id, card_api_id, card_name, card_img, set_name, grade, alert_type,
             target_price, triggered_price, triggered_source, triggered_url,
             triggered_title, triggered_at, trigger_count
      FROM alerts
      WHERE user_id=$1 AND status='triggered'
      ORDER BY triggered_at DESC NULLS LAST`, [req.params.userId]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/portfolio/:userId', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = await db.query('SELECT * FROM portfolio WHERE user_id=$1 ORDER BY created_at DESC',
      [req.params.userId]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/portfolio', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'database not configured' });
  try {
    const b = req.body || {};
    if (!cardid.isOurCardId(b.card_api_id)) return res.status(400).json(cardid.refusal(b.card_api_id));
    const row = await db.query(`
      INSERT INTO portfolio (user_id,card_api_id,card_name,card_img,set_name,grade,quantity,purchase_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.user_id, b.card_api_id, b.card_name, b.card_img, b.set_name,
       b.grade, b.quantity || 1, b.purchase_price || 0]);
    res.json(row.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/history/:cardId — measured, ungraded price observations, one
// series per market.
//
// This used to average every row for the card per day, estimates included
// and across sources — a tcgplayer_market row, a 1st Edition row and an
// estimate on the same day became one "price". Nothing called it, and the
// card page drew a SYNTHETIC curve instead (the current price times a fixed
// shape, plus Math.random() for "sold"). The card page now draws this, so
// it has to be something a buyer can rely on:
//   * estimates never appear;
//   * one series per source + edition + variant — editions are separate
//     markets, and averaging across sources manufactures movement;
//   * `series` names each one, so the page can draw the card's own market.
// No date limit: price_history starts 2026-07-27, and "All" means all.
app.get('/api/history/:cardId', async (req, res) => {
  if (!db) return res.json({ data: [], series: [] });
  try {
    const rows = await db.query(`
      SELECT DATE_TRUNC('day', recorded_at) AS date,
             -- yahoojp_N carries its sample size in the NAME (yahoojp_3,
             -- yahoojp_21). One market, so one series; left apart, every
             -- Yahoo observation became a single-point series of its own.
             CASE WHEN source ~ '^yahoojp_[0-9]+$' THEN 'yahoojp' ELSE source END AS source,
             COALESCE(edition, '') AS edition, COALESCE(variant, '') AS variant,
             AVG(price_usd)::float AS price, COUNT(*)::int AS n
      FROM price_history
      WHERE card_api_id = $1 AND grade IS NULL
        AND source NOT LIKE 'estimate%' AND price_usd > 0
      GROUP BY 1, 2, 3, 4 ORDER BY 1`, [req.params.cardId]);
    const series = {};
    for (const r of rows.rows) {
      const key = [r.source, r.edition, r.variant].filter(Boolean).join(' · ');
      (series[key] = series[key] || { key, source: r.source, edition: r.edition || null,
        variant: r.variant || null, points: [] }).points.push({ date: r.date, price: r.price, n: r.n });
    }
    res.json({ cardId: req.params.cardId, series: Object.values(series),
      note: 'Measured, ungraded prices only. Estimates are never included.' });
  } catch (err) { res.status(500).json({ error: err.message, series: [] }); }
});

// ══════════════════════════════════════════════════════════════
// LIVE LISTINGS  —  GET /api/listings/:cardId?grade=PSA+10
//
// Real listings from every reachable marketplace, cheapest LANDED cost
// first, each row linking to that specific item.
//
// Source status, measured 2026-08-20 — do not re-derive these:
//   Yahoo Auctions JP  WORKS. __NEXT_DATA__ carries items[] with title,
//                      price, auctionId, category and shipping.
//   Mercari JP         NOT AVAILABLE by page fetch. It is an App Router
//                      app: no __NEXT_DATA__, results stream as
//                      `self.__next_f` flight data and the initial HTML
//                      contains ZERO item ids (checked /m\d{11}/ on a
//                      371KB response). api.mercari.jp rejects unsigned
//                      calls with 400 — it wants DPoP. Needs a real
//                      client, not a parser.
//   Cardmarket         BLOCKED. Cloudflare returns 403 "Attention
//                      Required" to a plain fetch of /Products/Search.
//   eBay               Ready but needs credentials; see ebayBrowseActive.
//
// Everything is filtered through jpfilter, the SAME module ingest.js
// prices with, so a lot excluded from a median can never appear here as a
// single card.
// ══════════════════════════════════════════════════════════════
const jpf = require('./jpfilter');
// The Yuyu-tei parser, shared with the local ingest tool rather than copied
// into the server. It answers Render (probed both ways, 2026-09-20), needs
// no database and no credential — so "local tooling" no longer describes it,
// and .gitignore says why it is now tracked.
const yt = require('./yuyutei');
// Rates with their provenance attached. jpfilter still converts Yahoo yen at
// a hardcoded JPY_PER_USD = 157; the live ECB rate is 157.98 today, so the
// two differ by ~0.6% — small now, frozen forever if nothing prints it.
const fx = require('./fx');

const LISTING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                 + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Card resolution ───────────────────────────────────────────
// The frontend is a pokemontcg.io client: it holds ids like `sv3pt5-4`,
// not ours (`en-sv03.5-004`). Rather than make the browser translate,
// resolve tolerantly here — both conventions, padded or bare numbers.
//
//   pokemontcg.io  sv3pt5-4     swsh12pt5gg-70   base1-4
//   ours           en-sv03.5-4  en-swsh12.5gg-70 en-base1-4
function listingIdCandidates(cardId) {
  const raw = String(cardId).trim();
  const out = new Set([raw]);

  const m = raw.match(/^(.*)-([^-]+)$/);
  if (!m) return [...out];
  let [, setPart, num] = m;

  // strip a language prefix if one is already present
  const langM = setPart.match(/^(en|ja|zh-tw|zh-cn)-(.+)$/);
  const knownLang = langM ? langM[1] : null;
  if (langM) setPart = langM[2];

  // pokemontcg.io writes ".5" as "pt5"
  const setForms = new Set([setPart, setPart.replace(/pt(\d)/gi, '.$1')]);
  // some of our ids zero-pad the numeric block (sv3 -> sv03), others do not
  for (const f of [...setForms]) {
    setForms.add(f.replace(/^([a-z]+)(\d)(?![\d])/i, '$10$2'));
    setForms.add(f.replace(/^([a-z]+)(\d)\./i, '$10$2.'));
    setForms.add(f.replace(/^([a-z]+)0(\d)/i, '$1$2'));
  }

  const numForms = new Set([num, String(num).replace(/^0+/, ''),
                            String(num).padStart(2, '0'), String(num).padStart(3, '0')]);
  const langs = knownLang ? [knownLang] : ['en', 'ja', 'zh-tw', 'zh-cn'];

  for (const s of setForms)
    for (const n of numForms) {
      out.add(`${s}-${n}`);
      for (const l of langs) out.add(`${l}-${s}-${n}`);
    }
  return [...out];
}

// If any of these ids is one of OUR cards but hidden (digital.js), the reason;
// otherwise null. Used where "not found" would send a caller to a fallback
// that fetches the card from somewhere else and shows it anyway.
async function hiddenReason(ids) {
  if (!db) return null;
  const r = await db.query(
    `SELECT 1 FROM cards c /* digital:unfiltered - detects a hidden card */
     WHERE c.api_card_id = ANY($1) AND NOT ${digital.visibleSql('c')} LIMIT 1`, [ids]);
  return r.rows.length ? digital.REASON : null;
}

async function resolveListingCard(cardId) {
  if (!db) return null;
  // set_release and set_name_en are NOT optional extras — they are the two
  // gates' only inputs, and omitting them is how both were installed and
  // dead at the same time:
  //
  //   set_release -> matchCard.setYear. Without it setYear is null, the
  //   `if (card.setYear)` guard in cardmatch never passes, and the year
  //   discriminator cannot fire on ANY live route. It silently kept a 2021
  //   Celebrations reprint against a 1999 Base Set card — which is the
  //   $536-to-$249,999 spread the discriminator was written for. Nothing
  //   reported it, because a gate that is never reached looks exactly like
  //   a gate that finds nothing.
  //
  //   set_name_en -> the set name we ASK eBay for. Falling back to set_name
  //   sends a Japanese set name to eBay US, which answers with nothing.
  //
  // Whatever this query stops selecting, those gates stop working.
  const r = await db.query(
    `SELECT api_card_id, name, name_en, number, rarity, set_api_id, set_name,
            set_name_en, set_total, set_release, image_small, variants
     FROM cards WHERE api_card_id = ANY($1)
       AND ${digital.visibleSql()} AND ${cardid.ourIdSql()} LIMIT 1`, [listingIdCandidates(cardId)]);
  return r.rows[0] || null;
}

// The number-matched price for one card id, or null.
//
// Same LATERAL join /api/cards/:cardId and the set endpoint use — one
// derivation of "what is this card worth", not a third. `grade IS NULL` means
// the ungraded card rather than a slab, and the ORDER BY prefers a real price
// over an estimate before falling back to recency.
async function numberMatchedPrice(cardId) {
  if (!db || !cardId) return null;
  const r = await db.query(`
    SELECT c.api_card_id, c.name, c.number, c.set_name, lp.price_usd,
           lp.source AS price_source, lp.recorded_at
    FROM cards c
    LEFT JOIN LATERAL (
      SELECT price_usd, source, recorded_at
      FROM price_history ph
      WHERE ph.card_api_id = c.api_card_id
        AND ph.grade IS NULL
        AND ${printsql.basePrintingSql('ph', 'c')}   -- never a reverse as the base (T10)
      ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE c.api_card_id = ANY($1)
      AND ${digital.visibleSql('c')} AND ${cardid.ourIdSql('c')} LIMIT 1`, [listingIdCandidates(cardId)]);
  if (!r.rows.length) return null;
  const c = r.rows[0];
  const price = c.price_usd ? parseFloat(c.price_usd) : 0;
  const isEstimate = !c.price_source || /^estimate/.test(c.price_source);
  return { cardId: c.api_card_id, name: c.name, number: c.number,
           setName: c.set_name, price, source: c.price_source || 'estimate',
           isReal: !isEstimate && price > 0, recordedAt: c.recorded_at };
}

// ── Attribution ───────────────────────────────────────────────
// eBay's terms: data shown must be identifiably eBay's, and nothing may
// imply affiliation or endorsement. "Listings from eBay" states the source
// without claiming a relationship; every eBay row also carries `url`
// pointing at the item ON eBay, never at a reseller or an affiliate wrapper.
const EBAY_ATTRIBUTION = {
  ebay: {
    label: 'Listings from eBay',
    note: 'Live listing data from the eBay Browse API. Links open the item on eBay.',
    // Explicitly NOT a partnership claim. See CLAUDE.md.
    affiliated: false,
    home: 'https://www.ebay.com'
  }
};

// ── Cache ─────────────────────────────────────────────────────
// Live listings go stale, but re-fetching on every render gets us
// rate-limited — Yahoo is already throttled to one request per 3s in the
// price pipeline. 15 minutes per card+grade.
const LISTING_TTL = 15 * 60 * 1000;
const listingCache = new Map();
const listingKey = (cardId, grade) => `${cardId}|${String(grade).toUpperCase()}`;

// eBay's terms require that prices and availability are not shown as more
// current than they are. A 14-minute-old price served silently as "live" is
// exactly the misrepresentation they mean, so every cached response carries
// its own age and the client is told in words how old it is.
function listingCacheGet(cardId, grade) {
  const e = listingCache.get(listingKey(cardId, grade));
  if (!e) return null;
  const ageMs = Date.now() - e.ts;
  if (ageMs > LISTING_TTL) { listingCache.delete(listingKey(cardId, grade)); return null; }
  const ageSec = Math.round(ageMs / 1000);
  return {
    ...e.data,
    cached: true,
    cachedAgeSec: ageSec,
    freshness: {
      cached: true,
      ageSeconds: ageSec,
      maxAgeSeconds: Math.round(LISTING_TTL / 1000),
      note: ageSec < 60
        ? `cached ${ageSec}s ago`
        : `cached ${Math.round(ageSec / 60)} min ago — prices and availability may have changed`
    },
    attribution: EBAY_ATTRIBUTION
  };
}
function listingCacheSet(cardId, grade, data, ts) {
  // `ts` is kept by a continuation: rows arriving later never make the
  // entry look fresher than its oldest row.
  listingCache.set(listingKey(cardId, grade), { ts: ts || Date.now(), data });
  // keep the map from growing without bound on a long-lived dyno
  if (listingCache.size > 500) {
    const oldest = [...listingCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) listingCache.delete(oldest[0]);
  }
}

// ── Normalised listing shape ──────────────────────────────────
// Every source returns exactly this. `shipping: null` means the source did
// not state it — the caller must not read that as free, hence shippingKnown.
function normaliseListing(o) {
  const price = Number(o.price) || 0;
  const shipping = (o.shipping === null || o.shipping === undefined || !Number.isFinite(Number(o.shipping)))
    ? null : Number(o.shipping);
  return {
    source: o.source,
    sourceLabel: o.sourceLabel || o.source,
    title: o.title || '',
    price: +price.toFixed(2),
    currency: o.currency || 'USD',
    priceOriginal: o.priceOriginal ?? null,
    currencyOriginal: o.currencyOriginal ?? null,
    shipping,
    shippingKnown: shipping !== null,
    landed: +(price + (shipping || 0)).toFixed(2),
    condition: o.condition || 'Raw',
    seller: o.seller || null,
    url: o.url || null,
    imageUrl: o.imageUrl || null,
    endsAt: o.endsAt || null,
    bids: Number.isFinite(o.bids) ? o.bids : null,
    listingType: o.listingType || null,
    // Live means buyable right now. An ended auction is a comparable, not an
    // offer, and the UI must not present the two as the same thing.
    live: o.live !== false,
    country: o.country || null,
    // Per-row attribution. eBay requires their data be identifiably theirs
    // wherever it appears, and a row can be rendered far from the response
    // envelope that carries the source list — so the row states it itself.
    // `url` above already points at the item on eBay.
    attribution: o.source === 'ebay' ? 'Listing from eBay' : null,
    // What KIND of number this is. A shop's asking price, an auction's
    // current bid and a realised sale are three different things, and this
    // project has already averaged across that distinction once.
    //
    // On the row, for the same reason `attribution` is: a row gets
    // rendered far from the response envelope that names its source, and
    // by then "which kind of price is this" has no other answer.
    // null means an ordinary marketplace listing price.
    priceKind: o.priceKind || null,
    // ── Labels, carried through ──
    // sourceEbay works these out from the seller's title and they were being
    // dropped right here: this function returns a fixed shape, and edition
    // was not in it. So "1st Edition" never reached the row that exists to
    // say which Charizard this is — and T2 cannot separate editions it
    // cannot see. Labels, never gates: nothing below is rejected on.
    edition: o.edition || null,
    variant: o.variant || null,
    parsedRarity: o.parsedRarity || null,
    parsedYear: o.parsedYear || null,
    matchConfidence: o.matchConfidence || null,
    // ── Raw sub-condition, as the SELLER stated it ──
    // Measured 2026-09-22 on 447 live rows: eBay's structured `condition`
    // field is binary — 441 "Ungraded" plus 6 localisations, identical
    // whichever condition was requested. There is no structured condition
    // scale to filter on, so this is read from the seller's title and is a
    // CLAIM, not a measurement. `sellerStated:false` means the title said
    // nothing, which is 49.7% of them — those belong in an "unstated"
    // group and must never be dropped.
    //
    // A label, exactly like `edition` above. Nothing is rejected on it.
    sellerCondition: o.sellerCondition || null,
    sellerStated: o.sellerStated === true,
    // WHERE the condition came from: 'ebay' is eBay's structured Card
    // Condition (the search was filtered on it), 'title' is prose. Dropped
    // here, the page could not tell a marketplace field from a guess.
    conditionSource: o.conditionSource || null,
    gradeSource: o.gradeSource || null,
    titleCondition: o.titleCondition || null,
    // eBay Browse item id — the handle for an on-demand cert check. Served
    // with the row like the url is; never stored (eBay's terms).
    itemId: o.itemId || null,
    // What the title states about its PRINTING (T10). Dropped here on the
    // first deploy, exactly as `edition` once was: the gate refused
    // correctly on live eBay, and every kept row still arrived "unstated",
    // so the page grouped a "Reverse Holo" title as printing-not-stated.
    printing: o.printing || null,
    printingStated: o.printingStated === true,
    // ── Where it was found, and whose shipping quote this is (T1) ──
    // `marketplace` is the eBay site that returned the row; `shippingTo` the
    // country that site quotes shipping for. Never a filter — a row that
    // does not ship somewhere stays in the list, saying what is known.
    marketplace: o.marketplace || null,
    shippingTo: o.shippingTo || null,
    // The conversion that produced `price`, e.g. "GBP->USD @1.3497 (ecb …)".
    fx: o.fx || null
  };
}

// ══════════════════════════════════════════════════════════════
// SOURCES
//
// One function per marketplace, all returning the same normalised shape,
// all run concurrently through Promise.allSettled so a slow or dead source
// degrades that row only — it can never block or fail the response.
//
// Status measured 2026-08-20/26 — do not re-derive:
//   Yahoo Auctions JP  WORKS. __NEXT_DATA__ carries items[] with title,
//                      price, auctionId, category and shipping.
//   eBay               Ready, dormant. Activates the moment
//                      EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are set.
//   Mercari JP         NOT reachable by page fetch. App Router: no
//                      __NEXT_DATA__, results stream as `self.__next_f`,
//                      and the initial 371KB of HTML contains ZERO item
//                      ids. api.mercari.jp rejects unsigned calls (400) —
//                      it wants DPoP. Needs a signing client, not a parser.
//   Cardmarket         BLOCKED. Cloudflare 403 on a plain fetch.
//   Facebook Mktpl.    Login-gated. Deep link only — never scrape.
//   Local shops        No API. Deep link only.
//
// Every source filters through jpfilter, the SAME module ingest.js prices
// with, so a lot excluded from a median can never appear here as a card
// for sale.
// ══════════════════════════════════════════════════════════════

// The filter speaks { name, number, setTotal, setId }; a cards row speaks
// set_total / set_api_id. Convert in ONE place — passing the raw row leaves
// setTotal undefined, and since the filter fails closed that silently
// rejects every listing rather than returning wrong ones.
// ── The language the gate will read, derived ONCE ─────────────
// Both card builders did this inline, with the same comment copied above
// each: `String(card.api_card_id || '').split('-')[0] || null`. Two copies
// of one derivation is how the year gate ended up installed on one path
// and dead on the other.
//
// The parsing itself lives in cardmatch, beside cardLanguage, which held a
// third copy of the same regex. This is a one-line adapter, not a fourth.
//
// A catalogue row always has an api_card_id, so null here means the caller
// handed the gate something that did not come from the catalogue. That is a
// defect, and `sources[x].gateWarning` says so rather than the language
// check quietly not running.
function gateLanguage(card) {
  return cm.languageFromCardId(card && card.api_card_id);
}

// The printings a card exists in, from cards.variants (TASK T10), as keys.
// null = not yet read by manifest — NEVER "no variants". The printing gate
// treats null as "cannot tell", so it refuses only a stated conflict.
// `variants` must be SELECTed by resolveListingCard, or this is always null
// and the gate quietly loses its ambiguity rule: the set_release lesson.
function printingsOf(card) {
  const v = card && card.variants;
  const list = v && Array.isArray(v.printings) ? v.printings.map(p => p.key).filter(Boolean) : null;
  return list && list.length ? list : null;
}

function filterCard(card, nameOverride) {
  return {
    printings: printingsOf(card),
    name: nameOverride || card.name,
    number: card.number,
    setTotal: card.set_total,
    setId: card.set_api_id,
    // English listings state the set by NAME ("Champion's Path"), never by
    // the code. Without this, an eBay title using the common `#74 <set name>`
    // form could not be verified and was dropped. See jpTitleMatchesNumber.
    setName: card.set_name_en || card.set_name,
    // The same two fields sourceEbay's matchCard carries. They were on the
    // eBay path only, so the language and year gates protected one of the
    // two marketplaces and Yahoo kept whatever jpfilter allowed — and
    // jpfilter has no concept of either (grep: zero hits for korean, hangul,
    // setYear, reprint). Korean prints share JAPANESE set codes, so Yahoo JP
    // is where they actually turn up.
    setYear: card.set_release ? new Date(card.set_release).getUTCFullYear() : null,
    lang: gateLanguage(card)
  };
}

// ══════════════════════════════════════════════════════════════
// YUYU-TEI — a Japanese shop that answers RENDER
//
// Probed from both ends on 2026-09-20: 200 and 1,172,188 bytes from a home
// IP, 200 and 1,172,188 bytes from Render. Byte-identical. Yahoo Auctions
// blocking datacentre IPs said nothing about this host, and nobody had
// asked it.
//
// That matters more than it sounds. Every Japanese listing until now came
// from a source the deployed server cannot reach, so Japanese had deep
// links and a stored median and nothing live. This is a whole set per
// fetch — number, printed total, rarity, price, stock AND a per-card URL —
// from a parser that already produced 9,294 stored rows.
//
// ⚠ ASKING PRICES, NOT SALES. A shop's sell price carries a retail margin:
// measured at a median 1.40x over Yahoo across 94 overlapping SV8a cards.
// And 56.4% of all stored Yuyu-tei rows sit at or below ¥50, which is the
// shop's minimum shelf price rather than a valuation. Tagged
// `priceKind: 'shop-ask'` on every row so nothing can average it into a
// number describing realised sales.
// ══════════════════════════════════════════════════════════════

// The set index — our set id -> yuyu-tei's code — is ONE fetch for the
// whole catalogue and changes only when a set is released. The set page
// is 1.17MB, which is far too much to pull per card view.
//
// Both are cached with their fetch time, and the age travels with the
// data: "never present stored data as live" applies to a 55-minute-old
// shop page exactly as it applies to a stored Yahoo median.
const YT_INDEX_TTL = 24 * 60 * 60 * 1000;
const YT_SET_TTL   = 60 * 60 * 1000;
let ytIndex = null;                       // { at, map }
const ytSetCache = new Map();             // code -> { at, entries }

// The memory cache alone did not hold for a day: Render's free tier restarts
// the process after ~15 idle minutes, so in practice every cold visit paid
// the ~3.7s index fetch again. The index is OUR set id -> the shop's code —
// no listing, no price — so it is kept in Supabase with its fetch time, and
// a cold process reads it back in one small query. Refetched when older than
// a day; if that refetch fails, the stored copy is used and its age logged,
// rather than dropping Yuyu-tei for the whole view. Concurrent misses share
// one fetch instead of each starting their own.
let ytIndexInflight = null;
async function ytIndexLoadStored() {
  if (!db) return null;
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS yuyutei_index (
      id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      entries jsonb NOT NULL, fetched_at timestamptz NOT NULL)`);
    const r = await db.query('SELECT entries, fetched_at FROM yuyutei_index WHERE id = 1');
    if (!r.rows.length) return null;
    return { at: new Date(r.rows[0].fetched_at).getTime(), map: new Map(r.rows[0].entries) };
  } catch (e) { console.warn('[yuyutei] stored index unreadable: ' + e.message); return null; }
}
async function ytIndexStore(idx) {
  if (!db) return;
  try {
    await db.query(`INSERT INTO yuyutei_index (id, entries, fetched_at) VALUES (1, $1, $2)
      ON CONFLICT (id) DO UPDATE SET entries = EXCLUDED.entries, fetched_at = EXCLUDED.fetched_at`,
      [JSON.stringify([...idx.map]), new Date(idx.at)]);
  } catch (e) { console.warn('[yuyutei] could not store index: ' + e.message); }
}
async function ytSetIndex() {
  if (ytIndex && Date.now() - ytIndex.at < YT_INDEX_TTL) return ytIndex.map;
  if (!ytIndexInflight) ytIndexInflight = (async () => {
    if (!ytIndex) ytIndex = await timing.time('yuyutei:index-stored', ytIndexLoadStored);
    if (ytIndex && Date.now() - ytIndex.at < YT_INDEX_TTL) return ytIndex.map;
    try {
      const map = await yt.fetchSetIndex();
      ytIndex = { at: Date.now(), map };
      ytIndexStore(ytIndex);                  // not awaited: the view does not wait on the write
      return map;
    } catch (e) {
      if (!ytIndex) throw e;
      console.warn('[yuyutei] index refetch failed (' + e.message + '); using the stored copy, '
        + Math.round((Date.now() - ytIndex.at) / 3600e3) + 'h old');
      return ytIndex.map;
    }
  })().finally(() => { ytIndexInflight = null; });
  return ytIndexInflight;
}

async function ytSetEntries(code) {
  const hit = ytSetCache.get(code);
  if (hit && Date.now() - hit.at < YT_SET_TTL) {
    return { entries: hit.entries, ageSec: Math.round((Date.now() - hit.at) / 1000) };
  }
  const entries = await yt.fetchSet(code);
  ytSetCache.set(code, { at: Date.now(), entries });
  return { entries, ageSec: 0 };
}

async function sourceYuyutei(card, grade, limit, opts = {}) {
  // Graded slabs are not what a singles shop sells. Saying so is better
  // than returning an empty list that reads as "no stock".
  if (!jpf.isRawGrade(grade)) {
    return { listings: [], scanned: 0, kept: 0, rejected: 0, dropped: [],
             gate: cm.printingEvidence(filterCard(card)),
             note: 'a singles shop lists ungraded cards only — nothing to match at ' + grade };
  }

  const setKey = String(card.set_api_id || '').toUpperCase();
  const index = await timing.time('yuyutei:index', () => ytSetIndex());
  const entry = index.get(setKey);
  if (!entry) {
    // A set this shop does not carry is not a failure, and must not look
    // like one. Yuyu-tei covered 108 of 138 Japanese sets in the price run.
    return { listings: [], scanned: 0, kept: 0, rejected: 0, dropped: [],
             gate: cm.printingEvidence(filterCard(card)),
             note: `yuyu-tei does not list set ${card.set_api_id}` };
  }

  if (opts.dryRun) {
    return { listings: [], dryRun: true,
             request: { url: yt.YT_BASE + '/sell/poc/s/' + entry.code, method: 'GET' },
             parsedQuery: `set page ${entry.code} (${entry.label})`,
             gate: cm.printingEvidence(filterCard(card)) };
  }

  const { entries, ageSec } = await timing.time('yuyutei:setpage', () => ytSetEntries(entry.code));

  // Everything at this collector number, then the variant rule: a
  // master-ball mirror shares the number and is a different product at up
  // to 5x the price. matchesOurCard already refuses a wrong printed total
  // and runs jpfilter's lot vocabulary over the product name.
  const atNumber = entries.filter(e => yt.matchesOurCard(e, card));
  const fc = filterCard(card);
  // A mirror asked for (TASK T10): the entries whose OWN text claims that
  // printing — "(マスターボール)" on the shop's row. Anything else, and All:
  // the base-printing rule, unchanged. Never a mixture.
  const wantMirror = opts.printing && /^reverse/.test(opts.printing);
  const chosen = wantMirror
    ? atNumber.filter(e => {
        const c = cm.printingClaim(yt.entryTitle(e), fc);
        return c.stated && !cm.printingRefusal(c, opts.printing, fc);
      })
    : yt.pickVariants(atNumber, card.name);
  const dropped = [];
  const listings = [];

  for (const e of chosen) {
    // The SHOP's own text, so the gate reads their words and not ours.
    const title = yt.entryTitle(e);

    // The same printing gate the Yahoo path runs, with the same two
    // options — Japanese IS written in CJK, so inferring Chinese from
    // script would reject most of the feed, and the "wanted English,
    // title is CJK" rule is meaningless on a JP-only source.
    const conflict = timing.timeSync('gate:yuyutei', () => cm.printingConflict(title, fc,
      { cjkIsChinese: false, scriptIsLanguageEvidence: false }));
    if (conflict) { dropped.push({ title, reason: conflict }); continue; }

    if (!(e.yen > 0)) { dropped.push({ title, reason: 'no usable price' }); continue; }
    if (e.stock === 0) { dropped.push({ title, reason: 'out of stock' }); continue; }

    const conv = await fx.toUsd(e.yen, 'JPY');
    if (!conv) { dropped.push({ title, reason: 'could not convert JPY' }); continue; }

    listings.push(normaliseListing({
      source: 'yuyutei',
      sourceLabel: 'Yuyu-tei',
      title,
      price: conv.usd,
      currency: 'USD',
      priceOriginal: e.yen,
      currencyOriginal: 'JPY',
      // Domestic JP shipping is not stated on the set page, and pretending
      // an unknown is zero understates every row. shippingKnown: false.
      shipping: null,
      condition: 'Raw',
      url: e.url,
      country: 'JP',
      listingType: 'fixed',
      live: true,
      parsedRarity: yt.ytRarity(e.rarity),
      priceKind: 'shop-ask',
      // Stock is the shop's own figure and is worth showing: "1 in stock"
      // is a different proposition from "12 in stock" at the same price.
      seller: e.stock != null ? `yuyu-tei · ${e.stock} in stock` : 'yuyu-tei',
      printing: cm.printingClaim(title, fc).key,
      printingStated: cm.printingClaim(title, fc).stated
    }));
  }

  return {
    listings,
    // `scanned` means "titles the gate examined", the same as it does on
    // every other source. The whole set page is 482 cards and 481 of them
    // are different cards — reporting that as scanned would read as a
    // 99.8% rejection rate that never happened, and "kept 1 of 482" is
    // exactly the sort of number someone later quotes as a gate failure.
    // The funnel is reported in full instead, so each narrowing is
    // attributable.
    scanned: chosen.length,
    kept: listings.length, rejected: dropped.length,
    pageEntries: entries.length,
    atNumber: atNumber.length,
    dropped: dropped.slice(0, 40),
    gate: cm.printingEvidence(fc),
    printing: printingReport(opts.printing, fc, listings, dropped),
    query: `set page ${entry.code} (${entry.label}) — ${entries.length} cards on the page, ` +
           `${atNumber.length} at #${card.number}, ${chosen.length} after the variant rule`,
    // A shop asking price is a different KIND of number from an auction
    // median or a realised sale, and blending the three is a mistake this
    // project has already made once.
    priceKind: 'shop-ask',
    priceKindNote: 'shop asking prices — a retail margin over the JP market, ~1.40x Yahoo medians',
    // The page may be up to an hour old. Say so rather than letting the
    // row read as live.
    fetchAgeSec: ageSec
  };
}

async function sourceYahoo(card, grade, limit, opts = {}) {
  const fc = filterCard(card);
  const q = `ポケモンカード ${card.name} ${card.number || ''}`.trim();

  // LIVE first — these are the ones a buyer can actually act on. Yahoo's
  // live page is HTML (data-auction-* attributes); only ENDED auctions come
  // back as __NEXT_DATA__ JSON. Ended rows are still useful as recent
  // comparables, so they are kept but marked, never sorted above a live one.
  const feeds = [
    { url: 'https://auctions.yahoo.co.jp/search/search?p=' + encodeURIComponent(q) + '&n=50', live: true },
    { url: 'https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=' + encodeURIComponent(q) + '&n=50', live: false }
  ];

  const out = [];
  let scanned = 0, liveCount = 0, endedCount = 0;
  // A gate that has never fired is indistinguishable from one that cannot,
  // so every printing rejection is counted and a sample is returned rather
  // than silently dropped. This is the only way anyone will notice if the
  // Korean listings stop being caught again.
  const rejectedPrinting = [];
  // EVERY refusal, with its reason — jpfilter's as well as the printing
  // gate's. Until 2026-09-29 (TASK T9) a jpfilter refusal and an out-of-range
  // price were a bare `continue`: Yahoo was the one source whose main gate
  // reported no rejection count, so "Yahoo kept 3" could not be told apart
  // from "Yahoo had 3".
  const dropped = [];

  for (const feed of feeds) {
    const r = await fetch(feed.url, { headers: {
      'User-Agent': LISTING_UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
    } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();

    let items = [];
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        items = data?.props?.pageProps?.initialState?.search?.items?.listing?.items || [];
      } catch { items = []; }
    }
    if (!items.length && feed.live) items = jpf.parseYahooLiveHtml(html);
    scanned += items.length;

    for (const it of items) {
      const why = jpf.jpItemRejectReason(it, fc, grade);
      if (why) { dropped.push({ title: it.title, reason: why }); continue; }

      // The printing gate, the SAME one eBay runs. jpfilter checks that the
      // title names this card; it has no opinion on whether the title names
      // a different PRINTING of it, and a Korean SV2a card is genuinely
      // 201/165 with the right name and the right number.
      //
      // Two options matter here and both are about not repeating
      // `looksLikeJunk`, which rejected ~80 valid prices per set:
      //   cjkIsChinese:false — Yahoo JP titles ARE CJK. Inferring "Chinese"
      //     from script alone would reject a kanji-heavy Japanese title,
      //     i.e. most of the feed.
      //   scriptIsLanguageEvidence:false — the "wanted English, title is
      //     CJK" rule. Yahoo only ever runs for ja- cards so it cannot fire
      //     today, but leaving it armed on a Japanese source is a trap for
      //     whoever widens `applies`.
      // Hangul and an explicit 韓国 stay evidence, which is the point.
      const conflict = cm.printingConflict(it.title || '', fc,
        { cjkIsChinese: false, scriptIsLanguageEvidence: false });
      if (conflict) {
        rejectedPrinting.push({ title: it.title, reason: conflict });
        dropped.push({ title: it.title, reason: conflict });
        continue;
      }
      // The printing gate (TASK T10), the same cardmatch rule eBay runs —
      // Yahoo is where the Japanese mirrors actually trade.
      const pclaim = cm.printingClaim(it.title || '', fc);
      const prefuse = cm.printingRefusal(pclaim, opts.printing, fc);
      if (prefuse) { dropped.push({ title: it.title, reason: prefuse, printingConflict: true }); continue; }

      const yen = parseInt(it.price || it.bidOrBuy || it.currentPrice || 0);
      if (!(yen >= 100 && yen <= 2000000)) {
        dropped.push({ title: it.title, reason: 'price outside ¥100-¥2,000,000: ' + yen });
        continue;
      }
      const base = jpf.yahooItemToListing(it, yen);
      if (feed.live) liveCount++; else endedCount++;
      out.push(normaliseListing({
        ...base,
        sourceLabel: 'Yahoo JP',
        condition: jpf.isRawGrade(grade) ? 'Raw' : String(grade),
        listingType: feed.live ? (it.isFixedPrice ? 'fixed' : 'auction') : 'ended',
        live: feed.live,
        printing: pclaim.key, printingStated: pclaim.stated
      }));
    }
  }

  const seen = new Set();
  const deduped = out.filter(l => (l.url && !seen.has(l.url)) ? seen.add(l.url) : false);
  return { listings: deduped, scanned, live: liveCount, ended: endedCount,
           // The shape every other source reports. `kept` is before the
           // cross-feed dedupe (a row in both feeds is one listing), which
           // `duplicatesSkipped` states so the arithmetic closes.
           kept: out.length, rejected: dropped.length, dropped: dropped.slice(0, 40),
           duplicatesSkipped: out.length - deduped.length,
           query: q,
           printing: printingReport(opts.printing, fc, out, dropped),
           printingRejected: rejectedPrinting.length,
           // Same reporting as the eBay path: what the gate had, not only
           // what it did. Yahoo is the marketplace where Korean prints
           // actually appear, so a missing language here is the expensive
           // one.
           gate: cm.printingEvidence(fc),
           printingDropped: rejectedPrinting.slice(0, 12) };
}

// The card as eBay's query and gate see it. ONE builder, used by sourceEbay
// and by the probes, so a measurement asks exactly what a card view asks.
function ebayMatchCard(card) {
  const name = card.name_en || card.name;
  return {
    printings: printingsOf(card),
    name, nameEn: card.name_en || null,
    number: card.number,
    setTotal: card.set_total,
    setName: card.set_name_en || card.set_name,
    // The reprint gate reads the SET ID, never the set name: "30th
    // Celebration" containing "Celebration" is how that gate was disabled
    // for 188 cards. Without this field every card here would be treated as
    // belonging to no reprint family — and a Classic Collection card would
    // reject its own listings.
    setId: card.set_api_id,
    // The release year separates a card from its own reprint. Celebrations
    // (2021) reprints Base Set (1999) cards with the ORIGINAL 4/102
    // numbering and the words "Base Set" in the title, so number, set size
    // and set name all agree — and a live search returned 24 "matches"
    // spanning $536 to $249,999. All 45,780 cards carry a release date.
    setYear: card.set_release ? new Date(card.set_release).getUTCFullYear() : null,
    // Korean prints share Japanese set codes and numbering, so a Korean
    // Charizard ex is genuinely 201/165 from SV2a. A live search for the
    // Japanese card returned 6 Korean listings among 25. Card ids are
    // {lang}-{setId}-{number}, so the language is already in the id.
    lang: gateLanguage(card)
  };
}

// 3 pages: the DEFAULT for callers that ask for one bounded search
// (marketprobe, gradecost). /api/listings no longer stops here (T1,
// 2026-09-30): it fetches page 1 of every site, then pages to exhaustion in
// the background — see listingsFor / continueListings.
const EBAY_MAX_PAGES = 3;
// eBay Browse's own ceilings: 200 rows a page, and offset + limit may not
// pass 10,000 (the API answers 400 beyond it). A search with more than
// 10,000 results cannot be fully read by ANY client; the response says so.
const EBAY_PAGE_MAX = 200;
const EBAY_OFFSET_CEILING = 10000;

// ── Which eBay sites /api/listings searches (T1) ──
// A marketplace is where a card is SOLD; a language is what the card IS.
// Adding a site changes where we look, never what the gate accepts: the
// language gate is identical on every site. Measured over US alone
// (marketprobe, 10 cards): GB +51%, AU +19%, CA +7% — English-titled sites,
// no vocabulary work needed. `country` is whose buyer the site's shipping
// quote is for; `currency` goes through fx.js (pinned for all four).
const EBAY_SITES = [
  { id: 'EBAY_US', country: 'US', currency: 'USD' },
  { id: 'EBAY_GB', country: 'GB', currency: 'GBP' },
  { id: 'EBAY_AU', country: 'AU', currency: 'AUD' },
  { id: 'EBAY_CA', country: 'CA', currency: 'CAD' },
  // DE (2026-09-30): only after the language gate read German words for
  // other languages and the junk/slab/reprint vocabulary was tested on three
  // sets of real DE titles (eusites.test.js); aspect names are DE's own
  // (cardmatch.EBAY_SITE_ASPECTS) — an English one is ignored there.
  { id: 'EBAY_DE', country: 'DE', currency: 'EUR' },
  // FR: French sellers mark French cards "FR" / "VF" (cardmatch LANG_CASE_TOKENS);
  // ~40% of what FR adds for an English card is the French card, refused.
  { id: 'EBAY_FR', country: 'FR', currency: 'EUR' },
  // IT: eBay MACHINE-TRANSLATES US titles here ("Portachiavi", "30°
  // Celebrazione", "Hecho por Ventilador" on ES). Vocabulary taught and
  // tested on three sets of real IT titles (eusites.test.js); a refusal on
  // any site stays a refusal everywhere (mergeEbaySite), so a translation
  // cannot overturn the English title's verdict.
  { id: 'EBAY_IT', country: 'IT', currency: 'EUR' }
];
// Not searched yet, each with the reason — reported on every response so a
// short list is never mistaken for every marketplace having been asked.
const EBAY_SITES_PENDING = {
  EBAY_ES: 'machine-translated titles: vocabulary not yet taught',
  EBAY_JP: 'refused by eBay — 409 "12019: marketplace not supported"'
};
const ebaySite = id => EBAY_SITES.find(s => s.id === id) || { id, country: null, currency: null };

async function sourceEbay(card, grade, limit, opts = {}) {
  const background = !!opts.background;

  // The kill switch is checked before the token, so EBAY_ENABLED=false
  // costs nothing and reports `disabled` rather than a token failure.
  if (!ebay.ebayEnabled()) {
    const e = new Error('EBAY_ENABLED=false — all eBay calls are switched off');
    e.ebayStatus = 'disabled';
    throw e;
  }

  // A dry run builds the request and sends nothing, so it must not acquire a
  // token either: a token exchange is itself a metered eBay call. Skipping it
  // makes dryRun genuinely free AND usable without credentials, which is the
  // point — it exists to debug the title gate, and that debugging should not
  // require live keys or spend quota.
  const dryRun = !!opts.dryRun;
  const auth = dryRun ? { token: '<dry-run>' }
    : await timing.time('ebay:token', () => getEbayTokenDetailed({ background }));
  if (!auth.token) {
    // `unconfigured` now means what it says. A rejected token exchange or
    // an unreachable eBay is an ERROR — reporting it as "not set" sent us
    // to check environment variables that were correct all along.
    // A guard refusal is a third thing again, and carries its own status so
    // the UI can say "quota" instead of implying the marketplace is empty.
    const e = new Error(auth.reason || auth.error || 'eBay token unavailable');
    if (auth.unconfigured) e.unconfigured = true;
    if (auth.blocked) {
      e.ebayStatus = auth.blocked;
      e.remaining = auth.remaining;
      e.resetsInMinutes = auth.resetsInMinutes;
    }
    throw e;
  }
  const token = auth.token;
  // English name for eBay; a Japanese card's name_en is what buyers search.
  const name = card.name_en || card.name;

  // ONE description of the card, built once and used by both the query and
  // the gate. They were separate before, and the gate quietly held a
  // setTotal and setName the query never sent — so eBay was asked for "any
  // Charizard VMAX" and whatever came back was shown. Same shape as the
  // estimator split: two implementations of one thing, drifting.
  const matchCard = ebayMatchCard(card);

  // cardmatch.buildQuery is the single query builder, shared with the
  // frontend's deep links so a link and an API call ask the same question.
  // The printing asked for (TASK T10), or null for All.
  const printing = opts.printing || null;
  // marketprobe only (EBAY_US_NOSET): ask without the set name; the gate
  // still has it. Tests whether the words ASKED are why US misses listings.
  const q = cm.buildQuery(opts.noSetInQuery ? Object.assign({}, matchCard, { setName: null }) : matchCard,
                          grade, printing ? { printing } : undefined);
  // A raw sub-condition is asked of eBay's own "Card Condition" aspect,
  // which search can filter on. Measured: the filtered rows agreed with each
  // item's descriptor 36 of 36 times. Same one call as before — each raw
  // condition was already its own search. See cardmatch.ebayConditionFilter.
  const condFilter = cm.ebayConditionFilter(grade, opts.marketplace || 'EBAY_US');
  // A slab's grader and grade are asked of eBay's own aspects the same way
  // (cardmatch.ebayGradeFilter, measured before it was built). The filter
  // NARROWS; the title is then checked against it, and where they disagree
  // the row is refused — neither is authoritative. Where the title is silent
  // ("TAG Graded 8") the field answers. No extra calls.
  const gradeFilter = condFilter ? null : cm.ebayGradeFilter(grade, opts.marketplace || 'EBAY_US');
  const aspectFilter = condFilter ? condFilter.aspectFilter : gradeFilter ? gradeFilter.aspectFilter : null;
  const gateOpts = Object.assign({},
    gradeFilter ? { structuredGrade: { grader: gradeFilter.grader, grade: gradeFilter.grade } } : {},
    printing ? { printing } : {});
  // "mint" also matches every "Near Mint" title: live, Raw M on Base Set
  // Charizard kept 11 rows of which 1 said Mint. eBay's own phrase exclusion
  // keeps the cap for the titles that do. eBay syntax, so the eBay REQUEST
  // only — other marketplaces read a leading "-" as literal text.
  const tOnly = cm.titleOnlyCondition(grade);
  const qAsk = (tOnly && tOnly.code === 'M') ? q + ' -"near mint"' : q;
  // Paged past the first 75 only when eBay says there is more. Measured on
  // five busy cards (/api/ebay/gradecost): the cap lost 79-82 wanted rows on
  // one of them — ~20x what unset grade fields lose — and under sort=price it
  // cuts the EXPENSIVE end, so `cheapest` was fine while every median built
  // from these rows sat low. Capped at EBAY_MAX_PAGES so one popular card
  // cannot spend seven calls; the response says when it stopped there.
  const pageSize = opts.pageSize ? Math.min(opts.pageSize, EBAY_PAGE_MAX) : Math.min(limit * 3, 100);
  // Where this call starts (a continuation resumes at the next offset) and
  // how many pages it may take. Infinity = until eBay's total runs out.
  const startOffset = opts.offset || 0;
  const maxPages = opts.maxPages || EBAY_MAX_PAGES;
  const pageUrl = offset => 'https://api.ebay.com/buy/browse/v1/item_summary/search'
    + '?q=' + encodeURIComponent(qAsk)
    + (opts.noCategory ? '' : '&category_ids=183454') + '&limit=' + pageSize + '&sort=price'
    + (offset ? '&offset=' + offset : '')
    + (aspectFilter ? '&aspect_filter=' + encodeURIComponent(aspectFilter) : '');
  const url = pageUrl(startOffset);
  // Which eBay site is asked. EBAY_US unless a caller names another — only
  // /api/ebay/marketprobe does (T1, 2026-09-30: measuring what the other
  // sites add before deciding whether /api/listings should ask them).
  const mp = opts.marketplace || 'EBAY_US';
  // marketprobe only: the same search without category_ids=183454, to ask
  // whether US listings filed in another category are what other sites add.

  const call = await ebay.fetchEbay(db, {
    url, token, kind: 'search', background,
    dryRun,
    meta: { cardId: card.api_card_id, grade, query: q, marketplace: mp,
            page: Math.floor(startOffset / pageSize) + 1 },
    countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0)
  });

  // ?dryRun=1 — the exact request, nothing sent, no quota spent.
  if (call.dryRun) {
    return { listings: [], scanned: 0, dryRun: true, request: call.request,
             parsedQuery: q,
             gate: Object.assign({ setId: card.set_api_id, grade }, matchCard) };
  }

  if (call.blocked) {
    // NEVER an empty list. An empty result that reads as "no stock" when the
    // truth is "we refused to call" is this project's recurring failure.
    const e = new Error(call.reason);
    e.ebayStatus = call.blocked;
    e.remaining = call.remaining;
    e.resetsInMinutes = call.resetsInMinutes;
    throw e;
  }
  if (!call.ok) throw new Error(call.reason);

  const d = call.data || {};
  const items = (d.itemSummaries || []).slice();
  const ebayTotal = Number.isFinite(d.total) ? d.total : null;
  let pagesFetched = 1, pageError = null, pageBlocked = null, received = items.length;
  let lastLen = items.length;
  const seen = new Set(items.map(it => it.itemId));
  const nextAt = () => startOffset + pagesFetched * pageSize;
  // Another page only while eBay's total says one exists, the last page came
  // back full, and eBay's offset ceiling allows it. A later page that fails
  // keeps what earlier pages delivered and says so — never an empty list,
  // never a silent short one.
  while (pagesFetched < maxPages && ebayTotal != null
         && ebayTotal > nextAt() && lastLen >= pageSize
         && nextAt() + pageSize <= EBAY_OFFSET_CEILING) {
    const more = await ebay.fetchEbay(db, {
      url: pageUrl(nextAt()), token, kind: 'search', background,
      meta: { cardId: card.api_card_id, grade, query: q, page: Math.floor(nextAt() / pageSize) + 1, marketplace: mp },
      countFrom: x => (x && x.itemSummaries ? x.itemSummaries.length : 0)
    });
    if (!more.ok) { pageError = more.reason || more.blocked || 'page fetch failed';
                    pageBlocked = more.blocked || null; break; }
    pagesFetched++;
    const got = (more.data && more.data.itemSummaries) || [];
    received += got.length;
    lastLen = got.length;
    // Offset paging over a live, price-sorted feed can repeat a row that
    // moved between calls; count each item once.
    for (const it of got) if (!seen.has(it.itemId)) { seen.add(it.itemId); items.push(it); }
  }
  // Nothing more to ask for: eBay's total is reached, a page came back
  // short, or eBay's own 10,000-result ceiling stops every client.
  const atCeiling = nextAt() + pageSize > EBAY_OFFSET_CEILING && ebayTotal != null && ebayTotal > nextAt();
  const exhausted = !pageError && (ebayTotal == null || ebayTotal <= nextAt() || lastLen < pageSize || atCeiling);
  const pages = {
    fetched: pagesFetched, pageSize, maxPages: Number.isFinite(maxPages) ? maxPages : null, ebayTotal,
    startOffset, nextOffset: exhausted ? null : nextAt(),
    exhausted, atEbayCeiling: atCeiling,
    // A truncated result must say it is truncated: eBay holds more rows than
    // were examined, and under sort=price the missing ones are the dearest.
    truncated: !!pageError || (ebayTotal != null && ebayTotal > startOffset + received),
    duplicatesSkipped: received - items.length,
    stoppedAtCap: !exhausted && !pageError && pagesFetched >= maxPages,
    pageError, pageBlocked
  };

  // ── The gate ──
  // cardmatch.verify decides; listingparse labels. Every rejection carries a
  // reason, so "no listings" and "everything was filtered out" can never look
  // the same to the caller.
  const listings = [];
  const dropped = [];
  const disagreements = [];

  for (const it of items) {
    const title = it.title || '';
    const tGate = timing.now();
    const v = cm.verify(title, matchCard, grade, gateOpts);
    timing.add('gate:ebay', timing.now() - tGate);

    // Cross-check: two independent readers of the same title that should
    // agree. listingparse works from a parsed structure, cardmatch from the
    // raw string. Where they disagree, one of them is wrong — that technique
    // has found more in this project than any other, so record it rather
    // than letting it pass silently.
    let parsed = null;
    try {
      const tLp = timing.now();
      parsed = lp.parseListingTitle(title);
      const c = lp.compare(parsed, matchCard, grade);
      timing.add('listingparse:ebay', timing.now() - tLp);

      // Only compare on dimensions BOTH readers actually examine.
      // listingparse.compare() checks number, set size, grade and
      // lot/sealed/custom — it has no name check at all, by design, because
      // its name/set split is approximate. So when cardmatch rejects on the
      // card name, a reprint marker, a year or a set name, listingparse has
      // no opinion rather than a contrary one, and reporting that as a
      // disagreement buries the real ones: the first live run produced 40,
      // every one of them structural.
      //
      // A signal that is always noisy gets ignored, which is worse than not
      // having it.
      const cardmatchOnlyReason = !v.ok && /does not name|reprint|different printing|but not the set|neither the card number nor the set|names the set but not|wants (VMAX|VSTAR|V-UNION|EX|GX)|is a (VMAX|VSTAR|V-UNION)/i.test(v.reason || '');

      if (c && c.match !== v.ok && !cardmatchOnlyReason) {
        disagreements.push({ title,
          cardmatch: v.ok ? 'kept' : 'dropped: ' + v.reason,
          listingparse: c.match ? 'match' : 'no match: ' + (c.disagree || []).join('; ') });
      }
    } catch (e) { /* the parser must never break the gate */ }

    if (!v.ok) { dropped.push({ title, itemId: it.itemId || undefined, reason: v.reason, gradeConflict: v.gradeConflict || undefined,
                                printingConflict: v.printingConflict || undefined }); continue; }

    // eBay's own condition field, which the gate never read. A $1,114.99
    // slab sat in a Raw NM list because its title said "PCG 9" — not a
    // grader we know, and not one we can add, since PCG is how sellers
    // write "Pokémon Card Game". eBay had already labelled the item
    // Graded. Structured marketplace data beats a word in a title, and it
    // was there all along. Raw direction only — see conditionSaysGraded.
    if (jpf.isRawGrade(grade) && cm.conditionSaysGraded(it.condition)) {
      dropped.push({ title, itemId: it.itemId || undefined, reason: `wants raw, eBay states condition: ${it.condition}` });
      continue;
    }

    const priceNative = parseFloat(it.price && it.price.value) || 0;
    if (priceNative <= 0) { dropped.push({ title, reason: 'no usable price' }); continue; }
    const shipOpt = it.shippingOptions && it.shippingOptions[0];
    const shipNative = (shipOpt && shipOpt.shippingCost && shipOpt.shippingCost.value != null)
      ? parseFloat(shipOpt.shippingCost.value) : null;
    // Every row in USD, its own currency and the rate kept beside it (T1).
    // A GB row carried GBP straight into `landed` beside USD rows — only
    // harmless while US was the one site asked. fx refuses an unpinned
    // currency; such a row is DROPPED WITH ITS REASON, never shown as USD.
    const cur = String((it.price && it.price.currency) || 'USD').toUpperCase();
    let price = priceNative, shipping = shipNative, fxNote = null;
    if (cur !== 'USD') {
      let pc = null, sc2 = null;
      try {
        pc = await fx.toUsd(priceNative, cur);
        const shipCur = String((shipOpt && shipOpt.shippingCost && shipOpt.shippingCost.currency) || cur).toUpperCase();
        sc2 = shipNative > 0 ? await fx.toUsd(shipNative, shipCur) : null;
      } catch (e) { dropped.push({ title, reason: 'currency not convertible: ' + e.message }); continue; }
      if (!pc) { dropped.push({ title, reason: 'no usable price' }); continue; }
      price = pc.usd;
      shipping = shipNative == null ? null : shipNative === 0 ? 0 : (sc2 ? sc2.usd : null);
      fxNote = fx.describe(pc);
    }
    // Shipping is never a filter (T1). What it IS: the quote this site gives
    // its own buyers. A GB row's shipping is to a UK address. Unknown stays
    // unknown (shippingKnown:false), and the row stays.
    const site = ebaySite(mp);
    // Seller-stated raw condition, parsed once per row. cardmatch owns it —
    // a second implementation here is the estimator split all over again.
    const sc = cm.sellerCondition ? cm.sellerCondition(it.title) : { code: null, stated: false };
    listings.push(normaliseListing({
      source: 'ebay',
      sourceLabel: 'eBay',
      title: it.title,
      price,
      currency: 'USD',
      priceOriginal: cur !== 'USD' ? priceNative : null,
      currencyOriginal: cur !== 'USD' ? cur : null,
      fx: fxNote,
      shipping,
      shippingTo: site.country,
      marketplace: mp,
      condition: jpf.isRawGrade(grade) ? (it.condition || 'Raw') : String(grade),
      seller: it.seller && it.seller.username,
      url: it.itemWebUrl,
      // eBay's own item id, so a row can be Verified on demand (certcheck.js).
      itemId: it.itemId || null,
      imageUrl: it.image && it.image.imageUrl,
      country: it.itemLocation && it.itemLocation.country,
      listingType: (it.buyingOptions || []).includes('AUCTION') ? 'auction' : 'fixed',
      live: true,
      // ── Labels, never gates ──
      // 1st Edition, Shadowless and Unlimited Base Set Charizards all read
      // 4/102 and sell at wildly different prices. A $400 and a $4,000
      // Charizard both matching "4/102 PSA 10" is CORRECT — but only if the
      // row says which is which. So these are surfaced and never rejected on:
      // the parser's job is to label, not to decide.
      edition: parsed ? parsed.edition : null,
      variant: parsed ? parsed.variant : null,
      parsedRarity: parsed ? parsed.rarity : null,
      parsedYear: parsed ? parsed.year : null,
      matchConfidence: v.confidence || null,
      // Read from the TITLE, because eBay's own condition field carries
      // nothing but "Ungraded" on every one of these — measured across 447
      // live rows. cardmatch owns the parsing, including the "120 HP is Hit
      // Points" and "Charizard ex is not Excellent" traps.
      // Under a condition filter eBay has already answered, in its own
      // structured field; the title is kept only as a second opinion.
      sellerCondition: condFilter ? condFilter.code : sc.code,
      sellerStated: condFilter ? true : sc.stated,
      conditionSource: condFilter ? 'ebay' : (sc.stated ? 'title' : null),
      titleCondition: sc.stated ? sc.code : null,
      // 'ebay' = the title named no grade and eBay's grade fields answered;
      // 'title+ebay' = both, and they agreed; 'title' = no filter applied.
      gradeSource: v.gradeSource || null,
      // What the title says about its printing (TASK T10). printingStated
      // false = the seller did not say: the UNSTATED group, never assumed.
      printing: v.printing || null,
      printingStated: !!v.printingStated
    }));
  }

  // kept AND dropped, always. "12 listings, 40 rejected" and "no listings"
  // describe completely different situations and must never look alike.
  //
  // `gate` says what the gate HAD, not only what it did. A discriminator
  // with no input is skipped silently and correctly — and is then
  // indistinguishable from one that ran and found nothing, which is how the
  // year check sat dead on every live route. Reported even when complete.
  const keptIds = new Set(listings.map(l => l.itemId));
  return { listings, scanned: items.length,
           kept: listings.length, rejected: dropped.length,
           // Every item this search examined and did NOT keep. Across sites
           // a refusal is sticky (mergeEbaySite): the same item re-judged on
           // another site's title never overturns it.
           refusedIds: items.filter(it => it.itemId && !keptIds.has(it.itemId)).map(it => it.itemId),
           dropped: opts.allDropped ? dropped : dropped.slice(0, 40),
           marketplace: mp,
           // marketprobe only: every item id eBay returned, kept or not, so a
           // row another site "adds" can be told apart from one THIS site
           // returned and the gate refused (eBay machine-translates US titles
           // for IT/ES/FR/DE, and a translated title can slip a refusal).
           scannedIds: opts.allDropped ? items.map(it => it.itemId) : undefined,
           parserDisagreements: disagreements.slice(0, 20),
           gate: cm.printingEvidence(matchCard),
           conditionFilter: condFilter
             ? { asked: condFilter.asked, ebay: condFilter.value, note: condFilter.note }
             : null,
           // M and DMG: no eBay value, so the seller's word was searched for and
           // the condition on every row is what the TITLE says — seller-stated.
           titleCondition: cm.titleOnlyCondition(grade)
             ? (t => ({ asked: t.code, label: t.label, searched: t.term, why: t.why, source: 'seller-stated' }))(cm.titleOnlyCondition(grade))
             : null,
           // Kept vs dropped BY the disagreement rule, so its net effect is
           // visible on every response, not only in a one-off measurement.
           gradeFilter: gradeFilter
             ? { grader: gradeFilter.graderValue, grade: gradeFilter.grade,
                 keptOnEbayFieldAlone: listings.filter(l => l.gradeSource === 'ebay').length,
                 refusedOnDisagreement: dropped.filter(d => d.gradeConflict).length }
             : null,
           pages,
           printing: printingReport(printing, matchCard, listings, dropped),
           query: qAsk };
}

// What the printing gate did on one source, stated either way (TASK T10).
function printingReport(asked, card, kept, dropped) {
  return {
    asked: asked || 'all',
    cardPrintings: card.printings || null,      // null = not yet read by manifest
    keptStated: kept.filter(l => l.printingStated).length,
    keptUnstated: kept.filter(l => !l.printingStated).length,
    refused: dropped.filter(d => d.printingConflict).length
  };
}

// Documented-unavailable sources. They stay in the registry so the response
// always explains every marketplace the UI offers, rather than silently
// returning a short list.
const UNAVAILABLE = {
  mercari: 'App Router page: no __NEXT_DATA__, zero item ids in initial HTML; API needs DPoP signing',
  cardmarket: 'Cloudflare returns 403 to a plain fetch',
  facebook: 'Login-gated — deep link only, never scraped',
  localshops: 'No API — deep link only'
};

// ══════════════════════════════════════════════════════════════
// Every eBay site, every page (T1, 2026-09-30)
//
// Page 1 of every site in EBAY_SITES, together, answers the first view.
// continueEbay then pages each site to exhaustion in the background and the
// cached payload grows; the page polls and says what is still loading.
// Nothing is trimmed to save quota — if the budget runs short, the site's
// entry says so and why (`incompleteReason`).
// ══════════════════════════════════════════════════════════════
function newEbayState() {
  return { seen: new Set(), refused: new Set(), listings: [], dropped: [], sites: {},
           first: null, calls: 0, printing: { keptStated: 0, keptUnstated: 0, refused: 0 } };
}

// Fold one sourceEbay result (one or more pages of one site) into the state.
function mergeEbaySite(st, mp, r) {
  const s = st.sites[mp] || (st.sites[mp] = { status: 'ok', country: ebaySite(mp).country,
    currency: ebaySite(mp).currency, pagesFetched: 0, scanned: 0, kept: 0, rejected: 0,
    duplicates: 0, overturned: 0, ebayTotal: null, nextOffset: 0, exhausted: false });
  // The envelope (query, gate evidence, filters) is US's when US answered.
  if (!st.first || (mp === 'EBAY_US' && st.firstMp !== 'EBAY_US')) { st.first = r; st.firstMp = mp; }
  const p = r.pages || {};
  s.pagesFetched += p.fetched || 0;
  st.calls += p.fetched || 0;
  s.scanned += r.scanned || 0;
  s.rejected += r.rejected || 0;
  if (p.ebayTotal != null) s.ebayTotal = p.ebayTotal;
  s.nextOffset = p.nextOffset;
  s.exhausted = !!p.exhausted;
  if (p.atEbayCeiling) s.atEbayCeiling = true;
  if (p.pageError) { s.incompleteReason = p.pageError; s.nextOffset = null; }
  // A refusal anywhere is a refusal everywhere, including of a row an
  // earlier page kept on another site.
  for (const id of (r.refusedIds || [])) {
    st.refused.add(id);
    const i = st.listings.findIndex(l => l.itemId === id);
    if (i >= 0) { st.listings.splice(i, 1); s.overturned++; }
  }
  for (const l of r.listings || []) {
    if (!l.itemId) { st.listings.push(l); s.kept++; continue; }
    if (st.refused.has(l.itemId)) { s.overturned++; continue; }
    if (st.seen.has(l.itemId)) { s.duplicates++; continue; }
    st.seen.add(l.itemId);
    st.listings.push(l);
    s.kept++;
  }
  if (st.dropped.length < 40) st.dropped.push(...(r.dropped || []).slice(0, 40 - st.dropped.length));
  if (r.printing) {
    st.printing.keptStated += r.printing.keptStated || 0;
    st.printing.keptUnstated += r.printing.keptUnstated || 0;
    st.printing.refused += r.printing.refused || 0;
  }
}

function ebaySiteFailed(st, mp, err) {
  st.sites[mp] = { status: err.ebayStatus || (err.unconfigured ? 'unconfigured' : 'error'),
                   country: ebaySite(mp).country, reason: String(err.message || err).slice(0, 200),
                   nextOffset: null, exhausted: false,
                   incompleteReason: String(err.message || err).slice(0, 200) };
}

// The sourceEbay-shaped answer for the state so far — what gatherListings
// and the page already read — plus `sites` and `pending`.
function ebayStateResult(st) {
  const f = st.first || {};
  const sites = st.sites;
  const pending = Object.entries(sites).filter(([, s]) => s.nextOffset != null)
    .map(([mp, s]) => ({ marketplace: mp, nextOffset: s.nextOffset, ebayTotal: s.ebayTotal }));
  const tot = Object.values(sites).reduce((a, s) => ({
    scanned: a.scanned + (s.scanned || 0), rejected: a.rejected + (s.rejected || 0),
    ebayTotal: a.ebayTotal + (s.ebayTotal || 0), pages: a.pages + (s.pagesFetched || 0) }),
    { scanned: 0, rejected: 0, ebayTotal: 0, pages: 0 });
  return Object.assign({}, f, {
    listings: st.listings.slice(), scanned: tot.scanned, kept: st.listings.length,
    rejected: tot.rejected, dropped: st.dropped, refusedIds: undefined,
    marketplace: 'all', sites, pending,
    sitesNotSearched: EBAY_SITES_PENDING,
    printing: f.printing ? Object.assign({}, f.printing, st.printing) : f.printing,
    pages: { fetched: tot.pages, calls: st.calls, ebayTotalAllSites: tot.ebayTotal,
             // sum over sites, so an item listed on two sites counts twice
             complete: pending.length === 0 && Object.values(sites).every(s => s.exhausted),
             truncated: Object.values(sites).some(s => !s.exhausted) },
    ebayState: st
  });
}

async function sourceEbayAll(card, grade, limit, opts = {}) {
  // A dry run builds US's request only: it exists to debug the gate, and
  // four identical requests with a different header say nothing more.
  if (opts.dryRun) return sourceEbay(card, grade, limit, opts);
  const st = newEbayState();
  const results = await Promise.allSettled(EBAY_SITES.map(site =>
    sourceEbay(card, grade, limit, Object.assign({}, opts,
      { marketplace: site.id, pageSize: EBAY_PAGE_MAX, maxPages: 1 }))));
  // Merge in EBAY_SITES order, US first, so a row on two sites keeps its
  // US (USD, unconverted) copy.
  EBAY_SITES.forEach((site, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') mergeEbaySite(st, site.id, r.value);
    else ebaySiteFailed(st, site.id, r.reason || {});
  });
  // Every site failed: the reason US gave is the source's status, exactly
  // as before sites existed — quota, disabled, unconfigured stay distinct.
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  return ebayStateResult(st);
}

// Page one site onward, one page per call, folding each into `st` and
// telling the caller after every page. Background priority: at the soft
// stop it yields, and the site says why it is incomplete.
async function continueEbaySite(card, grade, opts, st, mp, onPage) {
  for (;;) {
    const s = st.sites[mp];
    if (!s || s.nextOffset == null) return;
    let r;
    try {
      r = await sourceEbay(card, grade, 25, Object.assign({}, opts,
        { marketplace: mp, offset: s.nextOffset, pageSize: EBAY_PAGE_MAX, maxPages: 1, background: true }));
    } catch (e) {
      s.incompleteReason = (e.ebayStatus ? e.ebayStatus + ': ' : '') + String(e.message || e).slice(0, 200);
      s.nextOffset = null;
      await onPage();
      return;
    }
    mergeEbaySite(st, mp, r);
    await onPage();
  }
}

const LISTING_SOURCES = [
  {
    id: 'yahoo', label: 'Yahoo JP', fetch: sourceYahoo,
    // Yahoo is a Japanese-language marketplace: it is searched with the
    // Japanese card name, so it only applies to Japanese cards.
    applies: card => String(card.api_card_id).startsWith('ja-'),
    skipReason: 'Japanese-language marketplace — card is not Japanese'
  },
  {
    id: 'yuyutei', label: 'Yuyu-tei', fetch: sourceYuyutei,
    // A Japanese shop listing Japanese cards, keyed on OUR set id — the
    // same restriction as Yahoo, for the same reason.
    applies: card => String(card.api_card_id).startsWith('ja-'),
    skipReason: 'Japanese shop — card is not Japanese'
  },
  {
    id: 'ebay', label: 'eBay', fetch: sourceEbayAll,
    applies: card => !!(card.name_en || card.name),
    skipReason: 'no English name to search with'
  }
];

async function gatherListings(card, grade, limit, opts) {
  opts = opts || {};
  const sources = {};
  for (const [id, reason] of Object.entries(UNAVAILABLE))
    sources[id] = { status: 'unavailable', reason };

  const active = LISTING_SOURCES.filter(s => {
    if (s.applies(card)) return true;
    sources[s.id] = { status: 'skipped', reason: s.skipReason };
    return false;
  });

  const t0 = Date.now();
  // eBay's own calls are serialised inside ebaycall, so a 12s timeout that
  // starts when the request is MADE can expire while a call is still queued
  // behind another. Give eBay longer; the queue is bounded by pacing, not
  // by work.
  const results = await Promise.allSettled(
    active.map(s => withTimeout(timing.time('source:' + s.id + (opts.noReprintCheck ? ':reprint' : ''),
                                            () => s.fetch(card, grade, limit, opts)),
                                s.id === 'ebay' ? 25000 : 12000, s.id))
  );

  const dryRuns = {};
  let listings = [];
  let ebayState = null;
  active.forEach((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      if (r.value && r.value.dryRun) {
        sources[s.id] = { status: 'dry-run', reason: 'request built, nothing sent' };
        dryRuns[s.id] = { request: r.value.request, parsedQuery: r.value.parsedQuery,
                          gate: r.value.gate };
        return;
      }
      const { listings: got } = r.value;
      sources[s.id] = { status: 'ok', count: got.length, scanned: r.value.scanned ?? null };
      if (r.value.live !== undefined) { sources[s.id].live = r.value.live; sources[s.id].ended = r.value.ended; }

      // A shop's asking price, an auction median and a realised sale are
      // three different kinds of number. They already got blended once in
      // this project; the row and the source both say which this is.
      if (r.value.priceKind) {
        sources[s.id].priceKind = r.value.priceKind;
        sources[s.id].priceKindNote = r.value.priceKindNote || null;
      }
      // How old the fetched page was. A cached shop page is not live, and
      // the response has to say so rather than let the row imply it.
      if (r.value.fetchAgeSec !== undefined) sources[s.id].fetchAgeSec = r.value.fetchAgeSec;
      // The narrowing, step by step: how many cards were on the page, how
      // many carried this collector number, how many survived the variant
      // rule. Without it "1 of 482" is unreadable.
      if (r.value.pageEntries !== undefined) {
        sources[s.id].pageEntries = r.value.pageEntries;
        sources[s.id].atNumber = r.value.atNumber;
      }
      // "This shop does not carry that set" is a fact, not a failure, and
      // an empty list with no explanation reads as "no stock".
      if (r.value.note) sources[s.id].note = r.value.note;
      // Which structured condition eBay was asked for — and what it cannot
      // separate (Mint from Near Mint, Damaged from Heavily Played).
      if (r.value.conditionFilter) sources[s.id].conditionFilter = r.value.conditionFilter;
      if (r.value.gradeFilter) sources[s.id].gradeFilter = r.value.gradeFilter;
      if (r.value.titleCondition) sources[s.id].titleCondition = r.value.titleCondition;
      if (r.value.pages) sources[s.id].pages = r.value.pages;
      // eBay, per site (T1): what each site returned, what it still owes,
      // and which sites were not asked at all, each with its reason.
      if (r.value.sites) {
        sources[s.id].sites = r.value.sites;
        sources[s.id].pending = r.value.pending;
        sources[s.id].sitesNotSearched = r.value.sitesNotSearched;
        ebayState = r.value.ebayState;
      }
      // What the printing gate did here — asked, kept stated / unstated,
      // refused. Reported for All too, so "not asked" is visible (T10).
      if (r.value.printing) sources[s.id].printing = r.value.printing;

      // Printing rejections (reprint / language / year) from a source that
      // does not use the `rejected` shape below. Reported even when zero:
      // "0 rejected" says the gate ran, which is a different statement from
      // the field being absent because it never ran at all.
      // What the printing gate had to work with. Always present, so
      // "the language check ran and found nothing" can be told apart from
      // "the language check never ran" — the distinction that hid a dead
      // year gate for weeks.
      //
      // `gateWarning` is the assertable failure. Every catalogue row's id
      // starts with its language, so a missing one means the card handed to
      // the gate did not come from the catalogue. The gate still runs on
      // everything else and nothing is rejected over it — this reports,
      // it does not refuse.
      if (r.value.gate) {
        sources[s.id].gate = r.value.gate;
        if (r.value.gate.unchecked.includes('language')) {
          sources[s.id].gateWarning =
            'no language on the card — the language check did NOT run. ' +
            'Card ids are {lang}-{setId}-{number}; this card reached the gate without one.';
        }
      }

      if (r.value.printingRejected !== undefined) {
        sources[s.id].printingRejected = r.value.printingRejected;
        if (r.value.printingDropped && r.value.printingDropped.length) {
          sources[s.id].printingDropped = r.value.printingDropped;
        }
      }

      // "12 listings, 40 rejected" — a source that scanned 52 titles and kept
      // 12 has NOT behaved like one that found nothing, and the response has
      // to be able to tell them apart.
      if (r.value.rejected !== undefined) {
        sources[s.id].rejected = r.value.rejected;
        sources[s.id].summary = `${r.value.kept} kept, ${r.value.rejected} rejected` +
          (r.value.scanned ? ` of ${r.value.scanned} scanned` : '');
        if (r.value.dropped && r.value.dropped.length) {
          sources[s.id].droppedSample = r.value.dropped.slice(0, 12);
        }
        if (r.value.query) sources[s.id].query = r.value.query;
        // Two readers of one title that should agree. Surfaced, not swallowed.
        if (r.value.parserDisagreements && r.value.parserDisagreements.length) {
          sources[s.id].parserDisagreements = r.value.parserDisagreements;
        }
      }
      listings = listings.concat(got);
    } else {
      const err = r.reason || {};
      // A guard refusing is not the same as a marketplace with no stock, and
      // not the same as a missing credential. Each keeps its own status so
      // the UI can say which — never an empty list that reads as "no results".
      if (err.ebayStatus) {
        sources[s.id] = { status: err.ebayStatus, reason: err.message };
        if (err.remaining !== undefined && err.remaining !== null)
          sources[s.id].remaining = err.remaining;
        if (err.resetsInMinutes !== undefined && err.resetsInMinutes !== null)
          sources[s.id].resetsInMinutes = err.resetsInMinutes;
      } else if (err.unconfigured) {
        sources[s.id] = { status: 'unconfigured', reason: err.message };
      } else {
        sources[s.id] = { status: 'error', reason: String(err.message || err).slice(0, 160) };
      }
    }
  });

  // Raw (unjudged) rows are kept: a continuation adds eBay pages and
  // re-judges the whole set, and a flag is a judgement on the set.
  const otherRows = listings.filter(l => l.source !== 'ebay');
  const memo = {};
  const j = await judgeListings(card, grade, listings, opts, memo);
  const out = { listings: j.listings, sources, tookMs: Date.now() - t0, liveCount: j.liveCount,
                outliers: j.outliers, ebayState, otherRows, judgeMemo: memo };
  if (Object.keys(dryRuns).length) out.dryRun = dryRuns;
  return out;
}

// Outliers, the reprint price band, then the sort — over EVERY row of the
// view. Shared by the first answer and each continuation page, so a row
// arriving on page 9 is judged against the same peers as one from page 1.
async function judgeListings(card, grade, listings, opts, memo) {
  opts = opts || {}; memo = memo || {};
  // ── After the gate, before the sort ───────────────────────────
  // Every listing here has passed cardmatch: right card, right number,
  // right set, right grade. Giratina V #186 still came back spanning
  // $2.08 to $1,114.99 — 536x on one card at one grade — because the
  // cheap title is word for word the shape of a genuine one. There is
  // nothing in it to match against.
  //
  // So the card's own listings judge it. FLAGGED, never removed: a
  // genuine bargain exists, and this project has twice destroyed good
  // data with a filter written against bad data. The row stays, carries
  // its reason, and sorts last.
  const judged = timing.timeSync('outlier', () => outlier.flagOutliers(listings));
  listings = judged.listings;

  // ── Priced at a known reprint's level ─────────────────────────
  // Only where cardmatch KNOWS a reprint of this card (REPRINT_OF) — every
  // other card skips this entirely, so the global ratio above stays as it
  // is. The reprint's own gated listings, same grade, set its band.
  // Reported per reprint in outliers.reprints, applied or not, and why.
  const reprintCards = cm.reprintCardsOf(card);
  if (reprintCards.length && !opts.noReprintCheck) {
    const tReprint = timing.now();
    judged.stats.reprints = [];
    // The catalogue's own number-matched price: the second, independent
    // path to "this card prices apart from its reprint". Real prices only.
    if (!('marketPrice' in memo)) {
      const mp = await numberMatchedPrice(card.api_card_id).catch(() => null);
      memo.marketPrice = mp && mp.isReal ? mp.price : null;
    }
    const marketPrice = memo.marketPrice;
    for (const rc of reprintCards) {
      let prices = null, why = null;
      try {
        // Memoised per view: a continuation re-judges after every page and
        // must not re-fetch the reprint's listings each time.
        if (memo.reprintPrices && memo.reprintPrices[rc.cardId]) { prices = memo.reprintPrices[rc.cardId]; }
        const hit = prices ? null : listingCacheGet(rc.cardId, grade);
        let rows = prices ? null : hit && hit.listings;
        if (!rows) {
          const rcard = prices ? null : await resolveListingCard(rc.cardId);
          if (prices) { /* memoised */ }
          else if (!rcard) why = 'reprint card not in catalogue';
          // noReprintCheck: a reprint has no reprint of its own today, but
          // the recursion must not be able to start if REPRINT_OF grows one.
          else rows = (await gatherListings(rcard, grade, 50,
                         Object.assign({}, opts, { noReprintCheck: true }))).listings;
        }
        if (rows) prices = rows.filter(outlier.trustworthy).map(outlier.priceOf).filter(p => p != null);
        if (prices) (memo.reprintPrices = memo.reprintPrices || {})[rc.cardId] = prices;
      } catch (e) { why = 'reprint listings failed: ' + String(e.message || e).slice(0, 120); }
      if (!prices) {
        judged.stats.reprints.push({ reprint: rc.cardId, label: rc.family && rc.family.label,
                                     applied: false, reason: why || 'no reprint listings' });
        continue;
      }
      const rj = outlier.flagReprintPriced(listings,
        { cardId: rc.cardId, label: rc.family ? rc.family.label : rc.cardId, prices },
        { marketPrice });
      listings = rj.listings;
      judged.stats.reprints.push(rj.stats);
      judged.stats.flagged += rj.stats.flagged;
    }
    timing.span('reprint-check', tReprint, timing.now(), { reprints: reprintCards.length });
  }

  // Cheapest LANDED cost first. Rows whose shipping the source did not state
  // sort on price alone and say so, rather than pretending shipping is zero.
  // Buyable first, then cheapest landed cost. An ended auction never
  // outranks something you can actually purchase.
  //
  // Suspect rank comes FIRST — ahead of buyable, ahead of price. The point
  // of a cheapest-first list is that the top row can be acted on.
  listings.sort((a, b) =>
    (outlier.suspectRank(a) - outlier.suspectRank(b)) ||
    (Number(b.live) - Number(a.live)) || (a.landed - b.landed) || (a.price - b.price));
  return { listings, liveCount: listings.filter(l => l.live).length, outliers: judged.stats };
}

// ══════════════════════════════════════════════════════════════
// One card view's listings: first answer now, the rest as it arrives (T1)
// ══════════════════════════════════════════════════════════════

// The payload for one state of a view. Every row, never a slice: `count`
// and `listings.length` are the same number (they were 58 and 25).
function buildListingsPayload(card, requestedId, grade, printing, j, sources, tookMs, progress) {
  // The headline figures skip anything the outlier check flagged. This is
  // the number a buyer acts on, and "$2.08" for a card that trades at
  // $800 is not an answer — it is the wrong card, a proxy or a scam.
  // The flagged rows are still returned, last, with their reason.
  const listings = j.listings;
  const trusted = listings.filter(outlier.trustworthy);
  return {
    cardId: card.api_card_id,
    requestedId,
    card: {
      name: card.name, nameEn: card.name_en || null, number: card.number,
      rarity: card.rarity, set: card.set_name, setTotal: card.set_total,
      image: card.image_small || null
    },
    grade,
    // The printing asked for, and every printing this card exists in —
    // the page offers a selector only when there is more than one.
    printing: printing || 'all',
    printings: (printingsOf(card) || []).map(k => ({ key: k, label: cm.printingLabel(k) })),
    printingsRead: !!printingsOf(card),
    count: listings.length,
    liveCount: j.liveCount,
    cheapest: trusted.length ? trusted[0].landed : null,
    cheapestLive: (trusted.find(l => l.live) || {}).landed ?? null,
    // What the outlier check did, and why — reported even when it did not
    // run. "Not applied: median $0.99 is below $15" is a different fact
    // from "applied, nothing flagged".
    outliers: j.outliers,
    // What this grade is worth, measured from the listings that passed the
    // gate. Computed, not stored: this is a read endpoint.
    gradePrice: gp.aggregate(listings, { grade }),
    listings,
    sources,
    // Is this every listing, and if not, what is still being fetched?
    progress,
    tookMs,
    cached: false,
    cachedAgeSec: 0,
    // eBay's terms: do not present data as more current than it is.
    freshness: {
      cached: false,
      ageSeconds: 0,
      maxAgeSeconds: Math.round(LISTING_TTL / 1000),
      note: 'fetched now'
    },
    attribution: EBAY_ATTRIBUTION,
    fetchedAt: new Date().toISOString()
  };
}

// What is loaded and what is not, in words as well as numbers — "247
// listings, still searching GB and AU" rather than a silent partial list.
function listingsProgress(st, count, extra) {
  extra = extra || {};
  if (!st) return Object.assign({ complete: true, loading: [], incomplete: [], calls: 0,
    note: count + ' listing' + (count === 1 ? '' : 's') }, extra);
  const sites = Object.entries(st.sites);
  const loading = sites.filter(([, s]) => s.nextOffset != null).map(([mp, s]) => ({
    marketplace: mp, country: s.country, pagesFetched: s.pagesFetched, examined: s.scanned,
    ebayTotal: s.ebayTotal }));
  // Finished but NOT exhausted: a failed page, the quota's soft stop, or
  // eBay's 10,000-result ceiling. Each says why.
  const incomplete = sites.filter(([, s]) => s.nextOffset == null && !s.exhausted)
    .map(([mp, s]) => ({ marketplace: mp, reason: s.incompleteReason || s.reason || 'stopped' }))
    .concat(sites.filter(([, s]) => s.atEbayCeiling).map(([mp, s]) => ({ marketplace: mp,
      reason: `eBay serves at most ${EBAY_OFFSET_CEILING.toLocaleString('en-US')} results per search; it reports ${s.ebayTotal}` })));
  const name = mp => mp.replace(/^EBAY_/, '');
  const note = count + ' listing' + (count === 1 ? '' : 's')
    + (loading.length ? ', still searching ' + loading.map(l => name(l.marketplace)).join(', ') : '')
    + (incomplete.length ? ' — incomplete on ' + incomplete.map(l => name(l.marketplace) + ' (' + l.reason + ')').join('; ') : '');
  return Object.assign({ complete: !loading.length && !incomplete.length, loading, incomplete,
    calls: st.calls, pagesByMarketplace: Object.fromEntries(sites.map(([mp, s]) => [mp, s.pagesFetched])),
    notSearched: Object.keys(EBAY_SITES_PENDING), note }, extra);
}

// A source that failed outright (every eBay site refused, a quota stop, a
// timeout, Yahoo's 403 from Render) leaves no site state to report — but the
// view is NOT complete, and "27 listings" alone would say it was.
function withSourceFailures(progress, sources) {
  const failed = Object.entries(sources || {})
    .filter(([, s]) => s && !['ok', 'skipped', 'unavailable', 'dry-run'].includes(s.status))
    .map(([id, s]) => ({ marketplace: id, reason: s.status + (s.reason ? ': ' + s.reason : '') }));
  if (!failed.length) return progress;
  return Object.assign({}, progress, {
    incomplete: progress.incomplete.concat(failed), complete: false,
    note: progress.note + ' — not searched: ' + failed.map(f => f.marketplace + ' (' + f.reason + ')').join('; ') });
}

// ── Pages fetched per view, recorded (T1) ──
// "Did we get everything, and what did it cost?" had no answer: nothing
// recorded a view. Counts only — no eBay item data is stored (the terms).
const VIEW_LOG = [];
let viewTableReady = null;
async function logListingView(v) {
  VIEW_LOG.push(v);
  if (VIEW_LOG.length > 500) VIEW_LOG.shift();
  console.log('[listings:view] ' + JSON.stringify({ card: v.cardId, grade: v.grade, calls: v.calls,
    pages: v.pagesByMarketplace, rows: v.listings, complete: v.complete, cached: v.cached, ms: v.msTotal }));
  if (!db) return;
  try {
    if (!viewTableReady) viewTableReady = db.query(`CREATE TABLE IF NOT EXISTS listing_views (
      id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
      card_id text NOT NULL, grade text, printing text, cached boolean NOT NULL,
      calls int NOT NULL, listings int, complete boolean, pages jsonb, totals jsonb,
      incomplete jsonb, ms_first int, ms_total int)`);
    await viewTableReady;
    await db.query(`INSERT INTO listing_views (card_id, grade, printing, cached, calls, listings,
      complete, pages, totals, incomplete, ms_first, ms_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [v.cardId, v.grade, v.printing, v.cached, v.calls, v.listings, v.complete,
       JSON.stringify(v.pagesByMarketplace || {}), JSON.stringify(v.ebayTotals || {}),
       JSON.stringify(v.incomplete || []), v.msFirst, v.msTotal]);
  } catch (e) { viewTableReady = null; console.warn('[listings:view] not recorded: ' + e.message); }
}

const listingJobs = new Map();

// The whole of one view: cache, first answer, background continuation.
// /api/listings and /api/search both come through here, so they cannot
// answer differently (the Raw NM bug) or cache a trimmed copy for the other.
async function listingsFor(card, requestedId, grade, printing, opts) {
  opts = opts || {};
  const key = card.api_card_id;
  // The cache answers ONE question: card + grade + printing.
  const cacheGrade = printing ? grade + '|' + printing : grade;
  const jobKey = listingKey(key, cacheGrade);

  // A dry run must never be served from cache, or it reports a request that
  // was not built for it. A running continuation is never restarted by
  // ?refresh — it IS the refresh.
  if (!opts.dryRun && (!opts.refresh || listingJobs.has(jobKey))) {
    const hit = listingCacheGet(key, cacheGrade);
    if (hit) {
      if (!opts.poll) logListingView({ cardId: key, grade, printing: printing || null, cached: true,
        calls: 0, listings: hit.count, complete: !!(hit.progress && hit.progress.complete) });
      return hit;
    }
  }

  const t0 = Date.now();
  // A browser request is a live user waiting, so page 1 is foreground: it
  // may spend quota down to the reserve. The continuation is background.
  const gathered = await gatherListings(card, grade, opts.limit || 25,
    { background: false, dryRun: !!opts.dryRun, printing });
  const st = gathered.ebayState;
  const progress = withSourceFailures(listingsProgress(st, gathered.listings.length), gathered.sources);
  const payload = buildListingsPayload(card, requestedId, grade, printing,
    { listings: gathered.listings, liveCount: gathered.liveCount, outliers: gathered.outliers },
    gathered.sources, gathered.tookMs, progress);
  if (gathered.dryRun) {
    payload.dryRun = gathered.dryRun;
    payload.note = 'dryRun=1 — nothing was sent to eBay and no quota was spent';
    return payload;                       // deliberately NOT cached
  }
  const ts = Date.now();
  listingCacheSet(key, cacheGrade, payload, ts);
  const msFirst = Date.now() - t0;
  const view = () => ({ cardId: key, grade, printing: printing || null, cached: false,
    calls: st ? st.calls : 0,
    pagesByMarketplace: st ? Object.fromEntries(Object.entries(st.sites).map(([m, s]) => [m, s.pagesFetched])) : {},
    ebayTotals: st ? Object.fromEntries(Object.entries(st.sites).map(([m, s]) => [m, s.ebayTotal])) : {},
    listings: payload.count, msFirst, msTotal: Date.now() - t0 });

  if (!st || !progress.loading.length) {
    const v = view(); v.complete = progress.complete; v.incomplete = progress.incomplete;
    logListingView(v);
    return payload;
  }
  if (!listingJobs.has(jobKey)) {
    const job = continueListings(card, requestedId, grade, printing, gathered, ts, t0)
      .then(final => { const v = view(); Object.assign(v, final); logListingView(v); })
      .catch(e => console.warn('[listings] continuation failed: ' + e.message))
      .finally(() => listingJobs.delete(jobKey));
    listingJobs.set(jobKey, job);
  }
  return payload;
}

// Page every site to exhaustion, re-judging and re-caching after each page.
// The cache keeps the FIRST fetch's timestamp: no row is served as fresher
// than the oldest row beside it, and the 15 minutes run from that.
async function continueListings(card, requestedId, grade, printing, gathered, ts, t0) {
  const st = gathered.ebayState;
  const cacheGrade = printing ? grade + '|' + printing : grade;
  const memo = gathered.judgeMemo || {};
  const opts = { printing, background: true };
  let rebuilding = Promise.resolve();
  const republish = () => (rebuilding = rebuilding.then(async () => {
    const rows = gathered.otherRows.concat(st.listings);
    const j = await judgeListings(card, grade, rows, {}, memo);
    const sources = Object.assign({}, gathered.sources);
    const r = ebayStateResult(st);
    sources.ebay = Object.assign({}, sources.ebay, {
      status: 'ok', count: r.kept, scanned: r.scanned, rejected: r.rejected, sites: r.sites,
      pending: r.pending, pages: r.pages,
      printing: r.printing,
      summary: `${r.kept} kept, ${r.rejected} rejected of ${r.scanned} scanned` });
    const progress = withSourceFailures(listingsProgress(st, j.listings.length), sources);
    const payload = buildListingsPayload(card, requestedId, grade, printing, j, sources,
      Date.now() - t0, progress);
    payload.fetchedAt = new Date(ts).toISOString();
    listingCacheSet(card.api_card_id, cacheGrade, payload, ts);
    return progress;
  }));
  // Sites in parallel (ebaycall's queue still serialises the calls and paces
  // them); pages within a site in order, since each needs the last's offset.
  await Promise.all(Object.keys(st.sites).map(mp =>
    continueEbaySite(card, grade, opts, st, mp, republish)));
  const progress = await republish();
  return { complete: progress.complete, incomplete: progress.incomplete, listings: st.listings.length + gathered.otherRows.length };
}

// GET /api/listings-log?limit=200 — calls per card view, from what was
// recorded, and what that means against the daily budget.
app.get('/api/listings-log', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 2000);
  let rows = VIEW_LOG.slice(-limit).map(v => ({ card_id: v.cardId, grade: v.grade, cached: v.cached,
    calls: v.calls, listings: v.listings, complete: v.complete, pages: v.pagesByMarketplace,
    totals: v.ebayTotals, ms_first: v.msFirst, ms_total: v.msTotal }));
  let from = 'memory (this process)';
  if (db) {
    try {
      const r = await db.query(`SELECT at, card_id, grade, cached, calls, listings, complete, pages, totals,
        incomplete, ms_first, ms_total FROM listing_views ORDER BY id DESC LIMIT $1`, [limit]);
      rows = r.rows; from = 'listing_views';
    } catch (e) { /* table not created yet: memory only */ }
  }
  const fresh = rows.filter(r => !r.cached);
  const calls = fresh.map(r => r.calls).sort((a, b) => a - b);
  const pct = p => calls.length ? calls[Math.min(calls.length - 1, Math.floor(p * calls.length))] : null;
  const mean = calls.length ? calls.reduce((a, b) => a + b, 0) / calls.length : null;
  const allMean = rows.length ? rows.reduce((a, r) => a + r.calls, 0) / rows.length : null;
  res.json({ from, views: rows.length, cachedViews: rows.length - fresh.length,
    callsPerUncachedView: { mean: mean && +mean.toFixed(1), p50: pct(0.5), p90: pct(0.9), max: calls.length ? calls[calls.length - 1] : null },
    callsPerViewIncludingCacheHits: allMean && +allMean.toFixed(1),
    budget: { dailyLimit: quota.DAILY_LIMIT || 5000,
      uncachedViewsPerDay: mean ? Math.floor((quota.DAILY_LIMIT || 5000) / mean) : null,
      note: 'searches only; token exchanges are counted separately by /api/ebay/quota' },
    incompleteViews: fresh.filter(r => r.complete === false).length,
    rows });
});

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

// ══════════════════════════════════════════════════════════════
// GET /api/listings/:cardId?grade=PSA+10&limit=25[&refresh=1]
// ══════════════════════════════════════════════════════════════
app.get('/api/listings/:cardId', async (req, res, next) => {
  const { cardId } = req.params;
  const grade = req.query.grade || 'Raw';
  const limit = Math.min(parseInt(req.query.limit) || 25, 50);
  // ?printing=reverse | holo | normal | reverse-masterball ... (TASK T10).
  // Absent or "all" = every printing, each row labelled. An unknown value is
  // refused rather than silently treated as All.
  const printing = cm.parsePrintingParam(req.query.printing);
  if (req.query.printing && !printing && String(req.query.printing).toLowerCase() !== 'all') {
    return res.status(400).json({ cardId, grade, listings: [],
      error: 'unknown printing "' + req.query.printing + '"', printings: Object.keys(cm.PRINTINGS) });
  }
  // The cache answers ONE question: card + grade + printing. Keyed on less,
  // a Reverse Holo answer would be served for a Holo question — the
  // "number cached per card when it depends on the grade" failure.
  const cacheGrade = printing ? grade + '|' + printing : grade;

  if (!db) return res.status(503).json({ cardId, grade, listings: [], error: 'database not configured' });

  let card;
  try {
    card = await resolveListingCard(cardId);
  } catch (err) {
    return res.status(500).json({ cardId, grade, listings: [], error: err.message });
  }
  // Hidden (Pocket) — say so. Falling through would search eBay by name.
  if (!card) {
    const hidden = await hiddenReason(listingIdCandidates(cardId)).catch(() => null);
    if (hidden) return res.status(404).json({ cardId, grade, listings: [], hidden: { cardId, reason: hidden } });
  }
  // Not one of our cards — the next handler answers 404 (T9: it used to be
  // an ungated eBay search on the raw string).
  if (!card) return next();

  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  try {
    const payload = await listingsFor(card, cardId, grade, printing, {
      dryRun, refresh: !!req.query.refresh, limit,
      // The page re-asks while a view is still loading; those are not views.
      poll: req.query.poll === '1' });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ cardId, grade, listings: [], error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// SEARCH  —  GET /api/search?q=<free text>[&limit=10][&listings=0]
//
// The missing half of the pipeline. Everything else runs
//   card record + grade -> search URL -> listings
// and there was no path from what a person actually types to a card
// identity. cardparse.js supplies it; this exposes it.
//
// `parsed` is echoed back deliberately. The UI shows what it understood
// as a chip row, and a wrong interpretation becomes visible rather than
// mysterious — "why did it show me the wrong card" is answerable.
//
// When one candidate wins outright we chain straight into listings, so a
// confident query is ONE round trip from text to buyable rows. When it
// does not, we return candidates and let the user choose. We never guess
// between close candidates: that is precisely how prices got scrambled
// before (name-only matching gave every variant the same figure).
// ══════════════════════════════════════════════════════════════
const { parseCardQuery, resolveCard } = require('./cardparse');

// The top candidate must clear the runner-up by this much to auto-resolve.
// Mirrored in cardparse.test.js — change both together.
const SEARCH_CONFIDENT_GAP = 40;

function searchCandidate(r) {
  return {
    cardId: r.api_card_id,
    name: r.name,
    nameEn: r.name_en || null,
    number: r.number,
    setId: r.set_api_id,
    setName: r.set_name,
    setNameEn: r.set_name_en || null,
    setTotal: r.set_total,
    rarity: r.rarity,
    image: r.image_small || null,
    price: r.price != null
      ? { value: +Number(r.price).toFixed(2), isReal: true }
      : { value: null, isReal: false },
    score: r.score
  };
}

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 10, 25);
  const wantListings = req.query.listings !== '0';

  if (!q) return res.status(400).json({ error: 'q is required', query: q });
  if (!db) return res.status(503).json({ error: 'database not configured', query: q });

  const parsed = parseCardQuery(q);
  // setHint counts as identifying. "Shining Celebi", "Lost Remover",
  // "Detective Pikachu", "Paldean Tauros": a set-marker word opens the name,
  // so the parser offers the whole string as a SET hint and no name — and
  // resolveCard scores that reading as a name too (2026-09-28). But this
  // guard returned "Nothing identifying" before resolveCard ever ran, so the
  // fix was installed in the resolver and never reached from the endpoint.
  // cardparse.test.js --db called resolveCard directly and passed. The full
  // search audit (2026-09-29) found 96 cards unreachable by their own name
  // this way. TASK T9: a fix is not installed until every path HAS it.
  if (!parsed || (!parsed.name && !parsed.setHint && !parsed.number && !parsed.certId)) {
    // Say why, rather than returning an empty list that reads like "no match".
    return res.json({
      query: q, parsed, candidates: [], grade: parsed ? parsed.gradeString : null,
      resolved: null,
      message: 'Nothing identifying in that query — needs at least a card name or a collector number.'
    });
  }

  try {
    const rows = await resolveCard(db, parsed, { limit });
    const candidates = rows.map(searchCandidate);
    const top = candidates[0], second = candidates[1];
    const gap = top ? (second ? top.score - second.score : 999) : 0;
    const confident = !!top && gap >= SEARCH_CONFIDENT_GAP;

    const payload = {
      query: q,
      parsed,
      grade: parsed.gradeString,
      candidates,
      confident,
      gap,
      resolved: confident ? top.cardId : null
    };

    if (!candidates.length) {
      payload.message = 'No card in the database matches that. Check the collector number, or try just the card name.';
    } else if (!confident) {
      payload.message = `${candidates.length} cards match — pick one. (Top score beat the runner-up by ${gap}; ${SEARCH_CONFIDENT_GAP} is needed to auto-select.)`;
    }

    // A2 — chain a confident hit straight into listings.
    if (confident && wantListings) {
      const card = await resolveListingCard(top.cardId);
      if (card) {
        const grade = parsed.gradeString;
        // The same function /api/listings uses — same rows, same cache
        // entry, never a trimmed copy cached for the other to serve.
        const lp = await listingsFor(card, top.cardId, grade, null, {});
        payload.listings = lp.listings;
        payload.sources = lp.sources;
        payload.liveCount = lp.liveCount;
        payload.cheapest = lp.cheapest;
        payload.cheapestLive = lp.cheapestLive;
        payload.outliers = lp.outliers;
        payload.progress = lp.progress;
        payload.listingsCached = !!lp.cached;
      }
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ query: q, parsed, candidates: [], error: err.message });
  }
});

// GET /api/listings/:anything-that-is-not-a-card — REFUSED (TASK T9, 2026-09-29)
// A legacy handler here caught every id /api/listings/:cardId could not
// resolve and answered with an eBay search on the raw string: no cardmatch
// gate, no rejection count, no outlier flag — a listings path that had never
// run the gate, reachable by any typo or stale id. Nothing in the page, the
// audits or the tools called it by name. A card we cannot identify gets no
// listings, and the response says why rather than handing back ungated rows.
app.get('/api/listings/:cardName', (req, res) => {
  res.status(404).json({
    cardId: req.params.cardName, listings: [], count: 0,
    error: 'not a card in our catalogue — listings are only served for a catalogue id '
         + '({lang}-{setId}-{number}), because only a known card can be gated',
    hint: 'GET /api/search?q=' + encodeURIComponent(req.params.cardName) + ' finds the card id'
  });
});

// ══════════════════════════════════════════════════════════════
// PRICECHARTING — graded PSA / CGC / BGS prices
// Set PRICECHARTING_TOKEN in Render env vars.
// Free token at https://www.pricecharting.com/api-documentation
// ══════════════════════════════════════════════════════════════
const PC_TOKEN = process.env.PRICECHARTING_TOKEN || '';

app.get('/api/graded/:cardName', async (req, res) => {
  const { cardName } = req.params;
  const setName = req.query.set || '';
  if (!PC_TOKEN) {
    return res.json({
      configured: false,
      message: 'PriceCharting not configured. Add PRICECHARTING_TOKEN to enable graded prices.'
    });
  }
  try {
    const q = encodeURIComponent(`${cardName} ${setName}`.trim());
    const r = await fetch(`https://www.pricecharting.com/api/product?t=${PC_TOKEN}&q=${q}`);
    if (!r.ok) return res.json({ configured: true, error: 'PriceCharting ' + r.status });
    const d = await r.json();
    const cents = v => v ? parseFloat((v/100).toFixed(2)) : null;
    res.json({
      configured: true,
      name: d['product-name'],
      console: d['console-name'],
      prices: {
        'Raw NM':  cents(d['loose-price']),
        'PSA 9':   cents(d['graded-price']),
        'PSA 10':  cents(d['manual-only-price']),
        'CGC 9.5': cents(d['bgs-10-price']),
        'BGS 9.5': cents(d['box-only-price'])
      },
      raw: d
    });
  } catch (err) { res.json({ configured: true, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// DIAGNOSTIC — tells you exactly which sources are live
// ══════════════════════════════════════════════════════════════
app.get('/api/diagnostic', async (req, res) => {
  const out = { version: '5.6.0', checks: {} };

  try {
    const r = await fetch(`${TCG_API}/sets?pageSize=1`, { headers: TCG_H });
    out.checks.pokemontcg = r.ok ? 'OK' : 'FAIL ' + r.status;
  } catch (e) { out.checks.pokemontcg = 'FAIL ' + e.message; }

  try {
    const r = await fetch(`${TCGDEX}/en/sets/me02.5`);
    if (r.ok) {
      const d = await r.json();
      out.checks.tcgdex = 'OK';
      out.checks.tcgdex_ascended_heroes = (d.cards ? d.cards.length : 0) + ' cards';
      if (d.cards && d.cards.length) {
        out.checks.tcgdex_sample = d.cards.slice(-3).map(c => ({
          num: c.localId, name: c.name, rarity: c.rarity
        }));
      }
    } else out.checks.tcgdex = 'FAIL ' + r.status;
  } catch (e) { out.checks.tcgdex = 'FAIL ' + e.message; }

  try {
    const r = await fetch(`${TCGDEX}/ja/sets/sv03.5`);
    out.checks.tcgdex_japanese = r.ok ? 'OK' : 'FAIL ' + r.status;
  } catch (e) { out.checks.tcgdex_japanese = 'FAIL ' + e.message; }

  out.checks.ebay = ebayConfigured() ? 'configured' : 'NOT configured - add EBAY_CLIENT_ID + EBAY_CLIENT_SECRET';
  out.checks.pricecharting = PC_TOKEN ? 'configured' : 'NOT configured - add PRICECHARTING_TOKEN';
  out.checks.database = db ? 'Supabase connected' : 'no DATABASE_URL';

  out.sample_prices = {
    'Pikachu ex (SIR)':        estimatePrice('Special illustration rare', 'me2pt5-276', 'Pikachu ex'),
    'Mega Charizard Y (HR)':   estimatePrice('Mega hyper rare', 'me2pt5-294', 'Mega Charizard Y ex'),
    'Erika Oddish (Common)':   estimatePrice('Common', 'me2pt5-1', "Erika's Oddish")
  };
  res.json(out);
});



// ══════════════════════════════════════════════════════════════
// /api/market — what we HOLD for one card, and nothing fetched
//
// This block used to be "SCRAPER ROUTES — real market prices from multiple
// sources": four outbound calls on every card view, each a second answer to
// a question something else already answered properly.
//
//   ebaySold()            eBay's sold-page HTML           deleted T8
//   ebayActive()          ungated eBay NAME search        deleted 2026-09-29
//       fed the page's "Lowest listing" box when the gated one had not
//       answered, and a median-of-active fallback headline. /api/listings
//       computes cheapest / cheapestLive with the gate, the reprint and
//       language checks, and outliers excluded — the box reads that now.
//       Two implementations of one thing; it also cost an eBay call a view.
//   tcgplayerPrice()      TCGplayer's INTERNAL search API  deleted 2026-09-29
//       (mp-search-api.tcgplayer.com) from Render. TCGplayer grants no new
//       API access (CLAUDE.md), and calling their private endpoint from a
//       server is the T8 question again. We already hold their prices
//       legitimately: TCGdex (keyed by TCGplayer productId) and pokemontcg.io.
//       It also matched on NAME + SET only — the Mega Hawlucha $230.48.
//   priceChartingGraded() PriceCharting HTML scrape        deleted 2026-09-29
//       Dead: "OK - 0 grade prices" on every probe. The token API route
//       /api/graded/:cardName is separate and untouched.
//
// What is left needs no network: the number-matched price we store (the
// same LATERAL join /api/cards uses) and the sold status. Kept as an
// endpoint, with the old field names present and empty, so an older page
// or tool reading them gets "nothing" rather than undefined.
// ══════════════════════════════════════════════════════════════

// ── SOLD comps: there is no legitimate source, so there are none ──
// `ebaySold()` used to live here. It fetched eBay's completed-listings HTML
// (www.ebay.com/sch/... with LH_Sold=1) from Render on EVERY card view via
// /api/market, and parsed it with regexes: the same scrape `node ingest.js
// scrape` has been banned for since the start, and worse — a public URL,
// every view, while we hold eBay API credentials under eBay's terms. It risked
// the keyset, not just the IP. Disabled 2026-09-29 (TASK T8) and DELETED
// rather than switched off: a scraper left in place is one call site away from
// running again (the renderRealListings lesson).
//
// The legitimate routes to sold data are eBay's Marketplace Insights API
// (restricted — a business application) or a paid source such as
// PriceCharting; see CLAUDE.md "Sold data". The page's "eBay — sold" deep
// link is unaffected: it opens eBay in the user's own browser.
const SOLD_UNAVAILABLE = Object.freeze({
  available: false,
  source: null,
  reason: 'No licensed sold-price source. eBay completed sales need the '
        + "Marketplace Insights API (restricted); scraping eBay's sold pages "
        + 'is not done.',
  disabledOn: '2026-09-29'
});

// Every route that used to answer with a fetched aggregate says what it was
// and why it went, instead of disappearing.
const MARKET_WITHDRAWN = Object.freeze({
  ebaySold:        'eBay sold-page scrape — see sold.reason',
  ebayActive:      'ungated eBay name search — lowest live listing comes from /api/listings/:cardId (gated)',
  tcgplayerSearch: "TCGplayer's internal search API — their prices are held via TCGdex and pokemontcg.io",
  pricecharting:   'PriceCharting HTML scrape (returned nothing) — /api/graded/:cardName uses their token API'
});

// GET /api/market/:cardName?cardId=en-base1-4
app.get('/api/market/:cardName', async (req, res) => {
  try {
    const cardId = req.query.cardId || '';
    let nm = null;
    try { nm = await numberMatchedPrice(cardId); }
    catch (e) { nm = null; }   // never fail the read over the lookup
    const real = !!(nm && nm.isReal);
    const out = {
      card: req.params.cardName, set: req.query.set || '', grade: req.query.grade || 'Raw NM',
      cardId: nm ? nm.cardId : (cardId || null),
      // A number-matched price or nothing. The name-matched aggregate that
      // used to stand in here is gone with tcgplayerPrice — there is no
      // second, weaker answer to fall back to, which is the point.
      marketValue: real ? nm.price : null,
      confidence: real ? 'high' : 'none',
      basis: real ? nm.source + ' (collector number ' + nm.number + ')' : null,
      matchedOn: real ? 'collector number' : 'none',
      priceDate: real ? nm.recordedAt : null,
      sold: SOLD_UNAVAILABLE,
      withdrawn: MARKET_WITHDRAWN,
      // Old envelope, present and empty.
      soldCount: 0, soldMedian: null, soldRange: null, recentSales: [],
      lowestActive: null, activeCount: 0, listings: [], tcgplayer: null, graded: null,
      fetchedAt: new Date().toISOString()
    };
    if (!real) {
      out.matchWarning = cardId
        ? 'no number-matched price held for ' + cardId + ' — and no name-matched stand-in is offered'
        : 'no cardId supplied — this endpoint answers only for a catalogue card id';
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/market/:cardName/sold  - GONE (T8). It served the eBay sold-page
// scrape. 410 rather than 404 so a caller learns it was withdrawn on purpose.
app.get('/api/market/:cardName/sold', (req, res) => {
  res.status(410).json({ error: 'sold comparables withdrawn', sold: SOLD_UNAVAILABLE });
});

// GET /api/market/:cardName/active - GONE. An ungated eBay search by name.
app.get('/api/market/:cardName/active', (req, res) => {
  res.status(410).json({ error: 'ungated eBay name search withdrawn',
    reason: MARKET_WITHDRAWN.ebayActive, use: '/api/listings/:cardId?grade=' });
});

// GET /api/scraper/test - reports what the market block does now
app.get('/api/scraper/test', async (req, res) => {
  const out = { sources: {} };
  try {
    const a = await getEbayTokenDetailed();
    out.sources.ebay_api = a.token ? 'OK - token acquired'
      : (a.unconfigured ? 'NOT configured (add EBAY_CLIENT_ID + EBAY_CLIENT_SECRET)' : 'FAIL ' + a.error);
  } catch (e) { out.sources.ebay_api = 'FAIL ' + e.message; }
  out.sources.ebay_sold = 'DISABLED - ' + SOLD_UNAVAILABLE.reason;
  for (const [k, why] of Object.entries(MARKET_WITHDRAWN)) {
    if (k !== 'ebaySold') out.sources[k] = 'WITHDRAWN - ' + why;
  }
  res.json(out);
});


// ══════════════════════════════════════════════════════════════
// SETS BY LANGUAGE — real set lists from TCGdex per language
// GET /api/sets/lang/ja  -> every Japanese set with JP names + logos
// ══════════════════════════════════════════════════════════════
app.get('/api/sets/lang/:lang', async (req, res) => {
  const lang = (req.params.lang || 'en').toLowerCase();
  const key = `setlist_${lang}_v3`;
  try {
    const cached = cGet(key);
    if (cached) return res.json(cached);

    // ══ 1. OUR DATABASE — what we've actually ingested ══
    if (db) {
      try {
        const rows = await db.query(`
          SELECT c.set_api_id AS id,
                 MAX(c.set_name)     AS name,
                 MAX(c.set_name_en)  AS name_en,
                 MAX(c.set_logo)     AS logo,
                 MAX(c.set_series)   AS series,
                 MAX(c.set_release)  AS release_date,
                 MAX(c.set_total)    AS total,
                 COUNT(*)         AS card_count,
                 COUNT(*) FILTER (
                   WHERE EXISTS (SELECT 1 FROM price_history ph
                                 WHERE ph.card_api_id = c.api_card_id
                                   AND ph.grade IS NULL
                                   AND ph.source NOT LIKE 'estimate%'
                                   AND ${printsql.basePrintingSql('ph', 'c')})
                 ) AS real_prices,
                 (ARRAY_AGG(c.image_small ORDER BY c.api_card_id))[1] AS sample_image
          FROM cards c
          WHERE c.api_card_id LIKE $1
            AND ${digital.visibleSql('c')}
          GROUP BY c.set_api_id
          ORDER BY MAX(c.set_name)
        `, [lang + '-%']);

        if (rows.rows.length) {
          const sets = rows.rows.map(r => ({
            id: r.id,
            name: r.name,
            nameEn: r.name_en || null,
            total: parseInt(r.total) || parseInt(r.card_count),
            cardCount: parseInt(r.card_count),
            realPrices: parseInt(r.real_prices),
            coverage: r.card_count > 0
              ? +((r.real_prices / r.card_count) * 100).toFixed(1) : 0,
            // ── The logo is REPORTED, never guessed ──
            //
            // This used to fall back to a constructed URL. Measured
            // 2026-09-22: 0 of 138 Japanese sets and 0 of 84 Chinese sets
            // have a stored set_logo, plus 63 of 220 English — so 222 sets
            // were served a URL that had been invented. Seven sampled
            // Japanese ones returned 404, and tcgdexSeriesFor guesses the
            // series segment wrongly as well (SM6b resolves to `swsh`).
            // TCGdex simply has no logo for those sets.
            //
            // A guessed URL is indistinguishable from a real one until it
            // is rendered, so the browser showed a blank tile and nothing
            // said why. /api/cards/:id already returns null for this same
            // fact — two paths disagreeing about one thing, which is the
            // cross-check failure this codebase keeps finding.
            //
            // null is the honest answer, and the page draws a named tile
            // from it. See "Don't guess URLs — read them" in CLAUDE.md.
            logo: r.logo || null,
            // ── A real image for the 229 sets that have no logo ──
            // TCGdex holds no logo for ANY Japanese or Chinese set, so those
            // 222 plus 63 English ones fall back to a text tile. This query
            // was already selecting the set's first card image and throwing
            // it away — a genuinely relevant picture of the set, fetched and
            // discarded.
            //
            // It is a CARD, not a logo, and the page renders it differently
            // so it cannot be mistaken for one. Still null-able: a set whose
            // cards have no artwork (every Simplified Chinese set, and
            // 30th-c) falls through to the name tile, which is why that tile
            // stays.
            sampleImage: r.sample_image || null,
            serie: r.series || 'Other',
            releaseDate: r.release_date || null,
            lang
          }));
          // Newest first when we know the dates
          sets.sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')));
          const result = { lang, count: sets.length, sets, source: 'cardhunt_db' };
          cSet(key, result);
          return res.json(result);
        }
      } catch (e) { console.error('DB set list failed:', e.message); }
    }

    // ══ 2. FALLBACK — live TCGdex ══
    const tdLang = ['ja','zh-tw','zh-cn','fr','de','it','es','pt','ko','th','id']
      .includes(lang) ? lang : 'en';
    // Simplified and Traditional Chinese are separate releases — never substitute
    const fetchLang = tdLang;

    const r = await fetch(`${TCGDEX}/${fetchLang}/sets`);
    if (!r.ok) return res.status(502).json({ error: 'TCGdex ' + r.status, lang: fetchLang });
    // TCGdex's set list carries no series, so ask the series itself which
    // sets are Pocket. 404 in ja/zh (no Pocket there) means none to hide.
    const hideIds = new Set();
    for (const sid of digital.POCKET_SERIES_IDS) {
      try {
        const sr = await fetch(`${TCGDEX}/${fetchLang}/series/${sid}`);
        if (sr.ok) ((await sr.json()).sets || []).forEach(x => hideIds.add(x.id));
      } catch (e) { /* no series in this language */ }
    }
    const list = (await r.json() || []).filter(s => !hideIds.has(s.id));

    const sets = (list || []).map(s => ({
      id: s.id,
      name: s.name,
      logo: s.logo ? s.logo + '.png' : '',
      symbol: s.symbol ? s.symbol + '.png' : '',
      total: (s.cardCount && (s.cardCount.official || s.cardCount.total)) || 0,
      totalWithSecrets: (s.cardCount && s.cardCount.total) || 0,
      releaseDate: s.releaseDate || null,
      serie: (s.serie && s.serie.name) || null,
      lang: fetchLang
    }));
    sets.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));

    const result = { lang: fetchLang, count: sets.length, sets, source: 'tcgdex' };
    cSet(key, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function tcgdexSeriesFor(setId) {
  const s = String(setId).toLowerCase();
  if (s.startsWith('m') && /^m\d/.test(s)) return 'me';
  if (s.startsWith('me')) return 'me';
  if (s.startsWith('sv')) return 'sv';
  if (s.startsWith('csm') || s.startsWith('cs') || s.startsWith('cbb') || s.startsWith('csv')) return 'cs';
  if (s.startsWith('swsh') || s.startsWith('s')) return 'swsh';
  if (s.startsWith('sm')) return 'sm';
  if (s.startsWith('xy') || s.startsWith('cp')) return 'xy';
  if (s.startsWith('bw')) return 'bw';
  if (s.startsWith('base') || s.startsWith('pmcg')) return 'base';
  if (s.startsWith('neo')) return 'neo';
  if (s.startsWith('ex') || s.startsWith('adv') || s.startsWith('pcg')) return 'ex';
  return 'other';
}


// ══════════════════════════════════════════════════════════════
// FULL DIAGNOSTIC — one call tells you what works and what doesn't
// ══════════════════════════════════════════════════════════════
app.get('/api/health/full', async (req, res) => {
  const out = { version: '5.6.0', ts: new Date().toISOString(), checks: {} };

  // pokemontcg.io
  try {
    const r = await fetch(`${TCG_API}/sets?pageSize=1`, { headers: TCG_H });
    out.checks.pokemontcg = r.ok ? 'OK' : 'FAIL ' + r.status;
  } catch (e) { out.checks.pokemontcg = 'FAIL ' + e.message; }

  // TCGdex per language
  for (const L of ['en', 'ja', 'zh-tw']) {
    try {
      const r = await fetch(`${TCGDEX}/${L}/sets`);
      if (r.ok) {
        const d = await r.json();
        out.checks['tcgdex_' + L] = `OK - ${d.length} sets`;
      } else out.checks['tcgdex_' + L] = 'FAIL ' + r.status;
    } catch (e) { out.checks['tcgdex_' + L] = 'FAIL ' + e.message; }
  }

  // Does TCGdex actually have Ascended Heroes?
  for (const cand of ['me02.5', 'me2.5', 'me2pt5', 'me04', 'me4']) {
    try {
      const r = await fetch(`${TCGDEX}/en/sets/${cand}`);
      if (r.ok) {
        const d = await r.json();
        if (d.cards && d.cards.length) {
          out.checks['tcgdex_set_' + cand] = `OK - ${d.name} (${d.cards.length} cards)`;
          const last = d.cards[d.cards.length - 1];
          out.checks['tcgdex_set_' + cand + '_lastcard'] =
            `#${last.localId} ${last.name} rarity=${last.rarity || 'NONE'}`;
        }
      }
    } catch (e) { /* skip */ }
  }

  // Scraper sources
  try {
    const a = await getEbayTokenDetailed();
    out.checks.ebay_api = a.token ? 'OK - authenticated'
      : (a.unconfigured ? 'not configured' : 'FAIL ' + a.error);
  } catch (e) { out.checks.ebay_api = 'FAIL ' + e.message; }
  out.checks.ebay_sold_scrape = 'DISABLED - ' + SOLD_UNAVAILABLE.reason;
  for (const [k, why] of Object.entries(MARKET_WITHDRAWN)) out.checks[k] = 'WITHDRAWN - ' + why;

  out.checks.database = db ? 'Supabase connected' : 'no DATABASE_URL set';
  out.checks.cache_entries = Object.keys(CACHE).length;

  res.json(out);
});



// ══════════════════════════════════════════════════════════════
// EBAY MARKETPLACE ACCOUNT DELETION NOTIFICATION
//
// eBay requires every developer to expose an endpoint that receives
// account-deletion notices. This is the ONLY prerequisite for the free
// 5,000 calls/day Browse API tier — no approval or review beyond it.
//
// Setup:
//   1. developer.ebay.com -> Application Keys -> Notifications
//   2. Endpoint URL:  https://cardhunt-backend.onrender.com/ebay/deletion
//   3. Choose a verification token (32-80 chars, letters/numbers/_-)
//   4. Set EBAY_VERIFICATION_TOKEN on Render to that same value
//   5. eBay sends a GET challenge; this responds with the required hash
//
// We store no eBay user data, so a deletion notice needs no action beyond
// acknowledging it — but the endpoint must exist and respond correctly.
// ══════════════════════════════════════════════════════════════
const crypto = require('crypto');
const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN || '';
const EBAY_DELETION_ENDPOINT =
  process.env.EBAY_DELETION_ENDPOINT || 'https://cardhunt-backend.onrender.com/ebay/deletion';

// GET — eBay's ownership challenge.
// Respond with sha256(challengeCode + verificationToken + endpointUrl)
app.get('/ebay/deletion', (req, res) => {
  const challengeCode = req.query.challenge_code;
  if (!challengeCode) {
    return res.status(400).json({ error: 'challenge_code required' });
  }
  if (!EBAY_VERIFICATION_TOKEN) {
    return res.status(500).json({
      error: 'EBAY_VERIFICATION_TOKEN is not set on this server',
      hint: 'Add it in Render -> Environment, matching the token entered on developer.ebay.com'
    });
  }
  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(EBAY_VERIFICATION_TOKEN);
  hash.update(EBAY_DELETION_ENDPOINT);
  res.status(200).json({ challengeResponse: hash.digest('hex') });
});

// POST — the actual notification. Acknowledge with 200 or eBay retries.
// ── IF WE EVER STORE eBay USER DATA, THIS MUST ACTUALLY DELETE ──
// Today the handler only acknowledges, and that is correct BECAUSE we hold
// no eBay user data: listings are served from a 15-minute in-memory cache
// and never written to price_history (see EBAY_ATTRIBUTION and the T2 notes
// in CLAUDE.md). The moment any eBay-derived record is persisted against a
// user, acknowledging without deleting becomes a breach of their terms
// rather than an accurate no-op. The obligation is invisible in this code
// precisely because there is nothing to delete — so it is written down here.
app.post('/ebay/deletion', (req, res) => {
  try {
    const n = req.body && req.body.notification;
    if (n && n.data) {
      console.log('eBay account deletion notice:', n.data.userId || '(no id)');
      // We hold no eBay user data. If that changes, delete it here.
    }
  } catch (e) { /* still acknowledge */ }
  res.status(200).send();
});

// ══════════════════════════════════════════════════════════════
// GET /api/ebay/quota  —  what we have spent today, by eBay's count
//
// The count lives in Supabase, not memory: Render's free tier restarts on
// idle, and an in-memory counter would reset to zero on every cold start,
// so the process could spend 5,000 calls several times over and believe it
// had made a few hundred.
//
// ?probe=1 additionally asks eBay what our real limit is (costs ONE call).
// If their figure is not 5,000, DAILY_LIMIT is wrong and every threshold
// above it is calibrated to the wrong number — so this is worth running
// once against live credentials before trusting any of it.
//
// READ-ONLY with respect to card data. It writes only the quota ledger,
// which is the point of the ledger.
// ══════════════════════════════════════════════════════════════
// ── Where does eBay state a raw card's condition? A MEASUREMENT, not a feature ──
//
//   GET /api/ebay/conditions/:cardId?grade=Raw%20NM&items=20
//
// The coarse `condition` field on 447 live rows said "Ungraded" (or a
// localisation of it) every time. eBay also has trading-card condition
// DESCRIPTORS — a structured "Card Condition" for ungraded cards — and the
// question is whether they reach us at all, and at what quota cost:
//
//   1. one search call: does ANY item summary carry conditionDescriptors?
//      (the summary's full key set is reported, so absence is visible)
//   2. `items` getItem calls (0 by default, capped at 25): does the full
//      item carry them, and with what values?
//
// Read-only and never stored: it returns COUNTS and a few samples, exactly
// as /api/listings serves rows for a request. It takes a card id, never a
// URL. Cached 30 minutes, because a probe that can be hammered spends the
// quota it exists to measure.
const conditionProbeCache = new Map();
app.get('/api/ebay/conditions/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const grade = String(req.query.grade || 'Raw NM');
  const nItems = Math.max(0, Math.min(25, parseInt(req.query.items, 10) || 0));
  // Every parameter that changes the answer is in the key. It used to be
  // [cardId, grade, items] only, so ?aspects=1 could be answered from a run
  // that never asked for aspects.
  const key = JSON.stringify([cardId, Object.keys(req.query).filter(k => k !== 'refresh').sort().map(k => [k, String(req.query[k])])]);
  const hit = conditionProbeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000 && req.query.refresh !== '1') {
    return res.json(Object.assign({ cached: true, cachedAgeSec: Math.round((Date.now() - hit.at) / 1000) }, hit.body));
  }
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json({ error: 'card not in catalogue', cardId });
    const auth = await getEbayTokenDetailed({});
    if (!auth.token) return res.status(503).json({ error: auth.reason || auth.error || 'no token' });

    const q = cm.buildQuery({
      name: card.name_en || card.name, nameEn: card.name_en || null, number: card.number,
      setTotal: card.set_total, setName: card.set_name_en || card.set_name,
      setId: card.set_api_id, lang: gateLanguage(card)
    }, grade);
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(q)
      + '&category_ids=183454&limit=100';
    const call = await ebay.fetchEbay(db, { url, token: auth.token, kind: 'search',
      meta: { cardId, grade, query: q, probe: 'conditions' },
      countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
    if (!call.ok) return res.status(502).json({ error: call.reason || call.blocked, query: q });

    const items = (call.data && call.data.itemSummaries) || [];
    const tally = (m, k) => { m[k] = (m[k] || 0) + 1; };
    const summaryKeys = {}, summaryCondition = {}, summaryDescriptors = {};
    let summariesWithDescriptors = 0;
    const descOf = arr => (arr || []).map(d => ({
      name: d.name, values: (d.values || []).map(v => v.content || v.value || v) }));
    for (const it of items) {
      Object.keys(it).forEach(k => tally(summaryKeys, k));
      tally(summaryCondition, `${it.condition || '(none)'} [${it.conditionId || '-'}]`);
      if (it.conditionDescriptors && it.conditionDescriptors.length) {
        summariesWithDescriptors++;
        descOf(it.conditionDescriptors).forEach(d => d.values.forEach(v => tally(summaryDescriptors, d.name + ': ' + v)));
      }
    }

    // The per-item half: only as many calls as were asked for.
    const itemDescriptors = {}, itemCondition = {}, samples = [];
    let itemsFetched = 0, itemsWithDescriptors = 0, itemErrors = 0;
    for (const it of items.slice(0, nItems)) {
      const g = await ebay.fetchEbay(db, {
        url: 'https://api.ebay.com/buy/browse/v1/item/' + encodeURIComponent(it.itemId),
        token: auth.token, kind: 'item', meta: { cardId, probe: 'conditions' },
        countFrom: () => 1 });
      if (!g.ok) { itemErrors++; if (g.blocked) break; continue; }
      itemsFetched++;
      const full = g.data || {};
      tally(itemCondition, `${full.condition || '(none)'} [${full.conditionId || '-'}]`);
      const ds = descOf(full.conditionDescriptors);
      if (ds.length) itemsWithDescriptors++;
      ds.forEach(d => d.values.forEach(v => tally(itemDescriptors, d.name + ': ' + v)));
      if (samples.length < 25) {
        const sc = cm.sellerCondition(full.title || it.title);
        samples.push({ title: full.title || it.title, condition: full.condition,
                       descriptors: ds, titleSays: sc.stated ? sc.code : null });
      }
    }

    // ?aspects=1 — can SEARCH filter on it, so a condition costs one call
    // rather than one per listing? Ask for eBay's aspect refinements, and for
    // every condition-like aspect run one filtered search per value. The
    // aspect name and values are eBay's own, read from the response — never
    // supplied by the caller.
    let aspects = null, aspectCalls = 0;
    if (req.query.aspects === '1') {
      const ra = await ebay.fetchEbay(db, { url: url + '&fieldgroups=ASPECT_REFINEMENTS',
        token: auth.token, kind: 'search', meta: { cardId, probe: 'conditions-aspects' },
        countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
      const ref = (ra.ok && ra.data && ra.data.refinement) || {};
      const dists = ref.aspectDistributions || [];
      aspects = {
        names: dists.map(a => a.localizedAspectName),
        conditionDistributions: (ref.conditionDistributions || []).map(c => [c.condition, c.conditionId, c.matchCount]),
        condition: []
      };
      const only = req.query.aspect ? String(req.query.aspect) : null;
      for (const a of dists.filter(a => /condition|grade|grader/i.test(a.localizedAspectName) &&
                                        (!only || a.localizedAspectName === only))) {
        const vals = (a.aspectValueDistributions || []).slice(0, 8);
        const entry = { name: a.localizedAspectName,
          values: vals.map(v => [v.localizedAspectValue, v.matchCount]), filtered: [] };
        for (const v of vals.slice(0, 5)) {
          const af = `categoryId:183454,${a.localizedAspectName}:{${v.localizedAspectValue}}`;
          const rf = await ebay.fetchEbay(db, {
            url: url + '&aspect_filter=' + encodeURIComponent(af),
            token: auth.token, kind: 'search', meta: { cardId, probe: 'conditions-aspect-filter' },
            countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
          const its = (rf.ok && rf.data && rf.data.itemSummaries) || [];
          // ?verify=N — does the filter AGREE with each item's own
          // descriptor? Two paths to one fact, asserted to match: getItem on
          // the first N results of every filtered search.
          const agree = [];
          for (const it of its.slice(0, Math.min(5, parseInt(req.query.verify, 10) || 0))) {
            const gi = await ebay.fetchEbay(db, {
              url: 'https://api.ebay.com/buy/browse/v1/item/' + encodeURIComponent(it.itemId),
              token: auth.token, kind: 'item', meta: { cardId, probe: 'conditions-verify' },
              countFrom: () => 1 });
            aspectCalls++;
            const ds = gi.ok ? descOf(gi.data.conditionDescriptors) : [];
            const said = ds.filter(d => /condition|grade/i.test(d.name))
              .map(d => d.name + ': ' + d.values.join('/')).join('; ');
            agree.push({ title: (it.title || '').slice(0, 60), descriptor: said || '(none)' });
          }
          entry.filtered.push({ value: v.localizedAspectValue, ok: rf.ok, total: rf.ok ? rf.data.total : null,
            returned: its.length, firstTitles: its.slice(0, 3).map(i => i.title),
            firstIds: its.slice(0, 3).map(i => i.itemId), agree });
        }
        aspects.condition.push(entry);
      }

      // ?combo=N — grader AND grade in ONE filter (2026-09-27, T3). The
      // single-aspect runs above agreed with each item's own descriptor
      // 9/9 for PSA/BGS/CGC but 1/3 for Ace, and 13/15 on grade. Before
      // building on a combined filter, measure it: for grader x grade pairs
      // taken from eBay's OWN distribution (top N of each, plus any grader
      // whose eBay name contains a ?graders= term, e.g. TAG), one filtered
      // search each, then getItem on the first ?verify= results to compare
      // the filter with the item's descriptor AND with its title.
      if (req.query.combo) {
        const n = Math.max(1, Math.min(4, parseInt(req.query.combo, 10) || 2));
        const gd = dists.find(a => a.localizedAspectName === 'Professional Grader');
        const gr = dists.find(a => a.localizedAspectName === 'Grade');
        const vals = a => (a ? a.aspectValueDistributions || [] : []).map(v => [v.localizedAspectValue, v.matchCount]);
        aspects.allValues = { 'Professional Grader': vals(gd), 'Grade': vals(gr) };
        aspects.combo = [];
        if (gd && gr) {
          const want = String(req.query.graders || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          const gvals = vals(gd).map(v => v[0]);
          const graders = [...new Set(gvals.slice(0, n).concat(gvals.filter(g => want.some(w => g.toLowerCase().includes(w)))))];
          const grades = vals(gr).sort((a, b) => b[1] - a[1]).slice(0, n).map(v => v[0])
            .concat(String(req.query.grades || '').split(',').map(s => s.trim())
              .filter(s => vals(gr).some(v => v[0] === s)));
          const nVerify = Math.min(5, parseInt(req.query.verify, 10) || 0);
          for (const g of graders) for (const v of [...new Set(grades)]) {
            const af = `categoryId:183454,Professional Grader:{${g}},Grade:{${v}}`;
            const rf = await ebay.fetchEbay(db, { url: url + '&aspect_filter=' + encodeURIComponent(af),
              token: auth.token, kind: 'search', meta: { cardId, probe: 'grade-combo' },
              countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
            const its = (rf.ok && rf.data && rf.data.itemSummaries) || [];
            const rows = [];
            for (const it of its.slice(0, nVerify)) {
              const gi = await ebay.fetchEbay(db, {
                url: 'https://api.ebay.com/buy/browse/v1/item/' + encodeURIComponent(it.itemId),
                token: auth.token, kind: 'item', meta: { cardId, probe: 'grade-combo-verify' }, countFrom: () => 1 });
              aspectCalls++;
              const ds = gi.ok ? descOf(gi.data.conditionDescriptors) : [];
              const dv = name => ((ds.find(d => d.name === name) || {}).values || []).join('/') || null;
              const titleGrades = cm.gradesIn(it.title || '');
              rows.push({ title: (it.title || '').slice(0, 90),
                          descriptor: { grader: dv('Professional Grader'), grade: dv('Grade') },
                          title: titleGrades.map(x => x.grader + ' ' + x.grade) });
            }
            aspects.combo.push({ grader: g, grade: v, ok: rf.ok, total: rf.ok ? rf.data.total : null,
                                 returned: its.length, rows,
                                 titles: its.slice(0, 25).map(i => i.title) });
          }
        }
      }
    }

    const body = {
      cardId, grade, query: q, aspects,
      search: { calls: 1, items: items.length, summariesWithDescriptors,
                summaryKeys, condition: summaryCondition, descriptors: summaryDescriptors },
      getItem: { asked: nItems, fetched: itemsFetched, errors: itemErrors,
                 withDescriptors: itemsWithDescriptors,
                 condition: itemCondition, descriptors: itemDescriptors, samples },
      quotaSpent: 1 + itemsFetched + itemErrors +
        (aspects ? 1 + aspects.condition.reduce((n, e) => n + e.filtered.length, 0) + aspectCalls
                     + (aspects.combo ? aspects.combo.length : 0) : 0),
      stored: false
    };
    conditionProbeCache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Which raw condition values does eBay actually have? A MEASUREMENT ──
//
//   GET /api/ebay/conditionvalues[?cards=en-base1-4,en-base1-58]
//
// The M and DMG chips were removed (3235503) on the premise "eBay's scale has
// four values — no Mint, no Damaged". That was read off ONE search's aspect
// distribution, which only lists values present among those results. This
// asks eBay directly, three ways: the category's condition POLICY (Sell
// Metadata — the list a seller picks from), the category's ASPECTS
// (Taxonomy), and live Card Condition distributions over several raw-heavy
// cards. Read-only; card ids only (resolved from our catalogue).
app.get('/api/ebay/conditionvalues', async (req, res) => {
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    const auth = await getEbayTokenDetailed({});
    if (!auth.token) return res.status(503).json({ error: auth.reason || auth.error || 'no token' });
    const out = { category: 183454 };
    const get = (url, probe) => ebay.fetchEbay(db, { url, token: auth.token, kind: 'meta',
      meta: { probe }, countFrom: () => 0 });

    const pol = await get('https://api.ebay.com/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies'
      + '?filter=' + encodeURIComponent('categoryIds:{183454}'), 'condition-policy');
    out.policy = pol.ok
      ? ((pol.data.itemConditionPolicies || [])[0] || {}).itemConditions || pol.data
      : { error: pol.reason || pol.blocked, status: pol.status };

    const tax = await get('https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category'
      + '?category_id=183454', 'condition-aspects');
    out.aspects = tax.ok
      ? (tax.data.aspects || []).filter(a => /condition|grade|grader/i.test(a.localizedAspectName))
          .map(a => ({ name: a.localizedAspectName, values: (a.aspectValues || []).map(v => v.localizedValue) }))
      : { error: tax.reason || tax.blocked, status: tax.status };

    const ids = String(req.query.cards || 'en-base1-4,en-base1-58,en-base1-2,en-base1-15,en-neo1-9')
      .split(',').map(s => s.trim()).filter(cardid.isOurCardId).slice(0, 6);
    out.distributions = [];
    for (const id of ids) {
      const card = await resolveListingCard(id);
      if (!card) { out.distributions.push({ cardId: id, error: 'not in catalogue' }); continue; }
      const q = cm.buildQuery(ebayMatchCard(card), 'Raw');
      const r = await ebay.fetchEbay(db, { url: 'https://api.ebay.com/buy/browse/v1/item_summary/search?q='
          + encodeURIComponent(q) + '&category_ids=183454&limit=1&fieldgroups=ASPECT_REFINEMENTS',
        token: auth.token, kind: 'search', meta: { cardId: id, probe: 'condition-values' },
        countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
      const dists = (r.ok && r.data.refinement && r.data.refinement.aspectDistributions) || [];
      const cc = dists.find(a => a.localizedAspectName === 'Card Condition');
      out.distributions.push({ cardId: id, query: q, total: r.ok ? r.data.total : null,
        cardCondition: cc ? cc.aspectValueDistributions.map(v => [v.localizedAspectValue, v.matchCount]) : null });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Is a slab's CERT NUMBER available, and where? A MEASUREMENT (T4 step 1) ──
//
//   GET /api/ebay/certprobe/:cardId?grader=PSA&pages=2&bulk=3
//   GET /api/ebay/certprobe/:cardId?graded=0&pages=1          (raw titles, T2)
//
// Before any cert verification is designed, three questions, each answered
// from eBay rather than assumed:
//   · does a search SUMMARY carry it?  (every key on every summary is tallied)
//   · is it a search ASPECT?           (eBay's own refinement names, listed)
//   · does the full item carry it?     (getItems, 20 per call; ?bulk= calls)
// It also returns every title, so how often sellers WRITE the number — and
// how often they write "PSA10" unspaced (T2) — is counted locally from
// eBay's own text, not from a sample typed by hand.
//
// Read-only; nothing stored (eBay's terms); takes a catalogue card id and a
// grader name from our own list, never a URL. Costs pages + 1 + bulk calls,
// all background, so it yields at the soft stop like ingestion does.
const certProbeCache = new Map();
app.get('/api/ebay/certprobe/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const pages = Math.max(1, Math.min(3, parseInt(req.query.pages, 10) || 1));
  const bulk = Math.max(0, Math.min(5, parseInt(req.query.bulk, 10) || 0));
  const raw = req.query.graded === '0';
  const graderArg = String(req.query.grader || '').toUpperCase();
  const key = JSON.stringify([cardId, pages, bulk, raw, graderArg, req.query.single || 0]);
  const hit = certProbeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000 && req.query.refresh !== '1') {
    return res.json(Object.assign({ cached: true }, hit.body));
  }
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    let filter;
    if (raw) filter = 'categoryId:183454,Graded:{No}';
    else if (graderArg) {
      const gf = cm.GRADERS_UNAMBIGUOUS.concat(['TAG']).includes(graderArg) ? cm.ebayGradeFilter(graderArg + ' *') : null;
      if (!gf) return res.status(400).json({ error: 'grader must be one eBay names, e.g. PSA, BGS, CGC, SGC, TAG' });
      filter = gf.aspectFilter;
    } else filter = 'categoryId:183454,Graded:{Yes}';
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json({ error: 'card not in catalogue', cardId });
    const auth = await getEbayTokenDetailed({ background: true });
    if (!auth.token) return res.status(503).json({ error: auth.reason || auth.error || 'no token' });
    const q = cm.buildQuery(ebayMatchCard(card), raw ? 'Raw' : '');
    const base = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(q)
      + '&category_ids=183454&limit=100&sort=price&aspect_filter=' + encodeURIComponent(filter);

    const tally = (m, k) => { m[k] = (m[k] || 0) + 1; };
    const items = [], summaryKeys = {};
    let total = null, calls = 0, aspectNames = null;
    for (let p = 0; p < pages; p++) {
      const url = base + '&offset=' + (p * 100) + (p === 0 ? '&fieldgroups=ASPECT_REFINEMENTS,MATCHING_ITEMS' : '');
      const r = await ebay.fetchEbay(db, { url, token: auth.token, kind: 'search', background: true,
        meta: { cardId, probe: 'certprobe' },
        countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
      calls++;
      if (!r.ok) { if (!items.length) return res.status(502).json({ error: r.reason || r.blocked, query: q }); break; }
      total = r.data.total;
      if (p === 0) {
        const ref = r.data.refinement || {};
        aspectNames = (ref.aspectDistributions || []).map(a => a.localizedAspectName);
      }
      const its = r.data.itemSummaries || [];
      for (const it of its) {
        Object.keys(it).forEach(k => tally(summaryKeys, k));
        items.push({ itemId: it.itemId, title: it.title, price: it.price && +it.price.value,
                     condition: it.condition || null,
                     descriptors: it.conditionDescriptors || undefined });
      }
      if (its.length < 100 || (p + 1) * 100 >= total) break;
    }

    // The full item, 20 at a time. getItems is the bulk form of getItem; if
    // eBay refuses it, say so with its status rather than quietly falling
    // back to one call per item.
    const full = {}; let bulkStatus = null;
    for (let b = 0; b < bulk; b++) {
      const ids = items.slice(b * 20, b * 20 + 20).map(i => i.itemId);
      if (!ids.length) break;
      const r = await ebay.fetchEbay(db, {
        url: 'https://api.ebay.com/buy/browse/v1/item/?item_ids=' + encodeURIComponent(ids.join(',')),
        token: auth.token, kind: 'item', background: true, meta: { cardId, probe: 'certprobe-items' },
        countFrom: () => ids.length });
      calls++;
      if (!r.ok) { bulkStatus = { ok: false, reason: r.reason || r.blocked, status: r.status || null }; break; }
      bulkStatus = { ok: true };
      for (const it of (r.data.items || [])) {
        full[it.itemId] = {
          descriptors: (it.conditionDescriptors || []).map(d => ({
            name: d.name, values: (d.values || []).map(v => v.content || v.value || v),
            additional: (d.values || []).map(v => v.additionalInfo).filter(Boolean) })),
          aspects: (it.localizedAspects || []).filter(a => /cert|grade|grader/i.test(a.name))
            .map(a => [a.name, a.value])
        };
      }
    }
    // Measured 2026-09-28: getItems answers 403 "1100: Access denied" to this
    // keyset — it is a restricted API. ?single=N measures the path that IS
    // open, getItem, at one call per listing: the price of a cert number.
    const single = Math.max(0, Math.min(25, parseInt(req.query.single, 10) || 0));
    for (const it of items.slice(0, single)) {
      if (full[it.itemId]) continue;
      const r = await ebay.fetchEbay(db, {
        url: 'https://api.ebay.com/buy/browse/v1/item/' + encodeURIComponent(it.itemId),
        token: auth.token, kind: 'item', background: true, meta: { cardId, probe: 'certprobe-item' },
        countFrom: () => 1 });
      calls++;
      if (!r.ok) { if (r.blocked) break; continue; }
      full[it.itemId] = {
        descriptors: (r.data.conditionDescriptors || []).map(d => ({
          name: d.name, values: (d.values || []).map(v => v.content || v.value || v),
          additional: (d.values || []).map(v => v.additionalInfo).filter(Boolean) })),
        aspects: (r.data.localizedAspects || []).filter(a => /cert|grade|grader/i.test(a.name))
          .map(a => [a.name, a.value])
      };
    }
    for (const it of items) if (full[it.itemId]) it.full = full[it.itemId];

    const body = { cardId, query: q, filter, ebayTotal: total, returned: items.length,
                   summaryKeys, aspectNames, bulkStatus, calls, stored: false, items };
    certProbeCache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Verify ONE listing's cert, when a person asks (TASK T2) ──
//
//   GET /api/cert/:cardId?item=v1|167236883977|0&grade=PSA%2010
//
// One eBay getItem per press, spent only because someone pressed Verify on
// that row — never on page load, never for a list. certcheck.js holds the
// rules and the storage split: eBay's listing->cert link lives 15 minutes in
// memory and is never persisted; PSA's answer (grader + number -> card,
// grade) would be permanent, and is NOT BUILT until PSA's key, limit and
// storage terms are answered. So today the answer stops at "what the seller
// entered", and says that is all it is.
//
// PSA only: Beckett, CGC, SGC and TAG have no API, and their cert pages are
// never scraped. Takes a catalogue card id and an eBay item id of the Browse
// shape — never a URL.
const certcheck = require('./certcheck');

// ONE getItem per listing, shared by Verify and Photos (TASK T7). Returns
// { hit, calls } or { status, body } on refusal. The cache entry holds both
// the cert read and the image URLs, so whichever button is pressed first
// pays the call and the other is free for the next 15 minutes.
async function ebayItemOnDemand(itemId, cardId, purpose) {
  let hit = certcheck.ebayCacheGet(itemId);
  if (hit) return { hit, calls: 0 };
  if (!ebay.ebayEnabled()) return { status: 503, body: { error: 'EBAY_ENABLED=false' } };
  // Foreground: a person is waiting on this one call.
  const auth = await getEbayTokenDetailed({ background: false });
  if (!auth.token) return { status: 503, body: { error: auth.reason || auth.error || 'eBay token unavailable', status: auth.blocked || 'error' } };
  const call = await ebay.fetchEbay(db, {
    url: 'https://api.ebay.com/buy/browse/v1/item/' + encodeURIComponent(itemId),
    token: auth.token, kind: 'item', background: false,
    meta: { cardId, probe: purpose }, countFrom: () => 1 });
  if (call.blocked) return { status: 503, body: { error: call.reason, status: call.blocked } };
  if (!call.ok) return { status: 502, body: { error: call.reason || 'eBay getItem failed' } };
  certcheck.ebayCacheSet(itemId, certcheck.fromItem(call.data));
  return { hit: certcheck.ebayCacheGet(itemId), calls: 1 };
}
const ebayItemMeta = (hit, calls) => ({ calls, cached: calls === 0,
  ageSec: Math.round((Date.now() - hit.at) / 1000), keptFor: '15 minutes, in memory only' });

app.get('/api/cert/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const itemId = String(req.query.item || '');
  const grade = String(req.query.grade || '');
  const base = { cardId, itemId, grade, stored: false };
  if (!certcheck.ITEM_ID.test(itemId)) return res.status(400).json(Object.assign(base, { error: 'item must be an eBay Browse item id, e.g. v1|167236883977|0' }));
  if (!/^PSA\b/i.test(grade)) return res.status(400).json(Object.assign(base, { error: 'cert checks are PSA only — Beckett, CGC, SGC and TAG publish no API' }));
  try {
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json(Object.assign(base, { error: 'card not in catalogue' }));
    const got = await ebayItemOnDemand(itemId, cardId, 'cert-verify');
    if (!got.hit) return res.status(got.status).json(Object.assign(base, got.body));
    const { hit, calls } = got;
    const read = hit.read;
    const st = certcheck.stateFromEbay(read, 'PSA');
    res.json(Object.assign(base, {
      state: st.state, says: st.says,
      cert: read.cert, grader: read.grader, sellerGrade: read.grade,
      certLooksValid: read.certLooksValid,
      // For the person's own browser; the server never fetches it.
      psaUrl: read.grader === 'PSA' ? certcheck.psaCertUrl(read.cert) : null,
      psa: certcheck.psaLookup(read.cert),
      ebay: ebayItemMeta(hit, calls),
      attribution: 'Cert number as entered by the seller on eBay'
    }));
  } catch (e) { res.status(500).json(Object.assign(base, { error: e.message })); }
});

// ── The seller's own photos of ONE listing, when a person asks (TASK T7) ──
//
//   GET /api/photos/:cardId?item=v1|167236883977|0
//
// Replaces a viewer that showed our catalogue artwork three times, one copy
// brightened and one sepia, beside an invented price. The images are eBay's,
// shown with their listing and a link to it, and kept no longer than the
// 15-minute window. The same getItem as /api/cert — one call answers both.
// Returns exactly the images the listing has: one is one.
app.get('/api/photos/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const itemId = String(req.query.item || '');
  const base = { cardId, itemId, stored: false };
  if (!certcheck.ITEM_ID.test(itemId)) return res.status(400).json(Object.assign(base, { error: 'item must be an eBay Browse item id, e.g. v1|167236883977|0' }));
  try {
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json(Object.assign(base, { error: 'card not in catalogue' }));
    const got = await ebayItemOnDemand(itemId, cardId, 'photos');
    if (!got.hit) return res.status(got.status).json(Object.assign(base, got.body));
    const images = got.hit.images || [];
    res.json(Object.assign(base, {
      images, count: images.length,
      ebay: ebayItemMeta(got.hit, got.calls),
      attribution: 'Photos from the seller’s eBay listing'
    }));
  } catch (e) { res.status(500).json(Object.assign(base, { error: e.message })); }
});

// ── What does filtering to NARROW cost, against the 75-row cap? A MEASUREMENT ──
//
//   GET /api/ebay/gradecost/:cardId?grade=PSA%208&pages=3
//
// Since 1849611 a graded search sends eBay's Professional Grader + Grade
// aspect filter. The live net effect was +9 / -6 of 305, and none of the six
// was refused by the disagreement rule: the filtered search never RETURNED
// them — a listing whose seller left the grade fields empty cannot match a
// filter on them. The old unfiltered search had its own loss: sorted by
// price and capped at 75 rows (limit 25 x 3), cheap junk on a busy card
// pushes wanted slabs past the cap. Which loses more?
//
// Pages BOTH searches deep (100 a page, same query, same sort), runs the real
// gate on every row, and reports: wanted rows lost to missing aspects, lost to
// the cap under each design, and what the two-call alternative ("filter to
// verify": unfiltered list + filtered set) would deliver. Read-only; nothing
// stored; takes a card id and a grade, never a URL. 2 x pages calls.
const gradeCostCache = new Map();
app.get('/api/ebay/gradecost/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const grade = String(req.query.grade || '');
  const pages = Math.max(1, Math.min(5, parseInt(req.query.pages, 10) || 3));
  const CAP = 75;                                  // what /api/listings asks for at limit 25
  const key = JSON.stringify([cardId, grade, pages]);
  const hit = gradeCostCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000 && req.query.refresh !== '1') return res.json(hit.body);
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    const gf = cm.ebayGradeFilter(grade);
    if (!gf || !gf.grade) return res.status(400).json({ error: 'needs a specific grade from a grader eBay names, e.g. PSA 8' });
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json({ error: 'card not in catalogue', cardId });
    const auth = await getEbayTokenDetailed({});
    if (!auth.token) return res.status(503).json({ error: auth.reason || auth.error || 'no token' });
    const matchCard = ebayMatchCard(card);
    const q = cm.buildQuery(matchCard, grade);
    const base = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(q)
      + '&category_ids=183454&limit=100&sort=price';

    async function scan(filtered) {
      const rows = []; let total = null, calls = 0;
      for (let p = 0; p < pages; p++) {
        const url = base + '&offset=' + (p * 100)
          + (filtered ? '&aspect_filter=' + encodeURIComponent(gf.aspectFilter) : '');
        const r = await ebay.fetchEbay(db, { url, token: auth.token, kind: 'search',
          meta: { cardId, grade, probe: 'gradecost' },
          countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0) });
        calls++;
        if (!r.ok) break;
        total = r.data.total;
        const its = r.data.itemSummaries || [];
        its.forEach((it, i) => {
          const price = parseFloat((it.price && it.price.value) || 0);
          const v = cm.verify(it.title || '', matchCard, grade,
            filtered ? { structuredGrade: { grader: gf.grader, grade: gf.grade } } : undefined);
          rows.push({ id: it.itemId, title: it.title, price, pos: p * 100 + i, ok: !!v.ok,
                      gradeSource: v.gradeSource || null, conflict: !!v.gradeConflict,
                      reason: v.ok ? null : v.reason });
        });
        if (its.length < 100 || (p + 1) * 100 >= total) break;
      }
      return { rows, total, calls, complete: total != null && rows.length >= total };
    }
    const U = await scan(false), F = await scan(true);
    const inF = new Set(F.rows.map(r => r.id));
    const W = U.rows.filter(r => r.ok);                 // wanted, by the title gate (old design)
    const N = F.rows.filter(r => r.ok);                 // wanted, by filter + disagreement rule (new)
    const pick = rs => rs.slice(0, 8).map(r => ({ pos: r.pos, price: r.price, title: (r.title || '').slice(0, 90) }));
    const aspectLost = F.complete ? W.filter(r => !inF.has(r.id)) : null;
    const oldDelivered = W.filter(r => r.pos < CAP), newDelivered = N.filter(r => r.pos < CAP);
    const hybrid = new Set(oldDelivered.map(r => r.id).concat(newDelivered.map(r => r.id)));
    const body = {
      cardId, grade, query: q, cap: CAP, filter: gf.aspectFilter,
      unfiltered: { ebayTotal: U.total, scanned: U.rows.length, complete: U.complete, calls: U.calls,
                    wanted: W.length, beyondCap: W.filter(r => r.pos >= CAP).length },
      filtered: { ebayTotal: F.total, scanned: F.rows.length, complete: F.complete, calls: F.calls,
                  wanted: N.length, beyondCap: N.filter(r => r.pos >= CAP).length,
                  fieldOnly: N.filter(r => r.gradeSource === 'ebay').length,
                  refusedOnDisagreement: F.rows.filter(r => r.conflict).length },
      lost: {
        // wanted by title, never returned by the filter (aspects empty/other)
        toMissingAspects: aspectLost ? aspectLost.length : 'unknown — filtered scan incomplete',
        toCapOld: W.filter(r => r.pos >= CAP).length,
        toCapNew: N.filter(r => r.pos >= CAP).length
      },
      delivered: { old: oldDelivered.length, new: newDelivered.length,
                   twoCallsFilterToVerify: hybrid.size },
      samples: { missingAspects: aspectLost ? pick(aspectLost) : [],
                 pastCapOld: pick(W.filter(r => r.pos >= CAP)),
                 fieldOnly: pick(N.filter(r => r.gradeSource === 'ebay')),
                 refused: F.rows.filter(r => r.conflict).slice(0, 6).map(r => ({ title: (r.title || '').slice(0, 80), reason: r.reason })) },
      quotaSpent: U.calls + F.calls, stored: false
    };
    gradeCostCache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// GET /api/ebay/marketprobe/:cardId?grade=Raw%20NM&mp=EBAY_GB,EBAY_DE
//
// T1, 2026-09-30. Every eBay search sends X-EBAY-C-MARKETPLACE-ID: EBAY_US.
// Before asking more sites from /api/listings (each one its own call, 1-3
// pages), measure what each ADDS after the gate: the REAL sourceEbay per
// marketplace, then overlap by eBay's global item id against EBAY_US.
//
// Read-only, nothing stored (eBay's terms), cached 30 min. Takes a
// catalogue id and marketplace ids from MARKETPROBE_SITES — never a URL
// (the /api/probe/sources SSRF rule). Background priority, so a probe
// yields at the soft stop rather than eating the user reserve.
// ══════════════════════════════════════════════════════════════
const MARKETPROBE_SITES = ['EBAY_US', 'EBAY_GB', 'EBAY_DE', 'EBAY_AU', 'EBAY_CA',
                           'EBAY_FR', 'EBAY_IT', 'EBAY_ES', 'EBAY_JP',
                           'EBAY_US_NOCAT',    // US, no category filter
                           'EBAY_US_NOSET'];   // US, set name not in the query
const marketProbeCache = new Map();
app.get('/api/ebay/marketprobe/:cardId', async (req, res) => {
  const cardId = req.params.cardId;
  const grade = String(req.query.grade || 'Raw NM');
  const asked = String(req.query.mp || MARKETPROBE_SITES.join(',')).split(',').map(s => s.trim().toUpperCase());
  const bad = asked.filter(m => !MARKETPROBE_SITES.includes(m));
  if (bad.length) return res.status(400).json({ error: 'unknown marketplace', bad, allowed: MARKETPROBE_SITES });
  const sites = ['EBAY_US'].concat(asked.filter(m => m !== 'EBAY_US'));
  const key = JSON.stringify([cardId, grade, sites, req.query.rows === '1']);
  const hit = marketProbeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000 && req.query.refresh !== '1') return res.json(hit.body);
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    const card = await resolveListingCard(cardId);
    if (!card) return res.status(404).json({ error: 'card not in catalogue', cardId });
    const per = {};
    for (const mp of sites) {
      try {
        const r = await sourceEbay(card, grade, 25, { marketplace: mp.replace(/_NO(CAT|SET)$/, ''),
          noCategory: /_NOCAT$/.test(mp), noSetInQuery: /_NOSET$/.test(mp),
          background: true, allDropped: true });
        const reasons = {};
        for (const d of r.dropped) {
          const k = /title says (\w+)/.test(d.reason) ? 'language:' + d.reason.match(/title says (\w+)/)[1]
                  : String(d.reason || '').replace(/[:(].*$/, '').slice(0, 48);
          reasons[k] = (reasons[k] || 0) + 1;
        }
        const kept = [];
        for (const l of r.listings) {
          // sourceEbay converts now (T1); the row carries its own currency.
          kept.push({ itemId: l.itemId, price: l.priceOriginal != null ? l.priceOriginal : l.price,
                      currency: l.currencyOriginal || 'USD', usd: l.price, fx: l.fx,
                      shippingUsd: l.shipping, country: l.country, title: l.title.slice(0, 140) });
        }
        per[mp] = { scanned: r.scanned, kept: r.kept, rejected: r.rejected, pages: r.pages, scannedIds: r.scannedIds || [],
                    rejectReasons: reasons, keptRows: kept,
                    droppedRows: r.dropped.map(d => ({ itemId: d.itemId, title: String(d.title || '').slice(0, 140), reason: d.reason })) };
      } catch (e) {
        per[mp] = { error: e.message, status: e.ebayStatus || null };
      }
    }
    const usIds = new Set(((per.EBAY_US && per.EBAY_US.keptRows) || []).map(k => k.itemId));
    const allIds = new Set(usIds);
    // The outlier test production runs in gatherListings, over the union in
    // USD — without it "cheapest new" was a $7.31 row on a $300 card.
    const union = new Map();
    for (const mp of sites) for (const k of ((per[mp] && per[mp].keptRows) || []))
      if (k.usd && !union.has(k.itemId)) union.set(k.itemId, { itemId: k.itemId, price: k.usd });
    const judged = outlier.flagOutliers([...union.values()]);
    const suspect = new Set(judged.listings.filter(l => l.suspect).map(l => l.itemId));
    // US pages stop at EBAY_MAX_PAGES under sort=price, so a row dearer than
    // the dearest US row examined may simply be past US's cap. Only a row
    // INSIDE the range US examined is one US genuinely did not have.
    const usP = per.EBAY_US && per.EBAY_US.pages;
    const usCapped = !!(usP && usP.stoppedAtCap);
    const usMax = Math.max(0, ...(((per.EBAY_US && per.EBAY_US.keptRows) || []).map(k => k.usd || 0)));
    const usScanned = new Set((per.EBAY_US && per.EBAY_US.scannedIds) || []);
    const summary = {};
    for (const mp of sites) {
      const p = per[mp];
      if (!p || p.error) { summary[mp] = p; continue; }
      const fresh = p.keptRows.filter(k => !usIds.has(k.itemId));
      const freshAll = fresh.filter(k => !allIds.has(k.itemId));
      fresh.forEach(k => allIds.add(k.itemId));
      const countries = {};
      p.keptRows.forEach(k => { countries[k.country || '?'] = (countries[k.country || '?'] || 0) + 1; });
      const currencies = {};
      p.keptRows.forEach(k => { currencies[k.currency] = (currencies[k.currency] || 0) + 1; });
      const cheapest = rows => rows.filter(k => k.usd && !suspect.has(k.itemId)).sort((a, b) => a.usd - b.usd)[0] || null;
      const clean = fresh.filter(k => !suspect.has(k.itemId));
      summary[mp] = {
        ebayTotal: p.pages && p.pages.ebayTotal, scanned: p.scanned, kept: p.kept, rejected: p.rejected,
        stoppedAtCap: p.pages && p.pages.stoppedAtCap, pagesFetched: p.pages && p.pages.fetched,
        notOnUs: fresh.length, newVsAllEarlier: freshAll.length,
        notOnUsUnflagged: clean.length,
        notOnUsInUsRange: usCapped ? clean.filter(k => k.usd <= usMax).length : clean.length,
        // Of the rows not kept on US: how many US RETURNED and refused (the
        // same item, re-judged on another site's title), and how many US never
        // returned at all — only the second kind is a listing US lacks.
        refusedOnUs: clean.filter(k => usScanned.has(k.itemId)).length,
        neverOnUs: clean.filter(k => !usScanned.has(k.itemId)).length,
        neverOnUsInUsRange: clean.filter(k => !usScanned.has(k.itemId) && (!usCapped || k.usd <= usMax)).length,
        refusedOnUsSample: clean.filter(k => usScanned.has(k.itemId)).slice(0, 5),
        foreignLocated: p.keptRows.filter(k => k.country && k.country !== 'US').length,
        keptCountries: countries, keptCurrencies: currencies,
        rejectReasons: p.rejectReasons,
        cheapestKeptUsd: cheapest(p.keptRows), cheapestNewUsd: cheapest(fresh),
        newSample: fresh.slice(0, 5),
        // ?rows=1 (T1): every row this site kept that US did not, and why US
        // did not — the titles a translated-vocabulary gate is taught from.
        // Served, never stored (eBay's terms), like every listing response.
        newRows: req.query.rows === '1'
          ? fresh.map(k => Object.assign({ usScannedIt: usScanned.has(k.itemId), suspect: suspect.has(k.itemId) }, k))
          : undefined
      };
    }
    const calls = sites.reduce((n, mp) => n + ((per[mp] && per[mp].pages && per[mp].pages.fetched) || 0), 0);
    // ?rows=1 (T1): the same item REFUSED on one site and KEPT on another,
    // with both titles — so "which site's title was right" is read, not
    // assumed. The sticky-refusal rule in mergeEbaySite rests on this.
    let crossRefused;
    if (req.query.rows === '1') {
      crossRefused = [];
      const keptBy = {};
      for (const mp of sites) for (const k of ((per[mp] && per[mp].keptRows) || [])) (keptBy[k.itemId] = keptBy[k.itemId] || []).push({ mp, title: k.title });
      for (const mp of sites) for (const d of ((per[mp] && per[mp].droppedRows) || [])) {
        if (d.itemId && keptBy[d.itemId]) crossRefused.push({ itemId: d.itemId, refusedOn: mp, refusedTitle: d.title,
          reason: d.reason, keptOn: keptBy[d.itemId] });
      }
    }
    const body = { cardId, grade, sites, summary, crossRefused, union: allIds.size, usKept: usIds.size,
                   usCapped, usMaxExaminedUsd: usMax, outliers: judged.stats,
                   quotaSpentSearch: calls, stored: false, at: new Date().toISOString() };
    marketProbeCache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// GET /api/ebay/aspects/:cardId?mp=EBAY_DE
//
// T1, 2026-09-30. On DE/FR/IT/ES eBay IGNORES the English
// "Card Condition:{Near Mint or Better}" filter — measured, base1-4: Raw,
// Raw NM and Raw HP all returned the same total there (DE 264, IT 1,250),
// while GB went 1,441 -> 394 -> 125. Each site names its aspects in its own
// language. This asks eBay what they are: one search call, limit=1, with
// ASPECT_REFINEMENTS. Catalogue id + marketplace from MARKETPROBE_SITES
// only, never a URL. Cached 30 min; nothing stored.
// ══════════════════════════════════════════════════════════════
const aspectProbeCache = new Map();
app.get('/api/ebay/aspects/:cardId', async (req, res) => {
  const mp = String(req.query.mp || 'EBAY_US').toUpperCase();
  if (!MARKETPROBE_SITES.includes(mp) || /_NO/.test(mp)) return res.status(400).json({ error: 'unknown marketplace', allowed: MARKETPROBE_SITES.filter(m => !/_NO/.test(m)) });
  const key = req.params.cardId + '|' + mp;
  const hit = aspectProbeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return res.json(hit.body);
  try {
    if (!ebay.ebayEnabled()) return res.status(503).json({ error: 'EBAY_ENABLED=false' });
    const card = await resolveListingCard(req.params.cardId);
    if (!card) return res.status(404).json({ error: 'card not in catalogue' });
    const auth = await getEbayTokenDetailed({ background: true });
    if (!auth.token) return res.status(503).json({ error: auth.error || auth.reason || 'no token' });
    const q = cm.buildQuery(ebayMatchCard(card), 'Raw');
    const r = await ebay.fetchEbay(db, { token: auth.token, kind: 'search', background: true,
      url: 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(q)
        + '&category_ids=183454&limit=1&fieldgroups=ASPECT_REFINEMENTS',
      meta: { cardId: card.api_card_id, query: q, marketplace: mp, probe: 'aspects' } });
    if (!r.ok) return res.status(502).json({ error: r.reason || r.blocked });
    const ref = (r.data && r.data.refinement) || {};
    const body = { cardId: card.api_card_id, marketplace: mp, query: q, total: r.data && r.data.total,
      aspects: (ref.aspectDistributions || []).map(a => ({ name: a.localizedAspectName,
        values: (a.aspectValueDistributions || []).map(v => ({ value: v.localizedAspectValue, count: v.matchCount })) })),
      conditions: (ref.conditionDistributions || []).map(c => ({ condition: c.condition, id: c.conditionId, count: c.matchCount })),
      stored: false, at: new Date().toISOString() };
    aspectProbeCache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ebay/quota', async (req, res) => {
  try {
    const out = await quota.status(db);
    out.enabled = ebay.ebayEnabled();
    if (!out.enabled) out.killSwitch = 'EBAY_ENABLED=false — all eBay calls are switched off';

    const br = ebay.breakerState();
    out.rateLimitBreaker = br
      ? { open: true, reason: br.reason, until: br.until ? br.until.toISOString() : null }
      : { open: false };

    if (req.query.probe === '1' || req.query.probe === 'true') {
      const auth = await getEbayTokenDetailed();
      if (!auth.token) {
        out.probe = { ok: false, reason: auth.reason || auth.error };
      } else {
        const rl = await quota.fetchRateLimits(db, auth.token);
        out.probe = rl;
        if (rl.ok && Number.isFinite(rl.limit)) {
          out.probe.matchesAssumedLimit = (rl.limit === quota.DAILY_LIMIT);
          out.probe.assumedLimit = quota.DAILY_LIMIT;
          if (rl.limit !== quota.DAILY_LIMIT) {
            out.probe.WARNING = `eBay reports a limit of ${rl.limit}, but DAILY_LIMIT is `
              + `${quota.DAILY_LIMIT}. Every threshold is calibrated to the wrong number — `
              + `change DAILY_LIMIT in ebayquota.js and re-run ebayquota.test.js.`;
          }
        }
      }
    } else {
      out.probe = { attempted: false,
        note: 'add ?probe=1 to ask eBay for the real limit (costs one call)' };
    }
    res.json(out);
  } catch (err) {
    // A quota endpoint that fails must not read as "no quota used".
    res.status(500).json({ error: err.message,
      note: 'quota state could not be read — treat as unknown, not as zero' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /app  —  the frontend itself
//
// A URL cannot be stale. This page existed only as a local file, and 41
// copies in Downloads plus a five-week-stale one adopted as the base cost
// more time than any bug here. /app is now the answer to "let me check the
// frontend"; the local file stays as the offline fallback.
//
// ONE file by name, never express.static(__dirname) — the project root holds
// ingest-progress-*.json, logs, backups, CLAUDE.md and ingest.js. A blanket
// static mount would publish every one of them.
//
// no-cache/must-revalidate because a browser holding an old copy is exactly
// the problem this route exists to solve. The modules keep their 5-minute
// cache: the build stamp reveals a mismatch and they are fetched per load.
// ══════════════════════════════════════════════════════════════
app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('html');
  res.sendFile(require('path').join(__dirname, 'cardhunt_preview.html'), err => {
    // Say WHY it is unavailable. A bare 500 here would read as "the server
    // is broken" when the real cause is a file that never left the repo.
    if (err && !res.headersSent) {
      res.status(500).send('cardhunt_preview.html not readable on the server: '
        + err.message);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// GET /cardmatch.js  —  the query builder, for the browser
//
// The frontend's deep links and this server's eBay query must ask eBay the
// SAME question about the same card. They did not: the server dropped the
// set size and set name that the frontend included, so an API call and a
// deep link disagreed about what was being searched for.
//
// Serving the actual module — not a copy — is what keeps them identical.
// cardmatch.js assigns window.CardMatch when loaded in a browser.
// ══════════════════════════════════════════════════════════════
app.get('/gradeprice.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(require('path').join(__dirname, 'gradeprice.js'), err => {
    if (err && !res.headersSent) res.status(500).send('// gradeprice.js unavailable');
  });
});

app.get('/estimator.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(require('path').join(__dirname, 'estimator.js'), err => {
    if (err && !res.headersSent) res.status(500).send('// estimator.js unavailable');
  });
});

app.get('/cardmatch.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(require('path').join(__dirname, 'cardmatch.js'), err => {
    if (err && !res.headersSent) res.status(500).send('// cardmatch.js unavailable');
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/probe/sources[?id=yuyutei][&refresh=1]
//
// "Does this source answer RENDER?" — the first question about any new
// source, because Yahoo Auctions returns 200 to a home IP and 403 here,
// and every scraper in this project worked all through development for
// that reason alone.
//
// The SAME module runs from a laptop (`node sourceprobe.js`), so the two
// answers are comparable and a difference between them means the IP
// rather than the code.
//
// The caller picks which REGISTERED source to probe and nothing else.
// There is no URL parameter: an endpoint that fetches a caller-supplied
// URL is an SSRF hole into everything this server can reach, including
// the platform's own metadata service.
//
// Results are cached for 30 minutes. This is uninvited traffic to other
// people's shops, and a probe endpoint that can be hammered is an
// excellent way to earn the block it is testing for. `refresh=1` forces
// one fresh request.
// ══════════════════════════════════════════════════════════════
const sourceprobe = require('./sourceprobe');

app.get('/api/probe/sources', async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const id = req.query.id ? String(req.query.id) : null;
  try {
    // `?id=yahoo` runs every yahoo_* variant, because the comparison IS
    // the measurement: one variant's status means little, the table means
    // everything. Exact ids still match exactly.
    let results;
    if (id) {
      const ids = sourceprobe.idsMatching(id);
      if (!ids.length) {
        return res.status(404).json({ error: `no registered source matches "${id}"`,
                                      registered: sourceprobe.ids() });
      }
      results = [];
      for (const one of ids) results.push(await sourceprobe.probe(one, { refresh }));
    } else {
      results = await sourceprobe.probeAll({ refresh });
    }
    res.json({
      from: process.env.RENDER ? 'render' : 'local',
      // Say what the statuses mean in the response itself. A bare
      // "blocked" invites the reader to supply their own explanation, and
      // the explanation that matters here is specific.
      statusMeans: {
        ok: 'answered this IP with the content we need',
        blocked: 'this IP is refused — 403/401/429, or a challenge page',
        auth: 'the SERVICE refused the credential — the IP reached it fine',
        shape: 'answered, but not carrying what we need',
        http: 'some other non-2xx',
        unreachable: 'never reached the server: DNS, TLS or timeout',
        unconfigured: 'a credential this source needs is absent — NOT a refusal'
      },
      compareWith: 'node sourceprobe.js — the same probe from a residential IP',
      probedAt: new Date().toISOString(),
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Readiness check for the whole eBay setup.
//
// `ready: true` used to mean only "two environment variables are
// non-empty" — it never once asked eBay whether they worked. That is how
// it could report ready while every listing fetch failed. Presence is not
// readiness, so `?probe=1` performs the real token exchange and reports
// what eBay actually said. `ready` now states which of the two it means.
app.get('/ebay/status', async (req, res) => {
  const configured = ebayConfigured();
  const probe = req.query.probe === '1' || req.query.probe === 'true';

  let tokenCheck = { attempted: false,
    note: 'add ?probe=1 to actually exchange the credentials for a token' };
  if (probe && configured) {
    const r = await getEbayTokenDetailed();
    tokenCheck = r.token
      ? { attempted: true, ok: true,
          note: 'token acquired — the Browse API is genuinely reachable'
            + (r.cached ? ' (cached)' : '') }
      : { attempted: true, ok: false, error: r.error, status: r.status || null,
          note: 'credentials are PRESENT but do not work — this is the real failure' };
  } else if (probe && !configured) {
    tokenCheck = { attempted: false, ok: false, note: 'no credentials to probe' };
  }

  res.json({
    browseApi: configured
      ? 'credentials present' : 'no credentials — set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
    tokenCheck,
    deletionEndpoint: EBAY_VERIFICATION_TOKEN
      ? 'ready at ' + EBAY_DELETION_ENDPOINT
      : 'EBAY_VERIFICATION_TOKEN not set',
    // Deliberately named for what it measures. Whether eBay ACCEPTS the
    // credentials is tokenCheck.ok, and only ?probe=1 can answer it.
    ready: !!(configured && EBAY_VERIFICATION_TOKEN),
    readyMeans: 'environment variables are set; it does NOT mean eBay accepted them',
    steps: [
      '1. developer.ebay.com -> create an app -> copy App ID and Cert ID',
      '2. Render env: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET',
      '3. Render env: EBAY_VERIFICATION_TOKEN (any 32-80 char string)',
      '4. developer.ebay.com -> Notifications -> paste this endpoint and the same token',
      '5. eBay validates immediately; free tier is 5,000 calls/day'
    ]
  });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CardHunt API v5.1 on port ${PORT}  (database-first)`);
  console.log(`DB: ${db ? 'Supabase connected' : 'none'}`);
  console.log(`Sources: pokemontcg.io + tcgdex.net`);
});
