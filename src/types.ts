/**
 * The shared type contract.
 *
 * Everything downstream — rules, reports, the campaign runner — agrees on the shapes in
 * this file. Snapshot types are added in the scanner stage; what is here now is the
 * vocabulary the writing-system layer speaks.
 */

/**
 * A writing system GlyphLint can name.
 *
 * `common` and `unknown` are outcomes rather than writing systems: `common` means the text
 * carries no letters at all (digits, punctuation, symbols, whitespace), and `unknown` means
 * it carries letters belonging to a script this table does not model.
 *
 * Vietnamese is deliberately absent. It is written in Latin script with heavy stacked
 * diacritics, so it is modelled as a profile flag on Latin, not as a script. See
 * `isVietnameseProfile` in `scripts/detect.ts` and decision 003 in DECISIONS.md.
 */
export type ScriptId =
  | 'latin'
  | 'arabic'
  | 'hebrew'
  | 'devanagari'
  | 'thai'
  | 'lao'
  | 'khmer'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'cyrillic'
  | 'greek'
  | 'syriac'
  | 'nko'
  | 'thaana'
  | 'mongolian'
  | 'common'
  | 'unknown';

/** A writing system that names an actual script, excluding the two outcome values. */
export type DetectableScript = Exclude<ScriptId, 'common' | 'unknown'>;

/**
 * A contiguous stretch of text in a single writing system.
 *
 * `start` and `length` are UTF-16 offsets into the string the run was extracted from, so
 * `source.slice(run.start, run.start + run.length) === run.text` always holds. The
 * redundancy with `text` is intentional: it makes the contract checkable in a test.
 */
export interface ScriptRun {
  script: ScriptId;
  text: string;
  length: number;
  start: number;
}

/**
 * Where a threshold came from. A threshold with no source is the most dangerous thing in a
 * linter, so the type makes it impossible to write one.
 *
 * - `wcag-1.4.12` — WCAG 2.1 SC 1.4.12 Text Spacing. A real, citable requirement.
 * - `w3c-layout-req` — a W3C i18n layout requirements document (ALREQ, HLREQ, JLREQ, CLREQ).
 *   The specific document must be named in `note`.
 * - `estimate` — our judgement, not sourced. Honest, and never dressed up as anything else.
 */
export type ThresholdSource = 'wcag-1.4.12' | 'w3c-layout-req' | 'estimate';

/** A value that a rule may compare against, carrying its provenance. */
export interface Threshold<T> {
  readonly value: T;
  readonly source: ThresholdSource;
  readonly note?: string;
}

/**
 * The computed CSS a rule is allowed to reason about.
 *
 * Every value is the *computed* string as the browser resolved it, not what the stylesheet
 * said. A stylesheet can say `letter-spacing: 0.1em` in one place and be overridden three
 * cascades later; only the computed value tells you what the reader actually sees.
 */
export interface TextNodeCss {
  letterSpacing: string;
  lineHeight: string;
  fontSize: string;
  fontFamily: string;
  textAlign: string;
  textTransform: string;
  direction: string;
  writingMode: string;
  /**
   * How an icon has been rotated or flipped. An RTL layout mirrors arrows with `scaleX(-1)` or a
   * rotation, so this is the only evidence in the snapshot that a directional glyph was handled.
   *
   * Measured, not assumed: the computed value is a resolved matrix, never the function the
   * author wrote. `scaleX(-1)` arrives as `matrix(-1, 0, 0, 1, 0, 0)`. A rule that searches this
   * string for `scaleX` finds nothing on a page that mirrors every icon correctly.
   */
  transform: string;
  wordBreak: string;
  overflowWrap: string;
  hyphens: string;
  overflowX: string;
  overflowY: string;
  /**
   * The used height. For any element that generates a box this is a pixel length whether or not
   * the author set one, so it cannot answer "did the author constrain this box?" — see decision
   * 009. `auto` survives only on non-replaced inline elements, where it says as little.
   */
  height: string;
  /** `none`, or the number of lines a clamp allows. The other way a box cuts text off. */
  webkitLineClamp: string;
  marginLeft: string;
  marginRight: string;
  paddingLeft: string;
  paddingRight: string;
}

/** Box metrics, enough to tell whether text is being clipped by its container. */
export interface TextNodeBox {
  clientHeight: number;
  scrollHeight: number;
  clientWidth: number;
  scrollWidth: number;
}

/**
 * What we could learn about the font actually being used.
 *
 * The computed `font-family` is the *declared stack*, not the font the browser picked from it.
 * A page can declare a beautiful Thai font it never loaded, and `getComputedStyle` will report
 * it either way. So the stack is measured against a family that deliberately does not exist:
 * if the widths match, the declared stack is contributing nothing.
 *
 * `fallbackSuspected` is named for what it is. The measurement cannot distinguish "the stack
 * failed" from "the stack resolved to the browser's default font anyway" — see decision 005.
 */
export interface FontProbe {
  declaredStack: string[];
  renderedFamily: string | null;
  fallbackSuspected: boolean;
}

/**
 * One visible run of text, with everything a rule could need to judge it.
 *
 * This is the hard contract. Rules read these fields and nothing else — no DOM, no network, no
 * browser handle. If a rule needs something that is not here, the fix is to add it here, extend
 * the capture code, and bump `DomSnapshot.snapshotVersion`.
 */
export interface TextNodeSnapshot {
  /** CSS path of the element containing the text. Repeats if one element holds several text nodes. */
  selector: string;
  /** Trimmed, and capped at 500 characters. */
  text: string;
  dominantScript: ScriptId;
  scriptRuns: ScriptRun[];
  isVietnameseProfile: boolean;
  /** The `lang` attribute on the containing element itself, if it set one. */
  ownLang: string | null;
  /** The `lang` in force from the nearest ancestor that declared one. */
  inheritedLang: string | null;
  ownDir: string | null;
  /**
   * The `dir` in force from the nearest ancestor that declared one, whatever its value.
   *
   * Distinct from `ancestorHasDirRtl`, which sees only `rtl`. The difference decides a real false
   * positive: `dir="auto"` is the correct way to mark up text whose direction is not known in
   * advance, and a rule that could see only `rtl` would report a page that had done exactly the
   * right thing.
   */
  inheritedDir: string | null;
  computedDirection: 'ltr' | 'rtl';
  ancestorHasDirRtl: boolean;
  css: TextNodeCss;
  box: TextNodeBox;
  fontProbe: FontProbe;
  classNames: string[];
  tagName: string;
  hasBdiAncestor: boolean;
  /**
   * Inside `code`, `pre`, `kbd` or `samp`.
   *
   * The tag name alone is not enough. A syntax-highlighted block is `pre > span.token`, so the
   * element holding the text is a `span` and the only evidence that it is code lives further up.
   */
  hasCodeAncestor: boolean;
  /**
   * Some ancestor carries a transform of its own.
   *
   * Icon systems mirror by putting `[dir="rtl"] .icon { transform: … }` on a wrapper, so a glyph
   * that has been handled correctly can show `transform: none` on its own element.
   */
  hasTransformedAncestor: boolean;
  unicodeBidi: string;
}

/** Everything captured from one page, in one pass. */
export interface DomSnapshot {
  /** Bumped whenever `TextNodeSnapshot` gains or changes a field. */
  snapshotVersion: 3;
  url: string;
  finalUrl: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  documentLang: string | null;
  documentDir: string | null;
  /** Capped at 3000 entries. */
  nodes: TextNodeSnapshot[];
  truncated: boolean;
}

/**
 * How badly a finding hurts the reader.
 *
 * The four names are axe-core's, deliberately. A report that puts our findings beside axe's has
 * to grade them on the same scale, or the two halves cannot be read together.
 */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

/**
 * How much we trust the finding itself.
 *
 * This is the field that keeps the project honest. `high` means the condition is decidable from
 * the snapshot and we are not guessing. `heuristic` means we are inferring from evidence that
 * can be wrong, and the report must show it as such rather than burying it in a total.
 */
export type Confidence = 'high' | 'medium' | 'heuristic';

/**
 * One finding from our own rule layer.
 *
 * `source` is a literal rather than a free string so that a script-aware finding can never be
 * mistaken for an axe-core one — the separation between the two is the claim the project makes.
 *
 * The three message fields are separate on purpose. A single blob of prose invites a rule author
 * to describe the CSS and stop; forcing `whyItMatters` to be its own sentence forces every rule to
 * say what the defect does *to the reader of that particular writing system*.
 */
export interface Violation {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  source: 'glyphlint';
  script: ScriptId;
  selector: string;
  snippet: string;
  whatIsWrong: string;
  whyItMatters: string;
  howToFix: string;
  wcagRef?: string;
}

/**
 * A script-aware rule.
 *
 * `check` is a pure function of the snapshot: no network, no browser, no clock, no shared state.
 * The whole engine runs in milliseconds without launching anything, which is what makes a rule
 * cheap enough to argue with. A rule that appears to need a browser value is a signal to extend
 * `TextNodeSnapshot` and bump `DomSnapshot.snapshotVersion`, never to make the rule impure.
 *
 * `limitations` is rendered verbatim in the report. It is not documentation of the code, it is
 * the sentence that tells a reader when not to believe this rule.
 */
export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedScripts: ScriptId[] | 'all';
  description: string;
  limitations: string;
  wcagRef?: string;
  check(snapshot: DomSnapshot): Violation[];
}

/**
 * Why a scan produced nothing.
 *
 * Every kind gets its own sentence written for a human being. A stack trace is never an
 * acceptable user-facing output; when we have one it goes in `detail`, which the CLI does not
 * print by default.
 */
export type ScanErrorKind =
  | 'dns-failure'
  | 'unreachable-host'
  | 'timeout'
  | 'invalid-ssl'
  | 'redirect-loop'
  | 'empty-body'
  | 'non-html-content'
  /**
   * Chromium refuses to open well-known ports such as 22 or 25 (`ERR_UNSAFE_PORT`). Beyond the
   * conditions the specification lists, and kept because the alternative was answering a real
   * failure with "look in the detail field" — which is the thing the error handling exists to
   * prevent. Folding it into `unreachable-host` would have blamed the server for a decision the
   * browser made.
   */
  | 'blocked-port'
  | 'unknown';

export interface ScanError {
  kind: ScanErrorKind;
  message: string;
  detail?: string;
}

export interface ScanOptions {
  /** Hard limit on page load. Defaults to 20000. */
  timeoutMs?: number;
  viewport?: { width: number; height: number };
  /** When set, a full-page screenshot is written here. Omitted means no file is written. */
  screenshotPath?: string;
  /** Defaults to 3000. */
  maxNodes?: number;
  /** Defaults to 500. */
  maxTextLength?: number;
}

/**
 * Text GlyphLint found but cannot analyse.
 *
 * The script layer models sixteen writing systems. Roughly 26,000 Unicode letters fall outside
 * them — Bengali, Tamil, Telugu, Amharic, Georgian, Armenian, Sinhala, Burmese, Tibetan and
 * more. On a page written in one of those, every rule stays quiet and the result would
 * otherwise look identical to a clean page.
 *
 * That silence is exactly the failure this project accuses other tools of, so it is reported
 * instead of hidden. We cannot name the writing system, because naming it would mean modelling
 * it; a sample of the text lets a human identify in a second what we are missing.
 *
 * See decision 007 for the list of what is and is not supported.
 */
export interface UnsupportedScriptReport {
  /** Text nodes containing at least one run GlyphLint could not attribute to a script. */
  nodeCount: number;
  /** Short excerpts of that text, so the gap is legible rather than statistical. */
  samples: string[];
}

/**
 * The result of one scan.
 *
 * `standard` is axe-core's own output, passed through untouched and labelled as axe's.
 * `scriptAware` is ours. Keeping them in separate fields is not a formatting choice — it is the
 * claim the whole project rests on, and it has to survive every refactor.
 */
export interface ScanResult {
  url: string;
  finalUrl: string;
  scannedAt: string;
  durationMs: number;
  /** axe-core, unmodified: violations verbatim, passes counted. */
  standard: { violations: unknown[]; passes: number };
  /** Ours. Empty until the rule layer exists. */
  scriptAware: { violations: unknown[] };
  scriptsDetected: Partial<Record<ScriptId, number>>;
  /**
   * The captured page. Absent when the scan failed.
   *
   * Not listed in the original data model, and added deliberately — see decision 006. Without
   * it the snapshot the scanner exists to produce would have nowhere to go, and the rule layer
   * would receive nothing to read.
   */
  snapshot?: DomSnapshot;
  /**
   * Present only when the page contained text in a writing system GlyphLint does not model.
   * Its presence is the signal: absent means nothing was skipped for that reason.
   */
  unsupportedScript?: UnsupportedScriptReport;
  screenshotPath?: string;
  error?: ScanError;
}
