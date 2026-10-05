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
// stored. The VERDICT is ours and permanent (TASK T2, 2026-10-03): kept in
// memory and in the database, keyed on a hash of the eBay item id — see
// "Verdicts in the database" below.
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

// ── Lookalikes: which of TWO cards does the photo match better? ──
// (T1, 2026-10-04; cardmatch.LOOKALIKES.) Every earlier photo measurement
// asked "does this match card X?" against one absolute threshold and failed
// at the floor: a glared genuine card scored 0.36, a wrong illustration
// 0.31. Where we hold both cards' scans, ask which side wins instead — a
// badly shot genuine card scores low against both, but higher against its
// own. The whole card, swept over 30-98% of the photo width, compared at a
// 24 px template (the measurement's settings, art.js). The other card wins
// only by LOOKALIKE_MARGIN; anything closer is undecided and keeps the row.
// Measured, bubble Mew vs 30th Mew, 457 photos labelled by eye: the hardest
// genuine photo (a glared raw card) sat at -0.254; at 0.30, 0 of 276 genuine
// refused, 163 of 178 of the other card refused.
const LOOKALIKE_MARGIN = 0.30;
const WHOLE = { maxTw: 24, steps: 8, lo: 0.3, hi: 0.98 };
function wholeScore(photo, t) {
  let best = -1;
  for (let i = 0; i < WHOLE.steps; i++) {
    const tw = photo.w * WHOLE.lo * Math.pow(WHOLE.hi / WHOLE.lo, i / (WHOLE.steps - 1));
    const f = Math.max(1, tw / WHOLE.maxTw);
    const im = f === 1 ? photo : resize(photo, photo.w / f, photo.h / f);
    const tt = resize(t, tw / f, (tw / f) * t.h / t.w);
    if (tt.w >= im.w || tt.h >= im.h || tt.h < 6) continue;
    let r = nccMax(im, tt, 2);
    r = nccMax(im, tt, 1, { x0: r.x - 2, x1: r.x + 2, y0: r.y - 2, y1: r.y + 2 });
    if (r.score > best) best = r.score;
  }
  return best;
}
// ── Same-name siblings (T1, 2026-10-04) ──
// Alakazam EX #125/124 (gold secret) showed #117/124 (full art) and #25/124
// listings: every title stated 125/124 — the seller typed (or eBay's catalogue
// wrote) the number of the dearer card over a photo of the cheaper one. No
// title gate can see that. Every other card of the same name in the same set
// is compared like a lookalike pair, from OUR scans, built at runtime by the
// server (check.wholes) rather than shipped in stamps.json — there are 6,891
// such English cards. Measured on 1,478 photos of six groups (Alakazam EX
// xy10, Umbreon VMAX swsh7, Charizard ex sv03.5, Giratina V swsh11, Raichu
// sv02), every row with margin >= 0.10 looked at: 11 true swaps at 0.267-
// 0.524, the hardest genuine photo (a Charizard ex 183 that prefers the 199
// SIR) at 0.307. At 0.40: 7 of 11 refused, 0 genuine. A REDUCTION, not a
// solve — and siblings only: a fan-art card, another set's card or a foreign
// copy matches neither scan and stays (it is the price check's, or nobody's).
// Same artwork in another foil (rainbow / gold of one illustration) is a
// near-tie by construction: undecided, kept.
const SIBLING_MARGIN = 0.40;
function wholeImage(id, check) {
  const e = (check && check.wholes && check.wholes[id]) || (templates().wholes || {})[id];
  return e ? templateImage(e) : null;
}
const isLookalike = c => c && (c.kind === 'lookalike' || c.kind === 'sibling');
const isSibling = c => c && c.kind === 'sibling';
const lookalikeReady = c => isLookalike(c) && !!wholeImage(c.cardId, c) && !!wholeImage(c.ours, c);

// The verdict for one decoded photo against every photo check of the card.
// checks: [{ cardId: 'en-30th-c-029', family: {label} }] (cardmatch.reprintCardsOf)
//   and   [{ cardId, kind: 'lookalike', ours, label }]   (cardmatch.lookalikesOf)
function judge(photo, checks, opts) {
  opts = opts || MATCH;
  const T = templates().templates || {};
  if (!photo || photo.w < MIN_SIDE || photo.h < MIN_SIDE)
    return { state: 'unreadable', says: 'The photo is too small to judge.', scores: [] };
  const reprints = (checks || []).filter(c => !isLookalike(c));
  const scores = [];
  // Comparative first: a lookalike found is as strong as a stamp found.
  for (const lc of (checks || []).filter(isLookalike)) {
    if (!lookalikeReady(lc)) { scores.push({ lookalike: lc.cardId, checked: false, why: 'no whole-card template for this pair' }); continue; }
    const ours = wholeScore(photo, wholeImage(lc.ours, lc)), other = wholeScore(photo, wholeImage(lc.cardId, lc));
    const margin = +(other - ours).toFixed(3);
    scores.push({ lookalike: lc.cardId, label: lc.label, checked: true, ours: +ours.toFixed(3), other: +other.toFixed(3), margin });
    if (margin >= (isSibling(lc) ? SIBLING_MARGIN : LOOKALIKE_MARGIN)) return { state: 'found', kind: 'lookalike', reprint: lc.cardId, label: lc.label,
      says: `The seller's photo matches ${lc.label} better than this card — a different card listed under this one.`, scores };
  }
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
  const checked = scores.filter(s => s.checked && s.reprint);
  const compared = scores.some(s => s.checked && s.lookalike);
  if (!checked.length && !compared) return { state: 'unchecked', says: 'No stamp template exists for this card\'s reprint yet.', scores };
  const top = checked.slice().sort((a, b) => b.score - a.score)[0];
  if (top && top.score >= THRESHOLD) return { state: 'found', reprint: top.reprint, label: top.label,
    says: `A ${top.label} commemorative stamp is visible in the seller's photo — this listing looks like the reprint, not this card.`, scores };
  // Weak evidence either way: neither a stamp nor a clearer match to the
  // other card. Never "verified".
  return { state: 'not-visible',
    says: checked.length
      ? 'No reprint stamp visible in the seller\'s photo. That is not proof it is the original — the photo may be cropped, angled, glared or too small.'
      : 'The seller\'s photo does not clearly match the other card. That is not proof it is this one — the photo may be cropped, angled, glared or too small.', scores };
}

// eBay's image CDN only, at the measured size. Returns null for anything else.
function photoUrl(imageUrl, size) {
  let u;
  try { u = new URL(String(imageUrl || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'i.ebayimg.com') return null;
  if (!/\/s-l\d+\.(?:jpg|jpeg|webp|png)$/i.test(u.pathname)) return null;
  u.pathname = u.pathname.replace(/\/s-l\d+\.(?:jpg|jpeg|webp|png)$/i, '/' + (size || PHOTO_SIZE) + '.jpg');
  return u.toString();
}

// ── The verdict, kept by eBay item id (TASK T1, 2026-10-02) ──
// A listing's photo does not change under the same URL, so the first viewer
// of a card pays for the check and everyone after reads the answer. Keyed
// on the ITEM (a listing under several searches is checked once), and the
// photo URL is held beside it: a seller who changes the photo changes the
// URL, and the item is checked again. In memory here, and in the database
// (setStore, below) so a Render restart forgets nothing; the photo itself
// is never kept.
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
    // A back photo's scores are an input to backcheck's LISTING verdict,
    // which the server stores itself (check_kind 'back').
    // A material profile is stored by the server (check_kind 'material').
    if (!v.retryable && !job.back && !job.material) saveVerdict(job.itemId, job.url, v, job.cardId);
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
  slot.w.postMessage({ jpeg: buf, reprints: job.reprints, back: !!job.back, material: !!job.material });
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
// A stamp verdict belongs to the PHOTO (a stamp is a stamp under any card's
// search), so it is keyed on the item. A lookalike verdict belongs to the
// photo AND the card viewed — the same 30th Mew photo is the wrong card
// under Paldean Fates and the right one under 30th Celebration — so it is
// keyed on both (T1, 2026-10-04). Stamp-only keys are unchanged, so every
// stored stamp verdict still reads.
function verdictKey(itemId, checks) {
  const lc = (checks || []).find(isLookalike);
  // '+s': the verdict includes the sibling comparison. A verdict made before
  // siblings existed (bubble Mew's pair alone) is not that answer.
  return lc ? itemId + '@' + lc.ours + ((checks || []).some(isSibling) ? '+s' : '') : itemId;
}
function checkItem(itemId, imageUrl, reprints, cardId) {
  const url = photoUrl(imageUrl);
  if (!url) return Promise.resolve({ state: 'unreadable', says: 'The listing has no eBay photo to check.', scores: [] });
  itemId = verdictKey(itemId, reprints);
  const hit = cacheGet(itemId, url);
  if (hit) { _stats.cacheHits++; return Promise.resolve(Object.assign({}, hit.verdict, { cached: true })); }
  if (_inflight.has(itemId)) return _inflight.get(itemId);
  const p = new Promise(resolve => _queue.push({ itemId, url, reprints, cardId: cardId || null, resolve }));
  _inflight.set(itemId, p);
  pump();
  return p;
}
// One back photo, scored against each language family's back (backcheck.js,
// TASK T3) — through the same queue and pool, so a busy card cannot start a
// second set of workers. Keyed on the photo; zero eBay API calls (the URL
// came from the listing's getItem, the photo from eBay's image CDN).
function checkBackPhoto(imageUrl) {
  const url = photoUrl(imageUrl);
  if (!url) return Promise.resolve({ state: 'unreadable', en: null, ja: null, seen: null });
  const key = 'back|' + url;
  const hit = cacheGet(key, url);
  if (hit) return Promise.resolve(hit.verdict);
  if (_inflight.has(key)) return _inflight.get(key);
  const p = new Promise(resolve => _queue.push({ itemId: key, url, reprints: [], back: true, resolve }));
  _inflight.set(key, p);
  pump();
  return p;
}
// ── Gold and black novelty cards (TASK T1, 2026-10-05) ──
// Mass-produced gold / black / silver metal copies of popular cards, titled
// like the real card. Measured 2026-10-04 on 378 rows labelled by eye
// (Shining Charizard 106, Magikarp & Wailord GX 57, Mewtwo ☆ 87, gold Mew ex
// 118 as the genuine-gold control; PROGRESS 2026-10-05):
//   * the photo's colour against OUR scan of the same card — never against a
//     fixed colour: a Gold Star, an SV gold hyper rare and a black full art
//     are real. Gold fraction of the centre 60%, photo minus scan.
//   * a repeated photo across cards carries nothing here: 19,054 photos, the
//     only template reused under 3+ cards was already refused by its title,
//     and at Hamming 4 genuine cards of different sets collide. Not built.
// Signals: COLOUR (gold excess > MATERIAL_GOLD_EXCESS), PRICE (the outlier
// flag), METAL PHOTO (another of the seller's photos, not a genuine back, is
// gold- or black-dominated beyond the scan — from the back check's getItem).
// Two refuse, one flags; a genuine back seen never lets them refuse.
// Threshold: above the hardest genuine photo, not at it. 0.30 refused a
// genuine $3,111 Shining Charizard; 0.35 a genuine Charizard ex 199 SIR
// (warm sunset art in warm light, excess 0.352) on the 12-card run. At 0.40:
// 51 of 95 labelled metal refused, 22 flagged; 0 of 195 genuine refused, 6
// flagged; 12 cards / 1,990 shown rows: 68 refused, every one looked at —
// 66 metal, 2 other cards, 0 genuine.
const MATERIAL_VERSION = 'material-1';
const MATERIAL_GOLD_EXCESS = 0.40;
const MATERIAL_PHOTO_SIZE = 's-l225';   // the size the measurement used
const SCAN_HOST = /^https:\/\/assets\.tcgdex\.net\/[^?#]+\.jpg$/;
// Centre 60% of the frame (backgrounds and sleeves stay out). HSV gold:
// hue 30-65°, s > 0.25, v > 0.35; near-black: v < 0.22.
function colourProfile(img) {
  const x0 = Math.round(img.w * 0.2), y0 = Math.round(img.h * 0.2), w = Math.round(img.w * 0.6), h = Math.round(img.h * 0.6);
  let gold = 0, black = 0, n = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * img.w + x) * 3, r = img.data[i] / 255, g = img.data[i + 1] / 255, b = img.data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    let hu = 0;
    if (mx !== mn) {
      if (mx === r) hu = 60 * (((g - b) / (mx - mn)) % 6);
      else if (mx === g) hu = 60 * ((b - r) / (mx - mn) + 2);
      else hu = 60 * ((r - g) / (mx - mn) + 4);
    }
    if (hu < 0) hu += 360;
    if (hu >= 30 && hu <= 65 && s > 0.25 && mx > 0.35) gold++;
    if (mx < 0.22) black++;
    n++;
  }
  return { gold: n ? +(gold / n).toFixed(3) : 0, black: n ? +(black / n).toFixed(3) : 0 };
}
function queueMaterial(key, url) {
  const hit = cacheGet(key, url);
  if (hit) return Promise.resolve(hit.verdict);
  if (_inflight.has(key)) return _inflight.get(key);
  // Front of the queue: a colour profile costs milliseconds, and must not
  // wait behind a page of stamp comparisons.
  const p = new Promise(resolve => _queue.unshift({ itemId: key, url, reprints: [], material: true, resolve }));
  _inflight.set(key, p);
  pump();
  return p;
}
// A listing's primary photo (eBay's CDN only). Zero eBay API calls.
function checkMaterialPhoto(imageUrl) {
  const url = photoUrl(imageUrl, MATERIAL_PHOTO_SIZE);
  if (!url) return Promise.resolve({ state: 'unreadable' });
  return queueMaterial('mat|' + url, url);
}
// OUR scan of the card (TCGdex's .jpg only).
function checkMaterialScan(url) {
  if (!SCAN_HOST.test(String(url || ''))) return Promise.resolve({ state: 'unreadable' });
  return queueMaterial('scan|' + url, url);
}
// Is another of the seller's photos (not the first, not a genuine back of
// either family) gold- or black-dominated beyond our scan? backScores: the
// back check's per-photo results, which carry colourProfile since T1.
function metalPhotoOf(backScores, ref) {
  if (!ref || !Array.isArray(backScores)) return false;
  return backScores.slice(1).some(x => x && x.gold != null && !x.seen &&
    (x.gold - ref.gold > MATERIAL_GOLD_EXCESS || x.black - ref.black > MATERIAL_GOLD_EXCESS));
}
// The decision for one row. profile: the listing photo's colourProfile;
// ref: our scan's; priceFlag: the outlier check flagged it; back: the stored
// back verdict ({ state, metal }) or null. Returns { action, signals }.
//   action 'refuse' — two signals and no genuine back seen
//   action 'flag'   — one signal (or two with a genuine back seen)
//   action 'none'
function materialJudge({ profile, ref, priceFlag, back }) {
  const signals = [];
  if (profile && ref && profile.gold != null && profile.gold - ref.gold > MATERIAL_GOLD_EXCESS)
    signals.push('photo far more gold than this card');
  if (priceFlag) signals.push('priced far below this card');
  if (back && back.metal) signals.push('another photo is gold/black metal');
  const genuineBack = !!(back && back.state === 'genuine-back');
  const action = signals.length >= 2 && !genuineBack ? 'refuse' : signals.length ? 'flag' : 'none';
  return { action, signals, genuineBack };
}

function poolState() {
  return { store: _store ? Object.assign({ version: VERDICT_VERSION }, _storeStats) : null, workers: POOL_SIZE, running: _workers.filter(s => s.job).length, queued: _queue.length,
           cachedItems: _cache.size, checked: _stats.checked, failed: _stats.failed, cacheHits: _stats.cacheHits,
           meanMs: _stats.checked ? Math.round(_stats.msTotal / _stats.checked) : null };
}

// ── Verdicts in the database (TASK T2, 2026-10-03) ──
// A listing's photo does not change under its URL, so a verdict is a
// permanent fact — and in memory alone every deploy forgot all of them: the
// first viewer after a restart saw rows appear and then vanish. The server
// hands in a store (setStore); every definite verdict (found, not visible,
// unreadable for a reason that will not change) is written once, and a view
// reads the verdicts it lacks in ONE query before the gate runs. A
// retryable failure is never written.
// What is stored is ours: a sha256 of the eBay item id and of the photo URL
// (a changed photo is a new key, checked again), our card id, our verdict.
// No title, price, URL or photo — no eBay data (the eBay caching lesson).
// VERDICT_VERSION names the matcher that produced a verdict. Change it when
// a template, the threshold or MATCH changes: older rows are then ignored
// and those photos are checked again.
// stamp-2 (2026-10-05): two cross-set lookalike pairs added (Mewtwo ☆ /
// Evolutions Mewtwo, Dragonite ex / Evolutions Dragonite-EX). A verdict made
// without them is not their answer — and Evolutions Dragonite-EX has a
// same-name sibling, whose '+s' key would otherwise reuse the old verdicts.
// Costs no eBay call: every photo is re-read from eBay's CDN.
const VERDICT_VERSION = 'stamp-2';
const MISS_MS = 60 * 1000;          // an item the store lacks is not asked about again for a minute
const LOAD_TIMEOUT_MS = 2500;
const _missed = new Map();          // itemId -> when the store last answered "none"
let _store = null;                  // { load(itemKeys, version) -> [{itemKey, photoKey, state, ...}], save(row) }
const _hash = (s, n) => require('crypto').createHash('sha256').update(String(s)).digest('hex').slice(0, n);
const itemKey = itemId => _hash(itemId, 32);
const photoKey = url => _hash(url, 16);
const _storeStats = { loaded: 0, saved: 0, saveFailed: 0, loadFailed: 0 };
function setStore(s) { _store = s || null; _missed.clear(); }
function saveVerdict(itemId, url, v, cardId) {
  if (!_store) return;
  const scored = (v.scores || []).filter(x => x.checked).map(x => x.score);
  Promise.resolve().then(() => _store.save({ itemKey: itemKey(itemId), photoKey: photoKey(url), version: VERDICT_VERSION,
    cardId: cardId || null, state: v.state, reprint: v.reprint || null, label: v.label || null, says: v.says || null,
    score: scored.length ? Math.max(...scored) : null }))
    .then(() => { _storeStats.saved++; },
          e => { _storeStats.saveFailed++; console.warn('[stamp] verdict not stored: ' + (e && e.message)); });
}
// Before the gate: fill the memory cache from the store for every eBay row
// it lacks, in one query. Bounded: a slow database leaves those rows
// unchecked (hidden, then checked again) rather than holding the answer.
async function loadVerdicts(rows, checks) {
  if (!_store) return { asked: 0, found: 0 };
  const now = Date.now(), want = new Map();
  for (const r of rows || []) {
    if (!r || r.source !== 'ebay' || !r.itemId) continue;
    const url = photoUrl(r.imageUrl), key = verdictKey(r.itemId, checks);
    if (!url || cacheGet(key, url)) continue;
    const m = _missed.get(key); if (m && now - m < MISS_MS) continue;
    want.set(itemKey(key), { itemId: key, url });
  }
  if (!want.size) return { asked: 0, found: 0 };
  const asked = want.size;
  let got, timer;
  try {
    got = await Promise.race([_store.load([...want.keys()], VERDICT_VERSION),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timed out')), LOAD_TIMEOUT_MS); })]);
  } catch (e) {
    _storeStats.loadFailed++; console.warn('[stamp] verdicts not read: ' + (e && e.message));
    return { asked, found: 0, error: true };
  } finally { clearTimeout(timer); }
  let found = 0;
  for (const g of got || []) {
    const w = want.get(g.itemKey);
    if (!w || g.photoKey !== photoKey(w.url)) continue;       // a different photo: check it again
    cacheSet(w.itemId, { state: g.state, reprint: g.reprint || undefined, label: g.label || undefined,
      says: g.says || '', scores: [], stored: true }, w.url);
    want.delete(g.itemKey); found++;
  }
  for (const w of want.values()) _missed.set(w.itemId, now);
  while (_missed.size > CACHE_MAX) _missed.delete(_missed.keys().next().value);
  _storeStats.loaded += found;
  return { asked, found };
}

// ── The gate: after the text gates, before display (TASK T1) ──
// rows: listings that passed cardmatch. Only eBay rows are photographed.
// A stamp FOUND refuses the row, counted and named like any other refusal.
// NOT VISIBLE and UNREADABLE keep it: absence of a stamp is weak evidence
// (cropped, angled, glared; 2 of 86 Aquapolis photos showed no stamp area).
// An item not yet checked is HIDDEN (TASK T2, 2026-10-03): counted in
// report.pending and handed back so the caller can check it — it appears
// when its verdict lands, instead of appearing and then vanishing. Nothing
// here waits. Hidden is temporary; only "found" ever refuses.
// opts.hideBelow (T1, 2026-10-04): when EVERY usable check is a sibling
// comparison, an unchecked row is hidden only if it is priced below this
// (the server passes ~55% of the card's current, measured stored price —
// the Alakazam swaps sat at 14%); every other unchecked row is SHOWN while
// it is checked. No baseline (null) hides nothing, as outlier.js judges
// nothing without one. A stamp or a held lookalike pair keeps the old rule:
// unchecked is hidden.
const SIBLING_HIDE_FRACTION = 0.55;
function gate(rows, reprints, opts) {
  opts = opts || {};
  const T = templates().templates || {};
  const usable = (reprints || []).filter(r => isLookalike(r) ? lookalikeReady(r) : T[r.cardId]);
  const report = { applied: false, ebayCalls: 0, checked: 0, refused: 0, notVisible: 0, unreadable: 0,
    pending: 0, refusedSample: [], threshold: THRESHOLD,
    reprints: (reprints || []).map(r => ({ cardId: r.cardId, kind: r.kind || 'reprint',
      template: isLookalike(r) ? lookalikeReady(r) : !!T[r.cardId],
      label: r.label || (T[r.cardId] && T[r.cardId].label) || (r.family && r.family.label) || r.cardId })) };
  if (!usable.length) {
    report.reason = reprints && reprints.length ? 'no photo template built for this card’s reprint or lookalike' : 'no known reprint';
    return { listings: rows, report, pending: [] };
  }
  report.applied = true;
  const onlyLook = usable.every(isLookalike);
  report.kind = onlyLook ? 'lookalike' : usable.some(isLookalike) ? 'both' : 'stamp';
  const onlySiblings = usable.every(isSibling);
  const hideBelow = onlySiblings ? (opts.hideBelow > 0 ? opts.hideBelow : null) : Infinity;
  if (onlySiblings) { report.kind = 'sibling'; report.hideBelow = hideBelow; report.pendingShown = 0; }
  const out = [], pending = [];
  for (const row of rows) {
    if (!row || row.source !== 'ebay' || !row.itemId) { out.push(row); continue; }
    const url = photoUrl(row.imageUrl);
    if (!url) { report.unreadable++; out.push(Object.assign({}, row, { stamp: { state: 'unreadable', says: 'No eBay photo to check.' } })); continue; }
    const hit = cacheGet(verdictKey(row.itemId, reprints), url);
    if (!hit) {
      report.pending++; pending.push(row);
      const price = Number(row.landed != null ? row.landed : row.price);
      if (hideBelow !== Infinity && !(hideBelow != null && price > 0 && price < hideBelow)) {
        report.pendingShown++;
        out.push(Object.assign({}, row, { stamp: { state: 'pending', kind: 'sibling',
          says: 'Photo not yet compared with the other cards of this name in the set.' } }));
      }
      continue;
    }
    const v = hit.verdict;
    if (v.state === 'found') {
      report.checked++; report.refused++;
      const refusal = { title: row.title, itemId: row.itemId,
        price: row.price, landed: row.landed, currency: 'USD', url: row.url, imageUrl: row.imageUrl, reprint: v.reprint, label: v.label,
        marketplace: row.marketplace, source: 'ebay',
        reason: v.kind === 'lookalike' ? 'photo matches ' + (v.label || 'another card') + ', not this card'
                                       : 'photo shows the ' + (v.label || 'reprint') + ' stamp' };
      if (report.refusedSample.length < 12) report.refusedSample.push(refusal);
      // Every refusal, for the page's "listings we believe are wrong" (T4).
      (report.refusedRows || (report.refusedRows = [])).push(refusal);
      continue;
    }
    if (v.state === 'not-visible') { report.checked++; report.notVisible++; }
    else report.unreadable++;
    out.push(Object.assign({}, row, { stamp: { state: v.state, says: v.says, retryable: !!v.retryable, kind: report.kind } }));
  }
  report.summary = report.refused + (onlyLook ? ' refused (the seller’s photo matches another card better), '
                                              : ' refused (the seller’s photo shows a reprint’s stamp or another card), ')
    + report.notVisible + (onlyLook ? ' not clearly the other card, ' : ' no stamp visible, ') + report.unreadable + ' unreadable'
    + (report.pending ? ', ' + (report.pending - (report.pendingShown || 0)) + ' hidden until checked'
                        + (report.pendingShown ? ', ' + report.pendingShown + ' shown while checked' : '') : '');
  return { listings: out, report, pending };
}

// Worker side: long-lived, one photo per message.
const wt = (() => { try { return require('worker_threads'); } catch (e) { return {}; } })();
if (!wt.isMainThread && wt.workerData && wt.workerData.pool) {
  wt.parentPort.on('message', m => {
    let v;
    try {
      const img = decodeJpeg(Buffer.from(m.jpeg));
      v = m.material ? Object.assign({ state: 'profiled' }, colourProfile(img))
        : m.back ? Object.assign({ state: 'scored' }, require('./backcheck.js').scorePhoto(img), colourProfile(img))
        : judge(img, m.reprints);
    }
    catch (e) { v = { state: 'unreadable', says: 'The photo could not be decoded: ' + String(e && e.message || e).slice(0, 80), scores: [] }; }
    wt.parentPort.postMessage({ verdict: v });
  });
}

module.exports = { MATERIAL_VERSION, MATERIAL_GOLD_EXCESS, MATERIAL_PHOTO_SIZE, colourProfile, checkMaterialPhoto, checkMaterialScan, metalPhotoOf, materialJudge,
                   THRESHOLD, PHOTO_SIZE, MIN_SIDE, MATCH, decodeJpeg, crop, resize, rotate90, nccMax, bestScore,
                   judge, checkItem, checkBackPhoto, gate, verdictKey, wholeScore, LOOKALIKE_MARGIN, SIBLING_MARGIN, SIBLING_HIDE_FRACTION, poolState, loadVerdicts, setStore, itemKey, photoKey, VERDICT_VERSION, photoUrl, templates, cacheGet, cacheSet, TTL_MS, RETRY_MS,
                   _setTemplates: t => { _templates = t; }, _setFetch: f => { _fetch = f; },
                   _clearCache: () => { _cache.clear(); _missed.clear(); } };
