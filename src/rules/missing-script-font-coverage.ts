/**
 * R3 — the declared font stack appears not to be rendering the script.
 *
 * The computed `font-family` is the stack the author *declared*, not the font the browser actually
 * chose from it. A page can name a beautiful Thai font it never loaded and `getComputedStyle`
 * reports it either way, so the stack alone cannot answer the question. The scanner answers it by
 * measurement instead: the text is measured with the declared stack and again with a family that
 * cannot exist, and matching widths mean the declared stack is contributing nothing.
 *
 * That measurement is the whole basis of this rule, which is why its confidence is `heuristic` and
 * why the field it reads is called `fallbackSuspected` rather than `fallbackOccurred`. See
 * decision 005.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import {
  SCRIPT_LABELS,
  censusOf,
  countOf,
  propertiesFor,
  scriptsWhere,
  violationFrom,
} from './helpers.js';

/**
 * Too little text to trust a width measurement.
 *
 * A single glyph is where a coincidental width match is most likely, and single-character text
 * nodes are common — bullets, counters, a letter used as an icon. Two is enough to be text.
 *
 * The number is deliberately this low. Four would have been a more comfortable guard against
 * noise, and it would have silently excluded most Chinese and Japanese words, which are two or
 * three characters long: "a word is at least four characters" is an assumption about alphabetic
 * scripts, and this project exists to notice assumptions of exactly that shape. Our judgement,
 * not a sourced figure.
 */
const MINIMUM_GRAPHEMES = 2;

export const missingScriptFontCoverage: Rule = {
  id: 'missing-script-font-coverage',
  title: 'Declared font stack does not appear to cover the script',
  severity: 'serious',
  confidence: 'heuristic',

  // Every script except Latin, and the exclusion is deliberate rather than an oversight — see the
  // description. Derived from the table so that adding a script cannot leave this list behind.
  affectedScripts: scriptsWhere(() => true).filter((script) => script !== 'latin'),

  description: [
    [
      'Reports text whose declared font-family appears to contribute nothing, leaving the writing',
      'system to whatever the operating system falls back to. The check is a measurement made',
      'during the scan, not an inspection of the stack: text is measured with the declared',
      'families and again with a family that cannot exist, and identical widths mean the declared',
      'stack is not the one rendering.',
    ].join(' '),
    [
      'Latin text is never reported. Effectively every system font covers Latin, so a fallback',
      'there is a question of taste rather than of access — and the one case where this',
      'measurement is known to be wrong is a stack that resolves to the platform default font,',
      'which is a Latin stack almost every time. Excluding Latin removes most of the false',
      'positives without costing the rule a single true one.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    'Font coverage is inferred, not verified. Treat it as a hint, not a finding.',
    [
      'The rule under-reports far more than it over-reports, and the reason is worth knowing. The',
      'measurement asks whether the declared stack as a whole contributes anything, so a stack',
      'that ends in a generic family — sans-serif, serif — resolves to a real font and is never',
      'reported, even when no family in it covers the script in question. In practice this rule',
      'sees only stacks naming fonts that were never loaded and offering no generic fallback.',
    ].join(' '),
    [
      'Where it does report, it can be wrong in the other direction: the measurement cannot tell',
      'a stack that failed from a stack that resolved to the last-resort font of the browser',
      'itself, so a page whose declared font happens to be the platform default is reported here',
      'wrongly. It also cannot see whether the substituted font covers the script perfectly well',
      '— the system may be serving the reader better than the page asked it to.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null) continue;

      // Latin, including Latin carrying the Vietnamese profile. See the description.
      if (node.dominantScript === 'latin') continue;

      if (!node.fontProbe.fallbackSuspected) continue;

      const census = censusOf(node.scriptRuns);
      if (countOf(census, node.dominantScript) < MINIMUM_GRAPHEMES) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const declared = node.fontProbe.declaredStack;
      const stack = declared.length === 0 ? 'the declared stack' : declared.join(', ');

      violations.push(
        violationFrom(missingScriptFontCoverage, node, node.dominantScript, {
          whatIsWrong:
            `${label} text is set in ${stack}, and measurement during the scan suggests none of ` +
            'those families is the one rendering it.',
          whyItMatters:
            `The page is leaving ${label} to whatever font the system of the reader happens to ` +
            'substitute. That font was not chosen for this script and may shape it poorly, size ' +
            'it inconsistently against the Latin beside it, or fail to draw parts of it at all. ' +
            'The result is a page that looks unfinished in one language and finished in every ' +
            'other.',
          howToFix:
            `Add a font that covers ${label} to the stack for this text, and make sure it is ` +
            'actually served — a family named in CSS but never loaded behaves exactly like a ' +
            'family that was never named. Check it in a browser on a machine where that font is ' +
            'not installed, which is the situation most readers are in.',
        }),
      );
    }

    return violations;
  },
};
