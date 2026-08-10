/**
 * R1 — `letter-spacing` applied to a cursive script.
 *
 * The project's flagship failure, and the one that is easiest to demonstrate: a designer opens the
 * Arabic translation of a page they built for English, keeps the tracking that made the Latin
 * headline breathe, and the Arabic word falls apart into separate shapes. Nothing in the markup is
 * wrong, so a conventional audit says nothing at all.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import {
  SCRIPT_LABELS,
  censusOf,
  countOf,
  pixelLength,
  propertiesFor,
  round,
  scriptsWhere,
  violationFrom,
} from './helpers.js';

/**
 * Below this, the spacing is rounding noise rather than a decision.
 *
 * Computed values arrive as pixels resolved from whatever unit the author wrote, so a chain of
 * relative units can leave a hundredth of a pixel behind where nothing was intended. Our
 * judgement, not a sourced figure — but the direction of the error is safe, since it can only
 * make the rule quieter.
 */
const SPACING_NOISE_FLOOR_PX = 0.01;

/**
 * A join needs two letters. A node holding one letter of the script has nothing to be severed and
 * is not evidence of anything.
 */
const MINIMUM_GRAPHEMES = 2;

export const cursiveScriptLetterSpacing: Rule = {
  id: 'cursive-script-letter-spacing',
  title: 'Letter spacing applied to a cursive script',
  severity: 'critical',
  confidence: 'high',

  // Derived from the property table rather than listed by hand, so the report can never describe a
  // set of scripts other than the one the check actually applies to.
  affectedScripts: scriptsWhere((properties) => properties.isCursive),

  description: [
    [
      'Reports author-applied letter-spacing on text in a cursive script, where letters change',
      'shape by position and join into a continuous line. Positive tracking severs those joins',
      'and renders a word as a row of isolated glyphs; negative tracking collides them. Either',
      'way the word stops being a word, which is a different kind of damage from the one the same',
      'property does to Latin, where it only changes how airy the line looks.',
    ].join(' '),
    [
      'On WCAG. SC 1.4.12 Text Spacing requires that content remain usable when the reader',
      'imposes a letter spacing of 0.12em through a stylesheet of their own: it is a requirement',
      'about surviving spacing the reader chose. This rule reports the opposite situation,',
      'spacing the author wrote into the CSS of the page. Between the two there is a real tension,',
      'and it belongs specifically to cursive scripts — the 0.12em that SC 1.4.12 asks content to',
      'survive is the same tracking that severs the joins between Arabic letters. A page can',
      'satisfy the criterion and be unreadable; a page can fail this rule and satisfy the',
      'criterion. No success criterion covers what this rule reports, so it carries no WCAG',
      'reference at all rather than the nearest available number. See decision 010.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    'Judges only spacing the page itself applies. Spacing a reader applies through their own',
    'stylesheet or a browser setting is invisible to a scan, and is not what this rule reports.',
    'Any non-zero tracking on a cursive script is reported: we do not claim to know the value at',
    'which a particular typeface stops joining, so the rule reports the decision rather than',
    'grading it.',
  ].join(' '),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      // `null` is every node that is digits, punctuation or a script we do not model. Starting
      // here is what stops the rule firing on `2024` or on a Bengali paragraph.
      const properties = propertiesFor(node);
      if (properties === null || !properties.isCursive) continue;

      // `normal` is not a length, and a keyword must never be read as a zero.
      const spacing = pixelLength(node.css.letterSpacing);
      if (spacing === null) continue;
      if (Math.abs(spacing) < SPACING_NOISE_FLOOR_PX) continue;

      // Counted in the node's own dominant script: a Latin heading inside an Arabic page is Latin
      // text and is correctly left alone, because the rule keys on the node, never on the page.
      const census = censusOf(node.scriptRuns);
      if (countOf(census, node.dominantScript) < MINIMUM_GRAPHEMES) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const amount = `${round(spacing)}px`;

      violations.push(
        violationFrom(cursiveScriptLetterSpacing, node, node.dominantScript, {
          whatIsWrong: `letter-spacing is set to ${amount} on ${label} text.`,
          whyItMatters:
            `${label} is a cursive script: its letters connect, and the connection is part of ` +
            'how a word is read. Tracking pulls the letters apart at exactly the points where ' +
            'they should join, so the word arrives as a row of disconnected shapes; negative ' +
            'tracking collides them instead. A reader does not see loose text, they see text ' +
            'that has come apart.',
          howToFix:
            `Remove letter-spacing from this element, or scope it so it reaches Latin runs only ` +
            `— for example :lang(en) or a selector that excludes [dir="rtl"] — rather than ` +
            'applying it to every language the page is translated into.',
        }),
      );
    }

    return violations;
  },
};
