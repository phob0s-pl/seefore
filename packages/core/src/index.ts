/**
 * The seefore format: reading a source directory, saying what is wrong with it, and working out
 * the listing and the views of its model.
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
export type {
  BoxFamily,
  BoxLook,
  Drawn,
  Failed,
  LegendEntry,
  LegendKey,
  Outline,
  OutlineApp,
  OutlineGroup,
  OutlineLoose,
  OutlineSystem,
  Picture,
  PictureAnswer,
  PlacedArrow,
  PlacedBoundary,
  PlacedBox,
  PlacedLabel,
  Point,
  Rect,
  View,
  ViewArrow,
  ViewBoundary,
  ViewBox,
  ViewKind,
  ViewLeft,
  ViewPassed,
  ViewRoute,
  ViewerState,
} from './picture.ts';
export { outlineOf } from './outline.ts';
export { compareProblems } from './problem.ts';
export type { Position, Problem, Severity } from './problem.ts';
export {
  APP_KINDS,
  AppSchema,
  ComponentSchema,
  InfrastructureSchema,
  ConnectionSchema,
  OwnerSchema,
  PersonSchema,
  STORE_KINDS,
  StoreSchema,
  SystemSchema,
  TechnologySchema,
} from './records.ts';
export type { App, Component, Connection, Infrastructure, Owner, Person, Store, System, Technology } from './records.ts';
export { DESCRIPTION_MAX, NAME_MAX, firstSentence } from './text.ts';
export { isShort, readInFull, recordsWithId, removalOf, usesOf, wordsFor } from './uses.ts';
export type { Change, Left, Mention, Removal, RemovalOptions, UsedRecord, Uses } from './uses.ts';
export { UNNAMED_CONNECTION, viewsOf } from './views.ts';
