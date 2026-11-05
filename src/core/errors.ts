export interface ToyyibErrorInit {
  status?: number;
  code: string;
  details?: unknown;
  cause?: unknown;
}

/** Base class for every error the library throws. */
export class ToyyibError extends Error {
  /** HTTP status, or `undefined` when the request never got a reply. */
  readonly status: number | undefined;
  /** Upper-case error code, from the API or set by the library. */
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, init: ToyyibErrorInit) {
    super(
      message,
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.name = 'ToyyibError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
  }
}

/** 401: the key is missing, invalid, expired or deactivated. */
export class AuthenticationError extends ToyyibError {
  override name = 'AuthenticationError';
}

/** 401: a live key whose business hasn't been switched on yet. */
export class ProductionAccessDisabledError extends AuthenticationError {
  override name = 'ProductionAccessDisabledError';
}

/** 403: the plan doesn't include this endpoint. */
export class PermissionDeniedError extends ToyyibError {
  override name = 'PermissionDeniedError';
}

/** 404: for example SECURITY_NOT_FOUND, FILING_NOT_FOUND or REPORT_NOT_FOUND. */
export class NotFoundError extends ToyyibError {
  override name = 'NotFoundError';
}

/** 409: for example AMBIGUOUS_IDENTIFIER, a bare ticker listed on more than one exchange. */
export class ConflictError extends ToyyibError {
  override name = 'ConflictError';
}

/** 400 or 422: the request was rejected, for example VALIDATION_ERROR or TICKERS_NOT_FOUND. */
export class ValidationError extends ToyyibError {
  override name = 'ValidationError';
}

/** 429: a per-minute or daily limit was reached. */
export class RateLimitError extends ToyyibError {
  override name = 'RateLimitError';
  /** Seconds the server asked to wait, or `null` when it didn't say. */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    init: ToyyibErrorInit & { retryAfter?: number | null },
  ) {
    super(message, init);
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** 5xx, or a reply that isn't the expected shape. */
export class APIError extends ToyyibError {
  override name = 'APIError';
}

/** The request never got a reply. */
export class ConnectionError extends ToyyibError {
  override name = 'ConnectionError';
}

/** The request got no reply within the timeout. */
export class TimeoutError extends ConnectionError {
  override name = 'TimeoutError';
}

const PRODUCTION_ACCESS_DISABLED_MESSAGE =
  "This live key's business hasn't been switched on yet. Use an sk_test_ key for the sandbox, " +
  'or contact info@halcore.app to switch on live access.';

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const { success, error } = body as Record<string, unknown>;
  if (success !== false || typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, message } = error as Record<string, unknown>;
  return typeof code === 'string' && typeof message === 'string';
}

/** A reply that isn't the API's envelope, such as a proxy's HTML error page. */
export function unexpectedResponse(status: number, body: unknown): APIError {
  return new APIError(
    `Unexpected response from the Toyyib API (HTTP ${status}).`,
    { status, code: 'UNEXPECTED_RESPONSE', details: body },
  );
}

/** Builds the error for a non-2xx reply from its status and parsed body. */
export function errorFromResponse(status: number, body: unknown): ToyyibError {
  if (!isErrorEnvelope(body)) return unexpectedResponse(status, body);

  const { code, message, details } = body.error;
  const init = { status, code, details };
  if (status === 401) {
    return code === 'PRODUCTION_ACCESS_DISABLED'
      ? new ProductionAccessDisabledError(
          PRODUCTION_ACCESS_DISABLED_MESSAGE,
          init,
        )
      : new AuthenticationError(message, init);
  }
  if (status === 403) return new PermissionDeniedError(message, init);
  if (status === 404) return new NotFoundError(message, init);
  if (status === 409) return new ConflictError(message, init);
  if (status === 400 || status === 422) {
    return new ValidationError(message, init);
  }
  if (status === 429) return new RateLimitError(message, init);
  if (status >= 500) return new APIError(message, init);
  return new ToyyibError(message, init);
}

/** Shows a key as its prefix and last four characters, e.g. `sk_test_****abcd`. */
export function maskKey(key: string): string {
  // A short key would show most of itself, so hide all of it.
  if (key.length < 20) return '****';
  return `${key.slice(0, 8)}****${key.slice(-4)}`;
}
