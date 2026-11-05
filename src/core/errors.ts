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
