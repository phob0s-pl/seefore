import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BaseEdge, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useViewportStore } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import { Scan } from 'lucide-react';
import type { ElkPoint } from 'elkjs/lib/elk-api.js';
import type { Box, Depth, View } from '../model/view.ts';
import { engine } from './elk.ts';
import { iconOf, KIND, typeWords } from './kinds.tsx';
import { layOut, nearestRoute } from './layout.ts';
import type { Band, Layout } from './layout.ts';
import { CanvasFrame } from './ui.tsx';

type BoxNode = Node<{ box: Box }, 'box' | 'frame'>;
type BandNode = Node<{ band: Band }, 'band'>;
type RouteEdge = Edge<{ points: ElkPoint[] }, 'route'>;

/** The room a fitted diagram leaves at each edge of the field, in pixels. */
const FIT = { padding: 40 };

/** The kind of a box in words: "External system", or "Store · database". */
function kindWords(box: Box): string {
  if (box.external) return `External ${(KIND[box.kind]?.word ?? box.kind).toLowerCase()}`;
  return typeWords(box.kind, box.type);
}

function KindIcon({ kind }: { kind: string }) {
  const Icon = iconOf(kind);
  return (
    <span className="model-symbol" aria-hidden="true">
      <Icon />
    </span>
  );
}

/** The points an arrow's line hangs on; React Flow needs them to draw an arrow at all. */
function Ends() {
  return (
    <>
      <Handle className="diagram-handle" type="target" position={Position.Left} isConnectable={false} />
      <Handle className="diagram-handle" type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

/** A box: its icon, its name and, small, its kind. */
function BoxCard({ data: { box } }: NodeProps<BoxNode>) {
  return (
    <div className={`architecture-node architecture-node-${box.kind}`} data-id={box.id}>
      <Ends />
      <div className="architecture-node-heading">
        <KindIcon kind={box.kind} />
        <div>
          <strong>{box.name}</strong>
          <small>{kindWords(box)}</small>
        </div>
      </div>
    </div>
  );
}

/** An opened system or app: a dashed outline that names itself and holds its boxes. */
function FrameCard({ data: { box } }: NodeProps<BoxNode>) {
  return (
    <div className="architecture-node architecture-boundary" data-id={box.id}>
      <Ends />
      <div className="architecture-node-heading">
        <KindIcon kind={box.kind} />
        <div>
          <strong>{box.name}</strong>
        </div>
      </div>
    </div>
  );
}

/** A zone at the Systems depth: a quiet band behind its boxes, its title at the top left. */
function BandCard({ data: { band } }: NodeProps<BandNode>) {
  return (
    <div className="diagram-band">
      <span className="diagram-band-title">{band.title}</span>
    </div>
  );
}

/** An arrow along the route ELK gave it, on a halo in the field's colour, its head at the far end, and at the start too when it goes both ways. */
function RouteLine({ id, data, markerStart, markerEnd }: EdgeProps<RouteEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <>
      <path className="diagram-edge-halo" d={path} fill="none" stroke="var(--surface-canvas)" strokeWidth={6} />
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={24} />
    </>
  );
}

const nodeTypes = { box: BoxCard, frame: FrameCard, band: BandCard };
const HEAD = { type: MarkerType.ArrowClosed, color: 'var(--graph-edge)' };
/** The heads of the picked line, in the accent colour. */
const PICKED_HEAD = { type: MarkerType.ArrowClosed, color: 'var(--accent)' };
const edgeTypes = { route: RouteLine };

function FitButton() {
  const { fitView } = useReactFlow();
  return (
    <ControlButton aria-label="Fit" title="Fit the diagram" onClick={() => void fitView(FIT)}>
      <Scan />
    </ControlButton>
  );
}

/** The room the panel takes at the field's right, as diagram.css places it, and the gap kept beside it. */
const PANEL = { width: 360, margin: 16, gap: 16 };

/**
 * Slides the diagram left, just enough, when what is picked lies partly under the panel and fits
 * in the room beside it. What is wider than that room is left where it is.
 */
function KeepClear({ picked, routes }: { picked: string | undefined; routes: Layout['routes'] }) {
  const { getInternalNode, getViewport, setViewport } = useReactFlow();
  const width = useViewportStore((state) => state.width);
  useEffect(() => {
    if (picked === undefined) return;
    const node = getInternalNode(picked);
    const at = node?.internals.positionAbsolute.x;
    const xs = node && at !== undefined ? [at, at + (node.width ?? node.measured.width ?? 0)] : (routes.get(picked) ?? []).map((point) => point.x);
    if (xs.length === 0) return;
    const { x, y, zoom } = getViewport();
    const left = Math.min(...xs) * zoom + x;
    const right = Math.max(...xs) * zoom + x;
    const free = width - Math.min(PANEL.width, width - 2 * PANEL.margin) - PANEL.margin - PANEL.gap;
    if (right <= free || right - left > free - PANEL.margin) return;
    void setViewport({ x: x - (right - free), y, zoom }, { duration: 200 });
  }, [picked, routes, width, getInternalNode, getViewport, setViewport]);
  return null;
}

/**
 * The diagram of a view: laid out by ELK, then drawn by React Flow on the hatched field. A click
 * on a box, a frame or a line picks it, and a click on the empty field or a band clears the
 * pick; the page holds it, and puts the panel that reads it in the field as `children`.
 */
export function Diagram({
  view,
  depth,
  picked,
  onPick,
  children,
}: {
  view: View;
  depth: Depth;
  picked: string | undefined;
  onPick: (id?: string) => void;
  children?: ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>();
  const [failed, setFailed] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<BoxNode | BandNode, RouteEdge>>();
  useEffect(() => {
    let current = true;
    layOut(view, depth, engine()).then(
      (done) => current && setLayout(done),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [view, depth]);

  const nodes = useMemo(
    () => [
      // The bands first, under the lines and the boxes.
      ...(layout?.bands ?? []).map(
        (band): BandNode => ({
          id: `#band-${band.zone}`,
          type: 'band',
          position: { x: band.x, y: band.y },
          width: band.width,
          height: band.height,
          zIndex: -1,
          // A band takes no click: the field under it does.
          style: { pointerEvents: 'none' },
          data: { band },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
        }),
      ),
      ...(layout?.placed ?? []).map(
        ({ box, x, y, width, height }): BoxNode => ({
          id: box.id,
          type: box.frame ? 'frame' : 'box',
          position: { x, y },
          ...(box.in !== undefined ? { parentId: box.in } : {}),
          ...(box.id === picked ? { className: 'picked' } : {}),
          width,
          height,
          data: { box },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
        }),
      ),
    ],
    [layout, picked],
  );
  const edges = useMemo(
    () =>
      view.arrows.map((arrow): RouteEdge => {
        const head = arrow.id === picked ? PICKED_HEAD : HEAD;
        return {
          id: arrow.id,
          source: arrow.from,
          target: arrow.to,
          type: 'route',
          data: { points: layout?.routes.get(arrow.id) ?? [] },
          ...(arrow.id === picked ? { className: 'picked' } : {}),
          ...(arrow.back !== undefined ? { markerStart: head } : {}),
          markerEnd: head,
          selectable: false,
          focusable: false,
        };
      }),
    [view, layout, picked],
  );

  return (
    <CanvasFrame label="Architecture diagram">
      {layout === undefined ? (
        <div className="canvas-empty">
          <span className={`canvas-caption${failed ? ' failed' : ''}`}>{failed ? 'The diagram could not be laid out.' : 'Laying out…'}</span>
        </div>
      ) : (
        <ReactFlow<BoxNode | BandNode, RouteEdge>
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={FIT}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          onNodeClick={(_event, node) => onPick(node.type === 'band' ? undefined : node.id)}
          onInit={setFlow}
          // Where lines run close, the reach of one lies on its neighbour: the click means the
          // line nearest to the mouse, not the one whose reach is on top.
          onEdgeClick={(event, edge) => onPick((flow && nearestRoute(layout.routes, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))) ?? edge.id)}
          onPaneClick={() => onPick()}
        >
          <Controls className="glass-group glass-group-column" position="bottom-left" showInteractive={false} showFitView={false}>
            <FitButton />
          </Controls>
          <KeepClear picked={picked} routes={layout.routes} />
        </ReactFlow>
      )}
      {children}
    </CanvasFrame>
  );
}
