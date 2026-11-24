import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord, Problem } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import type { RuleRead, RuleState, Rulebook, SelectorLine, WayRead } from '../model/rulebook.ts';
import { KIND, typeWords } from './kinds.tsx';
import { KindTile, Missing, NameOf, RecordLink } from './models.tsx';
import { Named, Related } from './record.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, GridRow, IconTile, LargeTitle, Panel, Pill, RowList, RowListHeading, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';
import type { Tone } from './ui.tsx';

/** Each state of a rule: the words of its pill and the tone of its tile and pill. */
const STATE: Record<RuleState, { words: string; tone: Tone }> = {
  broken: { words: 'Broken', tone: 'danger' },
  'not-judged': { words: 'Not judged', tone: 'warning' },
  nothing: { words: 'Looks at nothing', tone: 'warning' },
  holds: { words: 'Holds', tone: 'success' },
};

/** The words of a record that is no thing, beside its name. */
const OTHER: Record<string, string> = { connections: 'Connection', technologies: 'Technology', owners: 'Owner', features: 'Feature', flows: 'Flow', data: 'Data' };

/** The list a missing rule leads back to. */
const LIST = { to: '/rules', title: 'Rules' };

/** The rule, and the state. */
const COLS = 'minmax(0, 1fr) 160px';
/** The record, its kind, and its condition. */
const RECORD_COLS = 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.8fr)';

/** What the pages of the rules show while the model is read, or why it cannot be. */
function useRules(): { catalogue?: Catalogue; rulebook?: Rulebook; crumbs?: HTMLElement | null; line?: ReactNode } {
  const { catalogue, rulebook, failed, slots } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (catalogue === undefined || rulebook === undefined) return { line: <p className="page-line">Reading…</p> };
  return { catalogue, rulebook, crumbs: slots?.crumbs ?? null };
}

/** A text with the words between backticks in the mono type, as the check writes ids and keys. */
function Ticks({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rule-code">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The tile of a rule, in the tone of its state. */
const RuleTile = ({ state, size }: { state: RuleState; size: 'sm' | 'lg' }) => <IconTile icon={ListChecks} tone={STATE[state].tone} size={size} />;

/** The pill of a rule's state. */
const StatePill = ({ state }: { state: RuleState }) => <Pill tone={STATE[state].tone}>{STATE[state].words}</Pill>;

/**
 * The list of rules, `/rules`: one row a rule in the order of the states and by name, each a
 * link to the rule's page.
 */
export function RulesList() {
  useTitle('Rules');
  const { rulebook, line } = useRules();
  if (rulebook === undefined) return line;
  return (
    <>
      <LargeTitle>Rules</LargeTitle>
      {rulebook.rows.length === 0 ? (
        <EmptyState title="No rules yet.">
          Write what must hold in <code>rules/</code>.
        </EmptyState>
      ) : (
        <>
          <Panel lift className="rules-list">
            <RowListHeading columns={['Rule', 'State']} cols={COLS} />
            <RowList label="Rules">
              {rulebook.rows.map((row) => (
                <GridRow
                  key={row.id}
                  to={`/rules/${row.id}`}
                  cols={COLS}
                  tile={<RuleTile state={row.state} size="sm" />}
                  name={row.name ?? row.id}
                  cells={[<StatePill state={row.state} />]}
                />
              ))}
            </RowList>
          </Panel>
        </>
      )}
    </>
  );
}

/** The page of one rule, `/rules/<id>`; an id that names no rule is missing. */
export function RulePage() {
  const { id = '' } = useParams();
  const { catalogue, rulebook, crumbs, line } = useRules();
  const read = rulebook?.rule(id);
  useTitle(read?.name ?? read?.id ?? 'Rules');
  if (catalogue === undefined || rulebook === undefined) return line;
  if (read === undefined) return <Missing list={LIST} />;
  return <RuleBody read={read} catalogue={catalogue} crumbs={crumbs ?? null} />;
}

/** The way back, in the top bar: "Rules / <name>". */
function Crumbs({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <Link to="/rules">Rules</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <span className="breadcrumb-here" aria-current="page">
        {title}
      </span>
    </nav>
  );
}

/** A rule's page: its name with its pills, its description, then each section that has something. */
function RuleBody({ read, catalogue, crumbs }: { read: RuleRead; catalogue: Catalogue; crumbs: HTMLElement | null }) {
  const { ruling, record } = read;
  const title = read.name ?? read.id;
  const description = record?.fields.description;
  return (
    <>
      {crumbs !== null && createPortal(<Crumbs title={title} />, crumbs)}
      <header className="record-title">
        <RuleTile state={ruling.state} size="lg" />
        <h1 className="large-title">{title}</h1>
        <span className="record-marks">
          <StatePill state={ruling.state} />
          {ruling.debt.length > 0 && <Pill>{ruling.debt.length} of debt</Pill>}
        </span>
      </header>
      <SectionStack>
        {typeof description === 'string' && <TextPanel>{description}</TextPanel>}
        <Problems read={read} />
        <Breaks read={read} catalogue={catalogue} />
        <Debt read={read} catalogue={catalogue} />
        {record !== undefined && <TheRule read={read} catalogue={catalogue} />}
        <LookedAt read={read} catalogue={catalogue} />
      </SectionStack>
    </>
  );
}

/** One problem in a panel: what is wrong, how to mend it, and its place. */
function ProblemPanel({ problem }: { problem: Problem }) {
  return (
    <Panel padded className="rule-problem">
      <p className="rule-problem-message">
        <Ticks text={problem.message} />
      </p>
      <p className="rule-problem-fix">
        Mend: <Ticks text={problem.fix} />
      </p>
      <p className="rule-problem-place mono">
        {problem.file}:{problem.line}:{problem.column}
      </p>
    </Panel>
  );
}

/** The Problems section: each problem of the rule's own file but its breaks, or why it is not judged when the fault is in another file. */
function Problems({ read }: { read: RuleRead }) {
  if (read.problems.length === 0 && !read.elsewhere) return null;
  return (
    <Section title="Problems">
      <div className="rule-stack">
        {read.elsewhere && <TextPanel>No rule is judged while another file has an error.</TextPanel>}
        {read.problems.map((problem, index) => (
          <ProblemPanel key={index} problem={problem} />
        ))}
      </div>
    </Section>
  );
}

/** A record's kind in words: "Store · database", "Connection". */
const kindWords = (record: ModelRecord): string => (KIND[record.kind] !== undefined ? typeWords(record.kind, record.fields.kind) : (OTHER[record.kind] ?? record.kind));

/** What a record is, in a row: a connection by its two ends, "Settlement → Orders database"; any other by its kind. */
function whatOf(record: ModelRecord, catalogue: Catalogue): string {
  if (record.kind !== 'connections') return kindWords(record);
  const end = (id: unknown): string => {
    const name = typeof id === 'string' ? catalogue.record(id)?.fields.name : undefined;
    return typeof name === 'string' ? name : String(id ?? '');
  };
  return `${end(record.fields.from)} → ${end(record.fields.to)}`;
}

/** Records as the lists of Models show them, each row a link to its page, with what it is and its condition; and under a row what `below` gives for it. */
function Records({ ids, catalogue, label, below }: { ids: readonly string[]; catalogue: Catalogue; label: string; below?: (id: string) => ReactNode }) {
  return (
    <Panel className="rule-records">
      <RowList label={label}>
        {ids.map((id) => {
          const record = catalogue.record(id);
          const to = record && catalogue.address(record);
          if (record === undefined || to === undefined)
            return (
              <li key={id} className="row row-grid-item">
                <span className="row-grid dangling">{id}</span>
              </li>
            );
          const only = catalogue.conditions(id)[0];
          return (
            <GridRow
              key={id}
              to={to}
              cols={RECORD_COLS}
              tile={<KindTile kind={record.kind} size="sm" />}
              name={<NameOf record={record} />}
              cells={[whatOf(record, catalogue), only !== undefined ? `Only ${only.text}` : '']}
              below={below?.(id)}
            />
          );
        })}
      </RowList>
    </Panel>
  );
}

/** Links to records by their names, with words between them. */
function Links({ ids, between, catalogue }: { ids: readonly string[]; between: string; catalogue: Catalogue }) {
  return (
    <>
      {ids.map((id, index) => (
        <Fragment key={index}>
          {index > 0 && between}
          <RecordLink catalogue={catalogue} id={id} />
        </Fragment>
      ))}
    </>
  );
}

/** A way that breaks a rule: the things it passes, the connections it goes by, and how many more ends break it from its start. */
function Way({ way, catalogue }: { way: WayRead; catalogue: Catalogue }) {
  return (
    <li className="rule-way">
      <span className="rule-way-things">
        <Links ids={way.things} between=" → " catalogue={catalogue} />
      </span>
      <span className="rule-way-by">
        By <Links ids={way.by} between=", " catalogue={catalogue} />
      </span>
      {way.more > 0 && <span className="rule-way-more">and {way.more === 1 ? '1 more end' : `${way.more} more ends`}</span>}
    </li>
  );
}

/** Under a record that breaks a rule: the lines of `must` it does not match. */
function Misses({ lines, catalogue }: { lines: readonly SelectorLine[]; catalogue: Catalogue }) {
  if (lines.length === 0) return null;
  return (
    <div className="rule-misses">
      <span className="rule-misses-label">Does not match</span>
      <span className="rule-misses-lines">
        {lines.map((line, index) => (
          <Line key={index} line={line} catalogue={catalogue} />
        ))}
      </span>
    </div>
  );
}

/**
 * The Where it breaks section of a broken rule: a sentence that says how much breaks it, then the
 * records that break it, each with what it does not match, or a row for each start of a way that
 * breaks it.
 */
function Breaks({ read, catalogue }: { read: RuleRead; catalogue: Catalogue }) {
  if (read.ways.length === 0 && read.breaks.length === 0) return null;
  return (
    <Section title="Where it breaks">
      <div className="rule-stack">
        {read.where !== undefined && <TextPanel>{read.where}</TextPanel>}
        {read.ways.length > 0 ? (
          <Panel>
            <ul className="rule-ways" aria-label="Where it breaks">
              {read.ways.map((way, index) => (
                <Way key={index} way={way} catalogue={catalogue} />
              ))}
            </ul>
          </Panel>
        ) : (
          <Records ids={read.breaks} catalogue={catalogue} label="Where it breaks" below={(id) => <Misses lines={read.misses[id] ?? []} catalogue={catalogue} />} />
        )}
      </div>
    </Section>
  );
}

/** The Debt section: each id in `debt`, and whether it stands or is paid. */
function Debt({ read, catalogue }: { read: RuleRead; catalogue: Catalogue }) {
  const rows = read.debt.map((each, index) => ({
    key: `${index}`,
    cells: [
      <Named catalogue={catalogue} id={each.id} />,
      ((record) => (record !== undefined ? whatOf(record, catalogue) : ''))(catalogue.record(each.id)),
      each.paid ? (
        <>
          Paid: take it out of <code>debt</code>
        </>
      ) : (
        'Stands'
      ),
    ],
  }));
  return <Related title="Debt" rows={rows} widths={['auto', '34%', '260px']} />;
}

/** One line of a selector: its keys joined by " · ", then its value, ids as links under the records' names. */
function Line({ line, catalogue }: { line: SelectorLine; catalogue: Catalogue }) {
  return (
    <span className="rule-line">
      {line.keys.length > 0 && <span className="rule-keys">{line.keys.join(' · ')}</span>}
      <span className="rule-value">{'ids' in line ? <Links ids={line.ids} between=", " catalogue={catalogue} /> : line.words}</span>
    </span>
  );
}

/** The rule as written, with no YAML: "Never", or "Each" and "Must", each standing once on the first line of its selector. */
function TheRule({ read, catalogue }: { read: RuleRead; catalogue: Catalogue }) {
  return (
    <Section title="The rule">
      <Panel>
        <dl className="facts rule-written">
          {read.written.flatMap((group) =>
            group.lines.map((line, index) => (
              <div key={`${group.label} ${index}`} className={index > 0 ? 'rule-written-more' : undefined}>
                <dt>{index === 0 ? group.label : ''}</dt>
                <dd>
                  <Line line={line} catalogue={catalogue} />
                </dd>
              </div>
            )),
          )}
        </dl>
      </Panel>
    </Section>
  );
}

/** The Looked at section: every record `each` chose, or what a ban or a rule of ways looked at, in words. */
function LookedAt({ read, catalogue }: { read: RuleRead; catalogue: Catalogue }) {
  const looked = read.lookedAt;
  if (looked === undefined || (looked.records.length === 0 && looked.lines.length === 0)) return null;
  return (
    <Section title="Looked at">
      <div className="rule-stack">
        {looked.records.length > 0 && <Records ids={looked.records} catalogue={catalogue} label="Looked at" />}
        {looked.lines.length > 0 && <TextPanel>{looked.lines.join('\n\n')}</TextPanel>}
      </div>
    </Section>
  );
}
