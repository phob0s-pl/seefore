import type { Picture, View } from '@seefore/core';

/**
 * Lays out a view: a place for every box, a route for every arrow, a place and the lines of
 * every text. Not built yet.
 */
export async function layOut(view: View): Promise<Picture> {
  return { view: view.id, failed: { reason: 'crash', message: 'The layout is not built yet.' } };
}
