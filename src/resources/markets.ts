import type { Transport } from '../core/request';
import type { Exchange, Region } from '../types';

/** The markets the API covers, at `toyyib.markets`. */
export class Markets {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** The markets usable in the `region` filter, such as NGX and NASD. */
  async regions(): Promise<Region[]> {
    const { regions } = await this.#transport.request<{ regions: Region[] }>({
      method: 'GET',
      path: 'regions',
    });
    return regions;
  }

  /** The same markets as `regions()`, from the API's older `exchanges` endpoint. */
  async exchanges(): Promise<Exchange[]> {
    const { items } = await this.#transport.request<{ items: Exchange[] }>({
      method: 'GET',
      path: 'exchanges',
    });
    return items;
  }
}
