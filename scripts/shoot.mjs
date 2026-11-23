// Takes a picture of settings of a source directory, as the built command serves them, in
// headless Chrome. For the trial of a stage: a person, or an agent, then looks at the pictures.
// It is run by hand, not by `npm run check`, since it needs a browser.
//
//   npm run build
//   node scripts/shoot.mjs --workdir=<directory> --out=<folder> [--setting=<key> ...] [--by-depth] [--dark]
//
// A setting is named as the page's address names it: `system`, `container~shop`,
// `component~relay`. Without one it takes everything at each depth, and each system that has
// parts to show at Container depth. Each setting is opened afresh at its address, and so fitted
// to its room. With --by-depth it goes from one setting to the next as a reader does: a change
// of depth alone by the Depth control, any other by the address. It makes each change of depth
// twice. First on the picture as it stands fitted, after "Fit diagram", which the reader has not
// moved: it prints whether the page fitted the new picture to its room, with the zoom before and
// after and the zoom of the fit, and takes that picture as `-fitted`. Then, back at the depth
// before, it moves the picture by one "Zoom in" before it changes the depth, and prints which box
// the page kept in place and how far its top left moved on the screen, with the zoom before and
// after: pass number 21. For each setting it prints the boxes, boundaries and arrows of the
// view, the arrows the page drew and the zoom it shows. The browser is found at CHROME, or where
// macOS keeps it.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    workdir: { type: 'string' },
    out: { type: 'string' },
    setting: { type: 'string', multiple: true },
    'by-depth': { type: 'boolean', default: false },
    dark: { type: 'boolean', default: false },
  },
});
if (!values.workdir || !values.out) {
  console.error('usage: node scripts/shoot.mjs --workdir=<directory> --out=<folder> [--setting=<key> ...] [--by-depth] [--dark]');
  process.exit(2);
}

const WIDTH = 1600;
const HEIGHT = 1000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const command = join(root, 'packages', 'cli', 'dist', 'seefore.cjs');
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = resolve(values.out);
mkdirSync(out, { recursive: true });

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** A port nothing listens on, asked of the system. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

/** The depth and the scope of a setting's key. */
function settingOf(key) {
  const [depth, scope = null] = key.split('~');
  return { depth, scope };
}

/** A file name for a setting's picture, numbered in the order taken, so that a setting taken twice keeps both. */
function fileOf(key, at) {
  return `${String(at + 1).padStart(2, '0')}-${key.replaceAll('~', '--')}.png`;
}

const port = await freePort();
const server = spawn(process.execPath, [command, '--server', '--no-open', `--port=${port}`, `--workdir=${values.workdir}`], { stdio: ['ignore', 'pipe', 'inherit'] });
const profile = mkdtempSync(join(tmpdir(), 'seefore-shoot-'));
let chrome;

try {
  // The server prints its address once it listens.
  await new Promise((done, fail) => {
    server.stdout.once('data', done);
    server.once('exit', (code) => fail(new Error(`the server ended with exit code ${code}`)));
  });
  const address = `http://127.0.0.1:${port}`;
  const state = await (await fetch(`${address}/api/state`)).json();
  const settings = values.setting ?? ['system', 'container', 'component', ...state.outline.withParts.map((system) => `container~${system.id}`)];

  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], {
    stdio: 'ignore',
  });
  let debugPort;
  for (let tries = 0; tries < 300 && !debugPort; tries++) {
    await pause(100);
    try {
      debugPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
    } catch {
      // Not written yet.
    }
  }
  if (!debugPort) throw new Error('the browser did not start');
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const socket = new WebSocket(pages.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((done) => socket.addEventListener('open', done));
  let last = 0;
  const waiting = new Map();
  socket.addEventListener('message', (message) => {
    const answer = JSON.parse(message.data);
    if (answer.id && waiting.has(answer.id)) {
      waiting.get(answer.id)(answer);
      waiting.delete(answer.id);
    }
    if (answer.method === 'Runtime.exceptionThrown') console.log('  the page threw:', answer.params.exceptionDetails.exception?.description ?? answer.params.exceptionDetails.text);
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      const id = ++last;
      waiting.set(id, done);
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async (file) => {
    const taken = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, file), Buffer.from(taken.result.data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: values.dark ? 'dark' : 'light' }] });

  /**
   * What the page has drawn: the address, whether a picture is still laid out, its boxes and
   * arrows, the zoom of the canvas, where the canvas looks and the room it has, the box a change
   * of depth kept, and where each box and boundary stands on the screen.
   */
  const drawn = `(() => {
    const pane = document.querySelector('.react-flow__viewport');
    const matrix = pane ? new DOMMatrix(getComputedStyle(pane).transform) : null;
    const canvas = document.querySelector('.canvas')?.getBoundingClientRect();
    const places = {};
    for (const node of document.querySelectorAll('.react-flow__node')) {
      const { left, top } = node.getBoundingClientRect();
      places[node.dataset.id] = { x: left, y: top };
    }
    return {
      hash: location.hash,
      laying: (document.querySelector('.laying')?.textContent ?? '') !== '' || document.querySelector('.waiting') !== null,
      done: document.querySelector('.react-flow__node, .nothing, .failed') !== null,
      boxes: document.querySelectorAll('.react-flow__node').length,
      arrows: document.querySelectorAll('.react-flow__edge').length,
      zoom: matrix ? matrix.a : null,
      viewport: matrix ? { x: matrix.e, y: matrix.f, zoom: matrix.a } : null,
      room: canvas ? { width: canvas.width, height: canvas.height } : null,
      kept: document.querySelector('.diagram')?.dataset.kept ?? null,
      places,
    };
  })()`;

  /** Clicks the button of the toolbar above the canvas with these words. */
  const press = (words) => evaluate(`[...document.querySelectorAll('.diagram-head .buttons button')].find((button) => button.textContent === ${JSON.stringify(words)})?.click()`);
  /** Chooses a depth by the Depth control, as a reader does. */
  const chooseDepth = (depth) => evaluate(`document.querySelector('.sidebar .depth input[value="${depth}"]').click()`);
  /** Waits until a move made by a button has ended: the canvas looks at the same place twice running. */
  const stillAgain = async () => {
    let seen = null;
    for (let tries = 0; tries < 40; tries++) {
      await pause(150);
      const now = JSON.stringify((await evaluate(drawn))?.viewport ?? null);
      if (now === seen) return;
      seen = now;
    }
  };

  /**
   * Where the canvas looks when a picture of this size is fitted to the room it has, as the page
   * fits it: whole, in the middle, with 4 % of the room on each side, and never larger than full size.
   */
  const fitOf = (picture, room) => {
    const width = Math.max(picture.width, 1);
    const height = Math.max(picture.height, 1);
    const zoom = Math.min(1, (room.width * 0.92) / width, (room.height * 0.92) / height);
    return { x: (room.width - width * zoom) / 2, y: (room.height - height * zoom) / 2, zoom };
  };
  /** The picture of a setting, as the server answers for it. */
  const pictureOf = async (key) => (await (await fetch(`${address}/api/pictures/${state.revision}/${encodeURIComponent(key)}`)).json()).picture;

  /**
   * A change of depth on the picture as it stands fitted, which the reader has not moved: whether
   * the page fitted the new one to its room, or, when nothing opened or closed, left it where it was.
   */
  const unmovedChange = async (from, key) => {
    await press('Fit diagram');
    await stillAgain();
    const was = await evaluate(drawn);
    await chooseDepth(settingOf(key).depth);
    const now = await settled(key);
    await pause(300);
    const picture = await pictureOf(key);
    const fit = picture && now.room ? fitOf(picture, now.room) : null;
    const off = fit && now.viewport ? { x: now.viewport.x - fit.x, y: now.viewport.y - fit.y } : null;
    const fitted = off !== null && Math.abs(off.x) <= 1 && Math.abs(off.y) <= 1 && Math.abs(now.viewport.zoom - fit.zoom) < 1e-6;
    const still = was.viewport && now.viewport && was.viewport.x === now.viewport.x && was.viewport.y === now.viewport.y && was.viewport.zoom === now.viewport.zoom;
    const result = { from, moved: false, kept: now.kept, fitted, still, zoomBefore: was.zoom, zoomAfter: now.zoom, zoomOfFit: fit?.zoom ?? null, off };
    const words = fitted
      ? `the page fitted it: zoom ${was.zoom} to ${now.zoom}, the fit ${fit.zoom}, off by ${off.x.toFixed(3)}, ${off.y.toFixed(3)} px${still ? ' (nothing opened or closed: the page did not move)' : ''}`
      : `the page did NOT fit it: zoom ${was.zoom} to ${now.zoom}, the fit ${fit?.zoom}, kept ${now.kept}`;
    return { result, said: `; from ${from}, not moved: ${words}` };
  };

  /** Waits until the page shows the setting with this key, laid out, and what it draws stops changing. */
  const settled = async (key) => {
    let seen = { boxes: -1, arrows: -1 };
    for (let tries = 0; tries < 60; tries++) {
      await pause(300);
      const now = await evaluate(drawn);
      if (now && now.hash === `#/view/${key}` && !now.laying && now.done && now.boxes === seen.boxes && now.arrows === seen.arrows) return now;
      seen = now ?? seen;
    }
    return seen;
  };

  const summary = [];
  /** Opens the page afresh at an address: a picture opened so is fitted to its room. */
  const open = async (hash) => {
    await send('Page.navigate', { url: 'about:blank' });
    await pause(200);
    await send('Page.navigate', { url: `${address}/${hash}` });
    await pause(1000);
  };
  let before;
  let shownKey;
  for (const [at, key] of settings.entries()) {
    const setting = settingOf(key);
    const shown = shownKey === undefined ? undefined : settingOf(shownKey);
    // A change of depth alone is made as a reader makes it, by the Depth control.
    const byDepth = values['by-depth'] && shown !== undefined && shown.scope === setting.scope && shown.depth !== setting.depth;
    let unmoved;
    if (byDepth) {
      // First on the picture fitted, which the reader has not moved; then back, and moved.
      unmoved = await unmovedChange(shownKey, key);
      await shot(fileOf(key, at).replace('.png', '-fitted.png'));
      await chooseDepth(shown.depth);
      await settled(shownKey);
      await pause(300);
      await press('Zoom in');
      await stillAgain();
      before = await evaluate(drawn);
      await chooseDepth(setting.depth);
    } else if (values['by-depth'] && shownKey !== undefined) await evaluate(`location.hash = ${JSON.stringify(`#/view/${key}`)}`);
    else await open(`#/view/${key}`);
    const now = await settled(key);
    await pause(300);
    const file = fileOf(key, at);
    await shot(file);
    const answer = await (await fetch(`${address}/api/pictures/${state.revision}/${encodeURIComponent(key)}`)).json();
    const line = {
      setting: key,
      title: answer.view?.title,
      boxes: answer.view?.boxes.length,
      boundaries: answer.view?.boundaries.length,
      arrows: answer.view?.arrows.length,
      drawnArrows: now.arrows,
      zoom: now.zoom === null || now.zoom === undefined ? null : Number(now.zoom.toFixed(4)),
      file,
    };
    let said = `${key}: ${line.boxes} boxes, ${line.boundaries} boundaries, ${line.arrows} arrows, ${line.drawnArrows} drawn, zoom ${line.zoom}`;
    if (byDepth) {
      line.unmoved = unmoved.result;
      said += unmoved.said;
      // Pass number 21: on the picture moved by one "Zoom in", the box kept stands where it stood on the screen, at the same zoom.
      const kept = now.kept;
      const was = kept === null ? undefined : before.places[kept];
      const is = kept === null ? undefined : now.places[kept];
      line.change = { from: shownKey, moved: true, kept, shift: was && is ? { x: is.x - was.x, y: is.y - was.y } : null, zoomBefore: before.zoom, zoomAfter: now.zoom };
      said +=
        kept === null
          ? `; from ${shownKey}, moved by one Zoom in: nothing opened or closed, zoom ${before.zoom} to ${now.zoom}`
          : `; from ${shownKey}, moved by one Zoom in: kept ${kept}, its top left moved ${line.change.shift?.x.toFixed(3)}, ${line.change.shift?.y.toFixed(3)} px, zoom ${before.zoom} to ${now.zoom}`;
    }
    summary.push(line);
    console.log(said);
    before = now;
    shownKey = key;
  }
  for (const page of ['model', 'problems']) {
    await open(`#/${page}`);
    await pause(800);
    await shot(`${page}.png`);
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ directory: state.directory, name: state.name, settings: summary }, null, 2));
  socket.close();
} finally {
  chrome?.kill('SIGKILL');
  server.kill('SIGINT');
  await pause(200);
  rmSync(profile, { recursive: true, force: true });
}
