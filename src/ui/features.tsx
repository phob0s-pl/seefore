import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import type { ModelRecord } from '../model/answer.ts';
import type { Catalogue } from '../model/catalogue.ts';
import type { Travel } from '../model/travel.ts';
import { typeWords } from './kinds.tsx';
import { KindTile, Missing, NameOf, RecordLink } from './models.tsx';
import { Named, OwnerOf, Related } from './record.tsx';
import type { Fact, Row } from './record.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, Facts, GridRow, LargeTitle, Panel, RowList, SectionStack, TextPanel, useTitle } from './ui.tsx';

/** The name and the condition. */
const COLS = 'minmax(0, 1fr) minmax(0, 1fr)';

/** "1 step", "20 steps": beside a flow on its feature's page. */
const stepCount = (count: number): string => `${count} ${count === 1 ? 'step' : 'steps'}`;

/** The condition of a record as the lists say it, or nothing. */
const onlyOf = (record: ModelRecord | undefined): string => (typeof record?.fields.only === 'string' ? `Only ${record.fields.only}` : '');

const LIST = { to: '/features', title: 'Features' };

/** What a page of features shows while the model is read, or why it cannot be. */
function useModel(): { catalogue?: Catalogue; travel?: Travel; line?: ReactNode } {
  const { catalogue, travel, failed } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (catalogue === undefined || travel === undefined) return { line: <p className="page-line">Reading…</p> };
  return { catalogue, travel };
}

/**
 * The list of features, `/features`: each feature by name with its condition, and its flows under
 * it, each a link to its page. It is the one way to a flow: there is no list of flows apart.
 */
export function FeaturesList() {
  useTitle('Features');
  const { catalogue, travel, line } = useModel();
  if (catalogue === undefined || travel === undefined) return line;
  return (
    <>
      <LargeTitle>Features</LargeTitle>
      {catalogue.features.length === 0 ? (
        <EmptyState title="No features yet." />
      ) : (
        <Panel lift>
          <RowList label="Features">
            {catalogue.features.map((feature) => (
              <Fragment key={feature.id}>
                <GridRow to={`/features/${feature.id}`} cols={COLS} tile={<KindTile kind="features" size="sm" />} name={<NameOf record={feature} />} cells={[onlyOf(feature)]} strong />
                {travel.feature(feature.id).flows.map((flow) => {
                  const record = catalogue.record(flow.id);
                  return (
                    <GridRow
                      key={flow.id}
                      to={`/flows/${flow.id}`}
                      cols={COLS}
                      tile={<KindTile kind="flows" size="sm" />}
                      name={record ? <NameOf record={record} /> : flow.id}
                      cells={[onlyOf(record)]}
                      depth={1}
                    />
                  );
                })}
              </Fragment>
            ))}
          </RowList>
        </Panel>
      )}
    </>
  );
}

/** The page of a feature, `/features/<id>`; an id that names no feature is missing. */
export function FeaturePage() {
  const { id = '' } = useParams();
  const { catalogue, travel, line } = useModel();
  const found = catalogue?.record(id);
  const record = found?.kind === 'features' ? found : undefined;
  const name = record?.fields.name;
  useTitle(typeof name === 'string' ? name : (record?.id ?? 'Features'));
  if (catalogue === undefined || travel === undefined) return line;
  if (record === undefined) return <Missing list={LIST} />;
  return <FeatureBody record={record} catalogue={catalogue} travel={travel} />;
}

/** A feature: its facts, its flows, its parts from its flows and those stated on it, and the data of its flows. */
function FeatureBody({ record, catalogue, travel }: { record: ModelRecord; catalogue: Catalogue; travel: Travel }) {
  const { fields } = record;
  const read = travel.feature(record.id);
  const facts: Fact[] = [
    ...(typeof fields.only === 'string' ? [{ label: 'Only', value: fields.only }] : []),
    ...(typeof fields.owner === 'string' ? [{ label: 'Owner', value: <RecordLink catalogue={catalogue} id={fields.owner} /> }] : []),
    ...(read.people.length > 0
      ? [
          {
            label: 'For',
            value: read.people.map((person, index) => (
              <Fragment key={person.id}>
                {index > 0 && ', '}
                <RecordLink catalogue={catalogue} id={person.id} />
              </Fragment>
            )),
          },
        ]
      : []),
  ];
  const flows: Row[] = read.flows.map((flow) => ({ key: flow.id, cells: [<Named catalogue={catalogue} id={flow.id} />, stepCount(flow.steps)] }));
  const parts: Row[] = read.fromFlows.map((part) => ({
    key: part.id,
    cells: [<Named catalogue={catalogue} id={part.id} />, typeWords(part.kind, part.fields.kind), <OwnerOf catalogue={catalogue} record={part} />],
  }));
  // Each id as written: a connection shows its two ends; an id that names nothing, itself alone.
  const stated: Row[] = read.stated.map((id) => {
    const each = catalogue.record(id);
    const type =
      each === undefined ? (
        ''
      ) : each.kind === 'connections' ? (
        <>
          <RecordLink catalogue={catalogue} id={each.fields.from} /> → <RecordLink catalogue={catalogue} id={each.fields.to} />
        </>
      ) : (
        typeWords(each.kind, each.fields.kind)
      );
    return { key: id, cells: [<Named catalogue={catalogue} id={id} />, type, each !== undefined ? <OwnerOf catalogue={catalogue} record={each} /> : ''] };
  });
  const data: Row[] = read.data.map((each) => ({ key: each.id, cells: [<Named catalogue={catalogue} id={each.id} />] }));
  const nothing = read.flows.length === 0 && read.stated.length === 0;
  return (
    <>
      <header className="record-title">
        <KindTile kind="features" size="lg" />
        <h1 className="large-title">
          <NameOf record={record} />
        </h1>
      </header>
      <SectionStack>
        {typeof fields.description === 'string' && <TextPanel>{fields.description}</TextPanel>}
        {facts.length > 0 && <Facts rows={facts} />}
        {nothing ? (
          <TextPanel>Nothing ties this feature to the model yet.</TextPanel>
        ) : (
          <>
            <Related title="Flows" rows={flows} widths={['auto', '120px']} />
            <Related title="From its flows" rows={parts} widths={['auto', '200px', '240px']} />
            <Related title="Stated on it" rows={stated} widths={['auto', '320px', '240px']} />
            <Related title="Data" rows={data} />
          </>
        )}
      </SectionStack>
    </>
  );
}
