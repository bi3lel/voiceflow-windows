const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {capture,inspectAudio}=require('./capture');
async function testMicrophone(config,root,temp,signal,notify,seconds=5,startCapture=capture) {
 const dir=path.join(temp,'mic-'+randomUUID());await fs.mkdir(dir,{recursive:true});let mic;
 try {
  notify({state:'loading'});mic=startCapture(path.join(dir,'test.wav'),config,signal,root);
  await mic.ready;signal.throwIfAborted();notify({state:'recording'});
  await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(Error('Microphone test cancelled'));};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},seconds*1000);
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
  mic.stop();await mic.done;signal.throwIfAborted();const stats=await inspectAudio(path.join(dir,'test.wav'));
  const usable=stats.rms>=25;
  return {...stats,device:config.micDevice,usable,message:usable?'Audio input detected. The microphone capture path works.':'No usable audio input. Unmute the physical microphone, check Windows input volume, and speak during the test.'};
 }finally {mic?.cancel();if(mic)await mic.done.catch(()=>{});await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={testMicrophone};
