import { ToyyibError } from './errors';
import { isBrowserLike, readEnv } from './runtime';

export const DEFAULT_BASE_URL = 'https://api.toyyib.app/api/v1';
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
/** setTimeout fires at once for longer delays, so this is the longest timeout. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export interface ClientOptions {
  /** Defaults to the `TOYYIB_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.toyyib.app/api/v1`. */
  baseURL?: string;
  /** Milliseconds per attempt. Defaults to 60 000. */
  timeout?: number;
  /** Retries after the first attempt. Defaults to 2. */
  maxRetries?: number;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Allows use in a browser, which exposes the key to anyone who opens the page. */
  dangerouslyAllowBrowser?: boolean;
}

export interface ResolvedOptions {
  apiKey: string;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
}

export type Mode = 'sandbox' | 'live' | 'unknown';

export function resolveOptions(options: ClientOptions = {}): ResolvedOptions {
  if (isBrowserLike() && !options.dangerouslyAllowBrowser) {
    throw new ToyyibError(
      'Running @toyyib/sdk in a browser exposes your secret API key to anyone who opens the page. ' +
        'Call the API from your server instead, or pass `dangerouslyAllowBrowser: true` if you accept the risk.',
      { code: 'BROWSER_NOT_ALLOWED' },
    );
  }

  const apiKey = options.apiKey ?? readEnv('TOYYIB_API_KEY');
  if (!apiKey) {
    throw new ToyyibError(
      'No Toyyib API key found. Pass `apiKey` or set TOYYIB_API_KEY. To get a sandbox key, contact info@halcore.app.',
      { code: 'MISSING_API_KEY' },
    );
  }

  const baseURL = options.baseURL ?? DEFAULT_BASE_URL;
  if (!isHttpURL(baseURL)) {
    throw new ToyyibError(
      '`baseURL` must be an absolute http or https URL, such as https://api.toyyib.app/api/v1.',
      { code: 'INVALID_BASE_URL' },
    );
  }

  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MS) {
    throw invalidOption(
      `\`timeout\` must be a number of milliseconds from 1 to ${MAX_TIMEOUT_MS}.`,
    );
  }

  // NaN here would make the retry loop never end.
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw invalidOption('`maxRetries` must be a whole number, 0 or more.');
  }

  return {
    apiKey,
    baseURL,
    timeout,
    maxRetries,
    // Calls the global at request time: a stored, unbound fetch throws
    // "Illegal invocation" in browsers and Cloudflare Workers.
    fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
  };
}

function invalidOption(message: string): ToyyibError {
  return new ToyyibError(message, { code: 'INVALID_OPTION' });
}

// `new URL('localhost:8000')` parses, with `localhost:` as the scheme, so the
// scheme is checked too.
function isHttpURL(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** `sk_test_` keys are sandbox and `sk_live_` keys are live. The server rejects anything else. */
export function modeFromKey(key: string): Mode {
  if (key.startsWith('sk_test_')) return 'sandbox';
  if (key.startsWith('sk_live_')) return 'live';
  return 'unknown';
}
