import type { Model, ViewerState } from '@seefore/core';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { SORT, descriptionOf, endName, indexOf, nameOf, passingThrough, passingWords, technologyNames } from './records.ts';
import type { Found, Index } from './records.ts';

/**
 * The listing of the model: what `seefore list` prints, in its order, from the same tree,
 * `outline`. A click on a record opens its panel.
 */

/** A number with its noun: `1 record`, `2 records`. */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** How many errors and warnings there are, in words: `1 error and 2 warnings`. */
export function problemWords(errors: number, warnings: number): string {
  if (errors > 0 && warnings > 0) return `${count(errors, 'error')} and ${count(warnings, 'warning')}`;
  if (errors > 0) return count(errors, 'error');
  return count(warnings, 'warning');
}

interface ListingProps {
  state: ViewerState;
  /** A record was chosen: `byKeyboard` when Enter or Space chose it, so that the panel takes the focus. */
  onOpen(id: string, byKeyboard: boolean): void;
}

/**
 * The facts of a record, in brackets after it, as the listing gives them. `where` comes first
 * when given. A piece of infrastructure says last how many connections pass through it.
 */
function factsOf(found: Found, index: Index, where: string | undefined, model: Model): string[] {
  const facts: (string | undefined)[] = [where];
  const owner = (id: string | undefined) => (id === undefined ? undefined : `owner: ${nameOf(index, id)}`);
  const technologies = (ids: readonly string[] | undefined) => (ids === undefined ? undefined : technologyNames(index, ids).join(', '));
  switch (found.family) {
    case 'systems':
      facts.push(found.record.external === true ? 'external' : undefined, owner(found.record.owner));
      break;
    case 'infrastructure':
      facts.push(technologies(found.record.technology), owner(found.record.owner), passingWords(passingThrough(model, found.record.id).length));
      break;
    case 'apps':
    case 'stores':
      facts.push(found.record.kind, technologies(found.record.technology), owner(found.record.owner));
      break;
    case 'components':
      facts.push(technologies(found.record.technology), owner(found.record.owner));
      break;
    case 'connections':
      facts.push(technologies(found.record.technology));
      break;
    default:
      break;
  }
  return facts.filter((fact) => fact !== undefined);
}

interface EntryProps {
  id: string;
  index: Index;
  model: Model;
  onOpen(id: string, byKeyboard: boolean): void;
  said?: string;
  where?: string;
  children?: ReactNode;
}

/** One record: its name, which opens its panel, its sort and id, its facts, and its description, which the panel shows whole. */
function Entry({ id, index, model, onOpen, said, where, children }: EntryProps) {
  const found = index.get(id);
  if (found === undefined) {
    return (
      <li className="entry">
        <code>{id}</code>
        {children}
      </li>
    );
  }
  const facts = factsOf(found, index, where, model);
  const description = descriptionOf(found);
  // A part says what sort it is, as `seefore list` does; a connection says where it goes instead.
  const sort = found.family === 'apps' || found.family === 'stores' || found.family === 'components' ? `${SORT[found.family]} ` : '';
  return (
    <li className="entry">
      <div className="entry-head">
        {/* A click made with the keyboard has no count of presses. */}
        <button type="button" className="record-name" onClick={(event) => onOpen(id, event.detail === 0)}>
          {said ?? nameOf(index, id)}
        </button>{' '}
        <span className="entry-id">
          {sort}
          <code>{id}</code>
        </span>
        {facts.length > 0 && <span className="entry-facts">{` (${facts.join('; ')})`}</span>}
      </div>
      {description !== undefined && <p className="entry-description">{description}</p>}
      {children}
    </li>
  );
}

/** A heading that says how many it lists, and what is beneath it. Left out when it lists nothing. */
function Section({ title, count: n, note, children }: { title: string; count: number; note?: string; children: ReactNode }) {
  if (n === 0) return null;
  return (
    <section className="listing-section">
      <h2>{`${title} (${n})`}</h2>
      {note !== undefined && <p className="note">{note}</p>}
      {children}
    </section>
  );
}

/** The listing of the model. */
export function Listing({ state, onOpen }: ListingProps) {
  const index = useMemo(() => indexOf(state.model), [state.model]);
  const { outline, model } = state;
  const looseCount = outline.loose.reduce((sum, part) => sum + 1 + part.components.length, 0);
  // The note is needed only where a part shows no owner and has one all the same.
  const taken = Object.entries(state.ownership).some(([id, found]) => found.from !== id);
  const families = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections, model.owners, model.technologies];
  const listed = families.reduce((sum, family) => sum + family.length, 0);
  const entry = (id: string, more: { said?: string; where?: string; children?: ReactNode } = {}) => <Entry key={id} id={id} index={index} model={model} onOpen={onOpen} {...more} />;

  return (
    <article className="listing">
      <h1>{state.name ?? '(no name: the marker file could not be read)'}</h1>
      <p className="where">{`${state.format === null ? 'format unknown' : `format ${state.format}`}, ${state.directory}`}</p>

      <Section title="People" count={outline.people.length}>
        <ul>{outline.people.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Systems with parts" count={outline.withParts.length} {...(taken ? { note: 'An owner holds for what is beneath it until a part names its own.' } : {})}>
        <ul>
          {outline.withParts.map((system) =>
            entry(system.id, {
              children: (
                <ul>
                  {system.apps.map((app) => entry(app.id, { children: app.components.length > 0 ? <ul>{app.components.map((id) => entry(id))}</ul> : undefined }))}
                  {system.stores.map((id) => entry(id))}
                </ul>
              ),
            }),
          )}
        </ul>
      </Section>
      <Section title={outline.withParts.length > 0 ? 'Other systems' : 'Systems'} count={outline.others.length}>
        <ul>{outline.others.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Infrastructure" count={outline.infrastructure.length}>
        <ul>{outline.infrastructure.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Connections" count={model.connections.length}>
        {outline.connections.map((group) => (
          <div key={group.start} className="group">
            <h3>{group.known ? `from ${nameOf(index, group.start)} (${groupSort(index, group.start)} ${group.start})` : `from ${group.start} (a record with an error)`}</h3>
            <ul>{group.connections.map((id) => entry(id, { said: connectionSaid(index, id, group.start) }))}</ul>
          </div>
        ))}
      </Section>
      <Section title="Owners" count={outline.owners.length}>
        <ul>{outline.owners.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Technologies" count={outline.technologies.length}>
        <ul>{outline.technologies.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Parts in a record with an error" count={looseCount}>
        <ul>
          {outline.loose.map((part) =>
            entry(part.id, { where: `in: ${part.in}`, children: part.components.length > 0 ? <ul>{part.components.map((id) => entry(id))}</ul> : undefined }),
          )}
        </ul>
      </Section>

      <p className="tally">
        {`${count(state.records, 'record')} read${listed < state.records ? `, ${listed} listed` : ''}. `}
        {state.errors + state.warnings === 0 ? 'No problems.' : <a href="#/problems">{`${problemWords(state.errors, state.warnings)}.`}</a>}
      </p>
    </article>
  );
}

/** The sort of what a group of connections stands under, as a person reads it. */
function groupSort(index: Index, id: string): string {
  const found = index.get(id);
  return found === undefined ? 'record' : SORT[found.family];
}

/**
 * A connection under what it starts from: an arrow to its far end, what it passes through, in
 * order, and its name, as in `→ Desk, via HTTPS proxy: Asks for pages`. It names its start only
 * when that is a component of the app it stands under.
 */
function connectionSaid(index: Index, id: string, start: string): string {
  const found = index.get(id);
  if (found?.family !== 'connections') return id;
  const connection = found.record;
  const from = connection.from === start ? '' : `${nameOf(index, connection.from)} `;
  const via = connection.via === undefined || connection.via.length === 0 ? '' : `, via ${connection.via.map((hop) => endName(index, hop)).join(', ')}`;
  const arrow = `${from}→ ${endName(index, connection.to)}${via}`;
  return connection.name === undefined ? arrow : `${arrow}: ${connection.name}`;
}
