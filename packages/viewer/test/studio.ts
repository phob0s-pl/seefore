import type { View } from '@seefore/core';
import { stateOf } from './archive.ts';

/**
 * A studio whose views hold every line a legend can have, worked out by the engine as the server
 * works it out, for what each line lights and what the reading line says. The studio is there
 * only in production. An editor edits a page through an edge network and an office proxy that
 * is the studio's own and there only in the head office, and reloads a gate. The web app keeps
 * its drafts and asks and sends to the API, there only in the hosted edition, which tells it of
 * changes down a channel the web app opened. The API takes payments from an external system
 * through an HTTPS proxy that checks it, queues jobs and saves records. A worker takes the jobs,
 * shares its locks between its copies, and asks a CRM at night and reads its changes down a
 * channel the CRM opened.
 */
export const STUDIO_FILES: Readonly<Record<string, string>> = {
  'seefore.yaml': 'format: 1\nname: Studio\n',
  'people/editor.yaml': 'name: Editor\n',
  'systems/studio.yaml': 'name: Studio\nonly: in production\n',
  'systems/payments.yaml': 'name: Payments\nexternal: true\n',
  'systems/crm.yaml': 'name: CRM\n',
  'apps/web.yaml': 'name: Web\nin: studio\nkind: service\n',
  'apps/api.yaml': 'name: API\nin: studio\nkind: service\nonly: in the hosted edition\n',
  'apps/worker.yaml': 'name: Worker\nin: studio\n',
  'stores/drafts.yaml': 'name: Drafts\nin: web\nkind: files\n',
  'stores/jobs.yaml': 'name: Jobs\nin: studio\nkind: queue\n',
  'stores/records.yaml': 'name: Records\nin: studio\nkind: database\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: studio\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'infrastructure/office.yaml': 'name: Office proxy\nin: studio\nonly: in the head office\n',
  'infrastructure/edge.yaml': 'name: Edge\n',
  'technologies/https.yaml': 'name: HTTPS\n',
  'connections/editor-uses-web.yaml': 'from: editor\nto: web\nvia: [edge, office]\nname: Edits a page\ntechnology: [https]\n',
  'connections/editor-reloads-gate.yaml': 'from: editor\nto: gate\nname: Reloads it\n',
  'connections/web-keeps-drafts.yaml': 'from: web\nto: drafts\nname: Keeps drafts\n',
  'connections/web-asks-api.yaml': 'from: web\nto: api\nname: Asks for pages\n',
  'connections/web-sends-api.yaml': 'from: web\nto: api\nname: Sends edits\n',
  'connections/api-tells-web.yaml': 'from: api\nto: web\nopens: to\nname: Tells of changes\n',
  'connections/api-pays.yaml': 'from: api\nto: payments\nvia: [proxy]\nname: Takes a payment\n',
  'connections/proxy-checks-api.yaml': 'from: proxy\nto: api\nname: Checks that it answers\n',
  'connections/api-queues-jobs.yaml': 'from: api\nto: jobs\nname: Queues a job\n',
  'connections/worker-takes-jobs.yaml': 'from: worker\nto: jobs\nname: Takes a job\n',
  'connections/worker-tells-worker.yaml': 'from: worker\nto: worker\nname: Shares its locks\n',
  'connections/worker-asks-crm.yaml': 'from: worker\nto: crm\nonly: at night\nname: Asks for customers\n',
  'connections/worker-reads-crm.yaml': 'from: worker\nto: crm\nopens: to\nname: Reads changes\n',
  'connections/api-saves-records.yaml': 'from: api\nto: records\nname: Saves an edit\n',
};

/** The reading of the studio. */
export const STUDIO_STATE = stateOf(STUDIO_FILES);

/** The view of the studio's reading with this id. */
export function studioView(id: string): View {
  const found = STUDIO_STATE.views.find((view) => view.id === id);
  if (found === undefined) throw new Error(`The studio has no view ${id}.`);
  return found;
}
