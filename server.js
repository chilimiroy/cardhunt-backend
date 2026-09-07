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
const lp = require('./listingparse');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── DATABASE (Supabase) ───────────────────────────────────────
const db = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

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
      const c = await db.query('SELECT COUNT(*)::int AS cards FROM cards');
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
      FROM cards GROUP BY 1 ORDER BY n DESC`);
    out.checks.cardsByLang = c.rows;
  } catch (e) { out.checks.cardsByLang = 'ERROR ' + e.message; }

  try {
    const s = await db.query(
      `SELECT api_card_id, name, set_api_id FROM cards
       WHERE set_api_id = 'base1' ORDER BY api_card_id LIMIT 5`);
    out.checks.sampleBase1 = s.rows;
  } catch (e) { out.checks.sampleBase1 = 'ERROR ' + e.message; }

  try {
    const one = await db.query(
      `SELECT api_card_id, name FROM cards WHERE api_card_id = 'en-base1-4'`);
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

const RP = {
  'Hyper Rare':95,'Special Illustration Rare':110,'Illustration Rare':26,
  'Rare Secret':52,'Rare Rainbow':38,'Rare Shiny':30,'Rare Ultra':21,
  'ACE SPEC Rare':24,'Double Rare':11,'Rare Holo VMAX':15,'Rare Holo VSTAR':12,
  'Rare Holo V':7,'Rare Holo GX':6,'Rare Holo EX':10,'Rare Holo':4.5,
  'Amazing Rare':15,'Radiant Rare':8,'Trainer Gallery Rare Holo':10,
  'Rare':2.2,'Uncommon':0.4,'Common':0.15,'Promo':5
};

function estimatePrice(rarity, cardId, cardName) {
  const r = normRarity(rarity);
  const base = RP[r] || 1.0;
  let seed = 0;
  const str = (cardId||'') + '|' + (cardName||'');
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) & 0x7FFFFFFF;
  let band;
  if (r === 'Hyper Rare' || r === 'Special Illustration Rare') band = 0.55 + (seed % 190)/100;
  else if (['Illustration Rare','Rare Secret','Rare Rainbow'].includes(r)) band = 0.55 + (seed % 150)/100;
  else if (['Rare Ultra','ACE SPEC Rare','Double Rare'].includes(r)) band = 0.5 + (seed % 180)/100;
  else band = 0.6 + (seed % 110)/100;
  const nm = (cardName||'').toLowerCase();
  if (nm.includes('charizard')) band *= 2.6;
  else if (nm.includes('pikachu')) band *= 1.9;
  else if (nm.includes('mewtwo') || nm.includes('mew ')) band *= 1.7;
  else if (nm.includes('umbreon') || nm.includes('eevee')) band *= 1.6;
  else if (nm.includes('lugia') || nm.includes('rayquaza')) band *= 1.5;
  else if (nm.includes('gengar') || nm.includes('dragonite')) band *= 1.35;
  return parseFloat((base * band).toFixed(2));
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
            ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
            LIMIT 1
          ) lp ON TRUE
          WHERE c.set_api_id = ANY($1)
            AND c.api_card_id LIKE $2
          ORDER BY NULLIF(regexp_replace(c.number,'[^0-9]','','g'), '')::int NULLS LAST,
                   c.number
        `, [[...aliases], dbLang + '-%']);

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
    let tdCards = null, tdName = null, tdPrinted = 0, tdResolved = null;
    const probe = await tcgdexResolve(req.query.uiSetId || setId, setId, tdLang);
    if (probe) {
      tdName = probe.data.name;
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
          ? pi.price : estimatePrice(rarity, `${setId}-${num}`, c.name);
        return {
          id: `${setId}-${num}`, name: c.name, number: num, rarity,
          supertype: pi.supertype || null,
          set: { id: setId, name: tdName, total: printed },
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
        _price: p ? p.price : estimatePrice(rarity, c.id, c.name),
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
      const row = await db.query(
        'SELECT * FROM cards WHERE api_card_id = ANY($1) LIMIT 1', [[...new Set(variants)]]);
      if (row.rows.length) {
        const c = row.rows[0];
        return res.json({ data: {
          id: c.api_card_id, name: c.name, nameEn: c.name_en || null,
          number: c.number, rarity: c.rarity,
          supertype: c.supertype,
          images: { small: c.image_small, large: c.image_large },
          set: { id: c.set_api_id, name: c.set_name,
                 nameEn: c.set_name_en || null, total: c.set_total },
          tcgplayer: c.tcgplayer_data, cardmarket: c.cardmarket_data
        }});
      }
    }
    const cached = cGet(`card_${cardId}`);
    if (cached) return res.json(cached);
    const r = await fetch(`${TCG_API}/cards/${cardId}`, { headers: TCG_H });
    const d = await r.json();
    cSet(`card_${cardId}`, d);

    if (db && d.data) {
      const c = d.data;
      db.query(`
        INSERT INTO cards (api_card_id,name,number,rarity,supertype,image_small,image_large,
          set_api_id,set_name,set_total,tcgplayer_data,cardmarket_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (api_card_id) DO UPDATE SET
          tcgplayer_data=EXCLUDED.tcgplayer_data,
          cardmarket_data=EXCLUDED.cardmarket_data, updated_at=NOW()
      `, [c.id, c.name, c.number, c.rarity, c.supertype,
          c.images && c.images.small, c.images && c.images.large,
          c.set && c.set.id, c.set && c.set.name, c.set && c.set.total,
          JSON.stringify(c.tcgplayer || null), JSON.stringify(c.cardmarket || null)
      ]).catch(() => {});
    }
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SEARCH ────────────────────────────────────────────────────
app.get('/api/cards', async (req, res) => {
  const { q, pageSize = 250, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const url = `${TCG_API}/cards?q=${encodeURIComponent(q)}&pageSize=${pageSize}&page=${page}&orderBy=-set.releaseDate`;
    const r = await fetch(url, { headers: TCG_H });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
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
          'SELECT * FROM cards WHERE api_card_id = ANY($1) LIMIT 1',
          [[...new Set(variants)]]);
        if (card.rows.length) {
          const c = card.rows[0];
          const realId = c.api_card_id;
          const hist = await db.query(`
            SELECT price_usd, source, marketplace, recorded_at
            FROM price_history WHERE card_api_id = $1
            ORDER BY recorded_at DESC LIMIT 60`, [realId]);

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
    const row = await db.query(`
      INSERT INTO portfolio (user_id,card_api_id,card_name,card_img,set_name,grade,quantity,purchase_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.user_id, b.card_api_id, b.card_name, b.card_img, b.set_name,
       b.grade, b.quantity || 1, b.purchase_price || 0]);
    res.json(row.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history/:cardId', async (req, res) => {
  if (!db) return res.json({ data: [] });
  try {
    const rows = await db.query(`
      SELECT DATE_TRUNC('day', recorded_at) AS date,
             AVG(price_usd) AS avg_price, MIN(price_usd) AS low,
             MAX(price_usd) AS high, COUNT(*) AS sales
      FROM price_history
      WHERE card_api_id=$1 AND recorded_at >= NOW() - INTERVAL '1 year'
      GROUP BY 1 ORDER BY 1`, [req.params.cardId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

async function resolveListingCard(cardId) {
  if (!db) return null;
  const r = await db.query(
    `SELECT api_card_id, name, name_en, number, rarity, set_api_id, set_name, set_total, image_small
     FROM cards WHERE api_card_id = ANY($1) LIMIT 1`, [listingIdCandidates(cardId)]);
  return r.rows[0] || null;
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
function listingCacheSet(cardId, grade, data) {
  listingCache.set(listingKey(cardId, grade), { ts: Date.now(), data });
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
    attribution: o.source === 'ebay' ? 'Listing from eBay' : null
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
function filterCard(card, nameOverride) {
  return {
    name: nameOverride || card.name,
    number: card.number,
    setTotal: card.set_total,
    setId: card.set_api_id,
    // English listings state the set by NAME ("Champion's Path"), never by
    // the code. Without this, an eBay title using the common `#74 <set name>`
    // form could not be verified and was dropped. See jpTitleMatchesNumber.
    setName: card.set_name_en || card.set_name
  };
}

async function sourceYahoo(card, grade, limit) {
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
      if (!jpf.jpItemMatchesRequest(it, fc, grade)) continue;
      const yen = parseInt(it.price || it.bidOrBuy || it.currentPrice || 0);
      if (!(yen >= 100 && yen <= 2000000)) continue;
      const base = jpf.yahooItemToListing(it, yen);
      if (feed.live) liveCount++; else endedCount++;
      out.push(normaliseListing({
        ...base,
        sourceLabel: 'Yahoo JP',
        condition: jpf.isRawGrade(grade) ? 'Raw' : String(grade),
        listingType: feed.live ? (it.isFixedPrice ? 'fixed' : 'auction') : 'ended',
        live: feed.live
      }));
    }
  }

  const seen = new Set();
  const deduped = out.filter(l => (l.url && !seen.has(l.url)) ? seen.add(l.url) : false);
  return { listings: deduped, scanned, live: liveCount, ended: endedCount };
}

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
  const auth = dryRun ? { token: '<dry-run>' } : await getEbayTokenDetailed({ background });
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
  const matchCard = {
    name, nameEn: card.name_en || null,
    number: card.number,
    setTotal: card.set_total,
    setName: card.set_name_en || card.set_name
  };

  // cardmatch.buildQuery is the single query builder, shared with the
  // frontend's deep links so a link and an API call ask the same question.
  const q = cm.buildQuery(matchCard, grade);
  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
    + '?q=' + encodeURIComponent(q)
    + '&category_ids=183454&limit=' + Math.min(limit * 3, 100) + '&sort=price';

  const call = await ebay.fetchEbay(db, {
    url, token, kind: 'search', background,
    dryRun,
    meta: { cardId: card.api_card_id, grade, query: q },
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
  const items = d.itemSummaries || [];

  // ── The gate ──
  // cardmatch.verify decides; listingparse labels. Every rejection carries a
  // reason, so "no listings" and "everything was filtered out" can never look
  // the same to the caller.
  const listings = [];
  const dropped = [];
  const disagreements = [];

  for (const it of items) {
    const title = it.title || '';
    const v = cm.verify(title, matchCard, grade);

    // Cross-check: two independent readers of the same title that should
    // agree. listingparse works from a parsed structure, cardmatch from the
    // raw string. Where they disagree, one of them is wrong — that technique
    // has found more in this project than any other, so record it rather
    // than letting it pass silently.
    let parsed = null;
    try {
      parsed = lp.parseListingTitle(title);
      const c = lp.compare(parsed, matchCard, grade);
      if (c && c.match !== v.ok) {
        disagreements.push({ title,
          cardmatch: v.ok ? 'kept' : 'dropped: ' + v.reason,
          listingparse: c.match ? 'match' : 'no match: ' + (c.disagree || []).join('; ') });
      }
    } catch (e) { /* the parser must never break the gate */ }

    if (!v.ok) { dropped.push({ title, reason: v.reason }); continue; }

    const price = parseFloat(it.price && it.price.value) || 0;
    if (price <= 0) { dropped.push({ title, reason: 'no usable price' }); continue; }
    const shipOpt = it.shippingOptions && it.shippingOptions[0];
    const shipping = (shipOpt && shipOpt.shippingCost && shipOpt.shippingCost.value != null)
      ? parseFloat(shipOpt.shippingCost.value) : null;
    listings.push(normaliseListing({
      source: 'ebay',
      sourceLabel: 'eBay',
      title: it.title,
      price,
      currency: (it.price && it.price.currency) || 'USD',
      shipping,
      condition: jpf.isRawGrade(grade) ? (it.condition || 'Raw') : String(grade),
      seller: it.seller && it.seller.username,
      url: it.itemWebUrl,
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
      matchConfidence: v.confidence || null
    }));
  }

  // kept AND dropped, always. "12 listings, 40 rejected" and "no listings"
  // describe completely different situations and must never look alike.
  return { listings, scanned: items.length,
           kept: listings.length, rejected: dropped.length,
           dropped: dropped.slice(0, 40),
           parserDisagreements: disagreements.slice(0, 20),
           query: q };
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

const LISTING_SOURCES = [
  {
    id: 'yahoo', label: 'Yahoo JP', fetch: sourceYahoo,
    // Yahoo is a Japanese-language marketplace: it is searched with the
    // Japanese card name, so it only applies to Japanese cards.
    applies: card => String(card.api_card_id).startsWith('ja-'),
    skipReason: 'Japanese-language marketplace — card is not Japanese'
  },
  {
    id: 'ebay', label: 'eBay', fetch: sourceEbay,
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
    active.map(s => withTimeout(s.fetch(card, grade, limit, opts),
                                s.id === 'ebay' ? 25000 : 12000, s.id))
  );

  const dryRuns = {};
  let listings = [];
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

  // Cheapest LANDED cost first. Rows whose shipping the source did not state
  // sort on price alone and say so, rather than pretending shipping is zero.
  // Buyable first, then cheapest landed cost. An ended auction never
  // outranks something you can actually purchase.
  listings.sort((a, b) =>
    (Number(b.live) - Number(a.live)) || (a.landed - b.landed) || (a.price - b.price));
  const liveCount = listings.filter(l => l.live).length;
  const out = { listings, sources, tookMs: Date.now() - t0, liveCount };
  if (Object.keys(dryRuns).length) out.dryRun = dryRuns;
  return out;
}

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

  if (!db) return res.status(503).json({ cardId, grade, listings: [], error: 'database not configured' });

  let card;
  try {
    card = await resolveListingCard(cardId);
  } catch (err) {
    return res.status(500).json({ cardId, grade, listings: [], error: err.message });
  }
  // Not one of our cards — fall through to the legacy eBay-by-name route.
  if (!card) return next();

  const key = card.api_card_id;
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

  // A dry run must never be served from cache, or it reports a request that
  // was not built for it.
  if (!req.query.refresh && !dryRun) {
    const hit = listingCacheGet(key, grade);
    if (hit) return res.json(hit);
  }

  try {
    // A browser request is a live user waiting, so it is foreground: it may
    // spend quota down to the reserve. Only ingestion and refresh are
    // background, and they yield at the soft stop so this path keeps working.
    const gathered = await gatherListings(card, grade, limit,
      { background: false, dryRun });
    const { listings, sources, tookMs, liveCount } = gathered;
    const payload = {
      cardId: card.api_card_id,
      requestedId: cardId,
      card: {
        name: card.name, nameEn: card.name_en || null, number: card.number,
        rarity: card.rarity, set: card.set_name, setTotal: card.set_total,
        image: card.image_small || null
      },
      grade,
      count: listings.length,
      liveCount,
      cheapest: listings.length ? listings[0].landed : null,
      cheapestLive: (listings.find(l => l.live) || {}).landed ?? null,
      listings: listings.slice(0, limit),
      sources,
      tookMs,
      cached: false,
      cachedAgeSec: 0,
      // eBay's terms: do not present data as more current than it is. This
      // states the freshness contract in the response itself rather than
      // leaving the client to assume "live".
      freshness: {
        cached: false,
        ageSeconds: 0,
        maxAgeSeconds: Math.round(LISTING_TTL / 1000),
        note: 'fetched now'
      },
      attribution: EBAY_ATTRIBUTION,
      fetchedAt: new Date().toISOString()
    };
    if (gathered.dryRun) {
      payload.dryRun = gathered.dryRun;
      payload.note = 'dryRun=1 — nothing was sent to eBay and no quota was spent';
      return res.json(payload);          // deliberately NOT cached
    }
    listingCacheSet(key, grade, payload);
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
  if (!parsed || (!parsed.name && !parsed.number && !parsed.certId)) {
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
        const cached = listingCacheGet(card.api_card_id, grade);
        if (cached) {
          payload.listings = cached.listings;
          payload.sources = cached.sources;
          payload.listingsCached = true;
        } else {
          const { listings, sources, tookMs, liveCount } =
            await gatherListings(card, grade, 25);
          const lp = {
            cardId: card.api_card_id, requestedId: top.cardId,
            card: { name: card.name, nameEn: card.name_en || null, number: card.number,
                    rarity: card.rarity, set: card.set_name, setTotal: card.set_total,
                    image: card.image_small || null },
            grade, count: listings.length, liveCount,
            cheapest: listings.length ? listings[0].landed : null,
            cheapestLive: (listings.find(l => l.live) || {}).landed ?? null,
            listings: listings.slice(0, 25), sources, tookMs,
            cached: false, fetchedAt: new Date().toISOString()
          };
          listingCacheSet(card.api_card_id, grade, lp);
          payload.listings = lp.listings;
          payload.sources = sources;
          payload.liveCount = liveCount;
          payload.cheapestLive = lp.cheapestLive;
          payload.listingsCached = false;
        }
      }
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ query: q, parsed, candidates: [], error: err.message });
  }
});

// GET /api/listings/:cardName?grade=PSA%209&limit=20   (legacy, eBay by name)
app.get('/api/listings/:cardName', async (req, res) => {
  const { cardName } = req.params;
  const grade = req.query.grade || '';
  const setName = req.query.set || '';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const auth = await getEbayTokenDetailed();
  const token = auth.token;
  if (!token) {
    // `configured` reports whether the credentials exist, which is not the
    // same question as whether they work. Conflating the two is what made
    // the /api/listings response blame unset variables that were set.
    return res.json({
      listings: [],
      configured: !auth.unconfigured,
      message: auth.unconfigured
        ? 'eBay API not configured. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to enable live listings.'
        : `eBay credentials are set but did not work: ${auth.error}`
    });
  }

  try {
    const q = [cardName, setName, grade, 'pokemon card'].filter(Boolean).join(' ');
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
      + '?q=' + encodeURIComponent(q)
      + '&category_ids=183454'
      + '&limit=' + limit
      + '&sort=price';
    // Guarded like every other eBay call. This legacy route was the last
    // path that could still reach eBay unqueued and uncounted.
    const call = await ebay.fetchEbay(db, {
      url, token, kind: 'search', background: false,
      meta: { cardId: cardName, grade, query: q, marketplace: req.query.marketplace || 'EBAY_US' },
      countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0)
    });
    if (call.blocked) {
      return res.json({ listings: [], configured: true, status: call.blocked,
                        reason: call.reason, remaining: call.remaining ?? null,
                        resetsInMinutes: call.resetsInMinutes ?? null });
    }
    if (!call.ok) return res.json({ listings: [], configured: true, error: call.reason });
    const d = call.data || {};
    const listings = (d.itemSummaries || []).map(it => ({
      title: it.title,
      price: parseFloat(it.price && it.price.value) || 0,
      currency: (it.price && it.price.currency) || 'USD',
      shipping: it.shippingOptions && it.shippingOptions[0] &&
                it.shippingOptions[0].shippingCost
                ? parseFloat(it.shippingOptions[0].shippingCost.value) : 0,
      condition: it.condition || '',
      url: it.itemWebUrl,
      image: it.image && it.image.imageUrl,
      seller: it.seller && it.seller.username,
      feedback: it.seller && it.seller.feedbackPercentage,
      location: it.itemLocation && it.itemLocation.country,
      buyingOption: (it.buyingOptions || []).join(',')
    })).filter(l => l.price > 0);

    const prices = listings.map(l => l.price).sort((a,b) => a-b);
    const median = prices.length ? prices[Math.floor(prices.length/2)] : 0;

    res.json({
      listings,
      configured: true,
      count: listings.length,
      lowest: prices[0] || 0,
      median,
      highest: prices[prices.length-1] || 0
    });
  } catch (err) {
    res.json({ listings: [], configured: true, error: err.message });
  }
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
// SCRAPER ROUTES — real market prices from multiple sources
// ══════════════════════════════════════════════════════════════
// ══ SCRAPER (inlined — nothing external to deploy) ═══════════
const SCACHE = {};
const STTL = 30 * 60 * 1000;               // 30 min — be polite to sources
const sGet = k => { const e = SCACHE[k]; return (e && Date.now()-e.ts < STTL) ? e.d : null; };
const sSet = (k, d) => { SCACHE[k] = { d, ts: Date.now() }; };

const SUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Politeness: never hammer a host. One request per host per 1.2s.
const lastHit = {};
async function throttle(host) {
  const now = Date.now();
  const wait = Math.max(0, (lastHit[host] || 0) + 1200 - now);
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastHit[host] = Date.now();
}

// ── 1 & 2. EBAY ───────────────────────────────────────────────
// A SECOND token implementation used to live here, with its own cache and
// its own copy of the module-load credential consts. Two paths to one
// marketplace that must agree and had no reason to — the shape CLAUDE.md
// warns about — and it carried the same "return null for any reason" bug.
// It now delegates, so there is one token, one cache, one error path.
async function scrEbayToken() {
  return (await getEbayTokenDetailed()).token;
}

// Active listings via the free Browse API
async function ebayActive(query, marketplace = 'EBAY_US', limit = 50) {
  const key = `eb_act_${marketplace}_${query}`;
  const hit = sGet(key); if (hit) return hit;

  const token = await scrEbayToken();
  if (!token) return { listings: [], source: 'ebay_api', configured: false };

  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
    + '?q=' + encodeURIComponent(query)
    + '&category_ids=183454&limit=' + limit + '&sort=price';

  // background: true — this is the harvest/diagnostic path, not a user
  // waiting on a page. It yields at the soft stop so live requests keep
  // working. ebaycall paces internally, so the old throttle() is redundant.
  const call = await ebay.fetchEbay(db, {
    url, token, kind: 'search', background: true,
    meta: { cardId: 'ebayActive', query, marketplace },
    countFrom: d => (d && d.itemSummaries ? d.itemSummaries.length : 0)
  });
  if (call.blocked) {
    return { listings: [], source: 'ebay_api', status: call.blocked, reason: call.reason };
  }
  if (!call.ok) return { listings: [], source: 'ebay_api', error: call.reason };

  const d = call.data || {};
  const listings = (d.itemSummaries || []).map(it => ({
    title: it.title,
    price: parseFloat(it.price && it.price.value) || 0,
    currency: (it.price && it.price.currency) || 'USD',
    shipping: (it.shippingOptions && it.shippingOptions[0] && it.shippingOptions[0].shippingCost)
              ? parseFloat(it.shippingOptions[0].shippingCost.value) : 0,
    condition: it.condition || '',
    url: it.itemWebUrl,
    image: it.image && it.image.imageUrl,
    seller: it.seller && it.seller.username,
    feedback: it.seller && it.seller.feedbackPercentage,
    country: it.itemLocation && it.itemLocation.country,
    type: (it.buyingOptions || []).includes('AUCTION') ? 'auction' : 'fixed'
  })).filter(l => l.price > 0);

  const out = { listings, source:'ebay_api', configured:true, count:listings.length };
  sSet(key, out);
  return out;
}

// SOLD comps — scraped from eBay's public completed-listings page
async function ebaySold(query) {
  const key = `eb_sold_${query}`;
  const hit = sGet(key); if (hit) return hit;

  await throttle('www.ebay.com');
  const url = 'https://www.ebay.com/sch/i.html'
    + '?_nkw=' + encodeURIComponent(query)
    + '&_sacat=183454&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': SUA, 'Accept-Language':'en-US,en;q=0.9' } });
    if (!r.ok) return { sales: [], source:'ebay_sold', error:'HTTP '+r.status };
    const html = await r.text();

    const sales = [];
    // Each result row carries a price and a sold date
    const priceRe = /class="s-item__price"[^>]*>(?:<span[^>]*>)?\$([\d,]+\.\d{2})/g;
    const dateRe  = /class="s-item__caption--signal[^"]*"[^>]*>[\s\S]{0,120}?Sold\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/g;
    const titleRe = /class="s-item__title"[^>]*>(?:<span[^>]*>)?([^<]{6,140})</g;

    const prices = [], dates = [], titles = [];
    let m;
    while ((m = priceRe.exec(html)) && prices.length < 60) prices.push(parseFloat(m[1].replace(/,/g,'')));
    while ((m = dateRe.exec(html))  && dates.length  < 60) dates.push(m[1]);
    while ((m = titleRe.exec(html)) && titles.length < 60) titles.push(m[1].trim());

    for (let i = 0; i < prices.length; i++) {
      if (prices[i] > 0) sales.push({ price: prices[i], date: dates[i] || null, title: titles[i] || null });
    }

    const vals = sales.map(s => s.price).sort((a,b) => a-b);
    const out = {
      sales,
      source: 'ebay_sold',
      count: sales.length,
      lowest:  vals[0] || 0,
      median:  vals.length ? vals[Math.floor(vals.length/2)] : 0,
      highest: vals[vals.length-1] || 0,
      average: vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : 0
    };
    sSet(key, out);
    return out;
  } catch (e) { return { sales: [], source:'ebay_sold', error: e.message }; }
}

// ── 3. TCGPLAYER public price page ────────────────────────────
async function tcgplayerPrice(cardName, setName) {
  const key = `tcg_${cardName}_${setName}`;
  const hit = sGet(key); if (hit) return hit;

  await throttle('www.tcgplayer.com');
  const q = encodeURIComponent(`${cardName} ${setName}`.trim());
  const url = `https://mp-search-api.tcgplayer.com/v1/search/request?q=${q}&isList=false`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': SUA, 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({
        algorithm:'sales_dismax', from:0, size:10,
        filters:{ term:{ productLineName:['pokemon'] }, range:{}, match:{} },
        listingSearch:{ context:{ cart:{} }, filters:{ term:{ sellerStatus:'Live' }, range:{ quantity:{ gte:1 } }, exclude:{ channelExclusion:0 } } },
        context:{ cart:{}, shippingCountry:'US' },
        settings:{ useFuzzySearch:true, didYouMean:{} },
        sort:{}
      })
    });
    if (!r.ok) return { price:null, source:'tcgplayer', error:'HTTP '+r.status };
    const d = await r.json();
    const first = d && d.results && d.results[0] && d.results[0].results && d.results[0].results[0];
    if (!first) return { price:null, source:'tcgplayer', error:'no match' };
    const out = {
      price: first.marketPrice || first.lowestPrice || null,
      lowest: first.lowestPrice || null,
      market: first.marketPrice || null,
      productId: first.productId,
      name: first.productName,
      set: first.setName,
      source: 'tcgplayer'
    };
    sSet(key, out);
    return out;
  } catch (e) { return { price:null, source:'tcgplayer', error:e.message }; }
}

// ── 4. PRICECHARTING public page (graded prices, no API key) ──
async function priceChartingGraded(cardName, setName) {
  const key = `pc_${cardName}_${setName}`;
  const hit = sGet(key); if (hit) return hit;

  await throttle('www.pricecharting.com');
  const q = encodeURIComponent(`${cardName} ${setName}`.trim());
  try {
    const r = await fetch(`https://www.pricecharting.com/search-products?q=${q}&type=prices`,
                          { headers: { 'User-Agent': SUA } });
    if (!r.ok) return { grades:{}, source:'pricecharting', error:'HTTP '+r.status };
    const html = await r.text();

    const grab = (id) => {
      const re = new RegExp('id="' + id + '"[\\s\\S]{0,200}?\\$([\\d,]+\\.?\\d*)');
      const m = html.match(re);
      return m ? parseFloat(m[1].replace(/,/g,'')) : null;
    };
    const grades = {
      'Raw NM':  grab('used_price'),
      'Grade 7': grab('complete_price'),
      'Grade 8': grab('new_price'),
      'Grade 9': grab('graded_price'),
      'Grade 9.5': grab('box_only_price'),
      'PSA 10':  grab('manual_only_price')
    };
    const out = { grades, source:'pricecharting' };
    sSet(key, out);
    return out;
  } catch (e) { return { grades:{}, source:'pricecharting', error:e.message }; }
}

// ── 5. AGGREGATE: best available market value ─────────────────
async function getMarketPrice(cardName, setName, grade) {
  const q = [cardName, setName, grade].filter(Boolean).join(' ') + ' pokemon';
  const results = await Promise.allSettled([
    ebayActive(q),
    ebaySold(q),
    tcgplayerPrice(cardName, setName),
    priceChartingGraded(cardName, setName)
  ]);

  const [act, sold, tcg, pc] = results.map(r => r.status === 'fulfilled' ? r.value : null);

  // Priority: recent sold median > TCGPlayer market > lowest active listing
  let marketValue = null, confidence = 'none', basis = null;

  if (sold && sold.median > 0 && sold.count >= 3) {
    marketValue = sold.median;
    confidence = sold.count >= 10 ? 'high' : 'medium';
    basis = `${sold.count} recent eBay sales`;
  } else if (tcg && tcg.market > 0) {
    marketValue = tcg.market;
    confidence = 'high';
    basis = 'TCGPlayer market price';
  } else if (act && act.listings.length >= 3) {
    const vals = act.listings.map(l => l.price).sort((a,b)=>a-b);
    marketValue = vals[Math.floor(vals.length/2)];
    confidence = 'low';
    basis = `${act.listings.length} active listings (median)`;
  } else if (sold && sold.average > 0) {
    marketValue = sold.average;
    confidence = 'low';
    basis = 'few eBay sales';
  }

  return {
    card: cardName, set: setName, grade: grade || 'Raw NM',
    marketValue, confidence, basis,
    lowestActive: act && act.listings.length ? Math.min(...act.listings.map(l=>l.price)) : null,
    activeCount: act ? act.listings.length : 0,
    soldCount: sold ? sold.count : 0,
    soldMedian: sold ? sold.median : null,
    soldRange: sold && sold.count ? { low: sold.lowest, high: sold.highest } : null,
    tcgplayer: tcg ? { market: tcg.market, lowest: tcg.lowest } : null,
    graded: pc ? pc.grades : null,
    listings: act ? act.listings.slice(0, 20) : [],
    recentSales: sold ? sold.sales.slice(0, 20) : [],
    fetchedAt: new Date().toISOString()
  };
}



const scraper = {
  ebayActive, ebaySold, tcgplayerPrice, priceChartingGraded,
  getMarketPrice, ebayToken: scrEbayToken
};


// GET /api/market/:cardName?set=Base%20Set&grade=PSA%209
// The main endpoint: aggregated real market value
app.get('/api/market/:cardName', async (req, res) => {
  if (!scraper) return res.status(503).json({ error: 'scraper module not loaded' });
  try {
    const data = await scraper.getMarketPrice(
      req.params.cardName,
      req.query.set || '',
      req.query.grade || ''
    );
    // ── DO NOT WRITE THIS INTO price_history ──────────────────
    // This endpoint used to persist its aggregate here, keyed on
    // `req.query.cardId || req.params.cardName` with `data.basis` as the
    // source — which is where the 47 rows labelled "TCGPlayer market
    // price" came from.
    //
    // The aggregate is built by `tcgplayerPrice(cardName, setName)`, which
    // matches on NAME AND SET ONLY — no collector number. Where a name
    // repeats in a set, which chase cards almost always do, it returns an
    // arbitrary variant. Mega Gengar ex #284 (Special Illustration Rare,
    // $1,056) was overwritten with $3.14, the price of Mega Gengar ex
    // #125, the Double Rare. Pikachu ex #276 went from $1,130 to $3.66.
    //
    // Because it wrote on every card view, the deployed app was quietly
    // re-introducing the exact defect v4.9 was written to kill, on top of
    // the number-matched prices safeprices had established. Ten cards were
    // showing a wrong current price when this was found (2026-08-26).
    //
    // price_history is written by the ingest pipeline ONLY — it matches on
    // collector number, uses rarity as a tiebreaker, and returns nothing
    // rather than guess. A read endpoint must not inject a weaker signal
    // into the authoritative table. Serve the aggregate, store nothing.
    // ──────────────────────────────────────────────────────────
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/market/:cardName/sold  - eBay sold comparables only
app.get('/api/market/:cardName/sold', async (req, res) => {
  if (!scraper) return res.status(503).json({ error: 'scraper not loaded' });
  try {
    const q = [req.params.cardName, req.query.set, req.query.grade]
      .filter(Boolean).join(' ') + ' pokemon';
    res.json(await scraper.ebaySold(q));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/market/:cardName/active - live eBay listings only
app.get('/api/market/:cardName/active', async (req, res) => {
  if (!scraper) return res.status(503).json({ error: 'scraper not loaded' });
  try {
    const q = [req.params.cardName, req.query.set, req.query.grade]
      .filter(Boolean).join(' ') + ' pokemon';
    res.json(await scraper.ebayActive(q, req.query.marketplace || 'EBAY_US'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/scraper/test - verify which scraper sources actually work
app.get('/api/scraper/test', async (req, res) => {
  if (!scraper) return res.status(503).json({ error: 'scraper not loaded' });
  const card = req.query.card || 'Charizard';
  const set  = req.query.set  || 'Base Set';
  const out = { card, set, sources: {} };

  try {
    const t = await scraper.ebayToken();
    out.sources.ebay_api = t ? 'OK - token acquired' : 'NOT configured (add EBAY_CLIENT_ID + EBAY_CLIENT_SECRET)';
  } catch (e) { out.sources.ebay_api = 'FAIL ' + e.message; }

  try {
    const s = await scraper.ebaySold(`${card} ${set} pokemon`);
    out.sources.ebay_sold = s.error ? 'FAIL ' + s.error
      : `OK - ${s.count} sales, median $${s.median}, range $${s.lowest}-$${s.highest}`;
  } catch (e) { out.sources.ebay_sold = 'FAIL ' + e.message; }

  try {
    const t = await scraper.tcgplayerPrice(card, set);
    out.sources.tcgplayer = t.error ? 'FAIL ' + t.error : `OK - market $${t.market}`;
  } catch (e) { out.sources.tcgplayer = 'FAIL ' + e.message; }

  try {
    const p = await scraper.priceChartingGraded(card, set);
    const got = Object.values(p.grades || {}).filter(Boolean).length;
    out.sources.pricecharting = p.error ? 'FAIL ' + p.error : `OK - ${got} grade prices`;
  } catch (e) { out.sources.pricecharting = 'FAIL ' + e.message; }

  res.json(out);
});



// ══════════════════════════════════════════════════════════════
// SETS BY LANGUAGE — real set lists from TCGdex per language
// GET /api/sets/lang/ja  -> every Japanese set with JP names + logos
// ══════════════════════════════════════════════════════════════
app.get('/api/sets/lang/:lang', async (req, res) => {
  const lang = (req.params.lang || 'en').toLowerCase();
  const key = `setlist_${lang}_v2`;
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
                                   AND ph.source NOT LIKE 'estimate%')
                 ) AS real_prices,
                 (ARRAY_AGG(c.image_small ORDER BY c.api_card_id))[1] AS sample_image
          FROM cards c
          WHERE c.api_card_id LIKE $1
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
            // Real logo captured at ingest time; build a URL only as a fallback
            logo: r.logo ||
                  `https://assets.tcgdex.net/${lang}/${tcgdexSeriesFor(r.id)}/${r.id}/logo.png`,
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
    const list = await r.json();

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
  try {
    const s = await ebaySold('Charizard Base Set pokemon');
    out.checks.ebay_sold_scrape = s.error ? 'FAIL ' + s.error
      : `OK - ${s.count} sales, median $${s.median}`;
  } catch (e) { out.checks.ebay_sold_scrape = 'FAIL ' + e.message; }
  try {
    const t = await tcgplayerPrice('Charizard', 'Base Set');
    out.checks.tcgplayer_scrape = t.error ? 'FAIL ' + t.error : `OK - $${t.market}`;
  } catch (e) { out.checks.tcgplayer_scrape = 'FAIL ' + e.message; }
  try {
    const p = await priceChartingGraded('Charizard', 'Base Set');
    const n = Object.values(p.grades || {}).filter(Boolean).length;
    out.checks.pricecharting_scrape = p.error ? 'FAIL ' + p.error : `OK - ${n} grades`;
  } catch (e) { out.checks.pricecharting_scrape = 'FAIL ' + e.message; }

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
app.get('/cardmatch.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(require('path').join(__dirname, 'cardmatch.js'), err => {
    if (err && !res.headersSent) res.status(500).send('// cardmatch.js unavailable');
  });
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
