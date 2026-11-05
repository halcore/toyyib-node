import type { RequestOptions, Transport } from '../core/request';
import type {
  Filing,
  FilingEvidence,
  FilingHistory,
  FilingInputs,
  FiscalPeriod,
} from '../types';

export type RegionParams = {
  /** NGX or NASD. Picks the market when a bare ticker is listed on both. */
  region?: string;
};

export type FilingDetailParams = RegionParams & {
  /** `'ignored'` adds the rows extraction returned but did not count. */
  include?: 'ignored';
};

export type FilingListParams = RegionParams & {
  fiscal_period?: FiscalPeriod;
  fiscal_year?: number;
};

/**
 * The screened filings behind a security's verdict, at `toyyib.stocks.filings`.
 * A symbol is a bare ticker, `EXCHANGE:TICKER` or an id.
 */
export class Filings {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** The filing behind the security's current verdict. */
  latest(symbol: string, params: RegionParams = {}): Promise<Filing> {
    return this.#get(symbol, 'filings/latest', params);
  }

  /** The latest filing's screening inputs, with citations. Needs a plan with reports access. */
  latestInputs(
    symbol: string,
    params: FilingDetailParams = {},
  ): Promise<FilingInputs> {
    return this.#get(symbol, 'filings/latest/inputs', params);
  }

  /** The latest filing's extraction evidence. Needs a plan with reports access. */
  latestEvidence(
    symbol: string,
    params: FilingDetailParams = {},
  ): Promise<FilingEvidence> {
    return this.#get(symbol, 'filings/latest/evidence', params);
  }

  /** The security's filing history, newest first. Needs a plan with reports access. */
  list(symbol: string, params: FilingListParams = {}): Promise<FilingHistory> {
    return this.#get(symbol, 'filings', params);
  }

  /** One filing by its `id` from the history. Needs a plan with reports access. */
  retrieve(
    symbol: string,
    filingId: string,
    params: RegionParams = {},
  ): Promise<Filing> {
    return this.#get(symbol, `filings/${encodeURIComponent(filingId)}`, params);
  }

  /** One filing's screening inputs, with citations. Needs a plan with reports access. */
  inputs(
    symbol: string,
    filingId: string,
    params: FilingDetailParams = {},
  ): Promise<FilingInputs> {
    return this.#get(
      symbol,
      `filings/${encodeURIComponent(filingId)}/inputs`,
      params,
    );
  }

  /** One filing's extraction evidence. Needs a plan with reports access. */
  evidence(
    symbol: string,
    filingId: string,
    params: FilingDetailParams = {},
  ): Promise<FilingEvidence> {
    return this.#get(
      symbol,
      `filings/${encodeURIComponent(filingId)}/evidence`,
      params,
    );
  }

  #get<T>(
    symbol: string,
    rest: string,
    query: RequestOptions['query'],
  ): Promise<T> {
    return this.#transport.request<T>({
      method: 'GET',
      path: `stocks/${encodeURIComponent(symbol)}/${rest}`,
      query,
    });
  }
}
