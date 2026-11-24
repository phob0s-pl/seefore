import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import type { Arrow, View } from '../model/view.ts';
import { typeWords } from './kinds.tsx';
import { KindTile, NameOf } from './models.tsx';
import { End, ids } from './record.tsx';
import { Button, ButtonLink, GridRow, Pill, RowList } from './ui.tsx';

const ROW = 'minmax(0, 1fr)';

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

/** The description of a record, when it has one. */
function Description({ record }: { record: ModelRecord }) {
  const { description } = record.fields;
  return typeof description === 'string' ? <p>{description}</p> : null;
}

/** A box or a frame: its type, the mark of an outside system, its name, its description and its page. */
function Thing({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { kind, fields } = record;
  return (
    <>
      <div className="diagram-inspector-kind">
        <span className="eyebrow">{typeWords(kind, fields.kind)}</span>
        {fields.external === true && <Pill size="xs">External</Pill>}
      </div>
      <h2>
        <NameOf record={record} />
      </h2>
      <Description record={record} />
      <Details catalogue={catalogue} record={record}>
        {kind === 'people' ? 'Open actor details' : 'Open model details'}
      </Details>
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

/** A line of one connection: its name, its description, its page, and its path from its real ends. */
function Connection({ record, catalogue }: { record: ModelRecord; catalogue: Catalogue }) {
  const { fields } = record;
  return (
    <>
      <div className="diagram-inspector-kind">
        <span className="eyebrow">Connection</span>
      </div>
      <h2>
        <NameOf record={record} />
      </h2>
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

/** A line of several connections: the two boxes it joins, and a row for each connection with its own path. */
function Connections({ arrow, records, catalogue }: { arrow: Arrow; records: ModelRecord[]; catalogue: Catalogue }) {
  return (
    <>
      <h2>
        {catalogue.nameOf(arrow.from)} {arrow.back !== undefined ? '↔' : '→'} {catalogue.nameOf(arrow.to)}
      </h2>
      <RowList label="Connections">
        {records.map((record) => {
          const path = [record.fields.from, ...ids(record.fields.via), record.fields.to].map((id) => (typeof id === 'string' ? catalogue.nameOf(id) : ''));
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
            />
          );
        })}
      </RowList>
    </>
  );
}

/**
 * The panel on the field: what the picked box, frame or line is, or a data record a step passes,
 * and the way to its page. Its button, and Escape, close it.
 */
export function Inspector({ picked, view, catalogue, onClose }: { picked: string; view: View; catalogue: Catalogue; onClose: () => void }) {
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
  const body =
    arrow === undefined ? (
      record.kind === 'data' ? (
        <Data record={record} catalogue={catalogue} />
      ) : (
        <Thing record={record} catalogue={catalogue} />
      )
    ) : shown.length === 1 ? (
      <Connection record={record} catalogue={catalogue} />
    ) : (
      <Connections arrow={arrow} records={records} catalogue={catalogue} />
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
