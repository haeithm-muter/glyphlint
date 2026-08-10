# Decisions

A running log of decisions that are not obvious from the code, and that a reviewer would
otherwise have to guess at or argue with. Typography and Unicode work is full of choices that
look arbitrary until the reasoning is written down — this file is where the reasoning lives.

Newest entry first. Nothing is ever deleted; a reversed decision gets a new entry that
supersedes the old one, and the old one is marked `Superseded by`.

## Format

```
## NNN — Short title

**Status:** Accepted | Superseded by NNN
**Date:** YYYY-MM-DD

**Context** — what forced a choice.
**Decision** — what we chose, stated so it can be checked against the code.
**Consequences** — what this makes easy, what it makes hard, and what would make us revisit it.
```

---

## 016 — Isolation does not need an element, so R8 checks for it in the text

**Status:** Accepted
**Date:** 2026-08-11

**Context** — Decision 014 rebuilt `unisolated-bidi-run` on a structural argument: a wrapper that
isolates an embedded run would have split the text into separate text nodes, so the sandwiched
pattern surviving inside one node is itself the evidence that nothing isolated it.

The argument has a hole. Isolation does not have to come from an element. U+2066 to U+2069 isolate
a run in the character stream, and U+202A to U+202E embed or override it, all without producing any
markup — the text node stays whole and the pattern still matches. And the rule recommends exactly
those characters in its own `howToFix`, for the case where markup cannot be added. Left alone, it
would report text that had taken its own advice.

**Decision** — A node whose text contains any Unicode directional formatting character is skipped
entirely, before the run walk. Skipping the whole node rather than the bracketed run is
deliberately blunt: text carrying these characters has been thought about by somebody, and this is
the rule where the cost of a wrong finding is highest.

**Consequences** — A page that isolates one run with these characters and leaves a second run
unisolated in the same text node is not reported. That is a real miss, and it is the direction this
rule is allowed to err in. The `limitations` string says so. The alternative — tracking isolate
depth across the run walk — is more machinery than a heuristic of this confidence has earned.

## 015 — R11 measures layout, and says which half of the defect that leaves it

**Status:** Accepted
**Date:** 2026-08-11

**Context** — `clipped-stacked-marks` detects clipping by comparing `scrollHeight` against
`clientHeight`. Those are layout measurements. A tone mark rising above the line box is ink, and
ink does not move either number.

Measured in Chromium, the boundary sits in a useful place. With `line-height: normal` the browser
allocates a taller line box for Thai than for Latin — 20px against 18px at the same font size — so
the mark is inside the line box and any container too short for it produces `scrollHeight >
clientHeight`. The rule catches a box shorter than one line, a fixed height truncating several
lines, and `-webkit-line-clamp`, all of which were measured rather than assumed.

What it cannot catch is a `line-height` set tight enough that the line box itself is shorter than
the ink. There the box fits its content, both numbers agree, and the mark is clipped anyway.

**Decision** — Keep the layout measurement, and state the boundary in the rule's own
`limitations` rather than letting silence read as coverage. The uncovered case is exactly what
`insufficient-line-height-for-script` reports, so both rules carry a sentence naming the other and
the half it covers.

An earlier plan claimed `-webkit-line-clamp` never produces an overflow and would slip past this
condition. That was drawn from a fixture whose content did not overflow at all, and measurement
showed the opposite: a clamped box reports 40px of client height against 60px of content.

**Consequences** — Two rules share one defect along a documented seam, which is better than one
rule with an undocumented blind spot. The cost is that a reader has to meet both findings to see
the whole picture, and the report layer should keep that in mind when it groups results. The rule
also reads only the overflow of the element holding the text; a clipping wrapper above it is
invisible, and closing that would mean a fourth ancestor field in the snapshot.

## 014 — R8 reads the text node, not the `unicode-bidi` property

**Status:** Accepted
**Date:** 2026-08-10

**Context** — The specification for `unisolated-bidi-run` says to flag an embedded left-to-right
run when there is no `bdi` ancestor and no `unicode-bidi: isolate | isolate-override | plaintext`.
Measured in Chromium, that last condition silences the rule everywhere: the HTML user-agent
stylesheet sets `unicode-bidi: isolate` on every block element, so an ordinary `<p>` reports
`isolate` on a page that has never thought about bidirectional text at all.

The deeper problem is that the property was never the right thing to read. `unicode-bidi: isolate`
on a containing element isolates that element from its siblings. It does nothing for one run
*inside* its own text, which is the case this rule exists for. Isolation that helps has to wrap the
embedded run.

**Decision** — Detect on the text node instead. Walk `scriptRuns` inside one node looking for a
Latin or numeric run sandwiched between two right-to-left runs and touching a directionally neutral
character. Drop the `unicode-bidi` check entirely.

The argument that makes this sound is structural: had the embedded run been wrapped in `<bdi>` or in
an element carrying `unicode-bidi: isolate`, that wrapper would have split the text into separate
nodes, and the sandwiched pattern could not appear inside a single node's text. The pattern
surviving in one node **is** the evidence that nothing wrapped it. `hasBdiAncestor` is kept as a
conservative silence: it does not isolate the inner run, but an author who reached for `<bdi>` has
thought about the problem and we do not lecture them.

**Consequences** — The rule now fires on the paragraphs it was written for. It still reports a risk
rather than an observation, because we do not run the bidirectional algorithm to see whether a
particular line actually reorders, and it is marked `heuristic` for that reason. If a campaign shows
it is still noisy, the next narrowing is to require the neutral character to sit at the boundary of
the run rather than anywhere within it. It never gets looser.

## 013 — Physical margins cannot be told from the logical properties that fix them

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `physical-css-in-bidi-context` was specified to report non-zero
`margin-left/right`, `padding-left/right` and `text-align: left|right` in a right-to-left context.
It was built that way, and the first run against a real fixture reported the control element — the
one written with `margin-inline-start`, the logical property that is the rule's own recommended fix.

That is not a bug in the implementation. In a right-to-left context, `start` *is* `right`, and a
computed style is the resolved result:

| Declared | Computed left | Computed right |
|---|---|---|
| `margin-right: 40px` | `0px` | `40px` |
| `margin-inline-start: 40px` | `0px` | `40px` |
| `margin-left: 40px` | `40px` | `0px` |
| `margin-inline-end: 40px` | `40px` | `0px` |

Every outcome is reachable from both a physical declaration and a logical one, on every property
including `margin-inline-start` itself. Symmetry tests, noise floors and side comparisons all fail
for the same reason: there is no information left in the computed value to key on.

`text-align` is the exception. Chromium keeps `start` and `end` as themselves rather than resolving
them to a side, so an explicit `left` or `right` really was written as one.

**Decision** — The rule reports `text-align: left | right` only. Margins and padding are removed,
and both the description and the `limitations` say so and say why.

Reporting them was the worst option available. A finding that tells an author their
`margin-inline-start` is a defect does not merely waste their time — it argues against the fix, in
a report whose only value is that it can be trusted.

**Consequences** — The rule now covers the smaller half of the defect it is named after, and the
`limitations` string states plainly that a page can be full of `margin-left` and this rule will be
silent about all of it. Recovering the other half means capturing *declared* values rather than
computed ones: walking `document.styleSheets` at capture time and testing `element.matches()`
against the rules that declare a physical property. That is a new capture mechanism, it fails on
cross-origin stylesheets, and it is not attempted here. Until it is, the honest position is a
narrow rule that says what it cannot see.

## 012 — Severity is a property of the finding, not of the rule

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `missing-dir-attribute` grades itself: right-to-left text with no direction at all is
`serious`, and the same text laid out right-to-left by CSS with no `dir` attribute anywhere is
`moderate`, because the page looks correct and only the declaration is missing. Splitting that into
two rules would make the report harder to read and would not make it more precise.

The rule layer as built for group A could not express that. `violationFrom` copied `rule.severity`
onto every finding, and `runRules` filtered by `rule.severity` before running the rule at all. A
rule declared `serious` that emitted a `moderate` finding would have had that finding pass a
`minSeverity: 'serious'` filter untouched — the filter would have been answering a question about
the rule while the caller was asking one about the text.

**Decision** — A finding may carry a severity below the one its rule declares, and both filters in
`runRules` read the finding rather than the rule. Confidence is not overridable: it describes how
the rule knows what it knows, which does not vary case by case.

**Consequences** — Rules are no longer skipped before running when a severity floor is set, so a
filtered run costs the same as an unfiltered one. That is the correct trade: the engine is pure and
runs in milliseconds, and a filter that is fast and wrong is not a saving. A test in
`tests/rules/index.test.ts` asserts the moderate finding is excluded at `minSeverity: 'serious'`,
so the old behaviour cannot return unnoticed.

## 011 — Snapshot version 3: three facts about ancestors

**Status:** Accepted
**Date:** 2026-08-10

**Context** — Three group B rules each needed something the snapshot could not answer, and in each
case the missing fact lived above the element rather than on it.

- `inheritedDir` — the snapshot carried `ownDir` and `ancestorHasDirRtl`, and the second sees only
  `rtl`. `dir="auto"` is the correct markup for text whose direction is not known when the page is
  written, and it resolves to `rtl` for Arabic content. Without this field, `missing-dir-attribute`
  reports every page that handled direction properly.
- `hasCodeAncestor` — `lang-script-mismatch` must skip code. A syntax-highlighted block is
  `pre > span.token`, so the element holding the text is a `span` and the tag name alone misses the
  common case entirely.
- `hasTransformedAncestor` — icon systems mirror with `[dir="rtl"] .wrapper { transform: … }`, so a
  correctly mirrored arrow shows `transform: none` on its own element.

**Decision** — All three are captured, and `snapshotVersion` becomes 3. `hasTransformedAncestor` is
memoised per element during capture, because sibling text nodes share an ancestor chain and a page
of 3000 nodes would otherwise resolve the same styles thousands of times.

**Consequences** — The rules stay pure, which is the point: each of these was a moment where a rule
appeared to need a browser, and the answer was to extend the snapshot rather than to reach for one.
`ancestorHasDirRtl` is now redundant with `inheritedDir` and is kept because removing a field is a
separate decision from adding one. Capture does slightly more work per node; the walk is memoised
and bounded by tree depth.

## 010 — The flagship rule carries no WCAG reference, and that is the honest answer

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `cursive-script-letter-spacing` reports the defect this whole project was built
around, and no WCAG success criterion covers it. The two that come nearest each fail for a
different reason, and neither failure is a technicality.

**SC 1.4.12 Text Spacing** is about spacing the *reader* imposes: content must stay usable when a
user stylesheet sets letter spacing to 0.12em. Our rule reports spacing the *author* wrote into the
page. The two are not merely a loose fit — for a cursive script they point in opposite directions,
because the 0.12em the criterion asks content to survive is the same tracking that severs the joins
between Arabic letters. A page can satisfy the criterion and be unreadable; a page can fail this
rule and satisfy the criterion.

**SC 1.4.8 Visual Presentation** is the author-side criterion for the typography of blocks of text,
which makes it the right shape. Its five bullets name foreground and background colour, line length,
justification, line spacing, and resize to 200%. Letter spacing is not among them.

The rule specification proposed 1.4.8. Filling the field with it would have printed a criterion
beside a finding it does not support, and the first reader who checked would have been right to
distrust everything else in the report.

**Decision** — `wcagRef` on this rule is left undefined. The explanation moves into the rule
description, which states what SC 1.4.12 requires, what this rule targets instead, and why the
tension between them is real rather than diplomatic. A rule with no criterion behind it says so.

**Consequences** — The report will carry a critical finding with no criterion next to it, so the
report layer must render an absent `wcagRef` as a normal state rather than as missing data. That is
the correct shape: the value of this tool is that its findings can be trusted, and rounding an
absent citation up to the nearest available number is the cheapest way to lose that. The rule
applies to everything built after this — 1.4.12 and 1.4.8 both stay available where a rule
genuinely breaches them, which is why `insufficient-line-height-for-script` cites 1.4.8 only when
the measured leading falls below the 1.5 that criterion actually names.

## 009 — The height condition in R11 is a specification error, and is removed

**Status:** Accepted
**Date:** 2026-08-10

**Context** — The rule specification for `clipped-stacked-marks` asks for four conditions at once:
the text carries stacked marks, **the element has a constrained height (`height` not `auto`, or
`-webkit-line-clamp`)**, `overflow: hidden`, and `scrollHeight > clientHeight + 1`.

The emphasised condition cannot be evaluated, and measurement is what settled it. `getComputedStyle`
reports the *used* height, so any element that generates a box reports a pixel length whether or not
the author wrote one: a plain paragraph in the fixtures reports `18px`. The value survives as `auto`
only on non-replaced inline elements, where it says nothing about the author either. So the test
"height is not `auto`" is true for essentially every block element on every page, and false for
inline ones regardless of what their CSS says. It separates block from inline, which is not the
question the rule is asking.

**Decision** — Drop the height condition from R11. The rule fires on stacked marks plus
`overflow: hidden` plus `scrollHeight > clientHeight + 1`, with `-webkit-line-clamp` kept as a
separate signal that a box is cutting text off.

Nothing is lost. A box that is hidden and scrolls past its own client height *is* constrained, by
definition and by measurement, whatever CSS produced it — the condition was a second, weaker way of
asking a question the overflow test already answers exactly.

This is recorded as an error in the specification rather than in the code, because the code never
had a chance to be right: the spec asked for a value the platform does not expose.

**Consequences** — R11 gets simpler and slightly broader: it will now also catch a box constrained
by a flex or grid parent rather than by its own `height`, which is a real way for this defect to
happen and would have been missed. The risk moves entirely onto the overflow test, so if R11 turns
out noisy, that is where to narrow it. See also decision 008 for the fields R9 and R11 need.

## 008 — Snapshot version 2: two values the rule layer cannot do without

**Status:** Accepted
**Date:** 2026-08-10

**Context** — Reading the eleven rule specifications against `TextNodeSnapshot` before building any
of them turned up two rules asking for values the snapshot does not carry. R9
(`unmirrored-directional-icon`) needs to know whether an icon was flipped, and R11
(`clipped-stacked-marks`) needs to know whether a box clamps its lines. Neither can be derived from
what was already captured, and both are browser values.

**Decision** — Add `transform` and `webkitLineClamp` to `TextNodeCss` and bump `snapshotVersion` to
2, now rather than when the rules that need them are written. The alternative — letting the rules
reach for a browser at the point of need — is the one failure mode the architecture exists to
prevent, and the fix is always to extend the snapshot.

Both fields are captured with the values Chromium actually reports, which had to be measured rather
than assumed:

- `transform` computes to a resolved matrix. `scaleX(-1)` arrives as `matrix(-1, 0, 0, 1, 0, 0)`,
  so R9 must match on the matrix and not on the function the author wrote.
- `-webkit-line-clamp` is read through `getPropertyValue`, because the clamp is still a prefixed
  property. It reports `none`, or the number of lines.

**Consequences** — Any stored snapshot from version 1 is missing both fields, so a report cannot be
regenerated from one against the current rules. That is what the version number is for. The cost of
capturing two more computed values per node is negligible next to the page load that produced them.

## 007 — Sixteen writing systems, and an honest gap

**Status:** Accepted
**Date:** 2026-08-10

**Context** — GlyphLint's pitch is about the readers mainstream tools ignore. It would be easy
for that pitch to quietly outrun the implementation, so this entry states the boundary in
writing.

**Supported.** The script layer models exactly these sixteen:

`latin` · `arabic` · `hebrew` · `devanagari` · `thai` · `lao` · `khmer` · `han` · `kana` ·
`hangul` · `cyrillic` · `greek` · `syriac` · `nko` · `thaana` · `mongolian`

Vietnamese is not among them and never will be: it is a profile flag on Latin, per decision 003.

**Not supported.** Everything else, including writing systems with very large readerships:

Bengali · Tamil · Telugu · Kannada · Malayalam · Gujarati · Gurmukhi · Odia · Sinhala ·
Burmese · Tibetan · Amharic and the rest of Ge'ez · Armenian · Georgian · Cherokee · Javanese ·
and every other script in Unicode.

Measured against the full Unicode table, **26,413 letters** fall outside the sixteen. Bengali
alone serves more readers than several supported scripts combined. This is a limit of ambition
and effort, not a judgement about which readers matter.

**Decision** — Do not quietly return nothing for text we cannot analyse. When a scan meets such
text, `ScanResult.unsupportedScript` reports how many nodes carried it and includes short
samples, and the CLI prints a notice on stderr. Detection works at the level of script *runs*,
not each node's dominant script, so a single Bengali paragraph inside an English page is still
reported.

We do not name the writing system, because naming it accurately would mean modelling it. A
sample lets a human identify it immediately, which is the honest version of what we know.

**Consequences** — A page in an unsupported script now produces a result that is visibly
different from a clean page, which is the whole point: silently reporting nothing is the exact
failure this project accuses other tools of, and we do not get to commit it ourselves. Adding a
script later means a new pattern in `detect.ts`, a new row in `properties.ts`, and entries in
`lang-map.ts` — the property row is the real work, since it requires knowing the typography, not
just the code points. Until then the README must not imply coverage this list does not have.

## 006 — The snapshot travels inside `ScanResult`

**Status:** Accepted
**Date:** 2026-08-10

**Context** — The data model defines `DomSnapshot` and `ScanResult` as separate shapes, and
`ScanResult` has no field for the snapshot. Read literally, the scanner captures a snapshot and
then has nowhere to put it: the rule layer would receive nothing to read, and `scriptsDetected`
would be a summary of data the caller never sees.

**Decision** — `ScanResult.snapshot?: DomSnapshot`, optional because a failed scan has no
snapshot to report. Analysis of the captured text happens in Node using the pure functions in
`src/scripts/`, never inside the page: we do not inject our own code into somebody else's site,
and `src/scripts/` stays a set of pure functions that does not know a browser exists.

**Consequences** — One scan produces one object carrying both audits and the evidence behind
them, which is what the report and campaign layers will need. The cost is result size: a page
with 3000 text nodes produces a large JSON document. If that becomes a problem for the campaign
runner, the fix is a serialisation option, not removing the field.

## 005 — The font probe reports suspicion, not fact

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `getComputedStyle` reports the *declared* font stack, not the font the browser
actually chose from it. A page can declare a Thai font it never loaded and the computed value
looks identical either way. The specification's method is to measure the text with the declared
stack against a family that deliberately does not exist: matching widths mean the declared stack
is contributing nothing.

Measured on four cases:

| Declared stack | Widths | Verdict |
|---|---|---|
| `Arial, sans-serif` | differ | correct — the stack is rendering |
| `"Noto Sans Thai", sans-serif` on Thai text | identical | correct — the font is not installed |
| a family that cannot exist | identical | correct — fallback |
| `"Times New Roman", serif` | identical | **false positive** |

The last row is the limit of the method. Times New Roman is the browser's last-resort font on
this machine, so a stack that resolves to it is indistinguishable by measurement from a stack
that failed entirely.

**Decision** — Implement the method as specified, and name the result honestly. The field is
`fallbackSuspected`, not `fallbackOccurred`. `renderedFamily` returns `null` when measurement
cannot single out a family, rather than guessing one.

**Consequences** — Any rule built on `fallbackSuspected` is a heuristic and must be marked as
one, and it will over-report on pages whose declared font happens to be the platform default.
The accurate alternative is Chrome DevTools Protocol `CSS.getPlatformFontsForNode`, which
reports the truly rendered font per element but costs a protocol round trip per node — unaffordable
at 3000 nodes. Revisit if the campaign shows this false positive is common.

## 004 — `unknown` is a counted outcome, and runs are mechanical

**Status:** Accepted
**Date:** 2026-08-10

**Context** — B.5 of the specification says to count characters per script and return `common`
when no scripted character exists. Read literally, a page written entirely in Bengali returns
`common`, because Bengali is not one of the sixteen scripts we model. Measured against the whole
of Unicode, 26,413 letters fall outside our table — Bengali, Armenian, Tamil, Ge'ez and others.
Calling all of them "text with no writing system" would hide exactly the kind of page this
project exists to notice.

The `ScriptRun` shape in B.1 is also silent on two points: what happens to spaces and
punctuation between runs, and what unit `length` is measured in.

**Decision** —

1. `dominantScript` counts `unknown` as a bucket. `common` is returned only when the text
   contains no letters at all: empty strings, digits, punctuation, emoji, whitespace.
2. Non-letters form their own `common` runs rather than being folded into a neighbour. The
   mapping is mechanical and reversible: concatenating every `run.text` reproduces the input.
3. `start` and `length` are UTF-16 offsets, so `input.slice(start, start + length) === run.text`.
   `start` can only be a string index, so measuring `length` in graphemes would be a silent trap.
4. Ties in `dominantScript` are broken by first appearance in the text, so the answer is stable.

**Consequences** — Rules must filter out `common` and `unknown` runs before reasoning about
typography; they carry no script requirements. In exchange, a rule can tell "this page is in a
script we have no table for" apart from "this page has no text", which is a distinction a report
should never lose. Revisit point 1 if `unknown` turns out to swamp real answers on mixed pages.

## 003 — Vietnamese is a profile on Latin, not a script

**Status:** Accepted
**Date:** 2026-08-10

**Context** — Vietnamese breaks in a way that looks script-shaped: it stacks two diacritics on
one vowel — a tone mark above a letter that already carries one — and that ink clips inside
fixed-height containers where plain Latin fits. The obvious move is to add `vietnamese` to
`ScriptId` and give it a row in the property table.

That move is factually wrong. Vietnamese is written in the Latin script. It has no script of
its own, no separate Unicode script property, and `Script_Extensions` will never return anything
but Latin for its letters. A `ScriptId` of `vietnamese` would be a language masquerading as a
writing system, and any reviewer who knows the subject would spot it immediately.

**Decision** — Vietnamese is a **profile flag on Latin**. `isVietnameseProfile(text)` in
`src/scripts/detect.ts` detects it, `VIETNAMESE_LATIN_PROPERTIES` in `src/scripts/properties.ts`
carries the one property that differs (`hasStackedMarks: true`), and rules that care pair the
two: `dominantScript(text) === 'latin' && isVietnameseProfile(text)`.

The detecting pattern is deliberately narrow — the stacked-diacritic range U+1EA0–U+1EF9 plus the
seven letters with their own base forms. Plain `á` and `è` are excluded because French and
Spanish have them, and including them would turn every European page into a Vietnamese one.

**Consequences** — The same shape is now available for any other language that stresses a script
it does not own, without inventing script ids for languages. The cost is that a rule cannot
switch on `dominantScript` alone when Vietnamese is involved; it must read the flag too. That is
the honest cost of modelling the world correctly rather than conveniently.

## 002 — Node 20 is the minimum supported runtime

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `engines.node` is a promise to whoever installs GlyphLint, so it has to match what
the mandated dependencies actually accept, not what we would like to support. The two runtime-
critical packages declare:

- `playwright@1.62.1` → `engines.node: ">=20"`
- `vitest@4.1.10` → `engines.node: "^20.0.0 || ^22.0.0 || >=24.0.0"` (development only)

Node 18 reached end of life and is excluded by both.

**Decision** — `engines.node: ">=20"`. Declaring `>=18` would be a false claim: `npm install`
would succeed and Playwright would then refuse to run.

**Consequences** — `Intl.Segmenter` and Unicode property escapes, the two built-ins the script
layer depends on, have been available since Node 16, so the script detection layer itself is not
what sets this floor — Playwright is. If Playwright is ever dropped or swapped, this floor should
be re-derived rather than inherited. Revisit when Node 20 reaches end of life.

## 001 — TypeScript 7, pinned to an exact version

**Status:** Accepted
**Date:** 2026-08-10

**Context** — `npm install typescript` now resolves to the 7.x line, which is the native-code
compiler: the package ships per-platform binaries as optional dependencies
(`@typescript/typescript-win32-x64` and 19 siblings) rather than a JavaScript `tsc`. The language
and the type system are unchanged from 5.x; the implementation underneath is not.

The project's correctness claims rest on the type checker. `strict`, `noUncheckedIndexedAccess`
and `verbatimModuleSyntax` are load-bearing here: they are what stops a rule from silently reading
`undefined` out of a `scriptRuns` array. A compiler that diagnoses differently between two
machines makes "it typechecks" meaningless.

**Decision** — Use TypeScript 7 and pin it exactly: `"typescript": "7.0.2"`, no caret.

Two reasons the caret is wrong here specifically. First, a major version this new is still moving,
and a minor bump can change which programs are diagnosed; that is a compiler upgrade, and a
compiler upgrade should be a commit someone reviewed, not a side effect of a fresh `npm install`.
Second, the platform binaries must match the lockfile exactly, or Windows, Linux and CI end up
compiling with different builds.

**Consequences** — Upgrades become deliberate: bump the version, run `npm run typecheck`, and
record the result. If TypeScript 7 turns out to diverge from 5.x on anything this project relies
on, the fallback is a pinned `typescript@5.x`, which requires no source change — nothing in the
code targets a 7-only feature. Only `typescript` is pinned; the other dependencies keep carets,
because none of them decides whether the code is correct.

<!-- Newer entries go above this line. -->

