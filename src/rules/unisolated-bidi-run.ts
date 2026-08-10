/**
 * R8 — an unisolated left-to-right run inside right-to-left text.
 *
 * The Unicode Bidirectional Algorithm (UAX #9) resolves the order of a mixed line from the
 * characters themselves. It gets the letters right and it cannot get the punctuation right,
 * because a full stop is directionally neutral: it takes its side from its neighbours. Drop an
 * English product name and a comma into an Arabic sentence and the comma can surface at the far
 * end of the run, or the run can escape its own clause entirely.
 *
 * Isolation is the fix, and it has to wrap the embedded run — `<bdi>`, or an element with
 * `unicode-bidi: isolate`. Isolation on the paragraph does not help: it separates that paragraph
 * from its siblings, not one run inside it from another.
 *
 * This is the highest false-positive risk in the whole set, so it is deliberately the narrowest
 * rule here. If it turns out noisy on real pages, it gets narrower. It never gets looser.
 */

import type { DomSnapshot, Rule, ScriptRun, Violation } from '../types.js';
import { SCRIPT_LABELS, countGraphemes, propertiesFor, scriptsWhere, violationFrom } from './helpers.js';

/**
 * The neutral characters the algorithm visibly reorders.
 *
 * Restricted to the punctuation whose placement changes the reading of the line. A bare Latin word
 * between two Arabic words renders where a reader expects it; it is the neutral character beside
 * it that moves, so a rule that fired without one would be reporting text that renders correctly.
 */
const BIDI_NEUTRALS = /[.,:;!?()"'\][{}]/u;

/** Digits are directionally weak and travel with the run beside them, so they count as one. */
const DIGITS = /[0-9]/u;

/** Enough of a run to be content rather than an initial or a footnote marker. */
const MINIMUM_RUN_GRAPHEMES = 2;

/** Scripts written right to left, resolved once from the property table. */
const RTL_SCRIPTS = new Set(scriptsWhere((properties) => properties.isRtl));

/** Whether a run is left-to-right content: Latin letters, or a run of digits. */
function isLtrRun(run: ScriptRun): boolean {
  if (run.script === 'latin') return true;
  return run.script === 'common' && DIGITS.test(run.text);
}

/** Whether a run carries a neutral character whose side the algorithm has to decide. */
function bordersNeutral(run: ScriptRun): boolean {
  return BIDI_NEUTRALS.test(run.text);
}

export const unisolatedBidiRun: Rule = {
  id: 'unisolated-bidi-run',
  title: 'Unisolated left-to-right run inside right-to-left text',
  severity: 'moderate',
  confidence: 'heuristic',

  affectedScripts: scriptsWhere((properties) => properties.isRtl),

  description: [
    [
      'Reports a Latin or numeric run sandwiched between two right-to-left runs inside one text',
      'node, where the embedded run touches punctuation. Punctuation is directionally neutral',
      'under UAX #9 and takes its side from its neighbours, which is where a mixed line visibly',
      'comes apart: the full stop after an English product name can surface at the wrong end of',
      'the clause.',
    ].join(' '),
    [
      'The condition is narrow on purpose, in two ways. The run must be sandwiched, because a',
      'Latin word at the edge of a line is not reordered against anything. And it must touch a',
      'neutral character, because a bare Latin word between two Arabic words renders exactly where',
      'a reader expects it, and flagging those would fill a report with text that is fine.',
    ].join(' '),
    [
      'The detection reads the text node itself rather than the unicode-bidi property, and that is',
      'a correction rather than a shortcut. Chromium computes unicode-bidi: isolate on every block',
      'element by default, so a rule that skipped isolated elements would be silent on every',
      'paragraph on the web. Isolation that actually helps wraps the embedded run — and a wrapped',
      'run would be its own text node, which means the pattern surviving inside a single node is',
      'itself the evidence that nothing wrapped it. See decision 014.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'A heuristic, and the one most likely to be wrong. It reports a risk of visible reordering,',
      'not observed reordering: whether the line actually breaks depends on the exact sequence of',
      'neutral characters, and we do not run the bidirectional algorithm to find out. Many',
      'findings will be text that renders acceptably.',
    ].join(' '),
    [
      'It also cannot see isolation applied through CSS to a wrapper that produced no text node of',
      'its own, and it says nothing about right-to-left runs embedded in left-to-right text, which',
      'is the mirror image of the same problem.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null || !properties.isRtl) continue;

      // An author who reached for <bdi> has thought about bidirectional text. It does not isolate
      // the inner run, but it is enough evidence of intent to stay quiet about their markup.
      if (node.hasBdiAncestor) continue;

      const runs = node.scriptRuns;
      let found: ScriptRun | null = null;

      for (let index = 0; index < runs.length && found === null; index += 1) {
        const run = runs[index];
        if (run === undefined || !isLtrRun(run)) continue;
        if (countGraphemes(run.text) < MINIMUM_RUN_GRAPHEMES) continue;

        // Sandwiched: a right-to-left run somewhere before it and another somewhere after it,
        // with only the embedded run and neutral glue between.
        let rtlBefore = false;
        for (let before = index - 1; before >= 0; before -= 1) {
          const candidate = runs[before];
          if (candidate === undefined) continue;
          if (RTL_SCRIPTS.has(candidate.script)) {
            rtlBefore = true;
            break;
          }
          if (candidate.script !== 'common' && !isLtrRun(candidate)) break;
        }
        if (!rtlBefore) continue;

        let rtlAfter = false;
        for (let after = index + 1; after < runs.length; after += 1) {
          const candidate = runs[after];
          if (candidate === undefined) continue;
          if (RTL_SCRIPTS.has(candidate.script)) {
            rtlAfter = true;
            break;
          }
          if (candidate.script !== 'common' && !isLtrRun(candidate)) break;
        }
        if (!rtlAfter) continue;

        // The narrowing that keeps this rule honest: the embedded run has to touch a neutral
        // character, either inside itself or in the glue immediately beside it.
        const previous = runs[index - 1];
        const next = runs[index + 1];
        const touchesNeutral =
          bordersNeutral(run) ||
          (previous !== undefined && previous.script === 'common' && bordersNeutral(previous)) ||
          (next !== undefined && next.script === 'common' && bordersNeutral(next));
        if (!touchesNeutral) continue;

        found = run;
      }

      if (found === null) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const embedded = found.text.trim();

      violations.push(
        violationFrom(unisolatedBidiRun, node, node.dominantScript, {
          whatIsWrong:
            `The run "${embedded}" is embedded in ${label} text next to punctuation, and nothing ` +
            'isolates it from the text around it.',
          whyItMatters:
            'Punctuation has no direction of its own, so the bidirectional algorithm gives it the ' +
            'direction of whatever sits beside it. Around an embedded left-to-right run that ' +
            'decision can put a full stop, a bracket or a quotation mark at the opposite end of ' +
            'the clause from where it was written. The words are all present and the sentence ' +
            'reads wrongly, which is harder to spot and harder to report than text that is simply ' +
            'missing.',
          howToFix:
            'Wrap the embedded run in <bdi>, which isolates it and is what the element exists ' +
            'for. Where markup cannot be added, the Unicode isolate characters U+2068 and U+2069 ' +
            'around the run do the same job. Isolation on the paragraph does not help: it has to ' +
            'wrap the run itself.',
        }),
      );
    }

    return violations;
  },
};
