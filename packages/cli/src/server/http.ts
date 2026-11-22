import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ViewerState } from '@seefore/core';
import type { Layouts } from './layouts.ts';
import { INDEX } from './page.ts';
import type { Page, PageFile } from './page.ts';
import { Pictures } from './pictures.ts';
import { Source } from './source.ts';
import type { Read } from './source.ts';

/** The only address the server listens on: this machine, and no other can reach it. */
export const HOST = '127.0.0.1';

/**
 * Sent with every answer. The page loads only its own files and talks only to this server;
 * no other page may frame it; no answer is kept by the browser or guessed at for its type.
 */
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** What the viewer is made of. */
export interface ViewerOptions {
  /** The source directory, found once, at start. */
  directory: string;
  layouts: Layouts;
  page: Page;
  /** How a reading is made. Tests give their own. */
  read?: Read;
}

/** The viewer's server, not yet listening, and what it reads. */
export interface Viewer {
  server: Server;
  source: Source;
  /** Stops reading, drops the layouts and closes every connection. */
  close(): Promise<void>;
}

/**
 * Reads the source directory and makes the server that answers for it: the page, the state,
 * the pictures and the events. It listens once `listen` is called.
 */
export function startViewer(options: ViewerOptions): Viewer {
  const source = new Source(options.directory, options.read);
  const pictures = new Pictures(options.layouts);
  // The pictures follow first, so that a page told of a revision can ask for its pictures.
  pictures.update(source.state.revision, source.state.views);
  source.follow((state) => pictures.update(state.revision, state.views));

  const streams = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    answer(request, response, { server, source, pictures, page: options.page, streams }).catch((cause: unknown) => {
      const why = cause instanceof Error ? cause.message : String(cause);
      if (!response.headersSent) text(response, 500, `Something went wrong that seefore did not expect: ${why}`);
      else response.end();
    });
  });

  const close = async (): Promise<void> => {
    source.close();
    pictures.close();
    for (const stream of streams) stream.end();
    await new Promise<void>((done) => {
      server.close(() => done());
      server.closeAllConnections();
    });
  };
  return { server, source, close };
}

/** Starts the server listening on a port of this machine, and gives back that port. It fails as Node does, as when the port is taken. */
export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      server.off('listening', listening);
      reject(cause);
    };
    const listening = (): void => {
      server.off('error', failed);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', failed);
    server.once('listening', listening);
    server.listen(port, HOST);
  });
}

/** The address of a server that listens, as it is printed. */
export function addressOf(port: number): string {
  return `http://${HOST}:${port}/`;
}

/** What an answer may draw on. */
interface Parts {
  server: Server;
  source: Source;
  pictures: Pictures;
  page: Page;
  /** The event streams that are open, so that they can be ended. */
  streams: Set<ServerResponse>;
}

/**
 * Answers one request. The host must be the printed address, so that a page of another site
 * that has a name of its own made to point here gets nothing.
 */
async function answer(request: IncomingMessage, response: ServerResponse, parts: Parts): Promise<void> {
  const port = (parts.server.address() as AddressInfo).port;
  const own = `http://${HOST}:${port}`;
  if (request.headers.host !== `${HOST}:${port}`) {
    text(response, 403, `This server answers only at ${own}/.`);
    return;
  }
  const path = (request.url ?? '').split('?')[0] ?? '';
  if (path === '/api' || path.startsWith('/api/')) await api(request, response, path, own, parts);
  else pageFile(request, response, path, parts.page);
}

/** Answers a request for data. Only the page itself, or a person typing the address, gets an answer. */
async function api(request: IncomingMessage, response: ServerResponse, path: string, own: string, parts: Parts): Promise<void> {
  if (!fromOwnPage(request, own)) {
    failure(response, 403, 'other-origin', 'This server answers only its own page.');
    return;
  }
  if (request.method !== 'GET') {
    failure(response, 405, 'method', 'This server only reads: it answers GET and nothing else.', { Allow: 'GET' });
    return;
  }
  if (path === '/api/state') {
    json(response, 200, parts.source.state);
    return;
  }
  if (path === '/api/events') {
    events(response, parts);
    return;
  }
  const asked = /^\/api\/pictures\/([^/]+)\/([^/]+)$/.exec(path);
  const revision = asked ? decoded(asked[1]) : undefined;
  const view = asked ? decoded(asked[2]) : undefined;
  if (revision === undefined || view === undefined) {
    failure(response, 404, 'not-found', 'There is nothing at this address.');
    return;
  }
  const result = await parts.pictures.ask(revision, view);
  if ('answer' in result) json(response, 200, result.answer);
  else if ('old' in result) failure(response, 409, 'revision-old', 'This reading of the files is no longer the latest. Ask for the state again.');
  else failure(response, 404, 'no-such-view', `The latest reading has no view \`${view}\`.`);
}

/**
 * Sends the revision of the latest reading at once, and again after each new reading, until
 * the page goes away or the server stops.
 */
function events(response: ServerResponse, parts: Parts): void {
  response.writeHead(200, { ...HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
  const send = (state: ViewerState): void => {
    response.write(`event: revision\ndata: ${state.revision}\n\n`);
  };
  send(parts.source.state);
  const unfollow = parts.source.follow(send);
  parts.streams.add(response);
  response.on('close', () => {
    unfollow();
    parts.streams.delete(response);
  });
}

/**
 * Answers a request for the page. A file comes from the list made at start, and never from a
 * path taken from the request. The page itself answers at `/` and at any address a browser
 * opens as a page, so that an address the page made can be opened again.
 */
function pageFile(request: IncomingMessage, response: ServerResponse, path: string, page: Page): void {
  if (request.method !== 'GET') {
    text(response, 405, 'This server only reads: it answers GET and nothing else.', { Allow: 'GET' });
    return;
  }
  const file = page.get(path === '/' ? INDEX : path) ?? (opensAsPage(request) ? page.get(INDEX) : undefined);
  if (file) send(response, 200, file);
  else text(response, 404, 'There is nothing at this address.');
}

/**
 * True when the request comes from this server's own page, or from no page at all, as when a
 * person types the address. A browser says where a request comes from in `Origin` and in
 * `Sec-Fetch-Site`; a request that says neither comes from no browser page.
 */
function fromOwnPage(request: IncomingMessage, own: string): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== own) return false;
  const site = request.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

/** True when a browser asks for a page to show, and not for a script, a style or data. */
function opensAsPage(request: IncomingMessage): boolean {
  return (request.headers.accept ?? '').includes('text/html');
}

/** A part of a path with its escapes undone. Missing when it is not a sound escape. */
function decoded(part: string | undefined): string | undefined {
  if (part === undefined) return undefined;
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, file: PageFile): void {
  response.writeHead(status, { ...HEADERS, 'Content-Type': file.type, 'Content-Length': file.body.length });
  response.end(file.body);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, { type: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(value)) });
}

/** Says, as data, why there is no answer: as the command does with `--json`. */
function failure(response: ServerResponse, status: number, code: string, message: string, more: Record<string, string> = {}): void {
  const body = Buffer.from(JSON.stringify({ error: { code, message } }));
  response.writeHead(status, { ...HEADERS, ...more, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  response.end(body);
}

function text(response: ServerResponse, status: number, message: string, more: Record<string, string> = {}): void {
  const body = Buffer.from(`${message}\n`);
  response.writeHead(status, { ...HEADERS, ...more, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
  response.end(body);
}
