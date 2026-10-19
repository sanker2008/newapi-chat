const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const ts = require('typescript');
// Compile only for this Node test process; production still uses Expo/Metro.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
let network;
let saved = [];
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'expo/fetch') return { fetch: (...args) => network(...args) };
  if (request === '../core/files') return {
    attachmentDataUrl: async a => a.uri.startsWith('data:') ? a.uri : 'data:image/png;base64,aGVsbG8=',
    persistRemoteImage: async input => { const image = { id: `saved-${saved.length + 1}`, name: input.name, uri: 'file://saved.png', mime: 'image/png', kind: 'image', createdAt: Date.now() }; saved.push(image); return image; },
  };
  return originalLoad.call(this, request, parent, main);
};
const { runAgent } = require('./agent.ts');
const { listModels } = require('./newapi.ts');
const { defaultSettings } = require('../core/types.ts');
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const reply = text => json({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
const call = (name, args, id = 'call1') => json({ choices: [{ message: { role: 'assistant', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
function input(extra = {}) {
  saved = [];
  const changes = { text: '', steps: [], images: [] };
  const controller = new AbortController();
  const value = {
    settings: { ...defaultSettings, baseUrl: 'https://gateway.example', chatModel: 'chat', imageModel: 'image' }, apiKey: 'test-only-placeholder',
    messages: [{ id: 'u', role: 'user', text: '生成图片后编辑它', attachments: [], createdAt: 1 }], attachments: [], mode: 'agent', signal: controller.signal,
    onText: delta => { changes.text += delta; }, onStep: step => { changes.steps.push(step); }, onImage: image => { changes.images.push(image); }, ...extra,
  };
  return { value, changes, controller };
}

test('models GET is normalized and does not invent capabilities', async () => {
  let requests = 0;
  network = async (url, options) => { requests++; assert.equal(url, 'https://gateway.example/v1/models'); assert.equal(options.method, 'GET'); return json({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }); };
  assert.deepEqual(await listModels(input().value.settings, 'placeholder'), ['a', 'b']);
  assert.equal(requests, 1);
});

test('generates then edits the actual saved attachment across model rounds', async () => {
  const run = input();
  // Old persisted settings must not force hidden output options.
  Object.assign(run.value.settings, { imageSize: '1024x1024', imageQuality: 'high' });
  let chat = 0, generations = 0, edits = 0;
  network = async (url, options) => {
    if (url.endsWith('/chat/completions')) {
      chat++;
      if (chat === 1) return call('generate_image', { prompt: 'draw a cat' });
      if (chat === 2) { assert.match(options.body, /saved-1/); return call('edit_image', { imageId: 'saved-1', prompt: 'make it blue' }, 'call2'); }
      assert.match(options.body, /saved-2/); return reply('完成');
    }
    if (url.endsWith('/images/generations')) { generations++; const body = JSON.parse(options.body); assert.equal(body.size, undefined); assert.equal(body.quality, undefined); return json({ data: [{ b64_json: 'aGVsbG8=' }] }); }
    if (url.endsWith('/images/edits')) { edits++; assert.ok(options.body instanceof FormData); assert.equal(options.body.has('size'), false); assert.equal(options.body.has('quality'), false); return json({ data: [{ b64_json: 'aGVsbG8=' }] }); }
    throw new Error(url);
  };
  run.value.settings.imageEditingEnabled = true;
  await runAgent(run.value);
  assert.equal(chat, 3); assert.equal(generations, 1); assert.equal(edits, 1);
  assert.equal(run.changes.images[1].parentId, 'saved-1');
  assert.equal(run.changes.text, '完成');
  assert.equal(run.changes.steps.filter(s => s.status === 'completed').length, 5);
});

test('does not dispatch a tool before the last SSE argument fragment and finish event', async () => {
  const run = input(); let chat = 0, image = 0;
  network = async (url) => {
    if (url.endsWith('/images/generations')) { image++; return json({ data: [{ b64_json: 'abc' }] }); }
    if (++chat > 1) return reply('已完成');
    const events = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 's1', function: { name: 'generate_image', arguments: '{"prompt":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"cat"}' } }] }, finish_reason: 'tool_calls' }] },
    ];
    return new Response(new ReadableStream({ pull(controller) { assert.equal(image, 0); if (events.length) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(events.shift())}\n\n`)); else { controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); } } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  await runAgent(run.value); assert.equal(image, 1);
});

test('a disconnected image request is sent once and ends the run', async () => {
  const run = input({ mode: 'image' }); let requests = 0;
  network = async () => { requests++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(runAgent(run.value), /结果未知.*未自动重发/);
  assert.equal(requests, 1); assert.equal(saved.length, 0);
});

test('two image attempts block the third POST', async () => {
  const run = input(); let chat = 0, images = 0;
  network = async url => {
    if (url.endsWith('/images/generations')) { images++; return json({ data: [{ b64_json: 'abc' }] }); }
    return call('generate_image', { prompt: 'cat' }, `c${++chat}`);
  };
  await assert.rejects(runAgent(run.value), /2 次绘图/);
  assert.equal(images, 2); assert.equal(chat, 3);
});

test('model budget includes Responses search calls and final round has no tools', async () => {
  const doc = { id: 'doc', name: 'a.txt', kind: 'document', mime: 'text/plain', uri: 'file://a', text: 'hello', createdAt: 1 };
  const run = input({ attachments: [doc] }); Object.assign(run.value.settings, { searchEnabled: true, searchModel: 'network-model' });
  let chats = 0, searches = 0;
  network = async (url, options) => {
    if (url.endsWith('/responses')) { searches++; return json({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', content: [{ type: 'output_text', text: 'search result', annotations: [] }] }] }); }
    chats++;
    if (chats === 5) { assert.equal(JSON.parse(options.body).tools, undefined); return reply('已有结果'); }
    if (chats === 4) { assert.ok(!JSON.parse(options.body).tools.some(tool => tool.function.name === 'search_web')); return call('read_document', { attachmentId: 'doc' }, 'final-document'); }
    return call('search_web', { query: 'news' }, `c${chats}`);
  };
  await runAgent(run.value);
  assert.equal(chats + searches, 8);
  assert.equal(run.changes.text, '已有结果');
});

test('eight chat-only rounds reserve the last request for a summary', async () => {
  const doc = { id: 'doc', name: 'a.txt', kind: 'document', mime: 'text/plain', uri: 'file://a', text: 'hello', createdAt: 1 };
  const run = input({ attachments: [doc] }); let count = 0;
  network = async (url, options) => {
    count++;
    if (count === 8) { assert.equal(JSON.parse(options.body).tools, undefined); return reply('总结'); }
    return call('read_document', { attachmentId: 'doc' }, `c${count}`);
  };
  await runAgent(run.value); assert.equal(count, 8); assert.equal(run.changes.text, '总结');
});

test('search refuses an ordinary answer without a completed web_search call', async () => {
  const run = input(); Object.assign(run.value.settings, { searchEnabled: true, searchModel: 'search' }); let count = 0;
  network = async url => { count++; return url.endsWith('/responses') ? json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I searched the web' }] }] }) : call('search_web', { query: 'news' }); };
  await assert.rejects(runAgent(run.value), /无法确认真实联网/); assert.equal(count, 2);
});

test('unlisted attachment cannot be edited or uploaded', async () => {
  const run = input(); run.value.settings.imageEditingEnabled = true; let count = 0;
  network = async () => { count++; return call('edit_image', { imageId: 'file:///private', prompt: 'cat' }); };
  await assert.rejects(runAgent(run.value), /白名单/); assert.equal(count, 1);
});

test('cancellation after text prevents next tool and preserves partial text once', async () => {
  const run = input(); let requests = 0;
  run.value.onText = delta => { run.changes.text += delta; run.controller.abort(); };
  network = async () => { requests++; return new Response('data: {"choices":[{"delta":{"content":"半段"}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"cat\\"}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }); };
  await assert.rejects(runAgent(run.value), { name: 'AbortError' }); assert.equal(requests, 1); assert.equal(run.changes.text, '半段');
});

test('API rejection hides the key and never automatically retries', async () => {
  const run = input(); let requests = 0;
  network = async () => { requests++; return new Response(JSON.stringify({ error: { message: `invalid ${run.value.apiKey}` } }), { status: 401 }); };
  await assert.rejects(runAgent(run.value), error => !error.message.includes(run.value.apiKey) && /401/.test(error.message));
  assert.equal(requests, 1);
});

test('mask capability does not force a mask for an ordinary edit', async () => {
  const source = { id: 'source', name: 'source.png', kind: 'image', uri: 'file://source.png', mime: 'image/png', width: 20, height: 20, createdAt: 1 };
  const run = input({ mode: 'image', attachments: [source] }); Object.assign(run.value.settings, { maskEnabled: true, imageEditingEnabled: true });
  let requests = 0;
  network = async (url, options) => { requests++; assert.ok(url.endsWith('/images/edits')); assert.equal(options.body.has('mask'), false); return json({ data: [{ b64_json: 'abc' }] }); };
  await runAgent(run.value); assert.equal(requests, 1);
});

test('a mask is uploaded only for its exact source and matching dimensions', async () => {
  const source = { id: 'source', name: 'source.png', kind: 'image', uri: 'file://source.png', mime: 'image/png', width: 20, height: 20, createdAt: 1 };
  const mask = { ...source, id: 'mask', parentId: 'different', name: 'mask.png' };
  const run = input({ mode: 'image', attachments: [source], mask }); Object.assign(run.value.settings, { maskEnabled: true, imageEditingEnabled: true });
  let requests = 0; network = async () => { requests++; return json({ data: [{ b64_json: 'abc' }] }); };
  await assert.rejects(runAgent(run.value), /蒙版与本次原图/); assert.equal(requests, 0);
  mask.parentId = 'source'; mask.width = 10;
  await assert.rejects(runAgent(run.value), /尺寸与原图/); assert.equal(requests, 0);
  mask.width = 20;
  network = async (url, options) => { requests++; assert.equal(options.body.has('mask'), true); return json({ data: [{ b64_json: 'abc' }] }); };
  await runAgent(run.value); assert.equal(requests, 1);
});

test('duplicate completed tool ID is not billed again', async () => {
  const run = input(); let images = 0;
  network = async url => { if (url.endsWith('/images/generations')) { images++; return json({ data: [{ b64_json: 'abc' }] }); } return call('generate_image', { prompt: 'cat' }, 'duplicate'); };
  await assert.rejects(runAgent(run.value), /重复工具调用 ID/); assert.equal(images, 1);
});
