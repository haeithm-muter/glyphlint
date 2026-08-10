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

