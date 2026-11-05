import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APIError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ToyyibError,
  ValidationError,
} from '../src/core/errors';
import type { ResolvedOptions } from '../src/core/options';
import { Transport } from '../src/core/request';
import {
  BASE_DELAY_MS,
  isRetryable,
  MAX_DELAY_MS,
  MAX_RETRY_AFTER_SECONDS,
  parseRetryAfter,
  retryDelayMs,
} from '../src/core/retry';
import { fakeFetch, type ScriptedResponse } from './helpers/fake-fetch';

afterEach(() => {
  vi.useRealTimers();
});

describe('constants', () => {
  it('match the spec', () => {
    expect(MAX_RETRY_AFTER_SECONDS).toBe(60);
    expect(BASE_DELAY_MS).toBe(500);
    expect(MAX_DELAY_MS).toBe(8_000);
  });
});

describe('parseRetryAfter', () => {
  const now = Date.UTC(2026, 10, 5, 12, 0, 0);

  it('reads delta-seconds', () => {
    expect(parseRetryAfter('60')).toBe(60);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter(' 50000 ')).toBe(50_000);
  });

  it('reads an HTTP date as seconds from now', () => {
    const in30s = new Date(now + 30_000).toUTCString();
    expect(parseRetryAfter(in30s, now)).toBe(30);
  });

  it('rounds a part second up', () => {
    const in1500ms = new Date(now + 1_500).toUTCString();
    expect(parseRetryAfter(in1500ms, now + 500)).toBe(1);
  });

  it('gives 0 for an HTTP date in the past', () => {
    expect(parseRetryAfter(new Date(now - 5_000).toUTCString(), now)).toBe(0);
  });

  it.each([null, '', 'soon', '1.5', '-5', '60s'])(
    'gives null for %j',
    (value) => {
      expect(parseRetryAfter(value, now)).toBeNull();
    },
  );
});

describe('retryDelayMs', () => {
  it('doubles from 500 ms up to 8 s', () => {
    const top = () => 1;
    expect(retryDelayMs(1, null, top)).toBe(500);
    expect(retryDelayMs(2, null, top)).toBe(1_000);
    expect(retryDelayMs(5, null, top)).toBe(8_000);
    expect(retryDelayMs(10, null, top)).toBe(8_000);
  });

  it('jitters down to three quarters of the backoff', () => {
    expect(retryDelayMs(1, null, () => 0)).toBe(375);
  });

  it('waits for Retry-After when the server sends one', () => {
    expect(retryDelayMs(1, 60)).toBe(60_000);
    expect(retryDelayMs(3, 0)).toBe(0);
  });
});

describe('isRetryable', () => {
  const init = { code: 'X' };

  it.each([
    ['ConnectionError', new ConnectionError('x', init), true],
    ['TimeoutError', new TimeoutError('x', init), true],
    ['APIError 503', new APIError('x', { ...init, status: 503 }), true],
    ['APIError on a 200', new APIError('x', { ...init, status: 200 }), false],
    ['RateLimitError, no Retry-After', new RateLimitError('x', init), true],
    [
      'RateLimitError, 60 s',
      new RateLimitError('x', { ...init, retryAfter: 60 }),
      true,
    ],
    [
      'RateLimitError, 61 s',
      new RateLimitError('x', { ...init, retryAfter: 61 }),
      false,
    ],
    ['ValidationError', new ValidationError('x', init), false],
    ['NotFoundError', new NotFoundError('x', init), false],
    ['ToyyibError', new ToyyibError('x', init), false],
  ])('%s → %s', (_, error, expected) => {
    expect(isRetryable(error)).toBe(expected);
  });
});

describe('Transport retries', () => {
  function makeTransport(
    fetch: typeof globalThis.fetch,
    options: Partial<ResolvedOptions> = {},
  ) {
    return new Transport({
      apiKey: 'sk_test_abcdefgh1234',
      baseURL: 'https://x.test/api/v1',
      timeout: 1_000,
      maxRetries: 2,
      fetch,
      ...options,
    });
  }

  const ok: ScriptedResponse = {
    status: 200,
    body: { success: true, data: { a: 1 }, message: 'ok' },
  };

  function failure(
    status: number,
    code: string,
    headers?: Record<string, string>,
  ): ScriptedResponse {
    return {
      status,
      headers,
      body: { success: false, error: { code, message: `${code}.` } },
    };
  }

  /** Settles to the value or the error, so a rejection is never unhandled. */
  function settle(promise: Promise<unknown>) {
    return promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
  }

  const usage = { method: 'GET', path: 'usage' } as const;

  it('retries a 503 and resolves', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([failure(503, 'UNAVAILABLE'), ok]);
    const result = settle(makeTransport(fetch).request(usage));
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(await result).toEqual({ value: { a: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('retries a connection error and resolves', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([new TypeError('fetch failed'), ok]);
    const result = settle(makeTransport(fetch).request(usage));
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS);
    expect(await result).toEqual({ value: { a: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('gives up after 1 + maxRetries attempts', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([
      failure(500, 'INTERNAL_ERROR'),
      failure(500, 'INTERNAL_ERROR'),
      failure(500, 'INTERNAL_ERROR'),
      ok,
    ]);
    const result = settle(makeTransport(fetch).request(usage));
    await vi.advanceTimersByTimeAsync(500 + 1_000);
    const { error } = (await result) as { error: unknown };
    expect(error).toBeInstanceOf(APIError);
    expect(calls).toHaveLength(3);
  });

  it('waits for Retry-After on a short rate limit', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([
      failure(429, 'THROTTLED', { 'Retry-After': '60' }),
      ok,
    ]);
    const result = settle(makeTransport(fetch).request(usage));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ value: { a: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('throws a daily rate limit at once', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([
      failure(429, 'THROTTLED', { 'Retry-After': '50000' }),
      ok,
    ]);
    const { error } = (await settle(makeTransport(fetch).request(usage))) as {
      error: RateLimitError;
    };
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(50_000);
    expect(calls).toHaveLength(1);
  });

  it('retries a 429 from a proxy that sends HTML', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([
      {
        status: 429,
        body: '<html>Too Many Requests</html>',
        headers: { 'Retry-After': '1' },
      },
      ok,
    ]);
    const result = settle(makeTransport(fetch).request(usage));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toEqual({ value: { a: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('never retries a 400', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([failure(400, 'VALIDATION_ERROR'), ok]);
    const { error } = (await settle(makeTransport(fetch).request(usage))) as {
      error: unknown;
    };
    expect(error).toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry with maxRetries: 0', async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([failure(503, 'UNAVAILABLE'), ok]);
    const { error } = (await settle(
      makeTransport(fetch, { maxRetries: 0 }).request(usage),
    )) as { error: unknown };
    expect(error).toBeInstanceOf(APIError);
    expect(calls).toHaveLength(1);
  });
});
