const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {testMicrophone}=require('../lib/microphone');
function wav(value) {
 const b=Buffer.alloc(44+6400);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(6400,40);for(let i=44;i<b.length;i+=2)b.writeInt16LE(value,i);return b;
}
test('microphone test reports measured signal or silence and deletes audio',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'vf-mic-'));
 try {
  for(const value of [0,1000]) {
   const states=[],capture=file=>{let done;return {ready:fs.writeFile(file,wav(value)),done:new Promise(r=>{done=r;}),stop:()=>done(),cancel:()=>done()};};
   const r=await testMicrophone({micDevice:'test'},'root',temp,new AbortController().signal,s=>states.push(s.state),.01,capture);
   assert.equal(r.rms,value);assert.equal(r.peak,value);assert.equal(r.usable,value>0);assert.deepEqual(states,['loading','recording']);assert.deepEqual(await fs.readdir(temp),[]);
  }
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('cancelled microphone test closes capture and removes private recording',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'vf-mic-')),a=new AbortController();let killed=false;
 try {
  const capture=file=>{let done;return {ready:fs.writeFile(file,wav(1000)),done:new Promise(r=>{done=r;}),stop:()=>done(),cancel:()=>{killed=true;done();}};};
  const task=testMicrophone({micDevice:'test'},'root',temp,a.signal,s=>{if(s.state==='recording')a.abort();},5,capture);
  await assert.rejects(task);assert(killed);assert.deepEqual(await fs.readdir(temp),[]);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
