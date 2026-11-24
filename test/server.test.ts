import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import type { ModelAnswer } from '../src/model/answer.ts';
import { startServer } from '../src/server/server.ts';

const SMALL = fileURLToPath(new URL('./shop', import.meta.url));
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

test('/api/model answers with the name, the records and the problems, read anew at each request', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  await cp(SMALL, folder, { recursive: true });
  const address = await serve(folder);
  const get = async (): Promise<ModelAnswer> => (await fetch(`${address}/api/model`)).json() as Promise<ModelAnswer>;

  const first = await get();
  expect(first).toMatchObject({ folder: basename(folder), name: 'Shop', problems: [] });
  expect(first.records.map((record) => record.id)).toEqual(['order-api', 'api-writes-orders', 'customer-orders', 'order-details', 'ordering', 'placing-an-order', 'clerk', 'customer', 'orders-written-by-the-api', 'orders', 'shop', 'go']);
  expect(first.rulings).toMatchObject([{ rule: 'orders-written-by-the-api', state: 'holds', chosen: ['api-writes-orders'] }]);
  await writeFile(join(folder, 'people', 'bob.yaml'), 'name: Bob\ncolour: red\n');
  expect((await get()).problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
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

test('a font file is served with its type', async () => {
  const page = await mkdtemp(join(tmpdir(), 'seefore-'));
  await mkdir(join(page, 'assets'));
  await writeFile(join(page, 'assets', 'inter.woff2'), 'wOF2');
  await writeFile(join(page, 'assets', 'inter.woff'), 'wOFF');
  const address = await serve(SMALL, page);

  const woff2 = await fetch(`${address}/assets/inter.woff2`);
  expect(woff2.headers.get('content-type')).toBe('font/woff2');
  expect(await woff2.text()).toBe('wOF2');
  expect((await fetch(`${address}/assets/inter.woff`)).headers.get('content-type')).toBe('font/woff');
});

test('an address that names no file gets the page, and a missing file still gets 404', async () => {
  const page = await mkdtemp(join(tmpdir(), 'seefore-'));
  await writeFile(join(page, 'index.html'), '<!doctype html><title>seefore</title>');
  const address = await serve(SMALL, page);

  for (const path of ['/architecture', '/records/order-api', '/..%2f..%2fsecret']) {
    const response = await fetch(`${address}${path}`);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<title>seefore</title>');
  }
  expect((await fetch(`${address}/assets/missing.css`)).status).toBe(404);
  expect((await fetch(`${address}/api/nothing`)).status).toBe(404);
});
