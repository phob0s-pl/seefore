import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import { basename, extname, join, resolve, sep } from 'node:path';
import type { ModelAnswer } from '../model/answer.ts';
import { listFiles } from './files.ts';

/** The only address the server listens on: this machine. */
export const HOST = '127.0.0.1';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** Reads the folder anew and gives the answer of `/api/model`. */
async function readModel(folder: string): Promise<ModelAnswer> {
  return { folder: basename(resolve(folder)), files: await listFiles(folder), problems: [] };
}

/**
 * Serves `/api/model` for the folder, and the built page from `page`, on this machine at the
 * port. It fails as Node does, as when the port is taken. Port 0 takes a free one.
 */
export function startServer(folder: string, page: string, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    answer(folder, page, request.url ?? '/', response).catch(() => {
      send(response, 500, 'text/plain; charset=utf-8', 'Something went wrong.\n');
    });
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, HOST, () => {
      server.off('error', fail);
      done(server);
    });
  });
}

async function answer(folder: string, page: string, url: string, response: ServerResponse): Promise<void> {
  const path = decodeURIComponent(url.split('?')[0] ?? '/');
  if (path === '/api/model') await model(folder, response);
  else await file(page, path, response);
}

async function model(folder: string, response: ServerResponse): Promise<void> {
  let answer: ModelAnswer;
  try {
    answer = await readModel(folder);
  } catch {
    send(response, 500, 'text/plain; charset=utf-8', `Cannot read the folder "${folder}".\n`);
    return;
  }
  send(response, 200, 'application/json; charset=utf-8', JSON.stringify(answer));
}

/** A file of the built page. `/` is its `index.html`; nothing outside `page` is served. */
async function file(page: string, path: string, response: ServerResponse): Promise<void> {
  const root = resolve(page);
  const wanted = resolve(join(root, path === '/' ? 'index.html' : path));
  const type = TYPES[extname(wanted)];
  if (!wanted.startsWith(root + sep) || type === undefined) {
    send(response, 404, 'text/plain; charset=utf-8', 'Not found.\n');
    return;
  }
  let body: Buffer;
  try {
    body = await readFile(wanted);
  } catch {
    send(response, 404, 'text/plain; charset=utf-8', 'Not found.\n');
    return;
  }
  send(response, 200, type, body);
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}
