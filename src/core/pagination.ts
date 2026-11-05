export interface CursorReply<T> {
  items: T[];
  next_token: string | null;
}

/**
 * One page of a cursor-paged list. `for await` over it yields every item from
 * this page on, fetching later pages as it goes.
 */
export class CursorPage<T> implements AsyncIterable<T> {
  readonly data: T[];
  readonly nextToken: string | null;
  readonly #fetchPage: (nextToken?: string) => Promise<CursorReply<T>>;
  /** Tokens already used to reach this page. */
  readonly #usedTokens: ReadonlySet<string>;

  constructor(
    fetchPage: (nextToken?: string) => Promise<CursorReply<T>>,
    first: CursorReply<T>,
    usedTokens: ReadonlySet<string> = new Set(),
  ) {
    this.#fetchPage = fetchPage;
    this.data = first.items;
    this.nextToken = first.next_token;
    this.#usedTokens = usedTokens;
  }

  /**
   * False on the last page. An empty page, or a token that was already used,
   * also ends the list, so a misbehaving server can't cause an endless loop.
   */
  get hasMore(): boolean {
    return (
      this.nextToken !== null &&
      this.data.length > 0 &&
      !this.#usedTokens.has(this.nextToken)
    );
  }

  async nextPage(): Promise<CursorPage<T> | null> {
    if (!this.hasMore) return null;
    const token = this.nextToken as string;
    const reply = await this.#fetchPage(token);
    return new CursorPage(
      this.#fetchPage,
      reply,
      new Set([...this.#usedTokens, token]),
    );
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* this.data;
    let page = await this.nextPage();
    while (page) {
      yield* page.data;
      page = await page.nextPage();
    }
  }
}

export interface PageNumberInfo {
  current_page: number;
  has_next: boolean;
}

export interface NumberedReply<T, P extends PageNumberInfo = PageNumberInfo> {
  reports: T[];
  /** Missing when the API isn't paginating: the reply is then the whole list. */
  pagination?: P;
}

/**
 * One page of a list paged by number. `for await` over it yields every item
 * from this page on, fetching later pages as it goes.
 */
export class NumberedPage<
  T,
  P extends PageNumberInfo = PageNumberInfo,
> implements AsyncIterable<T> {
  readonly data: T[];
  readonly page: number;
  readonly pagination: P | undefined;
  readonly #fetchPage: (page: number) => Promise<NumberedReply<T, P>>;

  constructor(
    fetchPage: (page: number) => Promise<NumberedReply<T, P>>,
    first: NumberedReply<T, P>,
    page: number,
  ) {
    this.#fetchPage = fetchPage;
    this.data = first.reports;
    this.pagination = first.pagination;
    this.page = page;
  }

  /** False on the last page, and on an empty page, whatever `has_next` says. */
  get hasMore(): boolean {
    return this.pagination?.has_next === true && this.data.length > 0;
  }

  async nextPage(): Promise<NumberedPage<T, P> | null> {
    if (!this.hasMore) return null;
    const next = this.page + 1;
    const reply = await this.#fetchPage(next);
    // A server that ignores the page number would repeat itself forever.
    if (reply.pagination && reply.pagination.current_page !== next) {
      return null;
    }
    return new NumberedPage(this.#fetchPage, reply, next);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* this.data;
    let page = await this.nextPage();
    while (page) {
      yield* page.data;
      page = await page.nextPage();
    }
  }
}

/** A promise of a page that can also be looped with `for await` directly. */
export type PagePromise<P, T> = Promise<P> & AsyncIterable<T>;

export function pagePromise<P extends AsyncIterable<T>, T>(
  load: () => Promise<P>,
): PagePromise<P, T> {
  const promise = load();
  return Object.assign(promise, {
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      yield* await promise;
    },
  });
}

/**
 * A cursor-paged list: fetches the first page now and later pages on demand.
 * `fetchPage` gets the `next_token` to send, or `undefined` for the first page.
 */
export function cursorList<T>(
  fetchPage: (nextToken?: string) => Promise<CursorReply<T>>,
): PagePromise<CursorPage<T>, T> {
  return pagePromise<CursorPage<T>, T>(
    async () => new CursorPage(fetchPage, await fetchPage()),
  );
}
