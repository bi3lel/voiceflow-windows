const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
async function main(){
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'dist/win-unpacked'),version=require('../package.json').version;
 await fs.access(path.join(folder,'VoiceFlow.exe'));
 try{await fs.access(path.join(folder,'data'));throw Error('Refusing to package user data. Rebuild a clean folder.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.writeFile(path.join(folder,'portable.flag'),'');
 await fs.writeFile(path.join(folder,'START_HERE.txt'),'Open VoiceFlow.exe and follow setup. Keep this entire folder together. Settings, models and history stay here. Source: https://github.com/bi3lel/voiceflow-windows\r\n');
 const archive=path.join(root,'dist',`VoiceFlow-${version}-Windows-portable.zip`);
 const seven=require('7zip-bin').path7za;
 // Staged directory files are the same model-free payload as the installer.
 await fs.rm(archive,{force:true});
 execFileSync(seven,['a','-tzip','-mx=9',archive,'.'],{cwd:folder,windowsHide:true,stdio:'inherit'});
 const b=await fs.readFile(archive),sha=crypto.createHash('sha256').update(b).digest('hex');
 await fs.writeFile(path.join(root,'dist/SHA256SUMS.txt'),sha+'  '+path.basename(archive)+'\n');
 console.log('Portable ZIP:',archive);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
