import type { LegendKey, View } from '@seefore/core';
import { namesIn } from './flow.ts';
import { holds, litByLegend } from './light.ts';
import type { Pointed } from './light.ts';

/**
 * The words of the reading line: what the reader points at, focuses or has chosen, said on one
 * line under the counts at reading size, whatever the zoom. A picture zoomed out draws no words,
 * so they come here. Each is made from the view alone, whole: the line cuts what does not fit.
 */

/** How many names of an arrow's connections the line gives before it says how many more there are. */
export const READING_NAMES = 3;

/** What each line of the legend lights, in the words the reading line says it with. */
const LIGHTS: Readonly<Record<LegendKey, string>> = {
  person: 'every person',
  'system-scope': 'this system',
  'system-scope-external': 'this system',
  system: 'every other system',
  'system-external': 'every external system',
  app: 'every app',
  store: 'every store',
  'queue-or-topic': 'every queue and topic',
  infrastructure: 'every piece of infrastructure that has a box',
  boundary: 'the boundary',
  arrow: 'every arrow',
  'arrow-many': 'every arrow for several connections',
  route: 'every arrow with a route',
  'route-only': 'every arrow that passes through a thing in brackets',
  opened: 'every arrow with a ring before its head',
  'opened-some': 'every arrow that says on how many the far side opened the channel',
  only: 'every “only …”',
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

/** A box, or the boundary: its name, its kind line and its own `only`, as `Relay [App: service · Rust]`. */
function boxWords(view: View, id: string): string {
  const box = view.boxes.find((each) => each.id === id);
  if (box === undefined) return view.boundary?.id === id ? view.boundary.title : '';
  return [box.name, box.line, ...(box.only === undefined ? [] : [`only ${box.only}`])].join(' ');
}

/**
 * An arrow: its two ends, the names of its connections up to `READING_NAMES` and then how many
 * more, its route with the brackets as its label has them, when its connections are there, who
 * opened the channel, and its technology, as `Fan app → Shop API: Calls the backend · via
 * Content delivery network, Load balancer · [HTTPS, JSON]`.
 */
function arrowWords(view: View, id: string): string {
  const arrow = view.arrows.find((each) => each.id === id);
  if (arrow === undefined) return '';
  const names = namesIn(view);
  const shown = arrow.names.length <= READING_NAMES ? arrow.names : [...arrow.names.slice(0, READING_NAMES), `+ ${arrow.names.length - READING_NAMES} more`];
  const opened = arrow.opened === undefined ? undefined : arrow.opened.all ? 'the far side opened the channel' : arrow.opened.line;
  const parts = [shown.join('; '), arrow.route?.line, arrow.only?.line, opened, arrow.technology.length > 0 ? `[${arrow.technology.join(', ')}]` : undefined];
  return `${names.get(arrow.from) ?? arrow.from} → ${names.get(arrow.to) ?? arrow.to}: ${parts.filter((part) => part !== undefined && part !== '').join(' · ')}`;
}

/** A thing passed through, from the list under the legend: its name as the list has it, and how many of the view's connections pass through it. */
function passedWords(view: View, id: string): string {
  const passed = view.passed.find((each) => each.id === id);
  if (passed === undefined) return '';
  const n = passed.connections.length;
  return `${passed.conditions.length === 0 ? passed.name : `(${passed.name})`}: ${n} of this view's ${n === 1 ? 'connections passes' : 'connections pass'} through it`;
}

/** A line of the legend: what it lights, and how much of the picture that is. */
function legendWords(view: View, key: LegendKey): string {
  if (key === 'boundary') return `Lights the boundary of ${view.boundary?.name ?? 'the system'}`;
  const lit = litByLegend(view, key);
  const boundary = view.boundary !== undefined && lit.boxes.has(view.boundary.id);
  const boxes = lit.boxes.size - (boundary ? 1 : 0);
  const parts = [
    ...(boxes > 0 ? [count(boxes, 'box', 'boxes')] : []),
    ...(boundary ? ['the boundary'] : []),
    ...(lit.arrows.size > 0 ? [count(lit.arrows.size, 'arrow', 'arrows')] : []),
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
