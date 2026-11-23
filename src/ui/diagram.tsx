import { useEffect, useMemo, useState } from 'react';
import { BaseEdge, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import { AppWindow, Boxes, Database, Network, Router, Scan, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ElkPoint } from 'elkjs/lib/elk-api.js';
import type { Box, View } from '../model/view.ts';
import { layOut } from './layout.ts';
import type { Layout } from './layout.ts';
import { CanvasFrame } from './ui.tsx';

type BoxNode = Node<{ box: Box }, 'box' | 'frame'>;
type RouteEdge = Edge<{ points: ElkPoint[] }, 'route'>;

/** What each kind of box is called on it, and its icon. */
const KIND: Record<string, { word: string; icon: LucideIcon }> = {
  people: { word: 'Person', icon: UserRound },
  systems: { word: 'System', icon: Network },
  apps: { word: 'App', icon: AppWindow },
  stores: { word: 'Store', icon: Database },
  components: { word: 'Component', icon: Boxes },
  infrastructure: { word: 'Infrastructure', icon: Router },
};

/** The room a fitted diagram leaves at each edge of the field, in pixels. */
const FIT = { padding: 40 };

/** The kind of a box in words: "External system", or "Store · database". */
function kindWords(box: Box): string {
  const word = KIND[box.kind]?.word ?? box.kind;
  if (box.external) return `External ${word.toLowerCase()}`;
  return box.type !== undefined ? `${word} · ${box.type}` : word;
}

function KindIcon({ kind }: { kind: string }) {
  const Icon = KIND[kind]?.icon ?? Boxes;
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

/** An arrow along the route ELK gave it, on a halo in the field's colour, its head at the far end. */
function RouteLine({ id, data, markerEnd }: EdgeProps<RouteEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <>
      <path className="diagram-edge-halo" d={path} fill="none" stroke="var(--surface-canvas)" strokeWidth={6} />
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
    </>
  );
}

const nodeTypes = { box: BoxCard, frame: FrameCard };
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
export function Diagram({ view }: { view: View }) {
  const [layout, setLayout] = useState<Layout>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    layOut(view).then(
      (done) => current && setLayout(done),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [view]);

  const nodes = useMemo(
    () =>
      (layout?.placed ?? []).map(
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
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--graph-edge)' },
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
        <ReactFlow<BoxNode, RouteEdge>
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
