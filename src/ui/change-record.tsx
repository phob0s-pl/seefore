import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, Lock, Scale } from 'lucide-react';
import { Link, useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import { catalogueOf } from '../model/catalogue.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { fieldRows } from '../model/changes.ts';
import type { Change, ChangeRow, Changes, Difference, FieldRow, Touched, Verb } from '../model/changes.ts';
import type { FlowUnder } from '../model/flow.ts';
import { travelOf } from '../model/travel.ts';
import type { Travel } from '../model/travel.ts';
import { FeatureBody } from './features.tsx';
import { FlowBody, MARK_WORDS, stepInHash } from './flow.tsx';
import { addressOf, KindTile, Missing, RecordLink } from './models.tsx';
import { RecordBody, TypeMarks } from './record.tsx';
import type { ModelState, Slots } from './shell.tsx';
import { EmptyState, IconTile, MarkPill, Panel, Section, SectionStack, useTitle } from './ui.tsx';

/**
 * A record under a change, `/changes/<change>/records/<folder>/<id>`: its title row with the mark
 * of what the change does to it, a line that says so, before and after of the keys an update
 * writes, and under them the record's own page from the model as it would be, or from today's
 * for one that goes. Its links lead under the change for a record the change touches and to the
 * system for any other: the catalogue decides, never the page.
 */

/**
 * The line under the title row of a record that a change removes: it is shown as it is today,
 * which its mark alone does not say. An added and an updated record have none: the mark says
 * what the change does, and Before and after shows both sides of an update.
 */
const LINE: Partial<Record<Verb, string>> = {
  remove: 'Removed by this change. This is the record as it is today.',
};

/** The words of the link to the record in the system, after the line. */
const OPEN: Partial<Record<Verb, string>> = { remove: 'Open it in the system' };

/** The folders whose records have a page of their own under a change: the records of Models, and a feature. */
const BODIES: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure', 'connections', 'technologies', 'owners', 'data', 'features'];

const LIST = { to: '/changes', title: 'Changes' };

/** The tile of a record a change names: that of its kind; for a rule the icon of the entry Rules; for a line of context the lock of a must or the scales of a prefer. */
export function TouchedTile({ folder, record, size }: { folder: string; record: ModelRecord | undefined; size: 'sm' | 'lg' }) {
  if (folder === 'rules') return <IconTile icon={ListChecks} size={size} />;
  if (folder === 'context') return <IconTile icon={typeof record?.fields.must === 'string' && record.fields.must.trim() !== '' ? Lock : Scale} size={size} />;
  return <KindTile kind={folder} size={size} />;
}

/** The name a record of a change stands under, as its row gives it: a connection with none says so, quietly. */
export function TouchedName({ row }: { row: ChangeRow }) {
  const name = row.record?.fields.name;
  const named = typeof name === 'string' && name.trim() !== '';
  return row.touched.folder === 'connections' && !named ? <span className="quiet">{row.label}</span> : <>{row.label}</>;
}

/** What is said of a change the check could not lay over the model. */
export function Unlaid() {
  return (
    <>
      <code>seefore check</code> finds errors in this change, so its records cannot be opened.
    </>
  );
}

/** A catalogue and the travel of a model under a change. */
type Read = { catalogue: Catalogue; travel: Travel };

/** What has been worked out for each change: the model as it would be, and that of today under the change. */
const made = new WeakMap<Changes, Map<string, Read | undefined>>();

/**
 * The catalogue and the travel of a model under a change, worked out once for each change and
 * side: `after`, the model as it would be; `today`, the model of today. Both know what the
 * change touches, so a link to a touched record leads under the change. Nothing for a change
 * the check could not lay.
 */
function readUnder(changes: Changes, records: readonly ModelRecord[], id: string, side: 'today' | 'after'): Read | undefined {
  let reads = made.get(changes);
  if (reads === undefined) {
    reads = new Map();
    made.set(changes, reads);
  }
  const key = `${side} ${id}`;
  if (reads.has(key)) return reads.get(key);
  const world = side === 'after' ? changes.world(id) : undefined;
  const touch = side === 'after' ? world?.touch : changes.touch(id);
  const model = side === 'after' ? world?.records : records;
  let read: Read | undefined;
  if (model !== undefined && touch !== undefined) {
    const catalogue = catalogueOf(model, touch);
    read = { catalogue, travel: travelOf(model, catalogue) };
  }
  reads.set(key, read);
  return read;
}

/** The page of a record under a change. A path the change does not touch, or a change the check could not lay, says so; an id that names no change is missing. */
export function ChangeRecordPage() {
  const { id = '', '*': path = '' } = useParams();
  const { answer, catalogue, changes, failed, slots } = useOutletContext<ModelState>();
  const change = changes?.change(id);
  const found = change !== undefined ? changes?.record(id, path) : undefined;
  // The row of the Records page gives the name the record stands under.
  const row = found !== undefined ? changes?.sections(id).flatMap((section) => section.rows).find((each) => each.touched.path === path) : undefined;
  const label = row?.label ?? found?.touched.id;
  useTitle(label ?? change?.name ?? 'Changes');
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (changes === undefined || catalogue === undefined || answer === undefined) return <p className="page-line">Reading…</p>;
  if (change === undefined) return <Missing list={LIST} />;
  const back = (
    <Link className="text-link" to={`/changes/${change.id}/records`}>
      Back to Records
    </Link>
  );
  if (found === undefined || label === undefined) return <EmptyState title="This change does not touch that record.">{back}</EmptyState>;
  const { touched, today, after } = found;
  // A flow opens as its own page, under the change, once the check has laid the change.
  const under = touched.folder === 'flows' ? changes.flow(id, touched.id) : undefined;
  if (under !== undefined) return <FlowUnderPage key={`${change.id}/${path}`} change={change} changes={changes} under={under} label={label} system={addressOf(catalogue, 'flows', touched.id)} slots={slots} />;
  const shown = touched.verb === 'remove' ? today : after;
  const read = change.laid ? readUnder(changes, answer.records, id, touched.verb === 'remove' ? 'today' : 'after') : undefined;
  if (shown === undefined || read === undefined) return <EmptyState title={<Unlaid />}>{back}</EmptyState>;
  const before = touched.verb === 'update' ? readUnder(changes, answer.records, id, 'today') : undefined;
  // The link to the record as it is: the system's own address, from the catalogue that knows no change.
  const system = today !== undefined ? catalogue.address(today) : undefined;
  const open = OPEN[touched.verb];
  const crumbs = slots?.crumbs ?? null;
  return (
    <>
      {crumbs !== null && createPortal(<Crumbs change={change} label={label} />, crumbs)}
      <header className={`record-title${touched.folder === 'context' ? ' context-title' : ''}`}>
        <TouchedTile folder={touched.folder} record={shown} size="lg" />
        <h1 className="large-title">
          <TouchedName row={{ touched, record: shown, label }} />
        </h1>
        <TypeMarks record={shown}>
          <MarkPill verb={touched.verb} />
        </TypeMarks>
      </header>
      {LINE[touched.verb] !== undefined && (
        <p className="change-record-line">
          {LINE[touched.verb]}
          {open !== undefined && system !== undefined && (
            <>
              {' '}
              <Link to={system}>{open}</Link>
            </>
          )}
        </p>
      )}
      <SectionStack>
        {before !== undefined && <BeforeAndAfter differences={changes.differences(id, path).filter((each) => touched.folder !== 'flows' || each.key !== 'steps')} today={before.catalogue} after={read.catalogue} />}
        <Under touched={touched} record={shown} read={read} />
      </SectionStack>
    </>
  );
}

/** What the address asks of an updated flow's page: `?view=result` is the flow as it would be alone; anything else what the change does to it. */
const VIEW = 'view';
const RESULT = 'result';

/**
 * A flow under a change: the flow's own page, drawn from what the change does to it, with the way
 * back to the change and the flow's mark in the top bar. Its links and its panel are made by a
 * catalogue of the records the view is drawn from that knows what the change touches. For a flow
 * the change removes, `system` is its address in the system.
 */
function FlowUnderPage({ change, changes, under, label, system, slots }: { change: Change; changes: Changes; under: FlowUnder; label: string; system: string; slots: Slots | undefined }) {
  const { pathname, hash } = useLocation();
  const [params] = useSearchParams();
  // An updated flow has two views: what the change does to it, and the flow as it would be alone.
  const result = params.get(VIEW) === RESULT ? under.result : undefined;
  const shown = result ?? under;
  const catalogue = useMemo(() => catalogueOf(shown.records, changes.touch(change.id)), [shown, changes, change.id]);
  // What the change does to each record it names, for the panel of a box or a line.
  const verbs = useMemo(() => new Map(change.touched.map((each) => [each.path, each.verb])), [change]);
  const verb = under.verb;
  // The step picked stays picked in the other view when that view has it: a step that goes is in the first alone.
  const picked = stepInHash(hash);
  const kept = (steps: FlowUnder['steps']) => (steps.some((step) => step.id === picked) ? hash : '');
  return (
    <FlowBody
      // Each view is a list and a diagram of its own, laid out afresh, with no panel left open from the other.
      key={result !== undefined ? RESULT : 'changes'}
      flow={shown.flow}
      steps={shown.steps}
      count={shown.count}
      view={shown.view}
      was={shown.was}
      marks={shown.marks}
      verbs={verbs}
      catalogue={catalogue}
      slots={slots}
      crumbs={
        <>
          <Crumbs change={change} label={label} />
          <MarkPill verb={verb} />
          {under.result !== undefined && (
            <nav className="page-tabs" aria-label="View">
              <Link replace to={{ pathname, hash: kept(under.steps) }} aria-current={result === undefined ? 'page' : undefined}>
                Changes
              </Link>
              <Link replace to={{ pathname, search: `?${VIEW}=${RESULT}`, hash: kept(under.result.steps) }} aria-current={result !== undefined ? 'page' : undefined}>
                Result
              </Link>
            </nav>
          )}
        </>
      }
      system={verb === 'remove' ? system : undefined}
    />
  );
}

/** The way back, in the top bar: the change's name, to Need; "Records", to the list; the record's name. */
function Crumbs({ change, label }: { change: Change; label: string }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb change-crumbs">
      <Link to={`/changes/${change.id}`}>{change.name}</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <Link to={`/changes/${change.id}/records`}>Records</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <span className="breadcrumb-here" aria-current="page">
        {label}
      </span>
    </nav>
  );
}

/**
 * What stands under the title row: the record's own page for a record of Models and a feature,
 * without its description where the description is a key that changes. A flow, a rule and a line
 * of context have no page under a change yet: one that comes or goes shows its keys as written.
 */
function Under({ touched, record, read }: { touched: Touched; record: ModelRecord; read: Read }) {
  const described = !touched.keys.includes('description');
  if (touched.folder === 'features') return <FeatureBody record={record} catalogue={read.catalogue} travel={read.travel} rulebook={undefined} titled={false} described={described} />;
  if (BODIES.includes(touched.folder)) return <RecordBody record={record} catalogue={read.catalogue} travel={read.travel} rulebook={undefined} context={undefined} titled={false} described={described} />;
  if (touched.verb === 'update') return null;
  return <AsWritten fields={record.fields} />;
}

/** How the two sides of a key read: as prose, as links to records one a line, or as the file would hold them. */
type Form = 'text' | 'ids' | 'yaml';

/** A list of ids, or of anything written as text. */
const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((each) => typeof each === 'string');

/** The form both sides of a key read in: a side with nothing has no say. */
function formOf({ before, after }: Difference): Form {
  const sides = [before, after].filter((side) => side !== undefined);
  if (sides.every((side) => typeof side === 'string')) return 'text';
  if (sides.every(isIds)) return 'ids';
  return 'yaml';
}

/** The key, what it says today, and what it will say. */
const DIFF_COLS = '160px minmax(0, 1fr) minmax(0, 1fr)';

/**
 * Before and after, on an updated record: a row for each key the change writes, in the file's
 * order, with what it says today and what it will say. A link on the left is made by the model
 * of today, one on the right by the model as it would be; both lead under the change for a
 * record it touches.
 */
function BeforeAndAfter({ differences, today, after }: { differences: readonly Difference[]; today: Catalogue; after: Catalogue }) {
  if (differences.length === 0) return null;
  return (
    <Section title="Before and after">
      <Panel>
        <div className="change-diff">
          <div className="change-diff-row change-diff-heading" style={{ gridTemplateColumns: DIFF_COLS }} aria-hidden="true">
            <span />
            <span>Today</span>
            <span>With this change</span>
          </div>
          {differences.map((difference) => {
            // The fields of a data record read as one list, across both sides.
            const fields = difference.key === 'fields' ? fieldRows(difference.before, difference.after) : undefined;
            if (fields !== undefined)
              return (
                <div key={difference.key} className="change-diff-row" style={{ gridTemplateColumns: DIFF_COLS }}>
                  <span className="change-key mono">{difference.key}</span>
                  <FieldList rows={fields} />
                </div>
              );
            const form = formOf(difference);
            return (
              <div key={difference.key} className="change-diff-row" style={{ gridTemplateColumns: DIFF_COLS }}>
                <span className="change-key mono">{difference.key}</span>
                <div className="change-diff-today">
                  <Side value={difference.before} other={difference.after} form={form} catalogue={today} nothing="Nothing" mark="Removed" />
                </div>
                <div className="change-diff-after">
                  <Side value={difference.after} other={difference.before} form={form} catalogue={after} nothing="Taken out" mark="Added" />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </Section>
  );
}

/**
 * The fields of a data record before and after, as one list across both sides: a row a field, its
 * name and its description as it would be, or as it is for one that goes; the word of what the
 * change does to it at the right; and under an updated one today's description.
 */
function FieldList({ rows }: { rows: readonly FieldRow[] }) {
  return (
    <ul className="change-fields">
      {rows.map((row) => {
        const word = MARK_WORDS[row.mark];
        const description = row.mark === 'removed' ? row.today : row.after;
        return (
          <li key={row.name} className={word !== undefined ? `change-field change-field-${row.mark}` : 'change-field'} data-mark={word !== undefined ? row.mark : undefined}>
            <span className="change-field-head">
              <strong className="change-field-name">{row.name}</strong>
              {word !== undefined && <span className="flow-step-mark">{word}</span>}
            </span>
            {description !== undefined && <span className="change-field-text">{description}</span>}
            {row.mark === 'updated' && <span className="change-field-today">Today: {row.today ?? 'nothing'}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One side of a key: what it says, in its form; with nothing, the quiet word for that. Where both
 * sides hold a list, an id that is not on the other side bears a small mark. Where the whole key
 * comes or goes, the other side says so once, and no id is marked.
 */
function Side({ value, other, form, catalogue, nothing, mark }: { value: unknown; other: unknown; form: Form; catalogue: Catalogue; nothing: string; mark: string }) {
  if (value === undefined) return <span className="quiet">{nothing}</span>;
  if (form === 'text' && typeof value === 'string') return <Prose text={value} />;
  if (form === 'ids' && isIds(value)) {
    if (value.length === 0) return <span className="quiet">None</span>;
    const others = isIds(other) ? other : undefined;
    return (
      <ul className="change-ids">
        {value.map((id, index) => (
          <li key={index}>
            <RecordLink catalogue={catalogue} id={id} />
            {others !== undefined && !others.includes(id) && <span className="change-id-mark">{mark}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return <Yaml value={value} />;
}

/** A text as prose: a paragraph at each blank line, and its other line breaks kept. */
function Prose({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="change-prose">
          {paragraph}
        </p>
      ))}
    </>
  );
}

/** A value as the file would hold it. */
function Yaml({ value }: { value: unknown }) {
  return <pre className="change-yaml mono">{yamlLines(value, '').join('\n')}</pre>;
}

/** Words that YAML would read as something other than text: a boolean, nothing, or a number. */
const NOT_TEXT = /^(?:true|false|yes|no|on|off|y|n|null|~|[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|[-+]?\.(?:inf|nan)|0x[\da-f]+|0o[0-7]+)$/i;

/** A scalar as YAML writes it on one line: a text plain where it reads back as the same text, else in double quotes. */
function scalarOf(value: unknown): string {
  if (typeof value !== 'string') return value === null || value === undefined ? 'null' : String(value);
  const plain = value !== '' && value.trim() === value && !NOT_TEXT.test(value) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) && !/: |:$| #|[\n\t]/.test(value);
  return plain ? value : JSON.stringify(value);
}

const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The lines of a value as a file would hold it, in block style, each set in by `indent`: a list a
 * dash an item, a mapping a key a line, a text of more than one line as a block. The page may not
 * load the package that reads YAML (A3), and it writes only what a record of the answer holds.
 */
function yamlLines(value: unknown, indent: string): string[] {
  const block = (text: string, at: string): string[] => text.replace(/\n$/, '').split('\n').map((line) => `${at}${line}`);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`];
    return value.flatMap((item) => {
      // The first line of an item stands after its dash.
      const lines = yamlLines(item, `${indent}  `);
      return [`${indent}- ${lines[0]?.trimStart() ?? ''}`, ...lines.slice(1)];
    });
  }
  if (isMapping(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${indent}{}`];
    return entries.flatMap(([key, each]) => {
      const head = `${indent}${scalarOf(key)}:`;
      if (Array.isArray(each) || isMapping(each)) return Object.keys(each).length > 0 ? [head, ...yamlLines(each, `${indent}  `)] : [`${head} ${Array.isArray(each) ? '[]' : '{}'}`];
      if (typeof each === 'string' && each.includes('\n')) return [`${head} ${each.endsWith('\n') ? '|' : '|-'}`, ...block(each, `${indent}  `)];
      return [`${head} ${scalarOf(each)}`];
    });
  }
  if (typeof value === 'string' && value.includes('\n')) return [`${indent}${value.endsWith('\n') ? '|' : '|-'}`, ...block(value, `${indent}  `)];
  return [`${indent}${scalarOf(value)}`];
}

/** The key, and its value. */
const KEY_COLS = '160px minmax(0, 1fr)';

/** The keys of a record as written, a row a key: a text as prose, anything else as the file would hold it. */
function AsWritten({ fields }: { fields: Record<string, unknown> }) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;
  return (
    <Section title="As written">
      <Panel>
        <div className="change-diff">
          {keys.map((key) => {
            const value = fields[key];
            return (
              <div key={key} className="change-diff-row" style={{ gridTemplateColumns: KEY_COLS }}>
                <span className="change-key mono">{key}</span>
                <div>{typeof value === 'string' ? <Prose text={value} /> : <Yaml value={value} />}</div>
              </div>
            );
          })}
        </div>
      </Panel>
    </Section>
  );
}
