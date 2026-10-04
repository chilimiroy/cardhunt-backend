// certcheck.test.js — the on-demand cert check (TASK T2), eBay half.
//   node certcheck.test.js
// Fixtures are the two live getItem descriptor sets measured 2026-09-28 on
// Base Set Charizard PSA 9 (one with a cert number, one without).
const cc = require('./certcheck');
const fs = require('fs');
let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

const WITH = { conditionDescriptors: [
  { name: 'Professional Grader', values: [{ content: 'Professional Sports Authenticator (PSA)' }] },
  { name: 'Grade', values: [{ content: '9' }] },
  { name: 'Certification Number', values: [{ content: '170514194' }] } ] };
const WITHOUT = { conditionDescriptors: [
  { name: 'Professional Grader', values: [{ content: 'Professional Sports Authenticator (PSA)' }] },
  { name: 'Grade', values: [{ content: '9' }] } ] };
const CGC = { conditionDescriptors: [
  { name: 'Professional Grader', values: [{ content: 'Certified Guaranty Company (CGC)' }] },
  { name: 'Grade', values: [{ content: '10' }] },
  { name: 'Certification Number', values: [{ content: '4123456789' }] } ] };

console.log('\n  readCert — what the seller entered');
const r1 = cc.readCert(WITH), r2 = cc.readCert(WITHOUT), r3 = cc.readCert(CGC);
eq('PSA slab with a number: grader', r1.grader, 'PSA');
eq('PSA slab with a number: cert', r1.cert, '170514194');
eq('PSA slab with a number: grade', r1.grade, '9');
eq('9-digit PSA cert passes the shape check', r1.certLooksValid, true);
eq('PSA slab with no number: cert null', r2.cert, null);
eq('CGC recognised from the long name', r3.grader, 'CGC');
eq('an item with no descriptors reads as nothing', cc.readCert({}).cert, null);
eq('a raw card (Card Condition only) has no grader', cc.readCert({ conditionDescriptors: [{ name: 'Card Condition', values: [{ content: 'Near Mint or Better' }] }] }).grader, null);

console.log('\n  states — never claim more than was checked');
eq('no number -> no-cert', cc.stateFromEbay(r2, 'PSA').state, 'no-cert');
eq('a number -> entered, NOT verified (PSA not built)', cc.stateFromEbay(r1, 'PSA').state, 'entered');
eq('entered says it is the seller’s number, unchecked', /SELLER entered.*Not yet checked against PSA/.test(cc.stateFromEbay(r1, 'PSA').says), true);
eq('a CGC number on a PSA row -> entered, and says only PSA is checked', /Only PSA certs/.test(cc.stateFromEbay(r3, 'PSA').says), true);
eq('nothing in certcheck can yield verified before PSA exists', ['no-cert', 'entered'].includes(cc.stateFromEbay(r1, 'PSA').state), true);
eq('psaLookup is not built, and says why', cc.psaLookup('170514194').built, false);

console.log('\n  inputs — refuse the malformed, KEEP the real');
eq('a real Browse item id is accepted', cc.ITEM_ID.test('v1|167236883977|0'), true);
eq('a real variation item id is accepted', cc.ITEM_ID.test('v1|407210058164|123456789'), true);
eq('a URL is refused', cc.ITEM_ID.test('https://api.ebay.com/x'), false);
eq('a legacy bare id is refused', cc.ITEM_ID.test('167236883977'), false);
eq('psacard link built from a real 9-digit number', cc.psaCertUrl('170514194'), 'https://www.psacard.com/cert/170514194');
eq('8 digits accepted too', cc.psaCertUrl('12345678'), 'https://www.psacard.com/cert/12345678');
eq('no link from a malformed number', cc.psaCertUrl('17051/4194'), null);
eq('no link from a 10-digit (CGC-shaped) number', cc.psaCertUrl('4123456789'), null);

console.log('\n  storage — eBay’s link lives 15 minutes, in memory');
const t0 = 1e12;
cc.ebayCacheSet('v1|1|0', r1, t0);
eq('served within 15 minutes', !!cc.ebayCacheGet('v1|1|0', t0 + 14 * 60e3), true);
eq('gone at 15 minutes', cc.ebayCacheGet('v1|1|0', t0 + 15 * 60e3), null);
eq('TTL is exactly 15 minutes', cc.EBAY_ITEM_TTL_MS, 15 * 60 * 1000);

console.log('\n  photos — the seller’s own images, never padded');
const IMG = u => ({ imageUrl: u });
eq('one image is one image', cc.readImages({ image: IMG('https://i.ebayimg.com/a.jpg') }),
  ['https://i.ebayimg.com/a.jpg']);
eq('primary first, then additionalImages in the seller’s order',
  cc.readImages({ image: IMG('https://i.ebayimg.com/a.jpg'),
                  additionalImages: [IMG('https://i.ebayimg.com/b.jpg'), IMG('https://i.ebayimg.com/c.jpg')] }),
  ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg', 'https://i.ebayimg.com/c.jpg']);
eq('a repeat of the primary is not counted twice',
  cc.readImages({ image: IMG('https://i.ebayimg.com/a.jpg'), additionalImages: [IMG('https://i.ebayimg.com/a.jpg')] }).length, 1);
eq('no images -> empty, not a catalogue stand-in', cc.readImages({}), []);
eq('a non-https url is dropped', cc.readImages({ image: IMG('javascript:alert(1)') }), []);
const both = cc.fromItem(Object.assign({ image: IMG('https://i.ebayimg.com/a.jpg') }, WITH));
eq('fromItem keeps the cert read AND the images from one response',
  both.read.cert === '170514194' && both.images.length === 1, true);
const t1 = 2e12;
cc.ebayCacheSet('v1|2|0', both, t1);
const h2 = cc.ebayCacheGet('v1|2|0', t1 + 60e3);
eq('one cache entry answers both questions', !!(h2 && h2.read && h2.read.cert && h2.images.length === 1), true);
eq('...and the images expire with it at 15 minutes', cc.ebayCacheGet('v1|2|0', t1 + 15 * 60e3), null);

console.log('\n  structure — the split is in the code, and nothing eBay is persisted');
const src = fs.readFileSync('certcheck.js', 'utf8');
eq('certcheck.js documents both lifetimes', /15 MINUTES, IN MEMORY, NEVER PERSISTED/.test(src) && /PERMANENT/.test(src), true);
eq('certcheck.js touches no database', /\b(INSERT|UPDATE|db\.query|pool)\b/i.test(src), false);
const server = fs.readFileSync('server.js', 'utf8');
// From the shared getItem helper to the end of /api/photos: both routes and
// the one call they share.
const route = server.slice(server.indexOf('async function ebayItemOnDemand'), server.indexOf('// ── What does filtering to NARROW cost'));
const certRoute = route.slice(route.indexOf("app.get('/api/cert/:cardId'"), route.indexOf("app.get('/api/photos/:cardId'"));
const photoRoute = route.slice(route.indexOf("app.get('/api/photos/:cardId'"));
eq('/api/cert route found', certRoute.length > 200, true);
eq('/api/photos route found', photoRoute.length > 200, true);
eq('/api/cert and /api/photos write nothing to the database', /\b(INSERT|UPDATE)\b|db\.query/.test(route), false);
eq('/api/cert refuses non-PSA grades', /PSA only/.test(certRoute), true);
eq('the shared helper spends one item call, foreground unless a caller asks background', /const background = !!\(o && o\.background\)/.test(route) && /kind: 'item', background,/.test(route), true);
eq('exactly ONE getItem fetch serves both routes', (route.match(/ebay\.fetchEbay\(/g) || []).length, 1);
eq('both routes go through the shared helper',
  /ebayItemOnDemand\(/.test(certRoute) && /ebayItemOnDemand\(/.test(photoRoute), true);
eq('the helper caches the whole getItem answer (cert AND images)', /certcheck\.fromItem\(call\.data\)/.test(route), true);
eq('eBay rows carry itemId', /itemId: it\.itemId/.test(server) && /itemId: o\.itemId/.test(server), true);
const page = fs.readFileSync('cardhunt_preview.html', 'utf8');
eq('Verify is a sibling of the link, not inside it', /<\/a>'\s*\n\s*\+ certLine\(l\)/.test(page), true);
eq('Verify is offered on eBay PSA rows only', /l\.source === 'ebay' && l\.itemId && \/\^PSA/.test(page), true);
eq('every state has its own chip style', ['no-cert', 'entered', 'verified', 'mismatch', 'error'].every(s => page.includes('.certchip.' + s + '{')), true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
