import { leftOutWords } from '@seefore/core';
import type { Drawn, PlacedLabel, Point, View, ViewBox, ViewPassed } from '@seefore/core';
import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useReactFlowStoreApi, useViewportStore } from '@xyflow/react';
import type { AriaLabelConfig, EdgeProps, EdgeTypes, NodeProps, NodeTypes } from '@xyflow/react';
import { Component, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { HANDLE_IN, HANDLE_OUT, RING_RADIUS, headOf, labelLines, nearestArrow, passedSaid, pathOf, ringOf, ringScale, toFlow } from './flow.ts';
import type { ArrowEdge, BoundaryNode, BoxNode, PictureNode } from './flow.ts';
import { litBy } from './light.ts';
import { legendWords } from './reading.ts';
import { passingWords } from './records.ts';
import type { Lit, Pointed, Target } from './light.ts';
import { LOOP_MARK, PASSING_MARK, Sample, Shape, StoreSign } from './shapes.tsx';
import { TEXT_SLACK } from './theme.ts';
import { MAX_ZOOM, MOVE_MS, detailAt, fitViewport, holdOf, litBounds, litScale, minZoomFor, percent, reachAt, smallNote, viewportOnChange, whole } from './zoom.ts';
import type { ClientPoint, PictureChange, Pictured, Room } from './zoom.ts';

/**
 * The picture of a view on React Flow's canvas, with its title, its counts, the buttons that
 * move it and its legend. Every place, route and line of text is the picture's own. One canvas
 * draws one picture after another: a change of depth keeps a box where it stood on the screen,
 * a change of scope fits the new picture, and a new reading of the files holds what is chosen.
 */

/** What the page says while the picture of the setting chosen is laid out, and the one before stays. */
export const LAYING = 'Laying out the view…';

/** What the page says when the box in scope is gone from the files, and everything is shown in its place. */
export const GONE = 'That box is gone. This is everything.';

/** What the page says of a view with nothing in it. */
export const NOTHING_TO_DRAW = 'No boxes to draw.';

/** What is lit and what is chosen, for every box and arrow to read as it draws. */
export interface Light {
  /** What the reader points at, focuses or has chosen lights; null when nothing does, and nothing fades. */
  lit: Lit | null;
  /** What the panel shows. */
  chosen: Target | null;
}

export const LightContext = createContext<Light>({ lit: null, chosen: null });

/** The classes that say how a box or an arrow stands: lit or faded, and chosen. */
function standing(light: Light, kind: Target['kind'], id: string): string {
  const classes: string[] = [];
  if (light.lit !== null) classes.push((kind === 'box' ? light.lit.boxes : light.lit.arrows).has(id) ? 'lit' : 'faded');
  if (light.chosen?.kind === kind && light.chosen.id === id) classes.push('chosen');
  return classes.join(' ');
}

/**
 * The handles every node draws, hidden, and that nothing can connect to. Without them React
 * Flow stops drawing every arrow once the browser has measured the nodes.
 */
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} id={HANDLE_IN} isConnectable={false} className="hidden-handle" aria-hidden="true" />
      <Handle type="source" position={Position.Right} id={HANDLE_OUT} isConnectable={false} className="hidden-handle" aria-hidden="true" />
    </>
  );
}

/** The marks on the top edge of a box or a boundary: for what passes through it, for its copies and for the stores it keeps. Nothing when it carries none. */
function Marks({ of }: { of: Pick<ViewBox, 'loops' | 'passing' | 'kept'> }) {
  const loops = of.loops.length;
  const passing = of.passing.length;
  const kept = of.kept.length;
  if (passing === 0 && loops === 0 && kept === 0) return null;
  return (
    <div className="marks" aria-hidden="true">
      {passing > 0 && <div className="mark mark-passing">{`${PASSING_MARK} ${passing}`}</div>}
      {loops > 0 && <div className="mark">{`${LOOP_MARK} ${loops}`}</div>}
      {kept > 0 && (
        <div className="mark mark-kept">
          <StoreSign />
          {` ${kept}`}
        </div>
      )}
    </div>
  );
}

/**
 * A box: its shape, the lines of its text as the picture gives them, each on one line and
 * clipped at the edge, and on its top edge the marks for what passes through it, for its copies
 * and for the stores it keeps.
 */
function BoxView({ id, data }: NodeProps<BoxNode>) {
  const light = useContext(LightContext);
  const { box, placed } = data;
  return (
    <div className={`box family-${box.family}${box.scope ? ' scope' : ''} ${standing(light, 'box', id)}`} data-look={box.look} style={{ width: placed.width, height: placed.height }}>
      <Handles />
      <svg className="shape" width={placed.width} height={placed.height} aria-hidden="true">
        <Shape look={box.look} scope={box.scope} width={placed.width} height={placed.height} />
      </svg>
      <div className="box-text" style={{ paddingLeft: placed.inset.left - TEXT_SLACK, paddingRight: placed.inset.right - TEXT_SLACK }} aria-hidden="true">
        <div className="box-name">
          {placed.name.map((line, at) => (
            <div key={at} className="text-line">
              {line}
            </div>
          ))}
        </div>
        <div className="box-line text-line">{placed.line}</div>
        {placed.only !== undefined && <div className="box-only text-line">{placed.only}</div>}
        {placed.sentence.length > 0 && (
          <div className="box-sentence">
            {placed.sentence.map((line, at) => (
              <div key={at} className="text-line">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
      <Marks of={box} />
    </div>
  );
}

/**
 * The boundary of an open box, a system's or an app's: a dashed line, a light tint, its title at
 * the place given, and on its top edge the marks a closed box would carry. The chosen box has the
 * thicker line here too. A strip along its line takes the pointer, as wide on the screen at any
 * zoom, so that it can be pointed at and clicked where its title is not drawn; the room inside it
 * moves the canvas.
 */
function BoundaryView({ id, data }: NodeProps<BoundaryNode>) {
  const light = useContext(LightContext);
  const { boundary, placed, titleAt } = data;
  return (
    <div className={`boundary family-${boundary.family}${boundary.scope ? ' scope' : ''} ${standing(light, 'box', id)}`} style={{ width: placed.width, height: placed.height }}>
      <Handles />
      <svg className="boundary-edge" width={placed.width} height={placed.height} aria-hidden="true">
        <rect x={0.75} y={0.75} width={Math.max(placed.width - 1.5, 0)} height={Math.max(placed.height - 1.5, 0)} rx={8} />
      </svg>
      <div className="boundary-title text-line" style={{ left: titleAt.x, top: titleAt.y, width: placed.titleAt.width, height: placed.titleAt.height }} aria-hidden="true">
        {placed.title}
      </div>
      <Marks of={boundary} />
    </div>
  );
}

/** The label of an arrow at its place: a ground that covers the line under it, and its lines, clipped at its edge. */
function Label({ label, clip }: { label: PlacedLabel; clip: string }) {
  const middle = label.x + label.width / 2;
  return (
    <g className="arrow-label" aria-hidden="true">
      <clipPath id={clip}>
        <rect x={label.x} y={label.y} width={label.width} height={label.height} />
      </clipPath>
      <rect className="label-ground" x={label.x} y={label.y} width={label.width} height={label.height} rx={2} />
      <g clipPath={`url(#${clip})`}>
        {labelLines(label).map((line, at) => (
          <text key={at} className={`label-${line.kind}`} x={middle} y={line.y} textAnchor="middle" dominantBaseline="central">
            {line.text}
          </text>
        ))}
      </g>
    </g>
  );
}

/**
 * The head of an arrow at the end of its route, and the ring before it when it has one, `scale`
 * times their size: with a ring, only as many times as the route has room for, so that the ring
 * stays on the line.
 */
function Ends({ sections, ringed, scale: asked }: { sections: readonly (readonly Point[])[]; ringed: boolean; scale: number }) {
  const scale = ringed && asked !== 1 ? ringScale(sections, asked) : asked;
  const head = headOf(sections, scale);
  const ring = ringed ? ringOf(sections, scale) : undefined;
  return (
    <>
      {ring !== undefined && <circle className="arrow-ring" cx={ring.x} cy={ring.y} r={RING_RADIUS * scale} />}
      {head !== undefined && <polygon className="arrow-head" points={head} />}
    </>
  );
}

/**
 * The head and ring of a lit arrow: below the zoom at which names are drawn they keep their size
 * on the screen, as its line keeps its width, measured from the tip along the route so that the
 * ring stays on the line. Of an arrow only these draw again as the zoom moves, and only while lit.
 */
function LitEnds({ sections, ringed }: { sections: readonly (readonly Point[])[]; ringed: boolean }) {
  const scale = useViewportStore((state) => litScale(state.transform[2]));
  return <Ends sections={sections} ringed={ringed} scale={scale} />;
}

/**
 * An arrow: the route the picture gives, its head at the last point, a ring just before the head
 * when the far side opened the channel of every connection it stands for, and its label. React
 * Flow's own ends are not used.
 */
function ArrowView({ id, data }: EdgeProps<ArrowEdge>) {
  const light = useContext(LightContext);
  if (data === undefined) return null;
  const { arrow, placed, index } = data;
  const path = pathOf(placed.sections);
  const ringed = arrow.opened?.all === true;
  return (
    <g className={`arrow${arrow.connections.length > 1 ? ' arrow-many' : ''} ${standing(light, 'arrow', id)}`}>
      <path className="arrow-hit" d={path} />
      <path className="arrow-line" d={path} />
      {light.lit?.arrows.has(id) === true ? <LitEnds sections={placed.sections} ringed={ringed} /> : <Ends sections={placed.sections} ringed={ringed} scale={1} />}
      {placed.label !== undefined && <Label label={placed.label} clip={`seefore-label-${index}`} />}
    </g>
  );
}

const NODE_TYPES: NodeTypes = { box: BoxView, boundary: BoundaryView };
const EDGE_TYPES: EdgeTypes = { arrow: ArrowView };

/** What React Flow tells a screen reader about a box and an arrow, in the page's words. */
const HOW_TO: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default': 'Press Enter or Space to see its details, and Escape to clear them.',
  'node.a11yDescription.keyboardDisabled': 'Press Enter or Space to see its details, and Escape to clear them.',
  'edge.a11yDescription.default': 'Press Enter or Space to see the connections it stands for, and Escape to clear them.',
};

/** What the picture does when the reader points, focuses, taps, chooses or clears. */
export interface DiagramActions {
  /** The pointer is over a box, an arrow, a thing passed through or a line of the legend, or over nothing. */
  onPoint(target: Pointed | null): void;
  /**
   * The focus is on a box, an arrow, a thing passed through or a line of the legend, or on none.
   * `visible` is true when the browser shows that focus, as it does for the keyboard's.
   */
  onFocusTarget(target: Pointed | null, visible: boolean): void;
  /** A finger tapped a line of the legend. `event` is the tap's own, so that the page does not take it for a tap elsewhere. */
  onTap(target: Pointed, event: PointerEvent): void;
  /** A click, a tap, or Enter or Space, chose a box or an arrow. */
  onChoose(target: Target, byKeyboard: boolean): void;
  /** A click on the empty canvas. */
  onClear(): void;
}

/** The words of the reading line, and whether they unfold whole over the top of the canvas. */
export interface Reading {
  words: string;
  whole: boolean;
}

export interface DiagramProps extends DiagramActions {
  view: View;
  drawn: Drawn;
  /** What the panel shows, when it is a box or an arrow of this picture. */
  chosen: Target | null;
  /** What speaks on the reading line and lights, so that a line of the legend that does is marked. */
  speaking: Pointed | null;
  /** What the reading line says. */
  reading: Reading;
  /** True while the picture of another setting is laid out, and this one stays. */
  laying: boolean;
  /** True when the box in scope is gone from the files, and this picture of everything stands in its place. */
  gone: boolean;
  /** The room to draw in, when it is known before the page is laid out, as on the server. */
  room?: Room;
}

/**
 * The picture of a view with all around it. The canvas stays as one picture comes after
 * another, so that the page can keep a box where it stood on the screen.
 */
export function Diagram(props: DiagramProps) {
  const flow = useMemo(() => toFlow(props.view, props.drawn), [props.view, props.drawn]);
  const size = props.room === undefined ? {} : { initialWidth: props.room.width, initialHeight: props.room.height };
  return (
    <ReactFlowProvider initialNodes={flow.nodes} initialEdges={flow.edges} {...size}>
      <Inside {...props} nodes={flow.nodes} edges={flow.edges} />
    </ReactFlowProvider>
  );
}

/** The line that says the box in scope is gone, under the title. It is there when empty too, with no height, so that a screen reader hears it come. */
export function GoneLine({ gone }: { gone: boolean }) {
  return (
    <p className="gone" role="status">
      {gone ? GONE : ''}
    </p>
  );
}

/** The line over the top of the canvas that says a picture is laid out, while the one before stays. It is there when empty too, so that a screen reader hears it come. */
export function LayingLine({ laying }: { laying: boolean }) {
  return (
    <p className="laying" role="status">
      {laying ? LAYING : ''}
    </p>
  );
}

/** True when the reader has asked for less motion. */
function still(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The box or the arrow an element of the canvas belongs to. */
function targetOf(element: EventTarget | null): Target | null {
  if (typeof Element === 'undefined' || !(element instanceof Element)) return null;
  const node = element.closest('.react-flow__node');
  const nodeId = node?.getAttribute('data-id');
  if (nodeId) return { kind: 'box', id: nodeId };
  const edgeId = element.closest('.react-flow__edge')?.getAttribute('data-id');
  return edgeId ? { kind: 'arrow', id: edgeId } : null;
}

/** True when the browser shows the focus on an element, as it does for the keyboard's and not for a click's. */
function shownFocus(element: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && element instanceof Element && element.matches(':focus-visible');
}

/**
 * What the line under a view's title says of the stores it draws at the apps that keep them,
 * which have no box: `10 stores are drawn at the apps that keep them.` Nothing when there are none.
 */
export function keptWords(n: number): string | undefined {
  if (n === 0) return undefined;
  return n === 1 ? '1 store is drawn at the app that keeps it.' : `${n} stores are drawn at the apps that keep them.`;
}

/**
 * How many boxes and arrows a picture has, how many stores it draws at their apps, at a box or
 * at a boundary, and what of the view it does not draw. A large view opens below the zoom where
 * the mark of a kept store can be read, so the line says it in words too.
 */
function Counts({ view, drawn }: { view: View; drawn: Drawn }) {
  const boxes = drawn.boxes.length;
  const arrows = drawn.arrows.length;
  const { broken } = view.left;
  const kept = keptWords([...view.boxes, ...view.boundaries].reduce((sum, box) => sum + box.kept.length, 0));
  // What the core says of the connections between two neighbours, as the title names the scope.
  const outside = leftOutWords(view);
  return (
    <p className="view-counts">
      {`${boxes} ${boxes === 1 ? 'box' : 'boxes'} and ${arrows} ${arrows === 1 ? 'arrow' : 'arrows'}.`}
      {kept !== undefined && ` ${kept}`}
      {outside !== undefined && (
        <>
          {` ${outside} `}
          <a href="#/model">see the model</a>.
        </>
      )}
      {broken.length > 0 && (
        <>
          {` ${broken.length} ${broken.length === 1 ? 'connection' : 'connections'} to a record with an error ${broken.length === 1 ? 'is' : 'are'} not drawn: `}
          <a href="#/problems">see the problems</a>.
        </>
      )}
    </p>
  );
}

/**
 * The note under the counts: that the picture is too small to read at the zoom it is shown at,
 * and never at one it would have opened at. Its line is there when empty too, so that the canvas
 * does not move when the note comes and goes, and so that a screen reader hears it come.
 */
function Note({ view }: { view: View }) {
  const zoom = useViewportStore((state) => state.transform[2]);
  return (
    <p className="small-note" role="status">
      {smallNote(view, zoom) ?? ''}
    </p>
  );
}

/**
 * The reading line, under the note: the words of what is pointed at, focused or chosen, at
 * reading size whatever the zoom. It has its place and its height when it says nothing, so that
 * the canvas does not move; too long, it is cut with an ellipsis, and its title holds the whole
 * for a pointer that rests on it. For what has the keyboard's focus, or a finger tapped, which
 * have no pointer to rest, the words unfold whole over the top of the canvas, which does not
 * move. It is no live region: a screen reader hears what has the focus by its own name, and is
 * not told of every box the pointer crosses.
 */
function ReadingLine({ words, whole: unfold }: Reading) {
  return (
    <p className={`reading-line${unfold && words !== '' ? ' whole' : ''}`} {...(words === '' ? {} : { title: words })}>
      <span>{words}</span>
    </p>
  );
}

/**
 * What the page knew just before a new picture was put in place of the one drawn: what changed,
 * with the viewport and the room, where the canvas stood on the screen, and where the box to
 * hold stood, when one is held and was drawn.
 */
interface Before {
  change: PictureChange;
  canvas: ClientPoint;
  box?: ClientPoint;
}

interface HoldPlaceProps {
  /** The picture drawn, with its view. */
  shown: Pictured;
  /** Measures the page as it stands, the picture before it being drawn. */
  measure(before: Pictured): Before;
  /** Moves the picture, given what stood where before. */
  place(before: Before): void;
}

/**
 * Holds a box in place when a new picture comes: the chosen box at a new reading of the files,
 * the box that opens or closes at a change of depth of a picture the reader has moved; or fits
 * the new picture, of another scope, or of another depth when the one before stood fitted.
 * React calls `getSnapshotBeforeUpdate` once the new picture is worked out and before the page
 * is changed, which no hook can: there it measures where the canvas and the box to hold stand
 * on the screen. `componentDidUpdate` comes once the page is changed, the title and counts
 * above the canvas with it, and before the browser paints: there the canvas is measured again,
 * for those words may have grown or shrunk by a line, and the picture is moved once. A move
 * made there is drawn with the new picture, in the same frame.
 */
class HoldPlace extends Component<HoldPlaceProps> {
  override getSnapshotBeforeUpdate(previous: Readonly<HoldPlaceProps>): Before | null {
    return previous.shown.drawn === this.props.shown.drawn ? null : this.props.measure(previous.shown);
  }

  override componentDidUpdate(_previous: Readonly<HoldPlaceProps>, _state: unknown, before: Before | null): void {
    if (before !== null) this.props.place(before);
  }

  override render(): null {
    return null;
  }
}

/** The top left of an element on the screen. */
function topLeft(element: Element): ClientPoint {
  const { left, top } = element.getBoundingClientRect();
  return { x: left, y: top };
}

/** How many times farther from its line a finger finds an arrow than a pointer does: a finger is less exact. */
const TOUCH_REACH = 2;

/**
 * Sets the zoom on the picture's element as `--zoom`, for the lines that keep their width on
 * the screen: React Flow scales the canvas in CSS, which `vector-effect` does not see. Only
 * this draws again as the zoom moves; the boxes and arrows do not.
 */
function ZoomProperty({ element }: { element: RefObject<HTMLDivElement | null> }) {
  const zoom = useViewportStore((state) => state.transform[2]);
  useLayoutEffect(() => {
    element.current?.style.setProperty('--zoom', String(zoom));
  }, [element, zoom]);
  return null;
}

/** The zoom as a share of full size. */
function ZoomShown() {
  const zoom = useViewportStore((state) => state.transform[2]);
  return (
    <output className="zoom-shown" title="Zoom">
      {percent(zoom)}
    </output>
  );
}

/** The canvas and all around it, inside React Flow's store. */
function Inside({ view, drawn, room: given, chosen, speaking, reading, laying, gone, onPoint, onFocusTarget, onTap, onChoose, onClear, nodes, edges }: DiagramProps & { nodes: PictureNode[]; edges: ArrowEdge[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const diagram = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(given ?? null);
  // Whether the reader has moved the picture since it was last fitted. A new picture is fitted again only when not.
  const moved = useRef(false);
  const flow = useReactFlow();
  const stores = useReactFlowStoreApi<PictureNode, ArrowEdge>();
  const detail = useViewportStore((state) => detailAt(state.transform[2]));
  // The route of each arrow as it is drawn, to find the one nearest the pointer.
  const routes = useMemo(() => edges.map((edge) => ({ id: edge.id, sections: edge.data?.placed.sections ?? [] })), [edges]);
  // The arrow the pointer is near on the empty canvas, which it points at.
  const near = useRef<string | null>(null);
  // Where the canvas stood on the screen when it was last measured, to keep the picture where it stood when the canvas moves.
  const stood = useRef<ClientPoint | null>(null);

  // The room is measured once the page is laid out, and again when it changes size. The view is
  // never laid out again. When the words above the canvas grow or shrink by a line, as when the
  // panel opens and they wrap, the canvas moves and changes size: the picture is moved back by as
  // much, before the browser paints, so that it stays where it stood on the screen.
  useEffect(() => {
    const element = canvas.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setRoom((before) => (before !== null && before.width === width && before.height === height ? before : { width, height }));
      const was = stood.current;
      const is = topLeft(element);
      stood.current = is;
      if (was === null || (was.x === is.x && was.y === is.y)) return;
      const viewport = flow.getViewport();
      void flow.setViewport({ x: viewport.x + was.x - is.x, y: viewport.y + was.y - is.y, zoom: viewport.zoom });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The room as it is now, which the words above the canvas may have made a line shorter.
  const roomNow = (): Room | null => {
    const rect = canvas.current?.getBoundingClientRect();
    return rect !== undefined && rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : room;
  };
  // A new picture in place of the one drawn: of a new reading, a chosen box keeps its place on
  // the screen, else the picture is fitted again when the reader has not moved it, else kept
  // where it stood on the screen; at another depth that opens or closes a box, it is fitted again
  // when the reader has not moved it, else that box keeps its place; of another scope, it is
  // fitted. See `HoldPlace`, which measures the page before and after the new picture is put in,
  // and `viewportOnChange`.
  const measure = (before: Pictured): Before => {
    const element = canvas.current;
    const change: PictureChange = { before, after: { view, drawn }, chosen, gone, viewport: flow.getViewport(), moved: moved.current, room: roomNow() };
    const { box: held } = holdOf(change);
    const box = held === undefined ? null : element?.querySelector(`.react-flow__node[data-id="${CSS.escape(held)}"]`);
    return { change, canvas: element === null ? { x: 0, y: 0 } : topLeft(element), ...(box === null || box === undefined ? {} : { box: topLeft(box) }) };
  };
  const place = (before: Before) => {
    const element = canvas.current;
    const canvasAfter = element === null ? before.canvas : topLeft(element);
    // The move is made here, for the new picture: the canvas is not to be moved for it again once measured.
    stood.current = canvasAfter;
    const { viewport: next, fitted, kept } = viewportOnChange(before.change, roomNow(), { canvasBefore: before.canvas, canvasAfter, ...(before.box === undefined ? {} : { box: before.box }) });
    // A fitted picture is not one the reader moved; one that kept a box in place is no longer fitted.
    if (fitted) moved.current = false;
    else if (kept !== undefined) moved.current = true;
    // Which box a change of depth kept, for whoever measures the page.
    if (kept === undefined) diagram.current?.removeAttribute('data-kept');
    else diagram.current?.setAttribute('data-kept', kept);
    if (next === undefined) return;
    // React Flow takes new nodes and edges in an effect of its own, which may come after the
    // browser paints: they are given to it here, with the move, so that the new picture is never
    // drawn at the old place, nor the old picture at the new.
    const { setNodes, setEdges } = stores.optionsStore.getState();
    setNodes(nodes);
    setEdges(edges);
    void flow.setViewport(next);
  };

  /** The arrow nearest a point of the screen, within the reach of a pointer, or of a finger. */
  const nearAt = (event: ReactMouseEvent): string | null => {
    const finger = 'pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'touch';
    const reach = reachAt(flow.getViewport().zoom) * (finger ? TOUCH_REACH : 1);
    return nearestArrow(routes, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), reach);
  };
  /**
   * Points at the arrow near the pointer on the empty canvas, or at nothing, when that changes.
   * Over a box or an arrow it is near nothing, and leaves the pointing to them.
   */
  const pointNear = (id: string | null, onCanvas = true) => {
    if (id === near.current) return;
    near.current = id;
    // The canvas shows the hand for a click, as over the arrow itself.
    diagram.current?.toggleAttribute('data-near', id !== null);
    if (onCanvas) onPoint(id === null ? null : { kind: 'arrow', id });
  };
  /** True for an event on the empty canvas itself: React Flow tells its pane of every move over the picture. */
  const onCanvas = (event: ReactMouseEvent) => event.target instanceof Element && event.target.classList.contains('react-flow__pane');

  const duration = () => (still() ? 0 : MOVE_MS);
  const fitAll = () => {
    if (room === null) return;
    moved.current = false;
    void flow.setViewport(fitViewport(whole(drawn), room), { duration: duration() });
  };
  const fitChosen = () => {
    const bounds = chosen === null ? undefined : litBounds(drawn, litBy(view, chosen));
    if (room === null || bounds === undefined) return;
    moved.current = true;
    void flow.setViewport(fitViewport(bounds, room), { duration: duration() });
  };
  const zoomIn = () => {
    moved.current = true;
    void flow.zoomIn({ duration: duration() });
  };
  const zoomOut = () => {
    moved.current = true;
    void flow.zoomOut({ duration: duration() });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = targetOf(event.target);
    if (target === null) return;
    event.preventDefault();
    onChoose(target, true);
  };
  const onFocus = (event: FocusEvent) => onFocusTarget(targetOf(event.target), shownFocus(event.target));

  const shown = useMemo(() => ({ view, drawn }), [view, drawn]);

  return (
    <div className="diagram" data-detail={detail} ref={diagram}>
      <ZoomProperty element={diagram} />
      <HoldPlace shown={shown} measure={measure} place={place} />
      <header className="diagram-head">
        <div className="diagram-top">
          <h1 className="view-title">{view.title}</h1>
          <div className="buttons" role="toolbar" aria-label="Move the picture">
            <button type="button" onClick={fitAll}>
              Fit diagram
            </button>
            <button type="button" onClick={fitChosen} disabled={chosen === null}>
              Fit selection
            </button>
            <button type="button" onClick={zoomOut}>
              Zoom out
            </button>
            <ZoomShown />
            <button type="button" onClick={zoomIn}>
              Zoom in
            </button>
          </div>
        </div>
        <GoneLine gone={gone} />
        <Counts view={view} drawn={drawn} />
        <Note view={view} />
        <ReadingLine {...reading} />
      </header>
      <div className="canvas" ref={canvas}>
        <LayingLine laying={laying} />
        {room !== null && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultViewport={fitViewport(whole(drawn), room)}
            minZoom={minZoomFor(drawn, room)}
            maxZoom={MAX_ZOOM}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            edgesReconnectable={false}
            nodesFocusable
            edgesFocusable
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            zoomActivationKeyCode={null}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
            ariaLabelConfig={HOW_TO}
            aria-label={`The picture: ${view.title}`}
            onNodeMouseEnter={(_, node) => onPoint({ kind: 'box', id: node.id })}
            onNodeMouseLeave={() => onPoint(null)}
            onEdgeMouseEnter={(_, edge) => onPoint({ kind: 'arrow', id: edge.id })}
            onEdgeMouseLeave={() => onPoint(null)}
            onNodeClick={(_, node) => onChoose({ kind: 'box', id: node.id }, false)}
            onEdgeClick={(_, edge) => onChoose({ kind: 'arrow', id: edge.id }, false)}
            // On the empty canvas, and in the boundary but for its edge, the pointer finds the arrow nearest it: see `reachAt`.
            onPaneMouseMove={(event) => (onCanvas(event) ? pointNear(nearAt(event)) : pointNear(null, false))}
            onPaneMouseLeave={() => pointNear(null)}
            onPaneClick={(event) => {
              const id = onCanvas(event) ? nearAt(event) : null;
              if (id === null) onClear();
              else onChoose({ kind: 'arrow', id }, false);
            }}
            onMoveStart={(event) => {
              if (event !== null) moved.current = true;
            }}
            onFocus={onFocus}
            onBlur={() => onFocusTarget(null, false)}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
      <Legend view={view} speaking={speaking} onPoint={onPoint} onFocusTarget={onFocusTarget} onTap={onTap}>
        <PassesThrough view={view} chosen={chosen} onPoint={onPoint} onFocusTarget={onFocusTarget} onChoose={onChoose} />
      </Legend>
    </div>
  );
}

/**
 * The legend: a sample of each kind of box, line and mark this view draws, and no other; and
 * under it what is given. Pointing at a line, or moving the focus to it, lights every box and
 * arrow it explains, and leaving it gives the light back to what is chosen; a finger's tap
 * lights it until the next tap elsewhere. A pointer is told from a finger by the pointer events
 * themselves, so that the mouse events a browser makes up after a tap light nothing. A click
 * does not keep the focus on a line, so that leaving it with the pointer clears its light. Each
 * line tells a screen reader, as its description, what it lights and how much.
 */
export function Legend({
  view,
  speaking = null,
  children,
  onPoint,
  onFocusTarget,
  onTap,
}: { view: View; speaking?: Pointed | null; children?: ReactNode } & Pick<DiagramActions, 'onPoint' | 'onFocusTarget' | 'onTap'>) {
  const more = useMore();
  const ids = useId();
  // What each line lights, worked out once for a view and not as the pointer moves.
  const lights = useMemo(() => new Map(view.legend.map((entry) => [entry.key, legendWords(view, entry.key)])), [view]);
  // The chosen box's shape, closed, or that it is open, for the sample of its line.
  const chosen = view.boxes.find((box) => box.scope)?.look ?? (view.boundaries.some((boundary) => boundary.scope) ? 'open' : undefined);
  return (
    <section className="legend" aria-label="Legend" ref={more.ref} onScroll={more.measure} {...(more.hidden ? { tabIndex: 0 } : {})}>
      <ul>
        {view.legend.map((entry) => {
          const line: Pointed = { kind: 'legend', id: entry.key };
          const described = `${ids}-${entry.key}`;
          const lit = speaking?.kind === 'legend' && speaking.id === entry.key;
          return (
            <li
              key={entry.key}
              data-key={entry.key}
              tabIndex={0}
              aria-describedby={described}
              {...(lit ? { className: 'lit' } : {})}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') onPoint(line);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') onPoint(null);
              }}
              onPointerUp={(event) => {
                if (event.pointerType === 'touch') onTap(line, event.nativeEvent);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onFocus={(event) => onFocusTarget(line, shownFocus(event.currentTarget))}
              onBlur={() => onFocusTarget(null, false)}
            >
              <Sample name={entry.key} {...(chosen === undefined ? {} : { chosen })} />
              <span>{entry.text}</span>
              <span id={described} hidden>
                {lights.get(entry.key)}
              </span>
            </li>
          );
        })}
      </ul>
      {children}
      {more.hidden && (
        <p className="legend-more" aria-hidden="true">
          {LEGEND_MORE}
        </p>
      )}
    </section>
  );
}

/** What the legend says at its foot while some of it is out of sight. */
export const LEGEND_MORE = 'More below: scroll the legend';

/**
 * Whether some of the legend is out of sight below. The style sheet holds the legend to a
 * quarter of the window, and it scrolls inside; this is measured when it is drawn, when it
 * changes size and as it scrolls, so that the line which says there is more goes once the
 * reader has seen the rest. Nothing of the legend is left out.
 */
function useMore(): { ref: (element: HTMLElement | null) => void; measure: () => void; hidden: boolean } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [hidden, setHidden] = useState(false);
  const measure = () => {
    if (element === null) return;
    // A pixel of slack, since a scroll position may stop a fraction short of the end.
    setHidden(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
  };
  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, measure, hidden };
}

/**
 * What the arrows of the view pass through and has no box, each with how many of the view's
 * connections pass through it: first the pieces of infrastructure that are the system's own,
 * under words that say so, then the rest. One that has a condition, its own or from what it is
 * in, stands in brackets, as on a route. Pointing at one, or its focus, lights those arrows; a
 * click, or Enter, keeps them lit and opens its panel. One that is lit, by an arrow that passes
 * through it or a line of the legend that is about it, is marked. Missing when there is nothing
 * of the kind.
 */
function PassesThrough({ view, chosen, onPoint, onFocusTarget, onChoose }: { view: View; chosen: Target | null } & Omit<DiagramActions, 'onClear' | 'onTap'>) {
  const light = useContext(LightContext);
  if (view.passed.length === 0) return null;
  const system = view.boundaries.find((boundary) => boundary.scope)?.name ?? view.boxes.find((box) => box.scope)?.name ?? view.scope ?? '';
  const own = view.passed.filter((each) => each.own);
  const others = view.passed.filter((each) => !each.own);
  const list = (passed: readonly ViewPassed[], label: string) => (
    <ul aria-label={label}>
      {passed.map((each) => {
        const target: Target = { kind: 'passed', id: each.id };
        const count = each.connections.length;
        const classes = [...(light.lit?.passed.has(each.id) === true ? ['lit'] : []), ...(chosen?.kind === 'passed' && chosen.id === each.id ? ['chosen'] : [])];
        return (
          <li key={each.id}>
            <button
              type="button"
              data-id={each.id}
              {...(classes.length > 0 ? { className: classes.join(' ') } : {})}
              aria-label={passedSaid(each.name, each.conditions, each.own ? system : undefined, passingWords(count))}
              // A click made with the keyboard has no count of presses.
              onClick={(event) => onChoose(target, event.detail === 0)}
              onMouseEnter={() => onPoint(target)}
              onMouseLeave={() => onPoint(null)}
              onFocus={(event) => onFocusTarget(target, shownFocus(event.currentTarget))}
              onBlur={() => onFocusTarget(null, false)}
            >
              {each.conditions.length === 0 ? each.name : `(${each.name})`} <span className="passes-count">{count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="passes-through">
      <span className="passes-title">Passes through:</span>
      {own.length > 0 && (
        <>
          <span className="passes-group">{`part of ${system}:`}</span>
          {list(own, `Passes through, part of ${system}`)}
        </>
      )}
      {own.length > 0 && others.length > 0 && <span className="passes-group">others:</span>}
      {others.length > 0 && list(others, own.length > 0 ? 'Passes through, others' : 'Passes through')}
    </div>
  );
}
