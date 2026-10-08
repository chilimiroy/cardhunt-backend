// reports.test.js — report a listing (Roy, 2026-10-08, TASK-reports-and-pages T3)
//
// What a report may hold (reports.js), both ways: what it ACCEPTS as well as
// what it refuses. The rate limit. The page: the Report button sits under
// View listing and outside the row's link; the masters' view renders every
// value as TEXT. A report whose details carry HTML and a script tag is run
// through validate() — exactly what the server stores — and then through the
// page's own reportsRender()/reportItem() against a DOM that throws if
// anything sets innerHTML; the details come out as literal text, and the
// report after it is drawn intact.
//
//   node reports.test.js
//   (the stored path, in Postgres: node reportprobe.js — rolled back)
'use strict';
const fs = require('fs'), vm = require('vm');
const R = require('./reports');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok    ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); };
console.log('\n  reports.test.js\n');

const good = { cardId: 'en-base1-4', listingId: '123456789012', listingUrl: 'https://www.ebay.com/itm/123456789012', source: 'ebay',
  price: 412.5, currency: 'USD', reason: 'fake', details: '', photoChecks: { stamp: { state: 'clean', kind: 'stamp', says: 'no stamp' } } };
const v = o => R.validate(Object.assign({}, good, o));

console.log('  what a report ACCEPTS');
ok('a plain report with no details', v({}).ok);
for (const r of Object.keys(R.REASONS)) ok('reason ' + r + (r === 'other' ? ' (with details)' : ''), v({ reason: r, details: r === 'other' ? 'seller ships a proxy' : '' }).ok);
ok('details of exactly ' + R.DETAILS_MAX + ' characters', v({ details: 'x'.repeat(R.DETAILS_MAX) }).ok);
ok('no price (a row with none)', v({ price: null }).ok && v({ price: null }).row.price === null);
ok('a Japanese card and a shop source', v({ cardId: 'ja-SV2a-201', source: 'yuyutei', listingUrl: 'https://yuyu-tei.jp/x' }).ok);
ok('HTML in the details is accepted AS TEXT (data, not refused, not altered)', v({ details: '<b>x</b>' }).ok && v({ details: '<b>x</b>' }).row.details === '<b>x</b>');

console.log('\n  what it REFUSES');
ok('no reason', !v({ reason: '' }).ok);
ok('an unknown reason', !v({ reason: 'spam' }).ok);
ok('"other" with no details', !v({ reason: 'other', details: '   ' }).ok);
ok('details over ' + R.DETAILS_MAX + ' characters (refused, never silently cut)', !v({ details: 'x'.repeat(R.DETAILS_MAX + 1) }).ok);
ok('a foreign card id', !v({ cardId: 'base1-4' }).ok);
ok('no listing id', !v({ listingId: '' }).ok);
ok('a URL that is not http(s) (javascript:)', !v({ listingUrl: 'javascript:alert(1)' }).ok);
ok('no source', !v({ source: '' }).ok);
ok('a price that is not a number', !v({ price: 'free' }).ok && !v({ price: -1 }).ok);
const pc = R.photoChecksOf({ stamp: { state: 'refused', kind: 'stamp', says: 'x', secret: 'y' }, back: { state: 'own' }, photos: ['data:...'], suspect: 'implausible' });
ok('photo checks keep only the verdict keys (no photo, no extra field)', !pc.photos && !pc.stamp.secret && pc.stamp.state === 'refused' && pc.back.state === 'own' && pc.suspect === 'implausible');
ok('the user id never comes from the body', !('userId' in v({ userId: 'someone-else' }).row));

console.log('\n  the rate limit: ' + R.RATE.map(r => r.label).join(', '));
ok('under both windows: allowed', R.rateRefusal({ w0: 4, w1: 29 }) === null);
ok('5 in 10 minutes: refused', R.rateRefusal({ w0: 5, w1: 5 }) && /10 minutes/.test(R.rateRefusal({ w0: 5, w1: 5 }).limit));
ok('30 in a day: refused even when the last 10 minutes are quiet', R.rateRefusal({ w0: 0, w1: 30 }) && /24 hours/.test(R.rateRefusal({ w0: 0, w1: 30 }).limit));
ok('counted in the table, per account', /FROM listing_reports WHERE user_id = \$1/.test(R.rateSql()));

console.log('\n  the stored eBay price: cleared when actioned or dismissed, or after ' + R.PRICE_KEEP_DAYS + ' days');
const NOW = Date.parse('2026-10-08T12:00:00Z'), DAY = 86400000;
const rep = (o) => Object.assign({ source: 'ebay', price_shown: 412.5, state: 'new', created_at: new Date(NOW - DAY).toISOString() }, o);
ok('KEPT: a new eBay report, a day old', !R.shouldClearPrice(rep({}), NOW));
ok('KEPT: reviewed, 29 days old (reviewed is not a final state)', !R.shouldClearPrice(rep({ state: 'reviewed', created_at: new Date(NOW - 29 * DAY).toISOString() }), NOW));
ok('KEPT: a Yuyu-tei report, actioned and 90 days old (a shop ask is not eBay data)', !R.shouldClearPrice(rep({ source: 'yuyutei', state: 'actioned', created_at: new Date(NOW - 90 * DAY).toISOString() }), NOW));
ok('CLEARED: actioned, a minute old', R.shouldClearPrice(rep({ state: 'actioned', created_at: new Date(NOW - 60000).toISOString() }), NOW));
ok('CLEARED: dismissed', R.shouldClearPrice(rep({ state: 'dismissed' }), NOW));
ok('CLEARED: new, 31 days old (whatever its state)', R.shouldClearPrice(rep({ created_at: new Date(NOW - 31 * DAY).toISOString() }), NOW));
ok('CLEARED: reviewed, 31 days old', R.shouldClearPrice(rep({ state: 'reviewed', created_at: new Date(NOW - 31 * DAY).toISOString() }), NOW));
ok('nothing to clear: an eBay report with no price', !R.shouldClearPrice(rep({ price_shown: null, state: 'dismissed' }), NOW));
const CS = R.clearPricesSql();
ok('the SQL clears the price and its currency, eBay rows only', /SET price_shown = NULL, price_currency = NULL/.test(CS) && /WHERE source = 'ebay' AND price_shown IS NOT NULL/.test(CS));
ok('the SQL uses the same states and days as the rule', /state IN \('actioned', 'dismissed'\)/.test(CS) && new RegExp("interval '" + R.PRICE_KEEP_DAYS + " days'").test(CS));
ok('it never touches listing_id or listing_url, and deletes nothing', !/listing_id|listing_url|DELETE/.test(CS));
// Awaited before the summary (an unawaited assertion never runs: the file exits first).
const clearCheck = (async () => { let sql = null; const fake = { query: async (q) => { sql = q; return { rowCount: 3 }; } };
  const n = await R.clearPrices(fake); ok('clearPrices runs that SQL and returns the count cleared', sql === CS && n === 3); })();

const S = fs.readFileSync(__dirname + '/server.js', 'utf8').replace(/\r/g, '');
console.log('\n  the server');
const sliceRoute = (head) => { const i = S.indexOf(head); return i < 0 ? '' : S.slice(i, S.indexOf('\n});', i)); };
ok('clearPrices runs after a report is filed', /reports\.clearPrices\(db\)/.test(sliceRoute("app.post('/api/reports'")));
ok('clearPrices runs BEFORE the masters\' list is read', (s => s.indexOf('reports.clearPrices(db)') >= 0 && s.indexOf('reports.clearPrices(db)') < s.indexOf('SELECT r.id'))(sliceRoute("app.get('/api/admin/reports'")));
ok('clearPrices runs after a state change (actioned / dismissed clear at once)', (s => s.indexOf('reports.clearPrices(db)') > s.indexOf('UPDATE listing_reports SET state'))(sliceRoute("app.post('/api/admin/reports/:id/state'")));
{ const i = S.indexOf("app.post('/api/deals/refresh'"); const dr = i < 0 ? '' : S.slice(i, S.indexOf('\n});', i));
  const first = dr.indexOf('clearReportPricesForRun()'), ret = dr.search(/return res\.status/);
  ok('the 3-hourly deals refresh runs clearPrices, BEFORE any early return (off, already running)', first > 0 && (ret < 0 || first < ret));
  ok('every refresh answer reports what it did (reportPrices)', (dr.match(/reportPrices/g) || []).length >= 5);
  const fnr = S.slice(S.indexOf('async function clearReportPricesForRun('), S.indexOf('\n}', S.indexOf('async function clearReportPricesForRun(')));
  ok('…through reports.clearPrices, and a missing table is said, not thrown', /require\('\.\/reports'\)\.clearPrices\(db\)/.test(fnr) && /42P01/.test(fnr));
  const W = fs.readFileSync(__dirname + '/.github/workflows/deals-refresh.yml', 'utf8').replace(/\r/g, '');
  ok('the workflow prints reportPrices from the start answer', /jq -c '\.reportPrices' start\.json/.test(W));
  ok('no new scheduled job: the workflow still has its one schedule', (W.match(/cron:/g) || []).length === 1);
  const flows = fs.readdirSync(__dirname + '/.github/workflows');
  ok('no other workflow names clearPrices or reports', flows.every(f => f === 'deals-refresh.yml' || !/clearPrices|listing_reports/.test(fs.readFileSync(__dirname + '/.github/workflows/' + f, 'utf8')))); }
ok('no scheduled job: nothing sets an interval for it', !/setInterval\([^)]*clearPrices|cron[^\n]*clearPrices/i.test(S));
ok('POST /api/reports is access.approved', /app\.post\('\/api\/reports', access\.approved/.test(S));
ok('GET /api/admin/reports is access.master', /app\.get\('\/api\/admin\/reports', access\.master/.test(S));
ok('POST /api/admin/reports/:id/state is access.master', /app\.post\('\/api\/admin\/reports\/:id\/state', access\.master/.test(S));
const post = S.slice(S.indexOf("app.post('/api/reports'"), S.indexOf('\n});', S.indexOf("app.post('/api/reports'")));
ok('the report is stored as validate() returns it, the user id from the token', /reports\.validate\(req\.body\)/.test(post) && /req\.account\.userId/.test(post) && !/req\.body\.user/.test(post));
ok('the rate limit is checked before the insert, 429 when over', post.indexOf('rateRefusal') < post.indexOf('INSERT INTO listing_reports') && /status\(429\)/.test(post));
ok('nothing deletes a report or edits a listing', !/DELETE FROM listing_reports/.test(S));
ok('the server never creates the table', !/CREATE TABLE[^;]*listing_reports/.test(S));

console.log('\n  the migration');
const M = fs.readFileSync(__dirname + '/migration-reports.sql', 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '');
ok('RLS enabled in the same file that creates the table', /CREATE TABLE IF NOT EXISTS listing_reports/.test(M) && /ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY/.test(M));
ok('authenticated reads its OWN rows only', /ON listing_reports FOR SELECT TO authenticated\s+USING \(user_id = \(select auth\.uid\(\)\)\)/.test(M));
ok('no write policy for any API role; writes revoked', !/FOR (INSERT|UPDATE|DELETE|ALL)/.test(M) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON listing_reports FROM anon, authenticated/.test(M));
ok('details capped at 1000 in the schema too', /char_length\(details\) <= 1000/.test(M) && R.DETAILS_MAX === 1000);
ok('the four states, new by default', /DEFAULT 'new' CHECK \(state IN \('new', 'reviewed', 'actioned', 'dismissed'\)\)/.test(M));
ok('who changed the state and when', /state_changed_by\s+uuid/.test(M) && /state_changed_at\s+timestamptz/.test(M));

// ── the page ──
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r/g, '');
const fn = name => { const m = new RegExp('(?:async\\s+)?function ' + name + '\\(').exec(H); return m ? H.slice(m.index, H.indexOf('\n}', m.index) + 2) : ''; };
console.log('\n  the page');
ok('Report sits after the row\'s link closes — under View listing, not inside the <a>', /View listing &#8599;<\/span><\/div><\/a>'\s*\+ reportButtonHtml\(l\)/.test(fn('liveRow')));
ok('no Report button without prices open (listings are for approved accounts)', /if \(!pricesOpen\(\) \|\| !l\) return '';/.test(fn('reportButtonHtml')));
ok('the form captures card, listing, source, price and photo checks itself', /cardId: REPORT\.card\.id/.test(fn('reportSend')) && /photoChecks: \{ stamp: l\.stamp, back: l\.back/.test(fn('reportSend')));
ok('the details box stops at 1000 characters', /<textarea id="report-details" maxlength="1000"/.test(H));
ok('a report that did not send is amber, and says so', /reportSay\('The report was not sent: '/.test(fn('reportSend')) && /m\.className = bad \? 'msg-warn'/.test(fn('reportSay')));
ok('Listing reports beside Approve accounts, masters only', /AUTH\.role === 'master' \? '<button[^']*onclick="adminOpen\(\)">Approve accounts<\/button>'\s*\+ '<button[^']*onclick="reportsOpen\(\)">Listing reports<\/button>'/.test(H));
const view = ['reportsRender', 'reportItem', 'reportsEl', 'reportsSetState', 'reportSay'].map(fn).join('\n');
ok('the masters\' view labels the price as what WE showed at report time, not eBay\'s current price',
  /Price we showed at report time: /.test(fn('reportItem')) && /not eBay\\u2019s current price/.test(fn('reportItem')));
ok('a cleared eBay price says it is no longer kept, never blank', /no longer kept \(cleared when actioned or dismissed, or after 30 days\)/.test(fn('reportItem')));
ok('the masters\' view never uses innerHTML / insertAdjacentHTML / outerHTML', !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(view));

// ── a hostile report, through validate() and the page's own renderer ──
console.log('\n  a hostile report, rendered');
const HOSTILE = '<script>window.__pwned=1<\/script><img src=x onerror="window.__pwned=2"><b>bold</b> </div></div><div class="rep-item">FORGED';
const stored = R.validate(Object.assign({}, good, { reason: 'other', details: HOSTILE })).row;
ok('validate() keeps the details byte for byte (stored as typed, never rewritten)', stored.details === HOSTILE.trim());
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = null; this.attrs = {}; this.style = { cssText: '' }; this.className = ''; this.listeners = {}; }
  set textContent(t) { this.children = []; this._text = String(t); }
  get textContent() { return this._text != null ? this._text : this.children.map(c => c.textContent).join(''); }
  set innerHTML(x) { throw new Error('innerHTML was set on <' + this.tagName + '>: ' + String(x).slice(0, 60)); }
  set outerHTML(x) { throw new Error('outerHTML was set'); }
  insertAdjacentHTML() { throw new Error('insertAdjacentHTML was called'); }
  appendChild(c) { this._text = null; this.children.push(c); return c; }
  replaceChildren() { this.children = []; this._text = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, f) { this.listeners[k] = f; }
  serialize() {
    const a = Object.entries(Object.assign({}, this.attrs, this.className ? { class: this.className } : {}, this.href ? { href: this.href } : {}))
      .map(([k, v]) => ' ' + k + '="' + esc(v).replace(/"/g, '&quot;') + '"').join('');
    return '<' + this.tagName.toLowerCase() + a + '>' + (this._text != null ? esc(this._text) : this.children.map(c => c.serialize()).join('')) + '</' + this.tagName.toLowerCase() + '>';
  }
}
const host = new El('div');
const allEls = e => [e].concat(...e.children.map(allEls));
const ctx = { document: { createElement: t => new El(t), getElementById: id => id === 'reports-body' ? host : null },
  REPORTS: null, openCard() {}, closeM() {}, console };
vm.createContext(ctx);
let ran = null;
try {
  vm.runInContext(['reportsEl', 'reportsRender', 'reportItem'].map(fn).join('\n') + '\nvar REPORTS = { data: null, error: null };', ctx);
  const row = (id, details, email) => ({ id, created_at: '2026-10-08T10:00:00Z', user_id: '00000000-0000-4000-8000-000000000001', reporter_email: email,
    card_id: 'en-base1-4', card_name: 'Charizard', card_number: '4', set_name: 'Base', listing_id: '123', listing_url: 'https://www.ebay.com/itm/123',
    source: 'ebay', price_shown: 412.5, price_currency: 'USD', reason: 'other', details, photo_checks: { stamp: { state: 'clean', kind: 'stamp' } }, state: 'new' });
  ctx.REPORTS.data = { reasons: R.REASONS, states: R.STATES, reports: [row(2, stored.details, '<i>evil</i>@x.com'), row(1, 'An ordinary report after it.', 'roy@example.com')] };
  vm.runInContext('reportsRender()', ctx);
  ran = host.serialize();
} catch (e) { ok('the masters\' view renders without touching innerHTML', false, e.message); }
if (ran != null) {
  ok('the masters\' view renders without touching innerHTML', true);
  const items = host.children.filter(c => c.className === 'rep-item');
  ok('two reports drawn, as two items', items.length === 2, items.length);
  const det = items[0] && items[0].children.find(c => c.className === 'rep-details');
  ok('the hostile details are ONE text node equal to what was typed', det && det._text === stored.details && det.children.length === 0);
  ok('serialized, the script tag is inert text (&lt;script&gt;), never a <script> element', ran.includes('&lt;script&gt;window.__pwned=1&lt;/script&gt;') && !/<script/i.test(ran));
  ok('the img/onerror is text, no element carries an event attribute', ran.includes('&lt;img src=x onerror=') && !/<img/i.test(ran) && !allEls(host).some(e => Object.keys(e.attrs).some(k => /^on/i.test(k))));
  ok('its forged closing tags did not end the item: the next report is intact', items[1] && items[1].children.some(c => c.className === 'rep-details' && c._text === 'An ordinary report after it.'));
  ok('no forged item exists (only the two real ones)', allEls(host).filter(e => e.className === 'rep-item').length === 2 && (ran.match(/<div class="rep-item">/g) || []).length === 2);
  ok('a hostile email is text too', ran.includes('&lt;i&gt;evil&lt;/i&gt;@x.com'));
  ok('the listing link is only ever http(s)', /\/\^https\?:\\\/\\\/\/i\.test\(x\.listing_url\)/.test(fn('reportItem')));
}

clearCheck.then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
