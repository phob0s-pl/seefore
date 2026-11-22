import { keeperOf } from './conditions.ts';
import type { Model, ModelRecord } from './model.ts';
import type { Outline, OutlineApp, OutlineCondition, OutlineGroup, OutlineLoose, OutlineSystem } from './picture.ts';
import type { App, Component, Connection, Infrastructure, Store, System } from './records.ts';

/**
 * The listing of a model as a tree of ids, in the order `seefore list` prints it: the people;
 * the systems that have an app, a store or a piece of infrastructure in them, each with its
 * apps, the components and the kept stores of each app, its own stores and its pieces of
 * infrastructure; the other systems; the pieces of infrastructure in no system; the connections
 * under what they start from; the owners; the technologies; the wordings of `only`; and last the
 * parts whose `in` names a record with an error. Each list is in order of id. It says nothing of
 * how the listing is written: the command and the page each write it in their own way.
 */
export function outlineOf(model: Model): Outline {
  const parts = partsOf(model);
  const systems = new Set(model.systems.map((system) => system.id));
  const apps = new Set(model.apps.map((app) => app.id));
  const hasParts = (system: ModelRecord<System>): boolean => parts.appsIn.has(system.id) || parts.storesIn.has(system.id) || parts.piecesIn.has(system.id);
  const withParts = model.systems.filter(hasParts);
  const others = model.systems.filter((system) => !hasParts(system));
  const looseApps = model.apps.filter((app) => !systems.has(app.in));
  // A store is in its place when it is in a system, or kept by an app: what that app is in is the app's to say.
  const looseStores = model.stores.filter((store) => !systems.has(store.in) && keeperOf(model, store.id) === undefined);
  const looseComponents = model.components.filter((component) => !apps.has(component.in));
  const loosePieces = placedOf(model).filter((piece) => !systems.has(piece.in));
  const unplaced = model.infrastructure.filter((piece) => piece.in === undefined);

  const outlined = (app: ModelRecord<App>): OutlineApp => {
    const kept = ids(parts.keptBy.get(app.id));
    return { id: app.id, components: ids(parts.componentsIn.get(app.id)), ...(kept.length === 0 ? {} : { stores: kept }) };
  };
  const system = (record: ModelRecord<System>): OutlineSystem => {
    const pieces = ids(parts.piecesIn.get(record.id));
    return {
      id: record.id,
      apps: (parts.appsIn.get(record.id) ?? []).map(outlined),
      stores: ids(parts.storesIn.get(record.id)),
      ...(pieces.length === 0 ? {} : { infrastructure: pieces }),
    };
  };
  const tree = withParts.map(system);
  const looseTree = looseApps.map((app): OutlineLoose => {
    const { components, stores } = outlined(app);
    return { id: app.id, family: 'apps', in: app.in, components, ...(stores === undefined ? {} : { stores }) };
  });

  // What a connection may start from, in the order the listing shows it. A component's stand under its app.
  const appStarts = (app: OutlineApp): string[] => [app.id, ...(app.stores ?? [])];
  const starts = [
    ...model.people.map((person) => person.id),
    ...tree.flatMap((each) => [each.id, ...each.apps.flatMap(appStarts), ...each.stores, ...(each.infrastructure ?? [])]),
    ...others.map((each) => each.id),
    ...looseTree.flatMap(appStarts),
    ...ids(looseStores),
    ...ids(loosePieces),
  ];

  return {
    people: ids(model.people),
    withParts: tree,
    others: ids(others),
    infrastructure: ids(unplaced),
    connections: groupsOf(model, starts, ids(unplaced)),
    owners: ids(model.owners),
    technologies: ids(model.technologies),
    conditions: conditionsIn(model),
    loose: [
      ...looseTree,
      ...looseStores.map((store): OutlineLoose => ({ id: store.id, family: 'stores', in: store.in, components: [] })),
      ...looseComponents.map((component): OutlineLoose => ({ id: component.id, family: 'components', in: component.in, components: [] })),
      ...loosePieces.map((piece): OutlineLoose => ({ id: piece.id, family: 'infrastructure', in: piece.in, components: [] })),
    ],
  };
}

/** What is in each system and each app, by the id its parts name in `in`. Each list is in order of id. */
interface Parts {
  appsIn: Map<string, ModelRecord<App>[]>;
  /** The stores in each system itself, by the system's id. */
  storesIn: Map<string, ModelRecord<Store>[]>;
  /** The stores each app keeps, by the app's id. */
  keptBy: Map<string, ModelRecord<Store>[]>;
  componentsIn: Map<string, ModelRecord<Component>[]>;
  /** The pieces of infrastructure in each system, by the system's id. */
  piecesIn: Map<string, ModelRecord<Infrastructure>[]>;
}

/** Finds what is in each system and each app. */
function partsOf(model: Model): Parts {
  const kept = (store: ModelRecord<Store>) => keeperOf(model, store.id) !== undefined;
  return {
    appsIn: groupBy(model.apps, (app) => app.in),
    storesIn: groupBy(
      model.stores.filter((store) => !kept(store)),
      (store) => store.in,
    ),
    keptBy: groupBy(model.stores.filter(kept), (store) => store.in),
    componentsIn: groupBy(model.components, (component) => component.in),
    piecesIn: groupBy(placedOf(model), (piece) => piece.in),
  };
}

/** A piece of infrastructure that names the system it is in. */
type Placed = ModelRecord<Infrastructure> & { in: string };

/** The pieces of infrastructure that name a system they are in, whether or not the model has that system. */
function placedOf(model: Model): Placed[] {
  return model.infrastructure.filter((piece): piece is Placed => piece.in !== undefined);
}

/**
 * Each wording of `only` in the model, with the records whose own it is. The wordings come in
 * the order of their words with no regard to capitals, so that two that differ only there, or in
 * their last words, stand side by side; two that differ only in capitals come in the order of
 * their characters.
 */
function conditionsIn(model: Model): OutlineCondition[] {
  const records = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections].flat();
  const holders = new Map<string, string[]>();
  for (const record of records) {
    if (record.only === undefined) continue;
    holders.set(record.only, [...(holders.get(record.only) ?? []), record.id]);
  }
  const byWords = (a: string, b: string): number => compare(a.toLowerCase(), b.toLowerCase()) || compare(a, b);
  return [...holders.keys()].sort(byWords).map((only) => ({ only, records: [...(holders.get(only) ?? [])].sort(compare) }));
}

/** Two texts in the order of their characters, the same on every machine. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The connections, each under the person, system, app, store or piece of infrastructure it
 * starts from, in the order of `starts`, and in order of id beneath it. A component's are under
 * its app. Those that start at a record with an error, or at a part in one, come after the rest,
 * in order of the id they stand under. Those that start at a piece of infrastructure in no
 * system, `unplaced`, come last.
 */
function groupsOf(model: Model, starts: readonly string[], unplaced: readonly string[]): OutlineGroup[] {
  const appOf = new Map(model.components.map((component) => [component.id, component.in]));
  const groups = groupBy(model.connections, (connection: ModelRecord<Connection>) => appOf.get(connection.from) ?? connection.from);
  const shown = new Set([...starts, ...unplaced]);
  const order = [
    ...starts.filter((id) => groups.has(id)),
    ...[...groups.keys()].filter((id) => !shown.has(id)).sort(compare),
    ...unplaced.filter((id) => groups.has(id)),
  ];
  const known = new Set([model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure].flatMap((family) => ids(family)));
  return order.map((start) => ({ start, known: known.has(start), connections: ids(groups.get(start)) }));
}

/** The records under the key each gives, each list in the order the records come. */
function groupBy<T>(records: readonly T[], key: (record: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const group = groups.get(key(record));
    if (group) group.push(record);
    else groups.set(key(record), [record]);
  }
  return groups;
}

/** The ids of records, in the order they come. None for no list. */
function ids(records: readonly { id: string }[] | undefined): string[] {
  return (records ?? []).map((record) => record.id);
}
