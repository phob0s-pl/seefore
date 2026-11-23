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

/** What the page has drawn: the names on its boxes and the number of lines with a route. */
const DRAWN = `(() => ({
  names: [...document.querySelectorAll('.architecture-node[data-id] strong')].map((name) => name.textContent),
  arrows: [...document.querySelectorAll('.react-flow__edge-path')].filter((path) => (path.getAttribute('d') ?? '').startsWith('M')).length,
}))()`;

test.skipIf(!HAS_CHROME)(
  HAS_CHROME ? 'the built page, served by the command, draws a known box and an arrow in Chrome' : `skipped: there is no Chrome at ${CHROME}`,
  async () => {
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
      const send = (method: string, params: object = {}) =>
        new Promise<Answer>((done) => {
          last += 1;
          waiting.set(last, done);
          open.send(JSON.stringify({ id: last, method, params }));
        });

      await send('Page.enable');
      await send('Page.navigate', { url: `${address}/` });
      let drawn: { names: string[]; arrows: number } = { names: [], arrows: 0 };
      for (let tries = 0; tries < 100 && drawn.arrows === 0; tries++) {
        await pause(100);
        drawn = ((await send('Runtime.evaluate', { expression: DRAWN, returnByValue: true })).result?.result?.value as typeof drawn | undefined) ?? drawn;
      }
      expect(drawn.names).toEqual(expect.arrayContaining(['Customer', 'Shop']));
      expect(drawn.arrows).toBeGreaterThanOrEqual(1);
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
  },
  20_000,
);
