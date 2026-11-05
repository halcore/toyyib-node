import { VERSION } from '../version';
import {
  ConnectionError,
  errorFromResponse,
  maskKey,
  RateLimitError,
  TimeoutError,
  ToyyibError,
  unexpectedResponse,
} from './errors';
import type { ResolvedOptions } from './options';
import { isRetryable, parseRetryAfter, retryDelayMs } from './retry';

export interface RequestOptions {
  method: 'GET' | 'POST';
  /** Relative to `baseURL`, with path parameters already encoded. */
  path: string;
  /** `undefined` values are left out. */
  query?: Record<string, string | number | undefined>;
  /** Sent as JSON. */
  body?: unknown;
}

interface Reply {
  status: number;
  body: unknown;
  /** Seconds from the `Retry-After` header, or `null`. */
  retryAfter: number | null;
}

/**
 * The only code that calls `fetch`. It unwraps the API's `{ success, data }`
 * envelope, turns every failure into a `ToyyibError` and retries the ones
 * worth retrying. The key lives in a private field, so logging or serialising
 * a Transport never shows it.
 */
export class Transport {
  readonly #apiKey: string;
  readonly #baseURL: string;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(options: ResolvedOptions) {
    this.#apiKey = options.apiKey;
    this.#baseURL = options.baseURL.replace(/\/+$/, '');
    this.#timeout = options.timeout;
    this.#maxRetries = options.maxRetries;
    this.#fetch = options.fetch;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {
      'X-API-Key': this.#apiKey,
      Accept: 'application/json',
      'User-Agent': `toyyib-sdk-node/${VERSION}`,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const url = this.#url(opts.path, opts.query);
    const init = { method: opts.method, headers, body };
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#attempt<T>(url, init);
      } catch (err) {
        if (!(err instanceof ToyyibError)) throw err;
        if (attempt > this.#maxRetries || !isRetryable(err)) throw err;
        const retryAfter =
          err instanceof RateLimitError ? err.retryAfter : null;
        await sleep(retryDelayMs(attempt, retryAfter));
      }
    }
  }

  /** One try: returns the reply's data or throws its error. */
  async #attempt<T>(url: string, init: RequestInit): Promise<T> {
    const reply = await this.#fetchReply(url, init);
    if (reply.status >= 200 && reply.status < 300) {
      if (isSuccess(reply.body)) return reply.body.data as T;
      throw unexpectedResponse(reply.status, this.#redact(reply.body));
    }
    throw errorFromResponse(
      reply.status,
      this.#redact(reply.body),
      reply.retryAfter,
    );
  }

  #url(path: string, query: RequestOptions['query'] = {}): string {
    const url = new URL(`${this.#baseURL}/${path.replace(/^\/+/, '')}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url.toString();
  }

  /** One fetch, with its own timeout covering the reply's body too. */
  async #fetchReply(url: string, init: RequestInit): Promise<Reply> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeout);

    try {
      const response = await this.#fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return {
        status: response.status,
        body: parseBody(await response.text()),
        retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
      };
    } catch (err) {
      throw this.#noReplyError(err, timedOut);
    } finally {
      clearTimeout(timer);
    }
  }

  #noReplyError(err: unknown, timedOut: boolean): ToyyibError {
    if (timedOut) {
      return new TimeoutError(
        `The Toyyib API did not reply within ${this.#timeout} ms.`,
        { code: 'TIMEOUT', cause: err },
      );
    }
    let reason = err instanceof Error ? err.message : String(err);
    const code = networkCode(err);
    if (code !== undefined && !reason.includes(code)) {
      reason = `${reason} (${code})`;
    }
    return new ConnectionError(
      this.#redact(`Could not reach the Toyyib API: ${reason}`),
      { code: 'CONNECTION_ERROR', cause: this.#redactCause(err) },
    );
  }

  /** Replaces every copy of the key in a parsed body or string with its masked form. */
  #redact<T>(value: T): T {
    return replaceKey(value, this.#apiKey, maskKey(this.#apiKey)) as T;
  }

  /** A fetch error that names the key is swapped for a copy that doesn't. */
  #redactCause(err: unknown): unknown {
    if (!(err instanceof Error) || !err.message.includes(this.#apiKey)) {
      return err;
    }
    const copy = new Error(this.#redact(err.message));
    copy.name = err.name;
    return copy;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBody(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isSuccess(body: unknown): body is { data: unknown } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === true &&
    'data' in body
  );
}

/**
 * Node's fetch fails with "fetch failed" and puts the reason, such as
 * ECONNREFUSED or ENOTFOUND, in a `code` on a cause a level or two down.
 */
function networkCode(err: unknown): string | undefined {
  let current = err;
  for (let depth = 0; depth < 4 && current instanceof Object; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

function replaceKey(value: unknown, key: string, masked: string): unknown {
  if (typeof value === 'string') return value.replaceAll(key, masked);
  if (Array.isArray(value)) {
    return value.map((item) => replaceKey(item, key, masked));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        replaceKey(item, key, masked),
      ]),
    );
  }
  return value;
}
