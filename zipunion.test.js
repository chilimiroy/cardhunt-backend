// zipunion.test.js — the ZIP union is a PROBE, not production (branch zip-union, 2026-10-07)
//
//   node zipunion.test.js
//
// /api/ebay/dealsprobe/:id?zip=none|union&bar=vouch builds a view outside the
// listings cache: union asks eBay US twice, with and without a US buyer
// location (X-EBAY-C-ENDUSERCTX), and merges them ZIP-first. Roy: do not ship
// the union to production until the headline numbers are seen. This pins
// that nothing in production can reach it.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
const fnS = name => { const m = new RegExp('(async )?function ' + name + '\\(').exec(S); return m ? S.slice(m.index, S.indexOf('\n}', m.index) + 2) : ''; };

console.log('\n  only the probe can ask for the union');
// Options that turn it on — not the two report fields that echo its status (st.zipUnion, z.zipUnion).
const setters = [...S.matchAll(/zipUnion: ([^,}\n]+)/g)].map(m => m[1].trim()).filter(v => !/^(st|z)\.zipUnion/.test(v));
ok('zipUnion is set in exactly two places: the probe (its mode) and sourceEbayAll clearing it for each half',
   setters.length === 2 && setters.some(v => /mode === 'union' \? DEALS_PROBE_ZIP : null/.test(v)) && setters.includes('undefined'), setters.join(' | '));
ok('the probe that sets it is the deals probe\'s isolated view', /zipUnion: mode === 'union' \? DEALS_PROBE_ZIP : null/.test(fnS('probeZipView')));
ok('listingsFor, the production builder, never mentions it', fnS('listingsFor').length > 500 && !/zipUnion|endUserZip/.test(fnS('listingsFor')));
ok('the probe runs only with ?bar=vouch and only for zip=none|union',
   /if \(req\.query\.zip === 'none' \|\| req\.query\.zip === 'union'\) \{\s*if \(req\.query\.bar !== 'vouch'\) return res\.status\(400\)/.test(S));

console.log('\n  the merge: ZIP half first, so its copy (shipping stated) wins');
const all = fnS('sourceEbayAll');
ok('eBay US is asked with the buyer location, then without', /if \(zipUnion && site\.id === 'EBAY_US'\) jobs\.push\(\{ site, zip: zipUnion \}\);\s*jobs\.push\(\{ site, zip: null \}\);/.test(all));
ok('merged in that order (mergeEbaySite keeps the first copy of an item)', /jobs\.forEach\(\(j, i\) =>/.test(all) && /mergeEbaySite\(st, j\.site\.id, r\.value\)/.test(all));
ok('each half sends its own header and nothing else changes', /endUserZip: j\.zip \|\| undefined/.test(all));
ok('a failed half is said, not hidden (st.zipUnion.withZip / without)', /st\.zipUnion\[half\] = r\.status === 'fulfilled'/.test(all) && /ok: false, error:/.test(all));
ok('rows only the ZIP half returned are marked zipOnly', /l\.zipOnly = true/.test(all));

console.log('\n  the isolated view never touches production');
const rv = fnS('rebuildView');
ok('rebuildView({ isolated }) returns BEFORE the cache write and every follow-up',
   rv.indexOf('if (ropts.isolated) return payload;') > 0 && rv.indexOf('if (ropts.isolated) return payload;') < rv.indexOf('listingCacheSet(')
   && rv.indexOf('if (ropts.isolated) return payload;') < rv.indexOf('stampFollowUp('));
const pz = fnS('probeZipView');
ok('the probe judges with isolated: true', /rebuildView\(card, id, grade, null, null, vs, \{ noFetch: true, isolated: true \}\)/.test(pz));
ok('…and never writes a cache, a view state or starts a production follow-up',
   pz.length > 500 && !/listingCacheSet|viewStateSet|listingsFor|stampFollowUp|materialFollowUp|backFollowUp|dealBackFollowUp/.test(pz));
ok('it queues the checks production would: the gate\'s top rows (class 1), colour by class',
   /stampcheck\.compareOrder\(gathered\.stampPendingTop/.test(pz) && /stampcheck\.PRIO\.compareTop/.test(pz) && /PRIO\.colourTop : stampcheck\.PRIO\.colourRest/.test(pz));
ok('one vouching bar: the production path and the probe both call vouchBarOf',
   (S.match(/await vouchBarOf\(card, id, /g) || []).length === 2 && (S.match(/function vouchBarOf\(/g) || []).length === 1);

console.log('\n  the old outlier rule is a measurement, never the rule');
const delivered = [...S.matchAll(/judgeBy: 'delivered'/g)].map(m => m.index);
ok('only the probe\'s rows=1 measurement passes judgeBy: \'delivered\'',
   delivered.length === 1 && pz.includes("judgeBy: 'delivered'"), delivered.length + ' places');
ok('…and every production call of flagOutliers judges the item price (no judgeBy)',
   [...S.matchAll(/outlier\.flagOutliers\([^)]*\)/g)].filter(m => !pz.includes(m[0])).every(m => !/judgeBy/.test(m[0])));

console.log('\n  zipunion.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
