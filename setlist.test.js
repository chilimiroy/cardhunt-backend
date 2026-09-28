// setlist.test.js — the set list the FRONTEND browses must be the one the
// rest of the app can resolve.
//
//   node setlist.test.js                 against the deployed API
//   CARDHUNT_API=http://localhost:3001 node setlist.test.js
//
// The bug this exists for. The page browsed /api/sets — 176 sets carrying
// pokemontcg.io ids (sv3pt5, base6, swsh35) — while cards, prices and
// listings are all keyed on our own ids from /api/sets/lang/en (214 sets:
// sv03.5, lc, swsh3.5). The server aliases most of the old ids, so it looked
// fine. 33 had no alias, and each broke one of two ways:
//
//   * returned ZERO cards -> openSet fell through to tcgdexFetchSet and drew
//     the whole set as mockP() estimates. A $882 card read $7.67.
//   * returned pokemontcg.io cards with ids like "base6-1" instead of
//     "en-lc-1" -> /api/listings could not resolve them, so no links.
//
// Plus 92 sets that ARE in the database could not be reached from the UI.
//
// Neither cardmatch nor estimator was wrong. Every unit suite passed. The bug
// was in WHICH list the page walked — so this test walks the real endpoints
// and asserts the two paths agree, which is the technique that has found more
// in this project than any other.

const fs = require('fs');
const path = require('path');

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const OURS = /^(en|ja|zh-tw|zh-cn)-/;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
}
const get = p => fetch(BASE + p).then(r => r.json()).catch(e => ({ _err: e.message }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pull the page's own source so this tests the SHIPPED frontend, not a copy
// of its logic. A test that re-implements what it checks cannot catch a
// frontend that stopped doing it.
const html = fs.readFileSync(path.join(__dirname, 'cardhunt_preview.html'), 'utf8');
// Slice one function's source: from its declaration to the next TOP-LEVEL
// declaration, counting `async function` as one.
//
// Two ways this has already been wrong, in opposite directions:
//   * a fixed 2600-byte slice TRUNCATED renderMarketData, failing an
//     assertion about code that was present;
//   * terminating only on "\nfunction " OVER-RAN, because openCard is
//     followed by `async function fetchMarketPrice` — so openCard's slice
//     swallowed a whole other function and any positive assertion about
//     openCard could have passed on fetchMarketPrice's code instead.
//
// Under-slicing produces a false FAIL, which is noisy but safe. Over-slicing
// produces a false PASS, which is the one that matters: it is a guard
// reporting green about text it never looked at.
//
// fnSrc() is checked by its own assertions below — a helper this test's other
// 19 assertions all depend on cannot itself be unverified.
const FN_DECL = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/g;
const fnSrc = name => {
  const decl = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = decl.exec(html);
  if (!m) return '';
  const start = m.index;
  FN_DECL.lastIndex = start + 1;
  const next = FN_DECL.exec(html);
  return html.slice(start, next ? next.index : Math.min(start + 6000, html.length));
};

(async () => {
  console.log('\n1. THE FRONTEND BROWSES THE RESOLVABLE LIST');

  // The page is one file with one inline script. A syntax error in it breaks
  // every screen at once and no other suite would notice, because they all
  // test modules the page merely loads. Parse it the way the browser will.
  const vm = require('vm');
  let scripts = 0, parseErr = null;
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    scripts++;
    try { new vm.Script(m[1], { filename: 'inline' + scripts }); }
    catch (e) { parseErr = 'inline script ' + scripts + ': ' + e.message; }
  }
  ok(`the page's ${scripts} inline script(s) parse`, !parseErr, parseErr);

  // ── the helper, before anything that leans on it ─────────────
  // 19 assertions below read source through fnSrc(). If it slices the wrong
  // span they report on code they never looked at, which is how this suite
  // has already been wrong twice.
  const decls = s => (s.match(/\n\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g) || [])
    .map(x => x.trim().replace(/\s*\($/, ''));
  ok('fnSrc slices exactly one function (openCard, followed by an async one)',
    decls(fnSrc('openCard')).length === 0,
    'swallowed: ' + decls(fnSrc('openCard')).join(', '));
  ok('fnSrc finds an async function by name',
    /^async function openCard\(/.test(fnSrc('openCard')),
    JSON.stringify(fnSrc('openCard').slice(0, 40)));
  ok('fnSrc reaches the END of a long function',
    /^function renderMarketData\(/.test(fnSrc('renderMarketData'))
      && /m\.graded/.test(fnSrc('renderMarketData')),
    'renderMarketData was truncated again');
  ok('fnSrc returns empty for a name that does not exist',
    fnSrc('thisFunctionDoesNotExist__') === '');

  // setaudit.js is what proves the API side is clean. That argument is only
  // reproducible if the tool ships with the code, and every other probe in
  // this project is gitignored — so this is easy to lose by pattern. The
  // `!setaudit.js` negation in .gitignore helps only against a rule added
  // ABOVE it (git is last-match-wins); being in the index is the real
  // guarantee, so assert that directly.
  let tracked = false;
  try {
    require('child_process').execFileSync('git',
      ['ls-files', '--error-unmatch', 'setaudit.js'],
      { cwd: __dirname, stdio: 'ignore' });
    tracked = true;
  } catch (e) { tracked = false; }
  ok('setaudit.js is tracked by git', tracked,
    'it is the tool that proves the API is clean — it must ship with the code');

  // TASK T3 (2026-09-28): the handoff document and every suite were
  // gitignored as "local tooling", so a clone had neither. Being in the
  // index is the guarantee, so ask the index — about EVERY suite on disk,
  // not a list that a new suite could be missing from.
  const fs2 = require('fs');
  const mustTrack = ['CLAUDE.md', 'PROGRESS.md', 'jptest.js']
    .concat(fs2.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f)));
  const untracked = mustTrack.filter(f => {
    try {
      require('child_process').execFileSync('git', ['ls-files', '--error-unmatch', f],
        { cwd: __dirname, stdio: 'ignore' });
      return false;
    } catch (e) { return true; }
  });
  ok('CLAUDE.md, PROGRESS.md and all ' + (mustTrack.length - 3) + ' *.test.js files are tracked',
    untracked.length === 0, 'not in the index: ' + untracked.join(', '));

  const loadAll = fnSrc('loadAllSets');
  ok('loadAllSets exists', !!loadAll);
  // Do not pin the call's arity: loadLangSets('en') gained a `force` argument
  // for the cold-start retry and this assertion failed on a correct page.
  ok('loadAllSets uses /api/sets/lang (our ids), not /api/sets',
    /loadLangSets\(\s*['"]en['"]/.test(loadAll) && !/apiFetch\(\s*['"]\/api\/sets['"]\s*\)/.test(loadAll),
    'it browses the pokemontcg-id list again');
  ok('EN_SETS is kept only as the offline fallback',
    /S\.enSets\s*=\s*EN_SETS/.test(loadAll));

  const setLangSrc = fnSrc('setLang');
  ok('setLang routes English through loadAllSets',
    /l\s*===\s*['"]en['"][\s\S]{0,80}loadAllSets\(\)/.test(setLangSrc));

  console.log('\n2. EVERY BROWSED SET RESOLVES  (the database list)');

  const db = (await get('/api/sets/lang/en')).sets || [];
  ok('the database set list loads', db.length > 150, `${db.length} sets`);

  // Sample across the whole space rather than the first N: the failures
  // clustered in promos, trainer kits and reprint sets, which sort last.
  const pick = [];
  const step = Math.max(1, Math.floor(db.length / 24));
  for (let i = 0; i < db.length; i += step) pick.push(db[i]);
  // Plus the ones that were actually broken, by name, so a regression on
  // exactly these is caught by name and not by luck of the sampling.
  const NAMED = ['lc', 'swsh3.5', 'sm7.5', 'sm3.5', 'sv03.5', 'me02.5'];
  for (const id of NAMED) {
    const s = db.find(d => d.id === id);
    if (s && !pick.includes(s)) pick.push(s);
  }

  let empty = 0, foreign = 0, checked = 0;
  const problems = [];
  for (const s of pick) {
    const d = await get(`/api/sets/${encodeURIComponent(s.id)}/cards?lang=en&uiSetId=${encodeURIComponent(s.id)}`);
    const rows = d.data || [];
    checked++;
    if (!rows.length) { empty++; problems.push(`${s.id} returned 0 cards`); }
    else if (!OURS.test(String(rows[0].id || ''))) {
      foreign++; problems.push(`${s.id} returned foreign ids (${rows[0].id}, source ${d.source})`);
    }
    await sleep(90);
  }
  ok(`no browsed set returns zero cards (${checked} sampled)`, empty === 0, `${empty} empty`);
  ok(`no browsed set returns foreign card ids (${checked} sampled)`, foreign === 0, `${foreign} foreign`);
  problems.slice(0, 8).forEach(p => console.log('          ' + p));

  console.log('\n3. THE TWO PATHS AGREE  (set page vs card page)');

  // A card with a database price must never come back as an estimate, and the
  // set listing and the card endpoint must agree about it.
  let compared = 0, disagreed = 0, estimated = 0;
  for (const s of pick.slice(0, 10)) {
    const d = await get(`/api/sets/${encodeURIComponent(s.id)}/cards?lang=en&uiSetId=${encodeURIComponent(s.id)}`);
    const rows = (d.data || []).filter(c => c._priceIsReal && c._price > 0);
    if (!rows.length) continue;
    // the most valuable card in the set — where a collapse to an estimate costs most
    const top = rows.sort((a, b) => b._price - a._price)[0];
    const one = await get('/api/cards/' + encodeURIComponent(top.id));
    const c = one.data || one;
    compared++;
    if (!c || c._price == null) { disagreed++; problems.push(`${top.id}: set page $${top._price}, card endpoint has no price`); continue; }
    if (!c._priceIsReal) { estimated++; problems.push(`${top.id}: set page real $${top._price}, card endpoint estimate $${c._price}`); }
    const ratio = Math.max(top._price, c._price) / Math.min(top._price, c._price);
    if (ratio > 1.5) { disagreed++; problems.push(`${top.id}: $${top._price} vs $${c._price} (${ratio.toFixed(1)}x)`); }
    await sleep(90);
  }
  ok(`set page and card page agree on price (${compared} cards)`, disagreed === 0, `${disagreed} disagreed`);
  ok('a card with a database price never returns an estimate', estimated === 0, `${estimated} estimated`);

  console.log('\n4. THE FALLBACKS ANNOUNCE THEMSELVES');

  const note = fnSrc('setSourceNote');
  ok('setSourceNote handles the plain tcgdex fallback',
    /source === 'tcgdex'/.test(note),
    'English + tcgdex fell off the end of the chain and returned silently');
  ok('...and calls it an ESTIMATE in words', /ESTIMATE/.test(note));
  ok('the pokemontcg note warns that listing links may not resolve',
    /listing links may not resolve/.test(note));

  const openCardSrc = fnSrc('openCard');
  // Assert the SHAPE, not a variable name: the old code was
  // `var c = CARD_CACHE[id]; if (!c) { fetch }`, which serves whatever the
  // set page happened to cache. CARD_CACHE has no expiry, so one visit to a
  // fallback set pinned an estimate for that card for the whole session.
  ok('openCard never takes CARD_CACHE as the card outright',
    !/var\s+c\s*=\s*CARD_CACHE\[/.test(openCardSrc),
    'the unconditional cache read is back');
  ok('openCard gates the cache on the price being real',
    /_priceIsReal[\s\S]{0,200}CARD_CACHE|CARD_CACHE[\s\S]{0,200}_priceIsReal/.test(openCardSrc)
      && /apiFetch\('\/api\/cards\/'/.test(openCardSrc),
    'it must still fetch the database when the cached copy is an estimate');

  const updSrc = fnSrc('updatePrices');
  ok('the card page marks a derived headline price as est',
    /priceIsReal/.test(updSrc));

  console.log('\n5. A NAME-MATCHED AGGREGATE NEVER OVERWRITES A NUMBER-MATCHED PRICE');

  // /api/market matches on name + set only — tcgplayerPrice() takes no
  // collector number. Ascended Heroes carries Mega Hawlucha ex three times
  // at $0.70, $5.90 and $56.34, and /api/market returns one figure for all
  // three that is none of them. The card page was pasting that over the
  // headline, badged "high confidence".
  const set = await get('/api/sets/me02.5/cards?lang=en&uiSetId=me02.5');
  const dupes = {};
  for (const c of set.data || []) {
    if (c._priceIsReal && c._price > 0) (dupes[c.name] = dupes[c.name] || []).push(c);
  }
  const collide = Object.values(dupes).filter(v => v.length > 1)
    .sort((a, b) => (Math.max(...b.map(c => c._price)) / Math.min(...b.map(c => c._price)))
                  - (Math.max(...a.map(c => c._price)) / Math.min(...a.map(c => c._price))))[0];

  if (!collide) {
    // A tool that cannot check something must say so.
    console.log('  SKIP  no same-name variants with real prices in me02.5 right now');
  } else {
    const lo = collide.reduce((a, b) => a._price < b._price ? a : b);
    const hi = collide.reduce((a, b) => a._price > b._price ? a : b);
    console.log(`        ${lo.name}: #${lo.number} $${lo._price} vs #${hi.number} $${hi._price}`);
    const mk = await get('/api/market/' + encodeURIComponent(lo.name)
      + '?set=' + encodeURIComponent((lo.set && lo.set.name) || '')
      + '&grade=Raw%20NM&cardId=' + encodeURIComponent(lo.id));
    console.log(`        /api/market says $${mk.marketValue} for cardId=${lo.id}`);
    // Documents the endpoint's real behaviour rather than asserting it is
    // fixed: the FRONTEND must be safe whether or not it ever is.
    ok('the frontend does not trust /api/market for a card that has its own price',
      /haveNumberMatched/.test(fnSrc('renderMarketData')),
      'renderMarketData overwrites the headline again');
    ok('the confidence badge does not vouch for a price it did not produce',
      /haveNumberMatched[\s\S]{0,400}badgeHost|badgeHost[\s\S]{0,200}haveNumberMatched/
        .test(fnSrc('renderMarketData')));
    ok('an aggregate shown in place of a missing price is labelled a name match',
      /name match/.test(fnSrc('renderMarketData')));

    // The endpoint itself, now that it uses the cardId it is given. Two paths
    // that should agree, asserted to agree — the technique that has found
    // more here than any other.
    let agreed = 0, differed = 0;
    for (const c of collide) {
      const mk = await get('/api/market/' + encodeURIComponent(c.name)
        + '?set=' + encodeURIComponent((c.set && c.set.name) || '')
        + '&grade=Raw%20NM&cardId=' + encodeURIComponent(c.id));
      if (mk.matchedOn === 'collector number' && Math.abs(mk.marketValue - c._price) < 0.02) agreed++;
      else { differed++; problems.push(`${c.id}: set page $${c._price}, /api/market $${mk.marketValue} (${mk.matchedOn})`); }
      await sleep(90);
    }
    ok(`/api/market agrees with the set listing for each variant (${collide.length})`,
      differed === 0, `${differed} differed`);

    // And it must ADMIT it when it cannot identify the card, rather than
    // answering with whatever the name search returned.
    const anon = await get('/api/market/' + encodeURIComponent(lo.name)
      + '?set=' + encodeURIComponent((lo.set && lo.set.name) || '') + '&grade=Raw%20NM');
    ok('without a cardId it reports matchedOn name+set and warns',
      anon.matchedOn === 'name+set' && /different variant/.test(anon.matchWarning || ''),
      `matchedOn=${anon.matchedOn}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (problems.length) {
    console.log('\nproblems seen:');
    problems.slice(0, 20).forEach(p => console.log('  - ' + p));
  }
  process.exitCode = fail ? 1 : 0;
})();
