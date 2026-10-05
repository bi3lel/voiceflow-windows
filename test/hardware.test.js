const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parseGpuInfo,recommendHardware,detectHardware}=require('../lib/hardware');
const {runtimes,findModel,modelStatus}=require('../lib/model-catalog'),{installModel}=require('../lib/model-download'),{defaults}=require('../lib/config');
const good={name:'NVIDIA test GPU',driver:'617.14',totalMiB:8192,freeMiB:4096,computeCapability:8.9};
test('hardware plan selects NVIDIA acceleration only with compatible driver, architecture and memory',()=>{
 const gpu=recommendHardware({gpus:[good]});assert.equal(gpu.device,'auto');assert.equal(gpu.speechDownloadBytes,821687339);
 for(const gpus of [[],[{...good,driver:'570.0'}],[{...good,computeCapability:6.1}],[{...good,totalMiB:2048}],[{...good,freeMiB:800}],[{...good,computeCapability:NaN}]]){
  const cpu=recommendHardware({gpus});assert.equal(cpu.device,'cpu');assert.equal(cpu.modelId,'parakeet-v3');assert.equal(cpu.speechDownloadBytes,719503874);
 }
});
test('hardware probe parses real NVIDIA CSV and missing NVIDIA tooling is a CPU choice, not an error',async()=>{
 assert.deepEqual(parseGpuInfo('NVIDIA GeForce RTX 5060, 617.14, 8151, 6847, 12.0\r\n'),[{name:'NVIDIA GeForce RTX 5060',driver:'617.14',totalMiB:8151,freeMiB:6847,computeCapability:12}]);
 assert.equal((await detectHardware((exe,args,options,callback)=>callback(Error('not installed')))).device,'cpu');
 assert.equal((await detectHardware((exe,args,options,callback)=>callback(null,'GPU, 617.14, 8192, 4000, 8.9'))).device,'auto');
});
test('processor setup downloads only its own runtime and the compatible Parakeet model',async()=>{
 for(const cpuOnly of [true,false]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-hw-install-'));const requested=[];let archive;
  try{
   await installModel('parakeet-v3',root,new AbortController().signal,()=>{},{cpuOnly,
    download:async(item,file)=>{requested.push(item.file);archive=item;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture');},
    extract:async(zip,dest)=>{await fs.mkdir(path.join(dest,archive.archiveRoot,'bin'),{recursive:true});await fs.writeFile(path.join(dest,archive.archiveRoot,'bin/nemo-speech.exe'),'fixture');}
   });
   assert.deepEqual(requested,[...(cpuOnly?[runtimes[1].file]:runtimes.map(r=>r.file)),findModel('parakeet-v3').file]);
   await fs.access(path.join(root,runtimes[1].exe));if(cpuOnly)await assert.rejects(fs.access(path.join(root,runtimes[0].exe)));
   assert.deepEqual(await fs.readdir(path.join(root,'data')),[]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});
test('a model installed with the processor runtime alone is available for selection',async t=>{
 const item=findModel('parakeet-v3'),root=path.resolve('test-CPU-only-root');
 t.mock.method(fs,'stat',async file=>{
  if(file===path.join(root,item.file))return {size:item.bytes,isFile:()=>true};
  if(file===path.join(root,runtimes[1].exe))return {size:1,isFile:()=>true};
  throw Object.assign(Error('missing'),{code:'ENOENT'});
 });
 const status=(await modelStatus(root,{...defaults,speechBackend:'parakeet'})).find(x=>x.id===item.id);
 assert.equal(status.installed,true);assert.equal(status.cpuInstalled,true);assert.equal(status.gpuInstalled,false);
});
