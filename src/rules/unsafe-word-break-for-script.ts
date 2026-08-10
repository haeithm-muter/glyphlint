/**
 * R10 — a line-breaking rule that the writing system cannot survive.
 *
 * Breaking a line is not a typographic detail, it is a decision about where a word may be cut, and
 * the answer differs by writing system. `word-break: break-all` and `hyphens: auto` are both
 * reached for to stop a long word overflowing a narrow column — a real problem, with a Latin
 * answer that does real damage elsewhere.
 *
 * Reference: UAX #29, Unicode text segmentation.
 */

import type { DomSnapshot, Rule, ScriptId, Violation } from '../types.js';
import {
  SCRIPT_LABELS,
  censusOf,
  countOf,
  propertiesFor,
  scriptsWhere,
  violationFrom,
} from './helpers.js';

/** A break needs a word to break. One letter is not evidence of anything. */
const MINIMUM_GRAPHEMES = 2;

/**
 * The three families, derived from the property table rather than listed by name.
 *
 * The two flags together are what separate Thai, Lao and Khmer from Han and Kana: all five write
 * without spaces between words, and only the first three stack marks. That distinction matters
 * here, because `break-all` is a defect for one group and ordinary for the other — Han and Kana
 * break between characters anyway, so asking for it changes nothing.
 */
const CURSIVE = new Set<ScriptId>(scriptsWhere((properties) => properties.isCursive));
const SEGMENTED_WITH_MARKS = new Set<ScriptId>(
  scriptsWhere((properties) => properties.needsWordSegmentation && properties.hasStackedMarks),
);
const SEGMENTED_WITHOUT_MARKS = new Set<ScriptId>(
  scriptsWhere((properties) => properties.needsWordSegmentation && !properties.hasStackedMarks),
);

/** What the page asked the browser to do, and why this writing system cannot take it. */
interface UnsafeBreak {
  declaration: string;
  whyItMatters: string;
  howToFix: string;
}

export const unsafeWordBreakForScript: Rule = {
  id: 'unsafe-word-break-for-script',
  title: 'Line breaking that the writing system cannot survive',
  severity: 'moderate',
  confidence: 'medium',

  affectedScripts: scriptsWhere(
    (properties) => properties.isCursive || properties.needsWordSegmentation,
  ),

  description: [
    [
      'Reports three pairings of a line-breaking declaration with a writing system that cannot',
      'take it. On a cursive script, word-break: break-all and hyphens: auto both cut inside a',
      'word and sever the joins between letters, which is the same damage that letter-spacing',
      'does. On Thai, Lao and Khmer, break-all breaks at an arbitrary character in a script that',
      'writes without spaces between words, splitting syllables that the reader needs whole. On',
      'Han and Kana, hyphens: auto asks for a convention the writing system does not have.',
    ].join(' '),
    [
      'The pairings are derived from the property table, not listed by hand. That is what keeps',
      'break-all off Han and Kana: they write without inter-word spaces like Thai does, and they',
      'break between characters as a matter of course, so the same declaration is ordinary there',
      'and a defect three rows above.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Reports the declaration, not an observed break. Whether a line actually breaks in a bad',
      'place depends on the width of the column and the length of the words in it, and a narrow',
      'column that never fills will never show the defect. The declaration is still wrong.',
    ].join(' '),
    [
      'Covers word-break and hyphens only. overflow-wrap: anywhere breaks words just as',
      'aggressively and is not reported, because the specification for this rule named the other',
      'two and widening it is a decision rather than an implementation detail.',
    ].join(' '),
    [
      'Correct breaking of Thai, Lao and Khmer depends on the browser having a correct lang to',
      'segment against. This rule does not check that; lang-script-mismatch reports the language',
      'declaration separately.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null) continue;

      const script = node.dominantScript;
      const label = SCRIPT_LABELS[script];
      const wordBreak = node.css.wordBreak.trim().toLowerCase();
      const hyphens = node.css.hyphens.trim().toLowerCase();
      const breaksAnywhere = wordBreak === 'break-all';
      const hyphenates = hyphens === 'auto';

      const unsafe: UnsafeBreak[] = [];

      if (CURSIVE.has(script)) {
        if (breaksAnywhere) {
          unsafe.push({
            declaration: 'word-break: break-all',
            whyItMatters:
              `${label} letters join, and break-all allows a line to end between any two ` +
              'characters. The break lands inside a word, at exactly the point where two letters ' +
              'were connected, and the reader is left with two fragments that were one word — ' +
              'the same damage letter-spacing does, arriving through a different property.',
            howToFix:
              'Remove word-break: break-all here. Where a long unbroken string really does ' +
              'overflow, overflow-wrap: break-word breaks only when there is no other option, ' +
              'instead of licensing a break everywhere.',
          });
        }
        if (hyphenates) {
          unsafe.push({
            declaration: 'hyphens: auto',
            whyItMatters:
              `Automatic hyphenation cuts a word in two and inserts a hyphen. ${label} has no ` +
              'hyphenation convention, and the cut falls between joined letters, so the word is ' +
              'severed and a mark that means nothing in this script is added at the seam.',
            howToFix: `Set hyphens: manual for ${label} text, and scope hyphens: auto to the ` +
              'languages that have a hyphenation dictionary.',
          });
        }
      }

      if (SEGMENTED_WITH_MARKS.has(script) && breaksAnywhere) {
        unsafe.push({
          declaration: 'word-break: break-all',
          whyItMatters:
            `${label} is written without spaces between words, so the browser has to find word ` +
            'boundaries by segmenting the text against a dictionary. break-all overrides that ' +
            'entirely and permits a break between any two characters — inside a syllable, ' +
            'between a consonant and the vowel that belongs to it. What the reader meets on the ' +
            'next line is not a continuation, it is a fragment that reads as something else.',
          howToFix:
            'Remove word-break: break-all. Make sure the element carries a correct lang so the ' +
            'browser can segment the text properly, and use overflow-wrap: break-word if a long ' +
            'string genuinely needs a last-resort break.',
        });
      }

      if (SEGMENTED_WITHOUT_MARKS.has(script) && hyphenates) {
        unsafe.push({
          declaration: 'hyphens: auto',
          whyItMatters:
            `${label} does not hyphenate. There are no syllable boundaries of the kind ` +
            'hyphenation depends on and no convention of marking a break with a hyphen, so the ' +
            'declaration asks the browser for something the writing system has no answer to. It ' +
            'is a Latin assumption that travelled into a stylesheet it does not belong in.',
          howToFix:
            'Remove hyphens: auto from this text, or scope it with :lang() to the languages that ' +
            'hyphenate.',
        });
      }

      if (unsafe.length === 0) continue;

      // A word needs two letters before a break can fall inside it.
      const census = censusOf(node.scriptRuns);
      if (countOf(census, script) < MINIMUM_GRAPHEMES) continue;

      const first = unsafe[0];
      if (first === undefined) continue;

      const declarations = unsafe.map((entry) => entry.declaration).join(' and ');

      violations.push(
        violationFrom(unsafeWordBreakForScript, node, script, {
          whatIsWrong: `${declarations} is applied to ${label} text.`,
          whyItMatters: unsafe.map((entry) => entry.whyItMatters).join(' '),
          howToFix: unsafe.map((entry) => entry.howToFix).join(' '),
        }),
      );
    }

    return violations;
  },
};
