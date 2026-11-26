import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { countWords } from '../model/context.ts';
import type { Context, SystemContext } from '../model/context.ts';
import type { RuleOf, Rulebook } from '../model/rulebook.ts';
import type { StepAt, Travel, Way } from '../model/travel.ts';
import { KIND, typeWords } from './kinds.tsx';
import { addressOf, KindTile, Missing, ModelsPage, NameOf, RecordLink, TABS } from './models.tsx';
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
  const { catalogue, travel, rulebook, context } = useOutletContext<ModelState>();
  const found = catalogue?.record(id);
  const record = found !== undefined && catalogue?.address(found) === `${tab.to}/${id}` ? found : undefined;
  const name = record?.fields.name;
  useTitle(typeof name === 'string' ? name : record?.kind === 'connections' ? 'No name' : (record?.id ?? 'Models'));
  return (
    <ModelsPage>
      {(catalogue) =>
        record !== undefined && travel !== undefined ? <RecordBody record={record} catalogue={catalogue} travel={travel} rulebook={rulebook} context={context} /> : <Missing list={tab} />
      }
    </ModelsPage>
  );
}

/**
 * A record's page: its name with the tile of its kind and its marks, its description, then what its
 * kind shows. Under a change the page draws the title row itself, and leaves the description out
 * where it is a key that changes: `titled` and `described` say so.
 */
export function RecordBody({
  record,
  catalogue,
  travel,
  rulebook,
  context,
  titled = true,
  described = true,
}: {
  record: ModelRecord;
  catalogue: Catalogue;
  travel: Travel;
  rulebook: Rulebook | undefined;
  context: Context | undefined;
  titled?: boolean;
  described?: boolean;
}) {
  const { kind, fields } = record;
  const body =
    kind === 'people' ? (
      <Person record={record} catalogue={catalogue} travel={travel} />
    ) : KIND[kind] !== undefined ? (
      <Thing record={record} catalogue={catalogue} travel={travel} lines={context?.system(record.id)} />
    ) : kind === 'connections' ? (
      <Connection record={record} catalogue={catalogue} travel={travel} />
    ) : kind === 'technologies' ? (
      <Technology record={record} catalogue={catalogue} />
    ) : kind === 'repositories' ? (
      <Repository record={record} catalogue={catalogue} />
    ) : kind === 'data' ? (
      <Data record={record} catalogue={catalogue} travel={travel} />
    ) : (
      <Owner record={record} catalogue={catalogue} />
    );
  return (
    <>
      {titled && (
        <header className="record-title">
          <KindTile kind={kind} size="lg" />
          <h1 className="large-title">
            <NameOf record={record} />
          </h1>
          <TypeMarks record={record} />
        </header>
      )}
      <SectionStack>
        {described && typeof fields.description === 'string' && <TextPanel>{fields.description}</TextPanel>}
        {body}
        <RulesOf rulebook={rulebook} catalogue={catalogue} id={record.id} />
      </SectionStack>
    </>
  );
}

/** The marks of a thing's title row: the pill of its type, and "External" on a system outside. Any other record has none. */
export function TypeMarks({ record, children }: { record: ModelRecord; children?: ReactNode }) {
  const { kind, fields } = record;
  if (KIND[kind] === undefined && children === undefined) return null;
  return (
    <span className="record-marks">
      {KIND[kind] !== undefined && <Pill kind={kind}>{typeWords(kind, fields.kind)}</Pill>}
      {kind === 'systems' && fields.external === true && <Pill>External</Pill>}
      {children}
    </span>
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
export function RulesOf({ rulebook, catalogue, id }: { rulebook: Rulebook | undefined; catalogue: Catalogue; id: string }) {
  const rows = (rulebook?.rulesOf(id) ?? []).map((each) => ({
    key: each.rule,
    cells: [<Link to={addressOf(catalogue, 'rules', each.rule)}>{each.name ?? each.rule}</Link>, HOW[each.how]],
  }));
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

/** "from Shop": where an owner, a repository or a condition is taken from, when not from the record itself. */
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
function Steps({ steps, catalogue }: { steps: readonly StepAt[]; catalogue: Catalogue }) {
  if (steps.length === 0) return null;
  return (
    <Section title="Steps">
      <Panel className="step-list">
        <RowList label="Steps">
          {steps.map((step) => (
            <GridRow
              key={`${step.flow} ${step.number}`}
              to={`${addressOf(catalogue, 'flows', step.flow)}${step.step !== '' ? `#${encodeURIComponent(step.step)}` : ''}`}
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

/**
 * A system, an app, a store, a component or a piece of infrastructure. A system or an app whose
 * code is in a repository of its own, or of its system, has the fact Repository. A system with
 * lines of context has the fact Context, its count, which leads to the list of the context.
 */
function Thing({ record, catalogue, travel, lines }: { record: ModelRecord; catalogue: Catalogue; travel: Travel; lines: SystemContext | undefined }) {
  const owner = catalogue.owner(record.id);
  const repository = catalogue.repository(record.id);
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
    ...(repository !== undefined
      ? [
          {
            label: 'Repository',
            value: (
              <>
                {catalogue.record(repository.id)?.kind === 'repositories' ? <RecordLink catalogue={catalogue} id={repository.id} /> : <span className="dangling">{repository.id}</span>}
                <Taken catalogue={catalogue} from={repository.from} record={record} />
              </>
            ),
          },
        ]
      : []),
    ...onlyFact(catalogue, record),
    ...(lines !== undefined ? [{ label: 'Context', value: <Link to="/context">{countWords(lines.lines)}</Link> }] : []),
  ];
  return (
    <>
      <Facts rows={facts} />
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
      <Steps steps={travel.stepsOn(record.id)} catalogue={catalogue} />
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
      <Steps steps={travel.stepsWith(record.id)} catalogue={catalogue} />
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

/** Whether a repository's `url` is a web address, and so a link: the page fetches nothing from it. */
const WEB = /^https?:\/\//;

/**
 * A repository: where it is cloned from, where its checkout lies when it is beside the model's
 * folder, which the page never looks at, and the systems and apps whose code it holds, an app that
 * takes it from its system with "from".
 */
function Repository({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { url, name, workspace } = record.fields;
  const facts: Fact[] = [
    ...(typeof url === 'string'
      ? [
          {
            label: 'URL',
            value: WEB.test(url) ? (
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ) : (
              url
            ),
          },
        ]
      : []),
    ...(workspace === true && typeof name === 'string'
      ? [
          {
            label: 'Workspace',
            value: (
              <>
                Beside the model's folder, in <code>{name}/</code>
              </>
            ),
          },
        ]
      : []),
  ];
  const rows = catalogue.codeIn(record.id).map((part) => ({
    key: part.id,
    cells: [<Named catalogue={catalogue} id={part.id} />, typeWords(part.kind, part.fields.kind), <Taken catalogue={catalogue} from={catalogue.repository(part.id)?.from ?? part.id} record={part} />],
  }));
  return (
    <>
      {facts.length > 0 && <Facts rows={facts} />}
      <Related title="Holds the code of" rows={rows} widths={['auto', '200px', '240px']} always />
    </>
  );
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
