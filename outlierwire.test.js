// ══════════════════════════════════════════════════════════════
// outlierwire.test.js — is the outlier check actually INSTALLED?
//
// outlier.test.js proves the logic on the real audit numbers. This proves
// the logic is reached, which is a different question and the one this
// project keeps getting wrong:
//
//   · The year discriminator was correct and never fired anywhere, because
//     the query behind both routes never selected `set_release`.
//   · The language gate ran on eBay and not on Yahoo, where Korean prints
//     actually appear.
//   · `/api/market` refused to WRITE a name-matched aggregate and the page
//     displayed it anyway.
//
// In all three the logic was fine and the wiring was not, so no unit suite
// could see it. Everything below asserts the wiring: behaviour where it
// can be run, source where it cannot.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const outlier = require('./outlier');
const gp = require('./gradeprice');

let pass = 0, fail = 0;
const chk = (l, c) => { c ? pass++ : fail++;
  console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l); };

const server = fs.readFileSync('server.js', 'utf8');
const page   = fs.readFileSync('cardhunt_preview.html', 'utf8');

// Count, don't just test. "Present somewhere" is how a fix gets installed
// on one of two paths and called done.
const count = (hay, needle) => hay.split(needle).length - 1;
const firstFlaggedIndex = rows => rows.findIndex(l => l.suspect);

// ── The server ────────────────────────────────────────────────
console.log('\nSERVER — after the gate, before the sort\n');

chk('server.js requires ./outlier', /require\(['"]\.\/outlier['"]\)/.test(server));

const flagAt = server.indexOf('outlier.flagOutliers(listings)');
const sortAt = server.indexOf('listings.sort((a, b) =>');
chk('flagOutliers is called on the gathered listings', flagAt > -1);
chk('it runs BEFORE the sort, not after', flagAt > -1 && sortAt > flagAt);
chk('the sort ranks suspects first of all',
    /suspectRank\(a\) - outlier\.suspectRank\(b\)\) \|\|/.test(server));

// cheapest and cheapestLive are the numbers people act on. BOTH payload
// sites — /api/listings and the /api/search chain — must skip flagged rows.
chk('two payloads compute cheapest, and both filter to trustworthy rows',
    count(server, 'listings.filter(outlier.trustworthy)') === 2);
chk('cheapest is drawn from the trusted rows (2 sites)',
    count(server, 'cheapest: trusted.length ? trusted[0].landed : null') === 2);
chk('cheapestLive is too (2 sites)',
    count(server, "cheapestLive: (trusted.find(l => l.live) || {}).landed ?? null") === 2);
chk('no payload still takes cheapest from the unfiltered list',
    !/cheapest: listings\.length \? listings\[0\]\.landed/.test(server));
chk('the stats block is returned so the UI can explain rather than hide',
    count(server, 'outliers: gathered.outliers') === 2 &&
    /outliers: judged\.stats/.test(server));

// ── The rows stay ─────────────────────────────────────────────
// The single most important property. A genuine bargain exists, and this
// project has twice destroyed good data with a filter written against bad.
console.log('\nFLAGGED IS NOT REMOVED\n');
const sample = [2.08, 8.5, 17, 20, 25, 299.95, 640, 799, 817.61, 850, 899,
                950, 975, 1000, 1049, 1114.99]
  .map((p, i) => ({ price: p, landed: p, live: i % 2 === 0, title: 'row ' + p }));
const judged = outlier.flagOutliers(sample);
chk('every listing survives the check: ' + judged.listings.length + ' in, ' +
    sample.length + ' out', judged.listings.length === sample.length);
chk('some were flagged (' + judged.stats.flagged + ')', judged.stats.flagged > 0);
chk('the original array was not mutated',
    sample.every(l => l.suspect === undefined));

// Sorted the way the server sorts them: suspect rank, then buyable, then price.
const sorted = judged.listings.slice().sort((a, b) =>
  (outlier.suspectRank(a) - outlier.suspectRank(b)) ||
  (Number(b.live) - Number(a.live)) || (a.landed - b.landed));
chk('the first row is not flagged: $' + sorted[0].price, !sorted[0].suspect);
// Within the flagged block the ordering is by severity, not by price:
// `unusually-cheap` before `implausible`. So the last row is one of the
// implausible ones, and $2.08 — the cheapest listing of all — is somewhere
// in that block rather than anywhere near the top.
chk('the last row is an implausible one: $' + sorted[sorted.length - 1].price,
    sorted[sorted.length - 1].suspect === 'implausible');
const at208 = sorted.findIndex(l => l.price === 2.08);
chk('$2.08 sits in the flagged block at position ' + (at208 + 1) + ' of ' +
    sorted.length + ', not first',
    at208 >= firstFlaggedIndex(sorted) && at208 > 0);
chk('no unflagged row sorts below a flagged one',
    sorted.slice(firstFlaggedIndex(sorted)).every(l => l.suspect));

// ── The measured grade price ──────────────────────────────────
console.log('\nAN IMPLAUSIBLE LISTING IS NOT EVIDENCE OF A GRADE PRICE\n');
const slabs = [820, 840, 860, 880, 900].map(p => ({
  price: p, landed: p, shippingKnown: true, live: false,
  listingType: 'fixed', title: 'PSA 10 ' + p }));
const withJunk = slabs.concat([{ price: 2.08, landed: 2.08, shippingKnown: true,
  live: false, listingType: 'fixed', title: 'PSA 10 2.08',
  suspect: 'implausible', suspectReason: 'flagged' }]);
const clean = gp.aggregate(slabs, { grade: 'PSA 10' });
const dirty = gp.aggregate(withJunk, { grade: 'PSA 10' });
// Read the field the module actually returns. An assertion comparing two
// undefined properties passes for the wrong reason, which is the failure
// mode this whole file exists to catch.
chk('the aggregate really produced a number: ' + (clean.best || {}).median,
    !!clean.best && Number.isFinite(clean.best.median));
chk('the flagged row does not change the measured price: ' +
    (clean.best && clean.best.median) + ' vs ' + (dirty.best && dirty.best.median),
    !!dirty.best && clean.best.median === dirty.best.median);
// Proof the sample is one the junk row WOULD have moved.
const unflaggedJunk = withJunk.map(l => Object.assign({}, l, { suspect: undefined }));
chk('...and it would have, had it not been flagged: ' +
    gp.aggregate(unflaggedJunk, { grade: 'PSA 10' }).best.median,
    gp.aggregate(unflaggedJunk, { grade: 'PSA 10' }).best.median !== clean.best.median);
chk('and it is not counted in the sample: ' +
    (clean.best && clean.best.count) + ' vs ' + (dirty.best && dirty.best.count),
    clean.best.count === dirty.best.count);
// An unusually-cheap row MAY be a real bargain, so it still counts.
const bargain = slabs.concat([{ price: 60, landed: 60, shippingKnown: true,
  live: false, listingType: 'fixed', title: 'PSA 10 60',
  suspect: 'unusually-cheap', suspectReason: 'flagged' }]);
chk('an unusually-cheap row is still counted — it may be genuine',
    gp.aggregate(bargain, { grade: 'PSA 10' }).best.count === clean.best.count + 1);

// ── The page ──────────────────────────────────────────────────
console.log('\nPAGE — shown, greyed, explained\n');
chk('a flagged row is greyed rather than dropped',
    /l\.suspect \? ';opacity:\.55/.test(page));
chk('the reason is rendered beside it', /function liveSuspectNote/.test(page) &&
    /liveSuspectNote\(l\)/.test(page));
chk('the stats block is explained, applied or not',
    /function liveOutlierNote/.test(page) && /liveOutlierNote\(d\)/.test(page));
chk('the "not applied" branch prints the reason the API gave',
    /Price check not applied/.test(page));
chk('the headline says flagged rows are excluded from it',
    /flagged below, not counted here/.test(page));

// ── T3 — deep links ───────────────────────────────────────────
console.log('\nPAGE — deep links are searches, not results\n');
chk('the link block is labelled an unfiltered search',
    /UNFILTERED SEARCHES/.test(page));
chk('and says the results are not checked by us',
    /The results are not/.test(page) && /checked by us/.test(page));
chk('the gated block says it IS checked', /&#10003; checked/.test(page));
// Every eBay deep link must spend the negative keywords; only eBay reads
// them, so this is the count of eBay link builders, not of all links.
chk('every eBay deep link is built with forLink',
    count(page, 'forLink: true') + count(page, 'forLink:true') >= 4);
// The rows that never went through the builder at all — the towels.
chk('no deep link is built from the bare card name any more',
    !/encodeURIComponent\(card\.name\s*\+/.test(page) &&
    !/encodeURIComponent\('Pokemon '\s*\+\s*card\.name/.test(page));
chk('the PriceCharting link carries the number and set',
    !/nameQ=encodeURIComponent\(card\.name\)/.test(page) &&
    /const nameQ=encQ/.test(page));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
