import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { flowsByFeature } from '../model/flow.ts';
import { KindTile } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, GridRow, LargeTitle, Panel, RowList, Section, SectionStack, useTitle } from './ui.tsx';

/** The name and the condition. */
const COLS = 'minmax(0, 1fr) minmax(0, 1fr)';

/** "1 step", "20 steps": for a feature's page. The list of flows shows no count. */
export const stepCount = (count: number): string => `${count} ${count === 1 ? 'step' : 'steps'}`;

/** The list of flows, `/flows`: every flow under the name of its feature, each a link to its page. */
export function FlowsList() {
  useTitle('Flows');
  const { answer, failed } = useOutletContext<ModelState>();
  const features = useMemo(() => (answer ? flowsByFeature(answer.records) : undefined), [answer]);
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (features === undefined) return <p className="page-line">Reading…</p>;
  return (
    <>
      <LargeTitle>Flows</LargeTitle>
      {features.length === 0 ? (
        <EmptyState title="No flows yet." />
      ) : (
        <SectionStack>
          {features.map((feature) => (
            <Section key={feature.id} title={feature.name}>
              <Panel lift>
                <RowList label={feature.name}>
                  {feature.flows.map((flow) => (
                    <GridRow
                      key={flow.id}
                      to={`/flows/${flow.id}`}
                      cols={COLS}
                      tile={<KindTile kind="flows" size="sm" />}
                      name={flow.name}
                      cells={[flow.only !== undefined ? `Only ${flow.only}` : '']}
                    />
                  ))}
                </RowList>
              </Panel>
            </Section>
          ))}
        </SectionStack>
      )}
    </>
  );
}
