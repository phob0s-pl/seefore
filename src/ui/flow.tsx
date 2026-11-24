import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { flowSteps, flowView } from '../model/flow.ts';
import type { FlowRead, FlowStep } from '../model/flow.ts';
import { Diagram } from './diagram.tsx';
import { Inspector } from './inspector.tsx';
import type { ModelState, Slots } from './shell.tsx';
import { Button, CanvasFrame, EmptyState, useTitle } from './ui.tsx';

/** Where the reader stands: before the first step, on a step by its place, or at the end. */
type Place = 'starts' | number | 'ends';

/** The places before and after one: before the first step is Starts, and after the last is nothing. */
function movesFrom(place: Place, last: number): { previous?: Place; next?: Place } {
  if (place === 'starts') return { next: 0 };
  if (place === 'ends') return { previous: last };
  return { previous: place > 0 ? place - 1 : 'starts', ...(place < last ? { next: place + 1 } : {}) };
}

/** Words joined as people join them: "1 and 5", "1, 3 and 5". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** The step's id an address names after `#`, or none. */
function stepInHash(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}

/**
 * The page of a flow, `/flows/<id>#<step>`: its steps in the sidebar's place, the bar of the
 * current step, and the diagram of the flow's own parts. It opens on the whole flow, or on the
 * step the address names.
 */
export function FlowPage() {
  const { id = '' } = useParams();
  const { answer, catalogue, failed, slots } = useOutletContext<ModelState>();
  const flow = useMemo(() => (answer ? flowSteps(answer.records, id) : undefined), [answer, id]);
  useTitle(flow?.name ?? 'Flows');
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (answer === undefined || catalogue === undefined) return <p className="page-line">Reading…</p>;
  if (flow === undefined) {
    return (
      <EmptyState title="No such flow.">
        <Link className="text-link" to="/flows">
          All flows
        </Link>
      </EmptyState>
    );
  }
  // Another flow is a page of its own: what was picked and laid out is let go.
  return <FlowBody key={flow.id} flow={flow} records={answer.records} catalogue={catalogue} slots={slots} />;
}

/** A group of steps under words that stand once above them: a condition, or a strand. */
type Run = { heading: string; rows: (FlowStep | Run)[] };

/** The steps as the bar of steps stands them: strands, and conditions inside them. */
function runsOf(steps: readonly FlowStep[]): (FlowStep | Run)[] {
  const top: (FlowStep | Run)[] = [];
  let strand: Run | undefined;
  let group: Run | undefined;
  for (const step of steps) {
    if (step.strand !== undefined) {
      strand = { heading: step.strand, rows: [] };
      top.push(strand);
      group = undefined;
    }
    const into = strand?.rows ?? top;
    if (step.group !== undefined) {
      group = { heading: step.group, rows: [] };
      into.push(group);
    } else if (!step.conditioned) group = undefined;
    (step.conditioned && group !== undefined ? group.rows : into).push(step);
  }
  return top;
}

function FlowBody({ flow, records, catalogue, slots }: { flow: FlowRead; records: readonly ModelRecord[]; catalogue: Catalogue; slots: Slots | undefined }) {
  const view = useMemo(() => flowView(records, flow.id), [records, flow.id]);
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { steps } = flow;
  const wanted = stepInHash(hash);
  const index = wanted === '' ? -1 : steps.findIndex((step) => step.id === wanted);
  const step = index >= 0 ? steps[index] : undefined;
  // Ends is no step: it is kept here while the address names none.
  const [ends, setEnds] = useState(false);
  const place: Place = step !== undefined ? index : ends ? 'ends' : 'starts';
  // Where the reader stands for the keys, set at once by a move: a key pressed straight after
  // a click moves on from the click's step, before the page has drawn it.
  const at = useRef<Place>(place);
  useLayoutEffect(() => {
    at.current = place;
  }, [place]);

  // A change of step replaces the address, so that the back arrow leaves the flow in one go.
  const go = useCallback(
    (to: Place) => {
      at.current = to;
      setEnds(to === 'ends');
      const id = typeof to === 'number' ? steps[to]?.id : undefined;
      void navigate({ pathname, hash: id !== undefined ? `#${encodeURIComponent(id)}` : '' }, { replace: true });
    },
    [navigate, pathname, steps],
  );
  const last = steps.length - 1;
  const { previous, next } = movesFrom(place, last);

  // The keys, when the focus is not in a field of text.
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)) return;
      const moves = movesFrom(at.current, last);
      const to: Place | undefined | null =
        event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? moves.next
          : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
            ? moves.previous
            : event.key === 'Home'
              ? 'starts'
              : event.key === 'End'
                ? 'ends'
                : null;
      if (to === null) return;
      event.preventDefault();
      if (to !== undefined) go(to);
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [go, last]);

  // The current row is kept in sight; the focus follows it when it was on a row.
  const list = useRef<HTMLElement>(null);
  const current = step?.id ?? `#${place}`;
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(step !== undefined ? `[data-step="${CSS.escape(step.id)}"]` : `[data-row="${place}"]`);
    if (row === null || row === undefined) return;
    if (document.activeElement instanceof HTMLElement && list.current?.contains(document.activeElement) && document.activeElement !== row) row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
    // Only a move scrolls: `current` says where the reader stands, and the rest follows from it.
  }, [current]);

  // The panel: of a box or a line picked on the diagram, or of a data record of the step.
  const [panel, setPanel] = useState<{ id: string; data: boolean }>();
  const onPick = useCallback((id?: string) => setPanel(id === undefined ? undefined : { id, data: false }), []);
  const close = useCallback(() => setPanel(undefined), []);

  const row = (each: FlowStep) => (
    <button
      key={`${each.number}`}
      type="button"
      className={`flow-row flow-step${each.kind === 'unplaced' ? ' flow-step-unplaced' : ''}`}
      data-row="step"
      data-step={each.id}
      aria-current={each === step ? 'step' : undefined}
      onClick={() => go(each.number - 1)}
    >
      <span className="flow-step-number">{each.number}</span>
      <span className="flow-step-words">
        <span className="flow-step-happens">{each.happens}</span>
        <span className="flow-step-acts">{each.acts}</span>
        {each.reply !== undefined && <span className="flow-step-acts">Reply to {each.reply.number}</span>}
      </span>
    </button>
  );
  const rows = (items: readonly (FlowStep | Run)[]): ReactNode[] =>
    items.map((item, at) =>
      'heading' in item ? (
        <div key={`run ${at}`} className="flow-run">
          <div className="flow-heading">{item.heading}</div>
          <div className="flow-indent">{rows(item.rows)}</div>
        </div>
      ) : (
        row(item)
      ),
    );

  const stepsList = (
    <nav aria-label="Steps" className="flow-steps" ref={list}>
      <button type="button" className="flow-row flow-end" data-row="starts" onClick={() => go('starts')}>
        <span className="flow-end-label">Starts</span>
        <span className="flow-end-text">{flow.starts}</span>
      </button>
      {rows(runsOf(steps))}
      <button type="button" className={`flow-row flow-end${place === 'ends' ? ' current' : ''}`} data-row="ends" onClick={() => go('ends')}>
        <span className="flow-end-label">Ends</span>
        <span className="flow-end-text">{flow.ends}</span>
      </button>
    </nav>
  );

  const crumbs = (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <Link to="/flows">All flows</Link>
      {flow.feature !== undefined && (
        <>
          <span className="breadcrumb-gap" aria-hidden="true">
            /
          </span>
          <Link to={`/features/${flow.feature.id}`}>{flow.feature.name}</Link>
        </>
      )}
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <span className="breadcrumb-here" aria-current="page">
        {flow.name}
      </span>
    </nav>
  );

  return (
    <div className="flow-page">
      {slots?.steps && createPortal(stepsList, slots.steps)}
      {slots?.crumbs && createPortal(crumbs, slots.crumbs)}
      <section aria-label="Current step" className="flow-bar">
        <div className="flow-bar-head">
          <h2 className="flow-bar-title">
            {step !== undefined && (
              <span className="flow-bar-count">
                {step.number} of {steps.length}
              </span>
            )}
            <span>{step !== undefined ? step.happens : flow.name}</span>
          </h2>
          <div className="flow-bar-moves">
            <Button variant="outline" size="icon" aria-label="Previous step" disabled={previous === undefined} onClick={() => previous !== undefined && go(previous)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next step" disabled={next === undefined} onClick={() => next !== undefined && go(next)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="flow-bar-lines">{step !== undefined ? <StepLines step={step} onData={(id) => setPanel({ id, data: true })} /> : <FlowLines flow={flow} />}</div>
      </section>
      {view.boxes.length === 0 ? (
        <CanvasFrame label="Architecture diagram">
          <div className="canvas-empty">
            <EmptyState bare title="Nothing to draw yet" />
          </div>
        </CanvasFrame>
      ) : (
        <Diagram view={view} depth="components" picked={panel !== undefined && !panel.data ? panel.id : undefined} onPick={onPick} step={step?.lights}>
          {panel !== undefined && <Inspector picked={panel.id} view={view} catalogue={catalogue} onClose={close} />}
        </Diagram>
      )}
    </div>
  );
}

/** The lines of the bar for a step; a line with nothing to say is left out. */
function StepLines({ step, onData }: { step: FlowStep; onData: (id: string) => void }) {
  const [one] = step.after;
  const after = one === undefined ? undefined : step.after.length === 1 ? `After ${one.number}, ${one.words}` : `After ${joined(step.after.map((each) => String(each.number)))}`;
  return (
    <>
      <p className="flow-bar-acts">
        {step.acts}
        {step.runs !== undefined && (
          <Link className="text-link flow-bar-open" to={`/flows/${step.runs}`}>
            Open flow
          </Link>
        )}
      </p>
      {step.reply !== undefined && (
        <p>
          Reply to {step.reply.number}, {step.reply.words}
        </p>
      )}
      {after !== undefined && <p>{after}</p>}
      {step.only !== undefined && <p className="flow-bar-only">Only {step.only}</p>}
      {step.description !== undefined && <p className="flow-bar-text">{step.description}</p>}
      {step.data.length > 0 && (
        <p className="flow-bar-data">
          <span className="flow-bar-label">Data</span>
          {step.data.map((each) => (
            <button key={each.id} type="button" className="pill flow-data-pill" data-data={each.id} onClick={() => onData(each.id)}>
              {each.name}
            </button>
          ))}
        </p>
      )}
    </>
  );
}

/** The lines of the bar with no step picked: the flow's feature, its condition and its paragraph. */
function FlowLines({ flow }: { flow: FlowRead }) {
  return (
    <>
      {flow.feature !== undefined && (
        <p>
          <span className="flow-bar-label">Feature</span>
          <Link className="flow-bar-link" to={`/features/${flow.feature.id}`}>
            {flow.feature.name}
          </Link>
        </p>
      )}
      {flow.only !== undefined && <p className="flow-bar-only">Only {flow.only}</p>}
      {flow.description !== undefined && <p className="flow-bar-text">{flow.description}</p>}
    </>
  );
}
