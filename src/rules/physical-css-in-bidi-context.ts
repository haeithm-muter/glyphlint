/**
 * R7 — physical left/right alignment inside a right-to-left context.
 *
 * `text-align: left` means the left of the screen, not the start of the line. In a left-to-right
 * layout the two coincide, so the distinction costs nothing and gets forgotten; in a right-to-left
 * layout they are opposites. The logical values — `start` and `end` — follow the reader instead of
 * the screen, which is what lets one stylesheet serve both directions.
 *
 * The specification for this rule also asked for asymmetric `margin-left/right` and
 * `padding-left/right`. Those were implemented, measured, and removed: a computed style cannot
 * tell them apart from the logical properties that are the recommended fix. See decision 013.
 *
 * Reference: UAX #9, the Unicode Bidirectional Algorithm.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import { SCRIPT_LABELS, scriptsWhere, violationFrom } from './helpers.js';

/** The two values that name a side of the screen rather than an end of the line. */
const PHYSICAL_ALIGNMENTS: ReadonlySet<string> = new Set(['left', 'right']);

export const physicalCssInBidiContext: Rule = {
  id: 'physical-css-in-bidi-context',
  title: 'Physical text alignment in a right-to-left context',
  severity: 'moderate',
  confidence: 'medium',

  affectedScripts: scriptsWhere((properties) => properties.isRtl),

  description: [
    [
      'Reports an explicit text-align of left or right on text whose computed direction is',
      'right-to-left. Physical values address the screen; logical values address the reader. The',
      'two agree in a left-to-right layout and disagree in a right-to-left one, which is why the',
      'mistake survives every test until the page is mirrored.',
    ].join(' '),
    [
      'The two are graded by what they do today. left in a right-to-left context is wrong on the',
      'screen right now. right is visually correct today and breaks the moment the same component',
      'is rendered left-to-right — a maintenance defect rather than a live one. Both are reported,',
      'and the finding says which one it is.',
    ].join(' '),
    [
      'Margins and padding are deliberately absent. A computed margin-right of 40px in a',
      'right-to-left context is produced identically by margin-right: 40px and by',
      'margin-inline-start: 40px, and the second of those is the correct code this rule would',
      'otherwise be recommending. Reporting it would tell an author that the fix is the defect.',
      'See decision 013.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Advisory. Deliberate physical alignment is legitimate — a column of figures, a signature',
      'block — and this rule cannot tell an intentional choice from a forgotten one. It reports',
      'that the value will not follow the reader, which is a fact, and leaves the judgement of',
      'whether it should to a person.',
    ].join(' '),
    [
      'It covers alignment only. Physical margins and padding are the larger half of this defect',
      'in practice, and they are undetectable from a computed style: the logical properties that',
      'fix them compute to exactly the same values. A page can be full of margin-left and this',
      'rule will be silent about all of it.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      if (node.computedDirection !== 'rtl') continue;

      // Measured: Chromium keeps `start` and `end` as themselves rather than resolving them to a
      // side, so an explicit `left` or `right` here really was written as one.
      const align = node.css.textAlign.trim().toLowerCase();
      if (!PHYSICAL_ALIGNMENTS.has(align)) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const live = align === 'left';

      violations.push(
        violationFrom(physicalCssInBidiContext, node, node.dominantScript, {
          whatIsWrong:
            `This element holds ${label} text in a right-to-left context and sets ` +
            `text-align: ${align}.`,
          whyItMatters: live
            ? 'text-align: left pushes this text to the far side of its own line, against the ' +
              'direction it reads in. Physical values address the screen rather than the reader, ' +
              'so they do not flip when the direction does, and here the side named is the wrong ' +
              'side already.'
            : 'text-align: right happens to look correct here, which is what makes it worth ' +
              'reporting: it names a side of the screen rather than an end of the line, so it ' +
              'stops looking correct the moment this component is rendered left-to-right. The ' +
              'version of the page nobody tested is the one where it shows.',
          howToFix:
            'Use the logical values instead: text-align: start for the side the line begins on, ' +
            'text-align: end for the side it finishes on. They resolve against the direction of ' +
            'the text, so one declaration serves both directions and there is nothing left to ' +
            'mirror by hand.',
        }),
      );
    }

    return violations;
  },
};
