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

test('large coalesced network chunks are framed before per-event limits', () => {
  let count = 0;
  const stream = new EventStream(() => count++);
  const event = 'data: ' + 'x'.repeat(1000) + '\n\n';
  const payload = event.repeat(3000);
  assert.ok(payload.length > 2_000_000);
  stream.push(payload.slice(0, 4));
  stream.push(payload.slice(4));
  stream.finish();
  assert.equal(count, 3000);
});
test('individual oversized and fragmented events remain bounded', () => {
  const create = () => new EventStream(() => assert.fail('oversized event emitted'), 2_000_000);
  assert.throws(() => create().push('data: ' + 'x'.repeat(2_000_001) + '\n\n'), /限制/);
  const partial = create(); partial.push('data: ' + 'x'.repeat(1_000_000));
  assert.throws(() => partial.push('x'.repeat(1_000_001)), /限制/);
  const multiline = create(); multiline.push('data: ' + 'x'.repeat(1_000_000) + '\n');
  assert.throws(() => multiline.push('data: ' + 'x'.repeat(1_000_000) + '\n\n'), /限制/);
});

test('SSE supports CR-only and every split of mixed line endings', () => {
 const payload=': ping\rdata: first\r\rdata: second\r\n\r\ndata: third\n\ndata: [DONE]\r\r';
 for(let split=0;split<=payload.length;split++){
  const values=[];const stream=new EventStream(value=>values.push(value));
  stream.push(payload.slice(0,split));stream.push(payload.slice(split));stream.finish();
  assert.deepEqual(values,['first','second','third','[DONE]']);
 }
});
test('large metadata event is accepted but text and tool limits still apply', () => {
 const chat=new ChatAccumulator();const stream=new EventStream(value=>chat.accept(JSON.parse(value)));
 const json=JSON.stringify({choices:[{delta:{reasoning_content:'x'.repeat(3_000_000),content:'完成'},finish_reason:'stop'}]});
 const payload='data: '+json+'\n\n';
 for(let i=0;i<payload.length;i+=65536)stream.push(payload.slice(i,i+65536));
 stream.finish();assert.equal(chat.result().text,'完成');
 assert.throws(()=>new ChatAccumulator().accept({choices:[{delta:{content:'x'.repeat(2_000_001)}}]}),/模型输出过长/);
 assert.throws(()=>new ChatAccumulator().accept({choices:[{delta:{tool_calls:[{index:0,function:{arguments:'x'.repeat(100_001)}}]}}]}),/工具参数过长/);
});
