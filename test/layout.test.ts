import ELK from 'elkjs/lib/elk.bundled.js';
import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { viewOf } from '../src/model/view.ts';
import type { Depth } from '../src/model/view.ts';
import { layOut, nearestRoute } from '../src/ui/layout.ts';
import type { Layout } from '../src/ui/layout.ts';

// The layout of the page, run with ELK in Node on small models written inline. The bundled ELK
// is a CommonJS module that is its own default.
const elk = new ELK.default();

const person = (id: string): SourceFile => ({ path: `people/${id}.yaml`, text: `name: ${id}\n` });
const system = (id: string, external = false): SourceFile => ({ path: `systems/${id}.yaml`, text: `name: ${id}\n${external ? 'external: true\n' : ''}` });
const connection = (from: string, to: string): SourceFile => ({ path: `connections/${from}-${to}.yaml`, text: `from: ${from}\nto: ${to}\n` });
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
  person('customer'),
  system('shop'),
  system('stock'),
  system('bank', true),
  system('mail', true),
  { path: 'apps/web.yaml', text: 'name: Web\nin: shop\n' },
  connection('shop', 'customer'),
  connection('bank', 'shop'),
  connection('shop', 'stock'),
  connection('stock', 'mail'),
  connection('mail', 'customer'),
];

test('at the Systems depth the zones are columns in order, each with its band and title', async () => {
  const layout = await laidOut('systems', ...SHOP);
  const left = Math.max(centre(layout, 'customer'), centre(layout, 'bank'));
  expect(left).toBeLessThan(Math.min(centre(layout, 'shop'), centre(layout, 'stock')));
  expect(Math.max(centre(layout, 'shop'), centre(layout, 'stock'))).toBeLessThan(centre(layout, 'mail'));
  expect(layout.bands.map((band) => band.title)).toEqual(['People and callers', 'Our systems', 'External systems']);
  const [first, second, third] = layout.bands;
  expect(first && second && third && first.x + first.width <= second.x && second.x + second.width <= third.x).toBe(true);
});

test('below the Systems depth the people stand first, and there are no bands', async () => {
  const layout = await laidOut('containers', ...SHOP);
  expect(layout.bands).toEqual([]);
  const others = layout.placed.filter((each) => each.box.in === undefined && each.box.id !== 'customer');
  expect(Math.max(...others.map((each) => each.x))).toBeGreaterThan(0);
  for (const other of others) expect(placeOf(layout, 'customer')?.x).toBeLessThan(other.x);
});

test('a long column is split when the picture is too tall for the field', async () => {
  const many = people(14);
  const layout = await laidOut('systems', system('core'), system('mail', true), system('maps', true), connection('core', 'mail'), connection('core', 'maps'), ...many.map(person), ...many.map((id) => connection(id, 'core')));
  const columns = new Set(many.map((id) => placeOf(layout, id)?.x));
  expect(columns.size).toBeGreaterThan(1);
  expect(columns.size).toBeLessThanOrEqual(3);
});

test('a long column is not split when the picture is wide', async () => {
  const many = people(7);
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
  const layout = await laidOut('systems', ...chain.map((id) => system(id)), ...chain.slice(1).map((id, i) => connection(chain[i] as string, id)), ...many.map(person), ...many.map((id) => connection(id, 'a')));
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
  const layout = await laidOut('systems', system('core'), ...many.map(person), ...many.map((id) => connection(id, 'core')));
  expect(placeOf(layout, 'core')?.height).toBeGreaterThan(10 * 12);
  expect(placeOf(layout, 'person-01')?.height).toBe(84);
  const ends = many.map((id) => layout.routes.get(`${id}->core`)?.at(-1)?.y ?? 0).sort((a, b) => a - b);
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
