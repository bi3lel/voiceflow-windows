const fs=require('node:fs/promises'),path=require('node:path');
const revision='5359861c739e955e79d9a303bcbc70fb988958b1';
const whisper=(id,label,file,bytes,sha256,description)=>({id,label,backend:'whisper',file:'models/'+file,bytes,sha256,
  url:`https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/${file}`,description});
const whistleRuntimes=Object.freeze([
 {file:'runtime/whistle/needle.js',bytes:62823,sha256:'f3f7366dcad9555b792ee519d2518f3c506038bcb2ffd179e76e850000749359',url:'https://huggingface.co/Cactus-Compute/needle3/resolve/c7c415a3d1b3d929014bc6e866d51ebb971f7089/wasm/needle.js'},
 {file:'runtime/whistle/needle.wasm',bytes:903655,sha256:'c19b9ddf9c7de4eb4f37e5f1811c5bbea9f099041d2a27284daf89789ee8523d',url:'https://huggingface.co/Cactus-Compute/needle3/resolve/c7c415a3d1b3d929014bc6e866d51ebb971f7089/wasm/needle.wasm'}
]);
const catalog=Object.freeze([
 {id:'whistle',label:'Whistle · tiny CPU experiment',backend:'whistle',file:'models/whistle.cact',bytes:16919407,sha256:'b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb',url:'https://huggingface.co/Cactus-Compute/whistle/resolve/b358ddadd89b7a713b5aa131f23032d3cca1b251/whistle.cact',description:'Experimental CPU model. English, French, German, Spanish, Italian, Dutch and Polish; NO Portuguese. Maximum 30 seconds per recording. About 18 MB including runtime. Auto language only covers its seven languages.'},
 whisper('turbo-q8','Whisper Turbo Q8 · quality alternative','ggml-large-v3-turbo-q8_0.bin',874188075,'317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1','A tested multilingual alternative. Compare recognition with your own recordings.'),
 whisper('turbo-q5','Whisper Turbo Q5 · smaller','ggml-large-v3-turbo-q5_0.bin',574041195,'394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2','About 300 MB smaller. Earlier tests found more English/French errors; compare your own recordings.'),
 {id:'parakeet-v3',label:'Parakeet v3 Q8 · fast dictation',backend:'parakeet',file:'models/parakeet-tdt-0.6b-v3.q8_0.gguf',bytes:713975456,
  sha256:'e3880d0aaaaf2c308ea2c35016b2b895c423eb3fda924c1b463d1c19b7f4d32e',
  url:'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3/resolve/541d1f99c6b0c3cd0b11a95167540bb8edefd82b/parakeet-tdt-0.6b-v3.q8_0.gguf',
  description:'NVIDIA multilingual ASR, with its own native runtime. Automatically detects language. Portuguese training is European Portuguese; test Brazilian Portuguese separately.'}
]);
const runtimes=Object.freeze([
 {file:'runtime/parakeet',exe:'runtime/parakeet/bin/nemo-speech.exe',bytes:102183465,sha256:'9ffe5e842c39a7d3211f3b2c3b3aa1bca8c0b2455d96d961ed5f22ec5108f98d',archiveRoot:'nemo-speech-0.2.0-windows-x86_64-cuda',
  url:'https://github.com/NVIDIA/NeMo-Speech.cpp/releases/download/v0.2.0/nemo-speech-0.2.0-windows-x86_64-cuda.zip'},
 {file:'runtime/parakeet-cpu',exe:'runtime/parakeet-cpu/bin/nemo-speech.exe',bytes:5528418,sha256:'82c80451086e86194aba9af19f800da77cd66d1c28d993d0efceffd6cdb49bb8',archiveRoot:'nemo-speech-0.2.0-windows-x86_64-cpu',
  url:'https://github.com/NVIDIA/NeMo-Speech.cpp/releases/download/v0.2.0/nemo-speech-0.2.0-windows-x86_64-cpu.zip'}
]);
function findModel(id) {const item=catalog.find(x=>x.id===id);if(!item)throw Error('Unknown speech model');return item;}
function modelConfig(id) {
 const item=findModel(id);
 if(item.backend==='whistle')return {speechBackend:'whistle',whistleModel:item.file};
 return item.backend==='whisper'?{speechBackend:'whisper',whisperModel:item.file}:
  {speechBackend:'parakeet',parakeetModel:item.file,parakeetBin:runtimes[0].exe,parakeetCpuBin:runtimes[1].exe};
}
async function modelStatus(root,config) {
 const available=async(file,size)=>{try{const stat=await fs.stat(path.join(root,file));return stat.isFile()&&(!size||stat.size===size);}catch{return false;}};
 return Promise.all(catalog.map(async item=>{
  const gpuInstalled=item.backend==='parakeet'&&await available(runtimes[0].exe),cpuInstalled=item.backend==='parakeet'&&await available(runtimes[1].exe);
  const installed=await available(item.file,item.bytes)&&(item.backend!=='parakeet'||cpuInstalled)&&(item.backend!=='whistle'||(await Promise.all(whistleRuntimes.map(r=>available(r.file,r.bytes)))).every(Boolean));
  const selected=(config.speechBackend||'whisper')===item.backend && path.resolve(root,item.backend==='whisper'?config.whisperModel:item.backend==='whistle'?(config.whistleModel||'models/whistle.cact'):config.parakeetModel)===path.resolve(root,item.file);
  return {...item,installed,selected,gpuInstalled,cpuInstalled,downloadBytes:item.bytes+(item.backend==='parakeet'?runtimes.reduce((n,x)=>n+x.bytes,0):item.backend==='whistle'?whistleRuntimes.reduce((n,x)=>n+x.bytes,0):0)};
 }));
}
module.exports={catalog,runtimes,whistleRuntimes,findModel,modelConfig,modelStatus};
