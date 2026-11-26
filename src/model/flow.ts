import type { ModelRecord } from './answer.ts';
import { ofModel } from './kinds.ts';

import { stepsOf, wayOf } from './model.ts';
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
  // A change and its review are named by the change's id, which may be that of a record: they are none of the model.
  for (const record of records) if (ofModel(record.kind) && !byId.has(record.id)) byId.set(record.id, record);
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
 *
 * A store's box says in `rows` how many items of the flow it holds (`flowItems`).
 */
export function flowView(records: readonly ModelRecord[], flowId: string): View {
  const view = partsView(records, flowId);
  return withRows(view, itemsIn(records, flowId, view));
}

/** The view of a flow's own parts, as `flowView` draws it, with no rows. */
function partsView(records: readonly ModelRecord[], flowId: string): View {
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
  const view = partsView(records, flowId);

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

// ---- the items of a flow: what its steps put into, read from and take out of the stores it draws

/** What an act does to its item: puts it into the store, reads it there, or takes it out. */
export type ActDoes = 'put' | 'read' | 'take';

/**
 * One act on an item, at a step of this flow: the step's number and id; what it does; the part
 * that acts, the `from` of the connection of the step that acts; whether a flow that the step
 * runs does it; its condition's words, the outermost first: "when the fan pays by card and when
 * Scan answers"; and its place among all the acts of the flow, from 0, which says which of two
 * acts of one step on two items comes first. Under a change, `row` is the place of its step in the
 * one list of steps, from 1, which the step's number does not say where a step goes.
 */
export type Act = { number: number; step: string; does: ActDoes; part: { id: string; name: string }; byRun: boolean; only?: string; order: number; row?: number };

/**
 * An item: one data record in one store, in one flow, worked out from the steps. Its condition's
 * words where every act on it stands under one: "Only when Scan answers". Its acts in the order
 * of the flow.
 */
export type Item = { store: { id: string; name: string }; data: { id: string; name: string }; condition?: string; acts: Act[] };

/**
 * A place of a flow's page: before the first step, a step by its number from 1, or Ends. Under a
 * change a step is by its place in the one list, from 1, as the `row` of an act is.
 */
export type ItemPlace = 'starts' | number | 'ends';

/**
 * What an item is at a place: not yet touched by the flow, kept, only read, or gone; and, where
 * the step at the place touches it, the step's word.
 */
export type ItemAt = { is: 'hollow' | 'kept' | 'only-read' | 'gone'; word?: 'Put' | 'Read' | 'Gone' };

/**
 * The items of a flow, each by its first act, which is the order of the rows in a box. An act is
 * at the store its step's connection ends at: of `data` a put where the step writes and a read
 * where it reads, none where its way is not said; of `removes` a take. Of one step, the acts of
 * `data` come first, then those of `removes`. A reply, a step in a part, one with no place and
 * one between two parts make none.
 *
 * A step that runs a flow does every act of that flow, and of each flow that one runs in turn,
 * in the stores this flow draws, all at the one step; a flow already on the way down is not run
 * again. An act stands under the `only` of each step on its way down; a flow's own `only` names
 * the case the whole flow is told for, and is none of an item's.
 */
export function flowItems(records: readonly ModelRecord[], flowId: string): Item[] {
  return itemsIn(records, flowId, partsView(records, flowId));
}

/** The items of a flow in the stores of its view. */
function itemsIn(records: readonly ModelRecord[], flowId: string, view: View): Item[] {
  const byId = byIdOf(records);
  const flow = byId.get(flowId);
  if (flow === undefined || flow.kind !== 'flows') return [];
  const nameOf = (id: string): { id: string; name: string } => ({ id, name: text(byId.get(id)?.fields.name) ?? id });
  const record = (id: string) => byId.get(id);
  const drawn = new Set(view.boxes.filter((box) => box.kind === 'stores').map((box) => box.id));

  // One item for each store and data record, in the order of its first act.
  const items = new Map<string, Item>();
  let order = 0;
  const acts = (steps: readonly Step[], top: Step | undefined, above: readonly string[], down: readonly string[]): void => {
    for (const step of steps) {
      if (step.reply !== undefined) continue;
      // The step of this flow that all the acts stand at, and the conditions on the way down to this one.
      const at = top ?? step;
      const only = text(step.fields.only);
      const under = only !== undefined ? [...above, only] : above;
      const on = step.does !== undefined ? byId.get(step.does) : undefined;
      if (on?.kind === 'flows') {
        if (!down.includes(on.id)) acts(stepsOfRecord(on), at, under, [...down, on.id]);
        continue;
      }
      const store = wayOf(step, record);
      if (store === undefined || !drawn.has(store.store)) continue;
      const { way } = store;
      const done: [string, ActDoes][] = [...(way === undefined ? [] : step.data.map((id): [string, ActDoes] => [id, way === 'write' ? 'put' : 'read'])), ...step.removes.map((id): [string, ActDoes] => [id, 'take'])];
      const part = text(byId.get(store.connection)?.fields.from) ?? '';
      for (const [data, does] of done) {
        if (byId.get(data)?.kind !== 'data') continue;
        const key = JSON.stringify([store.store, data]);
        const item = items.get(key) ?? { store: nameOf(store.store), data: nameOf(data), acts: [] };
        items.set(key, item);
        item.acts.push({ number: at.index + 1, step: at.id, does, part: nameOf(part), byRun: top !== undefined, ...(under.length > 0 ? { only: under.join(' and ') } : {}), order: order++ });
      }
    }
  };
  acts(stepsOfRecord(flow), undefined, [], [flowId]);

  // An item is under a condition when every act on it is: the words of each, once, in the order of the acts.
  return [...items.values()].map((item) => {
    const words = [...new Set(item.acts.map((act) => act.only))];
    return words.every((each) => each !== undefined) ? { ...item, condition: `Only ${words.join('; only ')}` } : item;
  });
}

/** The view with each store's box saying how many of the items it holds. */
function withRows(view: View, items: readonly Item[]): View {
  const rows = new Map<string, number>();
  for (const item of items) rows.set(item.store.id, (rows.get(item.store.id) ?? 0) + 1);
  if (rows.size === 0) return view;
  return { ...view, boxes: view.boxes.map((box) => (rows.has(box.id) ? { ...box, rows: rows.get(box.id) as number } : box)) };
}

/**
 * What an item is at a place, by the acts of the steps up to and with it: none before the first
 * step, all at Ends. Hollow where there is none; gone where the last of them is a take; kept,
 * else, where one of them is a put; only read, else. So a put after a take is kept again.
 *
 * Where the step at the place touches the item, its word: "Gone" when the item is gone after
 * the step; else "Put" when one of the step's acts puts it; else "Read". Ends has none. Under a
 * change an act stands at its `row`, and "so far" counts down the one list.
 */
export function itemAt(item: Item, place: ItemPlace): ItemAt {
  const at = (act: Act): number => act.row ?? act.number;
  const so = place === 'starts' ? [] : place === 'ends' ? item.acts : item.acts.filter((act) => at(act) <= place);
  const last = so.at(-1);
  const is: ItemAt['is'] = last === undefined ? 'hollow' : last.does === 'take' ? 'gone' : so.some((act) => act.does === 'put') ? 'kept' : 'only-read';
  const here = typeof place === 'number' ? item.acts.filter((act) => at(act) === place) : [];
  if (here.length === 0) return { is };
  return { is, word: is === 'gone' ? 'Gone' : here.some((act) => act.does === 'put') ? 'Put' : 'Read' };
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
 * An item of a flow under a change, and what the change does to it: added where only the flow as
 * it would be has it; removed where only today's has it; updated where both have it and its acts
 * differ, or where the change updates its data record; else the same. Each is read from its own
 * side: one that goes from today's steps, every other from the steps as they would be. Of an item
 * updated by its acts, `today` holds today's acts; `record` says that the change updates its data
 * record; and of an added item that today's steps name in this store with no way said, `unsaid`
 * holds the numbers of those steps. In the Changes view an act stands at the `row` of its step in
 * the one list, with the number that step bears there.
 */
export type ItemUnder = Item & { mark: Mark; today?: Act[]; record?: true; unsaid?: number[] };

/**
 * A flow under a change, all the page asks: what the change does to the flow; the flow's head as
 * it would be, or as it is for one that goes; today's words for its own keys that change; its
 * steps in one list; how many steps it would have; the view of what it passes today and of what
 * it would pass, as one; the items its stores hold; a mark for every box, arrow and connection of
 * that view; and the records the view is drawn from, those as they would be and today's of what
 * the change removes.
 */
export type FlowUnder = {
  verb: 'add' | 'update' | 'remove';
  flow: FlowRead;
  was: Was[];
  steps: StepUnder[];
  count: number;
  view: View;
  /**
   * The items its stores hold. Of a flow the change updates, those of today's flow and of the flow
   * as it would be, each with its mark, in the order of the rows: as they would be, with each that
   * goes put back where it stood today in its box. Of a flow the change adds or removes, and of the
   * result, the flow's own, with no mark.
   */
  items: ItemUnder[];
  marks: Map<string, Mark>;
  records: ModelRecord[];
  /** Of a flow the change updates: the flow as it would be alone, with no mark, as a flow the change adds is read. */
  result?: FlowUnder;
};

/** The keys of a step that are its own: a step is updated when one of them is written otherwise. */
const STEP_KEYS = ['does', 'reply', 'after', 'name', 'only', 'description', 'data', 'access', 'removes'] as const;
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

/** The connections a view's arrows stand for, either way. */
const walkedOf = (view: View): Set<string> => new Set(view.arrows.flatMap((arrow) => [...arrow.connections, ...(arrow.back ?? [])]));

/** An item mark-free: the form of a flow the change adds or removes, and of the result. */
const unmarked = (items: readonly Item[]): ItemUnder[] => items.map((item) => ({ ...item, mark: 'same' }));

/**
 * What a step does at its store, in words, as "Today: " says it under a change: each data record
 * it names, with what it does to it, joined with "; ": "Basket, put"; "Payment, read"; "Paid
 * order, no way said"; "Basket, taken out". On a step at no store, the names alone: "Basket and
 * Payment". Nothing where it names none.
 */
function doingOf(step: Step | undefined, byId: Map<string, ModelRecord>): string | undefined {
  if (step === undefined) return undefined;
  const nameOf = (id: string): string => text(byId.get(id)?.fields.name) ?? id;
  const at = step.reply === undefined ? wayOf(step, (id) => byId.get(id)) : undefined;
  if (at === undefined) return step.data.length > 0 ? joined(step.data.map(nameOf)) : undefined;
  const does = at.way === 'write' ? 'put' : at.way === 'read' ? 'read' : 'no way said';
  const words = [...step.data.map((id) => `${nameOf(id)}, ${does}`), ...step.removes.map((id) => `${nameOf(id)}, taken out`)];
  return words.length > 0 ? words.join('; ') : undefined;
}

/**
 * What a change does to a flow, or nothing when the change does not name the flow or a side of
 * it is missing. `today` are the records of the model; `after` those as they would be; `touched`
 * what the change names, with what it does to each. A flow the change adds or removes comes back
 * in the same form, from its one side, with every mark `same`: only the flow bears a mark.
 *
 * Each row is read from its own side: a step that stays or comes from the flow as it would be,
 * a step that goes from the flow as it is today, with today's connections and their ends. The
 * view is of both, and what a row lights is found on it. An item the same way: one that only
 * today's flow keeps from today's steps, every other from the steps as they would be; a store
 * that only today's flow reaches is drawn, with its frames, also where the change moves the end
 * of a connection that stays.
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
    return { verb, flow, was: [], steps: flow.steps.map((step) => ({ ...step, mark: 'same', was: [] })), count: flow.steps.length, view: flowView(records, flowId), items: unmarked(flowItems(records, flowId)), marks: new Map(), records: [...records] };
  };
  if (verb === 'add') return plain(after);
  if (verb === 'remove') return plain(today);

  const todayById = byIdOf(today);
  const afterById = byIdOf(after);
  const was = todayById.get(flowId);
  const will = afterById.get(flowId);
  const readToday = flowSteps(today, flowId);
  const readAfter = flowSteps(after, flowId);
  if (was === undefined || will === undefined || was.kind !== 'flows' || will.kind !== 'flows' || readToday === undefined || readAfter === undefined) return undefined;

  // The flow's own keys that change, with today's words.
  const head: Was[] = FLOW_KEYS.filter((key) => !sameValue(was.fields[key], will.fields[key])).map((key) => {
    const words = key === 'feature' ? readToday.feature?.name : key === 'name' ? readToday.name : text(was.fields[key]);
    return { key, ...(key in was.fields && words !== undefined ? { today: words } : {}), ...(!(key in will.fields) ? { gone: true as const } : {}) };
  });

  // The steps of both sides by their ids. A flow with an id twice, which the check tells, has no
  // step told from another: it is shown as it would be, with no mark on a step, a box or a line.
  const rawToday = rawSteps(was);
  const rawAfter = rawSteps(will);
  if (rawToday.size !== readToday.steps.length || rawAfter.size !== readAfter.steps.length) {
    const shown = plain(after);
    return shown === undefined ? undefined : { ...shown, was: head, result: shown };
  }
  const order = orderOfBoth([...rawToday.keys()], [...rawAfter.keys()]);
  const moved = movedOf([...rawToday.keys()], [...rawAfter.keys()]);

  // What the flow passes on each side, and what it keeps in its stores on each.
  const viewToday = partsView(today, flowId);
  const partsAfter = partsView(after, flowId);
  const itemsToday = itemsIn(today, flowId, viewToday);
  const itemsAfter = itemsIn(after, flowId, partsAfter);
  const viewAfter = withRows(partsAfter, itemsAfter);
  const boxesToday = new Set(viewToday.boxes.map((box) => box.id));
  const boxesAfter = new Set(viewAfter.boxes.map((box) => box.id));
  const walkedToday = walkedOf(viewToday);
  const walkedAfter = walkedOf(viewAfter);

  // The records the view of both is drawn from: those as they would be, and, of what only
  // today's flow passes, the record as it is today, with today's ends. The flow in them walks
  // what a step is on, on either side: a reply walks nothing of its own. It is in every store
  // that today's flow draws, so that a store only today's reaches holds its rows, also where the
  // change moves the end of a connection that stays and its line is drawn with its new ends. A
  // data record that the change removes is there as it is today, for an item that goes.
  const onlyToday = new Set([...[...boxesToday].filter((id) => !boxesAfter.has(id)), ...[...walkedToday].filter((id) => !walkedAfter.has(id))]);
  const stepsToday = stepsOfRecord(was);
  const stepsAfter = stepsOfRecord(will);
  const storesToday = viewToday.boxes.filter((box) => box.kind === 'stores').map((box) => box.id);
  const walks = [...new Set([...[...stepsAfter, ...stepsToday].flatMap((step) => (step.reply === undefined && step.does !== undefined ? [step.does] : [])), ...storesToday])];
  const both: ModelRecord = { ...will, fields: { ...will.fields, steps: walks.map((does, index) => ({ id: `walk-${index}`, does })) } };
  const dataToday = [...new Set(itemsToday.map((item) => item.data.id))].filter((id) => afterById.get(id)?.kind !== 'data');
  const records = [...after.filter((record) => record !== will && !onlyToday.has(record.id)), ...[...onlyToday, ...dataToday].flatMap((id) => todayById.get(id) ?? []), both];
  // The flow in them only walks and names no data: the rows of its stores' boxes are the items of
  // both sides, worked out below.
  const parts = partsView(records, flowId);
  const drawn = new Set(parts.boxes.map((box) => box.id));
  const arrowOf = (id: string): { arrow: string; forward: boolean } | undefined => {
    for (const arrow of parts.arrows) {
      if (arrow.connections.includes(id)) return { arrow: arrow.id, forward: true };
      if (arrow.back?.includes(id)) return { arrow: arrow.id, forward: false };
    }
    return undefined;
  };
  // What a step lights on the view of both: its connection, or for a reply that of the step it answers, as its own side has it; or its part.
  const sides = { today: { steps: stepsToday, places: placesOf(stepsToday, todayById) }, after: { steps: stepsAfter, places: placesOf(stepsAfter, afterById) } };
  const lightsOf = (side: 'today' | 'after', id: string): Lights | undefined => {
    const { places } = sides[side];
    const step = places.first.get(id);
    if (step === undefined) return undefined;
    const travels = places.connection(step);
    const way = travels && arrowOf(travels.id);
    if (way) return { arrow: way.arrow, back: way.forward === (step.reply !== undefined) };
    const on = places.does(step);
    return step.reply === undefined && on !== undefined && on.kind !== 'connections' && on.kind !== 'flows' && drawn.has(on.id) ? { box: on.id } : undefined;
  };

  // The number a step of today shows in the one list: as it would be when it stays, today's when it goes.
  const readTodayById = new Map(readToday.steps.map((step) => [step.id, step]));
  const readAfterById = new Map(readAfter.steps.map((step) => [step.id, step]));
  const shown = new Map(readToday.steps.map((step) => [step.number, readAfterById.get(step.id)?.number ?? step.number]));
  const renumbered = (ref: StepRef): StepRef => ({ ...ref, number: shown.get(ref.number) ?? ref.number });

  let before: StepUnder | undefined;
  const steps = order.flatMap((id): StepUnder[] => {
    const then = readAfterById.get(id);
    const now = readTodayById.get(id);
    const read = then ?? now;
    if (read === undefined) return [];
    const rawWas = rawToday.get(id);
    const rawWill = rawAfter.get(id);
    const mark: Mark = rawWill === undefined ? 'removed' : rawWas === undefined ? 'added' : STEP_KEYS.some((key) => !sameValue(rawWas[key], rawWill[key])) ? 'updated' : 'same';
    // Today's words where a line of the step reads otherwise: who acts on what and the title, by what they say; the rest by its key.
    const changed: Was[] = [];
    if (mark === 'updated' && now !== undefined && then !== undefined && rawWas !== undefined && rawWill !== undefined) {
      if (now.acts !== then.acts) changed.push({ key: 'does', today: now.acts });
      if (now.happens !== then.happens) changed.push({ key: 'name', today: now.happens });
      const said: Record<string, string | undefined> = {
        reply: now.reply?.words,
        after: now.after.length > 0 ? joined(now.after.map((each) => each.words)) : undefined,
        only: now.only,
        description: now.description,
      };
      for (const key of ['reply', 'after', 'only', 'description'] as const)
        if (!sameValue(rawWas[key], rawWill[key])) changed.push({ key, ...(said[key] !== undefined ? { today: said[key] } : {}), ...(!(key in rawWill) ? { gone: true as const } : {}) });
      // What it does at its store, under `data`, by its words, whichever of `does`, `data`,
      // `access` and `removes` made them differ: "Taken out" where it names nothing now.
      const doing = doingOf(sides.today.places.first.get(id), todayById);
      const doingAfter = doingOf(sides.after.places.first.get(id), afterById);
      if (doing !== doingAfter) changed.push({ key: 'data', ...(doing !== undefined ? { today: doing } : {}), ...(doingAfter === undefined ? { gone: true as const } : {}) });
    }
    // A step that goes names the steps it followed by the numbers they bear in this list, and opens no strand of its own.
    const goes = mark === 'removed';
    const after = goes ? read.after.map(renumbered) : read.after;
    const reply = goes && read.reply !== undefined ? renumbered(read.reply) : read.reply;
    const strand = goes ? undefined : read.strand;
    // The words of a condition stand over its first step in this list.
    const group = read.only !== undefined && (read.only !== before?.only || strand !== undefined) ? `Only ${read.only}` : undefined;
    const lights = lightsOf(then !== undefined ? 'after' : 'today', id);
    const { lights: _lit, strand: _strand, group: _group, reply: _reply, ...rest } = read;
    const step: StepUnder = {
      ...rest,
      ...(reply !== undefined ? { reply } : {}),
      after,
      ...(lights !== undefined ? { lights } : {}),
      ...(group !== undefined ? { group } : {}),
      ...(strand !== undefined ? { strand } : {}),
      mark,
      was: changed,
      ...(mark === 'same' || mark === 'updated' ? (moved.has(id) ? { moved: true as const } : {}) : {}),
    };
    before = step;
    return [step];
  });

  // What the change updates, by path: a box, a line or an item is yellow by it.
  const updated = new Set(touched.filter((each) => each.verb === 'update').map((each) => each.path));

  // The items of both sides, each read from its own side. An act stands at the row of its step in
  // the one list, with the number that step bears there.
  const rowOf = new Map(steps.map((step, index) => [step.id, index + 1]));
  const placed = (act: Act): Act => {
    const row = rowOf.get(act.step);
    return row === undefined ? act : { ...act, number: steps[row - 1]?.number ?? act.number, row };
  };
  const keyOf = (item: Item): string => JSON.stringify([item.store.id, item.data.id]);
  const wasItems = new Map(itemsToday.map((item) => [keyOf(item), item]));
  const willItems = new Map(itemsAfter.map((item) => [keyOf(item), item]));
  // The steps of today that name data at a store and say no way, which make no item today: by the
  // item they would make, the numbers they bear in the list.
  const unsaid = new Map<string, number[]>();
  for (const step of stepsToday) {
    const at = step.reply === undefined ? wayOf(step, (id) => todayById.get(id)) : undefined;
    const number = steps[(rowOf.get(step.id) ?? 0) - 1]?.number;
    if (at === undefined || at.way !== undefined || number === undefined) continue;
    for (const data of step.data) {
      if (todayById.get(data)?.kind !== 'data') continue;
      const key = JSON.stringify([at.store, data]);
      const named = unsaid.get(key) ?? [];
      if (!named.includes(number)) unsaid.set(key, [...named, number]);
    }
  }
  // Two sides' acts differ when the lists are not alike: an act by its step's id, what it does,
  // whether a flow that the step runs does it, and its condition. A number that shifts differs nothing.
  const actsOf = (item: Item) => item.acts.map((act) => [act.step, act.does, act.byRun, act.only ?? null]);
  const markedOf = (key: string): ItemUnder | undefined => {
    const was = wasItems.get(key);
    const will = willItems.get(key);
    if (will === undefined) return was && { ...was, acts: was.acts.map(placed), mark: 'removed' };
    const acts = will.acts.map(placed);
    if (was === undefined) {
      const named = unsaid.get(key);
      return { ...will, acts, mark: 'added', ...(named !== undefined ? { unsaid: named } : {}) };
    }
    const differ = !sameValue(actsOf(was), actsOf(will));
    const record = updated.has(`data/${will.data.id}`);
    return { ...will, acts, mark: differ || record ? 'updated' : 'same', ...(differ ? { today: was.acts.map(placed) } : {}), ...(record ? { record: true as const } : {}) };
  };
  // The rows of a box stand as they would be, with each that goes put back where it stood today in
  // its box; the boxes take their turns as the items of both sides do.
  const storeOf = (key: string): string => (wasItems.get(key) ?? willItems.get(key))?.store.id ?? '';
  const inBox = (store: string, keys: Iterable<string>): string[] => [...keys].filter((key) => storeOf(key) === store);
  const turns = orderOfBoth([...wasItems.keys()], [...willItems.keys()]);
  const byBox = new Map([...new Set(turns.map(storeOf))].map((store) => [store, orderOfBoth(inBox(store, wasItems.keys()), inBox(store, willItems.keys()))]));
  const items = turns.flatMap((key) => {
    const next = byBox.get(storeOf(key))?.shift();
    return (next !== undefined ? markedOf(next) : undefined) ?? [];
  });
  const view = withRows(parts, items);

  // The boxes and the connections: by what the flow passes, and then by what the change does to the record.
  const kindOf = new Map(records.map((record) => [record.id, record.kind]));
  const passed = (was: Set<string>, will: Set<string>, id: string): Mark =>
    !was.has(id) ? 'added' : !will.has(id) ? 'removed' : updated.has(`${kindOf.get(id) ?? ''}/${id}`) ? 'updated' : 'same';
  const marks = new Map<string, Mark>();
  for (const box of view.boxes) marks.set(box.id, passed(boxesToday, boxesAfter, box.id));
  for (const arrow of view.arrows) {
    const each = [...arrow.connections, ...(arrow.back ?? [])].map((id) => {
      const mark = passed(walkedToday, walkedAfter, id);
      marks.set(id, mark);
      return mark;
    });
    // A line of several connections bears their mark when they agree, and is updated when they do not: something on it differs.
    marks.set(arrow.id, each.every((mark) => mark === each[0]) ? (each[0] ?? 'same') : 'updated');
  }
  // The flow as it would be alone, which the page shows in place of the difference when asked.
  const result: FlowUnder = { verb, flow: readAfter, was: [], steps: readAfter.steps.map((step) => ({ ...step, mark: 'same', was: [] })), count: readAfter.steps.length, view: viewAfter, items: unmarked(itemsAfter), marks: new Map(), records: [...after] };
  return { verb, flow: { ...readAfter, steps }, was: head, steps, count: readAfter.steps.length, view, items, marks, records, result };
}
