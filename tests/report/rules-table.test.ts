/**
 * The rule table printed by `glyphlint rules`.
 *
 * The table is derived from the registry, so these tests are mostly about that derivation staying
 * honest: every rule appears, nothing is listed that does not exist, and the writing systems shown
 * are the ones the rule actually declares.
 */

import { describe, expect, it } from 'vitest';

import { renderRulesTable, ruleTableRows } from '../../src/report/rules-table.js';
import { RULES } from '../../src/rules/index.js';

describe('the rule table', () => {
  it('has exactly one row per registered rule, in registry order', () => {
    expect(ruleTableRows().map((row) => row.id)).toEqual(RULES.map((rule) => rule.id));
  });

  it('reports each rule severity and confidence as the rule declares it', () => {
    const rows = new Map(ruleTableRows().map((row) => [row.id, row]));

    for (const rule of RULES) {
      expect(rows.get(rule.id)?.severity).toBe(rule.severity);
      expect(rows.get(rule.id)?.confidence).toBe(rule.confidence);
    }
  });

  it('lists the writing systems the rule declares, and keeps `all` as a word', () => {
    const rows = new Map(ruleTableRows().map((row) => [row.id, row]));

    for (const rule of RULES) {
      const expected =
        rule.affectedScripts === 'all' ? 'all' : [...rule.affectedScripts].sort().join(' ');
      expect(rows.get(rule.id)?.scripts).toBe(expected);
    }
  });

  it('names the flagship rule with the scripts it is really about', () => {
    const cursive = ruleTableRows().find((row) => row.id === 'cursive-script-letter-spacing');

    // Derived from `isCursive` in the property table rather than typed by hand, so this is also a
    // check that the property table still says what the rule claims it says.
    expect(cursive?.scripts).toBe('arabic mongolian nko syriac');
    expect(cursive?.severity).toBe('critical');
  });
});

describe('the rendered text', () => {
  it('counts the rules it is about to print', () => {
    expect(renderRulesTable()).toContain(`${RULES.length} script-aware rules`);
  });

  it('says these are ours and points elsewhere for axe rules', () => {
    const text = renderRulesTable();

    expect(text).toContain("These are GlyphLint's own");
    expect(text).toContain('https://github.com/dequelabs/axe-core');
  });

  it('explains what confidence means, so the column is not a bare word', () => {
    expect(renderRulesTable()).toContain('heuristic');
    expect(renderRulesTable()).toContain('inferring from evidence that can be');
  });

  it('aligns the columns', () => {
    const lines = renderRulesTable().split('\n');
    const header = lines.find((line) => line.startsWith('RULE'));
    const flagship = lines.find((line) => line.startsWith('cursive-script-letter-spacing'));

    expect(header).toBeDefined();
    expect(flagship).toBeDefined();
    expect(header?.indexOf('SEVERITY')).toBe(flagship?.indexOf('critical'));
  });
});
