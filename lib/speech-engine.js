const {Engine}=require('./engine');
const {WhistleEngine}=require('./whistle-engine');
const parakeetAdapter={
 name:'NVIDIA NeMo-Speech.cpp v0.2.0 · Parakeet v3',
 serverArgs:(model,port,cpu)=>['serve','--asr-model',model,'--host','127.0.0.1','--port',String(port),'--no-ui','--asr.backend.gpu',cpu?'-1':'0'],
 inferenceFields:language=>({response_format:'json',diarization:'false',verbatim:'true',automatic_punctuation:'true',...(language&&language!=='auto'?{language}:{})})
};
function backendConfig(config) {
 return config.speechBackend==='parakeet'?{...config,whisperBin:config.parakeetBin,whisperCpuBin:config.parakeetCpuBin,whisperModel:config.parakeetModel}:config;
}
class SpeechEngine {
 constructor(root,temp,notify=()=>{}) {
  this.current='whisper';
  this.engines={whisper:new Engine(root,temp,info=>{if(this.current==='whisper')notify(info);}),parakeet:new Engine(root,temp,info=>{if(this.current==='parakeet')notify(info);},parakeetAdapter)};
  this.engines.whistle=new WhistleEngine(root,temp,info=>{if(this.current==='whistle')notify(info);});
 }
 get info(){return this.engines[this.current].info;}
 async select(config) {
  const next=config.speechBackend||'whisper';if(!this.engines[next])throw Error('Unknown speech backend');
  if(next!==this.current){await this.engines[this.current].unload();this.current=next;}
  return this.engines[next];
 }
 async warm(config,signal){const engine=await this.select(config);return engine.warm(backendConfig(config),signal);}
 async transcribe(file,config,signal){const engine=await this.select(config);return engine.transcribe(file,backendConfig(config),signal);}
 async unload(){for(const engine of Object.values(this.engines))await engine.unload();}
}
module.exports={SpeechEngine,parakeetAdapter,backendConfig};
