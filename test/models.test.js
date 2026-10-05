const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {catalog,findModel,modelConfig,modelStatus}=require('../lib/model-catalog'),{download,cleanAbandonedDownloads}=require('../lib/model-download');
const {SpeechEngine,parakeetAdapter,backendConfig}=require('../lib/speech-engine'),{defaults,validate}=require('../lib/config');
test('Whisper remains default; optional model choices map to separate compatible formats',()=>{
 assert.equal(defaults.speechBackend,'whisper');assert.equal(defaults.whisperModel,findModel('turbo-q8').file);
 assert.deepEqual(modelConfig('turbo-q5'),{speechBackend:'whisper',whisperModel:findModel('turbo-q5').file});
 const c=validate(modelConfig('parakeet-v3'));assert(c.parakeetModel.endsWith('.gguf'));assert.equal(c.whisperModel,defaults.whisperModel);
 assert.equal(backendConfig(c).whisperBin,c.parakeetBin);assert.throws(()=>findModel('../other'));assert.throws(()=>validate({speechBackend:'unknown'}));
});
test('startup cleanup removes only generated download stages/partials, preserving models and user files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-download-clean-')),id='12345678-1234-1234-1234-123456789abc';
 try {
  await fs.mkdir(path.join(root,'data','model-download-'+id),{recursive:true});await fs.mkdir(path.join(root,'models'));
  await fs.writeFile(path.join(root,'data','model-download-'+id,'temporary.zip'),'temporary');
  const file=path.basename(findModel('parakeet-v3').file);await fs.writeFile(path.join(root,'models',file+'.partial-'+id),'temporary');
  await fs.writeFile(path.join(root,'models',file),'real model');await fs.writeFile(path.join(root,'models','my-notes.partial-'+id),'keep');
  await cleanAbandonedDownloads(root);assert.deepEqual(await fs.readdir(path.join(root,'data')),[]);
  assert.deepEqual((await fs.readdir(path.join(root,'models'))).sort(),[file,'my-notes.partial-'+id].sort());
 }finally{await fs.rm(root,{recursive:true});}
});
test('Parakeet uses persistent localhost serving with explicit CPU fallback and no speaker labels',()=>{
 const args=parakeetAdapter.serverArgs('D:/Models with spaces/model.gguf',12345,true);
 assert.equal(args[0],'serve');assert.equal(args[args.indexOf('--host')+1],'127.0.0.1');assert.equal(args[args.indexOf('--asr.backend.gpu')+1],'-1');
 assert(args.includes('D:/Models with spaces/model.gguf'));assert.equal(parakeetAdapter.inferenceFields('auto').language,undefined);
 for(const language of ['en','pt','fr'])assert.equal(parakeetAdapter.inferenceFields(language).language,language);
 assert.equal(parakeetAdapter.inferenceFields('pt').diarization,'false');
});
test('switching unloads the previous backend and reuses the selected one',async()=>{
 const e=new SpeechEngine('.','.');let unloaded=0;e.engines.whisper.unload=async()=>{unloaded++;};
 assert.equal(await e.select(defaults),e.engines.whisper);assert.equal(unloaded,0);
 assert.equal(await e.select({...defaults,speechBackend:'parakeet'}),e.engines.parakeet);assert.equal(unloaded,1);
 await e.select({...defaults,speechBackend:'parakeet'});assert.equal(unloaded,1);
});
test('downloads validate checksum/size, preserve existing files, and clean failed partials',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-model-')),file=path.join(root,'model.bin'),payload=Buffer.from('model bytes');
 const item={file:'model.bin',bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex'),url:'https://example.invalid/pinned'};
 try {
  const request=async()=>({ok:true,body:[payload]});await download(item,file,new AbortController().signal,()=>{},request);assert.deepEqual(await fs.readFile(file),payload);
  let requested=false;await download(item,file,new AbortController().signal,()=>{},async()=>{requested=true;});assert(!requested);
  await fs.writeFile(file,'old custom file');await assert.rejects(download(item,file,new AbortController().signal,()=>{},request),/size/);assert.equal(await fs.readFile(file,'utf8'),'old custom file');
  await fs.unlink(file);await assert.rejects(download({...item,sha256:'0'.repeat(64)},file,new AbortController().signal,()=>{},request),/checksum/);assert.deepEqual(await fs.readdir(root),[]);
  const a=new AbortController();a.abort();await assert.rejects(download(item,file,a.signal));assert.deepEqual(await fs.readdir(root),[]);
  const midway=new AbortController();
  await assert.rejects(download(item,file,midway.signal,()=>midway.abort(),request));assert.deepEqual(await fs.readdir(root),[]);
  const status=await modelStatus(root,defaults);assert.equal(status.length,catalog.length);assert(status.every(x=>!x.installed));assert(status.find(x=>x.id==='turbo-q8').selected);
 }finally{await fs.rm(root,{recursive:true});}
});
