# Toyyib TypeScript SDK (`@toyyib/sdk`): design

Status: draft for review, 2026-11-05
Owner and maintainer: devProMaleek

## Goal

An open-source TypeScript library that lets a brokerage or investment app call the Toyyib API in minutes instead of writing HTTP calls by hand. More businesses integrate Toyyib, and each one needs a key to use it.

**Who it is for first:** brokerages and investment apps, mostly in Nigeria, adding Shariah screening to their own products. They run JavaScript or TypeScript backends. A Python library comes later, built the same way.

**Done when** a brokerage developer can:

1. install the package and make a call with a sandbox key without reading raw HTTP docs,
2. understand every error the API can return from the error's type and message,
3. move from a sandbox key to a live key by changing only the key.

## Ground rules

- **The library only calls the public API.** All screening logic, data and ratings stay on Toyyib's servers. Nothing from the API server's internals (its screening code, thresholds, internal docs or data files) goes in this repo, its docs, its tests or its commit history. Test fixtures are invented, like the sandbox's TESTCO data.
- **Server-side only.** Toyyib keys are secret (`sk_`). The library runs on Node 18+, Bun, Deno and edge runtimes, and refuses to start in a browser unless the caller passes `dangerouslyAllowBrowser: true`.
- **No runtime dependencies.** It uses the built-in `fetch`.
- **MIT licence.**

## Package and repository

| | |
| --- | --- |
| npm package | `@toyyib/sdk`, published from the `toyyib` npm organisation |
| Repository | `halcore/toyyib-node`, public |
| Licence | MIT |
| Runtimes | Node 18, 20 and 22; Bun; Deno; edge runtimes |
| Module formats | ESM and CommonJS, with type definitions |

If the `toyyib` npm organisation can't be had, the fallback name is `@halcore/toyyib`.

## Public surface

```ts
import { Toyyib } from '@toyyib/sdk';

const toyyib = new Toyyib(); // reads TOYYIB_API_KEY, or new Toyyib({ apiKey })
```

Every method maps to one `api/v1/` endpoint. Request parameters and response fields keep the API's own names (snake_case), so they match the API docs and the generated types with no translation layer. Client options are camelCase, as is usual for JavaScript.

### Stocks

A stock is identified by a bare ticker (`GTCO`), an `EXCHANGE:TICKER` symbol (`NGX:GTCO`) or its ID. When a bare ticker exists on more than one exchange, pass `region` or use `EXCHANGE:TICKER`.

| Method | Endpoint | Notes |
| --- | --- | --- |
| `stocks.listCompliance({ region?, status?, sector?, page_size? })` | `GET stocks/compliance` | Every screened stock with its verdict. Cursor paging. `status` is `COMPLIANT`, `NON_COMPLIANT` or `QUESTIONABLE` |
| `stocks.listCompliant({ region?, sector?, page_size? })` | `GET stocks/compliant` | Compliant stocks only. Cursor paging |
| `stocks.compliance(symbol, { region? })` | `GET stocks/{symbol}/compliance` | One stock's verdict |
| `stocks.report(symbol, { region? })` | `GET stocks/{symbol}/report` | Needs a plan with reports access |
| `stocks.filings.latest(symbol, { region? })` | `GET stocks/{symbol}/filings/latest` | The filing behind the current verdict |
| `stocks.filings.latestInputs(symbol, { region?, include? })` | `GET …/filings/latest/inputs` | Reports access. `include: 'ignored'` adds rows that weren't counted |
| `stocks.filings.latestEvidence(symbol, { region?, include? })` | `GET …/filings/latest/evidence` | Reports access |
| `stocks.filings.list(symbol, { region?, fiscal_period?, fiscal_year? })` | `GET stocks/{symbol}/filings` | Reports access. Filing history |
| `stocks.filings.retrieve(symbol, filingId, { region? })` | `GET stocks/{symbol}/filings/{id}` | Reports access |
| `stocks.filings.inputs(symbol, filingId, { region?, include? })` | `GET …/filings/{id}/inputs` | Reports access |
| `stocks.filings.evidence(symbol, filingId, { region?, include? })` | `GET …/filings/{id}/evidence` | Reports access |

`region` is `NGX` or `NASD`. The API still accepts the older `exchange` parameter as an alias, but the library only sends `region`.

### ETFs, markets, reports, portfolio and usage

| Method | Endpoint | Notes |
| --- | --- | --- |
| `etfs.listCompliance({ status?, page_size? })` | `GET etfs/compliance` | Compliance derived from holdings. Cursor paging |
| `markets.regions()` | `GET regions` | |
| `markets.exchanges()` | `GET exchanges` | |
| `reports.list({ type?, page? })` | `GET reports` | Reports access. `type` is `monthly`, `quarterly` or `special`. Numbered pages |
| `reports.stats()` | `GET reports/stats` | Reports access |
| `reports.download(reportId)` | `GET reports/{id}/download` | Export access (Enterprise plan). Returns `{ download_url, file_name, file_size }`; the library doesn't fetch the file |
| `portfolio.analyze({ holdings })` | `POST portfolio/analyze` | `holdings` is 1 to 50 `{ ticker, shares }` items with no repeated tickers; `shares` is a whole number of at least 1. Returns portfolio scoring and purification amounts per holding |
| `usage()` | `GET usage` | The key's mode, plan, and daily and per-minute limits |

The library checks only what saves a pointless request (an empty or oversized `holdings` list, a repeated ticker). The API remains the authority on validation.

### Client options

| Option | Default | Meaning |
| --- | --- | --- |
| `apiKey` | `process.env.TOYYIB_API_KEY` | Required; missing it throws at construction with a message saying where to get a key |
| `baseURL` | `https://api.toyyib.app/api/v1` | For testing against a local or staging server |
| `timeout` | 60 seconds | Per attempt |
| `maxRetries` | 2 | See retries below |
| `fetch` | the global `fetch` | For runtimes or tests that need their own |
| `dangerouslyAllowBrowser` | `false` | Allows browser use for people who accept exposing the key |

`toyyib.mode` is `'sandbox'` for an `sk_test_` key and `'live'` for an `sk_live_` key. Sandbox keys only see the API's sandbox data set, a made-up TESTCO universe, and live keys only see real securities.

## How it works

```
Toyyib (client)  ─┬─ resources/stocks.ts, filings.ts, etfs.ts, markets.ts,
                  │  reports.ts, portfolio.ts, usage.ts   (thin, one method per endpoint)
                  └─ core/request.ts   (the only code that calls fetch)
                       ├─ core/errors.ts
                       ├─ core/pagination.ts
                       └─ generated/schema.d.ts  (types from api/v1/schema/)
```

### Requests and replies

`core/request.ts` builds the URL and query string, and sends `X-API-Key`, `Accept: application/json` and `User-Agent: toyyib-sdk-node/<version>`. It enforces the timeout with an `AbortController` and applies the retry rules. The API wraps every reply as `{ success: true, data, message }` or `{ success: false, error: { code, message, details? } }`. The library returns `data` on success and throws an error otherwise.

### Errors

Every failure is a `ToyyibError` with `status`, `code`, `message` and `details`. Subclasses let callers handle common cases:

| Class | When |
| --- | --- |
| `AuthenticationError` | 401: missing, invalid, expired or deactivated key |
| `ProductionAccessDisabledError` | 401 with code `PRODUCTION_ACCESS_DISABLED`: a live key whose business hasn't been switched on yet. Its message says to use an `sk_test_` key or contact Toyyib |
| `PermissionDeniedError` | 403: the plan doesn't include reports or export access |
| `NotFoundError` | 404, for example `SECURITY_NOT_FOUND`, `FILING_NOT_FOUND`, `REPORT_NOT_FOUND` |
| `ConflictError` | 409, for example `AMBIGUOUS_IDENTIFIER`: a bare ticker that exists on more than one exchange |
| `ValidationError` | 400, for example `VALIDATION_ERROR`, `TICKERS_NOT_FOUND`, `MISSING_PRICE_DATA`, `INVALID_FISCAL_PERIOD`, `INVALID_FISCAL_YEAR` |
| `RateLimitError` | 429, with `retryAfter` in seconds |
| `APIError` | 5xx, or a reply that isn't the expected shape |
| `ConnectionError`, `TimeoutError` | The request never got a reply |

Unknown codes still arrive as a plain `ToyyibError` with the server's code and message, so new API errors never break callers. Keys never appear in error messages or logs; if one is ever echoed back, it is masked to its last four characters.

### Retries and rate limits

The library retries up to `maxRetries` times after network errors, timeouts, 5xx replies and 429 replies whose `Retry-After` is 60 seconds or less. It waits with exponential backoff and jitter, starting at 0.5 seconds, or for `Retry-After` when the server sends one.

The API has a per-minute limit (it asks callers to wait 60 seconds) and a daily limit (it asks them to wait until midnight). A 429 asking for more than 60 seconds is thrown at once as `RateLimitError`, so a daily limit never makes a call hang for hours.

`POST portfolio/analyze` doesn't change anything on the server, so retrying it is safe.

### Paging

- **Cursor paging** (`stocks.listCompliance`, `stocks.listCompliant`, `etfs.listCompliance`): the API returns `{ items, next_token }`. Methods return a `Page` with `data`, `hasMore` and `nextPage()`. Lists can also be looped with `for await (const stock of toyyib.stocks.listCompliant())`, which follows `next_token` until the end. `page_size` defaults to 50, with a maximum of 200.
- **Numbered pages** (`reports.list`): returns the API's `{ reports, pagination }` and supports the same `for await` loop by page number.

### Types

`generated/schema.d.ts` is generated with `openapi-typescript` from a copy of `api/v1/schema/` kept in the repo. Friendly names (`StockCompliance`, `Filing`, `PortfolioAnalysis` and so on) are exported on top. `npm run generate` refreshes the copy and the types.

## Server change needed first

In the API server, the error handler builds each error's `code` from the exception class's default code. So the code `production_access_disabled`, raised when a live key's business isn't switched on, reaches clients as the generic `AUTHENTICATION_FAILED`. The handler should use the code the exception was raised with. This is a one-line change to the server's error handler, with a test, done through the server's normal review. Until it ships, `ProductionAccessDisabledError` can't be told apart from other 401s, so the library releases after the fix.

## Testing

- **Unit tests** (Vitest) with a fake `fetch`, never touching the network:
  - unwrapping replies,
  - every error class, including `PRODUCTION_ACCESS_DISABLED` and unknown codes,
  - retry and backoff on a fake clock, including a daily-limit 429 that throws without retrying,
  - both kinds of paging over several pages,
  - the key from options or the environment, sandbox vs live detection, and the browser guard,
  - key masking.
- **Schema check:** a weekly CI job fetches the live `api/v1/schema/`, compares it with the copy in the repo, and opens an issue when they differ, so API changes surface before users hit them.
- **Sandbox smoke test:** a manually run workflow that calls each endpoint with a sandbox key stored as a repo secret.

## CI, releases and upkeep

- **CI on every PR:** lint, type check, tests and build on Node 18, 20 and 22. Branch protection on `main` requires it to pass, which the Free plan allows on public repos.
- **Releases:**
  - release-please turns Conventional Commits into a version bump, a changelog entry and a GitHub release.
  - A GitHub Actions job publishes to npm with npm trusted publishing (OIDC) and provenance, so there's no long-lived npm token.
- **Versions:** `0.x` while partner brokerages are onboarded by hand; `1.0.0` once brokerages can sign up themselves. From 1.0, breaking changes only come in major versions.
- **Docs:**
  - **README:** install, a two-minute sandbox quickstart ("contact us for a sandbox key"), keys and modes, errors, paging, retries, and a link to the API docs at `api/v1/docs/`.
  - **Comments on every method:** shown when hovering in editors, including which plan an endpoint needs.
  - **`examples/`:** check a stock, and screen a portfolio.
- **Repo files:** LICENSE (MIT), CHANGELOG, CONTRIBUTING, SECURITY (how to report a vulnerability privately), and CODEOWNERS naming devProMaleek, who reviews every PR. Dependabot covers dev tools and GitHub Actions.

## Out of scope for v1

- browser use, beyond the opt-in escape hatch
- the dashboard's key management and usage-log endpoints, which use the dashboard's own login rather than API keys
- downloading report files (the library returns the download URL)
- webhooks, which the API doesn't have
- the Python library, which follows later

## Before work starts

1. The `toyyib` npm organisation is created (devProMaleek).
2. The server error-code fix is merged and deployed.
3. `api.toyyib.app` is reachable. It timed out from a development machine on 2026-11-05.
