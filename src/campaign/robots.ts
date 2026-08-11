/**
 * A robots.txt parser, written here rather than installed.
 *
 * The question this file answers is small: **may we fetch this one URL?** No crawling, no queues,
 * no sitemaps, no politeness scheduler. RFC 9309 for that question is about eighty lines —
 * user-agent groups, allow and disallow, `*` and `$`, and the longest match winning — and a
 * dependency for eighty lines is a supply chain attached to a project whose whole claim is that it
 * has none.
 *
 * What it deliberately does not do:
 *
 * - **No `Sitemap`.** We do not crawl, so there is nothing to do with one.
 * - **No percent-encoding normalisation.** Rule paths are compared against the URL path as written.
 *   For homepages, which is all this project scans, the path is `/` and the question does not
 *   arise; for a deep path with an encoded character it could match differently from a full
 *   implementation. Named here rather than discovered later.
 * - **`Crawl-delay` is read although it is not in the standard.** A site that wrote one has asked
 *   for something specific, and ignoring a written request while calling ourselves a responsible
 *   scanner would be the wrong way round.
 *
 * Pure: parsing and matching only. Fetching lives in `permission.ts`, which is the impure half.
 */

/** One `Allow:` or `Disallow:` line. */
export interface RobotsRule {
  allow: boolean;
  /** The path pattern as written, which may contain `*` and may end in `$`. */
  path: string;
}

/** One group of rules and the product tokens it applies to, lower-cased. */
export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
}

export interface RobotsFile {
  groups: RobotsGroup[];
  /** True when the file was longer than we were willing to read. */
  truncated: boolean;
}

/**
 * How much of a robots.txt we read.
 *
 * RFC 9309 tells a crawler to parse at least 500 KiB and permits it to stop there. A file larger
 * than this is either a mistake or an attempt to make parsing expensive, and neither deserves
 * unbounded work from us.
 */
export const MAX_ROBOTS_BYTES = 512_000;

/** The token we answer to in a `User-agent:` line. Lower-case, because matching is case-insensitive. */
export const PRODUCT_TOKEN = 'glyphlint';

/**
 * Parse a robots.txt.
 *
 * Consecutive `User-agent` lines share one group; the first non-agent line closes the list of
 * agents, and the next agent line after that starts a new group. Lines before any `User-agent` are
 * dropped, because they belong to nobody.
 */
export function parseRobotsTxt(text: string): RobotsFile {
  const truncated = text.length > MAX_ROBOTS_BYTES;
  const body = truncated ? text.slice(0, MAX_ROBOTS_BYTES) : text;

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let previousLineWasAgent = false;

  for (const rawLine of body.split(/\r\n|\r|\n/u)) {
    // A `#` starts a comment anywhere on the line, including inside a path.
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line === '') continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (current === null || !previousLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      if (value !== '') current.agents.push(value.toLowerCase());
      previousLineWasAgent = true;
      continue;
    }

    previousLineWasAgent = false;
    if (current === null) continue;

    if (field === 'allow' || field === 'disallow') {
      // An empty value is the documented way to say "nothing is restricted", so the line is
      // dropped rather than kept as a pattern. Keeping it would turn `Disallow:` — which permits
      // everything — into a pattern that matches everything, which forbids it.
      if (value === '') continue;
      current.rules.push({ allow: field === 'allow', path: value });
      continue;
    }

    if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.crawlDelaySeconds = seconds;
    }
  }

  return { groups, truncated };
}

/**
 * The group that applies to a product token.
 *
 * An exact, case-insensitive match on the token wins. Failing that, the `*` group applies. Failing
 * that, nothing applies and the caller is free — which is what a robots.txt that names only other
 * crawlers means.
 */
export function groupFor(file: RobotsFile, productToken = PRODUCT_TOKEN): RobotsGroup | null {
  const token = productToken.toLowerCase();

  const specific = file.groups.find((group) => group.agents.includes(token));
  if (specific !== undefined) return specific;

  return file.groups.find((group) => group.agents.includes('*')) ?? null;
}

/** Characters that mean something to a regular expression and nothing to a robots.txt path. */
const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/gu;

/**
 * Whether a rule pattern matches a path.
 *
 * `*` stands for any run of characters, and a trailing `$` anchors the end of the path. A `$`
 * anywhere else is an ordinary character, which is what the specification says and also what
 * sites in the wild assume.
 */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body.replace(REGEX_SPECIALS, '\\$&').replace(/\*/gu, '.*');
  const expression = new RegExp(`^${source}${anchored ? '$' : ''}`, 'u');

  return expression.test(path);
}

/**
 * Is this path allowed?
 *
 * The longest matching pattern decides, and `Allow` wins a tie — both are what RFC 9309 requires,
 * and the tie rule is the one that matters in practice, because `Allow: /` beside `Disallow: /` is
 * a common way of saying "yes".
 *
 * A path no rule matches is allowed. Silence in a robots.txt is permission; silence from a *server*
 * is not, and that distinction is made in `permission.ts`, not here.
 */
export function isAllowed(file: RobotsFile, path: string, productToken = PRODUCT_TOKEN): boolean {
  const group = groupFor(file, productToken);
  if (group === null) return true;

  // A URL path always starts with `/`, and a pattern that does not is treated as though it did.
  const target = path.startsWith('/') ? path : `/${path}`;

  let bestLength = -1;
  let bestAllows = true;

  for (const rule of group.rules) {
    const pattern = rule.path.startsWith('/') || rule.path.startsWith('*') ? rule.path : `/${rule.path}`;
    if (!patternMatches(pattern, target)) continue;

    if (pattern.length > bestLength) {
      bestLength = pattern.length;
      bestAllows = rule.allow;
    } else if (pattern.length === bestLength && rule.allow) {
      bestAllows = true;
    }
  }

  return bestLength === -1 ? true : bestAllows;
}

/** The `Crawl-delay` that applies to us, if the file states one. */
export function crawlDelaySecondsFor(
  file: RobotsFile,
  productToken = PRODUCT_TOKEN,
): number | undefined {
  return groupFor(file, productToken)?.crawlDelaySeconds;
}
