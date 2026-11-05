import { ValidationError } from '../core/errors';
import type { Transport } from '../core/request';
import type { PortfolioAnalysis, PortfolioHolding } from '../types';

export const MAX_HOLDINGS = 50;

export type PortfolioAnalyzeParams = {
  /** 1 to 50 holdings, each ticker once. */
  holdings: PortfolioHolding[];
};

/** Portfolio screening, at `toyyib.portfolio`. */
export class Portfolio {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * A portfolio's compliance and purification, overall and per holding. Nothing
   * is stored. An empty or oversized list, or a repeated ticker, is rejected
   * before sending, with `ValidationError` code `INVALID_HOLDINGS`.
   */
  async analyze(params: PortfolioAnalyzeParams): Promise<PortfolioAnalysis> {
    checkHoldings(params?.holdings);
    return this.#transport.request({
      method: 'POST',
      path: 'portfolio/analyze',
      body: { holdings: params.holdings },
    });
  }
}

/** Only what saves a pointless request: the API checks the rest. */
function checkHoldings(holdings: unknown): void {
  if (!Array.isArray(holdings)) {
    throw invalid('`holdings` must be a list of { ticker, shares } items.');
  }
  if (holdings.length === 0 || holdings.length > MAX_HOLDINGS) {
    throw invalid(
      `\`holdings\` needs 1 to ${MAX_HOLDINGS} items; it has ${holdings.length}.`,
    );
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { ticker } of holdings as PortfolioHolding[]) {
    const key = String(ticker).toUpperCase();
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  if (repeated.size > 0) {
    throw invalid(
      `Each ticker can appear once in \`holdings\`. Repeated: ${[...repeated].sort().join(', ')}.`,
    );
  }
}

function invalid(message: string): ValidationError {
  return new ValidationError(message, { code: 'INVALID_HOLDINGS' });
}
