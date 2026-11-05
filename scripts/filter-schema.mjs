// Cuts the server's OpenAPI schema down to the public developer API. The server
// publishes one schema for every route it has, so this keeps the api/v1
// resources the SDK covers and drops the web app's and internal routes.

const PREFIX = '/api/v1/';
const RESOURCES = new Set([
  'stocks',
  'etfs',
  'regions',
  'exchanges',
  'reports',
  'usage',
  'portfolio',
]);
const SECURITY_SCHEMES = new Set(['ApiKeyAuth']);
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];

/** True for an api/v1 path whose first segment is one of the SDK's resources. */
export function isExternalPath(path) {
  if (!path.startsWith(PREFIX)) return false;
  return RESOURCES.has(path.slice(PREFIX.length).split('/')[0]);
}

/**
 * Returns a new schema with only the external paths, the components they use
 * (following `$ref`s transitively), the API key security scheme, `info`, and
 * the tags the kept operations use. The input is not changed.
 *
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>}
 */
export function filterSchema(schema) {
  const paths = {};
  for (const [path, item] of Object.entries(schema.paths ?? {})) {
    if (isExternalPath(path)) paths[path] = withKeptSecurity(item);
  }

  const result = {
    openapi: schema.openapi,
    info: structuredClone(schema.info),
    paths,
    components: keptComponents(schema.components ?? {}, paths),
  };
  if (schema.security) result.security = keptSecurity(schema.security);
  if (schema.tags) {
    const used = new Set(operations(paths).flatMap((op) => op.tags ?? []));
    result.tags = structuredClone(schema.tags.filter((t) => used.has(t.name)));
  }
  return result;
}

function operations(paths) {
  return Object.values(paths).flatMap((item) =>
    METHODS.map((method) => item[method]).filter(Boolean),
  );
}

function keptSecurity(requirements) {
  return requirements.filter((requirement) =>
    Object.keys(requirement).every((name) => SECURITY_SCHEMES.has(name)),
  );
}

function withKeptSecurity(item) {
  const copy = structuredClone(item);
  for (const op of operations({ copy })) {
    if (op.security) op.security = keptSecurity(op.security);
  }
  return copy;
}

function keptComponents(components, paths) {
  const kept = {};
  const queue = refsIn(paths);
  const seen = new Set();
  while (queue.length > 0) {
    const ref = queue.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    // '#/components/schemas/Name' → kind 'schemas', name 'Name'
    const [, , kind, name] = ref.split('/');
    const value = components[kind]?.[name];
    if (value === undefined) continue;
    kept[kind] ??= {};
    kept[kind][name] = structuredClone(value);
    queue.push(...refsIn(value));
  }

  const schemes = Object.entries(components.securitySchemes ?? {}).filter(
    ([name]) => SECURITY_SCHEMES.has(name),
  );
  if (schemes.length > 0) {
    kept.securitySchemes = structuredClone(Object.fromEntries(schemes));
  }
  return kept;
}

/** Every component reference in `value`: `$ref`s and discriminator mappings. */
function refsIn(value, found = []) {
  if (typeof value === 'string') {
    if (value.startsWith('#/components/')) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) refsIn(item, found);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) refsIn(item, found);
  }
  return found;
}
