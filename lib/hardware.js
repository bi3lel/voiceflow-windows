const os=require('node:os'),{execFile}=require('node:child_process');
const {findModel,runtimes}=require('./model-catalog');
function parseGpuInfo(csv){
 return csv.trim().split(/\r?\n/).filter(Boolean).map(line=>{
  const [name,driver,total,free,capability]=line.split(',').map(x=>x.trim());
  return {name,driver,totalMiB:Number(total),freeMiB:Number(free),computeCapability:Number(capability)};
 });
}
function recommendHardware({gpus=[],ramBytes=os.totalmem(),cpuName=os.cpus()[0]?.model||'Processor',arch=os.arch()}={}){
 // This pinned runtime uses CUDA 13. Unknown/older capability or drivers use
 // CPU. Memory thresholds are conservative setup policy, not benchmarks.
 const gpu=gpus[0];
 const compatible=!!gpu&&Number.parseFloat(gpu.driver)>=580&&gpu.computeCapability>=7.5&&gpu.totalMiB>=4096&&gpu.freeMiB>=2048;
 const device=compatible?'auto':'cpu',selected=compatible?runtimes:[runtimes[1]];
 return {modelId:'parakeet-v3',device,arch,ramBytes,cpuName,gpus,
  speechDownloadBytes:findModel('parakeet-v3').bytes+selected.reduce((n,r)=>n+r.bytes,0),
  title:compatible?'NVIDIA acceleration ready':'Works with your processor',
  message:compatible?'We’ll use your NVIDIA graphics card for faster dictation. A processor fallback is included.':'No compatible NVIDIA graphics card is needed. We’ll install the processor version for this computer.',
  runtimeMode:compatible?'gpu-and-cpu':'cpu-only'};
}
async function detectHardware(run=execFile){
 const gpus=await new Promise(resolve=>run('nvidia-smi',['--query-gpu=name,driver_version,memory.total,memory.free,compute_cap','--format=csv,noheader,nounits'],{windowsHide:true,timeout:4000},(error,out)=>resolve(error?[]:parseGpuInfo(out))));
 return recommendHardware({gpus});
}
module.exports={detectHardware,recommendHardware,parseGpuInfo};
