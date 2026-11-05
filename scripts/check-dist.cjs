// Loads the built CommonJS module on whatever Node runs this script.
const assert = require('node:assert/strict');

const sdk = require('../dist/index.cjs');

assert.match(sdk.VERSION, /^\d+\.\d+\.\d+/);
console.log(`CommonJS build OK on Node ${process.versions.node}`);
