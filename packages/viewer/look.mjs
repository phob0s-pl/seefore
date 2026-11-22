// Serves the built page with the made-up data of test/fixture.ts, to look at it in a real
// browser: node packages/viewer/look.mjs [port]. Without a port the system picks one; the
// address is printed. Not part of the command, and not run by `npm run check`.
//
// Besides the fixture's three views it serves a crowded one, "grid.containers", with many
// boxes and arrows, to see that every arrow is drawn and what a picture too small to read says;
// and the views of a help desk with the hard cases of stage 6a, worked out and laid out by the
// engine itself: routes on arrows, a queue and a topic, external systems, a piece of
// infrastructure with a box and one without, and boxes that connections pass through.
// POST /revision makes a new reading, as a changed file would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, outlineOf, ownership, viewsOf } from '../core/src/index.ts';
import { layOut } from '../layout/src/index.ts';
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

/**
 * A help desk as files. Visitors and clerks reach its web app through an HTTPS proxy, which
 * also checks the API on its own account, and so has a box; visitors come through an edge
 * network first, which is somebody else's and has no box. The gateway signs what leaves the
 * desk and shares its keys between its copies. Jobs wait in a queue, changes go out on a
 * topic, and the card provider and the mail service are external, reached through a load
 * balancer that nothing starts or ends at.
 */
const DESK = {
  'seefore.yaml': 'format: 1\nname: Desk\n',
  'people/visitor.yaml': 'name: Visitor\ndescription: Asks the help desk for help.\n',
  'people/clerk.yaml': 'name: Clerk\ndescription: Answers the tickets.\n',
  'systems/desk.yaml': 'name: Desk\ndescription: Keeps the tickets of the help desk.\n',
  'systems/cards.yaml': 'name: Card provider\ndescription: Takes card payments.\nexternal: true\n',
  'systems/mail.yaml': 'name: Mail service\ndescription: Sends mail for others.\nexternal: true\n',
  'systems/edge.yaml': 'name: Edge network\ndescription: Serves the pages near the reader.\nexternal: true\n',
  'apps/web.yaml': 'name: Web\nin: desk\ndescription: The pages of the desk.\nkind: service\ntechnology: [react]\n',
  'apps/api.yaml': 'name: API\nin: desk\ndescription: Takes and answers every call on a ticket.\nkind: service\ntechnology: [go]\n',
  'apps/gateway.yaml': 'name: Gateway\nin: desk\ndescription: Signs the calls that leave the desk.\nkind: service\n',
  'apps/worker.yaml': 'name: Worker\nin: desk\ndescription: Does the jobs that can wait.\nkind: job\ntechnology: [go]\n',
  'stores/tickets.yaml': 'name: Tickets\nin: desk\ndescription: Every ticket and its answers.\nkind: database\ntechnology: [postgresql]\n',
  'stores/jobs.yaml': 'name: Jobs\nin: desk\ndescription: The jobs waiting for the worker.\nkind: queue\ntechnology: [redis]\n',
  'stores/events.yaml': 'name: Ticket events\nin: desk\ndescription: What changed on a ticket.\nkind: topic\ntechnology: [kafka]\n',
  'infrastructure/proxy.yaml': "name: HTTPS proxy\ndescription: Ends HTTPS on the desk's host and passes requests on.\ntechnology: [nginx]\n",
  'infrastructure/balancer.yaml': 'name: Load balancer\ndescription: Spreads the calls that leave the desk.\n',
  'technologies/react.yaml': 'name: React\n',
  'technologies/go.yaml': 'name: Go\n',
  'technologies/postgresql.yaml': 'name: PostgreSQL\n',
  'technologies/redis.yaml': 'name: Redis\n',
  'technologies/kafka.yaml': 'name: Kafka\n',
  'technologies/nginx.yaml': 'name: nginx\n',
  'technologies/https.yaml': 'name: HTTPS\n',
  'technologies/sql.yaml': 'name: SQL\n',
  'technologies/smtp.yaml': 'name: SMTP\n',
  'connections/visitor-opens-web.yaml': 'from: visitor\nto: web\nvia: [edge, proxy]\nname: Opens the help pages\ntechnology: [https]\n',
  'connections/clerk-answers-web.yaml': 'from: clerk\nto: web\nvia: [proxy]\nname: Answers tickets\ntechnology: [https]\n',
  'connections/web-asks-api.yaml': 'from: web\nto: api\nvia: [gateway]\nname: Asks for tickets\ntechnology: [https]\n',
  'connections/web-sends-api.yaml': 'from: web\nto: api\nname: Sends edits\ntechnology: [https]\n',
  'connections/proxy-checks-api.yaml': 'from: proxy\nto: api\nname: Checks that it answers\n',
  'connections/gateway-shares-keys.yaml': 'from: gateway\nto: gateway\nname: Shares its keys\n',
  'connections/api-keeps-tickets.yaml': 'from: api\nto: tickets\nname: Keeps tickets\ntechnology: [sql]\n',
  'connections/api-queues-jobs.yaml': 'from: api\nto: jobs\nname: Queues a job\n',
  'connections/worker-takes-jobs.yaml': 'from: worker\nto: jobs\nname: Takes the next job\n',
  'connections/api-tells-events.yaml': 'from: api\nto: events\nname: Says what changed\ntechnology: [kafka]\n',
  'connections/worker-mails.yaml': 'from: worker\nto: mail\nvia: [balancer]\nname: Sends the answer by mail\ntechnology: [smtp]\n',
  'connections/api-pays-cards.yaml': 'from: api\nto: cards\nvia: [gateway, balancer]\nname: Takes a payment\ntechnology: [https]\n',
};

const desk = load(Object.entries(DESK).map(([path, text]) => ({ path, text })));
const deskViews = viewsOf(desk.model);
const deskPictures = Object.fromEntries(await Promise.all(deskViews.map(async (view) => [view.id, await layOut(view)])));

const crowded = grid(9, 8);
let revision = 1;
/** Each family of two models in one. */
const both = (one, other) => Object.fromEntries(Object.keys(one).map((family) => [family, [...one[family], ...other[family]]]));
const model = both({ ...STATE.model, systems: [...STATE.model.systems, { id: 'grid', file: 'systems/grid.yaml', name: 'Grid' }] }, desk.model);
/** The state of the latest reading: the fixture's, with the crowded view and the help desk's. */
const state = () => ({
  ...STATE,
  revision: `r${revision}`,
  records: STATE.records + desk.records.length,
  views: [...STATE.views, ...deskViews, crowded.view],
  model,
  ownership: { ...STATE.ownership, ...Object.fromEntries(ownership(desk.model)) },
  outline: outlineOf(model),
});
const pictures = { ...PICTURES, ...deskPictures, [crowded.view.id]: crowded.drawn };
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
