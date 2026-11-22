import type { Model } from './model.ts';
import type { Outline } from './picture.ts';

/** The listing of a model as a tree of ids, in the order `seefore list` prints it. Not built yet. */
export function outlineOf(_model: Model): Outline {
  return { people: [], withParts: [], others: [], connections: [], owners: [], technologies: [], loose: [] };
}
