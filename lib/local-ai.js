// Optional external Ollama compatibility; bundled editing uses llama.cpp.
const {LocalAI:OllamaAI}=require('./ollama-ai'),{LlamaAI}=require('./llama-ai');
class LocalAI {
 constructor(root){this.llama=new LlamaAI(root);this.ollama=new OllamaAI(root);}
 runner(config){return config.editingBackend==='llamacpp'?this.llama:this.ollama;}
 ensure(c,s){return this.runner(c).ensure(c,s);}
 warm(c,s){return this.runner(c).warm(c,s);}
 status(c){return this.runner(c).status(c);}
 async request(c,url,options,s){
  if(c.editingBackend==='llamacpp')return this.llama.request(c,url,options,s);
  await this.ollama.ensure(c,s);return fetch(url,options);
 }
 async unload(c){return this.runner(c).unload(c);}
 async close(){await Promise.all([this.llama.close(),this.ollama.close()]);}
}
module.exports={LocalAI};
