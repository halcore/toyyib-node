import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  PermissionDeniedError,
  ToyyibError,
} from '../src/core/errors';
import { Transport } from '../src/core/request';
import { Stocks } from '../src/resources/stocks';
import { fakeFetch, type ScriptedResponse } from './helpers/fake-fetch';

const BASE = 'https://x.test/api/v1';

function ok(data: unknown): ScriptedResponse {
  return { status: 200, body: { success: true, data, message: 'ok' } };
}

function failure(status: number, code: string, details?: unknown) {
  return {
    status,
    body: { success: false, error: { code, message: `${code}.`, details } },
  };
}

function makeStocks(responses: ScriptedResponse[]) {
  const { fetch, calls } = fakeFetch(responses);
  const transport = new Transport({
    apiKey: 'sk_test_abcdefgh1234',
    baseURL: BASE,
    timeout: 1_000,
    maxRetries: 0,
    fetch,
  });
  return { stocks: new Stocks(transport), calls };
}

const emptyPage = { items: [], next_token: null };

describe('Stocks and filings requests', () => {
  it.each<[string, (stocks: Stocks) => Promise<unknown>, string, unknown]>([
    [
      'listCompliance',
      (s) =>
        s.listCompliance({
          region: 'NGX',
          status: 'COMPLIANT',
          sector: 'Banking',
          page_size: 2,
        }),
      '/stocks/compliance?region=NGX&status=COMPLIANT&sector=Banking&page_size=2',
      emptyPage,
    ],
    ['listCompliant', (s) => s.listCompliant(), '/stocks/compliant', emptyPage],
    [
      'compliance',
      (s) => s.compliance('NGX:GTCO', { region: 'NGX' }),
      '/stocks/NGX%3AGTCO/compliance?region=NGX',
      {},
    ],
    ['report', (s) => s.report('TESTCO'), '/stocks/TESTCO/report', {}],
    [
      'filings.latest',
      (s) => s.filings.latest('TESTCO', { region: 'NGX' }),
      '/stocks/TESTCO/filings/latest?region=NGX',
      {},
    ],
    [
      'filings.latestInputs',
      (s) => s.filings.latestInputs('TESTCO', { include: 'ignored' }),
      '/stocks/TESTCO/filings/latest/inputs?include=ignored',
      {},
    ],
    [
      'filings.latestEvidence',
      (s) => s.filings.latestEvidence('TESTCO'),
      '/stocks/TESTCO/filings/latest/evidence',
      {},
    ],
    [
      'filings.list',
      (s) =>
        s.filings.list('TESTCO', { fiscal_period: 'Q3', fiscal_year: 2025 }),
      '/stocks/TESTCO/filings?fiscal_period=Q3&fiscal_year=2025',
      { items: [] },
    ],
    [
      'filings.retrieve',
      (s) => s.filings.retrieve('TESTCO', 'f-1'),
      '/stocks/TESTCO/filings/f-1',
      {},
    ],
    [
      'filings.inputs',
      (s) => s.filings.inputs('TESTCO', 'f-1', { include: 'ignored' }),
      '/stocks/TESTCO/filings/f-1/inputs?include=ignored',
      {},
    ],
    [
      'filings.evidence',
      (s) => s.filings.evidence('TESTCO', 'f-1', { region: 'NASD' }),
      '/stocks/TESTCO/filings/f-1/evidence?region=NASD',
      {},
    ],
  ])('%s sends GET %s', async (_, call, path, data) => {
    const { stocks, calls } = makeStocks([ok(data)]);
    await call(stocks);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe(`${BASE}${path}`);
  });

  it('returns the reply data', async () => {
    const stock = { symbol: 'TESTCO', status: 'COMPLIANT' };
    const { stocks } = makeStocks([ok(stock)]);
    expect(await stocks.compliance('TESTCO')).toEqual(stock);
  });

  it('sends a lowercase symbol unchanged', async () => {
    const { stocks, calls } = makeStocks([ok({})]);
    await stocks.compliance('testco');
    expect(calls[0]!.url).toBe(`${BASE}/stocks/testco/compliance`);
  });

  it('encodes characters that would change the path', async () => {
    const { stocks, calls } = makeStocks([ok({})]);
    await stocks.filings.retrieve('A/B', 'id?x#y');
    expect(calls[0]!.url).toBe(`${BASE}/stocks/A%2FB/filings/id%3Fx%23y`);
  });
});

describe('Stocks cursor lists', () => {
  it('iterates every page, keeping the filters', async () => {
    const { stocks, calls } = makeStocks([
      ok({ items: [{ symbol: 'A' }, { symbol: 'B' }], next_token: 't1' }),
      ok({ items: [{ symbol: 'C' }], next_token: null }),
    ]);
    const symbols: string[] = [];
    for await (const stock of stocks.listCompliant({ sector: 'Banking' })) {
      symbols.push(stock.symbol);
    }
    expect(symbols).toEqual(['A', 'B', 'C']);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/stocks/compliant?sector=Banking`,
      `${BASE}/stocks/compliant?sector=Banking&next_token=t1`,
    ]);
  });

  it('gives the first page with await', async () => {
    const { stocks } = makeStocks([
      ok({ items: [{ symbol: 'A' }], next_token: 't1' }),
    ]);
    const page = await stocks.listCompliance();
    expect(page.data).toEqual([{ symbol: 'A' }]);
    expect(page.hasMore).toBe(true);
  });
});

describe('Stocks errors', () => {
  it('throws ConflictError for an ambiguous bare ticker', async () => {
    const candidates = ['NGX:GTCO', 'NASD:GTCO'];
    const { stocks } = makeStocks([
      failure(409, 'AMBIGUOUS_IDENTIFIER', { candidates }),
    ]);
    const err = await stocks.compliance('GTCO').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ToyyibError).code).toBe('AMBIGUOUS_IDENTIFIER');
    expect((err as ToyyibError).details).toEqual({ candidates });
  });

  it('throws PermissionDeniedError when the plan has no reports access', async () => {
    const { stocks } = makeStocks([failure(403, 'PERMISSION_DENIED')]);
    await expect(stocks.report('TESTCO')).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});
