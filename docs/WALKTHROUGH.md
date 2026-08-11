# GlyphLint, file by file

Written for one reader: **you, six months from now, without the person who helped you build it, and
not fluent in code.** Every file gets a sentence about what it does, a paragraph about why it is the
way it is, and — the part that matters when something breaks — a note about where it is most likely
to go wrong.

Read the three shapes first. Everything else is easier once those are in your head.

---

## The three shapes everything else depends on

### 1. `DomSnapshot` — what one page looked like

The scanner opens a page in a real browser and writes down what it found: every visible run of text,
the CSS the browser actually computed for it, how big its box is, what `lang` and `dir` were in
force, and whether the declared font seems to be rendering. That written-down copy is a
`DomSnapshot`.

**Why it exists.** A rule that can reach into a live browser can do anything — make a network
request, read a cookie, behave differently on a Tuesday. A rule that can only read a snapshot can be
tested in a millisecond, argued with in a code review, and trusted to give the same answer twice.

**The rule you must not break:** if a rule needs a fact it cannot see, you do **not** give the rule a
browser. You add the field to the snapshot, capture it, and bump `snapshotVersion`. This has already
happened three times (decisions 008 and 011), and each time the alternative would have quietly
destroyed the reason to believe any finding.

### 2. `Violation` — one finding of ours

A rule id, a severity, a **confidence**, the writing system it is about, a CSS selector, a snippet of
the offending text, and three separate sentences: what is wrong, why it matters *for that writing
system*, and how to fix it.

**Why three sentences instead of one message.** A single blob of prose lets a rule author describe
the CSS and stop. Forcing `whyItMatters` to exist forces every rule to answer the only question that
justifies this project: what does this do to somebody reading that language?

### 3. The two-layer result — `standard` and `scriptAware`

`ScanResult` has axe-core's findings in one field and ours in another. They are never merged, never
summed, and never sorted into one list.

**This is the whole product.** Any tool can produce a long list of problems. What makes this one
worth trusting is that you can always see which findings came from a mature, widely-reviewed engine
and which came from eleven rules written by one person. The day those two numbers get added together
is the day the project stops being honest.

---

## `src/scripts/` — what writing system is this text in?

Pure. No browser, no network. This layer knows about Unicode and nothing else.

| File | What it does |
|---|---|
| `detect.ts` | Splits a string into runs by writing system, and names the dominant one. |
| `properties.ts` | The table: for each of sixteen scripts, is it cursive, right-to-left, caseless, spaceless; does it stack marks; how much leading it needs. |
| `lang-map.ts` | Which `lang` values legitimately go with which script — so Persian written in Arabic script is not reported as a mismatch. |

**Why it is built this way.** Detection uses JavaScript's built-in Unicode property escapes
(`\p{Script_Extensions=Arabic}`), which means the boundaries come from the Unicode standard rather
than from a list somebody typed. That is why there is no dependency here and why the detection is
not really open to argument.

**`properties.ts` is the actual product.** Everything else is plumbing around this table. It is also
the file most likely to be wrong, because every row is a claim about typography — and the README
says plainly which of those claims are sourced and which are estimates.

**Where it breaks.** Two known weak spots, both documented: `unknown` is returned for the ~26,000
Unicode letters outside the sixteen modelled scripts (decision 007), and Vietnamese is handled as a
*profile flag on Latin* rather than a script, because it genuinely is Latin (decision 003). If you
ever feel tempted to add `vietnamese` to `ScriptId`, read that decision first.

---

## `src/scanner/` — the only part that touches a browser

Impure, and quarantined on purpose.

| File | What it does |
|---|---|
| `scan.ts` | Opens Chromium, runs axe-core, captures the snapshot, runs our rules, returns both sides. |
| `capture.ts` | The code that runs *inside* the page to collect text and computed styles. |
| `errors.ts` | Turns a browser failure into a sentence a human can act on: DNS, timeout, SSL, wrong content type. |
| `filter.ts` | Narrows findings when the caller asked for fewer. Pure, despite living here. |

**Why `errors.ts` exists at all.** A scanner that prints a stack trace at somebody who mistyped a URL
is a scanner nobody uses twice. Every failure kind has a written sentence.

**Where it breaks.**

- `capture.ts` runs inside the page, so it cannot use anything from the rest of the project — the
  browser has never heard of your imports. Everything it needs must be inlined or passed in.
- The **font probe** measures the declared font stack against a family that cannot exist, and calls
  it `fallbackSuspected` rather than `fallbackOccurred` because it genuinely cannot tell a failed
  stack from one that resolved to the platform's default font (decision 005). Any rule built on it
  is a heuristic and is marked as one.
- A page that never stops loading is handled by the timeout, and the timeout is why the campaign
  reports failures instead of hanging.

---

## `src/rules/` — the eleven checks

Pure functions, one file each. Each exports a `Rule`: metadata plus a `check(snapshot)` that returns
findings.

| Group | Rules |
|---|---|
| Script integrity | `cursive-script-letter-spacing`, `insufficient-line-height-for-script`, `missing-script-font-coverage`, `case-transform-on-caseless-script` |
| Direction and layout | `missing-dir-attribute`, `lang-script-mismatch`, `physical-css-in-bidi-context`, `unisolated-bidi-run`, `unmirrored-directional-icon` |
| Line breaking and clipping | `unsafe-word-break-for-script`, `clipped-stacked-marks` |

`helpers.ts` holds the shared arithmetic — counting graphemes, cutting snippets on grapheme
boundaries, building a `Violation` from a rule — so that "fifteen characters" means exactly the same
thing in every rule that says it. `index.ts` is the registry and `runRules`, which is the only way
anything else runs them, and which sorts the output so two runs of the same page can be diffed.

**Two things to know before editing a rule.**

1. **`limitations` is not documentation.** It is printed verbatim next to the rule's findings in
   every report. It is the sentence that tells a reader when *not* to believe this rule, and it is
   the reason a heuristic here is not the same thing as a heuristic in a tool that hides its
   uncertainty.
2. **A rule may grade one of its own findings below its declared severity** (decision 012), and the
   filters read the finding rather than the rule. `missing-dir-attribute` is the case this exists
   for.

**Where it breaks — the three scars worth knowing:**

- `physical-css-in-bidi-context` reports `text-align` only. It was originally written to report
  `margin-left` too, and the first real run flagged the *correct* code: in a right-to-left context,
  `margin-inline-start` computes to exactly the same value as `margin-right`, so there is nothing
  left to tell them apart (decision 013). A rule that argues against its own recommended fix is the
  worst thing this project could ship.
- `unisolated-bidi-run` was specified to check the `unicode-bidi` CSS property. Measured in
  Chromium, that silenced it everywhere, because the browser's own stylesheet puts
  `unicode-bidi: isolate` on every block element (decision 014). It now reads the text instead.
- `clipped-stacked-marks` measures layout, not ink. A mark clipped by a tight line height inside a
  box that fits its line is invisible to it — that case belongs to
  `insufficient-line-height-for-script`, and both rules name the other in their limitations
  (decision 015).

---

## `src/report/` — turning results into something readable

Pure. No clock, no filesystem, no environment. Given the same result it always produces the same
bytes, which is what lets a report be regenerated from a stored scan and compared with the original.

| File | What it does |
|---|---|
| `model.ts` | Counts and groups one scan into the structure every renderer reads. Two sections, no combined total anywhere. |
| `html.ts` | The single-page report: one file, all CSS inlined, no JavaScript, nothing fetched. |
| `json.ts` | The machine-readable mirror, with `source` on every finding. |
| `terminal.ts` | The coloured summary. Colour is a *parameter* — a pure module does not get to know what a TTY is. |
| `rules-table.ts` | What `glyphlint rules` prints, derived from the registry so it cannot drift. |
| `metrics.ts` | The README numbers block, and the generated caveats under it. |
| `campaign-html.ts` | The published campaign page, rendered from committed results. |

**The report is scanned by GlyphLint itself**, in both text directions, in
`tests/scanner/report-self-audit.test.ts`. That test has already caught two real defects in our own
output: a scrollable code block that could not be reached by keyboard (axe found it), and quoted Thai
text set in a monospace font that cannot render Thai — the exact defect
`missing-script-font-coverage` exists to report, committed by the report itself.

**Where it breaks.** Every string that came from a scanned page must go through `escapeHtml`. Every
excerpt of page text is wrapped in `<bdi dir="auto"><samp>` — `bdi` so an Arabic sentence cannot drag
our punctuation to the wrong end of the line, `dir="auto"` because we know the *script* and a script
is not a direction, `samp` because it is quoted data rather than prose. And every CSS property is
logical (`margin-inline-start`, never `margin-left`), or the self-audit fails when it renders the
page right-to-left.

---

## `src/campaign/` — scanning many sites, responsibly

Impure, except where noted.

| File | What it does | Pure? |
|---|---|---|
| `robots.ts` | Parses a `robots.txt` and answers "may we fetch this path?" | Yes |
| `permission.ts` | Fetches the `robots.txt` and turns the response into a decision. | No |
| `targets.ts` | Validates `sites/targets.json` before a single request is made. | Yes |
| `runner.ts` | The loop: ask permission, scan, wait, record, move on. | No |
| `aggregate.ts` | Ranks issues, computes percentages, counts what happened. | Yes |

**The ethics live in three specific places, and they are not decoration:**

1. **`permission.ts` treats an unreachable `robots.txt` as a refusal.** A `404` means "no rules
   exist, help yourself". A `500` or a timeout means we could not establish permission, and
   permission that cannot be established is not assumed. This is why one site in the real campaign
   was skipped rather than scanned.
2. **`runner.ts` will not go faster than one site every two seconds** for any host that is not
   loopback, whatever the caller passes. `--delay` can raise the floor and cannot lower it.
3. **The User-Agent says exactly what we are** and does not imitate a browser (decision 021). Two
   Iranian news sites in the real campaign answered that honest string with an error page rather
   than their homepage. Those two sites appear in the results as sites that *answered but were not
   measured*, and the README names them — because a scanner that quietly counted them as clean pages
   would be the exact failure this project accuses other tools of.

**Where it breaks.** The robots parser does not normalise percent-encoding, which is fine for
homepages (`/`) and could matter for a deep path. A site behind a bot-detection service will fail or
serve an error page, and that outcome is recorded rather than worked around. And the per-site
timeout abandons a scan rather than cancelling it, so the CLI exits deliberately once results are
written — otherwise Node would wait for a browser nobody is watching.

---

## The shell — the impure top level

| File | What it does |
|---|---|
| `cli-args.ts` | Pure. Turns an array of strings into a description of what was asked for. |
| `cli.ts` | Impure. Reads argv, writes files, picks the exit code. |
| `metrics.ts` | `npm run metrics`: rewrites the README numbers from the newest results file. |
| `campaign-report.ts` | Renders the published campaign page from committed results. |
| `types.ts` | The shared contract every layer agrees on. |

**The exit codes are a promise to CI, not a convenience:** `0` clean, `1` findings, `2` the page
could not be scanned, `3` the command line was wrong. A tool that answers "your site has problems"
and "the scanner fell over" with the same number makes a red build unreadable.

**Why parsing is split from the shell.** `cli-args.ts` is pure, so the entire command surface is
tested without launching a browser or writing a file — that is the difference between a CLI you can
refactor and one you are afraid of.

---

## `tests/` — and why there are so many

| Directory | Needs a browser? | What it proves |
|---|---|---|
| `tests/scripts/` | No | Detection is right, against real samples in real scripts. |
| `tests/rules/` | No | Each rule fires when it should and stays quiet when it should not. |
| `tests/report/` | No | Escaping, self-containment, the two sections, the generated numbers. |
| `tests/campaign/` | Mostly no | robots parsing, target validation, aggregation; `runner.test.ts` drives real local servers. |
| `tests/cli/` | No | Every flag, every rejection message. |
| `tests/scanner/` | **Yes** | The rules against pages a real Chromium rendered, and the self-audit. |

**The trap `tests/scanner/rules-on-fixtures.test.ts` exists to prevent.** The pure rule tests use
hand-written snapshots, and a hand-written snapshot can contain a value Chromium would never produce
— `letter-spacing: 0.12em` where a browser reports `1.92px`, `text-align: left` where it computes
`start`. Rules tested against fiction stay green while being wrong about every real page. That file
runs the same rules against snapshots a real browser produced.

**The samples in `tests/scripts/detect.test.ts` are typed** so that a script with no samples fails to
compile. Do not "tidy up" a test by deleting its Arabic, Thai or Hebrew strings: those strings are
the data, and without them there is nothing to test.

---

## The honesty machinery, and why it is worth the trouble

Four mechanisms exist purely so the numbers can be trusted. They cost real effort and they are the
reason the project is worth publishing:

1. **Every threshold carries a `source`** — a WCAG criterion, a named W3C layout document, or
   `"estimate"`. There is no fourth option, and inventing a citation is the one unforgivable act
   here: it would poison every other number in the report.
2. **Every rule carries a `confidence`**, and `heuristic` findings are badged in the report rather
   than buried in a footnote.
3. **Every README number is generated** by `npm run metrics` from a committed results file, and CI
   fails if the README has drifted from the evidence. The uncomfortable facts under the results —
   including "the rule this project was built around barely fired" — are generated from the same
   data, so they cannot be edited away from the figures they qualify.
4. **The tool scans its own report** and fails the build if either layer finds anything.

---

## If you come back to this and something is broken

Start here:

- **Tests fail after `npm install`** — you almost certainly need `npx playwright install chromium`.
  Half the suite drives a real browser.
- **A rule fires on a page that is fine** — read its `limitations` first; the answer is often already
  written there. Then narrow the rule and add the page as a fixture. Never widen a rule to make a
  number look better.
- **A rule stopped firing** — check `snapshotVersion`. A stored snapshot from an older version is
  missing fields the current rules read.
- **CI fails on the README** — `npm run metrics` and commit the result. The README drifted from the
  results file, and the results file is what actually happened.
- **The campaign hangs** — a site is past the per-site timeout. It will be recorded as failed, and
  the run continues.
- **You want to add a number to the README** — you cannot, by hand. Produce it from a campaign, or
  do not publish it.
