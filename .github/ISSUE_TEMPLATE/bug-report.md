---
name: Bug report
about: GlyphLint crashed, hung, or did something other than what it says it does
title: 'Bug: '
labels: bug
---

<!--
For a finding that is wrong, please use the false-positive template instead — it asks for the things
that make a wrong finding fixable. This one is for the tool misbehaving.
-->

## What happened

<!-- What you ran, and what it did. Paste the command and the output, including any error. -->

```powershell

```

## What you expected instead

## Environment

- GlyphLint version:  <!-- `npx glyphlint --help` prints nothing useful here yet; the version in package.json is fine -->
- Node version:  <!-- node --version -->
- Operating system:
- Did `npx playwright install chromium` run successfully?

## Reproduction

<!--
A URL, or a small HTML file, plus the exact command. If the page is behind a login, note that
GlyphLint does not scan authenticated pages by design — see the non-goals in SPEC.md.
-->

## Anything else

<!--
If the scan produced a report, attaching the JSON output (`--format json`) is the single most useful
thing you can include: it carries the snapshot version, the rule findings and axe's own results.
Please check it for anything you would rather not publish before attaching it — it contains text
from the page that was scanned.
-->
