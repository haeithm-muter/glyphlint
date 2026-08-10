/**
 * R9 — a directional glyph in a right-to-left context that nothing has mirrored.
 *
 * "Next" points the way the reader is going. In Arabic or Hebrew that is leftward, so an arrow
 * copied from the left-to-right design points backwards — and unlike a layout bug, it does not
 * look broken. It looks like a button that goes the other way.
 */

import type { DomSnapshot, Rule, Violation } from '../types.js';
import { SCRIPT_LABELS, propertiesFor, scriptsWhere, violationFrom } from './helpers.js';

/**
 * Arrows and angle marks written as characters.
 *
 * Only the horizontal ones. Up and down arrows mean the same thing in every direction, and a
 * rule that mirrored them would be introducing the bug it exists to find.
 */
const DIRECTIONAL_GLYPHS = /[←→‹›«»⟵⟶⇐⇒◀▶◄►]/u;

/**
 * Class names that name a direction.
 *
 * A convention, not a standard — which is why this rule is a heuristic and says so.
 */
const DIRECTIONAL_CLASS = /(arrow|chevron|caret|angle)[-_](left|right)/i;

/**
 * Whether a computed transform reverses or turns the glyph.
 *
 * Measured rather than assumed: the computed value is always a resolved matrix, never the function
 * the author wrote. `scaleX(-1)` arrives as `matrix(-1, 0, 0, 1, 0, 0)` and `rotate(180deg)` as
 * `matrix(-1, 0, 0, -1, 0, 0)`, so searching the string for `scaleX` finds nothing on a page that
 * mirrors every icon correctly.
 *
 * A horizontal reversal shows up as a negative first coefficient; a rotation or a skew shows up as
 * a non-zero second or third. A translation or a positive scale is neither, and leaves the glyph
 * pointing exactly where it was.
 */
function reversesOrTurns(transform: string): boolean {
  const value = transform.trim();
  if (value === '' || value === 'none') return false;

  const open = value.indexOf('(');
  const close = value.lastIndexOf(')');
  if (open === -1 || close <= open) return false;

  const numbers = value
    .slice(open + 1, close)
    .split(',')
    .map((part) => Number.parseFloat(part.trim()));
  if (numbers.some((entry) => !Number.isFinite(entry))) return false;

  // `matrix()` carries six values, `matrix3d()` sixteen. In both, the horizontal axis is the first
  // coefficient and the shear terms are the two beside it.
  const [a, b, c] = numbers.length === 16 ? [numbers[0], numbers[1], numbers[4]] : numbers;
  if (a === undefined || b === undefined || c === undefined) return false;

  return a < 0 || b !== 0 || c !== 0;
}

export const unmirroredDirectionalIcon: Rule = {
  id: 'unmirrored-directional-icon',
  title: 'Directional icon not mirrored in a right-to-left context',
  severity: 'minor',
  confidence: 'heuristic',

  affectedScripts: scriptsWhere((properties) => properties.isRtl),

  description: [
    [
      'Reports a horizontal arrow character, or an element whose class name names a horizontal',
      'direction, inside a right-to-left context where neither it nor any ancestor carries a',
      'transform that reverses or turns it. Forward is leftward for these readers, so an arrow',
      'inherited from the left-to-right design points backwards while looking perfectly intact.',
    ].join(' '),
    [
      'Whether a glyph has been handled is read from the computed matrix rather than from the',
      'text of the declaration, because the browser resolves every transform function into a',
      'matrix: a page that mirrors correctly with scaleX(-1) contains the string scaleX nowhere.',
      'A negative horizontal coefficient is a reversal and a non-zero shear term is a rotation;',
      'a translation or a positive scale is neither, and leaves the arrow pointing where it was.',
    ].join(' '),
  ].join('\n\n'),

  limitations: [
    [
      'This rule sees far less than its description suggests, and the reason is structural: the',
      'scan captures text nodes, and most arrows are not text. An icon drawn as an SVG, as a font',
      'glyph in a ::before rule, or as an empty <span class="icon-arrow-right"></span> produces no',
      'text node at all and never reaches this rule. What it can see is arrows written as',
      'characters in content, and directional class names on elements that also contain text.',
      'A quiet result here is not evidence that a page mirrors its icons.',
    ].join(' '),
    [
      'Class-name matching is a convention rather than a standard, so an icon set with its own',
      'vocabulary is missed entirely. Some arrows must not mirror — the play triangle of a media',
      'player points at the film, not at the reader — and this rule cannot tell those apart, which',
      'is part of why it is reported as minor.',
    ].join(' '),
    [
      'Transforms are read from the element and its ancestors, so mirroring applied through a',
      'wrapper is credited correctly. Transform on a non-replaced inline element is reported by',
      'the browser but has no visual effect, and there the rule will credit a mirroring that never',
      'happened.',
    ].join(' '),
  ].join('\n\n'),

  check(snapshot: DomSnapshot): Violation[] {
    const violations: Violation[] = [];

    for (const node of snapshot.nodes) {
      if (node.computedDirection !== 'rtl') continue;

      const glyph = DIRECTIONAL_GLYPHS.exec(node.text);
      const directionalClass = node.classNames.find((name) => DIRECTIONAL_CLASS.test(name));
      if (glyph === null && directionalClass === undefined) continue;

      // Handled on the element itself, or by any wrapper above it — icon systems mirror from a
      // parent far more often than from the icon.
      if (reversesOrTurns(node.css.transform)) continue;
      if (node.hasTransformedAncestor) continue;

      const properties = propertiesFor(node);
      const label =
        properties === null ? 'right-to-left' : SCRIPT_LABELS[node.dominantScript];

      const evidence =
        glyph !== null
          ? `the character ${glyph[0]}`
          : `the class name ${directionalClass ?? ''}`;

      violations.push(
        violationFrom(unmirroredDirectionalIcon, node, node.dominantScript, {
          whatIsWrong:
            `This element sits in a right-to-left context and names a horizontal direction via ` +
            `${evidence}, with no transform on it or on any ancestor that reverses or turns it.`,
          whyItMatters:
            `Forward runs leftward for a ${label} reader, so an arrow taken from the ` +
            'left-to-right design points back the way they came. Nothing about it looks broken — ' +
            'it looks like a control that goes the other way, which is why this survives review ' +
            'and reaches the reader as a navigation that argues with itself.',
          howToFix:
            'Mirror the icon in the right-to-left context, with a [dir="rtl"] selector applying ' +
            'transform: scaleX(-1), or by swapping in the mirrored glyph. Leave alone the arrows ' +
            'that point at something other than the reading direction, such as a media play ' +
            'control.',
        }),
      );
    }

    return violations;
  },
};
