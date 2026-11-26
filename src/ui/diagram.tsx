import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, RefObject } from 'react';
import { BaseEdge, ControlButton, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useViewportStore } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import { Layers, Scan, Split } from 'lucide-react';
import type { ElkPoint } from 'elkjs/lib/elk-api.js';
import { litByStep } from '../model/flow.ts';
import type { ItemAt, Lights, Mark } from '../model/flow.ts';
import { litBy } from '../model/view.ts';
import type { Box, Depth, View } from '../model/view.ts';
import { engine } from './elk.ts';
import { iconOf, KIND, typeWords } from './kinds.tsx';
import { keeper, nearestRoute } from './layout.ts';
import type { Band, Layout, Shape } from './layout.ts';
import { CanvasFrame } from './ui.tsx';

/**
 * A row in a store's box on the page of a flow: an item of the flow, by its data's id and name;
 * what it is at the place the page stands at, and the step's word where the current step touches
 * it (C5b); the words of its condition, where it stands under one; under a change, what the change
 * does to it, where it does something; and whether it is picked.
 */
export type Row = { data: string; name: string; condition?: string; mark?: Exclude<Mark, 'same'>; picked?: true } & ItemAt;

type BoxNode = Node<{ box: Box; mark?: Shown; rows?: readonly Row[] }, 'box' | 'frame'>;
type BandNode = Node<{ band: Band }, 'band'>;
type RouteEdge = Edge<{ points: ElkPoint[] }, 'route'>;

/** The room a fitted diagram leaves at each edge of the field, in pixels. */
const FIT = { padding: 40 };
/** How far out and how close the field goes. */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;

/** A mark that is shown: what a change does to a box or a line that it does not leave as it is. */
type Shown = Exclude<Mark, 'same'>;

/** The sign of each mark and what it says: on a box, by a frame's name, and in the legend; and the word a row bears for it. */
const SIGNS: Record<Shown, { sign: string; words: string; word: string }> = {
  added: { sign: '+', words: 'Newly passed', word: 'Added' },
  removed: { sign: '−', words: 'No longer passed', word: 'Removed' },
  updated: { sign: '~', words: 'Updated by the change', word: 'Updated' },
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

/** What the small stack on a closed box says, by the depth of the view that opens the box. */
const INSIDE: Partial<Record<Depth, string>> = { containers: 'Has containers inside', components: 'Has components inside' };

/**
 * The rows of a store's box, one for each item of the flow, in the order of their first act: a
 * button each, with the data's name, the sign of a condition straight after it, and at the right
 * the step's word where the current step touches it, or "only read". A hollow, a kept and a gone
 * row bear no word. Under a change, a row the change marks bears the mark's word in place of
 * "only read", in every state, and keeps its rule at the step's own word. diagram.css gives each
 * its look by what it is.
 */
function Rows({ rows }: { rows: readonly Row[] }) {
  return (
    <div className="diagram-rows">
      {rows.map((row) => {
        const word = row.word ?? (row.mark !== undefined ? SIGNS[row.mark].word : row.is === 'only-read' ? 'only read' : undefined);
        return (
          <button
            key={row.data}
            type="button"
            className={row.mark !== undefined ? `diagram-row mark-${row.mark}` : 'diagram-row'}
            data-item={row.data}
            data-is={row.is}
            data-lit={row.word !== undefined ? '' : undefined}
            data-mark={row.mark}
            data-picked={row.picked === true ? '' : undefined}
          >
            <span className="diagram-row-name">{row.name}</span>
            {row.condition !== undefined && (
              <span className="diagram-row-sign" role="img" aria-label={row.condition} title={row.condition}>
                <Split aria-hidden="true" />
              </span>
            )}
            {word !== undefined && <span className="diagram-row-word">{word}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A box: its icon, its name and, small, its kind. Under a change, a box with a mark has its sign
 * at its top right; diagram.css gives it the band and the wash. A closed box that a deeper view
 * opens has a small stack at its lower right. On the page of a flow a store's box holds a row for
 * each item, beside the box's own card, so that the box can fade by its parts. It is drawn again
 * only when its box or its rows change, not when its class does.
 */
const BoxCard = memo(function BoxCard({ data: { box, mark, rows } }: NodeProps<BoxNode>) {
  const inside = box.opens !== undefined ? INSIDE[box.opens] : undefined;
  return (
    <>
      <div className={`architecture-node architecture-node-${box.kind}`} data-id={box.id} data-mark={mark}>
        <Ends />
        {mark !== undefined && <MarkSign mark={mark} />}
        {inside !== undefined && (
          <span className="diagram-inside" role="img" aria-label={inside} title={inside}>
            <Layers aria-hidden="true" />
          </span>
        )}
        <div className="architecture-node-heading">
          <KindIcon kind={box.kind} />
          <div>
            <strong>{box.name}</strong>
            <small>{kindWords(box)}</small>
          </div>
        </div>
      </div>
      {rows !== undefined && rows.length > 0 && <Rows rows={rows} />}
    </>
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

/**
 * An arrow along the route ELK gave it, on a halo in the field's colour, its head at the far end,
 * and at the start too when it goes both ways. It has no path to catch the mouse: the diagram
 * finds the line the mouse means.
 */
const RouteLine = memo(function RouteLine({ id, data, markerStart, markerEnd }: EdgeProps<RouteEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <>
      <path className="diagram-edge-halo" d={path} fill="none" stroke="var(--surface-canvas)" strokeWidth={6} />
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={0} />
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

/** How the field comes to a new place by itself: in a short glide, or at once when the system asks for less motion. */
const glide = (): { duration: number } => ({ duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : GLIDE });

/**
 * Slides the diagram left, just enough, when what is picked lies partly under the panel and fits
 * in the room beside it. What is wider than that room is left where it is.
 */
function KeepClear({ picked, routes, again }: { picked: string | undefined; routes: Layout['routes']; again: number }) {
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
    void setViewport({ x: x - (right - free), y, zoom }, glide());
    // `again` counts the times the slide is asked for anew, since a press of the mouse stops it.
  }, [picked, routes, width, again, getInternalNode, getViewport, setViewport]);
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
/** How far from a line the mouse still means it, on each side, in the diagram's own pixels. */
const REACH = 12;
/** The zoom a double click on a box lands at, where its name can be read; one that is closer stays. */
const READ = 0.8;
/** How long the field takes to come to a new place by itself, in milliseconds. */
const GLIDE = 200;
/** A hand that slips fewer pixels than this between press and release has clicked, not dragged. */
const SLIP = 4;
/** The least room beside the panel into which something is brought. With less, the whole field is the room. */
const ROOM = 240;
/** The second click of a double click comes within this time of the first, in milliseconds, and no farther from it than this, in pixels. */
const TWICE = { within: 800, near: 8 };

/** The layouts made on this page, kept so that a view seen before stands at once. */
const layouts = keeper();

/**
 * What the mouse means where it is: a row in a store's box, by its box's id and its data's; a box;
 * a line within its reach; a frame; or the field with nothing on it.
 */
type Meant = { kind: 'box' | 'line' | 'frame'; id: string } | { kind: 'row'; id: string; data: string } | { kind: 'field' };

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
 * A line takes no mouse itself: the mouse means the line that runs nearest to it within its
 * reach, so a drag moves the field wherever it starts. A double click brings what its first click
 * meant near enough to read: a box to the middle of the room beside the panel, a frame fitted
 * into that room, the empty field twice as close; on a line nothing but the slide clear of the
 * panel. A layout is kept, so a view seen before stands at once.
 *
 * On the page of a flow, `step` is what the picked step lights: its line, drawn as a pick is with
 * one head where the step travels to, or its box, outlined. With no hover and no pick, all but it
 * and what it joins fades. A change of step lays nothing out. A flow's own diagram has the
 * `shape` of a flow: it is read top to bottom.
 *
 * There `rows` holds, by a store's id, the rows its box draws, as the page hands them: never from
 * the layout, which a change of step keeps. A change of step draws again only the boxes whose rows
 * look otherwise. A box with rows fades by its parts: its card to a quarter, a row that the flow
 * has touched to 0.72, a hollow row not at all. A click on a row picks its item, by `onItem`, and
 * not its box: the mouse means a row before the box it is in, its hover is its box's, the field
 * slides to keep its box clear of the panel, and a double click brings its box.
 *
 * Under a change, `marks` says what the change does to each box, frame and line: a box bears the
 * colour inside its border, a frame on its outline, a line on its stroke and its heads, and a
 * legend says what the colours mean. The border keeps the colour of the box's kind, and the
 * outline and the brightness still say what is picked and what the step lights. A row bears the
 * mark of its item as the page hands it, a rule at its left and its word; it calls no legend.
 */
export function Diagram({
  view,
  depth,
  picked,
  onPick,
  step,
  shape = 'model',
  marks,
  rows,
  onItem,
  children,
}: {
  view: View;
  depth: Depth;
  picked: string | undefined;
  onPick: (id?: string) => void;
  step?: Lights;
  shape?: Shape;
  marks?: ReadonlyMap<string, Mark> | undefined;
  rows?: ReadonlyMap<string, readonly Row[]> | undefined;
  onItem?: (store: string, data: string) => void;
  children?: ReactNode;
}) {
  // A view laid out before on this page stands at once.
  const [layout, setLayout] = useState<Layout | undefined>(() => layouts.get(view, depth, shape));
  const [failed, setFailed] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<BoxNode | BandNode, RouteEdge>>();
  useEffect(() => {
    let current = true;
    layouts.lay(view, depth, engine(), shape).then(
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
  // The looks last as long as the nodes and lines they are made from. A box with rows has its data
  // made once for each look of its rows, so that a box whose rows look as they did is not drawn again.
  const nodeLook = useMemo(() => looks<BoxNode | BandNode>(), [placed]);
  const rowLook = useMemo(() => looks<BoxNode['data']>(), [placed]);
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
      const { data } = node;
      if (node.type === 'band' || !('box' in data)) return node;
      // A store's rows, by its id, from what the page hands: the layout only made room for them.
      const shown = rows?.get(node.id) ?? [];
      const said = shown.length > 0 ? JSON.stringify(shown) : '';
      const held = said === '' ? data : rowLook(`${node.id} ${said}`, () => ({ ...data, rows: shown }));
      // A box's mark is its own class, and what is in focus is added to it. A box with rows fades by its parts.
      const own = node.className ?? '';
      const className = [own, said !== '' ? 'has-rows' : '', node.id === picked ? 'picked' : '', node.id === steppedBox ? 'stepped' : '', bright && !bright.has(node.id) ? 'faded' : ''].filter((each) => each !== '').join(' ');
      return className === own && held === data ? node : nodeLook(`${node.id} ${className} ${said}`, (): BoxNode => ({ ...(node as BoxNode), className, data: held }));
    });
  }, [placed, nodeLook, rowLook, rows, lit, picked, steppedBox]);
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
  // The box of a picked row, which the field keeps clear of the panel as it keeps a picked box.
  const holder = useMemo(() => [...(rows ?? [])].find(([, each]) => each.some((row) => row.picked === true))?.[0], [rows]);
  const open = picked !== undefined || holder !== undefined;
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
  /**
   * What the mouse means at a point of the screen, with what the browser finds under it there: a
   * row before the box it is in, a box before a line, a line before the frame or the field it runs
   * over, by the rule of B6 the nearest of those within reach. Nothing over the zoom column, and
   * nothing outside the field.
   */
  const meantAt = (target: EventTarget | null, x: number, y: number): Meant | undefined => {
    if (!(target instanceof Element) || target.closest('.react-flow') === null || target.closest('.react-flow__panel') !== null) return undefined;
    const node = target.closest('.react-flow__node');
    const id = node?.getAttribute('data-id') ?? undefined;
    const row = target.closest('.diagram-row')?.getAttribute('data-item') ?? undefined;
    if (id !== undefined && row !== undefined) return { kind: 'row', id, data: row };
    if (id !== undefined && node?.classList.contains('react-flow__node-box')) return { kind: 'box', id };
    const line = flow && layout ? nearestRoute(layout.routes, flow.screenToFlowPosition({ x, y }), REACH) : undefined;
    if (line !== undefined) return { kind: 'line', id: line };
    return id !== undefined && node?.classList.contains('react-flow__node-frame') ? { kind: 'frame', id } : { kind: 'field' };
  };
  const meant = (event: MouseEvent): Meant | undefined => meantAt(event.target, event.clientX, event.clientY);
  /** What the hover is on: a box or a line; over a row, its box. Over a line the hand shows, as over a box. */
  const root = useRef<HTMLDivElement>(null);
  const hoverOn = (at: Meant | undefined) => {
    root.current?.toggleAttribute('data-on-line', at?.kind === 'line');
    over(at?.kind === 'box' || at?.kind === 'line' || at?.kind === 'row' ? at.id : undefined);
  };
  const follow = (event: MouseEvent) => {
    mouse.current = { x: event.clientX, y: event.clientY };
    if (label.current !== null) place();
    hoverOn(meant(event));
  };
  // The click before, for the second click of a double click: what it meant, and where and when it was.
  const first = useRef<{ at: Meant; x: number; y: number; time: number }>(undefined);
  const [again, setAgain] = useState(0);
  const doubled = (event: MouseEvent): boolean => {
    const was = first.current;
    return event.detail === 2 && was !== undefined && event.timeStamp - was.time < TWICE.within && Math.hypot(event.clientX - was.x, event.clientY - was.y) < TWICE.near;
  };

  /**
   * A double click brings what its first click meant near enough to read. A box, or the box of a
   * row, comes to the middle of the room beside the panel its pick has opened, at the zoom of
   * reading or closer if the field is closer; a frame is fitted into that room, at most at its
   * drawn size; the empty field comes twice as close about the mouse, or goes twice as far with
   * Shift held. On a line the field only slides clear of the panel again, since the second press
   * stopped that slide.
   */
  const bring = ({ at, x: left, y: top }: { at: Meant; x: number; y: number }, away: boolean) => {
    const field = root.current?.getBoundingClientRect();
    if (flow === undefined || field === undefined) return;
    if (at.kind === 'line') {
      setAgain((count) => count + 1);
      return;
    }
    const { x, y, zoom } = flow.getViewport();
    if (at.kind === 'field') {
      const to = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, away ? zoom / 2 : zoom * 2));
      const [px, py] = [left - field.left, top - field.top];
      void flow.setViewport({ x: px - ((px - x) * to) / zoom, y: py - ((py - y) * to) / zoom, zoom: to }, glide());
      return;
    }
    const node = flow.getInternalNode(at.id);
    if (node === undefined) return;
    const [width, height] = [node.width ?? node.measured.width ?? 0, node.height ?? node.measured.height ?? 0];
    // The room beside the panel; in a field too narrow to have one, the field itself.
    const beside = field.width - Math.min(PANEL.width, field.width - 2 * PANEL.margin) - PANEL.margin - PANEL.gap;
    const room = { width: beside >= ROOM ? beside : field.width, height: field.height };
    const fitted = Math.min(1, (room.width - 2 * FIT.padding) / Math.max(1, width), (room.height - 2 * FIT.padding) / Math.max(1, height));
    const to = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, at.kind === 'box' || at.kind === 'row' ? Math.max(zoom, READ) : fitted));
    const middle = { x: node.internals.positionAbsolute.x + width / 2, y: node.internals.positionAbsolute.y + height / 2 };
    void flow.setViewport({ x: room.width / 2 - middle.x * to, y: room.height / 2 - middle.y * to, zoom: to }, glide());
  };

  /**
   * A click on the field: one picks what it means, a box, a line or a frame, or a row's item, or
   * clears the pick. The second of a double click brings what the first one meant, whatever lies
   * under the mouse by then: the pick's panel, or the slide clear of it, may have changed that. A
   * third does nothing.
   */
  const pick = (event: MouseEvent) => {
    if (event.detail > 1) {
      if (doubled(event) && first.current !== undefined) bring(first.current, event.shiftKey);
      return;
    }
    const at = meant(event);
    first.current = at === undefined ? undefined : { at, x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (at?.kind === 'row') onItem?.(at.id, at.data);
    else onPick(at === undefined || at.kind === 'field' ? undefined : at.id);
  };
  /** The second click of a double click that lands on the panel the first one opened is the diagram's, and the panel does not hear it. */
  const onPanel = (event: MouseEvent) => {
    if (!doubled(event) || first.current === undefined || !(event.target instanceof Element) || event.target.closest('.react-flow') !== null) return;
    event.preventDefault();
    event.stopPropagation();
    bring(first.current, event.shiftKey);
  };

  return (
    <CanvasFrame label="Architecture diagram" onClickCapture={onPanel}>
      {layout === undefined ? (
        <div className="canvas-empty">
          <span className={`canvas-caption${failed ? ' failed' : ''}`}>{failed ? 'The diagram could not be laid out.' : 'Laying out…'}</span>
        </div>
      ) : (
        <ReactFlow<BoxNode | BandNode, RouteEdge>
          ref={root}
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={fitOf(shape, legend)}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          // The double click is the diagram's own: it brings what is under it near enough to read.
          zoomOnDoubleClick={false}
          // A hand that slips a little on a line or a box has clicked it still.
          paneDragThreshold={SLIP}
          onInit={setFlow}
          // A click on a box picks it; one on a frame or on the field picks the line that runs
          // within reach of it, else the frame, or clears the pick. The second of two brings it.
          onNodeClick={pick}
          onPaneClick={pick}
          // A box the field brings under a mouse that rests is the hover too; a frame holds other
          // boxes and a band is no thing of the model, so over them it is the line, or none.
          onNodeMouseEnter={(_event, node) => node.type === 'box' && over(node.id)}
          onNodeMouseLeave={(_event, node) => node.type === 'box' && over(undefined)}
          onMoveStart={() => {
            still.current = false;
            clearTimeout(timer.current);
            root.current?.removeAttribute('data-on-line');
            setMoving(true);
          }}
          onMoveEnd={(event) => {
            still.current = true;
            setMoving(false);
            // No move of the mouse is heard while the field is dragged: the mouse is where it was let go.
            if (event !== null && 'clientX' in event && (event.type === 'mouseup' || mouse.current === undefined)) mouse.current = { x: event.clientX, y: event.clientY };
            // Moved by a hand, the field has what the mouse means under it still, found anew. Moved
            // by itself, after a double click or to keep clear of the panel, it has brought
            // something else under a mouse that rests: the hover is none until the mouse moves,
            // so that what was picked is not faded for a line that happens to lie there.
            const at = mouse.current;
            hoverOn(event !== null && at !== undefined ? meantAt(document.elementFromPoint(at.x, at.y), at.x, at.y) : undefined);
            settle();
          }}
          onMouseMove={follow}
          onMouseLeave={() => {
            mouse.current = undefined;
            hoverOn(undefined);
          }}
        >
          <Controls className="glass-group glass-group-column" position="bottom-left" showInteractive={false} showFitView={false}>
            <FitButton shape={shape} legend={legend} />
          </Controls>
          <KeepClear picked={picked ?? holder} routes={layout.routes} again={again} />
          <HoverLabel hovered={moving ? undefined : hovered} view={view} label={label} place={place} />
        </ReactFlow>
      )}
      {layout !== undefined && legend && <Legend />}
      {children}
    </CanvasFrame>
  );
}
