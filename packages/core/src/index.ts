/**
 * The seefore format: reading a source directory and saying what is wrong with it.
 *
 * Nothing here touches disk or network. It takes the text of the files and returns records
 * and problems, so it runs the same in Node and in the browser.
 */
export { CURRENT_FORMAT, FORMAT_1, READABLE_VERSIONS, familyIn, nounOf, oneOf, referenceField } from './format.ts';
export type { Family, Format, RecordKind, ReferenceField } from './format.ts';
export { ID_MAX, idProblem, isId } from './id.ts';
export { isMarkerName, isSourcePath, load, loadAs } from './load.ts';
export type { Loaded, RecordFile, RecordText, Reference, SourceFile, SourceRecord } from './load.ts';
export { MARKER_FILE, MarkerSchema, readMarker } from './marker.ts';
export type { Marker, MarkerRead } from './marker.ts';
export { emptyModel, ownership } from './model.ts';
export type { Model, ModelRecord, Ownership } from './model.ts';
export { compareProblems } from './problem.ts';
export type { Position, Problem, Severity } from './problem.ts';
export {
  APP_KINDS,
  AppSchema,
  ComponentSchema,
  ConnectionSchema,
  OwnerSchema,
  PersonSchema,
  STORE_KINDS,
  StoreSchema,
  SystemSchema,
  TechnologySchema,
} from './records.ts';
export type { App, Component, Connection, Owner, Person, Store, System, Technology } from './records.ts';
export { DESCRIPTION_MAX, NAME_MAX } from './text.ts';
export { readInFull, removalOf, usesOf, wordsFor } from './uses.ts';
export type { Change, Left, Mention, Removal, RemovalOptions, UsedRecord, Uses } from './uses.ts';
