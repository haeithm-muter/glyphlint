/**
 * Narrowing a scan to what the caller asked for.
 *
 * The functions here are pure — they live under `scanner/` because they belong to a scan run and
 * are called by `scanUrl`, not because they touch anything impure. They can be tested without a
 * browser and are.
 *
 * The rule this file has to keep: **narrowing is not editing.** An axe finding that survives a
 * filter is byte-for-byte the object axe produced. One that does not survive is counted and the
 * count is printed, so a filtered report can never read as a shorter page. See decision 018.
 */

import type { AxeViolation, FilterOptions, Severity } from '../types.js';

/** Worst first, matching the order `runRules` sorts by. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

/** True when at least one filter was actually set, so that "unfiltered" stays distinguishable. */
export function hasAnyFilter(filters: FilterOptions): boolean {
  return (
    filters.onlyRules !== undefined ||
    filters.disabledRules !== undefined ||
    filters.onlyScripts !== undefined ||
    filters.minSeverity !== undefined
  );
}

/**
 * Whether a rule id passes the allow-list and the deny-list.
 *
 * Both lists are matched against axe's rule ids exactly as they are matched against ours. An id
 * that names nothing in either layer silently matches nothing, which is why the CLI warns about
 * ids it does not recognise rather than leaving the caller to wonder.
 */
function ruleIdAllowed(ruleId: string, filters: FilterOptions): boolean {
  if (filters.disabledRules?.includes(ruleId) === true) return false;
  if (filters.onlyRules !== undefined && !filters.onlyRules.includes(ruleId)) return false;
  return true;
}

/**
 * Apply the caller's filters to axe-core's findings.
 *
 * `impact` is read as axe wrote it. The four names are axe's own, which is why our severities can
 * be compared with them at all — this is a comparison, not a translation, and nothing here
 * assigns a severity to an axe finding.
 *
 * An axe entry with no `impact` at all survives every severity floor. axe leaves the field off
 * when it did not grade the failure, and dropping such a finding would mean inventing a grade for
 * it in order to decide it was not serious enough to show.
 */
export function filterAxeViolations(
  violations: readonly AxeViolation[],
  filters: FilterOptions,
): AxeViolation[] {
  const floor = filters.minSeverity === undefined ? null : SEVERITY_RANK[filters.minSeverity];

  return violations.filter((violation) => {
    if (!ruleIdAllowed(violation.id, filters)) return false;

    if (floor !== null) {
      const impact = violation.impact;
      // `null` and `undefined` both mean axe did not grade it. Neither is a low grade.
      if (impact !== undefined && impact !== null && SEVERITY_RANK[impact] > floor) return false;
    }

    return true;
  });
}
