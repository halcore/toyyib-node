export type ScriptedResponse =
  { status: number; body?: unknown; headers?: Record<string, string> } | Error;

export interface FakeCall {
  url: string;
  method: string;
  /** Header names are lower-cased, as `Headers` stores them. */
  headers: Record<string, string>;
  body: string | undefined;
}

/**
 * A fetch that replays `responses` in order and records each call. A string
 * body is sent as-is; any other body is sent as JSON. An `Error` is thrown.
 */
export function fakeFetch(responses: ScriptedResponse[]): {
  fetch: typeof fetch;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const queue = [...responses];

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body == null ? undefined : String(init.body),
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('fakeFetch: no responses left');
    if (next instanceof Error) throw next;
    const text =
      next.body === undefined
        ? ''
        : typeof next.body === 'string'
          ? next.body
          : JSON.stringify(next.body);
    return new Response(text, { status: next.status, headers: next.headers });
  };

  return { fetch, calls };
}
