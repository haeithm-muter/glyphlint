/**
 * R11 — text with stacked marks being cut off by its own container.
 *
 * A box sized against Latin is sized against a script that keeps almost everything inside the em
 * box. Thai stacks a vowel and then a tone mark above the same base letter, Devanagari hangs
 * conjuncts below the headline, Vietnamese puts a tone mark above a letter that already carries
 * one. When a box that fits Latin cuts that text, what is lost is not the tail of a sentence — it
 * is the mark that says which word this is.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import { SCRIPT_LABELS, propertiesFor, scriptsWhere, violationFrom } from './helpers.js';

/**
 * Overflow values that hide what does not fit.
 *
 * `auto` and `scroll` are deliberately absent: there the reader can reach the rest of the text,
 * so nothing has been taken away from them. `visible` is absent for the same reason — the text
 * spills out of its box and stays readable, which is a layout problem and not ours.
 */
const CLIPPING_OVERFLOW: ReadonlySet<string> = new Set(['hidden', 'clip']);

/**
 * Marks that sit on another character rather than beside it.
 *
 * Tested against the text itself so the rule also catches stacked marks on a script whose table
 * row does not carry the flag — a Latin word with a combining acute, for example.
 */
const NONSPACING_MARK = /\p{Mn}/u;

/**
 * A pixel of slack.
 *
 * Sub-pixel layout means `scrollHeight` and `clientHeight` can differ by a fraction on a box that
 * is clipping nothing at all, and both are reported as rounded integers.
 */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * The standard way to hide text from sighted readers while leaving it to a screen reader.
 *
 * A skip link, a heading that only assistive technology needs, a label for an icon button. The
 * recipe has been the same for years: shrink the box to a pixel, clip it, and let the accessible
 * name survive. Both spellings are matched because `clip` is deprecated and still everywhere,
 * while `clip-path: inset(100%)` is what replaced it.
 *
 * Found by scanning a real homepage and checking the finding by hand: every clipping report on that
 * page was this pattern, on markup that was doing exactly the right thing. See decision 025.
 */
const HIDDEN_CLIP = /^rect\(\s*1px[,\s]+1px[,\s]+1px[,\s]+1px\s*\)$/u;
const HIDDEN_CLIP_PATH = /^inset\(\s*100%\s*\)$/u;

/**
 * How small a box has to be before it is a hiding technique rather than a container.
 *
 * The recipe uses one pixel. Two is allowed because a border or a sub-pixel rounding can add one,
 * and because no real container of readable text is two pixels tall in either direction — a box
 * this size is not showing anybody anything.
 */
const HIDDEN_BOX_PX = 2;

/**
 * Is this text hidden on purpose for sighted readers, rather than clipped by accident?
 *
 * Both halves are required. The clip alone could be a decorative crop of something visible, and a
 * tiny box alone could be a genuinely broken container; together they are the visually-hidden
 * idiom and nothing else.
 */
function isVisuallyHiddenForScreenReaders(node: {
  css: { clip: string; clipPath: string };
  box: { clientHeight: number; clientWidth: number };
}): boolean {
  const clipped =
    HIDDEN_CLIP.test(node.css.clip.trim()) || HIDDEN_CLIP_PATH.test(node.css.clipPath.trim());
  if (!clipped) return false;

  return node.box.clientHeight <= HIDDEN_BOX_PX && node.box.clientWidth <= HIDDEN_BOX_PX;
}

export const clippedStackedMarks: Rule = {
  id: 'clipped-stacked-marks',
  title: 'Text with stacked marks cut off by its container',
  severity: 'moderate',
  confidence: 'heuristic',

  affectedScripts: scriptsWhere((properties) => properties.hasStackedMarks),

  description: [
    [
      'Reports text carrying stacked marks inside a box that hides what does not fit. Three things',
      'must hold together: the text has marks that sit above or below the base letter, the',
      'container hides its overflow, and the content is taller than the box that holds it.',
    ].join(' '),
    [
      'What the rule measures is layout, not ink: the box is shorter than the text laid out inside',
      'it. That covers a container too short for even one line, a fixed height truncating several',
      'lines, and -webkit-line-clamp. It does not cover a line-height set so tight that the mark',
      'is clipped while the line box still fits — there the numbers agree and nothing here can',
      'see it. That case is what insufficient-line-height-for-script reports, and between them',
      'the two rules cover the two halves.',
    ].join(' '),
    [
      'It is reported separately from ordinary truncation because the consequence differs. A',
      'clipped Latin word is still the word, shortened. A clipped tone mark is a different word.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Overflow may be deliberate truncation, and often is — a card, a table cell, a preview. This',
      'rule reports it anyway, because clipped marks change meaning in a way clipped Latin does',
      'not, and the person reading the report is better placed than we are to judge whether the',
      'truncation was worth it.',
    ].join(' '),
    [
      'It reads the overflow of the element holding the text. A clipping wrapper above that',
      'element is invisible to it, and that is a common pattern, so a quiet result is not evidence',
      'that nothing on the page is being cut.',
    ].join(' '),
    [
      'It cannot see ink. A mark clipped by a tight line-height inside a box that fits the line is',
      'not reported here; insufficient-line-height-for-script is the rule that reports that shape.',
    ].join(' '),
    [
      'Text hidden on purpose for screen readers is skipped, and the test for that is narrow. A',
      'skip link or an icon label hidden with clip: rect(1px, 1px, 1px, 1px) or',
      'clip-path: inset(100%) in a box no more than two pixels across is correct markup, not a',
      'defect, and this rule reported it as one until a real page was checked by hand. Other ways',
      'of hiding text visually — a negative text indent, a zero-height box with no clip, a',
      'transform that moves it off screen — still measure as clipping and are still reported, so a',
      'finding on an element whose text is not meant to be seen is a false positive this rule can',
      'still produce.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null) continue;

      // Latin carrying the Vietnamese profile arrives here with `hasStackedMarks` already true:
      // `propertiesFor` resolves the profile to its own row. See decision 003.
      const hasStackedMarks = properties.hasStackedMarks || NONSPACING_MARK.test(node.text);
      if (!hasStackedMarks) continue;

      const overflow = node.css.overflowY.trim().toLowerCase();
      if (!CLIPPING_OVERFLOW.has(overflow)) continue;

      // Text hidden on purpose for assistive technology measures exactly like clipped text: the
      // overflow is hidden and the content is far taller than the box. Nothing has been taken from
      // anybody — the text is fully available to a screen reader, which is the whole point of the
      // pattern. Reporting it would mean reporting correct accessibility work as a defect.
      if (isVisuallyHiddenForScreenReaders(node)) continue;

      const { scrollHeight, clientHeight } = node.box;
      if (scrollHeight <= clientHeight + OVERFLOW_TOLERANCE_PX) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const clamp = node.css.webkitLineClamp.trim().toLowerCase();
      const clamped = clamp !== '' && clamp !== 'none';
      const cause = clamped
        ? `a -webkit-line-clamp of ${clamp}`
        : `a container ${clientHeight}px tall`;

      violations.push(
        violationFrom(clippedStackedMarks, node, node.dominantScript, {
          whatIsWrong:
            `${label} text carrying stacked marks is cut off by ${cause}: the content needs ` +
            `${scrollHeight}px and the box hides everything past ${clientHeight}px.`,
          whyItMatters:
            `${label} places ink outside the box that Latin fits inside — marks stacked above ` +
            'the letter, or parts that hang below it. A container sized against Latin cuts that ' +
            'ink off, and the loss is not cosmetic: the mark is what distinguishes one letter, ' +
            'or one tone, from another. A clipped Latin word is still that word, shortened. A ' +
            'clipped tone mark is a different word.',
          howToFix: clamped
            ? 'Raise the line clamp, or give the box room for the marks by increasing its ' +
              'line-height so each clamped line carries its full ink. If the truncation is ' +
              'deliberate, check what the last visible line actually reads as in this script.'
            : 'Let the container grow with its content, or give it enough height for the text ' +
              'it holds. Where truncation is deliberate, fade or ellipsis the text rather than ' +
              'cutting it with overflow: hidden, so the reader can tell that something is missing.',
        }),
      );
    }

    return violations;
  },
};
