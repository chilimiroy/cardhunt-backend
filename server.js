const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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
    version: '5.1.0',
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
        const dbLang = lang === 'zh-cn' ? 'zh-cn' : lang === 'zh-tw' ? 'zh-tw' : lang;
        const rows = await db.query(`
          SELECT c.api_card_id, c.name, c.number, c.rarity, c.supertype,
                 c.image_small, c.image_large, c.set_api_id, c.set_name, c.set_total,
                 c.tcgplayer_data, c.cardmarket_data,
                 lp.price_usd, lp.source AS price_source, lp.recorded_at
          FROM cards c
          LEFT JOIN LATERAL (
            SELECT price_usd, source, recorded_at
            FROM price_history ph
            WHERE ph.card_api_id = c.api_card_id
            ORDER BY (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC
            LIMIT 1
          ) lp ON TRUE
          WHERE c.set_api_id = $1
            AND c.api_card_id LIKE $2
          ORDER BY NULLIF(regexp_replace(c.number, '\D', '', 'g'), '')::int NULLS LAST,
                   c.number
        `, [setId, dbLang + '-%']);

        if (rows.rows.length) {
          const cards = rows.rows.map(r => {
            const price = r.price_usd ? parseFloat(r.price_usd) : 0;
            const isEstimate = !r.price_source || /^estimate/.test(r.price_source);
            return {
              id: r.api_card_id,
              name: r.name,
              number: r.number,
              rarity: r.rarity,
              supertype: r.supertype,
              set: { id: r.set_api_id, name: r.set_name, total: r.set_total },
              images: { small: r.image_small, large: r.image_large },
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
          id: c.api_card_id, name: c.name, number: c.number, rarity: c.rarity,
          supertype: c.supertype,
          images: { small: c.image_small, large: c.image_large },
          set: { id: c.set_api_id, name: c.set_name, total: c.set_total },
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
            name: c.name, rarity: c.rarity,
            set: { id: c.set_api_id, name: c.set_name, total: c.set_total },
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

    if (db && rawNm > 0) {
      db.query(
        'INSERT INTO price_history (card_api_id,price_usd,source,grades_json) VALUES ($1,$2,$3,$4)',
        [cardId, rawNm, source, JSON.stringify(grades)]
      ).catch(() => {});
    }

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
const EBAY_ID     = process.env.EBAY_CLIENT_ID || '';
const EBAY_SECRET = process.env.EBAY_CLIENT_SECRET || '';
let ebayToken = null, ebayTokenExp = 0;

async function getEbayToken() {
  if (!EBAY_ID || !EBAY_SECRET) return null;
  if (ebayToken && Date.now() < ebayTokenExp) return ebayToken;
  try {
    const auth = Buffer.from(`${EBAY_ID}:${EBAY_SECRET}`).toString('base64');
    const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      },
      body: 'grant_type=client_credentials&scope=' +
            encodeURIComponent('https://api.ebay.com/oauth/api_scope')
    });
    if (!r.ok) return null;
    const d = await r.json();
    ebayToken = d.access_token;
    ebayTokenExp = Date.now() + (d.expires_in - 60) * 1000;
    return ebayToken;
  } catch (e) { return null; }
}

// GET /api/listings/:cardName?grade=PSA%209&limit=20
app.get('/api/listings/:cardName', async (req, res) => {
  const { cardName } = req.params;
  const grade = req.query.grade || '';
  const setName = req.query.set || '';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const token = await getEbayToken();
  if (!token) {
    return res.json({
      listings: [],
      configured: false,
      message: 'eBay API not configured. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to enable live listings.'
    });
  }

  try {
    const q = [cardName, setName, grade, 'pokemon card'].filter(Boolean).join(' ');
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
      + '?q=' + encodeURIComponent(q)
      + '&category_ids=183454'
      + '&limit=' + limit
      + '&sort=price';
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': req.query.marketplace || 'EBAY_US'
      }
    });
    if (!r.ok) return res.json({ listings: [], configured: true, error: 'eBay returned ' + r.status });
    const d = await r.json();
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
  const out = { version: '5.1.0', checks: {} };

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

  out.checks.ebay = (EBAY_ID && EBAY_SECRET) ? 'configured' : 'NOT configured - add EBAY_CLIENT_ID + EBAY_CLIENT_SECRET';
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
let ebTok = null, ebExp = 0;

async function scrEbayToken() {
  if (!EBAY_ID || !EBAY_SECRET) return null;
  if (ebTok && Date.now() < ebExp) return ebTok;
  const auth = Buffer.from(`${EBAY_ID}:${EBAY_SECRET}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded', 'Authorization':`Basic ${auth}` },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!r.ok) return null;
  const d = await r.json();
  ebTok = d.access_token;
  ebExp = Date.now() + (d.expires_in - 60) * 1000;
  return ebTok;
}

// Active listings via the free Browse API
async function ebayActive(query, marketplace = 'EBAY_US', limit = 50) {
  const key = `eb_act_${marketplace}_${query}`;
  const hit = sGet(key); if (hit) return hit;

  const token = await scrEbayToken();
  if (!token) return { listings: [], source: 'ebay_api', configured: false };

  await throttle('api.ebay.com');
  const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
    + '?q=' + encodeURIComponent(query)
    + '&category_ids=183454&limit=' + limit + '&sort=price';
  const r = await fetch(url, {
    headers: { 'Authorization':`Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace }
  });
  if (!r.ok) return { listings: [], source:'ebay_api', error:'HTTP '+r.status };

  const d = await r.json();
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
    // Persist to Supabase for history
    if (db && data.marketValue > 0) {
      db.query(
        `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.query.cardId || req.params.cardName, data.marketValue,
         data.basis || 'scraper', 'aggregate', (req.query.grade || 'raw_nm').toLowerCase().replace(/\s+/g,'_')]
      ).catch(() => {});
    }
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
                 MAX(c.set_name)  AS name,
                 MAX(c.set_total) AS total,
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
            total: parseInt(r.total) || parseInt(r.card_count),
            cardCount: parseInt(r.card_count),
            realPrices: parseInt(r.real_prices),
            coverage: r.card_count > 0
              ? +((r.real_prices / r.card_count) * 100).toFixed(1) : 0,
            logo: `https://assets.tcgdex.net/${lang === 'zh-cn' ? 'zh-tw' : lang}/` +
                  `${tcgdexSeriesFor(r.id)}/${r.id}/logo.png`,
            lang
          }));
          const result = { lang, count: sets.length, sets, source: 'cardhunt_db' };
          cSet(key, result);
          return res.json(result);
        }
      } catch (e) { console.error('DB set list failed:', e.message); }
    }

    // ══ 2. FALLBACK — live TCGdex ══
    const tdLang = ['ja','zh-tw','zh-cn','fr','de','it','es','pt','ko','th','id']
      .includes(lang) ? lang : 'en';
    const fetchLang = tdLang === 'zh-cn' ? 'zh-cn' : tdLang;

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
  const out = { version: '5.1.0', ts: new Date().toISOString(), checks: {} };

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
    const t = await scrEbayToken();
    out.checks.ebay_api = t ? 'OK - authenticated' : 'not configured';
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


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CardHunt API v5.1 on port ${PORT}  (database-first)`);
  console.log(`DB: ${db ? 'Supabase connected' : 'none'}`);
  console.log(`Sources: pokemontcg.io + tcgdex.net`);
});
