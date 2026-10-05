const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {wer}=require('./benchmark');
(async()=>{
 const root=path.join(__dirname,'..'),corpus=JSON.parse(await fs.readFile(path.join(root,'benchmarks/corpus/corpus.json'),'utf8'));
 const dir=await fs.mkdtemp(path.join(root,'benchmarks','cli-'));const results=[];
 try{for(const clip of corpus){const base=path.join(dir,clip.id),start=performance.now();
 const logs=await new Promise((resolve,reject)=>execFile(path.join(root,'runtime/whisper/whisper-cli.exe'),
  ['-m',path.join(root,'models/ggml-medium.bin'),'-f',path.join(root,'benchmarks/corpus',clip.file),'-l',clip.language,'--output-txt','-of',base],
  {windowsHide:true,timeout:180000,maxBuffer:1024*1024},(err,out,stderr)=>err?reject(err):resolve(stderr)));
 const elapsed=performance.now()-start,text=await fs.readFile(base+'.txt','utf8');
 const load=logs.match(/load time\s*=\s*([\d.]+)\s*ms/);
 results.push({clip:clip.id,language:clip.language,totalProcessMs:elapsed,nativeLoadMs:load?Number(load[1]):null,transcript:text,...wer(clip.reference,text)});console.log(clip.id,Math.round(elapsed),'ms');
 }}finally{await fs.rm(dir,{recursive:true,force:true});}
 await fs.writeFile(path.join(root,'benchmarks/cli-medium-results.json'),JSON.stringify({model:'ggml-medium.bin',backend:'whisper.cpp 1.9.4 b5130 CLI, new process per utterance',method:'one run per clip; explicitly en/pt/fr; no translation',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
