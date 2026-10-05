const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LlamaAI,serverArgs}=require('../lib/llama-ai'),{cleanup,prepareCorrections,validateDictation}=require('../lib/format'),{defaults,validate}=require('../lib/config');
function fixture(options={}){
 const children=[],calls=[],kills=[];let next=100;
 const ai=new LlamaAI('C:/Portable SSD/VoiceFlow',{
  access:async file=>{if(options.missing&&file.endsWith('.gguf'))throw Error('missing model');},port:async()=>34567,sleep:async()=>{},idleMs:options.idleMs||300000,
  spawn:(bin,args)=>{const child=new EventEmitter();child.pid=next++;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.bin=bin;child.args=args;children.push(child);if(options.failGpu&&bin.includes('vulkan'))queueMicrotask(()=>child.emit('close',1));return child;},
  kill:async p=>kills.push(p.pid),fetch:async(url,request)=>{calls.push({url,request});if(options.fetch)return options.fetch(url,request,children.at(-1));if(options.failGpu&&children.at(-1)?.bin.includes('vulkan'))return {ok:false};return {ok:true,json:async()=>({data:[{id:'voiceflow-editing'}]})};}
 });return {ai,children,calls,kills};
}
test('llama.cpp keeps one owned server across concurrent warmups and successive edits',async()=>{
 const f=fixture(),c={...defaults},signal=new AbortController().signal;
 try{await Promise.all([f.ai.ensure(c,signal),f.ai.ensure(c,signal)]);await f.ai.request(c,'ignored',{body:'{}'},signal);await f.ai.request(c,'ignored',{body:'{}'},signal);
  assert.equal(f.children.length,1);assert(f.calls.at(-1).url.startsWith('http://127.0.0.1:34567/'));assert(f.calls.at(-1).request.headers.Authorization.startsWith('Bearer '));
  assert.equal((await f.ai.status()).device,'vulkan');
 }finally{await f.ai.close();}assert.equal(f.kills.length,1);
});
test('processor mode uses a separate runtime and no GPU offload; paths with spaces stay single arguments',async()=>{
 const f=fixture(),signal=new AbortController().signal;
 try{await f.ai.warm({...defaults,device:'cpu'},signal);assert(f.children[0].bin.includes('llama-cpu'));const args=f.children[0].args;
  assert.equal(args[args.indexOf('--n-gpu-layers')+1],'0');assert.equal(args[args.indexOf('--device')+1],'none');assert(args[1].includes('Portable SSD'));assert.equal(args[args.indexOf('--host')+1],'127.0.0.1');assert(args.includes('--no-webui'));
 }finally{await f.ai.close();}
});
test('GPU process failure falls back to CPU once; GPU-only mode reports failure',async()=>{
 for(const device of ['auto','cuda']){const f=fixture({failGpu:true});try{
  if(device==='cuda')await assert.rejects(f.ai.warm({...defaults,device},new AbortController().signal),/could not load/);
  else{await f.ai.warm({...defaults,device},new AbortController().signal);assert.equal((await f.ai.status()).device,'cpu');assert((await f.ai.status()).fallback);assert.equal(f.children.length,2);}
 }finally{await f.ai.close();}}
});
test('missing model never launches or downloads and idle expiry releases owned process',async()=>{
 const missing=fixture({missing:true});await assert.rejects(missing.ai.warm(defaults,new AbortController().signal),/missing model/);assert.equal(missing.children.length,0);
 const f=fixture({idleMs:15});await f.ai.warm(defaults,new AbortController().signal);await new Promise(r=>setTimeout(r,30));assert.equal(f.kills.length,1);assert.equal((await f.ai.status()).available,false);
});
test('cancellation during model loading releases process without CPU retry',async()=>{
 const abort=new AbortController(),f=fixture({fetch:async()=>{abort.abort();abort.signal.throwIfAborted();}});
 await assert.rejects(f.ai.warm(defaults,abort.signal));assert.equal(f.children.length,1);assert.equal(f.kills.length,1);assert.equal(f.ai.proc,null);
});
test('explicit unload during loading cannot relaunch a fallback worker',async()=>{
 let f;f=fixture({fetch:async()=>{await f.ai.unload();return {ok:false};}});
 await assert.rejects(f.ai.warm(defaults,new AbortController().signal),/cancelled/);assert.equal(f.children.length,1);assert.equal(f.ai.proc,null);
});
test('allocation error on a warm GPU request retries with CPU; ordinary HTTP failure does not',async()=>{
 let completions=0;const f=fixture({fetch:async url=>url.endsWith('/v1/models')?{ok:true,json:async()=>({data:[{id:'voiceflow-editing'}]})}:++completions===1?{ok:false,clone:()=>({text:async()=> 'Vulkan out of memory'})}:{ok:true}});
 try{const result=await f.ai.request(defaults,'ignored',{body:'{}'},new AbortController().signal);assert(result.ok);assert.equal(f.children.length,2);assert.equal((await f.ai.status()).device,'cpu');assert.equal(completions,2);}finally{await f.ai.close();}
});
test('llama schema request preserves language and original context; empty or truncated results retain raw',async()=>{
 const raw='Quero comprar arroz, feijão e bananas.',c={...defaults,useOllama:true,cleanupMode:'dictation'};
 const good=await cleanup(raw,c,new AbortController().signal,async(url,options)=>{
  assert(url.endsWith('/v1/chat/completions'));const body=JSON.parse(options.body);assert.equal(body.temperature,0);assert.equal(body.response_format.schema.required[0],'text');assert(!('keep_alive' in body));
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({text:'- Arroz\n- Feijão\n- Bananas'})},finish_reason:'stop'}]})};
 });assert.equal(good.mode,'llm');assert.equal(good.text,'Quero comprar:\n- Arroz\n- Feijão\n- Bananas');
 for(const output of [{choices:[]},{choices:[{message:{content:'{"text":"- Arroz"}'},finish_reason:'length'}]}]){
  const failed=await cleanup(raw,c,new AbortController().signal,async()=>({ok:true,json:async()=>output}));assert.equal(failed.text,raw);assert(failed.warning);
 }
 assert.equal(validate({useOllama:true,managedOllama:false}).editingBackend,'ollama');assert.throws(()=>validate({editingBackend:'cloud'}));
});
test('fully explicit simple corrections are resolved locally without loading a model',async()=>{
 const c={...defaults,useOllama:true,cleanupMode:'dictation'};
 for(const [raw,expected] of [
  ['Send it on Tuesday, sorry, I mean Thursday. Do not send it to John.','Send it on Thursday. Do not send it to John.'],
  ['Compre três litros de água. Não, dois. Quer dizer, três, não dois. E abacaxi.','Compre três litros de água. E abacaxi.'],
  ['Send the file to Ana, I mean João.','Send the file to João.'],
  ['Deux litres, je veux dire, trois litres.','trois litres.']
 ]){const result=await cleanup(raw,c,new AbortController().signal,()=>{throw Error('must not call model');});assert.equal(result.text,expected);assert.equal(result.mode,'rules');}
 assert.equal(prepareCorrections('Not Tuesday, but Thursday.'),'Not Tuesday, but Thursday.');
 assert.equal(prepareCorrections('Tuesday, sorry, I mean Thursday after lunch.'),'Tuesday, sorry, I mean Thursday after lunch.');
 assert.throws(()=>validateDictation('Compre três litros de água. Não, dois. Quer dizer, três, não dois. E abacaxi.','Compre 3 litros de água e 3 abacaxi.'),/unnumbered/);
 assert.throws(()=>validateDictation('Quero comprar três litros de água. Não, pera, dois litros de água, um quilo de banana e abacaxi.','Quero comprar:\n- 2 litros de água\n- 1 quilo de banana\n- 1 quilo de abacaxi','list'),/different item/);
});
