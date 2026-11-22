// Takes a picture of every view of a source directory, as the built command serves it, in
// headless Chrome. For the trial of a stage: a person, or an agent, then looks at the pictures.
// It is run by hand, not by `npm run check`, since it needs a browser.
//
//   npm run build
//   node scripts/shoot.mjs --workdir=<directory> --out=<folder> [--only=<part of a view's id>] [--dark]
//
// It prints one line for each view: the boxes and arrows the view has, the arrows the page
// drew, and the zoom the page chose. The browser is found at CHROME, or where macOS keeps it.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { workdir: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, dark: { type: 'boolean', default: false } },
});
if (!values.workdir || !values.out) {
  console.error('usage: node scripts/shoot.mjs --workdir=<directory> --out=<folder> [--only=<part of a view id>] [--dark]');
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
  const views = state.views.filter((view) => values.only === undefined || view.id.includes(values.only));

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

  /** What the page has drawn: its boxes and arrows, and the zoom of the canvas. */
  const drawn = `(() => {
    const pane = document.querySelector('.react-flow__viewport');
    const zoom = pane ? new DOMMatrix(getComputedStyle(pane).transform).a : null;
    return { boxes: document.querySelectorAll('.react-flow__node').length, arrows: document.querySelectorAll('.react-flow__edge').length, zoom };
  })()`;

  const summary = [];
  await send('Page.navigate', { url: `${address}/` });
  await pause(1500);
  for (const view of views) {
    await evaluate(`location.hash = ${JSON.stringify(`#/view/${view.id}`)}`);
    // The picture is asked for, laid out and drawn: wait until what is drawn stops changing.
    let seen = { boxes: -1, arrows: -1 };
    for (let tries = 0; tries < 40; tries++) {
      await pause(400);
      const now = await evaluate(drawn);
      if (now && now.boxes > 0 && now.boxes === seen.boxes && now.arrows === seen.arrows) break;
      seen = now ?? seen;
    }
    await pause(300);
    const file = `${view.id}.png`;
    await shot(file);
    const line = { view: view.id, boxes: view.boxes.length, arrows: view.arrows.length, drawnArrows: seen.arrows, zoom: seen.zoom === null || seen.zoom === undefined ? null : Number(seen.zoom.toFixed(3)), file };
    summary.push(line);
    console.log(`${view.id}: ${line.boxes} boxes, ${line.arrows} arrows, ${line.drawnArrows} drawn, zoom ${line.zoom}`);
  }
  for (const page of ['model', 'problems']) {
    await evaluate(`location.hash = ${JSON.stringify(`#/${page}`)}`);
    await pause(800);
    await shot(`${page}.png`);
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ directory: state.directory, name: state.name, views: summary }, null, 2));
  socket.close();
} finally {
  chrome?.kill('SIGKILL');
  server.kill('SIGINT');
  await pause(200);
  rmSync(profile, { recursive: true, force: true });
}
