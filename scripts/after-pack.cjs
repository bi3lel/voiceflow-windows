const path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 if(process.platform!=='win32')throw Error('VoiceFlow Windows packaging requires Windows to embed its icon.');
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'set-windows-icon.ps1'),'-Executable',path.join(context.appOutDir,'VoiceFlow.exe'),'-Icon',path.join(__dirname,'../assets/icon.ico')],{windowsHide:true,stdio:'inherit'});
};
