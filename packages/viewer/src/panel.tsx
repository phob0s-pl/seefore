import type { Condition, View, ViewArrow, ViewBox, ViewerState } from '@seefore/core';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { namesIn } from './flow.ts';
import { scopeOf } from './follow.ts';
import type { Selection } from './follow.ts';
import {
  ACCESS_WORDS,
  OPENED_WORDS,
  conditionsIn,
  descriptionOf,
  endName,
  hopName,
  indexOf,
  insideOf,
  keepersOf,
  keptBy,
  kindOf,
  nameOf,
  ownOnly,
  ownerOf,
  passingThrough,
  technologiesOf,
  technologyNames,
  usesOf,
} from './records.ts';
import type { Index } from './records.ts';

/**
 * The panel of details: a record, whole, or every connection an arrow stands for. It is opened
 * by a click or by Enter on a box or an arrow, on something in the list of what the arrows pass
 * through, and on a record in the listing or on a step of a route.
 */

export interface PanelProps {
  state: ViewerState;
  /** The view shown, when the page shows one. */
  view: View | undefined;
  selection: Selection;
  /** True when the panel was opened from the keyboard, so that the focus moves to it. */
  focus: boolean;
  /** The id of the box in scope, which has no button to become it; null for everything. */
  present: string | null;
  onClose(): void;
  /** A record was chosen in the panel, as a step of a route: `byKeyboard` when Enter or Space chose it. */
  onOpen(id: string, byKeyboard: boolean): void;
  /** The button "Show with its neighbours" was pressed: the record is to be the scope. */
  onScope(id: string): void;
}

/** The button of a record that can be the scope, and is not. */
export const SHOW_WITH_NEIGHBOURS = 'Show with its neighbours';

/** What a box carries that the panel lists, as a box and as a boundary. */
type Marked = Pick<ViewBox, 'name' | 'loops' | 'within' | 'passing'>;

/** One fact of a record: what it is, and its value. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** The panel of details. */
export function Panel({ state, view, selection, focus, present, onClose, onOpen, onScope }: PanelProps) {
  const index = useMemo(() => indexOf(state.model), [state.model]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus, selection]);

  const arrow = selection.kind === 'arrow' ? view?.arrows.find((each) => each.id === selection.id) : undefined;
  // A box chosen in the picture, drawn as a box or open as a boundary.
  const box: Marked | undefined = selection.kind === 'box' ? (view?.boxes.find((each) => each.id === selection.id) ?? view?.boundaries.find((each) => each.id === selection.id)) : undefined;
  const passed = selection.kind === 'passed' ? view?.passed.find((each) => each.id === selection.id) : undefined;
  const title = arrow !== undefined ? arrowTitle(arrow, view) : selection.kind === 'arrow' ? selection.id : (box?.name ?? passed?.name ?? nameOf(index, selection.id));
  // What passes through the record in the view shown, when the reader chose it there; otherwise in the whole model.
  const inView = box?.passing ?? passed?.connections;
  // A box, a boundary or a record of the listing that can be the scope, and is not, has the button.
  const scopeable = (selection.kind === 'box' || selection.kind === 'record') && selection.id !== present && scopeOf(state, selection.id) !== undefined;

  return (
    <aside className="panel" aria-label="Details">
      <div className="panel-head">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {scopeable && (
        <p className="panel-scope">
          <button
            type="button"
            onClick={() => {
              onScope(selection.id);
              // The button goes once the box is the scope: the focus stays in the panel, on its title.
              heading.current?.focus();
            }}
          >
            {SHOW_WITH_NEIGHBOURS}
          </button>
        </p>
      )}
      {arrow !== undefined ? (
        <ArrowDetails state={state} arrow={arrow} index={index} onOpen={onOpen} />
      ) : selection.kind === 'arrow' ? (
        <p>This arrow is no longer in the view.</p>
      ) : (
        <RecordDetails state={state} index={index} id={selection.id} box={box} view={view} scope={view?.scope === selection.id} passing={inView} onOpen={onOpen} />
      )}
    </aside>
  );
}

/** The title of an arrow's panel: its two ends. */
function arrowTitle(arrow: ViewArrow, view: View | undefined): string {
  const names = view === undefined ? new Map<string, string>() : namesIn(view);
  return `${names.get(arrow.from) ?? arrow.from} → ${names.get(arrow.to) ?? arrow.to}`;
}

/** Every connection an arrow stands for. */
function ArrowDetails({ state, arrow, index, onOpen }: { state: ViewerState; arrow: ViewArrow; index: Index; onOpen: PanelProps['onOpen'] }) {
  const count = arrow.connections.length;
  return (
    <>
      <p>{count === 1 ? 'This arrow stands for one connection.' : `This arrow stands for ${count} connections.`}</p>
      <ConnectionList state={state} ids={arrow.connections} index={index} onOpen={onOpen} />
    </>
  );
}

interface RecordDetailsProps {
  state: ViewerState;
  index: Index;
  id: string;
  /** The box or the boundary chosen in the picture, with what it carries. */
  box: Marked | undefined;
  /** The view shown, when the page shows one. */
  view: View | undefined;
  scope: boolean;
  /** The connections of the view shown that pass through the record, when it was chosen in the view. */
  passing: readonly string[] | undefined;
  onOpen: PanelProps['onOpen'];
}

/**
 * A record, whole: its name, kind, what it is in, when it is there, technologies, owner,
 * description and file; for a connection what it does to a store and who opened its channel;
 * for a store who reads and writes it, and for one that an app keeps which of its connections
 * the view holds inside that app's box; for an app the stores it keeps; the connections its box
 * holds, and those that pass through it. A connection says what it passes through.
 */
function RecordDetails({ state, index, id, box, view, scope, passing, onOpen }: RecordDetailsProps) {
  const found = index.get(id);
  const through = passing ?? passingThrough(state.model, id);
  const throughHeading = passing === undefined ? `Passing through it (${through.length})` : `Passing through it in this view (${through.length})`;
  const throughList = through.length > 0 && (
    <section>
      <h3>{throughHeading}</h3>
      <ConnectionList state={state} ids={through} index={index} onOpen={onOpen} />
    </section>
  );
  if (found === undefined) {
    const file = fileOf(state, id);
    return (
      <>
        <p className="record-problem">
          {file === undefined ? 'Its file has a problem' : <code>{file}</code>}
          {file === undefined ? ', so ' : ' has a problem, so '}
          <code>{id}</code> is not in the model: <a href="#/problems">see the problems</a>.
        </p>
        {throughList}
      </>
    );
  }
  const inside = insideOf(found);
  const technologies = technologyNames(index, technologiesOf(found));
  const owner = ownerOf(state, index, id);
  const description = descriptionOf(found);
  const via = found.family === 'connections' ? (found.record.via ?? []) : [];
  const conditions = conditionsIn(state, id);
  const own = conditions[0]?.from === id ? conditions[0] : undefined;
  const others = conditions.filter((condition) => condition.from !== id);
  const kept = found.family === 'apps' ? keptBy(state.outline, id) : [];
  const keeper = keepersOf(state.outline).get(id);
  // A store that an app keeps is drawn at its app: what the view holds of it inside that app's box is not drawn.
  const keeperBox: Marked | undefined = keeper === undefined ? undefined : (view?.boxes.find((each) => each.id === keeper) ?? view?.boundaries.find((each) => each.id === keeper));
  const ownConnection = (connection: string) => {
    const at = index.get(connection);
    return at?.family === 'connections' && (at.record.from === id || at.record.to === id);
  };
  const insideKeeper = keeperBox === undefined ? [] : [...keeperBox.within, ...keeperBox.loops].filter(ownConnection).sort();
  const onArrows = keeperBox === undefined ? 0 : (view?.arrows ?? []).flatMap((arrow) => arrow.connections).filter(ownConnection).length;
  return (
    <>
      <dl className="facts">
        <Fact term="Kind">{scope ? `${kindOf(found)}, the one this view is about` : kindOf(found)}</Fact>
        {inside !== undefined && <Fact term={keeper !== undefined ? 'Kept by' : 'In'}>{endName(index, inside)}</Fact>}
        {own !== undefined && <Fact term="Only">{own.only}</Fact>}
        {others.length > 0 && (
          <Fact term="Only, from others">
            <Conditions conditions={others} index={index} onOpen={onOpen} />
          </Fact>
        )}
        {found.family === 'connections' && (
          <Fact term="From and to">{`${endName(index, found.record.from)} → ${endName(index, found.record.to)}`}</Fact>
        )}
        {via.length > 0 && (
          <Fact term="Via">
            <Hops state={state} ids={via} index={index} onOpen={onOpen} />
          </Fact>
        )}
        {found.family === 'connections' && found.record.access !== undefined && <Fact term="Access">{ACCESS_WORDS[found.record.access]}</Fact>}
        {found.family === 'connections' && found.record.opens === 'to' && <Fact term="Channel">{OPENED_WORDS}</Fact>}
        {technologies.length > 0 && <Fact term={technologies.length === 1 ? 'Technology' : 'Technologies'}>{technologies.join(', ')}</Fact>}
        {owner !== undefined && <Fact term="Owner">{owner.from === undefined ? owner.owner : `${owner.owner}, taken from ${owner.from}`}</Fact>}
        <Fact term="Description">{description === undefined ? <span className="none">None yet.</span> : <span className="description">{description}</span>}</Fact>
        <Fact term="File">
          <code>{found.record.file}</code>
        </Fact>
      </dl>
      {found.family === 'stores' && <UsesOf state={state} store={id} index={index} onOpen={onOpen} depth={3} />}
      {keeperBox !== undefined && (
        <section>
          <h3>{`Inside ${keeperBox.name}, not drawn (${insideKeeper.length})`}</h3>
          <p className="kept-note">{insideKeeperWords(insideKeeper.length, onArrows, keeperBox.name)}</p>
          {insideKeeper.length > 0 && <ConnectionList state={state} ids={insideKeeper} index={index} onOpen={onOpen} />}
        </section>
      )}
      {kept.length > 0 && (
        <section>
          <h3>{`Keeps (${kept.length})`}</h3>
          <ul className="kept">
            {kept.map((store) => (
              <KeptStore key={store} state={state} store={store} index={index} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
      {box !== undefined && box.loops.length > 0 && (
        <section>
          <h3>{`Between its copies (${box.loops.length})`}</h3>
          <ConnectionList state={state} ids={box.loops} index={index} onOpen={onOpen} />
        </section>
      )}
      {box !== undefined && box.within.length > 0 && (
        <section>
          <h3>{`Inside it, not drawn (${box.within.length})`}</h3>
          <ConnectionList state={state} ids={box.within} index={index} onOpen={onOpen} />
        </section>
      )}
      {throughList}
    </>
  );
}

/**
 * What the panel of a store that an app keeps says of the view shown: that the store is drawn at
 * its app, and how many of its connections are inside the app's box, and so not drawn.
 */
export function insideKeeperWords(inside: number, onArrows: number, keeper: string): string {
  const which = inside === 0 ? 'none of its connections is' : inside === 1 ? '1 of its connections is' : `${inside} of its connections are`;
  const arrows = onArrows === 0 ? '' : ` ${onArrows} ${onArrows === 1 ? 'is' : 'are'} on the arrows that light with it.`;
  return `${keeper} keeps it, and this view draws it at ${keeper}: ${which} inside ${keeper}, and so not drawn.${arrows}`;
}

/** The conditions a record has from others, each with the record it comes from, which opens that record. */
function Conditions({ conditions, index, onOpen }: { conditions: readonly Condition[]; index: Index; onOpen: PanelProps['onOpen'] }) {
  return (
    <ul className="conditions">
      {conditions.map((condition) => (
        <li key={condition.from}>
          {`only ${condition.only}, from `}
          {/* A click made with the keyboard has no count of presses. */}
          <button type="button" className="record-name" onClick={(event) => onOpen(condition.from, event.detail === 0)}>
            {endName(index, condition.from)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Who uses a store, in four short lists, each left out when empty: who writes it, who reads it,
 * who does both, and whose connection does not say. Each entry is the one that acts and the
 * connection's name, each of which opens its record, and the connection's own `only` in
 * brackets when it has one: a write that is made only sometimes says so where it is listed.
 * `depth` is the level of the headings.
 */
function UsesOf({ state, store, index, onOpen, depth }: { state: ViewerState; store: string; index: Index; onOpen: PanelProps['onOpen']; depth: 3 | 4 }) {
  const uses = usesOf(state.model, store);
  const lists: [string, string[]][] = [
    ['Written by', uses.writes],
    ['Read by', uses.reads],
    ['Read and written by', uses.both],
    ['Does not say', uses.unsaid],
  ];
  const Heading = depth === 3 ? 'h3' : 'h4';
  return (
    <>
      {lists
        .filter(([, ids]) => ids.length > 0)
        .map(([title, ids]) => (
          <section key={title} className="uses">
            <Heading>{`${title} (${ids.length})`}</Heading>
            <ul>
              {ids.map((id) => {
                const found = index.get(id);
                if (found?.family !== 'connections') return null;
                const only = ownOnly(state, id);
                return (
                  <li key={id}>
                    {/* A click made with the keyboard has no count of presses. */}
                    <button type="button" className="record-name" onClick={(event) => onOpen(found.record.from, event.detail === 0)}>
                      {endName(index, found.record.from)}
                    </button>
                    {': '}
                    <button type="button" className="record-name" onClick={(event) => onOpen(id, event.detail === 0)}>
                      {nameOf(index, id)}
                    </button>
                    {only !== undefined && <span className="uses-only">{` (only ${only})`}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </>
  );
}

/**
 * A store that an app keeps, on the app's panel: its name, which opens it, its kind, its own
 * `only`, who uses it, and the connections that start at it, which a store has only to another store.
 */
function KeptStore({ state, store, index, onOpen }: { state: ViewerState; store: string; index: Index; onOpen: PanelProps['onOpen'] }) {
  const found = index.get(store);
  if (found === undefined) return null;
  const own = ownOnly(state, store);
  const from = state.model.connections.filter((connection) => connection.from === store).map((connection) => connection.id);
  return (
    <li className="kept-store">
      <p>
        {/* A click made with the keyboard has no count of presses. */}
        <button type="button" className="record-name" onClick={(event) => onOpen(store, event.detail === 0)}>
          {nameOf(index, store)}
        </button>{' '}
        <span className="kept-kind">{`[${kindOf(found)}]`}</span>
      </p>
      {own !== undefined && <p className="kept-only">{`only ${own}`}</p>}
      <UsesOf state={state} store={store} index={index} onOpen={onOpen} depth={4} />
      {from.length > 0 && (
        <section>
          <h4>{`From it (${from.length})`}</h4>
          <ConnectionList state={state} ids={from} index={index} onOpen={onOpen} />
        </section>
      )}
    </li>
  );
}

/**
 * The file of a record that is not in the model, as a problem names it: a file directly in a
 * folder, named for the id. Missing when no problem names one.
 */
function fileOf(state: ViewerState, id: string): string | undefined {
  return state.problems.find((problem) => {
    const parts = problem.file.split('/');
    const name = parts[1];
    return parts.length === 2 && name !== undefined && name.slice(0, name.lastIndexOf('.')) === id;
  })?.file;
}

/** True when a thing on a route has a condition, its own or one from what it is in. */
function conditional(state: ViewerState, id: string): boolean {
  return conditionsIn(state, id).length > 0;
}

/**
 * What a connection passes through, in the order of travel, each step a link that opens its
 * record. With no condition on the way, on one line: `Gateway, Load balancer`. When a step has a
 * condition, one step to a line: its name in brackets, as on the route of an arrow, and beside it
 * each condition it has, with the record it comes from when that is not the step itself, so that
 * a reader of a route in brackets sees why. The connection has none of these from its route.
 */
function Hops({ state, ids, index, onOpen }: { state: ViewerState; ids: readonly string[]; index: Index; onOpen: PanelProps['onOpen'] }) {
  // A click made with the keyboard has no count of presses.
  const step = (id: string) => (
    <button type="button" className="record-name" onClick={(event) => onOpen(id, event.detail === 0)}>
      {hopName(state, index, id)}
    </button>
  );
  if (!ids.some((id) => conditional(state, id))) {
    return (
      <span className="hops">
        {ids.map((id, at) => (
          <Fragment key={`${id}-${at}`}>
            {at > 0 && ', '}
            {step(id)}
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <ol className="hops hops-conditions">
      {ids.map((id, at) => (
        <li key={`${id}-${at}`}>
          {step(id)}
          {conditionsIn(state, id).map((condition) => (
            <span key={condition.from} className="hop-only">
              {condition.from === id ? ` only ${condition.only}` : ` only ${condition.only}, from `}
              {condition.from !== id && (
                <button type="button" className="record-name" onClick={(event) => onOpen(condition.from, event.detail === 0)}>
                  {endName(index, condition.from)}
                </button>
              )}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

/**
 * Connections, each with its own two ends, its name, what it passes through, what it does to a
 * store, who opened its channel, when it is there, its technology, its description and its file.
 */
function ConnectionList({ state, ids, index, onOpen }: { state: ViewerState; ids: readonly string[]; index: Index; onOpen: PanelProps['onOpen'] }) {
  return (
    <ol className="connections">
      {ids.map((id) => {
        const found = index.get(id);
        if (found?.family !== 'connections') {
          return (
            <li key={id}>
              <code>{id}</code>
            </li>
          );
        }
        const connection = found.record;
        const technologies = technologyNames(index, connection.technology);
        const conditions = conditionsIn(state, id);
        const own = conditions[0]?.from === id ? conditions[0] : undefined;
        const others = conditions.filter((condition) => condition.from !== id);
        const via = connection.via ?? [];
        // A route with a condition on it has a step to a line, which a paragraph cannot hold.
        const Route = via.some((hop) => conditional(state, hop)) ? 'div' : 'p';
        return (
          <li key={id} className="connection">
            <p className="connection-name">{connection.name ?? 'Unnamed connection'}</p>
            <p className="connection-ends">{`${endName(index, connection.from)} → ${endName(index, connection.to)}`}</p>
            {via.length > 0 && (
              <Route className="connection-route">
                {'via '}
                <Hops state={state} ids={via} index={index} onOpen={onOpen} />
              </Route>
            )}
            {connection.access !== undefined && <p className="connection-access">{ACCESS_WORDS[connection.access]}</p>}
            {connection.opens === 'to' && <p className="connection-opened">{OPENED_WORDS}</p>}
            {own !== undefined && <p className="connection-only">{`only ${own.only}`}</p>}
            {others.length > 0 && <Conditions conditions={others} index={index} onOpen={onOpen} />}
            {technologies.length > 0 && <p className="connection-technology">{`[${technologies.join(', ')}]`}</p>}
            {connection.description !== undefined && <p className="description">{connection.description}</p>}
            <p className="connection-file">
              <code>{connection.file}</code>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
