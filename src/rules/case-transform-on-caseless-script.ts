/**
 * R4 — `text-transform` applied to a script that has no case.
 *
 * On its own this is harmless: the property simply does nothing. It is in the set because of what
 * it indicates. `text-transform: uppercase` on Arabic or Thai is a stylesheet written for Latin
 * and applied to a translation without being read, and CSS in that state rarely contains only one
 * Latin assumption. This rule is cheap to check and it points at the file worth looking in.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import {
  SCRIPT_LABELS,
  censusOf,
  propertiesFor,
  scriptsWhere,
  shareOf,
  violationFrom,
} from './helpers.js';

/** The three values that ask the browser to change case. Everything else is left alone. */
const CASE_TRANSFORMS: ReadonlySet<string> = new Set(['uppercase', 'lowercase', 'capitalize']);

/**
 * How much Latin a node may hold before `text-transform` on it is legitimate.
 *
 * A caseless script mixed with a real amount of Latin is a node where the property does have
 * something to act on — a product name, a code, a Latin acronym — and reporting it would be
 * reporting CSS that is working. Below a fifth of the text, the Latin is incidental and the
 * declaration is still aimed at text that cannot answer it.
 */
const MAXIMUM_LATIN_SHARE = 0.2;

export const caseTransformOnCaselessScript: Rule = {
  id: 'case-transform-on-caseless-script',
  title: 'Case transform applied to a script without case',
  severity: 'minor',
  confidence: 'high',

  affectedScripts: scriptsWhere((properties) => properties.isCaseless),

  description: [
    [
      'Reports text-transform: uppercase, lowercase or capitalize on text whose writing system',
      'has no upper and lower case. Arabic, Hebrew, Thai, Devanagari, Han, Kana, Hangul and the',
      'rest are unicameral: there is no other case for the browser to convert to, so the',
      'declaration has no effect on what the reader sees.',
    ].join(' '),
    [
      'It is reported not because the reader is harmed by it but because of what it reveals. A',
      'rule this cheap earns its place by pointing at a stylesheet that was written for Latin and',
      'then pointed at a translation, which is where the expensive defects tend to live.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    'This is a signal, not damage: the text renders exactly as it would without the declaration.',
    'It is reported as minor for that reason. A node mixing a caseless script with a fifth or',
    'more Latin text is never reported, because there the property does have something to act on.',
  ].join(' '),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null || !properties.isCaseless) continue;

      // Chromium also computes `math-auto`, `full-width` and `full-size-kana` here. None of them
      // is a case conversion, and none of them belongs in this finding.
      const transform = node.css.textTransform.trim().toLowerCase();
      if (!CASE_TRANSFORMS.has(transform)) continue;

      // The caseless script already dominates — that is what `dominantScript` means — so the only
      // remaining question is whether the Latin beside it is substantial enough to be the target.
      const census = censusOf(node.scriptRuns);
      if (shareOf(census, 'latin') >= MAXIMUM_LATIN_SHARE) continue;

      const label = SCRIPT_LABELS[node.dominantScript];

      violations.push(
        violationFrom(caseTransformOnCaselessScript, node, node.dominantScript, {
          whatIsWrong: `text-transform: ${transform} is applied to ${label} text.`,
          whyItMatters:
            `${label} has no upper and lower case, so there is nothing for the browser to ` +
            'convert and the declaration does nothing at all. What it does tell you is that this ' +
            'CSS was designed around Latin and reached the translation unread — and a stylesheet ' +
            'in that state usually carries assumptions that are not harmless, about direction, ' +
            'spacing or line height.',
          howToFix:
            'Remove text-transform from this text, or scope the declaration to the languages ' +
            'that have case with :lang(). Then read the rest of the same block for the ' +
            'assumptions that travelled with it.',
        }),
      );
    }

    return violations;
  },
};
