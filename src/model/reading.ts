import { isMap, isScalar, isSeq } from 'yaml';
import type { YAMLMap } from 'yaml';
import type { ModelRecord, Problem } from './answer.ts';
import { changeMark } from './mark.ts';
import type { Entry } from './model.ts';
import { START, capital, error, quote, warning } from './problem.ts';
import type { Position } from './problem.ts';
import { nearest } from './rules.ts';
import { keyPosition } from './yaml.ts';
import type { YamlFile } from './yaml.ts';

/**
 * The review of a change held beyond its form, each fault at its place in the review's file: a
 * review with no change; an address that names nothing, neither today nor with the change; a
 * status whose comments or a block whose recommendation is missing; a reading of the change as
 * it was before it moved; too many points; and a point that has gone on too long. The review of a
 * decided change is history, held in its form alone: what it names may be gone since.
 */

/** A file of `reviews/` with a good id: its id, its file and its YAML, and what it holds once it has read with no problem. */
export type ReadReview = { id: string; file: string; yaml: YamlFile; fields?: Record<string, unknown> };

/** What the reviews are held against: the path of every file there is, the records of the model today, and each change that reads. */
export type Against = { paths: ReadonlySet<string>; entries: readonly Entry[]; changes: readonly ModelRecord[] };

/** The most points of a review: a dozen are answered, a longer list is not. Over it the check warns. */
export const POINTS_MAX = 12;
/** The most comments of a point before it goes to the person. Over it the check warns. */
export const COMMENTS_MAX = 4;

const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The fewest comments of a point in each status: a line at each change of status, and a reopened or settled point has had two. */
const COMMENTS_NEEDED: Readonly<Record<string, number>> = { open: 0, fixed: 1, declined: 1, closed: 1, reopened: 2, settled: 2 };

/** Who adds what, for a point in a status with too few comments: by the status, then by how many comments it has. As D4's table of the statuses has it. */
const NEXT_LINE: Readonly<Record<string, readonly string[]>> = {
  fixed: ['The corrector adds one line that says what was changed.'],
  declined: ['The corrector adds one line that says why nothing was changed.'],
  closed: ['The reviewer adds one line that says how the correction settles the point.'],
  reopened: [
    'The corrector adds one line that says what was changed, or why nothing was; then the reviewer adds one that says what the correction leaves open, or what it breaks.',
    "The reviewer adds one line, after the corrector's, that says what the correction leaves open, or what it breaks.",
  ],
  settled: [
    "The line that declined or reopened the point comes first; then the skill `change` adds the person's word as one line.",
    "The skill `change` adds the person's word as one line, after the line that declined or reopened the point.",
  ],
};

/** The ids of the steps of a flow as its fields hold them: each step's own `id`, and a bare id of a change's `steps`. */
function stepIds(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step) => (typeof step === 'string' ? [step] : isMapping(step) && typeof step.id === 'string' ? [step.id] : []));
}

/**
 * Each review held against the model and its change. `review-no-change` is told of any file of
 * `reviews/` whose change has no file; the rest only of a review that read with no problem. Of a
 * review whose change is decided, only `review-status` is held. Its addresses and its mark need a
 * change that reads; without one they are not held.
 */
export function holdReviews(reviews: readonly ReadReview[], against: Against): Problem[] {
  const problems: Problem[] = [];
  // The records of today by their paths, a file that does not read among them: it is there.
  const today = new Map<string, Entry>();
  for (const entry of against.entries) if (!today.has(`${entry.kind}/${entry.id}`)) today.set(`${entry.kind}/${entry.id}`, entry);

  for (const review of reviews) {
    const { file, yaml } = review;
    const told = (problem: Problem, field?: string): void => {
      problems.push({ ...problem, record: review.id, ...(field !== undefined ? { field } : {}) });
    };
    const own = `changes/${review.id}.yaml`;
    if (!against.paths.has(own)) told(error(file, START, 'review-no-change', `This file reviews the change ${quote(review.id)}, and there is no ${quote(own)}.`, 'Name the file as its change is named, or take it out.'));

    const doc = yaml.doc;
    const fields = review.fields;
    if (doc === undefined || yaml.map === undefined || fields === undefined) continue;
    const change = against.changes.find((each) => each.id === review.id);
    const decided = change?.fields.status !== undefined;
    const points = doc.get('points', true);
    const written: { id: string; key: unknown; map: YAMLMap }[] = isMap(points) ? points.items.flatMap((pair) => (isScalar(pair.key) && isMap(pair.value) ? [{ id: String(pair.key.value), key: pair.key, map: pair.value }] : [])) : [];
    const values = isMapping(fields.points) ? fields.points : {};

    // ---- the form across keys: a block's recommendation, and the comments that each status has had
    for (const point of written) {
      const value = values[point.id];
      if (!isMapping(value)) continue;
      if (value.severity === 'block' && value.recommendation === undefined)
        told(
          error(file, keyPosition(yaml, point.map, 'severity'), 'review-status', `The point ${quote(point.id)} is a block and has no recommendation.`, 'The reviewer adds `recommendation`: what must be true of the change for the point to close, or a question for the person.'),
          'points',
        );
      const status = typeof value.status === 'string' ? value.status : 'open';
      const comments = Array.isArray(value.comments) ? value.comments.length : 0;
      const needed = COMMENTS_NEEDED[status] ?? 0;
      if (comments < needed) {
        // Two at most are needed, so a point short of them has none, or one of two.
        const has = comments === 0 ? 'has no comment' : 'has one comment, of the two it needs';
        told(error(file, keyPosition(yaml, point.map, 'status'), 'review-status', `The point ${quote(point.id)} is ${quote(status)} and ${has}.`, NEXT_LINE[status]?.[comments] ?? 'Add the comment that the status needs.'), 'points');
      }
    }
    // A decided change is history: what its review names may be gone, and its reading is over.
    if (decided) continue;

    // ---- the review alone: how many points, and how long a point has gone on
    const thirteenth = written[POINTS_MAX];
    if (thirteenth !== undefined)
      told(warning(file, yaml.at(thirteenth.key), 'review-many', `The review has ${written.length} points. Keep to ${POINTS_MAX}: a dozen are answered, a longer list is not.`, 'Keep the points that must be answered, and join two that say one fault.'), 'points');
    for (const point of written) {
      const value = values[point.id];
      // A settled point has gone to the person already; no line of it is taken out.
      if (!isMapping(value) || value.status === 'settled' || !Array.isArray(value.comments) || value.comments.length <= COMMENTS_MAX) continue;
      const list = point.map.get('comments', true);
      const at: Position = isSeq(list) ? yaml.at(list.items[COMMENTS_MAX]) : keyPosition(yaml, point.map, 'comments');
      told(
        warning(file, at, 'review-thread', `The point ${quote(point.id)} has ${value.comments.length} comments. After four, a point goes to the person.`, 'Ask the person to settle it, and write their word as its last comment with `status: settled`.'),
        'points',
      );
    }

    // ---- against the change: what each address names, and whether the change is as it was read
    if (change === undefined) continue;
    const add = isMapping(change.fields.add) ? change.fields.add : {};
    const update = isMapping(change.fields.update) ? change.fields.update : {};
    const paths = [...today.keys(), ...Object.keys(add)];
    for (const point of written) {
      const about = point.map.get('about', true);
      if (!isSeq(about)) continue;
      const words = `\`about\` of the point ${quote(point.id)}`;
      about.items.forEach((item) => {
        const address = isScalar(item) ? String(item.value) : '';
        if (address === 'need' || !address.includes('/')) return;
        const hash = address.indexOf('#');
        const path = hash < 0 ? address : address.slice(0, hash);
        const after = hash < 0 ? '' : address.slice(hash);
        const folder = path.slice(0, path.indexOf('/'));
        const id = path.slice(folder.length + 1);
        const at = yaml.at(item);
        if (!today.has(path) && !Object.hasOwn(add, path)) {
          const elsewhere = paths.find((other) => other.slice(other.indexOf('/') + 1) === id);
          if (elsewhere !== undefined) {
            told(error(file, at, 'reference-unknown', `${words} names ${quote(address)}, but no record has that path, neither today nor with the change: ${quote(id)} is in ${quote(elsewhere.slice(0, elsewhere.indexOf('/')))}.`, `Write ${quote(`${elsewhere}${after}`)}.`), 'points');
            return;
          }
          const close = nearest(id, paths.filter((other) => other.startsWith(`${folder}/`)).map((other) => other.slice(folder.length + 1)));
          const otherwise = 'name a record that is there, or one the change adds, or take the address out.';
          told(
            error(
              file,
              at,
              'reference-unknown',
              `${words} names ${quote(address)}, but no record has that id, neither today nor with the change.${close !== undefined ? ` The nearest id is ${quote(close)}.` : ''}`,
              close !== undefined ? `If ${quote(close)} was meant, write ${quote(`${folder}/${close}${after}`)} instead. Otherwise ${otherwise}` : capital(otherwise),
            ),
            'points',
          );
          return;
        }
        if (hash < 0) return;
        // A step: the flow's steps today and those the change gives it. A flow that does not read today has steps nobody knows, and only the change's are sure.
        const step = address.slice(hash + 1);
        const live = today.get(path);
        const steps = new Set([...(live?.ok === true ? stepIds(live.fields.steps) : []), ...(isMapping(add[path]) ? stepIds(add[path].steps) : []), ...(isMapping(update[path]) ? stepIds(update[path].steps) : [])]);
        if (steps.has(step) || (live !== undefined && !live.ok)) return;
        const close = nearest(step, [...steps]);
        const otherwise = 'name a step that the flow has, or one the change gives it, or take the address out.';
        told(
          error(
            file,
            at,
            'reference-unknown',
            `${words} names the step ${quote(step)} of ${quote(path)}, but the flow has no step with that id, neither today nor with the change.${close !== undefined ? ` The nearest is ${quote(close)}.` : ''}`,
            close !== undefined ? `If ${quote(close)} was meant, write ${quote(`${path}#${close}`)} instead. Otherwise ${otherwise}` : capital(otherwise),
          ),
          'points',
        );
      });
    }
    const mark = changeMark(change.fields);
    if (fields.read !== mark)
      told(
        warning(file, keyPosition(yaml, yaml.map, 'read'), 'review-behind', `\`read\` is ${quote(String(fields.read))}, and the change is ${quote(mark)} now: it moved after this reading.`, `Only a reading writes \`read\`: where points are \`fixed\`, the second reading reads them and writes ${quote(mark)} there; a correction leaves it as it is.`),
        'read',
      );
  }
  return problems;
}
