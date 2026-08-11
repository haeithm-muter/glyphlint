/**
 * Command-line parsing.
 *
 * `parseArguments` is pure, so the whole command surface is tested here without launching a
 * browser, writing a file or reading an environment variable. What `cli.ts` does with the result —
 * exit codes, file paths, colour — is the impure half and is not this file.
 *
 * Every rejection is checked for its message as well as for the throw. A CLI that answers a
 * mistyped flag with a stack trace is the sort of thing this project spends its rules complaining
 * about elsewhere.
 */

import { describe, expect, it } from 'vitest';

import { UsageError, parseArguments } from '../../src/cli-args.js';

/** Parse a scan command, failing the test if something else came back. */
function scan(argv: string[]): ReturnType<typeof parseArguments> & { kind: 'scan' } {
  const command = parseArguments(argv);
  if (command.kind !== 'scan') throw new Error(`Expected a scan command, got ${command.kind}.`);
  return command;
}

describe('commands', () => {
  it('parses a bare scan', () => {
    const command = scan(['scan', 'https://example.com']);

    expect(command.url).toBe('https://example.com');
    expect(command.format).toBe('terminal');
    expect(command.outPath).toBeUndefined();
    expect(command.filters).toEqual({});
  });

  it('recognises the rules command', () => {
    expect(parseArguments(['rules']).kind).toBe('rules');
  });

  it('recognises help in every spelling', () => {
    expect(parseArguments(['--help']).kind).toBe('help');
    expect(parseArguments(['-h']).kind).toBe('help');
    expect(parseArguments(['help']).kind).toBe('help');
    expect(parseArguments(['scan', 'https://example.com', '--help']).kind).toBe('help');
  });

  it('recognises the campaign command', () => {
    expect(parseArguments(['campaign', '--input', 'sites/targets.json']).kind).toBe('campaign');
  });

  it('rejects an unknown command, no command, and a missing URL', () => {
    expect(() => parseArguments(['sscan', 'https://example.com'])).toThrow(UsageError);
    expect(() => parseArguments([])).toThrow(/No command given/u);
    expect(() => parseArguments(['scan'])).toThrow(/No URL given/u);
    expect(() => parseArguments(['rules', 'extra'])).toThrow(/takes no arguments/u);
  });

  it('refuses two URLs rather than silently scanning one of them', () => {
    expect(() => parseArguments(['scan', 'https://a.example', 'https://b.example'])).toThrow(
      /Only one URL/u,
    );
  });
});

describe('output options', () => {
  it('takes a format and an output path', () => {
    const command = scan(['scan', 'https://example.com', '--format', 'html', '--out', 'r.html']);

    expect(command.format).toBe('html');
    expect(command.outPath).toBe('r.html');
  });

  it('rejects a format it does not have', () => {
    expect(() => parseArguments(['scan', 'https://example.com', '--format', 'pdf'])).toThrow(
      /--format must be one of terminal, json, html/u,
    );
  });

  it('rejects a flag with no value', () => {
    expect(() => parseArguments(['scan', 'https://example.com', '--out'])).toThrow(
      /--out needs a value/u,
    );
    // A following flag is not a value: `--out --format json` is a mistake, not a file named
    // `--format`.
    expect(() => parseArguments(['scan', 'https://x.example', '--out', '--format'])).toThrow(
      /--out needs a value/u,
    );
  });

  it('rejects an unknown option', () => {
    expect(() => parseArguments(['scan', 'https://example.com', '--colour'])).toThrow(
      /Unknown option: --colour/u,
    );
  });
});

describe('the screenshot', () => {
  it('is taken by default', () => {
    expect(scan(['scan', 'https://example.com']).screenshot).toEqual({ mode: 'default' });
  });

  it('can be switched off', () => {
    expect(scan(['scan', 'https://example.com', '--no-screenshot']).screenshot).toEqual({
      mode: 'off',
    });
  });

  it('can be given a path', () => {
    expect(scan(['scan', 'https://example.com', '--screenshot', 'shot.png']).screenshot).toEqual({
      mode: 'path',
      path: 'shot.png',
    });
  });

  it('lets the last of the two flags win', () => {
    expect(
      scan(['scan', 'https://x.example', '--screenshot', 'a.png', '--no-screenshot']).screenshot,
    ).toEqual({ mode: 'off' });
  });
});

describe('filters', () => {
  it('splits comma-separated rule lists and trims them', () => {
    const command = scan([
      'scan',
      'https://example.com',
      '--rules',
      'cursive-script-letter-spacing, missing-dir-attribute',
    ]);

    expect(command.filters.onlyRules).toEqual([
      'cursive-script-letter-spacing',
      'missing-dir-attribute',
    ]);
  });

  it('reports ids that are not ours instead of failing on them', () => {
    // They may be axe rule ids, and we hold no copy of axe's registry to check against — so this
    // is a notice, not an error, and the CLI prints it.
    const command = scan(['scan', 'https://example.com', '--disable', 'image-alt,not-a-rule']);

    expect(command.filters.disabledRules).toEqual(['image-alt', 'not-a-rule']);
    expect(command.unrecognisedRuleIds).toEqual(['image-alt', 'not-a-rule']);
  });

  it('leaves the list of unrecognised ids empty when every id is one of ours', () => {
    const command = scan(['scan', 'https://example.com', '--disable', 'lang-script-mismatch']);

    expect(command.unrecognisedRuleIds).toEqual([]);
  });

  it('rejects an empty list rather than treating it as no filter at all', () => {
    expect(() => parseArguments(['scan', 'https://x.example', '--rules', ' , '])).toThrow(
      /--rules needs at least one id/u,
    );
  });

  it('accepts writing systems it models', () => {
    const command = scan(['scan', 'https://example.com', '--scripts', 'arabic,thai']);

    expect(command.filters.onlyScripts).toEqual(['arabic', 'thai']);
  });

  it('rejects a writing system it does not model, and says which it does', () => {
    expect(() => parseArguments(['scan', 'https://x.example', '--scripts', 'bengali'])).toThrow(
      /does not know "bengali"/u,
    );
    // `common` and `unknown` are outcomes rather than writing systems: no finding ever carries
    // one, so accepting them would hand back a filter that silently matches nothing.
    expect(() => parseArguments(['scan', 'https://x.example', '--scripts', 'common'])).toThrow(
      UsageError,
    );
  });

  it('accepts a severity floor and rejects anything else', () => {
    expect(scan(['scan', 'https://x.example', '--min-severity', 'serious']).filters.minSeverity).toBe(
      'serious',
    );
    expect(() => parseArguments(['scan', 'https://x.example', '--min-severity', 'bad'])).toThrow(
      /--min-severity must be one of critical, serious, moderate, minor/u,
    );
  });
});

describe('the campaign command', () => {
  /** Parse a campaign command, failing the test if something else came back. */
  function campaign(argv: string[]): ReturnType<typeof parseArguments> & { kind: 'campaign' } {
    const command = parseArguments(argv);
    if (command.kind !== 'campaign') throw new Error(`Expected campaign, got ${command.kind}.`);
    return command;
  }

  it('defaults to results/, two seconds, a minute per site, and no screenshots', () => {
    const command = campaign(['campaign', '--input', 'sites/targets.json']);

    expect(command.inputPath).toBe('sites/targets.json');
    expect(command.outDirectory).toBe('results');
    expect(command.delayMs).toBe(2000);
    expect(command.siteTimeoutMs).toBe(60_000);
    // Thirty full-page images of other people's sites is closer to collecting than to evidence.
    expect(command.screenshots).toBe(false);
  });

  it('takes an output directory, a delay, a site timeout and screenshots', () => {
    const command = campaign([
      'campaign',
      '--input',
      'targets.json',
      '--out',
      'out/run',
      '--delay',
      '5000',
      '--site-timeout',
      '30000',
      '--screenshots',
    ]);

    expect(command.outDirectory).toBe('out/run');
    expect(command.delayMs).toBe(5000);
    expect(command.siteTimeoutMs).toBe(30_000);
    expect(command.screenshots).toBe(true);
  });

  it('accepts a delay below the floor, including zero, which the runner then raises', () => {
    // Rejecting it would fail on a number somebody typed hopefully. The runner clamps it for
    // every host but loopback, so what can be typed here and what reaches a stranger's server
    // are different things.
    expect(campaign(['campaign', '--input', 't.json', '--delay', '100']).delayMs).toBe(100);
    expect(campaign(['campaign', '--input', 't.json', '--delay', '0']).delayMs).toBe(0);
  });

  it('refuses to run without a target list', () => {
    // There is no default list of other people's websites, and inventing one is not something
    // this tool gets to do.
    expect(() => parseArguments(['campaign'])).toThrow(/needs --input/u);
  });

  it('rejects a stray argument and an unknown option', () => {
    expect(() => parseArguments(['campaign', 'targets.json'])).toThrow(/The target list goes in --input/u);
    expect(() => parseArguments(['campaign', '--input', 't.json', '--fast'])).toThrow(
      /Unknown option: --fast/u,
    );
  });

  it('rejects a delay or a site timeout that is not a positive number', () => {
    expect(() => parseArguments(['campaign', '--input', 't.json', '--delay', '-1'])).toThrow(
      /not negative/u,
    );
    expect(() => parseArguments(['campaign', '--input', 't.json', '--site-timeout', 'soon'])).toThrow(
      /positive number of milliseconds/u,
    );
  });
});

describe('the timeout', () => {
  it('is a positive number of milliseconds', () => {
    expect(scan(['scan', 'https://x.example', '--timeout', '5000']).timeoutMs).toBe(5000);
  });

  it('rejects anything that is not one', () => {
    for (const bad of ['0', '-1', 'soon']) {
      expect(() => parseArguments(['scan', 'https://x.example', '--timeout', bad])).toThrow(
        /positive number of milliseconds/u,
      );
    }
  });
});
