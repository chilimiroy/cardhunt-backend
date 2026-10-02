// ══════════════════════════════════════════════════════════════
// stampcheck.js — does a listing PHOTO show the reprint's commemorative
// stamp?  ON DEMAND ONLY, ZERO eBay API calls.
//
// Why a photo: three measurements say no eBay text field separates a reprint
// from its original — Set says "Celebrations" on 3 of 10 genuine 30th
// Lugias, Year is filled on 38%, and ~12% of 30th listings carry the
// Aquapolis catalogue product id. The people filling those fields do not
// reliably tell the cards apart. The cards themselves do: 30th Celebration
// and Celebrations Classic Collection reprints carry a Pikachu emblem with
// "30" / "25" for cheeks, beside the artwork, that the original never had.
// We are not comparing artwork (a reprint reproduces it); we are looking for
// a mark present on one card and absent on the other.
//
// Measured 2026-10-02 (TASK T1; CLAUDE.md "Stamp detection"):
//   - legible at s-l500 when the card fills the frame; s-l225 loses it on
//     small or angled cards. The row thumbnail is s-l225, so we ask s-l500.
//   - a human sees the stamp on ~97% of reprint photos; slabs are fine.
//   - one template for every card FAILED (it matched any yellow blob, and a
//     Lugia-cut template caught 0 of 57 30th Charizards). A template cut
//     from OUR catalogue scan of each reprint, with its own surrounding
//     artwork, works: at 0.70, 345 of 373 reprint photos (92.5%) across
//     Lugia, Pikachu, Charizard and Rayquaza; 0 of 16 hand-labelled
//     Aquapolis originals flagged, and all 22 flags inside the originals'
//     own listings were stamped reprints on inspection.
//
// What it may claim — the asymmetry is the point:
//   found        a stamp is visible -> this is the reprint. Strong evidence.
//   not-visible  no stamp found. NOT proof of an original: the photo may be
//                cropped, angled, glared or small. Never "verified original".
//   unreadable   no usable photo (fetch failed, not a JPEG, too small).
//
// The photo is eBay's: fetched from eBay's image CDN for one request, never
// stored, and the verdict is held 15 minutes in memory like a cert read.
// The URL is never taken from the caller (SSRF): the server reads it from
// the listing it already served, and only from i.ebayimg.com.
// ══════════════════════════════════════════════════════════════
'use strict';

const THRESHOLD = 0.70;       // measured: 0.66 flags 3 Rayquaza originals, 0.70 none
const PHOTO_SIZE = 's-l500';  // measured: s-l225 too small on small/angled cards
const MIN_SIDE = 150;         // a photo this small cannot show the stamp

// ── Images: { w, h, data: Uint8Array RGB } ──
function fromRGBA(w, h, rgba) {
  const out = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { out[i * 3] = rgba[j]; out[i * 3 + 1] = rgba[j + 1]; out[i * 3 + 2] = rgba[j + 2]; }
  return { w, h, data: out };
}
function decodeJpeg(buf) {
  const jpeg = require('jpeg-js');
  const d = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return fromRGBA(d.width, d.height, d.data);
}
function crop(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 3);
  for (let r = 0; r < h; r++) out.set(img.data.subarray(((y + r) * img.w + x) * 3, ((y + r) * img.w + x + w) * 3), r * w * 3);
  return { w, h, data: out };
}
// A quarter turn clockwise. BREAK and LEGEND cards print sideways, so their
// stamp lies on its side in a portrait scan (30th-c-009/019/020).
function rotate90(img) {
  const w = img.h, h = img.w, out = new Uint8Array(w * h * 3);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + x) * 3, d = (x * w + (w - 1 - y)) * 3;
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2];
  }
  return { w, h, data: out };
}

// Area-average resize (shrinking) / bilinear (growing) — the INTER_AREA the
// measurement used is what keeps a shrunk template's detail honest.
function resize(img, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const out = new Uint8Array(w * h * 3);
  const sx = img.w / w, sy = img.h / h;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < h; y++) {
      const y0 = y * sy, y1 = y0 + sy;
      for (let x = 0; x < w; x++) {
        const x0 = x * sx, x1 = x0 + sx;
        let r = 0, g = 0, b = 0, a = 0;
        for (let yy = Math.floor(y0); yy < Math.min(img.h, Math.ceil(y1)); yy++) {
          const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (let xx = Math.floor(x0); xx < Math.min(img.w, Math.ceil(x1)); xx++) {
            const wgt = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
            const k = (yy * img.w + xx) * 3;
            r += img.data[k] * wgt; g += img.data[k + 1] * wgt; b += img.data[k + 2] * wgt; a += wgt;
          }
        }
        const o = (y * w + x) * 3; out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a;
      }
    }
    return { w, h, data: out };
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(img.h - 1, y0 + 1), dy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(img.w - 1, x0 + 1), dx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const p = (yy, xx) => img.data[(yy * img.w + xx) * 3 + c];
        out[(y * w + x) * 3 + c] = (p(y0, x0) * (1 - dx) + p(y0, x1) * dx) * (1 - dy) + (p(y1, x0) * (1 - dx) + p(y1, x1) * dx) * dy;
      }
    }
  }
  return { w, h, data: out };
}

// ── Normalised cross-correlation, 3 channels (OpenCV's TM_CCOEFF_NORMED) ──
// Best score of template t anywhere in img. Window sums from integral images;
// the cross term is direct, so the caller keeps t small (see bestScore).
// EACH channel's own mean is removed, as OpenCV does — one mean across all
// three let a plain yellow border score like the stamp (two Aquapolis
// originals at 0.77 that OpenCV scores 0.61; caught by the cross-check).
// stride > 1 scans a coarse grid; the caller refines around the best.
function nccMax(img, t, stride, region) {
  const W = img.w, H = img.h, w = t.w, h = t.h, m = w * h, n = m * 3;
  if (w > W || h > H) return { score: -1, x: 0, y: 0 };
  const tz = new Float32Array(n), tmean = [0, 0, 0];
  for (let i = 0; i < n; i++) tmean[i % 3] += t.data[i];
  for (let c = 0; c < 3; c++) tmean[c] /= m;
  let tss = 0;
  for (let i = 0; i < n; i++) { tz[i] = t.data[i] - tmean[i % 3]; tss += tz[i] * tz[i]; }
  if (tss < 1e-6) return { score: -1, x: 0, y: 0 };
  // Integral images per channel of the sum, and of the squared sum.
  const W1 = W + 1, S = [0, 1, 2].map(() => new Float64Array(W1 * (H + 1))), Q = new Float64Array(W1 * (H + 1));
  for (let y = 0; y < H; y++) {
    const rs = [0, 0, 0]; let rq = 0;
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3, o = (y + 1) * W1 + x + 1, u = y * W1 + x + 1;
      for (let c = 0; c < 3; c++) { const v = img.data[k + c]; rs[c] += v; rq += v * v; S[c][o] = S[c][u] + rs[c]; }
      Q[o] = Q[u] + rq;
    }
  }
  const D = img.data, row = w * 3, st = stride || 1;
  const x0 = region ? Math.max(0, region.x0) : 0, x1 = region ? Math.min(W - w, region.x1) : W - w;
  const y0 = region ? Math.max(0, region.y0) : 0, y1 = region ? Math.min(H - h, region.y1) : H - h;
  let best = -1, bx = 0, by = 0;
  for (let y = y0; y <= y1; y += st) {
    const a = y * W1, b = (y + h) * W1;
    for (let x = x0; x <= x1; x += st) {
      let v = Q[b + x + w] - Q[a + x + w] - Q[b + x] + Q[a + x];
      for (let c = 0; c < 3; c++) { const A = S[c], s = A[b + x + w] - A[a + x + w] - A[b + x] + A[a + x]; v -= s * s / m; }
      if (v < 1e-6) continue;
      let cross = 0;
      for (let r = 0; r < h; r++) {
        const base = ((y + r) * W + x) * 3, tb = r * row;
        for (let i = 0; i < row; i++) cross += tz[tb + i] * D[base + i];
      }
      const scv = cross / Math.sqrt(tss * v);
      if (scv > best) { best = scv; bx = x; by = y; }
    }
  }
  return { score: best, x: bx, y: by };
}

// Search scales from a 14px-wide stamp to a third of the photo, as measured.
// Each scale runs on a copy of the photo shrunk so the template is at most
// MAX_TW wide: the cost per scale stays bounded, and a stamp that is 120px
// in the photo is compared at 20px. Chosen on ten labelled photos against
// the OpenCV measurement (2026-10-02, this machine): 32/18 steps 4.3 s a
// photo, 24/14 1.9 s, 20/14 1.2 s — scores within ~0.03 of OpenCV's at each.
const MAX_TW = 20, STEPS = 14, LO_TW = 14;
// What judge() runs with (TASK T1, 2026-10-02 — re-measured on all 906
// photos, PROGRESS.md). Real stamps in an s-l500 photo are 36-88 px wide
// (OpenCV, 368 found; 2 under 30), so scales start at 28 px rather than 14:
// the small scales cost the most (they run at full resolution) and found
// almost nothing but the originals' highest false scores — the card back
// o81 scored 0.709 at the old settings. Largest scale first, stopping at the
// first score over the threshold, so a reprint ends early; an original
// still sweeps every scale. ~4.7x faster on this machine.
const MATCH = { lo: 28, steps: 10, desc: true, stopAt: THRESHOLD };
function bestScore(photo, template, opts) {
  const o = Object.assign({ maxTw: MAX_TW, steps: STEPS, stride: 2, lo: LO_TW, stopAt: Infinity }, opts || {});
  const lo = o.lo, hi = Math.max(lo + 2, photo.w * 0.32);
  let best = { score: -1 };
  const shrunk = new Map();
  for (let n = 0; n < o.steps; n++) {
    if (best.score >= o.stopAt) break;
    const i = o.desc ? o.steps - 1 - n : n;
    const tw = lo * Math.pow(hi / lo, i / (o.steps - 1));
    const f = Math.max(1, tw / o.maxTw);
    const key = Math.round(f * 4) / 4;            // share shrunk photos between nearby scales
    let im = shrunk.get(key);
    if (!im) shrunk.set(key, im = key === 1 ? photo : resize(photo, photo.w / key, photo.h / key));
    const t = resize(template, tw / key, (tw / key) * template.h / template.w);
    if (t.h < 6 || t.w >= im.w || t.h >= im.h) continue;
    // Coarse grid, then every position around the best of it.
    let r = nccMax(im, t, o.stride);
    if (o.stride > 1) r = nccMax(im, t, 1, { x0: r.x - o.stride, x1: r.x + o.stride, y0: r.y - o.stride, y1: r.y + o.stride });
    if (r.score > best.score) best = { score: r.score, tw: Math.round(tw), x: Math.round(r.x * key), y: Math.round(r.y * key) };
  }
  return best;
}

// Templates: { [reprintCardId]: { w, h, rgb (base64), family, label, ... } }
// built by stampbuild.js from our own catalogue scans, never a seller photo.
let _templates = null;
function templates() {
  if (_templates) return _templates;
  try { _templates = require('./stamps.json'); } catch (e) { _templates = { templates: {} }; }
  return _templates;
}
function templateImage(entry) {
  if (!entry._img) entry._img = { w: entry.w, h: entry.h, data: new Uint8Array(Buffer.from(entry.rgb, 'base64')) };
  return entry._img;
}

// The verdict for one decoded photo against every reprint of the card.
// reprints: [{ cardId: 'en-30th-c-029', family: {label} }] (cardmatch.reprintCardsOf)
function judge(photo, reprints, opts) {
  opts = opts || MATCH;
  const T = templates().templates || {};
  if (!photo || photo.w < MIN_SIDE || photo.h < MIN_SIDE)
    return { state: 'unreadable', says: 'The photo is too small to show the stamp.', scores: [] };
  const scores = [];
  for (const rc of reprints) {
    const e = T[rc.cardId];
    if (!e) { scores.push({ reprint: rc.cardId, label: rc.family && rc.family.label, checked: false, why: 'no stamp template built for this reprint' }); continue; }
    let b = bestScore(photo, templateImage(e), opts);
    // A sideways-printed card is photographed either way up: its stamp is
    // also tried a quarter turn round (the template is stored upright).
    if (e.sideways) {
      if (!e._rot) e._rot = rotate90(templateImage(e));
      const r = bestScore(photo, e._rot, opts);
      if (r.score > b.score) b = r;
    }
    scores.push({ reprint: rc.cardId, label: e.label || (rc.family && rc.family.label), checked: true,
                  score: +b.score.toFixed(3), at: b.score > 0 ? { x: b.x, y: b.y, w: b.tw } : null });
  }
  const checked = scores.filter(s => s.checked);
  if (!checked.length) return { state: 'unchecked', says: 'No stamp template exists for this card\'s reprint yet.', scores };
  const top = checked.slice().sort((a, b) => b.score - a.score)[0];
  if (top.score >= THRESHOLD) return { state: 'found', reprint: top.reprint, label: top.label,
    says: `A ${top.label} commemorative stamp is visible in the seller's photo — this listing looks like the reprint, not this card.`, scores };
  return { state: 'not-visible',
    says: 'No reprint stamp visible in the seller\'s photo. That is not proof it is the original — the photo may be cropped, angled, glared or too small.', scores };
}

// eBay's image CDN only, at the measured size. Returns null for anything else.
function photoUrl(imageUrl) {
  let u;
  try { u = new URL(String(imageUrl || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'i.ebayimg.com') return null;
  if (!/\/s-l\d+\.(?:jpg|jpeg|webp|png)$/i.test(u.pathname)) return null;
  u.pathname = u.pathname.replace(/\/s-l\d+\.(?:jpg|jpeg|webp|png)$/i, '/' + PHOTO_SIZE + '.jpg');
  return u.toString();
}

// ── The verdict, kept by eBay item id (TASK T1, 2026-10-02) ──
// A listing's photo does not change under the same URL, so the first viewer
// of a card pays for the check and everyone after reads the answer. Keyed
// on the ITEM (a listing under several searches is checked once), and the
// photo URL is held beside it: a seller who changes the photo changes the
// URL, and the item is checked again. In memory only — the verdict is ours,
// a few bytes; the photo itself is never kept. A Render restart forgets it.
// A failure worth retrying (the CDN did not answer, the check timed out) is
// held 2 minutes, so a view says "unreadable" instead of waiting forever,
// and the next view after that asks again.
const TTL_MS = 7 * 24 * 3600 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const CACHE_MAX = 20000;
const _cache = new Map();
function cacheGet(itemId, url) {
  const e = _cache.get(itemId);
  if (!e) return null;
  if (url && e.url && e.url !== url) { _cache.delete(itemId); return null; }
  if (Date.now() - e.at > (e.verdict.retryable ? RETRY_MS : TTL_MS)) { _cache.delete(itemId); return null; }
  return e;
}
function cacheSet(itemId, verdict, url) {
  _cache.delete(itemId);
  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
  _cache.set(itemId, { at: Date.now(), url: url || null, verdict });
}

// ── One pool of long-lived workers, a queue in front (TASK T1) ──
// Measured on Render 2026-10-02: one check took 4.2-5.9 s there (~1.2 s
// here), and eight at once, one worker each, ALL ran past 20 s and were
// stopped. Render's CPU is a fraction of a core: parallel workers only share
// it. So STAMP_WORKERS workers (default 1), started once, fed one photo at a
// time, and every caller of one item waits on the same job.
const POOL_SIZE = Math.max(1, parseInt(process.env.STAMP_WORKERS, 10) || 1);
const JOB_TIMEOUT_MS = 30000;
const FETCH_TIMEOUT_MS = 8000;
const _queue = [];               // { itemId, url, reprints, resolve }
const _inflight = new Map();     // itemId -> Promise<verdict>
const _workers = [];             // { w, job, timer }
let _fetch = (...a) => fetch(...a);
const _stats = { checked: 0, failed: 0, msTotal: 0, cacheHits: 0 };

function spawnWorker() {
  const { Worker } = require('worker_threads');
  // execArgv: []: a worker needs no preload (under costmeter, an inherited
  // -r preload overwrote the meter from every worker).
  const slot = { w: new Worker(__filename, { workerData: { pool: true }, execArgv: [] }), job: null, timer: null };
  slot.w.on('message', m => finish(slot, m.verdict));
  slot.w.on('error', e => finish(slot, { state: 'unreadable', retryable: true, scores: [],
    says: 'The photo check failed: ' + String(e && e.message || e).slice(0, 80) }, true));
  slot.w.on('exit', () => {
    const i = _workers.indexOf(slot); if (i >= 0) _workers.splice(i, 1);
    if (slot.job) finish(slot, { state: 'unreadable', retryable: true, says: 'The photo check stopped.', scores: [] });
  });
  // After the listeners: attaching a message listener re-refs the port, and
  // an idle pool must never keep a script (or a test) alive.
  slot.w.unref();
  _workers.push(slot);
  return slot;
}
function finish(slot, verdict, kill) {
  const job = slot.job;
  clearTimeout(slot.timer); slot.timer = null; slot.job = null;
  if (kill) { const i = _workers.indexOf(slot); if (i >= 0) _workers.splice(i, 1); slot.w.terminate().catch(() => {}); }
  if (job) {
    const v = Object.assign({}, verdict, { tookMs: Date.now() - job.t0 });
    if (v.retryable) _stats.failed++; else { _stats.checked++; _stats.msTotal += v.tookMs; }
    cacheSet(job.itemId, v, job.url);
    _inflight.delete(job.itemId);
    job.resolve(v);
  }
  pump();
}
async function runJob(slot, job) {
  job.t0 = Date.now();
  let r = null;
  try { r = await _fetch(job.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); } catch (e) { r = null; }
  const type = (r && r.headers && r.headers.get('content-type')) || '';
  if (!r || !r.ok) return finish(slot, { state: 'unreadable', retryable: true, scores: [],
    says: 'eBay’s image server did not return the photo' + (r ? ' (HTTP ' + r.status + ')' : '') + '.' });
  if (!/jpe?g/i.test(type)) return finish(slot, { state: 'unreadable', scores: [], says: 'The photo is not a JPEG (' + type.slice(0, 30) + ').' });
  const buf = Buffer.from(await r.arrayBuffer());
  slot.timer = setTimeout(() => finish(slot, { state: 'unreadable', retryable: true, scores: [],
    says: 'The photo check took too long and was stopped.' }, true), JOB_TIMEOUT_MS);
  slot.w.postMessage({ jpeg: buf, reprints: job.reprints });
}
function pump() {
  while (_queue.length) {
    let slot = _workers.find(s => !s.job);
    if (!slot && _workers.length < POOL_SIZE) slot = spawnWorker();
    if (!slot) return;
    const job = _queue.shift();
    slot.job = job;
    runJob(slot, job).catch(e => finish(slot, { state: 'unreadable', retryable: true, scores: [],
      says: 'The photo check failed: ' + String(e && e.message || e).slice(0, 80) }));
  }
}

// The one way to check an item: the cache, else the job already running,
// else a new job at the back of the queue. Never rejects; zero eBay calls.
function checkItem(itemId, imageUrl, reprints) {
  const url = photoUrl(imageUrl);
  if (!url) return Promise.resolve({ state: 'unreadable', says: 'The listing has no eBay photo to check.', scores: [] });
  const hit = cacheGet(itemId, url);
  if (hit) { _stats.cacheHits++; return Promise.resolve(Object.assign({}, hit.verdict, { cached: true })); }
  if (_inflight.has(itemId)) return _inflight.get(itemId);
  const p = new Promise(resolve => _queue.push({ itemId, url, reprints, resolve }));
  _inflight.set(itemId, p);
  pump();
  return p;
}
function poolState() {
  return { workers: POOL_SIZE, running: _workers.filter(s => s.job).length, queued: _queue.length,
           cachedItems: _cache.size, checked: _stats.checked, failed: _stats.failed, cacheHits: _stats.cacheHits,
           meanMs: _stats.checked ? Math.round(_stats.msTotal / _stats.checked) : null };
}

// ── The gate: after the text gates, before display (TASK T1) ──
// rows: listings that passed cardmatch. Only eBay rows are photographed.
// A stamp FOUND refuses the row, counted and named like any other refusal.
// NOT VISIBLE and UNREADABLE keep it: absence of a stamp is weak evidence
// (cropped, angled, glared; 2 of 86 Aquapolis photos showed no stamp area).
// An item not yet checked is kept and marked pending, and handed back so
// the caller can check it. Nothing here waits.
function gate(rows, reprints) {
  const T = templates().templates || {};
  const usable = (reprints || []).filter(r => T[r.cardId]);
  const report = { applied: false, ebayCalls: 0, checked: 0, refused: 0, notVisible: 0, unreadable: 0,
    pending: 0, refusedSample: [], threshold: THRESHOLD,
    reprints: (reprints || []).map(r => ({ cardId: r.cardId, template: !!T[r.cardId],
      label: (T[r.cardId] && T[r.cardId].label) || (r.family && r.family.label) || r.cardId })) };
  if (!usable.length) {
    report.reason = reprints && reprints.length ? 'no stamp template built for this card’s reprint' : 'no known reprint';
    return { listings: rows, report, pending: [] };
  }
  report.applied = true;
  const out = [], pending = [];
  for (const row of rows) {
    if (!row || row.source !== 'ebay' || !row.itemId) { out.push(row); continue; }
    const url = photoUrl(row.imageUrl);
    if (!url) { report.unreadable++; out.push(Object.assign({}, row, { stamp: { state: 'unreadable', says: 'No eBay photo to check.' } })); continue; }
    const hit = cacheGet(row.itemId, url);
    if (!hit) { report.pending++; pending.push(row); out.push(Object.assign({}, row, { stamp: { state: 'pending' } })); continue; }
    const v = hit.verdict;
    if (v.state === 'found') {
      report.checked++; report.refused++;
      if (report.refusedSample.length < 12) report.refusedSample.push({ title: row.title, itemId: row.itemId,
        price: row.price, url: row.url, imageUrl: row.imageUrl, reprint: v.reprint, label: v.label,
        reason: 'photo shows the ' + (v.label || 'reprint') + ' stamp' });
      continue;
    }
    if (v.state === 'not-visible') { report.checked++; report.notVisible++; }
    else report.unreadable++;
    out.push(Object.assign({}, row, { stamp: { state: v.state, says: v.says, retryable: !!v.retryable } }));
  }
  report.summary = report.refused + ' refused (the seller’s photo shows a reprint’s stamp), '
    + report.notVisible + ' no stamp visible, ' + report.unreadable + ' unreadable'
    + (report.pending ? ', ' + report.pending + ' still being checked' : '');
  return { listings: out, report, pending };
}

// Worker side: long-lived, one photo per message.
const wt = (() => { try { return require('worker_threads'); } catch (e) { return {}; } })();
if (!wt.isMainThread && wt.workerData && wt.workerData.pool) {
  wt.parentPort.on('message', m => {
    let v;
    try { v = judge(decodeJpeg(Buffer.from(m.jpeg)), m.reprints); }
    catch (e) { v = { state: 'unreadable', says: 'The photo could not be decoded: ' + String(e && e.message || e).slice(0, 80), scores: [] }; }
    wt.parentPort.postMessage({ verdict: v });
  });
}

module.exports = { THRESHOLD, PHOTO_SIZE, MIN_SIDE, MATCH, decodeJpeg, crop, resize, rotate90, nccMax, bestScore,
                   judge, checkItem, gate, poolState, photoUrl, templates, cacheGet, cacheSet, TTL_MS, RETRY_MS,
                   _setTemplates: t => { _templates = t; }, _setFetch: f => { _fetch = f; },
                   _clearCache: () => _cache.clear() };
