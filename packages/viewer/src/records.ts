import type { App, Component, Connection, Infrastructure, Model, ModelRecord, Owner, Person, Store, System, Technology, ViewerState } from '@seefore/core';

/** A record of the model, with the family it is in. */
export type Found =
  | { family: 'people'; record: ModelRecord<Person> }
  | { family: 'systems'; record: ModelRecord<System> }
  | { family: 'apps'; record: ModelRecord<App> }
  | { family: 'stores'; record: ModelRecord<Store> }
  | { family: 'components'; record: ModelRecord<Component> }
  | { family: 'infrastructure'; record: ModelRecord<Infrastructure> }
  | { family: 'connections'; record: ModelRecord<Connection> }
  | { family: 'owners'; record: ModelRecord<Owner> }
  | { family: 'technologies'; record: ModelRecord<Technology> };

export type Family = Found['family'];

/** Every record of a model by its id. An id names one record in a model. */
export type Index = Map<string, Found>;

/** Looks the model up once: each record by its id, with its family. */
export function indexOf(model: Model): Index {
  const index: Index = new Map();
  for (const record of model.people) index.set(record.id, { family: 'people', record });
  for (const record of model.systems) index.set(record.id, { family: 'systems', record });
  for (const record of model.apps) index.set(record.id, { family: 'apps', record });
  for (const record of model.stores) index.set(record.id, { family: 'stores', record });
  for (const record of model.components) index.set(record.id, { family: 'components', record });
  for (const record of model.infrastructure) index.set(record.id, { family: 'infrastructure', record });
  for (const record of model.connections) index.set(record.id, { family: 'connections', record });
  for (const record of model.owners) index.set(record.id, { family: 'owners', record });
  for (const record of model.technologies) index.set(record.id, { family: 'technologies', record });
  return index;
}

/** What a record is called: its name, or for a connection its name or "Unnamed connection". A record not in the model is shown by its id. */
export function nameOf(index: Index, id: string): string {
  const found = index.get(id);
  if (found === undefined) return id;
  if (found.family === 'connections') return found.record.name ?? 'Unnamed connection';
  return found.record.name;
}

/** An end of a connection by its name, and a component with its app's, as in "Order API / Checkout". */
export function endName(index: Index, id: string): string {
  const found = index.get(id);
  if (found?.family === 'components') return `${nameOf(index, found.record.in)} / ${found.record.name}`;
  return nameOf(index, id);
}

/** The words for a family, one record of it. */
export const SORT: Readonly<Record<Family, string>> = {
  people: 'person',
  systems: 'system',
  apps: 'app',
  stores: 'store',
  components: 'component',
  infrastructure: 'piece of infrastructure',
  connections: 'connection',
  owners: 'owner',
  technologies: 'technology',
};

/** The word a box's kind line starts with, for each family, and for the others the word for one record. */
const KIND_WORD: Readonly<Record<Family, string>> = {
  people: 'Person',
  systems: 'System',
  apps: 'App',
  stores: 'Store',
  components: 'Component',
  infrastructure: 'Infrastructure',
  connections: 'Connection',
  owners: 'Owner',
  technologies: 'Technology',
};

/** What sort of record it is, as a person reads it and as the kind line of its box says: `Person`, `App: service`, `Store`, `System: external`. */
export function kindOf(found: Found): string {
  const word = KIND_WORD[found.family];
  if ((found.family === 'apps' || found.family === 'stores') && found.record.kind !== undefined) return `${word}: ${found.record.kind}`;
  if (found.family === 'systems' && found.record.external === true) return `${word}: external`;
  return word;
}

/** The names of technologies, or their ids where a technology has an error in its file. */
export function technologyNames(index: Index, ids: readonly string[] | undefined): string[] {
  return (ids ?? []).map((id) => nameOf(index, id));
}

/** The technologies a record names, when it can name any. */
export function technologiesOf(found: Found): readonly string[] | undefined {
  switch (found.family) {
    case 'apps':
    case 'stores':
    case 'components':
    case 'infrastructure':
    case 'connections':
      return found.record.technology;
    default:
      return undefined;
  }
}

/** What a part is in: a system for an app or a store, an app for a component. */
export function insideOf(found: Found): string | undefined {
  return found.family === 'apps' || found.family === 'stores' || found.family === 'components' ? found.record.in : undefined;
}

/** Who answers for a record, and the record whose `owner` says so, both by name. */
export interface OwnerWords {
  owner: string;
  /** The record the owner is taken from, when it is not the record itself. */
  from?: string;
}

/** Who answers for a record, as the state's ownership says. Missing for one with no owner. */
export function ownerOf(state: ViewerState, index: Index, id: string): OwnerWords | undefined {
  const ownership = state.ownership[id];
  if (ownership === undefined) return undefined;
  const owner = nameOf(index, ownership.owner);
  return ownership.from === id ? { owner } : { owner, from: nameOf(index, ownership.from) };
}

/** The whole description of a record, when it has one. */
export function descriptionOf(found: Found): string | undefined {
  return found.record.description;
}

/** How many connections pass through something, in words: `no connection passes through it`, `1 connection passes through it`, `3 connections pass through it`. */
export function passingWords(count: number): string {
  if (count === 0) return 'no connection passes through it';
  return `${count} ${count === 1 ? 'connection passes' : 'connections pass'} through it`;
}

/** The connections of a model that name a record in `via`, in the order of the model. */
export function passingThrough(model: Model, id: string): string[] {
  return model.connections.filter((connection) => connection.via?.includes(id) === true).map((connection) => connection.id);
}
