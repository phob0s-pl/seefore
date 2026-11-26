import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Split } from 'lucide-react';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Catalogue } from '../model/catalogue.ts';
import type { Verb } from '../model/changes.ts';
import { flowItems, flowSteps, flowView, itemAt } from '../model/flow.ts';
import type { Act, ActDoes, FlowRead, FlowStep, Item, ItemAt, ItemPlace, ItemUnder, Mark, Was } from '../model/flow.ts';
import type { View } from '../model/view.ts';
import { Diagram } from './diagram.tsx';
import type { Row } from './diagram.tsx';
import { Inspector } from './inspector.tsx';
import type { Life } from './inspector.tsx';
import { addressOf } from './models.tsx';
import type { ModelState, Slots } from './shell.tsx';
import { Button, CanvasFrame, EmptyState, MarkPill, useTitle } from './ui.tsx';

/** Where the reader stands: before the first step, on a step by its place, or at the end. */
type Place = 'starts' | number | 'ends';

/** The places before and after one: before the first step is Starts, after the last step is Ends, and after Ends nothing. */
function movesFrom(place: Place, last: number): { previous?: Place; next?: Place } {
  if (place === 'starts') return { next: last >= 0 ? 0 : 'ends' };
  if (place === 'ends') return { previous: last >= 0 ? last : 'starts' };
  return { previous: place > 0 ? place - 1 : 'starts', next: place < last ? place + 1 : 'ends' };
}

/** Words joined as people join them: "1 and 5", "1, 3 and 5". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** The step's id an address names after `#`, or none. */
export function stepInHash(hash: string): string {
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
  const view = useMemo(() => (answer ? flowView(answer.records, id) : undefined), [answer, id]);
  const items = useMemo(() => (answer ? flowItems(answer.records, id) : NO_ITEMS), [answer, id]);
  useTitle(flow?.name ?? 'Flows');
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (answer === undefined || catalogue === undefined) return <p className="page-line">Reading…</p>;
  if (flow === undefined || view === undefined) {
    return (
      <EmptyState title="No such flow.">
        <Link className="text-link" to="/features">
          Features
        </Link>
      </EmptyState>
    );
  }
  // Another flow is a page of its own: what was picked and laid out is let go.
  return <FlowBody key={flow.id} flow={flow} steps={flow.steps} count={flow.steps.length} view={view} items={items} catalogue={catalogue} slots={slots} crumbs={<FeatureCrumbs flow={flow} catalogue={catalogue} />} />;
}

/** The way out of a flow in the system, in the top bar: Features, the feature, the flow. */
function FeatureCrumbs({ flow, catalogue }: { flow: FlowRead; catalogue: Catalogue }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <Link to="/features">Features</Link>
      {flow.feature !== undefined && (
        <>
          <span className="breadcrumb-gap" aria-hidden="true">
            /
          </span>
          <Link to={addressOf(catalogue, 'features', flow.feature.id)}>{flow.feature.name}</Link>
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
}

/**
 * A step as the list and the bar show it. Under a change it bears what the change does to it,
 * today's words for each of its own keys written otherwise, and whether it only moved; on the
 * flow's own page it bears none of these.
 */
export type StepShown = FlowStep & { mark?: Mark; was?: readonly Was[]; moved?: true };

/** The word a row and a field bear for what a change does to them; a step that stays bears none. */
export const MARK_WORDS: Partial<Record<Mark, string>> = { added: 'Added', removed: 'Removed', updated: 'Updated' };

/** What a change does to a step, as the pill of a record says it. */
const MARK_VERBS: Partial<Record<Mark, Verb>> = { added: 'add', removed: 'remove', updated: 'update' };

/** No words of today: the flow's own page, and a flow a change adds or removes. */
const NONE: readonly Was[] = [];

/**
 * An item as its row, its pills and its panel show it. Under a change it bears what the change
 * does to it, today's acts of one updated by its acts, whether the change updates its data record,
 * and the steps of today that name it with no way said (`ItemUnder`); on the flow's own page it
 * bears none of these.
 */
export type ItemShown = Item & Partial<Omit<ItemUnder, keyof Item>>;

/** No items: a flow that keeps nothing in a store it draws. */
const NO_ITEMS: readonly ItemShown[] = [];

/** The mark of an item that the change does not leave as it is, or none. */
const markOf = (item: ItemShown): Exclude<Mark, 'same'> | undefined => (item.mark === undefined || item.mark === 'same' ? undefined : item.mark);

/** A thing worth a line: not nothing, and not the `false` of a condition that does not hold. */
const something = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false && node !== '';

/** A group of steps under words that stand once above them: a condition, or a strand. */
type Run = { heading: string; rows: (StepShown | Run)[] };

/** The steps as the bar of steps stands them: strands, and conditions inside them. */
function runsOf(steps: readonly StepShown[]): (StepShown | Run)[] {
  const top: (StepShown | Run)[] = [];
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

/**
 * Where the items stand at a place of the list, as `itemAt` reads it: a step by its place in the
 * list, from 1, which is its number on a flow's own page; under a change each act stands at the
 * row of its step in the one list, a step that goes too, and "so far" counts down that list.
 */
const itemPlaceOf = (place: Place): ItemPlace => (typeof place === 'number' ? place + 1 : place);

/** The place in the list, from 1, of the step an act stands at: its row under a change, else its number. */
const rowOf = (act: Act): number => act.row ?? act.number;

/** An item picked in its store's box: the store's id and the data's. */
type Picked = { store: string; data: string };

/**
 * The rows of each store's box at a place, by the store's id, in the order of the items; the row
 * of the picked item says so. Under a change a row bears its item's mark, also at a step that goes:
 * each row is read from its own side.
 */
function rowsAt(items: readonly ItemShown[], place: Place, picked: Picked | undefined): Map<string, Row[]> {
  const at = itemPlaceOf(place);
  const rows = new Map<string, Row[]>();
  for (const item of items) {
    const { is, word } = itemAt(item, at);
    const mark = markOf(item);
    const row: Row = {
      data: item.data.id,
      name: item.data.name,
      is,
      ...(word !== undefined ? { word } : {}),
      ...(item.condition !== undefined ? { condition: item.condition } : {}),
      ...(mark !== undefined ? { mark } : {}),
      ...(picked?.store === item.store.id && picked.data === item.data.id ? { picked: true as const } : {}),
    };
    rows.set(item.store.id, [...(rows.get(item.store.id) ?? []), row]);
  }
  return rows;
}

/** What an act does to its item, as its life says it. */
const DONE: Record<ActDoes, string> = { put: 'Put', read: 'Read', take: 'Taken out' };

/**
 * A life as its panel reads it: an act a row, by the step of this flow it stands at, and where that
 * step stands in the list. A step's description stands once, under its last act. Under a change,
 * today's acts, those of an item that goes and today's life of one updated by its acts, say what
 * happens in their step and its description as today has them, for the list reads a step that
 * stays as it would be; an act at a step that goes says so.
 */
function actsOf(acts: readonly Act[], steps: readonly StepShown[], today = false): Life['acts'] {
  return acts.map((act, index) => {
    const at = rowOf(act) - 1;
    const step = steps[at];
    const next = acts[index + 1];
    const last = next === undefined || rowOf(next) !== rowOf(act);
    const happens = today ? act.happens : step?.happens;
    const description = today ? act.description : step?.description;
    return {
      does: DONE[act.does],
      number: act.number,
      at,
      by: act.byRun ? 'the flow it runs' : act.part.name,
      happens: happens ?? '',
      ...(act.goes === true ? { goes: true as const } : {}),
      ...(act.only !== undefined ? { only: `Only ${act.only}` } : {}),
      ...(last && description !== undefined ? { description } : {}),
    };
  });
}

/** Numbers as a sentence names steps: "Step 11 names it", "Steps 11 and 14 name it". */
const namesIt = (numbers: readonly number[]): string =>
  numbers.length === 1 ? `Step ${numbers[0]} names it and says no way.` : `Steps ${joined(numbers.map(String))} name it and say no way.`;

/**
 * An item's life as its panel reads it: its acts, and whether one puts it. Under a change, of an
 * item the change marks, what it is today: of one added, not drawn where a step of today names it
 * with no way said, else not in this store; of one removed, whose life is today's, not in this
 * store with the change; of one updated, today's life where its acts differ, and that the change
 * updates its data record where it does.
 */
function lifeOf(item: ItemShown, steps: readonly StepShown[]): Life {
  const mark = markOf(item);
  const words =
    mark === 'added'
      ? [item.unsaid !== undefined && item.unsaid.length > 0 ? `Today: not drawn. ${namesIt(item.unsaid)}` : 'Today: not in this store, by what the flow says.']
      : mark === 'removed'
        ? ['With this change: not in this store, by what the flow says.']
        : item.record === true
          ? ['The change updates the data record.']
          : [];
  return {
    store: item.store.name,
    acts: actsOf(item.acts, steps, mark === 'removed'),
    put: item.acts.some((act) => act.does === 'put'),
    ...(mark !== undefined
      ? { under: { mark, words, ...(item.today !== undefined ? { today: { acts: actsOf(item.today, steps, true), put: item.today.some((act) => act.does === 'put') } } : {}) } }
      : {}),
  };
}

/** What the panel says: a box or a line picked on the diagram, a data record of the step, or an item picked in its store's box. */
type Panel = { kind: 'picked' | 'data'; id: string } | ({ kind: 'item' } & Picked);

/** A line of the bar: what the step does at one store, the items it does it to, and whether a flow that the step runs does it. */
type ActLine = { does: ActDoes; store: { id: string; name: string }; items: ItemShown[]; byRun: boolean };

/** What a step does at its stores, as its bar says it: its lines, and the ids of the data its own `data` makes an act of. */
type Done = { lines: ActLine[]; acted: Set<string> };

/**
 * What the step at a place does at its stores: a line for each of put, read and take out, in that
 * order, and for each store, the stores by their first act in the step; the items of a line each
 * once, by their act. And the data that the step's own `data` makes an act of, which "Data" leaves
 * out. Nothing before the first step and at Ends. Under a change each step is read from its own
 * side, as its rows are: one that stays as it would be, where an item that goes, whose acts are
 * today's, does nothing; one that goes as today has it, by the acts of the items that go.
 */
function doneAt(items: readonly ItemShown[], steps: readonly StepShown[], place: Place): Done {
  const at = itemPlaceOf(place);
  const step = typeof place === 'number' ? steps[place] : undefined;
  const goes = step?.mark === 'removed';
  const acts =
    step === undefined
      ? []
      : items.flatMap((item) => ((item.mark === 'removed') === goes ? item.acts.filter((act) => rowOf(act) === at).map((act) => ({ item, act })) : [])).sort((a, b) => a.act.order - b.act.order);
  const stores = [...new Set(acts.map(({ item }) => item.store.id))];
  const lines = (['put', 'read', 'take'] as const).flatMap((does) =>
    stores.flatMap((store): ActLine[] => {
      const these = acts.filter(({ item, act }) => item.store.id === store && act.does === does);
      const [first] = these;
      return first === undefined ? [] : [{ does, store: first.item.store, items: [...new Set(these.map(({ item }) => item))], byRun: first.act.byRun }];
    }),
  );
  // A take is of `removes`, and an act of a flow the step runs is none of its own `data`.
  const acted = new Set(acts.filter(({ act }) => act.does !== 'take' && !act.byRun).map(({ item }) => item.data.id));
  return { lines, acted };
}

/** The items a store holds at Ends that are kept, gone or only read: a store each, in the order of their first row. */
type Held = { store: { id: string; name: string }; items: ItemShown[] };

/**
 * What a flow leaves behind, as the bar at Ends says it: the items each store keeps, those gone
 * and those only read, the stores in the order of their first row; the data records that the
 * flow's own steps name in `data` and that are no item here, in the order they are first named;
 * and the flows its own steps run, each once, in order. Under a change the lists are those of the
 * flow as it would be: a step that goes is none of it, and an item that goes none of its items.
 */
function leftAtEnds(all: readonly ItemShown[], steps: readonly StepShown[], isData: (id: string) => boolean) {
  const items = all.filter((item) => item.mark !== 'removed');
  const stores = [...new Map(items.map((item) => [item.store.id, item.store])).values()];
  const held = (is: ItemAt['is']): Held[] =>
    stores.flatMap((store) => {
      const these = items.filter((item) => item.store.id === store.id && itemAt(item, 'ends').is === is);
      return these.length > 0 ? [{ store, items: these }] : [];
    });
  const own = steps.filter((step) => step.mark !== 'removed');
  const inStores = new Set(items.map((item) => item.data.id));
  const passed = [...new Map(own.flatMap((step) => step.data.filter((each) => !inStores.has(each.id) && isData(each.id))).map((each) => [each.id, each])).values()];
  const runs = [...new Set(own.flatMap((step) => step.runs ?? []))];
  return { kept: held('kept'), gone: held('gone'), read: held('only-read'), passed, runs };
}

/** The look of an item's pill by what is done to it: put or kept in the tint of stores, read plain, taken out or gone in red and struck through. */
type Look = 'kept' | 'plain' | 'gone';
const LOOK: Record<ActDoes, Look> = { put: 'kept', read: 'plain', take: 'gone' };

/** What an act does, as its line in the bar begins: "Puts into orders database". */
const DOES: Record<ActDoes, string> = { put: 'Puts into', read: 'Reads from', take: 'Takes out of' };

/**
 * The page of a flow, drawn from what is handed to it: the flow's head; its steps, in the order the
 * list stands them; how many steps the flow has, for "4 of 12"; the view of the diagram, laid out
 * once; the items its stores hold, a row each in its store's box; the catalogue its links and its
 * panel are made with; and the way back for the top bar. Under a change, the steps bear their
 * marks, `was` holds today's words of the flow's own keys that the change writes otherwise, `marks`
 * what the change does to each box, arrow and connection of the view, `verbs` what it does to each
 * record it names, by its path, and `system`, for a flow the change removes, its address in the
 * system.
 *
 * A row is what its item is at the place the page stands at: hollow before the first step, as
 * after the last at Ends, and lit with the step's word where the current step touches it. A click
 * on a row opens its item's panel, with its life first; the step stays. The bar says it in words:
 * at a step what the step does at its stores, at Ends what the flow leaves behind; a pill there
 * opens the item's panel as its row does. The button on and the down key go on from the last step
 * to Ends. Under a change the items are those of both sides, each with its mark: its row bears it,
 * and its panel says what it is today.
 */
export function FlowBody({
  flow,
  steps,
  count,
  view,
  items = NO_ITEMS,
  was = NONE,
  marks,
  verbs,
  catalogue,
  slots,
  crumbs,
  system,
}: {
  flow: FlowRead;
  steps: readonly StepShown[];
  count: number;
  view: View;
  items?: readonly ItemShown[];
  was?: readonly Was[];
  marks?: ReadonlyMap<string, Mark>;
  verbs?: ReadonlyMap<string, Verb>;
  catalogue: Catalogue;
  slots: Slots | undefined;
  crumbs: ReactNode;
  system?: string;
}) {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
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
      // What the address asks besides the step stays: under a change, which of the two views.
      void navigate({ pathname, search, hash: id !== undefined ? `#${encodeURIComponent(id)}` : '' }, { replace: true });
    },
    [navigate, pathname, search, steps],
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

  // The panel: of a box or a line picked on the diagram, of a data record of the step, or of an item picked in its store's box.
  const [panel, setPanel] = useState<Panel>();
  const onPick = useCallback((id?: string) => setPanel(id === undefined ? undefined : { kind: 'picked', id }), []);
  const onItem = useCallback((store: string, data: string) => setPanel({ kind: 'item', store, data }), []);
  const close = useCallback(() => setPanel(undefined), []);

  // The rows of the stores' boxes at this place, and the life of the item picked.
  const item = panel?.kind === 'item' ? items.find((each) => each.store.id === panel.store && each.data.id === panel.data) : undefined;
  const pickedItem = item && panel?.kind === 'item' ? panel : undefined;
  const kept = useMemo(() => rowsAt(items, place, pickedItem), [items, place, pickedItem]);
  const life = useMemo(() => (item !== undefined ? lifeOf(item, steps) : undefined), [item, steps]);
  // What the current step does at its stores, in the bar.
  const done = useMemo(() => doneAt(items, steps, place), [items, steps, place]);
  const onData = useCallback((id: string) => setPanel({ kind: 'data', id }), []);

  // A row's place in the list, which a step's number is not under a change: a step that goes keeps today's.
  const places = useMemo(() => new Map(steps.map((each, at) => [each, at])), [steps]);
  const row = (each: StepShown) => {
    const at = places.get(each) ?? 0;
    const mark = each.mark !== undefined && each.mark !== 'same' ? each.mark : undefined;
    return (
      <button
        key={`${at}`}
        type="button"
        className={`flow-row flow-step${each.kind === 'unplaced' ? ' flow-step-unplaced' : ''}${mark !== undefined ? ` flow-step-${mark}` : ''}`}
        data-row="step"
        data-step={each.id}
        data-mark={mark}
        aria-current={each === step ? 'step' : undefined}
        onClick={() => go(at)}
      >
        <span className="flow-step-number">{mark === 'removed' ? '−' : each.number}</span>
        <span className="flow-step-words">
          <span className="flow-step-happens">{each.happens}</span>
          <span className="flow-step-acts">{each.acts}</span>
          {each.reply !== undefined && <span className="flow-step-acts">Reply to {each.reply.number}</span>}
        </span>
        {mark !== undefined ? <span className="flow-step-mark">{MARK_WORDS[mark]}</span> : each.moved === true && <span className="flow-step-mark flow-step-moved">Moved</span>}
      </button>
    );
  };
  // Starts and Ends: the first and the last row. Under a change, one whose sentence changes bears the word and today's sentence.
  const head = new Map(was.map((each) => [each.key, each]));
  const end = (at: 'starts' | 'ends', label: string, text: string | undefined) => {
    const changed = head.get(at);
    return (
      <button type="button" className={`flow-row flow-end${at === 'ends' && place === 'ends' ? ' current' : ''}${changed !== undefined ? ' flow-step-updated' : ''}`} data-row={at} onClick={() => go(at)}>
        {changed !== undefined ? (
          <span className="flow-end-head">
            <span className="flow-end-label">{label}</span>
            <span className="flow-step-mark">Updated</span>
          </span>
        ) : (
          <span className="flow-end-label">{label}</span>
        )}
        <span className="flow-end-text">{changed?.gone === true ? 'Taken out' : text}</span>
        {changed !== undefined && <span className="flow-end-today">Today: {changed.today ?? 'nothing'}</span>}
      </button>
    );
  };
  const rows = (items: readonly (StepShown | Run)[]): ReactNode[] =>
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
      {end('starts', 'Starts', flow.starts)}
      {rows(runsOf(steps))}
      {end('ends', 'Ends', flow.ends)}
    </nav>
  );

  // The title of the bar, and today's words for it when the change renames the step or the flow.
  const named = (step !== undefined ? step.was : was)?.find((each) => each.key === 'name');
  const mark = step?.mark !== undefined && step.mark !== 'same' ? step.mark : undefined;
  const verb = mark !== undefined ? MARK_VERBS[mark] : undefined;

  return (
    <div className="flow-page">
      {slots?.steps && createPortal(stepsList, slots.steps)}
      {slots?.crumbs && createPortal(crumbs, slots.crumbs)}
      <section aria-label="Current step" className="flow-bar">
        <div className="flow-bar-head">
          <h2 className="flow-bar-title">
            {step !== undefined && <span className="flow-bar-count">{mark === 'removed' ? `Was step ${step.number}` : `${step.number} of ${count}`}</span>}
            <span className={named !== undefined ? 'flow-line-changed' : undefined}>{step !== undefined ? step.happens : flow.name}</span>
            {verb !== undefined ? <MarkPill verb={verb} /> : step?.moved === true && <span className="flow-bar-moved">Moved</span>}
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
        <div className="flow-bar-lines">
          {named !== undefined && <Today was={named} />}
          {step !== undefined ? (
            <StepLines step={step} done={done} catalogue={catalogue} onData={onData} onItem={onItem} />
          ) : place === 'ends' ? (
            <EndsLines flow={flow} was={head} steps={steps} items={items} catalogue={catalogue} system={system} onData={onData} onItem={onItem} />
          ) : (
            <FlowLines flow={flow} was={head} catalogue={catalogue} system={system} />
          )}
        </div>
      </section>
      {view.boxes.length === 0 ? (
        <CanvasFrame label="Architecture diagram">
          <div className="canvas-empty">
            <EmptyState bare title="Nothing to draw yet" />
          </div>
        </CanvasFrame>
      ) : (
        <Diagram view={view} depth="components" shape="flow" picked={panel?.kind === 'picked' ? panel.id : undefined} onPick={onPick} step={step?.lights} marks={marks} rows={kept} onItem={onItem}>
          {panel !== undefined && (
            <Inspector picked={panel.kind === 'item' ? panel.data : panel.id} view={view} catalogue={catalogue} onClose={close} marks={marks} verbs={verbs} life={life} onStep={go} />
          )}
        </Diagram>
      )}
    </div>
  );
}

/** Today's words for a key a change writes otherwise, quiet, under its line: "Today: nothing" where the key is new. */
function Today({ was }: { was: Was }) {
  return <p className="flow-line-today">Today: {was.today ?? 'nothing'}</p>;
}

/**
 * A line of the bar. A line with nothing to say is left out. Under a change, the line of a key
 * the change writes otherwise has a yellow rule and today's words under it; where the change
 * takes the key out, the line says so.
 */
function Line({ was, className, children }: { was: Was | undefined; className?: string; children: ReactNode }) {
  if (was === undefined) return something(children) ? <p className={className}>{children}</p> : null;
  return (
    <>
      <p className={className === undefined ? 'flow-line-changed' : `${className} flow-line-changed`}>{was.gone === true ? 'Taken out' : something(children) ? children : <span className="quiet">None</span>}</p>
      <Today was={was} />
    </>
  );
}

/**
 * An item's pill in the bar, in the look of what is done to it, with the sign of a condition where
 * the item stands under one. A click opens the item's panel, as a click on its row does.
 */
function ItemPill({ item, look, onItem }: { item: Item; look: Look; onItem: (store: string, data: string) => void }) {
  return (
    <button type="button" className={`pill flow-item-pill flow-item-${look}`} data-store={item.store.id} data-item={item.data.id} onClick={() => onItem(item.store.id, item.data.id)}>
      <span className="flow-item-name">{item.data.name}</span>
      {item.condition !== undefined && (
        <span className="flow-item-sign" role="img" aria-label={item.condition} title={item.condition}>
          <Split aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

/**
 * The lines of the bar for a step; a line with nothing to say is left out. Its links are made by
 * the catalogue. After the step's sentence, what the step does at each store: "Puts into orders
 * database", "Reads from", "Takes out of", each with its items' pills, and "by the flow it runs"
 * where that flow does it; then "Data" for what the step names and makes no act of. Under a
 * change these lines are read as the flow would be, and of a step that goes as today has it, as
 * its rows are. Where what the step does at its store reads otherwise than today, each of them and
 * "Data" has the yellow rule, and under the last of them stand today's words; where it names
 * nothing now, one line says "Taken out" over them.
 */
function StepLines({
  step,
  done,
  catalogue,
  onData,
  onItem,
}: {
  step: StepShown;
  done: Done;
  catalogue: Catalogue;
  onData: (id: string) => void;
  onItem: (store: string, data: string) => void;
}) {
  const was = new Map((step.was ?? NONE).map((each) => [each.key, each]));
  const data = step.data.filter((each) => !done.acted.has(each.id));
  // What the step does at its store, when it reads otherwise than today: the rule on each of its lines.
  const doing = was.get('data');
  const ruled = (className: string) => (doing !== undefined ? `${className} flow-line-changed` : className);
  const [one] = step.after;
  const after = one === undefined ? undefined : step.after.length === 1 ? `After ${one.number}, ${one.words}` : `After ${joined(step.after.map((each) => String(each.number)))}`;
  return (
    <>
      <Line was={was.get('does')} className="flow-bar-acts">
        {step.acts}
        {step.runs !== undefined && (
          <Link className="text-link flow-bar-open" to={addressOf(catalogue, 'flows', step.runs)}>
            Open flow
          </Link>
        )}
      </Line>
      <Line was={was.get('reply')}>{step.reply !== undefined && `Reply to ${step.reply.number}, ${step.reply.words}`}</Line>
      <Line was={was.get('after')}>{after}</Line>
      <Line was={was.get('only')} className="flow-bar-only">
        {step.only !== undefined && `Only ${step.only}`}
      </Line>
      <Line was={was.get('description')} className="flow-bar-text">
        {step.description}
      </Line>
      {done.lines.map((line) => (
        <p key={`${line.does} ${line.store.id}`} className={ruled('flow-bar-data')} data-does={line.does}>
          <span className="flow-bar-label">
            {DOES[line.does]} {line.store.name}
          </span>
          {line.items.map((item) => (
            <ItemPill key={item.data.id} item={item} look={LOOK[line.does]} onItem={onItem} />
          ))}
          {line.byRun && <span className="flow-bar-quiet">by the flow it runs</span>}
        </p>
      ))}
      {data.length > 0 && (
        <p className={ruled('flow-bar-data')}>
          <span className="flow-bar-label">Data</span>
          {data.map((each) => (
            <button key={each.id} type="button" className="pill flow-data-pill" data-data={each.id} onClick={() => onData(each.id)}>
              {each.name}
            </button>
          ))}
        </p>
      )}
      {doing !== undefined && (done.lines.length > 0 || data.length > 0 ? <Today was={doing} /> : <Line was={doing}>{null}</Line>)}
    </>
  );
}

/**
 * The lines of the bar before the first step: the flow's feature, its condition and its paragraph,
 * each read as a step's lines are under a change. For a flow the change removes, a line says so
 * first, with the way to the flow in the system; it says so at Ends too.
 */
function FlowLines({ flow, was, catalogue, system }: { flow: FlowRead; was: ReadonlyMap<string, Was>; catalogue: Catalogue; system: string | undefined }) {
  return (
    <>
      <Removed system={system} />
      <Line was={was.get('feature')}>
        {flow.feature !== undefined && (
          <>
            <span className="flow-bar-label">Feature</span>
            <Link className="flow-bar-link" to={addressOf(catalogue, 'features', flow.feature.id)}>
              {flow.feature.name}
            </Link>
          </>
        )}
      </Line>
      <Line was={was.get('only')} className="flow-bar-only">
        {flow.only !== undefined && `Only ${flow.only}`}
      </Line>
      <Line was={was.get('description')} className="flow-bar-text">
        {flow.description}
      </Line>
    </>
  );
}

/** For a flow the change removes, the line that says so, with the way to the flow in the system. */
function Removed({ system }: { system: string | undefined }) {
  if (system === undefined) return null;
  return (
    <p className="flow-bar-removed">
      Removed by this change. This is the flow as it is today.{' '}
      <Link className="flow-bar-link" to={system}>
        Open it in the system
      </Link>
    </p>
  );
}

/** A store's name, quiet, and the pills of its items in one look. */
function HeldIn({ held, look, onItem }: { held: Held; look: Look; onItem: (store: string, data: string) => void }) {
  return (
    <span className="flow-bar-held" data-store={held.store.id}>
      <span className="flow-bar-store">{held.store.name}</span>
      {held.items.map((item) => (
        <ItemPill key={item.data.id} item={item} look={look} onItem={onItem} />
      ))}
    </span>
  );
}

/**
 * The lines of the bar at Ends: the flow's sentence for it, read under a change as the lines
 * before the first step are; "Kept", each store with what it keeps; on one line "Gone", "Only
 * read" and "Only passed"; and "Also runs", the flows its own steps run, each a link, with where to
 * read what they keep in other stores. A line with nothing in it is left out. An item's pill opens
 * its panel; one that only passed, its data's.
 */
function EndsLines({
  flow,
  was,
  steps,
  items,
  catalogue,
  system,
  onData,
  onItem,
}: {
  flow: FlowRead;
  was: ReadonlyMap<string, Was>;
  steps: readonly StepShown[];
  items: readonly ItemShown[];
  catalogue: Catalogue;
  system: string | undefined;
  onData: (id: string) => void;
  onItem: (store: string, data: string) => void;
}) {
  const { kept, gone, read, passed, runs } = leftAtEnds(items, steps, (id) => catalogue.record(id)?.kind === 'data');
  const held = (each: readonly Held[], look: Look) => each.map((one) => <HeldIn key={one.store.id} held={one} look={look} onItem={onItem} />);
  // The three that share a line, each with its label, those with nothing left out.
  const rest = [
    { label: 'Gone', items: gone.length > 0 && held(gone, 'gone') },
    { label: 'Only read', items: read.length > 0 && held(read, 'plain') },
    {
      label: 'Only passed',
      items:
        passed.length > 0 &&
        passed.map((each) => (
          <button key={each.id} type="button" className="pill flow-item-pill flow-item-plain" data-data={each.id} onClick={() => onData(each.id)}>
            {each.name}
          </button>
        )),
    },
  ].filter((each) => each.items !== false);
  return (
    <>
      <Removed system={system} />
      <Line was={was.get('ends')} className="flow-bar-text">
        {flow.ends}
      </Line>
      {kept.length > 0 && (
        <p className="flow-bar-sum" data-line="kept">
          <span className="flow-bar-label">Kept</span>
          <span className="flow-bar-sum-items">{held(kept, 'kept')}</span>
        </p>
      )}
      {rest[0] !== undefined && (
        <p className="flow-bar-sum" data-line="rest">
          <span className="flow-bar-label">{rest[0].label}</span>
          <span className="flow-bar-sum-items">
            {rest.map((each, at) => (
              <Fragment key={each.label}>
                {at > 0 && <span className="flow-bar-label">{each.label}</span>}
                {each.items}
              </Fragment>
            ))}
          </span>
        </p>
      )}
      {runs.length > 0 && (
        <p className="flow-bar-sum" data-line="runs">
          <span className="flow-bar-label">Also runs</span>
          <span className="flow-bar-sum-items">
            {runs.map((id) => (
              <Link key={id} className="pill flow-data-pill" to={addressOf(catalogue, 'flows', id)}>
                {catalogue.nameOf(id)}
              </Link>
            ))}
            <span className="flow-bar-quiet">What they keep in other stores is on their own pages.</span>
          </span>
        </p>
      )}
    </>
  );
}
