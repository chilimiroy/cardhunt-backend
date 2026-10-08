// i18n.test.js — page language, English and Japanese (T5, 2026-10-06)
//
// UI strings only, NEVER card data: search, the gates and every matcher work
// on the English card names, set names, rarities and grades. The page holds
// one exact-text table (LANG_JA); a text node is translated only when its
// whole trimmed text is a key. This pins what the table may hold and how
// the page applies it.
//
//   node i18n.test.js          offline
//   node i18n.test.js --db     also: no key is any card name, set name or
//                              rarity in the catalogue (needs DATABASE_URL)

require('./testcount')(50);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const cm = require('./cardmatch.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };

const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const start = H.indexOf('var LANG_JA = {'), end = H.indexOf('\n};', start);
ok('the page holds one table, LANG_JA', start > 0 && end > start && H.indexOf('var LANG_JA = {', start + 1) < 0);
let LANG_JA = {};
try { LANG_JA = new Function(H.slice(start, end + 3) + '; return LANG_JA;')(); } catch (e) { ok('LANG_JA parses', false, e.message); }
// TASK-ui T5 (2026-10-07): Traditional and Simplified Chinese, the same English keys.
const table = name => { const s = H.indexOf('var ' + name + ' = {'), e = H.indexOf('\n};', s);
  try { return s > 0 ? new Function(H.slice(s, e + 3) + '; return ' + name + ';')() : null; } catch (err) { return null; } };
const TABLES = { ja: LANG_JA, 'zh-TW': table('LANG_ZH_TW'), 'zh-CN': table('LANG_ZH_CN') };
ok('a table per language: ja, zh-TW, zh-CN', Object.values(TABLES).every(t => t && Object.keys(t).length >= 100));
const groups = (() => { const s = H.indexOf('var LANG_GROUPS = '), e = H.indexOf('];', s);
  try { return new Function('return ' + H.slice(s + 18, e + 1))(); } catch (err) { return []; } })();
ok('the split sentences are named (LANG_GROUPS)', groups.length >= 3, groups.length);
const union = [...new Set([].concat(...Object.values(TABLES).map(t => Object.keys(t || {}))))];
console.log('\n  coverage, per language, of the ' + union.length + ' page strings any table translates');
for (const [l, t] of Object.entries(TABLES)) {
  const tr = union.filter(k => t && t[k]).length;
  console.log('    ' + l.padEnd(6) + tr + ' translated, ' + (union.length - tr) + ' fall back to English (' + Math.floor(100 * tr / union.length) + '%)');
  ok(l + ': every value is in its script', Object.values(t || {}).every(v => /[぀-ヿ一-鿿]/.test(v) || /^[^A-Za-z]*$/.test(v)));
  ok(l + ': a split sentence is all in the table or none of it (never spliced)', groups.every(g => g.every(k => k in t) || g.every(k => !(k in t))));
}
const keys = union;
ok('the table is the static text (100+ entries)', keys.length >= 100, keys.length + ' keys');
ok('every value is Japanese, never empty', keys.every(k => LANG_JA[k] && /[぀-ヿ一-龯]|^[^A-Za-z]*$/.test(LANG_JA[k]) || /eBay|TCGPlayer|Amazon|TCGdex|CardHunt|A–Z|Z–A|PSA/.test(LANG_JA[k])),
   keys.filter(k => !LANG_JA[k]).join(', '));

console.log('\n  what the table may NOT hold');
const decode = s => s.replace(/&mdash;/g, '—').replace(/&hellip;/g, '…').replace(/&rsquo;/g, '’').replace(/&#8599;/g, '↗')
  .replace(/&#9878;&#65039;/g, '⚖️').replace(/&amp;/g, '&');
const page = decode(H);
const missing = keys.filter(k => !page.includes(k));
ok('every key is text the page actually carries (no stale entries)', missing.length === 0, missing.join(' | '));
const grades = keys.filter(k => { const g = cm.parseGrade(k); return g && g.kind === 'graded'; });
ok('no grade is a key (PSA 10 stays PSA 10)', grades.length === 0, grades.join(', '));
for (const k of ['Raw NM', 'Raw LP', 'Raw', 'Base Set', 'Scarlet & Violet', 'Common', 'Uncommon', 'Rare', 'Holo Rare', 'Double Rare',
                 'SIR', 'Hyper Rare', 'Secret Rare', 'Promo', 'Trainer', 'Energy', 'Pokémon', 'Pokémon TCG', 'Magic', 'One Piece', 'Lorcana'])
  ok('not a key — card or catalogue data: ' + k, !(k in LANG_JA));
ok('"any card" is not a key — the alert form compares that text (ap-card)', !('any card' in LANG_JA)
   && /getElementById\('ap-card'\)\.textContent==='any card'/.test(H));

console.log('\n  how the page applies it');
const fn = name => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('\n}', i) + 2); };
ok('the head sets lang before paint from localStorage ch_lang — ja, zh-TW or zh-CN, else English',
   /<head>[\s\S]*var l=localStorage\.getItem\('ch_lang'\);if\(l==='ja'\|\|l==='zh-TW'\|\|l==='zh-CN'\)document\.documentElement\.setAttribute\('lang',l\)[\s\S]*<\/head>/.test(H)
   && H.indexOf("getItem('ch_lang')") < H.indexOf('<body'));
ok('a node is translated only when its WHOLE trimmed text is a key of the active table', /key = raw\.replace\(\/\\s\+\/g, ' '\)\.trim\(\), tr = key && LANG_T\[key\]/.test(fn('langNode')));
ok('a table holding part of a split sentence loses all of it at load (English, never spliced)',
   /if \(!g\.every\(function \(k\) \{ return k in T; \}\)\) g\.forEach\(function \(k\) \{ delete T\[k\]; \}\);/.test(H));
ok('switching language starts from English every time (no table over another)',
   fn('applyLang').indexOf('LANG_ORIG.forEach') < fn('applyLang').indexOf('LANG_T = LANG_TABLES[l]'));
ok('coverage is counted from the tables, and the menu shows it', /function langCoverage\(l\)/.test(H) && /c\.pct \+ '%'/.test(fn('pickRender')));
ok('an <option> without a value gets its English pinned first (select.value stays English)',
   /p\.tagName === 'OPTION' && !p\.hasAttribute\('value'\)\) p\.setAttribute\('value', key\)/.test(fn('langNode')));
ok('switching back restores only nodes still showing what was written', /n\.nodeValue === v\[1\]\) n\.nodeValue = v\[0\]/.test(fn('applyLang')));
ok('re-rendered content is read the same way (MutationObserver, Japanese only)', /new MutationObserver/.test(fn('applyLang')) && /LANG_OBS\.disconnect\(\)/.test(fn('applyLang')));
ok('scripts and styles are never walked', /SCRIPT\|STYLE/.test(fn('langWalk')));

console.log('\n  the control: top bar, between the currency tool and the alert bell');
// TASK-ui T5: both are the same picker; currency carries a coin (no blue globe) and is .price-only.
const nav1 = H.slice(H.indexOf('id="cur-pick"') - 60, H.indexOf('id="cur-pick"') + 1600);
ok('main nav: currency, then language, then the bell', /id="currency-btn"[^]*?id="lang-btn"[^]*?notif-bell/.test(nav1));
// One top bar (T7, 2026-10-08): the portfolio's second copy of each picker is gone.
ok('one copy of each picker: no cur-pick2 / lang-pick2', !/id="(cur|lang)-pick2"/.test(H));
ok('one component: both pickers are .npick with an .npick-b button and a menu',
   ['cur-pick', 'lang-pick'].every(id => new RegExp('<div class="npick[^"]*" id="' + id + '"><button class="btn npick-b"').test(H)));
ok('currency: a coin icon, no globe, and absent without prices (.price-only)',
   /<div class="npick price-only" id="cur-pick"><button[^>]*><svg class="npick-i coin"/.test(H)
   && !/🌐|&#127760;/.test(H.slice(H.indexOf('<body')).replace(/<!--[\s\S]*?-->/g, '')));
ok('the old cycling controls are gone, not left dormant', !/function toggleCurrency|function cycleLang/.test(H));
ok('the theme toggle is untouched, before currency', H.indexOf('id="theme-btn"') < H.indexOf('id="currency-btn"'));

(async () => {
  if (process.argv.includes('--db')) {
    console.log('\n  against the catalogue (--db)');
    const c = require('./schemaguard').testClient();   // refuses schema changes
    await c.connect();
    const r = await c.query(`select distinct v from (select name v from cards union select name_en from cards union select set_name from cards
                             union select set_name_en from cards union select rarity from cards) x where v is not null`);
    await c.end();
    const data = new Set(r.rows.map(x => String(x.v).trim()));
    const clash = keys.filter(k => data.has(k));
    ok('no key is a card name, set name or rarity in the catalogue (' + data.size + ' values)', clash.length === 0, clash.join(', '));
  }
  console.log('\n  i18n.test.js — ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
