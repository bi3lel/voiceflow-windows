const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {installEditing,editingStatus}=require('../lib/editing-download'),{cleanAbandonedDownloads}=require('../lib/model-download'),{invokes}=require('../lib/ipc');
const spec=require('../editing-runtime-manifest.json');
test('missing optional editing model reports uninstalled without any network request',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-edit-status-'));
 try{assert.equal((await editingStatus(root)).installed,false);for(const id of ['get-editing-model','download-editing-model','enable-editing-model'])assert(invokes.includes(id));}
 finally{await fs.rm(root,{recursive:true,force:true});}
});
test('editing setup stages only the required server libraries and pinned GGUF, never changes user settings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-edit-'));
 const requested=[];
 try{
  await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/config.json'),'keep user settings');
  await installEditing(root,new AbortController().signal,()=>{},{
   download:async(item,file)=>{requested.push(item);assert(/^[0-9a-f]{64}$/.test(item.sha256));assert(item.bytes>0);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture');},
   extract:async(archive,dest)=>{await fs.mkdir(dest);for(const name of ['llama-server.exe','llama-server-impl.dll','ggml-cpu-x64.dll','llama-quantize.exe','llama-cli-impl.dll'])await fs.writeFile(path.join(dest,name),'fixture');},status:async()=>({installed:true})
  });
  assert.equal(requested.length,3);assert(requested.every(x=>x.url.startsWith('https://')));
  await fs.access(path.join(root,'runtime/llama-cpu/llama-server-impl.dll'));await assert.rejects(fs.access(path.join(root,'runtime/llama-cpu/llama-quantize.exe')));await assert.rejects(fs.access(path.join(root,'runtime/llama-cpu/llama-cli-impl.dll')));
  assert.equal(await fs.readFile(path.join(root,'data/config.json'),'utf8'),'keep user settings');
  assert.deepEqual((await fs.readdir(path.join(root,'data'))),['config.json']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('editing setup preserves an existing different runtime and cancellation removes stage',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-edit-fail-'));
 try{
  await fs.mkdir(path.join(root,'runtime/llama-cpu'),{recursive:true});await fs.writeFile(path.join(root,'runtime/llama-cpu/release.json'),JSON.stringify({sha256:'different'}));
  await assert.rejects(installEditing(root,new AbortController().signal,()=>{}, {download:()=>{throw Error('must not download');}}),/preserved/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'runtime/llama-cpu/release.json'))).sha256,'different');
  const other=path.join(root,'fresh'),abort=new AbortController();
  await assert.rejects(installEditing(other,abort.signal,()=>{},{download:async()=>{abort.abort();abort.signal.throwIfAborted();}}));
  assert.deepEqual(await fs.readdir(path.join(other,'data')),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('crashed editing downloads remove only known pinned partial files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-edit-clean-'));
 try{
  const base=path.join(root,'models');await fs.mkdir(base,{recursive:true});
  const partial=path.basename(spec.model.file)+'.partial-00000000-0000-0000-0000-000000000000';
  await fs.writeFile(path.join(base,partial),'incomplete');await fs.writeFile(path.join(base,'user-file.partial-00000000-0000-0000-0000-000000000000'),'preserve');
  await cleanAbandonedDownloads(root);assert.deepEqual(await fs.readdir(base),['user-file.partial-00000000-0000-0000-0000-000000000000']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('processor-only editing setup omits the GPU archive but keeps the same model',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vf-editor-cpu-')),requested=[];
 try{await installEditing(root,new AbortController().signal,()=>{},{cpuOnly:true,
  download:async(item,file)=>{requested.push(item);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture');},
  extract:async(_archive,destination)=>{await fs.mkdir(destination);await fs.writeFile(path.join(destination,'llama-server.exe'),'fixture');},status:async()=>({installed:true})
 });assert.deepEqual(requested.map(r=>r.file),[spec.runtimes[0].file,spec.model.file]);await assert.rejects(fs.access(path.join(root,spec.runtimes[1].file)));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
