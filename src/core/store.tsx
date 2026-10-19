import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Attachment, Conversation, Message, ProviderSettings, defaultSettings, uid } from './types';
import { loadKey, loadSnapshot, saveKey, saveSnapshot } from './storage';
import { clearAttachmentFiles } from './files';
import { runAgent } from '../services/agent';

type AppContextValue = {
  ready: boolean; error: string | null; settings: ProviderSettings; apiKey: string; conversations: Conversation[]; activeId: string | null;
  artworks: Attachment[]; running: boolean; draftAttachments: Attachment[]; mask: Attachment | null;
  saveSettings: (settings:ProviderSettings,key:string)=>Promise<void>; selectConversation:(id:string)=>void; newConversation:()=>void;
  deleteConversation:(id:string)=>void; renameConversation:(id:string,title:string)=>void; send:(text:string,mode:'agent'|'chat'|'image')=>Promise<void>;
  stop:()=>void; addAttachment:(a:Attachment)=>void; removeAttachment:(id:string)=>void; setMask:(a:Attachment|null)=>void; clearHistory:()=>Promise<void>;
};
const Context=createContext<AppContextValue|null>(null);
export function AppProvider({children}:{children:React.ReactNode}) {
  const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null);
  const [settings,setSettings]=useState(defaultSettings),[apiKey,setApiKey]=useState('');
  const [conversations,setConversations]=useState<Conversation[]>([]),[activeId,setActiveId]=useState<string|null>(null);
  const [draftAttachments,setDraftAttachments]=useState<Attachment[]>([]),[mask,setMask]=useState<Attachment|null>(null),[running,setRunning]=useState(false);
  const state=useRef({settings,conversations,activeId}); state.current={settings,conversations,activeId};
  const control=useRef<AbortController|null>(null), timer=useRef<ReturnType<typeof setTimeout>|null>(null), background=useRef(false);
  const hydrated=useRef(false),maintenance=useRef(false);
  const persist=async()=>{if(!hydrated.current||maintenance.current)return;try {await saveSnapshot(state.current);}catch(e){setError(`记录保存失败：${e instanceof Error?e.message:'存储不可用'}`);}};
  useEffect(()=>{let mounted=true; (async()=>{try {const snapshot=await loadSnapshot();const key=await loadKey(snapshot.settings.baseUrl);if(!mounted)return;state.current=snapshot;setSettings(snapshot.settings);setConversations(snapshot.conversations);setActiveId(snapshot.activeId);setApiKey(key);hydrated.current=true;setReady(true);}catch(e){if(mounted)setError(`无法读取本地数据：${e instanceof Error?e.message:'未知错误'}`);}})();return()=>{mounted=false;hydrated.current=false;control.current?.abort();};},[]);
  useEffect(()=>{if(!ready||timer.current)return;timer.current=setTimeout(()=>{timer.current=null;void persist();},350);},[settings,conversations,activeId,ready]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',next=>{if(next==='background'){background.current=true;control.current?.abort();void persist();}else if(next==='active'){background.current=false;}});return()=>subscription.remove();},[]);

  function updateConversation(id:string,change:(c:Conversation)=>Conversation) {
    const next=state.current.conversations.map(c=>c.id===id?change(c):c);
    state.current={...state.current,conversations:next};setConversations(next);
  }
  async function send(text:string,mode:'agent'|'chat'|'image') {
    if(maintenance.current||!hydrated.current)throw new Error('正在处理本机数据，请稍后再发送');
    if(control.current) return;
    if(!text.trim()) throw new Error('请先输入你的要求');
    if(!settings.baseUrl||!apiKey) throw new Error('请先在设置中填写 New API 地址和 Key');
    if(mode==='image'?!settings.imageModel:!settings.chatModel) throw new Error('请先在设置中选择对应模型');
    if(mask && !settings.maskEnabled) throw new Error('请先验证模型并开启蒙版编辑能力');
    const controller=new AbortController(); control.current=controller;setRunning(true);setError(null);
    const existing=conversations.find(c=>c.id===activeId); const conversationId=existing?.id||uid();
    const user:Message={id:uid(),role:'user',text:text.trim(),attachments:[...draftAttachments],createdAt:Date.now()};
    const assistant:Message={id:uid(),role:'assistant',text:'',attachments:[],steps:[],status:'running',createdAt:Date.now()};
    const history=[...(existing?.messages||[]),user];
    const created:Conversation={id:conversationId,title:existing?.title||text.trim().slice(0,28),messages:[...history,assistant],updatedAt:Date.now()};
    const next=existing?state.current.conversations.map(c=>c.id===conversationId?created:c):[created,...state.current.conversations];
    state.current={...state.current,conversations:next,activeId:conversationId};setConversations(next);
    setActiveId(conversationId);setDraftAttachments([]); const currentMask=mask;setMask(null);
    const update=(change:(m:Message)=>Message)=>updateConversation(conversationId,c=>({...c,updatedAt:Date.now(),messages:c.messages.map(m=>m.id===assistant.id?change(m):m)}));
    try {
      await saveSnapshot(state.current);
      await runAgent({settings,apiKey,messages:history,attachments:user.attachments,mask:currentMask||undefined,mode,signal:controller.signal,
        onText:delta=>{if(!controller.signal.aborted)update(m=>({...m,text:m.text+delta}));},
        onStep:step=>{if(!controller.signal.aborted)update(m=>({...m,steps:[...(m.steps||[]).filter(s=>s.id!==step.id),step]}));},
        onImage:image=>{if(!controller.signal.aborted)update(m=>({...m,attachments:[...m.attachments,image]}));},
        onUsage:usage=>update(m=>({...m,usage}))});
      if(controller.signal.aborted) throw new Error('已停止');
      update(m=>({...m,status:'completed'}));
    }catch(e){
      const cancelled=controller.signal.aborted;
      const reason=cancelled?(background.current?'应用进入后台，任务已中断；上游结果待确认。':'已停止等待，上游任务和费用可能仍在继续。'):(e instanceof Error?e.message:'请求失败，请检查网络和模型配置');
      update(m=>({...m,status:cancelled?(background.current?'interrupted':'cancelled'):'failed',text:`${m.text}${m.text?'\n\n':''}${reason}`,steps:m.steps?.map(s=>s.status==='running'?{...s,status:'failed',detail:reason}:s)}));
    }finally {if(control.current===controller){control.current=null;setRunning(false);}await persist();}
  }
  const artworks=conversations.flatMap(c=>c.messages.filter(m=>m.role==='assistant').flatMap(m=>m.attachments.filter(a=>a.kind==='image'))).sort((a,b)=>b.createdAt-a.createdAt);
  const value:AppContextValue={ready,error,settings,apiKey,conversations,activeId,artworks,running,draftAttachments,mask,send,
    stop:()=>control.current?.abort(),
    saveSettings:async(next,key)=>{if(control.current||maintenance.current)throw new Error('请先等待当前操作完成');maintenance.current=true;try{await saveKey(key.trim(),next.baseUrl);const saved={...state.current,settings:next};await saveSnapshot(saved);state.current=saved;setSettings(next);setApiKey(key.trim());setError(null);}finally{maintenance.current=false;}},
    selectConversation:id=>{setActiveId(id);setDraftAttachments([]);setMask(null);},
    newConversation:()=>{setActiveId(null);setDraftAttachments([]);setMask(null);},
    deleteConversation:id=>{if(control.current||maintenance.current)throw new Error('请先等待当前操作完成');const removed=state.current.conversations.find(c=>c.id===id);const items=state.current.conversations.filter(c=>c.id!==id);state.current={...state.current,conversations:items,activeId:activeId===id?null:activeId};setConversations(items);if(activeId===id)setActiveId(null);const kept=new Set([...items.flatMap(c=>c.messages.flatMap(m=>m.attachments)),...draftAttachments,...(mask?[mask]:[])].map(a=>a.uri));void saveSnapshot(state.current).then(()=>clearAttachmentFiles((removed?.messages.flatMap(m=>m.attachments)||[]).map(a=>a.uri).filter(uri=>!kept.has(uri)))).catch(e=>setError(String(e)));},
    renameConversation:(id,title)=>{if(title.trim())updateConversation(id,c=>({...c,title:title.trim().slice(0,80)}));},
    addAttachment:a=>{if(maintenance.current)throw new Error('正在清理数据，请稍后再添加附件');setDraftAttachments(previous=>[...previous.filter(item=>item.id!==a.id),a]);setMask(null);},
    removeAttachment:id=>{const removed=draftAttachments.find(a=>a.id===id);setDraftAttachments(previous=>previous.filter(a=>a.id!==id));setMask(null);if(removed&&!state.current.conversations.some(c=>c.messages.some(m=>m.attachments.some(a=>a.uri===removed.uri))))void clearAttachmentFiles([removed.uri,...(mask?[mask.uri]:[])]).catch(e=>setError(String(e)));},setMask,
    clearHistory:async()=>{if(control.current||maintenance.current)throw new Error('请先等待当前操作完成');maintenance.current=true;if(timer.current)clearTimeout(timer.current);timer.current=null;const previous=state.current;const uris=[...previous.conversations.flatMap(c=>c.messages.flatMap(m=>m.attachments)),...draftAttachments,...(mask?[mask]:[])].map(a=>a.uri);const cleared={...previous,conversations:[],activeId:null};try{await saveSnapshot(cleared);state.current=cleared;setConversations([]);setActiveId(null);setDraftAttachments([]);setMask(null);await clearAttachmentFiles(uris);}finally{maintenance.current=false;}}
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('AppProvider 未初始化');return value;}
