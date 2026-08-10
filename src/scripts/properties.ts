/**
 * Per-script typographic requirements.
 *
 * This file is data. It holds no logic on purpose: it is the table that the whole project
 * exists to attach to a linter, and a table you can read top to bottom is worth more than a
 * clever one. Rules import it and decide; they do not ask it to decide for them.
 */

import type { DetectableScript, Threshold } from '../types.js';

export interface ScriptProperties {
  /** Letters join into a connected line, so `letter-spacing` severs words rather than airing them out. */
  readonly isCursive: boolean;
  /** The script has no upper and lower case, so `text-transform` is meaningless at best. */
  readonly isCaseless: boolean;
  /** Written right to left, so physical CSS (`margin-left`, `text-align: left`) is a layout bug. */
  readonly isRtl: boolean;
  /** Marks stack above or below the base letter and clip inside fixed heights. */
  readonly hasStackedMarks: boolean;
  /** No spaces between words, so line breaking needs word segmentation and `break-all` destroys meaning. */
  readonly needsWordSegmentation: boolean;
  /** Minimum line height as a multiple of font size, or `null` where no ratio applies. */
  readonly minLineHeightRatio: Threshold<number> | null;
}

/**
 * The baseline every script inherits.
 *
 * WCAG 2.1 SC 1.4.12 Text Spacing requires content to remain usable when line height is set to
 * 1.5x the font size. That is a real requirement about a real number, which is why it is the
 * one threshold in this file that is not our opinion.
 */
const WCAG_LINE_HEIGHT: Threshold<number> = {
  value: 1.5,
  source: 'wcag-1.4.12',
  note: 'WCAG 2.1 SC 1.4.12 Text Spacing: content must stay usable at line height 1.5x font size.',
};

/**
 * The raised baseline for scripts whose marks stack far above the em box.
 *
 * This is an `estimate` and nothing more. It comes from the observation that Thai, Lao and
 * Khmer stack a vowel and a tone mark above the same base letter, which puts ink well outside
 * the em box, and that 1.5 leaves the upper mark touching the descenders of the line above. We
 * have no standards document that states 1.6. Inventing a citation for it would be worse than
 * having none, so it is labelled for what it is and any rule that uses it is a heuristic.
 */
const STACKED_MARK_LINE_HEIGHT: Threshold<number> = {
  value: 1.6,
  source: 'estimate',
  note: 'Our judgement, derived from stacked-mark height above the em box. Not sourced.',
};

/**
 * The table. Every script GlyphLint can detect appears here — the `Record` over
 * `DetectableScript` makes a missing row a compile error rather than a silent `undefined`.
 */
export const SCRIPT_PROPERTIES: Readonly<Record<DetectableScript, ScriptProperties>> = {
  latin: {
    isCursive: false,
    isCaseless: false,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Arabic, Syriac and N'Ko are the cursive scripts: their letters change shape by position and
  // join into a continuous line. `letter-spacing` does not loosen them, it breaks the joins and
  // renders words as a row of disconnected shapes. This is the project's flagship failure.
  arabic: {
    isCursive: true,
    isCaseless: true,
    isRtl: true,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
  syriac: {
    isCursive: true,
    isCaseless: true,
    isRtl: true,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
  nko: {
    isCursive: true,
    isCaseless: true,
    isRtl: true,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Mongolian is cursive and vertical: it runs top to bottom in columns that advance left to
  // right. `isRtl` is false because it is not a right-to-left script — verticality is a
  // different axis, and the table has no field for it. When a rule needs to know, the field
  // gets added deliberately rather than smuggled in under `isRtl`.
  // `minLineHeightRatio` is null because a line-height ratio describes horizontal lines.
  mongolian: {
    isCursive: true,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: null,
  },

  // Hebrew is right-to-left but not cursive: its letters are disconnected, so letter-spacing
  // does not break it the way it breaks Arabic. Its stacked marks are the niqqud.
  hebrew: {
    isCursive: false,
    isCaseless: true,
    isRtl: true,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
  thaana: {
    isCursive: false,
    isCaseless: true,
    isRtl: true,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Devanagari builds conjunct clusters: consonants fuse into a single glyph that is taller
  // than either part, which is why leading matters more here than the letter count suggests.
  devanagari: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: true,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Thai, Lao and Khmer write without spaces between words and stack marks above the base
  // letter. Both facts matter: `word-break: break-all` can split a word mid-syllable, and a
  // tight line height clips the upper marks.
  thai: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: true,
    needsWordSegmentation: true,
    minLineHeightRatio: STACKED_MARK_LINE_HEIGHT,
  },
  lao: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: true,
    needsWordSegmentation: true,
    minLineHeightRatio: STACKED_MARK_LINE_HEIGHT,
  },
  khmer: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: true,
    needsWordSegmentation: true,
    minLineHeightRatio: STACKED_MARK_LINE_HEIGHT,
  },

  // Han and kana also write without inter-word spaces, but their marks do not stack, so they
  // need segmentation without the raised leading.
  han: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: true,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
  kana: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: true,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Korean does put spaces between words, which is what separates it from Han and kana here.
  hangul: {
    isCursive: false,
    isCaseless: true,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },

  // Cyrillic and Greek are bicameral like Latin: they have case, so `text-transform` is
  // meaningful for them and they carry none of the flags above.
  cyrillic: {
    isCursive: false,
    isCaseless: false,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
  greek: {
    isCursive: false,
    isCaseless: false,
    isRtl: false,
    hasStackedMarks: false,
    needsWordSegmentation: false,
    minLineHeightRatio: WCAG_LINE_HEIGHT,
  },
};

/**
 * Latin text carrying the Vietnamese profile.
 *
 * Vietnamese is not a script and has no row in the table above. It is Latin with one property
 * changed: it stacks two diacritics on a single vowel — a tone mark above a letter that already
 * carries one — and that ink clips inside fixed-height containers where plain Latin would fit.
 *
 * Rules reach for this when `dominantScript(text) === 'latin' && isVietnameseProfile(text)`.
 * See decision 003 in DECISIONS.md.
 */
export const VIETNAMESE_LATIN_PROPERTIES: ScriptProperties = {
  ...SCRIPT_PROPERTIES.latin,
  hasStackedMarks: true,
};
