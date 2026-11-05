// Loads the built ES module on whatever Node runs this script. CI runs it on
// every supported Node version, including ones the dev tools no longer run on.
import assert from 'node:assert/strict';

const sdk = await import('../dist/index.js');

assert.match(sdk.VERSION, /^\d+\.\d+\.\d+/);
console.log(`ESM build OK on Node ${process.versions.node}`);
