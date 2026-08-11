# Contributing to GlyphLint

The contribution this project wants most is **a writing system it gets wrong**. If you read a
language whose typography this tool mishandles or ignores, you know something the code needs, and
you do not have to write TypeScript to give it: an issue that says "my language breaks like *this*,
here is a page that shows it" is genuinely useful on its own.

## Setting up

```powershell
npm install
```

```powershell
npx playwright install chromium
```

The browser download is skipped during `npm install` on purpose, so the second command is required
before anything that loads a page will run.

```powershell
npm run typecheck
```

```powershell
npm test
```

```powershell
npm run build
```

The suite takes about two minutes, because roughly half of it drives a real Chromium against local
fixtures. The pure tests — script detection, rules, report rendering, robots parsing, aggregation —
finish in under a second and need no browser.

Every documented command must run in PowerShell on Windows. No `&&` chains, no bash-only syntax.

### The tests depend on the fonts your machine has

This is worth knowing before you spend an hour on a failure that is not your fault.

Roughly half the suite loads real pages in a real browser and measures how text is laid out. Text is
laid out by a font, so a machine with no font for Arabic, Hebrew, Thai or Devanagari lays that text
out differently — or draws it as empty boxes — and tests that measure clipping, line height or font
coverage can fail for that reason alone.

Two rules are affected in particular:

- **`missing-script-font-coverage`** compares the declared font stack against a family that cannot
  exist. On a system with no font for the script in question, both measure the same, so the rule
  reports a page whose stack is fine. That is decision 005, and it is why the rule is `heuristic`.
- **`clipped-stacked-marks`** compares content height against box height. Different fonts produce
  different heights, and a fixture whose overflow is small can flip either way.

Windows and macOS ship fonts for these scripts. A bare Linux container usually does not, and
`npx playwright install --with-deps chromium` does not add them — its dependency set covers Latin,
CJK and emoji. On Debian or Ubuntu:

```bash
sudo apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-cjk
```

CI does exactly this, for exactly this reason. If a scanner test fails only for you, check
`fc-list :lang=ar` before you change any code.

## Adding a writing system

1. **Detection** — [`src/scripts/detect.ts`](src/scripts/detect.ts). Detection uses Unicode
   `Script_Extensions` property escapes, so this is usually one line and it is correct by definition
   rather than by our judgement.
2. **Properties** — [`src/scripts/properties.ts`](src/scripts/properties.ts). Is the script cursive,
   right-to-left, caseless, written without spaces between words; does it stack marks; what leading
   does it need. **This is the real work.** It requires knowing the typography, not the code points.
3. **Language mapping** — [`src/scripts/lang-map.ts`](src/scripts/lang-map.ts), so a `lang`
   attribute in that language is not reported as a mismatch with its own script.
4. **Samples** — at least three, in the `SAMPLES` table in
   [`tests/scripts/detect.test.ts`](tests/scripts/detect.test.ts). The table is typed so a script
   with no samples **fails to compile**. Real text, not transliteration.
5. **A decision entry** in [DECISIONS.md](DECISIONS.md) if you made a judgement call.

A pull request that adds a script but no samples cannot be merged, because it cannot be compiled.

## The rules this project holds itself to

These are not style preferences. They are why anyone should believe a finding.

**Never modify axe-core's output.** Its findings pass through untouched, stay labelled as axe's, and
are never re-scored, re-worded or merged into ours. Filters may narrow what is *displayed*, and
whatever they withhold is counted and printed.

**Never invent a citation.** Every threshold carries a `source`: `"wcag-1.4.12"`, `"w3c-layout-req"`
with the specific document named, or `"estimate"`. `"estimate"` is an honest answer. A fake W3C
reference is not, and one of them would poison every other number in the report.

**Keep the pure layers pure.** `src/scripts/`, `src/rules/` and `src/report/` have no network, no
browser, no clock, no filesystem and no shared mutable state. If a rule needs something it cannot
see, extend `TextNodeSnapshot`, extend the capture code, and bump `snapshotVersion` — never make the
rule impure.

**No number before measurement.** Nothing goes in the README until a real campaign produced it, and
`npm run metrics` must be able to regenerate it from a committed results file. CI fails if the
README has drifted from the evidence.

**No new runtime dependency without asking.** That includes small utilities. The zero-dependency
claim is load-bearing: `playwright` and `@axe-core/playwright` are the only two, and the robots.txt
parser was written in-repo rather than installed for exactly this reason.

**English everywhere in the repository** — identifiers, comments, docs, commit messages, report
text. The one exception is text under test: `tests/` must contain real Arabic, Thai, Hebrew,
Devanagari and other samples, because a script-aware linter cannot be tested without them. Those
strings are data; everything around them stays English.

**Responsible scanning is not negotiable.** Public pages only, one at a time, at least two seconds
between sites, `robots.txt` fetched and honoured, a User-Agent that says plainly what we are.
GlyphLint does not imitate a browser to get past bot detection, and a site that blocks it is
recorded as blocked rather than worked around.

## What this project will not accept

The non-goals in [SPEC.md](SPEC.md) are refused with a citation, every time: automatic code fixing,
authenticated pages, screen-reader simulation, LLM evaluation of pages, PDF scanning, crawling
beyond the given URL, and re-implementing anything axe-core already does.

## Reporting a false positive

Please do. A rule that reports a page which is actually fine costs more than a rule that stays
quiet, and every rule here can be narrowed. Use the false-positive issue template and include the
URL or a minimal HTML fixture — a fixture is what turns your report into a test.

## Pull requests

- One change per pull request, with tests.
- `npm run typecheck` and `npm test` green.
- If you changed a threshold or a rule's behaviour, say why in DECISIONS.md.
- Commit messages in English, in the imperative: `feat: add Bengali script properties`.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
