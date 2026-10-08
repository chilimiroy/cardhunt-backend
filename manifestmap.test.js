// manifestmap.test.js — `manifest` never turns absent rarity into a rarity (TASK T5)
//   node manifestmap.test.js
// ingest.js is local-only, so this reads it when present and says SKIP when
// not. TCGdex answers rarity "None" for 591 English and 2,110 Japanese cards
// (probed 2026-09-28) — its way of saying it has no rarity. ingest.js mapped
// 'None' to 'Common', so every manifest run wrote Common over whatever was
// held; the catalogue still carries 1,737 Japanese "Common" rows on cards
// TCGdex calls None, 201 of them numbered past their set's printed total.
'use strict';
require('./testcount')(12);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log('  ' + (c ? 'ok  ' : 'FAIL') + '  ' + n + (c || !d ? '' : '  — ' + d)); };

if (!fs.existsSync(__dirname + '/ingest.js')) {
  console.log('  SKIP  manifestmap.test.js — ingest.js is local-only and not in this checkout');
  process.exit(0);
}
const src = fs.readFileSync(__dirname + '/ingest.js', 'utf8');
const mapSrc = (src.match(/const TCGDEX_RARITY = \{[\s\S]*?\n\};/) || [''])[0];
ok('TCGDEX_RARITY found', mapSrc.length > 200);
// Evaluate the real table, comments and all.
// eslint-disable-next-line no-new-func
const MAP = new Function(mapSrc.replace('const TCGDEX_RARITY =', 'return ') )();
ok('"None" is NOT mapped to anything', !Object.prototype.hasOwnProperty.call(MAP, 'None'), 'None -> ' + MAP.None);
ok('"Classic Collection" maps to itself (the 25 cel25cc cards)', MAP['Classic Collection'] === 'Classic Collection');
// What it must still ALLOW: the ordinary rarities keep mapping.
for (const [k, v] of [['Common', 'Common'], ['Uncommon', 'Uncommon'], ['Rare Holo', 'Rare Holo'],
                      ['Special illustration rare', 'Special Illustration Rare'], ['Double rare', 'Double Rare'],
                      ['Promo', 'Promo']])
  ok('still maps ' + k + ' -> ' + v, MAP[k] === v, String(MAP[k]));

const loop = src.slice(src.indexOf('async function buildManifest'), src.indexOf('async function buildManifest') + 12000);
ok('buildManifest discards a "None" before normRarity can see it',
  /d\.rarity && d\.rarity !== 'None' \? d\.rarity : null/.test(loop));
ok('buildManifest skips a card with no rarity (absent never overwrites stored)',
  /if \(!rarity\) continue;/.test(loop));
ok('manifest records where the rarity came from', /rarity_source='tcgdex'/.test(loop));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
