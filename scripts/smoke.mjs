// Calls every endpoint once against the sandbox, through the built package,
// and prints one line each. Exits with 1 if any call failed for a reason other
// than the key's plan lacking access.
//
//   npm run build
//   TOYYIB_API_KEY=sk_test_... node scripts/smoke.mjs
//
// TOYYIB_BASE_URL points it at another server, such as a local one.
import { PermissionDeniedError, Toyyib } from '../dist/index.js';

const toyyib = new Toyyib({ baseURL: process.env.TOYYIB_BASE_URL });
if (toyyib.mode !== 'sandbox') {
  console.error('The smoke test only runs with a sandbox (sk_test_) key.');
  process.exit(1);
}

let failed = 0;

/** Runs one call; returns its result, or undefined when it failed. */
async function check(name, call, expectedCode) {
  try {
    const result = await call();
    if (expectedCode) {
      failed += 1;
      console.log(`FAIL  ${name}: expected ${expectedCode}, but it succeeded`);
      return undefined;
    }
    console.log(`ok    ${name}`);
    return result;
  } catch (err) {
    if (expectedCode && err.code === expectedCode) {
      console.log(`ok    ${name} (${err.code}, as expected)`);
    } else if (err instanceof PermissionDeniedError) {
      console.log(`skip  ${name}: the key's plan has no access`);
    } else {
      failed += 1;
      console.log(`FAIL  ${name}: ${err.code ?? err.name} ${err.message}`);
    }
    return undefined;
  }
}

function skip(name, reason) {
  console.log(`skip  ${name}: ${reason}`);
}

await check('usage', () => toyyib.usage());
await check('markets.regions', () => toyyib.markets.regions());
await check('markets.exchanges', () => toyyib.markets.exchanges());

await check('stocks.listCompliance', () =>
  toyyib.stocks.listCompliance({ page_size: 2 }),
);
await check('stocks.listCompliant', () =>
  toyyib.stocks.listCompliant({ region: 'NGX', page_size: 2 }),
);
await check('stocks.compliance', () => toyyib.stocks.compliance('TESTCO'));
await check('stocks.report', () => toyyib.stocks.report('TESTCO'));

const { filings } = toyyib.stocks;
await check('stocks.filings.latest', () => filings.latest('TESTCO'));
await check('stocks.filings.latestInputs', () =>
  filings.latestInputs('TESTCO', { include: 'ignored' }),
);
await check('stocks.filings.latestEvidence', () =>
  filings.latestEvidence('TESTCO'),
);
const history = await check('stocks.filings.list', () =>
  filings.list('TESTCO'),
);
const filingId = history?.items[0]?.id;
if (filingId) {
  await check('stocks.filings.retrieve', () =>
    filings.retrieve('TESTCO', filingId),
  );
  await check('stocks.filings.inputs', () =>
    filings.inputs('TESTCO', filingId),
  );
  await check('stocks.filings.evidence', () =>
    filings.evidence('TESTCO', filingId),
  );
} else {
  for (const name of ['retrieve', 'inputs', 'evidence']) {
    skip(`stocks.filings.${name}`, 'no filing history to pick from');
  }
}

await check('etfs.listCompliance', () =>
  toyyib.etfs.listCompliance({ page_size: 2 }),
);

const reports = await check('reports.list', () => toyyib.reports.list());
await check('reports.stats', () => toyyib.reports.stats());
const reportId = reports?.data[0]?.id;
if (reportId) {
  await check('reports.download', () => toyyib.reports.download(reportId));
} else {
  skip('reports.download', 'no report to download');
}

await check('portfolio.analyze', () =>
  toyyib.portfolio.analyze({
    holdings: [
      { ticker: 'TESTCO', shares: 10 },
      { ticker: 'TESTPURE', shares: 10 },
    ],
  }),
);

// The sandbox's edge cases map to the right errors.
await check(
  'stocks.compliance(TESTAMBIG)',
  () => toyyib.stocks.compliance('TESTAMBIG'),
  'AMBIGUOUS_IDENTIFIER',
);
await check(
  'stocks.compliance(TESTPEND)',
  () => toyyib.stocks.compliance('TESTPEND'),
  'SECURITY_NOT_FOUND',
);
await check(
  'portfolio.analyze(TESTNOPRICE)',
  () =>
    toyyib.portfolio.analyze({
      holdings: [{ ticker: 'TESTNOPRICE', shares: 1 }],
    }),
  'MISSING_PRICE_DATA',
);

console.log(failed === 0 ? 'Smoke test passed.' : `${failed} call(s) failed.`);
process.exitCode = failed === 0 ? 0 : 1;
