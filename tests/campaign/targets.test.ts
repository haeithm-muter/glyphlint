/**
 * The target list.
 *
 * Validation is strict because a campaign is thirty requests to other people's servers, and the
 * moment to catch a typo in a URL is before the first one rather than in a results file
 * afterwards. Every rejection is checked for its message too: the person who has to fix the list
 * is the person reading it.
 */

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SCRIPTS,
  TARGET_GROUPS,
  TargetsError,
  countByGroup,
  parseTargets,
  parseTargetsFile,
} from '../../src/campaign/targets.js';

/** The shape the campaign specification prints, verbatim. */
const EXAMPLE = { targets: [{ url: 'https://example.com', script: 'arabic', note: 'news' }] };

describe('a list that is fine', () => {
  it('accepts the shape from the specification', () => {
    expect(parseTargets(EXAMPLE).targets).toEqual([
      { url: 'https://example.com', script: 'arabic', note: 'news' },
    ]);
  });

  it('treats the note as optional', () => {
    const parsed = parseTargets({ targets: [{ url: 'https://example.com', script: 'thai' }] });

    expect(parsed.targets[0]?.note).toBeUndefined();
  });

  it('accepts every group the specification distributes targets across', () => {
    const targets = TARGET_GROUPS.map((script, index) => ({
      url: `https://example-${index}.com`,
      script,
    }));

    expect(parseTargets({ targets }).targets).toHaveLength(TARGET_GROUPS.length);
  });

  it('keeps the slash in persian/urdu, which is the label the specification uses', () => {
    const parsed = parseTargets({
      targets: [{ url: 'https://example.ir', script: 'persian/urdu' }],
    });

    expect(parsed.targets[0]?.script).toBe('persian/urdu');
  });
});

describe('a list that is not', () => {
  it('rejects a file with no targets array', () => {
    expect(() => parseTargets({})).toThrow(/must have a "targets" array/u);
    expect(() => parseTargets([])).toThrow(TargetsError);
    expect(() => parseTargets(null)).toThrow(/must be an object/u);
  });

  it('rejects an empty list rather than running a campaign against nothing', () => {
    expect(() => parseTargets({ targets: [] })).toThrow(/lists no targets/u);
  });

  it('rejects a missing or unparseable url, naming which entry is wrong', () => {
    expect(() => parseTargets({ targets: [{ script: 'arabic' }] })).toThrow(/Target 1 needs a "url"/u);
    expect(() => parseTargets({ targets: [{ url: 'not a url', script: 'arabic' }] })).toThrow(
      /Target 1 has a url that is not a URL/u,
    );
  });

  it('rejects a scheme a browser cannot be pointed at over the network', () => {
    // A campaign scans homepages. A `file:` entry would scan this machine, which is not what a
    // list of thirty homepages is for.
    expect(() => parseTargets({ targets: [{ url: 'file:///etc/hosts', script: 'arabic' }] })).toThrow(
      /must be http or https/u,
    );
  });

  it('rejects a group it does not know, and lists the ones it does', () => {
    const attempt = (): unknown =>
      parseTargets({ targets: [{ url: 'https://example.com', script: 'bengali' }] });

    expect(attempt).toThrow(/has script "bengali"/u);
    expect(attempt).toThrow(/arabic, persian\/urdu, hebrew, thai, devanagari, vietnamese, cjk/u);
  });

  it('rejects the same URL twice', () => {
    expect(() =>
      parseTargets({
        targets: [
          { url: 'https://example.com', script: 'arabic' },
          { url: 'https://example.com', script: 'hebrew' },
        ],
      }),
    ).toThrow(/repeats a URL already on the list/u);
  });

  it('rejects a note that is not text', () => {
    expect(() =>
      parseTargets({ targets: [{ url: 'https://example.com', script: 'arabic', note: 7 }] }),
    ).toThrow(/note that is not a string/u);
  });
});

describe('reading the file itself', () => {
  it('reads an ordinary JSON file', () => {
    expect(parseTargetsFile(JSON.stringify(EXAMPLE)).targets).toHaveLength(1);
  });

  it('reads a file written on Windows, byte order mark and all', () => {
    // Found by running the real command: PowerShell and Notepad both write UTF-8 with a leading
    // U+FEFF, and JSON.parse rejects it with a message about a character nobody can see. This
    // project promises its commands work on Windows, so the mark is handled rather than explained.
    // Built from its code point rather than typed: the mark is invisible in an editor, and a test
    // whose subject cannot be seen in its own source is a test nobody can maintain.
    const withMark = `${String.fromCharCode(0xfeff)}${JSON.stringify(EXAMPLE)}`;

    expect(parseTargetsFile(withMark).targets).toHaveLength(1);
  });

  it('explains malformed JSON instead of throwing a parser error at the reader', () => {
    expect(() => parseTargetsFile('{ "targets": [')).toThrow(TargetsError);
    expect(() => parseTargetsFile('{ "targets": [')).toThrow(/not valid JSON/u);
  });
});

describe('what a group implies about a page', () => {
  it('maps every group to the writing systems a page in it should contain', () => {
    for (const group of TARGET_GROUPS) {
      expect(EXPECTED_SCRIPTS[group].length).toBeGreaterThan(0);
    }
  });

  it('expects Arabic script for Persian and Urdu, which are written in it', () => {
    expect(EXPECTED_SCRIPTS['persian/urdu']).toEqual(['arabic']);
  });

  it('expects Latin for Vietnamese, which is not a script of its own', () => {
    // Decision 003. The group label is a language group; the script is Latin, and the stacked
    // diacritics are a profile on it.
    expect(EXPECTED_SCRIPTS.vietnamese).toEqual(['latin']);
  });

  it('expects three writing systems for CJK, because that is what CJK is', () => {
    expect(EXPECTED_SCRIPTS.cjk).toEqual(['han', 'kana', 'hangul']);
  });
});

describe('counting a list against the planned distribution', () => {
  it('counts each group, including the ones with nothing in them', () => {
    const { targets } = parseTargets({
      targets: [
        { url: 'https://a.example', script: 'arabic' },
        { url: 'https://b.example', script: 'arabic' },
        { url: 'https://c.example', script: 'cjk' },
      ],
    });

    const counts = countByGroup(targets);
    expect(counts.arabic).toBe(2);
    expect(counts.cjk).toBe(1);
    expect(counts.hebrew).toBe(0);
  });
});
