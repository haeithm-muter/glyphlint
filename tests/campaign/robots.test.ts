/**
 * The robots.txt parser.
 *
 * Pure, so every case here is a string and an answer. The cases are drawn from RFC 9309 and from
 * the shapes real sites actually publish — a wildcard group beside a named one, `Allow` beating
 * `Disallow` on the same path, an empty `Disallow:` meaning the opposite of what it looks like.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_ROBOTS_BYTES,
  crawlDelaySecondsFor,
  groupFor,
  isAllowed,
  parseRobotsTxt,
} from '../../src/campaign/robots.js';

/** Parse and ask about a path in one step, since that is the only question this module answers. */
function allows(text: string, path = '/', token?: string): boolean {
  return isAllowed(parseRobotsTxt(text), path, token);
}

describe('a file with nothing to say', () => {
  it('allows everything when it is empty', () => {
    expect(allows('')).toBe(true);
    expect(allows('\n\n   \n')).toBe(true);
  });

  it('allows everything when it names only other crawlers', () => {
    expect(allows('User-agent: SomeoneElse\nDisallow: /')).toBe(true);
  });

  it('ignores rules written before any user-agent line, which belong to nobody', () => {
    expect(allows('Disallow: /\nUser-agent: *\nAllow: /')).toBe(true);
  });

  it('ignores comments and lines with no colon', () => {
    expect(allows('# just a comment\nnonsense\nUser-agent: *\nDisallow: /private')).toBe(true);
    expect(allows('User-agent: *\nDisallow: /private # trailing comment', '/private')).toBe(false);
  });
});

describe('allow and disallow', () => {
  const blockAll = 'User-agent: *\nDisallow: /';

  it('refuses everything under a bare disallow', () => {
    expect(allows(blockAll)).toBe(false);
    expect(allows(blockAll, '/anything')).toBe(false);
  });

  it('reads an empty disallow as permission, not as a pattern matching everything', () => {
    // The trap this parser has to get right: `Disallow:` with no value means nothing is
    // restricted. Kept as a pattern, the empty string would match every path and forbid the site.
    expect(allows('User-agent: *\nDisallow:')).toBe(true);
  });

  it('lets the longest matching pattern decide', () => {
    const text = 'User-agent: *\nDisallow: /\nAllow: /public';

    expect(allows(text, '/public/page')).toBe(true);
    expect(allows(text, '/private')).toBe(false);
  });

  it('gives a tie to allow, which is how a site says yes to one path', () => {
    expect(allows('User-agent: *\nDisallow: /page\nAllow: /page', '/page')).toBe(true);
  });

  it('treats a path no rule mentions as allowed', () => {
    expect(allows('User-agent: *\nDisallow: /admin', '/')).toBe(true);
  });
});

describe('wildcards', () => {
  it('expands * to any run of characters', () => {
    const text = 'User-agent: *\nDisallow: /*.pdf';

    expect(allows(text, '/reports/2026.pdf')).toBe(false);
    expect(allows(text, '/reports/2026.html')).toBe(true);
  });

  it('anchors the end of a path with a trailing $', () => {
    const text = 'User-agent: *\nDisallow: /page$';

    expect(allows(text, '/page')).toBe(false);
    expect(allows(text, '/page/child')).toBe(true);
  });

  it('does not let a pattern be read as a regular expression', () => {
    // `.` and `+` are ordinary characters in a robots.txt path. If they reached a regular
    // expression unescaped, this rule would block paths the site never mentioned.
    const text = 'User-agent: *\nDisallow: /a.b';

    expect(allows(text, '/a.b')).toBe(false);
    expect(allows(text, '/axb')).toBe(true);
  });
});

describe('groups and product tokens', () => {
  const text = [
    'User-agent: BigCrawler',
    'Disallow: /',
    '',
    'User-agent: glyphlint',
    'Disallow: /private',
    '',
    'User-agent: *',
    'Disallow: /',
  ].join('\n');

  it('prefers the group naming us over the wildcard group', () => {
    expect(allows(text, '/')).toBe(true);
    expect(allows(text, '/private')).toBe(false);
  });

  it('matches our token whatever case the site wrote it in', () => {
    expect(allows('User-agent: GlyphLint\nDisallow: /', '/')).toBe(false);
    expect(allows('User-agent: GLYPHLINT\nDisallow: /', '/')).toBe(false);
  });

  it('falls back to the wildcard group when nothing names us', () => {
    expect(allows('User-agent: BigCrawler\nDisallow: /x\n\nUser-agent: *\nDisallow: /', '/')).toBe(
      false,
    );
  });

  it('joins consecutive user-agent lines into one group', () => {
    const shared = 'User-agent: one\nUser-agent: glyphlint\nDisallow: /shared';

    expect(allows(shared, '/shared')).toBe(false);
    expect(groupFor(parseRobotsTxt(shared))?.agents).toEqual(['one', 'glyphlint']);
  });

  it('starts a new group when an agent line follows a rule', () => {
    const text = 'User-agent: a\nDisallow: /one\nUser-agent: glyphlint\nDisallow: /two';
    const file = parseRobotsTxt(text);

    expect(file.groups).toHaveLength(2);
    expect(isAllowed(file, '/one')).toBe(true);
    expect(isAllowed(file, '/two')).toBe(false);
  });
});

describe('crawl-delay', () => {
  it('is read for our group even though it is not in the standard', () => {
    const file = parseRobotsTxt('User-agent: *\nCrawl-delay: 10\nDisallow:');

    expect(crawlDelaySecondsFor(file)).toBe(10);
  });

  it('prefers the delay in the group that names us', () => {
    const file = parseRobotsTxt(
      'User-agent: *\nCrawl-delay: 30\n\nUser-agent: glyphlint\nCrawl-delay: 5',
    );

    expect(crawlDelaySecondsFor(file)).toBe(5);
  });

  it('ignores a value that is not a positive number', () => {
    expect(crawlDelaySecondsFor(parseRobotsTxt('User-agent: *\nCrawl-delay: soon'))).toBeUndefined();
    expect(crawlDelaySecondsFor(parseRobotsTxt('User-agent: *\nCrawl-delay: -5'))).toBeUndefined();
  });

  it('is absent when the file does not mention one', () => {
    expect(crawlDelaySecondsFor(parseRobotsTxt('User-agent: *\nDisallow: /'))).toBeUndefined();
  });
});

describe('files that are trying to be difficult', () => {
  it('stops reading past the size it is willing to parse, and says so', () => {
    const padding = '#'.repeat(MAX_ROBOTS_BYTES);
    const file = parseRobotsTxt(`${padding}\nUser-agent: *\nDisallow: /`);

    expect(file.truncated).toBe(true);
    // The rule past the cap was never read, and an unread rule cannot forbid anything.
    expect(isAllowed(file, '/')).toBe(true);
  });

  it('handles every line ending a text file can arrive with', () => {
    expect(allows('User-agent: *\r\nDisallow: /\r\n')).toBe(false);
    expect(allows('User-agent: *\rDisallow: /\r')).toBe(false);
  });

  it('reads field names case-insensitively and tolerates loose spacing', () => {
    expect(allows('USER-AGENT:   *  \n  DISALLOW:   /admin  ', '/admin')).toBe(false);
  });
});
