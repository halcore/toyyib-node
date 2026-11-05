import { describe, expect, it, vi } from 'vitest';

import { CursorPage, NumberedPage, pagePromise } from '../src/core/pagination';

interface CursorReply {
  items: number[];
  next_token: string | null;
}

/** Serves cursor pages by token; the first page is passed to the constructor. */
function cursorServer(pages: Record<string, CursorReply>) {
  return vi.fn(async (token?: string) => {
    const page = pages[token ?? ''];
    if (!page) throw new Error(`no page for token ${token}`);
    return page;
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('CursorPage', () => {
  const threePages = {
    a: { items: [3], next_token: 'b' },
    b: { items: [4, 5], next_token: null },
  };
  const first = { items: [1, 2], next_token: 'a' };

  it('exposes the first page', () => {
    const page = new CursorPage(cursorServer(threePages), first);
    expect(page.data).toEqual([1, 2]);
    expect(page.nextToken).toBe('a');
    expect(page.hasMore).toBe(true);
  });

  it('yields every item across pages, in order', async () => {
    const fetchPage = cursorServer(threePages);
    const items = await collect(new CursorPage(fetchPage, first));
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls).toEqual([['a'], ['b']]);
  });

  it('ends on a null next_token', async () => {
    const fetchPage = cursorServer(threePages);
    const second = await new CursorPage(fetchPage, first).nextPage();
    const last = await second!.nextPage();
    expect(last!.data).toEqual([4, 5]);
    expect(last!.hasMore).toBe(false);
    expect(await last!.nextPage()).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops when a page repeats the token that fetched it', async () => {
    const fetchPage = cursorServer({ a: { items: [3], next_token: 'a' } });
    const items = await collect(new CursorPage(fetchPage, first));
    expect(items).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls).toEqual([['a']]);
  });

  it('stops when the tokens go round in a loop', async () => {
    const fetchPage = cursorServer({
      a: { items: [3], next_token: 'b' },
      b: { items: [4], next_token: 'a' },
    });
    const items = await collect(new CursorPage(fetchPage, first));
    expect(items).toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([['a'], ['b']]);
  });

  it('stops on an empty page that still has a token', async () => {
    const fetchPage = cursorServer({ a: { items: [], next_token: 'b' } });
    const items = await collect(new CursorPage(fetchPage, first));
    expect(items).toEqual([1, 2]);
    expect(fetchPage.mock.calls).toEqual([['a']]);
  });

  it('has no more after an empty first page', () => {
    const page = new CursorPage(cursorServer({}), {
      items: [],
      next_token: 'a',
    });
    expect(page.hasMore).toBe(false);
  });

  it('passes on an error from fetching a later page', async () => {
    const failure = new Error('boom');
    const fetchPage = vi.fn(async () => {
      throw failure;
    });
    await expect(collect(new CursorPage(fetchPage, first))).rejects.toBe(
      failure,
    );
  });
});

describe('NumberedPage', () => {
  /** Serves `pages` pages of two items each, numbered from 1. */
  function numberedServer(pages: number) {
    return vi.fn(async (page: number) => ({
      reports: [page * 10 + 1, page * 10 + 2],
      pagination: { current_page: page, has_next: page < pages },
    }));
  }

  it('follows has_next through the page numbers', async () => {
    const fetchPage = numberedServer(3);
    const page = new NumberedPage(fetchPage, await fetchPage(1), 1);
    fetchPage.mockClear();
    expect(page.page).toBe(1);
    expect(page.hasMore).toBe(true);
    expect(page.pagination).toEqual({ current_page: 1, has_next: true });
    expect(await collect(page)).toEqual([11, 12, 21, 22, 31, 32]);
    expect(fetchPage.mock.calls).toEqual([[2], [3]]);
  });

  it('ends when has_next is false', async () => {
    const fetchPage = numberedServer(2);
    const second = await new NumberedPage(
      fetchPage,
      await fetchPage(1),
      1,
    ).nextPage();
    expect(second!.page).toBe(2);
    expect(second!.hasMore).toBe(false);
    expect(await second!.nextPage()).toBeNull();
  });

  it('treats a reply without pagination as one last page', async () => {
    const fetchPage = vi.fn(async () => ({ reports: [7] }));
    const page = new NumberedPage(fetchPage, { reports: [1, 2] }, 1);
    expect(page.hasMore).toBe(false);
    expect(page.pagination).toBeUndefined();
    expect(await collect(page)).toEqual([1, 2]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('stops on an empty page that says it has more', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      reports: [],
      pagination: { current_page: page, has_next: true },
    }));
    const page = new NumberedPage(
      fetchPage,
      { reports: [1], pagination: { current_page: 1, has_next: true } },
      1,
    );
    expect(await collect(page)).toEqual([1]);
    expect(fetchPage.mock.calls).toEqual([[2]]);
  });

  it('stops when the server ignores the page number', async () => {
    const pageOne = {
      reports: [1, 2],
      pagination: { current_page: 1, has_next: true },
    };
    const fetchPage = vi.fn(async () => pageOne);
    const page = new NumberedPage(fetchPage, pageOne, 1);
    expect(await collect(page)).toEqual([1, 2]);
    expect(fetchPage.mock.calls).toEqual([[2]]);
  });
});

describe('pagePromise', () => {
  const load = () =>
    Promise.resolve(
      new CursorPage(cursorServer({ a: { items: [3], next_token: null } }), {
        items: [1, 2],
        next_token: 'a',
      }),
    );

  it('resolves to the first page with await', async () => {
    const page = await pagePromise<CursorPage<number>, number>(load);
    expect(page.data).toEqual([1, 2]);
  });

  it('yields every item with for await, without an await first', async () => {
    expect(
      await collect(pagePromise<CursorPage<number>, number>(load)),
    ).toEqual([1, 2, 3]);
  });

  it('rejects both ways when loading fails', async () => {
    const failure = new Error('boom');
    const failing = () => Promise.reject<CursorPage<number>>(failure);
    await expect(pagePromise<CursorPage<number>, number>(failing)).rejects.toBe(
      failure,
    );
    await expect(
      collect(pagePromise<CursorPage<number>, number>(failing)),
    ).rejects.toBe(failure);
  });
});
