import {
  type CursorPage,
  cursorList,
  type CursorReply,
  type PagePromise,
} from '../core/pagination';
import type { Transport } from '../core/request';
import type {
  ComplianceStatus,
  SingleStockCompliance,
  StockCompliance,
  StockReport,
} from '../types';
import { Filings, type RegionParams } from './filings';

export type CompliantStockListParams = RegionParams & {
  /** Sector name, case-insensitive. */
  sector?: string;
  /** Items per page: 50 by default, at most 200. */
  page_size?: number;
};

export type StockListParams = CompliantStockListParams & {
  status?: ComplianceStatus;
};

/**
 * Stocks and their Shariah compliance, at `toyyib.stocks`. A symbol is a bare
 * ticker, `EXCHANGE:TICKER` or an id.
 */
export class Stocks {
  readonly filings: Filings;
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
    this.filings = new Filings(transport);
  }

  /**
   * Every screened stock with its verdict. Await it for the first page, or
   * loop with `for await` to go through every page.
   */
  listCompliance(
    params: StockListParams = {},
  ): PagePromise<CursorPage<StockCompliance>, StockCompliance> {
    return this.#list('stocks/compliance', params);
  }

  /** Compliant stocks only, paged like `listCompliance`. */
  listCompliant(
    params: CompliantStockListParams = {},
  ): PagePromise<CursorPage<StockCompliance>, StockCompliance> {
    return this.#list('stocks/compliant', params);
  }

  /**
   * One stock's verdict. A bare ticker listed on more than one market throws
   * `ConflictError`; pass `region` or use `EXCHANGE:TICKER`.
   */
  compliance(
    symbol: string,
    params: RegionParams = {},
  ): Promise<SingleStockCompliance> {
    return this.#transport.request({
      method: 'GET',
      path: `stocks/${encodeURIComponent(symbol)}/compliance`,
      query: params,
    });
  }

  /** One stock's full report, with its screens and ratios. Needs a plan with reports access. */
  report(symbol: string, params: RegionParams = {}): Promise<StockReport> {
    return this.#transport.request({
      method: 'GET',
      path: `stocks/${encodeURIComponent(symbol)}/report`,
      query: params,
    });
  }

  #list(
    path: string,
    params: StockListParams,
  ): PagePromise<CursorPage<StockCompliance>, StockCompliance> {
    return cursorList((nextToken) =>
      this.#transport.request<CursorReply<StockCompliance>>({
        method: 'GET',
        path,
        query: { ...params, next_token: nextToken },
      }),
    );
  }
}
