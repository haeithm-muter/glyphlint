/**
 * Several origins on loopback, for testing a campaign.
 *
 * A campaign is defined by how it behaves across sites — permission asked per host, a pause
 * between them, one failure not ending the run — so testing it needs more than one origin. Each
 * server here is a separate port, which is a separate origin as far as robots.txt and the browser
 * are concerned.
 *
 * Every request is recorded, including its User-Agent, because "identify yourself honestly" is a
 * requirement of this project and a requirement is worth an assertion.
 */

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export type RobotsBehaviour =
  /** A robots.txt that permits everything. */
  | { kind: 'allow-all' }
  /** A robots.txt that refuses everything. */
  | { kind: 'disallow-all' }
  /** No robots.txt at all: 404. */
  | { kind: 'missing' }
  /** The server is having a bad day: 500. Permission cannot be established. */
  | { kind: 'error' }
  /** Exactly this text. */
  | { kind: 'text'; body: string };

export interface SiteConfig {
  robots: RobotsBehaviour;
  /** A file in `tests/fixtures`, or `not-html` to answer with JSON instead of a page. */
  page: string;
}

export interface RecordedRequest {
  path: string;
  userAgent: string | undefined;
}

export interface CampaignServer {
  /** `http://127.0.0.1:<port>` for each configured site, in order. */
  origins: string[];
  /** Every request that site received, in order. */
  requests(index: number): RecordedRequest[];
  close(): Promise<void>;
}

const ROBOTS_BODY: Readonly<Record<'allow-all' | 'disallow-all', string>> = {
  'allow-all': 'User-agent: *\nDisallow:\n',
  'disallow-all': 'User-agent: *\nDisallow: /\n',
};

async function startOne(config: SiteConfig, log: RecordedRequest[]): Promise<Server> {
  const server = createServer((request, response) => {
    const requestPath = (request.url ?? '/').split('?')[0] ?? '/';
    log.push({ path: requestPath, userAgent: request.headers['user-agent'] });

    if (requestPath === '/robots.txt') {
      if (config.robots.kind === 'missing') {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      if (config.robots.kind === 'error') {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('sorry');
        return;
      }

      const body =
        config.robots.kind === 'text' ? config.robots.body : ROBOTS_BODY[config.robots.kind];
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(body);
      return;
    }

    if (config.page === 'not-html') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"this":"is not a page"}');
      return;
    }

    readFile(path.join(FIXTURES_DIRECTORY, config.page), 'utf8').then(
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

  return server;
}

export async function startCampaignServers(configs: SiteConfig[]): Promise<CampaignServer> {
  const logs: RecordedRequest[][] = configs.map(() => []);
  const servers: Server[] = [];
  const origins: string[] = [];

  for (const [index, config] of configs.entries()) {
    const log = logs[index] ?? [];
    const server = await startOne(config, log);
    servers.push(server);

    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('A campaign test server did not bind to a port.');
    }
    origins.push(`http://127.0.0.1:${address.port}`);
  }

  return {
    origins,
    requests: (index) => logs[index] ?? [],
    close: async () => {
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error === undefined ? resolve() : reject(error)));
        });
      }
    },
  };
}
