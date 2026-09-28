// timing.js — where does a request's time go?  (TASK T1, 2026-09-28)
//
// Behind ?debug=1 only. Per-request, via AsyncLocalStorage, so db.query,
// ebaycall and the gate can record into the request that caused them
// without every function in between carrying a parameter.
//
// Two kinds of number, kept apart because they answer different questions:
//   spans  — [start, end] offsets from request start, wall-clock. Parallel
//            work overlaps; the spans show whether it actually did.
//   totals — summed ms per stage name. The gate runs once per title, so its
//            cost is only visible summed.
//
// Nothing here changes behaviour. With no store active every call is a
// no-op, which is the whole production path.

const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

const now = () => Number(process.hrtime.bigint()) / 1e6;

function run(fn) {
  const store = { t0: now(), spans: [], totals: {} };
  return als.run(store, () => fn(store));
}

const active = () => als.getStore() || null;

// Add ms to a summed stage.
function add(name, ms) {
  const s = als.getStore();
  if (!s) return;
  const t = s.totals[name] || (s.totals[name] = { ms: 0, count: 0 });
  t.ms += ms; t.count++;
}

// Record a wall-clock span and add it to the totals.
function span(name, startAbs, endAbs, extra) {
  const s = als.getStore();
  if (!s) return;
  const e = { name, start: +(startAbs - s.t0).toFixed(1), ms: +(endAbs - startAbs).toFixed(1) };
  if (extra) Object.assign(e, extra);
  s.spans.push(e);
  add(name, endAbs - startAbs);
}

// Time an async function as a span. Returns its result; rethrows its error.
async function time(name, fn, extra) {
  if (!als.getStore()) return fn();
  const a = now();
  try { return await fn(); }
  finally { span(name, a, now(), extra); }
}

// Time a synchronous function into the totals only (no span per call).
function timeSync(name, fn) {
  if (!als.getStore()) return fn();
  const a = now();
  try { return fn(); }
  finally { add(name, now() - a); }
}

function report(store) {
  const totals = {};
  for (const [k, v] of Object.entries(store.totals))
    totals[k] = { ms: +v.ms.toFixed(1), count: v.count };
  return {
    totalMs: +(now() - store.t0).toFixed(1),
    totals,
    spans: store.spans.sort((a, b) => a.start - b.start),
    note: 'spans are wall-clock offsets from request start and may overlap; ' +
          'totals are summed per stage. Only present with ?debug=1.'
  };
}

// Wrap a pg Pool's query so every statement is timed. The label is the
// table the statement is about, which is enough to tell the quota
// bookkeeping from the card lookups.
function instrumentPool(pool) {
  if (!pool || pool.__timed) return pool;
  const orig = pool.query.bind(pool);
  pool.query = function (text, params, cb) {
    if (!als.getStore() || typeof cb === 'function') return orig(text, params, cb);
    const sql = typeof text === 'string' ? text : (text && text.text) || '';
    const label = /ebay_quota/.test(sql) ? 'db:quota'
                : /price_history/.test(sql) ? 'db:prices'
                : /FROM\s+cards/i.test(sql) ? 'db:cards'
                : 'db:other';
    return time(label, () => orig(text, params),
                { sql: sql.replace(/\s+/g, ' ').trim().slice(0, 70) });
  };
  pool.__timed = true;
  return pool;
}

// Wrap the global fetch so EVERY outbound request is a span named by host —
// TCGdex, TCGplayer, pokemontcg.io, Yuyu-tei, eBay. Without it only the
// sources someone thought to instrument show up, and the one nobody
// suspected stays invisible, which is the whole reason to measure.
function instrumentFetch() {
  if (typeof globalThis.fetch !== 'function' || globalThis.fetch.__timed) return;
  const orig = globalThis.fetch;
  const wrapped = function (url, init) {
    if (!als.getStore()) return orig(url, init);
    let host = 'unknown';
    try { host = new URL(String(url && url.url || url)).host; } catch (e) { /* keep unknown */ }
    return time('http:' + host, () => orig(url, init));
  };
  wrapped.__timed = true;
  globalThis.fetch = wrapped;
}

module.exports = { run, active, add, span, time, timeSync, report, instrumentPool, instrumentFetch, now };
