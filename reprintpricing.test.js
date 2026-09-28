// reprintpricing.test.js — reprints are priced as reprints (TASK T6)
//   node reprintpricing.test.js
// ingest.js is local-only, so this reads it when present and says SKIP when
// not. Measured 2026-09-28 on 30th Celebration Classic Collection: pricing
// searched TCGPlayer with our catalogue number ("001") while the card says
// "4/102", so repeated names were refused and 11 of 30 cards sat on
// estimates up to 290x low (Charizard $0.71 vs $205.58). And "Charizard
// 4/102" is three TCGPlayer products — Base Set, 2021 Celebrations: Classic
// Collection ($155) and 2026 ME: 30th Celebration Classic Collection ($206)
// — so the printed number alone is not enough: the set has to be checked.
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

if (!fs.existsSync(__dirname + '/ingest.js')) {
  console.log('  SKIP  reprintpricing.test.js — ingest.js is local-only and not in this checkout');
  process.exit(0);
}
const src = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
const grab = name => {
  const a = src.indexOf(name);
  if (a < 0) return '';
  let d = 0, i = src.indexOf('{', src.indexOf(')', a));
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
};
const cmatch = require('./cardmatch');

console.log('\n  the table');
const tblSrc = src.slice(src.indexOf('const TCG_REPRINT_SET'), src.indexOf('};', src.indexOf('const TCG_REPRINT_SET')) + 2);
// eslint-disable-next-line no-new-func
const TCG_REPRINT_SET = new Function(tblSrc.replace('const TCG_REPRINT_SET =', 'return') )();
const reprintSets = Object.keys(cmatch.REPRINT_OF);
ok('every REPRINT_OF set has a TCGPlayer set name (' + reprintSets.join(', ') + ')',
  reprintSets.every(s => typeof TCG_REPRINT_SET[s] === 'string' && TCG_REPRINT_SET[s].length > 5),
  'missing: ' + reprintSets.filter(s => !TCG_REPRINT_SET[s]).join(', '));
ok('the two Classic Collections are different TCGPlayer sets',
  TCG_REPRINT_SET['30th-c'] !== TCG_REPRINT_SET['cel25cc']);

console.log('\n  reprintPricing — the real function');
// eslint-disable-next-line no-new-func
const reprintPricing = new Function('cmatch', 'TCG_REPRINT_SET', grab('function reprintPricing') + '; return reprintPricing;')(cmatch, TCG_REPRINT_SET);
const z = reprintPricing({ api_card_id: 'en-30th-c-001', number: '001' });
ok('30th-c #001 is priced as printed 4/102', z && z.number === '4' && z.printed === '4/102', JSON.stringify(z));
ok('...inside the 2026 set, not the 2021 one', z && z.tcgSet === 'ME: 30th Celebration Classic Collection');
const c = reprintPricing({ api_card_id: 'en-cel25cc-CC002', number: 'CC002' });
ok('cel25cc CC002 is priced as 4/102 inside the 2021 set', c && c.number === '4' && c.tcgSet === 'Celebrations: Classic Collection', JSON.stringify(c));
// What it must ALLOW: an ordinary card is untouched.
ok('the ORIGINAL Base Set Charizard is not a reprint', reprintPricing({ api_card_id: 'en-base1-4', number: '4' }) === null);
ok('an ordinary modern card is not a reprint', reprintPricing({ api_card_id: 'en-sv03.5-199', number: '199' }) === null);

console.log('\n  wiring');
const spf = grab('async function safePriceFor');
ok('safePriceFor asks reprintPricing', /reprintPricing\(card\)/.test(spf));
ok('a reprint gets NO name-only fallback (eBay / Cardmarket by name)',
  /if \(rp\) \{[^}]*?\{ reprint: rp \}\)\);\s*\} else \{[\s\S]*?cardmarketSearch/.test(spf));
const tps = grab('async function tcgPlayerSearch');
ok('tcgPlayerSearch filters hits to the reprint set by exact name',
  /opts\.reprint && String\(h\.setName \|\| ''\)\.toLowerCase\(\) !== opts\.reprint\.tcgSet\.toLowerCase\(\)/.test(tps));
ok('a reprint with no known TCGPlayer set is refused, not guessed', /opts\.reprint && !opts\.reprint\.tcgSet\) return null/.test(tps));
ok('pricecheck asks the same question the writer asks', /const live = rpc \? await tcgPlayerSearch/.test(src));
ok('safePrices declares --force (it threw "force is not defined" on every priced card)',
  /const force\s*= flags\.includes\('--force'\)/.test(grab('async function safePrices')));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
