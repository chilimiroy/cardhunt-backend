// ══════════════════════════════════════════════════════════════
// costmeter.js — MEASURE what an action costs in eBay calls, spending none.
// Built for the CALL COST chart in CLAUDE.md (2026-10-01). Re-measure with
// it rather than re-derive a row from the code.
//
// A preload (node -r) for the server or any script:
//  - every outbound fetch / http(s) request is counted by host
//  - api.ebay.com is answered by a stub and NEVER sent; titles are built from
//    the query so the real gate keeps them
//  - ebayquota.check/record are replaced in memory: each guarded call is
//    counted by origin (user/background/tooling) and kind; the real quota
//    table is never touched
//  - every database WRITE is swallowed (reads are real): production data,
//    price_history and listing_views included, is untouched
// Counters go to $COSTMETER_OUT (JSON) after every event.
//
//   $env:EBAY_CLIENT_ID='dummy'; $env:EBAY_CLIENT_SECRET='dummy'; $env:PORT='3001'
//   $env:COSTMETER_OUT="$PWD\meter.json"; node -r ./costmeter.js server.js
//   ...exercise the action (curl, the browser at /app, a script with
//   CARDHUNT_API=http://localhost:3001), then read meter.json before/after.
//
// $COSTMETER_CTRL names a JSON file read on every eBay request, so the stub
// ("images": [i.ebayimg.com URLs] gives the stub rows real photos, in turn)
// can be changed between actions without a restart:
//   {"default":{"items":60,"total":60}, "EBAY_US":{"items":2,"total":2},
//    "tokenDelayMs":600, "searchDelayMs":400}
// Use real delays when counting TOKEN exchanges: at 5ms the race that
// multiplies them never opens (measured: 1 exchange at 5ms, 5 at 600ms).
// ══════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const OUT = process.env.COSTMETER_OUT || path.join(ROOT, 'costmeter.out.json');
const CTRL = process.env.COSTMETER_CTRL || path.join(ROOT, 'costmeter.stub.json');

const M = { pid: process.pid, argv: process.argv.slice(1).join(' '),
  hosts: {}, ebayHttp: { total: 0, byPath: {} },
  guarded: { total: 0, byOrigin: {}, byKind: {}, byOriginKind: {} },
  swallowedWrites: 0, swallowedByTable: {} };
function flush() { try { fs.writeFileSync(OUT, JSON.stringify(M, null, 1)); } catch (e) {} }
flush();
function ctrl() { try { return JSON.parse(fs.readFileSync(CTRL, 'utf8')); } catch (e) { return {}; } }

// ── the eBay stub ──────────────────────────────────────────────
function stubEbay(url, init) {
  const u = new URL(url);
  const c = ctrl();
  const hdr = (init && init.headers) || {};
  const mp = hdr['X-EBAY-C-MARKETPLACE-ID'] || 'EBAY_US';
  let body = {};
  if (/oauth2\/token/.test(u.pathname)) body = { access_token: 'stub-token', expires_in: 7200, token_type: 'Application Access Token' };
  else if (/item_summary\/search/.test(u.pathname)) {
    const q = u.searchParams.get('q') || '';
    const offset = +(u.searchParams.get('offset') || 0);
    const limit = +(u.searchParams.get('limit') || 50);
    const per = c[mp] || c.default || { items: 60, total: 60 };
    const total = per.total != null ? per.total : per.items;
    const n = Math.max(0, Math.min(limit, total - offset));
    const title = q.replace(/\s-\S+/g, '').replace(/["()]/g, '').replace(/\s+/g, ' ').trim();
    const cur = { EBAY_GB: 'GBP', EBAY_AU: 'AUD', EBAY_CA: 'CAD', EBAY_DE: 'EUR', EBAY_FR: 'EUR', EBAY_IT: 'EUR', EBAY_ES: 'EUR' }[mp] || 'USD';
    body = { total, offset, limit, itemSummaries: Array.from({ length: n }, (_, i) => ({
      // Numeric, as eBay's are (certcheck.ITEM_ID), and unique per site.
      itemId: `v1|${100000000000 + ['EBAY_US','EBAY_GB','EBAY_AU','EBAY_CA','EBAY_DE','EBAY_FR','EBAY_IT','EBAY_ES'].indexOf(mp) * 1000000 + offset + i}|0`, title,
      price: { value: String(40 + offset + i), currency: cur },
      condition: /PSA|BGS|CGC/.test(q) ? 'Graded' : 'Ungraded',
      itemWebUrl: 'https://www.ebay.com/itm/' + (offset + i),
      // ctrl.images: real i.ebayimg.com photo URLs, used in turn (the stamp
      // check fetches them from eBay's image CDN, which is not the API).
      image: { imageUrl: (Array.isArray(c.images) && c.images.length) ? c.images[(offset + i) % c.images.length] : 'https://i.ebayimg.com/x.jpg' },
      shippingOptions: [{ shippingCost: { value: '4.00', currency: cur } }],
      buyingOptions: ['FIXED_PRICE'], seller: { username: 's' + i }, itemLocation: { country: 'US' }
    })) };
    if (u.searchParams.get('fieldgroups')) body.refinement = { aspectDistributions: [] };
  } else if (/\/item\//.test(u.pathname)) {
    body = { itemId: 'v1|x|0', title: 'stub', image: { imageUrl: 'https://i.ebayimg.com/x.jpg' },
             additionalImages: [], conditionDescriptors: [], localizedAspects: [] };
  }
  M.ebayHttp.total++;
  const key = u.pathname.replace(/\/v1\|.*$/, '/{id}');
  M.ebayHttp.byPath[key] = (M.ebayHttp.byPath[key] || 0) + 1;
  flush();
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const realFetch = global.fetch;
global.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  let host = '?'; try { host = new URL(url).host; } catch (e) {}
  M.hosts[host] = (M.hosts[host] || 0) + 1; flush();
  if (/(^|\.)ebay\.com$/.test(host) && /^api\./.test(host)) {
    const c = ctrl();
    const ms = /oauth2\/token/.test(url) ? (c.tokenDelayMs || 0) : (c.searchDelayMs || 0);
    if (ms) await new Promise(r => setTimeout(r, ms));
    return stubEbay(url, init);
  }
  return realFetch(input, init);
};
for (const modName of ['http', 'https']) {
  const mod = require(modName);
  const orig = mod.request;
  mod.request = function (opts, ...rest) {
    let host = '?';
    try { host = typeof opts === 'string' ? new URL(opts).host : (opts.hostname || opts.host || (opts.href && new URL(opts.href).host) || '?'); } catch (e) {}
    const k = modName + ':' + host;
    M.hosts[k] = (M.hosts[k] || 0) + 1; flush();
    if (/ebay\.com/.test(host)) throw new Error('costmeter: raw ' + modName + ' request to eBay refused (counted)');
    return orig.call(this, opts, ...rest);
  };
}

// ── quota: in memory, counted by origin ────────────────────────
try {
  const quota = require(path.join(ROOT, 'ebayquota.js'));
  quota.check = async (db, opts) => ({ allowed: true, reason: null, limitHit: null, used: 0,
    remaining: 4000, limit: 5000, percentUsed: 0, source: 'costmeter', resetsInMin: 60,
    hour: { used: 0, limit: 600, remaining: 600 }, tooling: { used: 0, allowance: 300, remaining: 300 },
    byOrigin: {}, origin: quota.normOrigin(opts && opts.origin, opts && opts.background), tracked: false });
  quota.record = async (db, opts) => {
    opts = opts || {};
    const o = quota.normOrigin(opts.origin, opts.background), k = opts.kind || 'search';
    const g = M.guarded; g.total++;
    g.byOrigin[o] = (g.byOrigin[o] || 0) + 1;
    g.byKind[k] = (g.byKind[k] || 0) + 1;
    g.byOriginKind[o + ':' + k] = (g.byOriginKind[o + ':' + k] || 0) + 1;
    flush();
  };
} catch (e) { M.quotaPatchError = e.message; flush(); }

// ── database: reads real, writes swallowed ─────────────────────
try {
  // The same pg instance the server resolves, so its prototype is the one patched.
  const pg = require(require.resolve('pg', { paths: [ROOT] }));
  const orig = pg.Client.prototype.query;
  pg.Client.prototype.query = function (q, ...rest) {
    const sql = typeof q === 'string' ? q : (q && q.text) || '';
    const head = sql.replace(/--[^\n]*\n/g, '').trim().slice(0, 12).toUpperCase();
    if (/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/.test(head)) {
      M.swallowedWrites++;
      const t = (sql.match(/(?:INTO|UPDATE|FROM|TABLE(?: IF NOT EXISTS)?)\s+([a-z_]+)/i) || [])[1] || '?';
      M.swallowedByTable[t] = (M.swallowedByTable[t] || 0) + 1; flush();
      const res = { rows: [], rowCount: 0, command: head.split(' ')[0] };
      const cb = rest.find(x => typeof x === 'function');
      if (cb) { process.nextTick(() => cb(null, res)); return; }
      return Promise.resolve(res);
    }
    return orig.call(this, q, ...rest);
  };
} catch (e) { M.pgPatchError = e.message; flush(); }
