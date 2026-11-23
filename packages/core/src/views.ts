import { conditionsOf, keeperOf, systemOf } from './conditions.ts';
import type { Model, ModelRecord } from './model.ts';
import type { BoxFamily, BoxLook, LegendEntry, LegendKey, View, ViewArrow, ViewBoundary, ViewBox, ViewHop, ViewKind, ViewLeft, ViewOnly, ViewOpened, ViewPassed, ViewRoute } from './picture.ts';
import type { App, Component, Connection, Infrastructure, Person, Store, System } from './records.ts';
import { firstSentence } from './text.ts';

/**
 * The views of a model: for each system a context view, and for a system with parts to show a
 * container view too: an app, a store of its own, or a piece of infrastructure that a
 * connection starts or ends at. A view says which boxes it draws and how each looks, which
 * arrows join them, which connections each arrow stands for, what they pass through and when
 * they are there, what is passed through and has no box, which connections it does not draw and
 * why, and what its legend explains. It holds nothing the model does not, and no place: the
 * layout works those out.
 *
 * A store that an app keeps has no box: it is drawn at its app, as a component is. A piece of
 * infrastructure that is part of a system has a box inside that system's boundary on its
 * container view, where a connection starts or ends at it, and is drawn at its system in any
 * other view, as an app is.
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
  { key: 'route-only', text: '(Name) on a route: there only sometimes, as its own “only” says or that of what it is in, and on the way whenever it is there' },
  { key: 'opened', text: 'Ring before the head: the far side opened the channel this is sent down' },
  { key: 'opened-some', text: '“far side opened on 2 of 5”: two of the five connections say the far side opened their channel, and the others do not say' },
  {
    key: 'only',
    text: '“only …”: there only then, as the thing says, or on an arrow a part inside the box at an end; “only on 2 of 5”: two of the five have one, and nothing is said of the rest',
  },
  { key: 'loop', text: 'Copies: connections from one copy of the same thing to another' },
  { key: 'passing', text: "Passing through: how many of this view's connections pass through it" },
  { key: 'kept', text: 'Kept stores: how many stores this app keeps, drawn at it; its panel lists them' },
];

/** What the legend says of the boundary of an external system, in place of what it says of the boundary of another. */
const BOUNDARY_EXTERNAL = "Boundary: this system, which is external: somebody else's, used as it is given, with its apps and stores inside";

/** What the legend adds to what it says of the boundary when an arrow starts or ends at its edge. */
const BOUNDARY_ARROWS = '; an arrow at its edge is to or from the system itself';

/** What the boundary holds, as the legend says it, and what it says when a piece of infrastructure stands inside it too. */
const INSIDE = 'with its apps and stores inside';
const INSIDE_WITH_PIECES = 'with its apps, stores and pieces of infrastructure inside';

/**
 * A view of more boxes than this is crowded: it cannot be read as one picture. The check
 * reports it and the page draws it as a map. Chosen on the trial models, whose views have 32
 * boxes or fewer, or 56 or more.
 */
export const CROWDED_FROM = 40;

/** The kinds of store that hold messages on their way, drawn with a look of their own. */
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['queue', 'topic']);

/**
 * Every view of a model, in the order the page lists them: first each system that has parts to
 * show, with its context view and then its container view; then each other system, with its
 * context view. Each group is in order of id.
 */
export function viewsOf(model: Model): View[] {
  const index = indexOf(model);
  const followed = followedOf(model, index);
  return plannedOf(index, followed).map((planned) => viewOf(planned, index, followed));
}

/** How many boxes a view draws, with what the view is. */
export interface BoxCount {
  /** The id of the view, as `viewsOf` gives it. */
  id: string;
  kind: ViewKind;
  /** The id of the system the view is about. */
  scope: string;
  /** How many boxes it draws: as many as its `boxes` in `viewsOf`. */
  count: number;
}

/**
 * How many boxes each view of a model draws, in the order of `viewsOf`. The boxes are picked
 * by the one function that picks them for `viewsOf`, and nothing more of a view is worked out:
 * no arrow, label, route or legend. The check of a crowded view needs no more, and the views
 * themselves are made once, by whoever draws them.
 */
export function boxCountsOf(model: Model): BoxCount[] {
  const index = indexOf(model);
  return plannedOf(index, followedOf(model, index)).map(({ id, kind, system, boxes }) => ({ id, kind, scope: system.id, count: boxes.length }));
}

/** A view before it is drawn: what it is about, and which boxes it draws. */
interface Planned {
  id: string;
  kind: ViewKind;
  system: ModelRecord<System>;
  /**
   * The ids of the parts drawn inside the boundary, in a container view: its apps and stores,
   * then its pieces of infrastructure that have a box. None in a context view.
   */
  inside: string[];
  /**
   * The id of every box, in order of id. In a context view the system itself and each box
   * around it; in a container view each box inside the boundary and each box outside, and not
   * the boundary.
   */
  boxes: string[];
}

/**
 * Which views a model has, in the order of `viewsOf`, and which boxes each draws. This is the
 * one place that says which boxes a view has: the views are drawn from it, and the check of a
 * crowded view counts from it.
 */
function plannedOf(index: Index, followed: readonly Followed[]): Planned[] {
  const boxed = boxedPieces(index, followed);
  const shown = withPartsOf(index, boxed);
  const planned: Planned[] = [];
  const later: Planned[] = [];
  for (const system of index.model.systems) {
    const scope = system.id;
    // The boxes around a system are the same in both its views.
    const around = [...neighboursOf(scope, followed)];
    const context: Planned = { id: `${scope}.context`, kind: 'context', system, inside: [], boxes: [scope, ...around].sort() };
    if (!shown.has(scope)) {
      later.push(context);
      continue;
    }
    // A piece of infrastructure in the system has a box only where a connection starts or ends at it,
    // one whose other end can be followed, and which this view then draws.
    const pieces = (index.piecesIn.get(scope) ?? []).filter((piece) => boxed.has(piece));
    const inside = [...(index.partsIn.get(scope) ?? []), ...pieces];
    planned.push(context, { id: `${scope}.containers`, kind: 'containers', system, inside, boxes: [...inside, ...around].sort() });
  }
  return [...planned, ...later];
}

/**
 * The ids of the systems that have parts to show, and so a container view: an app, a store of
 * its own, or a piece of infrastructure that a connection starts or ends at. A system whose
 * only parts are pieces that connections pass through has none: its container view would be
 * empty. The listing asks this too, so that it and the views agree.
 */
export function systemsWithParts(model: Model): Set<string> {
  const index = indexOf(model);
  return withPartsOf(index, boxedPieces(index, followedOf(model, index)));
}

/** Each connection with its ends followed. */
function followedOf(model: Model, index: Index): Followed[] {
  return model.connections.map((connection) => ({ connection, from: follow(connection.from, index), to: follow(connection.to, index) }));
}

/**
 * The pieces of infrastructure in a system that its container view draws as a box: those a
 * connection starts or ends at whose two ends can both be followed. One that connections only
 * pass through has no box.
 */
function boxedPieces(index: Index, followed: readonly Followed[]): Set<string> {
  const pieces = new Set([...index.piecesIn.values()].flat());
  const boxed = new Set<string>();
  for (const { connection, from, to } of followed) {
    if (from === undefined || to === undefined) continue;
    for (const end of [connection.from, connection.to]) if (pieces.has(end)) boxed.add(end);
  }
  return boxed;
}

/** The systems that have an app, a store of their own, or a piece of infrastructure with a box. */
function withPartsOf(index: Index, boxed: ReadonlySet<string>): Set<string> {
  const shown = new Set(index.partsIn.keys());
  for (const [system, pieces] of index.piecesIn) if (pieces.some((piece) => boxed.has(piece))) shown.add(system);
  return new Set(index.model.systems.map((system) => system.id).filter((id) => shown.has(id)));
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
  model: Model;
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
  /** The ids of the apps and stores in each system, by the system's id, in order of id. A store that an app keeps is not among them. */
  partsIn: Map<string, string[]>;
  /** The ids of the stores each app keeps, by the app's id, in order of id. */
  kept: Map<string, string[]>;
  /** The ids of the pieces of infrastructure in each system, by the system's id, in order of id. */
  piecesIn: Map<string, string[]>;
}

/** Looks the model up once. */
function indexOf(model: Model): Index {
  const systems = byId(model.systems);
  const partsIn = new Map<string, string[]>();
  const kept = new Map<string, string[]>();
  const piecesIn = new Map<string, string[]>();
  const add = (into: Map<string, string[]>, at: string, id: string) => into.set(at, [...(into.get(at) ?? []), id]);
  for (const app of model.apps) add(partsIn, app.in, app.id);
  for (const store of model.stores) {
    const keeper = keeperOf(model, store.id);
    if (keeper === undefined) add(partsIn, store.in, store.id);
    else add(kept, keeper, store.id);
  }
  for (const piece of model.infrastructure) if (piece.in !== undefined && systems.has(piece.in)) add(piecesIn, piece.in, piece.id);
  for (const ids of [...partsIn.values(), ...kept.values(), ...piecesIn.values()]) ids.sort();
  const elements = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure];
  return {
    model,
    people: byId(model.people),
    systems,
    apps: byId(model.apps),
    stores: byId(model.stores),
    components: byId(model.components),
    infrastructure: byId(model.infrastructure),
    technologies: new Map(model.technologies.map((technology) => [technology.id, technology.name])),
    names: new Map(elements.flat().map((record) => [record.id, record.name])),
    partsIn,
    kept,
    piecesIn,
  };
}

/** Records by their ids. */
function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

/** Where an end of a connection belongs, followed through what it is in. */
interface End {
  /** The person, the system or the piece of infrastructure in no system it is, or the system it is in. */
  top: string;
  /**
   * What it is drawn as in a container view of its system: the app or the store it is, the app a
   * component is in or that keeps a store, or the piece of infrastructure it is. Missing for a
   * person, a system or a piece of infrastructure in no system.
   */
  part?: string;
}

/** A connection with each of its ends followed, or nothing for an end that cannot be. */
interface Followed {
  connection: ModelRecord<Connection>;
  from: End | undefined;
  to: End | undefined;
}

/**
 * Where a record belongs: the person, the system or the piece of infrastructure in no system it
 * is, or the system it is in and what it is drawn as there. A store that an app keeps is drawn
 * as that app. Nothing when it, or anything it is in, is a record with an error in its file,
 * since such a record is not in the model, nor when its `in` names a record of a kind it cannot
 * be in, which the check reports.
 */
function follow(id: string, index: Index): End | undefined {
  const piece = index.infrastructure.get(id);
  if (index.people.has(id) || index.systems.has(id) || (piece !== undefined && piece.in === undefined)) return { top: id };
  const part = drawnAs(id, index);
  const system = part === undefined ? undefined : systemOf(index.model, part);
  return part === undefined || system === undefined ? undefined : { top: system, part };
}

/**
 * What a part of a system is drawn as in its container view: an app or a store in a system, or
 * a piece of infrastructure in one, as itself; a component as its app; a store that an app keeps
 * as that app. Nothing when its `in`, or that of its app, names no record of the kind it may be
 * in, or a record with an error in its file.
 */
function drawnAs(id: string, index: Index): string | undefined {
  const isSystem = (at: string | undefined) => at !== undefined && index.systems.has(at);
  const inSystem = (app: string | undefined) => (app !== undefined && isSystem(index.apps.get(app)?.in) ? app : undefined);
  const piece = index.infrastructure.get(id);
  if (piece !== undefined) return isSystem(piece.in) ? id : undefined;
  const component = index.components.get(id);
  if (component !== undefined) return inSystem(component.in);
  const store = index.stores.get(id);
  if (store !== undefined) return index.systems.has(store.in) ? id : inSystem(keeperOf(index.model, id));
  return inSystem(id);
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

/** The view of one kind about a system, drawn from the boxes it was planned with. */
function viewOf(planned: Planned, index: Index, followed: readonly Followed[]): View {
  const { kind, system, inside, boxes } = planned;
  const scope = system.id;
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
      ...(record.only === undefined ? {} : { only: record.only }),
      ...(record.description === undefined ? {} : { sentence: firstSentence(record.description) }),
      scope: id === scope,
      inside: kind === 'containers' && ours.has(id),
      loops: sorted.loops.get(id) ?? [],
      within: sorted.within.get(id) ?? [],
      passing: passing.boxes.get(id) ?? [],
      // An app is a box only in the container view of its system, where its kept stores are drawn at it.
      kept: record.family === 'apps' ? (index.kept.get(id) ?? []) : [],
    };
  });
  const arrows = [...sorted.bundles.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, bundle]) => arrowOf(id, bundle, frame, index));
  const line = systemLine(system);
  // The system's own `only` stands after its kind line, as a box has it under its own.
  const only = ownOnly(scope, index);
  const title = `${system.name} ${line}${only === undefined ? '' : ` only ${only}`}`;
  const boundary = kind === 'containers' ? { id: scope, name: system.name, line, ...(only === undefined ? {} : { only }), title } : undefined;
  return {
    id: planned.id,
    kind,
    scope,
    title: `${kind === 'context' ? 'Context view' : 'Container view'}: ${system.name}`,
    boxes: viewBoxes,
    ...(boundary === undefined ? {} : { boundary }),
    arrows,
    left: sorted.left,
    legend: legendOf(viewBoxes, boundary, arrows, passing.passed, system),
    passed: passing.passed,
  };
}

/**
 * The connections of a model that none of its views draws: not as an arrow, not inside a box,
 * and not between its copies. A view is about a system, and draws a connection only where an
 * end of it is in that system and both ends can be drawn. So a connection between things that
 * are in no system, such as a person and a piece of infrastructure in no system, is in no
 * picture, even where a view draws both as neighbours of its system and counts it as left out;
 * and so is one to a record with an error in its file. One that has an end in a system, a piece
 * of infrastructure in it and a store that an app keeps among them, and whose other end can be
 * drawn, is in that system's views. Worked out from what the views draw. In order of id.
 */
export function connectionsInNoView(model: Model, views: readonly View[]): string[] {
  const drawn = new Set<string>();
  for (const view of views) {
    for (const arrow of view.arrows) for (const id of arrow.connections) drawn.add(id);
    for (const box of view.boxes) for (const id of [...box.loops, ...box.within]) drawn.add(id);
  }
  return inOrder(model.connections.map((connection) => connection.id).filter((id) => !drawn.has(id)));
}

/** Each person, other system and piece of infrastructure in no system with a connection to the system or to anything in it. */
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
    passed: inOrder(apart.keys()).map((id): ViewPassed => {
      const found = apart.get(id);
      return {
        id,
        name: index.names.get(id) ?? id,
        // The same words said again by what it is in are one condition.
        conditions: [...new Set(conditionsOf(index.model, id).map((condition) => condition.only))],
        own: index.infrastructure.has(id) && systemOf(index.model, id) === frame.scope,
        connections: inOrder(found?.connections ?? []),
        arrows: inOrder(found?.arrows ?? []),
      };
    }),
  };
}

/** The words of a record's own `only`, or nothing when it has none of its own, or is not in the model. */
function ownOnly(id: string, index: Index): string | undefined {
  const [first] = conditionsOf(index.model, id);
  return first?.from === id ? first.only : undefined;
}

/**
 * A thing on a route, by its name, in brackets when it has a condition: its own `only`, or one
 * it has from what it is in. So taking out an `only` that only says again what the thing is in
 * says changes nothing here. Something whose file has an error is named by its id, and has no
 * condition the model knows of.
 */
function hopOf(id: string, index: Index): ViewHop {
  return { name: index.names.get(id) ?? id, bracketed: conditionsOf(index.model, id).length > 0 };
}

/** Ids in order, character by character. */
function inOrder(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * One arrow: the connections between the two drawn records themselves first, then the others,
 * each in order of id; a text for each; the technologies, when every connection names the
 * same ones; what they pass through at this level, when any does; when they are there, when any
 * is under a condition that no box of the view says; and whether the far side opened their
 * channel, when any says so.
 */
function arrowOf(id: string, bundle: Bundle, frame: Frame, index: Index): ViewArrow {
  const connections = [...bundle.own, ...bundle.others];
  // A hop drawn as either end of the arrow is passed inside that end, which this level does not show.
  const atEnd = (hop: string) => {
    const place = hopPlace(hop, frame, index);
    return place === bundle.from || place === bundle.to;
  };
  const routes = connections.map((connection) => (connection.via ?? []).filter((hop) => !atEnd(hop)));
  const route = routeOf(routes, (hop) => hopOf(hop, index));
  // A condition whose record the view draws, as a box or as the boundary, is said there. One from a
  // record it does not draw, such as a component inside the box at an end, is said by nothing else.
  // The same words had twice, said again lower down, are one condition.
  const unshown = (connection: ModelRecord<Connection>) => [
    ...new Set(
      conditionsOf(index.model, connection.id)
        .filter((condition) => !frame.drawn.has(condition.from))
        .map((condition) => condition.only),
    ),
  ];
  const only = onlyOf(connections.map(unshown));
  const opened = openedOf(connections);
  return {
    id,
    from: bundle.from,
    to: bundle.to,
    connections: connections.map((connection) => connection.id),
    names: connections.map((connection) => connection.name ?? UNNAMED_CONNECTION),
    technology: sharedTechnology(connections, index.technologies),
    ...(route === undefined ? {} : { route }),
    ...(only === undefined ? {} : { only }),
    ...(opened === undefined ? {} : { opened }),
  };
}

/**
 * When the connections of an arrow are there, given for each the words of the conditions that
 * no box of the view says: its own `only`, and those it has from a record the view does not
 * draw, such as a component inside the box at an end. The words, when every one has the same
 * such conditions, as the line `only in the hosted edition`; else on how many have one: `only on
 * 2 of 5`. That says nothing of the others, which may be under a
 * condition that a box says. Nothing when none has one.
 */
function onlyOf(words: readonly (readonly string[])[]): ViewOnly | undefined {
  const count = words.filter((each) => each.length > 0).length;
  if (count === 0) return undefined;
  const all = count === words.length;
  const first = words[0];
  // The same conditions on every connection are given in words, two of them with a semicolon
  // between: one connection under two conditions would else read `only on 1 of 1`.
  if (all && first !== undefined && words.every((each) => each.length === first.length && each.every((word, at) => word === first[at]))) {
    const said = first.join('; ');
    return { count, all, words: said, line: `only ${said}` };
  }
  return { count, all, line: `only on ${count} of ${words.length}` };
}

/**
 * Whether the connections of an arrow travel down a channel the far side opened: on every one,
 * which the arrow shows with a ring, or on how many say so, as the line `far side opened on 2 of
 * 5`. A connection that does not say `opens: to` claims nothing: nobody may have said. Nothing
 * when none says it.
 */
function openedOf(connections: readonly Connection[]): ViewOpened | undefined {
  const count = connections.filter((connection) => connection.opens === 'to').length;
  if (count === 0) return undefined;
  const all = count === connections.length;
  return { count, all, ...(all ? {} : { line: `far side opened on ${count} of ${connections.length}` }) };
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
 * says on how many: `via on 2 of 5`. `hopOf` says how each hop is named, and whether it stands
 * in brackets, which a hop does when it has a condition: `via (Office proxy), HTTPS proxy`.
 * Nothing when no connection passes through anything at this level.
 */
function routeOf(routes: readonly (readonly string[])[], hopOf: (hop: string) => ViewHop): ViewRoute | undefined {
  const count = routes.filter((route) => route.length > 0).length;
  if (count === 0) return undefined;
  const [first = []] = routes;
  const same = count === routes.length && routes.every((route) => route.join(' ') === first.join(' '));
  const hops = same ? first.map(hopOf) : [];
  return {
    count,
    hops,
    bracketed: hops.some((hop) => hop.bracketed),
    line: hops.length > 0 ? `via ${hops.map(hopText).join(', ')}` : `via on ${count} of ${routes.length}`,
  };
}

/** A thing on a route as the route line writes it: its name, in brackets when it has a condition. */
function hopText(hop: ViewHop): string {
  return hop.bracketed ? `(${hop.name})` : hop.name;
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
  /** The words of its own `only`. */
  only: string | undefined;
  description: string | undefined;
}

/**
 * What a box says of the person, the system, the app, the store or the piece of infrastructure
 * with this id, in a view about the system `scope`. An external system looks like one also
 * when the view is about it.
 */
function recordOf(id: string, scope: string, index: Index): Described {
  const only = ownOnly(id, index);
  const person = index.people.get(id);
  if (person) return { family: 'people', look: 'person', name: person.name, line: '[Person]', only, description: person.description };
  const system = index.systems.get(id);
  if (system) {
    const look = system.external === true ? 'system-external' : id === scope ? 'system-scope' : 'system';
    return { family: 'systems', look, name: system.name, line: systemLine(system), only, description: system.description };
  }
  const app = index.apps.get(id);
  if (app) return { family: 'apps', look: 'app', name: app.name, line: kindLine('App', app.kind, app.technology, index.technologies), only, description: app.description };
  const store = index.stores.get(id);
  if (store) {
    const look = store.kind !== undefined && MESSAGE_KINDS.has(store.kind) ? 'queue-or-topic' : 'store';
    return { family: 'stores', look, name: store.name, line: kindLine('Store', store.kind, store.technology, index.technologies), only, description: store.description };
  }
  const piece = index.infrastructure.get(id);
  if (piece) {
    const line = kindLine('Infrastructure', undefined, piece.technology, index.technologies);
    return { family: 'infrastructure', look: 'infrastructure', name: piece.name, line, only, description: piece.description };
  }
  // A box is made only for an end that was followed, which is one of the five.
  throw new Error(`No person, system, app, store or piece of infrastructure has the id ${id}.`);
}

/**
 * The legend of a view: what it draws, and no more, in the legend's order. An external system
 * in scope is drawn with the outline of an external system and the thicker line of the system
 * in scope, and the legend explains both. The boundary says when it is an external system's,
 * that it holds pieces of infrastructure when one stands inside it, and what an arrow at its
 * edge means when the view draws one. A thing in brackets is explained where a route line names
 * one, or the list of what is passed through. The `only` line is explained where a box, the
 * boundary or an arrow has one.
 */
function legendOf(boxes: readonly ViewBox[], drawnBoundary: ViewBoundary | undefined, arrows: readonly ViewArrow[], passed: readonly ViewPassed[], scope: ModelRecord<System>): LegendEntry[] {
  const boundary = drawnBoundary !== undefined;
  const drawn = new Set<LegendKey>();
  if (drawnBoundary?.only !== undefined) drawn.add('only');
  for (const box of boxes) {
    drawn.add(box.look);
    if (box.scope && box.look === 'system-external') drawn.add('system-scope-external');
    if (box.loops.length > 0) drawn.add('loop');
    if (box.passing.length > 0) drawn.add('passing');
    if (box.kept.length > 0) drawn.add('kept');
    if (box.only !== undefined) drawn.add('only');
  }
  if (boundary) drawn.add('boundary');
  if (arrows.length > 0) drawn.add('arrow');
  if (arrows.some((arrow) => arrow.connections.length > 1)) drawn.add('arrow-many');
  if (arrows.some((arrow) => arrow.route !== undefined)) drawn.add('route');
  if (arrows.some((arrow) => arrow.route?.bracketed === true) || passed.some((each) => each.conditions.length > 0)) drawn.add('route-only');
  if (arrows.some((arrow) => arrow.opened?.all === true)) drawn.add('opened');
  if (arrows.some((arrow) => arrow.opened?.all === false)) drawn.add('opened-some');
  if (arrows.some((arrow) => arrow.only !== undefined)) drawn.add('only');
  const atEdge = boundary && arrows.some((arrow) => arrow.from === scope.id || arrow.to === scope.id);
  const pieces = boxes.some((box) => box.inside && box.family === 'infrastructure');
  const boundaryText = (text: string) => `${(scope.external === true ? BOUNDARY_EXTERNAL : text).replace(INSIDE, pieces ? INSIDE_WITH_PIECES : INSIDE)}${atEdge ? BOUNDARY_ARROWS : ''}`;
  return LEGEND.filter((entry) => drawn.has(entry.key)).map(({ key, text }) => ({ key, text: key === 'boundary' ? boundaryText(text) : text }));
}
