import type { ModelRecord } from './answer.ts';

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

// ---- a flow under a change: what the change does to each step, box and line

/** What a change does to a step of a flow, or to a box or a line of its view; `same` when it does nothing. */
export type Mark = 'added' | 'removed' | 'updated' | 'same';

/**
 * A key that a change writes otherwise, with today's words for it. No `today` where the key is
 * new; `gone` where the change takes the key out.
 */
export type Was = { key: string; today?: string; gone?: true };

/**
 * A step of a flow under a change: the step as its page reads it, what the change does to it,
 * today's words for each of its own keys that the change writes otherwise, and whether it only
 * moved. A step that goes is read as it is today, and its `number` is the one it has today.
 */
export type StepUnder = FlowStep & { mark: Mark; was: Was[]; moved?: true };

/**
 * A flow under a change, all the page asks: what the change does to the flow; the flow's head as
 * it would be, or as it is for one that goes; today's words for its own keys that change; its
 * steps in one list; how many steps it would have; the view of what it passes today and of what
 * it would pass, as one; a mark for every box, arrow and connection of that view; and the records
 * the view is drawn from, those as they would be and today's of what the change removes.
 */
export type FlowUnder = {
  verb: 'add' | 'update' | 'remove';
  flow: FlowRead;
  was: Was[];
  steps: StepUnder[];
  count: number;
  view: View;
  marks: Map<string, Mark>;
  records: ModelRecord[];
};

/** The keys of a step that are its own: a step is updated when one of them is written otherwise. */
const STEP_KEYS = ['does', 'reply', 'after', 'name', 'only', 'description', 'data'] as const;
/** The keys of a flow that its head shows. */
const FLOW_KEYS = ['name', 'feature', 'only', 'description', 'starts', 'ends'] as const;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * One order of what is today and what would be: the ids as they would be, with each id that goes
 * put back where it stood, straight after the nearest id before it today that stays, ahead of
 * what comes there; first when none before it stays. Ids that go together keep today's order.
 */
export function orderOfBoth(today: readonly string[], after: readonly string[]): string[] {
  const stays = new Set(after);
  const order = [...after];
  let anchor: string | undefined;
  let last: string | undefined;
  for (const id of today) {
    if (stays.has(id)) {
      anchor = id;
      last = undefined;
      continue;
    }
    // After the anchor, and after any that went just before it today.
    const behind = last ?? anchor;
    const at = behind === undefined ? 0 : order.indexOf(behind) + 1;
    order.splice(at, 0, id);
    last = id;
  }
  return order;
}

/** The ids that only moved: those that stay, outside the longest run that keeps today's order. */
function movedOf(today: readonly string[], after: readonly string[]): Set<string> {
  const there = new Set(after);
  const was = today.filter((id) => there.has(id));
  const here = new Set(today);
  const now = after.filter((id) => here.has(id));
  // The longest common run of the two orders, kept from its end so that the earlier one wins a tie.
  const lengths: number[][] = Array.from({ length: was.length + 1 }, () => new Array<number>(now.length + 1).fill(0));
  for (let i = was.length - 1; i >= 0; i--)
    for (let j = now.length - 1; j >= 0; j--) (lengths[i] as number[])[j] = was[i] === now[j] ? ((lengths[i + 1] as number[])[j + 1] as number) + 1 : Math.max((lengths[i + 1] as number[])[j] as number, (lengths[i] as number[])[j + 1] as number);
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < was.length && j < now.length; ) {
    if (was[i] === now[j]) {
      kept.add(was[i] as string);
      i++;
      j++;
    } else if (((lengths[i + 1] as number[])[j] as number) >= ((lengths[i] as number[])[j + 1] as number)) i++;
    else j++;
  }
  return new Set(now.filter((id) => !kept.has(id)));
}

/** The raw steps of a flow's record that have an id, by that id, in order. */
function rawSteps(flow: ModelRecord): Map<string, Record<string, unknown>> {
  const steps = Array.isArray(flow.fields.steps) ? (flow.fields.steps as unknown[]) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const step of steps) {
    if (typeof step !== 'object' || step === null || Array.isArray(step)) continue;
    const id = (step as Record<string, unknown>).id;
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, step as Record<string, unknown>);
  }
  return byId;
}

/** Today's words for a key of a step, as its page says them. */
function stepWords(step: FlowStep | undefined, key: string): string | undefined {
  if (step === undefined) return undefined;
  if (key === 'does') return step.acts;
  if (key === 'name') return step.happens;
  if (key === 'reply') return step.reply?.words;
  if (key === 'after') return step.after.length > 0 ? joined(step.after.map((each) => each.words)) : undefined;
  if (key === 'only') return step.only;
  if (key === 'description') return step.description;
  return step.data.length > 0 ? joined(step.data.map((each) => each.name)) : undefined;
}

/** The connections a view's arrows stand for, either way. */
const walkedOf = (view: View): Set<string> => new Set(view.arrows.flatMap((arrow) => [...arrow.connections, ...(arrow.back ?? [])]));

/**
 * What a change does to a flow, or nothing when the change does not name the flow or a side of
 * it is missing. `today` are the records of the model; `after` those as they would be; `touched`
 * what the change names, with what it does to each. A flow the change adds or removes comes back
 * in the same form, from its one side, with every mark `same`: only the flow bears a mark.
 */
export function flowUnder(
  today: readonly ModelRecord[],
  after: readonly ModelRecord[],
  touched: readonly { path: string; verb: 'add' | 'update' | 'remove' }[],
  flowId: string,
): FlowUnder | undefined {
  const verb = touched.find((each) => each.path === `flows/${flowId}`)?.verb;
  if (verb === undefined) return undefined;
  const plain = (records: readonly ModelRecord[]): FlowUnder | undefined => {
    const flow = flowSteps(records, flowId);
    if (flow === undefined) return undefined;
    const view = flowView(records, flowId);
    const marks = new Map<string, Mark>();
    return { verb, flow, was: [], steps: flow.steps.map((step) => ({ ...step, mark: 'same', was: [] })), count: flow.steps.length, view, marks, records: [...records] };
  };
  if (verb === 'add') return plain(after);
  if (verb === 'remove') return plain(today);

  const was = byIdOf(today).get(flowId);
  const will = byIdOf(after).get(flowId);
  const readToday = flowSteps(today, flowId);
  const readAfter = flowSteps(after, flowId);
  if (was === undefined || will === undefined || was.kind !== 'flows' || will.kind !== 'flows' || readToday === undefined || readAfter === undefined) return undefined;

  // The steps of both sides by their ids, and the one order of them.
  const rawToday = rawSteps(was);
  const rawAfter = rawSteps(will);
  const order = orderOfBoth([...rawToday.keys()], [...rawAfter.keys()]);
  const moved = movedOf([...rawToday.keys()], [...rawAfter.keys()]);

  // The records of both: those as they would be, and today's of what the change removes, with
  // the flow holding the steps of both. The view and what each step lights are read from them,
  // so a step that goes lights its own line.
  const removed = new Set(touched.filter((each) => each.verb === 'remove').map((each) => each.path));
  const gone = today.filter((record) => removed.has(`${record.kind}/${record.id}`));
  const both: ModelRecord = { ...will, fields: { ...will.fields, steps: order.map((id) => rawAfter.get(id) ?? rawToday.get(id)) } };
  const records = [...after.filter((record) => record !== will), both, ...gone];
  const read = flowSteps(records, flowId);
  if (read === undefined) return undefined;
  const view = flowView(records, flowId);

  // The number a step shows: its place as it would be, or for one that goes its place today.
  const todayById = new Map(readToday.steps.map((step) => [step.id, step]));
  const afterById = new Map(readAfter.steps.map((step) => [step.id, step]));
  const shown = new Map<number, number>();
  read.steps.forEach((step) => shown.set(step.number, (afterById.get(step.id) ?? todayById.get(step.id))?.number ?? step.number));
  const renumbered = (ref: StepRef): StepRef => ({ ...ref, number: shown.get(ref.number) ?? ref.number });

  const steps = read.steps.map((step): StepUnder => {
    const before = rawToday.get(step.id);
    const now = rawAfter.get(step.id);
    const mark: Mark = now === undefined ? 'removed' : before === undefined ? 'added' : STEP_KEYS.some((key) => !sameValue(before[key], now[key])) ? 'updated' : 'same';
    const changed: Was[] =
      mark === 'updated' && before !== undefined && now !== undefined
        ? STEP_KEYS.filter((key) => !sameValue(before[key], now[key])).map((key) => {
            const words = key in before ? stepWords(todayById.get(step.id), key) : undefined;
            return { key, ...(words !== undefined ? { today: words } : {}), ...(!(key in now) ? { gone: true as const } : {}) };
          })
        : [];
    const after = step.after.map(renumbered);
    const strand = after.length > 0 ? `Also after ${joined(after.map((each) => String(each.number)))}${after.length === 1 ? `, ${after[0]?.words}` : ''}` : undefined;
    return {
      ...step,
      number: shown.get(step.number) ?? step.number,
      ...(step.reply !== undefined ? { reply: renumbered(step.reply) } : {}),
      after,
      ...(strand !== undefined ? { strand } : {}),
      mark,
      was: changed,
      ...(mark !== 'removed' && mark !== 'added' && moved.has(step.id) ? { moved: true as const } : {}),
    };
  });

  // The boxes and the connections: by what the flow passes, and then by what the change does to the record.
  const updated = new Set(touched.filter((each) => each.verb === 'update').map((each) => each.path));
  const kindOf = new Map(records.map((record) => [record.id, record.kind]));
  const viewToday = flowView(today, flowId);
  const viewAfter = flowView(after, flowId);
  const passed = (was: Set<string>, will: Set<string>, id: string): Mark =>
    !was.has(id) ? 'added' : !will.has(id) ? 'removed' : updated.has(`${kindOf.get(id) ?? ''}/${id}`) ? 'updated' : 'same';
  const boxesToday = new Set(viewToday.boxes.map((box) => box.id));
  const boxesAfter = new Set(viewAfter.boxes.map((box) => box.id));
  const walkedToday = walkedOf(viewToday);
  const walkedAfter = walkedOf(viewAfter);
  const marks = new Map<string, Mark>();
  for (const box of view.boxes) marks.set(box.id, passed(boxesToday, boxesAfter, box.id));
  for (const arrow of view.arrows) {
    const each = [...arrow.connections, ...(arrow.back ?? [])].map((id) => {
      const mark = passed(walkedToday, walkedAfter, id);
      marks.set(id, mark);
      return mark;
    });
    // A line of several connections bears one mark when they agree, and is updated when one of them differs while another stays.
    marks.set(arrow.id, each.every((mark) => mark === each[0]) ? (each[0] ?? 'same') : 'updated');
  }

  const head: Was[] = FLOW_KEYS.filter((key) => !sameValue(was.fields[key], will.fields[key])).map((key) => {
    const words = key === 'feature' ? readToday.feature?.name : key === 'name' ? readToday.name : text(was.fields[key]);
    return { key, ...(key in was.fields && words !== undefined ? { today: words } : {}), ...(!(key in will.fields) ? { gone: true as const } : {}) };
  });
  return { verb, flow: { ...read, steps }, was: head, steps, count: readAfter.steps.length, view, marks, records };
}

