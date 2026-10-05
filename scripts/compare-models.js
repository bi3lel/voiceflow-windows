// File-only paired benchmark. Does not change VoiceFlow settings or use clipboard/microphone.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {SpeechEngine}=require('../lib/speech-engine'),{defaults}=require('../lib/config'),{wer}=require('./benchmark');
function percentile(values,q){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];}
function characterScore(reference,text){
 const normalized=s=>s.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/gu,' ').trim();
 const a=[...normalized(reference)],b=[...normalized(text)];let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
 return {characterEdits:row[b.length],characters:a.length};
}
function aggregate(results) {
 if(!results.length)return {count:0,werPercent:null,cerPercent:null,medianMs:null,p95Ms:null};
 const words=results.reduce((n,x)=>n+x.words,0),characters=results.reduce((n,x)=>n+x.characters,0);
 return {count:results.length,werPercent:100*results.reduce((n,x)=>n+x.edits,0)/words,
  cerPercent:100*results.reduce((n,x)=>n+x.characterEdits,0)/characters,
  medianMs:percentile(results.map(x=>x.transcriptionMs),0.5),p95Ms:percentile(results.map(x=>x.transcriptionMs),0.95),
  medianRealTimeFactor:percentile(results.map(x=>x.transcriptionMs/(1000*x.durationSeconds)),0.5),referenceWords:words};
}
function pairedSummary(report) {
 let seed=20261004;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const summary={method:'WER/CER: NFC, lowercase, punctuation removed; no semantic/number normalization. Paired clip bootstrap (2000 draws, seed 20261004); does not account for correlated speakers/repeated sentences.',languages:{}};
 for(const language of ['en','pt','fr']) {
  const whisper=report.results.filter(x=>x.backend==='whisper'&&x.language===language),parakeet=report.results.filter(x=>x.backend==='parakeet'&&x.language===language);
  const pairs=whisper.map(w=>({w,p:parakeet.find(p=>p.id===w.id)})).filter(x=>x.p);
  const deltas=[];
  for(let repeat=0;repeat<2000 && pairs.length;repeat++){
   let we=0,pe=0,words=0;
   for(let i=0;i<pairs.length;i++){const pair=pairs[Math.floor(random()*pairs.length)];we+=pair.w.edits;pe+=pair.p.edits;words+=pair.w.words;}
   deltas.push(100*(pe-we)/words);
  }
  summary.languages[language]={whisper:aggregate(whisper),parakeet:aggregate(parakeet),pairedClips:pairs.length,
   parakeetMinusWhisperWer95CI:[percentile(deltas,0.025),percentile(deltas,0.975)],
   parakeetFewerErrors:pairs.filter(x=>x.p.edits<x.w.edits).length,whisperFewerErrors:pairs.filter(x=>x.w.edits<x.p.edits).length,ties:pairs.filter(x=>x.w.edits===x.p.edits).length,
   uniqueReferences:new Set(whisper.map(x=>x.reference)).size,
   durationRangeSeconds:[Math.min(...whisper.map(x=>x.durationSeconds)),Math.max(...whisper.map(x=>x.durationSeconds))]};
 }
 return summary;
}
function gpu(){try{return execFileSync('nvidia-smi',['--query-gpu=name,memory.used,memory.total,driver_version','--format=csv,noheader'],{encoding:'utf8',windowsHide:true}).trim();}catch{return 'unavailable';}}
function memory(pid){try{return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-Process -Id ${Number(pid)} | Select-Object WorkingSet64,PeakWorkingSet64 | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));}catch{return null;}}
async function compare(root,corpusFile,output,overrides={}) {
 const corpus=JSON.parse(await fs.readFile(corpusFile,'utf8'));
 const report={date:new Date().toISOString(),corpus:corpusFile,method:'Identical test WAVs, one excluded silent warmup per backend; one timed transcription per unique clip; automatic language on both, CUDA only, no AI cleanup, no paste.',results:[],loads:[],failures:[],gpuBefore:gpu()};
 for(const clip of corpus){const bytes=await fs.readFile(path.resolve(path.dirname(corpusFile),clip.file));if(createHash('sha256').update(bytes).digest('hex')!==clip.sha256)throw Error('Corpus hash mismatch: '+clip.id);}
 for(const backend of ['parakeet','whisper']) {
  const engine=new SpeechEngine(root,path.join(path.dirname(output),'benchmark-worker-'+backend));
  const config={...defaults,...overrides,speechBackend:backend,language:'auto',device:'cuda'};const signal=new AbortController().signal;
  try {
   await engine.warm(config,signal);
   const initial={...engine.info};report.loads.push({backend,modelLoadMs:initial.modelLoadMs,warmupMs:initial.warmupMs,device:initial.device,log:initial.log,gpuLoadedWholeDevice:gpu()});
   for(let i=0;i<corpus.length;i++){
    const clip=corpus[i];
    try {
     const result=await engine.transcribe(path.resolve(path.dirname(corpusFile),clip.file),config,signal);
     report.results.push({id:clip.id,language:clip.language,durationSeconds:clip.durationSeconds,sha256:clip.sha256,reference:clip.reference,normalizedReference:clip.normalizedReference,text:result.text,...wer(clip.reference,result.text),...characterScore(clip.reference,result.text),...result.metrics,engineBackend:result.metrics.backend,backend});
    }catch(e){report.failures.push({backend,id:clip.id,error:e.message});}
    if((i+1)%25===0){await fs.writeFile(output,JSON.stringify(report,null,2));console.log(backend+': '+(i+1)+' / '+corpus.length+' clips');}
   }
   report.loads[report.loads.length-1].workerMemoryBytes=memory(engine.engines[backend].proc?.pid);
  }catch(e){report.failures.push({backend,error:e.message,log:engine.info.log});}
  finally{await engine.unload();}
 }
 report.gpuAfter=gpu();report.summary=pairedSummary(report);await fs.writeFile(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({failures:report.failures,summary:report.summary},null,2));return report;
}
if(require.main===module){const [root,corpusFile,output,overridesFile]=process.argv.slice(2);if(!root||!corpusFile||!output)throw Error('Usage: node scripts/compare-models.js APP_ROOT CORPUS_JSON OUTPUT_JSON [OVERRIDES_JSON]');
 (async()=>compare(path.resolve(root),path.resolve(corpusFile),path.resolve(output),overridesFile?JSON.parse(await fs.readFile(overridesFile,'utf8')):{}))().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={compare,aggregate,pairedSummary,characterScore};
