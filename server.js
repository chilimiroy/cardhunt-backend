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
const TCGDEX_SETS = {
  'me2pt5':'me02.5','me2':'me02','me1':'me01','me3':'me03','me4':'me04',
  'sv10':'sv10','sv9':'sv09','sv8pt5':'sv08.5','sv8':'sv08','sv7':'sv07',
  'sv6pt5':'sv06.5','sv6':'sv06','sv5':'sv05','sv4pt5':'sv04.5','sv4':'sv04',
  'sv3pt5':'sv03.5','sv3':'sv03','sv2':'sv02','sv1':'sv01',
  'swsh12pt5':'swsh12.5','swsh12':'swsh12','swsh11':'swsh11','swsh10':'swsh10',
  'swsh9':'swsh09','swsh8':'swsh08','swsh7':'swsh07','swsh6':'swsh06',
  'swsh5':'swsh05','swsh4':'swsh04','swsh3':'swsh03','swsh2':'swsh02','swsh1':'swsh01',
  'sm12':'sm12','sm115':'sm11.5','sm11':'sm11',
  'base1':'base1','base2':'base2','base3':'base3','base5':'base5',
  'neo1':'neo1','xy12':'xy12'
};

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
app.get('/', (req, res) => res.json({
  status: 'ok', service: 'CardHunt API', version: '3.0.0',
  sources: ['pokemontcg.io', 'tcgdex.net'],
  db: db ? 'supabase connected' : 'no db',
  cache: Object.keys(CACHE).length + ' entries'
}));

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

// ── SET CARDS: tries TCGdex (multilingual) then pokemontcg.io ─
app.get('/api/sets/:setId/cards', async (req, res) => {
  const { setId } = req.params;
  const lang = (req.query.lang || 'en').toLowerCase();
  const key = `set_${setId}_${lang}`;
  try {
    const cached = cGet(key);
    if (cached) return res.json(cached);

    // 1. TCGdex first (has JP/ZH + brand-new sets)
    const tdSet = TCGDEX_SETS[setId] || setId;
    const tdLang = ['ja','zh-tw','fr','de','it','es','pt'].includes(lang) ? lang : 'en';
    try {
      const tr = await fetch(`${TCGDEX}/${tdLang}/sets/${tdSet}`);
      if (tr.ok) {
        const td = await tr.json();
        if (td.cards && td.cards.length) {
          const cards = td.cards.map(c => ({
            id: `${setId}-${c.localId}`,
            name: c.name,
            number: String(c.localId),
            rarity: c.rarity || '',
            set: { id: setId, name: td.name, total: td.cardCount ? td.cardCount.total : td.cards.length },
            images: {
              small: c.image ? `${c.image}/low.png` : '',
              large: c.image ? `${c.image}/high.png` : ''
            },
            _source: 'tcgdex', _lang: tdLang
          }));
          const result = { totalCount: cards.length, data: cards, source: 'tcgdex', lang: tdLang };
          cSet(key, result);
          return res.json(result);
        }
      }
    } catch (e) { /* fall through */ }

    // 2. pokemontcg.io (English, has prices)
    let cards = [], page = 1, total = 9999;
    while (cards.length < total) {
      const r = await fetch(
        `${TCG_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`,
        { headers: TCG_H }
      );
      const d = await r.json();
      if (!d.data || !d.data.length) break;
      cards = cards.concat(d.data);
      total = d.totalCount || cards.length;
      page++;
      if (page > 10) break;
    }
    const result = { totalCount: cards.length, data: cards, source: 'pokemontcg', lang: 'en' };
    cSet(key, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SINGLE CARD ───────────────────────────────────────────────
app.get('/api/cards/:cardId', async (req, res) => {
  const { cardId } = req.params;
  try {
    if (db) {
      const row = await db.query('SELECT * FROM cards WHERE api_card_id=$1', [cardId]);
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
    const r = await fetch(`${TCG_API}/cards/${cardId}`, { headers: TCG_H });
    const d = await r.json();
    const c = d.data;
    if (!c) return res.status(404).json({ error: 'Not found' });

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
      tcgplayer_url: (c.tcgplayer && c.tcgplayer.url) || null,
      cardmarket_url: (c.cardmarket && c.cardmarket.url) || null,
      tcgplayer_prices: t,
      updated: (c.tcgplayer && c.tcgplayer.updatedAt) || new Date().toISOString()
    };
    cSet(`price_${cardId}`, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ALERTS ────────────────────────────────────────────────────
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
  if (!db) return res.json({ id: Date.now(), ...req.body, status: 'active' });
  try {
    const b = req.body;
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
  if (!db) return res.json({ ok: true });
  try {
    await db.query('UPDATE alerts SET status=$1,updated_at=NOW() WHERE id=$2',
      [req.body.status, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PORTFOLIO ─────────────────────────────────────────────────
app.get('/api/portfolio/:userId', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = await db.query('SELECT * FROM portfolio WHERE user_id=$1 ORDER BY created_at DESC',
      [req.params.userId]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/portfolio', async (req, res) => {
  if (!db) return res.json({ id: Date.now(), ...req.body });
  try {
    const b = req.body;
    const row = await db.query(`
      INSERT INTO portfolio (user_id,card_api_id,card_name,card_img,set_name,grade,quantity,purchase_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.user_id, b.card_api_id, b.card_name, b.card_img, b.set_name,
       b.grade, b.quantity || 1, b.purchase_price || 0]);
    res.json(row.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PRICE HISTORY ─────────────────────────────────────────────
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CardHunt API v3 on port ${PORT}`);
  console.log(`DB: ${db ? 'Supabase connected' : 'none'}`);
  console.log(`Sources: pokemontcg.io + tcgdex.net`);
});
app.listen(PORT, () => {
  console.log(`CardHunt API running on port ${PORT}`);
  console.log(`DB: ${db ? 'Supabase connected' : 'No database configured'}`);
});

