import {
  APIError,
  ConnectionError,
  RateLimitError,
  type ToyyibError,
} from './errors';

/** A 429 asking for a longer wait, such as the daily limit, is thrown at once. */
export const MAX_RETRY_AFTER_SECONDS = 60;
export const BASE_DELAY_MS = 500;
export const MAX_DELAY_MS = 8_000;

/**
 * Reads a `Retry-After` header as seconds to wait. It may be delta-seconds or
 * an HTTP date; anything else gives `null`, so the caller falls back to backoff.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  // Every HTTP date format starts with the day name. Without this check,
  // Date.parse would read garbage like "1.5" as a date.
  if (!/^[A-Za-z]{3}/.test(text)) return null;
  const date = Date.parse(text);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

export function isRetryable(error: ToyyibError): boolean {
  if (error instanceof RateLimitError) {
    return (
      error.retryAfter === null || error.retryAfter <= MAX_RETRY_AFTER_SECONDS
    );
  }
  if (error instanceof ConnectionError) return true;
  return error instanceof APIError && (error.status ?? 0) >= 500;
}

/** Milliseconds to wait before retry number `attempt` (1-based). */
export function retryDelayMs(
  attempt: number,
  retryAfter: number | null,
  random: () => number = Math.random,
): number {
  if (retryAfter !== null) return retryAfter * 1000;
  const backoff = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return backoff * (0.75 + 0.25 * random());
}
