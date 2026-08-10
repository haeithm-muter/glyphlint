/**
 * R6 — the declared language does not match the script the text is written in.
 *
 * A screen reader picks its voice from `lang`. Arabic text under `lang="en"` is handed to an
 * English voice, which does not produce accented Arabic — it produces noise, because the phoneme
 * set has nothing to do with the letters. This is the most broadly useful rule in the set and also
 * the one where a careless implementation does the most damage, because the obvious version of it
 * reports Persian, Japanese and Korean pages that are marked up perfectly.
 */

import { expectedScriptsForLanguage } from '../scripts/lang-map.js';
import type { DomSnapshot, Rule, ScriptId, Violation } from '../types.js';
import {
  SCRIPT_LABELS,
  censusOf,
  countOf,
  propertiesFor,
  round,
  scriptsWhere,
  shareOf,
  violationFrom,
} from './helpers.js';

/**
 * Enough text that the writing system is the point of the node rather than an aside.
 *
 * Both thresholds come from the specification and are our judgement rather than sourced figures.
 * They exist because the cost of a wrong finding here is high: telling an author their correct
 * markup is broken teaches them to ignore the tool.
 */
const MINIMUM_GRAPHEMES = 20;
const MINIMUM_DOMINANCE = 0.8;

/** Elements whose contents are code, where Latin under any language is correct. */
const CODE_TAGS: ReadonlySet<string> = new Set(['CODE', 'PRE', 'KBD', 'SAMP']);

export const langScriptMismatch: Rule = {
  id: 'lang-script-mismatch',
  title: 'Declared language does not match the script of the text',
  severity: 'serious',
  confidence: 'medium',

  affectedScripts: scriptsWhere(() => true),

  description: [
    [
      'Compares the nearest declared lang against the writing system the text is actually in, and',
      'reports a node only when the language maps to a set of scripts that does not contain it.',
      'The mapping is language to script and never language to country or language to font:',
      'lang="fa" expects the Arabic script because Persian is written in it, lang="ja" expects',
      'Han, Kana and Latin together because Japanese mixes all three in one sentence, and a BCP-47',
      'script subtag such as sr-Latn or zh-Hans overrides the language entirely, because there the',
      'author has told us and we stop guessing.',
    ].join(' '),
    [
      'A language the map does not know produces no expectation at all, and no expectation means',
      'silence. So does a page with no lang anywhere: a missing lang attribute is a real defect and',
      'it is axe-core that reports it, under html-has-lang. We do not restate axe.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'Requires 20 graphemes of text with 80% of them in one writing system, so a heading, a',
      'caption or a quoted phrase in another language is never reported. Long mixed passages are',
      'reported against whichever script dominates them, which can be the wrong one for a page',
      'that genuinely interleaves two languages in a single element.',
    ].join(' '),
    [
      'Text in a writing system GlyphLint does not model is never reported, even under a lang that',
      'plainly contradicts it. Naming the mismatch would mean naming the script, and we do not',
      'claim to. Those nodes are counted separately in the unsupported-script report instead.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      const properties = propertiesFor(node);
      if (properties === null) continue;

      // Code is legitimately Latin inside any language. The ancestor test is what catches the
      // common shape, `pre > span.token`, where the element holding the text is a span and only
      // its ancestry says it is code. The tag is tested too rather than trusting the ancestor walk
      // to have included the element itself.
      if (CODE_TAGS.has(node.tagName) || node.hasCodeAncestor) continue;

      const declared = node.ownLang ?? node.inheritedLang;
      const expected = expectedScriptsForLanguage(declared);
      // No declaration, or a language subtag the map does not know. Both mean we have no
      // expectation, and no expectation is a reason to stay silent, never a reason to report.
      if (expected.length === 0) continue;

      if (expected.includes(node.dominantScript)) continue;

      const census = censusOf(node.scriptRuns);
      const found = countOf(census, node.dominantScript);
      if (found < MINIMUM_GRAPHEMES) continue;
      if (shareOf(census, node.dominantScript) < MINIMUM_DOMINANCE) continue;

      const label = SCRIPT_LABELS[node.dominantScript];
      const expectedLabels = expected.map((script: ScriptId) => SCRIPT_LABELS[script]).join(' or ');
      const share = round(shareOf(census, node.dominantScript) * 100, 0);

      violations.push(
        violationFrom(langScriptMismatch, node, node.dominantScript, {
          whatIsWrong:
            `The nearest declared language is lang="${declared}", which is written in ` +
            `${expectedLabels}, but ${share}% of this text is ${label}.`,
          whyItMatters:
            'A screen reader chooses its voice and its pronunciation rules from the declared ' +
            `language. Handed ${label} text under this language, it applies the wrong phoneme ` +
            'set — the output is not accented, it is unintelligible, and a listener cannot ' +
            'correct for it the way a sighted reader can skim past a wrong font. Translation ' +
            'tools and hyphenation read the same attribute and get the same wrong answer.',
          howToFix:
            `Set lang on this element, or on the nearest block containing it, to the language ` +
            `this text is actually written in. If the language is right and the script is the ` +
            `unusual one, say so explicitly with a BCP-47 script subtag — sr-Latn, zh-Hans, ` +
            'ku-Arab — which this rule accepts as final.',
        }),
      );
    }

    return violations;
  },
};
