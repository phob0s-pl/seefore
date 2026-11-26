import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import type { Verb } from '../model/changes.ts';
import type { Mark } from '../model/flow.ts';
import type { StepAt, Travel } from '../model/travel.ts';
import { diagramAt } from '../model/view.ts';
import type { Arrow, Depth, View } from '../model/view.ts';
import { typeWords } from './kinds.tsx';
import { addressOf, KindTile, NameOf } from './models.tsx';
import { End, ids } from './record.tsx';
import { Button, ButtonLink, GridRow, MarkPill, Pill, RowList } from './ui.tsx';

const ROW = 'minmax(0, 1fr)';

/**
 * An updated flow under a change, as the panel reads it: what the change does to each box, line
 * and connection of the flow's view, and what it does to each record it names, by its path.
 */
type Under = { marks: ReadonlyMap<string, Mark>; verbs: ReadonlyMap<string, Verb> };

/** The sentence under the name of a box or a connection the flow newly passes, or no longer passes. */
const PASSES: Partial<Record<Mark, string>> = {
  added: 'With this change the flow newly passes it.',
  removed: 'With this change the flow no longer passes it.',
};

/** The small word at the right of a row of a line of several connections, as a step's word. */
const WORDS: Partial<Record<Mark, string>> = { added: 'Added', removed: 'Removed', updated: 'Updated' };

/** Beside the type, under a change: the pill of what the change does to the record, when it names it. */
function Done({ record, under }: { record: ModelRecord; under: Under | undefined }) {
  const verb = under?.verbs.get(`${record.kind}/${record.id}`);
  return verb !== undefined ? <MarkPill verb={verb} /> : null;
}

/** Under the name, under a change: whether the flow newly passes the box or the connection, or no longer does. */
function Passes({ id, under }: { id: string; under: Under | undefined }) {
  const mark = under?.marks.get(id);
  const words = mark !== undefined ? PASSES[mark] : undefined;
  return words !== undefined ? <p className="diagram-inspector-passes">{words}</p> : null;
}

/** The way from the panel to a record's page: a small outline button. */
function Details({ catalogue, record, children }: { catalogue: Catalogue; record: ModelRecord; children: string }) {
  const to = catalogue.address(record);
  if (to === undefined) return null;
  return (
    <ButtonLink to={to} variant="outline" size="sm" className="diagram-inspector-action">
      {children}
    </ButtonLink>
  );
}

/** The words on the way from a box to the view it is the focus of, by the depth of that view. */
const SHOWS: Partial<Record<Depth, string>> = { containers: 'Show its containers', components: 'Show its components' };

/**
 * The steps of the flows that happen in a part itself, as rows flush with the panel's edges: what
 * happens, and under it the flow and the step's number. A row opens the flow on that step.
 */
function StepsIn({ steps, catalogue }: { steps: readonly StepAt[]; catalogue: Catalogue }) {
  if (steps.length === 0) return null;
  return (
    <>
      <h3>Steps</h3>
      <RowList label="Steps">
        {steps.map((step) => (
          <GridRow
            key={`${step.flow} ${step.number}`}
            to={`${addressOf(catalogue, 'flows', step.flow)}${step.step !== '' ? `#${encodeURIComponent(step.step)}` : ''}`}
            cols={ROW}
            tile={<KindTile kind="flows" size="sm" />}
            name={
              <>
                <strong>{step.happens}</strong>
                <small>
                  {step.flowName} · step {step.number}
                </small>
              </>
            }
          />
        ))}
      </RowList>
    </>
  );
}

/** The description of a record, when it has one. */
function Description({ record }: { record: ModelRecord }) {
  const { description } = record.fields;
  return typeof description === 'string' ? <p>{description}</p> : null;
}

/**
 * A box or a frame: its type, the mark of an outside system, its name, its description and its
 * page. Under a change, the pill of what the change does to its record stands beside its type, and
 * a sentence under its name says when the flow newly passes it or no longer does. On the
 * Architecture page, a box that can be the focus has the way to that view before the way to its
 * page, and a part that steps of flows happen in has those steps last.
 */
function Thing({ record, catalogue, under, opens, steps }: { record: ModelRecord; catalogue: Catalogue; under: Under | undefined; opens: Depth | undefined; steps: readonly StepAt[] }) {
  const { kind, fields } = record;
  return (
    <>
      <div className="diagram-inspector-kind">
        <span className="eyebrow">{typeWords(kind, fields.kind)}</span>
        {fields.external === true && <Pill size="xs">External</Pill>}
        <Done record={record} under={under} />
      </div>
      <h2>
        <NameOf record={record} />
      </h2>
      <Passes id={record.id} under={under} />
      <Description record={record} />
      <div className="diagram-inspector-actions">
        {opens !== undefined && (
          <ButtonLink to={diagramAt(opens, record.id)} variant="outline" size="sm" className="diagram-inspector-action">
            {SHOWS[opens]}
          </ButtonLink>
        )}
        <Details catalogue={catalogue} record={record}>
          {kind === 'people' ? 'Open actor details' : 'Open model details'}
        </Details>
      </div>
      <StepsIn steps={steps} catalogue={catalogue} />
    </>
  );
}

/** A data record: the small line, its name, its description, each field with its own, and its page. */
function Data({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const fields = (Array.isArray(record.fields.fields) ? (record.fields.fields as unknown[]) : []).flatMap((field) => {
    const { name, description } = (typeof field === 'object' && field !== null ? field : {}) as Record<string, unknown>;
    return typeof name === 'string' ? [{ name, description: typeof description === 'string' ? description : undefined }] : [];
  });
  return (
    <>
      <div className="diagram-inspector-kind">
        <span className="eyebrow">Data</span>
      </div>
      <h2>
        <NameOf record={record} />
      </h2>
      <Description record={record} />
      {fields.length > 0 && (
        <dl className="data-fields" aria-label="Fields">
          {fields.map((field) => (
            <div key={field.name}>
              <dt>{field.name}</dt>
              {field.description !== undefined && <dd>{field.description}</dd>}
            </div>
          ))}
        </dl>
      )}
      <Details catalogue={catalogue} record={record}>
        Open data details
      </Details>
    </>
  );
}

/** A line of one connection: its name, its description, its page, and its path from its real ends. Under a change, as a box. */
function Connection({ record, catalogue, under }: { record: ModelRecord; catalogue: Catalogue; under: Under | undefined }) {
  const { fields } = record;
  return (
    <>
      <div className="diagram-inspector-kind">
        <span className="eyebrow">Connection</span>
        <Done record={record} under={under} />
      </div>
      <h2>
        <NameOf record={record} />
      </h2>
      <Passes id={record.id} under={under} />
      <Description record={record} />
      <Details catalogue={catalogue} record={record}>
        Open connection details
      </Details>
      <h3>Path</h3>
      <ol className="connection-path" aria-label="Path">
        <End role="From" id={fields.from} catalogue={catalogue} />
        {ids(fields.via).map((id, index) => (
          <End key={index} role="Via" id={id} catalogue={catalogue} />
        ))}
        <End role="To" id={fields.to} catalogue={catalogue} />
      </ol>
    </>
  );
}

/**
 * A line of several connections: the two boxes it joins, and a row for each connection with its
 * own path. Under a change, a row bears the word of what the change does to its connection.
 */
function Connections({ arrow, records, catalogue, under }: { arrow: Arrow; records: ModelRecord[]; catalogue: Catalogue; under: Under | undefined }) {
  return (
    <>
      <h2>
        {catalogue.nameOf(arrow.from)} {arrow.back !== undefined ? '↔' : '→'} {catalogue.nameOf(arrow.to)}
      </h2>
      <RowList label="Connections">
        {records.map((record) => {
          const path = [record.fields.from, ...ids(record.fields.via), record.fields.to].map((id) => (typeof id === 'string' ? catalogue.nameOf(id) : ''));
          const mark = under?.marks.get(record.id);
          const word = mark !== undefined ? WORDS[mark] : undefined;
          return (
            <GridRow
              key={record.id}
              to={catalogue.address(record) ?? '/'}
              cols={ROW}
              tile={<KindTile kind="connections" size="sm" />}
              name={
                <>
                  <strong>
                    <NameOf record={record} />
                  </strong>
                  <small>{path.join(' → ')}</small>
                </>
              }
              {...(word !== undefined ? { marks: <span className={`flow-step-mark mark-${mark}`}>{word}</span> } : {})}
            />
          );
        })}
      </RowList>
    </>
  );
}

/**
 * The panel on the field: what the picked box, frame or line is, or a data record a step passes,
 * and the way to its page. Its button, and Escape, close it. On an updated flow under a change,
 * `marks` and `verbs` say what the change does; on any other page, and on a flow the change adds
 * or removes, the marks are none and the panel is as it is anywhere. With `travel`, on the
 * Architecture page, a part's panel lists the steps of flows that happen in it.
 */
export function Inspector({
  picked,
  view,
  catalogue,
  onClose,
  travel,
  marks,
  verbs,
}: {
  picked: string;
  view: View;
  catalogue: Catalogue;
  onClose: () => void;
  travel?: Travel | undefined;
  marks?: ReadonlyMap<string, Mark> | undefined;
  verbs?: ReadonlyMap<string, Verb> | undefined;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const arrow = view.arrows.find((each) => each.id === picked);
  // The records the panel reads: the picked box's, or the connections of a line, those of its
  // own direction first and then those of the other.
  const shown = arrow ? [...arrow.connections, ...(arrow.back ?? [])] : [picked];
  const records = shown.flatMap((id) => catalogue.record(id) ?? []);
  const [record] = records;
  if (record === undefined) return null;
  const under = marks !== undefined && marks.size > 0 ? { marks, verbs: verbs ?? new Map<string, Verb>() } : undefined;
  const body =
    arrow === undefined ? (
      record.kind === 'data' ? (
        <Data record={record} catalogue={catalogue} />
      ) : (
        <Thing record={record} catalogue={catalogue} under={under} opens={view.boxes.find((box) => box.id === picked)?.opens} steps={travel?.stepsIn(record.id) ?? []} />
      )
    ) : shown.length === 1 ? (
      <Connection record={record} catalogue={catalogue} under={under} />
    ) : (
      <Connections arrow={arrow} records={records} catalogue={catalogue} under={under} />
    );
  return (
    <aside className="diagram-inspector" aria-label="Diagram inspector">
      <Button className="diagram-inspector-close" variant="ghost" size="icon" aria-label="Close inspector" onClick={onClose}>
        <X aria-hidden="true" />
      </Button>
      {body}
    </aside>
  );
}
