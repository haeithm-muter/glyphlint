/**
 * Turning failures into sentences.
 *
 * A scanner that prints a stack trace has told the person running it nothing they can act on.
 * Every failure here gets one sentence that names what happened and, where there is one, what
 * to do about it. The original error text is kept in `detail` for diagnosis; it is not the
 * message.
 */

import type { ScanError, ScanErrorKind } from '../types.js';

/**
 * Chromium network error codes, mapped to our kinds.
 *
 * Longest matches are listed first: `ERR_CONNECTION_TIMED_OUT` has to win over the substring
 * check for `ERR_TIMED_OUT`, or a refused connection would be reported as a slow page.
 */
const NETWORK_ERROR_KINDS: ReadonlyArray<readonly [string, ScanErrorKind]> = [
  ['ERR_NAME_NOT_RESOLVED', 'dns-failure'],
  ['ERR_NAME_RESOLUTION_FAILED', 'dns-failure'],
  ['ERR_CONNECTION_TIMED_OUT', 'unreachable-host'],
  ['ERR_CONNECTION_REFUSED', 'unreachable-host'],
  ['ERR_CONNECTION_RESET', 'unreachable-host'],
  ['ERR_CONNECTION_CLOSED', 'unreachable-host'],
  ['ERR_CONNECTION_FAILED', 'unreachable-host'],
  ['ERR_ADDRESS_UNREACHABLE', 'unreachable-host'],
  ['ERR_SOCKET_NOT_CONNECTED', 'unreachable-host'],
  ['ERR_EMPTY_RESPONSE', 'empty-body'],
  ['ERR_TOO_MANY_REDIRECTS', 'redirect-loop'],
  ['ERR_SSL_PROTOCOL_ERROR', 'invalid-ssl'],
  ['ERR_CERT_', 'invalid-ssl'],
  ['ERR_SSL_', 'invalid-ssl'],
  ['ERR_UNSAFE_PORT', 'blocked-port'],
  ['ERR_TIMED_OUT', 'timeout'],
];

/** One sentence per kind, written for the person running the scan. */
export function messageFor(kind: ScanErrorKind, context: { url: string; timeoutMs?: number }): string {
  switch (kind) {
    case 'dns-failure':
      return `The host name in ${context.url} could not be resolved. Check the spelling, or whether the domain still exists.`;
    case 'unreachable-host':
      return `${context.url} did not accept the connection. The server may be down, or it may be refusing automated requests.`;
    case 'timeout':
      return `${context.url} did not finish loading within ${Math.round((context.timeoutMs ?? 0) / 1000)} seconds. The page may be very heavy, or it may never stop making requests.`;
    case 'invalid-ssl':
      return `The HTTPS certificate for ${context.url} could not be validated, so the page was not loaded.`;
    case 'redirect-loop':
      return `${context.url} redirected in a loop and never settled on a page.`;
    case 'empty-body':
      return `${context.url} returned an empty page, so there was nothing to scan.`;
    case 'non-html-content':
      return `${context.url} did not return an HTML page. GlyphLint scans HTML pages only.`;
    case 'blocked-port':
      return `The browser refused to open ${context.url} because the port is one it blocks for security. Serve the page on a normal HTTP port and scan it again.`;
    case 'unknown':
      return `${context.url} could not be scanned. The underlying error is in the detail field.`;
  }
}

/** The text of an error, whatever shape it arrived in. */
function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Classify a thrown error into something a human can read.
 *
 * Playwright reports load failures as `Error` with the Chromium code embedded in the message,
 * and timeouts as `TimeoutError`. Neither is safe to show to a person as-is.
 */
export function classifyScanError(
  error: unknown,
  context: { url: string; timeoutMs?: number },
): ScanError {
  const detail = textOf(error);

  const isTimeout =
    (error instanceof Error && error.name === 'TimeoutError') || detail.includes('Timeout');
  if (isTimeout) {
    return { kind: 'timeout', message: messageFor('timeout', context), detail };
  }

  for (const [code, kind] of NETWORK_ERROR_KINDS) {
    if (detail.includes(code)) {
      return { kind, message: messageFor(kind, context), detail };
    }
  }

  return { kind: 'unknown', message: messageFor('unknown', context), detail };
}

/** Build an error for a condition we detected ourselves rather than caught. */
export function scanError(
  kind: ScanErrorKind,
  context: { url: string; timeoutMs?: number },
  detail?: string,
): ScanError {
  const built: ScanError = { kind, message: messageFor(kind, context) };
  return detail === undefined ? built : { ...built, detail };
}
