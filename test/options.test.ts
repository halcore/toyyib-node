import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToyyibError } from '../src/core/errors';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  modeFromKey,
  resolveOptions,
} from '../src/core/options';

const MISSING_KEY_MESSAGE =
  'No Toyyib API key found. Pass `apiKey` or set TOYYIB_API_KEY. To get a sandbox key, contact info@halcore.app.';

function thrownBy(fn: () => unknown): ToyyibError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ToyyibError);
    return err as ToyyibError;
  }
  throw new Error('expected a ToyyibError');
}

beforeEach(() => {
  vi.stubEnv('TOYYIB_API_KEY', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('resolveOptions', () => {
  it('prefers an explicit apiKey over TOYYIB_API_KEY', () => {
    vi.stubEnv('TOYYIB_API_KEY', 'sk_test_fromenv');
    expect(resolveOptions({ apiKey: 'sk_test_explicit' }).apiKey).toBe(
      'sk_test_explicit',
    );
  });

  it('reads TOYYIB_API_KEY when no apiKey is passed', () => {
    vi.stubEnv('TOYYIB_API_KEY', 'sk_test_fromenv');
    expect(resolveOptions().apiKey).toBe('sk_test_fromenv');
  });

  it('throws MISSING_API_KEY when there is no key', () => {
    const err = thrownBy(() => resolveOptions());
    expect(err.code).toBe('MISSING_API_KEY');
    expect(err.message).toBe(MISSING_KEY_MESSAGE);
    expect(err.status).toBeUndefined();
    expect(err.name).toBe('ToyyibError');
    expect(err).toBeInstanceOf(Error);
  });

  it('treats an empty TOYYIB_API_KEY as missing', () => {
    vi.stubEnv('TOYYIB_API_KEY', '');
    expect(thrownBy(() => resolveOptions()).code).toBe('MISSING_API_KEY');
  });

  it('refuses to run in a browser', () => {
    vi.stubGlobal('window', { document: {} });
    const err = thrownBy(() => resolveOptions({ apiKey: 'sk_test_x' }));
    expect(err.code).toBe('BROWSER_NOT_ALLOWED');
    expect(err.message).toContain('dangerouslyAllowBrowser');
  });

  it('runs in a browser with dangerouslyAllowBrowser: true', () => {
    vi.stubGlobal('window', { document: {} });
    expect(
      resolveOptions({ apiKey: 'sk_test_x', dangerouslyAllowBrowser: true })
        .apiKey,
    ).toBe('sk_test_x');
  });

  it.each(['not a url', 'api.toyyib.app/api/v1', 'localhost:8000/api/v1'])(
    'throws INVALID_BASE_URL for %j',
    (baseURL) => {
      const err = thrownBy(() =>
        resolveOptions({ apiKey: 'sk_test_x', baseURL }),
      );
      expect(err.code).toBe('INVALID_BASE_URL');
    },
  );

  it('accepts an http baseURL for a local server', () => {
    const baseURL = 'http://localhost:8000/api/v1';
    expect(resolveOptions({ apiKey: 'sk_test_x', baseURL }).baseURL).toBe(
      baseURL,
    );
  });

  // NaN would make the retry loop never end; Infinity or more than 2^31 - 1 ms
  // makes setTimeout fire at once, so every request would time out.
  it.each([NaN, -1, 1.5, Infinity])(
    'throws INVALID_OPTION for maxRetries %s',
    (maxRetries) => {
      const err = thrownBy(() =>
        resolveOptions({ apiKey: 'sk_test_x', maxRetries }),
      );
      expect(err.code).toBe('INVALID_OPTION');
      expect(err.message).toContain('maxRetries');
    },
  );

  it.each([NaN, 0, -5, Infinity, 2 ** 31])(
    'throws INVALID_OPTION for timeout %s',
    (timeout) => {
      const err = thrownBy(() =>
        resolveOptions({ apiKey: 'sk_test_x', timeout }),
      );
      expect(err.code).toBe('INVALID_OPTION');
      expect(err.message).toContain('timeout');
    },
  );

  it('accepts the smallest and largest valid values', () => {
    const resolved = resolveOptions({
      apiKey: 'sk_test_x',
      maxRetries: 0,
      timeout: 2 ** 31 - 1,
    });
    expect(resolved.maxRetries).toBe(0);
    expect(resolved.timeout).toBe(2 ** 31 - 1);
    expect(resolveOptions({ apiKey: 'sk_test_x', timeout: 1 }).timeout).toBe(1);
  });

  it('uses the defaults', () => {
    const resolved = resolveOptions({ apiKey: 'sk_test_x' });
    expect(resolved.baseURL).toBe(DEFAULT_BASE_URL);
    expect(resolved.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(resolved.maxRetries).toBe(DEFAULT_MAX_RETRIES);
  });

  it('keeps the values passed in', () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const resolved = resolveOptions({
      apiKey: 'sk_test_x',
      baseURL: 'http://localhost:8000/api/v1',
      timeout: 5_000,
      maxRetries: 0,
      fetch,
    });
    expect(resolved).toEqual({
      apiKey: 'sk_test_x',
      baseURL: 'http://localhost:8000/api/v1',
      timeout: 5_000,
      maxRetries: 0,
      fetch,
    });
  });

  // Calling a stored, unbound fetch throws "Illegal invocation" in browsers
  // and Cloudflare Workers, so the default must call the global itself.
  it('calls the global fetch by default', async () => {
    const globalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('{}'),
    );
    vi.stubGlobal('fetch', globalFetch);
    const resolved = resolveOptions({ apiKey: 'sk_test_x' });
    await resolved.fetch('https://x.test/');
    expect(globalFetch).toHaveBeenCalledWith('https://x.test/', undefined);
  });
});

describe('defaults', () => {
  it('match the spec', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.toyyib.app/api/v1');
    expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
    expect(DEFAULT_MAX_RETRIES).toBe(2);
  });
});

describe('modeFromKey', () => {
  it('reads the mode from the key prefix', () => {
    expect(modeFromKey('sk_test_x')).toBe('sandbox');
    expect(modeFromKey('sk_live_x')).toBe('live');
    expect(modeFromKey('abc')).toBe('unknown');
  });
});
