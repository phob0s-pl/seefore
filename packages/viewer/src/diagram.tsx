import type { Drawn, PlacedLabel, View, ViewPassed } from '@seefore/core';
import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useViewportStore } from '@xyflow/react';
import type { AriaLabelConfig, EdgeProps, EdgeTypes, NodeProps, NodeTypes } from '@xyflow/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { HANDLE_IN, HANDLE_OUT, RING_RADIUS, headOf, labelLines, passedSaid, pathOf, ringOf, toFlow } from './flow.ts';
import type { ArrowEdge, BoundaryNode, BoxNode, PictureNode } from './flow.ts';
import { litBy } from './light.ts';
import { passingWords } from './records.ts';
import type { Lit, Target } from './light.ts';
import { LOOP_MARK, PASSING_MARK, Sample, Shape, StoreSign } from './shapes.tsx';
import { DASHED_CONDITIONS, TEXT_SLACK } from './theme.ts';
import { MAX_ZOOM, MOVE_MS, detailAt, fitViewport, litBounds, minZoomFor, percent, smallNote, whole } from './zoom.ts';
import type { Room } from './zoom.ts';

/**
 * The picture of a view on React Flow's canvas, with its title, its counts, the buttons that
 * move it and its legend. Every place, route and line of text is the picture's own.
 */

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

/**
 * A box: its shape, the lines of its text as the picture gives them, each on one line and
 * clipped at the edge, and on its top edge the marks for what passes through it, for its copies
 * and for the stores it keeps.
 */
function BoxView({ id, data }: NodeProps<BoxNode>) {
  const light = useContext(LightContext);
  const { box, placed } = data;
  const loops = box.loops.length;
  const passing = box.passing.length;
  const kept = box.kept.length;
  const dashed = DASHED_CONDITIONS && box.only !== undefined ? ' dashed' : '';
  return (
    <div className={`box family-${box.family}${box.scope ? ' scope' : ''}${dashed} ${standing(light, 'box', id)}`} data-look={box.look} style={{ width: placed.width, height: placed.height }}>
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
      {(passing > 0 || loops > 0 || kept > 0) && (
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
      )}
    </div>
  );
}

/** The boundary of a container view: a dashed line, a light tint, and its title at the place given. */
function BoundaryView({ id, data }: NodeProps<BoundaryNode>) {
  const light = useContext(LightContext);
  const { placed, titleAt } = data;
  return (
    <div className={`boundary ${standing(light, 'box', id)}`} style={{ width: placed.width, height: placed.height }}>
      <Handles />
      <div className="boundary-title text-line" style={{ left: titleAt.x, top: titleAt.y, width: placed.titleAt.width, height: placed.titleAt.height }} aria-hidden="true">
        {placed.title}
      </div>
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
 * An arrow: the route the picture gives, its head at the last point, a ring just before the head
 * when the far side opened the channel of every connection it stands for, and its label. React
 * Flow's own ends are not used.
 */
function ArrowView({ id, data }: EdgeProps<ArrowEdge>) {
  const light = useContext(LightContext);
  if (data === undefined) return null;
  const { arrow, placed, index } = data;
  const path = pathOf(placed.sections);
  const head = headOf(placed.sections);
  const ring = arrow.opened?.all === true ? ringOf(placed.sections) : undefined;
  const dashed = DASHED_CONDITIONS && arrow.only?.all === true ? ' dashed' : '';
  return (
    <g className={`arrow${arrow.connections.length > 1 ? ' arrow-many' : ''}${dashed} ${standing(light, 'arrow', id)}`}>
      <path className="arrow-hit" d={path} />
      <path className="arrow-line" d={path} />
      {ring !== undefined && <circle className="arrow-ring" cx={ring.x} cy={ring.y} r={RING_RADIUS} />}
      {head !== undefined && <polygon className="arrow-head" points={head} />}
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

/** What the picture does when the reader points, focuses, chooses or clears. */
export interface DiagramActions {
  /** The pointer is over a box or an arrow, or over nothing. */
  onPoint(target: Target | null): void;
  /** The keyboard's focus is on a box or an arrow, or on neither. */
  onFocusTarget(target: Target | null): void;
  /** A click, or Enter or Space, chose a box or an arrow. */
  onChoose(target: Target, byKeyboard: boolean): void;
  /** A click on the empty canvas. */
  onClear(): void;
}

export interface DiagramProps extends DiagramActions {
  view: View;
  drawn: Drawn;
  /** What the panel shows, when it is a box or an arrow of this picture. */
  chosen: Target | null;
  /** The room to draw in, when it is known before the page is laid out, as on the server. */
  room?: Room;
}

/** The picture of a view with all around it. A view of its own starts with a canvas of its own. */
export function Diagram(props: DiagramProps) {
  const flow = useMemo(() => toFlow(props.view, props.drawn), [props.view, props.drawn]);
  const size = props.room === undefined ? {} : { initialWidth: props.room.width, initialHeight: props.room.height };
  return (
    <ReactFlowProvider key={props.view.id} initialNodes={flow.nodes} initialEdges={flow.edges} {...size}>
      <Inside {...props} nodes={flow.nodes} edges={flow.edges} />
    </ReactFlowProvider>
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

/** How many boxes and arrows a picture has, and what of the view it does not draw. */
function Counts({ view, drawn }: { view: View; drawn: Drawn }) {
  const boxes = drawn.boxes.length;
  const arrows = drawn.arrows.length;
  const { outside, broken } = view.left;
  return (
    <p className="view-counts">
      {`${boxes} ${boxes === 1 ? 'box' : 'boxes'} and ${arrows} ${arrows === 1 ? 'arrow' : 'arrows'}.`}
      {outside.length > 0 && (
        <>
          {` ${outside.length} ${outside.length === 1 ? 'connection' : 'connections'} between two boxes outside the system ${outside.length === 1 ? 'is' : 'are'} not drawn: `}
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
 * The note for a picture too small to read at the zoom it is shown at. Its line is there when
 * empty too, so that the canvas does not move when the note comes and goes, and so that a
 * screen reader hears it come.
 */
function SmallNote({ drawn }: { drawn: Drawn }) {
  const zoom = useViewportStore((state) => state.transform[2]);
  return (
    <p className="small-note" role="status">
      {smallNote(drawn, zoom) ?? ''}
    </p>
  );
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
function Inside({ view, drawn, room: given, chosen, onPoint, onFocusTarget, onChoose, onClear, nodes, edges }: DiagramProps & { nodes: PictureNode[]; edges: ArrowEdge[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(given ?? null);
  // Whether the reader has moved the picture since it was last fitted. A new picture is fitted again only when not.
  const moved = useRef(false);
  const first = useRef(true);
  const flow = useReactFlow();
  const detail = useViewportStore((state) => detailAt(state.transform[2]));

  // The room is measured once the page is laid out, and again when it changes size. The view is never laid out again.
  useEffect(() => {
    const element = canvas.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setRoom((before) => (before !== null && before.width === width && before.height === height ? before : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A new picture of the same view: fitted again only when the reader has not moved.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!moved.current && room !== null) void flow.setViewport(fitViewport(whole(drawn), room));
    // Only a new picture fits again; a new room does not, so the room is not asked after.
  }, [drawn]);

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
  const onFocus = (event: FocusEvent) => onFocusTarget(targetOf(event.target));

  return (
    <div className="diagram" data-detail={detail}>
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
        <Counts view={view} drawn={drawn} />
        <SmallNote drawn={drawn} />
      </header>
      <div className="canvas" ref={canvas}>
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
            onPaneClick={() => onClear()}
            onMoveStart={(event) => {
              if (event !== null) moved.current = true;
            }}
            onFocus={onFocus}
            onBlur={() => onFocusTarget(null)}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
      <Legend view={view}>
        <PassesThrough view={view} chosen={chosen} onPoint={onPoint} onFocusTarget={onFocusTarget} onChoose={onChoose} />
      </Legend>
    </div>
  );
}

/** What the legend says of the dash, while the trial of it is on: what the outline of a box and the line of an arrow mean when dashed. */
export const DASH_WORDS = 'Dashed outline or line: there only sometimes, as its own “only …” says; the boundary is the tinted one';

/**
 * The legend: a sample of each kind of box, line and mark this view draws, and no other; and
 * under it what is given. While the dash is tried, a view that draws an `only` line says what
 * the dash means too.
 */
export function Legend({ view, children }: { view: View; children?: ReactNode }) {
  const dash = DASHED_CONDITIONS && view.legend.some((entry) => entry.key === 'only');
  return (
    <section className="legend" aria-label="Legend">
      <ul>
        {view.legend.map((entry) => (
          <li key={entry.key} data-key={entry.key}>
            <Sample name={entry.key} />
            <span>{entry.text}</span>
          </li>
        ))}
        {dash && (
          <li data-key="dashed">
            <Sample name="dashed" />
            <span>{DASH_WORDS}</span>
          </li>
        )}
      </ul>
      {children}
    </section>
  );
}

/**
 * What the arrows of the view pass through and has no box, each with how many of the view's
 * connections pass through it: first the pieces of infrastructure that are the system's own,
 * under words that say so, then the rest. One that has an `only` of its own stands in brackets,
 * as on a route. Pointing at one, or its focus, lights those arrows; a click, or Enter, keeps
 * them lit and opens its panel. Missing when there is nothing of the kind.
 */
function PassesThrough({ view, chosen, onPoint, onFocusTarget, onChoose }: { view: View; chosen: Target | null } & Omit<DiagramActions, 'onClear'>) {
  if (view.passed.length === 0) return null;
  const system = view.boundary?.name ?? view.boxes.find((box) => box.scope)?.name ?? view.scope;
  const own = view.passed.filter((each) => each.own);
  const others = view.passed.filter((each) => !each.own);
  const list = (passed: readonly ViewPassed[], label: string) => (
    <ul aria-label={label}>
      {passed.map((each) => {
        const target: Target = { kind: 'passed', id: each.id };
        const count = each.connections.length;
        const isChosen = chosen?.kind === 'passed' && chosen.id === each.id;
        return (
          <li key={each.id}>
            <button
              type="button"
              data-id={each.id}
              {...(isChosen ? { className: 'chosen' } : {})}
              aria-label={passedSaid(each.name, each.only, each.own ? system : undefined, passingWords(count))}
              // A click made with the keyboard has no count of presses.
              onClick={(event) => onChoose(target, event.detail === 0)}
              onMouseEnter={() => onPoint(target)}
              onMouseLeave={() => onPoint(null)}
              onFocus={() => onFocusTarget(target)}
              onBlur={() => onFocusTarget(null)}
            >
              {each.only === undefined ? each.name : `(${each.name})`} <span className="passes-count">{count}</span>
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
