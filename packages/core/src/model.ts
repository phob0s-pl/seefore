import type { App, Component, Connection, Infrastructure, Owner, Person, Store, System, Technology } from './records.ts';

/** A record of the model: what its file holds, with its id and the file it is written in. */
export type ModelRecord<T> = { id: string; file: string } & T;

/**
 * The records of a source directory whose own file has no error, typed, by family, each family
 * in order of id. A record may name one that is not here: its file has an error, and the
 * record still stands, so the name is not wrong.
 */
export interface Model {
  people: ModelRecord<Person>[];
  systems: ModelRecord<System>[];
  apps: ModelRecord<App>[];
  stores: ModelRecord<Store>[];
  components: ModelRecord<Component>[];
  infrastructure: ModelRecord<Infrastructure>[];
  connections: ModelRecord<Connection>[];
  owners: ModelRecord<Owner>[];
  technologies: ModelRecord<Technology>[];
}

export function emptyModel(): Model {
  return { people: [], systems: [], apps: [], stores: [], components: [], infrastructure: [], connections: [], owners: [], technologies: [] };
}

/** Who answers for an element, and whose `owner` says so. */
export interface Ownership {
  /** The id of the owner. */
  owner: string;
  /** The id of the record whose `owner` it is: the element itself, or what it is in. */
  from: string;
}

/**
 * Who answers for each system, app, store and component of the model, by id. One with no
 * `owner` has that of what it is in, followed upwards; one with none above it either has none,
 * and is not in the map. A person has no owner.
 */
export function ownership(model: Model): Map<string, Ownership> {
  const found = new Map<string, Ownership>();
  const take = (element: { id: string; owner?: string | undefined }, inside?: string): void => {
    if (element.owner !== undefined) {
      found.set(element.id, { owner: element.owner, from: element.id });
      return;
    }
    const above = inside === undefined ? undefined : found.get(inside);
    if (above) found.set(element.id, above);
  };
  // Outside in, so that what a thing is in is settled before the thing itself.
  for (const system of model.systems) take(system);
  for (const appOrStore of [...model.apps, ...model.stores]) take(appOrStore, appOrStore.in);
  for (const component of model.components) take(component, component.in);
  // A piece of infrastructure is in nothing: it has the owner it names, or none.
  for (const piece of model.infrastructure) take(piece);
  return found;
}
