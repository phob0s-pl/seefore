import type { ReactNode } from 'react';
import { Link, NavLink, useOutletContext } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { iconOf, typeWords } from './kinds.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, GridRow, IconTile, Panel, Pill, RowList, RowListHeading, useTitle } from './ui.tsx';

/** The six tabs of Models, in their order: the address of each list and its title. */
export const TABS = [
  { to: '/models', title: 'Software' },
  { to: '/actors', title: 'Actors' },
  { to: '/connections', title: 'Connections' },
  { to: '/technologies', title: 'Technologies' },
  { to: '/owners', title: 'Owners' },
  { to: '/data', title: 'Data' },
] as const;

/** The folders whose records have a colour of their own: the things. */
const COLOURED: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

/** The tile of a record's kind, in its colour; neutral for a connection, a technology and an owner. */
export function KindTile({ kind, size }: { kind: string; size?: 'sm' | 'lg' }) {
  return <IconTile icon={iconOf(kind)} kind={COLOURED.includes(kind) ? kind : undefined} size={size} />;
}

/** The name of a record as it reads: a connection with none says so, quietly. */
export function NameOf({ record }: { record: ModelRecord }) {
  const name = record.fields.name;
  if (typeof name === 'string') return <>{name}</>;
  return record.kind === 'connections' ? <span className="quiet">No name</span> : <>{record.id}</>;
}

/** The address of a record known by its kind and its id alone, as the catalogue decides it: under a change for one it touches. */
export const addressOf = (catalogue: Catalogue, kind: string, id: string): string => catalogue.address({ kind, id, file: '', fields: {} }) ?? '/';

/** A link to a record's page, under its name; an id that names no record is plain text. */
export function RecordLink({ catalogue, id }: { catalogue: Catalogue; id: unknown }) {
  if (typeof id !== 'string') return null;
  const record = catalogue.record(id);
  const to = record && catalogue.address(record);
  if (record === undefined || to === undefined) return <span className="dangling">{id}</span>;
  return (
    <Link to={to}>
      <NameOf record={record} />
    </Link>
  );
}

/** The row of tabs at the top of each list and record page; the current one is marked. */
export function ModelsTabs() {
  return (
    <nav className="models-tabs" aria-label="Models">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to}>
          {tab.title}
        </NavLink>
      ))}
    </nav>
  );
}

/** A page of Models: the tabs, then the page once the model is read. */
export function ModelsPage({ children }: { children: (catalogue: Catalogue) => ReactNode }) {
  const { catalogue, failed } = useOutletContext<ModelState>();
  return (
    <>
      <ModelsTabs />
      {failed !== undefined ? (
        <p className="page-line failed">{failed}</p>
      ) : catalogue === undefined ? (
        <p className="page-line">Reading…</p>
      ) : (
        children(catalogue)
      )}
    </>
  );
}

const TREE = 'minmax(0, 1fr) 200px';
const PATH = 'minmax(0, 1fr) minmax(0, 1fr)';
const NAME = 'minmax(0, 1fr)';

/** One list: its rows in a panel, or the line that says it has none. */
function List({ label, empty, heading, cols, children }: { label: string; empty: string; heading?: readonly string[]; cols: string; children: ReactNode[] }) {
  if (children.length === 0) return <EmptyState title={empty} />;
  return (
    <Panel lift>
      {heading !== undefined && <RowListHeading columns={heading} cols={cols} />}
      <RowList label={label}>{children}</RowList>
    </Panel>
  );
}

/** A list of records by name, one row each. */
function Names({ records, catalogue, label, empty }: { records: ModelRecord[]; catalogue: Catalogue; label: string; empty: string }) {
  return (
    <List label={label} empty={empty} cols={NAME}>
      {records.map((record) => (
        <GridRow key={record.id} to={catalogue.address(record) ?? '/'} cols={NAME} tile={<KindTile kind={record.kind} size="sm" />} name={<NameOf record={record} />} />
      ))}
    </List>
  );
}

/** The Software tab: the systems and what is in them, as a tree, with the type of each. */
export function SoftwareList() {
  useTitle('Models');
  return (
    <ModelsPage>
      {(catalogue) => (
        <List label="Software" empty="No systems yet." heading={['Name', 'Type']} cols={TREE}>
          {catalogue.software.map(({ record, depth }) => (
            <GridRow
              key={record.id}
              to={catalogue.address(record) ?? '/'}
              cols={TREE}
              depth={depth}
              strong={record.kind === 'systems'}
              tile={<KindTile kind={record.kind} size="sm" />}
              name={<NameOf record={record} />}
              marks={record.kind === 'systems' && record.fields.external === true && <Pill size="xs">External</Pill>}
              cells={[typeWords(record.kind, record.fields.kind)]}
            />
          ))}
        </List>
      )}
    </ModelsPage>
  );
}

export function ActorsList() {
  useTitle('Models');
  return <ModelsPage>{(catalogue) => <Names records={catalogue.people} catalogue={catalogue} label="Actors" empty="No people yet." />}</ModelsPage>;
}

/** The Connections tab: each connection's name, and the path from one end to the other beside it. */
export function ConnectionsList() {
  useTitle('Models');
  return (
    <ModelsPage>
      {(catalogue) => (
        <List label="Connections" empty="No connections yet." heading={['Name', 'Path']} cols={PATH}>
          {catalogue.connections.map((record) => (
            <GridRow
              key={record.id}
              to={catalogue.address(record) ?? '/'}
              cols={PATH}
              tile={<KindTile kind={record.kind} size="sm" />}
              name={<NameOf record={record} />}
              cells={[`${catalogue.nameOf(String(record.fields.from))} → ${catalogue.nameOf(String(record.fields.to))}`]}
            />
          ))}
        </List>
      )}
    </ModelsPage>
  );
}

export function TechnologiesList() {
  useTitle('Models');
  return <ModelsPage>{(catalogue) => <Names records={catalogue.technologies} catalogue={catalogue} label="Technologies" empty="No technologies yet." />}</ModelsPage>;
}

export function OwnersList() {
  useTitle('Models');
  return <ModelsPage>{(catalogue) => <Names records={catalogue.owners} catalogue={catalogue} label="Owners" empty="No owners yet." />}</ModelsPage>;
}

/** The Data tab: the name of each data record. */
export function DataList() {
  useTitle('Models');
  return <ModelsPage>{(catalogue) => <Names records={catalogue.data} catalogue={catalogue} label="Data" empty="No data yet." />}</ModelsPage>;
}

/** The page of an address whose id names no record of its kind, with a link back to its list. */
export function Missing({ list }: { list: { to: string; title: string } }) {
  return (
    <EmptyState title="No such record.">
      <Link className="text-link" to={list.to}>
        Back to {list.title}
      </Link>
    </EmptyState>
  );
}
