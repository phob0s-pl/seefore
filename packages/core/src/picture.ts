import type { Model, Ownership } from './model.ts';
import type { Problem } from './problem.ts';

/**
 * What the viewer is given: the views of a model, the place of everything in a view, and the
 * state the server hands to the page. Types only. The views are worked out in `views.ts`, the
 * places by the layout package, and the page draws them without working anything out again.
 *
 * Every place is in CSS pixels, from the top left corner of the whole picture, x to the right
 * and y down. Nothing is given relative to a boundary.
 */

/** The families whose records can stand as a box in a view. */
export type BoxFamily = 'people' | 'systems' | 'apps' | 'stores';

/** A context view shows a system as one box; a container view shows what is inside it. */
export type ViewKind = 'context' | 'containers';

/** A box of a view, before it has a place. */
export interface ViewBox {
  /** The id of the record it stands for. An id is used once in a model, so it is also the box's key. */
  id: string;
  family: BoxFamily;
  /** The record's name, whole. */
  name: string;
  /** The line that says its kind and its technologies, whole: `[App: service · Go, PostgreSQL]`. */
  line: string;
  /** The first sentence of its description, whole. Missing when it has no description. */
  sentence?: string;
  /** True for the system the view is about, where that system is drawn as a box. */
  scope: boolean;
  /** True when it stands inside the boundary. */
  inside: boolean;
  /**
   * Connections from a record to itself, one copy acting on another, where that record is drawn
   * as this box: their ids, in order of id. A box outside the system in scope has only those
   * that name the box's own record: what goes on inside it is not the view's to tell.
   */
  loops: string[];
  /** Connections between two different records that are both drawn as this box: their ids, in order of id. Only on a box of the system in scope. */
  within: string[];
}

/** The boundary of a container view: the system in scope. An arrow may start or end at it. */
export interface ViewBoundary {
  /** The id of the system. */
  id: string;
  name: string;
  /** What is written at its top left: `Shop [System]`. */
  title: string;
}

/** One arrow: every connection from one box of the view to another. */
export interface ViewArrow {
  /** `<from>~<to>`. Unique in its view. */
  id: string;
  /** The id of the box it starts at, or of the boundary. */
  from: string;
  /** The id of the box it ends at, or of the boundary. */
  to: string;
  /**
   * The connections it stands for. First those written between the two drawn records
   * themselves, then the others, each group in order of id.
   */
  connections: string[];
  /** One text for each connection, in the same order: its name, or `Unnamed connection`. */
  names: string[];
  /** The names of the technologies that every one of its connections names. Empty when they differ, or when one names none. */
  technology: string[];
}

/** The connections a view does not draw, by the reason. Each list is in order of id. */
export interface ViewLeft {
  /** Both ends stand outside the system in scope. */
  outside: string[];
  /** One end is the system in scope or inside it; the other is a record with an error in its file, or inside one. */
  broken: string[];
}

/** What a legend can explain. A view lists only what it draws. */
export type LegendKey = 'person' | 'system-scope' | 'system' | 'app' | 'store' | 'boundary' | 'arrow' | 'arrow-many' | 'loop';

/** One line of the legend. */
export interface LegendEntry {
  key: LegendKey;
  /** What it says beside the sample: `App: something that runs code`. */
  text: string;
}

/** A view of one system, worked out from the model. */
export interface View {
  /** `<system id>.context` or `<system id>.containers`. */
  id: string;
  kind: ViewKind;
  /** The id of the system it is about. */
  scope: string;
  /** `Context view: Shop` or `Container view: Shop`. */
  title: string;
  /** In order of id. */
  boxes: ViewBox[];
  /** In a container view only. */
  boundary?: ViewBoundary;
  /** In order of id. */
  arrows: ViewArrow[];
  left: ViewLeft;
  legend: LegendEntry[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box with its place and its text broken into the lines to draw. A cut line ends with an ellipsis. */
export interface PlacedBox extends Rect {
  id: string;
  /** The name, in one or two lines. */
  name: string[];
  /** The kind line, in one line. */
  line: string;
  /** The first sentence, in at most four lines. Empty when there is none. */
  sentence: string[];
}

/** The boundary with its place and the place of its title. */
export interface PlacedBoundary extends Rect {
  id: string;
  /** The title in one line, cut when the boundary is narrower than it. */
  title: string;
  titleAt: Rect;
}

/** The label of an arrow with its place. */
export interface PlacedLabel extends Rect {
  /** The lines to draw: names, and `+ n more` when not every name has a line. */
  lines: string[];
  /** The technology line, `[HTTPS]`, when the arrow has one. Its room is inside the label's place. */
  technology?: string;
}

/** An arrow with its route. */
export interface PlacedArrow {
  id: string;
  from: string;
  to: string;
  /**
   * The route, from its start to its end, as one or more stretches. Each stretch is a line
   * through its points, with right angles. The arrow's head is at the last point of the last one.
   */
  sections: Point[][];
  label?: PlacedLabel;
}

/** A view that has been laid out. */
export interface Drawn {
  view: string;
  width: number;
  height: number;
  boxes: PlacedBox[];
  boundary?: PlacedBoundary;
  arrows: PlacedArrow[];
}

/** A view whose layout did not finish. */
export interface Failed {
  view: string;
  failed: {
    /** `time` when it ran past its limit, `crash` when the layout threw. */
    reason: 'time' | 'crash';
    /** What to tell the reader, in plain words. */
    message: string;
  };
}

/** What the layout gives back for a view. */
export type Picture = Drawn | Failed;

/** The listing of a model as a tree of ids, in the order `seefore list` prints it. */
export interface Outline {
  people: string[];
  /** The systems that have an app or a store, each with what is in it. */
  withParts: OutlineSystem[];
  /** The other systems. */
  others: string[];
  /** The pieces of infrastructure: things whose job is to pass exchanges on. They are in no system. */
  infrastructure: string[];
  /** The connections, under what they start from, in the order the starts are listed above, then those that start at a piece of infrastructure. */
  connections: OutlineGroup[];
  owners: string[];
  technologies: string[];
  /** Parts whose `in` names a record with an error, so that they cannot be put in their place. */
  loose: OutlineLoose[];
}

export interface OutlineSystem {
  id: string;
  apps: OutlineApp[];
  stores: string[];
}

export interface OutlineApp {
  id: string;
  components: string[];
}

export interface OutlineGroup {
  /** The id the connections stand under: a person, a system, an app or a store. A component's stand under its app. */
  start: string;
  /** False when `start` is a record with an error in its file, which has no name to show. */
  known: boolean;
  connections: string[];
}

export interface OutlineLoose {
  id: string;
  family: 'apps' | 'stores' | 'components';
  /** The id its `in` names. */
  in: string;
  /** For an app: its components. */
  components: string[];
}

/**
 * What the server hands the page for one reading of the source directory. A reading has a
 * revision; a picture is asked for by revision, so that the page never draws a picture of one
 * reading over the state of another.
 */
export interface ViewerState {
  /** Unlike any other revision of this or an earlier run of the server. */
  revision: string;
  /** The source directory, as a full path. */
  directory: string;
  /** False when the directory is gone, or its marker cannot say which format it is in. Then there is no model and there are no views. */
  available: boolean;
  /** The name in the marker, or null when the marker could not be read. */
  name: string | null;
  /** The format in the marker, or null when the marker could not be read. */
  format: number | null;
  records: number;
  errors: number;
  warnings: number;
  /** Every problem `seefore check` reports, in its order. */
  problems: Problem[];
  model: Model;
  /** For each part that has an owner: the owner and the record it comes from. */
  ownership: Record<string, Ownership>;
  outline: Outline;
  /** Every view, in the order the sidebar lists them: the systems with parts first. */
  views: View[];
}

/** The server's answer when asked for the picture of a view at a revision. */
export interface PictureAnswer {
  revision: string;
  picture: Picture;
}
