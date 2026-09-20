// ══════════════════════════════════════════════════════════════
// sourceprobe.js — does this source answer RENDER, or only a home IP?
//
// Yahoo Auctions returns 200 to a residential connection and 403 to
// Render. Every scraper in this project worked throughout development for
// that reason alone, and the discovery cost a rewrite. The question "does
// it answer from the deployed server" is therefore the FIRST question
// about any new source, not the last — and it costs one request.
//
// So this runs the same probe from both places:
//
//   node sourceprobe.js                 every source, from here (home IP)
//   node sourceprobe.js yuyutei         one source
//   GET /api/probe/sources              the same code, from Render
//   GET /api/probe/sources?id=yuyutei
//
// A difference between the two answers IS the finding. Same module, same
// request, same parse — because two implementations would leave "it is
// the IP" and "it is our code" indistinguishable, which is the exact
// ambiguity the Yahoo result took weeks to resolve.
//
// ── No URL parameter, deliberately ──
// The registry below is fixed. An endpoint that fetches a URL the caller
// supplies is an SSRF hole: it would let anyone use this server to reach
// its own cloud metadata endpoint, or any host behind it. The caller may
// choose WHICH registered source to probe and nothing else.
//
// ── One request each ──
// Results are cached in memory. Probing is polite-but-uninvited traffic to
// somebody else's shop, and a probe endpoint that can be hammered is a
// good way to earn the block we are testing for.
// ══════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TIMEOUT_MS = 15000;
const CACHE_MS = 30 * 60 * 1000;

// ── The registry ──────────────────────────────────────────────
// `expect` is what a WORKING response contains. It is the difference
// between "HTTP 200" and "HTTP 200 carrying the thing we need": a shop
// that answers a datacentre IP with a 200-status "access denied" page, or
// a consent interstitial, looks identical to success by status code alone.
// tcgdexprobe learned this the hard way — the docs described a shape the
// API did not have.
const SOURCES = [
  {
    id: 'yuyutei',
    label: 'Yuyu-tei (JP shop)',
    // The set page: ONE fetch returns every card in the set with number,
    // printed total, rarity, price, stock and a per-card URL. 9,294 rows
    // in price_history already came from this parser.
    url: 'https://yuyu-tei.jp/sell/poc/s/sv08a',
    expect: [/card-product/, /円/],
    why: 'already parsed and trusted; per-card URLs make it a LISTINGS source, not just prices'
  },
  {
    id: 'yahoo_shopping',
    label: 'Yahoo! Shopping API (JP)',
    // Deliberately probed WITHOUT the credential when there is none. A
    // documented API that cannot be reached from Render is worth knowing
    // before the Client ID arrives, and Yahoo's own error body names the
    // parameters it validates — which is more than the docs are worth.
    url: 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch'
       + '?query=' + encodeURIComponent('ポケモンカード') + '&results=5',
    credential: 'YAHOO_SHOPPING_CLIENT_ID',
    credentialParam: 'appid',
    expect: [/hits|totalResultsAvailable/i],
    why: 'the Auctions Web API was withdrawn in 2020; Shopping is a different, live service'
  },
  {
    id: 'pricecharting',
    label: 'PriceCharting',
    url: 'https://www.pricecharting.com/search-products?q=charizard+base+set&type=prices',
    expect: [/pricecharting/i, /<table|product/i],
    why: 'graded price history; currently a deep link only'
  },
  {
    id: 'comc',
    label: 'COMC',
    url: 'https://www.comc.com/Cards/Gaming/Search?Rf=en-swsh11',
    expect: [/comc/i],
    why: 'US consignment marketplace, heavy singles inventory'
  },
  {
    id: 'trollandtoad',
    label: 'Troll and Toad',
    url: 'https://www.trollandtoad.com/productsearch?keywords=giratina+v+186',
    expect: [/troll/i, /product/i],
    why: 'large US singles retailer'
  },
  {
    id: 'cardkingdom',
    label: 'Card Kingdom',
    url: 'https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=giratina',
    expect: [/card\s*kingdom/i],
    why: 'US retailer; Pokemon singles alongside MTG'
  },
  {
    id: 'cardrush',
    label: 'Cardrush (JP shop)',
    url: 'https://www.cardrush-pokemon.jp/product-list?keyword=' + encodeURIComponent('リザードン'),
    expect: [/cardrush|カードラッシュ/i],
    why: 'second JP shop; a cross-check for Yuyu-tei asking prices'
  }
];

const byId = new Map(SOURCES.map(s => [s.id, s]));

// ── Failure modes, told apart ─────────────────────────────────
// `null` is not a diagnosis. getEbayToken returned a bare null for four
// unrelated causes and sent the hunt to the wrong system entirely, so
// every outcome here carries its own status:
//
//   ok          200, and the expected markers are present
//   shape       200, but the body is not what we need (consent wall,
//               "access denied" served with a 200, an empty SPA shell)
//   blocked     403/401/429, or a challenge page — the Yahoo answer
//   http        any other non-2xx
//   unreachable DNS, TLS, timeout — never reached the server at all
//   unconfigured a credential this source needs is absent
// A challenge page is recognised STRUCTURALLY, never by a bare word.
//
// The first version of this matched /cloudflare/ anywhere in the body and
// reported Yuyu-tei as blocked. Yuyu-tei had in fact served 1.17MB of
// Japanese shop page containing 482 card blocks; the word came from
// `cdnjs.cloudflare.com` in a stylesheet link. Half the web loads an asset
// from a CDN whose name is a vendor's.
//
// That is `looksLikeJunk` in a new costume — a matcher written against bad
// data firing on good data — and it would have produced a WRONG FINDING
// recorded in CLAUDE.md as fact, which is worse than no finding at all.
// Anchored on the title and on the interstitial's own phrasing instead.
const CHALLENGE_TITLE = /<title>\s*(just a moment|attention required|access denied|security check|are you a robot)/i;
const CHALLENGE_BODY = /(enable javascript and cookies to continue|checking your browser before|verify you are (a )?human|cf-browser-verification|please complete the security check|unusual traffic from your computer)/i;

function looksLikeChallenge(body) {
  const m = body.match(CHALLENGE_TITLE) || body.match(CHALLENGE_BODY);
  return m ? m[0].replace(/<title>\s*/i, '') : null;
}

function classify(res, body, src) {
  if (res.status === 403 || res.status === 401 || res.status === 429) {
    return { status: 'blocked', detail: `HTTP ${res.status}` };
  }
  if (!res.ok) return { status: 'http', detail: `HTTP ${res.status}` };

  // Ask the question that matters FIRST: did we get what we need? A page
  // carrying the markers is a working page whatever else is in it. Only
  // when they are missing is it worth diagnosing why.
  const missing = (src.expect || []).filter(re => !re.test(body));
  if (!missing.length) {
    return { status: 'ok', detail: `HTTP 200, ${body.length} bytes, markers present` };
  }

  const challenge = looksLikeChallenge(body);
  if (challenge) {
    return { status: 'blocked',
             detail: `HTTP 200 carrying a challenge page ("${challenge.trim()}")` };
  }
  return { status: 'shape',
           detail: `HTTP 200, ${body.length} bytes, but ${missing.length} expected ` +
                   `marker(s) absent: ` + missing.map(String).join(' ') };
}

async function probeOne(src) {
  const t0 = Date.now();
  let url = src.url;

  if (src.credential) {
    const val = process.env[src.credential];
    if (!val) {
      // Not a failure of the source. Reported as its own status so it can
      // never be read as "the API rejected us".
      return { id: src.id, label: src.label, status: 'unconfigured',
               detail: `${src.credential} is not set`,
               credential: src.credential, why: src.why, ms: 0 };
    }
    url += (url.includes('?') ? '&' : '?') + src.credentialParam + '=' +
           encodeURIComponent(val);
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': UA,
                 'Accept': 'text/html,application/xhtml+xml,application/json',
                 'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3' }
    });
    const body = await res.text();
    const c = classify(res, body, src);
    return {
      id: src.id, label: src.label, why: src.why,
      status: c.status, detail: c.detail,
      httpStatus: res.status,
      contentType: res.headers.get('content-type') || null,
      bytes: body.length,
      ms: Date.now() - t0,
      // A short, quoted sample. Reading the first 200 characters of what
      // actually came back has settled more arguments in this project than
      // any status code.
      sample: body.slice(0, 200).replace(/\s+/g, ' ').trim()
    };
  } catch (e) {
    // A transport failure is never a rejection. Conflating the two is what
    // made an unreachable host report as a credential problem.
    return { id: src.id, label: src.label, why: src.why,
             status: 'unreachable',
             detail: e.name === 'AbortError'
               ? `no response within ${TIMEOUT_MS}ms`
               : `${e.name}: ${e.message}`,
             ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// ── Redaction ─────────────────────────────────────────────────
// The Yahoo probe puts the Client ID in the query string, so it can reach
// a response through an error message or an echoed request. The probe is a
// public diagnostic endpoint; a credential must not travel out of it.
// Applied to every string the caller sees, not only the ones expected to
// carry it.
function redact(s) {
  if (s == null) return s;
  let out = String(s).replace(/(appid=)[^&\s"']+/gi, '$1REDACTED');
  for (const src of SOURCES) {
    if (!src.credential) continue;
    const v = process.env[src.credential];
    if (v && v.length > 6) out = out.split(v).join('REDACTED');
  }
  return out;
}

function redactResult(r) {
  return Object.assign({}, r, {
    detail: redact(r.detail),
    sample: redact(r.sample)
  });
}

// ── Cache ─────────────────────────────────────────────────────
const cache = new Map();

async function probe(id, opts) {
  opts = opts || {};
  const src = byId.get(id);
  if (!src) return { id, status: 'unknown', detail: 'not a registered source' };

  const hit = cache.get(id);
  if (hit && !opts.refresh && Date.now() - hit.at < CACHE_MS) {
    return redactResult(Object.assign({}, hit.result,
      { cached: true, cachedAgeSec: Math.round((Date.now() - hit.at) / 1000) }));
  }
  const result = await probeOne(src);
  result.probedAt = new Date().toISOString();
  cache.set(id, { at: Date.now(), result });
  return redactResult(Object.assign({}, result, { cached: false, cachedAgeSec: 0 }));
}

async function probeAll(opts) {
  const out = [];
  for (const s of SOURCES) out.push(await probe(s.id, opts));   // serial, on purpose
  return out;
}

module.exports = { probe, probeAll, SOURCES, ids: () => SOURCES.map(s => s.id) };

// ── CLI ───────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    const where = process.env.RENDER ? 'RENDER' : 'this machine (home IP)';
    console.log(`\n  SOURCE PROBE — from ${where}\n  ${'-'.repeat(72)}`);
    const results = arg ? [await probe(arg, { refresh: true })]
                        : await probeAll({ refresh: true });
    for (const r of results) {
      const mark = { ok: ' ok ', blocked: 'BLOCK', shape: 'SHAPE',
                     http: 'HTTP ', unreachable: 'UNREA', unconfigured: 'UNCFG',
                     unknown: ' ??? ' }[r.status] || '  ?  ';
      console.log(`  ${mark}  ${String(r.id).padEnd(15)} ${r.detail}`);
      if (r.sample) console.log(`         "${r.sample.slice(0, 90)}"`);
    }
    console.log('');
    console.log('  ok = usable from here. BLOCK = this IP is refused.');
    console.log('  SHAPE = answered, but not with what we need.');
    console.log('  Run the same probe on Render (/api/probe/sources) and compare:');
    console.log('  a difference between the two IS the finding.\n');
  })();
}
