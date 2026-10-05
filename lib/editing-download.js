const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {download,extract}=require('./model-download'),spec=require('../editing-runtime-manifest.json');
async function editingStatus(root,config={},options={}){
 const present=async(file,size)=>{try{const stat=await fs.stat(path.join(root,file));return stat.isFile()&&(!size||stat.size===size);}catch{return false;}};
 const valid=async runtime=>{try{const stamp=JSON.parse(await fs.readFile(path.join(root,runtime.file,'release.json'),'utf8'));return stamp.sha256===runtime.sha256&&await present(runtime.file+'/'+runtime.exe);}catch{return false;}};
 const cpuInstalled=await valid(spec.runtimes[0]),gpuInstalled=await valid(spec.runtimes[1]);
 const installed=cpuInstalled&&await present(spec.model.file,spec.model.bytes),selected=options.cpuOnly?spec.runtimes.slice(0,1):spec.runtimes;
 return {installed,cpuInstalled,gpuInstalled,backend:'llamacpp',name:spec.model.name,downloadBytes:spec.model.bytes+selected.reduce((n,r)=>n+r.bytes,0),enabled:installed&&config.useOllama&&config.editingBackend==='llamacpp'&&config.editingModel===spec.model.file};
}
async function installEditing(root,signal,progress=()=>{},options={}){
 const get=options.download||download,unzip=options.extract||extract;
 for(const runtime of options.cpuOnly?spec.runtimes.slice(0,1):spec.runtimes){
  signal.throwIfAborted();const destination=path.join(root,runtime.file);
  let existing=false;try{await fs.access(destination);existing=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){
   const stamp=JSON.parse(await fs.readFile(path.join(destination,'release.json'),'utf8'));
   if(stamp.sha256!==runtime.sha256)throw Error('Existing local AI runtime preserved; version differs');
   await fs.access(path.join(destination,runtime.exe));continue;
  }
  const stage=path.join(root,'data','model-download-'+randomUUID());await fs.mkdir(stage,{recursive:true});
  try{
   await get(runtime,path.join(stage,'runtime.zip'),signal,progress);
   progress({phase:'extracting',file:runtime.file});await unzip(path.join(stage,'runtime.zip'),path.join(stage,'unpacked'),signal);signal.throwIfAborted();
   await fs.access(path.join(stage,'unpacked',runtime.exe));
   const selected=path.join(stage,'selected');await fs.mkdir(selected);
   for(const entry of await fs.readdir(path.join(stage,'unpacked'),{withFileTypes:true})){
    if(entry.isFile()&&/^(?:llama-server(?:-impl)?\.(?:exe|dll)|llama-common\.dll|llama\.dll|ggml(?!-rpc).*\.dll|libomp\.dll|mtmd\.dll|LICENSE.*)$/.test(entry.name))await fs.copyFile(path.join(stage,'unpacked',entry.name),path.join(selected,entry.name));
   }
   await fs.writeFile(path.join(selected,'release.json'),JSON.stringify(runtime,null,2));
   await fs.mkdir(path.dirname(destination),{recursive:true});await fs.rename(selected,destination);
  }finally{await fs.rm(stage,{recursive:true,force:true});}
 }
 await get(spec.model,path.join(root,spec.model.file),signal,progress);
 return (options.status||editingStatus)(root,{},options);
}
module.exports={installEditing,editingStatus};
