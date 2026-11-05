# @toyyib/sdk

The official TypeScript client for the Toyyib Shariah screening API. Check whether a stock is Shariah-compliant, list compliant stocks and ETFs, read the filings and evidence behind each verdict, and screen whole portfolios, including how much income to purify.

```sh
npm install @toyyib/sdk
```

- Typed requests and replies, generated from the API's own schema
- `for await` over paged lists
- Retries for network errors, server errors and short rate limits
- No runtime dependencies: Node 18+, Bun, Deno and edge runtimes

## Quickstart

You need an API key. To get a sandbox key, contact [info@halcore.app](mailto:info@halcore.app).

```sh
export TOYYIB_API_KEY=sk_test_...
```

```ts
import { Toyyib } from '@toyyib/sdk';

const toyyib = new Toyyib(); // reads TOYYIB_API_KEY

const stock = await toyyib.stocks.compliance('TESTCO');
console.log(stock.symbol, stock.status); // TESTCO COMPLIANT
```

## Keys and modes

| Key        | `toyyib.mode` | Sees                                     |
| ---------- | ------------- | ---------------------------------------- |
| `sk_test_` | `'sandbox'`   | The sandbox data set only: TESTCO and co |
| `sk_live_` | `'live'`      | Real securities only                     |

The sandbox data set covers the cases you'll want to handle:

| Symbol                        | What it shows                                       |
| ----------------------------- | --------------------------------------------------- |
| `TESTCO`                      | Compliant, with nothing to purify                   |
| `TESTPURE`                    | Compliant, with some income to purify               |
| `TESTDOUBT`                   | Questionable                                        |
| `TESTRATIO`                   | Non-compliant on its financial ratios               |
| `TESTBIZ`                     | Non-compliant on its business activity              |
| `TESTAMBIG`                   | Listed on NGX and NASD: a bare symbol is ambiguous  |
| `TESTPEND`                    | Not screened yet, so not found                      |
| `TESTNOPRICE`                 | No price, so portfolio analysis rejects it          |
| `TESTHALAL`, `TESTMIX` (ETFs) | A compliant ETF, and one with questionable holdings |

A live key works once Toyyib switches on production access for your business. Until then it throws `ProductionAccessDisabledError`.

Keys are secret. The client keeps the key private: logging or serialising it, or an error it throws, never shows the key.

## What you can call

A symbol is a bare ticker (`GTCO`), `EXCHANGE:TICKER` (`NGX:GTCO`) or an id. Request parameters and reply fields keep the API's snake_case names.

| Method                                                                   | Returns                                    |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `stocks.listCompliance({ region?, status?, sector?, page_size? })`       | Every screened stock, paged                |
| `stocks.listCompliant({ region?, sector?, page_size? })`                 | Compliant stocks only, paged               |
| `stocks.compliance(symbol, { region? })`                                 | One stock's verdict                        |
| `stocks.report(symbol, { region? })`                                     | The full report, with screens and ratios ¹ |
| `stocks.filings.latest(symbol, { region? })`                             | The filing behind the current verdict      |
| `stocks.filings.latestInputs(symbol, { region?, include? })`             | Its screening inputs, with citations ¹     |
| `stocks.filings.latestEvidence(symbol, { region?, include? })`           | Its extraction evidence ¹                  |
| `stocks.filings.list(symbol, { region?, fiscal_period?, fiscal_year? })` | Filing history, newest first ¹             |
| `stocks.filings.retrieve(symbol, filingId, { region? })`                 | One filing from the history ¹              |
| `stocks.filings.inputs(symbol, filingId, { region?, include? })`         | Its inputs ¹                               |
| `stocks.filings.evidence(symbol, filingId, { region?, include? })`       | Its evidence ¹                             |
| `etfs.listCompliance({ region?, status?, page_size? })`                  | Every ETF, from its holdings, paged        |
| `markets.regions()`, `markets.exchanges()`                               | The markets: NGX and NASD                  |
| `reports.list({ type?, page? })`                                         | Compliance reports, paged ¹                |
| `reports.stats()`                                                        | Report totals and schedule ¹               |
| `reports.download(reportId)`                                             | A link to the report's PDF ²               |
| `portfolio.analyze({ holdings })`                                        | Portfolio compliance and purification      |
| `usage()`                                                                | Your key, plan and limits                  |

¹ Needs a plan with reports access (Pro or Enterprise). ² Needs export access (Enterprise).

`region` is `NGX` or `NASD`. `status` is `COMPLIANT`, `NON_COMPLIANT` or `QUESTIONABLE`. `include: 'ignored'` adds the rows that extraction found but didn't count.

Every reply type is exported, for example `StockCompliance`, `Filing`, `PortfolioAnalysis` and `Usage`.

## Paging

Lists can be looped directly. The client fetches the next page when it needs it:

```ts
for await (const stock of toyyib.stocks.listCompliant({ region: 'NGX' })) {
  console.log(stock.symbol, stock.purification_ratio);
}
```

Or work a page at a time:

```ts
const page = await toyyib.stocks.listCompliance({ page_size: 100 });
console.log(page.data.length, page.hasMore);
const next = await page.nextPage(); // null on the last page
```

## Portfolios

```ts
const { summary, holdings } = await toyyib.portfolio.analyze({
  holdings: [
    { ticker: 'TESTCO', shares: 100 },
    { ticker: 'TESTPURE', shares: 250 },
  ],
});
console.log(summary.compliance_status, summary.total_purification_amount);
```

`holdings` takes 1 to 50 items, each ticker once. The client rejects an empty or oversized list, or a repeated ticker, before sending it.

## Errors

Every error is a `ToyyibError` with `status`, `code`, `message` and `details`. The subclasses let you handle the common cases:

| Class                             | When                                                                     |
| --------------------------------- | ------------------------------------------------------------------------ |
| `AuthenticationError`             | 401: the key is missing, invalid, expired or deactivated                 |
| `ProductionAccessDisabledError`   | 401: a live key whose production access isn't switched on yet            |
| `PermissionDeniedError`           | 403: your plan doesn't include this endpoint                             |
| `NotFoundError`                   | 404, for example `SECURITY_NOT_FOUND` or `REPORT_NOT_FOUND`              |
| `ConflictError`                   | 409 `AMBIGUOUS_IDENTIFIER`: a bare ticker listed on more than one market |
| `ValidationError`                 | 400, for example `VALIDATION_ERROR` or `TICKERS_NOT_FOUND`               |
| `RateLimitError`                  | 429, with `retryAfter` in seconds                                        |
| `APIError`                        | 5xx, or a reply that isn't the API's usual shape                         |
| `ConnectionError`, `TimeoutError` | The request got no reply                                                 |

```ts
import { ConflictError, ProductionAccessDisabledError } from '@toyyib/sdk';

try {
  await toyyib.stocks.compliance('TESTAMBIG');
} catch (err) {
  if (err instanceof ConflictError) {
    // Listed on NGX and NASD: say which one.
    await toyyib.stocks.compliance('TESTAMBIG', { region: 'NGX' });
  } else if (err instanceof ProductionAccessDisabledError) {
    console.error(
      'Use an sk_test_ key until production access is switched on.',
    );
  } else {
    throw err;
  }
}
```

An error code the client doesn't know yet still arrives as a `ToyyibError` with the server's code and message.

## Retries and rate limits

The client retries up to `maxRetries` times (2 by default) after network errors, timeouts, 5xx replies, and 429 replies that ask to wait 60 seconds or less. It waits 0.5 s, then 1 s, 2 s and so on up to 8 s, with jitter, or exactly as long as the server's `Retry-After` asks.

A 429 that asks for longer, such as the daily limit, throws `RateLimitError` at once rather than waiting for hours. `usage()` shows how much of today's limit is left.

## Options

```ts
const toyyib = new Toyyib({
  apiKey: 'sk_test_...', // default: process.env.TOYYIB_API_KEY
  baseURL: 'https://api.toyyib.app/api/v1', // the default
  timeout: 60_000, // ms per attempt, the default
  maxRetries: 2, // the default
  fetch, // default: the global fetch
});
```

## Runtimes

Node 18 or newer, Bun, Deno, and edge runtimes such as Cloudflare Workers and Vercel. The client uses the built-in `fetch` and has no dependencies.

The key is read from `process.env.TOYYIB_API_KEY`, or from `Deno.env` in Deno, which needs `--allow-env=TOYYIB_API_KEY`. Cloudflare Workers hand secrets to your handler on `env` and don't always copy them to `process.env`, so pass the key in yourself:

```ts
export default {
  async fetch(request: Request, env: { TOYYIB_API_KEY: string }) {
    const toyyib = new Toyyib({ apiKey: env.TOYYIB_API_KEY });
    return Response.json(await toyyib.usage());
  },
};
```

**Server-side only.** An API key in a browser page or a mobile app can be read by anyone who has it, so the client refuses to start there. If you accept that risk, pass `dangerouslyAllowBrowser: true`.

## Links

- API reference: https://api.toyyib.app/api/v1/docs/
- [Examples](examples/): TypeScript files that Node 22.18 or newer runs directly. Run `npm run build` first. On older Node versions, use a TypeScript runner such as tsx.
- [Contributing](CONTRIBUTING.md) and [security](SECURITY.md)

## Licence

[MIT](LICENSE). © 2026 Halcore Digital Technology Limited.
