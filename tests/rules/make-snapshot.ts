/**
 * Snapshot builders for the rule tests.
 *
 * Rules are pure functions of `DomSnapshot`, so their tests need no browser — but that freedom
 * comes with a trap. A hand-written snapshot can hold values Chromium would never produce, and a
 * rule tested against fiction is green here and broken on a real page.
 *
 * Two things guard against that. The defaults below were **measured** in Chromium rather than
 * assumed: computed `letter-spacing` and `line-height` are `normal` or a pixel length and nothing
 * else, `text-align` computes to `start`, `transform` to `none`, and a `<p>` inherits
 * `unicode-bidi: isolate` from the browser's own stylesheet. And `dominantScript`, `scriptRuns`
 * and `isVietnameseProfile` are derived from the text by the real detection code, so a test can
 * never claim text is Arabic when it is not.
 *
 * The end-to-end check that these defaults still match a real browser lives in
 * `tests/scanner/rules-on-fixtures.test.ts`.
 */

import { dominantScript, isVietnameseProfile, scriptRuns } from '../../src/scripts/detect.js';
import type {
  DomSnapshot,
  FontProbe,
  TextNodeBox,
  TextNodeCss,
  TextNodeSnapshot,
} from '../../src/types.js';

/** What Chromium computes for a plain `<p>` of 16px text in a 1280px viewport. */
const DEFAULT_CSS: TextNodeCss = {
  letterSpacing: 'normal',
  lineHeight: 'normal',
  fontSize: '16px',
  fontFamily: 'Arial, sans-serif',
  textAlign: 'start',
  textTransform: 'none',
  direction: 'ltr',
  writingMode: 'horizontal-tb',
  transform: 'none',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  hyphens: 'manual',
  overflowX: 'visible',
  overflowY: 'visible',
  height: '18px',
  webkitLineClamp: 'none',
  marginLeft: '0px',
  marginRight: '0px',
  paddingLeft: '0px',
  paddingRight: '0px',
};

const DEFAULT_BOX: TextNodeBox = {
  clientHeight: 18,
  scrollHeight: 18,
  clientWidth: 1264,
  scrollWidth: 1264,
};

/** A stack that is doing its job: the neutral default, so no rule fires without being asked to. */
const DEFAULT_FONT_PROBE: FontProbe = {
  declaredStack: ['Arial', 'sans-serif'],
  renderedFamily: 'Arial',
  fallbackSuspected: false,
};

export interface NodeOverrides
  extends Partial<Omit<TextNodeSnapshot, 'css' | 'box' | 'fontProbe' | 'text'>> {
  css?: Partial<TextNodeCss>;
  box?: Partial<TextNodeBox>;
  fontProbe?: Partial<FontProbe>;
}

/**
 * One text node.
 *
 * The writing-system fields are computed from `text` and cannot be overridden, which is the point:
 * every test then argues about CSS, never about what script its own sample is in.
 */
export function textNode(text: string, overrides: NodeOverrides = {}): TextNodeSnapshot {
  const { css, box, fontProbe, ...rest } = overrides;

  return {
    selector: 'html > body > p',
    ownLang: null,
    inheritedLang: null,
    ownDir: null,
    inheritedDir: null,
    computedDirection: 'ltr',
    ancestorHasDirRtl: false,
    classNames: [],
    tagName: 'P',
    hasBdiAncestor: false,
    hasCodeAncestor: false,
    hasTransformedAncestor: false,
    // Chromium's UA stylesheet puts `unicode-bidi: isolate` on block elements, so this is the
    // value a rule meets on an ordinary paragraph — not `normal`.
    unicodeBidi: 'isolate',
    ...rest,
    text,
    dominantScript: dominantScript(text),
    scriptRuns: scriptRuns(text),
    isVietnameseProfile: isVietnameseProfile(text),
    css: { ...DEFAULT_CSS, ...css },
    box: { ...DEFAULT_BOX, ...box },
    fontProbe: { ...DEFAULT_FONT_PROBE, ...fontProbe },
  };
}

/** A snapshot wrapping the given nodes, with plausible page-level values around them. */
export function snapshotOf(nodes: TextNodeSnapshot[]): DomSnapshot {
  return {
    snapshotVersion: 3,
    url: 'http://127.0.0.1/test',
    finalUrl: 'http://127.0.0.1/test',
    capturedAt: '2026-08-10T00:00:00.000Z',
    viewport: { width: 1280, height: 800 },
    documentLang: null,
    documentDir: null,
    nodes,
    truncated: false,
  };
}

/** The common case: one node, one snapshot. */
export function snapshotOfOne(text: string, overrides: NodeOverrides = {}): DomSnapshot {
  return snapshotOf([textNode(text, overrides)]);
}

/**
 * Text samples used across the rule tests.
 *
 * Real text in real writing systems, because a script-aware linter cannot be tested without it —
 * see CLAUDE.md. The strings are data; every identifier and comment around them stays English.
 *
 * The words are the ones already vetted in the `SAMPLES` table of `tests/scripts/detect.test.ts`.
 * Where a rule needs more text than one word — to clear a grapheme threshold, or to fill more
 * than one line — the sample is several of those words joined, rather than a new sentence written
 * by somebody who does not read the language.
 */
export const SAMPLES = {
  arabic: 'مرحبا',
  arabicLong: 'مرحبا السلام كتاب مرحبا السلام كتاب',
  syriac: 'ܫܠܡܐ',
  nko: 'ߒߞߏ',
  mongolian: 'ᠮᠣᠩᠭᠣᠯ',
  hebrew: 'שלום',
  hebrewLong: 'שלום עולם ספר שלום עולם ספר',
  // A Latin run sandwiched between Arabic runs and followed by a full stop. The full stop is the
  // point: it is directionally neutral, so the bidirectional algorithm has to choose a side for it.
  arabicWithLatinAndPunctuation: 'مرحبا السلام Acme Corp. كتاب مرحبا',
  // The same shape without any neutral character beside the Latin run. This one renders correctly
  // and must never be reported.
  arabicWithBareLatin: 'مرحبا السلام Acme كتاب مرحبا',
  thai: 'สวัสดี',
  thaiLong: 'สวัสดี ภาษาไทย ขอบคุณ สวัสดี ภาษาไทย ขอบคุณ',
  devanagari: 'नमस्ते',
  han: '你好',
  hanLong: '中文 你好 汉字 中文 你好 汉字 中文 你好 汉字 中文 你好 汉字',
  hangul: '안녕하세요',
  greek: 'Ελληνικά',
  cyrillic: 'Привет',
  latin: 'Hello world',
  latinLong: 'Hello world Bonjour Hello world Bonjour',
  vietnamese: 'Tiếng Việt xin chào',
  vietnameseLong: 'Tiếng Việt xin chào Tiếng Việt xin chào',
  digits: '2024 15%',
  bengali: 'বাংলা',
} as const;
