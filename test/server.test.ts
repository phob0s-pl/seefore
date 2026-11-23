import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import type { ModelAnswer } from '../src/model/answer.ts';
import { startServer } from '../src/server/server.ts';

const SMALL = fileURLToPath(new URL('./small', import.meta.url));
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

/** Starts a server on a free port and gives its address. */
async function serve(folder: string, page = SMALL): Promise<string> {
  const server = await startServer(folder, page, 0);
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('/api/model answers for a small folder', async () => {
  const response = await fetch(`${await serve(SMALL)}/api/model`);
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(await response.json()).toEqual({
    folder: 'small',
    files: ['people/alice.yaml', 'people/bob.yml', 'shop.yaml'],
    problems: [],
  });
});

test('/api/model answers for an empty folder, and reads it anew at each request', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const address = await serve(folder);
  const files = async (): Promise<string[]> => ((await (await fetch(`${address}/api/model`)).json()) as ModelAnswer).files;
  expect(await files()).toEqual([]);
  await writeFile(join(folder, 'new.yaml'), 'id: new\n');
  expect(await files()).toEqual(['new.yaml']);
});

test('a request sent to another name than this machine is refused', async () => {
  const address = await serve(SMALL);
  const status = (host: string): Promise<number> =>
    new Promise((done, fail) => {
      request(`${address}/api/model`, { headers: { host } }, (response) => {
        response.resume();
        done(response.statusCode ?? 0);
      })
        .on('error', fail)
        .end();
    });
  expect(await status('elsewhere.example')).toBe(403);
  expect(await status('localhost:5173')).toBe(200);
});

test("the page's files are served, and nothing outside them", async () => {
  const base = await mkdtemp(join(tmpdir(), 'seefore-'));
  const page = join(base, 'page');
  await mkdir(join(page, 'assets'), { recursive: true });
  await writeFile(join(base, 'secret.json'), '{}');
  await writeFile(join(page, 'index.html'), '<!doctype html><title>seefore</title>');
  await writeFile(join(page, 'assets', 'page.js'), 'console.log(1);');
  const address = await serve(SMALL, page);

  const index = await fetch(`${address}/`);
  expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(await index.text()).toContain('<title>seefore</title>');
  const script = await fetch(`${address}/assets/page.js`);
  expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect((await fetch(`${address}/missing.js`)).status).toBe(404);
  expect((await fetch(`${address}/..%2fsecret.json`)).status).toBe(404);
});
