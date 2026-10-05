const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Engine}=require('../lib/engine');const {defaults}=require('../lib/config');
test('auto retries failed GPU startup once on CPU; explicit CUDA exposes the failure',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vf-engine-')),model=path.join(dir,'model.bin');await fs.writeFile(model,'test');
 try{for(const device of ['auto','cuda']){
  const e=new Engine(dir,dir),calls=[];e.launch=async(c,m,cpu)=>{calls.push(cpu);if(!cpu)throw Error('CUDA out of memory');e.info.loaded=true;};
  if(device==='auto'){await e.start({...defaults,whisperModel:model,device},new AbortController().signal);assert.deepEqual(calls,[false,true]);assert.match(e.info.fallback,/CPU/);}
  else{await assert.rejects(e.start({...defaults,whisperModel:model,device},new AbortController().signal),/memory/);assert.deepEqual(calls,[false]);}
 }}finally{await fs.rm(dir,{recursive:true});}
});
test('existing loaded model is reused and cancellation blocks reload',async()=>{
 const e=new Engine('.','.'),config={...defaults};e.key=JSON.stringify([config.whisperBin,config.whisperCpuBin,config.whisperModel,config.device]);e.proc={};e.info.loaded=true;
 let reload=false;e.start=async()=>{reload=true;};await e.ensure(config,new AbortController().signal);assert(!reload);
 const a=new AbortController();a.abort();e.proc=null;await assert.rejects(e.ensure(config,a.signal));assert(!reload);
});
test('inference OOM unloads process before CPU retry; missing text is an error',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vf-oom-')),file=path.join(dir,'a.wav');await fs.writeFile(file,'test');const original=global.fetch;
 try{
  const e=new Engine(dir,dir);e.ensure=async()=>{};let requests=0,unloads=0;e.unload=async()=>{unloads++;};e.info.log='CUDA out of memory';
  global.fetch=async()=>{requests++;return requests===1?{ok:false,status:500,text:async()=> 'OOM'}:{ok:true,json:async()=>({text:'Bonjour 42.'})};};
  const out=await e.transcribe(file,defaults,new AbortController().signal);assert.equal(out.text,'Bonjour 42.');assert.equal(requests,2);assert.equal(unloads,1);
  e.info.log='';global.fetch=async()=>({ok:true,json:async()=>({})});await assert.rejects(e.transcribe(file,defaults,new AbortController().signal),/Invalid speech/);
 }finally{global.fetch=original;await fs.rm(dir,{recursive:true});}
});
