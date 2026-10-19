// Local deterministic acceptance server. Never calls a model or uses real credentials.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const image = fs.readFileSync(path.join(__dirname, '../assets/icon.png')).toString('base64');
let chatRequests=0, imageRequests=0;
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://localhost:8081');
  res.setHeader('Access-Control-Allow-Headers','authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url==='/stats'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({chatRequests,imageRequests}));}
  const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(req.url==='/v1/models') return json({data:[{id:'mock-chat'},{id:'mock-image'},{id:'mock-search'}]});
  let raw='';for await(const chunk of req)raw+=chunk;
  if(req.url?.startsWith('/v1/images/')){imageRequests++;return json({data:[{b64_json:image}]});}
  if(req.url==='/v1/chat/completions'){
    chatRequests++;const body=JSON.parse(raw);const latest=body.messages.filter(m=>m.role==='user').at(-1);const prompt=typeof latest?.content==='string'?latest.content:JSON.stringify(latest?.content);
    if(prompt.includes('测试错误')){res.statusCode=429;return json({error:{message:'本地测试限流，请稍后手动重试'}});}
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');
    const event=v=>res.write('data: '+JSON.stringify(v)+'\n\n');
    const hasTool=body.messages.some(m=>m.role==='tool');
    if(prompt.includes('测试绘图')&&!hasTool&&body.tools?.length){event({choices:[{delta:{tool_calls:[{index:0,id:'local-image-call',type:'function',function:{name:'generate_image',arguments:'{"prompt":"本地验收占位图片"}'}}]},finish_reason:'tool_calls'}]});res.end('data: [DONE]\n\n');return;}
    const chunks=hasTool?['已完成','本地工具串联测试。','\n\n这张图片是测试夹具，','不是 AI 生成结果。']:['## 本地验收回复\n\n','流式对话已连通。','\n\n- 中文内容正常\n','- 历史记录可保存\n','\n这是本地模拟接口，未调用真实模型。'];
    let index=0;const timer=setInterval(()=>{if(index<chunks.length)event({choices:[{delta:{content:chunks[index++]},finish_reason:null}]});else{event({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:24}});res.end('data: [DONE]\n\n');clearInterval(timer);}},prompt.includes('测试停止')?1800:120);
    res.on('close',()=>clearInterval(timer));return;
  }
  res.statusCode=404;json({error:{message:'Mock route not found'}});
}).listen(8787,'127.0.0.1',()=>console.log('Local mock New API: http://127.0.0.1:8787 — no paid calls'));
