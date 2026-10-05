// Explicit download only: node scripts/setup-editor.cjs APP_FOLDER [--cpu]
const path=require('node:path'),{installEditing}=require('../lib/editing-download');
const [root,...flags]=process.argv.slice(2);if(!root)throw Error('Provide the VoiceFlow application folder.');
const {detectHardware}=require('../lib/hardware');
(async()=>{const hardware=await detectHardware();const result=await installEditing(path.resolve(root),new AbortController().signal,p=>{if(p.phase||p.complete)console.log(p.file,p.phase||'verified');},{cpuOnly:flags.includes('--cpu')||hardware.device==='cpu'});console.log(JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
