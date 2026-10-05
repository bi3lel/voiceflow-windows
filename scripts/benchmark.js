// Same WAV bytes for every model; warm-up excluded from warm measurements. No live insertion simulated.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {Engine}=require('../lib/engine');const {defaults}=require('../lib/config');
function tokens(t){return t.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').trim().split(/\s+/).filter(Boolean);}
function wer(ref,hyp){const a=tokens(ref),b=tokens(hyp);let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return {edits:row[b.length],words:a.length,wer:row[b.length]/Math.max(1,a.length)};}
async function main(){
 const root=path.join(__dirname,'..'),corpusFile=path.resolve(process.argv[2]||path.join(root,'benchmarks/corpus/corpus.json'));
 const corpus=JSON.parse((await fs.readFile(corpusFile,'utf8')).replace(/^\uFEFF/,''));
 const models=process.argv.slice(3);if(!models.length)models.push('models/ggml-medium.bin','models/ggml-large-v3-turbo.bin','models/ggml-large-v3-turbo-q5_0.bin','models/ggml-large-v3-turbo-q8_0.bin');
 const report={timestamp:new Date().toISOString(),platform:process.platform,node:process.version,cpu:require('node:os').cpus()[0]?.model,
   backend:'whisper.cpp 1.9.4 b5130',corpus:corpusFile,method:'one warm-up per model; three warm repetitions per clip; explicit language; WER lowercased/punctuation removed; no insertion',results:[],failures:[]};
 const gpu=()=>{try{return execFileSync('nvidia-smi',['--query-gpu=name,memory.used,memory.total,driver_version','--format=csv,noheader'],{encoding:'utf8',windowsHide:true}).trim();}catch{return 'unavailable';}};
 report.gpuBefore=gpu();
 for(const model of models){
  const engine=new Engine(root,path.join(root,'benchmarks','temp'));const config={...defaults,whisperModel:model,device:process.env.VOICEFLOW_BENCH_DEVICE||'cuda'};const abort=new AbortController();
  try{
   const debug=setInterval(()=>console.log('Loading',model,(engine.info.log||'').slice(-600)),15000);
   const begin=performance.now();try{await engine.ensure(config,abort.signal);}finally{clearInterval(debug);}const loadMs=performance.now()-begin;
   const loaded={...engine.info};report.results.push({model,phase:'load',loadMs,device:loaded.device,gpu:gpu(),log:loaded.log});
   const first=path.resolve(path.dirname(corpusFile),corpus[0].file),warmBegin=performance.now();await engine.transcribe(first,config,abort.signal);
   report.results.push({model,phase:'warmup',firstInferenceMs:performance.now()-warmBegin});
   for(const clip of corpus){
    const file=path.resolve(path.dirname(corpusFile),clip.file),bytes=await fs.readFile(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(clip.sha256 && clip.sha256!==hash)throw Error('Corpus checksum mismatch');
    for(let repetition=0;repetition<3;repetition++){
     const result=await engine.transcribe(file,{...config,language:clip.language},abort.signal);
     const entry={model,clip:clip.id,language:clip.language,repetition,sha256:hash,transcript:result.text,reference:clip.reference,...wer(clip.reference,result.text),...result.metrics};
     report.results.push(entry);console.log(JSON.stringify(entry));
    }
   }
  }catch(e){report.failures.push({model,error:e.message,log:engine.info.log});console.error(model,e.message);}
  finally{await engine.unload();}
 }
 report.gpuAfter=gpu();const output=path.join(root,'benchmarks',`results-${Date.now()}.json`);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));console.log('Saved',output);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={wer};
