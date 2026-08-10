/**
 * R2 — line height below what the writing system needs.
 *
 * Latin sits almost entirely inside its em box. Devanagari hangs conjuncts below the headline,
 * Thai stacks a vowel and then a tone mark above the same base letter, and Arabic carries dots and
 * marks in both directions. At Latin leading that ink has nowhere to go, so it meets the line
 * above — and what collides is not decoration, it is the part of the letter that says which letter
 * it is.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import { SCRIPT_LABELS, pixelLength, propertiesFor, round, scriptsWhere, violationFrom } from './helpers.js';

/**
 * A box shorter than two lines is holding one line, and one line cannot collide with anything.
 *
 * This is what keeps the rule off buttons, nav items, table headers and every other single-line
 * element where `line-height` is being used to centre text vertically rather than to space
 * paragraphs. Measured rather than assumed: a `<p>` at 16px with `line-height: 1.1` reports a
 * client height of 18px, so the test below excludes it correctly.
 */
const SINGLE_LINE_BOX_FACTOR = 2;

/**
 * Form controls, where `line-height` is a vertical-centring device and the browser's own default
 * is already `normal`. Chromium reports a button at `line-height: normal` and a client height
 * under two lines, so both other guards would catch these anyway; the list states the intent.
 */
const CONTROL_TAGS: ReadonlySet<string> = new Set([
  'BUTTON',
  'INPUT',
  'SELECT',
  'OPTION',
  'TEXTAREA',
]);

/**
 * The line spacing WCAG names, and the only ratio in this rule with a citation behind it.
 *
 * SC 1.4.8 Visual Presentation (Level AAA) requires line spacing of at least space-and-a-half
 * within paragraphs. A finding below this number breaches a written requirement. A finding between
 * this number and a higher per-script threshold does not, and must not pretend to.
 */
const WCAG_LINE_SPACING_RATIO = 1.5;
const WCAG_REF = '1.4.8';

export const insufficientLineHeightForScript: Rule = {
  id: 'insufficient-line-height-for-script',
  title: 'Line height below what the writing system needs',
  severity: 'moderate',
  confidence: 'heuristic',

  // Every script that has a ratio at all. Mongolian is excluded by its own row, which carries
  // `null`: it runs in vertical columns, and a line-height ratio describes horizontal lines.
  affectedScripts: scriptsWhere((properties) => properties.minLineHeightRatio !== null),

  description: [
    [
      'Compares computed line-height against font-size and reports text set tighter than its',
      'writing system needs. The baseline of 1.5 is the line spacing named by WCAG SC 1.4.8,',
      'which requires at least space-and-a-half within paragraphs and is a requirement on the',
      'author. Thai, Lao and Khmer are held to 1.6, which is our own estimate and is labelled as',
      'one everywhere it appears, including inside the finding itself.',
    ].join(' '),
    [
      'A finding is cited against SC 1.4.8 only when the measured ratio is below the 1.5 that',
      'criterion names. Text that clears 1.5 but falls short of our stacked-mark estimate is',
      'reported without a citation, because there is no standards document behind that number and',
      'attaching one would be inventing a source.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Ratio thresholds are partly estimates; see README. line-height: normal is never flagged.',
      'A font whose own metrics are generous can be perfectly legible below these ratios, and a',
      'font with tall ascenders can collide above them — the rule measures the CSS, not the',
      'typeface. Single-line boxes are excluded, so a tight nav item or button is never reported.',
    ].join(' '),
    [
      'This rule is the half of mark clipping that measures the leading. A box shorter than the',
      'text laid out inside it is the other half, and clipped-stacked-marks reports that one. A',
      'tight line-height clips ink while the box and its content still measure the same, which is',
      'why that rule cannot see this case and this one can.',
    ].join(' '),
  ].join('\n\n'),

  wcagRef: WCAG_REF,

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null) continue;

      const threshold = properties.minLineHeightRatio;
      if (threshold === null) continue;

      // `line-height: normal` is never flagged. The browser derives it from the font's own
      // metrics, which for a well-made Thai or Devanagari font already allows for the marks.
      // Reporting it would be guessing about a typeface we cannot see.
      const lineHeight = pixelLength(node.css.lineHeight);
      if (lineHeight === null) continue;

      const fontSize = pixelLength(node.css.fontSize);
      if (fontSize === null || fontSize <= 0) continue;

      const ratio = lineHeight / fontSize;
      if (ratio >= threshold.value) continue;

      if (CONTROL_TAGS.has(node.tagName)) continue;
      if (node.box.clientHeight < SINGLE_LINE_BOX_FACTOR * fontSize) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const estimated = threshold.source === 'estimate';
      const breachesWcag = ratio < WCAG_LINE_SPACING_RATIO;

      const provenance = estimated
        ? `${round(threshold.value)} is our own estimate for this script, not a figure taken from a standard.`
        : `${round(threshold.value)} is the line spacing named by WCAG SC 1.4.8 (Level AAA).`;

      violations.push(
        violationFrom(insufficientLineHeightForScript, node, node.dominantScript, {
          whatIsWrong:
            `Line height is ${round(ratio)} times the font size on ${label} text, below the ` +
            `${round(threshold.value)} this script needs. ${provenance}`,
          whyItMatters:
            `${label} places ink outside the box that Latin fits inside — marks that stack above ` +
            'the letter, or parts that hang below it. Leading chosen for Latin leaves that ink ' +
            'nowhere to go, so it touches or overlaps the line above. What collides is not ' +
            'decoration: it is the mark that distinguishes one letter, or one tone, from another.',
          howToFix:
            `Raise line-height to at least ${round(threshold.value)} for this text, or remove the ` +
            'declaration and let line-height: normal use the metrics the font ships with. If the ' +
            'value is deliberate for Latin, scope it with :lang() rather than applying it to ' +
            'every translation of the page.',
          // Cited only when the measured value breaches the number the criterion actually names.
          ...(breachesWcag ? { wcagRef: WCAG_REF } : {}),
        }),
      );
    }

    return violations;
  },
};
