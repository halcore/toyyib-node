// Checked by `npm run typecheck`: expectTypeOf fails the type check, not the run.
import { describe, expectTypeOf, it } from 'vitest';

import type {
  ComplianceStatus,
  ETFCompliance,
  Filing,
  FilingEvidence,
  FilingInputs,
  PortfolioAnalysis,
  PortfolioHolding,
  Region,
  Report,
  ReportDownload,
  ReportStats,
  SingleStockCompliance,
  StockCompliance,
  StockReport,
  Usage,
} from '../src/types';

describe('friendly types', () => {
  it('match the API reply shapes', () => {
    expectTypeOf<PortfolioHolding>().toEqualTypeOf<{
      ticker: string;
      shares: number;
    }>();
    expectTypeOf<ComplianceStatus>().toEqualTypeOf<
      'COMPLIANT' | 'NON_COMPLIANT' | 'QUESTIONABLE'
    >();

    expectTypeOf<StockCompliance['status']>().toEqualTypeOf<ComplianceStatus>();
    expectTypeOf<StockCompliance['purification_ratio']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<SingleStockCompliance>().not.toHaveProperty(
      'purification_ratio',
    );
    expectTypeOf<StockReport['ratios']>().not.toBeAny();
    expectTypeOf<ETFCompliance['compliant_holdings']>().toEqualTypeOf<number>();

    expectTypeOf<Filing['id']>().toEqualTypeOf<string>();
    expectTypeOf<FilingInputs['filing']>().toEqualTypeOf<Filing>();
    expectTypeOf<FilingEvidence>().toHaveProperty('inputs');

    expectTypeOf<Region>().toHaveProperty('code');
    expectTypeOf<Report>().toHaveProperty('download_url');
    expectTypeOf<ReportDownload['download_url']>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<ReportStats['report_schedule']>().toBeArray();
    expectTypeOf<PortfolioAnalysis['holdings']>().toBeArray();
    expectTypeOf<Usage['key']['mode']>().toEqualTypeOf<
      'sandbox' | 'production'
    >();
  });
});
