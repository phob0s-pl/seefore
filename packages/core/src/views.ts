import { conditionsOf } from './conditions.ts';
import type { Condition } from './conditions.ts';
import { isId } from './id.ts';
import type { Model, ModelRecord } from './model.ts';
import type {
  BoxFamily,
  BoxLook,
  Depth,
  LegendEntry,
  LegendKey,
  Scope,
  Setting,
  View,
  ViewArrow,
  ViewBoundary,
  ViewBox,
  ViewHop,
  ViewLeft,
  ViewOnly,
  ViewOpened,
  ViewPassed,
  ViewRoute,
} from './picture.ts';
import type { App, Component, Connection, Infrastructure, Person, Store, System } from './records.ts';
import { firstSentence } from './text.ts';

/**
 * The view of a setting of a model: a depth, which says how far boxes are opened, and a scope,
 * which is everything or one box with its neighbours. A view says which boxes it draws, which
 * are open as boundaries with what they hold inside, how each looks, which arrows join them,
 * which connections each arrow stands for, what they pass through and when they are there, what
 * is passed through and has no box, which connections it does not draw and why, and what its
 * legend explains. It holds nothing the model does not, and no place: the layout works those out.
 *
 * Every thing has a path from the top: its system, its app, itself. A person and a piece of
 * infrastructure in no system are their own whole path, and a store that an app keeps ends its
 * path at that app, so that it is drawn at the app, box or boundary, and has no box of its own.
 * An end is drawn at the deepest thing on its path that the view draws; an end outside the
 * chosen box at its neighbour, the first thing on its path that is not on the chosen box's.
 *
 * One system at System depth is the context view of stage 5, and one system at Container depth
 * its container view: they draw what they drew.
 */

/** What an arrow says for a connection that has no name. */
export const UNNAMED_CONNECTION = 'Unnamed connection';

/** The depths, from the shallowest. */
export const DEPTHS: readonly Depth[] = ['system', 'container', 'component'];

/** The word for each depth, as a title and the control say it. */
export const DEPTH_WORDS: Readonly<Record<Depth, string>> = { system: 'System', container: 'Container', component: 'Component' };

/** What the title calls the scope when it is everything. */
export const EVERYTHING = 'Everything';

/** What stands between the depth and the scope in the key of a setting. An id cannot hold it. */
const KEY_SEPARATOR = '~';

/** What the legend can say, in the order it says it. A view takes those it draws. */
const LEGEND: readonly LegendEntry[] = [
  { key: 'person', text: 'Person: a role that uses the software, runs it or takes part' },
  { key: 'system-scope', text: 'This system: what the view is about' },
  { key: 'system-scope-external', text: 'This system, which is external: what the view is about' },
  { key: 'scope', text: 'This box: what the view is about' },
  { key: 'system', text: "Other system: software seen as one thing, ours or somebody else's" },
  { key: 'system-external', text: "External system: somebody else's, used as it is given" },
  { key: 'app', text: 'App: something that runs code' },
  { key: 'store', text: 'Store: something that holds data' },
  { key: 'queue-or-topic', text: 'Queue or topic: a store that holds messages on their way' },
  { key: 'component', text: 'Component: a part of an app' },
  { key: 'infrastructure', text: 'Infrastructure: passes exchanges on, such as a proxy' },
  { key: 'boundary', text: 'Boundary: this system, with its apps and stores inside' },
  { key: 'boundary-app', text: 'Boundary: an app, with its components inside' },
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

/**
 * What the legend says of a system where no system is the other one: with everything as the
 * scope, and with a chosen box that is not a system.
 */
const SYSTEM_ANY = "System: software seen as one thing, ours or somebody else's";

/** What the legend says of the boundary of an external system the view is about, in place of what it says of the boundary of another. */
const BOUNDARY_EXTERNAL = "Boundary: this system, which is external: somebody else's, used as it is given, with its apps and stores inside";

/** What the legend says of the boundary of a system that is not the chosen box, as each system is with everything as the scope. */
const BOUNDARY_ANY = 'Boundary: a system, with its apps and stores inside';

/** What the legend adds to what it says of the boundary when an arrow starts or ends at its edge. */
const BOUNDARY_ARROWS = '; an arrow at its edge is to or from the system itself';

/** What the boundary holds, as the legend says it, and what it says when a piece of infrastructure stands inside it too. */
const INSIDE = 'with its apps and stores inside';
const INSIDE_WITH_PIECES = 'with its apps, stores and pieces of infrastructure inside';

/** The kinds of store that hold messages on their way, drawn with a look of their own. */
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['queue', 'topic']);

/**
 * The key of a setting, which the address and the server name it by: the depth alone for
 * everything, as `system`, and else the depth and the id of the chosen box, as `component~relay`.
 */
export function keyOf(setting: Setting): string {
  return setting.scope === null ? setting.depth : `${setting.depth}${KEY_SEPARATOR}${setting.scope}`;
}

/** The setting a key names, or nothing when the key is of no known form. Whether the model has such a setting is another question. */
export function settingOf(key: string): Setting | undefined {
  const [depth, scope, ...more] = key.split(KEY_SEPARATOR);
  if (more.length > 0 || !DEPTHS.includes(depth as Depth)) return undefined;
  if (scope === undefined) return { depth: depth as Depth, scope: null };
  return isId(scope) ? { depth: depth as Depth, scope } : undefined;
}

/**
 * A model looked up once, for the views of many settings: the page and the server ask for one
 * after another, and the trial for every one.
 */
export interface Views {
  /** What can be the scope, each with the shallowest depth it has, in the order of the listing. */
  readonly scopes: readonly Scope[];
  /** The view of one setting, or nothing when the scope is not a box that can be one or does not have that depth. */
  viewOf(setting: Setting): View | undefined;
  /**
   * The settings whose pictures this one takes its turns from, nearest first: the same scope one
   * depth up, and so on up, as far as the shallowest depth the scope has. One system at
   * Container depth stops the line: it keeps the turns of its own walk, since that picture is
   * the container view of stage 5 and must not change. Nothing for a setting the model does not have.
   */
  above(setting: Setting): Setting[];
  /** Every setting the model has: everything at each depth, then each scope at each depth it has, each from the shallowest. */
  settings(): Setting[];
}

/** Looks a model up once, for the views of many settings. */
export function viewsFor(model: Model): Views {
  const index = indexOf(model);
  const scopes = scopesOf(index);
  const byScope = new Map(scopes.map((scope) => [scope.id, scope]));
  const has = (setting: Setting): boolean => {
    if (setting.scope === null) return true;
    const scope = byScope.get(setting.scope);
    return scope !== undefined && DEPTHS.indexOf(setting.depth) >= DEPTHS.indexOf(scope.depth);
  };
  return {
    scopes,
    viewOf: (setting) => (has(setting) ? viewIn(index, setting) : undefined),
    above: (setting) => {
      if (!has(setting)) return [];
      const shallowest = setting.scope === null ? 0 : DEPTHS.indexOf(byScope.get(setting.scope)?.depth ?? 'system');
      const line: Setting[] = [];
      for (let level = DEPTHS.indexOf(setting.depth); level > shallowest; level--) {
        // One system at Container depth is the container view of stage 5, whose picture must not change.
        if (setting.scope !== null && index.systems.has(setting.scope) && DEPTHS[level] === 'container') break;
        line.push({ depth: DEPTHS[level - 1] ?? 'system', scope: setting.scope });
      }
      return line;
    },
    settings: () => [
      ...DEPTHS.map((depth): Setting => ({ depth, scope: null })),
      ...scopes.flatMap((scope) => DEPTHS.slice(DEPTHS.indexOf(scope.depth)).map((depth): Setting => ({ depth, scope: scope.id }))),
    ],
  };
}

/** The view of one setting of a model, or nothing when the scope is not a box that can be one or does not have that depth. */
export function viewOf(model: Model, setting: Setting): View | undefined {
  return viewsFor(model).viewOf(setting);
}

/**
 * The views of stage 5, in the order the sidebar lists them: for each system that has parts to
 * show, its view at System depth and then at Container depth; then each other system, at
 * System depth. Each group is in order of id. The page lists these until the controls for
 * depth and scope take the list's place.
 */
export function viewsOf(model: Model): View[] {
  const index = indexOf(model);
  const views = (system: string, depths: readonly Depth[]) => depths.flatMap((depth) => viewIn(index, { depth, scope: system }) ?? []);
  const systems = index.model.systems.map((system) => system.id);
  return [
    ...systems.filter((id) => hasParts(index, id)).flatMap((id) => views(id, ['system', 'container'])),
    ...systems.filter((id) => !hasParts(index, id)).flatMap((id) => views(id, ['system'])),
  ];
}

/**
 * The ids of the systems that have parts to show, and so open at Container depth: an app, a
 * store of its own, or a piece of infrastructure that a connection starts or ends at. A system
 * whose only parts are pieces that connections pass through stays closed. The listing asks this
 * too, so that it and the views agree.
 */
export function systemsWithParts(model: Model): Set<string> {
  const index = indexOf(model);
  return new Set(index.model.systems.map((system) => system.id).filter((id) => hasParts(index, id)));
}

/**
 * The connections of a model that no view draws: those with an end that cannot be followed,
 * since it is a record with an error in its file, or is in one, or its `in` names a record of a
 * kind it cannot be in. Everything as the scope draws every other, as an arrow, as a mark or in
 * the panel of a box. In order of id.
 */
export function connectionsInNoView(model: Model): string[] {
  const index = indexOf(model);
  return inOrder(index.followed.filter(({ from, to }) => from === undefined || to === undefined).map(({ connection }) => connection.id));
}

/**
 * The words under the title for the connections a view leaves out because both their ends stand
 * outside the chosen box, up to the link to the model: `3 connections between two boxes outside
 * the system are not drawn:`, or for a chosen box that is not a system `3 connections between two
 * of its neighbours are not drawn:`. Nothing when there are none, as with everything as the scope.
 */
export function leftOutWords(view: View): string | undefined {
  const count = view.left.outside.length;
  if (count === 0) return undefined;
  const chosen = [...view.boxes, ...view.boundaries].find((each) => each.scope);
  const between = chosen?.family === 'systems' ? 'two boxes outside the system' : 'two of its neighbours';
  return `${count} ${count === 1 ? 'connection' : 'connections'} between ${between} ${count === 1 ? 'is' : 'are'} not drawn:`;
}

/** The model looked up by id, with the path of everything that can be followed and what each box holds when it opens. */
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
  /**
   * The path of each person, system, app, store, component and piece of infrastructure that can
   * be followed: what it is in from the top, and itself. A store that an app keeps ends at that
   * app. Missing for a record that is, or is in, a record with an error in its file, and for one
   * whose `in` names a record of a kind it cannot be in.
   */
  paths: Map<string, readonly string[]>;
  /**
   * What a box holds when it opens, by its id, in order of id: a system its apps, its own stores
   * and its pieces of infrastructure that have a box; an app its components. A store that an app
   * keeps is drawn at the app, and is not held.
   */
  held: Map<string, string[]>;
  /** The ids of the stores each app keeps, by the app's id, in order of id. */
  kept: Map<string, string[]>;
  /** The pieces of infrastructure that have a box: those a connection starts or ends at whose two ends can be followed. */
  boxed: Set<string>;
  /** Each connection with the paths of its ends. */
  followed: Followed[];
  /** The conditions of a record, as `conditionsOf` gives them, worked out once for each. */
  conditions(id: string): Condition[];
}

/** A connection with the path of each of its ends, or nothing for an end that cannot be followed. */
interface Followed {
  connection: ModelRecord<Connection>;
  from: readonly string[] | undefined;
  to: readonly string[] | undefined;
}

/** Looks the model up once. */
function indexOf(model: Model): Index {
  const systems = byId(model.systems);
  const apps = byId(model.apps);
  const stores = byId(model.stores);
  const components = byId(model.components);
  const infrastructure = byId(model.infrastructure);
  const paths = new Map<string, readonly string[]>();
  for (const record of [...model.people, ...model.systems]) paths.set(record.id, [record.id]);
  const inSystem = (app: string | undefined): readonly string[] | undefined => {
    const record = app === undefined ? undefined : apps.get(app);
    return record !== undefined && systems.has(record.in) ? [record.in, record.id] : undefined;
  };
  for (const app of model.apps) {
    const path = inSystem(app.id);
    if (path !== undefined) paths.set(app.id, path);
  }
  const kept = new Map<string, string[]>();
  for (const store of model.stores) {
    // A store is in a system, or kept by the app its `in` names, and drawn at that app.
    const path = systems.has(store.in) ? [store.in, store.id] : inSystem(store.in);
    if (path !== undefined) paths.set(store.id, path);
    if (apps.has(store.in)) kept.set(store.in, [...(kept.get(store.in) ?? []), store.id]);
  }
  for (const component of model.components) {
    const app = inSystem(component.in);
    if (app !== undefined) paths.set(component.id, [...app, component.id]);
  }
  for (const piece of model.infrastructure) {
    if (piece.in === undefined) paths.set(piece.id, [piece.id]);
    else if (systems.has(piece.in)) paths.set(piece.id, [piece.in, piece.id]);
  }
  const followed = model.connections.map((connection): Followed => ({ connection, from: paths.get(connection.from), to: paths.get(connection.to) }));
  const boxed = new Set<string>();
  for (const { connection, from, to } of followed) {
    if (from === undefined || to === undefined) continue;
    for (const end of [connection.from, connection.to]) if (infrastructure.has(end)) boxed.add(end);
  }
  const held = new Map<string, string[]>();
  const hold = (at: string, id: string) => held.set(at, [...(held.get(at) ?? []), id]);
  for (const record of [...model.apps, ...model.stores, ...model.components, ...model.infrastructure]) {
    const path = paths.get(record.id);
    // A record is held by what it is in when its path ends at itself: a kept store ends at its app.
    if (path === undefined || path.length < 2 || path.at(-1) !== record.id) continue;
    if (infrastructure.has(record.id) && !boxed.has(record.id)) continue;
    hold(path.at(-2) ?? '', record.id);
  }
  for (const ids of [...held.values(), ...kept.values()]) ids.sort(byText);
  const conditions = new Map<string, Condition[]>();
  const elements = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure];
  return {
    model,
    people: byId(model.people),
    systems,
    apps,
    stores,
    components,
    infrastructure,
    technologies: new Map(model.technologies.map((technology) => [technology.id, technology.name])),
    names: new Map(elements.flat().map((record) => [record.id, record.name])),
    paths,
    held,
    kept,
    boxed,
    followed,
    conditions: (id) => {
      let found = conditions.get(id);
      if (found === undefined) {
        found = conditionsOf(model, id);
        conditions.set(id, found);
      }
      return found;
    },
  };
}

/** Records by their ids. */
function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

/** True for a system that has parts to show, and so opens at Container depth. */
function hasParts(index: Index, system: string): boolean {
  return (index.held.get(system) ?? []).length > 0;
}

/**
 * What can be the scope, in the order of the listing: the people; each system that has parts
 * to show, with its apps, each followed by its components, then its own stores, then its pieces
 * of infrastructure that have a box; the other systems; and the pieces of infrastructure in no
 * system that have a box. A store that an app keeps, a thing that connections only pass through,
 * and a record that cannot be followed are not among them.
 */
function scopesOf(index: Index): Scope[] {
  const scope = (id: string, family: BoxFamily, depth: Depth): Scope => ({ id, family, depth });
  const held = (at: string) => index.held.get(at) ?? [];
  const systems = index.model.systems.map((system) => system.id);
  const inSystem = (system: string): Scope[] => {
    const parts = held(system);
    return [
      scope(system, 'systems', 'system'),
      ...parts.filter((id) => index.apps.has(id)).flatMap((app) => [scope(app, 'apps', 'container'), ...held(app).map((id) => scope(id, 'components', 'component'))]),
      ...parts.filter((id) => index.stores.has(id)).map((id) => scope(id, 'stores', 'container')),
      ...parts.filter((id) => index.infrastructure.has(id)).map((id) => scope(id, 'infrastructure', 'container')),
    ];
  };
  return [
    ...index.model.people.map((person) => scope(person.id, 'people', 'system')),
    ...systems.filter((id) => hasParts(index, id)).flatMap(inSystem),
    ...systems.filter((id) => !hasParts(index, id)).map((id) => scope(id, 'systems', 'system')),
    ...index.model.infrastructure.filter((piece) => piece.in === undefined && index.boxed.has(piece.id)).map((piece) => scope(piece.id, 'infrastructure', 'system')),
  ];
}

/** What a view draws, and where it draws each end and each thing on a route. */
interface Drawing {
  setting: Setting;
  /** The path of the chosen box; empty for everything. */
  chosen: readonly string[];
  /** The ids of the closed boxes. */
  boxes: Set<string>;
  /** The ids of the open boxes. */
  boundaries: Set<string>;
  /** The boundary each box or boundary stands in, by its id. */
  parents: Map<string, string>;
}

/** True when a box or a boundary of the drawing has this id. */
function draws(drawing: Drawing, id: string | undefined): id is string {
  return id !== undefined && (drawing.boxes.has(id) || drawing.boundaries.has(id));
}

/** True for a path in the scope: with everything, every path; else one that passes the chosen box. */
function inScope(drawing: Drawing, path: readonly string[]): boolean {
  return drawing.setting.scope === null || path.includes(drawing.setting.scope);
}

/**
 * Where a drawing draws the thing at the end of a path, which may be no box or boundary of it.
 * A path in the scope is drawn at the deepest thing on it that the drawing opens to: from the
 * top, or from the chosen box, down through each open box. A piece of infrastructure that only
 * connections pass through stands where its system opens, and has no box. A path outside the
 * scope is drawn at its neighbour: the first thing on it that is not on the chosen box's path,
 * or, when it is a path the chosen box is in, the last thing on it.
 */
function placeOf(drawing: Drawing, path: readonly string[]): string | undefined {
  if (inScope(drawing, path)) {
    let at = drawing.setting.scope === null ? 0 : path.indexOf(drawing.setting.scope);
    while (drawing.boundaries.has(path[at] ?? '') && at + 1 < path.length) at++;
    return path[at];
  }
  const chosen = drawing.chosen;
  let at = 0;
  while (at + 1 < path.length && path[at] === chosen[at]) at++;
  return path[at];
}

/**
 * Where a drawing counts the end of a connection that neither starts nor ends in the scope: at
 * the deepest thing on its path that the drawing draws. That is where `placeOf` puts it when it
 * is a neighbour; else it may be a neighbour it is in, as the system of the chosen app is when a
 * connection is written from that system to the app. Nothing when nothing on its path is drawn.
 */
function countedAt(drawing: Drawing, path: readonly string[]): string | undefined {
  const place = placeOf(drawing, path);
  if (draws(drawing, place)) return place;
  return [...path].reverse().find((id) => draws(drawing, id));
}

/** What a setting draws: the chosen box or everything, each open as the depth says, and the chosen box's neighbours, closed. */
function drawingOf(index: Index, setting: Setting): Drawing {
  const level = DEPTHS.indexOf(setting.depth);
  const drawing: Drawing = { setting, chosen: setting.scope === null ? [] : (index.paths.get(setting.scope) ?? []), boxes: new Set(), boundaries: new Set(), parents: new Map() };
  // A system opens from Container depth and an app from Component depth, each when it holds something.
  const opens = (id: string) => (index.held.get(id) ?? []).length > 0 && (index.systems.has(id) ? level >= 1 : index.apps.has(id) && level >= 2);
  const take = (id: string, parent: string | undefined) => {
    if (parent !== undefined) drawing.parents.set(id, parent);
    if (!opens(id)) {
      drawing.boxes.add(id);
      return;
    }
    drawing.boundaries.add(id);
    for (const held of index.held.get(id) ?? []) take(held, id);
  };
  if (setting.scope === null) {
    const tops = [
      ...index.model.people.map((person) => person.id),
      ...index.model.systems.map((system) => system.id),
      ...index.model.infrastructure.filter((piece) => piece.in === undefined && index.boxed.has(piece.id)).map((piece) => piece.id),
    ];
    for (const id of tops) take(id, undefined);
    return drawing;
  }
  take(setting.scope, undefined);
  // A neighbour is the other end of a connection that has one end in the chosen box, drawn closed. Its own neighbours are not followed.
  for (const { from, to } of index.followed) {
    if (from === undefined || to === undefined || inScope(drawing, from) === inScope(drawing, to)) continue;
    const neighbour = placeOf(drawing, inScope(drawing, from) ? to : from);
    if (neighbour !== undefined) drawing.boxes.add(neighbour);
  }
  return drawing;
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
  /** By the id of a box or a boundary: the connections from a record to itself that are drawn there. */
  loops: Map<string, string[]>;
  /** By the id of a box or a boundary: the connections between two records that are both drawn there. */
  within: Map<string, string[]>;
  /** Each connection held in a box or at a boundary, as a mark or as a line of its panel, with that box's id. */
  inBoxes: { box: string; connection: ModelRecord<Connection> }[];
  left: ViewLeft;
}

/** The view of a setting the model has. */
function viewIn(index: Index, setting: Setting): View {
  const drawing = drawingOf(index, setting);
  const sorted = sortedFor(index, drawing);
  const passing = passingOf(sorted, drawing, index);
  const scope = setting.scope;
  const marks = (id: string) => ({
    loops: sorted.loops.get(id) ?? [],
    within: sorted.within.get(id) ?? [],
    passing: passing.boxes.get(id) ?? [],
    // An app carries the stores it keeps, which are drawn at it.
    kept: index.apps.has(id) ? (index.kept.get(id) ?? []) : [],
  });
  const boxes = inOrder(drawing.boxes).map((id): ViewBox => {
    const record = recordOf(id, scope, index);
    const boundary = drawing.parents.get(id);
    return {
      id,
      family: record.family,
      look: record.look,
      name: record.name,
      line: record.line,
      ...(record.only === undefined ? {} : { only: record.only }),
      ...(record.description === undefined ? {} : { sentence: firstSentence(record.description) }),
      scope: id === scope,
      ...(boundary === undefined ? {} : { boundary }),
      ...marks(id),
    };
  });
  const boundaries = inOrder(drawing.boundaries).map((id): ViewBoundary => {
    const record = recordOf(id, scope, index);
    const boundary = drawing.parents.get(id);
    // Its own `only` stands after its kind line, as a box has it under its own.
    const title = `${record.name} ${record.line}${record.only === undefined ? '' : ` only ${record.only}`}`;
    return {
      id,
      family: record.family === 'apps' ? 'apps' : 'systems',
      name: record.name,
      line: record.line,
      ...(record.only === undefined ? {} : { only: record.only }),
      title,
      ...(boundary === undefined ? {} : { boundary }),
      scope: id === scope,
      ...marks(id),
    };
  });
  const arrows = [...sorted.bundles.entries()].sort(([a], [b]) => byText(a, b)).map(([id, bundle]) => arrowOf(id, bundle, drawing, index));
  return {
    id: keyOf(setting),
    depth: setting.depth,
    scope,
    title: titleOf(setting, index),
    boxes,
    boundaries,
    arrows,
    left: sorted.left,
    legend: legendOf(boxes, boundaries, arrows, passing.passed, setting, index),
    passed: passing.passed,
  };
}

/** The word in the brackets of a kind line for each family: what the title says after the name of a chosen box that is not a system. */
const KIND_WORDS: Readonly<Record<BoxFamily, string>> = {
  people: 'Person',
  systems: 'System',
  apps: 'App',
  stores: 'Store',
  components: 'Component',
  infrastructure: 'Infrastructure',
};

/**
 * The title of a setting: the depth and the scope, as the controls say them, `Component view:
 * Everything`. One system at System depth is the context view of stage 5, and keeps its title,
 * `Context view: Shop`. A chosen box that is not a system has its kind after its name, in the
 * brackets a kind line has, `Container view: Order API [App]`: so a system and an app of one name
 * have two titles, and the title says whether the picture opens the box or stands it among its
 * neighbours.
 */
function titleOf(setting: Setting, index: Index): string {
  const { scope, depth } = setting;
  if (scope === null) return `${DEPTH_WORDS[depth]} view: ${EVERYTHING}`;
  const name = index.names.get(scope) ?? scope;
  if (index.systems.has(scope)) return depth === 'system' ? `Context view: ${name}` : `${DEPTH_WORDS[depth]} view: ${name}`;
  return `${DEPTH_WORDS[depth]} view: ${name} [${KIND_WORDS[recordOf(scope, scope, index).family]}]`;
}

/**
 * What a view does with each connection, in order of id. One with an end in the scope and the
 * other that cannot be followed is left out, as broken; one with no end in the scope and an end
 * that cannot be followed is not the view's. One with both ends drawn at one box or boundary is
 * a mark there when it is from a record to itself, one copy acting on another, and a line in its
 * panel when it joins two records drawn there. One between two drawn things is an arrow when
 * either end is in the scope, and is left out, as outside, when both are neighbours. What goes
 * on inside a neighbour is not the view's to tell: a person or a system that acts on its own
 * copies is itself the box, and keeps its mark.
 */
function sortedFor(index: Index, drawing: Drawing): Sorted {
  const sorted: Sorted = { bundles: new Map(), loops: new Map(), within: new Map(), inBoxes: [], left: { outside: [], broken: [] } };
  for (const { connection, from, to } of index.followed) {
    if (from === undefined || to === undefined) {
      if ((from !== undefined && inScope(drawing, from)) || (to !== undefined && inScope(drawing, to))) sorted.left.broken.push(connection.id);
      continue;
    }
    const ours = inScope(drawing, from) || inScope(drawing, to);
    // An end in the scope is always drawn, and so is its neighbour. Two ends outside it are each
    // taken at the deepest thing on its path that the view draws, which there may not be.
    const start = ours ? placeOf(drawing, from) : countedAt(drawing, from);
    const end = ours ? placeOf(drawing, to) : countedAt(drawing, to);
    if (!draws(drawing, start) || !draws(drawing, end)) continue;
    if (start === end) {
      if (!ours && !(connection.from === start && connection.to === start)) continue;
      const marks = connection.from === connection.to ? sorted.loops : sorted.within;
      marks.set(start, [...(marks.get(start) ?? []), connection.id]);
      sorted.inBoxes.push({ box: start, connection });
    } else if (ours) {
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

/** What the connections a view holds pass through: on each box and boundary, and apart from them. */
interface Passing {
  /** By the id of a box or a boundary: the connections that pass through it, in order of id. */
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
 * Where each id is drawn that `via` names on a connection the view holds: on an arrow, inside a
 * box, or between the copies of what a box stands for. One drawn as a box or a boundary counts
 * the connection there, unless it is an end of the connection's own arrow or what holds it: what
 * is passed through inside an end does not show at this level. One drawn as nothing, such as a
 * piece of infrastructure that nothing in the view starts or ends at, is listed with its
 * connections and the arrows of those that have one. A connection the view leaves out passes
 * through nothing in it.
 */
function passingOf(sorted: Sorted, drawing: Drawing, index: Index): Passing {
  const held: Held[] = [
    ...[...sorted.bundles].flatMap(([arrow, bundle]) => [...bundle.own, ...bundle.others].map((connection) => ({ connection, from: bundle.from, to: bundle.to, arrow }))),
    ...sorted.inBoxes.map(({ box, connection }) => ({ connection, from: box, to: box })),
  ];
  const onBoxes = new Map<string, Set<string>>();
  const apart = new Map<string, { connections: Set<string>; arrows: Set<string> }>();
  for (const { connection, from, to, arrow } of held) {
    for (const id of connection.via ?? []) {
      const place = hopPlace(id, drawing, index);
      if (place === from || place === to) continue;
      if (draws(drawing, place)) {
        onBoxes.set(place, (onBoxes.get(place) ?? new Set()).add(connection.id));
      } else {
        const found = apart.get(id) ?? { connections: new Set(), arrows: new Set() };
        found.connections.add(connection.id);
        if (arrow !== undefined) found.arrows.add(arrow);
        apart.set(id, found);
      }
    }
  }
  const scope = drawing.setting.scope;
  return {
    boxes: new Map([...onBoxes].map(([box, connections]) => [box, inOrder(connections)])),
    passed: inOrder(apart.keys()).map((id): ViewPassed => {
      const found = apart.get(id);
      return {
        id,
        name: index.names.get(id) ?? id,
        // The same words said again by what it is in are one condition.
        conditions: [...new Set(index.conditions(id).map((condition) => condition.only))],
        own: scope !== null && index.systems.has(scope) && index.infrastructure.has(id) && index.paths.get(id)?.[0] === scope,
        connections: inOrder(found?.connections ?? []),
        arrows: inOrder(found?.arrows ?? []),
      };
    }),
  };
}

/** The words of a record's own `only`, or nothing when it has none of its own, or is not in the model. */
function ownOnly(id: string, index: Index): string | undefined {
  const [first] = index.conditions(id);
  return first?.from === id ? first.only : undefined;
}

/**
 * A thing on a route, by its name, in brackets when it has a condition: its own `only`, or one
 * it has from what it is in. So taking out an `only` that only says again what the thing is in
 * says changes nothing here. Something whose file has an error is named by its id, and has no
 * condition the model knows of.
 */
function hopOf(id: string, index: Index): ViewHop {
  return { name: index.names.get(id) ?? id, bracketed: index.conditions(id).length > 0 };
}

/** Ids in order, character by character. */
function inOrder(ids: Iterable<string>): string[] {
  return [...ids].sort(byText);
}

/** Order of two ids, character by character. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One arrow: the connections between the two drawn records themselves first, then the others,
 * each in order of id; a text for each; the technologies, when every connection names the
 * same ones; what they pass through at this level, when any does; when they are there, when any
 * is under a condition that no box or boundary of the view says; and whether the far side opened
 * their channel, when any says so.
 */
function arrowOf(id: string, bundle: Bundle, drawing: Drawing, index: Index): ViewArrow {
  const connections = [...bundle.own, ...bundle.others];
  // A hop drawn as either end of the arrow is passed inside that end, which this level does not show.
  const atEnd = (hop: string) => {
    const place = hopPlace(hop, drawing, index);
    return place === bundle.from || place === bundle.to;
  };
  const routes = connections.map((connection) => (connection.via ?? []).filter((hop) => !atEnd(hop)));
  const route = routeOf(routes, (hop) => hopOf(hop, index));
  // A condition whose record the view draws, as a box or as a boundary, is said there. One from a
  // record it does not draw, such as a component inside the box at an end, is said by nothing else.
  // The same words had twice, said again lower down, are one condition.
  const unshown = (connection: ModelRecord<Connection>) => [
    ...new Set(
      index
        .conditions(connection.id)
        .filter((condition) => !draws(drawing, condition.from))
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
 * Where a view draws something a connection passes through: as for an end, at the id of a box
 * or a boundary, or at the id of what it would be drawn as were it a box. Nothing when it is a
 * record with an error in its file, or inside one.
 */
function hopPlace(id: string, drawing: Drawing, index: Index): string | undefined {
  const path = index.paths.get(id);
  return path === undefined ? undefined : placeOf(drawing, path);
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

/**
 * The line that says what a box is: its word, its kind and the names of its technologies in
 * order of id, as in `[App: service · Go, PostgreSQL]`. What is not known is left out:
 * `[App · Go]`, `[App]`. A technology whose file has an error is named by its id.
 */
function kindLine(word: 'App' | 'Store' | 'Component' | 'Infrastructure', kind: string | undefined, technology: readonly string[] | undefined, names: ReadonlyMap<string, string>): string {
  const named = technologyNames(technology ?? [], names);
  return `[${word}${kind === undefined ? '' : `: ${kind}`}${named.length === 0 ? '' : ` · ${named.join(', ')}`}]`;
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
 * What a box or a boundary says of the person, the system, the app, the store, the component or
 * the piece of infrastructure with this id, in a view whose chosen box is `scope`. An external
 * system looks like one also when it is the chosen box. A component's line names the
 * technologies its own record names, and no other.
 */
function recordOf(id: string, scope: string | null, index: Index): Described {
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
  const component = index.components.get(id);
  if (component) {
    const line = kindLine('Component', undefined, component.technology, index.technologies);
    return { family: 'components', look: 'component', name: component.name, line, only, description: component.description };
  }
  const piece = index.infrastructure.get(id);
  if (piece) {
    const line = kindLine('Infrastructure', undefined, piece.technology, index.technologies);
    return { family: 'infrastructure', look: 'infrastructure', name: piece.name, line, only, description: piece.description };
  }
  // A box is made only for a record that was followed, which is one of the six.
  throw new Error(`No person, system, app, store, component or piece of infrastructure has the id ${id}.`);
}

/**
 * The legend of a view: what it draws, and no more, in the legend's order. An external system
 * in scope is drawn with the outline of an external system and the thicker line of the system
 * in scope, and the legend explains both; a chosen box that is no system has a line of its own.
 * The boundary of the chosen system says when it is an external system's, that it holds pieces
 * of infrastructure when one stands inside it, and what an arrow at its edge means when the
 * view draws one; that of another system, as each is with everything as the scope, says the
 * same of a system. The boundary of an app has its own line. A system is the other one only
 * beside a chosen system: not with everything as the scope, nor beside a chosen box that is not
 * a system. A thing in brackets is explained where a route line names one, or the list of what
 * is passed through. The `only` line is explained where a box, a boundary or an arrow has one,
 * and each mark where a box or a boundary carries it.
 */
function legendOf(
  boxes: readonly ViewBox[],
  boundaries: readonly ViewBoundary[],
  arrows: readonly ViewArrow[],
  passed: readonly ViewPassed[],
  setting: Setting,
  index: Index,
): LegendEntry[] {
  const drawn = new Set<LegendKey>();
  const marked = (each: ViewBox | ViewBoundary) => {
    if (each.loops.length > 0) drawn.add('loop');
    if (each.passing.length > 0) drawn.add('passing');
    if (each.kept.length > 0) drawn.add('kept');
    if (each.only !== undefined) drawn.add('only');
    if (each.scope && each.family !== 'systems') drawn.add('scope');
  };
  for (const boundary of boundaries) {
    marked(boundary);
    drawn.add(boundary.family === 'apps' ? 'boundary-app' : 'boundary');
  }
  for (const box of boxes) {
    drawn.add(box.look);
    if (box.scope && box.look === 'system-external') drawn.add('system-scope-external');
    marked(box);
  }
  if (arrows.length > 0) drawn.add('arrow');
  if (arrows.some((arrow) => arrow.connections.length > 1)) drawn.add('arrow-many');
  if (arrows.some((arrow) => arrow.route !== undefined)) drawn.add('route');
  if (arrows.some((arrow) => arrow.route?.bracketed === true) || passed.some((each) => each.conditions.length > 0)) drawn.add('route-only');
  if (arrows.some((arrow) => arrow.opened?.all === true)) drawn.add('opened');
  if (arrows.some((arrow) => arrow.opened?.all === false)) drawn.add('opened-some');
  if (arrows.some((arrow) => arrow.only !== undefined)) drawn.add('only');
  const systems = new Set(boundaries.filter((boundary) => boundary.family === 'systems').map((boundary) => boundary.id));
  const atEdge = arrows.some((arrow) => systems.has(arrow.from) || systems.has(arrow.to));
  const pieces = boxes.some((box) => box.family === 'infrastructure' && systems.has(box.boundary ?? ''));
  // Only the chosen box opens among the boxes of a view about one box, so a system's boundary there is the chosen system's.
  const chosen = setting.scope === null ? undefined : index.systems.get(setting.scope);
  const said = (text: string) => `${text.replace(INSIDE, pieces ? INSIDE_WITH_PIECES : INSIDE)}${atEdge ? BOUNDARY_ARROWS : ''}`;
  const textOf = ({ key, text }: LegendEntry): string => {
    if (key === 'boundary') return said(chosen === undefined ? BOUNDARY_ANY : chosen.external === true ? BOUNDARY_EXTERNAL : text);
    // "Other system" is said only beside a chosen system.
    if (key === 'system' && chosen === undefined) return SYSTEM_ANY;
    return text;
  };
  return LEGEND.filter((entry) => drawn.has(entry.key)).map((entry) => ({ key: entry.key, text: textOf(entry) }));
}
