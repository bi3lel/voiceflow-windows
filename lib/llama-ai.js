const {spawn,execFile}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),os=require('node:os'),{randomUUID}=require('node:crypto');
const spec=require('../editing-runtime-manifest.json');
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(e=>e?reject(e):resolve(port));});});}
function serverArgs(model,port,key,device){
 return ['--model',model,'--host','127.0.0.1','--port',String(port),'--api-key',key,'--alias','voiceflow-editing','--ctx-size','4096','--parallel','1','--threads',String(Math.max(1,Math.min(8,Math.floor(os.cpus().length/2)))),'--batch-size','512','--ubatch-size','128','--n-gpu-layers',device==='cpu'?'0':'99','--device',device==='cpu'?'none':'Vulkan0','--no-webui','--log-verbosity','4'];
}
class LlamaAI {
 constructor(root,deps={}){
  this.root=root;this.proc=null;this.loading=null;this.log='';this.info={backend:'llamacpp',loaded:false};this.generation=0;this.timer=null;this.key='';this.signature='';this.requests=0;
  this.spawn=deps.spawn||spawn;this.fetch=deps.fetch||fetch;this.access=deps.access||fs.access;this.port=deps.port||freePort;this.sleep=deps.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
  this.kill=deps.kill||(p=>new Promise(resolve=>{if(process.platform==='win32')execFile('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,timeout:5000},()=>resolve());else{p.kill();resolve();}}));
  this.timeoutMs=deps.timeoutMs||45000;this.idleMs=deps.idleMs||300000;
 }
 touch(){clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.requests)this.unload().catch(()=>{});else this.touch();},this.idleMs);this.timer.unref?.();}
 async ensure(config,signal){
  signal.throwIfAborted();
  if(this.loading)await this.loading;
  signal.throwIfAborted();
  const signature=JSON.stringify([config.editingModel||spec.model.file,config.device]);
  if(this.proc&&this.info.loaded&&this.signature===signature){this.touch();return;}
  this.loading=this.start(config,signal,signature);
  try{await this.loading;}finally{this.loading=null;}
 }
 async start(config,signal,signature){
  await this.close();signal.throwIfAborted();
  const model=path.resolve(this.root,config.editingModel||spec.model.file);await this.access(model);
  const cpu=path.join(this.root,'runtime/llama-cpu/llama-server.exe'),gpu=path.join(this.root,'runtime/llama-vulkan/llama-server.exe');
  let hasGpu=false;try{await this.access(gpu);hasGpu=true;}catch{}
  const devices=config.device==='cpu'?['cpu']:config.device==='cuda'?['vulkan']:hasGpu?['vulkan','cpu']:['cpu'];
  const errors=[];
  for(const device of devices){
   const generation=this.generation;
   try {await this.launch(device==='cpu'?cpu:gpu,model,device,signal);this.signature=signature;this.info.fallback=errors.length?errors.join('; '):'';this.touch();return;}
   catch(error){const cancelled=generation!==this.generation;await this.close();signal.throwIfAborted();if(cancelled)throw Error('Editor loading cancelled');errors.push(error.message);}
  }
  throw Error('Local text editor could not load: '+errors.join('; '));
 }
 async launch(bin,model,device,signal){
  await this.access(bin);signal.throwIfAborted();const generation=this.generation,began=performance.now();
  this.endpoint='http://127.0.0.1:'+await this.port();this.key=randomUUID();this.log='';
  signal.throwIfAborted();if(generation!==this.generation)throw Error('Editor loading cancelled');
  const p=this.spawn(bin,serverArgs(model,Number(new URL(this.endpoint).port),this.key,device),{windowsHide:true,cwd:path.dirname(bin),stdio:['ignore','pipe','pipe'],env:{...process.env,GGML_VK_VISIBLE_DEVICES:'0'}});
  this.proc=p;let failed;
  for(const stream of [p.stdout,p.stderr])stream.on('data',b=>{this.log=(this.log+b.toString()).slice(-16000);});
  p.on('error',e=>{failed=e;});p.on('close',()=>{if(this.proc===p){this.proc=null;this.info={...this.info,loaded:false};}});
  while(performance.now()-began<this.timeoutMs){
   signal.throwIfAborted();if(generation!==this.generation)throw Error('Editor loading cancelled');if(failed)throw failed;
   if(this.proc!==p)throw Error('Editor process exited: '+this.log.slice(-1600));
   try {
    const response=await this.fetch(this.endpoint+'/v1/models',{headers:{Authorization:'Bearer '+this.key},signal:AbortSignal.any([signal,AbortSignal.timeout(1000)])});
    if(response.ok&&(await response.json()).data?.some(m=>m.id==='voiceflow-editing')){
     this.info={backend:'llamacpp',version:spec.runtimes[0].version,device,loaded:true,model:path.basename(model),context:4096,loadMs:performance.now()-began,bufferMiB:[...this.log.matchAll(/([^\r\n]*buffer size\s*=\s*([\d.]+)\s*MiB)/g)].map(m=>({description:m[1].trim(),MiB:Number(m[2])}))};return;
    }
   }catch(e){signal.throwIfAborted();}
   await this.sleep(100);
  }
  throw Error('Editor loading timed out: '+this.log.slice(-1600));
 }
 async warm(config,signal){await this.ensure(config,signal);return this.status();}
 async request(config,_url,options,signal){
  await this.ensure(config,signal);if(this.requests)throw Error('Text editor is busy');
  clearTimeout(this.timer);this.requests++;
  const send=()=>this.fetch(this.endpoint+'/v1/chat/completions',{...options,headers:{...options.headers,Authorization:'Bearer '+this.key}});
  try{
   let response=await send();
   if(!response.ok&&config.device==='auto'&&this.info.device==='vulkan'){
    const message=await response.clone().text();
    if(/out of memory|allocation|device.?lost|vk_error/i.test(message)){
     await this.start({...config,device:'cpu'},signal,JSON.stringify([config.editingModel||spec.model.file,config.device]));
     this.info.fallback='GPU allocation failed during editing; processor fallback active';response=await send();
    }
   }
   return response;
  }catch(error){if(signal.aborted)await this.close();throw error;}
  finally{this.requests--;if(this.proc)this.touch();}
 }
 async status(){return {...this.info,available:!!this.proc&&this.info.loaded,managed:true,idleUnloadSeconds:this.idleMs/1000};}
 async unload(){await this.close();}
 async close(){
  this.generation++;clearTimeout(this.timer);this.timer=null;const p=this.proc;this.proc=null;this.info={...this.info,loaded:false};this.signature='';
  if(p)await this.kill(p);
 }
}
module.exports={LlamaAI,serverArgs};
