const {Worker}=require('node:worker_threads'),path=require('node:path'),fs=require('node:fs/promises');
const languages=['auto','en','fr','de','es','it','nl','pl'];
class WhistleEngine {
 constructor(root,temp,notify=()=>{},factory=(file,options)=>new Worker(file,options)){
  this.root=root;this.notify=notify;this.factory=factory;this.pending=new Map();this.serial=0;this.generation=0;this.info={loaded:false,backend:'Cactus Whistle · experimental WASM',device:'unloaded'};
 }
 async ensure(config,signal){
  signal.throwIfAborted();if(!languages.includes(config.language||'auto'))throw Error('Whistle does not support Portuguese. Choose Parakeet or Whisper.');
  if(this.info.loaded)return;if(this.loading){await this.loading;signal.throwIfAborted();if(!this.info.loaded)throw Error('Whistle loading cancelled');return;}
  this.loading=this.start(config,signal,this.generation);
  try{await this.loading;}finally{this.loading=null;}
 }
 async start(config,signal,generation){
  const model=path.resolve(this.root,config.whistleModel||'models/whistle.cact'),js=path.resolve(this.root,'runtime/whistle/needle.js'),wasm=path.resolve(this.root,'runtime/whistle/needle.wasm');
  for(const file of [model,js,wasm])await fs.access(file);signal.throwIfAborted();if(this.generation!==generation)throw Error('Whistle loading cancelled');
  const worker=this.factory(path.join(__dirname,'whistle-worker.js'),{workerData:{model,js,wasm}});this.worker=worker;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(Error('Whistle loading timed out'));this.unload();},30000);
   const abort=()=>{reject(signal.reason||Error('Cancelled'));this.unload();};signal.addEventListener('abort',abort,{once:true});
   const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
   worker.on('message',m=>{
    if(m.ready){if(this.worker!==worker)return;this.info={...this.info,loaded:true,model,modelLoadMs:m.modelLoadMs,device:'CPU · WebAssembly',languages,maxSeconds:30};done();this.notify(this.info);resolve();}
    else if(m.id){const pending=this.pending.get(m.id);if(pending){this.pending.delete(m.id);pending.done();m.error?pending.reject(Error(m.error)):pending.resolve(m);}}
    else if(m.error){done();reject(Error(m.error));this.unload();}
   });
   const failed=e=>{done();reject(e);if(this.worker===worker){this.worker=null;this.info.loaded=false;this.info.device='unloaded';for(const p of this.pending.values()){p.done();p.reject(e);}this.pending.clear();this.notify(this.info);}};
   worker.on('error',failed);worker.on('exit',code=>failed(Error('Whistle worker exited ('+code+')')));
  });
 }
 async warm(config,signal){await this.ensure(config,signal);return this.info;}
 async transcribe(file,config,signal){
  const start=performance.now();await this.ensure(config,signal);signal.throwIfAborted();if(this.pending.size)throw Error('Whistle is already transcribing');
  const loadWaitMs=performance.now()-start,id=++this.serial;
  const m=await new Promise((resolve,reject)=>{
   const abort=()=>{this.unload();};const timer=setTimeout(abort,60000);signal.addEventListener('abort',abort,{once:true});
   this.pending.set(id,{resolve,reject,done:()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);}});
   this.worker.postMessage({id,file,language:config.language});
  });signal.throwIfAborted();
  return {text:m.result.text,metrics:{transcriptionMs:m.transcriptionMs,loadWaitMs,modelLoadMs:this.info.modelLoadMs,backend:this.info.backend,device:this.info.device,detectedLanguage:m.result.language,firstTokenMs:m.result.ttft_ms}};
 }
 async unload(){this.generation++;const worker=this.worker;this.worker=null;for(const p of this.pending.values()){p.done();p.reject(Error('Whistle unloaded or cancelled'));}this.pending.clear();if(worker)await worker.terminate();this.info.loaded=false;this.info.device='unloaded';this.notify(this.info);}
}
module.exports={WhistleEngine,languages};
