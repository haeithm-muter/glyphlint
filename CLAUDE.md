# GlyphLint — working agreement

GlyphLint is a CLI accessibility scanner that detects defects caused by **writing systems**,
not by markup. It runs `axe-core` for standard WCAG coverage, then adds a **script-aware rule
layer** on top of it, and reports the two categories separately.

- Product specification: [SPEC.md](SPEC.md)
- Architectural decisions: [DECISIONS.md](DECISIONS.md)

Read both before changing anything structural.

---

## Tech stack — fixed

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict: true` | Type safety across the snapshot contract |
| Browser | `playwright` (Chromium, headless) | Computed styles need a real engine |
| Standard rules | `@axe-core/playwright` | Do not reinvent |
| Tests | `vitest` | Fast, TS-native |
| Script detection | Built-in `RegExp` Unicode property escapes | Zero dependency, correct by definition |
| Segmentation | Built-in `Intl.Segmenter` | Graphemes and words, incl. Thai/Japanese, no dependency |

**No other runtime dependency may be added without asking the project owner and explaining why.**
That includes "small" utilities. `tsx`, `ts-node`, `lodash`, a regex helper, a CLI framework —
all require an explicit yes.

---

## Setup and commands (PowerShell)

First-time setup:

```powershell
npm install
npx playwright install chromium
```

`npm install` does **not** download the browser: the install runs with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, so `npx playwright install chromium` is a required,
separate step before any scan.

Which parts need the browser:

| Needs Chromium | Does not |
|---|---|
| `npm run scan`, `npm run campaign`, `tests/scanner/`, and `tests/campaign/runner.test.ts` | `src/scripts/`, `src/rules/`, `src/report/`, the pure half of `src/campaign/` (`robots`, `targets`, `aggregate`), and their tests |

`npm test` runs both, so a working checkout needs the browser installed. The scanner tests take
about a minute because each one drives a real page load; the pure tests finish in under a second.

Daily commands:

```powershell
npm run typecheck
```

```powershell
npm test
```

```powershell
npm run build
```

```powershell
npm run scan -- https://example.com
```

```powershell
npm run campaign -- --input sites/targets.json
```

Every documented command must run in PowerShell on Windows. No `&&` chains, no bash-only
syntax, no `NUL`/`/dev/null` in documentation.

---

## Architecture

```
src/
  scripts/      writing-system detection + per-script property tables   (pure)
  scanner/      Playwright orchestration, axe run, snapshot capture     (impure, isolated)
  rules/        script-aware rules, one file each                       (pure)
  report/       HTML / JSON / terminal renderers                        (pure)
  campaign/     multi-site runner, robots.txt, aggregation              (impure)
  cli-args.ts   argument parsing, one function over an array of strings (pure)
  cli.ts        the impure shell: argv, files, exit codes
  types.ts
tests/fixtures/   small local HTML files
sites/targets.json
docs/
```

**Only `scanner/` and `campaign/` are impure.** Everything else is pure functions over data.

**The snapshot is a hard contract.** Rules read `DomSnapshot` and nothing else — no DOM, no
network, no browser handle. If a rule needs information it does not have, the fix is to
extend `TextNodeSnapshot`, extend the capture code, and bump `snapshotVersion`. The fix is
never to make the rule impure.

---

## Code style

- English everywhere: identifiers, comments, docs, commit messages, violation text, report UI.
- ESM with `NodeNext` resolution, so relative imports carry a `.js` extension even though the
  source file is `.ts` (`import { detectScript } from './detect.js'`). This is correct, not a typo.
- `verbatimModuleSyntax` is on: type-only imports must be written `import type { ... }`.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`. Handle it; do not
  silence it with `!`.
- Named exports. No default exports outside config files.
- Comments explain *why*, especially for Unicode and typography decisions. A threshold with no
  explanation is a bug waiting to be argued about.
- Every threshold value carries a `source` field: `"wcag-1.4.12"`, `"w3c-layout-req"`, or
  `"estimate"`. **Never invent a citation.** If unsure, it is an `"estimate"`.

---

## Do not touch / do not do

1. **Do not modify, filter, re-score or re-word axe-core results.** They pass through untouched
   and stay labelled as axe's. The value of this project depends on that separation being visible.
2. **Do not make `rules/`, `scripts/` or `report/` impure.** No network, no browser, no clock,
   no filesystem, no shared mutable state.
3. **Do not add a dependency** without asking first.
4. **Do not put a number in `README.md` before a real campaign measured it.** No "detects 40%
   more issues", no invented benchmark.
5. **Do not invent a citation** for a threshold. `"estimate"` is an honest answer; a fake W3C
   reference is not.
6. **Do not write Arabic (or any non-English) prose into the repository.** Explanations to the
   owner happen in chat, in Arabic, and never enter the artifact.
   The one exception is **text under test**: `tests/` and `tests/fixtures/` must contain real
   Arabic, Thai, Hebrew, Devanagari and other samples, because a script-aware linter cannot be
   tested without them. At least three samples per script are required; the `SAMPLES` table in
   `tests/scripts/detect.test.ts` is typed so that a script with no samples fails to compile.
   Those strings are data, not language: every identifier, comment and test name around them
   stays English. Do not "clean up" a test by deleting its samples.
7. **Do not edit `dist/`** — it is generated by `npm run build`.
8. **Do not edit `LICENSE`.**
9. **Do not build anything on the non-goals list** in [SPEC.md](SPEC.md): auto-fixing,
   authenticated pages, screen-reader simulation, LLM evaluation of pages, PDF scanning,
   crawling beyond the given URL, or re-implementing what axe-core already does. If a request
   falls into that list, refuse and cite the section.
10. **Scan responsibly:** public homepages only, rate-limited, `robots.txt` respected,
    constructive language in every message a site owner might read.

---

## Working rhythm

The project is built in stages. Implement only the stage that was asked for; do not jump ahead.
Before writing code for a stage, show a short plan and wait for approval. After a stage, stop.
