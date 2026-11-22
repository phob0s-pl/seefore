import type { Model, ModelRecord } from './model.ts';
import type { BoxFamily, LegendEntry, LegendKey, View, ViewArrow, ViewBox, ViewKind, ViewLeft } from './picture.ts';
import type { App, Component, Connection, Person, Store, System } from './records.ts';
import { firstSentence } from './text.ts';

/**
 * The views of a model: for each system a context view, and for a system with an app or a
 * store a container view too. A view says which boxes it draws, which arrows join them and
 * which connections each arrow stands for, which connections it does not draw and why, and
 * what its legend explains. It holds nothing the model does not, and no place: the layout
 * works those out.
 */

/** What an arrow says for a connection that has no name. */
export const UNNAMED_CONNECTION = 'Unnamed connection';

/** What the legend can say, in the order it says it. A view takes those it draws. */
const LEGEND: readonly LegendEntry[] = [
  { key: 'person', text: 'Person: a role that uses the software, runs it or takes part' },
  { key: 'system-scope', text: 'This system: what the view is about' },
  { key: 'system', text: "Other system: software seen as one thing, ours or somebody else's" },
  { key: 'app', text: 'App: something that runs code' },
  { key: 'store', text: 'Store: something that holds data' },
  { key: 'boundary', text: 'Boundary: this system, with its apps and stores inside' },
  { key: 'arrow', text: 'Arrow: from the one that acts to the one it acts on' },
  { key: 'arrow-many', text: 'Arrow for several connections: each line of its label names one' },
  { key: 'loop', text: 'Copies: connections from one copy of the same thing to another' },
];

/** What the legend says of the boundary when an arrow starts or ends at its edge. */
const BOUNDARY_WITH_ARROWS = 'Boundary: this system, with its apps and stores inside; an arrow at its edge is to or from the system itself';

/** The legend's key for a box of each family, but for the system a context view is about. */
const KEYS: Readonly<Record<BoxFamily, LegendKey>> = { people: 'person', systems: 'system', apps: 'app', stores: 'store' };

/**
 * Every view of a model, in the order the page lists them: first each system that has an app
 * or a store, with its context view and then its container view; then each other system, with
 * its context view. Each group is in order of id.
 */
export function viewsOf(model: Model): View[] {
  const index = indexOf(model);
  const followed = model.connections.map((connection) => ({ connection, from: follow(connection.from, index), to: follow(connection.to, index) }));
  const withParts = model.systems.filter((system) => index.partsIn.has(system.id));
  const others = model.systems.filter((system) => !index.partsIn.has(system.id));
  return [
    ...withParts.flatMap((system) => [viewOf('context', system, index, followed), viewOf('containers', system, index, followed)]),
    ...others.map((system) => viewOf('context', system, index, followed)),
  ];
}

/**
 * The line that says what an app or a store is: its word, its kind and the names of its
 * technologies in order of id, as in `[App: service · Go, PostgreSQL]`. What is not known is
 * left out: `[App · Go]`, `[App]`. A technology whose file has an error is named by its id.
 */
function kindLine(word: 'App' | 'Store', kind: string | undefined, technology: readonly string[] | undefined, names: ReadonlyMap<string, string>): string {
  const named = technologyNames(technology ?? [], names);
  return `[${word}${kind === undefined ? '' : `: ${kind}`}${named.length === 0 ? '' : ` · ${named.join(', ')}`}]`;
}

/** The model looked up by id, and what is in each system. */
interface Index {
  people: Map<string, ModelRecord<Person>>;
  systems: Map<string, ModelRecord<System>>;
  apps: Map<string, ModelRecord<App>>;
  stores: Map<string, ModelRecord<Store>>;
  components: Map<string, ModelRecord<Component>>;
  /** The name of each technology, by id. */
  technologies: Map<string, string>;
  /** The ids of the apps and stores in each system, by the system's id, in order of id. */
  partsIn: Map<string, string[]>;
}

/** Looks the model up once. */
function indexOf(model: Model): Index {
  const partsIn = new Map<string, string[]>();
  for (const part of [...model.apps, ...model.stores]) partsIn.set(part.in, [...(partsIn.get(part.in) ?? []), part.id]);
  for (const parts of partsIn.values()) parts.sort();
  return {
    people: byId(model.people),
    systems: byId(model.systems),
    apps: byId(model.apps),
    stores: byId(model.stores),
    components: byId(model.components),
    technologies: new Map(model.technologies.map((technology) => [technology.id, technology.name])),
    partsIn,
  };
}

/** Records by their ids. */
function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

/** Where an end of a connection belongs, followed through what it is in. */
interface End {
  /** The person or the system it is, or the system it is in. */
  top: string;
  /** The app or the store it is, or the app a component is in. Missing for a person or a system. */
  part?: string;
}

/** A connection with each of its ends followed, or nothing for an end that cannot be. */
interface Followed {
  connection: ModelRecord<Connection>;
  from: End | undefined;
  to: End | undefined;
}

/**
 * Where an end belongs: the person or the system it is, or the system it is in and the app or
 * the store it is or is in. Nothing when it, or anything it is in, is a record with an error in
 * its file, since such a record is not in the model.
 */
function follow(id: string, index: Index): End | undefined {
  if (index.people.has(id) || index.systems.has(id)) return { top: id };
  const component = index.components.get(id);
  const part = component === undefined ? (index.apps.get(id) ?? index.stores.get(id)) : index.apps.get(component.in);
  if (part === undefined || !index.systems.has(part.in)) return undefined;
  return { top: part.in, part: part.id };
}

/**
 * Where an end is drawn in a view about a system: the id of its box, or of the boundary. In a
 * context view at the person or the system it belongs to. In a container view a part of the
 * system at its app or store, the system itself at its boundary, and anything else at the
 * person or the system it belongs to.
 */
function placeOf(end: End, kind: ViewKind, scope: string): string {
  if (kind === 'context' || end.top !== scope) return end.top;
  return end.part ?? scope;
}

/** An arrow being gathered: the connections between the two drawn records themselves, and the others. */
interface Bundle {
  from: string;
  to: string;
  own: ModelRecord<Connection>[];
  others: ModelRecord<Connection>[];
}

/** What a view does with the connections it has an end of. */
interface Sorted {
  /** The arrows, by their ids. */
  bundles: Map<string, Bundle>;
  /** By the id of a box: the connections from a record to itself that are drawn as that box. */
  loops: Map<string, string[]>;
  /** By the id of a box: the connections between two records that are both drawn as that box. */
  within: Map<string, string[]>;
  left: ViewLeft;
}

/** What a view is, for sorting its connections. */
interface Frame {
  kind: ViewKind;
  scope: string;
  /** The ids of what stands for the system in scope: its box in a context view; its boundary, which has its id, and its parts in a container view. */
  ours: ReadonlySet<string>;
  /** The ids of every box, and of the system in scope. */
  drawn: ReadonlySet<string>;
}

/** The view of one kind about a system. */
function viewOf(kind: ViewKind, system: ModelRecord<System>, index: Index, followed: readonly Followed[]): View {
  const scope = system.id;
  const inside = kind === 'containers' ? (index.partsIn.get(scope) ?? []) : [];
  const boxes = [...(kind === 'context' ? [scope] : inside), ...neighboursOf(scope, followed)].sort();
  const ours = new Set([scope, ...inside]);
  const sorted = sortedFor(followed, { kind, scope, ours, drawn: new Set([scope, ...boxes]) });

  const viewBoxes = boxes.map((id): ViewBox => {
    const record = recordOf(id, index);
    return {
      id,
      family: record.family,
      name: record.name,
      line: record.line,
      ...(record.description === undefined ? {} : { sentence: firstSentence(record.description) }),
      scope: id === scope,
      inside: kind === 'containers' && ours.has(id),
      loops: sorted.loops.get(id) ?? [],
      within: sorted.within.get(id) ?? [],
    };
  });
  const arrows = [...sorted.bundles.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, bundle]) => arrowOf(id, bundle, index));
  const boundary = kind === 'containers' ? { id: scope, name: system.name, title: `${system.name} [System]` } : undefined;
  return {
    id: `${scope}.${kind}`,
    kind,
    scope,
    title: `${kind === 'context' ? 'Context view' : 'Container view'}: ${system.name}`,
    boxes: viewBoxes,
    ...(boundary === undefined ? {} : { boundary }),
    arrows,
    left: sorted.left,
    legend: legendOf(viewBoxes, boundary !== undefined, arrows, scope),
  };
}

/** Each person and other system with a connection to the system or to anything in it. */
function neighboursOf(scope: string, followed: readonly Followed[]): Set<string> {
  const neighbours = new Set<string>();
  for (const { from, to } of followed) {
    if (from?.top === scope && to !== undefined && to.top !== scope) neighbours.add(to.top);
    if (to?.top === scope && from !== undefined && from.top !== scope) neighbours.add(from.top);
  }
  return neighbours;
}

/**
 * What a view does with each connection, in order of id. One with both ends drawn at one box is
 * a mark on that box when it is from a record to itself, one copy acting on another, and a line
 * in its panel when it joins two records drawn as that box. One between two boxes is an arrow
 * when either stands for the system in scope, and is left out when both stand outside it. One
 * with an end in the system in scope and the other in a record with an error, or inside one, is
 * left out too. One between a box outside the system and such a record is not counted, since
 * nothing says that record is in the system. Any other is not the view's.
 */
function sortedFor(followed: readonly Followed[], frame: Frame): Sorted {
  const sorted: Sorted = { bundles: new Map(), loops: new Map(), within: new Map(), left: { outside: [], broken: [] } };
  const at = (end: End | undefined): string | undefined => {
    const place = end === undefined ? undefined : placeOf(end, frame.kind, frame.scope);
    return place !== undefined && frame.drawn.has(place) ? place : undefined;
  };
  for (const { connection, from, to } of followed) {
    const start = at(from);
    const end = at(to);
    if (start === undefined || end === undefined) {
      // An end in the system is always drawn, and so is anything that can be followed from it: the other end cannot be.
      if (from?.top === frame.scope || to?.top === frame.scope) sorted.left.broken.push(connection.id);
    } else if (start === end) {
      // The system to itself is at its own boundary in a container view, which has no box to mark: its context view marks it.
      const marks = connection.from === connection.to ? sorted.loops : sorted.within;
      marks.set(start, [...(marks.get(start) ?? []), connection.id]);
    } else if (frame.ours.has(start) || frame.ours.has(end)) {
      const id = `${start}~${end}`;
      const bundle = sorted.bundles.get(id) ?? { from: start, to: end, own: [], others: [] };
      (connection.from === start && connection.to === end ? bundle.own : bundle.others).push(connection);
      sorted.bundles.set(id, bundle);
    } else {
      sorted.left.outside.push(connection.id);
    }
  }
  return sorted;
}

/**
 * One arrow: the connections between the two drawn records themselves first, then the others,
 * each in order of id; a text for each; and the technologies, when every connection names the
 * same ones.
 */
function arrowOf(id: string, bundle: Bundle, index: Index): ViewArrow {
  const connections = [...bundle.own, ...bundle.others];
  return {
    id,
    from: bundle.from,
    to: bundle.to,
    connections: connections.map((connection) => connection.id),
    names: connections.map((connection) => connection.name ?? UNNAMED_CONNECTION),
    technology: sharedTechnology(connections, index.technologies),
  };
}

/**
 * The names of the technologies an arrow stands under: those of its connections when each names
 * the same ones, in order of id. None when they differ, or when one names none, so that an
 * arrow never says a connection is carried in what it is not.
 */
function sharedTechnology(connections: readonly ModelRecord<Connection>[], names: ReadonlyMap<string, string>): string[] {
  const sets = connections.map((connection) => [...(connection.technology ?? [])].sort().join(' '));
  const first = connections[0]?.technology;
  if (first === undefined || sets.some((set) => set !== sets[0])) return [];
  return technologyNames(first, names);
}

/** The names of technologies, in order of their ids. One whose file has an error is named by its id. */
function technologyNames(ids: readonly string[], names: ReadonlyMap<string, string>): string[] {
  return [...ids].sort().map((id) => names.get(id) ?? id);
}

/** What a box says of the record it stands for. */
interface Described {
  family: BoxFamily;
  name: string;
  line: string;
  description: string | undefined;
}

/** What a box says of the person, the system, the app or the store with this id. */
function recordOf(id: string, index: Index): Described {
  const person = index.people.get(id);
  if (person) return { family: 'people', name: person.name, line: '[Person]', description: person.description };
  const system = index.systems.get(id);
  if (system) return { family: 'systems', name: system.name, line: '[System]', description: system.description };
  const app = index.apps.get(id);
  if (app) return { family: 'apps', name: app.name, line: kindLine('App', app.kind, app.technology, index.technologies), description: app.description };
  const store = index.stores.get(id);
  if (store) return { family: 'stores', name: store.name, line: kindLine('Store', store.kind, store.technology, index.technologies), description: store.description };
  // A box is made only for an end that was followed, which is one of the four.
  throw new Error(`No person, system, app or store has the id ${id}.`);
}

/**
 * The legend of a view: what it draws, and no more, in the legend's order. The boundary says
 * what an arrow at its edge means when the view draws one.
 */
function legendOf(boxes: readonly ViewBox[], boundary: boolean, arrows: readonly ViewArrow[], scope: string): LegendEntry[] {
  const drawn = new Set<LegendKey>();
  for (const box of boxes) {
    drawn.add(box.scope ? 'system-scope' : KEYS[box.family]);
    if (box.loops.length > 0) drawn.add('loop');
  }
  if (boundary) drawn.add('boundary');
  if (arrows.length > 0) drawn.add('arrow');
  if (arrows.some((arrow) => arrow.connections.length > 1)) drawn.add('arrow-many');
  const atEdge = boundary && arrows.some((arrow) => arrow.from === scope || arrow.to === scope);
  return LEGEND.filter((entry) => drawn.has(entry.key)).map(({ key, text }) => ({ key, text: key === 'boundary' && atEdge ? BOUNDARY_WITH_ARROWS : text }));
}
