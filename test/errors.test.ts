import { describe, expect, it } from 'vitest';

import {
  APIError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  errorFromResponse,
  maskKey,
  NotFoundError,
  PermissionDeniedError,
  ProductionAccessDisabledError,
  RateLimitError,
  TimeoutError,
  ToyyibError,
  ValidationError,
} from '../src/core/errors';

function envelope(code: string, message: string, details?: unknown) {
  return { success: false, error: { code, message, details } };
}

describe('errorFromResponse', () => {
  it.each([
    [401, 'AUTHENTICATION_FAILED', AuthenticationError],
    [403, 'PERMISSION_DENIED', PermissionDeniedError],
    [404, 'SECURITY_NOT_FOUND', NotFoundError],
    [409, 'AMBIGUOUS_IDENTIFIER', ConflictError],
    [400, 'VALIDATION_ERROR', ValidationError],
    [400, 'TICKERS_NOT_FOUND', ValidationError],
    [422, 'VALIDATION_ERROR', ValidationError],
    [429, 'THROTTLED', RateLimitError],
    [500, 'INTERNAL_ERROR', APIError],
    [503, 'SERVICE_UNAVAILABLE', APIError],
  ])('maps %i %s to %o', (status, code, Class) => {
    const details = { ticker: 'TESTCO' };
    const err = errorFromResponse(
      status,
      envelope(code, 'Server says no.', details),
    );
    expect(err).toBeInstanceOf(Class);
    expect(err).toBeInstanceOf(ToyyibError);
    expect(err.name).toBe(Class.name);
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe('Server says no.');
    expect(err.details).toEqual(details);
  });

  it('maps 401 PRODUCTION_ACCESS_DISABLED to ProductionAccessDisabledError', () => {
    const err = errorFromResponse(
      401,
      envelope('PRODUCTION_ACCESS_DISABLED', 'Production access disabled.'),
    );
    expect(err).toBeInstanceOf(ProductionAccessDisabledError);
    // Still an AuthenticationError, so one catch handles every 401.
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.code).toBe('PRODUCTION_ACCESS_DISABLED');
    expect(err.message).toContain('sk_test_');
    expect(err.message).toContain('info@halcore.app');
  });

  it('gives RateLimitError a null retryAfter when the server sends none', () => {
    const err = errorFromResponse(429, envelope('THROTTLED', 'Slow down.'));
    expect((err as RateLimitError).retryAfter).toBeNull();
  });

  it('gives RateLimitError the retryAfter it is passed', () => {
    const err = errorFromResponse(429, envelope('THROTTLED', 'Slow down.'), 30);
    expect((err as RateLimitError).retryAfter).toBe(30);
  });

  it('keeps a 429 that is not the error envelope a RateLimitError', () => {
    const html = '<html>Too Many Requests</html>';
    const err = errorFromResponse(429, html, 5);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.details).toBe(html);
    expect((err as RateLimitError).retryAfter).toBe(5);
  });

  it('keeps an unknown code as a plain ToyyibError', () => {
    const err = errorFromResponse(418, envelope('TEAPOT', "I'm a teapot."));
    expect(err.constructor).toBe(ToyyibError);
    expect(err.status).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe("I'm a teapot.");
  });

  it('maps a body that is not the error envelope to UNEXPECTED_RESPONSE', () => {
    const html = '<html><body>502 Bad Gateway</body></html>';
    const err = errorFromResponse(502, html);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('UNEXPECTED_RESPONSE');
    expect(err.message).toBe(
      'Unexpected response from the Toyyib API (HTTP 502).',
    );
    expect(err.details).toBe(html);
  });

  it.each([
    ['no error object', { success: false }],
    ['no code', { success: false, error: { message: 'x' } }],
    ['no message', { success: false, error: { code: 'X' } }],
    ['success true', { success: true, error: { code: 'X', message: 'x' } }],
    ['null', null],
  ])('treats a body with %s as unexpected', (_, body) => {
    expect(errorFromResponse(404, body).code).toBe('UNEXPECTED_RESPONSE');
  });
});

describe('error classes', () => {
  it('share the base constructor and set their own name', () => {
    const cause = new TypeError('fetch failed');
    const err = new ConnectionError('Could not reach the API.', {
      code: 'CONNECTION_ERROR',
      cause,
    });
    expect(err.name).toBe('ConnectionError');
    expect(err.cause).toBe(cause);
    expect(err.status).toBeUndefined();
    expect(String(err)).toBe('ConnectionError: Could not reach the API.');
  });

  it('make TimeoutError a ConnectionError', () => {
    const err = new TimeoutError('Timed out.', { code: 'TIMEOUT' });
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.name).toBe('TimeoutError');
  });
});

describe('maskKey', () => {
  it('keeps the prefix and the last four characters', () => {
    expect(maskKey('sk_test_abcdefgh1234')).toBe('sk_test_****1234');
  });

  it('hides a short key completely', () => {
    expect(maskKey('sk_test_abc')).toBe('****');
  });
});
