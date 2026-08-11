/**
 * The report layer.
 *
 * One model, three renderers. Everything in here is a pure function of a `ScanResult`: no clock,
 * no filesystem, no environment. Writing a file and deciding whether a terminal wants colour are
 * the CLI's business, which is what lets a report be regenerated from a stored result and come
 * out byte for byte the same.
 */

export {
  DISCLAIMER,
  REPORT_VERSION,
  SEVERITIES,
  buildReportModel,
  type ReportModel,
  type ScriptAwareGroup,
  type ScriptAwareSection,
  type SeverityCounts,
  type StandardGroup,
  type StandardSection,
} from './model.js';

export { escapeHtml, renderHtmlReport, type HtmlReportOptions } from './html.js';
export {
  buildJsonReport,
  renderJsonReport,
  type JsonReport,
  type JsonScriptAwareFinding,
  type JsonStandardFinding,
} from './json.js';
export { renderTerminalReport, type TerminalReportOptions } from './terminal.js';
export { renderRulesTable, ruleTableRows, type RuleTableRow } from './rules-table.js';
