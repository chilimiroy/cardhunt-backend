// pricegate.test.js — the door: the catalogue is public, its prices are not
// (door task T1, 2026-10-07)
//
//   node pricegate.test.js         offline: strip() on built bodies — what it
//                                  removes AND what it keeps
//   node pricegate.test.js --db    also: boots server.js against Supabase
//                                  (schema guarded, eBay off) and asks every
//                                  catalogue route as a master and as an
//                                  anonymous / pending caller. Every price
//                                  NUMBER the master receives must be absent
//                                  from the anonymous body under ANY key —
//                                  not only under the keys strip() knows —
//                                  and the catalogue fields must still be
//                                  there.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const pg = require('./pricegate');
let pass = 0, fail = 0, skipped = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

// Every number at or under a price key, at any depth (numeric strings too).
function priceNumbers(v, under, out) {
  out = out || new Set();
  if (Array.isArray(v)) v.forEach(x => priceNumbers(x, under, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) priceNumbers(v[k], under || pg.isPriceKey(k), out);
  else if (under && (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)))) out.add(+v);
  return out;
}
function allNumbers(v, out) {
  out = out || new Set();
  if (Array.isArray(v)) v.forEach(x => allNumbers(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => allNumbers(x, out));
  else if (typeof v === 'number') out.add(v);
  else if (typeof v === 'string') (v.match(/\d+\.\d+/g) || []).forEach(x => out.add(+x));
  return out;
}
function allKeys(v, out) {
  out = out || [];
  if (Array.isArray(v)) v.forEach(x => allKeys(x, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.push(k); allKeys(v[k], out); }
  return out;
}
const BROAD = /price|market|tcgplayer|cardmarket|cheapest|listing|deal|valu|cost|usd|jpy|eur/i;
const leakedKeys = body => allKeys(body).filter(k => BROAD.test(k) && k !== 'pricesWithheld' && k !== 'listingsWithheld');   // the two notes: words and a boolean
// A price is only evidence when it could not be anything else: not a whole
// number (card numbers, counts, years) and not tiny.
const telling = n => Number.isFinite(n) && n >= 0.5 && Math.round(n) !== n;

(async () => {
  console.log('\n  offline: strip() removes prices, keeps the catalogue');
  const card = { id: 'en-base1-4', name: 'Charizard', number: '4', rarity: 'Rare Holo', artist: 'Mitsuhiro Arita',
    images: { small: 's.png', large: 'l.png' }, set: { id: 'base1', name: 'Base', logo: 'logo.png', total: 102, releaseDate: '1999-01-09' },
    printings: [{ key: 'holofoil', label: 'Holo' }], printingPrices: [{ variant: 'holofoil', price: 412.35 }],
    editionPrices: [{ edition: '1st', price: 9876.5 }], tcgplayer: { prices: { holofoil: { market: 412.35 } } },
    cardmarket: { prices: { trendPrice: 380.1 } }, _price: 412.35, _priceSource: 'tcgdex', _priceIsReal: true,
    _priceDate: '2026-10-06', _priceQuality: { old: false }, price: { value: 412.35, isReal: true } };
  const body = { data: card, totalCount: 1, sample_prices: { a: 1.5 }, listings: [{ url: 'https://ebay.com/itm/1', price: 99.99 }],
    cheapest: { price: 99.99 }, liveCount: 3, outliers: [], sources: { ebay: {} }, gradePrice: { value: 1200.5 } };
  const s = pg.strip(body);
  ok('no price number survives, under any key', [...priceNumbers(body)].every(n => !allNumbers(s).has(n)), JSON.stringify([...allNumbers(s)]));
  ok('no price-shaped key survives', leakedKeys(s).length === 0, leakedKeys(s).join(', '));
  ok('KEEPS the catalogue: name, number, rarity, artist, images, set (logo, total, release), printings', s.data.name === 'Charizard'
     && s.data.number === '4' && s.data.rarity === 'Rare Holo' && s.data.artist === 'Mitsuhiro Arita' && s.data.images.large === 'l.png'
     && s.data.set.logo === 'logo.png' && s.data.set.total === 102 && s.data.set.releaseDate === '1999-01-09'
     && s.data.printings[0].label === 'Holo' && s.totalCount === 1);
  ok('returns a copy: the cached original is untouched', body.data._price === 412.35 && body.listings.length === 1);
  ok('arrays and nulls pass through', JSON.stringify(pg.strip([null, 1, 'a', [{ price: 1 }]])) === '[null,1,"a",[{}]]');
  ok('the withheld note carries no number', !/\d/.test(pg.WITHHELD));

  if (!process.argv.includes('--db')) { console.log('\n  pricegate.test.js — ' + pass + ' passed, ' + fail + ' failed  (add --db for the live comparison)'); process.exit(fail ? 1 : 0); }

  console.log('\n  --db: the real server, real catalogue — master vs anonymous vs pending');
  const PORT = +(process.env.TEST_PORT || 3995), BASE = 'http://127.0.0.1:' + PORT;
  const SECRET = 'pricegate-test-' + crypto.randomBytes(8).toString('hex'), SUPA = 'https://pricegate-test.supabase.co';
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = (sub, email) => { const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64({ sub, email, aud: 'authenticated', iss: SUPA + '/auth/v1', exp: Math.floor(Date.now() / 1000) + 600 });
    return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url'); };
  const MASTER = tok(crypto.randomUUID(), 'pricegate.master@example.com');
  const PENDING = tok(crypto.randomUUID(), 'pricegate.pending@example.com');   // no user_access row: pending, nothing written
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), EBAY_ENABLED: 'false', CARDZON_SCHEMA_GUARD: '1',
      SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: SECRET,
      CARDZON_MASTER_EMAILS: 'pricegate.master@example.com' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 150 && !up; i++) { try { await fetch(BASE + '/api/auth/config'); up = true; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
    if (!up) throw new Error('server did not boot: ' + log.slice(-300));
    const get = (p, t) => fetch(BASE + p, { headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(async r => ({ status: r.status, cc: r.headers.get('cache-control'), vary: r.headers.get('vary'), body: await r.json().catch(() => null) }));
    const ROUTES = ['/api/cards/en-base1-4', '/api/cards/en-sv03.5-199', '/api/cards/ja-SV2a-201', '/api/sets/base1/cards?lang=en',
      '/api/sets/sv03.5/cards?lang=en', '/api/sets?lang=en', '/api/sets/lang/en', '/api/search?listings=0&q=charizard%20base%204',
      '/api/search?q=Charizard%204%2F102', '/api/diagnostic'];
    for (const p of ROUTES) {
      const m = await get(p, MASTER), a = await get(p, null), pe = await get(p, PENDING);
      // /api/sets proxies pokemontcg.io, which fails now and then. An upstream
      // 5xx is not the door: said, not counted either way.
      if (m.status >= 500 || a.status >= 500 || pe.status >= 500) {
        console.log(`  SKIP  ${p}  upstream answered ${m.status}/${a.status}/${pe.status} — not judged this run`);
        skipped++; continue;
      }
      const prices = [...priceNumbers(m.body)].filter(telling);
      const anonNums = allNumbers(a.body), penNums = allNumbers(pe.body);
      const leakA = prices.filter(n => anonNums.has(n)), leakP = prices.filter(n => penNums.has(n));
      ok(`${p}  answers everyone (master ${m.status}, anonymous ${a.status}, pending ${pe.status})`, m.status === a.status && a.status === pe.status && a.status < 500);
      ok(`${p}  the master's ${prices.length} price numbers: none reaches anonymous or pending, under any key`,
         leakA.length === 0 && leakP.length === 0, 'leaked: ' + JSON.stringify(leakA.concat(leakP).slice(0, 5)));
      ok(`${p}  no price-shaped key for anonymous / pending; says why`, leakedKeys(a.body).length === 0 && leakedKeys(pe.body).length === 0
         && a.body && a.body.pricesWithheld === pg.WITHHELD, leakedKeys(a.body).concat(leakedKeys(pe.body)).slice(0, 6).join(', '));
      ok(`${p}  never cached between us and the caller (private, no-store; Vary: Authorization)`, /private/.test(a.cc || '') && /no-store/.test(a.cc || '') && /authorization/i.test(a.vary || ''), (a.cc || '') + ' | ' + (a.vary || ''));
      if (p.startsWith('/api/cards/') && m.status === 200) {
        ok(`${p}  the master DOES get prices (the gate lets through)`, prices.length > 0 && m.body.pricesWithheld === undefined, prices.length + ' price numbers');
        const d = a.body.data || {};
        ok(`${p}  anonymous still gets the catalogue: name, number, rarity, images, set`, !!(d.name && d.number && d.rarity !== undefined && d.images && d.set && d.set.id), JSON.stringify({ name: d.name, number: d.number, set: d.set && d.set.id }));
      }
      if (p === '/api/search?q=Charizard%204%2F102') {
        ok('search with listings asked, confident hit: anonymous gets candidates, no listings, and is told so', a.body && a.body.confident === true && Array.isArray(a.body.candidates) && a.body.candidates.length > 0
           && a.body.listings === undefined && a.body.listingsWithheld === true, JSON.stringify(Object.keys(a.body || {})));
      }
    }
  } catch (e) { ok('ran to the end', false, e.message); }
  finally { srv.kill(); }
  console.log('\n  pricegate.test.js — ' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' route(s) not judged (upstream down)' : ''));
  process.exit(fail ? 1 : 0);
})();
