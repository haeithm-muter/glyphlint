# glyphlint
Accessibility scanner for writing systems that mainstream tools ignore — cursive joining, stacked marks, bidi layout. Built on axe-core.

## Thresholds, and where each one comes from

Every rule compares a page against numbers. All of them are listed here, sourced or labelled an
estimate, because a threshold with no stated source is the most dangerous thing in a linter.

| Threshold | Value | Source |
|---|---|---|
| Line height, thirteen writing systems | 1.5 × font size | **WCAG 2.1.** Two criteria name 1.5: SC 1.4.12 Text Spacing, for spacing the reader applies, and SC 1.4.8 Visual Presentation (AAA), which requires at least space-and-a-half within paragraphs from the author. The property table records the first; a finding cites the second, and only when the measured value falls below it. |
| Line height, Thai / Lao / Khmer | 1.6 × font size | **Estimate.** Ours. No standards document states it. |
| Letter-spacing noise floor | 0.01 px | **Estimate.** Below this, a computed value is rounding left over from relative units rather than a decision anyone made. |
| Minimum text for a letter-spacing finding | 2 graphemes | **Estimate.** A join needs two letters. |
| Single-line box, excluded from line-height findings | client height < 2 × font size | **Estimate.** A box shorter than two lines holds one line, which cannot collide with anything. |
| Minimum text for a font-coverage finding | 4 graphemes | **Estimate.** Two glyphs can measure identically in two fonts by coincidence; a short word rarely does. |
| Maximum Latin share for a case-transform finding | 20% of lettered graphemes | **Estimate.** Above it, `text-transform` has real Latin text to act on. |
| Minimum right-to-left text before a missing `dir` is reported | 15 graphemes | **Estimate.** Below it the text is a brand name or a loanword, which the bidirectional algorithm places correctly on its own. |
| Minimum text before a language/script mismatch is reported | 20 graphemes, 80% in one script | **Estimate.** A heading or a quoted phrase in another language is not a mismatch. |
| Minimum embedded run before a bidi isolation finding | 2 graphemes | **Estimate.** A single character is an initial or a footnote marker. |

Three things this table is honest about:

- **The 1.6 has nothing behind it.** Every finding that rests on it says so in its own text, and
  the rule that uses it is marked `heuristic`.
- **The line-height table is not yet per-script.** It is one sourced number applied to thirteen
  writing systems, plus one estimate applied to three. Deriving real per-script values from the
  W3C layout requirement documents — ALREQ, HLREQ, JLREQ, CLREQ — is work that has not been done,
  and the property table currently cites none of them.
- **The flags and the thresholds disagree in one place.** Ten writing systems are marked as having
  stacked marks; only three of them carry the raised ratio. Arabic and Devanagari are measured by
  the same leading as Latin despite placing ink outside the Latin em box.

## Standards referenced

UAX #24 (Script and `Script_Extensions`) · UAX #29 (text segmentation) · WCAG 2.1 SC 1.4.8 and
SC 1.4.12.
