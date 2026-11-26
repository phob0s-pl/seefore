import ELK from 'elkjs/lib/elk.bundled.js';
import { expect, test } from 'vitest';
import { flowView } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { viewOf } from '../src/model/view.ts';
import type { Depth } from '../src/model/view.ts';
import { keeper, layOut, nearestRoute } from '../src/ui/layout.ts';
import type { Engine, Layout } from '../src/ui/layout.ts';

// The layout of the page, run with ELK in Node on small models written inline. The bundled ELK
// is a CommonJS module that is its own default.
const elk = new ELK.default();

const person = (id: string): SourceFile => ({ path: `people/${id}.yaml`, text: `name: ${id}\n` });
const system = (id: string, external = false): SourceFile => ({ path: `systems/${id}.yaml`, text: `name: ${id}\n${external ? 'external: true\n' : ''}` });
const connection = (from: string, to: string): SourceFile => ({ path: `connections/connection-${from}-${to}.yaml`, text: `from: ${from}\nto: ${to}\n` });
const people = (count: number): string[] => Array.from({ length: count }, (_, i) => `person-${String(i + 1).padStart(2, '0')}`);

async function laidOut(depth: Depth, ...files: SourceFile[]): Promise<Layout> {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...files]);
  expect(read.problems).toEqual([]);
  return layOut(viewOf(read.records, depth), depth, elk);
}
const placeOf = (layout: Layout, id: string) => layout.placed.find((each) => each.box.id === id);
const centre = (layout: Layout, id: string): number => {
  const at = placeOf(layout, id);
  return at === undefined ? Number.NaN : at.x + at.width / 2;
};

/** A shop that calls a person back and is called by a bank: left to itself, ELK would put both on its right. */
const SHOP = [
  person('person-customer'),
  system('system-shop'),
  system('system-stock'),
  system('system-bank', true),
  system('system-mail', true),
  { path: 'apps/app-web.yaml', text: 'name: Web\nin: system-shop\n' },
  connection('system-shop', 'person-customer'),
  connection('system-bank', 'system-shop'),
  connection('system-shop', 'system-stock'),
  connection('system-stock', 'system-mail'),
  connection('system-mail', 'person-customer'),
];

test('at the Systems depth the zones are columns in order, each with its band and title', async () => {
  const layout = await laidOut('systems', ...SHOP);
  const left = Math.max(centre(layout, 'person-customer'), centre(layout, 'system-bank'));
  expect(left).toBeLessThan(Math.min(centre(layout, 'system-shop'), centre(layout, 'system-stock')));
  expect(Math.max(centre(layout, 'system-shop'), centre(layout, 'system-stock'))).toBeLessThan(centre(layout, 'system-mail'));
  expect(layout.bands.map((band) => band.title)).toEqual(['People and callers', 'Our systems', 'External systems']);
  const [first, second, third] = layout.bands;
  expect(first && second && third && first.x + first.width <= second.x && second.x + second.width <= third.x).toBe(true);
});

test('below the Systems depth the people stand first, and there are no bands', async () => {
  const layout = await laidOut('containers', ...SHOP);
  expect(layout.bands).toEqual([]);
  const others = layout.placed.filter((each) => each.box.in === undefined && each.box.id !== 'person-customer');
  expect(Math.max(...others.map((each) => each.x))).toBeGreaterThan(0);
  for (const other of others) expect(placeOf(layout, 'person-customer')?.x).toBeLessThan(other.x);
});

test('a long column is split when the picture is too tall for the field', async () => {
  const many = people(14);
  const layout = await laidOut('systems', system('system-core'), system('system-mail', true), system('system-maps', true), connection('system-core', 'system-mail'), connection('system-core', 'system-maps'), ...many.map(person), ...many.map((id) => connection(id, 'system-core')));
  const columns = new Set(many.map((id) => placeOf(layout, id)?.x));
  expect(columns.size).toBeGreaterThan(1);
  expect(columns.size).toBeLessThanOrEqual(3);
});

test('a long column is not split when the picture is wide', async () => {
  const many = people(7);
  const chain = ['system-a', 'system-b', 'system-c', 'system-d', 'system-e', 'system-f'];
  const layout = await laidOut('systems', ...chain.map((id) => system(id)), ...chain.slice(1).map((id, i) => connection(chain[i] as string, id)), ...many.map(person), ...many.map((id) => connection(id, 'system-a')));
  const box = layout.bands.reduce((all, band) => ({ width: Math.max(all.width, band.x + band.width), height: band.height }), { width: 0, height: 0 });
  expect(box.width).toBeGreaterThan(box.height * 1.415);
  expect(new Set(many.map((id) => placeOf(layout, id)?.x)).size).toBe(1);
});

test('the same model gives the same places twice', async () => {
  const picture = async () => JSON.stringify(await laidOut('systems', ...SHOP), (_, value: unknown) => (value instanceof Map ? [...value] : value));
  expect(await picture()).toEqual(await picture());
});

test('a box with many lines grows taller, so that their ends stand apart; a box with one keeps its size', async () => {
  const many = people(10);
  const layout = await laidOut('systems', system('system-core'), ...many.map(person), ...many.map((id) => connection(id, 'system-core')));
  expect(placeOf(layout, 'system-core')?.height).toBeGreaterThan(10 * 12);
  expect(placeOf(layout, 'person-01')?.height).toBe(84);
  const ends = many.map((id) => layout.routes.get(`${id}->system-core`)?.at(-1)?.y ?? 0).sort((a, b) => a - b);
  for (let i = 1; i < ends.length; i++) expect((ends[i] ?? 0) - (ends[i - 1] ?? 0)).toBeGreaterThanOrEqual(12 - 0.5);
});

test('a click means the line it is nearest to, also where two lines run close', () => {
  // Two lines six apart, and a third that crosses both further on.
  const routes = new Map([
    ['upper', [{ x: 0, y: 100 }, { x: 200, y: 100 }]],
    ['lower', [{ x: 0, y: 106 }, { x: 200, y: 106 }, { x: 200, y: 300 }]],
    ['across', [{ x: 400, y: 0 }, { x: 400, y: 300 }]],
  ]);
  expect(nearestRoute(routes, { x: 50, y: 100 })).toBe('upper');
  expect(nearestRoute(routes, { x: 50, y: 102 })).toBe('upper');
  expect(nearestRoute(routes, { x: 50, y: 105 })).toBe('lower');
  // Past the end of a line, its end counts, not the line drawn further.
  expect(nearestRoute(routes, { x: 205, y: 250 })).toBe('lower');
  expect(nearestRoute(routes, { x: 395, y: 150 })).toBe('across');
  expect(nearestRoute(new Map(), { x: 0, y: 0 })).toBeUndefined();
});

test('the mouse means a line only within its reach, at its end too', () => {
  const routes = new Map([
    ['upper', [{ x: 0, y: 100 }, { x: 200, y: 100 }]],
    ['lower', [{ x: 0, y: 106 }, { x: 200, y: 106 }, { x: 200, y: 300 }]],
  ]);
  expect([nearestRoute(routes, { x: 50, y: 88 }, 12), nearestRoute(routes, { x: 50, y: 87 }, 12)]).toEqual(['upper', undefined]);
  expect([nearestRoute(routes, { x: 50, y: 118 }, 12), nearestRoute(routes, { x: 50, y: 119 }, 12)]).toEqual(['lower', undefined]);
  // Past the end of a line, the reach is round its end.
  expect([nearestRoute(routes, { x: 200, y: 312 }, 12), nearestRoute(routes, { x: 209, y: 309 }, 12)]).toEqual(['lower', undefined]);
  // Between two lines within reach of both, the nearer.
  expect(nearestRoute(routes, { x: 50, y: 104 }, 12)).toBe('lower');
});

/** An engine that counts what it is asked, and can be made to fail. */
function counting(): Engine & { asked: number; fails: boolean } {
  const engine: Engine & { asked: number; fails: boolean } = {
    asked: 0,
    fails: false,
    layout: ((...args: Parameters<Engine['layout']>) => {
      engine.asked += 1;
      return engine.fails ? Promise.reject(new Error('no layout')) : elk.layout(...args);
    }) as Engine['layout'],
  };
  return engine;
}

test('a layout is kept by its view, its depth and its shape: asked for again it is not made again, and it is there at once', async () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...SHOP]);
  const view = viewOf(read.records, 'containers');
  const engine = counting();
  const kept = keeper();
  expect(kept.get(view, 'containers')).toBeUndefined();
  const first = kept.lay(view, 'containers', engine);
  // Asked while it is being made, and by a view that reads the same: the same work.
  expect(kept.lay(viewOf(read.records, 'containers'), 'containers', engine)).toBe(first);
  const layout = await first;
  expect(engine.asked).toBe(1);
  expect(kept.get(viewOf(read.records, 'containers'), 'containers')).toBe(layout);
  expect(layout).toEqual(await layOut(view, 'containers', elk));
  // Another shape, another depth and another view are layouts of their own.
  expect(kept.get(view, 'containers', 'flow')).toBeUndefined();
  expect(await kept.lay(view, 'containers', engine, 'flow')).not.toEqual(layout);
  await kept.lay(viewOf(read.records, 'systems'), 'systems', engine);
  await kept.lay(viewOf(read.records, 'containers', 'system-shop'), 'containers', engine);
  expect(engine.asked).toBeGreaterThanOrEqual(4);
  const asked = engine.asked;
  await kept.lay(view, 'containers', engine);
  expect(engine.asked).toBe(asked);
});

test('a layout that failed is not kept, and only the last few are', async () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...SHOP]);
  const [systems, containers, components] = [viewOf(read.records, 'systems'), viewOf(read.records, 'containers'), viewOf(read.records, 'components')];
  const engine = counting();
  const kept = keeper(2);
  engine.fails = true;
  await expect(kept.lay(containers, 'containers', engine)).rejects.toThrow('no layout');
  engine.fails = false;
  const again = await kept.lay(containers, 'containers', engine);
  expect(kept.get(containers, 'containers')).toBe(again);
  // Room for two: the one asked for longest ago goes.
  await kept.lay(components, 'components', engine);
  await kept.lay(containers, 'containers', engine);
  await kept.lay(systems, 'systems', engine);
  expect([kept.get(components, 'components'), kept.get(containers, 'containers') === again, kept.get(systems, 'systems') !== undefined]).toEqual([undefined, true, true]);
});

/** A system in which one app writes a queue and a database, and another reads both. */
const WORKS: SourceFile[] = [
  system('system-works'),
  { path: 'apps/app-writer.yaml', text: 'name: Writer\nin: system-works\n' },
  { path: 'apps/app-reader.yaml', text: 'name: Reader\nin: system-works\n' },
  { path: 'stores/store-jobs.yaml', text: 'name: Jobs\nin: system-works\nkind: queue\n' },
  { path: 'stores/store-ledger.yaml', text: 'name: Ledger\nin: system-works\nkind: database\n' },
  { path: 'connections/connection-writer-puts-jobs.yaml', text: 'from: app-writer\nto: store-jobs\naccess: write\n' },
  { path: 'connections/connection-reader-takes-jobs.yaml', text: 'from: app-reader\nto: store-jobs\naccess: read\n' },
  { path: 'connections/connection-writer-keeps-ledger.yaml', text: 'from: app-writer\nto: store-ledger\naccess: write\n' },
  { path: 'connections/connection-reader-reads-ledger.yaml', text: 'from: app-reader\nto: store-ledger\naccess: read\n' },
];

test('a queue stands between the app that writes it and the app that only reads it, and a database does not', async () => {
  const layout = await laidOut('containers', ...WORKS);
  // All four stand in the one frame, so their places can be compared as they are.
  expect(centre(layout, 'app-writer')).toBeLessThan(centre(layout, 'store-jobs'));
  expect(centre(layout, 'store-jobs')).toBeLessThan(centre(layout, 'app-reader'));
  expect(centre(layout, 'app-reader')).toBeLessThan(centre(layout, 'store-ledger'));
});

test('the line of a reader is still drawn from the reader to the queue, where its head stands', async () => {
  const layout = await laidOut('containers', ...WORKS);
  const frame = placeOf(layout, 'system-works');
  const reader = placeOf(layout, 'app-reader');
  const jobs = placeOf(layout, 'store-jobs');
  const route = layout.routes.get('app-reader->store-jobs') ?? [];
  expect(frame && reader && jobs && route.length >= 2).toBe(true);
  if (!frame || !reader || !jobs) return;
  // The route starts on the reader's left side and ends on the queue's right side.
  expect(route[0]?.x).toBeCloseTo(frame.x + reader.x, 3);
  expect(route.at(-1)?.x).toBeCloseTo(frame.x + jobs.x + jobs.width, 3);
  // The line of the writer is as it was: from the writer's right side to the queue's left.
  expect(layout.routes.get('app-writer->store-jobs')?.at(-1)?.x).toBeCloseTo(frame.x + jobs.x, 3);
});

test('a person who reads a queue stays on the left, and that line is not turned round', async () => {
  const layout = await laidOut('containers', ...WORKS, person('person-ops'), { path: 'connections/connection-ops-watches-jobs.yaml', text: 'from: person-ops\nto: store-jobs\naccess: read\n' });
  const frame = placeOf(layout, 'system-works');
  const ops = placeOf(layout, 'person-ops');
  const jobs = placeOf(layout, 'store-jobs');
  expect(frame && ops && jobs).toBeTruthy();
  if (!frame || !ops || !jobs) return;
  expect(ops.x + ops.width).toBeLessThan(frame.x);
  // The line runs straight on from the person's right side to the queue's left side, and never
  // past the queue.
  const route = layout.routes.get('person-ops->store-jobs') ?? [];
  expect(route[0]?.x).toBeCloseTo(ops.x + ops.width, 3);
  expect(route.at(-1)?.x).toBeCloseTo(frame.x + jobs.x, 3);
  expect(Math.max(...route.map((point) => point.x))).toBeLessThanOrEqual(frame.x + jobs.x + 0.001);
  // The app that reads the queue is still laid out after it.
  expect(centre(layout, 'store-jobs')).toBeLessThan(centre(layout, 'app-reader'));
});

/** A flow that keeps the data it names in the ledger, and reads the archive naming none. */
const keeps = (id: string, data: string[]): SourceFile => ({
  path: `flows/${id}.yaml`,
  text: `name: ${id}\nstarts: A clock\nends: It is kept\nfeature: feature-keeping\nsteps:\n  - id: keeps\n    does: connection-writer-keeps-ledger\n    data: [${data.join(', ')}]\n  - id: looks\n    does: connection-writer-reads-archive\n`,
});

/** A writer that keeps a ledger and reads an archive, and three flows: one keeps two things in the ledger, two keep one thing each. */
const KEEPS: SourceFile[] = [
  system('system-works'),
  { path: 'apps/app-writer.yaml', text: 'name: Writer\nin: system-works\n' },
  { path: 'stores/store-ledger.yaml', text: 'name: Ledger\nin: system-works\nkind: database\n' },
  { path: 'stores/store-archive.yaml', text: 'name: Archive\nin: system-works\nkind: database\n' },
  { path: 'connections/connection-writer-keeps-ledger.yaml', text: 'from: app-writer\nto: store-ledger\nname: Keeps the ledger\naccess: write\n' },
  { path: 'connections/connection-writer-reads-archive.yaml', text: 'from: app-writer\nto: store-archive\nname: Reads the archive\naccess: read\n' },
  { path: 'features/feature-keeping.yaml', text: 'name: Keeping\n' },
  { path: 'data/data-entry.yaml', text: 'name: Entry\n' },
  { path: 'data/data-total.yaml', text: 'name: Total\n' },
  { path: 'data/data-note.yaml', text: 'name: Note\n' },
  keeps('flow-two', ['data-entry', 'data-total']),
  keeps('flow-one', ['data-entry']),
  keeps('flow-another-one', ['data-note']),
];

test("a store's box is 24 pixels taller for each row it holds, and one with none keeps its size", async () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...KEEPS]);
  expect(read.problems).toEqual([]);
  const sizes = async (flow: string) => {
    const layout = await layOut(flowView(read.records, flow), 'components', elk, 'flow');
    return [placeOf(layout, 'store-ledger')?.height, placeOf(layout, 'store-archive')?.height, placeOf(layout, 'app-writer')?.height];
  };
  expect(await sizes('flow-two')).toEqual([84 + 2 * 24, 84, 84]);
  expect(await sizes('flow-one')).toEqual([84 + 24, 84, 84]);
});

test('two views of a flow that differ in their rows alone are two layouts, and two alike in rows share one', async () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...KEEPS]);
  const [two, one, another] = ['flow-two', 'flow-one', 'flow-another-one'].map((id) => flowView(read.records, id));
  if (two === undefined || one === undefined || another === undefined) throw new Error('no view');
  // The same boxes and lines; only the number of rows in the ledger differs.
  const without = (view: typeof two) => ({ ...view, boxes: view.boxes.map(({ rows: _rows, ...box }) => box) });
  expect(without(two)).toEqual(without(one));
  const engine = counting();
  const kept = keeper();
  const first = await kept.lay(two, 'components', engine, 'flow');
  expect(kept.get(one, 'components', 'flow')).toBeUndefined();
  const second = await kept.lay(one, 'components', engine, 'flow');
  expect(engine.asked).toBe(2);
  expect(second).not.toEqual(first);
  // Another flow that keeps other data, one row in the same box, finds the layout kept: a row's words are not in it.
  expect(kept.get(another, 'components', 'flow')).toBe(second);
});

test("a flow's own diagram is read top to bottom, with tight gaps, and the model's stays as it is", async () => {
  const files = [system('system-works'), ...WORKS.slice(1)];
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Test\n' }, ...files]);
  const view = viewOf(read.records, 'containers');
  const across = await layOut(view, 'containers', elk);
  const down = await layOut(view, 'containers', elk, 'flow');
  const at = (layout: Layout, id: string) => layout.placed.find((each) => each.box.id === id);
  // Left to right, the writer stands left of the queue; top to bottom, above it.
  expect((at(across, 'app-writer')?.x ?? 0) + (at(across, 'app-writer')?.width ?? 0)).toBeLessThan(at(across, 'store-jobs')?.x ?? 0);
  expect((at(down, 'app-writer')?.y ?? 0) + (at(down, 'app-writer')?.height ?? 0)).toBeLessThan(at(down, 'store-jobs')?.y ?? 0);
  // And it is narrower than it was wide: the frame's own size says so.
  expect(at(down, 'system-works')?.width ?? 0).toBeLessThan(at(across, 'system-works')?.width ?? 0);
  expect(await layOut(view, 'containers', elk)).toEqual(across);
});
