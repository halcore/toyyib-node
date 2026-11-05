import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Toyyib } from '../src/client';
import { Etfs } from '../src/resources/etfs';
import { Filings } from '../src/resources/filings';
import { Markets } from '../src/resources/markets';
import { Portfolio } from '../src/resources/portfolio';
import { Reports } from '../src/resources/reports';
import { Stocks } from '../src/resources/stocks';
import { fakeFetch } from './helpers/fake-fetch';

const KEY = 'sk_test_abcdefgh1234';

describe('Toyyib', () => {
  it('reads the mode from the key', () => {
    const { fetch } = fakeFetch([]);
    expect(new Toyyib({ apiKey: 'sk_test_x', fetch }).mode).toBe('sandbox');
    expect(new Toyyib({ apiKey: 'sk_live_x', fetch }).mode).toBe('live');
  });

  it('has every resource', () => {
    const toyyib = new Toyyib({ apiKey: KEY, fetch: fakeFetch([]).fetch });
    expect(toyyib.stocks).toBeInstanceOf(Stocks);
    expect(toyyib.stocks.filings).toBeInstanceOf(Filings);
    expect(toyyib.etfs).toBeInstanceOf(Etfs);
    expect(toyyib.markets).toBeInstanceOf(Markets);
    expect(toyyib.reports).toBeInstanceOf(Reports);
    expect(toyyib.portfolio).toBeInstanceOf(Portfolio);
  });

  it('gets the usage', async () => {
    const usage = { key: { mode: 'sandbox' } };
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { success: true, data: usage, message: 'ok' } },
    ]);
    const toyyib = new Toyyib({
      apiKey: KEY,
      baseURL: 'https://x.test/api/v1',
      fetch,
    });
    expect(await toyyib.usage()).toEqual(usage);
    expect(calls[0]!.url).toBe('https://x.test/api/v1/usage');
    expect(calls[0]!.headers['x-api-key']).toBe(KEY);
  });

  it('never shows the key when logged or serialised', () => {
    const toyyib = new Toyyib({ apiKey: KEY, fetch: fakeFetch([]).fetch });
    expect(JSON.parse(JSON.stringify(toyyib))).toEqual({
      mode: 'sandbox',
      baseURL: 'https://api.toyyib.app/api/v1',
    });
    expect(inspect(toyyib, { showHidden: true, depth: 10 })).not.toContain(KEY);
    expect(String(toyyib)).not.toContain(KEY);
  });
});

describe('public exports', () => {
  it('are exactly these', async () => {
    const sdk = await import('../src/index');
    expect(Object.keys(sdk).sort()).toEqual([
      'APIError',
      'AuthenticationError',
      'ConflictError',
      'ConnectionError',
      'CursorPage',
      'NotFoundError',
      'NumberedPage',
      'PermissionDeniedError',
      'ProductionAccessDisabledError',
      'RateLimitError',
      'TimeoutError',
      'Toyyib',
      'ToyyibError',
      'VERSION',
      'ValidationError',
    ]);
  });
});
