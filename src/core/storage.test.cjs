const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function storage(initial){const data=new Map(initial?[["ants-chat-state-v1",JSON.stringify(initial)]]:[]);const module={exports:{}};const context={exports:module.exports,module,require:name=>name==='react-native'?{Platform:{OS:'web'}}:name==='./types'?{defaultSettings:{baseUrl:'',chatModel:''}}:{},localStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},Promise};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('./storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return {api:module.exports,data};}
test('cold start marks unfinished runs interrupted and does not resume them',async()=>{const {api}=storage({settings:{},activeId:'a',conversations:[{id:'a',messages:[{status:'running',text:'已接收',steps:[{status:'running'}]},{status:'completed',text:'旧内容'}]}]});const restored=await api.loadSnapshot();assert.equal(restored.conversations[0].messages[0].status,'interrupted');assert.match(restored.conversations[0].messages[0].text,/未自动重试/);assert.equal(restored.conversations[0].messages[0].steps[0].status,'failed');assert.equal(restored.conversations[0].messages[1].text,'旧内容');});
test('queued snapshot writes preserve latest state and browser never persists key',async()=>{const {api,data}=storage();await Promise.all([api.saveSnapshot({activeId:'first'}),api.saveSnapshot({activeId:'last'})]);await api.saveKey('private-test-key');assert.equal(JSON.parse(data.get('ants-chat-state-v1')).activeId,'last');assert.equal(data.size,1);assert.equal(await api.loadKey(),'');});
test('malformed saved conversations fails visibly instead of silently erasing data',async()=>{const {api}=storage({settings:{},conversations:'bad'});await assert.rejects(api.loadSnapshot(),/本地记录格式损坏/);});
test('native key is bound to its exact provider even if settings save is interrupted',async()=>{
 let secret='';const module={exports:{}};
 const context={exports:module.exports,module,require:name=>name==='react-native'?{Platform:{OS:'android'}}:name==='expo-secure-store'?{getItemAsync:async()=>secret,setItemAsync:async(_key,value)=>{secret=value;},deleteItemAsync:async()=>{secret='';},WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device'}:{defaultSettings:{}},Promise};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('./storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 await module.exports.saveKey('fixture-private-key','https://new-provider.test/v1');
 assert.equal(await module.exports.loadKey('https://old-provider.test/v1'),'');
 assert.equal(await module.exports.loadKey('https://new-provider.test/v1'),'fixture-private-key');
 await module.exports.saveKey('','https://new-provider.test/v1');assert.equal(secret,'');
});
