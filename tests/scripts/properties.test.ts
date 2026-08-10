import { describe, expect, it } from 'vitest';

import {
  SCRIPT_PROPERTIES,
  VIETNAMESE_LATIN_PROPERTIES,
  type ScriptProperties,
} from '../../src/scripts/properties.js';
import type { DetectableScript, ThresholdSource } from '../../src/types.js';

const ALL_SCRIPTS = Object.keys(SCRIPT_PROPERTIES) as DetectableScript[];

/** Every script that carries a given flag, so the expectations below read as sets. */
function scriptsWhere(predicate: (properties: ScriptProperties) => boolean): DetectableScript[] {
  return ALL_SCRIPTS.filter((script) => predicate(SCRIPT_PROPERTIES[script])).sort();
}

describe('SCRIPT_PROPERTIES', () => {
  it('covers all sixteen writing systems', () => {
    expect(ALL_SCRIPTS).toHaveLength(16);
  });

  it('marks exactly the cursive scripts as cursive', () => {
    // These are the scripts whose letters join. They are the ones letter-spacing breaks
    // outright rather than merely loosens.
    expect(scriptsWhere((p) => p.isCursive)).toEqual(['arabic', 'mongolian', 'nko', 'syriac']);
  });

  it('marks exactly the right-to-left scripts as RTL', () => {
    // Mongolian is absent on purpose: it is vertical, not right-to-left.
    expect(scriptsWhere((p) => p.isRtl)).toEqual([
      'arabic',
      'hebrew',
      'nko',
      'syriac',
      'thaana',
    ]);
    expect(SCRIPT_PROPERTIES.mongolian.isRtl).toBe(false);
  });

  it('marks exactly the bicameral scripts as having case', () => {
    expect(scriptsWhere((p) => !p.isCaseless)).toEqual(['cyrillic', 'greek', 'latin']);
  });

  it('marks exactly the scripts that write without inter-word spaces', () => {
    expect(scriptsWhere((p) => p.needsWordSegmentation)).toEqual([
      'han',
      'kana',
      'khmer',
      'lao',
      'thai',
    ]);
    // Korean does put spaces between words, which is what separates it from Han and kana.
    expect(SCRIPT_PROPERTIES.hangul.needsWordSegmentation).toBe(false);
  });

  it('marks exactly the scripts with stacked marks', () => {
    expect(scriptsWhere((p) => p.hasStackedMarks)).toEqual([
      'arabic',
      'devanagari',
      'hebrew',
      'khmer',
      'lao',
      'mongolian',
      'nko',
      'syriac',
      'thaana',
      'thai',
    ]);
  });
});

describe('threshold sourcing', () => {
  const VALID_SOURCES: ThresholdSource[] = ['wcag-1.4.12', 'w3c-layout-req', 'estimate'];

  it('gives every threshold a source', () => {
    for (const script of ALL_SCRIPTS) {
      const threshold = SCRIPT_PROPERTIES[script].minLineHeightRatio;
      if (threshold === null) continue;
      expect(VALID_SOURCES).toContain(threshold.source);
    }
  });

  it('anchors the 1.5 baseline to WCAG 1.4.12 and nothing else', () => {
    for (const script of ALL_SCRIPTS) {
      const threshold = SCRIPT_PROPERTIES[script].minLineHeightRatio;
      if (threshold === null || threshold.value !== 1.5) continue;
      expect(threshold.source).toBe('wcag-1.4.12');
    }
  });

  it('labels the raised Thai, Lao and Khmer ratio an estimate', () => {
    // This is the honesty test. 1.6 has no standards document behind it, and the day someone
    // quietly relabels it as sourced is the day the linter starts lying.
    for (const script of ['thai', 'lao', 'khmer'] as const) {
      const threshold = SCRIPT_PROPERTIES[script].minLineHeightRatio;
      expect(threshold?.value).toBe(1.6);
      expect(threshold?.source).toBe('estimate');
      expect(threshold?.note).toMatch(/not sourced/i);
    }
  });

  it('leaves Mongolian without a line-height ratio', () => {
    // A line-height ratio describes horizontal lines. Mongolian runs in vertical columns.
    expect(SCRIPT_PROPERTIES.mongolian.minLineHeightRatio).toBeNull();
  });
});

describe('VIETNAMESE_LATIN_PROPERTIES', () => {
  it('differs from Latin only in carrying stacked marks', () => {
    expect(VIETNAMESE_LATIN_PROPERTIES).toEqual({
      ...SCRIPT_PROPERTIES.latin,
      hasStackedMarks: true,
    });
    expect(SCRIPT_PROPERTIES.latin.hasStackedMarks).toBe(false);
  });

  it('is not reachable as a script id', () => {
    // Vietnamese is a profile on Latin, never a ScriptId. If this key ever appears, decision
    // 003 has been reversed by accident.
    expect(ALL_SCRIPTS).not.toContain('vietnamese');
  });
});
