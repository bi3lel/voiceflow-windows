const {test}=require('node:test'),assert=require('node:assert/strict');
const {fastCapture}=require('../lib/fast-capture');
const tick=()=>new Promise(r=>setImmediate(r));
test('a capture failure after readiness finalizes native recording and rejects done',async()=>{
 let queries=0,closed=0;
 const helper=async action=>{if(action==='capture-ready'){if(++queries>1)throw Error('Microphone disconnected');return {ready:true};}if(action==='capture-stop')closed++;return {};};
 const mic=fastCapture('out.wav',{captureBackend:'native',micDevice:'Mic'},new AbortController().signal,'.',helper);
 await mic.ready;await assert.rejects(mic.done,/disconnected/);assert.equal(closed,1);
});
test('native capture confirms real samples, finalizes before done, and handles early release',async()=>{
 for(const early of [false,true]){
  const actions=[];let queries=0,finish;
  const finalized=new Promise(r=>{finish=r;});
  const helper=async action=>{
   actions.push(action);
   if(action==='capture-ready')return {ready:++queries>1};
   if(action==='capture-stop'){await finalized;return {stopped:true};}
   return {started:true};
  };
  const mic=fastCapture('out.wav',{captureBackend:'native',micDevice:'Mic'},new AbortController().signal,'.',helper);
  if(early)mic.stop();await mic.ready;if(!early)mic.stop();
  let done=false;mic.done.then(()=>{done=true;});await tick();assert(!done);
  finish();await mic.done;assert.equal(mic.backend,'Windows PCM');assert.equal(actions.filter(x=>x==='capture-stop').length,1);
 }
});
test('native startup failure uses FFmpeg in auto mode but never conceals explicit native failure',async()=>{
 for(const mode of ['auto','native']){
  let fallbackCalls=0,stop;
  const helper=async action=>{if(action==='capture-start')throw Error('Device unavailable');return {};};
  const fallback=()=>{fallbackCalls++;return {ready:Promise.resolve(),done:new Promise(r=>{stop=r;}),stop:()=>stop(),cancel:()=>stop()};};
  const mic=fastCapture('out.wav',{captureBackend:mode,micDevice:'Mic'},new AbortController().signal,'.',helper,fallback);
  if(mode==='auto'){await mic.ready;assert.equal(mic.backend,'FFmpeg');assert.match(mic.fallbackReason,/unavailable/);mic.stop();await mic.done;assert.equal(fallbackCalls,1);}
  else{await assert.rejects(mic.ready,/unavailable/);await assert.rejects(mic.done,/unavailable/);assert.equal(fallbackCalls,0);}
 }
});
test('cancellation during native initialization cleans up without starting FFmpeg',async()=>{
 let release,fallback=false,closed=0;
 const start=new Promise(r=>{release=r;}),a=new AbortController();
 const helper=async action=>{if(action==='capture-start')return start;if(action==='capture-stop')closed++;return {ready:false};};
 const mic=fastCapture('out.wav',{captureBackend:'auto',micDevice:'Mic'},a.signal,'.',helper,()=>{fallback=true;});
 a.abort();release({started:true});await assert.rejects(mic.ready,/cancel/);await assert.rejects(mic.done,/cancel/);
 assert(!fallback);assert.equal(closed,1);
});
test('rapid native recordings start and stop distinct files without stale state',async()=>{
 const files=[];let active;
 const helper=async(action,args)=>{if(action==='capture-start'){assert(!active);active=args[0];files.push(active);}if(action==='capture-ready')return {ready:true};if(action==='capture-stop')active=null;return {};};
 for(const file of ['first.wav','second.wav','third.wav']){const mic=fastCapture(file,{captureBackend:'native',micDevice:'Mic'},new AbortController().signal,'.',helper);await mic.ready;mic.stop();await mic.done;}
 assert.deepEqual(files,['first.wav','second.wav','third.wav']);assert.equal(active,null);
});
