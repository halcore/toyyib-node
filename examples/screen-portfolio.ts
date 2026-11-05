// Screens a portfolio: its overall verdict, and how much income to purify.
//
// Needs Node 22.18 or newer, which runs .ts files directly (or use tsx).
//
//   npm run build
//   TOYYIB_API_KEY=sk_test_... node examples/screen-portfolio.ts
import { Toyyib } from '@toyyib/sdk';

const toyyib = new Toyyib();

const { summary, holdings } = await toyyib.portfolio.analyze({
  holdings: [
    { ticker: 'TESTCO', shares: 1_000 },
    { ticker: 'TESTPURE', shares: 2_500 },
    { ticker: 'TESTDOUBT', shares: 500 },
    { ticker: 'TESTBIZ', shares: 200 },
  ],
});

console.log(
  `Portfolio: ${summary.compliance_status}, ` +
    `${summary.compliant_percentage}% compliant by value`,
);
for (const holding of holdings) {
  // A non-compliant holding is sold, not purified, so it has no amount.
  const purify =
    holding.compliance_status === 'non_compliant'
      ? 'nothing: sell it instead'
      : (holding.purification_amount ?? 'not available yet');
  console.log(
    `  ${holding.ticker}: ${holding.compliance_status}, purify ${purify}`,
  );
}
console.log(`Total to purify: ${summary.total_purification_amount}`);
