// Loads the built CommonJS module on whatever Node runs this script.
const assert = require('node:assert/strict');

const sdk = require('../dist/index.cjs');

assert.match(sdk.VERSION, /^\d+\.\d+\.\d+/);

// One request through the real transport, with a stub fetch.
const toyyib = new sdk.Toyyib({
  apiKey: 'sk_test_checkdist00000000',
  fetch: async () =>
    new Response(JSON.stringify({ success: true, data: { ok: 1 } })),
});
assert.equal(toyyib.mode, 'sandbox');

toyyib.usage().then((usage) => {
  assert.deepEqual(usage, { ok: 1 });
  console.log(`CommonJS build OK on Node ${process.versions.node}`);
});
