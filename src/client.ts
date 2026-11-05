import {
  type ClientOptions,
  type Mode,
  modeFromKey,
  resolveOptions,
} from './core/options';
import { Transport } from './core/request';
import { Etfs } from './resources/etfs';
import { Markets } from './resources/markets';
import { Portfolio } from './resources/portfolio';
import { Reports } from './resources/reports';
import { Stocks } from './resources/stocks';
import type { Usage } from './types';

/**
 * A client for the Toyyib Shariah screening API.
 *
 *     const toyyib = new Toyyib(); // reads TOYYIB_API_KEY
 *     const stock = await toyyib.stocks.compliance('NGX:GTCO');
 *
 * The key is kept private: logging or serialising the client never shows it.
 */
export class Toyyib {
  /** `'sandbox'` for an `sk_test_` key, `'live'` for an `sk_live_` key. */
  readonly mode: Mode;
  readonly stocks: Stocks;
  readonly etfs: Etfs;
  readonly markets: Markets;
  readonly reports: Reports;
  readonly portfolio: Portfolio;
  readonly #transport: Transport;
  readonly #baseURL: string;

  constructor(options?: ClientOptions) {
    const resolved = resolveOptions(options);
    this.mode = modeFromKey(resolved.apiKey);
    this.#baseURL = resolved.baseURL;
    this.#transport = new Transport(resolved);
    this.stocks = new Stocks(this.#transport);
    this.etfs = new Etfs(this.#transport);
    this.markets = new Markets(this.#transport);
    this.reports = new Reports(this.#transport);
    this.portfolio = new Portfolio(this.#transport);
  }

  /** The key's details, its plan, and its daily and per-minute limits. */
  usage(): Promise<Usage> {
    return this.#transport.request({ method: 'GET', path: 'usage' });
  }

  toJSON(): { mode: Mode; baseURL: string } {
    return { mode: this.mode, baseURL: this.#baseURL };
  }
}
