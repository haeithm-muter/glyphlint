/**
 * The JSON report.
 *
 * Written for a machine that will aggregate many scans — the campaign runner is the first such
 * machine — so the shape mirrors the HTML rather than inventing a second vocabulary.
 *
 * One field carries the whole point: every finding has a `source`, either `axe-core` or
 * `glyphlint`, and there is no array anywhere in this document that mixes the two. A consumer that
 * wants a combined number has to add them up deliberately; nothing here does it for them.
 */

import type { AxeViolation, Violation } from '../types.js';
import { DISCLAIMER, type ReportModel } from './model.js';

/**
 * An axe finding, labelled.
 *
 * The label is added by spreading axe's object into a new one, so every field axe carries is
 * still present — including any field this project has never heard of. Nothing is dropped,
 * renamed or re-scored; a `source` key is put beside what axe said.
 */
export interface JsonStandardFinding extends AxeViolation {
  source: 'axe-core';
}

/** One of ours. `Violation` already carries `source: 'glyphlint'`, so nothing is added. */
export type JsonScriptAwareFinding = Violation;

export interface JsonReport {
  tool: 'glyphlint';
  reportVersion: number;
  url: string;
  finalUrl: string;
  scannedAt: string;
  durationMs: number;
  summary: {
    /** Counted separately, and deliberately not summed. */
    standard: ReportModel['standard']['counts'] & { rules: number; elements: number; passes: number };
    scriptAware: ReportModel['scriptAware']['counts'] & { rules: number; elements: number };
    byScript: ReportModel['scriptAware']['byScript'];
    scriptsDetected: ReportModel['scriptsDetected'];
  };
  standard: {
    source: 'axe-core';
    /** What this section is, in a sentence, for anyone reading the file without the HTML. */
    attribution: string;
    findings: JsonStandardFinding[];
  };
  scriptAware: {
    source: 'glyphlint';
    findings: JsonScriptAwareFinding[];
    /** Per rule, the metadata a consumer needs to weigh a finding: confidence and limitations. */
    rules: {
      ruleId: string;
      title: string;
      severity: string;
      confidence: string;
      limitations: string;
      wcagRef?: string;
      scripts: string[];
      elements: number;
    }[];
  };
  unsupportedScript?: ReportModel['unsupportedScript'];
  filters?: ReportModel['filters'];
  error?: ReportModel['error'];
  disclaimer: string;
}

const ATTRIBUTION =
  'These findings are produced by axe-core, an independent open-source accessibility engine by ' +
  'Deque Systems, and are reproduced here unchanged. GlyphLint does not re-score, re-word or ' +
  'edit them, and does not claim them as its own findings.';

/** Build the JSON report. Pure, and stable: the same model always serialises identically. */
export function buildJsonReport(model: ReportModel): JsonReport {
  const report: JsonReport = {
    tool: 'glyphlint',
    reportVersion: model.reportVersion,
    url: model.url,
    finalUrl: model.finalUrl,
    scannedAt: model.scannedAt,
    durationMs: model.durationMs,
    summary: {
      standard: {
        ...model.standard.counts,
        rules: model.standard.ruleCount,
        elements: model.standard.elementCount,
        passes: model.standard.passes,
      },
      scriptAware: {
        ...model.scriptAware.counts,
        rules: model.scriptAware.ruleCount,
        elements: model.scriptAware.elementCount,
      },
      byScript: model.scriptAware.byScript,
      scriptsDetected: model.scriptsDetected,
    },
    standard: {
      source: 'axe-core',
      attribution: ATTRIBUTION,
      findings: model.standard.groups.map((group) => ({ source: 'axe-core', ...group.axe })),
    },
    scriptAware: {
      source: 'glyphlint',
      findings: model.scriptAware.groups.flatMap((group) => group.violations),
      rules: model.scriptAware.groups.map((group) => {
        const entry: JsonReport['scriptAware']['rules'][number] = {
          ruleId: group.ruleId,
          title: group.title,
          severity: group.severity,
          confidence: group.confidence,
          limitations: group.limitations,
          scripts: group.scripts,
          elements: group.elementCount,
        };
        if (group.wcagRef !== undefined) entry.wcagRef = group.wcagRef;
        return entry;
      }),
    },
    disclaimer: DISCLAIMER,
  };

  if (model.unsupportedScript !== undefined) report.unsupportedScript = model.unsupportedScript;
  if (model.filters !== undefined) report.filters = model.filters;
  if (model.error !== undefined) report.error = model.error;

  return report;
}

/** The report as text, ready to write to a file or a pipe. */
export function renderJsonReport(model: ReportModel): string {
  return `${JSON.stringify(buildJsonReport(model), null, 2)}\n`;
}
