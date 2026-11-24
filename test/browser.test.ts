import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { startServer } from '../src/server/server.ts';

// The built page, served by the command, drawn in the Chrome that is installed and driven over
// its debugging protocol. `npm run check` builds the page first.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = fileURLToPath(new URL('../dist/ui', import.meta.url));
const SHOP = fileURLToPath(new URL('./shop', import.meta.url));
const HAS_CHROME = existsSync(CHROME);

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The port Chrome chose, once it has written it into the profile. */
async function debugPort(profile: string): Promise<string> {
  for (let tries = 0; tries < 100; tries++) {
    const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    const port = text.split('\n')[0];
    if (port) return port;
    await pause(100);
  }
  throw new Error('Chrome did not start.');
}

/** What the page has drawn: the names on its boxes, the number of lines with a route, and the titles of its bands. */
const DRAWN = `(() => ({
  names: [...document.querySelectorAll('.architecture-node[data-id] strong')].map((name) => name.textContent),
  arrows: [...document.querySelectorAll('.react-flow__edge-path')].filter((path) => (path.getAttribute('d') ?? '').startsWith('M')).length,
  bands: [...document.querySelectorAll('.diagram-band-title')].map((title) => title.textContent),
}))()`;

/** Sends one command over the debugging protocol and gives its answer. */
type Send = (method: string, params?: object) => Promise<{ result?: { result?: { value?: unknown } } }>;

/**
 * Serves the shop with the built page, starts Chrome, and gives `run` a way to send it commands
 * and the page's address. Chrome and the server are stopped whatever happens.
 */
async function inChrome(run: (send: Send, address: string) => Promise<void>) {
  expect(existsSync(join(PAGE, 'index.html')), 'the page is built: run "npm run build" first').toBe(true);
  const profile = await mkdtemp(join(tmpdir(), 'seefore-chrome-'));
  let server: Server | undefined;
  let chrome: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  try {
    server = await startServer(SHOP, PAGE, 0);
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1280,800', 'about:blank'], {
      stdio: 'ignore',
    });
    const port = await debugPort(profile);
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const target = targets.find((each) => each.type === 'page');
    if (target === undefined) throw new Error('Chrome has no page open.');

    const open = new WebSocket(target.webSocketDebuggerUrl);
    socket = open;
    await new Promise((done, fail) => {
      open.addEventListener('open', done);
      open.addEventListener('error', fail);
    });
    type Answer = { id?: number; result?: { result?: { value?: unknown } } };
    let last = 0;
    const waiting = new Map<number, (answer: Answer) => void>();
    open.addEventListener('message', (message) => {
      const answer = JSON.parse(String(message.data)) as Answer;
      if (answer.id !== undefined) waiting.get(answer.id)?.(answer);
    });
    const send: Send = (method, params = {}) =>
      new Promise<Answer>((done) => {
        last += 1;
        waiting.set(last, done);
        open.send(JSON.stringify({ id: last, method, params }));
      });
    await send('Page.enable');
    await run(send, address);
  } finally {
    socket?.close();
    if (chrome !== undefined && chrome.exitCode === null && chrome.signalCode === null) {
      const ended = new Promise((done) => {
        chrome?.once('exit', done);
        chrome?.once('error', done);
      });
      chrome.kill('SIGKILL');
      await ended;
    }
    await new Promise((done) => (server ? server.close(done) : done(undefined)));
    await rm(profile, { recursive: true, force: true });
  }
}

/** The value of an expression in the page, once it is not empty, or the last one after five seconds. */
async function waitFor(send: Send, expression: string): Promise<unknown> {
  let value: unknown;
  for (let tries = 0; tries < 50; tries++) {
    value = (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    if (value) return value;
    await pause(100);
  }
  return value;
}

test.skipIf(!HAS_CHROME)(
  HAS_CHROME ? 'the built page, served by the command, draws a known box, an arrow and a band in Chrome' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      let drawn: { names: string[]; arrows: number; bands: string[] } = { names: [], arrows: 0, bands: [] };
      for (let tries = 0; tries < 100 && drawn.arrows === 0; tries++) {
        await pause(100);
        drawn = ((await send('Runtime.evaluate', { expression: DRAWN, returnByValue: true })).result?.result?.value as typeof drawn | undefined) ?? drawn;
      }
      expect(drawn.names).toEqual(expect.arrayContaining(['Customer', 'Shop']));
      expect(drawn.arrows).toBeGreaterThanOrEqual(1);
      expect(drawn.bands).toContain('Our systems');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME)(
  HAS_CHROME ? 'Models lists the records: a row opens its page, a link on it opens the next, and a connection shows its path' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/models` });
      // A link by its name: the whole of its text, or the name of a row that is a link.
      const click = (text: string) => `(() => {
        const link = [...document.querySelectorAll('a')].find((each) => (each.querySelector('.row-name') ?? each).textContent === ${JSON.stringify(text)});
        link?.click();
        return link !== undefined;
      })()`;
      expect(await waitFor(send, click('Order API'))).toBe(true);
      const page = `location.pathname === '/models/order-api' && {
        shop: [...document.querySelectorAll('a[href="/models/shop"]')].some((link) => link.textContent === 'Shop'),
        sections: [...document.querySelectorAll('.section-label')].map((label) => label.textContent),
      }`;
      const read = (await waitFor(send, page)) as { shop: boolean; sections: string[] } | false;
      expect(read && read.shop).toBe(true);
      expect(read && read.sections).toContain('Is acted on by');
      expect(await waitFor(send, click('Shop'))).toBe(true);
      expect(await waitFor(send, `location.pathname === '/models/shop' && document.title`)).toBe('Shop · seefore');

      await send('Page.navigate', { url: `${address}/connections` });
      const paths = await waitFor(send, `[...document.querySelectorAll('.row-cell')].map((cell) => cell.textContent).join(' | ')`);
      expect(paths).toContain('Order API → Orders');
    }),
  20_000,
);
