const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {defaults,validate,resolvePath,roots,startupSpec,atomicJson,load} = require('../lib/config');
const {formatText,cleanup} = require('../lib/format');
const {serverArgs,inferenceFields} = require('../lib/engine');
const {Hotkey} = require('../lib/hotkey');
const {Sessions} = require('../lib/session');
const {events,invokes} = require('../lib/ipc');
const {insert,snapshot,restore} = require('../lib/windows');
const {validateAudio,capture} = require('../lib/capture');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,10));
async function fixture(overrides={}) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'vf-test-'));
  const ready=deferred(),done=deferred(),inference=deferred();let pasted=[],states=[],files=[],entries=[],captures=0;
  const engine={transcribe:()=>inference.promise,unload:async()=>{}};
  const d={temp,config:()=>({...defaults}),notify:s=>states.push(s),target:async()=>({hwnd:123,pid:4}),
    capture:file=>{captures++;files.push(file);return{ready:ready.promise,done:done.promise,stop:()=>done.resolve(),cancel:()=>done.resolve()};},
    validateAudio:async()=>{},engine,cleanup:async raw=>({text:raw,mode:'whisper'}),recovery:()=>{},history:async e=>entries.push(e),
    insert:async text=>{pasted.push(text);return 'paste-sent';},metrics:()=>{},...overrides};
  const s=new Sessions(d);
  return{s,ready,done,inference,pasted,states,files,entries,get captures(){return captures;},dispose:()=>fs.rm(temp,{recursive:true,force:true})};
}
test('auto language explicit; translation and detection-only disabled',()=>{
  for(const lang of ['auto','en','pt','fr'])assert.equal(inferenceFields(lang).language,lang);
  assert.equal(inferenceFields('pt').translate,'false');assert.equal(inferenceFields('auto').detect_language,'false');
  const args=serverArgs('D:/SSD Models/ggml-medium.bin',1234,false,'/token');
  assert.equal(args[args.indexOf('-l')+1],'auto');assert(!args.includes('-tr'));assert(serverArgs('m',4,true,'/a').includes('-ng'));
});
test('relative paths survive changing SSD drive; development and packaged startup',()=>{
  assert.equal(resolvePath('models/ggml-medium.bin','D:/Toolkit'),path.resolve('D:/Toolkit','models/ggml-medium.bin'));
  assert.equal(resolvePath('models/ggml-medium.bin','E:/Toolkit'),path.resolve('E:/Toolkit','models/ggml-medium.bin'));
  assert.deepEqual(startupSpec(false,'electron.exe','D:/App with spaces'),{path:'electron.exe',args:['D:/App with spaces']});
  assert.deepEqual(startupSpec(true,'vf.exe','ignored'),{path:'vf.exe',args:[]});
  assert.equal(roots({packaged:false,execPath:'e',appPath:'app',portableDir:'SSD',userData:'profile'}).data,path.join('SSD','data'));
});
test('config rejects malformed enums and remote cleanup; serializes one literal separator',async()=>{
  assert.throws(()=>validate({language:'pt-br'}));assert.throws(()=>validate({ollamaUrl:'https://cloud.example'}));
  assert.throws(()=>validate({hotkey:'AltRight'}));assert.throws(()=>validate({device:'foo'}));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vf-json-'));const file=path.join(dir,'config.json');
  atomicJson(file,{whisperModel:'D:\\Models\\medium.bin'});assert.equal(load(file,{}).whisperModel,'D:\\Models\\medium.bin');await fs.rm(dir,{recursive:true});
});
test('faithful and conservative formatting preserves multilingual names, negations and lists',()=>{
  for(const raw of ['I do not need eggs, milk and bread.','Não envie R$ 1.250,50 para João.','François n’a pas reçu 42 euros.']) {
    assert.equal(formatText(raw,false),raw);assert.equal(formatText(raw,true),raw);
  }
  assert.equal(formatText('A  B\n C',true),'A B\nC');
});
test('empty, failed and cancelled cleanup responses handled',async()=>{
  const c={...defaults,editingBackend:'ollama',useOllama:true},a=new AbortController();
  const result=await cleanup('João não pagou 10.',c,a.signal,async()=>({ok:true,json:async()=>({response:''})}));
  assert.equal(result.text,'João não pagou 10.');assert.match(result.warning,/empty/);
  assert.equal((await cleanup('raw',c,a.signal,async()=>{throw Error('offline');})).text,'raw');
  a.abort();await assert.rejects(cleanup('raw',c,a.signal,async()=>{throw Error('abort');}));
});
test('cleanup accepts punctuation but rejects changed names, numbers and negations',async()=>{
 const c={...defaults,editingBackend:'ollama',useOllama:true},a=new AbortController();
 for(const text of ['João pagou 10.','Joana não pagou 10.','João não pagou 100.']) {
  const r=await cleanup('João não pagou 10.',c,a.signal,async()=>({ok:true,json:async()=>({response:text})}));
  assert.equal(r.text,'João não pagou 10.');assert.match(r.warning,/changed/);
 }
 const r=await cleanup('Bonjour François',c,a.signal,async()=>({ok:true,json:async()=>({response:'Bonjour, François.'})}));assert.equal(r.text,'Bonjour, François.');assert.equal(r.mode,'llm');
});
test('capture readiness, finalization, serialization and completion order',async()=>{
  const f=await fixture();try {
    assert(f.s.start());assert(!f.s.start());await tick();assert.equal(f.s.state,'loading');
    f.ready.resolve();await tick();assert.equal(f.s.state,'recording');assert(f.s.stop());await tick();
    assert.equal(f.s.state,'transcribing');assert(!f.s.start());assert.equal(f.pasted.length,0);
    f.inference.resolve({text:'Olá François 42.',metrics:{}});await f.s.active.task;
    assert.deepEqual(f.states.map(s=>s.state),['loading','recording','stopping','transcribing','inserting','idle']);
    assert.equal(f.states.at(-1).completion,'paste-sent');assert.equal(f.entries[0].raw,'Olá François 42.');
    assert.equal(f.pasted.length,1);assert.equal(f.s.active,null);await assert.rejects(fs.access(path.dirname(f.files[0])));
  } finally {await f.dispose();}
});
test('release before target capture completes does not record late',async()=>{
  const target=deferred(),f=await fixture({target:()=>target.promise});try{
    f.s.start();f.s.stop();target.resolve({hwnd:123});await f.s.active.task;assert.equal(f.captures,0);assert.equal(f.s.state,'idle');
  }finally{await f.dispose();}
});
test('timing log failure cannot report an accepted paste as failed',async()=>{
  const f=await fixture({metrics:()=>{throw Error('disk full');}});try {
    f.s.start();await tick();f.ready.resolve();await tick();f.s.stop();
    f.inference.resolve({text:'Bonjour',metrics:{}});await f.s.active.task;
    assert.equal(f.pasted.length,1);assert.equal(f.s.state,'idle');
    assert.equal(f.states.at(-1).completion,'paste-sent');assert.match(f.states.at(-1).warning,/disk full/);
  }finally{await f.dispose();}
});
test('F9 from VoiceFlow records and uses copy recovery instead of rejecting or pasting into settings',async()=>{
  let method;
  const f=await fixture({target:async()=>({hwnd:123,pid:4,copyOnly:true}),insert:async(text,target,c)=>{method=c.pasteMethod;return 'copied';}});
  try {
    f.s.start();await tick();f.ready.resolve();await tick();f.s.stop();
    f.inference.resolve({text:'Bonjour François',metrics:{}});await f.s.active.task;
    assert.equal(method,'clipboard');assert.equal(f.s.state,'idle');assert.equal(f.states.at(-1).completion,'copied');
    assert.match(f.states.at(-1).warning,/Ctrl\+V/);assert.equal(f.entries[0].raw,'Bonjour François');
  }finally{await f.dispose();}
});
test('release during microphone loading waits ready and finalizes',async()=>{
  const f=await fixture();try{f.s.start();await tick();f.s.stop();f.ready.resolve();await tick();f.inference.resolve({text:'hi',metrics:{}});await f.s.active.task;assert.equal(f.pasted.length,1);}finally{await f.dispose();}
});
test('cancelled inference never pastes stale text; lock remains until teardown',async()=>{
  const f=await fixture();try{
    f.s.start();await tick();f.ready.resolve();await tick();f.s.stop();await tick();const pending=f.s.cancel();assert(!f.s.start());
    f.inference.resolve({text:'stale',metrics:{}});await pending;assert.equal(f.pasted.length,0);assert.equal(f.entries.length,0);assert.equal(f.s.active,null);
  }finally{await f.dispose();}
});
test('microphone and inference failures reset state and expose error',async()=>{
  for(const stage of ['mic','inference']){
    const f=await fixture();try{
      f.s.start();await tick();if(stage==='mic')f.ready.reject(Error('device unavailable'));
      else{f.ready.resolve();await tick();f.s.stop();await tick();f.inference.reject(Error('CUDA OOM'));}
      await f.s.active.task;assert.equal(f.s.state,'error');assert.equal(f.s.active,null);assert.equal(f.pasted.length,0);
    }finally{await f.dispose();}
  }
});
test('unique audio files across sequential sessions',async()=>{
  const f=await fixture();try{
    for(let i=0;i<2;i++){f.s.start();const task=f.s.active.task;await tick();f.ready.resolve();await tick();f.s.stop();f.inference.resolve({text:'hi',metrics:{}});await task;}
    assert.notEqual(f.files[0],f.files[1]);
  }finally{await f.dispose();}
});
test('hold/toggle use one key source, ignore repeats and AltGr',()=>{
  let mode='hold',starts=0,stops=0,active=false;
  const h=new Hotkey(()=>({hotkey:'F9',hotkeyMode:mode}),()=>{starts++;active=true;},()=>{if(!active)return false;stops++;active=false;return true;},()=>{});
  h.keydown({keycode:3640});assert.equal(starts,0);h.keydown({keycode:67});h.keydown({keycode:67});h.keyup({keycode:67});assert.equal(starts,1);assert.equal(stops,1);
  mode='toggle';h.keydown({keycode:67});h.keyup({keycode:67});assert(active);h.keydown({keycode:67});h.keyup({keycode:67});assert(!active);assert.equal(starts,2);
});
test('history IPC exposed, renderer keyboard duplicate channels absent',()=>{
  assert(invokes.includes('test-microphone'));
  assert(events.includes('open-history'));assert(invokes.includes('copy-last'));assert(!invokes.includes('hotkey-down'));
});
test('paste failure retains recovery and restores clipboard; does not replace newer clipboard',async()=>{
  let text='before',seq=1;const clipboard={read:async()=>[{types:['text/plain'],getType:async()=>new Blob([text])}],makeItem:data=>data,write:async items=>{text=await items[0]['text/plain'].text();},clear:async()=>{},readText:async()=>text,writeText:async t=>{text=t;seq++;}};
  const helper=async action=>{if(action==='sequence')return seq;throw Error('focus changed');};
  await assert.rejects(insert('Olá', {hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,helper),/focus/);assert.equal(text,'before');
  const change=async action=>{if(action==='context')return {known:false};if(action==='sequence')return seq;text='new user copy';seq++;return{accepted:true};};
  assert.equal(await insert('Bonjour',{hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,change),'paste-sent');assert.equal(text,'new user copy');
});
test('empty MIME clipboard entries never construct an empty ClipboardItem and paste still succeeds',async()=>{
 let text='',seq=1,made=0,cleared=0;
 const clipboard={read:async()=>[{types:[]}],makeItem:data=>{made++;assert(Object.keys(data).length);return data;},
  write:async()=>{throw Error('Empty clipboard must be cleared');},clear:async()=>{cleared++;text='';seq++;},
  readText:async()=>text,writeText:async value=>{text=value;seq++;}};
 assert.deepEqual(await snapshot(clipboard),[]);assert.equal(made,0);
 const helper=async action=>action==='context'?{known:false}:action==='sequence'?seq:{accepted:true};
 assert.equal(await insert('Olá',{hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,helper),'paste-sent');
 assert.equal(made,0);assert.equal(cleared,1);assert.equal(text,'');
});
test('clipboard snapshots skip empty entries while retaining Unicode and other supported MIME formats',async()=>{
 const data={'text/plain':new Blob(['Olá François']), 'image/png':new Blob([new Uint8Array([1,2])],{type:'image/png'})};let restored;
 const clipboard={read:async()=>[{types:[]},{types:Object.keys(data),getType:async type=>data[type]}],makeItem:item=>item,write:async value=>{restored=value;}};
 const saved=await snapshot(clipboard);assert.equal(saved.length,1);await restore(clipboard,saved);
 assert.equal(await restored[0]['text/plain'].text(),'Olá François');assert.deepEqual([...new Uint8Array(await restored[0]['image/png'].arrayBuffer())],[1,2]);
});
test('WAV validation rejects unfinished, silence and too short audio',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vf-wav-'));const file=path.join(dir,'a.wav');
  try{await fs.writeFile(file,Buffer.alloc(100));await assert.rejects(validateAudio(file),/Invalid/);}finally{await fs.rm(dir,{recursive:true});}
});

