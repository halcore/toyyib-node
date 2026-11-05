import {
  NumberedPage,
  type NumberedReply,
  type PagePromise,
  pagePromise,
} from '../core/pagination';
import type { Transport } from '../core/request';
import type {
  Report,
  ReportDownload,
  ReportPagination,
  ReportStats,
} from '../types';

export type ReportListParams = {
  type?: Report['type'];
  /** The page to start from: 1 by default. */
  page?: number;
};

/** Compliance report documents, at `toyyib.reports`. */
export class Reports {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * The compliance reports. Await it for one page, or loop with `for await` to
   * go through every page. Needs a plan with reports access.
   */
  list(
    params: ReportListParams = {},
  ): PagePromise<NumberedPage<Report, ReportPagination>, Report> {
    const fetchPage = (page: number) =>
      this.#transport.request<NumberedReply<Report, ReportPagination>>({
        method: 'GET',
        path: 'reports',
        query: { ...params, page },
      });
    const first = params.page ?? 1;
    return pagePromise<NumberedPage<Report, ReportPagination>, Report>(
      async () => new NumberedPage(fetchPage, await fetchPage(first), first),
    );
  }

  /** Report totals and the upcoming schedule. Needs a plan with reports access. */
  stats(): Promise<ReportStats> {
    return this.#transport.request({ method: 'GET', path: 'reports/stats' });
  }

  /**
   * Where to download a report's PDF; the library doesn't fetch the file. Needs
   * a plan with export access (Enterprise).
   */
  download(reportId: string): Promise<ReportDownload> {
    return this.#transport.request({
      method: 'GET',
      path: `reports/${encodeURIComponent(reportId)}/download`,
    });
  }
}
