const fs=require('node:fs/promises'),path=require('node:path'),{createReadStream}=require('node:fs'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
async function main(){
 if(process.platform!=='win32')throw Error('Build this Windows application on Windows.');
 const root=path.resolve(__dirname,'..'),spec=require('../runtime-manifest.json').cpu;
 const runtime=path.join(root,'runtime/whisper-cpu'),stamp=path.join(runtime,'release.json');
 try{const prior=JSON.parse(await fs.readFile(stamp,'utf8'));if(prior.sha256!==spec.sha256)throw Error('Existing runtime version differs; original preserved');await fs.access(path.join(runtime,'whisper-server.exe'));return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const cache=path.join(root,'setup-cache');await fs.mkdir(cache,{recursive:true});const archive=path.join(cache,'whisper-cpu.zip');
 execFileSync('curl.exe',['--fail','--location','--retry','3','--max-time','300','-o',archive,spec.url],{stdio:'inherit',windowsHide:true});
 const hash=createHash('sha256');for await(const block of createReadStream(archive))hash.update(block);if(hash.digest('hex')!==spec.sha256)throw Error('Runtime checksum mismatch');
 const stage=await fs.mkdtemp(path.join(cache,'cpu-'));
 try{
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'extract-model-runtime.ps1'),'-Archive',archive,'-Destination',stage],{stdio:'inherit',windowsHide:true});
  async function find(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name==='whisper-server.exe')return path.dirname(p);if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
  const bin=await find(stage);if(!bin)throw Error('Missing Whisper server');await fs.mkdir(path.dirname(runtime),{recursive:true});
  const selected=path.join(stage,'selected');await fs.mkdir(selected);
  for(const entry of await fs.readdir(bin,{withFileTypes:true}))if(entry.isFile()&&(/\.dll$/i.test(entry.name)||entry.name==='whisper-server.exe'||/^LICENSE/.test(entry.name)))await fs.copyFile(path.join(bin,entry.name),path.join(selected,entry.name));
  await fs.copyFile(path.join(root,'assets/licenses/whisper.cpp.txt'),path.join(selected,'LICENSE-whisper.cpp.txt'));
  await fs.writeFile(path.join(selected,'release.json'),JSON.stringify(spec,null,2));await fs.rename(selected,runtime);
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
