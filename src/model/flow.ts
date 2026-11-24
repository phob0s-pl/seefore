import type { ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';
import { stepsOf } from './model.ts';
import type { Step } from './model.ts';
import { drawingOf, litBy, thingsOf } from './view.ts';
import type { View } from './view.ts';

/**
 * A flow as its page shows it: the view of its own parts, its steps as the page reads them, and
 * the list of flows by feature. A flow whose file is broken, or a step whose `does` names
 * nothing, gives what can be said: the check tells the writer, the page shows what is there.
 */

/**
 * What a step lights on the flow's view: an arrow, with the way the step travels on it, from the
 * arrow's `from` to its `to` or `back` from its `to` to its `from`; or a box.
 */
export type Lights = { arrow: string; back: boolean } | { box: string };

/** What a step is: on a connection, the answer to one, in a part, a flow it runs, or not placed. */
export type StepKind = 'connection' | 'reply' | 'part' | 'flow' | 'unplaced';

/** Another step of the flow, as a step names it: its number and what happens in it. */
export type StepRef = { number: number; words: string };

/** One step as the page reads it. */
export type FlowStep = {
  id: string;
  /** Its place in the flow, from 1. */
  number: number;
  /** What happens: its own name, else that of its connection or of the flow it runs. */
  happens: string;
  kind: StepKind;
  /** Who acts on what, in words: "Payments to Card provider", "In Tickets". */
  acts: string;
  /** For a reply, the step it answers. */
  reply?: StepRef;
  /** The steps it comes after, where that is not the step above. */
  after: StepRef[];
  only?: string;
  description?: string;
  /** The data it passes, by id and name. */
  data: { id: string; name: string }[];
  /** What it lights on the flow's view; nothing for a step with no place or one that runs a flow. */
  lights?: Lights;
  /** The id of the flow it runs. */
  runs?: string;
  /** The words above the steps of a condition, on the first of them: "Only when the fan pays by card". */
  group?: string;
  /** It stands under a condition. */
  conditioned: boolean;
  /** The words above a strand, on its first step: "Also after 1, Publishes the paid order". */
  strand?: string;
  /** It stands in a strand: from a step with `after` to the next one, or the end. */
  inStrand: boolean;
};

/** A flow as its page reads it. */
export type FlowRead = {
  id: string;
  name: string;
  starts?: string;
  ends?: string;
  description?: string;
  only?: string;
  feature?: { id: string; name: string };
  steps: FlowStep[];
};

/** A feature with its flows, by name, for the list of flows. */
export type FeatureFlows = { id: string; name: string; flows: { id: string; name: string; only?: string; steps: number }[] };

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Words joined as people join them: "1", "1 and 5", "1, 3 and 5". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** The first record of each id: a second one is a problem of `seefore check`. */
function byIdOf(records: readonly ModelRecord[]): Map<string, ModelRecord> {
  const byId = new Map<string, ModelRecord>();
  for (const record of records) if (!byId.has(record.id)) byId.set(record.id, record);
  return byId;
}

/** The steps of a flow's record, in order. An item that is no mapping is a step with nothing in it. */
function stepsOfRecord(flow: ModelRecord): Step[] {
  const steps = flow.fields.steps;
  const safe = Array.isArray(steps) ? steps.map((step: unknown) => (typeof step === 'object' && step !== null && !Array.isArray(step) ? step : {})) : [];
  return stepsOf({ id: flow.id, kind: 'flows', file: flow.file, ok: true, fields: { steps: safe }, at: new Map() });
}

/** The record a step's `does` names, and the connection it travels: its own, or for a reply that of the step it answers. */
function placesOf(steps: readonly Step[], byId: Map<string, ModelRecord>) {
  const first = new Map<string, Step>();
  for (const step of steps) if (step.id !== '' && !first.has(step.id)) first.set(step.id, step);
  const does = (step: Step | undefined) => (step?.does !== undefined ? byId.get(step.does) : undefined);
  const answered = (step: Step) => (step.reply !== undefined ? first.get(step.reply) : undefined);
  const connection = (step: Step): ModelRecord | undefined => {
    const on = step.reply !== undefined ? does(answered(step)) : does(step);
    return on?.kind === 'connections' ? on : undefined;
  };
  return { first, does, answered, connection };
}

/**
 * The view of a flow's own parts. Its boxes are the two ends of every connection a step walks,
 * every part a step happens in, and every thing those are in, upwards, as frames; a frame holds
 * only what is drawn. Its arrows are those connections, between their own ends, joined as the
 * whole view joins them. A step that runs another flow adds nothing.
 */
export function flowView(records: readonly ModelRecord[], flowId: string): View {
  const flow = byIdOf(records).get(flowId);
  if (flow === undefined || flow.kind !== 'flows') return { boxes: [], arrows: [] };
  const base = thingsOf(records);
  const byId = byIdOf(base.sorted);
  const steps = stepsOfRecord(flow);
  const { does, connection } = placesOf(steps, byId);

  const walked = new Set<string>();
  const placed = new Set<string>();
  for (const step of steps) {
    const on = connection(step);
    if (on !== undefined) {
      walked.add(on.id);
      for (const end of [on.fields.from, on.fields.to]) if (typeof end === 'string' && base.things.has(end)) placed.add(end);
      continue;
    }
    const part = step.reply === undefined ? does(step) : undefined;
    if (part !== undefined && base.things.has(part.id)) placed.add(part.id);
  }
  // What each is in, upwards. A thing whose `in` names nothing it can be in stands at the top.
  const drawn = new Set<string>();
  for (const id of placed) for (const each of [id, ...(base.chains.get(id) ?? [])]) drawn.add(each);
  return drawingOf(
    base,
    [...base.things.keys()].filter((id) => drawn.has(id)),
    base.sorted.filter((record) => record.kind === 'connections' && walked.has(record.id)),
  );
}

/** What stays bright for a step: for an arrow, as for a pick of it; for a box, it and the frames it is in. */
export function litByStep(view: View, lights: Lights): { boxes: string[]; arrows: string[] } | undefined {
  if ('arrow' in lights) return litBy(view, lights.arrow);
  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  if (!boxes.has(lights.box)) return undefined;
  const bright = new Set<string>();
  for (let at: string | undefined = lights.box; at !== undefined && !bright.has(at); at = boxes.get(at)?.in) bright.add(at);
  return { boxes: view.boxes.filter((box) => bright.has(box.id)).map((box) => box.id), arrows: [] };
}

/** A flow as its page reads it, or nothing when no flow has the id. */
export function flowSteps(records: readonly ModelRecord[], flowId: string): FlowRead | undefined {
  const byId = byIdOf(records);
  const flow = byId.get(flowId);
  if (flow === undefined || flow.kind !== 'flows') return undefined;
  const nameOf = (id: string): string => text(byId.get(id)?.fields.name) ?? id;
  const steps = stepsOfRecord(flow);
  const { first, does, answered, connection } = placesOf(steps, byId);
  const view = flowView(records, flowId);

  // What happens in each step, as other steps name it.
  const happens = (step: Step): string => {
    const on = does(step);
    return step.name ?? (on?.kind === 'connections' || on?.kind === 'flows' ? text(on.fields.name) : undefined) ?? (step.id !== '' ? step.id : (step.does ?? ''));
  };
  const ref = (id: string): StepRef | undefined => {
    const step = first.get(id);
    return step === undefined ? undefined : { number: step.index + 1, words: happens(step) };
  };
  const arrowOf = (id: string): { arrow: string; forward: boolean } | undefined => {
    for (const arrow of view.arrows) {
      if (arrow.connections.includes(id)) return { arrow: arrow.id, forward: true };
      if (arrow.back?.includes(id)) return { arrow: arrow.id, forward: false };
    }
    return undefined;
  };
  const drawn = new Set(view.boxes.map((box) => box.id));

  let inStrand = false;
  const read = steps.map((step, index): FlowStep => {
    const on = does(step);
    const travels = connection(step);
    const answers = step.reply !== undefined ? answered(step) : undefined;
    const ends = travels && { from: nameOf(String(travels.fields.from)), to: nameOf(String(travels.fields.to)) };
    const part = step.reply === undefined && on !== undefined && on.kind !== 'connections' && on.kind !== 'flows' && drawn.has(on.id) ? on : undefined;
    const kind: StepKind =
      step.reply !== undefined ? (ends ? 'reply' : 'unplaced') : ends ? 'connection' : on?.kind === 'flows' ? 'flow' : part !== undefined ? 'part' : 'unplaced';
    const acts =
      kind === 'connection' && ends
        ? `${ends.from} to ${ends.to}`
        : kind === 'reply' && ends
          ? `${ends.to} replies to ${ends.from}`
          : kind === 'part' && part
            ? `In ${nameOf(part.id)}`
            : kind === 'flow' && on
              ? `Runs ${nameOf(on.id)}`
              : 'Where this happens is not known';
    const way = travels && arrowOf(travels.id);
    const lights: Lights | undefined = way ? { arrow: way.arrow, back: way.forward === (kind === 'reply') } : part ? { box: part.id } : undefined;
    const reply = answers && ref(answers.id);
    const after = step.after.flatMap((id) => ref(id) ?? []);
    const only = text(step.fields.only);
    const description = text(step.fields.description);
    // A strand starts at a step with `after`, and a condition is said again under it.
    const strand = after.length > 0 ? `Also after ${joined(after.map((each) => String(each.number)))}${after.length === 1 ? `, ${after[0]?.words}` : ''}` : undefined;
    if (strand !== undefined) inStrand = true;
    const before = index > 0 ? text(steps[index - 1]?.fields.only) : undefined;
    const group = only !== undefined && (only !== before || strand !== undefined) ? `Only ${only}` : undefined;
    return {
      id: step.id,
      number: index + 1,
      happens: happens(step),
      kind,
      acts,
      ...(reply !== undefined ? { reply } : {}),
      after,
      ...(only !== undefined ? { only } : {}),
      ...(description !== undefined ? { description } : {}),
      data: step.data.map((id) => ({ id, name: nameOf(id) })),
      ...(lights !== undefined ? { lights } : {}),
      ...(kind === 'flow' && on !== undefined ? { runs: on.id } : {}),
      ...(group !== undefined ? { group } : {}),
      conditioned: only !== undefined,
      ...(strand !== undefined ? { strand } : {}),
      inStrand,
    };
  });

  const { fields } = flow;
  const feature = text(fields.feature);
  const optional = (key: string, value: string | undefined) => (value !== undefined ? { [key]: value } : {});
  return {
    id: flow.id,
    name: nameOf(flow.id),
    ...optional('starts', text(fields.starts)),
    ...optional('ends', text(fields.ends)),
    ...optional('description', text(fields.description)),
    ...optional('only', text(fields.only)),
    ...(feature !== undefined ? { feature: { id: feature, name: nameOf(feature) } } : {}),
    steps: read,
  };
}

/** Every feature that has a flow, by name, each with its flows by name and the number of steps of each. */
export function flowsByFeature(records: readonly ModelRecord[]): FeatureFlows[] {
  const byId = byIdOf(records);
  const flows = [...byId.values()].filter((record) => record.kind === 'flows').sort(byName);
  const features = new Map<string, FeatureFlows>();
  for (const flow of flows) {
    const id = text(flow.fields.feature);
    if (id === undefined) continue;
    const feature = byId.get(id);
    const into = features.get(id) ?? { id, name: (feature?.kind === 'features' ? text(feature.fields.name) : undefined) ?? id, flows: [] };
    features.set(id, into);
    const only = text(flow.fields.only);
    into.flows.push({ id: flow.id, name: text(flow.fields.name) ?? flow.id, ...(only !== undefined ? { only } : {}), steps: stepsOfRecord(flow).length });
  }
  const order = (a: FeatureFlows, b: FeatureFlows) => byName({ kind: '', id: a.id, file: '', fields: { name: a.name } }, { kind: '', id: b.id, file: '', fields: { name: b.name } });
  return [...features.values()].sort(order);
}
