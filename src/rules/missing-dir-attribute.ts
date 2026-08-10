/**
 * R5 — right-to-left text with no direction declared.
 *
 * The `dir` attribute is not styling. It sets the base direction of a bidirectional paragraph,
 * which decides where punctuation lands, how a mixed line is ordered, and which way the text
 * aligns — and it is the value assistive technology reads. CSS `direction` reaches the visual
 * layout only, and reaches it through a channel that a screen reader is not obliged to consult.
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
 * Below this, the right-to-left text is a fragment rather than content.
 *
 * A brand name, a loanword or a single Arabic word inside an English sentence does not need its
 * own base direction: the bidi algorithm places it correctly on its own. Reporting those would
 * bury the pages that genuinely have an undeclared Arabic paragraph. Fifteen graphemes is our
 * judgement, taken from the specification, not a sourced figure.
 */
const MINIMUM_GRAPHEMES = 15;

export const missingDirAttribute: Rule = {
  id: 'missing-dir-attribute',
  title: 'Right-to-left text with no direction declared',
  severity: 'serious',
  confidence: 'medium',

  affectedScripts: scriptsWhere((properties) => properties.isRtl),

  description: [
    [
      'Reports a run of right-to-left text where neither the element nor any ancestor declares a',
      'dir attribute. Direction is not decoration: it sets the base direction of the paragraph,',
      'which decides where a full stop or a bracket lands on a mixed line, and it is the value',
      'assistive technology reads.',
    ].join(' '),
    [
      'A second, weaker case is reported at moderate rather than serious: the text is laid out',
      'right-to-left through CSS direction, but no dir attribute exists anywhere above it. The',
      'page looks correct and is still missing the declaration, because a stylesheet reaches the',
      'visual layout and does not reach the accessibility tree the same way the attribute does.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Reports only the absence of a declaration. A dir attribute that declares the wrong',
      'direction — Arabic inside dir="ltr" — is a real defect and is not this rule, which would',
      'have to weigh the author having said something explicit against the text disagreeing',
      'with it.',
    ].join(' '),
    [
      'dir="auto" anywhere above the text silences the rule, and should: it is the correct markup',
      'for content whose direction is not known when the page is written.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null || !properties.isRtl) continue;

      // A fragment of right-to-left text inside a left-to-right sentence is placed correctly by
      // the bidi algorithm on its own and needs no declaration of its own.
      const census = censusOf(node.scriptRuns);
      if (countOf(census, node.dominantScript) < MINIMUM_GRAPHEMES) continue;

      // Any value counts as a declaration, `auto` included. `dir="auto"` takes the base direction
      // from the first strong character in the content, which is precisely the right markup for a
      // comment field or a user name — reporting it would report the pages that got it right.
      if (node.ownDir !== null || node.inheritedDir !== null) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const styledRtl = node.computedDirection === 'rtl';

      violations.push(
        violationFrom(missingDirAttribute, node, node.dominantScript, {
          severity: styledRtl ? 'moderate' : 'serious',
          whatIsWrong: styledRtl
            ? `${label} text is laid out right-to-left by CSS, but no dir attribute is set on it ` +
              'or on any element above it.'
            : `${label} text has no dir attribute on it or on any element above it, and is being ` +
              'laid out left-to-right.',
          whyItMatters: styledRtl
            ? 'The page looks right, so this is easy to leave alone. CSS direction settles the ' +
              'visual layout and stops there: the dir attribute is what travels into the ' +
              'accessibility tree, and it is what a screen reader and a translation tool consult ' +
              'to decide the base direction of the text they are handed. A stylesheet that fails ' +
              'to load takes the direction with it; an attribute does not.'
            : `Without a base direction the paragraph is treated as left-to-right, so ${label} ` +
              'words are placed correctly but everything around them is not. Punctuation ends up ' +
              'on the wrong side, brackets and quotation marks reverse, and any number or Latin ' +
              'word in the line is ordered against the reader. The text is present and the ' +
              'sentence is wrong.',
          howToFix:
            'Add dir="rtl" to the element that holds this text, or to the nearest block that ' +
            'contains it — on <html> when the whole page is in this language. Where the direction ' +
            'depends on content written by users, dir="auto" is the correct answer and this rule ' +
            'accepts it.',
        }),
      );
    }

    return violations;
  },
};
