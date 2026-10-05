const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{execFile}=require('node:child_process');
const {findModel,runtimes,whistleRuntimes}=require('./model-catalog');
async function verify(file,item) {
 const stat=await fs.stat(file);if(stat.size!==item.bytes)throw Error('Downloaded file size does not match the pinned model');
 const hash=createHash('sha256');for await(const block of createReadStream(file))hash.update(block);
 if(hash.digest('hex')!==item.sha256)throw Error('Downloaded file checksum does not match the pinned model');
}
async function download(item,file,signal,progress=()=>{},request=fetch) {
 signal.throwIfAborted();await fs.mkdir(path.dirname(file),{recursive:true});
 try{await fs.access(file);await verify(file,item);return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const partial=file+'.partial-'+randomUUID();let output;
 try {
  const response=await request(item.url,{signal:AbortSignal.any([signal,AbortSignal.timeout(1800000)])});
  if(!response.ok||!response.body)throw Error('Model download HTTP '+response.status);
  output=await fs.open(partial,'wx');let bytes=0,last=0;const hash=createHash('sha256');
  for await(const block of response.body) {
   signal.throwIfAborted();bytes+=block.length;if(bytes>item.bytes)throw Error('Download exceeds the expected size');
   hash.update(block);await output.writeFile(block);
   if(Date.now()-last>200){progress({file:item.file,bytes,total:item.bytes});last=Date.now();}
  }
  if(bytes!==item.bytes||hash.digest('hex')!==item.sha256)throw Error('Download is incomplete or its checksum is invalid');
  signal.throwIfAborted();await output.close();output=null;
  // Do not replace a model another installer/user created while this download ran.
  try{await fs.access(file);throw Error('Destination already exists; original file retained');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.rename(partial,file);progress({file:item.file,bytes,total:item.bytes,complete:true});
 }finally{await output?.close().catch(()=>{});await fs.rm(partial,{force:true}).catch(()=>{});}
}
function extract(archive,destination,signal) {
 const script=path.join(__dirname,'../scripts/extract-model-runtime.ps1').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Archive',archive,'-Destination',destination],
  {windowsHide:true,timeout:120000,signal},(error,out,err)=>error?reject(Error(err.trim()||error.message)):resolve()));
}
async function installModel(id,root,signal,progress=()=>{},options={}) {
 const item=findModel(id);
 const get=options.download||download,unzip=options.extract||extract;
 if(item.backend==='whistle')for(const runtime of whistleRuntimes)await get(runtime,path.join(root,runtime.file),signal,progress);
 if(item.backend==='parakeet') {
  for(const runtime of options.cpuOnly?[runtimes[1]]:runtimes) {
   const destination=path.join(root,runtime.file);
   try{await fs.access(path.join(root,runtime.exe));continue;}catch{}
   const stage=path.join(root,'data','model-download-'+randomUUID());await fs.mkdir(stage,{recursive:true});
   try {
    const archive=path.join(stage,'runtime.zip');await get(runtime,archive,signal,progress);
    progress({file:runtime.file,phase:'extracting'});await unzip(archive,path.join(stage,'unpacked'),signal);
    signal.throwIfAborted();const folder=path.join(stage,'unpacked',runtime.archiveRoot);
    await fs.access(path.join(folder,'bin/nemo-speech.exe'));await fs.mkdir(path.dirname(destination),{recursive:true});
    // Rename refuses an existing nonempty runtime directory: never remove an old installation.
    await fs.rename(folder,destination);
   }finally{await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
  }
 }
 await get(item,path.join(root,item.file),signal,progress);
 return {installed:true,id};
}
async function cleanAbandonedDownloads(root) {
 const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
 for(const directory of ['data','models']) {
  const base=path.resolve(root,directory);
  const entries=await fs.readdir(base,{withFileTypes:true}).catch(()=>[]);
  for(const entry of entries) {
   const stage=directory==='data'&&entry.isDirectory()&&new RegExp('^model-download-'+uuid+'$','i').test(entry.name);
   const partial=directory==='models'&&entry.isFile()&&[...require('./model-catalog').catalog,require('../editing-runtime-manifest.json').model].some(item=>new RegExp('^'+path.basename(item.file).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.partial-'+uuid+'$','i').test(entry.name));
   if(!stage&&!partial)continue;
   const target=path.resolve(base,entry.name);if(!target.startsWith(base+path.sep))throw Error('Invalid download cleanup path');
   await fs.rm(target,{recursive:stage,force:true});
  }
 }
 const blobRoot=path.resolve(root,'models/ollama/blobs');
 const known=require('../ai-runtime-manifest.json').model.blobs.map(b=>path.basename(b.file));
 for(const entry of await fs.readdir(blobRoot,{withFileTypes:true}).catch(()=>[])){
  if(!entry.isFile()||!known.some(name=>new RegExp('^'+name+'\\.partial-'+uuid+'$','i').test(entry.name)))continue;
  const target=path.resolve(blobRoot,entry.name);if(!target.startsWith(blobRoot+path.sep))throw Error('Invalid editing download cleanup path');
  await fs.rm(target,{force:true});
 }
}
module.exports={download,verify,installModel,cleanAbandonedDownloads,extract};
