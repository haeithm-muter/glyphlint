---
name: False positive
about: GlyphLint reported something that is not actually a problem
title: 'False positive: '
labels: false-positive
---

<!--
Please do report these. A rule that flags a page which is actually fine costs more than a rule that
stays quiet: it wastes the time of the person reading the report, and it makes every other finding
in that report harder to trust. Every rule here can be narrowed, and several already have been
because of exactly this kind of report.
-->

## Which rule

<!-- The rule id from the report, for example `unisolated-bidi-run`. -->

## What it reported

<!-- Paste the finding: the selector, the text sample, and the "what is wrong" sentence. -->

## Why it is not a problem

<!--
The part only you can supply. Some possibilities:

- the text is correct as it stands and the rule misread it
- the page already handles this in a way the rule cannot see
- the truncation, spacing or transform is deliberate and harmless here
- the rule is right about the CSS and wrong about what it does to this script
-->

## Minimal reproduction

<!--
A public URL, or the smallest HTML and CSS that produces the finding. A fixture is what turns this
report into a test, and a test is what stops the false positive coming back later.
-->

## Confidence, for context

<!--
Optional. The report labels each rule `high`, `medium` or `heuristic`. A false positive from a
`heuristic` rule is expected and helps us narrow it; a false positive from a `high` rule is a bug,
because that label claims the condition was decidable from what we captured.
-->
