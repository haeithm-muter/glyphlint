/**
 * A local HTTP server for the fixtures.
 *
 * Fixtures are served over HTTP rather than opened as `file://` URLs: file origins have their
 * own security rules in Chromium, and testing against them would mean testing something other
 * than what the scanner meets in the wild. `node:http` is built in, so this costs no dependency.
 */

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export interface FixtureServer {
  /** URL of a fixture file, e.g. `clean.html`. */
  fixture(name: string): string;
  /**
   * Serve a document that exists only in memory, and return its URL.
   *
   * For HTML this project generates rather than stores: the report renderer produces a string,
   * and the only way to audit it with the real scanner is to put it behind a real origin. Writing
   * it into `tests/fixtures/` instead would mean committing a generated file and keeping it in
   * step with the renderer by hand.
   */
  serveHtml(name: string, html: string): string;
  /** A URL that accepts the connection and then never answers. For the timeout path. */
  hanging(): string;
  /** A URL that answers with JSON rather than a page. */
  notHtml(): string;
  /** A URL that answers 200 with nothing in the body. */
  empty(): string;
  close(): Promise<void>;
}

/**
 * A loopback port with nothing listening on it.
 *
 * Bind to port 0, note what the operating system handed out, then let it go. Low ports such as
 * 1 or 9 are not an option: Chromium blocks them outright as unsafe, so a scan of one never
 * reaches the point of being refused.
 */
export async function findClosedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, '127.0.0.1', resolve);
  });

  const address = probe.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not obtain a loopback port.');
  }
  const { port } = address;

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error === undefined ? resolve() : reject(error)));
  });

  return port;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  /** Documents registered at run time by `serveHtml`, keyed by the name they were given. */
  const inMemory = new Map<string, string>();

  const server: Server = createServer((request, response) => {
    const requestPath = (request.url ?? '/').split('?')[0] ?? '/';

    const generated = inMemory.get(path.basename(requestPath));
    if (generated !== undefined) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(generated);
      return;
    }

    if (requestPath === '/hang') {
      // Deliberately no response and no end: the socket stays open until the scan gives up.
      return;
    }

    if (requestPath === '/not-html') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"this":"is not a page"}');
      return;
    }

    if (requestPath === '/empty') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('');
      return;
    }

    const name = path.basename(requestPath);
    readFile(path.join(FIXTURES_DIRECTORY, name), 'utf8').then(
      (body) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(body);
      },
      () => {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
      },
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Fixture server did not bind to a port.');
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    fixture: (name) => `${origin}/${name}`,
    serveHtml: (name, html) => {
      inMemory.set(name, html);
      return `${origin}/${name}`;
    },
    hanging: () => `${origin}/hang`,
    notHtml: () => `${origin}/not-html`,
    empty: () => `${origin}/empty`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // The hanging route leaves a socket open on purpose, so idle connections have to be cut
        // or close() would wait for a request that is never going to finish.
        server.closeAllConnections();
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}
