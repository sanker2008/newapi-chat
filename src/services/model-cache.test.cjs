const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
let calls = 0, fail = false;
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === './newapi') return { listModels: async () => { calls++; if (fail) throw new Error('offline'); return ['model-' + calls]; } };
  return original.call(this, request, parent, main);
};
const { getModels } = require('./model-cache.ts');
test('model cache reuses and deduplicates requests, refreshes, isolates credentials, and recovers from failure', async () => {
  const settings = { baseUrl: 'https://example.test' };
  const [a, b] = await Promise.all([getModels(settings, 'test-a'), getModels(settings, 'test-a')]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  a.push('mutated');
  assert.deepEqual(await getModels(settings, 'test-a'), ['model-1']);
  await getModels(settings, 'test-a', true); assert.equal(calls, 2);
  await getModels(settings, 'test-b'); assert.equal(calls, 3);
  await getModels({ baseUrl: 'https://other.test' }, 'test-b'); assert.equal(calls, 4);
  fail = true; await assert.rejects(getModels(settings, 'test-c'), /offline/);
  fail = false; await getModels(settings, 'test-c'); assert.equal(calls, 6);
  const now = Date.now; Date.now = () => now() + 6 * 60 * 1000;
  try { await getModels(settings, 'test-c'); assert.equal(calls, 7); } finally { Date.now = now; }
});
