/**
 * The HTML report: one file, no external resources, no JavaScript.
 *
 * Three constraints shape everything here, and each of them is a requirement rather than a taste.
 *
 * 1. **Self-contained.** All CSS is inlined and nothing is fetched — no font, no stylesheet, no
 *    image, no script. A report that phones home is a report a site owner cannot open on a
 *    machine that has no network, and one that quietly makes requests on their behalf.
 * 2. **The two sections never merge.** axe-core's findings appear in axe's own words, under a
 *    heading that says whose they are, with a link to axe's documentation. Ours appear separately.
 *    There is no combined total in this file, because a combined total is how a project starts
 *    taking credit for another project's work.
 * 3. **It has to pass its own audit.** Everything a rule of ours reads is set deliberately here:
 *    the leading, the absence of `word-break: break-all`, the absence of clipping overflow, the
 *    logical properties, the isolation around quoted text. `tests/scanner/report-self-audit.test.ts`
 *    scans the output of this file and fails if any of it slips.
 */

import type { Confidence, ScriptId, Severity } from '../types.js';
import {
  DISCLAIMER,
  SEVERITIES,
  type ReportModel,
  type ScriptAwareGroup,
  type SeverityCounts,
  type StandardGroup,
} from './model.js';

export interface HtmlReportOptions {
  /**
   * Direction of the report document itself.
   *
   * The report chrome is English and reads left to right, so `ltr` is the default. The option
   * exists because the brief requires the report to render correctly in a right-to-left context
   * too, and the only way to keep that true is to be able to produce that version and scan it —
   * which `report-self-audit.test.ts` does. Nothing in the stylesheet is physical, so the flip
   * costs nothing beyond this attribute.
   */
  documentDir?: 'ltr' | 'rtl';
}

/**
 * Escape text for HTML.
 *
 * Every string in this report came from somebody else's page: their text, their selectors, their
 * markup. All five characters are escaped, including quotes, because the same function is used
 * inside attribute values.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/**
 * axe's element selector, flattened into something printable.
 *
 * axe describes a target as an array, and nests it further for shadow roots and frames. We do not
 * model that structure, so it is flattened and joined rather than interpreted — printing what axe
 * said without claiming to understand where it points.
 */
function flattenTarget(target: unknown): string {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.map(flattenTarget).filter((part) => part !== '').join(' ');
  return '';
}

/** A short human label for a severity, or for the absence of one. */
function severityLabel(severity: Severity | null): string {
  return severity === null ? 'not graded' : severity;
}

const CONFIDENCE_NOTE: Readonly<Record<Confidence, string>> = {
  high: 'The condition is decidable from what was captured; this is an observation, not a guess.',
  medium: 'The condition is clear, but the judgement around it can be wrong on an unusual page.',
  heuristic:
    'This is an inference from evidence that can be wrong. Check it against the page before ' +
    'acting on it.',
};

/**
 * Quoted text from the scanned page.
 *
 * Three things happen to every excerpt, and each one is the markup this project spends its rules
 * arguing for.
 *
 * - `<bdi>` isolates it, so an Arabic excerpt cannot reorder the English sentence around it or
 *   drag our punctuation to the wrong end of the line.
 * - `dir="auto"` lets the browser take the direction from the text itself. We know the excerpt's
 *   *script*, which is not the same as knowing its direction, and guessing would be the kind of
 *   claim this tool exists to complain about.
 * - `<samp>` marks it as sample output rather than prose. It is also what keeps
 *   `lang-script-mismatch` from reporting our own report: the excerpt is Arabic text inside an
 *   English document, and the honest reason it is not a mismatch is that it is quoted data, not
 *   language. Labelling it `lang="ar"` would be a guess — Arabic script carries Persian and Urdu
 *   too — and inventing that attribute to silence a rule would be worse than the finding.
 */
function quotedText(text: string, className: string): string {
  return `<bdi dir="auto"><samp class="${className}">${escapeHtml(text)}</samp></bdi>`;
}

function badge(text: string, className: string): string {
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

/** The severity table for one layer. Never merged with the other one's. */
function countsTable(counts: SeverityCounts, caption: string): string {
  const rows = SEVERITIES.map(
    (severity) =>
      `<tr><th scope="row">${escapeHtml(severity)}</th><td>${counts[severity]}</td></tr>`,
  );

  // Only shown when it happened: axe leaves `impact` off for some failures, and a row of zeros
  // for a state our own findings can never be in is noise.
  if (counts.ungraded > 0) {
    rows.push(`<tr><th scope="row">not graded</th><td>${counts.ungraded}</td></tr>`);
  }

  // A `<caption>` already names its table for assistive technology; nothing extra is wired up.
  return `<table class="counts">
  <caption>${escapeHtml(caption)}</caption>
  <tbody>
${rows.join('\n')}
  <tr class="total"><th scope="row">total</th><td>${counts.total}</td></tr>
  </tbody>
</table>`;
}

function scriptTable(
  entries: { script: ScriptId; label: string; count: number }[],
  caption: string,
): string {
  if (entries.length === 0) {
    return `<p class="empty">${escapeHtml(caption)}: none.</p>`;
  }

  const rows = entries.map(
    (entry) => `<tr><th scope="row">${escapeHtml(entry.label)}</th><td>${entry.count}</td></tr>`,
  );

  return `<table class="counts">
  <caption>${escapeHtml(caption)}</caption>
  <tbody>
${rows.join('\n')}
  </tbody>
</table>`;
}

/** One axe rule, in axe's words. Nothing here is rephrased, re-scored or summarised. */
function standardGroupHtml(group: StandardGroup, index: number): string {
  const { axe } = group;
  const impact = axe.impact ?? null;
  const headingId = `axe-rule-${index}`;

  const nodes = axe.nodes
    .map(
      (node) => `      <li>
        <p class="field"><span class="field-name">Element</span> <code class="selector">${escapeHtml(flattenTarget(node.target))}</code></p>
        <pre class="snippet" tabindex="0"><code>${escapeHtml(node.html)}</code></pre>
      </li>`,
    )
    .join('\n');

  const elements = group.elementCount === 1 ? '1 element' : `${group.elementCount} elements`;

  return `    <section class="group axe-group" aria-labelledby="${headingId}">
      <h3 id="${headingId}"><code>${escapeHtml(axe.id)}</code></h3>
      <p class="badges">${badge(severityLabel(impact), `severity-${impact ?? 'ungraded'}`)}${badge('axe-core', 'source-axe')}<span class="element-count">${escapeHtml(elements)}</span></p>
      <p class="axe-words">${escapeHtml(axe.help)}</p>
      <p class="axe-words description">${escapeHtml(axe.description)}</p>
      <p class="doc-link"><a href="${escapeHtml(axe.helpUrl)}">How axe-core explains this rule and how to fix it</a></p>
      <ol class="findings">
${nodes}
      </ol>
    </section>`;
}

/** One GlyphLint rule: its findings, its confidence, and the sentence that limits it. */
function scriptAwareGroupHtml(group: ScriptAwareGroup, index: number): string {
  const headingId = `glyphlint-rule-${index}`;
  const elements = group.elementCount === 1 ? '1 element' : `${group.elementCount} elements`;
  const scripts = group.scripts.length === 0 ? '' : ` <span class="scripts">${escapeHtml(group.scripts.join(', '))}</span>`;

  const heuristicBadge = group.confidence === 'heuristic' ? badge('heuristic', 'heuristic') : '';
  const wcag =
    group.wcagRef === undefined
      ? '<p class="wcag none">No WCAG success criterion covers this. The rule says so rather than citing the nearest number.</p>'
      : `<p class="wcag">WCAG 2.1 SC ${escapeHtml(group.wcagRef)}</p>`;

  const findings = group.violations
    .map(
      (violation) => `      <li>
        <p class="field"><span class="field-name">Element</span> <code class="selector">${escapeHtml(violation.selector)}</code></p>
        <p class="field"><span class="field-name">Text</span> ${quotedText(violation.snippet, 'text-sample')}</p>
        <dl class="explanation">
          <div><dt>What is wrong</dt><dd>${escapeHtml(violation.whatIsWrong)}</dd></div>
          <div><dt>Why it matters for this writing system</dt><dd>${escapeHtml(violation.whyItMatters)}</dd></div>
          <div><dt>How to fix it</dt><dd>${escapeHtml(violation.howToFix)}</dd></div>
        </dl>
      </li>`,
    )
    .join('\n');

  return `    <section class="group glyphlint-group" aria-labelledby="${headingId}">
      <h3 id="${headingId}">${escapeHtml(group.title)}</h3>
      <p class="badges">${badge(group.severity, `severity-${group.severity}`)}${badge(`confidence: ${group.confidence}`, `confidence-${group.confidence}`)}${heuristicBadge}${badge('glyphlint', 'source-glyphlint')}<span class="element-count">${escapeHtml(elements)}</span>${scripts}</p>
      <p class="rule-id"><code>${escapeHtml(group.ruleId)}</code></p>
      <p class="confidence-note">${escapeHtml(CONFIDENCE_NOTE[group.confidence])}</p>
      <p class="limitations"><span class="field-name">What this rule cannot see</span> ${escapeHtml(group.limitations)}</p>
      ${wcag}
      <details class="rule-description">
        <summary>Why this rule exists</summary>
        ${group.description
          .split('\n\n')
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join('\n        ')}
      </details>
      <ol class="findings">
${findings}
      </ol>
    </section>`;
}

/** What the filters withheld, said out loud. A shorter report must never read as a cleaner page. */
function filtersHtml(model: ReportModel): string {
  const filters = model.filters;
  if (filters === undefined) return '';

  const applied: string[] = [];
  const { onlyRules, disabledRules, onlyScripts, minSeverity } = filters.applied;
  if (onlyRules !== undefined) applied.push(`only these rules: ${onlyRules.join(', ')}`);
  if (disabledRules !== undefined) applied.push(`rules switched off: ${disabledRules.join(', ')}`);
  if (onlyScripts !== undefined) applied.push(`only these writing systems: ${onlyScripts.join(', ')}`);
  if (minSeverity !== undefined) applied.push(`nothing below ${minSeverity}`);

  const withheld = filters.withheld.standard + filters.withheld.scriptAware;
  const detail =
    withheld === 0
      ? 'Nothing was withheld by them.'
      : `They withheld ${filters.withheld.standard} axe-core finding(s) and ` +
        `${filters.withheld.scriptAware} GlyphLint finding(s), which are not shown anywhere below.`;

  return `      <div class="notice filtered">
        <p><strong>This report is filtered.</strong> ${escapeHtml(applied.join('; '))}. ${escapeHtml(detail)}</p>
      </div>`;
}

function unsupportedHtml(model: ReportModel): string {
  const unsupported = model.unsupportedScript;
  if (unsupported === undefined) return '';

  const where = unsupported.nodeCount === 1 ? '1 text node' : `${unsupported.nodeCount} text nodes`;
  const samples = unsupported.samples.map((sample) => `<li>${quotedText(sample, 'text-sample')}</li>`).join('');

  return `      <div class="notice unsupported">
        <p><strong>Text GlyphLint cannot analyse.</strong> ${escapeHtml(where)} carried a writing system this tool does not model, so no script-aware rule looked at it. Samples:</p>
        <ul class="samples">${samples}</ul>
      </div>`;
}

function errorHtml(model: ReportModel): string {
  if (model.error === undefined) return '';
  return `      <div class="notice error">
        <p><strong>This scan did not complete.</strong> ${escapeHtml(model.error.message)}</p>
      </div>`;
}

/**
 * The stylesheet.
 *
 * Every declaration in here is inert to our own rules on purpose, and the audit test is what keeps
 * it that way:
 *
 * - `line-height: 1.7` clears the 1.5 of WCAG SC 1.4.8 and the 1.6 we estimate for Thai, Lao and
 *   Khmer, so a report quoting Thai text is not itself cramping it.
 * - Nothing sets `letter-spacing`, `text-transform`, `word-break: break-all` or `hyphens: auto`.
 * - No box hides its overflow. Code blocks scroll on the inline axis, which computes to `auto` on
 *   the block axis rather than to a clip.
 * - Every inset, margin and alignment is logical (`inline-start`, `start`), never physical, so the
 *   document renders correctly whichever direction it is given — and so that our own
 *   `physical-css-in-bidi-context` rule stays quiet when the report is rendered right-to-left.
 *
 * Colours are chosen to clear 4.5:1 against their background, and no meaning is carried by colour
 * alone: every badge states its own word.
 */
export const STYLES = `
  :root {
    --paper: #ffffff;
    --ink: #1b1b1b;
    --muted: #55555f;
    --line: #c9c9d1;
    --tint: #f4f4f7;
    --axe-accent: #4a4a5a;
    --glyph-accent: #1f5c66;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
  }
  header, main, footer { max-inline-size: 60rem; margin-inline: auto; padding-inline: 1.25rem; }
  header { padding-block: 2rem 1rem; border-block-end: 1px solid var(--line); }
  footer { padding-block: 1.5rem 3rem; border-block-start: 1px solid var(--line); margin-block-start: 2rem; }
  h1 { font-size: 1.8rem; line-height: 1.4; margin-block: 0 0.5rem; }
  h2 { font-size: 1.4rem; line-height: 1.4; margin-block: 0 0.25rem; }
  h3 { font-size: 1.1rem; line-height: 1.5; margin-block: 0 0.5rem; }
  p { margin-block: 0 0.75rem; }
  a { color: #0f4c81; }
  a:focus-visible, summary:focus-visible { outline: 3px solid #0f4c81; outline-offset: 2px; }
  /*
    Code fonts for code, and only for code.

    Our own scan of this report caught the first version of this rule: quoted Thai text set in
    "Cascadia Mono, Consolas, Courier New, monospace" is text set in a stack that cannot render
    it, and the browser was quietly substituting a font behind our backs. That is the defect
    missing-script-font-coverage exists to report, committed by the report itself.

    So an excerpt of somebody's page inherits the document's own stack, which ends in a generic
    family and can render the writing systems this tool is about. Markup snippets stay monospace,
    because the structure is what a reader is looking at there — with the interface stack appended
    after the generic, so that the words inside the markup have somewhere to fall when the code
    font has no glyph for them.
  */
  code, pre { font-family: "Cascadia Mono", Consolas, "Courier New", monospace, system-ui, "Segoe UI", sans-serif; }
  /*
    Quoted text is set in a stack that names families for the writing systems this tool is about,
    rather than leaving the browser to substitute one silently. That is what
    missing-script-font-coverage asks of any page, and a report is a page. Families that are not
    installed cost nothing: the browser skips them.
  */
  samp.text-sample {
    font-family: system-ui, "Segoe UI", "Noto Sans", "Noto Sans Arabic", "Noto Naskh Arabic",
      "Noto Sans Hebrew", "Noto Sans Thai", "Leelawadee UI", "Noto Sans Devanagari", "Nirmala UI",
      "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  }
  .scan-meta { color: var(--muted); margin-block: 0 0.25rem; }
  .scan-meta a { overflow-wrap: break-word; }
  .layer { margin-block-start: 2.5rem; padding-block-start: 1rem; border-block-start: 4px solid var(--line); }
  .layer.standard { border-block-start-color: var(--axe-accent); }
  .layer.script-aware { border-block-start-color: var(--glyph-accent); }
  .attribution { background: var(--tint); border-inline-start: 4px solid var(--axe-accent); padding: 0.75rem 1rem; }
  .layer.script-aware .attribution { border-inline-start-color: var(--glyph-accent); }
  .summary-tables { display: flex; flex-wrap: wrap; gap: 1.5rem; }
  table.counts { border-collapse: collapse; min-inline-size: 16rem; margin-block-end: 1rem; }
  table.counts caption { text-align: start; font-weight: 700; padding-block-end: 0.4rem; }
  table.counts th, table.counts td { border: 1px solid var(--line); padding: 0.3rem 0.7rem; text-align: start; font-weight: 400; }
  table.counts th { font-weight: 600; }
  table.counts tr.total th, table.counts tr.total td { background: var(--tint); font-weight: 700; }
  .group { border: 1px solid var(--line); border-radius: 6px; padding: 1rem 1.25rem; margin-block-end: 1.25rem; }
  .badges { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-block-end: 0.75rem; }
  .badge { display: inline-block; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; font-weight: 700; border: 1px solid currentColor; }
  .severity-critical { background: #fce8e8; color: #8a1220; }
  .severity-serious { background: #fdefdd; color: #7d4200; }
  .severity-moderate { background: #fbf3d4; color: #5f4c00; }
  .severity-minor { background: #e8eef8; color: #24487c; }
  .severity-ungraded { background: var(--tint); color: #46464f; }
  .confidence-high { background: #e4f1e8; color: #17512c; }
  .confidence-medium { background: #eef0f3; color: #3d4450; }
  .confidence-heuristic { background: #efe8f8; color: #4a2a7a; }
  .heuristic { background: #efe8f8; color: #4a2a7a; }
  .source-axe { background: var(--tint); color: var(--axe-accent); }
  .source-glyphlint { background: #e6f1f3; color: #10464e; }
  .element-count, .scripts { color: var(--muted); font-size: 0.9rem; }
  .field-name { font-weight: 700; }
  .selector { background: var(--tint); padding: 0.05rem 0.35rem; border-radius: 3px; overflow-wrap: break-word; }
  .text-sample { background: var(--tint); padding: 0.05rem 0.35rem; border-radius: 3px; }
  pre.snippet { background: var(--tint); border: 1px solid var(--line); border-radius: 4px; padding: 0.6rem 0.8rem; overflow-x: auto; }
  .limitations { background: var(--tint); border-inline-start: 4px solid var(--muted); padding: 0.6rem 0.9rem; }
  .confidence-note { color: var(--muted); }
  .rule-id { color: var(--muted); margin-block-end: 0.5rem; }
  .wcag { color: var(--muted); }
  .rule-description { margin-block-end: 1rem; }
  .rule-description summary { cursor: pointer; font-weight: 600; }
  ol.findings { margin: 0; padding-inline-start: 1.5rem; }
  ol.findings > li { margin-block-end: 1.25rem; }
  dl.explanation { margin: 0; }
  dl.explanation dt { font-weight: 700; }
  dl.explanation dd { margin-inline-start: 0; margin-block-end: 0.5rem; }
  .notice { border: 1px solid var(--line); border-inline-start-width: 4px; border-radius: 4px; padding: 0.75rem 1rem; margin-block-end: 1rem; background: var(--tint); }
  .notice.error { border-inline-start-color: #8a1220; }
  ul.samples { margin-block: 0.5rem 0; }
  .empty { color: var(--muted); font-style: italic; }
  .disclaimer { color: var(--muted); }
`;

/**
 * Render one scan as a complete HTML document.
 *
 * Pure: the same model always produces the same bytes. Nothing here reads a clock, a file or an
 * environment variable, which is what lets a report be regenerated from a stored result and
 * compared with the original.
 */
export function renderHtmlReport(model: ReportModel, options: HtmlReportOptions = {}): string {
  const dir = options.documentDir ?? 'ltr';

  const standardGroups =
    model.standard.groups.length === 0
      ? '    <p class="empty">axe-core reported no violations on this page.</p>'
      : model.standard.groups.map(standardGroupHtml).join('\n');

  const scriptAwareGroups =
    model.scriptAware.groups.length === 0
      ? '    <p class="empty">GlyphLint reported no script-aware violations on this page.</p>'
      : model.scriptAware.groups.map(scriptAwareGroupHtml).join('\n');

  const heuristicNotice = model.scriptAware.hasHeuristicFindings
    ? '<p class="notice">Some rules below are marked <span class="badge heuristic">heuristic</span>. Those findings are inferences from evidence that can be wrong, and each one says what it cannot see.</p>'
    : '';

  return `<!doctype html>
<html lang="en" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlyphLint report — ${escapeHtml(model.url)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>GlyphLint accessibility report</h1>
  <p class="scan-meta">Page scanned: <a href="${escapeHtml(model.finalUrl)}">${escapeHtml(model.finalUrl)}</a></p>
  <p class="scan-meta">Scanned at ${escapeHtml(model.scannedAt)}, in ${model.durationMs} ms.</p>
</header>
<main>
  <section class="layer summary" aria-labelledby="summary-heading">
    <h2 id="summary-heading">Summary</h2>
    <p>Two independent audits ran against this page. They are counted separately here and reported separately below, and they are never added together.</p>
${errorHtml(model)}${filtersHtml(model)}${unsupportedHtml(model)}
    <div class="summary-tables">
${countsTable(model.standard.counts, 'Standard rule findings, by axe-core')}
${countsTable(model.scriptAware.counts, 'Script-aware rule findings, by GlyphLint')}
    </div>
    <div class="summary-tables">
${scriptTable(model.scriptAware.byScript, 'GlyphLint findings by writing system')}
${scriptTable(model.scriptsDetected, 'Writing systems found on the page')}
    </div>
    <p class="scan-meta">axe-core also ran ${model.standard.passes} checks that passed.</p>
  </section>

  <section class="layer standard" aria-labelledby="standard-heading">
    <h2 id="standard-heading">Standard rules — found by axe-core</h2>
    <div class="attribution">
      <p><strong>These findings are axe-core&rsquo;s, not GlyphLint&rsquo;s.</strong> axe-core is an independent open-source accessibility engine by Deque Systems. GlyphLint runs it unchanged and reproduces its results here in its own words, without re-scoring, re-wording or filtering out anything it reported. Every rule links to axe's own documentation.</p>
      <p><a href="https://github.com/dequelabs/axe-core">axe-core, the project behind this section</a></p>
    </div>
${standardGroups}
  </section>

  <section class="layer script-aware" aria-labelledby="script-aware-heading">
    <h2 id="script-aware-heading">Script-aware rules — found by GlyphLint</h2>
    <div class="attribution">
      <p><strong>This section is GlyphLint's own work.</strong> These rules look for accessibility defects caused by writing systems rather than by markup: cursive joining severed by letter spacing, stacked marks clipped by a fixed height, direction left undeclared, line breaking applied where the script cannot take it. They are the checks that only appear when the text is not English, and they are additional to everything above, never a replacement for it.</p>
    </div>
    ${heuristicNotice}
${scriptAwareGroups}
  </section>
</main>
<footer>
  <h2>About this report</h2>
  <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
  <p class="disclaimer">Generated by GlyphLint. Standard coverage by axe-core.</p>
</footer>
</body>
</html>
`;
}
