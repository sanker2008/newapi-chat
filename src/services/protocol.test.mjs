import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStream, ChatAccumulator, publicWebUrl, extractPage, apiUrl, parseToolArguments } from './protocol.ts';

test('SSE handles chunk splits, CRLF, comments and multiline data', () => {
  const values = [];
  const stream = new EventStream(value => values.push(value));
  stream.push(': ping\r\nda');
  stream.push('ta: {"a":\r\ndata: 1}\r');
  stream.push('\n\r\ndata: [DONE]\n\n');
  assert.deepEqual(values, ['{"a":\n1}', '[DONE]']);
});

test('tool arguments execute only after complete finish and assemble split deltas', () => {
  const chat = new ChatAccumulator();
  chat.accept({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'edit_', arguments: '{"imageId":' } }] } }] });
  assert.throws(() => chat.result(), /中断/);
  chat.accept({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'image', arguments: '"image-1"}' } }] }, finish_reason: 'tool_calls' }] });
  const result = chat.result();
  assert.equal(result.calls[0].function.name, 'edit_image');
  assert.deepEqual(parseToolArguments(result.calls[0].function.arguments), { imageId: 'image-1' });
});

test('invalid arguments and incomplete tool streams cannot execute', () => {
  assert.throws(() => parseToolArguments('{"prompt":'), /JSON/);
  assert.throws(() => parseToolArguments('[]'), /对象/);
  const chat = new ChatAccumulator();
  chat.accept({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'generate_image', arguments: '{}' } }] }, finish_reason: 'length' }] });
  assert.throws(() => chat.result(), /截断/);
});

test('web URLs block private, credentials, unusual ports and encoded local addresses', () => {
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1', 'http://2130706433', 'http://10.1.2.3', 'http://169.254.169.254', 'http://192.168.1.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'https://user:pass@example.com', 'https://host.local', 'https://example.com:8443']) {
    assert.throws(() => publicWebUrl(url), undefined, url);
  }
  assert.equal(publicWebUrl('https://example.com/a#b'), 'https://example.com/a');
});

test('HTML extracts text without executing scripts and keeps source/title', () => {
  const page = extractPage('<title>A &amp; B</title><script>steal()</script><main><h1>Hello</h1><p>world &lt;safe&gt;</p></main>', 'https://example.com');
  assert.equal(page.title, 'A & B');
  assert.match(page.text, /Hello/);
  assert.doesNotMatch(page.text, /steal/);
  assert.equal(page.url, 'https://example.com');
});

test('gateway path is normalized once and URL credentials/query are rejected', () => {
  assert.equal(apiUrl('https://example.com/v1/', 'models'), 'https://example.com/v1/models');
  assert.equal(apiUrl('https://example.com/gateway', 'models'), 'https://example.com/gateway/v1/models');
  assert.throws(() => apiUrl('https://example.com?key=secret', 'models'));
});
