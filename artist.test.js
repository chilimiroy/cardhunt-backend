// artist.test.js — the artist is stored by the nightly, not fetched by the page
// (Roy, 2026-10-08).
//
//   node artist.test.js
'use strict';
require('./testcount')(12);
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  artist.test.js\n');
const rd = f => fs.readFileSync(__dirname + '/' + f, 'utf8').replace(/\r/g, '');
const I = rd('ingest.js'), S = rd('server.js'), H = rd('cardhunt_preview.html'), M = rd('migration-illustrator.sql').replace(/--.*$/gm, '');
const fnOf = (src, name) => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };

console.log('  stored');
ok('the migration adds illustrator and illustrator_checked_at to cards', /ADD COLUMN IF NOT EXISTS illustrator text/.test(M) && /ADD COLUMN IF NOT EXISTS illustrator_checked_at timestamptz/.test(M));
ok('nothing but the migration creates them', !/ADD COLUMN[^;]*illustrator/.test(I + S));
const tp = fnOf(I, 'tcgdexPriceFor'), wi = fnOf(I, 'writeIllustrator');
ok('the nightly\'s TCGdex call stores it — the response it already has, no extra request',
  /await writeIllustrator\(card, d\.illustrator\);/.test(tp) && (tp.match(/fetch\(/g) || []).length === 1);
ok('…before any early return on the price (a card with no TCGplayer price still gets its artist)',
  tp.indexOf('await writeIllustrator(') < tp.indexOf("none: 'no-tcgplayer'"));
ok('a missing artist never blanks a stored one (COALESCE)', /illustrator = COALESCE\(\$2, illustrator\)/.test(wi));
ok('when it was asked is recorded (asked-and-none told from never-asked)', /illustrator_checked_at = NOW\(\)/.test(wi));
ok('no column yet: it says so once and writes nothing', /run migration-illustrator\.sql/.test(wi) && /if \(!_illusCol\)/.test(wi));

console.log('\n  served and shown');
ok('the card endpoint sends the stored artist (null without one)', /illustrator: c\.illustrator \|\| null,/.test(S));
const sub = fnOf(H, 'renderCardSub');
ok('the card page draws the stored artist, escaped', /c\.illustrator \? liveEsc\(c\.illustrator\)/.test(sub));
ok('…and says "not recorded" without one', /not recorded/.test(sub));
ok('the page never asks TCGdex for an artist (fetchArtist and its cache are gone)', !/fetchArtist|ARTIST_CACHE/.test(H) && !/illustrator/.test(H.replace(/c\.illustrator/g, '').replace(/<!--[\s\S]*?-->|\/\/[^\n]*/g, '')));
ok('no TCGdex request in the card page\'s render', !/fetch\(/.test(sub));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
