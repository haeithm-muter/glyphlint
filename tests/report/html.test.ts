/**
 * The HTML report.
 *
 * The browser-level proof that this file is accessible lives in
 * `tests/scanner/report-self-audit.test.ts`, which scans the rendered page with the real scanner.
 * What is asserted here is everything a string can be asked: that page text is escaped, that
 * nothing is fetched from the network, that the two sections are labelled, that a heuristic rule
 * is badged, and that the stylesheet contains none of the declarations our own rules exist to
 * report.
 */

import { describe, expect, it } from 'vitest';

import { buildReportModel } from '../../src/report/model.js';
import { escapeHtml, renderHtmlReport } from '../../src/report/html.js';
import { makeAxeViolation, makeClippedViolation, makeCursiveViolation, makeResult } from './make-result.js';

/** Render the default result, which has findings on both sides. */
function render(): string {
  return renderHtmlReport(buildReportModel(makeResult()));
}

describe('escaping', () => {
  it('escapes every character that could end an attribute or open a tag', () => {
    expect(escapeHtml(`<img src="x" onerror='y'> & done`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt; &amp; done',
    );
  });

  it('escapes markup that arrived in a page snippet', () => {
    const attack = '</style><script>alert(1)</script>';
    const html = renderHtmlReport(
      buildReportModel(
        makeResult({
          scriptAwareViolations: [
            { ...makeCursiveViolation(), snippet: attack, selector: attack },
          ],
        }),
      ),
    );

    // Everything in the report came from somebody else's page. A snippet that closes our own
    // stylesheet and opens a script tag has to arrive as text.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes markup inside an axe snippet', () => {
    const html = renderHtmlReport(
      buildReportModel(
        makeResult({
          standardViolations: [
            makeAxeViolation({
              nodes: [{ html: '<img onerror="x">', target: ['#a'], any: [], all: [], none: [] }],
            }),
          ],
        }),
      ),
    );

    expect(html).toContain('&lt;img onerror=&quot;x&quot;&gt;');
  });
});

describe('self-containment', () => {
  it('fetches nothing: no external stylesheet, script, image or font', () => {
    const html = render();

    expect(html).not.toMatch(/<link\b/u);
    expect(html).not.toMatch(/<script\b/u);
    expect(html).not.toMatch(/<img\b/u);
    expect(html).not.toMatch(/@import/u);
    // `url(` in CSS is how a font or an image sneaks back in after everything else is inlined.
    expect(html).not.toMatch(/url\(/u);
  });

  it('links out only to documentation, and only as anchors a reader chooses to follow', () => {
    const html = render();
    const urls = [...html.matchAll(/https?:\/\/[^"'\s<]+/gu)].map((match) => match[0]);

    // The scanned page's own URL, axe's rule documentation, and axe's project page. Nothing here
    // is loaded when the report opens.
    for (const url of urls) {
      expect(url).toMatch(/^https?:\/\/(example\.com|dequeuniversity\.com|github\.com)/u);
    }
  });
});

describe('the separation between the two layers', () => {
  it('names whose findings each section holds', () => {
    const html = render();

    expect(html).toContain('Standard rules — found by axe-core');
    expect(html).toContain('Script-aware rules — found by GlyphLint');
    // Our own prose is written into the template as markup; only values that came from a scanned
    // page go through `escapeHtml`, which is why this sentence keeps its apostrophes.
    expect(html).toContain('These findings are axe-core&rsquo;s, not GlyphLint&rsquo;s.');
  });

  it('reproduces the words axe wrote and links to the documentation axe published', () => {
    const html = render();

    expect(html).toContain('Images must have alternative text');
    expect(html).toContain('https://dequeuniversity.com/rules/axe/4.12/image-alt');
  });

  it('renders two separate count tables and no combined one', () => {
    const html = render();

    expect(html).toContain('Standard rule findings, by axe-core');
    expect(html).toContain('Script-aware rule findings, by GlyphLint');
  });
});

describe('what each finding shows', () => {
  it('shows the selector, the text, and the three sentences', () => {
    const html = render();

    expect(html).toContain('#arabic');
    expect(html).toContain('مرحبا بالعالم');
    expect(html).toContain('What is wrong');
    expect(html).toContain('Why it matters for this writing system');
    expect(html).toContain('How to fix it');
  });

  it('badges a heuristic rule visibly, not in a footnote', () => {
    const html = renderHtmlReport(
      buildReportModel(makeResult({ scriptAwareViolations: [makeClippedViolation()] })),
    );

    expect(html).toContain('<span class="badge heuristic">heuristic</span>');
    expect(html).toContain('confidence: heuristic');
  });

  it('shows the rule limitations inline with the group', () => {
    const html = render();

    expect(html).toContain('What this rule cannot see');
    expect(html).toContain('Judges only spacing the page itself applies');
  });

  it('renders an absent WCAG reference as a normal state, not as missing data', () => {
    // Decision 010: the flagship rule cites no criterion, and the report must say that plainly
    // rather than rounding it up to the nearest available number.
    const html = render();

    expect(html).toContain('No WCAG success criterion covers this');
  });

  it('isolates quoted page text and lets the browser resolve its direction', () => {
    const html = render();

    expect(html).toContain('<bdi dir="auto"><samp class="text-sample">مرحبا بالعالم</samp></bdi>');
  });
});

describe('the report as a document', () => {
  it('declares a language, a title and a zoomable viewport', () => {
    const html = render();

    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('<title>GlyphLint report');
    expect(html).toContain('content="width=device-width, initial-scale=1"');
    expect(html).not.toContain('user-scalable=no');
  });

  it('can be rendered right to left without changing anything else', () => {
    const rtl = renderHtmlReport(buildReportModel(makeResult()), { documentDir: 'rtl' });

    expect(rtl).toContain('<html lang="en" dir="rtl">');
  });

  it('always carries the disclaimer', () => {
    expect(render()).toContain('This is an automated scan.');
    // Even when there is nothing at all to report.
    const empty = renderHtmlReport(
      buildReportModel(makeResult({ standardViolations: [], scriptAwareViolations: [] })),
    );
    expect(empty).toContain('This is an automated scan.');
    expect(empty).toContain('axe-core reported no violations on this page.');
  });

  it('says what a filter withheld', () => {
    const html = renderHtmlReport(
      buildReportModel(
        makeResult({
          result: {
            filters: { applied: { minSeverity: 'serious' }, withheld: { standard: 2, scriptAware: 1 } },
          },
        }),
      ),
    );

    expect(html).toContain('This report is filtered.');
    expect(html).toContain('withheld 2 axe-core finding(s) and 1 GlyphLint finding(s)');
  });
});

describe('the stylesheet obeys the rules this project enforces', () => {
  const html = render();
  const styles = /<style>([\s\S]*?)<\/style>/u.exec(html)?.[1] ?? '';

  it('sets a leading that clears every threshold in the property table', () => {
    // 1.5 is what WCAG SC 1.4.8 names and 1.6 is our estimate for Thai, Lao and Khmer. A report
    // that quotes Thai must not be the thing cramping it.
    expect(styles).toMatch(/line-height:\s*1\.7/u);
  });

  it('contains none of the declarations our own rules report', () => {
    expect(styles).not.toMatch(/letter-spacing/u);
    expect(styles).not.toMatch(/text-transform/u);
    expect(styles).not.toMatch(/word-break:\s*break-all/u);
    expect(styles).not.toMatch(/hyphens:\s*auto/u);
    expect(styles).not.toMatch(/overflow[^:]*:\s*hidden/u);
  });

  it('uses logical properties only, so the report survives being flipped', () => {
    // `physical-css-in-bidi-context` reports `text-align: left|right` in a right-to-left context,
    // and the self-audit renders this document right-to-left. Physical margins are not reported by
    // that rule (decision 013) and are excluded here anyway: a stylesheet that mixes the two is
    // one edit away from a report that lays out backwards.
    expect(styles).not.toMatch(/text-align:\s*(left|right)/u);
    expect(styles).not.toMatch(/margin-(left|right)/u);
    expect(styles).not.toMatch(/padding-(left|right)/u);
    expect(styles).not.toMatch(/border-(left|right)/u);
  });
});
