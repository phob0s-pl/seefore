import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint, LayoutOptions } from 'elkjs/lib/elk-api.js';
import type { Box, Depth, View, Zone } from '../model/view.ts';

/** A box where ELK put it: relative to the frame it is in, or to the diagram. */
export type Placed = { box: Box; x: number; y: number; width: number; height: number };

/** A zone's band at the Systems depth: painted behind its boxes, with its title. */
export type Band = { zone: Zone; title: string; x: number; y: number; width: number; height: number };

/** Where every box stands, the points each arrow runs through, and the bands, in the diagram's own place. */
export type Layout = { placed: Placed[]; routes: Map<string, ElkPoint[]>; bands: Band[] };

/** What lays a graph out: ELK in a worker on the page, or ELK in Node for a test. */
export type Engine = Pick<ELK, 'layout'>;

/** The size of a box of each kind, at the least. A box with many lines grows taller; a frame is as large as ELK makes it. */
const SIZES: Record<string, { width: number; height: number }> = {
  people: { width: 200, height: 84 },
  systems: { width: 240, height: 92 },
  apps: { width: 220, height: 84 },
  stores: { width: 220, height: 84 },
  components: { width: 200, height: 84 },
  infrastructure: { width: 200, height: 84 },
};

/** Set on the diagram and on every frame: tight gaps, a thorough search, the same answer each time. */
const COMMON: LayoutOptions = {
  'elk.spacing.nodeNode': '8',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.edgeEdge': '6',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
  'elk.spacing.edgeNode': '8',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.randomSeed': '1',
  'elk.layered.thoroughness': '50',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.edgeRouting': 'ORTHOGONAL',
  // The ends of a box's lines stand 12 pixels apart.
  'elk.spacing.portPort': '12',
};

/**
 * The shape of a diagram: the model as a whole, read left to right with the wide gaps, or one
 * flow's own parts, read top to bottom with tight gaps. A flow touches about seven boxes, and in
 * a field wider than it is high a row of them is too small to read: of 80 real flows 34 had names
 * that could be read when fitted, and 73 have them this way.
 */
export type Shape = 'model' | 'flow';

/** What a flow's own diagram sets otherwise: its direction, and the gaps along it. */
const FLOW: LayoutOptions = {
  'elk.layered.spacing.nodeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '6',
  'elk.layered.spacing.edgeNodeBetweenLayers': '8',
};

/** The diagram as one graph. Its id has a character no id of a record has. */
const ROOT = '#diagram';

/** The field's shape, 1036 to 732, as at 1440 by 900: fixed, so that a model gives one picture in any window. */
const FIELD = { width: 1036, height: 732 };

/** The zones from left to right, and the title of each band. */
const ZONES: readonly Zone[] = ['people', 'ours', 'external'];
const TITLES: Record<Zone, string> = { people: 'People', ours: 'Our systems', external: 'External systems' };

/** The column of each zone at the Systems depth, or of each box below it: ELK keeps them in order. */
type Partition = Map<string, number>;

/** A picture in the diagram's own place: every box at its corner there, and every route. */
type Picture = { placed: Placed[]; corners: Map<string, ElkPoint>; routes: Map<string, ElkPoint[]>; bands: Band[] };

/**
 * The store rule: the arrows that are laid out turned round. An arrow that only reads a queue or
 * a topic is laid out as what it takes flows, from the store to the reader, so that the store
 * stands between those who write it and those who read it. Not so when the reader is held in an
 * earlier column than the store, as a person is: the arrow would have to run back round the store.
 */
function turnedOf(view: View, partition: Partition): Set<string> {
  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  // The column of a box is that of the box at the top it is in.
  const column = (id: string): number | undefined => {
    let top = id;
    for (let up = boxes.get(top)?.in; up !== undefined; up = boxes.get(top)?.in) top = up;
    return partition.get(top);
  };
  const turned = new Set<string>();
  for (const arrow of view.arrows) {
    if (!arrow.reads) continue;
    const reader = column(arrow.from);
    const store = column(arrow.to);
    if (reader === undefined || store === undefined || reader >= store) turned.add(arrow.id);
  }
  return turned;
}

/** The ELK graph of a view: frames inside frames, each box at least its size, one edge per arrow, those of `turned` from their end to their start. */
function graphOf(view: View, partition: Partition, turned: Set<string>, shape: Shape): ElkNode {
  const common: LayoutOptions = shape === 'flow' ? { ...COMMON, ...FLOW } : COMMON;
  const sides = shape === 'flow' ? 20 : 60;
  const inside = new Map<string | undefined, Box[]>();
  for (const box of view.boxes) inside.set(box.in, [...(inside.get(box.in) ?? []), box]);
  const node = (box: Box): ElkNode => {
    const column: LayoutOptions = partition.has(box.id) ? { 'elk.partitioning.partition': String(partition.get(box.id)) } : {};
    if (box.frame) {
      return {
        id: box.id,
        // Room at the top for the frame's name.
        layoutOptions: { ...common, 'elk.padding': `[top=56,left=${sides},bottom=20,right=${sides}]`, ...column },
        children: (inside.get(box.id) ?? []).map(node),
      };
    }
    const size = SIZES[box.kind] ?? { width: 200, height: 84 };
    return {
      id: box.id,
      ...size,
      layoutOptions: {
        'elk.nodeSize.constraints': '[PORTS, MINIMUM_SIZE]',
        'elk.nodeSize.minimum': `(${size.width}, ${size.height})`,
        'elk.spacing.portPort': '12',
        ...column,
      },
    };
  };
  return {
    id: ROOT,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': shape === 'flow' ? 'DOWN' : 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      ...common,
      'elk.partitioning.activate': 'true',
      'elk.separateConnectedComponents': 'false',
    },
    children: (inside.get(undefined) ?? []).map(node),
    edges: view.arrows.map((arrow): ElkExtendedEdge => (turned.has(arrow.id) ? { id: arrow.id, sources: [arrow.to], targets: [arrow.from] } : { id: arrow.id, sources: [arrow.from], targets: [arrow.to] })),
  };
}

/** Lays the graph out, and reads ELK's answer: a box relative to its frame, an arrow relative to the box it names as its container. */
async function place(view: View, partition: Partition, elk: Engine, shape: Shape = 'model'): Promise<Picture> {
  const turned = turnedOf(view, partition);
  const done = await elk.layout(graphOf(view, partition, turned, shape));
  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  const corners = new Map<string, ElkPoint>([[ROOT, { x: 0, y: 0 }]]);
  const placed: Placed[] = [];
  const edges: ElkExtendedEdge[] = [];
  const walk = (parent: ElkNode, at: ElkPoint): void => {
    edges.push(...(parent.edges ?? []));
    for (const child of parent.children ?? []) {
      const box = boxes.get(child.id);
      if (box === undefined) continue;
      const x = child.x ?? 0;
      const y = child.y ?? 0;
      placed.push({ box, x, y, width: child.width ?? 0, height: child.height ?? 0 });
      const here = { x: at.x + x, y: at.y + y };
      corners.set(child.id, here);
      walk(child, here);
    }
  };
  walk(done, { x: 0, y: 0 });
  // An arrow laid out turned round is drawn as it is in the model: its route runs from the
  // reader to the store again, so that its head stands at the store.
  const routes = new Map<string, ElkPoint[]>();
  for (const edge of edges) {
    const origin = corners.get(edge.container ?? ROOT) ?? { x: 0, y: 0 };
    const points = (edge.sections ?? []).flatMap((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]).map((point) => ({ x: origin.x + point.x, y: origin.y + point.y }));
    routes.set(edge.id, turned.has(edge.id) ? points.reverse() : points);
  }
  return { placed, corners, routes, bands: [] };
}

/** A rectangle of the picture in the diagram's own place. */
type Rect = { x: number; y: number; width: number; height: number };
const rectOf = (picture: Picture, { box, width, height }: Placed): Rect => ({ ...(picture.corners.get(box.id) ?? { x: 0, y: 0 }), width, height });

/** Every box, band and route point, as x and y. */
function extent(picture: Picture): { xs: number[]; ys: number[] } {
  const rects: Rect[] = [...picture.placed.map((each) => rectOf(picture, each)), ...picture.bands];
  const xs = rects.flatMap((rect) => [rect.x, rect.x + rect.width]);
  const ys = rects.flatMap((rect) => [rect.y, rect.y + rect.height]);
  for (const point of [...picture.routes.values()].flat()) {
    xs.push(point.x);
    ys.push(point.y);
  }
  return { xs, ys };
}

/**
 * The bands: from 44 pixels above every box and route, room for the title, to 8 below them, and
 * 8 pixels past each zone's outermost boxes, so that no box stands on a band's edge.
 */
function withBands(picture: Picture): Picture {
  const { ys } = extent(picture);
  const top = Math.min(...ys) - 44;
  const bottom = Math.max(...ys) + 8;
  const bands: Band[] = [];
  for (const zone of ZONES) {
    const members = picture.placed.filter((each) => each.box.in === undefined && each.box.zone === zone).map((each) => rectOf(picture, each));
    if (members.length === 0) continue;
    const x = Math.min(...members.map((rect) => rect.x)) - 8;
    const width = Math.max(...members.map((rect) => rect.x + rect.width)) + 8 - x;
    const title = zone === 'people' && picture.placed.some((each) => each.box.zone === 'people' && each.box.kind !== 'people') ? 'People and callers' : TITLES[zone];
    bands.push({ zone, title, x, y: top, width, height: bottom - top });
  }
  return { ...picture, bands };
}

/** How the picture fits the field: the zoom at which it fits, at most 1, to the thousandth. */
function fitOf(picture: Picture): { fit: number; tall: boolean } {
  const { xs, ys } = extent(picture);
  const width = Math.round(Math.max(...xs) - Math.min(...xs));
  const height = Math.round(Math.max(...ys) - Math.min(...ys));
  const fit = Math.round(Math.min(1, FIELD.width / width, FIELD.height / height) * 1000) / 1000;
  return { fit, tall: height * (FIELD.width / FIELD.height) > width };
}

const EPS = 0.5;
type Segment = { a: ElkPoint; b: ElkPoint };
const orient = (a: ElkPoint, b: ElkPoint, c: ElkPoint): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** Two segments cross: each has its ends strictly on both sides of the other. */
function crosses(s: Segment, t: Segment): boolean {
  const d1 = orient(t.a, t.b, s.a);
  const d2 = orient(t.a, t.b, s.b);
  const d3 = orient(s.a, s.b, t.a);
  const d4 = orient(s.a, s.b, t.b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** The places where two arrows cross. */
function crossings(picture: Picture): number {
  const lines = [...picture.routes.values()].map((points) => points.slice(1).map((b, i): Segment => ({ a: points[i] as ElkPoint, b })));
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (const s of lines[i] ?? []) for (const t of lines[j] ?? []) if (crosses(s, t)) count++;
    }
  }
  return count;
}

/** The boxes of a zone in columns: a box joins the column whose right edge it starts left of. */
function columnsOf(rects: (Rect & { id: string })[]): (Rect & { id: string })[][] {
  const columns: (Rect & { id: string })[][] = [];
  for (const rect of [...rects].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const last = columns.at(-1);
    if (last !== undefined && rect.x < Math.max(...last.map((each) => each.x + each.width)) - 10) last.push(rect);
    else columns.push([rect]);
  }
  return columns.map((column) => column.sort((a, b) => a.y - b.y));
}

/**
 * The Systems depth: the zones are columns in order, each with its band. A picture too tall for
 * the field has its long columns dealt into two or three, for columns over 10, over 8 and over 6
 * boxes; the picture that fits best is kept, and of two that fit alike the one with fewer crossings.
 */
async function inZones(view: View, elk: Engine): Promise<Picture> {
  const rank = new Map(view.boxes.filter((box) => box.in === undefined).map((box) => [box.id, ZONES.indexOf(box.zone ?? 'ours')]));
  const lay = async (partition: Partition) => {
    const picture = withBands(await place(view, partition, elk));
    return { picture, ...fitOf(picture), crossings: crossings(picture) };
  };
  const first = await lay(new Map([...rank].map(([id, zone]) => [id, zone * 1000])));
  let best = first;
  for (const most of first.tall ? [10, 8, 6] : []) {
    const deal: Partition = new Map();
    for (const zone of new Set(rank.values())) {
      const rects = first.picture.placed.filter((each) => rank.get(each.box.id) === zone).map((each) => ({ id: each.box.id, ...rectOf(first.picture, each) }));
      let column = 0;
      for (const boxes of columnsOf(rects)) {
        const into = boxes.length > most ? Math.min(3, Math.ceil(boxes.length / most)) : 1;
        boxes.forEach((box, i) => deal.set(box.id, zone * 1000 + column + (i % into)));
        column += into;
      }
    }
    const next = await lay(deal);
    if (next.fit > best.fit + 0.01 || (next.fit > best.fit - 0.01 && next.crossings < best.crossings)) best = next;
  }
  return best.picture;
}

/**
 * Lays a view out with ELK's layered layout, frames inside frames included: in zones at the Systems
 * depth, the people first below it. A flow's own diagram is read top to bottom, the people first.
 */
export async function layOut(view: View, depth: Depth, elk: Engine, shape: Shape = 'model'): Promise<Layout> {
  const picture =
    depth === 'systems' && shape === 'model'
      ? await inZones(view, elk)
      : await place(view, new Map(view.boxes.filter((box) => box.in === undefined).map((box) => [box.id, box.zone === 'people' && !box.caller ? 0 : 1])), elk, shape);
  // A frame comes before what it holds, as React Flow asks.
  const order = new Map(view.boxes.map((box, index) => [box.id, index]));
  const placed = [...picture.placed].sort((a, b) => (order.get(a.box.id) ?? 0) - (order.get(b.box.id) ?? 0));
  return { placed, routes: picture.routes, bands: picture.bands };
}

/**
 * The line that runs nearest to a point of the diagram. The reach of a line is wider than the
 * line, so that it is easy to catch, and where lines run close the reach of one lies on its
 * neighbour: a click then means the line it is nearest to, whichever reach is on top.
 */
export function nearestRoute(routes: Map<string, ElkPoint[]>, at: ElkPoint): string | undefined {
  let nearest: string | undefined;
  let least = Infinity;
  for (const [id, points] of routes) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as ElkPoint;
      const b = points[i] as ElkPoint;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      // How far along the stretch from a to b the point's foot falls, held between its ends.
      const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / length));
      const distance = Math.hypot(at.x - (a.x + along * dx), at.y - (a.y + along * dy));
      if (distance < least) {
        least = distance;
        nearest = id;
      }
    }
  }
  return nearest;
}
