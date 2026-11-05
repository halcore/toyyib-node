// Friendly names for the API's data. Each is an alias of a type generated from
// the API's schema (src/generated/schema.d.ts), so it changes only when the API
// does. Field names keep the API's snake_case.
import type { components } from './generated/schema';

type Schemas = components['schemas'];

/** COMPLIANT, NON_COMPLIANT or QUESTIONABLE. */
export type ComplianceStatus = Schemas['ComplianceStatusEnum'];
export type FiscalPeriod = Schemas['FiscalPeriodEnum'];

/** A security's compliance in a list, with its purification figures. */
export type StockCompliance = Schemas['SecurityCompliance'];
/** One security's compliance, without the purification figures. */
export type SingleStockCompliance = Schemas['SingleSecurityCompliance'];
/** A security's full compliance report, with its screens and ratios. */
export type StockReport = Schemas['SecurityReport'];
export type FilingRatios = Schemas['FilingRatios'];

/** A screened filing. */
export type Filing = Schemas['FilingResultSummary'];
export type FilingInputs = Schemas['FilingInputsResponse'];
export type FilingInput = Schemas['FilingInput'];
export type FilingEvidence = Schemas['FilingEvidence'];

export type ETFCompliance = Schemas['ETFCompliance'];

export type Exchange = Schemas['Exchange'];
/** A market usable in the `region` filter; the same shape as `Exchange`. */
export type Region = Schemas['Exchange'];

export type Report = Schemas['Report'];
export type ReportPagination = Schemas['ReportPagination'];
export type ReportStats = Schemas['ReportStats'];
export type ReportDownload = Schemas['ReportDownload'];

/** One holding sent to `portfolio.analyze`. */
export type PortfolioHolding = Schemas['HoldingInputRequest'];
export type PortfolioAnalysis = Schemas['PortfolioAnalysis'];
export type PortfolioHoldingResult = Schemas['PortfolioHoldingResult'];
export type PortfolioSummary = Schemas['PortfolioSummary'];

/** The key's details, plan and usage today. */
export type Usage = Schemas['Usage'];
