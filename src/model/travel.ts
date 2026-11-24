import type { ModelRecord } from './answer.ts';
import { byName, catalogueOf } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { flowSteps } from './flow.ts';
import { stepsOf } from './model.ts';
import type { Step } from './model.ts';

/**
 * What the pages of features, data, parts and connections ask of the flows, worked out from the
 * steps and never written: a feature's flows and parts, where data travels, the flows through a
 * part and the steps on a connection. A reference that names nothing is not followed.
 */

/** A step as another page names it: its flow, its place and what happens in it. */
export type StepAt = { flow: string; flowName: string; step: string; number: number; happens: string };

/**
 * The way data goes on a connection: from one end to the other, and whether it comes `back` as a
 * reply. It goes from the connection's `from` to its `to`; on a read of a store, from the store to
 * the reader; on a reply, back the other way.
 */
export type Way = { from: string; to: string; back: boolean };

/** A connection data is seen on, and the way it goes. */
export type SeenOn = Way & { connection: string };

/** Data seen on a connection, and the way it goes. */
export type DataWay = Way & { data: string };

/** A flow of a feature, with its number of steps. */
export type FlowCount = { id: string; steps: number };

/** A flow through a part, with the id of its feature, as written. */
export type FlowThrough = { flow: string; feature?: string };

/** A feature as its page reads it. */
export type FeatureRead = {
  /** Its flows, by name. */
  flows: FlowCount[];
  /** The two ends of each connection its flows' steps walk, and each part a step happens in, once each, in the order of the tree, people first. */
  fromFlows: ModelRecord[];
  /** The ids of `touches`, as written, each once. */
  stated: string[];
  /** The people among those. */
  people: ModelRecord[];
  /** The data its flows' steps name, by name. */
  data: ModelRecord[];
};

/** What the pages ask of the flows. */
export type Travel = {
  feature: (id: string) => FeatureRead;
  /** Every step that names a data record: the flows by name, the steps in order. */
  stepsWith: (id: string) => StepAt[];
  /** Every connection a data record is seen on, with the way it goes, once each. */
  waysOf: (id: string) => SeenOn[];
  /** Every flow with a step on a connection that ends at the part or at something it holds, or a step that happens there: by name. */
  flowsThrough: (id: string) => FlowThrough[];
  /** The steps on a connection, and the replies to them. */
  stepsOn: (id: string) => StepAt[];
  /** The data seen on a connection, with the way it goes, once each. */
  dataOn: (id: string) => DataWay[];
};

/** One step of a flow, where it is: the connection it travels and the way, or the part it is in. */
type Walk = StepAt & { feature?: string; data: string[]; connection?: ModelRecord; way?: Way; part?: string };

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []);
/** The items in their order, each key once. */
function once<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const each = key(item);
    if (seen.has(each)) return false;
    seen.add(each);
    return true;
  });
}

/** The steps of a flow's record, in order, as flow.ts reads them: an item that is no mapping is a step with nothing in it. */
function stepsOfRecord(flow: ModelRecord): Step[] {
  const steps = flow.fields.steps;
  const safe = Array.isArray(steps) ? steps.map((step: unknown) => (typeof step === 'object' && step !== null && !Array.isArray(step) ? step : {})) : [];
  return stepsOf({ id: flow.id, kind: 'flows', file: flow.file, ok: true, fields: { steps: safe }, at: new Map() });
}

/** What the pages ask of the flows, worked out from the records of `/api/model` when first asked. */
export function travelOf(records: readonly ModelRecord[], catalogue: Catalogue = catalogueOf(records)): Travel {
  const flows = records.filter((record) => record.kind === 'flows' && catalogue.record(record.id) === record).sort(byName);
  const things = new Set(['people', 'systems', 'apps', 'stores', 'components', 'infrastructure']);

  // Every step of every flow, where it is: as the page of the flow reads it.
  let walks: Walk[] | undefined;
  const all = (): Walk[] => {
    walks ??= flows.flatMap((flow) => {
      const read = flowSteps(records, flow.id);
      if (read === undefined) return [];
      const raw = stepsOfRecord(flow);
      const first = new Map<string, Step>();
      for (const step of raw) if (step.id !== '' && !first.has(step.id)) first.set(step.id, step);
      const feature = text(flow.fields.feature);
      return read.steps.map((step, index): Walk => {
        const own = raw[index];
        const on = step.kind === 'connection' ? own?.does : step.kind === 'reply' && own?.reply !== undefined ? first.get(own.reply)?.does : undefined;
        const found = on !== undefined ? catalogue.record(on) : undefined;
        const connection = found?.kind === 'connections' ? found : undefined;
        // A read of a store brings what the reader takes; a reply goes back the way it came.
        const [start, end] = [text(connection?.fields.from) ?? '', text(connection?.fields.to) ?? ''];
        const forward = connection?.fields.access === 'read' ? { from: end, to: start } : { from: start, to: end };
        const part = step.kind === 'part' && own?.does !== undefined && things.has(catalogue.record(own.does)?.kind ?? '') ? own.does : undefined;
        return {
          flow: flow.id,
          flowName: read.name,
          step: step.id,
          number: step.number,
          happens: step.happens,
          ...(feature !== undefined ? { feature } : {}),
          data: once(
            step.data.map((each) => each.id).filter((id) => catalogue.record(id)?.kind === 'data'),
            (id) => id,
          ),
          ...(connection !== undefined ? { connection, way: step.kind === 'reply' ? { from: forward.to, to: forward.from, back: true } : { ...forward, back: false } } : {}),
          ...(part !== undefined ? { part } : {}),
        };
      });
    });
    return walks;
  };
  const at = ({ flow, flowName, step, number, happens }: Walk): StepAt => ({ flow, flowName, step, number, happens });
  const wayKey = (way: Way) => `${way.from} ${way.to} ${way.back}`;
  const ends = (walk: Walk): string[] => (walk.connection ? [text(walk.connection.fields.from), text(walk.connection.fields.to)].flatMap((id) => id ?? []) : walk.part ? [walk.part] : []);

  // The parts in the order of the tree, people first; a part the tree does not hold stands last.
  const order = new Map([...catalogue.people, ...catalogue.software.map((row) => row.record)].map((record, index) => [record.id, index]));
  const treeOrder = (a: ModelRecord, b: ModelRecord) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size) || byName(a, b);

  return {
    feature: (id) => {
      const own = flows.filter((flow) => flow.fields.feature === id);
      const walked = all().filter((walk) => walk.feature === id);
      const fromFlows = once(walked.flatMap(ends), (each) => each)
        .flatMap((each) => {
          const record = catalogue.record(each);
          return record !== undefined && things.has(record.kind) ? [record] : [];
        })
        .sort(treeOrder);
      const feature = catalogue.record(id);
      const stated = once(feature?.kind === 'features' ? list(feature.fields.touches) : [], (each) => each);
      const people = once(
        [...fromFlows, ...stated.flatMap((each) => catalogue.record(each) ?? [])].filter((record) => record.kind === 'people'),
        (record) => record.id,
      ).sort(byName);
      const data = once(walked.flatMap((walk) => walk.data), (each) => each)
        .flatMap((each) => catalogue.record(each) ?? [])
        .sort(byName);
      return { flows: own.map((flow) => ({ id: flow.id, steps: stepsOfRecord(flow).length })), fromFlows, stated, people, data };
    },
    stepsWith: (id) => all().filter((walk) => walk.data.includes(id)).map(at),
    waysOf: (id) =>
      once(
        all().flatMap((walk) => (walk.connection !== undefined && walk.way !== undefined && walk.data.includes(id) ? [{ connection: walk.connection.id, ...walk.way }] : [])),
        (seen) => `${seen.connection} ${wayKey(seen)}`,
      ),
    // A flow goes through a part when a step of it touches the part itself or something the part
    // holds: a system's page shows the flows through its apps.
    flowsThrough: (id) =>
      once(
        all().filter((walk) => ends(walk).some((end) => end === id || catalogue.chain(end).some((above) => above.id === id))),
        (walk) => walk.flow,
      ).map((walk) => ({ flow: walk.flow, ...(walk.feature !== undefined ? { feature: walk.feature } : {}) })),
    stepsOn: (id) => all().filter((walk) => walk.connection?.id === id).map(at),
    dataOn: (id) =>
      once(
        all().flatMap(({ connection, way, data }) => (connection?.id === id && way !== undefined ? data.map((each) => ({ data: each, ...way })) : [])),
        (seen) => `${seen.data} ${wayKey(seen)}`,
      ),
  };
}
