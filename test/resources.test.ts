import { describe, expect, it } from 'vitest';

import { ToyyibError, ValidationError } from '../src/core/errors';
import { Transport } from '../src/core/request';
import { Etfs } from '../src/resources/etfs';
import { Markets } from '../src/resources/markets';
import { Portfolio } from '../src/resources/portfolio';
import { Reports } from '../src/resources/reports';
import { fakeFetch, type ScriptedResponse } from './helpers/fake-fetch';

const BASE = 'https://x.test/api/v1';

function ok(data: unknown): ScriptedResponse {
  return { status: 200, body: { success: true, data, message: 'ok' } };
}

function makeTransport(responses: ScriptedResponse[]) {
  const { fetch, calls } = fakeFetch(responses);
  const transport = new Transport({
    apiKey: 'sk_test_abcdefgh1234',
    baseURL: BASE,
    timeout: 1_000,
    maxRetries: 0,
    fetch,
  });
  return { transport, calls };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('Etfs', () => {
  it('lists ETF compliance with cursor paging', async () => {
    const { transport, calls } = makeTransport([
      ok({ items: [{ symbol: 'TESTETF' }], next_token: 't1' }),
      ok({ items: [{ symbol: 'TESTETF2' }], next_token: null }),
    ]);
    const etfs = new Etfs(transport);
    const list = etfs.listCompliance({
      region: 'NGX',
      status: 'COMPLIANT',
      page_size: 10,
    });
    expect((await collect(list)).map((e) => e.symbol)).toEqual([
      'TESTETF',
      'TESTETF2',
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/etfs/compliance?region=NGX&status=COMPLIANT&page_size=10`,
      `${BASE}/etfs/compliance?region=NGX&status=COMPLIANT&page_size=10&next_token=t1`,
    ]);
  });
});

describe('Markets', () => {
  it('returns the regions list', async () => {
    const regions = [
      { code: 'NGX', name: 'Nigerian Exchange', type: 'EXCHANGE' },
    ];
    const { transport, calls } = makeTransport([ok({ regions })]);
    expect(await new Markets(transport).regions()).toEqual(regions);
    expect(calls[0]!.url).toBe(`${BASE}/regions`);
  });

  it('returns the exchanges list', async () => {
    const items = [{ code: 'NASD', name: 'NASD OTC', type: 'OTC' }];
    const { transport, calls } = makeTransport([ok({ items })]);
    expect(await new Markets(transport).exchanges()).toEqual(items);
    expect(calls[0]!.url).toBe(`${BASE}/exchanges`);
  });
});

describe('Reports', () => {
  const pagination = (page: number, hasNext: boolean) => ({
    current_page: page,
    per_page: 20,
    total_pages: 2,
    total_items: 21,
    has_next: hasNext,
    has_previous: page > 1,
  });

  it('lists reports with the type and page', async () => {
    const { transport, calls } = makeTransport([
      ok({ reports: [], pagination: pagination(2, false) }),
    ]);
    const page = await new Reports(transport).list({
      type: 'monthly',
      page: 2,
    });
    expect(page.page).toBe(2);
    expect(calls[0]!.url).toBe(`${BASE}/reports?type=monthly&page=2`);
  });

  it('follows numbered pages with for await', async () => {
    const { transport, calls } = makeTransport([
      ok({ reports: [{ id: 'r-1' }], pagination: pagination(1, true) }),
      ok({ reports: [{ id: 'r-2' }], pagination: pagination(2, false) }),
    ]);
    const reports = await collect(new Reports(transport).list());
    expect(reports.map((r) => r.id)).toEqual(['r-1', 'r-2']);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/reports?page=1`,
      `${BASE}/reports?page=2`,
    ]);
  });

  it('gets the stats', async () => {
    const { transport, calls } = makeTransport([ok({ total_downloads: 3 })]);
    expect(await new Reports(transport).stats()).toEqual({
      total_downloads: 3,
    });
    expect(calls[0]!.url).toBe(`${BASE}/reports/stats`);
  });

  it('returns the download URL unchanged, without fetching the file', async () => {
    const download = {
      download_url: 'https://files.test/reports/r-1.pdf?sig=a%2Bb&exp=1',
      file_name: 'October report.pdf',
      file_size: 1024,
    };
    const { transport, calls } = makeTransport([ok(download)]);
    expect(await new Reports(transport).download('r-1')).toEqual(download);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE}/reports/r-1/download`);
  });
});

describe('Portfolio', () => {
  it('POSTs the holdings', async () => {
    const { transport, calls } = makeTransport([
      ok({ summary: {}, holdings: [] }),
    ]);
    await new Portfolio(transport).analyze({
      holdings: [{ ticker: 'TESTCO', shares: 10 }],
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/portfolio/analyze`);
    expect(calls[0]!.body).toBe(
      '{"holdings":[{"ticker":"TESTCO","shares":10}]}',
    );
  });

  const holding = (ticker: string) => ({ ticker, shares: 1 });

  it.each([
    ['no holdings', []],
    ['51 holdings', Array.from({ length: 51 }, (_, i) => holding(`TEST${i}`))],
    [
      'a ticker repeated in another case',
      [holding('testco'), holding('TESTCO')],
    ],
    ['holdings that are not a list', 'TESTCO'],
  ])('rejects %s without a request', async (_, holdings) => {
    const { transport, calls } = makeTransport([]);
    const err = await new Portfolio(transport)
      .analyze({ holdings } as never)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ToyyibError).code).toBe('INVALID_HOLDINGS');
    expect((err as ToyyibError).status).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('names the repeated ticker', async () => {
    const { transport } = makeTransport([]);
    const err = await new Portfolio(transport)
      .analyze({ holdings: [holding('testco'), holding('TESTCO')] })
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain('TESTCO');
  });
});
