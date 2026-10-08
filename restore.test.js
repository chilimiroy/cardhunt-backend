// restore.test.js — return to the same place (TASK-ui T4, 2026-10-07)
//
//   node restore.test.js
//
// Leaving a screen and coming back restores it: every screen's scroll on
// Back; a reopened card's grade selection, Buy It Now / Auction tab, T1 view,
// history range and scroll. The grade is applied BEFORE the card's first
// listings request, so a return asks once at the saved grade (inside the
// server's 15-minute cache: 0 eBay calls) instead of Raw and then the grade.
// Measured in the browser 2026-10-07: PSA 10 + Auctions + history + 1Y,
// Home -> Sets -> the card again: all four back, ONE /api/listings request
// (grade=PSA 10). Set page at 1200px -> card -> Back: 1200; Sets 900 -> 900.
'use strict';
require('./testcount')(19);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const m = new RegExp('(async )?function ' + name + '\\(').exec(H); return m ? H.slice(m.index, H.indexOf('\n}', m.index) + 2) : ''; };

console.log('\n  the remembered view, executed');
const store = {};
const ctx = {
  sessionStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } },
  document: { getElementById: () => ({ classList: { contains: () => true } }) },
  window: { scrollY: 640 },
  S: { currentCard: { id: 'en-sv03.5-199' }, saleType: 'auction', cdView: 'chart', activeRange: '1Y' },
  LF: { grade: 'PSA 10' },
  SEL: { status: 'PSA', condition: '10', otherGrader: null, printing: 'all', edition: 'all' },
  JSON, Object, Date, Math
};
vm.runInNewContext("var CARD_VIEW_KEY = 'ch_cardview', CARD_VIEW_MAX = 30;" + fn('cardViews') + fn('saveCardView') + fn('loadCardView')
  + '; saveCardView(); this.out = loadCardView("en-sv03.5-199"); this.none = loadCardView("en-base1-4");', ctx);
const v = ctx.out || {};
ok('saved: the exact grade asked for', v.grade === 'PSA 10');
ok('saved: the selector state', v.sel && v.sel.status === 'PSA' && v.sel.condition === '10');
ok('saved: the tab, the view, the range, the scroll', v.ltab === 'auction' && v.view === 'chart' && v.range === '1Y' && v.y === 640, JSON.stringify(v));
ok('a card never opened has nothing to restore', ctx.none === null);
ok('identity and choices only — no price is kept', !/price|market|usd|cost|listing/i.test(Object.keys(v).join(' ') + ' ' + Object.keys(v.sel || {}).join(' ')));
ok('per tab (sessionStorage), capped', /sessionStorage\.setItem\(CARD_VIEW_KEY/.test(fn('saveCardView')) && /CARD_VIEW_MAX = 30/.test(H));

console.log('\n  openCard: the saved grade is applied before the first listings request');
const oc = fn('openCard');
const at = s => oc.indexOf(s);
ok('it reads the remembered view, unless the search asked for a grade', /var fromSearch = !!S\.gradeFromSearch;\s*var saved = fromSearch \? null : loadCardView\(id\);/.test(oc));
ok('the selection, tab, view and range are set before the listings are asked',
   at('Object.assign(SEL, saved.sel') > 0 && at('Object.assign(SEL, saved.sel') < at('if (saved) selGrade(saved.grade, base); else renderListingFinder(c);'));
ok('restored: ONE request, at the saved grade (selGrade) — not renderListingFinder and then selGrade',
   /try \{ if \(saved\) selGrade\(saved\.grade, base\); else renderListingFinder\(c\); \}/.test(oc)
   && (oc.match(/renderListingFinder\(/g) || []).length === 1 && (oc.match(/selGrade\(/g) || []).length === 1);
ok('the history range and the scroll come back', /initChart\(base,S\.activeRange\)/.test(oc) && /if \(saved\) restoreScroll\(saved\.y\);/.test(oc));
ok('the card on screen is saved before another one replaces it', at('saveCardView()') > 0 && at('saveCardView()') < at("SS('card')"));
ok('a new card, neither remembered nor searched at a grade, asks Raw NM — never the previous card\'s grade',
   /if \(!saved && !fromSearch\) LF\.grade = 'Raw NM';/.test(oc) && at("LF.grade = 'Raw NM'") < at('renderListingFinder(c)'));
ok('a search that asked for a grade marks it',/LF\.grade = d\.grade; S\.gradeFromSearch = true;/.test(H));

console.log('\n  every change is remembered; Back returns to the scroll');
ok('selGrade, the tabs, the view toggle and the range save the view',
   [fn('selGrade'), fn('setLTab'), fn('toggleCardView'), fn('setR')].every(s => /saveCardView\(\)/.test(s)));
const ss = fn('SS');
ok('SS remembers the scroll of the screen it leaves (and saves a card)', /S\.scrollMem\[cur\]=window\.scrollY; if\(cur==='card'\) saveCardView\(\);/.test(ss));
ok('Back (skipHistory) restores it; any other move starts at the top', /if\(skipHistory&&cur!==id&&S\.scrollMem&&S\.scrollMem\[id\]>0\) restoreScroll\(S\.scrollMem\[id\]\); else \{ SCROLL_SEQ\+\+; window\.scrollTo\(0,0\); \}/.test(ss));
ok('returning to the card screen keeps its range', /initChart\(S\.activeGradeBase,S\.activeRange\|\|'3M'\)/.test(ss));
const rs = fn('restoreScroll');
ok('restoreScroll waits for the page to grow, gives up after 5 s, and yields to the person',
   /Date\.now\(\) \+ 5000/.test(rs) && /'wheel', 'touchstart', 'keydown', 'mousedown'/.test(rs) && /requestAnimationFrame\(step\)/.test(rs));
ok('the page saves on pagehide too', /window\.addEventListener\('pagehide', saveCardView\);/.test(H));

console.log('\n  restore.test.js — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
