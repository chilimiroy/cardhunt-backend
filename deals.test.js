// deals.test.js — Best deals (TASK T3, 2026-10-05; deals.js).
//
// The cheapest TRUSTED Buy It Now against a MEASURED price, both ends solid,
// from views opened in the last 15 minutes, with 0 eBay calls. Tested both
// ways: what it keeps as a deal, and every reason a row is not one.
//
//   node deals.test.js
'use strict';
const fs = require('fs');
const deals = require('./deals.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } }
console.log('\n  deals.test.js\n');

// The bars a row must clear before the vouching bar looks at it (deals.notADeal,
// read by deals.vouchFree). pickDeal, backCandidates and solidRows — the
// cached-view shelf's own picker — were DELETED 2026-10-08 with that shelf;
// what they tested about a ROW is tested here directly, both ways.
let _id = 0;
const row = (landed, o) => Object.assign({ source: 'ebay', live: true, saleType: 'buy-it-now', shippingKnown: true,
  landed, price: landed, suspect: null, priceKind: 'listing', itemId: 'v1|' + (++_id) + '|0',
  back: { state: 'genuine-back' } }, o || {});
const ref = { price: 100, isReal: true, current: true, source: 'tcgdex_tcgplayer_holofoil' };
const holoBase = deals.basePrintingOf({ listings: [], printings: [{ key: 'holo' }, { key: 'reverse' }] });
const no = (l, base) => deals.notADeal(l, base === undefined ? holoBase : base);

console.log('  what it keeps');
ok(no(row(70)) === null, 'a live Buy It Now, shipping stated, unflagged row clears');
ok(no(row(50, { sellerStated: true, sellerCondition: 'NM' })) === null, 'KEPT: a stated near-mint copy');
ok(no(row(50, { sellerStated: true, sellerCondition: 'M' })) === null, 'KEPT: a stated mint copy');
ok(no(row(50, { printingStated: true, printing: 'holo' })) === null, 'KEPT: the stated printing IS the priced one');
ok(no(row(50, { printingStated: false, printing: null })) === null, 'KEPT: a title that states no printing');
ok(no(row(50, { editionStated: true, editionKey: 'unlimited' })) === null, 'KEPT: a stated Unlimited');
ok(no(row(50, { stamp: { state: 'not-visible' } })) === null, 'KEPT: a photo checked and clear');
ok(no(row(50, { back: { state: 'genuine-back' } })) === null, 'KEPT: a genuine back seen');

console.log('\n  what it refuses, and says why');
ok(/flagged/.test(no(row(40, { suspect: 'implausible' }))), 'an outlier is skipped — a deal is the bottom of TRUST, not below it');
ok(/flagged/.test(no(row(30, { suspect: 'counterfeit-likely' }))), 'a row the novelty check flagged is skipped');
ok(no(row(50, { saleType: 'auction' })) !== null, 'an auction (a current bid) is never a deal');
ok(/shipping/.test(no(row(50, { shippingKnown: false }))), 'unknown shipping: the landed cost is not solid');
ok(/novelty/.test(no(row(50, { materialPending: true }))), 'a row still waiting for its novelty check is not offered');
ok(/ended/.test(no(row(50, { live: false }))), 'an ended listing is not a deal');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'DMG' }))), 'stated damage ("Damaged", "DMG/PEELING") is not a deal');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'MP' }))), 'stated MP is not a deal against a near-mint price');
ok(/below near mint/.test(no(row(50, { sellerStated: true, sellerCondition: 'LP' }))), 'stated LP neither');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'reverse' }))), 'a stated reverse holo is not the holo price\'s deal');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'normal' }))), 'a stated "Non-Holo" is not the holo price\'s deal');
ok(/another printing/.test(no(row(50, { printingStated: true, printing: 'holo' }),
     deals.basePrintingOf({ listings: [], printings: [{ key: 'normal' }, { key: 'holo' }] }))),
   'a card in normal AND holo: a stated printing cannot be shown to be the priced one');
ok(/another edition/.test(no(row(50, { editionStated: true, editionKey: '1st-edition' }))), 'a stated 1st Edition is not the unlimited price\'s deal');
ok(/photo not checked/.test(no(row(50, { stamp: { state: 'pending', kind: 'sibling' } }))), 'a photo still being compared is not a deal');
ok(/back check marked/.test(no(row(50, { back: { state: 'no-claim', metal: true } }))), 'a metal photo among the seller\'s is not a deal');
ok(/back check marked/.test(no(row(50, { back: { state: 'other-back' } }))), 'another language family\'s back is not a deal');

console.log('\n  the price end and the thresholds');
// The ONE threshold that stays on the DELIVERED price (Roy, 2026-10-08):
// a deal is what the buyer pays. The gates judge the item price (outlier.js).
ok(Math.abs(deals.discountOf(row(90, { price: 60 }), ref) - 0.10) < 1e-9, 'a $60 item + $30 shipping is 10% below, not 40%: the discount is on the DELIVERED price');
ok(/below the TCGplayer market price/.test(deals.vouchFree(row(90, { price: 60 }), { listings: [] }, ref).skip || ''), '...so it is skipped as under 15%');
ok(/below the/.test(deals.vouchFree(row(50), { listings: [] }, { price: 100, isReal: false, current: true }).skip || ''), 'an estimate is no price to beat');
ok(/below the/.test(deals.vouchFree(row(50), { listings: [] }, { price: 100, isReal: true, current: false }).skip || ''), 'an old / thin / unsettled price is no price to beat');
ok(deals.MIN_DISCOUNT === 0.15 && deals.MAX_DISCOUNT === 0.60 && deals.DEAL_BACK_MAX === 2, 'the thresholds are the stated ones');
ok(typeof deals.pickDeal === 'undefined' && typeof deals.backCandidates === 'undefined' && typeof deals.MIN_TRUSTED === 'undefined',
   'the cached-view picker is deleted, not left dormant');

console.log('\n  on (Roy, 2026-10-08), with its own supply');
ok(deals.ENABLED === true, 'deals.ENABLED is ON — on the vouching bar, approved accounts');
ok(/switched off/.test(deals.OFF_REASON), 'the off state still carries its reason, should it be switched off again');
ok(/genuine card/.test(deals.describeRule()) && /at most 2/.test(deals.describeRule()), 'the rule states the back and what it costs');

console.log('\n  wiring: the refresh job, the shelf, the click');
const src = fs.readFileSync(__dirname + '/server.js', 'utf8').split('\r\n').join('\n');
const blockAt = src.indexOf('// BEST DEALS — its own supply');
const sup = src.slice(blockAt, src.indexOf('// ── SEARCH', blockAt));
ok(blockAt > 0 && sup.length > 2000, 'the supply block exists');
{
  const job = sup.slice(sup.indexOf('async function runDealRefresh('), sup.indexOf("app.post('/api/deals/refresh'"));
  ok(/deals_\.pickVouched\(payload, ref, paid\.backOf\)/.test(job) && /dealBackOf\(card, \{ paid: true, budget: deals_\.DEAL_BACK_MAX \}\)/.test(job),
     'the job runs the shelf\'s own bar (pickVouched), the back within DEAL_BACK_MAX a card');
  ok(/INSERT INTO deal_picks \(card_id, item_id, found_at, run_id\)/.test(job), 'it stores card, item id, found_at, run — nothing else');
  ok(/DELETE FROM deal_picks WHERE card_id = \$1/.test(job), 'a card with no deal now loses its old pick');
  ok(/stoppedFor/.test(job) && /break;/.test(job), 'when the quota says stop, it stops and says so');
}
ok(/CREATE TABLE IF NOT EXISTS deal_picks \(\s*card_id text PRIMARY KEY, item_id text NOT NULL, found_at timestamptz NOT NULL DEFAULT now\(\), run_id text\)/.test(sup)
   && /ALTER TABLE deal_picks ENABLE ROW LEVEL SECURITY/.test(sup),
   'deal_picks holds no price, title, photo or discount — and RLS is on from its first use');
ok(/ebay0\.withOrigin\('background', \(\) => \{ runDealRefresh\(runId\)/.test(sup), 'the job runs in a BACKGROUND context (counted so, yields at the soft stop)');
ok(/app\.post\('\/api\/deals\/refresh', toolingKey\.require/.test(sup) && /app\.get\('\/api\/deals\/refresh\/status', toolingKey\.require/.test(sup),
   'start and status are tooling-key only (the GitHub Action)');
{
  const ec = fs.readFileSync(__dirname + '/ebaycall.js', 'utf8');
  ok(/const background = !!opts\.background \|\| currentOrigin\(\) === 'background';/.test(ec), 'ebaycall: a background context makes every call in it background');
}
{
  const shelf = sup.slice(sup.indexOf("app.get('/api/deals', access.priced"), sup.indexOf('const dealLiveCache'));
  ok(shelf.length > 500, '/api/deals exists');
  ok(!/(gatherListings|listingsFor|sourceEbay|fetchEbay|ebayItemOnDemand|dealItemLive)\(/.test(shelf) && /ebayCalls: 0/.test(shelf), 'the shelf never asks eBay — 0 calls, and says so');
  ok(!/item_id|title|discount|landed|url/.test(shelf.replace(/\/\/.*$/gm, '')), 'the shelf sends OUR data only — no item id, title, link, price of eBay\'s, or discount');
  ok(/found_at > now\(\) - interval '3 hours'/.test(shelf), 'picks older than the 3-hour refresh are not shown');
  ok(/out\.sort\(\(a, b\) => b\.price - a\.price\)/.test(shelf), 'ordered by OUR price — never by the internal discount');
  ok(/if \(!deals_\.ENABLED\) return res\.json\(\{ enabled: false, reason: deals_\.OFF_REASON/.test(shelf), 'switched off, it answers enabled:false with the reason');
}
{
  const click = sup.slice(sup.indexOf("app.get('/api/deals/:cardId/live'"));
  ok(/drop\('This one has sold\.'\)/.test(click) && /DELETE FROM deal_picks WHERE card_id = \$1/.test(click), 'a sold listing deletes the pick and says "This one has sold."');
  ok(/q < deals_\.MIN_DISCOUNT \|\| q > deals_\.MAX_DISCOUNT/.test(click) && !/discount:|q,|percent/.test(click.slice(click.indexOf('res.json({ cardId, gone: false'))),
     'the live price is re-judged INTERNALLY; no comparison number is sent');
}
{
  const bo = src.slice(src.indexOf('function dealBackOf('), src.indexOf('async function dealRefOf('));
  ok(/background: true, needPhotos: true/.test(bo), 'the paid back asks for the photo count, in the background lane');
  ok(/o\.budget != null && calls >= o\.budget/.test(bo), 'paid: stops at its budget');
}
ok(!/function dealBackFollowUp/.test(src) && !/dealBackFollowUp\(/.test(src), 'the view-time follow-up (for the cached-view shelf) is deleted, not left spending');
ok(/back: \{ state: v\.state, says: v\.says, metal: !!v\.metal \}/.test(src), 'a kept row carries the metal-photo signal, so the deals bar can read it');
// The "most-opened" list may count only real users (Roy, 2026-10-08): every
// recorded view says who opened it, from the request's own origin.
ok(/v\.caller = v\.caller \|\| ebay0\.currentOrigin\(\) \|\| 'background'/.test(src)
   && /ADD COLUMN IF NOT EXISTS caller text/.test(src) && /action, origin, lang, caller\)/.test(src),
   'listing_views records the caller (user / tooling / background) of every view');
{
  const wf = require('path').join(__dirname, '.github', 'workflows', 'deals-refresh.yml');
  const y = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
  ok(/cron: '30 \*\/3 \* \* \*'/.test(y), 'the GitHub Action fires every 3 hours from 00:30 UTC');
  ok(/secrets\.CARDZON_TOOLING_KEY/.test(y) && !/X-CardHunt-Key: [A-Za-z0-9]{12,}/.test(y), 'it sends the key from repo secrets, never written in the file');
  ok(/\/api\/deals\/refresh\/status/.test(y), 'it polls status until the run ends (keeping the instance awake)');
}

const page = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').split('\r\n').join('\n');
const ldAt = page.indexOf('async function loadHomeDeals'), ld = page.slice(ldAt, page.indexOf('\n}\n', ldAt));
ok(/fetch\(BACKEND \+ '\/api\/deals/.test(page) && /loadHomeDeals\(\)/.test(page), 'the home shelf reads /api/deals');
ok(/No deals right now — checking again shortly\./.test(ld) && /title="' \+ liveEsc\(d\.rule\) \+ '"/.test(ld),
   'an empty shelf says one line; the rule is behind a hover (Roy, 2026-10-08)');
ok(/if \(d\.enabled === false\) \{\s*sec\.hidden = true;\s*console\.info\('\[deals\] Best deals is switched off: '/.test(ld), 'switched off: the section stays hidden and the reason is logged');
ok(/sec\.hidden = false;\s*\/\/ a failure is shown/.test(ld) && /\n  sec\.hidden = false;/.test(ld), 'a load failure, and an enabled shelf, show the section');
ok(!/listing\.|landed|discount|% below/.test(ld), 'a shelf tile shows nothing of eBay\'s — no listing, price of eBay\'s, or percentage');
ok(/'Deal found ' \+ /.test(ld) && /TCGplayer market/.test(ld), 'a tile shows our card, the TCGplayer market price and when the deal was found');
{
  const ck = page.slice(page.indexOf('async function openDeal('), page.indexOf('\n}\n', page.indexOf('async function openDeal(')));
  ok(/'\/api\/deals\/' \+ encodeURIComponent\(cardId\) \+ '\/live'/.test(ck), 'opening a deal fetches the listing live');
  ok(/From eBay/.test(ck) && /delivered/.test(ck) && /View on eBay/.test(ck), 'eBay\'s own zone: "From eBay", its delivered price, a link');
  ok(!/% below|discount|percent/.test(ck), 'no comparison number on screen — the reader sees the two figures and the gap');
  ok(/d\.gone/.test(ck) && /d\.says/.test(ck), 'gone: the tile says why (sold, expired, no longer a deal)');
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
