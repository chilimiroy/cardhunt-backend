// ══════════════════════════════════════════════════════════════
// pricecharting-disabled.js — PriceCharting graded prices, PARKED (Roy, 2026-10-10).
//
// NOT LOADED BY ANY PAGE. NOT SERVED. NOT RUN: requiring it throws before
// anything below executes — no token is read, no request is made.
//
// It was server.js's /api/graded/:cardName, built and dormant (no
// PRICECHARTING_TOKEN set; the page never called it). Parked for two reasons:
//   1. It matches by NAME only ("<card name> <set name>" to PriceCharting's
//      product search) — no collector number, the matching every price path
//      here refuses (CLAUDE.md LESSONS 2). Its field mapping was unchecked too
//      ('manual-only-price' as PSA 10, 'bgs-10-price' as CGC 9.5, ...).
//   2. PriceCharting's API terms license the data for internal use only
//      (Roy, 2026-10-10): we could not display it even if matched correctly.
// Kept, not deleted: with a licence that allows display, it is a real
// candidate graded-price source (the grade picker has none — CLAUDE.md STATE).
// It returns only matched by collector number, and with the licence in hand.
// The route now answers 410 and says why (server.js); nofabricated.test.js
// checks this file refuses to load and that nothing names it.
// ══════════════════════════════════════════════════════════════
'use strict';
throw new Error('pricecharting-disabled.js is parked: nothing may require it (Roy, 2026-10-10)');

// ── The parked code, as it stood in server.js (it never runs) ──
/* eslint-disable */
function parkedRoute(app, access) {
// ══════════════════════════════════════════════════════════════
// PRICECHARTING — graded PSA / CGC / BGS prices
// Set PRICECHARTING_TOKEN in Render env vars.
// Free token at https://www.pricecharting.com/api-documentation
// ══════════════════════════════════════════════════════════════
const PC_TOKEN = process.env.PRICECHARTING_TOKEN || '';

app.get('/api/graded/:cardName', access.priced, async (req, res) => {
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
}
