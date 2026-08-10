# GlyphLint — specification

## 1. What we are building

GlyphLint is a CLI accessibility scanner that detects accessibility defects caused by
**writing systems**, not by markup.

Every mainstream accessibility tool encodes one silent assumption: text is Latin,
left-to-right, made of disconnected letters, and has upper and lower case. That assumption is
false for roughly half the world's readers, and when it breaks, the tools stay silent — the
page passes every audit while being visibly broken to the people who read it.

GlyphLint runs `axe-core` for standard WCAG coverage, then adds a **script-aware rule layer**
on top of it, and reports the two categories separately so the added value is measurable and
never overstated.

**One-line pitch:** *The accessibility checks that only appear when your text isn't English.*

## 2. The failure matrix

This table drives everything the project does.

| Writing system | What breaks | Detected by axe / Lighthouse / WAVE |
|---|---|---|
| Arabic, Persian, Urdu | `letter-spacing` severs cursive joining; words render as disconnected glyphs | No |
| Hebrew, Arabic | Missing direction, missing bidi isolation, physical CSS in RTL context | No |
| Thai, Lao | Stacked tone marks clipped; no inter-word spaces, so `break-all` destroys meaning | No |
| Devanagari (Hindi, Marathi) | Conjunct clusters and insufficient leading | No |
| Vietnamese | Double-stacked diacritics clipped inside fixed heights | No |
| Chinese, Japanese, Korean | Line-breaking rules; `text-transform` is meaningless | No |
| All non-Latin | `lang` contradicting the actual script → wrong screen-reader voice | Partially |

`axe-core` is excellent and deliberately language-neutral: it checks structure, not
typography-per-script. Checking scripts requires a table of per-script typographic
requirements that nobody has attached to a linter. That table is this project.

## 3. Non-goals — do not build

- Automatic code fixing
- Pages behind authentication
- Screen reader simulation
- AI/LLM evaluation of pages
- PDF scanning
- Crawling beyond the given URL
- Re-implementing anything `axe-core` already does — contrast, ARIA, heading order, alt text
  are all delegated to axe

A request that falls into this list is refused with a citation of this section.

## 4. Principles

1. **Build on top of axe-core, never against it.** Structure and docs must make this obvious.
2. **Pure rules.** Every rule is a pure function over a snapshot: no network, no browser, no
   shared state.
3. **No number before measurement.** Nothing goes in the README until a real campaign
   produced it.
4. **Honest heuristics.** A threshold without a source is the most dangerous thing in a
   linter. Cite it or label it an estimate.
5. **English everywhere in the artifact.** Code, identifiers, comments, docs, commits,
   violation text, report UI.
6. **Responsible scanning.** Public homepages only, rate-limited, `robots.txt` respected,
   constructive language.
7. **Windows-first.** Every documented command must run in PowerShell.

## 5. Technology

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict: true` | Type safety across the snapshot contract |
| Browser | `playwright` (Chromium, headless) | Computed styles need a real engine |
| Standard rules | `@axe-core/playwright` | Do not reinvent |
| Tests | `vitest` | Fast, TS-native |
| Script detection | Built-in `RegExp` Unicode property escapes | Zero dependency, correct by definition |
| Segmentation | Built-in `Intl.Segmenter` | Graphemes and words, incl. Thai/Japanese, no dependency |

No other runtime dependency may be added without the project owner's approval and a stated
reason.

## 6. Module map

```
src/
  scripts/      writing-system detection + per-script property tables   (pure)
  scanner/      Playwright orchestration, axe run, snapshot capture     (impure, isolated)
  rules/        script-aware rules, one file each                       (pure)
  report/       HTML / JSON / terminal renderers                        (pure)
  campaign/     multi-site runner, robots.txt, aggregation              (impure)
  cli.ts
  types.ts
tests/fixtures/   small local HTML files
sites/targets.json
docs/
```

Only `scanner/` and `campaign/` are impure. If a rule ever needs a browser API, the fix is to
capture that value into the snapshot — never to make the rule impure.

## 7. Threshold sourcing policy

Every threshold in the per-script property tables carries a `source` field, one of:

- `"wcag-1.4.12"` — WCAG 2.1 SC 1.4.12 *Text Spacing* requires content to remain usable at a
  line height of 1.5× font size. This anchors the 1.5 baseline and is a real, citable source.
- `"w3c-layout-req"` — W3C i18n layout requirements (ALREQ Arabic, HLREQ Hindi, JLREQ
  Japanese, CLREQ Chinese). The specific document must be named.
- `"estimate"` — our judgement, not sourced. Every `estimate` must appear in the README, and
  any rule depending on one is marked heuristic.

Never invent a citation.

## 8. Reference standards

- UAX #24 — Unicode Script property and `Script_Extensions`
- UAX #29 — Unicode text segmentation
- WCAG 2.1 SC 1.4.12 — Text Spacing
