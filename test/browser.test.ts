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
// its debugging protocol. `npm run check` builds the page first. The tests run side by side,
// each with a Chrome and a server of its own, and click with the mouse events a hand makes.
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

type Point = { x: number; y: number };

/** The centre of what a selector finds, once the diagram has stopped moving, so that a click lands on it. */
async function centreOf(send: Send, selector: string): Promise<Point> {
  const expression = `(() => {
    const found = document.querySelector(${JSON.stringify(selector)});
    if (found === null) return null;
    const box = found.getBoundingClientRect();
    return box.width > 0 ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  })()`;
  return settled(send, expression);
}

/** The point halfway along a line of the diagram, on the screen. */
async function middleOf(send: Send, arrow: string): Promise<Point> {
  const expression = `(() => {
    const path = document.querySelector(${JSON.stringify(`.react-flow__edge[data-id="${arrow}"] .react-flow__edge-path`)});
    if (path === null || path.getTotalLength() === 0) return null;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM());
    return { x: point.x, y: point.y };
  })()`;
  return settled(send, expression);
}

/** A point of the field where nothing is drawn. */
const EMPTY = `(() => {
  const field = document.querySelector('.react-flow__pane').getBoundingClientRect();
  const points = [[12, 12], [field.width - 12, 12], [12, field.height / 2], [field.width / 2, 12]];
  const point = points.map(([x, y]) => ({ x: field.x + x, y: field.y + y })).find(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane'));
  return point ?? null;
})()`;

/** A point an expression gives, once two readings a tenth of a second apart agree. */
async function settled(send: Send, expression: string): Promise<Point> {
  let last = '';
  for (let tries = 0; tries < 50; tries++) {
    const value = (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    const text = JSON.stringify(value ?? null);
    if (value && text === last) return value as Point;
    last = text;
    await pause(100);
  }
  throw new Error(`Nothing to click: ${expression}`);
}

/** A click as a hand makes it: the mouse moves there, is pressed and is let go. */
async function click(send: Send, { x, y }: Point) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

/** What the panel of the diagram says, or false while there is none. */
const PANEL = `(() => {
  const panel = document.querySelector('aside[aria-label="Diagram inspector"]');
  const texts = (selector) => [...(panel?.querySelectorAll(selector) ?? [])].map((each) => each.textContent);
  return panel !== null && {
    kind: texts('.eyebrow')[0],
    name: texts('h2')[0],
    text: texts('p')[0],
    button: texts('a.button')[0],
    path: [...panel.querySelectorAll('.connection-path li')].map((stop) => stop.querySelector('small')?.textContent + ' ' + stop.querySelector('strong')?.textContent),
  };
})()`;
type Read = { kind?: string; name?: string; text?: string; button?: string; path: string[] };

const closed = (send: Send) => waitFor(send, `document.querySelector('aside[aria-label="Diagram inspector"]') === null`);

/** The mouse moves to a point, as a hand moves it. */
const move = (send: Send, { x, y }: Point) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });

/** The ids of the faded boxes and lines, or false while none is faded. */
const FADED = `(() => {
  const ids = [...document.querySelectorAll('.react-flow__node.faded, .react-flow__edge.faded')].map((each) => each.getAttribute('data-id'));
  return ids.length > 0 && ids;
})()`;
const unfaded = (send: Send) => waitFor(send, `document.querySelector('.faded') === null`);
const SHOP_BOX = '.react-flow__node[data-id="shop"]';

test.skipIf(!HAS_CHROME).concurrent(
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

test.skipIf(!HAS_CHROME).concurrent(
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

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a click on a box opens the panel with its name, its type and a button, and the button opens its page' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await click(send, await centreOf(send, '.react-flow__node[data-id="shop"]'));
      const read = (await waitFor(send, PANEL)) as Read | false;
      expect(read).toMatchObject({ kind: 'System', name: 'Shop', text: 'Sells things online.', button: 'Open model details' });
      await click(send, await centreOf(send, 'aside[aria-label="Diagram inspector"] a.button'));
      expect(await waitFor(send, `document.title === 'Shop · seefore' && location.pathname`)).toBe('/models/shop');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a click on a line opens the panel with its connection and the path between its real ends' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await click(send, await middleOf(send, 'customer->shop'));
      const read = (await waitFor(send, PANEL)) as Read | false;
      expect(read).toMatchObject({ kind: 'Connection', name: 'Places an order', button: 'Open connection details', path: ['From Customer', 'To Order API'] });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'Escape and a click on the empty field each close the panel' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/?depth=containers` });
      const app = '.react-flow__node[data-id="order-api"]';
      await click(send, await centreOf(send, app));
      expect(await waitFor(send, PANEL)).toMatchObject({ kind: 'App · service', name: 'Order API' });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      expect(await closed(send)).toBe(true);
      // A pick may slide the diagram clear of the panel, so the box is found again.
      await click(send, await centreOf(send, app));
      expect(await waitFor(send, PANEL)).toMatchObject({ name: 'Order API' });
      await click(send, await settled(send, EMPTY));
      expect(await closed(send)).toBe(true);
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the mouse on a box fades a box it does not join and not one it joins, and on the empty field nothing' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await move(send, await centreOf(send, SHOP_BOX));
      // The shop joins the customer; the clerk joins nothing.
      expect(await waitFor(send, FADED)).toEqual(['clerk']);
      await move(send, await settled(send, EMPTY));
      expect(await unfaded(send)).toBe(true);
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a pick holds the fade while the mouse is on the empty field, and Escape ends it' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await click(send, await centreOf(send, SHOP_BOX));
      expect(await waitFor(send, PANEL)).toMatchObject({ name: 'Shop' });
      await move(send, await settled(send, EMPTY));
      // Past the wait, the hover is none and the pick's highlight holds.
      await pause(400);
      expect((await send('Runtime.evaluate', { expression: FADED, returnByValue: true })).result?.result?.value).toEqual(['clerk']);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      expect(await unfaded(send)).toBe(true);
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the mouse on a line shows the label with the two boxes it joins' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await move(send, await middleOf(send, 'customer->shop'));
      expect(await waitFor(send, `document.querySelector('.diagram-hover-label[role="tooltip"]')?.textContent`)).toBe('Customer → Shop');
      expect(await waitFor(send, FADED)).toEqual(['clerk']);
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a choice in the focus menu puts the focus in the address and draws fewer boxes, and the back arrow returns to everything' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/?depth=containers` });
      const boxes = (count: number) => waitFor(send, `document.querySelectorAll('.architecture-node[data-id]').length === ${count}`);
      expect(await boxes(5)).toBe(true);
      await click(send, await centreOf(send, 'button[aria-label="Focus"]'));
      await click(send, await centreOf(send, '[role="listbox"] [role="option"][href="/?depth=containers&focus=shop"]'));
      // The address, whether the list is open, and what the trigger says, once they are as wanted.
      const shows = (search: string, choice: string) =>
        waitFor(send, `location.search === ${JSON.stringify(search)} && document.querySelector('[role="listbox"]') === null && document.querySelector('button[aria-label="Focus"]').textContent === ${JSON.stringify(choice)}`);
      expect(await shows('?depth=containers&focus=shop', 'Shop')).toBe(true);
      // The clerk has no line with the shop.
      expect(await boxes(4)).toBe(true);
      await click(send, await centreOf(send, 'button[aria-label="Go back"]'));
      expect(await shows('?depth=containers', 'All systems')).toBe(true);
      expect(await boxes(5)).toBe(true);
    }),
  20_000,
);
