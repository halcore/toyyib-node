import { afterEach, describe, expect, it, vi } from 'vitest';

import { isBrowserLike, readEnv } from '../src/core/runtime';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('readEnv', () => {
  it('reads process.env', () => {
    vi.stubEnv('TOYYIB_TEST_VAR', 'from-process');
    expect(readEnv('TOYYIB_TEST_VAR')).toBe('from-process');
  });

  it('returns undefined when the variable is not set', () => {
    expect(readEnv('TOYYIB_TEST_UNSET')).toBeUndefined();
  });

  // Restore globals before asserting: Vitest itself needs `process`.
  it('returns undefined when there is no process global', () => {
    vi.stubEnv('TOYYIB_TEST_VAR', 'from-process');
    vi.stubGlobal('process', undefined);
    const value = readEnv('TOYYIB_TEST_VAR');
    vi.unstubAllGlobals();
    expect(value).toBeUndefined();
  });

  it('returns undefined when reading process.env throws', () => {
    const env = new Proxy(
      {},
      {
        get() {
          throw new Error('Requires env access');
        },
      },
    );
    vi.stubGlobal('process', { env });
    const value = readEnv('TOYYIB_TEST_VAR');
    vi.unstubAllGlobals();
    expect(value).toBeUndefined();
  });

  it('falls back to Deno.env.get', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) =>
          name === 'TOYYIB_TEST_DENO' ? 'from-deno' : undefined,
      },
    });
    expect(readEnv('TOYYIB_TEST_DENO')).toBe('from-deno');
  });

  it('returns undefined when Deno refuses env access', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: () => {
          throw new Error('Requires env access');
        },
      },
    });
    expect(readEnv('TOYYIB_TEST_DENO')).toBeUndefined();
  });
});

describe('isBrowserLike', () => {
  it('is false in Node', () => {
    expect(isBrowserLike()).toBe(false);
  });

  it('is true when window.document exists', () => {
    vi.stubGlobal('window', { document: {} });
    expect(isBrowserLike()).toBe(true);
  });

  it('is false for a window with no document, as in old Deno', () => {
    vi.stubGlobal('window', {});
    expect(isBrowserLike()).toBe(false);
  });

  it('is true in React Native', () => {
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    expect(isBrowserLike()).toBe(true);
  });
});
