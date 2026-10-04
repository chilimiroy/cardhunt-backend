// stampbuild.js — build stamps.json: one stamp template per reprint card,
// cut from OUR catalogue scan of that reprint (TASK T1, 2026-10-02).
//
//   node stampbuild.js [--only=en-30th-c-029] [--sheet=stamps-sheet.png]
//
// Local tool, read-only over the public API (CARDHUNT_API, default Render):
// it reads /api/cards/:id for each reprint in cardmatch.REPRINT_OF, fetches
// that card's own catalogue image, finds the Pikachu emblem on it, and stores
// the emblem WITH the artwork around it — that context is what made the
// measurement work (a bare emblem template matched any yellow blob).
// Never a seller's photo: the templates are made from catalogue scans.
//
// Finding the emblem: a shape-masked match (head ellipse + two ears, the
// cheeks and surroundings ignored) of a locator cut from the 30th Lugia
// scan, over widths 20-29% of the card — measured 24.5% on four 30th scans
// and 23.7% on Celebrations. Every location is printed with its score and
// drawn into --sheet so a person checks all 55 before trusting them.
'use strict';
const fs = require('fs');
const cm = require('./cardmatch');
const sc = require('./stampcheck');

const API = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const OUT = __dirname + '/stamps.json';
let SEARCH_W = 200;
const MIN_LOCATED = 0.93;   // 52 of 55 located 0.96-0.99; the three below were the sideways cards
const STORE_W = 64;                // stored template width; the matcher uses <= 32
const WHOLE_W = 96;                // whole-card template width; the comparison runs at 24
const LOCATOR = { card: 'en-30th-c-029', box: { x: 9, y: 346, w: 160, h: 120 }, scanW: 654 };

function decodeAny(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const { PNG } = require('pngjs');
    const p = PNG.sync.read(buf);
    // Flatten any transparency onto white, as a printed card would show.
    const rgba = p.data;
    for (let i = 0; i < rgba.length; i += 4) { const a = rgba[i + 3] / 255; for (let c = 0; c < 3; c++) rgba[i + c] = rgba[i + c] * a + 255 * (1 - a); }
    return { w: p.width, h: p.height, data: (() => { const o = new Uint8Array(p.width * p.height * 3); for (let i = 0, j = 0; j < rgba.length; i += 3, j += 4) { o[i] = rgba[j]; o[i + 1] = rgba[j + 1]; o[i + 2] = rgba[j + 2]; } return o; })() };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return sc.decodeJpeg(buf);
  throw new Error('not a PNG or JPEG');
}

// The emblem's silhouette inside its box, as fractions (read off the scan):
// head ellipse centred (0.496, 0.66), radii (0.306, 0.319); ears as triangles.
function emblemMask(w, h) {
  const m = new Uint8Array(w * h);
  const ears = [[[0.025, 0.033], [0.207, 0.429], [0.355, 0.341]], [[0.975, 0.066], [0.645, 0.341], [0.793, 0.44]]];
  const inTri = (px, py, t) => {
    const s = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    const p = [px, py], d1 = s(p, t[0], t[1]), d2 = s(p, t[1], t[2]), d3 = s(p, t[2], t[0]);
    return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / w, fy = (y + 0.5) / h;
    const e = ((fx - 0.496) / 0.306) ** 2 + ((fy - 0.66) / 0.319) ** 2 <= 1;
    if (e || ears.some(t => inTri(fx, fy, t))) m[y * w + x] = 1;
  }
  return m;
}

// Masked NCC (slow, offline): best placement of t (with mask) in img.
function maskedBest(img, t, mask) {
  const W = img.w, H = img.h, w = t.w, h = t.h;
  const idx = []; for (let i = 0; i < w * h; i++) if (mask[i]) idx.push(i);
  const n = idx.length * 3;
  let tm = 0; for (const i of idx) for (let c = 0; c < 3; c++) tm += t.data[i * 3 + c]; tm /= n;
  const tz = new Float32Array(n); let tss = 0, k = 0;
  for (const i of idx) for (let c = 0; c < 3; c++) { tz[k] = t.data[i * 3 + c] - tm; tss += tz[k] * tz[k]; k++; }
  const off = idx.map(i => ((i / w) | 0) * W * 3 + (i % w) * 3);
  let best = { score: -1 };
  for (let y = 0; y + h <= H; y++) for (let x = 0; x + w <= W; x++) {
    const b = (y * W + x) * 3; let s = 0, q = 0, cr = 0; k = 0;
    for (const o of off) for (let c = 0; c < 3; c++) { const v = img.data[b + o + c]; s += v; q += v * v; cr += tz[k++] * v; }
    const v = q - s * s / n; if (v < 1e-6) continue;
    const scv = cr / Math.sqrt(tss * v);
    if (scv > best.score) best = { score: scv, x, y };
  }
  return best;
}

async function getJson(u) { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }
async function getImage(u) { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return decodeAny(Buffer.from(await r.arrayBuffer())); }
async function scanOf(cardId) {
  const j = await getJson(API + '/api/cards/' + encodeURIComponent(cardId));
  const d = j.data || j; const url = d.images && (d.images.large || d.images.small);
  if (!url) throw new Error('no catalogue image');
  return { url, img: await getImage(url), name: d.name };
}

(async () => {
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
  const sheetArg = (process.argv.find(a => a.startsWith('--sheet=')) || '').split('=')[1] || null;
  // --searchW: the scan width the emblem is searched at (default 200). 30th-c-009/019/020
  // (BREAK and LEGEND, the stamp at the card's edge) located badly at 200.
  SEARCH_W = parseInt((process.argv.find(a => a.startsWith('--searchW=')) || '').split('=')[1], 10) || 200;
  // --wholes (T1, 2026-10-04): a WHOLE-card template of each card in
  // cardmatch.LOOKALIKES, from our catalogue scan, for the comparative check
  // (stampcheck.judge, "lookalike"). The stamps are left as they are.
  if (process.argv.includes('--wholes')) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    prev.wholes = {};
    for (const id of new Set(cm.LOOKALIKES.flatMap(p => [p.a, p.b]))) {
      const s = await scanOf(id);
      const tpl = sc.resize(s.img, WHOLE_W, WHOLE_W * s.img.h / s.img.w);
      prev.wholes[id] = { name: s.name, scan: s.url, w: tpl.w, h: tpl.h, rgb: Buffer.from(tpl.data).toString('base64') };
      console.log(`  ${id.padEnd(18)} ${String(s.name).padEnd(12)} whole card ${tpl.w}x${tpl.h} from ${s.img.w}x${s.img.h}`);
    }
    fs.writeFileSync(OUT, JSON.stringify(prev));
    console.log(`
  ${Object.keys(prev.wholes).length} whole-card templates -> stamps.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
    return;
  }
  // The locator: the emblem as printed on the 30th Lugia scan.
  const L = await scanOf(LOCATOR.card);
  const f0 = L.img.w / LOCATOR.scanW, b0 = LOCATOR.box;
  const loc = sc.crop(L.img, Math.round(b0.x * f0), Math.round(b0.y * f0), Math.round(b0.w * f0), Math.round(b0.h * f0));

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { templates: {} };
  const out = { built: new Date().toISOString(), threshold: sc.THRESHOLD, storeWidth: STORE_W,
                how: 'stampbuild.js: emblem located on our catalogue scan of each reprint, cut with its surrounding artwork',
                templates: only ? prev.templates : {}, notBuilt: only ? (prev.notBuilt || {}) : {},
                wholes: prev.wholes || {} };
  const sheet = [];
  for (const rset of Object.keys(cm.REPRINT_OF)) {
    const fam = cm.REPRINT_FAMILIES.find(f => f.sets.includes(rset));
    for (const num of Object.keys(cm.REPRINT_OF[rset])) {
      const cardId = 'en-' + rset + '-' + num;
      if (only && cardId !== only) continue;
      try {
        const s = await scanOf(cardId);
        // Search the scan at ~200px wide: offline, but 55 cards add up.
        const k = SEARCH_W / s.img.w, small = sc.resize(s.img, SEARCH_W, s.img.h * k);
        const locate = (img, sm, kk) => {
          let best = { score: -1 };
          for (let frac = 0.20; frac <= 0.2901; frac += 0.01) {
            const tw = Math.round(Math.min(sm.w, sm.h) * frac), th = Math.round(tw * loc.h / loc.w);
            const t = sc.resize(loc, tw, th), m = emblemMask(tw, th);
            const r = maskedBest(sm, t, m);
            if (r.score > best.score) best = Object.assign(r, { tw, th });
          }
          return Object.assign(best, { img, k: kk });
        };
        let best = locate(s.img, small, k), sideways = false;
        // A sideways card (BREAK, LEGEND) has its stamp on its side in the
        // portrait scan: located badly upright (0.83-0.86, the head cut off),
        // so try the scan a quarter turn round each way and keep the better.
        if (best.score < 0.93) {
          let r = s.img;
          for (let q = 1; q <= 3; q += 2) {
            r = q === 1 ? sc.rotate90(s.img) : sc.rotate90(sc.rotate90(sc.rotate90(s.img)));
            // Same scale as upright: the card's SHORT side is searched at SEARCH_W.
            const kk = SEARCH_W / r.h, alt = locate(r, sc.resize(r, r.w * kk, SEARCH_W), kk);
            if (alt.score > best.score) { best = alt; sideways = true; }
          }
        }
        // No emblem on our own scan, upright or turned: nothing to look for.
        // 30th-c-020 (the bottom half of Darkrai & Cresselia LEGEND) best
        // 0.873 on plain artwork — the stamp is on the top half. A template
        // cut there would be artwork, so the card is recorded as not built.
        if (best.score < MIN_LOCATED) {
          delete out.templates[cardId];
          out.notBuilt[cardId] = { name: s.name, scan: s.url, bestLocated: +best.score.toFixed(3),
            why: 'no stamp found on our catalogue scan, upright or turned' };
          console.log(`  ${cardId.padEnd(18)} ${String(s.name).slice(0, 26).padEnd(28)} NOT BUILT: no stamp on our scan (best ${best.score.toFixed(3)})`);
          continue;
        }
        delete out.notBuilt[cardId];
        const src = best.img, kk = best.k;
        const bx = Math.round(best.x / kk), by = Math.round(best.y / kk), bw = Math.round(best.tw / kk), bh = Math.round(best.th / kk);
        const cut = sc.crop(src, bx, by, Math.min(bw, src.w - bx), Math.min(bh, src.h - by));
        const tpl = sc.resize(cut, STORE_W, STORE_W * cut.h / cut.w);
        out.templates[cardId] = { name: s.name, family: fam && fam.id, label: fam && fam.label,
          scan: s.url, located: +best.score.toFixed(3), sideways, box: { x: bx, y: by, w: bw, h: bh, scanW: src.w, scanH: src.h },
          w: tpl.w, h: tpl.h, rgb: Buffer.from(tpl.data).toString('base64') };
        sheet.push({ cardId, tpl, score: best.score });
        console.log(`  ${cardId.padEnd(18)} ${String(s.name).slice(0, 26).padEnd(28)} located ${best.score.toFixed(3)} at ${bx},${by} ${bw}x${bh} of ${src.w}x${src.h}${sideways ? ' (scan turned: card prints sideways)' : ''}`);
      } catch (e) {
        console.log(`  ${cardId.padEnd(18)} NOT BUILT: ${e.message}`);
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n  ${Object.keys(out.templates).length} templates -> stamps.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  if (sheetArg && sheet.length) {
    const { PNG } = require('pngjs');
    const cols = 8, cw = STORE_W + 8, ch = 64;
    const png = new PNG({ width: cols * cw, height: Math.ceil(sheet.length / cols) * ch });
    png.data.fill(255);
    sheet.forEach((s, i) => {
      const ox = (i % cols) * cw + 4, oy = Math.floor(i / cols) * ch + 4;
      for (let y = 0; y < Math.min(s.tpl.h, ch - 8); y++) for (let x = 0; x < s.tpl.w; x++) {
        const a = (y * s.tpl.w + x) * 3, b = ((oy + y) * png.width + ox + x) * 4;
        png.data[b] = s.tpl.data[a]; png.data[b + 1] = s.tpl.data[a + 1]; png.data[b + 2] = s.tpl.data[a + 2]; png.data[b + 3] = 255;
      }
    });
    fs.writeFileSync(sheetArg, PNG.sync.write(png));
    console.log('  sheet ->', sheetArg, '(row-major, in the order printed above)');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
