const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {WhistleEngine}=require('../lib/whistle-engine'),{pcm}=require('../lib/whistle-worker'),{defaults,validate}=require('../lib/config'),{installModel}=require('../lib/model-download'),{findModel,whistleRuntimes,modelConfig}=require('../lib/model-catalog');
test('Whistle is explicit, CPU only, pinned and rejects Portuguese instead of silently translating',()=>{
 assert.equal(findModel('whistle').bytes,16919407);assert(whistleRuntimes.every(r=>r.sha256.length===64));
 assert.equal(validate(modelConfig('whistle')).speechBackend,'whistle');assert.throws(()=>validate({...modelConfig('whistle'),language:'pt'}),/Portuguese/);
});
test('Whistle refuses incomplete or over-30-second recordings without truncating',()=>{
 const wav=seconds=>{const b=Buffer.alloc(44+seconds*32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;};
 assert.equal(pcm(wav(30)).length,960000);assert.throws(()=>pcm(wav(31)),/30 seconds/);assert.throws(()=>pcm(wav(1).subarray(0,50)),/Incomplete/);
});
test('Whistle download installs just the model and two checksum-pinned runtime files',async()=>{
 const downloaded=[];await installModel('whistle','.',new AbortController().signal,()=>{},{download:async(item,file)=>downloaded.push(item.file)});
 assert.deepEqual(downloaded,[...whistleRuntimes.map(r=>r.file),findModel('whistle').file]);
});
test('persistent Whistle worker serializes warmups, rejects overlap, and cancellation stops old inference',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-whistle-'));let spawns=0,worker;
 const factory=()=>{spawns++;worker=new EventEmitter();worker.postMessage=m=>{worker.last=m;};worker.terminate=async()=>{worker.emit('exit',0);};setImmediate(()=>worker.emit('message',{ready:true,modelLoadMs:2}));return worker;};
 const engine=new WhistleEngine(root,'.',()=>{},factory),config={...defaults,...modelConfig('whistle')},signal=new AbortController().signal;
 try{
  for(const file of [findModel('whistle').file,...whistleRuntimes.map(r=>r.file)]){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),'test');}
  await Promise.all([engine.warm(config,signal),engine.warm(config,signal)]);assert.equal(spawns,1);
  const pending=engine.transcribe('a.wav',config,signal);await new Promise(r=>setImmediate(r));
  await assert.rejects(engine.transcribe('b.wav',config,signal),/already transcribing/);
  worker.emit('message',{id:worker.last.id,result:{text:'Bonjour',language:'fr'},transcriptionMs:10});assert.equal((await pending).text,'Bonjour');
  const abort=new AbortController(),cancelled=engine.transcribe('c.wav',config,abort.signal);cancelled.catch(()=>{});await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(cancelled,/cancelled/);assert.equal(engine.info.loaded,false);
 }finally{await engine.unload();await fs.rm(root,{recursive:true,force:true});}
});
test('editing disabled bypasses the model even for corrections, lists and punctuation',async()=>{
 const {cleanup}=require('../lib/format');
 for(const mode of ['dictation','punctuation'])for(const raw of ['Buy 3 kg of rice and 2 kg of beans. Actually 7 kg of rice.','Make a list. Apples and bananas.']){
  const result=await cleanup(raw,{...defaults,useOllama:false,cleanupMode:mode},new AbortController().signal,()=>{throw Error('Editor must not be called');});assert.equal(result.text,raw);assert.equal(result.mode,'whisper');
 }
});
