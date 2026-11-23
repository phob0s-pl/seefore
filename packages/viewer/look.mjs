// Serves the built page with the made-up data of test/fixture.ts, to look at it in a real
// browser: node packages/viewer/look.mjs [port]. Without a port the system picks one; the
// address is printed. Not part of the command, and not run by `npm run check`.
//
// Besides the fixture's three views it serves a large one, "container~grid", with many
// boxes and arrows, to see that every arrow is drawn and what a picture too small to read says:
// its view is worked out by the engine from a grid of records, and its places are made by hand.
// It serves too the views of a help desk with the hard cases of stage 6a, worked out and laid
// out by the engine itself: routes on arrows, a queue and a topic, external systems, a piece of
// infrastructure with a box and one without, and boxes that connections pass through; and those
// of stage 6b: a store the web app keeps, an office proxy that is part of the desk and there only
// in the head office, a worker there only in the hosted edition, reads and writes of the stores,
// and news the API sends down a channel the web app opened. Before it
// listens it turns every picture into what the page draws, so that a view the page cannot draw
// stops it at once. POST /revision makes a new reading, as a changed file would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionsOf, connectionsInNoView, emptyModel, load, outlineOf, ownership, viewsFor, viewsOf } from '../core/src/index.ts';
import { boxText, layOut } from '../layout/src/index.ts';
import { toFlow } from './src/flow.ts';
import { PICTURES, STATE } from './test/fixture.ts';

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, '..', 'cli', 'dist', 'viewer');
const port = Number(process.argv[2] ?? 0);

/**
 * A container view of a grid of apps and stores, each joined by an arrow to the next across and
 * down, worked out by the engine from records, and its picture with places made by hand, each
 * box's text broken as the layout breaks it. A store acts on nothing, so an arrow beside a store
 * runs from the app to it. Gives the model too, to be listed with the rest.
 */
function grid(columns, rows) {
  const box = (c, r) => `box-${String(c).padStart(2, '0')}-${String(r).padStart(2, '0')}`;
  const isApp = (c, r) => ['apps', 'stores', 'apps', 'apps'][(c + r) % 4] === 'apps';
  const files = { 'seefore.yaml': 'format: 1\nname: Grid\n', 'systems/grid.yaml': 'name: Grid\n', 'technologies/https.yaml': 'name: HTTPS\n', 'technologies/go.yaml': 'name: Go\n' };
  const join = (one, other, verb) => {
    const [from, to] = isApp(...one) ? [one, other] : [other, one];
    const name = verb === 'calls' ? 'Calls\ntechnology: [https]' : 'Feeds';
    files[`connections/${box(...from)}-${verb}-${box(...to)}.yaml`] = `from: ${box(...from)}\nto: ${box(...to)}\nname: ${name}\n`;
  };
  const left = 64;
  const top = 104;
  const across = 420;
  const down = 240;
  const places = new Map();
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const app = isApp(c, r);
      files[`${app ? 'apps' : 'stores'}/${box(c, r)}.yaml`] = `name: Part ${c}.${r}\nin: grid\ndescription: Does the work of part ${c} ${r}.\n${app ? 'kind: service\ntechnology: [go]' : 'kind: database'}\n`;
      places.set(box(c, r), { x: left + c * across, y: top + r * down });
      if (c + 1 < columns) join([c, r], [c + 1, r], 'calls');
      if (r + 1 < rows) join([c, r], [c, r + 1], 'feeds');
    }
  }
  const { model } = load(Object.entries(files).map(([path, text]) => ({ path, text })));
  const view = viewsOf(model).find((each) => each.id === 'container~grid');
  const right = left + (columns - 1) * across + 240 + 24;
  const bottom = top + (rows - 1) * down + 150 + 24;
  /** The line between two boxes side by side, or one above the other, from the edge of one to the facing edge of the other. */
  const sectionOf = (from, to) => {
    if (from.y === to.y) {
      const [start, end] = from.x < to.x ? [from.x + 240, to.x] : [from.x, to.x + 240];
      return [{ x: start, y: from.y + 75 }, { x: end, y: from.y + 75 }];
    }
    const [start, end] = from.y < to.y ? [from.y + 150, to.y] : [from.y, to.y + 150];
    return [{ x: from.x + 120, y: start }, { x: from.x + 120, y: end }];
  };
  const drawn = {
    view: view.id,
    width: right + 40,
    height: bottom + 40,
    boundaries: [{ id: 'grid', x: 40, y: 40, width: right - 40, height: bottom - 40, title: 'Grid [System]', titleAt: { x: 64, y: 52, width: 120, height: 20 } }],
    boxes: view.boxes.map((each) => ({ id: each.id, ...places.get(each.id), width: 240, height: 150, ...boxText(each) })),
    arrows: view.arrows.map((arrow) => {
      const [from, to] = [places.get(arrow.from), places.get(arrow.to)];
      const section = sectionOf(from, to);
      const label = from.y === to.y ? { label: { x: Math.min(section[0].x, section[1].x) + 50, y: from.y + 75 - 16, width: 80, height: 32, lines: ['Calls'], technology: '[HTTPS]' } } : {};
      return { id: arrow.id, from: arrow.from, to: arrow.to, sections: [section], ...label };
    }),
  };
  return { view, drawn, model };
}

/**
 * A help desk as files. Visitors and clerks reach its web app through an HTTPS proxy, which
 * also checks the API on its own account, and so has a box; visitors come through an edge
 * network first, which is somebody else's and has no box. The gateway signs what leaves the
 * desk and shares its keys between its copies. Jobs wait in a queue, changes go out on a
 * topic, and the card provider and the mail service are external, reached through a load
 * balancer that nothing starts or ends at. Clerks in the head office come through an office
 * proxy too, which is part of the desk. The web app keeps its drafts in a file beside it, the
 * worker is there only in the hosted edition, and the API tells the web app of new answers down
 * a channel the web app opened.
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
  'apps/worker.yaml': 'name: Worker\nin: desk\nonly: in the hosted edition\ndescription: Does the jobs that can wait.\nkind: job\ntechnology: [go]\n',
  'stores/drafts.yaml': 'name: Drafts\nin: web\ndescription: Answers that are not yet sent, in a file beside the web app.\nkind: files\n',
  'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: desk\nonly: in the head office\ndescription: Stands before the HTTPS proxy for clerks in the head office.\n',
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
  'connections/clerk-answers-web.yaml': 'from: clerk\nto: web\nvia: [office-proxy, proxy]\nname: Answers tickets\ntechnology: [https]\n',
  'connections/web-keeps-drafts.yaml': 'from: web\nto: drafts\naccess: read-write\nname: Keeps answers that are not yet sent\n',
  'connections/api-tells-web.yaml': 'from: api\nto: web\nopens: to\nname: Tells of new answers\ntechnology: [https]\n',
  'connections/web-asks-api.yaml': 'from: web\nto: api\nvia: [gateway]\nname: Asks for tickets\ntechnology: [https]\n',
  'connections/web-sends-api.yaml': 'from: web\nto: api\nname: Sends edits\ntechnology: [https]\n',
  'connections/proxy-checks-api.yaml': 'from: proxy\nto: api\nname: Checks that it answers\n',
  'connections/gateway-shares-keys.yaml': 'from: gateway\nto: gateway\nname: Shares its keys\n',
  'connections/api-keeps-tickets.yaml': 'from: api\nto: tickets\naccess: read-write\nname: Keeps tickets\ntechnology: [sql]\n',
  'connections/api-queues-jobs.yaml': 'from: api\nto: jobs\naccess: write\nname: Queues a job\n',
  'connections/worker-takes-jobs.yaml': 'from: worker\nto: jobs\naccess: read\nname: Takes the next job\n',
  'connections/api-tells-events.yaml': 'from: api\nto: events\nname: Says what changed\ntechnology: [kafka]\n',
  'connections/worker-mails.yaml': 'from: worker\nto: mail\nvia: [balancer]\nname: Sends the answer by mail\ntechnology: [smtp]\n',
  'connections/api-pays-cards.yaml': 'from: api\nto: cards\nvia: [gateway, balancer]\nname: Takes a payment\ntechnology: [https]\n',
};

const desk = load(Object.entries(DESK).map(([path, text]) => ({ path, text })));
const deskViews = viewsOf(desk.model);
const deskPictures = Object.fromEntries(await Promise.all(deskViews.map(async (view) => [view.id, await layOut(view)])));

const large = grid(9, 8);
let revision = 1;
/** How many records a model holds. */
const size = (one) => Object.values(one).reduce((sum, family) => sum + family.length, 0);
/** Models in one, each family in order of id. A record the models share, as a technology may be, is held once. */
const merged = (...models) =>
  Object.fromEntries(
    Object.keys(emptyModel()).map((family) => {
      const byId = new Map(models.flatMap((one) => one[family]).map((record) => [record.id, record]));
      return [family, [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))];
    }),
  );
const model = merged(STATE.model, desk.model, large.model);
const views = [...STATE.views, ...deskViews, large.view];
/**
 * The state of the latest reading: the fixture's, with the large view and the help desk's.
 * Its tally is the merged model's, and the records with an error that the fixture counts.
 */
const state = () => ({
  ...STATE,
  revision: `r${revision}`,
  records: size(model) + STATE.records - size(STATE.model),
  views,
  model,
  ownership: { ...STATE.ownership, ...Object.fromEntries(ownership(desk.model)), ...Object.fromEntries(ownership(large.model)) },
  conditions: Object.fromEntries(
    [desk.model.people, desk.model.systems, desk.model.apps, desk.model.stores, desk.model.components, desk.model.infrastructure, desk.model.connections]
      .flat()
      .map((record) => [record.id, conditionsOf(desk.model, record.id)])
      .filter(([, found]) => found.length > 0),
  ),
  outline: outlineOf(model),
  scopes: [...viewsFor(model).scopes],
  inNoView: connectionsInNoView(model),
});
const pictures = { ...PICTURES, ...deskPictures, [large.view.id]: large.drawn };
// Every picture as the page draws it: a view the page cannot draw stops the preview here.
for (const view of views) {
  const picture = pictures[view.id];
  if (picture !== undefined && !('failed' in picture)) toFlow(view, picture);
}
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
