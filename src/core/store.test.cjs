const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real provider and its lifecycle listener with a pending paid request.
async function harness() {
  const slots = [], effects = [], writes = [];
  let cursor = 0, mounted = false, listener, value, request, finish, calls = 0;
  const settings = { baseUrl: 'https://example.com', imageModel: 'test-image' };
  const snapshot = { settings, conversations: [], activeId: null };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_type, props) => { value = props.value; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef: initial => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect: fn => { if (!mounted) effects.push(fn); },
  };
  const module = { exports: {} };
  let id = 0;
  const imports = {
    react,
    'react-native': { AppState: { addEventListener: (_event, fn) => { listener = fn; return { remove() {} }; } } },
    './types': { defaultSettings: settings, uid: () => String(++id) },
    './storage': { loadSnapshot: async () => snapshot, loadKey: async () => 'mock-key', saveSnapshot: async s => writes.push(JSON.parse(JSON.stringify(s))) },
    './files': { clearAttachmentFiles: async () => {} },
    '../services/agent': { runAgent: args => { calls++; request = args; return new Promise(resolve => { finish = resolve; }); } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('./store.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, { module, exports: module.exports, require: n => imports[n], AbortController, setTimeout: () => 1, clearTimeout() {} });
  const render = () => { cursor = 0; module.exports.AppProvider({ children: null }); mounted = true; };
  render(); effects.forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve)); render();
  return { render, get app() { return value; }, change: state => listener(state), get request() { return request; }, finish: () => finish(), get calls() { return calls; }, writes };
}

for (const returnToForeground of [false, true]) test(`pending image survives background, foreground=${returnToForeground}`, async () => {
  const h = await harness();
  const pending = h.app.send('draw a test image', 'image');
  await new Promise(resolve => setImmediate(resolve));
  h.change('inactive'); h.change('background');
  assert.equal(h.request.signal.aborted, false);
  assert.equal(h.writes.at(-1).conversations[0].messages.at(-1).status, 'running');
  if (returnToForeground) h.change('active');
  h.request.onImage({ id: 'image', kind: 'image', uri: 'file:///mock.png', createdAt: 1 });
  h.finish(); await pending; h.render();
  assert.equal(h.calls, 1);
  assert.equal(h.app.conversations[0].messages.at(-1).status, 'completed');
  assert.equal(h.writes.at(-1).conversations[0].messages.at(-1).attachments.length, 1);
});

test('manual stop still cancels without resubmission after background transition', async () => {
  const h = await harness(); const pending = h.app.send('draw', 'image');
  await new Promise(resolve => setImmediate(resolve));
  h.change('background'); h.change('active'); h.app.stop();
  assert.equal(h.request.signal.aborted, true);
  h.finish(); await pending; h.render();
  assert.equal(h.calls, 1);
  assert.equal(h.app.conversations[0].messages.at(-1).status, 'cancelled');
});

test('history editing requires cancellation to finish and replaces draft attachments', async () => {
  const h = await harness();
  h.app.addAttachment({ id: 'original', kind: 'image', uri: 'file:///original.png' });
  h.render();
  const pending = h.app.send('original prompt', 'image');
  await new Promise(resolve => setImmediate(resolve)); h.render();
  const id = h.app.conversations[0].messages[0].id;
  assert.throws(() => h.app.restoreMessageDraft(id), /先停止当前任务/);
  h.app.stop();
  assert.throws(() => h.app.restoreMessageDraft(id), /等待停止完成/);
  h.finish(); await pending; h.render();
  h.app.addAttachment({ id: 'unrelated', kind: 'image', uri: 'file:///other.png' });
  h.render();
  assert.equal(h.app.restoreMessageDraft(id), 'original prompt'); h.render();
  assert.equal(h.app.draftAttachments.length, 1);
  assert.equal(h.app.draftAttachments[0].id, 'original');
  assert.equal(h.calls, 1);
  assert.equal(h.app.conversations[0].messages.length, 2);
});

test('branch copies context through selected reply without resubmission or duplicate gallery images', async () => {
  const h = await harness();
  let pending = h.app.send('first', 'image');
  await new Promise(resolve => setImmediate(resolve)); h.render();
  const firstReply = h.app.conversations[0].messages[1].id;
  await assert.rejects(h.app.branchFromMessage(firstReply), /先停止当前任务/);
  h.request.onImage({ id: 'shared-image', kind: 'image', uri: 'file:///shared.png', createdAt: 1 });
  h.finish(); await pending; h.render();
  const originalId = h.app.activeId;
  pending = h.app.send('later message', 'image');
  await new Promise(resolve => setImmediate(resolve));
  h.request.onText('later response'); h.finish(); await pending; h.render();
  await h.app.branchFromMessage(firstReply); h.render();
  const branch = h.app.conversations.find(c => c.id === h.app.activeId);
  const original = h.app.conversations.find(c => c.id === originalId);
  assert.notEqual(branch.id, originalId);
  assert.equal(branch.messages.length, 2);
  assert.equal(original.messages.length, 4);
  assert.notEqual(branch.messages[1].id, firstReply);
  assert.notEqual(branch.messages[1].attachments[0], original.messages[1].attachments[0]);
  assert.equal(branch.messages[1].attachments[0].uri, 'file:///shared.png');
  assert.equal(h.app.artworks.length, 1);
  assert.equal(h.calls, 2);
  assert.equal(h.writes.at(-1).activeId, branch.id);
  h.app.deleteConversation(originalId); h.render();
  assert.equal(h.app.conversations[0].messages[1].attachments[0].uri, 'file:///shared.png');
  await assert.rejects(h.app.branchFromMessage('missing'), /找不到/);
});

test('regenerate uses original input and mode, preserves reply and unsent attachments, rejects stale clicks', async () => {
 const h=await harness();h.app.addAttachment({id:'source',kind:'image',uri:'file:///source.png'});h.render();
 let pending=h.app.send('original prompt','image');await new Promise(resolve=>setImmediate(resolve));
 h.request.onText('original answer');h.finish();await pending;h.render();
 const reply=h.app.conversations[0].messages.at(-1).id;
 h.app.addAttachment({id:'draft',kind:'image',uri:'file:///draft.png'});h.render();
 pending=h.app.regenerate(reply,'chat');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.request.mode,'image');assert.equal(h.request.messages.length,1);
 assert.equal(h.request.messages[0].text,'original prompt');assert.equal(h.request.attachments[0].id,'source');
 await assert.rejects(h.app.regenerate(reply,'chat'),/最新/);assert.equal(h.calls,2);
 h.request.onText('new answer');h.finish();await pending;h.render();
 assert.equal(h.app.conversations[0].messages.length,3);assert.equal(h.app.conversations[0].messages[1].text,'original answer');
 assert.equal(h.app.conversations[0].messages[2].text,'new answer');assert.equal(h.app.draftAttachments[0].id,'draft');
 await assert.rejects(h.app.regenerate(reply,'image'),/最新/);
});
