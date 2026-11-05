import {
  type CursorPage,
  cursorList,
  type CursorReply,
  type PagePromise,
} from '../core/pagination';
import type { Transport } from '../core/request';
import type { ComplianceStatus, ETFCompliance } from '../types';
import type { RegionParams } from './filings';

export type ETFListParams = RegionParams & {
  status?: ComplianceStatus;
  /** Items per page: 50 by default, at most 200. */
  page_size?: number;
};

/** ETFs and their Shariah compliance, at `toyyib.etfs`. */
export class Etfs {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * Every ETF with its verdict, derived from its holdings by fund weight. Await
   * it for the first page, or loop with `for await` to go through every page.
   */
  listCompliance(
    params: ETFListParams = {},
  ): PagePromise<CursorPage<ETFCompliance>, ETFCompliance> {
    return cursorList((nextToken) =>
      this.#transport.request<CursorReply<ETFCompliance>>({
        method: 'GET',
        path: 'etfs/compliance',
        query: { ...params, next_token: nextToken },
      }),
    );
  }
}
