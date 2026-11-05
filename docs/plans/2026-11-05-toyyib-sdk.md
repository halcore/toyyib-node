# `@toyyib/sdk` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship `@toyyib/sdk`, an MIT TypeScript client for the Toyyib developer API (`api/v1/`), plus the one-line server fix it depends on.

**Architecture:**
- One transport (`src/core/request.ts`) is the only code that calls `fetch`. It unwraps the API's `{ success, data }` envelope, maps failures to typed errors and applies retries.
- Thin resource classes map one method to one endpoint. A `Toyyib` client wires them together.
- Data types are generated with `openapi-typescript` from a filtered copy of the API's OpenAPI schema kept in the repo.

**Tech Stack:**
- TypeScript 5, built with tsup (ESM + CJS + `.d.ts`)
- Tests: Vitest
- Lint and formatting: ESLint (typescript-eslint) and Prettier
- Types: `openapi-typescript`
- npm, GitHub Actions and release-please

**Spec:** `docs/specs/2026-11-05-toyyib-sdk-design.md`, approved 2026-11-05. Read it before starting any task.

## Global Constraints

- Package `@toyyib/sdk` (fallback `@halcore/toyyib`); repository `halcore/toyyib-node`, public; licence MIT.
- Runtimes: Node 18, 20 and 22, Bun, Deno and edge runtimes. `"engines": { "node": ">=18" }`. **Zero runtime dependencies**; use the global `fetch`.
- Defaults: `baseURL` `https://api.toyyib.app/api/v1`, `timeout` 60 000 ms per attempt, `maxRetries` 2, key from `TOYYIB_API_KEY`.
- Retries: network errors, timeouts, 5xx, and 429 with `Retry-After` ≤ 60 s. Backoff starts at 500 ms, doubles, is capped at 8 s, and has jitter. A 429 asking for more than 60 s throws at once.
- Request params and response fields keep the API's snake_case names. Client options are camelCase.
- Headers: `X-API-Key`, `Accept: application/json`, `User-Agent: toyyib-sdk-node/<version>`.
- **Nothing from the API server's internals goes in this repo:** no screening code, thresholds, internal docs, data files or private repo paths. Test fixtures are invented, using TESTCO-style symbols.
- The API key is never printed: not in errors, not by `console.log(client)`, not by `JSON.stringify`. When shown at all, it is masked as `sk_test_****abcd`.
- Commits use Conventional Commits, with no AI or co-author trailers. **Do not run `git commit` or `git push` until devProMaleek has reviewed and tested the work.** Each task's last step prepares its commit; the commit is made after review.

## Review Focus

1. **The key leaking through logs:** `console.log(toyyib)`, `util.inspect`, `JSON.stringify(toyyib)` and logging a thrown error must not show the key. Pinned in Task 3.
2. **Runtimes without `process`:** Deno, Cloudflare Workers and browsers with `dangerouslyAllowBrowser` must not crash reading `TOYYIB_API_KEY`. Pinned in Task 2.
3. **A cursor that never ends:** a reply repeating the previous `next_token`, or returning no items with a non-null token, must stop iteration instead of looping forever. Pinned in Task 5.
4. **`Retry-After` as an HTTP date, or garbage:** an HTTP date is honoured, and an unparseable value falls back to backoff. Pinned in Task 4.
5. **URL building:**
   - a `baseURL` with or without a trailing slash gives exactly one `/`,
   - `NGX:GTCO` and lowercase symbols are encoded and sent unchanged,
   - `undefined` query values are dropped.

   Pinned in Task 3.

---

## File Structure

```
toyyib-node/
  package.json  tsconfig.json  tsup.config.ts  vitest.config.ts  eslint.config.mjs  .prettierrc.json  .gitignore
  LICENSE  README.md  CONTRIBUTING.md  SECURITY.md  CHANGELOG.md (release-please writes it)
  release-please-config.json  .release-please-manifest.json
  .github/CODEOWNERS  .github/dependabot.yml
  .github/workflows/ci.yml  release.yml  schema-check.yml  smoke.yml
  docs/specs/…  docs/plans/…
  openapi/schema.json                 filtered snapshot of the API schema (external paths only)
  scripts/filter-schema.mjs           pure filter: keeps api/v1 external paths and the components they use
  scripts/generate.mjs                fetches the schema, filters it, writes openapi/schema.json, runs openapi-typescript
  scripts/smoke.mjs                   calls every endpoint with a sandbox key
  src/index.ts                        public exports
  src/version.ts                      VERSION constant (release-please bumps it)
  src/client.ts                       Toyyib class
  src/core/runtime.ts                 env reading, browser detection
  src/core/options.ts                 ClientOptions, resolveOptions, modeFromKey
  src/core/errors.ts                  error classes, errorFromResponse, maskKey
  src/core/request.ts                 Transport
  src/core/retry.ts                   retry policy
  src/core/pagination.ts              CursorPage, NumberedPage, PagePromise
  src/generated/schema.d.ts           generated; never edited by hand
  src/types.ts                        friendly type names
  src/resources/stocks.ts  filings.ts  etfs.ts  markets.ts  reports.ts  portfolio.ts  usage.ts
  test/helpers/fake-fetch.ts          scripted fetch for tests
  test/*.test.ts                      one file per src module
  examples/check-stock.ts  examples/screen-portfolio.ts  examples/tsconfig.json
```

---

### Task 0: Server fix: keep the code an error was raised with (repo `halcore/stock_screener_server`)

**Files:**
- Modify: `api/utils.py`, function `custom_exception_handler`
- Test: `api/tests.py`, new test case

**Interfaces:**
- Produces: a 401 reply `{"success": false, "error": {"code": "PRODUCTION_ACCESS_DISABLED", …}}` for a live key whose business has `production_access_enabled = False`. Task 1's `ProductionAccessDisabledError` relies on it.

- [ ] **Step 1: Write the failing test** `test_production_access_disabled_keeps_its_code`. Create a business with `production_access_enabled=False` and a production key on an active plan. Call `GET /api/v1/usage` with `X-API-Key`, then assert `status_code == 401` and `response.json()["error"]["code"] == "PRODUCTION_ACCESS_DISABLED"`.
- [ ] **Step 2: Run** `python manage.py test api.tests` and expect it to fail with `'AUTHENTICATION_FAILED' != 'PRODUCTION_ACCESS_DISABLED'`.
- [ ] **Step 3: Implement.** In `custom_exception_handler`, when `exc.get_codes()` returns a `str`, use it as the code. Otherwise keep `getattr(exc, 'default_code', 'error')`. Upper-case either way. Dict details, as from validation errors, keep today's behaviour.
- [ ] **Step 4: Run** `python manage.py test api` and expect it to pass, with every existing API test still green.
- [ ] **Step 5: Prepare the commit** `fix(api): keep the error code an exception was raised with`. It goes through that repo's normal PR into `main`, and the library's first release waits until it's deployed.

### Task 1: Repository scaffold, tooling and CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.gitignore`, `LICENSE`, `src/version.ts`, `src/index.ts`, `.github/workflows/ci.yml`, `test/version.test.ts`
- Copy: the spec and this plan into `docs/specs/` and `docs/plans/`

**Interfaces:**
- Produces: `export const VERSION: string` in `src/version.ts`, starting at `'0.0.0'` and followed by the comment `// x-release-please-version`. Scripts: `build`, `test`, `lint`, `typecheck`, `generate`.

- [ ] **Step 1: Create the GitHub repo.** `gh repo create halcore/toyyib-node --public --description "TypeScript client for the Toyyib Shariah screening API"`, cloned locally, default branch `main`.
- [ ] **Step 2: Write `package.json`.**
  - `"name": "@toyyib/sdk"`, `"version": "0.0.0"`, `"license": "MIT"`, `"type": "module"`, `"sideEffects": false`
  - `"engines": {"node": ">=18"}`, `"files": ["dist"]`
  - `exports` maps `import` to `dist/index.js`, `require` to `dist/index.cjs` and `types` to `dist/index.d.ts`
  - dev dependencies only: typescript, tsup, vitest, openapi-typescript, eslint, typescript-eslint, prettier, eslint-config-prettier
- [ ] **Step 3: Configure the tools.**
  - `tsconfig.json`: strict, `"target": "ES2022"`, `"lib": ["ES2022", "DOM"]` for the fetch types
  - `tsup.config.ts`: entry `src/index.ts`, formats `esm` and `cjs`, `dts: true`, `clean: true`
- [ ] **Step 4: Write the failing test** `test/version.test.ts`, asserting that `VERSION` matches `/^\d+\.\d+\.\d+/`.
- [ ] **Step 5: Run** `npm test` and expect it to fail, because `src/version.ts` doesn't exist yet.
- [ ] **Step 6: Add the code.** `src/version.ts`, plus `src/index.ts` exporting `VERSION`.
- [ ] **Step 7: Run** `npm test && npm run build && npm run lint && npm run typecheck`. Expect everything to pass, with `dist/` containing `index.js`, `index.cjs` and `index.d.ts`.
- [ ] **Step 8: Add CI.** `.github/workflows/ci.yml` runs on pull requests and pushes to `main`, using a matrix of Node 18, 20 and 22. It runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
- [ ] **Step 9: Prepare the commit** `chore: set up the package, tooling and CI`.

### Task 2: Runtime helpers and client options

**Files:**
- Create: `src/core/runtime.ts`, `src/core/options.ts`, `src/core/errors.ts` (the base class only), `test/runtime.test.ts`, `test/options.test.ts`

**Interfaces:**
- Produces:
  - `class ToyyibError extends Error` in `src/core/errors.ts`, with `status: number | undefined`, `code: string` and `details: unknown`. Its constructor is `(message: string, init: { status?: number; code: string; details?: unknown; cause?: unknown })`. Task 3 adds the subclasses.
  - `readEnv(name: string): string | undefined`. Reads `process.env`, then `Deno.env.get`. Never throws, including when `process` doesn't exist or Deno refuses permission.
  - `isBrowserLike(): boolean`. True when `window` and `window.document` exist, or when `navigator.product === 'ReactNative'`.
  - `interface ClientOptions { apiKey?: string; baseURL?: string; timeout?: number; maxRetries?: number; fetch?: typeof fetch; dangerouslyAllowBrowser?: boolean }`
  - `interface ResolvedOptions { apiKey: string; baseURL: string; timeout: number; maxRetries: number; fetch: typeof fetch }`
  - `resolveOptions(options?: ClientOptions): ResolvedOptions`
  - `type Mode = 'sandbox' | 'live' | 'unknown'` and `modeFromKey(key: string): Mode`. `sk_test_` is sandbox and `sk_live_` is live. Anything else is `unknown` and is left for the server to reject.
  - `DEFAULT_BASE_URL = 'https://api.toyyib.app/api/v1'`, `DEFAULT_TIMEOUT_MS = 60_000`, `DEFAULT_MAX_RETRIES = 2`

- [ ] **Step 1: Write the failing tests.**
  - `test/runtime.test.ts`:
    - `readEnv` returns the value when `process.env` has it.
    - It returns `undefined` with `globalThis.process` stubbed to `undefined` (Review Focus 2).
    - It reads a stubbed `Deno.env.get`.
    - It returns `undefined` when `Deno.env.get` throws.
    - `isBrowserLike` is true with stubbed `window.document`, true with `navigator.product = 'ReactNative'`, and false in Node.
  - `test/options.test.ts`:
    - An explicit `apiKey` beats `TOYYIB_API_KEY`.
    - With no key, it throws a `ToyyibError` with code `MISSING_API_KEY` and the message ``No Toyyib API key found. Pass `apiKey` or set TOYYIB_API_KEY. To get a sandbox key, contact info@halcore.app.``
    - In a browser-like runtime, it throws code `BROWSER_NOT_ALLOWED` unless `dangerouslyAllowBrowser: true`.
    - The defaults equal the three constants.
    - `modeFromKey('sk_test_x') === 'sandbox'`, `'sk_live_x'` gives `'live'`, and `'abc'` gives `'unknown'`.
- [ ] **Step 2: Run** `npx vitest run test/runtime.test.ts test/options.test.ts` and expect it to fail, because the modules don't exist.
- [ ] **Step 3: Implement** the signatures above. Use `globalThis` lookups behind `typeof` checks, never bare `process`.
- [ ] **Step 4: Run** the same command and expect it to pass.
- [ ] **Step 5: Prepare the commit** `feat: read client options and the API key safely on every runtime`.

### Task 3: Errors and the transport

**Files:**
- Create: `src/core/request.ts`, `test/helpers/fake-fetch.ts`, `test/errors.test.ts`, `test/request.test.ts`
- Modify: `src/core/errors.ts`

**Interfaces:**
- Consumes: `ResolvedOptions` and `ToyyibError` from Task 2.
- Produces:
  - The subclasses `AuthenticationError`, `ProductionAccessDisabledError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `ValidationError`, `APIError`, `ConnectionError` and `TimeoutError`, which share that constructor. `RateLimitError` adds `retryAfter: number | null` in seconds.
  - `errorFromResponse(status: number, body: unknown, headers: Headers): ToyyibError`. 401 gives `ProductionAccessDisabledError` when `code === 'PRODUCTION_ACCESS_DISABLED'` and `AuthenticationError` otherwise; 403 gives `PermissionDeniedError`; 404 `NotFoundError`; 409 `ConflictError`; 400 and 422 `ValidationError`; 429 `RateLimitError`, with `retryAfter` from Task 4's `parseRetryAfter`, or `null` until then; 5xx `APIError`; anything else a plain `ToyyibError`. A body that isn't `{ success: false, error: { code, message } }` gives an `APIError` with code `UNEXPECTED_RESPONSE`.
  - `maskKey(key: string): string` gives `key.slice(0, 8) + '****' + key.slice(-4)`.
  - `interface RequestOptions { method: 'GET' | 'POST'; path: string; query?: Record<string, string | number | undefined>; body?: unknown }`
  - `class Transport`, with `constructor(options: ResolvedOptions)` and `request<T>(opts: RequestOptions): Promise<T>`, which resolves to the envelope's `data`. It stores the key in a `#private` field. Before throwing, it replaces any copy of the key in an error's `message` or `details` with `maskKey(key)`.
  - `fakeFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> } | Error>)` returns `{ fetch, calls }`, where `calls` records the URL, method, headers and body.

- [ ] **Step 1: Write the failing tests.**
  - `test/errors.test.ts`: one case per row of the spec's error table. Use the codes `PRODUCTION_ACCESS_DISABLED`, `SECURITY_NOT_FOUND`, `AMBIGUOUS_IDENTIFIER`, `VALIDATION_ERROR` and `TICKERS_NOT_FOUND`. Also cover:
    - an unknown 418 code becoming a plain `ToyyibError` that keeps its code and message,
    - an HTML 502 body becoming `APIError` with `UNEXPECTED_RESPONSE`,
    - `maskKey('sk_test_abcdefgh1234') === 'sk_test_****1234'`.
  - `test/request.test.ts`:
    - It sends `X-API-Key`, `Accept: application/json` and `User-Agent: toyyib-sdk-node/${VERSION}`.
    - It unwraps `{ success: true, data: { a: 1 }, message: 'ok' }` to `{ a: 1 }`.
    - A 2xx body without `success: true` throws `APIError`.
    - It POSTs a JSON body with `Content-Type: application/json`.
    - **URLs (Review Focus 5):**
      - `baseURL` `'https://x.test/api/v1/'` plus path `'stocks/compliant'` gives `https://x.test/api/v1/stocks/compliant`, and the same without the trailing slash.
      - The query `{ region: 'NGX', sector: undefined }` gives exactly `?region=NGX`.
    - **Timeouts:** with fake timers, a timeout throws `TimeoutError` (code `TIMEOUT`), and a fetch that rejects with a `TypeError` throws `ConnectionError` (code `CONNECTION_ERROR`).
    - **No key leak (Review Focus 1):**
      - `util.inspect(transport)` and `JSON.stringify(transport)` don't contain the key, and the message, `stack` and `String(err)` of each thrown error don't either.
      - A 400 whose server message echoes the key comes back with `sk_test_****` plus the last four characters instead.
- [ ] **Step 2: Run** `npx vitest run test/errors.test.ts test/request.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** the signatures above. Use one `AbortController` per attempt for the timeout, and don't retry yet (Task 4 adds that). Build URLs by trimming the slashes between `baseURL` and `path`, then using `new URL()` and `URLSearchParams`.
- [ ] **Step 4: Run** the same command and expect it to pass.
- [ ] **Step 5: Prepare the commit** `feat: add typed errors and the request transport`.

### Task 4: Retries and rate limits

**Files:**
- Create: `src/core/retry.ts`, `test/retry.test.ts`
- Modify: `src/core/request.ts` (the retry loop around one attempt) and `src/core/errors.ts` (`RateLimitError.retryAfter` via `parseRetryAfter`)

**Interfaces:**
- Produces:
  - `MAX_RETRY_AFTER_SECONDS = 60`, `BASE_DELAY_MS = 500`, `MAX_DELAY_MS = 8_000`
  - `parseRetryAfter(value: string | null, now?: number): number | null`. Handles delta-seconds and HTTP dates; anything unparseable is `null`.
  - `isRetryable(error: ToyyibError): boolean`. True for `ConnectionError`, `TimeoutError` and `APIError` with a 5xx status, and for `RateLimitError` whose `retryAfter` is `null` or ≤ 60.
  - `retryDelayMs(attempt: number, retryAfter: number | null, random?: () => number): number`. Returns `retryAfter * 1000` when set. Otherwise it's `min(500 * 2 ** (attempt - 1), 8000) * (0.75 + 0.25 * random())`.

- [ ] **Step 1: Write the failing tests** `test/retry.test.ts`.
  - **Parsing (Review Focus 4):** `parseRetryAfter('60') === 60`. An HTTP date 30 s after `now` gives `30`. `'soon'` and `null` give `null`.
  - **Delays:** `retryDelayMs(1, null, () => 1) === 500`, `retryDelayMs(5, null, () => 1) === 8000` and `retryDelayMs(1, 60) === 60000`.
  - **With the transport, using fake timers and `fakeFetch`:**
    - A 503 then a 200 resolves after one retry.
    - Three 500s throw `APIError` after exactly 3 calls (1 + `maxRetries` 2).
    - A 429 with `Retry-After: 60` then a 200 resolves, having waited 60 s.
    - A 429 with `Retry-After: 50000` (the daily limit) throws `RateLimitError` with `retryAfter === 50000` after exactly 1 call.
    - A 400 is never retried, and `maxRetries: 0` disables retries.
- [ ] **Step 2: Run** `npx vitest run test/retry.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** the signatures, and the loop in `Transport.request`: try, and on a retryable error wait `retryDelayMs` and try again, up to `maxRetries`.
- [ ] **Step 4: Run** `npx vitest run` and expect it to pass, with Task 3's tests still green.
- [ ] **Step 5: Prepare the commit** `feat: retry network errors, server errors and short rate limits`.

### Task 5: Paging

**Files:**
- Create: `src/core/pagination.ts`, `test/pagination.test.ts`

**Interfaces:**
- Produces:
  - `class CursorPage<T> implements AsyncIterable<T>`. It has `data: T[]`, `nextToken: string | null`, `hasMore: boolean` and `nextPage(): Promise<CursorPage<T> | null>`. It's built from `(fetchPage: (nextToken?: string) => Promise<{ items: T[]; next_token: string | null }>, first: { items: T[]; next_token: string | null })`. Iterating it yields every item across pages.
  - `class NumberedPage<T> implements AsyncIterable<T>`. It has `data: T[]`, `page: number`, `hasMore: boolean` and `nextPage()`. It's built from `(fetchPage: (page: number) => Promise<{ reports: T[]; pagination?: { current_page: number; has_next: boolean } }>, first, page)`. A reply without `pagination` is a single, last page; the API returns that when it isn't paginating.
  - `type PagePromise<P, T> = Promise<P> & AsyncIterable<T>` and `pagePromise<P extends AsyncIterable<T>, T>(load: () => Promise<P>): PagePromise<P, T>`. This lets `for await (const s of toyyib.stocks.listCompliant())` work without an `await` first.

- [ ] **Step 1: Write the failing tests.**
  - Cursor paging over three pages (`next_token` `'a'`, `'b'`, `null`) yields every item in order and calls `fetchPage` with `'a'` and then `'b'`.
  - `hasMore` is false on the last page, and `nextPage()` there resolves to `null`.
  - **No endless loop (Review Focus 3):**
    - A page whose `next_token` equals the token used to fetch it stops after that page.
    - A page with `items: []` and a non-null token stops.
  - Numbered paging follows `has_next` and passes the page numbers 2, 3 and so on. A first reply without `pagination` yields its items once and stops.
  - `pagePromise` works both with `await` and with `for await`.
- [ ] **Step 2: Run** `npx vitest run test/pagination.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** the signatures above.
- [ ] **Step 4: Run** the same command and expect it to pass.
- [ ] **Step 5: Prepare the commit** `feat: add cursor and numbered paging with for-await support`.

### Task 6: Schema snapshot and generated types

**Files:**
- Create: `scripts/filter-schema.mjs`, `scripts/generate.mjs`, `openapi/schema.json`, `src/generated/schema.d.ts`, `src/types.ts`, `test/filter-schema.test.ts`

**Interfaces:**
- Produces:
  - `filterSchema(schema: object): object`. Keeps only the paths under `/api/v1/` for stocks, etfs, regions, exchanges, reports, usage and portfolio, which are the spec's endpoints. Removes everything else, including `/v1/` and `/internal/`. Removes components no kept path refers to, following `$ref`s transitively. Keeps `info` and `components.securitySchemes.ApiKeyAuth`, and drops the other security schemes.
  - `npm run generate` runs `scripts/generate.mjs`. It fetches `${TOYYIB_SCHEMA_URL ?? 'https://api.toyyib.app/api/v1/schema/'}?format=json`, or reads the file when the URL starts with `file://`. Then it filters the schema, writes the result to `openapi/schema.json` with stable key order and 2-space indentation, and runs `openapi-typescript openapi/schema.json -o src/generated/schema.d.ts`.
  - `src/types.ts` exports the friendly names `StockCompliance`, `Filing`, `FilingInputs`, `FilingEvidence`, `ETFCompliance`, `Region`, `Exchange`, `Report`, `ReportStats`, `ReportDownload`, `PortfolioHolding`, `PortfolioAnalysis` and `Usage`.
    - Each is an alias of a schema component where one exists.
    - Where the schema has no response component, it's written by hand from the API docs. The ones expected are `Usage` (`key`, `plan` and `usage` objects), `ReportDownload` (`download_url: string | null`, `file_name`, `file_size`) and `ReportStats`.
    - `PortfolioHolding` is `{ ticker: string; shares: number }`.

- [ ] **Step 1: Write the failing tests** `test/filter-schema.test.ts`, using a small invented schema. The filter keeps `/api/v1/stocks/compliant` and the component it uses, including a nested `$ref`. It drops `/v1/stocks/` and `/internal/v1/x`, and the components only they use. It drops the `BearerAuth` scheme.
- [ ] **Step 2: Run** `npx vitest run test/filter-schema.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** `filterSchema` and `scripts/generate.mjs`.
- [ ] **Step 4: Run** `npx vitest run test/filter-schema.test.ts` and expect it to pass.
- [ ] **Step 5: Generate the types.**
  - Run `npm run generate`. If `api.toyyib.app` is unreachable, devProMaleek exports the schema from the server checkout and runs `TOYYIB_SCHEMA_URL=file://… npm run generate`.
  - Then check: `grep -c '"/api/v1/' openapi/schema.json` is at least 20, and `grep -E '"/(v1|internal)/' openapi/schema.json` prints nothing.
- [ ] **Step 6: Write `src/types.ts`** and run `npm run typecheck`, expecting it to pass.
- [ ] **Step 7: Prepare the commit** `feat: generate API types from a filtered schema snapshot`. The reviewer reads `openapi/schema.json` for anything that shouldn't be public.

### Task 7: Stocks and filings

**Files:**
- Create: `src/resources/stocks.ts`, `src/resources/filings.ts`, `test/stocks.test.ts`

**Interfaces:**
- Consumes: `Transport.request` (Task 3), `CursorPage` and `pagePromise` (Task 5), and the types from Task 6.
- Produces:
  - `class Stocks`, with `constructor(transport: Transport)` and `readonly filings: Filings`, plus these methods:
    - `listCompliance(params?: { region?: string; status?: 'COMPLIANT' | 'NON_COMPLIANT' | 'QUESTIONABLE'; sector?: string; page_size?: number }): PagePromise<CursorPage<StockCompliance>, StockCompliance>`
    - `listCompliant(params?: { region?: string; sector?: string; page_size?: number })`, with the same return type
    - `compliance(symbol: string, params?: { region?: string }): Promise<StockCompliance>`
    - `report(symbol: string, params?: { region?: string }): Promise<unknown>`, typed from the schema in Task 6 if one exists
  - `class Filings`, with these methods:
    - `latest(symbol, params?: { region? })`
    - `latestInputs(symbol, params?: { region?; include?: 'ignored' })`
    - `latestEvidence(symbol, params?)`
    - `list(symbol, params?: { region?; fiscal_period?; fiscal_year? })`
    - `retrieve(symbol, filingId: string, params?)`
    - `inputs(symbol, filingId, params?)`
    - `evidence(symbol, filingId, params?)`

  Every symbol is sent as `encodeURIComponent(symbol)` in the path. The paths are exactly the spec's table, relative to `baseURL`, for example `stocks/${s}/filings/latest/inputs`.

- [ ] **Step 1: Write the failing tests** `test/stocks.test.ts`, using `fakeFetch`.
  - Each method hits the right method and path with the right query. For example, `compliance('NGX:GTCO', { region: 'NGX' })` gives `GET …/stocks/NGX%3AGTCO/compliance?region=NGX`, and `filings.list('TESTCO', { fiscal_year: 2025 })` gives `?fiscal_year=2025` (Review Focus 5).
  - A lowercase symbol is sent unchanged.
  - `listCompliant()` iterates two cursor pages.
  - A 409 `AMBIGUOUS_IDENTIFIER` reply on `compliance('GTCO')` throws `ConflictError`.
  - A 403 on `report('TESTCO')` throws `PermissionDeniedError`.
- [ ] **Step 2: Run** `npx vitest run test/stocks.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** both classes. Each method is a single `transport.request` call, or a `pagePromise` around one. Each gets a doc comment saying which plan it needs, following the spec's "Reports access" notes.
- [ ] **Step 4: Run** the same command and expect it to pass.
- [ ] **Step 5: Prepare the commit** `feat: add stocks and filings`.

### Task 8: ETFs, markets, reports, portfolio, usage, and the `Toyyib` client

**Files:**
- Create: `src/resources/etfs.ts`, `markets.ts`, `reports.ts`, `portfolio.ts`, `usage.ts`, `src/client.ts`, `test/resources.test.ts`, `test/client.test.ts`
- Modify: `src/index.ts`, to export `Toyyib`, every error class, `CursorPage`, `NumberedPage`, the types in `src/types.ts`, `VERSION` and `ClientOptions`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - **Resources:**
    - `Etfs.listCompliance(params?: { status?; page_size? })`, which uses cursor paging
    - `Markets.regions(): Promise<Region[]>` and `Markets.exchanges(): Promise<Exchange[]>`
    - `Reports.list(params?: { type?: 'monthly' | 'quarterly' | 'special'; page?: number }): PagePromise<NumberedPage<Report>, Report>`
    - `Reports.stats(): Promise<ReportStats>` and `Reports.download(reportId: string): Promise<ReportDownload>`
    - `Portfolio.analyze(params: { holdings: PortfolioHolding[] }): Promise<PortfolioAnalysis>`. Before sending, it throws `ValidationError` with code `INVALID_HOLDINGS` for 0 or more than 50 holdings, or for a ticker repeated without regard to case.
  - **Client:**
    - `class Toyyib`, with `constructor(options?: ClientOptions)`, `readonly mode: Mode` and the resource properties `stocks`, `etfs`, `markets`, `reports` and `portfolio`.
    - `usage(): Promise<Usage>`, and `toJSON(): { mode: Mode; baseURL: string }` so the key never serialises.

- [ ] **Step 1: Write the failing tests.**
  - `test/resources.test.ts`:
    - Each method hits the right path (`etfs/compliance`, `regions`, `exchanges`, `reports?type=monthly&page=2`, `reports/stats`, `reports/<id>/download`, POST `portfolio/analyze` with the body `{"holdings":[{"ticker":"TESTCO","shares":10}]}`, and `usage`).
    - `reports.download` returns `download_url` unchanged.
    - `portfolio.analyze` rejects `[]`, 51 holdings, and `[{ticker:'testco'},{ticker:'TESTCO'}]` without making a request.
  - `test/client.test.ts`:
    - `new Toyyib({ apiKey: 'sk_test_x', fetch })` has `mode === 'sandbox'`.
    - Every resource property exists.
    - `JSON.stringify(client)` and `util.inspect(client)` don't contain the key (Review Focus 1).
    - A snapshot of `Object.keys(await import('../src/index'))` catches accidental changes to the public exports.
- [ ] **Step 2: Run** `npx vitest run test/resources.test.ts test/client.test.ts` and expect it to fail.
- [ ] **Step 3: Implement** the signatures above, giving each method a doc comment that says which plan it needs (reports access, or export access for `download`).
- [ ] **Step 4: Run** `npm test && npm run build && npm run typecheck` and expect everything to pass.
- [ ] **Step 5: Prepare the commit** `feat: add ETFs, markets, reports, portfolio, usage and the Toyyib client`.

### Task 9: Docs, examples and repo files

**Files:**
- Create: `README.md`, `examples/check-stock.ts`, `examples/screen-portfolio.ts`, `examples/tsconfig.json`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/CODEOWNERS`
- Modify: `.github/workflows/ci.yml`, to add `npx tsc -p examples` to the steps

**Interfaces:**
- Consumes: the public API from Task 8. The examples import from `'@toyyib/sdk'`, which `examples/tsconfig.json` resolves to `../src/index.ts`.

- [ ] **Step 1: Write `README.md`.**
  - Install, then a sandbox quickstart: `TOYYIB_API_KEY=sk_test_…` plus a 6-line `compliance('TESTCO')` example, with "Contact info@halcore.app for a sandbox key".
  - Sections on keys and modes (sandbox only sees TESTCO data), errors (the error table, with a `try/catch` on `ProductionAccessDisabledError`), paging (`for await`), retries and rate limits, runtimes, and the server-only rule.
  - A link to the API docs at `https://api.toyyib.app/api/v1/docs/`, and the MIT licence.
- [ ] **Step 2: Write the two examples** using only TESTCO-style symbols. Run `npx tsc -p examples` and expect it to pass.
- [ ] **Step 3: Write the repo files.**
  - `CONTRIBUTING.md`: setup, `npm test`, Conventional Commits, and `npm run generate`.
  - `SECURITY.md`: report vulnerabilities privately to info@halcore.app, never in a public issue.
  - `CODEOWNERS`: `* @devProMaleek`.
- [ ] **Step 4: Prepare the commit** `docs: add the README, examples, contributing and security guides`.

### Task 10: Release, schema check, smoke test and repo settings

**Files:**
- Create: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release.yml`, `.github/workflows/schema-check.yml`, `.github/workflows/smoke.yml`, `.github/dependabot.yml`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `VERSION` (`src/version.ts`, with its `x-release-please-version` marker) and `filterSchema` (Task 6).

- [ ] **Step 1: Set up release-please.**
  - Config: `release-type: node`, `extra-files: ["src/version.ts"]`, `bump-minor-pre-major: true`, `"bootstrap-sha"` set to the first commit. The manifest starts at `{ ".": "0.0.0" }`.
  - `release.yml`, on pushes to `main`:
    - The release-please action runs first.
    - When it creates a release, a second job runs `npm ci && npm run build`, then `npm publish --provenance --access public`.
    - That job has `permissions: id-token: write` for npm trusted publishing, with no `NPM_TOKEN` secret.
- [ ] **Step 2: Add the schema check.** `schema-check.yml` runs weekly (Monday 06:00 UTC) and on manual dispatch. It runs `npm run generate`, and if `git diff --quiet openapi/schema.json` fails, opens or updates one issue titled "API schema changed" using `gh issue`.
- [ ] **Step 3: Add the smoke test.**
  - `smoke.yml` runs on manual dispatch only and passes the secret `TOYYIB_SANDBOX_KEY` to `node scripts/smoke.mjs`.
  - `scripts/smoke.mjs` calls every method once against the sandbox and prints one line per endpoint (`ok` or the error code). It exits with code 1 if any call failed for a reason other than `PermissionDeniedError`, since the sandbox plan may lack reports or export access.
- [ ] **Step 4: Add `dependabot.yml`,** checking npm dev dependencies and GitHub Actions weekly.
- [ ] **Step 5: Check the release config.** Run `npx release-please release-pr --dry-run --repo-url halcore/toyyib-node --token "$(gh auth token)"`, expecting a proposed `0.1.0` with no errors. Then validate the workflows with `actionlint` if it's installed.
- [ ] **Step 6: Prepare the commit** `ci: add releases, the weekly schema check and the sandbox smoke test`.
- [ ] **Step 7: Repo settings, done by devProMaleek or with approval after the first push.**
  - Branch protection on `main` requires CI to pass and a CODEOWNERS review.
  - On npmjs.com, add this repo's `release.yml` as a trusted publisher for `@toyyib/sdk`.
  - Add the `TOYYIB_SANDBOX_KEY` secret.

## Release checklist (after all tasks)

1. The `toyyib` npm organisation exists, Task 0's server fix is deployed, and the sandbox smoke test passes.
2. The release-please PR for `0.1.0` is merged, which publishes to npm.
3. `npm view @toyyib/sdk` shows `0.1.0` with provenance.
4. A partner brokerage gets a sandbox key and the README link.
