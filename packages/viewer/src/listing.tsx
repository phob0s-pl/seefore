import type { OutlineApp, ViewerState } from '@seefore/core';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { SORT, descriptionOf, endName, indexOf, insideOf, nameOf, passingCounts, passingWords, technologyNames } from './records.ts';
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

/** What the listing looks up once for the facts of every record. */
interface Known {
  index: Index;
  /** How many connections pass through each record that some connection names in `via`, by id. */
  through: ReadonlyMap<string, number>;
  /** The connections that no view holds. */
  inNoView: ReadonlySet<string>;
  /** The conditions each record is under, as the state gives them. */
  conditions: ViewerState['conditions'];
}

/** The words of a record's own `only`, or nothing when it has none of its own. */
function ownOnly(known: Known, id: string): string | undefined {
  const [first] = known.conditions[id] ?? [];
  return first?.from === id ? first.only : undefined;
}

/** What a connection is marked with before its name, as `seefore list` writes it: what it does to a store, or that the far side opened its channel. */
function markOf(found: Found): string | undefined {
  if (found.family !== 'connections') return undefined;
  if (found.record.access !== undefined) return `[${found.record.access}]`;
  return found.record.opens === 'to' ? '[opened by the far side]' : undefined;
}

/** What a connection is marked with on its line when no view holds it. */
export const IN_NO_PICTURE = 'in no picture';

/**
 * The facts of a record, in brackets after it, as `seefore list` gives them. `where` comes first
 * when given. A system, an app or a component says last how many connections pass through it
 * when any does, and a piece of infrastructure always. A connection that no view holds says so.
 */
function factsOf(found: Found, known: Known, where: string | undefined): string[] {
  const { index, through } = known;
  const facts: (string | undefined)[] = [where];
  const owner = (id: string | undefined) => (id === undefined ? undefined : `owner: ${nameOf(index, id)}`);
  const technologies = (ids: readonly string[] | undefined) => (ids === undefined ? undefined : technologyNames(index, ids).join(', '));
  const passing = (id: string) => {
    const n = through.get(id) ?? 0;
    return n === 0 ? undefined : passingWords(n);
  };
  switch (found.family) {
    case 'systems':
      facts.push(found.record.external === true ? 'external' : undefined, owner(found.record.owner), passing(found.record.id));
      break;
    case 'infrastructure':
      facts.push(technologies(found.record.technology), owner(found.record.owner), passingWords(through.get(found.record.id) ?? 0));
      break;
    case 'apps':
      facts.push(found.record.kind, technologies(found.record.technology), owner(found.record.owner), passing(found.record.id));
      break;
    case 'stores':
      facts.push(found.record.kind, technologies(found.record.technology), owner(found.record.owner));
      break;
    case 'components':
      facts.push(technologies(found.record.technology), owner(found.record.owner), passing(found.record.id));
      break;
    case 'connections':
      facts.push(technologies(found.record.technology), known.inNoView.has(found.record.id) ? IN_NO_PICTURE : undefined);
      break;
    default:
      break;
  }
  return facts.filter((fact) => fact !== undefined);
}

interface EntryProps {
  id: string;
  known: Known;
  onOpen(id: string, byKeyboard: boolean): void;
  said?: string;
  where?: string;
  children?: ReactNode;
}

/**
 * One record: its name, which opens its panel, then its own `only` in brackets when it has one,
 * its sort and id, its facts, and its description, which the panel shows whole.
 */
function Entry({ id, known, onOpen, said, where, children }: EntryProps) {
  const { index } = known;
  const found = index.get(id);
  if (found === undefined) {
    return (
      <li className="entry">
        <code>{id}</code>
        {children}
      </li>
    );
  }
  const facts = factsOf(found, known, where);
  const description = descriptionOf(found);
  const only = ownOnly(known, id);
  // A part says what sort it is, as `seefore list` does; a connection says where it goes instead.
  // A piece of infrastructure says so where it stands under its system, and not under its own heading.
  const placed = found.family === 'infrastructure' && insideOf(found) !== undefined;
  const sort = found.family === 'apps' || found.family === 'stores' || found.family === 'components' || placed ? `${SORT[found.family]} ` : '';
  return (
    <li className="entry">
      <div className="entry-head">
        {/* A click made with the keyboard has no count of presses. */}
        <button type="button" className="record-name" onClick={(event) => onOpen(id, event.detail === 0)}>
          {said ?? nameOf(index, id)}
        </button>
        {only !== undefined && <span className="entry-only">{` (only ${only})`}</span>}{' '}
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
  const through = useMemo(() => passingCounts(state.model), [state.model]);
  const inNoView = useMemo(() => new Set(state.inNoView), [state.inNoView]);
  const known: Known = { index, through, inNoView, conditions: state.conditions };
  const { outline, model } = state;
  const looseCount = outline.loose.reduce((sum, part) => sum + 1 + part.components.length + (part.stores?.length ?? 0), 0);
  // The note is needed only where a part shows no owner and has one all the same.
  const taken = Object.entries(state.ownership).some(([id, found]) => found.from !== id);
  const families = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections, model.owners, model.technologies];
  const listed = families.reduce((sum, family) => sum + family.length, 0);
  const entry = (id: string, more: { said?: string; where?: string; children?: ReactNode } = {}) => <Entry key={id} id={id} known={known} onOpen={onOpen} {...more} />;
  // An app with its components, and then the stores it keeps.
  const beneath = (app: Pick<OutlineApp, 'components' | 'stores'>) => {
    const parts = [...app.components, ...(app.stores ?? [])];
    return parts.length > 0 ? <ul>{parts.map((id) => entry(id))}</ul> : undefined;
  };

  return (
    <article className="listing">
      <h1>{state.name ?? '(no name: the marker file could not be read)'}</h1>
      <p className="where">{`${state.format === null ? 'format unknown' : `format ${state.format}`}, ${state.directory}`}</p>
      {state.inNoView.length > 0 && (
        <p className="in-no-picture" role="note">
          {inNoPictureWords(state.inNoView.length)}
        </p>
      )}

      <Section title="People" count={outline.people.length}>
        <ul>{outline.people.map((id) => entry(id))}</ul>
      </Section>
      <Section title="Systems with parts" count={outline.withParts.length} {...(taken ? { note: 'An owner holds for what is beneath it until a part names its own.' } : {})}>
        <ul>
          {outline.withParts.map((system) =>
            entry(system.id, {
              children: (
                <ul>
                  {system.apps.map((app) => entry(app.id, { children: beneath(app) }))}
                  {system.stores.map((id) => entry(id))}
                  {(system.infrastructure ?? []).map((id) => entry(id))}
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
      <Section title="Conditions" count={outline.conditions.length} note="Each wording of “only”, with how many records hold it as their own, so that two wordings of one condition stand side by side.">
        <ul className="conditions-list">
          {outline.conditions.map((condition) => (
            <li key={condition.only} className="entry">
              {`only ${condition.only}`} <span className="entry-facts">{`(${count(condition.records.length, 'record')})`}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Parts in a record with an error" count={looseCount}>
        <ul>{outline.loose.map((part) => entry(part.id, { where: `in: ${part.in}`, children: beneath(part) }))}</ul>
      </Section>

      <p className="tally">
        {`${count(state.records, 'record')} read${listed < state.records ? `, ${listed} listed` : ''}. `}
        {state.errors + state.warnings === 0 ? 'No problems.' : <a href="#/problems">{`${problemWords(state.errors, state.warnings)}.`}</a>}
      </p>
    </article>
  );
}

/**
 * The line at the top of the listing that says how many connections no view holds, and why: a
 * view draws a connection only where it draws both its ends, or one end is in its system.
 */
export function inNoPictureWords(n: number): string {
  const which = n === 1 ? '1 connection is' : `${n} connections are`;
  const marked = n === 1 ? 'It is' : 'Each is';
  return `${which} in no picture, since no view draws both ${n === 1 ? 'its' : 'their'} ends. ${marked} marked “${IN_NO_PICTURE}” under Connections.`;
}

/** The sort of what a group of connections stands under, as a person reads it. */
function groupSort(index: Index, id: string): string {
  const found = index.get(id);
  return found === undefined ? 'record' : SORT[found.family];
}

/**
 * A connection under what it starts from: an arrow to its far end, what it passes through, in
 * order, what it does to a store or that the far side opened its channel, and its name, as in
 * `→ Desk, via HTTPS proxy: [opened by the far side] Says when a job is done`. It names its
 * start only when that is a component of the app it stands under.
 */
function connectionSaid(index: Index, id: string, start: string): string {
  const found = index.get(id);
  if (found?.family !== 'connections') return id;
  const connection = found.record;
  const from = connection.from === start ? '' : `${nameOf(index, connection.from)} `;
  const via = connection.via === undefined || connection.via.length === 0 ? '' : `, via ${connection.via.map((hop) => endName(index, hop)).join(', ')}`;
  const arrow = `${from}→ ${endName(index, connection.to)}${via}`;
  const said = [markOf(found), connection.name].filter((part) => part !== undefined).join(' ');
  return said === '' ? arrow : `${arrow}: ${said}`;
}
