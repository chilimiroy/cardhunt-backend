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
  status: 'ok', service: 'CardHunt API', version: '4.0.0',
  sources: ['pokemontcg.io','tcgdex.net','ebay-api','ebay-sold','tcgplayer','pricecharting'],
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
  if (r === 'Hyper Rare' || r === 'Special Illustration Rare') band = 0.35 + (seed % 340)/100;
  else if (['Illustration Rare','Rare Secret','Rare Rainbow'].includes(r)) band = 0.45 + (seed % 220)/100;
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
  const key = `set_${setId}_${lang}`;
  try {
    const cached = cGet(key);
    if (cached) return res.json(cached);

    // ── A. pokemontcg.io: authoritative English prices ─────────
    const priceIndex = {};   // number -> {price, source, tcgplayer, cardmarket}
    let enCards = [];
    try {
      let page = 1, total = 9999;
      while (enCards.length < total && page <= 10) {
        const r = await fetch(
          `${TCG_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`,
          { headers: TCG_H });
        const d = await r.json();
        if (!d.data || !d.data.length) break;
        enCards = enCards.concat(d.data);
        total = d.totalCount || enCards.length;
        page++;
      }
      enCards.forEach(c => {
        const p = extractPrice(c);
        priceIndex[String(c.number)] = {
          price: p ? p.price : null,
          source: p ? p.source : null,
          tcgplayer: c.tcgplayer || null,
          cardmarket: c.cardmarket || null,
          rarity: c.rarity,
          tcgUrl: c.tcgplayer && c.tcgplayer.url
        };
      });
    } catch (e) { /* keep going */ }

    // ── B. TCGdex: catalog + multilingual + new sets ───────────
    const tdSet = TCGDEX_SETS[setId] || setId;
    const tdLang = ['ja','zh-tw','fr','de','it','es','pt'].includes(lang) ? lang : 'en';
    let tdCards = null;
    try {
      const tr = await fetch(`${TCGDEX}/${tdLang}/sets/${tdSet}`);
      if (tr.ok) {
        const td = await tr.json();
        if (td.cards && td.cards.length) {
          tdCards = td.cards.map(c => {
            const num = String(c.localId);
            const pi = priceIndex[num] || {};
            const rarity = normRarity(c.rarity || pi.rarity);
            const price = pi.price || estimatePrice(rarity, `${setId}-${num}`, c.name);
            return {
              id: `${setId}-${num}`,
              name: c.name,
              number: num,
              rarity,
              set: { id: setId, name: td.name, total: td.cardCount ? td.cardCount.total : td.cards.length },
              images: {
                small: c.image ? `${c.image}/low.png` : '',
                large: c.image ? `${c.image}/high.png` : ''
              },
              tcgplayer: pi.tcgplayer || { prices: { holofoil: { market: price, low: +(price*0.65).toFixed(2), mid: price, high: +(price*1.7).toFixed(2) } } },
              cardmarket: pi.cardmarket || null,
              _price: price,
              _priceSource: pi.source || 'estimate',
              _source: 'tcgdex+pokemontcg',
              _lang: tdLang
            };
          });
        }
      }
    } catch (e) { /* fall through */ }

    if (tdCards && tdCards.length) {
      const result = { totalCount: tdCards.length, data: tdCards, source: 'tcgdex+pokemontcg', lang: tdLang };
      cSet(key, result);
      return res.json(result);
    }

    // ── C. pokemontcg.io only ─────────────────────────────────
    const enriched = enCards.map(c => {
      const p = extractPrice(c);
      const rarity = normRarity(c.rarity);
      return Object.assign({}, c, {
        rarity,
        _price: p ? p.price : estimatePrice(rarity, c.id, c.name),
        _priceSource: p ? p.source : 'estimate'
      });
    });
    const result = { totalCount: enriched.length, data: enriched, source: 'pokemontcg', lang: 'en' };
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
  const out = { version: '4.0.0', checks: {} };

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
let scraper = null;
try { scraper = require('./scraper'); } catch (e) { console.warn('scraper.js not found'); }

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


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CardHunt API v3 on port ${PORT}`);
  console.log(`DB: ${db ? 'Supabase connected' : 'none'}`);
  console.log(`Sources: pokemontcg.io + tcgdex.net`);
});
