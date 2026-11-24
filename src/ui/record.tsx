import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { KIND, typeWords } from './kinds.tsx';
import { KindTile, Missing, ModelsPage, NameOf, RecordLink, TABS } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { Facts, Panel, Pill, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';

type Fact = { label: string; value: ReactNode };
type Row = { key: string; cells: ReactNode[] };

const ACCESS: Record<string, string> = { read: 'Read', write: 'Write', 'read-write': 'Read and write' };
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []);

/** The page of one record, at `<list>/<id>`; an id that names no record of that list's kinds is missing. */
export function RecordPage({ tab }: { tab: (typeof TABS)[number] }) {
  const { id = '' } = useParams();
  const { catalogue } = useOutletContext<ModelState>();
  const found = catalogue?.record(id);
  const record = found !== undefined && catalogue?.address(found) === `${tab.to}/${id}` ? found : undefined;
  const name = record?.fields.name;
  useTitle(typeof name === 'string' ? name : record?.kind === 'connections' ? 'No name' : (record?.id ?? 'Models'));
  return <ModelsPage>{(catalogue) => (record !== undefined ? <RecordBody record={record} catalogue={catalogue} /> : <Missing list={tab} />)}</ModelsPage>;
}

/** A record's page: its name with the tile of its kind and its marks, its description, then what its kind shows. */
function RecordBody({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { kind, fields } = record;
  const body =
    kind === 'people' ? (
      <Person record={record} catalogue={catalogue} />
    ) : KIND[kind] !== undefined ? (
      <Thing record={record} catalogue={catalogue} />
    ) : kind === 'connections' ? (
      <Connection record={record} catalogue={catalogue} />
    ) : kind === 'technologies' ? (
      <Technology record={record} catalogue={catalogue} />
    ) : (
      <Owner record={record} catalogue={catalogue} />
    );
  return (
    <>
      <header className="record-title">
        <KindTile kind={kind} size="lg" />
        <h1 className="large-title">
          <NameOf record={record} />
        </h1>
        {KIND[kind] !== undefined && (
          <span className="record-marks">
            <Pill kind={kind}>{typeWords(kind, fields.kind)}</Pill>
            {kind === 'systems' && fields.external === true && <Pill>External</Pill>}
          </span>
        )}
      </header>
      <SectionStack>
        {typeof fields.description === 'string' && <TextPanel>{fields.description}</TextPanel>}
        {body}
      </SectionStack>
    </>
  );
}

/** A section of rows in a panel. With no row it is left out, or says "None." when it must stand. */
function Related({ title, rows, widths, always }: { title: string; rows: Row[]; widths?: string[]; always?: boolean }) {
  if (rows.length === 0 && !always) return null;
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <TextPanel>None.</TextPanel>
      ) : (
        <Panel>
          <table className="panel-table">
            {widths !== undefined && (
              <colgroup>
                {widths.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
            )}
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  {row.cells.map((cell, index) =>
                    index === 0 ? (
                      <th scope="row" key={index}>
                        {cell}
                      </th>
                    ) : (
                      <td key={index}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Section>
  );
}

/** A record in a cell: the tile of its kind and a link to its page, or the id alone when it names nothing. */
function Named({ catalogue, id }: { catalogue: Catalogue; id: unknown }) {
  const record = typeof id === 'string' ? catalogue.record(id) : undefined;
  return (
    <span className="record-cell">
      {record !== undefined && <KindTile kind={record.kind} size="sm" />}
      <RecordLink catalogue={catalogue} id={id} />
    </span>
  );
}

/** "from Shop": where an owner or a condition is taken from, when not from the record itself. */
function Taken({ catalogue, from, record }: { catalogue: Catalogue; from: string; record: ModelRecord }) {
  if (from === record.id) return null;
  return (
    <span className="fact-from">
      {' '}
      from <RecordLink catalogue={catalogue} id={from} />
    </span>
  );
}

/** The Only fact: each condition on a line of its own, with where it is taken from. */
function onlyFact(catalogue: Catalogue, record: ModelRecord): Fact[] {
  const conditions = catalogue.conditions(record.id);
  if (conditions.length === 0) return [];
  return [
    {
      label: 'Only',
      value: conditions.map((condition) => (
        <span key={condition.from} className="fact-line">
          {condition.text}
          <Taken catalogue={catalogue} from={condition.from} record={record} />
        </span>
      )),
    },
  ];
}

/** The rows of the things a list of ids names, with the type of each. */
const thingRows = (catalogue: Catalogue, records: readonly ModelRecord[]): Row[] =>
  records.map((each) => ({ key: each.id, cells: [<Named catalogue={catalogue} id={each.id} />, typeWords(each.kind, each.fields.kind)] }));

/** "Acts on" and "Is acted on by": each connection by its name, and the thing at its other end. */
function Acts({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const rows = (connections: ModelRecord[], end: 'from' | 'to'): Row[] =>
    connections.map((connection) => ({
      key: connection.id,
      cells: [<RecordLink catalogue={catalogue} id={connection.id} />, <Named catalogue={catalogue} id={connection.fields[end]} />],
    }));
  return (
    <>
      <Related title="Acts on" rows={rows(catalogue.from(record.id), 'to')} widths={['50%', '50%']} always />
      <Related title="Is acted on by" rows={rows(catalogue.to(record.id), 'from')} widths={['50%', '50%']} always />
    </>
  );
}

/** The Technologies section: the technologies a part or a connection names. */
function Technologies({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const rows = ids(record.fields.technology).map((id) => ({ key: id, cells: [<Named catalogue={catalogue} id={id} />] }));
  return <Related title="Technologies" rows={rows} />;
}

/** A system, an app, a store, a component or a piece of infrastructure. */
function Thing({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const owner = catalogue.owner(record.id);
  const facts: Fact[] = [
    { label: 'Type', value: typeWords(record.kind, record.fields.kind) },
    ...(typeof record.fields.in === 'string' ? [{ label: 'In', value: <RecordLink catalogue={catalogue} id={record.fields.in} /> }] : []),
    ...(owner !== undefined
      ? [
          {
            label: 'Owner',
            value: (
              <>
                <RecordLink catalogue={catalogue} id={owner.id} />
                <Taken catalogue={catalogue} from={owner.from} record={record} />
              </>
            ),
          },
        ]
      : []),
    ...onlyFact(catalogue, record),
  ];
  return (
    <>
      <Facts rows={facts} />
      <Related title="Inside it" rows={thingRows(catalogue, catalogue.inside(record.id))} widths={['auto', '200px']} />
      <Technologies record={record} catalogue={catalogue} />
      <Acts record={record} catalogue={catalogue} />
    </>
  );
}

/** A kind of person: its condition, and the connections it acts with and those that act on it. */
function Person({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const facts = onlyFact(catalogue, record);
  return (
    <>
      {facts.length > 0 && <Facts rows={facts} />}
      <Acts record={record} catalogue={catalogue} />
    </>
  );
}

/** One end of a connection: a row that opens the thing, with its role above its name. */
function End({ role, id, catalogue }: { role: string; id: unknown; catalogue: Catalogue }) {
  const record = typeof id === 'string' ? catalogue.record(id) : undefined;
  const to = record && catalogue.address(record);
  const inner = (
    <>
      {record !== undefined && <KindTile kind={record.kind} />}
      <span>
        <small>{role}</small>
        <strong>{record !== undefined ? <NameOf record={record} /> : typeof id === 'string' ? id : ''}</strong>
      </span>
    </>
  );
  return <li>{to !== undefined ? <Link to={to}>{inner}</Link> : <div className="connection-end">{inner}</div>}</li>;
}

/** A connection: its two ends, its facts, what it passes through and its technologies. */
function Connection({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { fields } = record;
  const facts: Fact[] = [
    ...(typeof fields.access === 'string' ? [{ label: 'Access', value: ACCESS[fields.access] ?? fields.access }] : []),
    ...(fields.opens === 'to' ? [{ label: 'Opens', value: 'The far side opens the channel' }] : []),
    ...onlyFact(catalogue, record),
  ];
  const via = ids(fields.via).map((id, index): Row => {
    const stop = catalogue.record(id);
    return { key: `${index}`, cells: [<span className="step-number">{index + 1}</span>, <Named catalogue={catalogue} id={id} />, stop ? typeWords(stop.kind, stop.fields.kind) : ''] };
  });
  return (
    <>
      <ol className="connection-path" aria-label="From and to">
        <End role="From" id={fields.from} catalogue={catalogue} />
        <li className="connection-path-arrow" aria-hidden="true">
          <ArrowDown />
        </li>
        <End role="To" id={fields.to} catalogue={catalogue} />
      </ol>
      {facts.length > 0 && <Facts rows={facts} />}
      <Related title="Passes through" rows={via} widths={['44px', 'auto', '200px']} />
      <Technologies record={record} catalogue={catalogue} />
    </>
  );
}

/** A technology: the parts and the connections that name it. */
function Technology({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { parts, connections } = catalogue.usedBy(record.id);
  const rows = [
    ...thingRows(catalogue, parts),
    ...connections.map((connection) => ({
      key: connection.id,
      cells: [
        <Named catalogue={catalogue} id={connection.id} />,
        <>
          <RecordLink catalogue={catalogue} id={connection.fields.from} /> → <RecordLink catalogue={catalogue} id={connection.fields.to} />
        </>,
      ],
    })),
  ];
  return <Related title="Used by" rows={rows} widths={['auto', '320px']} always />;
}

/** An owner: the parts it is written on, and those that take it from what they are in. */
function Owner({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { written, taken } = catalogue.answersFor(record.id);
  const through = taken.map((part) => {
    const from = catalogue.owner(part.id)?.from ?? part.id;
    return {
      key: part.id,
      cells: [
        <Named catalogue={catalogue} id={part.id} />,
        typeWords(part.kind, part.fields.kind),
        <>
          from <RecordLink catalogue={catalogue} id={from} />
        </>,
      ],
    };
  });
  return (
    <>
      <Related title="Answers for" rows={thingRows(catalogue, written)} widths={['auto', '200px']} always />
      <Related title="Through what they are in" rows={through} widths={['auto', '200px', '240px']} />
    </>
  );
}
