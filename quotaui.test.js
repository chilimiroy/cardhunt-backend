// ══════════════════════════════════════════════════════════════
// quotaui.test.js — run with: node quotaui.test.js
//
// TASK T3, 2026-09-30: the quota guard refused and the card page showed an
// empty list with "No listing matched this exact card" — false, because
// eBay was never asked. This runs the page's REAL functions (sliced from
// cardhunt_preview.html) and asserts a refusal reaches the panel in words,
// with when listings return, and that an ordinary answer shows no banner.
// ══════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (l, c, why) => { c ? pass++ : fail++;
  console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l + (c || !why ? '' : '  — ' + why)); };

// Slice a top-level function up to the next top-level declaration.
function slice(name) {
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  if (i < 0) return '';
  const rest = src.slice(i + 1);
  const m = rest.slice(1).search(/\n(async function |function |var |const |let )/);
  return m < 0 ? rest : rest.slice(0, m + 1);
}

const ctx = { Date, Math, Number, String, Object, isNaN, document: { getElementById: () => null } };
vm.createContext(ctx);
for (const f of ['liveEsc', 'quotaWhen', 'quotaNum', 'quotaWhy', 'quotaPauseHtml', 'quotaRefusedIn']) {
  const body = slice(f);
  ok(`the page defines ${f}`, body.length > 20);
  vm.runInContext(body, ctx);
}

// Null-safe: against a page without these functions every assertion below
// FAILS and is counted, rather than the suite aborting on the first call.
for (const f of ['quotaPauseHtml', 'quotaRefusedIn']) if (typeof ctx[f] !== 'function') ctx[f] = () => null;

console.log('\nA REFUSAL REACHES THE PANEL IN WORDS\n');
const soon = new Date(Date.now() + 25 * 60e3).toISOString();
const later = new Date(Date.now() + 7 * 3600e3).toISOString();
let h = ctx.quotaPauseHtml({ sources: { ebay: { status: 'quota', limitHit: 'daily', liftsAt: later, reason: 'x' } } });
ok('daily: says eBay listings are paused', /eBay listings are paused/.test(h));
ok('  says the allowance is used up', /allowance is used up/.test(h));
ok('  says when they return', /return at <strong>\d\d:\d\d \(in 7h/.test(h), h);
ok('  says the empty list is not "no listings"', /eBay was not asked/.test(h));
h = ctx.quotaPauseHtml({ sources: { ebay: { status: 'quota', limitHit: 'hourly', liftsAt: soon } } });
ok('hourly: names the hourly limit and a return within the hour', /hour/.test(h) && /\(in 2\d min\)/.test(h), h);
h = ctx.quotaPauseHtml({ sources: { ebay: { status: 'quota', resetsInMinutes: 12 } } });
ok('no liftsAt: still says when, from resetsInMinutes', /in 12 min/.test(h), h);
h = ctx.quotaPauseHtml({ sources: { ebay: { status: 'busy' } } });
ok('busy: said, not an empty list', /busy/.test(h) && /not asked/.test(h));
ok('refusal detected for the indicator refresh',
   ctx.quotaRefusedIn({ sources: { ebay: { status: 'quota' } } }) === true);

console.log('\nAN ORDINARY ANSWER SHOWS NO BANNER\n');
ok('ebay ok — no pause message', ctx.quotaPauseHtml({ sources: { ebay: { status: 'ok', count: 12 } } }) === '');
ok('no ebay source (a Japanese shop only) — none', ctx.quotaPauseHtml({ sources: { yuyutei: { status: 'ok' } } }) === '');
ok('not refused — indicator not forced', ctx.quotaRefusedIn({ sources: { ebay: { status: 'ok' } } }) === false);

console.log('\nWIRING\n');
const rl = slice('renderLiveListings');
ok('renderLiveListings puts the pause message in the panel head', /head \+= pause/.test(rl));
ok('  and drops "No listing matched" when eBay was not asked', /\(pause \? '' :/.test(rl));
ok('fetchListings refreshes the indicator from every answer',
   /refreshQuota\(quotaRefusedIn\(d\)\)/.test(slice('fetchListings')));
ok('the source note names a quota refusal', /v\.status === 'quota'/.test(slice('liveSourceNote')));
ok('the indicator element is in the markup', /id="ebay-quota"/.test(src));
ok('the indicator reads the quota endpoint on load', /refreshQuota\(true\);\n\}\);\s*\/\/ end DOMContentLoade/.test(src));
ok('visibility comes from the server (visible from 50%), not a page constant',
   /el\.hidden = !q\.visible/.test(slice('renderQuota')));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
