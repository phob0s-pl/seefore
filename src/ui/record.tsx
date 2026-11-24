import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import type { RuleOf, Rulebook } from '../model/rulebook.ts';
import type { StepAt, Travel, Way } from '../model/travel.ts';
import { KIND, typeWords } from './kinds.tsx';
import { KindTile, Missing, ModelsPage, NameOf, RecordLink, TABS } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { Facts, GridRow, Panel, Pill, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';

export type Fact = { label: string; value: ReactNode };
export type Row = { key: string; cells: ReactNode[] };

const ACCESS: Record<string, string> = { read: 'Read', write: 'Write', 'read-write': 'Read and write' };
/** The ids of a list field, those that are not text left out. */
export const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []);

/** The page of one record, at `<list>/<id>`; an id that names no record of that list's kinds is missing. */
export function RecordPage({ tab }: { tab: (typeof TABS)[number] }) {
  const { id = '' } = useParams();
  const { catalogue, travel, rulebook } = useOutletContext<ModelState>();
  const found = catalogue?.record(id);
  const record = found !== undefined && catalogue?.address(found) === `${tab.to}/${id}` ? found : undefined;
  const name = record?.fields.name;
  useTitle(typeof name === 'string' ? name : record?.kind === 'connections' ? 'No name' : (record?.id ?? 'Models'));
  return (
    <ModelsPage>
      {(catalogue) => (record !== undefined && travel !== undefined ? <RecordBody record={record} catalogue={catalogue} travel={travel} rulebook={rulebook} /> : <Missing list={tab} />)}
    </ModelsPage>
  );
}

/** A record's page: its name with the tile of its kind and its marks, its description, then what its kind shows. */
function RecordBody({ record, catalogue, travel, rulebook }: { record: ModelRecord; catalogue: Catalogue; travel: Travel; rulebook: Rulebook | undefined }) {
  const { kind, fields } = record;
  const body =
    kind === 'people' ? (
      <Person record={record} catalogue={catalogue} travel={travel} />
    ) : KIND[kind] !== undefined ? (
      <Thing record={record} catalogue={catalogue} travel={travel} />
    ) : kind === 'connections' ? (
      <Connection record={record} catalogue={catalogue} travel={travel} />
    ) : kind === 'technologies' ? (
      <Technology record={record} catalogue={catalogue} />
    ) : kind === 'data' ? (
      <Data record={record} catalogue={catalogue} travel={travel} />
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
        <RulesOf rulebook={rulebook} id={record.id} />
      </SectionStack>
    </>
  );
}

/** A section of rows in a panel. With no row it is left out, or says "None." when it must stand. */
export function Related({ title, rows, widths, always }: { title: string; rows: Row[]; widths?: string[]; always?: boolean }) {
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

/** What a record is to a rule, in the words of its Rules section. */
const HOW: Record<RuleOf['how'], string> = { breaks: 'Breaks it', debt: 'In debt', way: 'On a way that breaks it' };

/**
 * The Rules section, last on the page of a record and of a feature: each rule the record breaks,
 * is in debt of or, for a connection, is on a way that breaks, its name a link to its page.
 */
export function RulesOf({ rulebook, id }: { rulebook: Rulebook | undefined; id: string }) {
  const rows = (rulebook?.rulesOf(id) ?? []).map((each) => ({ key: each.rule, cells: [<Link to={`/rules/${each.rule}`}>{each.name ?? each.rule}</Link>, HOW[each.how]] }));
  return <Related title="Rules" rows={rows} widths={['auto', '220px']} />;
}

/** A record in a cell: the tile of its kind and a link to its page, or the id alone when it names nothing. */
export function Named({ catalogue, id }: { catalogue: Catalogue; id: unknown }) {
  const record = typeof id === 'string' ? catalogue.record(id) : undefined;
  return (
    <span className="record-cell">
      {record !== undefined && <KindTile kind={record.kind} size="sm" />}
      <RecordLink catalogue={catalogue} id={id} />
    </span>
  );
}

/** "from Shop": where an owner or a condition is taken from, when not from the record itself. */
export function Taken({ catalogue, from, record }: { catalogue: Catalogue; from: string; record: ModelRecord }) {
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

/** A part's owner, its own or taken from what it is in, with where from: "Sales from Shop". */
export function OwnerOf({ catalogue, record }: { catalogue: Catalogue; record: ModelRecord }) {
  const owner = catalogue.owner(record.id);
  if (owner === undefined) return null;
  return (
    <>
      <RecordLink catalogue={catalogue} id={owner.id} />
      <Taken catalogue={catalogue} from={owner.from} record={record} />
    </>
  );
}

/** The way data goes on a connection, in words: "Payments to Card provider", or "back from Card provider to Payments". */
function WayOf({ catalogue, way: { from, to, back } }: { catalogue: Catalogue; way: Way }) {
  return back ? (
    <>
      back from <RecordLink catalogue={catalogue} id={from} /> to <RecordLink catalogue={catalogue} id={to} />
    </>
  ) : (
    <>
      <RecordLink catalogue={catalogue} id={from} /> to <RecordLink catalogue={catalogue} id={to} />
    </>
  );
}

/** The flow's name, the step's number and what happens in it. */
const STEP = 'minmax(0, 1fr) 64px minmax(0, 1.5fr)';

/** The Steps section: each step as one link to its flow, opened on that step. */
function Steps({ steps }: { steps: readonly StepAt[] }) {
  if (steps.length === 0) return null;
  return (
    <Section title="Steps">
      <Panel className="step-list">
        <RowList label="Steps">
          {steps.map((step) => (
            <GridRow
              key={`${step.flow} ${step.number}`}
              to={`/flows/${step.flow}${step.step !== '' ? `#${encodeURIComponent(step.step)}` : ''}`}
              cols={STEP}
              tile={<KindTile kind="flows" size="sm" />}
              name={step.flowName}
              cells={[`step ${step.number}`, step.happens]}
            />
          ))}
        </RowList>
      </Panel>
    </Section>
  );
}

/** The Flows section of a part or a person: each flow through it, with its feature beside it. */
function FlowsThrough({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
  const rows = travel.flowsThrough(record.id).map((each) => ({
    key: each.flow,
    cells: [<Named catalogue={catalogue} id={each.flow} />, each.feature !== undefined ? <Named catalogue={catalogue} id={each.feature} /> : ''],
  }));
  return <Related title="Flows" rows={rows} widths={['50%', '50%']} />;
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

/** One line of a system's context, as its record holds it. */
type ContextLine = { must?: unknown; prefer?: unknown; why?: unknown };

/**
 * The Context section of a system: each line with whether it binds ("Must") or may yield
 * ("Prefer"), the sentence, and under it its reason. Left out when the system has no context.
 */
function SystemContext({ record }: { record: ModelRecord }) {
  const lines = Array.isArray(record.fields.context) ? (record.fields.context as ContextLine[]) : [];
  const rows = lines.flatMap((line, index) => {
    const says = typeof line.must === 'string' ? line.must : typeof line.prefer === 'string' ? line.prefer : undefined;
    if (says === undefined) return [];
    return [
      {
        key: `${index}`,
        cells: [
          <Pill>{typeof line.must === 'string' ? 'Must' : 'Prefer'}</Pill>,
          <div className="context-line">
            <span className="context-says">{says}</span>
            {typeof line.why === 'string' && <span className="context-why">{line.why}</span>}
          </div>,
        ],
      },
    ];
  });
  return <Related title="Context" rows={rows} widths={['96px', 'auto']} />;
}

/** A system, an app, a store, a component or a piece of infrastructure. */
function Thing({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
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
      {record.kind === 'systems' && <SystemContext record={record} />}
      <Related title="Inside it" rows={thingRows(catalogue, catalogue.inside(record.id))} widths={['auto', '200px']} />
      <Technologies record={record} catalogue={catalogue} />
      <Acts record={record} catalogue={catalogue} />
      <FlowsThrough record={record} catalogue={catalogue} travel={travel} />
    </>
  );
}

/** A kind of person: its condition, the connections it acts with and those that act on it, and the flows through it. */
function Person({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
  const facts = onlyFact(catalogue, record);
  return (
    <>
      {facts.length > 0 && <Facts rows={facts} />}
      <Acts record={record} catalogue={catalogue} />
      <FlowsThrough record={record} catalogue={catalogue} travel={travel} />
    </>
  );
}

/** One stop of a connection: a row that opens the thing, with its role above its name. */
export function End({ role, id, catalogue }: { role: string; id: unknown; catalogue: Catalogue }) {
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

/** A connection: its two ends, its facts, what it passes through, its technologies, the steps on it and the data seen on it. */
function Connection({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
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
  const data = travel.dataOn(record.id).map((way) => ({
    key: `${way.data} ${way.from} ${way.back}`,
    cells: [<Named catalogue={catalogue} id={way.data} />, <WayOf catalogue={catalogue} way={way} />],
  }));
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
      <Steps steps={travel.stepsOn(record.id)} />
      <Related title="Data" rows={data} widths={['auto', '360px']} />
    </>
  );
}

/** A data record: its fields, the steps that name it, and the connections it is seen on, with the way it goes. */
function Data({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
  const fields = (Array.isArray(record.fields.fields) ? (record.fields.fields as unknown[]) : []).flatMap((field, index): Row[] => {
    const { name, description } = (typeof field === 'object' && field !== null ? field : {}) as Record<string, unknown>;
    return typeof name === 'string' ? [{ key: `${index}`, cells: [name, typeof description === 'string' ? description : ''] }] : [];
  });
  const ways = travel.waysOf(record.id).map((way) => ({
    key: `${way.connection} ${way.from} ${way.back}`,
    cells: [<Named catalogue={catalogue} id={way.connection} />, <WayOf catalogue={catalogue} way={way} />],
  }));
  return (
    <>
      <Related title="Fields" rows={fields} widths={['240px', 'auto']} />
      <Steps steps={travel.stepsWith(record.id)} />
      <Related title="Connections" rows={ways} widths={['auto', '360px']} />
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
