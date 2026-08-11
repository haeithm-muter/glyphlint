/**
 * Asking a site whether we may scan it.
 *
 * Impure: this is the half that touches the network. One request, to `/robots.txt`, with the same
 * descriptive User-Agent the browser will send, and a short timeout.
 *
 * The status codes are decided here rather than guessed per site, and one of them is worth reading
 * twice: **a server we cannot reach is not a server that said yes.** RFC 9309 treats an
 * unavailable robots.txt (`4xx`) as "no rules exist, help yourself" and an unreachable one (`5xx`,
 * timeout, connection refused) as a complete disallow. That asymmetry is the whole ethic of this
 * file — permission has to be established, not assumed, and a campaign that scanned every site
 * whose robots.txt happened to time out would be helping itself to exactly the pages most likely
 * to be struggling.
 */

import { parseRobotsTxt, crawlDelaySecondsFor, isAllowed, MAX_ROBOTS_BYTES } from './robots.js';

/**
 * The User-Agent GlyphLint identifies itself with, everywhere.
 *
 * Deliberately not a browser string. Appending a real Chromium User-Agent would make more sites
 * serve us their normal page and would improve the measurements — and it would be a scanner
 * disguising itself to get past bot detection, which is the opposite of what a tool arguing for
 * responsible scanning is allowed to do. A site that blocks this string has answered, and the
 * answer is recorded rather than worked around.
 */
export const USER_AGENT =
  'GlyphLint/0.1 (+https://github.com/haeithm-muter/glyphlint) accessibility research scanner';

/** How long we wait for a robots.txt before treating the host as unreachable. */
export const ROBOTS_TIMEOUT_MS = 5000;

export type PermissionDecision =
  /** robots.txt exists and permits this path, or does not exist at all. */
  | { allowed: true; reason: 'robots-allows' | 'no-robots-file'; crawlDelaySeconds?: number }
  /** robots.txt exists and says no. The site answered, and the answer is on the record. */
  | { allowed: false; reason: 'robots-disallows' }
  /** We could not establish permission. Not the same thing as being refused. */
  | { allowed: false; reason: 'robots-unreachable'; detail: string };

/** Where `/robots.txt` lives for a URL: same scheme, same host, same port, path replaced. */
export function robotsUrlFor(target: string): string {
  const url = new URL(target);
  return new URL('/robots.txt', url.origin).href;
}

/**
 * Fetch and apply a site's robots.txt.
 *
 * Never throws: every failure becomes a decision the campaign can record. `fetch` is Node's own,
 * which is why this costs no dependency.
 */
export async function checkPermission(
  target: string,
  options: { userAgent?: string; timeoutMs?: number } = {},
): Promise<PermissionDecision> {
  const userAgent = options.userAgent ?? USER_AGENT;
  const timeoutMs = options.timeoutMs ?? ROBOTS_TIMEOUT_MS;

  let path: string;
  let robotsUrl: string;
  try {
    path = new URL(target).pathname;
    robotsUrl = robotsUrlFor(target);
  } catch {
    return { allowed: false, reason: 'robots-unreachable', detail: 'The URL could not be parsed.' };
  }

  let response: Response;
  try {
    response = await fetch(robotsUrl, {
      headers: { 'user-agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { allowed: false, reason: 'robots-unreachable', detail };
  }

  // No robots.txt is a real answer: the site published no rules, so there are none to break.
  if (response.status >= 400 && response.status < 500) {
    return { allowed: true, reason: 'no-robots-file' };
  }

  if (!response.ok) {
    return {
      allowed: false,
      reason: 'robots-unreachable',
      detail: `The server answered ${response.status} for robots.txt.`,
    };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { allowed: false, reason: 'robots-unreachable', detail };
  }

  const file = parseRobotsTxt(text.slice(0, MAX_ROBOTS_BYTES));
  if (!isAllowed(file, path)) return { allowed: false, reason: 'robots-disallows' };

  const crawlDelaySeconds = crawlDelaySecondsFor(file);
  const decision: PermissionDecision = { allowed: true, reason: 'robots-allows' };
  if (crawlDelaySeconds !== undefined) decision.crawlDelaySeconds = crawlDelaySeconds;
  return decision;
}
