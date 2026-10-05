// External, user-managed Ollama compatibility. Never downloads or launches it.
class LocalAI {
 async ensure(config,signal){
  const response=await fetch(config.ollamaUrl+'/api/tags',{signal:AbortSignal.any([signal,AbortSignal.timeout(2000)])});
  if(!response.ok)throw Error('External Ollama unavailable; original transcript retained');
  const tags=await response.json();
  if(!tags.models?.some(m=>m.name===config.ollamaModel||m.name===config.ollamaModel+':latest'))throw Error('Selected model is not installed in external Ollama');
 }
 async warm(config,signal){await this.ensure(config,signal);const response=await fetch(config.ollamaUrl+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),body:JSON.stringify({model:config.ollamaModel,stream:false,keep_alive:'5m',options:{num_ctx:4096}})});if(!response.ok)throw Error('External Ollama warmup failed');return response.json();}
 async status(config){try{const response=await fetch(config.ollamaUrl+'/api/ps',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error('HTTP '+response.status);return {backend:'ollama',managed:false,available:true,...await response.json()};}catch(error){return {backend:'ollama',managed:false,available:false,message:error.message};}}
 async unload(config){try{await fetch(config.ollamaUrl+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({model:config.ollamaModel,stream:false,keep_alive:0})});}catch{}}
 async close(){} // Never terminate a user's separate service.
}
module.exports={LocalAI};
