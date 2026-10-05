const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {capture,validateAudio}=require('../lib/capture');const {defaults}=require('../lib/config');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
function processMock(){const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdin=new EventEmitter();p.stdin.end=data=>{p.stopData=data;};p.exitCode=null;p.kill=()=>{p.exitCode=1;p.emit('close',1);};return p;}
test('FFmpeg readiness requires samples, stop awaits close, stderr survives errors',async()=>{
 if(process.platform!=='win32')return;
 let args;
 const p=processMock(),abort=new AbortController();const cap=capture('out.wav',{...defaults,micDevice:'Mic'},abort.signal,'.',(_,a)=>{args=a;return p;});
 assert.equal(args[args.indexOf('-audio_buffer_size')+1],'50');
 assert.equal(args[args.indexOf('-probesize')+1],'32');
 assert(args.indexOf('-audio_buffer_size')<args.indexOf('-i'));
 let ready=false,done=false;cap.ready.then(()=>{ready=true;});cap.done.then(()=>{done=true;});
 p.stdout.emit('data',Buffer.from('out_time_us=0\n'));await Promise.resolve();assert(!ready);
 p.stdout.emit('data',Buffer.from('out_time_us=32000\n'));await cap.ready;assert(ready);
 cap.stop();assert.equal(p.stopData,'q\n');await Promise.resolve();assert(!done);
 p.exitCode=0;p.emit('close',0);await cap.done;assert(done);
});
test('spawn failure and early exit reject readiness and finalization',async()=>{
 if(process.platform!=='win32')return;
 for(const mode of ['error','close']){
  const p=processMock(),cap=capture('x.wav',{...defaults,micDevice:'Missing'},new AbortController().signal,'.',()=>p);
  if(mode==='error'){p.emit('error',Error('ENOENT'));p.emit('close',1);}else{p.stderr.emit('data',Buffer.from('device unavailable'));p.emit('close',1);}
  await assert.rejects(cap.ready);await assert.rejects(cap.done);
 }
});
test('capture cancellation kills the owned child process',async()=>{
 if(process.platform!=='win32')return;
 const p=processMock(),a=new AbortController(),cap=capture('x.wav',{...defaults,micDevice:'Mic'},a.signal,'.',()=>p);
 a.abort();await assert.rejects(cap.ready);await assert.rejects(cap.done);assert.equal(p.exitCode,1);
});
function wav(samples){const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);samples.forEach((s,i)=>b.writeInt16LE(s,44+i*2));return b;}
test('PCM validator checks finalized lengths, silence and real samples',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vf-pcm-')),file=path.join(dir,'sample.wav');
 try{await fs.writeFile(file,wav(Array(2000).fill(0)));await assert.rejects(validateAudio(file),/Silence/);
 const data=wav(Array(2000).fill(100));await fs.writeFile(file,data);await validateAudio(file);
 data.writeUInt32LE(999999,40);await fs.writeFile(file,data);await assert.rejects(validateAudio(file),/finalized/);
 }finally{await fs.rm(dir,{recursive:true});}
});
test('preload subscription forwards History event, rejects unknown channel and unsubscribes',async()=>{
 const listeners={},sent=[],ipc={invoke:async(c,a)=>{sent.push([c,a]);return 1;},send:(c,a)=>sent.push([c,a]),on:(c,f)=>{listeners[c]=f;},removeListener:c=>delete listeners[c]};let bridge;
 const script=await fs.readFile(path.join(__dirname,'../src/preload.js'),'utf8');
 vm.runInNewContext(script,{require:name=>name==='electron'?{contextBridge:{exposeInMainWorld:(_,b)=>{bridge=b;}},ipcRenderer:ipc}:require('../lib/ipc')});
 let seen;const unsubscribe=bridge.on('open-history',data=>{seen=data;});listeners['open-history']({},true);assert.equal(seen,true);unsubscribe();assert(!listeners['open-history']);
 bridge.on('arbitrary-command',()=>{});assert(!listeners['arbitrary-command']);await bridge.saveConfig({language:'fr'});assert.equal(sent.at(-1)[0],'save-config');assert.equal(bridge.hotkeyDown,undefined);
});
