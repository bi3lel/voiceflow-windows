// Measures real microphone startup, retaining timings only (never audio).
const fs = require('node:fs/promises');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {capture, inspectAudio} = require('../lib/capture');
const {load} = require('../lib/config');
async function main() {
  const root = path.resolve(process.argv[2]);
  const label = process.argv[3];
  if (!['before','after'].includes(label)) throw Error('Choose before or after');
  const config = load(path.join(root,'data/config.json'),{});
  const samples = [];
  for(let i=0;i<3;i++) {
    const file = path.join(root,'data',`capture-probe-${process.pid}-${i}.wav`);
    const abort = new AbortController();
    let task;
    const begin = performance.now();
    try {
      task = capture(file,config,abort.signal,root);
      await task.ready;
      const readyMs = performance.now()-begin;
      await new Promise(resolve=>setTimeout(resolve,300));
      task.stop();await task.done;
      const audio = await inspectAudio(file);
      samples.push({readyMs,...audio});
      console.log(JSON.stringify(samples.at(-1)));
    } finally {
      abort.abort();await task?.done.catch(()=>{});
      await fs.unlink(file).catch(()=>{});
    }
  }
  const report = {label,microphone:config.micDevice,date:new Date().toISOString(),samples};
  await fs.writeFile(path.join(__dirname,'../benchmarks',`capture-startup-${label}.json`),JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
