const gp = require('./gradeprice');
let pass=0, fail=0;
const chk=(l,c)=>{ c?pass++:fail++; console.log('  '+(c?'PASS':'FAIL')+'  '+l); };

// The listing shape server.js produces (normaliseListing)
const L = (o) => Object.assign({
  source:'ebay', title:'Charizard 4/102 Base Set PSA 10', price:0, shipping:null,
  shippingKnown:false, landed:0, condition:'PSA 10', listingType:'fixed',
  live:true, edition:null, variant:null
}, o, {
  landed: +( (o.price||0) + (o.shipping||0) ).toFixed(2),
  shippingKnown: o.shipping !== undefined && o.shipping !== null
});

console.log('A MEDIAN, NOT A MEAN\n');
const spread = [8000, 8200, 8400, 8600, 249999].map((p,i) => L({ price:p, shipping:0, live:false }));
const aggSpread = gp.aggregate(spread, { grade:'PSA 10' });
console.log('  five sold listings, one of them $249,999 -> $' + aggSpread.best.median);
chk('one outlier does not move the number', aggSpread.best.median === 8400);
chk('the range is still reported', aggSpread.best.low === 8000 && aggSpread.best.high === 249999);

console.log('\nASKING PRICES AND SOLD PRICES ARE NOT THE SAME MARKET\n');
const mixed = [
  L({ price:900, shipping:0, live:false }), L({ price:950, shipping:0, live:false }),
  L({ price:1000, shipping:0, live:false }),
  L({ price:4000, shipping:0, live:true }), L({ price:4200, shipping:0, live:true })
];
const aggMixed = gp.aggregate(mixed, { grade:'PSA 10' });
chk('sold and active are separate groups', aggMixed.groups.length === 2);
chk('sold wins even though the asking prices are higher',
    aggMixed.best.basis === 'sold' && aggMixed.best.median === 950);
chk('nothing is averaged across the two',
    !aggMixed.groups.some(g => g.median > 1000 && g.basis === 'sold'));

console.log('\nA LIVE AUCTION IS NOT A PRICE\n');
const withAuction = [
  L({ price:500, shipping:0, live:true, listingType:'auction' }),
  L({ price:900, shipping:0, live:true, listingType:'fixed' }),
  L({ price:920, shipping:0, live:true, listingType:'fixed' }),
  L({ price:940, shipping:0, live:true, listingType:'fixed' })
];
const aggAuction = gp.aggregate(withAuction, { grade:'PSA 10' });
chk('a bid in progress is excluded', aggAuction.best.count === 3 && aggAuction.best.median === 920);
chk('and the caller is told it was excluded', aggAuction.skippedAuctions === 1);
chk('an ENDED auction still counts',
    gp.aggregate([L({price:800,shipping:0,live:false,listingType:'auction'}),
                  L({price:820,shipping:0,live:false,listingType:'auction'}),
                  L({price:840,shipping:0,live:false,listingType:'auction'})],
                 { grade:'PSA 10' }).best.count === 3);

console.log('\nEDITIONS ARE DIFFERENT MARKETS\n');
const editions = [
  L({ price:4000, shipping:0, live:false, edition:'1st Edition' }),
  L({ price:4200, shipping:0, live:false, edition:'1st Edition' }),
  L({ price:4400, shipping:0, live:false, edition:'1st Edition' }),
  L({ price:380,  shipping:0, live:false, edition:'Unlimited' }),
  L({ price:400,  shipping:0, live:false, edition:'Unlimited' }),
  L({ price:420,  shipping:0, live:false, edition:'Unlimited' })
];
const aggEd = gp.aggregate(editions, { grade:'PSA 10' });
console.log('  ' + aggEd.groups.map(g => (g.edition||'unspecified') + ' $' + g.median).join(' · '));
chk('1st Edition and Unlimited are not averaged', aggEd.groups.length === 2);
chk('neither group reports $2,300', !aggEd.groups.some(g => g.median > 1000 && g.median < 4000));
chk('the editions found are named', aggEd.editionsFound.length === 2);

console.log('\nLANDED COST, AND SAYING WHEN IT IS NOT\n');
const shipped = [L({price:100,shipping:12,live:false}), L({price:110,shipping:12,live:false}),
                 L({price:120,shipping:12,live:false})];
chk('shipping is part of the price', gp.aggregate(shipped,{grade:'PSA 10'}).best.median === 122);
chk('and the number is marked landed', gp.aggregate(shipped,{grade:'PSA 10'}).best.landed === true);
const unshipped = [L({price:100,live:false}), L({price:110,live:false}), L({price:120,live:false})];
const aggUn = gp.aggregate(unshipped, { grade:'PSA 10' });
chk('unknown shipping is not treated as free', aggUn.best.landed === false);
chk('the rows that did state it are counted', aggUn.best.shippingKnown === 0);

console.log('\nA THIN SAMPLE SAYS SO\n');
const one = gp.aggregate([L({price:612,shipping:0,live:false})], { grade:'PSA 10' });
console.log('  ' + one.best.label);
chk('a median of one is flagged thin', one.best.thin === true && one.best.count === 1);
chk('and its label says what it is', /not a market price/.test(one.best.label));

console.log('\nMEASURED OR ESTIMATED — NEVER AMBIGUOUS\n');
const rawPrice = 120;
const measured = gp.priceFor(gp.aggregate(
  [L({price:900,shipping:0,live:false}),L({price:950,shipping:0,live:false}),
   L({price:1000,shipping:0,live:false})], {grade:'PSA 10'}), 'PSA 10', rawPrice, 7);
console.log('  measured: $' + measured.value + ' — ' + measured.label);
chk('a real median is not marked estimated', measured.estimated === false);
chk('the measured premium is reported', measured.premium === +(950/120).toFixed(2));
chk('the multiplier is NOT what was shown', measured.value !== 120 * 7);

const guessed = gp.priceFor(gp.aggregate([], {grade:'PSA 10'}), 'PSA 10', rawPrice, 7);
console.log('  estimated: $' + guessed.value + ' — ' + guessed.label);
chk('with no listings it falls back to the multiplier', guessed.value === 840);
chk('and says it is an estimate', guessed.estimated === true && /estimate/.test(guessed.label));

const thin = gp.priceFor(gp.aggregate([L({price:612,shipping:0,live:false})], {grade:'PSA 10'}),
                         'PSA 10', rawPrice, 7);
chk('one listing does not become the market price', thin.estimated === true);
chk('but it is still shown as evidence', thin.observed && thin.observed.median === 612);

console.log('\nNOTHING AT ALL\n');
const empty = gp.aggregate([], { grade:'PSA 10' });
chk('no listings is not an error', empty.best === null && empty.groups.length === 0);
chk('no raw price means no estimate either', gp.fromMultiplier(0, 'PSA 10', 7) === null);
chk('a zero-price listing is never usable', !gp.usable(L({ price:0, live:false })));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
