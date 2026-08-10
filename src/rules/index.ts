/**
 * The rule registry.
 *
 * Every script-aware rule is listed here once, and `runRules` is the only way the rest of the
 * project runs them. Two properties matter to callers:
 *
 * 1. **Purity.** Running the whole engine touches no browser, no network and no clock, so a
 *    report can be regenerated from a stored snapshot and get the same answer.
 * 2. **Deterministic order.** The output is sorted, not left in whatever order the rules happened
 *    to run. A report that reorders itself between two runs of the same page cannot be diffed,
 *    and a campaign that cannot diff its own output cannot show that anything improved.
 */

import type { DomSnapshot, Rule, ScriptId, Severity, Violation } from '../types.js';
import { caseTransformOnCaselessScript } from './case-transform-on-caseless-script.js';
import { cursiveScriptLetterSpacing } from './cursive-script-letter-spacing.js';
import { insufficientLineHeightForScript } from './insufficient-line-height-for-script.js';
import { missingScriptFontCoverage } from './missing-script-font-coverage.js';

export { caseTransformOnCaselessScript } from './case-transform-on-caseless-script.js';
export { cursiveScriptLetterSpacing } from './cursive-script-letter-spacing.js';
export { insufficientLineHeightForScript } from './insufficient-line-height-for-script.js';
export { missingScriptFontCoverage } from './missing-script-font-coverage.js';

/**
 * Every rule GlyphLint runs.
 *
 * Group A of the specification: script integrity. Groups B and C are added to this array as they
 * are built, and nothing else needs to change when they are.
 */
export const RULES: readonly Rule[] = [
  cursiveScriptLetterSpacing,
  insufficientLineHeightForScript,
  missingScriptFontCoverage,
  caseTransformOnCaselessScript,
];

/** Worst first. The order a person reads a report in. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export interface RunRulesOptions {
  /** Rule ids to leave out of this run. */
  disabledRules?: string[];
  /** Keep only findings about these writing systems. */
  onlyScripts?: ScriptId[];
  /** Keep only findings at least this severe. */
  minSeverity?: Severity;
}

/**
 * Compare two strings by code unit.
 *
 * Deliberately not `localeCompare`: that consults ICU and can order the same two ids differently
 * on two machines, which would make the sort non-deterministic in exactly the way this function
 * exists to prevent.
 */
function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Run every rule over one snapshot.
 *
 * Ordering is severity, then rule id, then selector, then the snippet — the last only so that two
 * text nodes inside the same element cannot swap places between runs. Every key is a value from
 * the finding itself, so the order is a function of the data and not of the iteration order of
 * the registry.
 */
export function runRules(snapshot: DomSnapshot, options: RunRulesOptions = {}): Violation[] {
  const { disabledRules, onlyScripts, minSeverity } = options;

  const disabled = new Set(disabledRules ?? []);
  const wanted = onlyScripts === undefined ? null : new Set<ScriptId>(onlyScripts);
  const severityFloor = minSeverity === undefined ? null : SEVERITY_RANK[minSeverity];

  const violations: Violation[] = [];

  for (const rule of RULES) {
    if (disabled.has(rule.id)) continue;
    if (severityFloor !== null && SEVERITY_RANK[rule.severity] > severityFloor) continue;

    for (const violation of rule.check(snapshot)) {
      // Filtered on the finding rather than on the rule: a rule may affect several writing
      // systems, and the caller asked about the text, not about the rule.
      if (wanted !== null && !wanted.has(violation.script)) continue;
      violations.push(violation);
    }
  }

  return violations.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      compareStrings(left.ruleId, right.ruleId) ||
      compareStrings(left.selector, right.selector) ||
      compareStrings(left.snippet, right.snippet),
  );
}
