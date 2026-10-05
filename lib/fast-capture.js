const windows=require('./windows');
const {capture}=require('./capture');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function fastCapture(file,config,signal,root,helper=windows.call,fallback=capture) {
 let actual,native=false,isReady=false,stopped=false,cancelled=false,finished=false,timer,finalizing;
 let resolveReady,rejectReady,resolveDone,rejectDone;
 const ready=new Promise((a,b)=>{resolveReady=a;rejectReady=b;}),done=new Promise((a,b)=>{resolveDone=a;rejectDone=b;});ready.catch(()=>{});done.catch(()=>{});
 const result={ready,done,get backend(){return actual?'FFmpeg':'Windows PCM';},get fallbackReason(){return fallbackReason;},stop,cancel};let fallbackReason;
 function finish(error) {
  if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);
  if(error){rejectReady(error);rejectDone(error);}else resolveDone();
 }
 async function closeNative(){try{await helper('capture-stop');}catch(e){windows.close();throw e;}finally{native=false;}}
 async function stop() {
  stopped=true;
  if(finished)return;
  if(actual){actual.stop();return;}
  if(!native || (!isReady&&!cancelled) || finalizing)return;
  finalizing=closeNative().then(()=>finish(cancelled?Error('Microphone capture cancelled'):null),e=>finish(e));
 }
 function cancel(){if(finished)return;cancelled=true;stopped=true;if(actual)actual.cancel();else if(native)stop();}
 signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 (async()=>{
  try {
   if(config.captureBackend==='ffmpeg')throw Error('FFmpeg selected');
   signal.throwIfAborted();if(cancelled)throw Error('Microphone capture cancelled');
   await helper('capture-start',[file,config.micDevice],signal);native=true;
   if(cancelled){await stop();return;}
   const began=Date.now();
   while(true) {
    signal.throwIfAborted();if(cancelled)return;
    const status=await helper('capture-ready',[],signal);
    if(status.ready)break;
    if(Date.now()-began>10000)throw Error('Microphone startup timed out');await wait(10);
   }
   isReady=true;resolveReady();if(stopped){await stop();return;}
   const check=async()=>{
    if(finished||stopped)return;
    try{await helper('capture-ready',[],signal);if(!finished&&!stopped)timer=setTimeout(check,500);}
    catch(e){await closeNative().catch(()=>{});finish(e);}
   };
   timer=setTimeout(check,500);
  }catch(error) {
   // A start RPC can complete after its AbortSignal rejects. Always enqueue stop.
   await closeNative().catch(()=>{});
   if(cancelled||signal.aborted||config.captureBackend==='native'){finish(error);return;}
   fallbackReason=error.message;
   try {
    actual=fallback(file,config,signal,root);await actual.ready;resolveReady();
    if(stopped)actual.stop();await actual.done;finish();
   }catch(e){actual?.cancel();finish(e);}
  }
 })();
 return result;
}
module.exports={fastCapture};
