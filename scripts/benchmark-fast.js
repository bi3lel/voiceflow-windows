const path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..'),{Engine}=require(path.join(root,'lib/engine')),{cleanup}=require(path.join(root,'lib/format')),{defaults}=require(path.join(root,'lib/config'));
(async()=>{const engine=new Engine(root,path.join(root,'data/fast-benchmark-engine')),signal=new AbortController().signal,c={...defaults,useOllama:true,cleanupMode:'dictation',outputFormat:'auto'},report={method:'Existing identical nine EN/PT-BR/FR WAV files; warm persistent Whisper; automatic cleanup gated by explicit intent; no live release-to-insertion timing',results:[]};
 try{const started=performance.now();await engine.warm(c,signal);report.speechWarmMs=performance.now()-started;report.engine=engine.info;
  for(const name of (await fs.readdir(path.join(root,'benchmarks/corpus'))).filter(n=>n.endsWith('.wav')).sort()){
   const started=performance.now(),recognized=await engine.transcribe(path.join(root,'benchmarks/corpus',name),{...c,language:name.startsWith('en')?'en':name.startsWith('pt')?'pt':'fr'},signal);
   const cleanupBegan=performance.now();let aiRequests=0;const formatted=await cleanup(recognized.text,c,signal,()=>{aiRequests++;throw Error('Unexpected AI request for ordinary corpus speech')});
   report.results.push({name,text:formatted.text,...recognized.metrics,postprocessMs:performance.now()-cleanupBegan,totalRecognitionAndCleanupMs:performance.now()-started,aiRequests,mode:formatted.mode});
  }
 }finally{await engine.unload();await fs.writeFile(path.join(root,'benchmarks/fast-dictation.json'),JSON.stringify(report,null,2)+'\n')}console.log(JSON.stringify(report.results.map(({name,transcriptionMs,postprocessMs,aiRequests})=>({name,transcriptionMs,postprocessMs,aiRequests}))));})().catch(e=>{console.error(e);process.exitCode=1});
