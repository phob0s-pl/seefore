import type { LegendKey, View, ViewerState } from '@seefore/core';
import { namesIn } from './flow.ts';
import { holds, litByLegend } from './light.ts';
import type { Pointed } from './light.ts';
import { indexOf, kindOf, nameOf, ownOnly, technologiesOf, technologyNames } from './records.ts';

/**
 * The words of the reading line: what the reader points at, focuses or has chosen, said on one
 * line under the counts at reading size, whatever the zoom. A picture zoomed out draws no words,
 * so they come here. Each is made from the view alone, whole: the line cuts what does not fit,
 * and unfolds it for the keyboard's focus and a tap. The names an arrow of many connections
 * leaves out are on its panel, which a click, a tap, or Enter or Space on it opens.
 */

/** How many names of an arrow's connections the line gives before it says how many more there are. */
export const READING_NAMES = 3;

/** What each line of the legend lights, in the words the reading line says it with: each names the shapes it lights, and no others. */
const LIGHTS: Readonly<Record<LegendKey, string>> = {
  person: 'every person',
  'system-scope': 'this system',
  'system-scope-external': 'this system',
  system: 'every other system that is not external',
  'system-external': 'every external system',
  app: 'every app',
  store: 'every store that is not a queue or a topic',
  'queue-or-topic': 'every queue and topic',
  component: 'every component',
  infrastructure: 'every piece of infrastructure that has a box',
  scope: 'the chosen box',
  boundary: 'the boundary',
  'boundary-app': 'the boundary of each app',
  arrow: 'every arrow',
  'arrow-many': 'every arrow for several connections',
  route: 'every arrow with a route',
  'route-only': 'every arrow and box whose connections pass through a thing in brackets, and each such thing in the list',
  opened: 'every arrow with a ring before its head',
  'opened-some': 'every arrow that says on how many the far side opened the channel',
  only: 'every box, boundary and arrow that has an “only …” line',
  loop: 'every box whose copies act on each other',
  passing: 'every box that connections pass through',
  kept: 'every app that keeps stores',
};

/** How many of a thing, in words: `1 box`, `3 boxes`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Parts of a list in words: `a`, `a and b`, `a, b and c`. */
function listed(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A box, or a boundary: its name, its kind line and its own `only`, as `Relay [App: service · Rust]`. */
function boxWords(view: View, id: string): string {
  const box = view.boxes.find((each) => each.id === id);
  if (box === undefined) return view.boundaries.find((each) => each.id === id)?.title ?? '';
  return [box.name, box.line, ...(box.only === undefined ? [] : [`only ${box.only}`])].join(' ');
}

/**
 * An arrow: its two ends, the names of its connections up to `READING_NAMES`, with how many of
 * how many when it has more, its route with the brackets as its label has them, when its
 * connections are there, who opened the channel, and its technology, as `Fan app → Shop API:
 * Calls the backend · via Content delivery network, Load balancer · [HTTPS, JSON]`, or for one of
 * five connections `Fan app → Shop API, 3 of its 5 connections: Calls; Asks; Sends`.
 */
function arrowWords(view: View, id: string): string {
  const arrow = view.arrows.find((each) => each.id === id);
  if (arrow === undefined) return '';
  const names = namesIn(view);
  const all = arrow.names.length;
  const some = all > READING_NAMES;
  const opened = arrow.opened === undefined ? undefined : arrow.opened.all ? 'the far side opened the channel' : arrow.opened.line;
  const parts = [arrow.names.slice(0, READING_NAMES).join('; '), arrow.route?.line, arrow.only?.line, opened, arrow.technology.length > 0 ? `[${arrow.technology.join(', ')}]` : undefined];
  const ends = `${names.get(arrow.from) ?? arrow.from} → ${names.get(arrow.to) ?? arrow.to}`;
  return `${ends}${some ? `, ${READING_NAMES} of its ${all} connections` : ''}: ${parts.filter((part) => part !== undefined && part !== '').join(' · ')}`;
}

/** A thing passed through, from the list under the legend: its name as the list has it, and how many of the view's connections pass through it. */
function passedWords(view: View, id: string): string {
  const passed = view.passed.find((each) => each.id === id);
  if (passed === undefined) return '';
  const n = passed.connections.length;
  return `${passed.conditions.length === 0 ? passed.name : `(${passed.name})`}: ${n} of this view's ${n === 1 ? 'connections passes' : 'connections pass'} through it`;
}

/** A line of the legend: what it lights, and how much of the picture and of the list under the legend that is. */
export function legendWords(view: View, key: LegendKey): string {
  if (key === 'boundary' || key === 'boundary-app') {
    const family = key === 'boundary' ? 'systems' : 'apps';
    const [only, ...more] = view.boundaries.filter((boundary) => boundary.family === family);
    if (only !== undefined && more.length === 0) return `Lights the boundary of ${only.name}`;
    return `Lights the boundary of each ${family === 'systems' ? 'system' : 'app'}: ${count(more.length + (only === undefined ? 0 : 1), 'boundary', 'boundaries')}`;
  }
  const lit = litByLegend(view, key);
  const held = view.boundaries.filter((boundary) => lit.boxes.has(boundary.id)).length;
  const boxes = lit.boxes.size - held;
  const parts = [
    ...(boxes > 0 ? [count(boxes, 'box', 'boxes')] : []),
    ...(held === 1 ? ['the boundary'] : held > 1 ? [count(held, 'boundary', 'boundaries')] : []),
    ...(lit.arrows.size > 0 ? [count(lit.arrows.size, 'arrow', 'arrows')] : []),
    ...(lit.passed.size > 0 ? [count(lit.passed.size, 'thing in the list', 'things in the list')] : []),
  ];
  return `Lights ${LIGHTS[key]}: ${parts.length === 0 ? 'nothing in the picture' : listed(parts)}`;
}

/** The words of the reading line for what is pointed at, focused or chosen. Empty for nothing, or for what the view does not hold. */
export function readingOf(view: View, pointed: Pointed | null): string {
  if (pointed === null || !holds(view, pointed)) return '';
  switch (pointed.kind) {
    case 'box':
      return boxWords(view, pointed.id);
    case 'arrow':
      return arrowWords(view, pointed.id);
    case 'passed':
      return passedWords(view, pointed.id);
    case 'legend':
      return legendWords(view, pointed.id);
  }
}

/**
 * A store that an app keeps, chosen in the listing or on a panel, which has no box and is drawn
 * at its app: its name, its kind line as a box would have it, its own `only`, and the app that
 * keeps it, as `Drafts [Store: files], kept by Desk`. Empty for a record that is not in the model.
 */
export function keptReading(state: ViewerState, store: string, keeper: string): string {
  const index = indexOf(state.model);
  const found = index.get(store);
  if (found === undefined) return '';
  const technologies = technologyNames(index, [...(technologiesOf(found) ?? [])].sort());
  const line = `[${kindOf(found)}${technologies.length === 0 ? '' : ` · ${technologies.join(', ')}`}]`;
  const only = ownOnly(state, store);
  return `${[nameOf(index, store), line, ...(only === undefined ? [] : [`only ${only}`])].join(' ')}, kept by ${nameOf(index, keeper)}`;
}
