import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import { BaseEdge, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useViewportStore } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import { Scan } from 'lucide-react';
import type { ElkPoint } from 'elkjs/lib/elk-api.js';
import { litByStep } from '../model/flow.ts';
import type { Lights, Mark } from '../model/flow.ts';
import { litBy } from '../model/view.ts';
import type { Box, Depth, View } from '../model/view.ts';
import { engine } from './elk.ts';
import { iconOf, KIND, typeWords } from './kinds.tsx';
import { layOut, nearestRoute } from './layout.ts';
import type { Band, Layout, Shape } from './layout.ts';
import { CanvasFrame } from './ui.tsx';

type BoxNode = Node<{ box: Box; mark?: Shown }, 'box' | 'frame'>;
type BandNode = Node<{ band: Band }, 'band'>;
type RouteEdge = Edge<{ points: ElkPoint[] }, 'route'>;

/** The room a fitted diagram leaves at each edge of the field, in pixels. */
const FIT = { padding: 40 };

/** A mark that is shown: what a change does to a box or a line that it does not leave as it is. */
type Shown = Exclude<Mark, 'same'>;

/** The sign of each mark and what it says: on a box, by a frame's name, and in the legend. */
const SIGNS: Record<Shown, { sign: string; words: string }> = {
  added: { sign: '+', words: 'Newly passed' },
  removed: { sign: '−', words: 'No longer passed' },
  updated: { sign: '~', words: 'Updated by the change' },
};

/** The mark of a box or a line that is shown, or none: on a flow's own page, and where the change leaves it as it is. */
const shownOf = (marks: ReadonlyMap<string, Mark> | undefined, id: string): Shown | undefined => {
  const mark = marks?.get(id);
  return mark === undefined || mark === 'same' ? undefined : mark;
};

/** The round sign of a mark, in its colour on a dark ground. In the legend its words stand beside it, so it says nothing itself. */
function MarkSign({ mark, said = true }: { mark: Shown; said?: boolean }) {
  return (
    <span className={`diagram-mark-sign mark-${mark}`} {...(said ? { role: 'img', 'aria-label': SIGNS[mark].words } : { 'aria-hidden': true })}>
      {SIGNS[mark].sign}
    </span>
  );
}

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

/**
 * A box: its icon, its name and, small, its kind. Under a change, a box with a mark has its sign
 * at its top right; diagram.css gives it the band and the wash. It is drawn again only when its
 * box changes, not when its class does.
 */
const BoxCard = memo(function BoxCard({ data: { box, mark } }: NodeProps<BoxNode>) {
  return (
    <div className={`architecture-node architecture-node-${box.kind}`} data-id={box.id} data-mark={mark}>
      <Ends />
      {mark !== undefined && <MarkSign mark={mark} />}
      <div className="architecture-node-heading">
        <KindIcon kind={box.kind} />
        <div>
          <strong>{box.name}</strong>
          <small>{kindWords(box)}</small>
        </div>
      </div>
    </div>
  );
});

/** An opened system or app: a dashed outline that names itself and holds its boxes. Under a change, a frame with a mark has its sign after its name. */
const FrameCard = memo(function FrameCard({ data: { box, mark } }: NodeProps<BoxNode>) {
  return (
    <div className="architecture-node architecture-boundary" data-id={box.id} data-mark={mark}>
      <Ends />
      <div className="architecture-node-heading">
        <KindIcon kind={box.kind} />
        <div>
          <strong>{box.name}</strong>
        </div>
        {mark !== undefined && <MarkSign mark={mark} />}
      </div>
    </div>
  );
});

/** A zone at the Systems depth: a quiet band behind its boxes, its title at the top left. */
function BandCard({ data: { band } }: NodeProps<BandNode>) {
  return (
    <div className="diagram-band">
      <span className="diagram-band-title">{band.title}</span>
    </div>
  );
}

/** An arrow along the route ELK gave it, on a halo in the field's colour, its head at the far end, and at the start too when it goes both ways. */
const RouteLine = memo(function RouteLine({ id, data, markerStart, markerEnd }: EdgeProps<RouteEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <>
      <path className="diagram-edge-halo" d={path} fill="none" stroke="var(--surface-canvas)" strokeWidth={6} />
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={24} />
    </>
  );
});

const nodeTypes = { box: BoxCard, frame: FrameCard, band: BandCard };
const HEAD = { type: MarkerType.ArrowClosed, color: 'var(--graph-edge)' };
/** The heads of the picked line, in the accent colour. */
const PICKED_HEAD = { type: MarkerType.ArrowClosed, color: 'var(--accent)' };
/** The heads of a line with a mark, in its colour, picked or not. */
const MARK_HEADS: Record<Shown, typeof HEAD> = {
  added: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
  removed: { type: MarkerType.ArrowClosed, color: 'var(--danger)' },
  updated: { type: MarkerType.ArrowClosed, color: 'var(--caution)' },
};
const edgeTypes = { route: RouteLine };

/** The room a fitted diagram leaves at the top of the field while the legend stands there: the legend's and a gap under it. */
const UNDER_LEGEND = 64;

/**
 * How a diagram is fitted to the field. A flow's own diagram is small, so it is never made
 * larger than its boxes were drawn to be: a flow of four boxes would else fill the field. Under
 * a legend, the diagram starts below it.
 */
const fitOf = (shape: Shape, legend = false) => {
  const room = legend ? { padding: { top: UNDER_LEGEND, right: FIT.padding, bottom: FIT.padding, left: FIT.padding } } : FIT;
  return shape === 'flow' ? { ...room, maxZoom: 1 } : room;
};

function FitButton({ shape, legend }: { shape: Shape; legend: boolean }) {
  const { fitView } = useReactFlow();
  return (
    <ControlButton aria-label="Fit" title="Fit the diagram" onClick={() => void fitView(fitOf(shape, legend))}>
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

/** How long the mouse rests on a box, a line or nothing before the highlight follows it, in milliseconds. */
const REST = 100;
/** The zoom below which the names on the boxes are too small to read, and the label says a box's name. */
const SMALL = 0.6;
/**
 * The lift of a bright line over the faded ones. React Flow lifts a line by the depth of the boxes
 * it joins, which are at most two frames deep, so a bright line lies over every faded one.
 */
const LIFT = 3;
/** The label stands this far right of and below the mouse, and this far inside the field's edge. */
const LABEL = { offset: 14, edge: 8 };

/**
 * One object for each node or line and each look of it, made once: a change of focus gives a new
 * object only to what changes its look, and React Flow passes over the rest.
 */
function looks<T>(): (key: string, make: () => T) => T {
  const made = new Map<string, T>();
  return (key, make) => {
    let found = made.get(key);
    if (found === undefined) {
      found = make();
      made.set(key, found);
    }
    return found;
  };
}

/**
 * The label at the mouse: over a line, the two boxes it joins; over a box, its name and its type,
 * but only while the names on the boxes are too small to read. It moves with the mouse by `place`,
 * without a render.
 */
function HoverLabel({ hovered, view, label, place }: { hovered: string | undefined; view: View; label: RefObject<HTMLDivElement | null>; place: () => void }) {
  const small = useViewportStore((state) => state.transform[2] < SMALL);
  const boxes = useMemo(() => new Map(view.boxes.map((box) => [box.id, box])), [view]);
  const arrow = view.arrows.find((each) => each.id === hovered);
  const box = hovered === undefined ? undefined : boxes.get(hovered);
  const name = (id: string) => boxes.get(id)?.name ?? id;
  const words: [string, string?] | undefined =
    arrow !== undefined ? [`${name(arrow.from)} ${arrow.back !== undefined ? '↔' : '→'} ${name(arrow.to)}`] : box !== undefined && !box.frame && small ? [box.name, kindWords(box)] : undefined;
  const text = words?.join('\n');
  useLayoutEffect(() => place(), [text, place]);
  if (words === undefined) return null;
  return (
    <div ref={label} role="tooltip" className="diagram-hover-label">
      <strong>{words[0]}</strong>
      {words[1] !== undefined && <small>{words[1]}</small>}
    </div>
  );
}

/** What the colours of an updated flow say: a small glass at the field's top left. */
function Legend() {
  return (
    <ul className="diagram-legend" aria-label="Legend">
      {(Object.keys(SIGNS) as Shown[]).map((mark) => (
        <li key={mark}>
          <MarkSign mark={mark} said={false} />
          {SIGNS[mark].words}
        </li>
      ))}
    </ul>
  );
}

/**
 * The diagram of a view: laid out by ELK, then drawn by React Flow on the hatched field. A click
 * on a box, a frame or a line picks it, and a click on the empty field or a band clears the
 * pick; the page holds it, and puts the panel that reads it in the field as `children`. The mouse
 * over a box or a line, or else the pick, fades all but it and what it joins, and a label at the
 * mouse says what is under it.
 *
 * On the page of a flow, `step` is what the picked step lights: its line, drawn as a pick is with
 * one head where the step travels to, or its box, outlined. With no hover and no pick, all but it
 * and what it joins fades. A change of step lays nothing out. A flow's own diagram has the
 * `shape` of a flow: it is read top to bottom.
 *
 * Under a change, `marks` says what the change does to each box, frame and line: a box bears the
 * colour inside its border, a frame on its outline, a line on its stroke and its heads, and a
 * legend says what the colours mean. The border keeps the colour of the box's kind, and the
 * outline and the brightness still say what is picked and what the step lights.
 */
export function Diagram({
  view,
  depth,
  picked,
  onPick,
  step,
  shape = 'model',
  marks,
  children,
}: {
  view: View;
  depth: Depth;
  picked: string | undefined;
  onPick: (id?: string) => void;
  step?: Lights;
  shape?: Shape;
  marks?: ReadonlyMap<string, Mark> | undefined;
  children?: ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>();
  const [failed, setFailed] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<BoxNode | BandNode, RouteEdge>>();
  useEffect(() => {
    let current = true;
    layOut(view, depth, engine(), shape).then(
      (done) => current && setLayout(done),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [view, depth, shape]);

  // The nodes and lines as laid out, with nothing in focus.
  const placed = useMemo(
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
      ...(layout?.placed ?? []).map(({ box, x, y, width, height }): BoxNode => {
        const mark = shownOf(marks, box.id);
        return {
          id: box.id,
          type: box.frame ? 'frame' : 'box',
          position: { x, y },
          ...(box.in !== undefined ? { parentId: box.in } : {}),
          width,
          height,
          // Its size is known, so that a node given anew for a change of class keeps where its
          // lines end, and its lines do not blink out while it is measured again.
          measured: { width, height },
          ...(mark !== undefined ? { className: `mark-${mark}` } : {}),
          data: mark !== undefined ? { box, mark } : { box },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
        };
      }),
    ],
    [layout, marks],
  );
  const lines = useMemo(
    () =>
      view.arrows.map((arrow): RouteEdge => {
        const mark = shownOf(marks, arrow.id);
        const head = mark !== undefined ? MARK_HEADS[mark] : HEAD;
        return {
          id: arrow.id,
          source: arrow.from,
          target: arrow.to,
          type: 'route',
          data: { points: layout?.routes.get(arrow.id) ?? [] },
          ...(arrow.back !== undefined ? { markerStart: head } : {}),
          markerEnd: head,
          ...(mark !== undefined ? { className: `mark-${mark}` } : {}),
          selectable: false,
          focusable: false,
        };
      }),
    [view, layout, marks],
  );
  // The looks last as long as the nodes and lines they are made from.
  const nodeLook = useMemo(() => looks<BoxNode | BandNode>(), [placed]);
  const lineLook = useMemo(() => looks<RouteEdge>(), [lines]);

  // The legend stands only where something bears a colour.
  const legend = useMemo(() => [...(marks?.values() ?? [])].some((mark) => mark !== 'same'), [marks]);

  // What the mouse is over, a box or a line, as it moves. It becomes the hover once it has stayed
  // the same for a moment, and not while the field is dragged or zoomed. The hover shows over the
  // pick, and when there is none the pick's highlight holds.
  const [hovered, setHovered] = useState<string>();
  const [moving, setMoving] = useState(false);
  const under = useRef<string | undefined>(undefined);
  const still = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const settle = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(under.current), REST);
  };
  const over = (id: string | undefined) => {
    if (id === under.current) return;
    under.current = id;
    if (still.current) settle();
  };
  const focus = hovered ?? picked;
  const lit = useMemo(() => (focus !== undefined ? litBy(view, focus) : step !== undefined ? litByStep(view, step) : undefined), [view, focus, step]);
  // The step's own line and box, which keep their look under a hover or a pick.
  const steppedLine = step !== undefined && 'arrow' in step ? step : undefined;
  const steppedBox = step !== undefined && 'box' in step ? step.box : undefined;

  const nodes = useMemo(() => {
    const bright = lit && new Set(lit.boxes);
    return placed.map((node) => {
      if (node.type === 'band') return node;
      // A box's mark is its own class, and what is in focus is added to it.
      const own = node.className ?? '';
      const className = [own, node.id === picked ? 'picked' : '', node.id === steppedBox ? 'stepped' : '', bright && !bright.has(node.id) ? 'faded' : ''].filter((each) => each !== '').join(' ');
      return className === own ? node : nodeLook(`${node.id} ${className}`, () => ({ ...node, className }));
    });
  }, [placed, nodeLook, lit, picked, steppedBox]);
  const edges = useMemo(() => {
    const bright = lit && new Set(lit.arrows);
    return lines.map((line) => {
      const chosen = line.id === picked;
      // The way the step travels on its line: its one head is at the start when it goes back.
      const way = steppedLine?.arrow === line.id ? (steppedLine.back ? 'back' : 'on') : '';
      const faded = bright !== undefined && !bright.has(line.id);
      const lifted = (bright !== undefined && !faded) || way !== '';
      if (!chosen && !faded && !lifted) return line;
      return lineLook(`${line.id} ${chosen} ${faded} ${lifted} ${way}`, () => {
        const { markerStart, markerEnd, className, ...rest } = line;
        // A line with a mark keeps its colour when it is lit, and its heads keep it too.
        const mark = shownOf(marks, line.id);
        const bold = mark !== undefined ? MARK_HEADS[mark] : PICKED_HEAD;
        const heads = way === 'back' ? { markerStart: bold } : way === 'on' ? { markerEnd: bold } : chosen ? { markerEnd: bold, ...(markerStart !== undefined ? { markerStart: bold } : {}) } : { markerStart, markerEnd };
        return {
          ...rest,
          ...heads,
          className: [className ?? '', chosen ? 'picked' : '', way !== '' ? 'stepped' : '', faded ? 'faded' : ''].filter((each) => each !== '').join(' '),
          ...(lifted ? { zIndex: LIFT } : {}),
        };
      });
    });
  }, [lines, lineLook, lit, picked, steppedLine, marks]);

  // The label follows the mouse: each move writes where it stands, and no render is made for it.
  // It keeps inside the field, and clear of the panel while one is open; where there is no room
  // right of or below the mouse, it stands left of or above it.
  const label = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number }>(undefined);
  const open = picked !== undefined;
  const place = useCallback(() => {
    const tag = label.current;
    const field = tag?.offsetParent?.getBoundingClientRect();
    if (tag === null || field === undefined || mouse.current === undefined) return;
    const right = field.width - (open ? Math.min(PANEL.width, field.width - 2 * PANEL.margin) + PANEL.margin : 0) - LABEL.edge;
    const bottom = field.height - LABEL.edge;
    const x = mouse.current.x - field.left;
    const y = mouse.current.y - field.top;
    const left = x + LABEL.offset + tag.offsetWidth <= right ? x + LABEL.offset : x - LABEL.offset - tag.offsetWidth;
    const top = y + LABEL.offset + tag.offsetHeight <= bottom ? y + LABEL.offset : y - LABEL.offset - tag.offsetHeight;
    tag.style.transform = `translate(${Math.round(Math.max(LABEL.edge, left))}px, ${Math.round(Math.max(LABEL.edge, top))}px)`;
  }, [open]);
  const follow = (event: MouseEvent) => {
    mouse.current = { x: event.clientX, y: event.clientY };
    if (label.current !== null) place();
  };

  /** The line a click or the mouse at an event means: the nearest to it, by the rule of B6. */
  const lineAt = (event: MouseEvent, edge: RouteEdge): string => (flow && layout && nearestRoute(layout.routes, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))) ?? edge.id;

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
          fitViewOptions={fitOf(shape, legend)}
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
          onEdgeClick={(event, edge) => onPick(lineAt(event, edge))}
          onPaneClick={() => onPick()}
          // A frame holds other boxes and a band is no thing of the model: over them the hover is none.
          onNodeMouseEnter={(_event, node) => node.type === 'box' && over(node.id)}
          onNodeMouseLeave={(_event, node) => node.type === 'box' && over(undefined)}
          onEdgeMouseEnter={(event, edge) => over(lineAt(event, edge))}
          onEdgeMouseMove={(event, edge) => over(lineAt(event, edge))}
          onEdgeMouseLeave={() => over(undefined)}
          onMoveStart={() => {
            still.current = false;
            clearTimeout(timer.current);
            setMoving(true);
          }}
          onMoveEnd={() => {
            still.current = true;
            setMoving(false);
            settle();
          }}
          onMouseMove={follow}
        >
          <Controls className="glass-group glass-group-column" position="bottom-left" showInteractive={false} showFitView={false}>
            <FitButton shape={shape} legend={legend} />
          </Controls>
          <KeepClear picked={picked} routes={layout.routes} />
          <HoverLabel hovered={moving ? undefined : hovered} view={view} label={label} place={place} />
        </ReactFlow>
      )}
      {layout !== undefined && legend && <Legend />}
      {children}
    </CanvasFrame>
  );
}
