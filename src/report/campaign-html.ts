/**
 * The campaign report: one page summarising a whole run, published to GitHub Pages.
 *
 * Same constraints as the single-page report — one file, no JavaScript, no external requests, no
 * physical CSS — and the same refusal to add the two layers together. It is rendered from a
 * committed results file by `src/campaign-report.ts`, so publishing never involves scanning
 * anything.
 *
 * The page is written for two readers who want opposite things: someone deciding whether this tool
 * is worth their time, and someone checking whether its numbers are honest. The second reader is
 * the one the layout serves — the denominators, the sites that were not really measured, and the
 * caveats are above the rankings rather than below them.
 */

import { escapeHtml, STYLES } from './html.js';
import { CAVEATS_HEADING, campaignCaveats, type CampaignDocument } from './metrics.js';
import type { CampaignAggregate, IssueRow } from '../campaign/aggregate.js';

/** A short label for a site's fate, in the words the results file uses. */
const OUTCOME_LABEL: Readonly<Record<string, string>> = {
  scanned: 'scanned',
  disallowed: 'refused by robots.txt',
  skipped: 'skipped, permission not established',
  failed: 'failed',
};

function issueRows(issues: readonly IssueRow[], scanned: number): string {
  if (issues.length === 0) {
    return '<tr><td colspan="5">Nothing reported.</td></tr>';
  }

  return issues
    .map(
      (issue) => `<tr>
      <th scope="row"><code>${escapeHtml(issue.ruleId)}</code></th>
      <td>${issue.sites} of ${scanned}</td>
      <td>${issue.sitesPercent}%</td>
      <td>${issue.elements}</td>
      <td>${escapeHtml(issue.severity)}${
        issue.confidence === undefined ? '' : ` · ${escapeHtml(issue.confidence)}`
      }</td>
    </tr>`,
    )
    .join('\n');
}

function siteRows(document: CampaignDocument): string {
  return document.sites
    .map((site) => {
      const standard = site.standard?.violations.length ?? 0;
      const scriptAware = site.scriptAware?.violations.length ?? 0;
      const outcome = OUTCOME_LABEL[site.status] ?? site.status;

      return `<tr>
      <th scope="row"><bdi dir="auto">${escapeHtml(site.url)}</bdi></th>
      <td>${escapeHtml(site.script)}</td>
      <td>${escapeHtml(outcome)}</td>
      <td>${site.status === 'scanned' ? String(standard) : '—'}</td>
      <td>${site.status === 'scanned' ? String(scriptAware) : '—'}</td>
    </tr>`;
    })
    .join('\n');
}

function measuredSites(aggregate: CampaignAggregate): number {
  return Math.max(0, aggregate.outcomes.scanned - aggregate.labelMismatches.length);
}

/**
 * Render the campaign report.
 *
 * Pure: the same document always produces the same page, which is what lets the deploy workflow
 * republish without a scan and without a clock.
 */
export function renderCampaignReport(document: CampaignDocument): string {
  const { aggregate, targetList } = document;
  const { outcomes } = aggregate;
  const measured = measuredSites(aggregate);
  const day = document.startedAt.slice(0, 10);

  const mismatchNotice =
    aggregate.labelMismatches.length === 0
      ? ''
      : `<div class="notice">
      <p><strong>${aggregate.labelMismatches.length} of the ${outcomes.scanned} sites that answered did not serve their homepage.</strong>
      GlyphLint identifies itself as a scanner and does not imitate a browser, and these hosts
      returned an error page instead. They are counted as scanned and excluded from the measured
      figure, because a page with no text in the writing system it was listed for is not evidence
      about that writing system:</p>
      <ul>${aggregate.labelMismatches
        .map(
          (entry) =>
            `<li><code>${escapeHtml(entry.url)}</code> — listed as ${escapeHtml(entry.listedAs)}, contained ${escapeHtml(entry.detected.join(', ') || 'no text we could attribute')}</li>`,
        )
        .join('')}</ul>
    </div>`;

  const caveats = campaignCaveats(aggregate)
    .map(
      (caveat) =>
        `<div class="notice"><p><strong>${escapeHtml(caveat.heading)}</strong> ${escapeHtml(caveat.body)}</p></div>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlyphLint campaign report — ${escapeHtml(day)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>GlyphLint campaign report</h1>
  <p class="scan-meta">${escapeHtml(day)} · ${targetList.attempted} target(s) attempted out of ${targetList.available} on the list · ${outcomes.scanned} answered · ${measured} served a page in the writing system they were listed for.</p>
  <p class="scan-meta">Identified as <code>${escapeHtml(document.userAgent)}</code>, one site at a time, never faster than one every ${document.delayMs} ms, with robots.txt fetched and honoured first.</p>
</header>
<main>
  <section class="layer summary" aria-labelledby="outcomes-heading">
    <h2 id="outcomes-heading">What happened to each target</h2>
    ${mismatchNotice}
    <table class="counts">
      <caption>Outcomes</caption>
      <tbody>
        <tr><th scope="row">Scanned</th><td>${outcomes.scanned}</td></tr>
        <tr><th scope="row">Refused by robots.txt</th><td>${outcomes.disallowed}</td></tr>
        <tr><th scope="row">Skipped, permission not established</th><td>${outcomes.skipped}</td></tr>
        <tr><th scope="row">Failed</th><td>${outcomes.failed}</td></tr>
      </tbody>
    </table>
    <table class="counts">
      <caption>Every target, and what became of it</caption>
      <thead>
        <tr><th scope="col">Site</th><th scope="col">Listed as</th><th scope="col">Outcome</th><th scope="col">axe-core findings</th><th scope="col">GlyphLint findings</th></tr>
      </thead>
      <tbody>
${siteRows(document)}
      </tbody>
    </table>
  </section>

  <section class="layer summary" aria-labelledby="caveats-heading">
    <h2 id="caveats-heading">${escapeHtml(CAVEATS_HEADING)}</h2>
${caveats}
  </section>

  <section class="layer standard" aria-labelledby="standard-heading">
    <h2 id="standard-heading">Standard rules — found by axe-core</h2>
    <div class="attribution">
      <p><strong>These findings are axe-core&rsquo;s, not GlyphLint&rsquo;s.</strong> axe-core is an independent open-source accessibility engine by Deque Systems. GlyphLint runs it unchanged and reports its results without re-scoring or re-wording them. It reported ${aggregate.layers.standard.elements} element(s) across ${aggregate.layers.standard.rules} rule(s) here, and passed ${aggregate.layers.standard.passes} checks.</p>
      <p><a href="https://github.com/dequelabs/axe-core">axe-core, the project behind this section</a></p>
    </div>
    <table class="counts">
      <caption>axe-core rules, ranked by how many sites they reported on</caption>
      <thead>
        <tr><th scope="col">Rule</th><th scope="col">Sites</th><th scope="col">Of those scanned</th><th scope="col">Elements</th><th scope="col">Impact</th></tr>
      </thead>
      <tbody>
${issueRows(aggregate.issues.standard, aggregate.percentagesAreOutOf)}
      </tbody>
    </table>
  </section>

  <section class="layer script-aware" aria-labelledby="script-aware-heading">
    <h2 id="script-aware-heading">Script-aware rules — found by GlyphLint</h2>
    <div class="attribution">
      <p><strong>This section is GlyphLint&rsquo;s own work.</strong> These are the checks that only appear when the text is not English. Percentages are out of the ${aggregate.percentagesAreOutOf} site(s) actually scanned — not out of the ${targetList.attempted} attempted, and not out of the web.</p>
    </div>
    <table class="counts">
      <caption>GlyphLint rules, ranked by how many sites they reported on</caption>
      <thead>
        <tr><th scope="col">Rule</th><th scope="col">Sites</th><th scope="col">Of those scanned</th><th scope="col">Elements</th><th scope="col">Severity · confidence</th></tr>
      </thead>
      <tbody>
${issueRows(aggregate.issues.scriptAware, aggregate.percentagesAreOutOf)}
      </tbody>
    </table>
  </section>
</main>
<footer>
  <h2>About this report</h2>
  <p class="disclaimer">This is an automated scan of public homepages, run once, from one machine, on one date. It can report problems that are not real and it can miss problems that are. Findings marked heuristic are inferences from evidence that can be wrong. Nothing here is a legal assessment or an accusation against the people who built these pages: the sites were chosen because they serve readers in writing systems that mainstream tooling ignores, and they are named so the findings can be checked rather than to grade anybody.</p>
  <p class="disclaimer">Generated by GlyphLint from committed results. Standard coverage by axe-core.</p>
</footer>
</body>
</html>
`;
}
