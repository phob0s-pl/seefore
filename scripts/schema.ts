// `npm run schema`: writes the JSON Schema of each kind and of the marker into `schema/`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schemas } from '../src/model/schema.ts';

const folder = fileURLToPath(new URL('../schema/', import.meta.url));
mkdirSync(folder, { recursive: true });
for (const [name, text] of Object.entries(schemas())) writeFileSync(folder + name, text);
