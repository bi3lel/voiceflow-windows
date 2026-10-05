const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {roots}=require('../lib/config');
const {releasePolicy,requireManagedEditing}=require('../lib/release-policy');
test('installed downloads and history survive app upgrades; portable files follow the SSD',()=>{
 const installed=roots({packaged:true,execPath:'C:/Apps/VoiceFlow/VoiceFlow.exe',userData:'C:/Profile/VoiceFlow'});
 assert.equal(installed.root,path.join('C:/Profile/VoiceFlow','offline'));
 assert.equal(installed.data,'C:/Profile/VoiceFlow');
 assert.notEqual(installed.root,installed.bundledRoot);
 const portable=roots({packaged:true,execPath:'X:/VoiceFlow/VoiceFlow.exe',portableDir:'X:/VoiceFlow',userData:'unused'});
 assert.equal(portable.root,'X:/VoiceFlow');assert.equal(portable.data,path.join('X:/VoiceFlow','data'));
});
test('public release blocks managed research-model installation without changing personal builds',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vf-policy-'));
 try{requireManagedEditing(releasePolicy(dir));fs.writeFileSync(path.join(dir,'release-policy.json'),JSON.stringify({managedEditing:false,reason:'License review pending'}));assert.throws(()=>requireManagedEditing(releasePolicy(dir)),/License review/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
