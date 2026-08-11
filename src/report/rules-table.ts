/**
 * The rule table, for `glyphlint rules`.
 *
 * Printed from the registry rather than from a list kept alongside it. A hand-maintained table is
 * a second copy of the truth, and the day it drifts, the tool starts describing rules it does not
 * run. Everything here is derived: if a rule is added, this output changes without being touched.
 *
 * Pure, and column widths are computed from the data, so the output is a function of the registry
 * and nothing else.
 */

import { RULES } from '../rules/index.js';
import type { Rule } from '../types.js';

/** One row, already stringified. Kept separate from the layout so it can be tested as data. */
export interface RuleTableRow {
  id: string;
  severity: string;
  confidence: string;
  scripts: string;
}

/**
 * `all` stays the word `all`.
 *
 * A rule that applies to every writing system says so; expanding it into sixteen names would
 * make the table unreadable and would claim a per-script judgement the rule never made.
 */
function scriptsOf(rule: Rule): string {
  return rule.affectedScripts === 'all' ? 'all' : [...rule.affectedScripts].sort().join(' ');
}

export function ruleTableRows(): RuleTableRow[] {
  return RULES.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    confidence: rule.confidence,
    scripts: scriptsOf(rule),
  }));
}

/** The table as text, with a heading row and a note about what `heuristic` means. */
export function renderRulesTable(): string {
  const rows = ruleTableRows();
  const header: RuleTableRow = {
    id: 'RULE',
    severity: 'SEVERITY',
    confidence: 'CONFIDENCE',
    scripts: 'WRITING SYSTEMS',
  };

  const all = [header, ...rows];
  const widthOf = (pick: (row: RuleTableRow) => string): number =>
    Math.max(...all.map((row) => pick(row).length));

  const idWidth = widthOf((row) => row.id);
  const severityWidth = widthOf((row) => row.severity);
  const confidenceWidth = widthOf((row) => row.confidence);

  const lines = all.map(
    (row) =>
      `${row.id.padEnd(idWidth)}  ${row.severity.padEnd(severityWidth)}  ` +
      `${row.confidence.padEnd(confidenceWidth)}  ${row.scripts}`,
  );

  return [
    `${rows.length} script-aware rules. These are GlyphLint's own; axe-core's rules are separate`,
    'and are listed at https://github.com/dequelabs/axe-core.',
    '',
    ...lines,
    '',
    'Confidence says how the rule knows what it knows. `high` means the condition is decidable',
    'from what was captured. `heuristic` means the rule is inferring from evidence that can be',
    'wrong, and every finding it produces carries the sentence that says what it cannot see.',
    '',
  ].join('\n');
}
