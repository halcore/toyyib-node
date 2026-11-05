// Checks one stock's Shariah compliance, then lists the compliant stocks.
//
// Needs Node 22.18 or newer, which runs .ts files directly (or use tsx).
//
//   npm run build
//   TOYYIB_API_KEY=sk_test_... node examples/check-stock.ts
import { ConflictError, Toyyib } from '@toyyib/sdk';

const toyyib = new Toyyib();
console.log(`Using a ${toyyib.mode} key.`);

const stock = await toyyib.stocks.compliance('TESTCO');
console.log(`${stock.symbol} (${stock.name}): ${stock.status}`);

// TESTAMBIG is listed on NGX and NASD, so the bare symbol is ambiguous.
try {
  await toyyib.stocks.compliance('TESTAMBIG');
} catch (err) {
  if (!(err instanceof ConflictError)) throw err;
  const ngx = await toyyib.stocks.compliance('TESTAMBIG', { region: 'NGX' });
  console.log(`TESTAMBIG on NGX: ${ngx.status}`);
}

console.log('Compliant stocks:');
for await (const compliant of toyyib.stocks.listCompliant()) {
  const ratio = compliant.purification_ratio ?? 'n/a';
  console.log(`  ${compliant.symbol}: purify ${ratio}% of income`);
}
