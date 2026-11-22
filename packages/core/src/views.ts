import type { Model, ModelRecord } from './model.ts';
import type { BoxFamily, BoxLook, LegendEntry, LegendKey, View, ViewArrow, ViewBox, ViewKind, ViewLeft, ViewPassed, ViewRoute } from './picture.ts';
import type { App, Component, Connection, Infrastructure, Person, Store, System } from './records.ts';
import { firstSentence } from './text.ts';

/**
 * The views of a model: for each system a context view, and for a system with an app or a
 * store a container view too. A view says which boxes it draws and how each looks, which
 * arrows join them, which connections each arrow stands for and what they pass through, what is
 * passed through and has no box, which connections it does not draw and why, and what its
 * legend explains. It holds nothing the model does not, and no place: the layout works those out.
 */

/** What an arrow says for a connection that has no name. */
export const UNNAMED_CONNECTION = 'Unnamed connection';

/** What the legend can say, in the order it says it. A view takes those it draws. */
const LEGEND: readonly LegendEntry[] = [
  { key: 'person', text: 'Person: a role that uses the software, runs it or takes part' },
  { key: 'system-scope', text: 'This system: what the view is about' },
  { key: 'system-scope-external', text: 'This system, which is external: what the view is about' },
  { key: 'system', text: "Other system: software seen as one thing, ours or somebody else's" },
  { key: 'system-external', text: "External system: somebody else's, used as it is given" },
  { key: 'app', text: 'App: something that runs code' },
  { key: 'store', text: 'Store: something that holds data' },
  { key: 'queue-or-topic', text: 'Queue or topic: a store that holds messages on their way' },
  { key: 'infrastructure', text: 'Infrastructure: passes exchanges on, such as a proxy' },
  { key: 'boundary', text: 'Boundary: this system, with its apps and stores inside' },
  { key: 'arrow', text: 'Arrow: from the one that acts to the one it acts on' },
  { key: 'arrow-many', text: 'Arrow for several connections: each line of its label names one' },
  { key: 'route', text: 'Route: what the connections pass through, in order; “via on 2 of 5” when they differ' },
  { key: 'loop', text: 'Copies: connections from one copy of the same thing to another' },
  { key: 'passing', text: "Passing through: how many of this view's connections pass through it" },
];

/** What the legend says of the boundary of an external system, in place of what it says of the boundary of another. */
const BOUNDARY_EXTERNAL = "Boundary: this system, which is external: somebody else's, used as it is given, with its apps and stores inside";

/** What the legend adds to what it says of the boundary when an arrow starts or ends at its edge. */
const BOUNDARY_ARROWS = '; an arrow at its edge is to or from the system itself';

/** The kinds of store that hold messages on their way, drawn with a look of their own. */
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['queue', 'topic']);

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
 * The line that says what a box is: its word, its kind and the names of its technologies in
 * order of id, as in `[App: service · Go, PostgreSQL]`. What is not known is left out:
 * `[App · Go]`, `[App]`. A technology whose file has an error is named by its id.
 */
function kindLine(word: 'App' | 'Store' | 'Infrastructure', kind: string | undefined, technology: readonly string[] | undefined, names: ReadonlyMap<string, string>): string {
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
  infrastructure: Map<string, ModelRecord<Infrastructure>>;
  /** The name of each technology, by id. */
  technologies: Map<string, string>;
  /** The name of each person, system, app, store, component and piece of infrastructure, by id. */
  names: Map<string, string>;
  /** The ids of the apps and stores in each system, by the system's id, in order of id. */
  partsIn: Map<string, string[]>;
}

/** Looks the model up once. */
function indexOf(model: Model): Index {
  const partsIn = new Map<string, string[]>();
  for (const part of [...model.apps, ...model.stores]) partsIn.set(part.in, [...(partsIn.get(part.in) ?? []), part.id]);
  for (const parts of partsIn.values()) parts.sort();
  const elements = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure];
  return {
    people: byId(model.people),
    systems: byId(model.systems),
    apps: byId(model.apps),
    stores: byId(model.stores),
    components: byId(model.components),
    infrastructure: byId(model.infrastructure),
    technologies: new Map(model.technologies.map((technology) => [technology.id, technology.name])),
    names: new Map(elements.flat().map((record) => [record.id, record.name])),
    partsIn,
  };
}

/** Records by their ids. */
function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

/** Where an end of a connection belongs, followed through what it is in. */
interface End {
  /** The person, the system or the piece of infrastructure it is, or the system it is in. */
  top: string;
  /** The app or the store it is, or the app a component is in. Missing for a person, a system or a piece of infrastructure. */
  part?: string;
}

/** A connection with each of its ends followed, or nothing for an end that cannot be. */
interface Followed {
  connection: ModelRecord<Connection>;
  from: End | undefined;
  to: End | undefined;
}

/**
 * Where a record belongs: the person, the system or the piece of infrastructure it is, which is
 * in nothing, or the system it is in and the app or the store it is or is in. Nothing when it,
 * or anything it is in, is a record with an error in its file, since such a record is not in
 * the model.
 */
function follow(id: string, index: Index): End | undefined {
  if (index.people.has(id) || index.systems.has(id) || index.infrastructure.has(id)) return { top: id };
  const component = index.components.get(id);
  const part = component === undefined ? (index.apps.get(id) ?? index.stores.get(id)) : index.apps.get(component.in);
  if (part === undefined || !index.systems.has(part.in)) return undefined;
  return { top: part.in, part: part.id };
}

/**
 * Where an end is drawn in a view about a system: the id of its box, or of the boundary. In a
 * context view at the person, the system or the piece of infrastructure it belongs to. In a
 * container view a part of the system at its app or store, the system itself at its boundary,
 * and anything else at what it belongs to.
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
  /** Each connection held in a box, as a mark or as a line of its panel, with that box's id. */
  inBoxes: { box: string; connection: ModelRecord<Connection> }[];
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
  const frame: Frame = { kind, scope, ours, drawn: new Set([scope, ...boxes]) };
  const sorted = sortedFor(followed, frame);
  const passing = passingOf(sorted, frame, new Set(boxes), index);

  const viewBoxes = boxes.map((id): ViewBox => {
    const record = recordOf(id, scope, index);
    return {
      id,
      family: record.family,
      look: record.look,
      name: record.name,
      line: record.line,
      ...(record.description === undefined ? {} : { sentence: firstSentence(record.description) }),
      scope: id === scope,
      inside: kind === 'containers' && ours.has(id),
      loops: sorted.loops.get(id) ?? [],
      within: sorted.within.get(id) ?? [],
      passing: passing.boxes.get(id) ?? [],
    };
  });
  const arrows = [...sorted.bundles.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, bundle]) => arrowOf(id, bundle, frame, index));
  const line = systemLine(system);
  const boundary = kind === 'containers' ? { id: scope, name: system.name, line, title: `${system.name} ${line}` } : undefined;
  return {
    id: `${scope}.${kind}`,
    kind,
    scope,
    title: `${kind === 'context' ? 'Context view' : 'Container view'}: ${system.name}`,
    boxes: viewBoxes,
    ...(boundary === undefined ? {} : { boundary }),
    arrows,
    left: sorted.left,
    legend: legendOf(viewBoxes, boundary !== undefined, arrows, system),
    passed: passing.passed,
  };
}

/**
 * The connections of a model that none of its views holds in any way: not on an arrow, not
 * inside a box or between its copies, and not counted as left out. A view is about a system
 * and holds only what it draws both ends of, or what has an end in its system, so a connection
 * between things that are in no system, such as a person and a piece of infrastructure, is in
 * a view only where both stand beside a system it is about. In order of id.
 */
export function connectionsInNoView(model: Model, views: readonly View[]): string[] {
  const held = new Set<string>();
  for (const view of views) {
    for (const arrow of view.arrows) for (const id of arrow.connections) held.add(id);
    for (const box of view.boxes) for (const id of [...box.loops, ...box.within]) held.add(id);
    for (const id of [...view.left.outside, ...view.left.broken]) held.add(id);
  }
  return inOrder(model.connections.map((connection) => connection.id).filter((id) => !held.has(id)));
}

/** Each person, other system and piece of infrastructure with a connection to the system or to anything in it. */
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
  const sorted: Sorted = { bundles: new Map(), loops: new Map(), within: new Map(), inBoxes: [], left: { outside: [], broken: [] } };
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
      // What goes on inside a box that stands outside the system in scope is not this view's to tell.
      // A person or a system outside that acts on its own copies is itself the box, and keeps its mark.
      if (!frame.ours.has(start) && !(connection.from === start && connection.to === start)) continue;
      // The system to itself is at its own boundary in a container view, which has no box to mark: its context view marks it.
      const marks = connection.from === connection.to ? sorted.loops : sorted.within;
      marks.set(start, [...(marks.get(start) ?? []), connection.id]);
      sorted.inBoxes.push({ box: start, connection });
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

/** What the connections a view holds pass through: on each box, and apart from the boxes. */
interface Passing {
  /** By the id of a box: the connections that pass through it, in order of id. */
  boxes: Map<string, string[]>;
  /** What is passed through and has no box, in order of id. */
  passed: ViewPassed[];
}

/** A connection a view holds, with where it is drawn: the ends of its arrow, or the box that holds it, and the arrow if it has one. */
interface Held {
  connection: ModelRecord<Connection>;
  from: string;
  to: string;
  arrow?: string;
}

/**
 * Where each id is drawn that `via` names on a connection the view holds: on an arrow, inside
 * a box, or between the copies of what a box stands for. One drawn as a box counts the
 * connection on that box, unless the box is an end of the connection's own arrow or the box
 * that holds it: what is passed through inside an end does not show at this level. One drawn as
 * no box, such as a piece of infrastructure that nothing in the view starts or ends at, is
 * listed with its connections and the arrows of those that have one. A connection the view
 * leaves out passes through nothing in it.
 */
function passingOf(sorted: Sorted, frame: Frame, boxes: ReadonlySet<string>, index: Index): Passing {
  const held: Held[] = [
    ...[...sorted.bundles].flatMap(([arrow, bundle]) => [...bundle.own, ...bundle.others].map((connection) => ({ connection, from: bundle.from, to: bundle.to, arrow }))),
    ...sorted.inBoxes.map(({ box, connection }) => ({ connection, from: box, to: box })),
  ];
  const onBoxes = new Map<string, Set<string>>();
  const apart = new Map<string, { connections: Set<string>; arrows: Set<string> }>();
  for (const { connection, from, to, arrow } of held) {
    for (const id of connection.via ?? []) {
      const place = hopPlace(id, frame, index);
      if (place === from || place === to) continue;
      if (place !== undefined && boxes.has(place)) {
        onBoxes.set(place, (onBoxes.get(place) ?? new Set()).add(connection.id));
      } else {
        const found = apart.get(id) ?? { connections: new Set(), arrows: new Set() };
        found.connections.add(connection.id);
        if (arrow !== undefined) found.arrows.add(arrow);
        apart.set(id, found);
      }
    }
  }
  return {
    boxes: new Map([...onBoxes].map(([box, connections]) => [box, inOrder(connections)])),
    passed: inOrder(apart.keys()).map((id) => {
      const found = apart.get(id);
      return { id, name: index.names.get(id) ?? id, connections: inOrder(found?.connections ?? []), arrows: inOrder(found?.arrows ?? []) };
    }),
  };
}

/** Ids in order, character by character. */
function inOrder(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * One arrow: the connections between the two drawn records themselves first, then the others,
 * each in order of id; a text for each; the technologies, when every connection names the
 * same ones; and what they pass through at this level, when any does.
 */
function arrowOf(id: string, bundle: Bundle, frame: Frame, index: Index): ViewArrow {
  const connections = [...bundle.own, ...bundle.others];
  // A hop drawn as either end of the arrow is passed inside that end, which this level does not show.
  const atEnd = (hop: string) => {
    const place = hopPlace(hop, frame, index);
    return place === bundle.from || place === bundle.to;
  };
  const routes = connections.map((connection) => (connection.via ?? []).filter((hop) => !atEnd(hop)));
  const route = routeOf(routes, index.names);
  return {
    id,
    from: bundle.from,
    to: bundle.to,
    connections: connections.map((connection) => connection.id),
    names: connections.map((connection) => connection.name ?? UNNAMED_CONNECTION),
    technology: sharedTechnology(connections, index.technologies),
    ...(route === undefined ? {} : { route }),
  };
}

/**
 * Where a view draws something a connection passes through: the id of its box, or of the
 * boundary, as for an end. Nothing when it is a record with an error in its file, or inside one.
 */
function hopPlace(id: string, frame: Frame, index: Index): string | undefined {
  const end = follow(id, index);
  return end === undefined ? undefined : placeOf(end, frame.kind, frame.scope);
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

/**
 * What the connections of an arrow pass through at its level, given for each the hops that are
 * not drawn as an end of the arrow: how many pass through anything, and, when every one passes
 * through the same in the same order, those names in the order of travel, as the line
 * `via Ingress, Workhorse`. When the routes differ, or only some connections have one, the line
 * says on how many: `via on 2 of 5`. Something whose file has an error is named by its id.
 * Nothing when no connection passes through anything at this level.
 */
function routeOf(routes: readonly (readonly string[])[], names: ReadonlyMap<string, string>): ViewRoute | undefined {
  const count = routes.filter((route) => route.length > 0).length;
  if (count === 0) return undefined;
  const [first = []] = routes;
  const same = count === routes.length && routes.every((route) => route.join(' ') === first.join(' '));
  const named = same ? first.map((id) => names.get(id) ?? id) : [];
  return { count, names: named, line: named.length > 0 ? `via ${named.join(', ')}` : `via on ${count} of ${routes.length}` };
}

/** The names of technologies, in order of their ids. One whose file has an error is named by its id. */
function technologyNames(ids: readonly string[], names: ReadonlyMap<string, string>): string[] {
  return [...ids].sort().map((id) => names.get(id) ?? id);
}

/** The kind line of a system: `[System]`, or `[System: external]` for somebody else's. */
function systemLine(system: System): string {
  return system.external === true ? '[System: external]' : '[System]';
}

/** What a box says of the record it stands for, and how it looks. */
interface Described {
  family: BoxFamily;
  look: BoxLook;
  name: string;
  line: string;
  description: string | undefined;
}

/**
 * What a box says of the person, the system, the app, the store or the piece of infrastructure
 * with this id, in a view about the system `scope`. An external system looks like one also
 * when the view is about it.
 */
function recordOf(id: string, scope: string, index: Index): Described {
  const person = index.people.get(id);
  if (person) return { family: 'people', look: 'person', name: person.name, line: '[Person]', description: person.description };
  const system = index.systems.get(id);
  if (system) {
    const look = system.external === true ? 'system-external' : id === scope ? 'system-scope' : 'system';
    return { family: 'systems', look, name: system.name, line: systemLine(system), description: system.description };
  }
  const app = index.apps.get(id);
  if (app) return { family: 'apps', look: 'app', name: app.name, line: kindLine('App', app.kind, app.technology, index.technologies), description: app.description };
  const store = index.stores.get(id);
  if (store) {
    const look = store.kind !== undefined && MESSAGE_KINDS.has(store.kind) ? 'queue-or-topic' : 'store';
    return { family: 'stores', look, name: store.name, line: kindLine('Store', store.kind, store.technology, index.technologies), description: store.description };
  }
  const piece = index.infrastructure.get(id);
  if (piece) {
    const line = kindLine('Infrastructure', undefined, piece.technology, index.technologies);
    return { family: 'infrastructure', look: 'infrastructure', name: piece.name, line, description: piece.description };
  }
  // A box is made only for an end that was followed, which is one of the five.
  throw new Error(`No person, system, app, store or piece of infrastructure has the id ${id}.`);
}

/**
 * The legend of a view: what it draws, and no more, in the legend's order. An external system
 * in scope is drawn with the outline of an external system and the thicker line of the system
 * in scope, and the legend explains both. The boundary says when it is an external system's,
 * and what an arrow at its edge means when the view draws one.
 */
function legendOf(boxes: readonly ViewBox[], boundary: boolean, arrows: readonly ViewArrow[], scope: ModelRecord<System>): LegendEntry[] {
  const drawn = new Set<LegendKey>();
  for (const box of boxes) {
    drawn.add(box.look);
    if (box.scope && box.look === 'system-external') drawn.add('system-scope-external');
    if (box.loops.length > 0) drawn.add('loop');
    if (box.passing.length > 0) drawn.add('passing');
  }
  if (boundary) drawn.add('boundary');
  if (arrows.length > 0) drawn.add('arrow');
  if (arrows.some((arrow) => arrow.connections.length > 1)) drawn.add('arrow-many');
  if (arrows.some((arrow) => arrow.route !== undefined)) drawn.add('route');
  const atEdge = boundary && arrows.some((arrow) => arrow.from === scope.id || arrow.to === scope.id);
  const boundaryText = (text: string) => `${scope.external === true ? BOUNDARY_EXTERNAL : text}${atEdge ? BOUNDARY_ARROWS : ''}`;
  return LEGEND.filter((entry) => drawn.has(entry.key)).map(({ key, text }) => ({ key, text: key === 'boundary' ? boundaryText(text) : text }));
}
