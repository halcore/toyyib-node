// Refreshes openapi/schema.json and src/generated/schema.d.ts.
//
//   npm run generate
//   TOYYIB_SCHEMA_URL=file:///path/to/schema.json npm run generate
//
// TOYYIB_SCHEMA_URL defaults to the live API's schema.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { filterSchema } from './filter-schema.mjs';

const source =
  process.env.TOYYIB_SCHEMA_URL ?? 'https://api.toyyib.app/api/v1/schema/';
const schemaFile = new URL('../openapi/schema.json', import.meta.url);
const typesFile = new URL('../src/generated/schema.d.ts', import.meta.url);

async function load(location) {
  if (location.startsWith('file://')) {
    return JSON.parse(await readFile(new URL(location), 'utf8'));
  }
  const url = new URL(location);
  url.searchParams.set('format', 'json');
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GET ${url} gave HTTP ${response.status}`);
  return response.json();
}

/** Sorts object keys at every level, so the snapshot only changes when the API does. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

const schema = sortKeys(filterSchema(await load(source)));
await mkdir(new URL('.', schemaFile), { recursive: true });
await writeFile(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);
console.log(
  `Wrote ${fileURLToPath(schemaFile)} (${Object.keys(schema.paths).length} paths)`,
);

execFileSync(
  'npx',
  [
    '--no',
    'openapi-typescript',
    fileURLToPath(schemaFile),
    '-o',
    fileURLToPath(typesFile),
  ],
  { stdio: 'inherit' },
);
