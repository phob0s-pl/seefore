import type { Model, ModelRecord } from './model.ts';
import type { Outline, OutlineGroup, OutlineLoose } from './picture.ts';
import type { App, Component, Connection, Store, System } from './records.ts';

/**
 * The listing of a model as a tree of ids, in the order `seefore list` prints it: the people;
 * the systems that have an app or a store, each with its apps, the components of each app, and
 * its stores; the other systems; the connections under what they start from; the owners; the
 * technologies; and last the parts whose `in` names a record with an error. Each list is in
 * order of id. It says nothing of how the listing is written: the command and the page each
 * write it in their own way.
 */
export function outlineOf(model: Model): Outline {
  const parts = partsOf(model);
  const systems = new Set(model.systems.map((system) => system.id));
  const apps = new Set(model.apps.map((app) => app.id));
  const hasParts = (system: ModelRecord<System>): boolean => parts.appsIn.has(system.id) || parts.storesIn.has(system.id);
  const withParts = model.systems.filter(hasParts);
  const others = model.systems.filter((system) => !hasParts(system));
  const looseApps = model.apps.filter((app) => !systems.has(app.in));
  const looseStores = model.stores.filter((store) => !systems.has(store.in));
  const looseComponents = model.components.filter((component) => !apps.has(component.in));

  // What a connection may start from, in the order the listing shows it. A component's stand under its app.
  const starts = [
    ...model.people.map((person) => person.id),
    ...withParts.flatMap((system) => [system.id, ...ids(parts.appsIn.get(system.id)), ...ids(parts.storesIn.get(system.id))]),
    ...others.map((system) => system.id),
    ...ids(looseApps),
    ...ids(looseStores),
  ];
  const components = (app: string): string[] => ids(parts.componentsIn.get(app));

  return {
    people: ids(model.people),
    withParts: withParts.map((system) => ({
      id: system.id,
      apps: (parts.appsIn.get(system.id) ?? []).map((app) => ({ id: app.id, components: components(app.id) })),
      stores: ids(parts.storesIn.get(system.id)),
    })),
    others: ids(others),
    connections: groupsOf(model, starts),
    owners: ids(model.owners),
    technologies: ids(model.technologies),
    loose: [
      ...looseApps.map((app): OutlineLoose => ({ id: app.id, family: 'apps', in: app.in, components: components(app.id) })),
      ...looseStores.map((store): OutlineLoose => ({ id: store.id, family: 'stores', in: store.in, components: [] })),
      ...looseComponents.map((component): OutlineLoose => ({ id: component.id, family: 'components', in: component.in, components: [] })),
    ],
  };
}

/** What is in each system and each app, by the id its parts name in `in`. Each list is in order of id. */
interface Parts {
  appsIn: Map<string, ModelRecord<App>[]>;
  storesIn: Map<string, ModelRecord<Store>[]>;
  componentsIn: Map<string, ModelRecord<Component>[]>;
}

/** Finds what is in each system and each app. */
function partsOf(model: Model): Parts {
  return {
    appsIn: groupBy(model.apps, (app) => app.in),
    storesIn: groupBy(model.stores, (store) => store.in),
    componentsIn: groupBy(model.components, (component) => component.in),
  };
}

/**
 * The connections, each under the person, system, app or store it starts from, in the order of
 * `starts`, and in order of id beneath it. A component's are under its app. Those that start at
 * a record with an error, or at a part in one, come after the rest, in order of the id they
 * stand under.
 */
function groupsOf(model: Model, starts: readonly string[]): OutlineGroup[] {
  const appOf = new Map(model.components.map((component) => [component.id, component.in]));
  const groups = groupBy(model.connections, (connection: ModelRecord<Connection>) => appOf.get(connection.from) ?? connection.from);
  const shown = new Set(starts);
  const order = [...starts.filter((id) => groups.has(id)), ...[...groups.keys()].filter((id) => !shown.has(id)).sort()];
  const known = new Set([model.people, model.systems, model.apps, model.stores, model.components].flatMap((family) => ids(family)));
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
