/*
 * Unicode **blocks** are not **scripts**. Hand-written block ranges are the classic source of
 * detection bugs: Arabic presentation forms live in three separate blocks; the Devanagari
 * danda is shared across Indic scripts; combining marks belong to `Inherited`.
 * `Script_Extensions` resolves shared characters correctly and is maintained by the Unicode
 * Consortium, not by us.
 *
 * Reference: UAX #24 (Script and Script_Extensions), UAX #29 (text segmentation).
 */

import type { DetectableScript, ScriptId, ScriptRun } from '../types.js';

/*
 * Reference only — NOT used for detection.
 *
 * The primary Unicode blocks for each writing system, kept for documentation so a reader can
 * see roughly where a script lives. Detection uses `Script_Extensions` (below) precisely
 * because these ranges are the wrong tool: they are incomplete, they overlap, and they go
 * stale with every Unicode release.
 *
 * | Script     | Primary blocks                                                        |
 * |------------|-----------------------------------------------------------------------|
 * | latin      | U+0041–005A, U+0061–007A, U+00C0–00FF, U+0100–017F, U+0180–024F, U+1E00–1EFF |
 * | arabic     | U+0600–06FF, U+0750–077F, U+0870–089F, U+08A0–08FF, U+FB50–FDFF, U+FE70–FEFF |
 * | hebrew     | U+0590–05FF, U+FB1D–FB4F                                              |
 * | syriac     | U+0700–074F, U+0860–086F                                              |
 * | thaana     | U+0780–07BF                                                           |
 * | nko        | U+07C0–07FF                                                           |
 * | devanagari | U+0900–097F, U+A8E0–A8FF                                              |
 * | thai       | U+0E00–0E7F                                                           |
 * | lao        | U+0E80–0EFF                                                           |
 * | khmer      | U+1780–17FF, U+19E0–19FF                                              |
 * | mongolian  | U+1800–18AF                                                           |
 * | han        | U+4E00–9FFF, U+3400–4DBF, U+F900–FAFF, U+20000–2A6DF                  |
 * | kana       | U+3040–309F, U+30A0–30FF, U+31F0–31FF, U+FF66–FF9D                    |
 * | hangul     | U+AC00–D7A3, U+1100–11FF, U+3130–318F                                 |
 * | cyrillic   | U+0400–04FF, U+0500–052F                                              |
 * | greek      | U+0370–03FF, U+1F00–1FFF                                              |
 */

/**
 * One pattern per writing system we model.
 *
 * None of these carries the `g` flag. A shared global regex keeps `lastIndex` between calls
 * and would make `test()` return alternating answers for the same input — a bug that looks
 * like a Unicode problem and is not one.
 */
const SCRIPT_PATTERNS: ReadonlyArray<readonly [DetectableScript, RegExp]> = [
  ['latin', /\p{Script_Extensions=Latin}/u],
  ['arabic', /\p{Script_Extensions=Arabic}/u],
  ['hebrew', /\p{Script_Extensions=Hebrew}/u],
  ['devanagari', /\p{Script_Extensions=Devanagari}/u],
  ['thai', /\p{Script_Extensions=Thai}/u],
  ['lao', /\p{Script_Extensions=Lao}/u],
  ['khmer', /\p{Script_Extensions=Khmer}/u],
  ['han', /\p{Script_Extensions=Han}/u],
  // Hiragana and Katakana are two Unicode scripts but one writing system for our purposes:
  // Japanese mixes them within a single word, and no rule we will ever write treats them
  // differently. Folding them into one id keeps `dominantScript` from splitting kana text.
  ['kana', /\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}/u],
  ['hangul', /\p{Script_Extensions=Hangul}/u],
  ['cyrillic', /\p{Script_Extensions=Cyrillic}/u],
  ['greek', /\p{Script_Extensions=Greek}/u],
  ['syriac', /\p{Script_Extensions=Syriac}/u],
  ['nko', /\p{Script_Extensions=Nko}/u],
  ['thaana', /\p{Script_Extensions=Thaana}/u],
  ['mongolian', /\p{Script_Extensions=Mongolian}/u],
];

/**
 * The single gate that implements "exclude whitespace, digits, punctuation, and anything
 * resolving to Common or Inherited".
 *
 * Restricting to letters is not a shortcut, it is the correction. Measured against the whole
 * of Unicode: the Arabic-Indic digit U+0669 matches both Arabic and Thaana, the Devanagari
 * danda U+0964 matches Devanagari, and the combining acute U+0301 matches Latin, Cyrillic and
 * Greek at once. None of the three tells you what writing system the text is in, and all
 * three would skew the count. None of them is a letter.
 */
const LETTER = /\p{L}/u;

/**
 * Grapheme boundaries are locale-independent under UAX #29. The locale is pinned to `en` only
 * so that results cannot drift with the host machine's default locale — a linter that gives
 * different answers on two computers is not a linter.
 */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Vietnamese is written in Latin script. It is not a `ScriptId`, and modelling it as one
 * would be factually wrong — see decision 003 in DECISIONS.md.
 *
 * The pattern is deliberately narrow: it looks for the letters Vietnamese does not share with
 * other Latin-script languages (the stacked-diacritic range U+1EA0–U+1EF9, plus the seven
 * letters with their own base forms). Plain `á` or `è` are not listed, because Spanish and
 * French have them too and they would turn every European page into a Vietnamese one.
 *
 * The range is written as escapes rather than literal characters so that the boundaries stay
 * readable and cannot be altered by an editor normalising the file.
 */
const VIETNAMESE_PROFILE = /[\u1EA0-\u1EF9ăâêôơưđĂÂÊÔƠƯĐ]/u;

/** One grapheme, with the writing system it was resolved to. */
interface ClassifiedGrapheme {
  readonly script: ScriptId;
  readonly start: number;
  readonly text: string;
}

/**
 * The base letter of a grapheme cluster, or `null` if the cluster contains none.
 *
 * Classification has to happen on the base letter, not on the whole cluster. `e` followed by a
 * combining acute is one grapheme; testing the cluster as a whole would match Cyrillic and
 * Greek as well, because the accent is shared, and the letter would come out ambiguous when it
 * is plainly Latin.
 */
function baseLetterOf(grapheme: string): string | null {
  for (const codePoint of grapheme) {
    if (LETTER.test(codePoint)) return codePoint;
  }
  return null;
}

/**
 * Resolve one grapheme to a writing system.
 *
 * `previous` is the last writing system resolved in this text, and it only matters for the
 * four code points in all of Unicode that carry more than one of our scripts: U+02BC, U+0640
 * ARABIC TATWEEL, U+303C MASU MARK and U+FDF2. The tatweel is the reason this argument exists
 * — it is the Arabic justification stretch, it sits *inside* words, and resolving it to
 * `unknown` would cut Arabic words in half in the middle of the run list.
 */
function scriptOfGrapheme(grapheme: string, previous: DetectableScript | null): ScriptId {
  const base = baseLetterOf(grapheme);
  if (base === null) return 'common';

  const matches: DetectableScript[] = [];
  for (const [id, pattern] of SCRIPT_PATTERNS) {
    if (pattern.test(base)) matches.push(id);
  }

  const first = matches[0];
  if (first === undefined) {
    // A letter belonging to a script we do not model — Bengali, Armenian, Tamil, Ge'ez and
    // roughly 26,000 others. Saying `unknown` is honest; saying `common` would claim the text
    // has no writing system at all.
    return 'unknown';
  }
  if (matches.length === 1) return first;
  if (previous !== null && matches.includes(previous)) return previous;
  return 'unknown';
}

/** Resolve every grapheme in `text`, left to right, carrying context forward. */
function classifyGraphemes(text: string): ClassifiedGrapheme[] {
  const classified: ClassifiedGrapheme[] = [];
  let previous: DetectableScript | null = null;

  for (const { segment, index } of GRAPHEMES.segment(text)) {
    const script = scriptOfGrapheme(segment, previous);
    if (script !== 'common' && script !== 'unknown') previous = script;
    classified.push({ script, start: index, text: segment });
  }

  return classified;
}

/**
 * The writing system most of `text` is written in.
 *
 * Counting is per grapheme, so a Devanagari conjunct or an accented Latin letter counts once
 * rather than once per code point. Graphemes carrying no letter are not counted at all.
 *
 * Returns `common` when the text has no letters — empty strings, digits, punctuation, emoji.
 * Returns `unknown` when it has letters but none from a script we model; a page written
 * entirely in Bengali is not a page with no writing system, and reporting it as `common`
 * would hide exactly the kind of text this project exists to notice.
 *
 * Ties are broken by first appearance in the text, so the answer is stable.
 */
export function dominantScript(text: string): ScriptId {
  const counts = new Map<ScriptId, number>();
  const order: ScriptId[] = [];

  for (const grapheme of classifyGraphemes(text)) {
    if (grapheme.script === 'common') continue;
    const seen = counts.get(grapheme.script);
    if (seen === undefined) order.push(grapheme.script);
    counts.set(grapheme.script, (seen ?? 0) + 1);
  }

  let winner: ScriptId = 'common';
  let best = 0;
  for (const script of order) {
    const count = counts.get(script) ?? 0;
    if (count > best) {
      best = count;
      winner = script;
    }
  }

  return winner;
}

/**
 * Split `text` into contiguous runs of one writing system.
 *
 * Non-letters form their own `common` runs rather than being folded into a neighbour, so the
 * mapping from text to runs is mechanical and reversible: concatenating every `run.text`
 * reproduces the input exactly, and `text.slice(run.start, run.start + run.length)` reproduces
 * each run.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];

  for (const grapheme of classifyGraphemes(text)) {
    const open = runs[runs.length - 1];
    if (open !== undefined && open.script === grapheme.script) {
      open.text += grapheme.text;
      open.length = open.text.length;
      continue;
    }
    runs.push({
      script: grapheme.script,
      text: grapheme.text,
      length: grapheme.text.length,
      start: grapheme.start,
    });
  }

  return runs;
}

/**
 * Whether `text` shows the Vietnamese profile: Latin script carrying the stacked diacritics
 * that clip inside fixed-height containers.
 *
 * This is a profile flag, never a script. Rules that care about it test
 * `dominantScript(text) === 'latin' && isVietnameseProfile(text)`.
 */
export function isVietnameseProfile(text: string): boolean {
  return VIETNAMESE_PROFILE.test(text);
}
