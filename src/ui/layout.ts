import ELK from 'elkjs/lib/elk-api.js';
import type { ElkExtendedEdge, ElkNode, ElkPoint, LayoutOptions } from 'elkjs/lib/elk-api.js';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { Box, View } from '../model/view.ts';

/** A box where ELK put it: relative to the frame it is in, or to the diagram. */
export type Placed = { box: Box; x: number; y: number; width: number; height: number };

/** Where every box stands, and the points each arrow runs through, in the diagram's own place. */
export type Layout = { placed: Placed[]; routes: Map<string, ElkPoint[]> };

/** The size of a box of each kind. A frame is as large as ELK makes it. */
const SIZES: Record<string, { width: number; height: number }> = {
  people: { width: 200, height: 84 },
  systems: { width: 240, height: 92 },
  apps: { width: 220, height: 84 },
  stores: { width: 220, height: 84 },
  components: { width: 200, height: 84 },
  infrastructure: { width: 200, height: 84 },
};

const SPACING: LayoutOptions = {
  'elk.spacing.nodeNode': '90',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.edgeEdge': '24',
  'elk.spacing.edgeNode': '28',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
};

/** The diagram as one graph. Its id has a character no id of a record has. */
const ROOT = '#diagram';

let elk: InstanceType<typeof ELK> | undefined;

/** Lays a view out with ELK's plain layered layout, in a worker, frames inside frames included. */
export async function layOut(view: View): Promise<Layout> {
  elk ??= new ELK({ workerUrl });
  const inside = new Map<string | undefined, Box[]>();
  for (const box of view.boxes) inside.set(box.in, [...(inside.get(box.in) ?? []), box]);
  const node = (box: Box): ElkNode =>
    box.frame
      ? {
          id: box.id,
          // Room at the top for the frame's name.
          layoutOptions: { 'elk.padding': '[top=64,left=32,bottom=32,right=32]', ...SPACING },
          children: (inside.get(box.id) ?? []).map(node),
        }
      : { id: box.id, ...(SIZES[box.kind] ?? { width: 200, height: 84 }) };
  const graph: ElkNode = {
    id: ROOT,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      ...SPACING,
    },
    children: (inside.get(undefined) ?? []).map(node),
    edges: view.arrows.map((arrow): ElkExtendedEdge => ({ id: arrow.id, sources: [arrow.from], targets: [arrow.to] })),
  };
  const done = await elk.layout(graph);

  // ELK places a box relative to its frame, and an arrow relative to the box it names as its container.
  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  const corner = new Map<string, ElkPoint>([[ROOT, { x: 0, y: 0 }]]);
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
      corner.set(child.id, here);
      walk(child, here);
    }
  };
  walk(done, { x: 0, y: 0 });
  const routes = new Map<string, ElkPoint[]>();
  for (const edge of edges) {
    const origin = corner.get(edge.container ?? ROOT) ?? { x: 0, y: 0 };
    const points = (edge.sections ?? []).flatMap((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);
    routes.set(
      edge.id,
      points.map((point) => ({ x: origin.x + point.x, y: origin.y + point.y })),
    );
  }
  // A frame comes before what it holds, as React Flow asks.
  const order = new Map(view.boxes.map((box, index) => [box.id, index]));
  placed.sort((a, b) => (order.get(a.box.id) ?? 0) - (order.get(b.box.id) ?? 0));
  return { placed, routes };
}
