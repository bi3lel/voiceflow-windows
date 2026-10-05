const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('redesigned settings keep every existing configurable field and one label per control',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/settings.html'),'utf8');
 for(const id of ['hotkey','ffmpegBin','whisperCpuBin','device','historyEnabled','micDevice','language','pasteAuto','smartFormat','whisperBin','whisperModel','useOllama','cleanupMode','managedOllama','ollamaUrl','ollamaModel','cleanupPrompt','startWithWindows']) {
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert(html.includes('role="tablist"'));assert(html.includes('aria-selected="true"'));
 assert(!html.includes('display:none; }'));
});
test('all renderer styles are local and reduced-motion is supported',()=>{
 const root=path.join(__dirname,'../src');
 for(const name of ['pill.html','settings.html','history.html']) {
  const html=fs.readFileSync(path.join(root,name),'utf8');
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
   assert(!/^https?:/.test(match[1]));assert(fs.existsSync(path.join(root,match[1])));
  }
 }
 const css=fs.readFileSync(path.join(root,'ui.css'),'utf8');assert(css.includes('prefers-reduced-motion'));assert(css.includes('prefers-color-scheme:light'));
});
