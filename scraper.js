// ══════════════════════════════════════════════════════════════
// CardHunt Price Scraper
// Pulls real market prices from public sources.
//
// Sources (all free):
//   1. eBay Browse API      - active listings        (5k calls/day free)
//   2. eBay completed pages - SOLD comps             (scraped)
//   3. TCGPlayer price page - market price           (scraped)
//   4. PriceCharting public - graded PSA/CGC/BGS     (scraped)
//   5. 130point.com         - aggregated eBay solds  (scraped)
//
// Usage in server.js:
//   const scraper = require('./scraper');
//   const data = await scraper.getMarketPrice('Charizard', 'Base Set', 'PSA 9');
// ══════════════════════════════════════════════════════════════

const CACHE = {};
const TTL = 30 * 60 * 1000;               // 30 min — be polite to sources
const cGet = k => { const e = CACHE[k]; return (e && Date.now()-e.ts < TTL) ? e.d : null; };
const cSet = (k, d) => { CACHE[k] = { d, ts: Date.now() }; };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
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
const EBAY_ID     = process.env.EBAY_CLIENT_ID || '';
const EBAY_SECRET = process.env.EBAY_CLIENT_SECRET || '';
let ebTok = null, ebExp = 0;

async function ebayToken() {
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
  const hit = cGet(key); if (hit) return hit;

  const token = await ebayToken();
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
  cSet(key, out);
  return out;
}

// SOLD comps — scraped from eBay's public completed-listings page
async function ebaySold(query) {
  const key = `eb_sold_${query}`;
  const hit = cGet(key); if (hit) return hit;

  await throttle('www.ebay.com');
  const url = 'https://www.ebay.com/sch/i.html'
    + '?_nkw=' + encodeURIComponent(query)
    + '&_sacat=183454&LH_Complete=1&LH_Sold=1&_sop=13&_ipg=60';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language':'en-US,en;q=0.9' } });
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
    cSet(key, out);
    return out;
  } catch (e) { return { sales: [], source:'ebay_sold', error: e.message }; }
}

// ── 3. TCGPLAYER public price page ────────────────────────────
async function tcgplayerPrice(cardName, setName) {
  const key = `tcg_${cardName}_${setName}`;
  const hit = cGet(key); if (hit) return hit;

  await throttle('www.tcgplayer.com');
  const q = encodeURIComponent(`${cardName} ${setName}`.trim());
  const url = `https://mp-search-api.tcgplayer.com/v1/search/request?q=${q}&isList=false`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type':'application/json', 'Accept':'application/json' },
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
    cSet(key, out);
    return out;
  } catch (e) { return { price:null, source:'tcgplayer', error:e.message }; }
}

// ── 4. PRICECHARTING public page (graded prices, no API key) ──
async function priceChartingGraded(cardName, setName) {
  const key = `pc_${cardName}_${setName}`;
  const hit = cGet(key); if (hit) return hit;

  await throttle('www.pricecharting.com');
  const q = encodeURIComponent(`${cardName} ${setName}`.trim());
  try {
    const r = await fetch(`https://www.pricecharting.com/search-products?q=${q}&type=prices`,
                          { headers: { 'User-Agent': UA } });
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
    cSet(key, out);
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

module.exports = {
  ebayActive, ebaySold, tcgplayerPrice, priceChartingGraded,
  getMarketPrice, ebayToken
};
