// Identical local WAV files. No microphone, text editing, clipboard or config changes.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {SpeechEngine}=require('../lib/speech-engine'),{defaults}=require('../lib/config'),{wer}=require('./benchmark');
async function compare(root,corpusFile,output){
 const clips=JSON.parse(await fs.readFile(corpusFile,'utf8')).filter(c=>['en','fr'].includes(c.language));
 const report={date:new Date().toISOString(),cpu:os.cpus()[0]?.model,method:'Same six FLEURS clips, automatic language, one excluded warmup, one measured pass. Whistle CPU/WASM versus existing Parakeet auto GPU/CPU. Model loading separate. No AI editing or insertion. Small diagnostic sample, not a population accuracy estimate. Portuguese unsupported by Whistle.',loads:[],results:[]};
 for(const backend of ['whistle','parakeet']){
  const engine=new SpeechEngine(root,path.join(path.dirname(output),'whistle-benchmark-worker')),config={...defaults,speechBackend:backend},signal=new AbortController().signal;
  try{
   const began=performance.now();await engine.warm(config,signal);report.loads.push({backend,wallMs:performance.now()-began,...engine.info});
   await engine.transcribe(path.resolve(path.dirname(corpusFile),clips[0].file),config,signal);
   for(const clip of clips){const file=path.resolve(path.dirname(corpusFile),clip.file),bytes=await fs.readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==clip.sha256)throw Error('Corpus checksum mismatch');
    const r=await engine.transcribe(file,config,signal);report.results.push({id:clip.id,language:clip.language,reference:clip.reference,text:r.text,...r.metrics,...wer(clip.reference,r.text),backend});console.log(backend,clip.id,r.metrics.transcriptionMs.toFixed(0)+' ms');}
  }finally{await engine.unload();}
 }
 report.summary=[];
 for(const backend of ['whistle','parakeet'])for(const language of ['en','fr']){const rows=report.results.filter(r=>r.backend===backend&&r.language===language),times=rows.map(r=>r.transcriptionMs).sort((a,b)=>a-b);report.summary.push({backend,language,clips:rows.length,werPercent:100*rows.reduce((n,r)=>n+r.edits,0)/rows.reduce((n,r)=>n+r.words,0),medianMs:times[Math.floor(times.length/2)]});}
 await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));return report;
}
if(require.main===module){const [root,corpus,out]=process.argv.slice(2);compare(path.resolve(root),path.resolve(corpus),path.resolve(out)).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={compare};
