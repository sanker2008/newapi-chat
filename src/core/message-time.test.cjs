const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { formatMessageTime } = require('./message-time.ts');

test('message time uses local calendar day and includes dates across midnight and years', () => {
  const now = new Date(2026, 9, 21, 0, 5);
  assert.equal(formatMessageTime(new Date(2026, 9, 21, 0, 1).getTime(), now), '00:01');
  assert.equal(formatMessageTime(new Date(2026, 9, 20, 23, 59).getTime(), now), '2026-10-20 23:59');
  assert.equal(formatMessageTime(new Date(2025, 9, 21, 9, 7).getTime(), now), '2025-10-21 09:07');
  assert.equal(formatMessageTime(NaN, now), '');
});
