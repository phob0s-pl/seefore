import { useEffect, useMemo, useState } from 'react';
import { BaseEdge, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import { Scan } from 'lucide-react';
import type { ElkPoint } from 'elkjs/lib/elk-api.js';
import type { Box, Depth, View } from '../model/view.ts';
import { engine } from './elk.ts';
import { iconOf, KIND, typeWords } from './kinds.tsx';
import { layOut } from './layout.ts';
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
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} />
    </>
  );
}

const nodeTypes = { box: BoxCard, frame: FrameCard, band: BandCard };
const HEAD = { type: MarkerType.ArrowClosed, color: 'var(--graph-edge)' };
const edgeTypes = { route: RouteLine };

function FitButton() {
  const { fitView } = useReactFlow();
  return (
    <ControlButton aria-label="Fit" title="Fit the diagram" onClick={() => void fitView(FIT)}>
      <Scan />
    </ControlButton>
  );
}

/** The diagram of a view: laid out by ELK, then drawn by React Flow on the hatched field. */
export function Diagram({ view, depth }: { view: View; depth: Depth }) {
  const [layout, setLayout] = useState<Layout>();
  const [failed, setFailed] = useState(false);
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
          className: 'diagram-band-node',
          position: { x: band.x, y: band.y },
          width: band.width,
          height: band.height,
          zIndex: -1,
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
    [layout],
  );
  const edges = useMemo(
    () =>
      view.arrows.map(
        (arrow): RouteEdge => ({
          id: arrow.id,
          source: arrow.from,
          target: arrow.to,
          type: 'route',
          data: { points: layout?.routes.get(arrow.id) ?? [] },
          ...(arrow.back !== undefined ? { markerStart: HEAD } : {}),
          markerEnd: HEAD,
          selectable: false,
          focusable: false,
        }),
      ),
    [view, layout],
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
        >
          <Controls className="glass-group glass-group-column" position="bottom-left" showInteractive={false} showFitView={false}>
            <FitButton />
          </Controls>
        </ReactFlow>
      )}
    </CanvasFrame>
  );
}
