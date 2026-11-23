import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';
import type { AddressInfo, Server as NetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEPTHS, keyOf, viewOf } from '@seefore/core';
import type { Drawn, Model, Picture, PictureAnswer, Setting, View, ViewerState, Views } from '@seefore/core';
import { EXAMPLE } from '../../core/test/example.ts';
import type { CheckResult } from '../src/check.ts';
import type { Io } from '../src/io.ts';
import { main } from '../src/main.ts';
import { listenFrom } from '../src/server/command.ts';
import { listen, startViewer } from '../src/server/http.ts';
import type { Viewer } from '../src/server/http.ts';
import type { Layouts } from '../src/server/layouts.ts';
import { readPage } from '../src/server/page.ts';
import type { Page } from '../src/server/page.ts';
import { Pictures } from '../src/server/pictures.ts';
import { Source, readingOf } from '../src/server/source.ts';
import type { Reading } from '../src/server/source.ts';

/** Long enough for the disk to tell of a change, and for a reading to follow. */
const SLOW = 15_000;

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

let root: string;
/** What each test started, to be stopped after it. */
let cleanups: (() => unknown)[];

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-server-')));
  cleanups = [];
});

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  rmSync(root, { recursive: true, force: true });
});

/** Writes files under a folder of the temporary folder. A path's folders are made as needed. */
function write(files: Readonly<Record<string, string>>, under = 'arch'): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, under, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** Waits until something is so, and gives it back. */
async function waitFor<T>(what: () => T | undefined | false, ms = 10_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const found = what();
    if (found) return found;
    if (Date.now() > until) throw new Error('It did not happen in time.');
    await sleep(20);
  }
}

/** The view of a setting made up for a test, with nothing in it. */
function view(setting: Setting): View {
  const id = keyOf(setting);
  return { id, depth: setting.depth, scope: setting.scope, title: `View: ${id}`, boxes: [], boundaries: [], arrows: [], left: { outside: [], broken: [] }, legend: [], passed: [] };
}

/**
 * The views of a model made up for a test: everything, and each of these boxes, at every depth,
 * each taking its turns from the same scope at each depth up. The model is not read, and each
 * look-up is counted.
 */
function madeUp(...scopes: string[]): ((model: Model) => Views) & { looked: number } {
  const lookUp = Object.assign(
    (): Views => {
      lookUp.looked += 1;
      const has = (setting: Setting) => setting.scope === null || scopes.includes(setting.scope);
      return {
        scopes: scopes.map((id) => ({ id, family: 'systems', depth: 'system' })),
        viewOf: (setting) => (has(setting) ? view(setting) : undefined),
        above: (setting) => (has(setting) ? DEPTHS.slice(0, DEPTHS.indexOf(setting.depth)).reverse().map((depth) => ({ depth, scope: setting.scope })) : []),
        settings: () => [],
      };
    },
    { looked: 0 },
  );
  return lookUp;
}

/** A model for the made-up views, which do not read it. */
const NO_MODEL: Model = { people: [], systems: [], apps: [], stores: [], components: [], infrastructure: [], connections: [], owners: [], technologies: [] };

/** The picture a made-up layout gives for a view. */
function drawn(of: View): Drawn {
  return { view: of.id, width: 100, height: 50, boxes: [], boundaries: [], arrows: [] };
}

/** Layouts that answer at once, and count what they ran, each with the views it was handed from above. */
function atOnce(): Layouts & { runs: string[]; above: string[][] } {
  const runs: string[] = [];
  const above: string[][] = [];
  return {
    runs,
    above,
    run: async (of, from) => {
      runs.push(of.id);
      above.push(from.map((each) => each.id));
      return drawn(of);
    },
    close: () => {},
  };
}

/** Layouts that answer only when the test says, and tell how many ran at once at most. */
function byHand(): Layouts & { started: { view: string; finish(picture?: Picture): void }[]; most: number; closed: boolean } {
  let now = 0;
  const layouts = {
    started: [] as { view: string; finish(picture?: Picture): void }[],
    most: 0,
    closed: false,
    run: (of: View) =>
      new Promise<Picture>((resolve) => {
        now += 1;
        layouts.most = Math.max(layouts.most, now);
        layouts.started.push({
          view: of.id,
          finish: (picture = drawn(of)) => {
            now -= 1;
            resolve(picture);
          },
        });
      }),
    close: () => {
      layouts.closed = true;
    },
  };
  return layouts;
}

/** Layouts that never answer. */
function never(): Layouts {
  return { run: () => new Promise<Picture>(() => {}), close: () => {} };
}

/** A page made for a test: its two files, and a secret beside its folder that must never be served. */
function makePage(): Page {
  write({ 'index.html': '<!doctype html><p>the page</p>', 'app.js': 'console.log("app");', '.hidden.js': 'hidden' }, 'home/viewer');
  // The worker's file only has to be there: its thread starts with the first layout, and these tests give layouts of their own.
  write({ 'secret.txt': 'the secret', 'layout-worker.cjs': '' }, 'home');
  const page = readPage(join(root, 'home', 'viewer'));
  if (!page) throw new Error('The page was not made.');
  return page;
}

/** Starts a viewer on `arch/` that listens on a free port, and stops it after the test. */
async function serving(layouts: Layouts = atOnce()): Promise<{ viewer: Viewer; port: number }> {
  const viewer = startViewer({ directory: join(root, 'arch'), layouts, page: makePage() });
  cleanups.push(() => viewer.close());
  const port = await listen(viewer.server, 0);
  return { viewer, port };
}

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Asks the server over HTTP, with the host it was given, or the right one. */
function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const asked = request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers }, setHost: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    asked.on('error', reject);
    asked.end();
  });
}

/** Follows the server's events, gathering each revision it sends. */
function events(port: number): { revisions: string[]; close(): void } {
  const revisions: string[] = [];
  const asked = request({ host: '127.0.0.1', port, path: '/api/events' }, (response) => {
    let buffer = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n\n'); at >= 0; at = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (/^event: revision$/m.test(block) && data) revisions.push(data);
      }
    });
  });
  asked.on('error', () => {});
  asked.end();
  const close = (): void => {
    asked.destroy();
  };
  cleanups.push(close);
  return { revisions, close };
}

/** A port no one listens on now. */
async function freePort(): Promise<number> {
  const server = await occupy(0);
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

/** Takes a port of 127.0.0.1, so that the server cannot have it. Let go after the test. */
async function occupy(port: number): Promise<NetServer> {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', done);
  });
  cleanups.push(() => new Promise((done) => server.close(done)));
  return server;
}

/** The answer for a made-up setting at a revision: its view, and the picture a made-up layout gives. */
function answered(revision: string, key: string): { answer: PictureAnswer } {
  const [depth = 'system', scope = null] = key.split('~') as [Setting['depth'], string?];
  const shown = view({ depth, scope });
  return { answer: { revision, view: shown, picture: drawn(shown) } };
}

describe('the pictures', () => {
  it('lays a setting out once for each revision, however often it is asked: two questions share one layout', async () => {
    const layouts = atOnce();
    const pictures = new Pictures(layouts, madeUp('a'));
    pictures.update('r1', NO_MODEL);
    const [first, second] = await Promise.all([pictures.ask('r1', 'container~a'), pictures.ask('r1', 'container~a')]);
    const third = await pictures.ask('r1', 'container~a');
    expect(layouts.runs).toEqual(['container~a']);
    expect(first).toEqual(answered('r1', 'container~a'));
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('answers with the view of the setting and its picture, for everything and for one box', async () => {
    const pictures = new Pictures(atOnce(), madeUp('a'));
    pictures.update('r1', NO_MODEL);
    expect(await pictures.ask('r1', 'system')).toEqual(answered('r1', 'system'));
    expect(await pictures.ask('r1', 'component~a')).toEqual(answered('r1', 'component~a'));
  });

  it('hands the layout the views of the settings it takes its turns from, nearest first', async () => {
    const layouts = atOnce();
    const pictures = new Pictures(layouts, madeUp('a'));
    pictures.update('r1', NO_MODEL);
    await pictures.ask('r1', 'component~a');
    await pictures.ask('r1', 'system~a');
    await pictures.ask('r1', 'container');
    expect(layouts.above).toEqual([['container~a', 'system~a'], [], ['system']]);
  });

  it('looks the model up once for each reading, and not before a picture is asked for', async () => {
    const lookUp = madeUp('a', 'b');
    const pictures = new Pictures(atOnce(), lookUp);
    pictures.update('r1', NO_MODEL);
    expect(lookUp.looked).toBe(0);
    for (const key of ['system', 'container~a', 'component~b', 'system~nowhere']) await pictures.ask('r1', key);
    expect(lookUp.looked).toBe(1);
    pictures.update('r2', NO_MODEL);
    await pictures.ask('r2', 'system');
    expect(lookUp.looked).toBe(2);
  });

  it('runs one layout at a time, in the order asked', async () => {
    const layouts = byHand();
    const pictures = new Pictures(layouts, madeUp('a', 'b', 'c'));
    pictures.update('r1', NO_MODEL);
    const asked = ['system~a', 'system~b', 'system~c'].map((key) => pictures.ask('r1', key));
    await sleep(10);
    expect(layouts.started.map((job) => job.view)).toEqual(['system~a']);
    for (let n = 0; n < 3; n++) {
      await waitFor(() => layouts.started.length === n + 1);
      layouts.started[n]?.finish();
    }
    const answers = await Promise.all(asked);
    expect(answers.map((answer) => ('answer' in answer ? answer.answer.picture.view : answer))).toEqual(['system~a', 'system~b', 'system~c']);
    expect(layouts.most).toBe(1);
  });

  it('keeps a failure as the answer, and says what went wrong in plain words', async () => {
    let runs = 0;
    const pictures = new Pictures(
      {
        run: async () => {
          runs += 1;
          throw new Error('ELK fell over');
        },
        close: () => {},
      },
      madeUp('a'),
    );
    pictures.update('r1', NO_MODEL);
    const first = await pictures.ask('r1', 'system~a');
    expect(first).toEqual({
      answer: { revision: 'r1', view: view({ depth: 'system', scope: 'a' }), picture: { view: 'system~a', failed: { reason: 'crash', message: 'This view could not be laid out: ELK fell over' } } },
    });
    expect(await pictures.ask('r1', 'system~a')).toEqual(first);
    expect(runs).toBe(1);
  });

  it('drops the work of a revision that is no longer the latest, and lets its answers go', async () => {
    const layouts = byHand();
    const pictures = new Pictures(layouts, madeUp('a', 'b'));
    pictures.update('r1', NO_MODEL);
    const a = pictures.ask('r1', 'system~a');
    const b = pictures.ask('r1', 'system~b');
    await waitFor(() => layouts.started.length === 1);

    pictures.update('r2', NO_MODEL);
    expect(await b).toEqual({ old: true });
    layouts.started[0]?.finish();
    expect(await a).toEqual({ old: true });

    const again = pictures.ask('r2', 'system~a');
    await waitFor(() => layouts.started.length === 2);
    layouts.started[1]?.finish();
    expect(await again).toEqual(answered('r2', 'system~a'));
    // b of r1 never ran.
    expect(layouts.started.map((job) => job.view)).toEqual(['system~a', 'system~a']);
  });

  it('answers that a revision is old, or that the reading has no such setting', async () => {
    const pictures = new Pictures(atOnce(), madeUp('a'));
    pictures.update('r2', NO_MODEL);
    expect(await pictures.ask('r1', 'system~a')).toEqual({ old: true });
    // A box that is not the scope of any setting, a key of no known form, and an address of stage 5.
    for (const key of ['system~b', 'deep~a', 'system~a~b', 'system~', 'a.context', 'a.containers']) expect(await pictures.ask('r2', key), key).toEqual({ unknown: true });
    // A reading with no model has no setting at all.
    pictures.update('r3', undefined);
    expect(await pictures.ask('r3', 'system')).toEqual({ unknown: true });
  });
});

describe('a reading of the source directory', () => {
  it('reads as seefore check does, with the same problems', () => {
    write({ ...EXAMPLE, 'apps/broken.yaml': 'name: Broken\nin: nowhere\nkind: spaceship\n', 'notes.yaml': 'a: 1\n' });
    const reading = readingOf(join(root, 'arch'));
    const out: string[] = [];
    main(['check', '--json', `--workdir=${join(root, 'arch')}`], { cwd: root, out: (text) => out.push(text), err: () => {} });
    const checked = JSON.parse(out.join('\n')) as CheckResult;

    expect(reading.problems.length).toBeGreaterThan(1);
    expect(reading.problems).toEqual(checked.problems);
    expect({ ...reading, available: undefined }).toMatchObject({
      directory: checked.directory,
      name: 'Shop',
      format: 1,
      records: checked.records,
      errors: checked.errors,
      warnings: checked.warnings,
    });
    expect(reading.available).toBe(true);
    expect(reading.model.apps.map((app) => app.id)).toEqual(['order-api', 'shipping', 'storefront']);
    expect(reading.ownership['shipping']).toEqual({ owner: 'logistics-team', from: 'shipping' });
  });

  it('lists what can be the scope, each with the shallowest depth it has, and sends no view', () => {
    write(EXAMPLE);
    const reading = readingOf(join(root, 'arch'));
    expect(reading.scopes).toEqual([
      { id: 'customer', family: 'people', depth: 'system' },
      { id: 'warehouse-clerk', family: 'people', depth: 'system' },
      { id: 'shop', family: 'systems', depth: 'system' },
      { id: 'order-api', family: 'apps', depth: 'container' },
      { id: 'checkout', family: 'components', depth: 'component' },
      { id: 'order-status', family: 'components', depth: 'component' },
      { id: 'shipping', family: 'apps', depth: 'container' },
      { id: 'storefront', family: 'apps', depth: 'container' },
      { id: 'orders-database', family: 'stores', depth: 'container' },
      { id: 'card-provider', family: 'systems', depth: 'system' },
    ]);
    expect(Object.keys(reading)).not.toContain('views');
  });

  it('has no model and nothing that can be the scope when the marker cannot say which format the directory is in', () => {
    write({ ...EXAMPLE, 'seefore.yaml': 'format: 99\nname: Shop\n' });
    const reading = readingOf(join(root, 'arch'));
    expect(reading.available).toBe(false);
    expect(reading.format).toBe(99);
    expect(reading.scopes).toEqual([]);
    expect(reading.model.people).toEqual([]);
    expect(reading.problems.map((problem) => problem.code)).toContain('format-not-readable');
  });

  it('gives the connections that no view holds, those with an end that cannot be followed, which the listing of the model still has', () => {
    // A person reloads a proxy, the proxy checks a peer and itself, and none of it touches the one
    // system: no view of the system draws it, and everything as the scope does. The person also
    // asks an app whose `in` names nothing, which is not in the model.
    write({
      'seefore.yaml': 'format: 1\nname: Desk\n',
      'systems/desk.yaml': 'name: Desk\n',
      'apps/api.yaml': 'name: API\nin: desk\n',
      'apps/lost.yaml': 'name: Lost\nin: nowhere\n',
      'people/operator.yaml': 'name: Operator\n',
      'infrastructure/proxy.yaml': 'name: Proxy\n',
      'infrastructure/peer.yaml': 'name: Peer proxy\n',
      'connections/operator-reloads-proxy.yaml': 'from: operator\nto: proxy\n',
      'connections/proxy-checks-peer.yaml': 'from: proxy\nto: peer\n',
      'connections/proxy-syncs-proxy.yaml': 'from: proxy\nto: proxy\n',
      'connections/operator-uses-api.yaml': 'from: operator\nto: api\n',
      'connections/operator-asks-lost.yaml': 'from: operator\nto: lost\n',
    });
    const reading = readingOf(join(root, 'arch'));
    expect(reading.problems.map((problem) => problem.code)).toEqual(['reference-unknown']);
    expect(reading.inNoView).toEqual(['operator-asks-lost']);
    expect(JSON.stringify(viewOf(reading.model, { depth: 'container', scope: 'desk' }))).not.toMatch(/operator-reloads-proxy|proxy-checks-peer|proxy-syncs-proxy/);
    const everything = JSON.stringify(viewOf(reading.model, { depth: 'system', scope: null }));
    for (const id of ['operator-reloads-proxy', 'proxy-checks-peer', 'proxy-syncs-proxy']) expect(everything).toContain(`"${id}"`);
    // The listing of the model has each under where it starts.
    expect(reading.outline.connections.flatMap((group) => group.connections)).toEqual(expect.arrayContaining(['operator-asks-lost', 'operator-reloads-proxy']));
    // What can be the scope, for the page: the proxy and its peer have boxes.
    expect(reading.scopes.map((scope) => scope.id)).toEqual(['operator', 'desk', 'api', 'peer', 'proxy']);
    // With no model there is nothing in no view.
    expect(readingOf(join(root, 'gone')).inNoView).toEqual([]);
  });

  it('gives the conditions each record is under, its own first, so that the page need not work them out', () => {
    write({
      'seefore.yaml': 'format: 1\nname: Archive\n',
      'systems/archive.yaml': 'name: Archive\nonly: in the hosted edition\n',
      'apps/desk.yaml': 'name: Desk\nin: archive\n',
      'stores/drafts.yaml': 'name: Drafts\nin: desk\nonly: on a laptop\n',
      'people/staff.yaml': 'name: Staff\n',
      'connections/staff-opens-drafts.yaml': 'from: staff\nto: drafts\nonly: by hand\n',
    });
    const reading = readingOf(join(root, 'arch'));
    expect(reading.conditions).toEqual({
      archive: [{ only: 'in the hosted edition', from: 'archive' }],
      desk: [{ only: 'in the hosted edition', from: 'archive' }],
      drafts: [
        { only: 'on a laptop', from: 'drafts' },
        { only: 'in the hosted edition', from: 'archive' },
      ],
      'staff-opens-drafts': [
        { only: 'by hand', from: 'staff-opens-drafts' },
        { only: 'on a laptop', from: 'drafts' },
        { only: 'in the hosted edition', from: 'archive' },
      ],
    });
    expect(readingOf(join(root, 'gone')).conditions).toEqual({});
  });

  it('holds, for a record whose id every object has a property of, only what was put there, as the page reads it', () => {
    write({
      'seefore.yaml': 'format: 1\nname: Review\n',
      'people/constructor.yaml': 'name: Constructor\n',
      'people/tostring.yaml': 'name: To string\nonly: on weekdays\n',
      'systems/shelf.yaml': 'name: Shelf\nowner: team\n',
      'owners/team.yaml': 'name: Team\n',
      'connections/constructor-uses-shelf.yaml': 'from: constructor\nto: shelf\n',
    });
    const reading = readingOf(join(root, 'arch'));
    expect(reading.problems).toEqual([]);
    // As the page gets it: JSON, read back as plain objects.
    const sent = JSON.parse(JSON.stringify(reading)) as typeof reading;
    expect(Object.keys(sent.conditions)).toEqual(['tostring']);
    expect(Object.hasOwn(sent.conditions, 'constructor')).toBe(false);
    expect(Object.hasOwn(sent.ownership, 'constructor')).toBe(false);
    expect(Object.keys(sent.ownership)).toEqual(['shelf']);
  });

  it('gives what the C4 checks found, as seefore check does, and keeps notes out of the count of problems', () => {
    write({ ...EXAMPLE, 'connections/customer-uses-shop.yaml': 'from: customer\nto: shop\nname: Uses\n', 'people/visitor.yaml': 'name: Visitor\n' });
    const reading = readingOf(join(root, 'arch'));
    const out: string[] = [];
    main(['check', '--json', `--workdir=${join(root, 'arch')}`], { cwd: root, out: (text) => out.push(text), err: () => {} });
    const checked = JSON.parse(out.join('\n')) as CheckResult;
    expect(reading.c4).toEqual(checked.c4);
    expect(reading.c4?.complete).toBe(true);
    expect(reading.c4?.['element-unconnected'].findings.map((finding) => finding.file)).toEqual(['people/visitor.yaml']);
    // The warning is a problem as any other; the notes are not.
    expect(reading.problems.map((problem) => problem.code)).toEqual(['connection-vague']);
    expect({ errors: reading.errors, warnings: reading.warnings }).toEqual({ errors: 0, warnings: 1 });
  });

  it('says that none of the C4 checks was run when the marker cannot say which format the directory is in, and gives none when the directory is gone', () => {
    write({ ...EXAMPLE, 'seefore.yaml': 'format: one\nname: Shop\n' });
    const unknown = readingOf(join(root, 'arch'));
    expect(unknown.c4?.complete).toBe(false);
    expect(Object.values(unknown.c4 ?? {}).filter((check) => typeof check === 'object').map((check) => check.checked)).toEqual([null, null, null, null, null]);
    expect(readingOf(join(root, 'gone')).c4).toBeUndefined();
  });

  it('says that the directory is gone, when it is', () => {
    const reading = readingOf(join(root, 'gone'));
    expect(reading.available).toBe(false);
    expect(reading.errors).toBe(1);
    expect(reading.problems).toEqual([
      { file: '.', line: 1, column: 1, severity: 'error', code: 'directory-gone', message: 'The source directory is gone. seefore reads it again as soon as it is back.' },
    ]);
  });
});

describe('following the files', () => {
  /** A source on `arch/` that counts its readings, closed after the test. */
  function following(read: (directory: string) => Reading = readingOf): { source: Source; reads: () => number; told: ViewerState[] } {
    let reads = 0;
    const source = new Source(join(root, 'arch'), (directory) => {
      reads += 1;
      return read(directory);
    });
    const told: ViewerState[] = [];
    source.follow((state) => told.push(state));
    cleanups.push(() => source.close());
    return { source, reads: () => reads, told };
  }

  /** Waits until the source has read nothing new for a while, as after the events of its start. */
  async function settled(reads: () => number): Promise<void> {
    for (let last = -1; last !== reads(); ) {
      last = reads();
      await sleep(200);
    }
  }

  it('gives each reading a revision unlike that of another run', () => {
    write(EXAMPLE);
    const one = new Source(join(root, 'arch'));
    const two = new Source(join(root, 'arch'));
    cleanups.push(() => one.close(), () => two.close());
    expect(one.state.revision).not.toBe(two.state.revision);
    expect({ ...one.state, revision: '' }).toEqual({ ...two.state, revision: '' });
  });

  it('reads again when a file changes, and tells those who follow', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source, told } = following();
    const first = source.state.revision;
    write({ 'people/customer.yaml': 'name: Shopper\n' });
    const next = await waitFor(() => told.find((state) => state.model.people.some((person) => person.name === 'Shopper')));
    expect(next.revision).not.toBe(first);
    expect(source.state).toBe(told[told.length - 1]);
  });

  it('gives the counts of the C4 checks anew with each reading, as an edit takes a note away', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source, told } = following();
    const missing = (state: ViewerState) => state.c4?.['technology-missing'].findings.map((finding) => finding.file);
    expect(missing(source.state)).toContain('apps/shipping.yaml');
    write({ 'apps/shipping.yaml': 'name: Shipping\nin: shop\nkind: service\ndescription: Tells the warehouse what to pack.\ntechnology: [go]\nowner: logistics-team\n' });
    const next = await waitFor(() => told.find((state) => !missing(state)?.includes('apps/shipping.yaml')));
    expect(next.c4?.['technology-missing'].checked).toBe(source.state.c4?.['technology-missing'].checked);
  });

  it('reads again when a file is replaced by a rename, as editors and Git do', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source } = following();
    write({ 'people/.customer.yaml.tmp': 'name: Buyer\n' });
    renameSync(join(root, 'arch/people/.customer.yaml.tmp'), join(root, 'arch/people/customer.yaml'));
    await waitFor(() => source.state.model.people.some((person) => person.name === 'Buyer'));
  });

  it('says when the directory is gone, and reads the same path again when it is back', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source } = following();
    rmSync(join(root, 'arch'), { recursive: true });
    await waitFor(() => !source.state.available && source.state.problems[0]?.code === 'directory-gone');
    expect(source.state.scopes).toEqual([]);

    write({ ...EXAMPLE, 'seefore.yaml': 'format: 1\nname: Shop again\n' });
    await waitFor(() => source.state.available && source.state.name === 'Shop again');
    expect(source.state.directory).toBe(join(root, 'arch'));
    expect(source.state.records).toBe(readingOf(join(root, 'arch')).records);

    // It watches the folder that came back.
    write({ 'people/customer.yaml': 'name: Back again\n' });
    await waitFor(() => source.state.model.people.some((person) => person.name === 'Back again'));
  });

  it('looks at the path until the directory is there, though nothing could watch it while it was gone', { timeout: SLOW }, async () => {
    const { source } = following();
    expect(source.state.available).toBe(false);
    write(EXAMPLE);
    await waitFor(() => source.state.available && source.state.name === 'Shop');
    write({ 'people/customer.yaml': 'name: Watched\n' });
    await waitFor(() => source.state.model.people.some((person) => person.name === 'Watched'));
  });

  it('never moves to another source directory, even one just above', { timeout: SLOW }, async () => {
    write({ 'seefore.yaml': 'format: 1\nname: Outer\n' }, '.');
    write(EXAMPLE);
    const { source } = following();
    rmSync(join(root, 'arch/seefore.yaml'));
    await waitFor(() => !source.state.available);
    expect(source.state.directory).toBe(join(root, 'arch'));
    expect(source.state.problems.map((problem) => problem.code)).toContain('marker-missing');
  });

  it('reads a burst of changes once, not once for each', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source, reads } = following();
    await settled(reads);
    const before = reads();
    for (let n = 0; n < 30; n++) write({ [`people/person-${n}.yaml`]: `name: Person ${n}\n` });
    await waitFor(() => source.state.model.people.length === 32);
    await settled(reads);
    expect(reads() - before).toBeLessThanOrEqual(3);
  });

  it('reads once more when a file changes while it reads', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    let changed = false;
    const { source, reads } = following((directory) => {
      const reading = readingOf(directory);
      // The first time a change is read, another lands after the files were read.
      if (!changed && reading.model.people.some((person) => person.name === 'First')) {
        changed = true;
        write({ 'people/warehouse-clerk.yaml': 'name: Second\n' });
      }
      return reading;
    });
    await settled(reads);
    write({ 'people/customer.yaml': 'name: First\n' });
    await waitFor(() => source.state.model.people.some((person) => person.name === 'Second'));
    expect(changed).toBe(true);
  });

  it('keeps the revision when a reading finds what the last one did', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { source, reads, told } = following();
    await settled(reads);
    const { revision } = source.state;
    const before = reads();
    write({ 'notes.txt': 'Not a record.' });
    await waitFor(() => reads() > before);
    await settled(reads);
    expect(source.state.revision).toBe(revision);
    expect(told).toEqual([]);
  });

  it('does not read again for a change in a hidden folder', { timeout: SLOW }, async () => {
    write(EXAMPLE);
    const { reads } = following();
    await settled(reads);
    const before = reads();
    write({ '.git/index': 'x', 'people/.customer.yaml.swp': 'x' });
    await sleep(600);
    expect(reads()).toBe(before);
  });
});

describe('the server', () => {
  beforeEach(() => write(EXAMPLE));

  it('listens on 127.0.0.1 only', async () => {
    const { viewer } = await serving();
    expect((viewer.server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('answers the state of the latest reading', async () => {
    const { viewer, port } = await serving();
    const answer = await get(port, '/api/state');
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toBe('application/json; charset=utf-8');
    const state = JSON.parse(answer.body) as ViewerState;
    expect(state).toEqual(viewer.source.state);
    expect(state.name).toBe('Shop');
    expect(state.scopes.map((scope) => scope.id)).toContain('checkout');
    expect(Object.keys(state)).not.toContain('views');
  });

  it('answers the view of a setting at the latest revision, with its picture, the setting named as the address names it', async () => {
    const layouts = atOnce();
    const { viewer, port } = await serving(layouts);
    const { revision, model } = viewer.source.state;
    for (const setting of [{ depth: 'system', scope: null }, { depth: 'container', scope: 'shop' }, { depth: 'component', scope: 'checkout' }] satisfies Setting[]) {
      const answer = await get(port, `/api/pictures/${revision}/${keyOf(setting)}`);
      expect(answer.status, keyOf(setting)).toBe(200);
      const shown = viewOf(model, setting);
      if (shown === undefined) throw new Error(`The shop has the setting ${keyOf(setting)}.`);
      expect(JSON.parse(answer.body)).toEqual({ revision, view: shown, picture: drawn(shown) });
    }
    expect((await get(port, `/api/pictures/${encodeURIComponent(revision)}/${encodeURIComponent('container~shop')}`)).status).toBe(200);
    // Each laid out once, and handed the views above it.
    expect(layouts.runs).toEqual(['system', 'container~shop', 'component~checkout']);
    expect(layouts.above).toEqual([[], [], []]);
    // One system at Component depth takes its turns from its container view, which takes none.
    await get(port, `/api/pictures/${revision}/component~shop`);
    expect(layouts.above.at(-1)).toEqual(['container~shop']);
    await get(port, `/api/pictures/${revision}/component`);
    expect(layouts.above.at(-1)).toEqual(['container', 'system']);
  });

  it('answers 409 for a revision that is not the latest, and 404 for a setting the reading does not have', async () => {
    const { viewer, port } = await serving();
    const old = await get(port, '/api/pictures/not-a-revision/system~shop');
    expect(old.status).toBe(409);
    expect(JSON.parse(old.body)).toEqual({
      error: { code: 'revision-old', message: 'This reading of the files is no longer the latest. Ask for the state again.' },
    });
    const { revision } = viewer.source.state;
    const missing = await get(port, `/api/pictures/${revision}/container~nowhere`);
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toEqual({ error: { code: 'no-such-view', message: 'The latest reading has no view `container~nowhere`.' } });
    // A depth the box does not have, the address of a view of stage 5, and one of no known form.
    for (const setting of ['system~order-api', 'container~checkout', 'shop.context', 'shop.containers', 'everything', 'system~']) {
      expect((await get(port, `/api/pictures/${revision}/${encodeURIComponent(setting)}`)).status, setting).toBe(404);
    }
    expect((await get(port, '/api/pictures/one/two/three')).status).toBe(404);
    expect((await get(port, '/api/pictures/%E0%A4%A/x')).status).toBe(404);
  });

  it('answers 404 for every setting while the directory is gone', async () => {
    rmSync(join(root, 'arch'), { recursive: true });
    const { viewer, port } = await serving();
    expect(viewer.source.state.available).toBe(false);
    expect((await get(port, `/api/pictures/${viewer.source.state.revision}/system`)).status).toBe(404);
  });

  it('answers the state and the events while a layout runs', async () => {
    const { viewer, port } = await serving(never());
    let pictureAnswered = false;
    void get(port, `/api/pictures/${viewer.source.state.revision}/system~shop`).then(() => (pictureAnswered = true), () => {});
    await sleep(50);
    expect((await get(port, '/api/state')).status).toBe(200);
    const followed = events(port);
    await waitFor(() => followed.revisions.length === 1);
    expect(pictureAnswered).toBe(false);
  });

  it('sends the revision at once, and again after a file changes', { timeout: SLOW }, async () => {
    const { viewer, port } = await serving();
    const first = viewer.source.state.revision;
    const followed = events(port);
    await waitFor(() => followed.revisions.length === 1);
    expect(followed.revisions).toEqual([first]);

    write({ 'people/customer.yaml': 'name: Shopper\n' });
    await waitFor(() => followed.revisions.length === 2);
    const second = followed.revisions[1] as string;
    expect(second).not.toBe(first);
    expect((JSON.parse((await get(port, '/api/state')).body) as ViewerState).revision).toBe(second);
    expect((await get(port, `/api/pictures/${first}/system~shop`)).status).toBe(409);
    expect((await get(port, `/api/pictures/${second}/system~shop`)).status).toBe(200);
  });

  it('serves the page from its files, and the page itself at an address the page made', async () => {
    const { port } = await serving();
    const index = await get(port, '/');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(index.body).toBe('<!doctype html><p>the page</p>');
    const app = await get(port, '/app.js');
    expect(app.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(app.body).toBe('console.log("app");');
    expect(app.headers['x-content-type-options']).toBe('nosniff');
    expect((await get(port, '/view/container~shop?x=1', { accept: 'text/html,application/xhtml+xml' })).body).toBe(index.body);
  });

  it('serves no file but those of the page, listed when it started', async () => {
    const { port } = await serving();
    write({ 'late.js': 'late' }, 'home/viewer');
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/viewer/../secret.txt', '/secret.txt', '/late.js', '/.hidden.js', '/nothing.js', '/api']) {
      const answer = await get(port, path);
      expect(answer.status, path).toBe(404);
      expect(answer.body).not.toContain('secret');
      const asPage = await get(port, path, { accept: 'text/html' });
      expect(asPage.body, path).not.toContain('the secret');
    }
    expect((await get(port, '/api/nothing')).status).toBe(404);
  });

  it('refuses a request made under another name for the host', async () => {
    const { port } = await serving();
    for (const host of ['evil.example', `evil.example:${port}`, `localhost:${port}`, '127.0.0.1', `127.0.0.1:${port + 1}`]) {
      for (const path of ['/', '/api/state', '/api/events']) {
        const answer = await get(port, path, { host });
        expect(answer.status, `${host} ${path}`).toBe(403);
        expect(answer.body).toBe(`This server answers only at http://127.0.0.1:${port}/.\n`);
      }
    }
  });

  it('gives no data to a page of another origin', async () => {
    const { port } = await serving();
    const refused = [{ origin: 'http://evil.example' }, { origin: `http://localhost:${port}` }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }];
    for (const headers of refused) {
      const answer = await get(port, '/api/state', headers);
      expect(answer.status, JSON.stringify(headers)).toBe(403);
      expect(JSON.parse(answer.body)).toEqual({ error: { code: 'other-origin', message: 'This server answers only its own page.' } });
    }
    const allowed = [{ origin: `http://127.0.0.1:${port}` }, { 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, {}];
    for (const headers of allowed) expect((await get(port, '/api/state', headers)).status, JSON.stringify(headers)).toBe(200);
  });

  it('answers GET only', async () => {
    const { port } = await serving();
    for (const [method, path] of [['POST', '/api/state'], ['PUT', '/'], ['DELETE', '/app.js'], ['HEAD', '/api/state']] as const) {
      const answer = await get(port, path, {}, method);
      expect(answer.status, `${method} ${path}`).toBe(405);
      expect(answer.headers['allow']).toBe('GET');
    }
  });

  it('closes every connection when it stops, the events too', async () => {
    const { viewer, port } = await serving();
    const followed = events(port);
    await waitFor(() => followed.revisions.length === 1);
    await viewer.close();
    await expect(get(port, '/api/state')).rejects.toThrow();
  });
});

describe('seefore --server', () => {
  /** Runs the command in-process from the temporary folder, with a page of its own, until the test stops it. */
  function run(args: string[], options: { terminal?: boolean; home?: string } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const opened: string[] = [];
    let stop = (): void => {};
    const stopped = new Promise<void>((done) => (stop = done));
    const io: Io = {
      cwd: root,
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      terminal: options.terminal ?? true,
      home: options.home ?? join(root, 'home'),
      open: (address) => opened.push(address),
      untilStopped: () => stopped,
    };
    const code = Promise.resolve(main(args, io));
    cleanups.push(async () => {
      stop();
      await code;
    });
    return { code, out, err, opened, stop };
  }

  /** The address the command printed, once it has. */
  async function addressIn(out: string[]): Promise<{ address: string; port: number }> {
    const address = await waitFor(() => /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out.join('\n')) ?? undefined);
    return { address: address[0], port: Number(address[1]) };
  }

  beforeEach(() => {
    write(EXAMPLE);
    makePage();
  });

  it('prints the address once it listens, opens it from a terminal, and serves until stopped', async () => {
    const port = await freePort();
    const running = run(['--server', '--workdir=arch', `--port=${port}`]);
    const { address } = await addressIn(running.out);
    expect((await get(port, '/')).body).toBe('<!doctype html><p>the page</p>');
    expect(running.out).toEqual([
      `seefore is showing Shop at http://127.0.0.1:${port}/`,
      `It follows the files in ${join(root, 'arch')} as they change. Press Ctrl+C to stop.`,
    ]);
    expect(running.opened).toEqual([address]);

    running.stop();
    expect(await running.code).toBe(0);
    expect(running.err).toEqual([]);
    await expect(get(port, '/')).rejects.toThrow();
  });

  it('does not open the browser with --no-open, nor when the output is not a terminal', async () => {
    const quiet = run(['--server', '--workdir=arch', `--port=${await freePort()}`, '--no-open']);
    await addressIn(quiet.out);
    const piped = run(['--server', '--workdir=arch', `--port=${await freePort()}`], { terminal: false });
    await addressIn(piped.out);
    expect(quiet.opened).toEqual([]);
    expect(piped.opened).toEqual([]);
  });

  it('takes 4173 without --port, or the next port that is free', async () => {
    const running = run(['--server', '--workdir=arch', '--no-open']);
    const { port } = await addressIn(running.out);
    expect(port).toBeGreaterThanOrEqual(4173);
    expect(port).toBeLessThan(4173 + 100);
  });

  it('takes the next port when one is taken', async () => {
    // A taken port with room for a few more after it.
    let taken = await occupy(0);
    while ((taken.address() as AddressInfo).port > 65530) taken = await occupy(0);
    const first = (taken.address() as AddressInfo).port;
    const server = createHttpServer();
    cleanups.push(() => new Promise((done) => server.close(done)));
    const port = await listenFrom(server, first, 5);
    expect(port).toBeGreaterThan(first);
    expect(port).toBeLessThan(first + 5);
  });

  it('ends with exit code 2 when the port it was given is taken', async () => {
    const port = await freePort();
    await occupy(port);
    const running = run(['--server', '--workdir=arch', `--port=${port}`]);
    expect(await running.code).toBe(2);
    expect(running.out).toEqual([]);
    expect(running.err).toEqual([
      `seefore: Port ${port} on 127.0.0.1 is already in use. Give another with --port=<number>, or leave --port out to take a free one.`,
    ]);
    expect(running.opened).toEqual([]);
  });

  it('refuses a --port that is not a port', async () => {
    for (const port of ['abc', '0', '65536', '', '80.5', '-1', '1e3']) {
      const running = run(['--server', '--workdir=arch', `--port=${port}`]);
      expect(await running.code, port).toBe(2);
      expect(running.err, port).toEqual([
        `seefore: \`--port\` needs a whole number from 1 to 65535, as in --port=4173, but got \`${port}\`.`,
        'Run `seefore --help` to see how it is used.',
      ]);
    }
    const bare = run(['--server', '--port']);
    expect(await bare.code).toBe(2);
    expect(bare.err[0]).toBe('seefore: `--port` needs a number, as in --port=4173.');
  });

  it('ends with exit code 2 when there is no source directory, and says how to show one below', async () => {
    const running = run(['--server']);
    expect(await running.code).toBe(2);
    expect(running.err).toEqual([
      `seefore: There is no seefore.yaml in \`${root}\` or in any folder above it, so there is no source directory to show. There is one below it. To show it, run: seefore --server --workdir=arch`,
    ]);
  });

  it('ends with exit code 2 when its page is missing', async () => {
    const running = run(['--server', '--workdir=arch'], { home: join(root, 'nowhere') });
    expect(await running.code).toBe(2);
    expect(running.err).toEqual([
      `seefore: The page of the viewer is missing, so there is nothing to serve. There is no \`index.html\` in \`${join(root, 'nowhere', 'viewer')}\`. Install seefore again.`,
    ]);
  });

  it('ends with exit code 2 when the part that lays the pictures out is missing', async () => {
    write({ 'index.html': '<!doctype html><p>the page</p>' }, 'bare/viewer');
    const running = run(['--server', '--workdir=arch'], { home: join(root, 'bare') });
    expect(await running.code).toBe(2);
    expect(running.err).toEqual([
      `seefore: The part that lays the pictures out, \`layout-worker.cjs\`, is missing from \`${join(root, 'bare')}\`. Install seefore again.`,
    ]);
  });

  it('refuses a command or --json with --server, and its options without it', async () => {
    const cases: [string[], string][] = [
      [['--server', 'check'], '`--server` runs on its own and takes no command or name, but got `check`. Use --workdir=<directory> to say where to look.'],
      [['--server', '--full'], '`--full` is an option of `seefore check` and `seefore list` only.'],
      [['--server', '--require-names'], '`--require-names` is an option of `seefore check` only.'],
      [['check', '--port=4173'], '`--port` is an option of `seefore --server` only.'],
      [['list', '--no-open'], '`--no-open` is an option of `seefore --server` only.'],
    ];
    for (const [args, message] of cases) {
      const running = run(args);
      expect(await running.code, args.join(' ')).toBe(2);
      expect(running.err[0], args.join(' ')).toBe(`seefore: ${message}`);
    }
    const json = run(['--server', '--json']);
    expect(await json.code).toBe(2);
    expect(JSON.parse(json.out.join('\n'))).toEqual({ error: { code: 'usage', message: '`--json` is not an option of `seefore --server`.' } });
  });
});

describe('the built command', () => {
  const built = join(dist, 'seefore.cjs');

  /** Starts the built command as a person would, and waits for the address it prints. */
  async function started(args: string[]) {
    const child = spawn(process.execPath, [built, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
    cleanups.push(() => child.kill('SIGKILL'));
    return { child, exited, out: () => out, err: () => err };
  }

  beforeEach(() => write(EXAMPLE));

  it('serves the page beside it and the state, and stops when asked', { timeout: SLOW }, async () => {
    const port = await freePort();
    const running = await started(['--server', '--no-open', '--workdir=arch', `--port=${port}`]);
    await waitFor(() => running.out().includes('Press Ctrl+C to stop.'));
    expect(running.out()).toBe(
      `seefore is showing Shop at http://127.0.0.1:${port}/\nIt follows the files in ${join(root, 'arch')} as they change. Press Ctrl+C to stop.\n`,
    );
    const index = await get(port, '/');
    expect(index.status).toBe(200);
    expect(index.body).toBe(readFileSync(join(dist, 'viewer', 'index.html'), 'utf8'));
    for (const file of readdirSync(join(dist, 'viewer'))) expect((await get(port, `/${file}`)).status, file).toBe(200);
    const state = JSON.parse((await get(port, '/api/state')).body) as ViewerState;
    expect(state.name).toBe('Shop');
    expect(state.records).toBe(Object.keys(EXAMPLE).length - 1);
    // A picture laid out in the worker thread, with a boundary inside a boundary.
    const answer = JSON.parse((await get(port, `/api/pictures/${state.revision}/component~shop`)).body) as PictureAnswer;
    expect(answer.view.boundaries.map((boundary) => [boundary.id, boundary.boundary])).toEqual([
      ['order-api', 'shop'],
      ['shop', undefined],
    ]);
    if ('failed' in answer.picture) throw new Error(answer.picture.failed.message);
    expect(answer.picture.boundaries.map((boundary) => boundary.id)).toEqual(['order-api', 'shop']);

    running.child.kill('SIGTERM');
    expect(await running.exited).toBe(0);
    expect(running.err()).toBe('');
  });

  it('ends with exit code 2 when its port is taken', { timeout: SLOW }, async () => {
    const port = await freePort();
    await occupy(port);
    const running = await started(['--server', '--workdir=arch', `--port=${port}`]);
    expect(await running.exited).toBe(2);
    expect(running.out()).toBe('');
    expect(running.err()).toContain(`seefore: Port ${port} on 127.0.0.1 is already in use.`);
  });

  it('comes with the notices of the libraries built into it, and of ELK, which is installed beside it', () => {
    const notices = readFileSync(join(dist, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    expect(notices).toContain('elkjs 0.12.1, the Eclipse Layout Kernel for JavaScript');
    expect(notices).toContain('Licence: EPL-2.0 (Eclipse Public License 2.0)');
    expect(notices).toContain('Its source: https://github.com/kieler/elkjs');
    expect(notices).toContain('# Eclipse Public License - v 2.0');
    for (const library of ['yaml', 'zod', 'react', 'react-dom']) expect(notices).toMatch(new RegExp(`^${library} \\d+\\.\\d+\\.\\d+$`, 'm'));
    expect(notices).toMatch(/^In: the command$/m);
    expect(notices).toMatch(/^In: the page$/m);
  });

  it('carries no copy of ELK: it is a dependency, installed beside', () => {
    const files = [built, join(dist, 'layout-worker.cjs'), ...readdirSync(join(dist, 'viewer')).map((file) => join(dist, 'viewer', file))];
    for (const file of files.filter((path) => existsSync(path))) {
      expect(readFileSync(file, 'utf8').includes('org.eclipse.elk.alg.layered'), file).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string>; files: string[] };
    expect(manifest.dependencies['elkjs']).toBe('0.12.1');
    expect(manifest.files).toEqual(['dist']);
  });
});
