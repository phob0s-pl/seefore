import type { View, ViewArrow, ViewBox, ViewerState } from '@seefore/core';
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { namesIn } from './flow.ts';
import type { Selection } from './follow.ts';
import { descriptionOf, endName, indexOf, insideOf, kindOf, nameOf, ownerOf, technologiesOf, technologyNames } from './records.ts';
import type { Index } from './records.ts';

/**
 * The panel of details: a record, whole, or every connection an arrow stands for. It is opened
 * by a click or by Enter on a box or an arrow, and by a click on a record in the listing.
 */

export interface PanelProps {
  state: ViewerState;
  /** The view shown, when the page shows one. */
  view: View | undefined;
  selection: Selection;
  /** True when the panel was opened from the keyboard, so that the focus moves to it. */
  focus: boolean;
  onClose(): void;
}

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
export function Panel({ state, view, selection, focus, onClose }: PanelProps) {
  const index = useMemo(() => indexOf(state.model), [state.model]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus, selection]);

  const arrow = selection.kind === 'arrow' ? view?.arrows.find((each) => each.id === selection.id) : undefined;
  const box = selection.kind === 'box' ? view?.boxes.find((each) => each.id === selection.id) : undefined;
  const title = arrow !== undefined ? arrowTitle(arrow, view) : selection.kind === 'arrow' ? selection.id : box?.name ?? nameOf(index, selection.id);

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
      {arrow !== undefined ? (
        <ArrowDetails arrow={arrow} index={index} />
      ) : selection.kind === 'arrow' ? (
        <p>This arrow is no longer in the view.</p>
      ) : (
        <RecordDetails state={state} index={index} id={selection.id} box={box} scope={view?.scope === selection.id} />
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
function ArrowDetails({ arrow, index }: { arrow: ViewArrow; index: Index }) {
  const count = arrow.connections.length;
  return (
    <>
      <p>{count === 1 ? 'This arrow stands for one connection.' : `This arrow stands for ${count} connections.`}</p>
      <ConnectionList ids={arrow.connections} index={index} />
    </>
  );
}

/** A record, whole: its name, kind, technologies, owner, description and file, and the connections its box holds. */
function RecordDetails({ state, index, id, box, scope }: { state: ViewerState; index: Index; id: string; box: ViewBox | undefined; scope: boolean }) {
  const found = index.get(id);
  if (found === undefined) {
    return (
      <p>
        The record <code>{id}</code> is not in the model. Its file may have an error: <a href="#/problems">see the problems</a>.
      </p>
    );
  }
  const inside = insideOf(found);
  const technologies = technologyNames(index, technologiesOf(found));
  const owner = ownerOf(state, index, id);
  const description = descriptionOf(found);
  return (
    <>
      <dl className="facts">
        <Fact term="Kind">{scope ? `${kindOf(found)}, the one this view is about` : kindOf(found)}</Fact>
        {inside !== undefined && <Fact term="In">{endName(index, inside)}</Fact>}
        {found.family === 'connections' && (
          <Fact term="From and to">{`${endName(index, found.record.from)} → ${endName(index, found.record.to)}`}</Fact>
        )}
        {technologies.length > 0 && <Fact term={technologies.length === 1 ? 'Technology' : 'Technologies'}>{technologies.join(', ')}</Fact>}
        {owner !== undefined && <Fact term="Owner">{owner.from === undefined ? owner.owner : `${owner.owner}, taken from ${owner.from}`}</Fact>}
        <Fact term="Description">{description === undefined ? <span className="none">None yet.</span> : <span className="description">{description}</span>}</Fact>
        <Fact term="File">
          <code>{found.record.file}</code>
        </Fact>
      </dl>
      {box !== undefined && box.loops.length > 0 && (
        <section>
          <h3>{`Between its copies (${box.loops.length})`}</h3>
          <ConnectionList ids={box.loops} index={index} />
        </section>
      )}
      {box !== undefined && box.within.length > 0 && (
        <section>
          <h3>{`Inside it, not drawn (${box.within.length})`}</h3>
          <ConnectionList ids={box.within} index={index} />
        </section>
      )}
    </>
  );
}

/** Connections, each with its own two ends, its name, its technology, its description and its file. */
function ConnectionList({ ids, index }: { ids: readonly string[]; index: Index }) {
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
        return (
          <li key={id} className="connection">
            <p className="connection-name">{connection.name ?? 'Unnamed connection'}</p>
            <p className="connection-ends">{`${endName(index, connection.from)} → ${endName(index, connection.to)}`}</p>
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
