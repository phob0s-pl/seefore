// Serves the built page with the made-up data of test/fixture.ts, to look at it in a real
// browser: node packages/viewer/look.mjs [port]. Without a port the system picks one; the
// address is printed. Not part of the command, and not run by `npm run check`.
//
// Besides the fixture's three views it serves a crowded one, "grid.containers", with many
// boxes and arrows, to see that every arrow is drawn and what a picture too small to read says.
// POST /revision makes a new reading, as a changed file would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PICTURES, STATE } from './test/fixture.ts';

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, '..', 'cli', 'dist', 'viewer');
const port = Number(process.argv[2] ?? 0);

/** A container view of a grid of boxes, each with an arrow to the right and one down. */
function grid(columns, rows) {
  const box = (c, r) => `box-${String(c).padStart(2, '0')}-${String(r).padStart(2, '0')}`;
  const boxes = [];
  const placed = [];
  const arrows = [];
  const drawnArrows = [];
  const left = 64;
  const top = 104;
  const across = 420;
  const down = 240;
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const id = box(c, r);
      const family = ['apps', 'stores', 'apps', 'apps'][(c + r) % 4];
      boxes.push({ id, family, name: `Part ${c}.${r}`, line: family === 'apps' ? '[App: service · Go]' : '[Store: database]', sentence: `Does the work of part ${c} ${r}.`, scope: false, inside: true, loops: [], within: [] });
      const x = left + c * across;
      const y = top + r * down;
      placed.push({ id, x, y, width: 240, height: 150, name: [`Part ${c}.${r}`], line: family === 'apps' ? '[App: service · Go]' : '[Store: database]', sentence: [`Does the work of part ${c} ${r}.`] });
      if (c + 1 < columns) {
        const to = box(c + 1, r);
        arrows.push({ id: `${id}~${to}`, from: id, to, connections: [`${id}-calls`], names: ['Calls'], technology: ['HTTPS'] });
        drawnArrows.push({ id: `${id}~${to}`, from: id, to, sections: [[{ x: x + 240, y: y + 75 }, { x: x + across, y: y + 75 }]], label: { x: x + 240 + 50, y: y + 75 - 16, width: 80, height: 32, lines: ['Calls'], technology: '[HTTPS]' } });
      }
      if (r + 1 < rows) {
        const to = box(c, r + 1);
        arrows.push({ id: `${id}~${to}`, from: id, to, connections: [`${id}-feeds`], names: ['Feeds'], technology: [] });
        drawnArrows.push({ id: `${id}~${to}`, from: id, to, sections: [[{ x: x + 120, y: y + 150 }, { x: x + 120, y: y + down }]] });
      }
    }
  }
  const right = left + (columns - 1) * across + 240 + 24;
  const bottom = top + (rows - 1) * down + 150 + 24;
  const view = {
    id: 'grid.containers',
    kind: 'containers',
    scope: 'grid',
    title: 'Container view: Grid',
    boxes,
    boundary: { id: 'grid', name: 'Grid', title: 'Grid [System]' },
    arrows,
    left: { outside: [], broken: [] },
    legend: [
      { key: 'app', text: 'App: something that runs code' },
      { key: 'store', text: 'Store: something that holds data' },
      { key: 'boundary', text: 'The system this view is about, around what is in it' },
      { key: 'arrow', text: 'A connection, from the one that acts' },
    ],
  };
  const drawn = {
    view: view.id,
    width: right + 40,
    height: bottom + 40,
    boundary: { id: 'grid', x: 40, y: 40, width: right - 40, height: bottom - 40, title: 'Grid [System]', titleAt: { x: 64, y: 52, width: 120, height: 20 } },
    boxes: placed,
    arrows: drawnArrows,
  };
  return { view, drawn };
}

const crowded = grid(9, 8);
let revision = 1;
/** The state of the latest reading: the fixture's, with the crowded view. */
const state = () => ({ ...STATE, revision: `r${revision}`, views: [...STATE.views, crowded.view], model: { ...STATE.model, systems: [...STATE.model.systems, { id: 'grid', file: 'systems/grid.yaml', name: 'Grid' }] } });
const pictures = { ...PICTURES, [crowded.view.id]: crowded.drawn };
const listeners = new Set();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const send = (status, type, body) => {
    response.writeHead(status, { 'content-type': type });
    response.end(body);
  };
  if (request.method === 'POST' && url.pathname === '/revision') {
    revision += 1;
    for (const listener of listeners) listener.write(`event: revision\ndata: r${revision}\n\n`);
    return send(200, 'text/plain', `r${revision}\n`);
  }
  if (url.pathname === '/') return send(200, 'text/html', readFileSync(join(built, 'index.html')));
  if (url.pathname === '/app.js') return send(200, 'text/javascript', readFileSync(join(built, 'app.js')));
  if (url.pathname === '/app.css') return send(200, 'text/css', readFileSync(join(built, 'app.css')));
  if (url.pathname === '/api/state') return send(200, 'application/json', JSON.stringify(state()));
  if (url.pathname === '/api/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    response.write(`event: revision\ndata: r${revision}\n\n`);
    listeners.add(response);
    request.on('close', () => listeners.delete(response));
    return undefined;
  }
  const asked = /^\/api\/pictures\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (asked) {
    const [, at, view] = asked.map(decodeURIComponent);
    if (at !== `r${revision}`) return send(409, 'application/json', '{}');
    const picture = pictures[view];
    if (picture === undefined) return send(404, 'application/json', '{}');
    return send(200, 'application/json', JSON.stringify({ revision: at, picture }));
  }
  return send(404, 'text/plain', 'Not here.\n');
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : port}/`);
});
