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
export type BoxFamily = 'people' | 'systems' | 'apps' | 'stores' | 'infrastructure';

/**
 * How a box looks: a person, the system the view is about, another system, an external system,
 * an app, a store, a queue or a topic, a piece of infrastructure. The legend's key for each look
 * has the same name. An external system is drawn as one also when the view is about it.
 */
export type BoxLook = 'person' | 'system-scope' | 'system' | 'system-external' | 'app' | 'store' | 'queue-or-topic' | 'infrastructure';

/** A context view shows a system as one box; a container view shows what is inside it. */
export type ViewKind = 'context' | 'containers';

/** A box of a view, before it has a place. */
export interface ViewBox {
  /** The id of the record it stands for. An id is used once in a model, so it is also the box's key. */
  id: string;
  family: BoxFamily;
  /** How it is drawn, and which line of the legend explains it. */
  look: BoxLook;
  /** The record's name, whole. */
  name: string;
  /** The line that says its kind and its technologies, whole: `[App: service · Go, PostgreSQL]`, `[System: external]`. */
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
  /**
   * Connections the view holds that pass through this box: that name in `via` its record, or
   * anything drawn as it. Those on its arrows count, and those a box holds inside it or between
   * its copies. Their ids, in order of id. A connection is not counted on a box that its own
   * arrow starts or ends at, nor on the box that holds it.
   */
  passing: string[];
}

/** The boundary of a container view: the system in scope. An arrow may start or end at it. */
export interface ViewBoundary {
  /** The id of the system. */
  id: string;
  name: string;
  /** The system's kind line: `[System]`, or `[System: external]` for somebody else's. */
  line: string;
  /** What is written at its top left: its name, then its kind line, as in `Shop [System]`. */
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
  /**
   * What its connections pass through at this level: what they name in `via`, less what is
   * drawn as either end of the arrow, which is passed inside that end. Missing when that leaves
   * nothing for every one of them.
   */
  route?: ViewRoute;
}

/** What the connections of an arrow pass through. */
export interface ViewRoute {
  /** How many of the arrow's connections pass through something at this level: at least one. */
  count: number;
  /**
   * When every connection of the arrow names the same in `via`, in the same order: the names of
   * what they pass through, in the order of travel. Empty when the routes differ, or when only
   * some connections have one.
   */
  names: string[];
  /** The line its label says, whole: `via Ingress, Workhorse`, or `via on 2 of 5` when the names are empty. */
  line: string;
}

/** Something that connections the view holds pass through, and that has no box in the view. */
export interface ViewPassed {
  /** The id `via` names: a piece of infrastructure, an app, a component or a system. */
  id: string;
  /** Its name, or its id when its file has an error. */
  name: string;
  /**
   * The connections the view holds that name it in `via`, in order of id: on its arrows, and
   * inside a box or between its copies.
   */
  connections: string[];
  /** The arrows of those connections that are drawn as one, in order of id. One held in a box has none. */
  arrows: string[];
}

/** The connections a view does not draw, by the reason. Each list is in order of id. */
export interface ViewLeft {
  /** Both ends stand outside the system in scope. */
  outside: string[];
  /** One end is the system in scope or inside it; the other is a record with an error in its file, or inside one. */
  broken: string[];
}

/**
 * What a legend can explain: each look of a box, the thicker line of an external system the
 * view is about, the boundary, an arrow, an arrow for several connections, the route on an
 * arrow, and the marks for copies and for what passes through a box. A view lists only what it
 * draws.
 */
export type LegendKey = BoxLook | 'system-scope-external' | 'boundary' | 'arrow' | 'arrow-many' | 'route' | 'loop' | 'passing';

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
  /** What its arrows pass through that has no box in it, in order of id. */
  passed: ViewPassed[];
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
  /**
   * How far its text stands in from its left and its right edge: the room the lines were broken
   * for, which the shape of its look leaves. The page draws the text there.
   */
  inset: { left: number; right: number };
}

/** The boundary with its place and the place of its title. */
export interface PlacedBoundary extends Rect {
  id: string;
  /** The title in one line. When the boundary is narrower than it, the name is cut and the kind line kept whole. */
  title: string;
  titleAt: Rect;
}

/** The label of an arrow with its place. */
export interface PlacedLabel extends Rect {
  /** The lines to draw: names, and `+ n more` when not every name has a line. */
  lines: string[];
  /** The route line, `via Ingress, Workhorse` or `via on 2 of 5`, when the arrow has a route: under the names, above the technology. Its room is inside the label's place. */
  route?: string;
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
  /**
   * The connections that no view holds in any way, in order of id: not on an arrow, not inside
   * a box or between its copies, and not counted as left out. They are in no picture.
   */
  inNoView: string[];
}

/** The server's answer when asked for the picture of a view at a revision. */
export interface PictureAnswer {
  revision: string;
  picture: Picture;
}
