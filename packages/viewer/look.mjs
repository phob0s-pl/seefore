// Serves the built page with made-up data, to look at it in a real browser:
// node packages/viewer/look.mjs [port]. Without a port the system picks one; the address is
// printed. Not part of the command, and not run by `npm run check`.
//
// The model is the shop of test/fixture.ts, whose Order API has two components, with a help desk
// and a grid beside it, and every setting of it is worked out and laid out by the engine as the
// server does, when the page first asks for it. So the page draws several boundaries with
// everything at Container depth; a boundary inside a boundary, with components, with the shop at
// Component depth; and a large picture, the grid at Container depth, with many boxes and arrows,
// to see that every arrow is drawn and what a picture too small to read says. The help desk has
// the hard cases of stage 6a: routes on arrows, a queue and a topic, external systems, a piece
// of infrastructure with a box and one without, and boxes that connections pass through; and
// those of stage 6b: a store the web app keeps, an office proxy that is part of the desk and
// there only in the head office, a worker there only in the hosted edition, reads and writes of
// the stores, and news the API sends down a channel the web app opened. Each picture is turned
// into what the page draws before it is sent, so that one the page cannot draw says so here.
// POST /revision makes a new reading, as a changed file would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionsOf, connectionsInNoView, emptyModel, load, outlineOf, ownership, settingOf, viewsFor } from '../core/src/index.ts';
import { layOut } from '../layout/src/index.ts';
import { toFlow } from './src/flow.ts';
import { STATE } from './test/fixture.ts';

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, '..', 'cli', 'dist', 'viewer');
const port = Number(process.argv[2] ?? 0);

/**
 * A grid of apps and stores in one system, each joined by a connection to the next across and
 * down. A store acts on nothing, so a connection beside a store runs from the app to it.
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
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const app = isApp(c, r);
      files[`${app ? 'apps' : 'stores'}/${box(c, r)}.yaml`] = `name: Part ${c}.${r}\nin: grid\ndescription: Does the work of part ${c} ${r}.\n${app ? 'kind: service\ntechnology: [go]' : 'kind: database'}\n`;
      if (c + 1 < columns) join([c, r], [c + 1, r], 'calls');
      if (r + 1 < rows) join([c, r], [c, r + 1], 'feeds');
    }
  }
  return load(Object.entries(files).map(([path, text]) => ({ path, text }))).model;
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

const desk = load(Object.entries(DESK).map(([path, text]) => ({ path, text }))).model;
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
const model = merged(STATE.model, desk, large);
const views = viewsFor(model);
const records = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections].flat();
/**
 * The state of the latest reading: the fixture's, with the help desk and the grid. Its tally is
 * the merged model's, and the records with an error that the fixture counts.
 */
const state = () => ({
  ...STATE,
  revision: `r${revision}`,
  records: size(model) + STATE.records - size(STATE.model),
  model,
  ownership: { ...STATE.ownership, ...Object.fromEntries(ownership(desk)), ...Object.fromEntries(ownership(large)) },
  conditions: Object.fromEntries(records.map((record) => [record.id, conditionsOf(model, record.id)]).filter(([, found]) => found.length > 0)),
  outline: outlineOf(model),
  scopes: [...views.scopes],
  inNoView: connectionsInNoView(model),
});
/** The picture of each setting asked for, laid out once with the views above it, as the server does. */
const pictures = new Map();
const pictureOf = (setting) => {
  const view = views.viewOf(setting);
  if (view === undefined) return undefined;
  if (!pictures.has(view.id)) {
    const above = views.above(setting).map((each) => views.viewOf(each));
    pictures.set(
      view.id,
      layOut(view, above).then((picture) => {
        // A picture the page cannot draw says so here.
        if (!('failed' in picture)) toFlow(view, picture);
        return picture;
      }),
    );
  }
  return pictures.get(view.id).then((picture) => ({ view, picture }));
};
const listeners = new Set();

const server = createServer(async (request, response) => {
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
    const [, at, key] = asked.map(decodeURIComponent);
    if (at !== `r${revision}`) return send(409, 'application/json', '{}');
    const setting = settingOf(key);
    const found = setting === undefined ? undefined : await pictureOf(setting);
    if (found === undefined) return send(404, 'application/json', '{}');
    return send(200, 'application/json', JSON.stringify({ revision: at, ...found }));
  }
  return send(404, 'text/plain', 'Not here.\n');
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : port}/`);
});
