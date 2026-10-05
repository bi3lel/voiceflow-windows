// Official pinned WASM CPU engine, isolated from Electron's main thread.
const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs');
let runtime;
function pcm(wav){
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV');
 let format,data;
 for(let p=12;p+8<=wav.length;){const size=wav.readUInt32LE(p+4),end=p+8+size;if(end>wav.length)throw Error('Incomplete WAV');const id=wav.toString('ascii',p,p+4);if(id==='fmt ')format=wav.subarray(p+8,end);if(id==='data')data=wav.subarray(p+8,end);p=end+(size%2);}
 if(!format||format.length<16||!data||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==1||format.readUInt32LE(4)!==16000||format.readUInt16LE(14)!==16||data.length%2)throw Error('Whistle requires finalized 16 kHz mono PCM16');
 if(data.length>16000*2*30)throw Error('Whistle supports up to 30 seconds. Use Parakeet or Whisper for longer dictation.');
 return data;
}
async function start(){
 const began=performance.now();
 runtime=await require(workerData.js)({wasmBinary:fs.readFileSync(workerData.wasm),print:()=>{},printErr:()=>{}});
 const bytes=fs.readFileSync(workerData.model),ptr=runtime._malloc(bytes.length);
 try{if(!ptr)throw Error('Whistle model allocation failed');runtime.HEAPU8.set(bytes,ptr);if(runtime._needle_load(ptr,BigInt(bytes.length))<0)throw Error(runtime.UTF8ToString(runtime._needle_last_error()));}finally{runtime._free(ptr);}
 parentPort.postMessage({ready:true,modelLoadMs:performance.now()-began});
 parentPort.on('message',async ({id,file,language})=>{
  let audio=0,out=0,lang=0;try{
   const data=pcm(fs.readFileSync(file)),count=data.length/2;audio=runtime._malloc(count*4);out=runtime._malloc(262144);
   if(!audio||!out)throw Error('Whistle allocation failed');
   if(language&&language!=='auto'){const bytes=Buffer.from(language+'\0');lang=runtime._malloc(bytes.length);runtime.HEAPU8.set(bytes,lang);}
   const samples=new Float32Array(runtime.HEAPU8.buffer,audio,count);for(let i=0;i<count;i++)samples[i]=data.readInt16LE(i*2)/32768;
   const began=performance.now(),code=runtime._needle_transcribe(audio,count,lang,0,0,out,262144);
   if(code<0)throw Error(runtime.UTF8ToString(runtime._needle_last_error()));
   const result=JSON.parse(runtime.UTF8ToString(out));if(typeof result.text!=='string')throw Error('Invalid Whistle result');
   parentPort.postMessage({id,result,transcriptionMs:performance.now()-began});
  }catch(e){parentPort.postMessage({id,error:e.message});}finally{for(const ptr of [audio,out,lang])if(ptr)runtime._free(ptr);}
 });
}
if(parentPort)start().catch(e=>parentPort.postMessage({error:e.message}));
module.exports={pcm};
