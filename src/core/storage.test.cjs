const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function storage(initial){
 const legacy=new Map(initial?[["ants-chat-state-v1",JSON.stringify(initial)]]:[]);
 const data=new Map(); let fail=false;
 const database={createObjectStore(){},transaction(){
   const tx={error:null,objectStore:()=>({get(key){const request={};queueMicrotask(()=>{request.result=data.get(key);tx.oncomplete?.();});return request;},put(value,key){const request={};queueMicrotask(()=>{if(fail){tx.error=new Error('quota');tx.onabort?.();}else{data.set(key,value);tx.oncomplete?.();}});return request;}})};
   return tx;
 }};
 const indexedDB={open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}};
 const module={exports:{}};
 const context={exports:module.exports,module,require:name=>name==='react-native'?{Platform:{OS:'web'}}:name==='./types'?{defaultSettings:{baseUrl:'',chatModel:''}}:{},indexedDB,localStorage:{getItem:key=>legacy.get(key)||null,setItem(){throw new Error('localStorage quota exceeded');}},Promise};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('./storage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {api:module.exports,data,legacy,setFail:value=>{fail=value;}};
}

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

test('large image snapshots bypass localStorage and can be read back',async()=>{
 const {api,data}=storage();const uri='data:image/png;base64,'+'a'.repeat(8*1024*1024);
 await api.saveSnapshot({settings:{},activeId:'large',conversations:[{id:'large',messages:[{text:'image',attachments:[{uri}]}]}]});
 assert.ok(data.get('ants-chat-state-v1').length>8*1024*1024);
 assert.equal((await api.loadSnapshot()).conversations[0].messages[0].attachments[0].uri,uri);
});
test('migration retains legacy backup and newer database wins',async()=>{
 const original={settings:{},activeId:'old',conversations:[]};const {api,data,legacy}=storage(original);
 await api.loadSnapshot();assert.equal(JSON.parse(data.get('ants-chat-state-v1')).activeId,'old');
 await api.saveSnapshot({...original,activeId:'new'});
 assert.equal((await api.loadSnapshot()).activeId,'new');assert.equal(JSON.parse(legacy.get('ants-chat-state-v1')).activeId,'old');
});
test('aborted writes reject and next queued save recovers',async()=>{
 const {api,data,setFail}=storage();setFail(true);
 await assert.rejects(api.saveSnapshot({activeId:'failed'}),/quota/);assert.equal(data.size,0);
 setFail(false);await api.saveSnapshot({activeId:'recovered'});assert.equal(JSON.parse(data.get('ants-chat-state-v1')).activeId,'recovered');
});
