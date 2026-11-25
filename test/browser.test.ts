import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
 * Serves the shop, or another folder, with the built page, starts Chrome, and gives `run` a way
 * to send it commands and the page's address. Chrome and the server are stopped whatever happens.
 */
async function inChrome(run: (send: Send, address: string) => Promise<void>, folder = SHOP) {
  expect(existsSync(join(PAGE, 'index.html')), 'the page is built: run "npm run build" first').toBe(true);
  const profile = await mkdtemp(join(tmpdir(), 'seefore-chrome-'));
  let server: Server | undefined;
  let chrome: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  try {
    server = await startServer(folder, PAGE, 0);
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
    // Chrome's helpers may still write to the profile for a moment after it is killed.
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
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
      // The system's page has its context as one fact, its count; the lines are read on the page of the context.
      const context = `document.querySelector('.facts') !== null && {
        facts: [...document.querySelectorAll('.facts > div')].map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
        section: document.querySelector('section[aria-label="Context"]') !== null,
      }`;
      expect(await waitFor(send, context)).toEqual({ facts: ['Type System', 'Context 1 prefer'], section: false });

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

/** A key pressed and let go, as a hand presses it. */
async function press(send: Send, key: string, code: number) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code });
}

/** What the page of a flow shows: the address's step, the bar, the picked row, the stepped line and its heads, and what is faded. */
const FLOW = `(() => {
  const bar = document.querySelector('section[aria-label="Current step"]');
  const stepped = [...document.querySelectorAll('.react-flow__edge.stepped')];
  const path = stepped[0]?.querySelector('.react-flow__edge-path');
  return document.querySelectorAll('.react-flow__edge-path[d^="M"]').length > 0 && {
    hash: location.hash,
    bar: bar?.innerText.replace(/\\s+/g, ' ').trim(),
    current: document.querySelector('[aria-current="step"]')?.getAttribute('data-step') ?? null,
    stepped: stepped.map((each) => each.getAttribute('data-id')),
    heads: path ? [path.hasAttribute('marker-start'), path.hasAttribute('marker-end')] : [],
    faded: [...document.querySelectorAll('.faded')].map((each) => each.getAttribute('data-id')).sort(),
  };
})()`;
type FlowRead = { hash: string; bar: string; current: string | null; stepped: string[]; heads: boolean[]; faded: string[] };
/** The page of the flow, once the address names the step and the page has drawn it, or after five seconds what it shows. */
async function flowAt(send: Send, hash: string): Promise<FlowRead> {
  const step = JSON.stringify(hash === '' ? null : hash.slice(1));
  const read = (await waitFor(send, `(() => { const read = ${FLOW}; return read && read.hash === ${JSON.stringify(hash)} && read.current === ${step} && read; })()`)) as FlowRead | false;
  return read || ((await send('Runtime.evaluate', { expression: FLOW, returnByValue: true })).result?.result?.value as FlowRead);
}

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a flow opens on the whole of it; a click on a row puts the step in the address, fills the bar and lights one line; the down key moves on' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/flows/placing-an-order` });
      const whole = await flowAt(send, '');
      expect(whole).toMatchObject({ current: null, stepped: [], faded: [] });
      expect(whole.bar).toContain('Placing an order');
      expect(await waitFor(send, 'document.title')).toBe('Placing an order · seefore');

      await click(send, await centreOf(send, '[data-row="step"][data-step="saves"]'));
      const saves = await flowAt(send, '#saves');
      expect(saves).toMatchObject({ current: 'saves', stepped: ['order-api->orders'], heads: [false, true] });
      expect(saves.bar).toContain('2 of 3 Saves the order');
      expect(saves.bar).toContain('Order API to Orders Only when the customer has paid Data Order details');
      expect(saves.faded).toEqual(['customer', 'customer->order-api']);

      // The reply travels back along the customer's line: its one head is at the customer.
      await press(send, 'ArrowDown', 40);
      const confirms = await flowAt(send, '#confirms');
      expect(confirms).toMatchObject({ current: 'confirms', stepped: ['customer->order-api'], heads: [true, false], faded: ['order-api->orders', 'orders'] });
      expect(confirms.bar).toContain('3 of 3 Confirms the order');
      expect(confirms.bar).toContain('Order API replies to Customer Reply to 1, Places an order');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the list of features has each flow under its feature and opens it, the old list of flows leads there, and the back arrow leaves the flow in one go' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      // There is no list of flows apart: its old address leads to the features.
      await send('Page.navigate', { url: `${address}/flows` });
      expect(await waitFor(send, `location.pathname === '/features' && [...document.querySelectorAll('main a')].map((link) => link.getAttribute('href')).join()`)).toBe('/features/ordering,/flows/placing-an-order');
      expect(await waitFor(send, `document.querySelector('nav[aria-label="Main navigation"]')?.innerText.replace(/\\s+/g, ' ')`)).toBe('Architecture Context Features Models Rules Changes');
      expect(await waitFor(send, `document.querySelector('a[href="/flows/placing-an-order"]')?.textContent`)).toBe('Placing an order');
      await click(send, await centreOf(send, 'a[href="/flows/placing-an-order"]'));
      await flowAt(send, '');
      await click(send, await centreOf(send, '[data-row="step"][data-step="places"]'));
      await press(send, 'ArrowDown', 40);
      expect((await flowAt(send, '#saves')).current).toBe('saves');
      await click(send, await centreOf(send, 'button[aria-label="Go back"]'));
      expect(await waitFor(send, `location.pathname === '/features' && location.pathname`)).toBe('/features');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? "the list of features opens a feature's page, and a flow on it opens the flow" : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/features` });
      expect(await waitFor(send, `document.querySelector('a[href="/features/ordering"]')?.innerText.replace(/\\s+/g, ' ')`)).toBe('Ordering');
      await click(send, await centreOf(send, 'a[href="/features/ordering"]'));
      const page = `location.pathname === '/features/ordering' && document.title === 'Ordering · seefore' && [...document.querySelectorAll('.section-label')].map((label) => label.textContent)`;
      expect(await waitFor(send, page)).toEqual(['Flows', 'From its flows', 'Data']);
      expect(await waitFor(send, `[...document.querySelectorAll('.facts dt')].map((label) => label.textContent).join()`)).toBe('For');
      await click(send, await centreOf(send, 'section[aria-label="Flows"] a[href="/flows/placing-an-order"]'));
      expect(await waitFor(send, `document.title === 'Placing an order · seefore' && location.pathname`)).toBe('/flows/placing-an-order');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? "the Data tab opens a data record's page with its fields, and a step on it opens the flow on that step" : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/data` });
      await click(send, await centreOf(send, 'a[href="/data/order-details"]'));
      const page = `location.pathname === '/data/order-details' && document.querySelector('section[aria-label="Connections"]') !== null && {
        tab: document.querySelector('.models-tabs a.active')?.textContent,
        fields: [...document.querySelectorAll('section[aria-label="Fields"] tr')].map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
        ways: [...document.querySelectorAll('section[aria-label="Connections"] td')].map((cell) => cell.textContent),
      }`;
      expect(await waitFor(send, page)).toEqual({
        tab: 'Data',
        fields: ['items What is bought, and how many of each', 'address'],
        ways: ['Customer to Order API', 'Order API to Orders'],
      });
      await click(send, await centreOf(send, 'section[aria-label="Steps"] a[href="/flows/placing-an-order#saves"]'));
      expect(await waitFor(send, `location.hash === '#saves' && document.querySelector('[aria-current="step"]')?.getAttribute('data-step')`)).toBe('saves');
    }),
  20_000,
);

/** The text of what a selector finds, each with its spaces made one. */
const texts = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].map((each) => each.innerText.replace(/\\s+/g, ' ').trim())`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'Rules lists the rules under its title, and a row opens its rule, as written and with what it looked at' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/rules` });
      const list = `document.querySelector('ul[aria-label="Rules"] > li') !== null && {
        above: document.querySelector('main h1').nextElementSibling?.className,
        rows: ${texts('ul[aria-label="Rules"] > li')},
        lit: document.querySelector('nav[aria-label="Main navigation"] a.active')?.textContent,
        dot: document.querySelector('.nav-dot') !== null,
      }`;
      expect(await waitFor(send, list)).toEqual({
        above: 'panel panel-lift rules-list',
        rows: ['The orders are written only by the Order API Holds'],
        lit: 'Rules',
        dot: false,
      });
      await click(send, await centreOf(send, 'a[href="/rules/orders-written-by-the-api"]'));
      const page = `location.pathname === '/rules/orders-written-by-the-api' && document.title === 'The orders are written only by the Order API · seefore' && document.querySelector('section[aria-label="Looked at"]') !== null && {
        crumbs: document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText.replace(/\\s+/g, ' '),
        pills: ${texts('.record-marks .pill')},
        sections: ${texts('.section-label')},
        rule: ${texts('.rule-written > div')},
        looked: ${texts('section[aria-label="Looked at"] li')},
        lit: document.querySelector('nav[aria-label="Main navigation"] a.active')?.textContent,
      }`;
      expect(await waitFor(send, page)).toEqual({
        crumbs: 'Rules / The orders are written only by the Order API',
        pills: ['Holds'],
        sections: ['The rule', 'Looked at'],
        rule: ['Each to · id Orders', 'access write, read-write', 'Must from · id Order API'],
        looked: ['No name Order API → Orders'],
        lit: 'Rules',
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a break opens its record, whose page names the rule' : `skipped: there is no Chrome at ${CHROME}`,
  async () => {
    // A copy of the shop with one rule more, which its store of orders breaks.
    const folder = await mkdtemp(join(tmpdir(), 'seefore-shop-'));
    try {
      await cp(SHOP, folder, { recursive: true });
      await writeFile(join(folder, 'rules', 'stores-name-technology.yaml'), 'name: Every store names its technology\neach: {kind: stores}\nmust: {technology: any}\n');
      await inChrome(async (send, address) => {
        await send('Page.navigate', { url: `${address}/rules` });
        const list = `document.querySelector('.nav-dot') !== null && {
          dot: document.querySelector('.nav-dot').getAttribute('aria-label'),
          rows: ${texts('ul[aria-label="Rules"] > li')},
        }`;
        expect(await waitFor(send, list)).toEqual({
          dot: 'A rule is broken',
          rows: ['Every store names its technology Broken', 'The orders are written only by the Order API Holds'],
        });
        await click(send, await centreOf(send, 'a[href="/rules/stores-name-technology"]'));
        const breaks = `location.pathname === '/rules/stores-name-technology' && document.querySelector('section[aria-label="Where it breaks"] li') !== null && {
          says: document.querySelector('section[aria-label="Where it breaks"] .panel-text')?.textContent,
          rows: ${texts('section[aria-label="Where it breaks"] li')},
        }`;
        expect(await waitFor(send, breaks)).toEqual({ says: 'The one record it looks at does not match Must.', rows: ['Orders Store · database Does not match technology any'] });
        await click(send, await centreOf(send, 'section[aria-label="Where it breaks"] a[href="/models/orders"]'));
        const record = `location.pathname === '/models/orders' && document.querySelector('section[aria-label="Rules"]') !== null && {
          last: [...document.querySelectorAll('.section-label')].at(-1)?.textContent,
          rules: ${texts('section[aria-label="Rules"] tr')},
          link: document.querySelector('section[aria-label="Rules"] a')?.getAttribute('href'),
        }`;
        expect(await waitFor(send, record)).toEqual({ last: 'Rules', rules: ['Every store names its technology Breaks it'], link: '/rules/stores-name-technology' });
      }, folder);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the entry Context opens the list, global lines first and then each system with its own, and a line opens its page with its reason' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await click(send, await centreOf(send, 'nav[aria-label="Main navigation"] a[href="/context"]'));
      const list = `location.pathname === '/context' && document.title === 'Context · seefore' && document.querySelector('.context-list .row') !== null && {
        lit: document.querySelector('nav[aria-label="Main navigation"] a.active')?.textContent,
        sections: ${texts('main .section-label')},
        rows: ${texts('.context-list .row')},
        links: [...document.querySelectorAll('.context-list .row a')].map((link) => link.getAttribute('href')),
      }`;
      // The global lines, the one that binds first; then the system, and its line set in under it.
      expect(await waitFor(send, list)).toEqual({
        lit: 'Context',
        sections: ['Global', 'Of one system'],
        rows: ['An order is never lost once the customer has been told it is placed. Must', 'A new store is a PostgreSQL database. Prefer', 'Shop', 'A new feature goes into the Order API. Prefer'],
        links: ['/context/orders-are-never-lost', '/context/a-new-store-is-postgresql', '/models/shop', '/context/features-go-into-the-order-api'],
      });
      await click(send, await centreOf(send, '.context-list a[href="/context/orders-are-never-lost"]'));
      // The window's title is set a moment after the page is drawn, so the wait is for it too.
      const page = `location.pathname === '/context/orders-are-never-lost' && document.querySelector('.context-title') !== null && document.title.startsWith('An order') && {
        lit: document.querySelector('nav[aria-label="Main navigation"] a.active')?.textContent,
        window: document.title,
        crumbs: document.querySelector('nav[aria-label="Breadcrumb"]') !== null,
        title: document.querySelector('.context-title h1').textContent,
        marks: ${texts('.context-title .pill')},
        why: ${texts('section[aria-label="Why"] .panel')},
        facts: ${texts('.facts > div')},
        beside: ${texts('main .section-label')}.at(-1),
        others: ${texts('.context-list .row')},
      }`;
      expect(await waitFor(send, page)).toEqual({
        lit: 'Context',
        window: 'An order is never lost once the customer has been told it is placed. · seefore',
        crumbs: false,
        title: 'An order is never lost once the customer has been told it is placed.',
        marks: ['Must'],
        why: ['It is what the shop promises its customers.'],
        facts: ['Kind Must. A design that goes against it is wrong.', 'About Every system'],
        beside: 'The other global lines',
        others: ['A new store is a PostgreSQL database. Prefer'],
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? "a line about one system names it, the system's fact Context leads back to the list, and a line leads to the others of its group" : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/context/features-go-into-the-order-api` });
      // The page of a line, once it shows the sentence: the address changes before the page is drawn anew.
      const at = (id: string, sentence: string) => `location.pathname === ${JSON.stringify(`/context/${id}`)} && document.querySelector('.context-title h1')?.textContent === ${JSON.stringify(sentence)}`;
      const onList = `location.pathname === '/context' && document.querySelector('main h1')?.textContent === 'Context' && document.querySelectorAll('.context-list .row').length`;
      expect(await waitFor(send, at('features-go-into-the-order-api', 'A new feature goes into the Order API.'))).toBe(true);
      // It is about the shop alone, and no other line is: its page ends with the facts.
      expect(await waitFor(send, `({ marks: ${texts('.context-title .pill')}, facts: ${texts('.facts > div')}, others: document.querySelectorAll('.context-list .row').length })`)).toEqual({
        marks: ['Prefer'],
        facts: ['Kind Prefer. It decides between designs that are allowed, and may yield.', 'About Shop'],
        others: 0,
      });
      // The system it names opens the system, whose fact Context counts the lines that name it and leads to the list.
      await click(send, await centreOf(send, '.facts a[href="/models/shop"]'));
      const fact = `location.pathname === '/models/shop' && document.title === 'Shop · seefore' && [...document.querySelectorAll('.facts > div')].find((row) => row.querySelector('dt').textContent === 'Context')`;
      expect(await waitFor(send, `(() => { const row = ${fact}; return row && [row.querySelector('dd').textContent, row.querySelector('a')?.getAttribute('href')]; })()`)).toEqual(['1 prefer', '/context']);
      await click(send, await centreOf(send, '.facts a[href="/context"]'));
      expect(await waitFor(send, onList)).toBe(4);
      // A global line leads to the other global line, and the entry in the sidebar leads back.
      await click(send, await centreOf(send, '.context-list a[href="/context/a-new-store-is-postgresql"]'));
      expect(await waitFor(send, at('a-new-store-is-postgresql', 'A new store is a PostgreSQL database.'))).toBe(true);
      await click(send, await centreOf(send, '.context-list a[href="/context/orders-are-never-lost"]'));
      expect(await waitFor(send, at('orders-are-never-lost', 'An order is never lost once the customer has been told it is placed.'))).toBe(true);
      await click(send, await centreOf(send, 'nav[aria-label="Main navigation"] a[href="/context"]'));
      expect(await waitFor(send, onList)).toBe(4);
      // An id that names no line is missing; so is the id of a record that is no line.
      await send('Page.navigate', { url: `${address}/context/shop` });
      expect(await waitFor(send, `document.querySelector('.empty-state') !== null && ${texts('.empty-state')}[0]`)).toBe('No such record. Back to Context');
    }),
  20_000,
);

/** What the sidebar shows: the text of the main navigation or none, and that of a change's sections and its current entry, or none. */
const SIDEBAR = `({
  main: document.querySelector('nav[aria-label="Main navigation"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
  change: document.querySelector('nav[aria-label="Change sections"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
  current: document.querySelector('nav[aria-label="Change sections"] a.active .nav-text')?.textContent ?? null,
})`;
/** A page of the change in the test model, once it is drawn: the address, the title on the page and the window's. */
const onChange = (path: string) => `location.pathname === ${JSON.stringify(path)} && document.querySelector('main h1')?.textContent === 'Orders by post' && document.title === 'Orders by post · seefore' && ${SIDEBAR}`;
/** The list of the changes, once it is drawn. */
const ON_CHANGES = `location.pathname === '/changes' && document.querySelector('ul[aria-label="Changes"] > li') !== null && ${SIDEBAR}`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the entry Changes opens the list, and a row opens the change with its own sidebar, on Need: the prompt and what was answered' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/` });
      await click(send, await centreOf(send, 'nav[aria-label="Main navigation"] a[href="/changes"]'));
      const list = `(() => { const read = ${ON_CHANGES}; return read && document.title === 'Changes · seefore' && {
        ...read,
        title: document.querySelector('main h1').textContent,
        lit: document.querySelector('nav[aria-label="Main navigation"] a.active')?.textContent,
        rows: ${texts('ul[aria-label="Changes"] > li')},
        links: [...document.querySelectorAll('ul[aria-label="Changes"] a')].map((link) => link.getAttribute('href')),
      }; })()`;
      expect(await waitFor(send, list)).toEqual({
        main: 'Architecture Context Features Models Rules Changes',
        change: null,
        current: null,
        title: 'Changes',
        lit: 'Changes',
        rows: ['Orders by post', 'Orders on paper only'],
        links: ['/changes/orders-by-post', '/changes/orders-on-paper-only'],
      });
      await click(send, await centreOf(send, 'ul[aria-label="Changes"] a[href="/changes/orders-by-post"]'));
      const need = `{ sections: ${texts('main .section-label')}, prompt: ${texts('section[aria-label="Prompt"] .panel-text')}, given: ${texts('section[aria-label="Given"] .change-given > li')} }`;
      expect(await waitFor(send, `(() => { const read = ${onChange('/changes/orders-by-post')}; return read && read.change !== null && document.querySelector('main .section-label') !== null && { ...read, ...${need} }; })()`)).toEqual({
        main: null,
        change: '1 Need 2 Records All changes',
        current: 'Need',
        sections: ['Prompt', 'Given'],
        prompt: ['The clerk takes orders that come by post, and types them into the shop.'],
        given: ['A posted order is placed as an order made online is.'],
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'Records opens its page, "All changes" leads back to the list with the main sidebar, and an id that names no change is missing' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post` });
      expect(await waitFor(send, `(() => { const read = ${onChange('/changes/orders-by-post')}; return read && read.current; })()`)).toBe('Need');
      await click(send, await centreOf(send, 'nav[aria-label="Change sections"] a[href="/changes/orders-by-post/records"]'));
      // What Records lists is the next test's.
      expect(await waitFor(send, `(() => { const read = ${onChange('/changes/orders-by-post/records')}; return read && read.current === 'Records' && document.querySelector('main .row') !== null && read; })()`)).toMatchObject({ main: null, current: 'Records' });
      await click(send, await centreOf(send, 'nav[aria-label="Change sections"] a[href="/changes"]'));
      expect(await waitFor(send, `(() => { const read = ${ON_CHANGES}; return read && read.main !== null && read; })()`)).toEqual({
        main: 'Architecture Context Features Models Rules Changes',
        change: null,
        current: null,
      });
      // The id of a record that is no change: the change is looked for in `changes/` alone.
      await send('Page.navigate', { url: `${address}/changes/shop` });
      expect(await waitFor(send, `document.querySelector('.empty-state') !== null && { says: ${texts('.empty-state')}[0], sidebar: ${SIDEBAR} }`)).toEqual({
        says: 'No such record. Back to Changes',
        sidebar: { main: 'Architecture Context Features Models Rules Changes', change: null, current: null },
      });
    }),
  20_000,
);

/** The page of a record under the change in the test model, once it is drawn: the address, its name on the page and in the window's title. */
const onRecord = (path: string, name: string) =>
  `location.pathname === ${JSON.stringify(`/changes/orders-by-post/records/${path}`)} && document.querySelector('main h1')?.textContent === ${JSON.stringify(name)} && document.title === ${JSON.stringify(`${name} · seefore`)} && ${SIDEBAR}`;
/** Each row of Before and after, as the texts of its key and its two sides. */
const DIFF = `[...document.querySelectorAll('section[aria-label="Before and after"] .change-diff-row:not(.change-diff-heading)')].map((row) => [...row.children].map((cell) => cell.innerText.replace(/\\s+/g, ' ').trim()))`;
/** The addresses the links of what a selector finds lead to. */
const hrefs = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].map((link) => link.getAttribute('href'))`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'Records has a section for each list the change touches, each row with its mark, leading under the change' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records` });
      const records = `(() => { const read = ${onChange('/changes/orders-by-post/records')}; return read && document.querySelector('main .row') !== null && {
        current: read.current,
        sections: ${texts('main .section-label')},
        rows: ${texts('main .row')},
        tones: [...document.querySelectorAll('main .row .pill')].map((pill) => pill.className),
        links: ${hrefs('main .row a')},
      }; })()`;
      expect(await waitFor(send, records)).toEqual({
        current: 'Records',
        sections: ['Features', 'Flows', 'Software', 'Connections', 'Technologies', 'Data'],
        rows: ['Ordering Updated', 'Placing an order Updated', 'Taking a posted order Added', 'Order API Updated', 'Types in a posted order Added', 'Go Removed', 'Order details Updated'],
        // Updated is yellow on every page of a change.
        tones: ['pill tone-caution', 'pill tone-caution', 'pill tone-success', 'pill tone-caution', 'pill tone-success', 'pill tone-danger', 'pill tone-caution'],
        links: [
          '/changes/orders-by-post/records/features/ordering',
          '/changes/orders-by-post/records/flows/placing-an-order',
          '/changes/orders-by-post/records/flows/taking-a-posted-order',
          '/changes/orders-by-post/records/apps/order-api',
          '/changes/orders-by-post/records/connections/clerk-orders',
          '/changes/orders-by-post/records/technologies/go',
          '/changes/orders-by-post/records/data/order-details',
        ],
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? "a row of Records opens the record under the change, with the change's sidebar, the way back, the line, and before and after" : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records` });
      await click(send, await centreOf(send, 'main a[href="/changes/orders-by-post/records/features/ordering"]'));
      const page = `(() => { const read = ${onRecord('features/ordering', 'Ordering')}; return read && document.querySelector('.breadcrumb') !== null && {
        ...read,
        crumbs: ${texts('.breadcrumb')}[0],
        back: ${hrefs('.breadcrumb a')},
        marks: ${texts('.record-title .pill')},
        line: document.querySelector('.change-record-line') !== null,
        sections: ${texts('main .section-label')},
        diff: ${DIFF},
        descriptions: document.querySelectorAll('main .panel-text').length,
      }; })()`;
      expect(await waitFor(send, page)).toEqual({
        main: null,
        change: '1 Need 2 Records All changes',
        current: 'Records',
        crumbs: 'Orders by post / Records / Ordering',
        back: ['/changes/orders-by-post', '/changes/orders-by-post/records'],
        marks: ['Updated'],
        // An updated record has no line under its title: its mark and Before and after say it.
        line: false,
        // The feature's own page under it, without its description: the description is a key that changes.
        sections: ['Before and after', 'Flows', 'From its flows', 'Data'],
        diff: [['description', 'Customers buy things online, and the clerk sees what they bought.', 'Customers buy things online or by post, and the clerk sees what they bought.']],
        descriptions: 0,
      });
      // "Records" in the way back leads to the list.
      await click(send, await centreOf(send, '.breadcrumb a[href="/changes/orders-by-post/records"]'));
      expect(await waitFor(send, `(() => { const read = ${onChange('/changes/orders-by-post/records')}; return read && document.querySelector('main .row') !== null && read.current; })()`)).toBe('Records');
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'under a change a link to a record it touches stays under the change, and a link to any other opens the system' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/connections/clerk-orders` });
      // The added connection: the clerk is not touched, the Order API is.
      expect(await waitFor(send, `(() => { const read = ${onRecord('connections/clerk-orders', 'Types in a posted order')}; return read && document.querySelector('.connection-path a') !== null && { line: document.querySelector('.change-record-line') !== null, ends: ${hrefs('.connection-path a')} }; })()`)).toEqual({
        // An added record has no line under its title: its mark says it.
        line: false,
        ends: ['/actors/clerk', '/changes/orders-by-post/records/apps/order-api'],
      });
      await click(send, await centreOf(send, '.connection-path a[href="/changes/orders-by-post/records/apps/order-api"]'));
      // The Order API as it would be: its technology taken out, the one it had removed by the change too.
      expect(await waitFor(send, `(() => { const read = ${onRecord('apps/order-api', 'Order API')}; return read && document.querySelector('.facts a') !== null && { current: read.current, diff: ${DIFF}, removed: ${hrefs('section[aria-label="Before and after"] a')}, in: ${hrefs('.facts a')} }; })()`)).toEqual({
        current: 'Records',
        // The key goes whole: the other side says so once, and the id bears no mark of its own.
        diff: [['technology', 'Go', 'Taken out']],
        removed: ['/changes/orders-by-post/records/technologies/go'],
        in: ['/models/shop'],
      });
      await click(send, await centreOf(send, '.facts a[href="/models/shop"]'));
      expect(await waitFor(send, `location.pathname === '/models/shop' && document.title === 'Shop · seefore' && ${SIDEBAR}`)).toEqual({ main: 'Architecture Context Features Models Rules Changes', change: null, current: null });
      // A removed record is shown as it is today, with its way to the system; what names it and is touched stays under the change.
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/technologies/go` });
      expect(await waitFor(send, `(() => { const read = ${onRecord('technologies/go', 'Go')}; return read && document.querySelector('section[aria-label="Used by"] a') !== null && { line: ${texts('.change-record-line')}[0], open: ${hrefs('.change-record-line a')}, usedBy: ${hrefs('section[aria-label="Used by"] a')} }; })()`)).toEqual({
        line: 'Removed by this change. This is the record as it is today. Open it in the system',
        open: ['/technologies/go'],
        usedBy: ['/changes/orders-by-post/records/apps/order-api'],
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'the home button stands before the arrows on a change and on a flow, leads home, and is not there on the list' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      const HOME = `document.querySelector('.history-controls a[aria-label="Home"]')`;
      // The labels of the top bar's group, in their order.
      const GROUP = `[...document.querySelectorAll('.history-controls > [aria-label]')].map((each) => each.getAttribute('aria-label'))`;
      await send('Page.navigate', { url: `${address}/changes` });
      expect(await waitFor(send, `(() => { const read = ${ON_CHANGES}; return read && ${GROUP}; })()`)).toEqual(['Go back', 'Go forward']);
      await send('Page.navigate', { url: `${address}/changes/orders-by-post` });
      expect(await waitFor(send, `(() => { const read = ${onChange('/changes/orders-by-post')}; return read && read.change !== null && ${HOME} !== null && ${GROUP}; })()`)).toEqual(['Home', 'Go back', 'Go forward']);
      await click(send, await centreOf(send, '.history-controls a[aria-label="Home"]'));
      expect(await waitFor(send, `location.pathname === '/' && document.querySelector('nav[aria-label="Main navigation"]') !== null && ${HOME} === null`)).toBe(true);
      await send('Page.navigate', { url: `${address}/flows/placing-an-order` });
      expect(await waitFor(send, `document.querySelector('.sidebar-slot [data-row="step"]') !== null && ${GROUP}`)).toEqual(['Home', 'Go back', 'Go forward']);
      await click(send, await centreOf(send, '.history-controls a[aria-label="Home"]'));
      expect(await waitFor(send, `location.pathname === '/' && document.querySelector('nav[aria-label="Main navigation"]') !== null && ${HOME} === null`)).toBe(true);
    }),
  20_000,
);

/** A flow under the change in the test model, once its steps stand in the sidebar and its name in the way back and the window's title. */
const onFlowUnder = (flow: string, name: string) =>
  `location.pathname === ${JSON.stringify(`/changes/orders-by-post/records/flows/${flow}`)} && document.querySelector('.sidebar-slot [data-row="step"]') !== null && document.querySelector('.breadcrumb-here')?.textContent === ${JSON.stringify(name)} && document.title === ${JSON.stringify(`${name} · seefore`)}`;
/** What a flow under a change shows around its bar: the sidebar, the way back and the mark in the top bar, and each row of its steps. */
const AROUND = `({
  sidebar: ${SIDEBAR},
  home: document.querySelector('.history-controls a[aria-label="Home"]') !== null,
  crumbs: ${texts('.breadcrumb')}[0],
  back: ${hrefs('.breadcrumb a')},
  mark: [...document.querySelectorAll('.header-slot > .pill')].map((pill) => pill.className + ' ' + pill.textContent),
  starts: ${texts('[data-row="starts"]')}[0],
  rows: [...document.querySelectorAll('[data-row="step"]')].map((row) => [row.getAttribute('data-step'), row.getAttribute('data-mark'), row.querySelector('.flow-step-number').textContent, row.querySelector('.flow-step-mark')?.textContent ?? null]),
})`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a flow the change updates opens under the change with its steps in the sidebar, the way back and its mark, and the words on its rows; one it adds opens with its mark' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records` });
      await click(send, await centreOf(send, 'main a[href="/changes/orders-by-post/records/flows/placing-an-order"]'));
      expect(await waitFor(send, `${onFlowUnder('placing-an-order', 'Placing an order')} && ${AROUND}`)).toEqual({
        // The flow's steps take the place of the change's sidebar, as on a flow's own page.
        sidebar: { main: null, change: null, current: null },
        home: true,
        crumbs: 'Orders by post / Records / Placing an order',
        back: ['/changes/orders-by-post', '/changes/orders-by-post/records'],
        mark: ['pill tone-caution Updated'],
        starts: 'Starts Updated A customer places an order online Today: A customer places an order in the shop',
        // The step that goes stands where it stood, with a minus for its number; the others are numbered as the flow would be.
        rows: [
          ['places', null, '1', null],
          ['saves', 'removed', '−', 'Removed'],
          ['types-in', 'added', '2', 'Added'],
          ['confirms', 'updated', '3', 'Updated'],
        ],
      });
      // "Records" in the way back leads to the list, and the flow the change adds opens with its mark and no colour on a step.
      await click(send, await centreOf(send, '.breadcrumb a[href="/changes/orders-by-post/records"]'));
      await click(send, await centreOf(send, 'main a[href="/changes/orders-by-post/records/flows/taking-a-posted-order"]'));
      expect(await waitFor(send, `${onFlowUnder('taking-a-posted-order', 'Taking a posted order')} && ${AROUND}`)).toMatchObject({
        crumbs: 'Orders by post / Records / Taking a posted order',
        mark: ['pill tone-success Added'],
        starts: 'Starts An order comes by post',
        rows: [
          ['types-in', null, '1', null],
          ['saves', null, '2', null],
        ],
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'under a change a removed step is picked like any other: the bar says "Was step" and "Removed" with its words of today, the down key moves on, and an updated step has its words of today under its changed line' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/flows/placing-an-order` });
      expect(await waitFor(send, onFlowUnder('placing-an-order', 'Placing an order'))).toBe(true);
      await flowAt(send, '');
      await click(send, await centreOf(send, '[data-row="step"][data-step="saves"]'));
      const saves = await flowAt(send, '#saves');
      // It is shown as it is today, and lights the line it walks today.
      expect(saves).toMatchObject({ current: 'saves', stepped: ['order-api->orders'] });
      expect(saves.bar).toContain('Was step 2 Saves the order Removed');
      expect(saves.bar).toContain('Order API to Orders Only when the customer has paid Data Order details');
      await press(send, 'ArrowDown', 40);
      const typesIn = await flowAt(send, '#types-in');
      expect(typesIn.current).toBe('types-in');
      expect(typesIn.bar).toContain('2 of 3 Types in a posted order Added');
      await press(send, 'ArrowDown', 40);
      const confirms = await flowAt(send, '#confirms');
      expect(confirms.current).toBe('confirms');
      expect(confirms.bar).toContain('3 of 3 Confirms the order by email Updated');
      // Each changed line, and under it what it says today: the name, and a condition that is new.
      const changed = `[...document.querySelectorAll('section[aria-label="Current step"] .flow-line-changed')].map((line) => [line.textContent, line.nextElementSibling?.className === 'flow-line-today' ? line.nextElementSibling.textContent : null])`;
      expect(await waitFor(send, changed)).toEqual([
        ['Confirms the order by email', null],
        ['Only when the customer gave an email address', 'Today: nothing'],
      ]);
      expect(confirms.bar).toContain('Today: Confirms the order');
    }),
  20_000,
);

/** What the diagram shows of a change: each box's mark, each line's mark with its colour and dash, the signs on the boxes, and the legend; or false until the lines are drawn. */
const MARKS = `document.querySelectorAll('.react-flow__edge-path[d^="M"]').length > 0 && {
  boxes: [...document.querySelectorAll('.react-flow__node')].map((node) => [node.getAttribute('data-id'), node.querySelector('.architecture-node')?.getAttribute('data-mark') ?? null, [...node.classList].filter((name) => name.startsWith('mark-')).join()]).sort(),
  lines: [...document.querySelectorAll('.react-flow__edge')].map((edge) => {
    const path = getComputedStyle(edge.querySelector('.react-flow__edge-path'));
    return [edge.getAttribute('data-id'), [...edge.classList].filter((name) => name.startsWith('mark-')).join(), path.stroke, path.strokeDasharray];
  }).sort(),
  signs: [...document.querySelectorAll('.architecture-node .diagram-mark-sign')].map((sign) => sign.closest('[data-id]').getAttribute('data-id') + ' ' + sign.getAttribute('aria-label')).sort(),
  legend: ${texts('[aria-label="Legend"] li')},
}`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? "on a flow the change updates the diagram's boxes and lines bear their marks and a legend says them; on the flow's own page nothing does" : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/flows/placing-an-order` });
      expect(await waitFor(send, `${onFlowUnder('placing-an-order', 'Placing an order')} && ${MARKS}`)).toEqual({
        // The flow no longer passes the store of orders, newly passes the clerk, and passes the Order API, which the change updates.
        boxes: [
          ['clerk', 'added', 'mark-added'],
          ['customer', null, ''],
          ['order-api', 'updated', 'mark-updated'],
          ['orders', 'removed', 'mark-removed'],
          ['shop', null, ''],
        ],
        // A red line is dashed; the others are not. The colours are those of the theme.
        lines: [
          ['clerk->order-api', 'mark-added', 'rgb(101, 213, 128)', 'none'],
          ['customer->order-api', '', 'rgb(129, 139, 152)', 'none'],
          ['order-api->orders', 'mark-removed', 'rgb(255, 117, 109)', '6px, 4px'],
        ],
        signs: ['clerk Newly passed', 'order-api Updated by the change', 'orders No longer passed'],
        legend: ['+ Newly passed', '− No longer passed', '~ Updated by the change'],
      });
      await send('Page.navigate', { url: `${address}/flows/placing-an-order` });
      expect(await waitFor(send, `location.pathname === '/flows/placing-an-order' && document.querySelector('.react-flow__node') !== null && ${MARKS}`)).toMatchObject({
        boxes: [
          ['customer', null, ''],
          ['order-api', null, ''],
          ['orders', null, ''],
          ['shop', null, ''],
        ],
        signs: [],
        legend: [],
      });
    }),
  20_000,
);

/** What the panel says of what the change does: the pill beside the type, the sentence under the name, and where its button leads. */
const PANEL_UNDER = `(() => {
  const panel = document.querySelector('aside[aria-label="Diagram inspector"]');
  return panel !== null && {
    name: panel.querySelector('h2')?.textContent,
    pills: [...panel.querySelectorAll('.diagram-inspector-kind .pill')].map((pill) => pill.className + ' ' + pill.textContent),
    passes: panel.querySelector('.diagram-inspector-passes')?.textContent ?? null,
    button: panel.querySelector('a.button')?.getAttribute('href'),
  };
})()`;

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'under a change a red box opens its panel with the sentence that the flow no longer passes it, and a yellow one with the pill Updated and its button under the change' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/flows/placing-an-order` });
      await click(send, await centreOf(send, '.react-flow__node[data-id="orders"]'));
      // The store of orders is not a record the change names: no pill, and its button leads to the system.
      expect(await waitFor(send, `(() => { const read = ${PANEL_UNDER}; return read && read.name === 'Orders' && read; })()`)).toEqual({
        name: 'Orders',
        pills: [],
        passes: 'With this change the flow no longer passes it.',
        button: '/models/orders',
      });
      await press(send, 'Escape', 27);
      expect(await closed(send)).toBe(true);
      // The Order API is in both and the change updates it: its pill, no sentence, and its button under the change.
      await click(send, await centreOf(send, '.react-flow__node[data-id="order-api"]'));
      expect(await waitFor(send, `(() => { const read = ${PANEL_UNDER}; return read && read.name === 'Order API' && read; })()`)).toEqual({
        name: 'Order API',
        pills: ['pill tone-caution Updated'],
        passes: null,
        button: '/changes/orders-by-post/records/apps/order-api',
      });
    }),
  20_000,
);

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'a flow that a change removes opens as it is today with its line and no colour, and the fields of a data record read as one list' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      // The third case: a flow the change removes. Its steps, its bar and its diagram are today's, and only the flow bears a mark.
      await send('Page.navigate', { url: `${address}/changes/orders-on-paper-only/records/flows/placing-an-order` });
      const removed = `location.pathname === '/changes/orders-on-paper-only/records/flows/placing-an-order' && document.title === 'Placing an order · seefore' && document.querySelector('.react-flow__node') !== null && {
        back: ${hrefs('nav[aria-label="Breadcrumb"] a')},
        mark: ${texts('.header-slot .pill')},
        line: ${texts('.flow-bar-removed')}[0],
        system: document.querySelector('.flow-bar-removed a')?.getAttribute('href'),
        rows: [...document.querySelectorAll('.desktop-sidebar [data-row="step"]')].map((row) => [row.querySelector('.flow-step-number').textContent, row.dataset.step, row.dataset.mark ?? null]),
        marked: document.querySelectorAll('.react-flow__node [data-mark], .react-flow__edge[class*="mark-"]').length,
        legend: document.querySelector('[aria-label="Legend"]') !== null,
      }`;
      expect(await waitFor(send, removed)).toEqual({
        back: ['/changes/orders-on-paper-only', '/changes/orders-on-paper-only/records'],
        mark: ['Removed'],
        line: 'Removed by this change. This is the flow as it is today. Open it in the system',
        system: '/flows/placing-an-order',
        rows: [
          ['1', 'places', null],
          ['2', 'saves', null],
          ['3', 'confirms', null],
        ],
        marked: 0,
        legend: false,
      });
      // The fields of a data record, before and after: one list, a field that changes with today's words under it, one that comes, one that goes.
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/data/order-details` });
      const fields = `location.pathname === '/changes/orders-by-post/records/data/order-details' && document.querySelector('.change-field') !== null && [...document.querySelectorAll('.change-field')].map((row) => [row.querySelector('.change-field-name').textContent, row.dataset.mark ?? null, row.querySelector('.flow-step-mark')?.textContent ?? null, row.querySelector('.change-field-text')?.textContent ?? null, row.querySelector('.change-field-today')?.textContent ?? null])`;
      expect(await waitFor(send, fields)).toEqual([
        ['items', 'updated', 'Updated', 'What is bought, how many of each, and at what price', 'Today: What is bought, and how many of each'],
        // A field that goes stands where it stood, ahead of one that comes there.
        ['address', 'removed', 'Removed', null, null],
        ['sent by', 'added', 'Added', 'Online or by post', null],
      ]);
    }),
  20_000,
);

/** What the two views of an updated flow show: the address, the switch, the mark, the rows, the step picked, the boxes and whether anything bears a colour; or false until the lines are drawn. */
const VIEWS = `document.querySelectorAll('.react-flow__edge-path[d^="M"]').length > 0 && {
  search: location.search,
  hash: location.hash,
  tabs: [...document.querySelectorAll('.top-header nav[aria-label="View"] a')].map((link) => [link.textContent, link.getAttribute('aria-current')]),
  mark: ${texts('.header-slot > .pill')},
  rows: [...document.querySelectorAll('[data-row="step"]')].map((row) => [row.getAttribute('data-step'), row.getAttribute('data-mark'), row.querySelector('.flow-step-number').textContent]),
  current: document.querySelector('[data-row="step"][aria-current="step"]')?.getAttribute('data-step') ?? null,
  boxes: [...document.querySelectorAll('.react-flow__node')].map((node) => node.getAttribute('data-id')).sort(),
  marked: document.querySelectorAll('.react-flow__node [data-mark], .react-flow__edge[class*="mark-"]').length,
  legend: document.querySelector('[aria-label="Legend"]') !== null,
  today: document.querySelectorAll('.flow-line-today, .flow-end-today').length,
}`;
/** The view the switch says is shown, drawn, with the step the address names picked: the address changes a moment before the page does. */
const inView = (view: string, hash: string) =>
  `document.querySelector('.top-header nav[aria-label="View"] a[aria-current="page"]')?.textContent === ${JSON.stringify(view)} && location.hash === ${JSON.stringify(hash)} && (document.querySelector('[data-row="step"][aria-current="step"]')?.getAttribute('data-step') ?? '') === ${JSON.stringify(hash.slice(1))} && ${VIEWS}`;
const OTHER_VIEW = '.top-header nav[aria-label="View"] a:not([aria-current])';

test.skipIf(!HAS_CHROME).concurrent(
  HAS_CHROME ? 'an updated flow has a switch in the top bar: Changes, and Result, the flow as it would be with no colour; the step picked stays, and a step that goes is let go' : `skipped: there is no Chrome at ${CHROME}`,
  () =>
    inChrome(async (send, address) => {
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/flows/placing-an-order#confirms` });
      expect(await waitFor(send, `${onFlowUnder('placing-an-order', 'Placing an order')} && ${inView('Changes', '#confirms')}`)).toMatchObject({
        search: '',
        tabs: [
          ['Changes', 'page'],
          ['Result', null],
        ],
        current: 'confirms',
        boxes: ['clerk', 'customer', 'order-api', 'orders', 'shop'],
        legend: true,
      });
      // Result: the steps as they would be, the step picked still picked, and nothing of today: no step that goes, no box only today's flow passes, no colour, no legend.
      await click(send, await centreOf(send, OTHER_VIEW));
      expect(await waitFor(send, inView('Result', '#confirms'))).toEqual({
        search: '?view=result',
        hash: '#confirms',
        tabs: [
          ['Changes', null],
          ['Result', 'page'],
        ],
        mark: ['Updated'],
        rows: [
          ['places', null, '1'],
          ['types-in', null, '2'],
          ['confirms', null, '3'],
        ],
        current: 'confirms',
        boxes: ['clerk', 'customer', 'order-api', 'shop'],
        marked: 0,
        legend: false,
        today: 0,
      });
      // A move to another step keeps the view.
      await press(send, 'ArrowUp', 38);
      expect(await waitFor(send, inView('Result', '#types-in'))).toMatchObject({ search: '?view=result', current: 'types-in' });
      // Back to Changes on the same step; from a step that goes, Result opens on the whole flow.
      await click(send, await centreOf(send, OTHER_VIEW));
      expect(await waitFor(send, inView('Changes', '#types-in'))).toMatchObject({ search: '', current: 'types-in', rows: [['places', null, '1'], ['saves', 'removed', '−'], ['types-in', 'added', '2'], ['confirms', 'updated', '3']] });
      await click(send, await centreOf(send, '[data-row="step"][data-step="saves"]'));
      expect(await waitFor(send, inView('Changes', '#saves'))).toMatchObject({ current: 'saves' });
      await click(send, await centreOf(send, OTHER_VIEW));
      expect(await waitFor(send, inView('Result', ''))).toMatchObject({ search: '?view=result', current: null });
      // A flow the change adds is one view: it has no switch.
      await send('Page.navigate', { url: `${address}/changes/orders-by-post/records/flows/taking-a-posted-order` });
      expect(await waitFor(send, `${onFlowUnder('taking-a-posted-order', 'Taking a posted order')} && document.querySelectorAll('.react-flow__edge-path[d^="M"]').length > 0 && { tabs: document.querySelectorAll('nav[aria-label="View"]').length }`)).toEqual({ tabs: 0 });
    }),
  20_000,
);

