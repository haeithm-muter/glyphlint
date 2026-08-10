/**
 * Shared, pure helpers for the rule layer.
 *
 * Everything here is a function of its arguments. No network, no browser, no clock, no shared
 * mutable state — the `Intl.Segmenter` below is an immutable formatter, not state, and it is
 * created once for the same reason `detect.ts` does it: a segmenter is stateless between calls,
 * unlike a global regex, which keeps `lastIndex` and would answer differently each time.
 *
 * The rules themselves hold the judgement. This file holds only the arithmetic they share, so
 * that "15 graphemes" means exactly the same thing in every rule that says it.
 */

import {
  SCRIPT_PROPERTIES,
  VIETNAMESE_LATIN_PROPERTIES,
  type ScriptProperties,
} from '../scripts/properties.js';
import type {
  DetectableScript,
  Rule,
  ScriptId,
  ScriptRun,
  TextNodeSnapshot,
  Violation,
} from '../types.js';

/**
 * Locale pinned to `en` for the same reason as in `detect.ts`: grapheme boundaries are
 * locale-independent under UAX #29, and pinning stops results drifting with the host machine.
 */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Names fit for a report sentence. A reader should never meet our internal ids. */
export const SCRIPT_LABELS: Readonly<Record<ScriptId, string>> = {
  latin: 'Latin',
  arabic: 'Arabic',
  hebrew: 'Hebrew',
  devanagari: 'Devanagari',
  thai: 'Thai',
  lao: 'Lao',
  khmer: 'Khmer',
  han: 'Han',
  kana: 'Kana',
  hangul: 'Hangul',
  cyrillic: 'Cyrillic',
  greek: 'Greek',
  syriac: 'Syriac',
  nko: "N'Ko",
  thaana: 'Thaana',
  mongolian: 'Mongolian',
  common: 'text with no writing system',
  unknown: 'a writing system GlyphLint does not model',
};

/**
 * A computed CSS length in pixels, or `null` when the value is not a length.
 *
 * Computed lengths always arrive in pixels — `letter-spacing: 0.12em` on a 16px font is reported
 * by the browser as `1.92px`, and `line-height: 1.1` as `17.6px`. Anything that does not end in
 * `px` is a keyword such as `normal` or `auto`, and a keyword is not a small number: it is the
 * absence of one. Rules must decide what to do about that themselves rather than being handed a
 * zero that silently reads as "no spacing".
 */
export function pixelLength(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.endsWith('px')) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** How many user-perceived characters `text` holds. */
export function countGraphemes(text: string): number {
  return [...GRAPHEMES.segment(text)].length;
}

/**
 * How much text a node holds, per writing system, counted in graphemes.
 *
 * Graphemes rather than code units, because every threshold in the rules is about how much text a
 * human sees: a Devanagari conjunct or an accented Latin letter is one character to a reader and
 * two or three to `String.length`.
 *
 * `lettered` counts every grapheme carrying a letter, and that deliberately includes `unknown` —
 * letters of a script we do not model are still letters on the page. Dropping them would let a
 * paragraph that is half Arabic and half Bengali read as "100% Arabic" and push a rule over a
 * threshold on the strength of text we admit we cannot analyse.
 */
export interface ScriptCensus {
  readonly lettered: number;
  readonly counts: ReadonlyMap<ScriptId, number>;
}

export function censusOf(runs: readonly ScriptRun[]): ScriptCensus {
  const counts = new Map<ScriptId, number>();
  let lettered = 0;

  for (const run of runs) {
    if (run.script === 'common') continue;
    const size = countGraphemes(run.text);
    counts.set(run.script, (counts.get(run.script) ?? 0) + size);
    lettered += size;
  }

  return { lettered, counts };
}

/** Graphemes of one writing system in a node. */
export function countOf(census: ScriptCensus, script: ScriptId): number {
  return census.counts.get(script) ?? 0;
}

/** What fraction of the lettered text is in one writing system, `0` when there is no text. */
export function shareOf(census: ScriptCensus, script: ScriptId): number {
  if (census.lettered === 0) return 0;
  return countOf(census, script) / census.lettered;
}

/**
 * The typographic requirements that apply to a node, or `null` when none do.
 *
 * `null` covers the two outcomes that are not writing systems: `common` (digits, punctuation,
 * symbols — no script has an opinion about them) and `unknown` (letters from a script we do not
 * model, where staying silent is the honest answer). Every rule starts here, which is what stops
 * a rule firing on a node consisting of `2024` or `→`.
 *
 * Latin carrying the Vietnamese profile resolves to its own row: same script, one property
 * different. See decision 003.
 */
export function propertiesFor(node: TextNodeSnapshot): ScriptProperties | null {
  const script = node.dominantScript;
  if (script === 'common' || script === 'unknown') return null;
  if (script === 'latin' && node.isVietnameseProfile) return VIETNAMESE_LATIN_PROPERTIES;
  return SCRIPT_PROPERTIES[script];
}

/**
 * Every writing system whose properties satisfy `predicate`, sorted.
 *
 * Rules declare `affectedScripts` through this rather than by hand. A hand-written list is a
 * second copy of the rule's own condition, and the day the two disagree the report starts
 * describing a rule that no longer exists.
 */
export function scriptsWhere(predicate: (properties: ScriptProperties) => boolean): ScriptId[] {
  const all = Object.keys(SCRIPT_PROPERTIES) as DetectableScript[];
  return all.filter((script) => predicate(SCRIPT_PROPERTIES[script])).sort();
}

/** Enough of the offending text to recognise it, without turning the report into the page. */
const SNIPPET_GRAPHEMES = 60;

/**
 * A short excerpt of the offending text.
 *
 * Cut on grapheme boundaries, never on code units. A tool that exists to take writing systems
 * seriously does not get to slice a Devanagari cluster or a Thai syllable in half on its way into
 * the report. Whitespace is collapsed so a snippet taken from a wrapped paragraph stays one line.
 */
export function snippetOf(text: string): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim();
  const graphemes = [...GRAPHEMES.segment(collapsed)].map((entry) => entry.segment);
  if (graphemes.length <= SNIPPET_GRAPHEMES) return collapsed;
  return `${graphemes.slice(0, SNIPPET_GRAPHEMES).join('')}…`;
}

/** The three sentences every rule owes the reader, plus the citation if it has an honest one. */
export interface ViolationMessages {
  whatIsWrong: string;
  whyItMatters: string;
  howToFix: string;
  wcagRef?: string;
}

/**
 * Build a finding from the rule that produced it.
 *
 * The rule's own metadata is copied across rather than restated, so a violation can never claim a
 * severity or a confidence its rule does not declare.
 *
 * `wcagRef` is not inherited from the rule on purpose. A rule can relate to a criterion in general
 * while a particular finding falls outside what that criterion actually requires — see
 * `insufficient-line-height-for-script`, which cites the criterion only when the measured value
 * breaches the number the criterion names.
 */
export function violationFrom(
  rule: Rule,
  node: TextNodeSnapshot,
  script: ScriptId,
  messages: ViolationMessages,
): Violation {
  const violation: Violation = {
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    confidence: rule.confidence,
    source: 'glyphlint',
    script,
    selector: node.selector,
    snippet: snippetOf(node.text),
    whatIsWrong: messages.whatIsWrong,
    whyItMatters: messages.whyItMatters,
    howToFix: messages.howToFix,
  };

  if (messages.wcagRef !== undefined) violation.wcagRef = messages.wcagRef;
  return violation;
}

/** Format a measured number for a report sentence: `1.92`, not `1.9199999999999999`. */
export function round(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace(/\.?0+$/u, '');
}
