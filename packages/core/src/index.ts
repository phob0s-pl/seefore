/**
 * The seefore format: reading a source directory and saying what is wrong with it.
 *
 * Nothing here touches disk or network. It takes the text of the files and returns records
 * and problems, so it runs the same in Node and in the browser.
 */
export { CURRENT_FORMAT, FORMAT_1, READABLE_VERSIONS } from './format.ts';
export type { Family, Format } from './format.ts';
export { ID_MAX, idProblem, isId } from './id.ts';
export { isMarkerName, isSourcePath, load, loadAs } from './load.ts';
export type { Loaded, SourceFile, SourceRecord } from './load.ts';
export { MARKER_FILE, MarkerSchema, NAME_MAX, readMarker } from './marker.ts';
export type { Marker, MarkerRead } from './marker.ts';
export { compareProblems } from './problem.ts';
export type { Position, Problem, Severity } from './problem.ts';
