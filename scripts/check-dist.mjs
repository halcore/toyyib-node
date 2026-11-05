// Loads the built ES module on whatever Node runs this script. CI runs it on
// every supported Node version, including ones the dev tools no longer run on.
import assert from 'node:assert/strict';

const sdk = await import('../dist/index.js');

assert.match(sdk.VERSION, /^\d+\.\d+\.\d+/);

// One request through the real transport, with a stub fetch.
const toyyib = new sdk.Toyyib({
  apiKey: 'sk_test_checkdist00000000',
  fetch: async () =>
    new Response(JSON.stringify({ success: true, data: { ok: 1 } })),
});
assert.equal(toyyib.mode, 'sandbox');
assert.deepEqual(await toyyib.usage(), { ok: 1 });

console.log(`ESM build OK on Node ${process.versions.node}`);
