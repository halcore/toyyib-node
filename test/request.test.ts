import { inspect } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APIError,
  ConnectionError,
  NotFoundError,
  TimeoutError,
  ToyyibError,
  ValidationError,
} from '../src/core/errors';
import type { ResolvedOptions } from '../src/core/options';
import { Transport } from '../src/core/request';
import { VERSION } from '../src/version';
import { fakeFetch, type ScriptedResponse } from './helpers/fake-fetch';

const KEY = 'sk_test_abcdefgh1234';
const MASKED = 'sk_test_****1234';

function makeTransport(
  fetch: typeof globalThis.fetch,
  options: Partial<ResolvedOptions> = {},
) {
  return new Transport({
    apiKey: KEY,
    baseURL: 'https://x.test/api/v1',
    timeout: 1_000,
    maxRetries: 0,
    fetch,
    ...options,
  });
}

function ok(data: unknown): ScriptedResponse {
  return { status: 200, body: { success: true, data, message: 'ok' } };
}

/** A fetch that only settles when its signal aborts. */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signals.push(signal);
      signal.addEventListener('abort', () =>
        reject(new DOMException('This operation was aborted', 'AbortError')),
      );
    });
  return { fetch, signals };
}

async function rejectionOf(promise: Promise<unknown>): Promise<ToyyibError> {
  const err = await promise.then(
    () => {
      throw new Error('expected the request to fail');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ToyyibError);
  return err as ToyyibError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Transport requests', () => {
  it('sends the key, Accept and User-Agent headers', async () => {
    const { fetch, calls } = fakeFetch([ok({})]);
    await makeTransport(fetch).request({ method: 'GET', path: 'usage' });
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.headers).toEqual({
      'x-api-key': KEY,
      accept: 'application/json',
      'user-agent': `toyyib-sdk-node/${VERSION}`,
    });
    expect(calls[0]!.body).toBeUndefined();
  });

  it('returns the data from the success envelope', async () => {
    const { fetch } = fakeFetch([ok({ a: 1 })]);
    const data = await makeTransport(fetch).request({
      method: 'GET',
      path: 'usage',
    });
    expect(data).toEqual({ a: 1 });
  });

  it.each([
    ['no success flag', { data: { a: 1 } }],
    ['success false', { success: false, data: { a: 1 } }],
    ['not JSON', '<html>OK</html>'],
    ['empty', undefined],
  ])('throws APIError for a 2xx body with %s', async (_, body) => {
    const { fetch } = fakeFetch([{ status: 200, body }]);
    const err = await rejectionOf(
      makeTransport(fetch).request({ method: 'GET', path: 'usage' }),
    );
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(200);
    expect(err.code).toBe('UNEXPECTED_RESPONSE');
  });

  it('POSTs a JSON body', async () => {
    const { fetch, calls } = fakeFetch([ok({})]);
    const body = { holdings: [{ ticker: 'TESTCO', shares: 10 }] };
    await makeTransport(fetch).request({
      method: 'POST',
      path: 'portfolio/analyze',
      body,
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0]!.body!)).toEqual(body);
  });

  it('turns an error envelope into the matching error', async () => {
    const { fetch } = fakeFetch([
      {
        status: 404,
        body: {
          success: false,
          error: { code: 'SECURITY_NOT_FOUND', message: 'No such security.' },
        },
      },
    ]);
    const err = await rejectionOf(
      makeTransport(fetch).request({ method: 'GET', path: 'stocks/NOPE' }),
    );
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.code).toBe('SECURITY_NOT_FOUND');
  });

  it('turns an HTML error page into APIError', async () => {
    const { fetch } = fakeFetch([
      { status: 502, body: '<html>Bad Gateway</html>' },
    ]);
    const err = await rejectionOf(
      makeTransport(fetch).request({ method: 'GET', path: 'usage' }),
    );
    expect(err).toBeInstanceOf(APIError);
    expect(err.code).toBe('UNEXPECTED_RESPONSE');
    expect(err.status).toBe(502);
  });
});

describe('Transport URLs', () => {
  it.each([
    ['https://x.test/api/v1/', 'stocks/compliant'],
    ['https://x.test/api/v1', 'stocks/compliant'],
    ['https://x.test/api/v1/', '/stocks/compliant'],
    ['https://x.test/api/v1', '/stocks/compliant'],
  ])('joins %s and %s with one slash', async (baseURL, path) => {
    const { fetch, calls } = fakeFetch([ok({})]);
    await makeTransport(fetch, { baseURL }).request({ method: 'GET', path });
    expect(calls[0]!.url).toBe('https://x.test/api/v1/stocks/compliant');
  });

  it('drops undefined query values', async () => {
    const { fetch, calls } = fakeFetch([ok({})]);
    await makeTransport(fetch).request({
      method: 'GET',
      path: 'stocks/compliant',
      query: { region: 'NGX', sector: undefined },
    });
    expect(calls[0]!.url).toBe(
      'https://x.test/api/v1/stocks/compliant?region=NGX',
    );
  });

  it('sends number query values as strings', async () => {
    const { fetch, calls } = fakeFetch([ok({})]);
    await makeTransport(fetch).request({
      method: 'GET',
      path: 'stocks/compliant',
      query: { page_size: 50 },
    });
    expect(calls[0]!.url).toBe(
      'https://x.test/api/v1/stocks/compliant?page_size=50',
    );
  });

  it('keeps an encoded EXCHANGE:ticker symbol and its case', async () => {
    const { fetch, calls } = fakeFetch([ok({})]);
    await makeTransport(fetch).request({
      method: 'GET',
      path: `stocks/${encodeURIComponent('NGX:gtco')}/compliance`,
    });
    expect(calls[0]!.url).toBe(
      'https://x.test/api/v1/stocks/NGX%3Agtco/compliance',
    );
  });
});

describe('Transport timeouts and connection errors', () => {
  it('aborts an attempt when the timeout passes', async () => {
    vi.useFakeTimers();
    const { fetch, signals } = hangingFetch();
    const pending = rejectionOf(
      makeTransport(fetch, { timeout: 1_000 }).request({
        method: 'GET',
        path: 'usage',
      }),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(signals[0]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.status).toBeUndefined();
  });

  it('clears its timer after a reply', async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch([ok({})]);
    await makeTransport(fetch).request({ method: 'GET', path: 'usage' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns a fetch TypeError into ConnectionError', async () => {
    const cause = new TypeError('fetch failed');
    const { fetch } = fakeFetch([cause]);
    const err = await rejectionOf(
      makeTransport(fetch).request({ method: 'GET', path: 'usage' }),
    );
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect(err.code).toBe('CONNECTION_ERROR');
    expect(err.cause).toBe(cause);
  });
});

describe('Transport never shows the key', () => {
  it('hides it from inspect and JSON.stringify', () => {
    const transport = makeTransport(fakeFetch([]).fetch);
    expect(inspect(transport, { showHidden: true, depth: 10 })).not.toContain(
      KEY,
    );
    expect(JSON.stringify(transport)).not.toContain(KEY);
  });

  it('masks a key the server echoes back', async () => {
    const { fetch } = fakeFetch([
      {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid key ${KEY}.`,
            details: { api_key: KEY, seen: [`header ${KEY}`] },
          },
        },
      },
    ]);
    const err = await rejectionOf(
      makeTransport(fetch).request({ method: 'GET', path: 'usage' }),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe(`Invalid key ${MASKED}.`);
    expect(err.details).toEqual({
      api_key: MASKED,
      seen: [`header ${MASKED}`],
    });
  });

  const failures: Array<[string, () => Promise<unknown>]> = [
    [
      'an echoed key',
      () =>
        makeTransport(
          fakeFetch([
            {
              status: 401,
              body: {
                success: false,
                error: {
                  code: 'AUTHENTICATION_FAILED',
                  message: `Bad key ${KEY}`,
                  details: [KEY],
                },
              },
            },
          ]).fetch,
        ).request({ method: 'GET', path: 'usage' }),
    ],
    [
      'an HTML page echoing the key',
      () =>
        makeTransport(
          fakeFetch([{ status: 500, body: `<p>${KEY}</p>` }]).fetch,
        ).request({ method: 'GET', path: 'usage' }),
    ],
    [
      'a fetch error naming the key',
      () =>
        makeTransport(
          fakeFetch([new TypeError(`Invalid header X-API-Key: ${KEY}`)]).fetch,
        ).request({ method: 'GET', path: 'usage' }),
    ],
  ];

  it.each(failures)('keeps it out of the error for %s', async (_, run) => {
    const err = await rejectionOf(run());
    for (const text of [
      err.message,
      err.stack ?? '',
      String(err),
      inspect(err, { depth: 10 }),
    ]) {
      expect(text).not.toContain(KEY);
    }
  });
});
