const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {indicatorSize,indicatorPresentation}=require('../lib/indicator');
test('recording HUD disappears on release and never shows transcript completion',()=>{
  assert(indicatorSize.width<=420);assert(indicatorSize.height<=56);
  for(const state of ['loading','recording'])assert(indicatorPresentation({state}).visible);
  for(const state of ['stopping','transcribing','inserting'])assert.equal(indicatorPresentation({state}).visible,false);
  assert.equal(indicatorPresentation({state:'idle'}).visible,false);
  assert.equal(indicatorPresentation({state:'idle',completion:'paste-sent'}).visible,false);
  assert.equal(indicatorPresentation({state:'idle',completion:'cancelled'}).visible,false);
  assert.deepEqual(indicatorPresentation({state:'error'}),{visible:true,hideAfterMs:1800});
});
test('indicator renderer reports state without displaying detailed notifications',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../src/pill.html'),'utf8');
  const attributes={},pill={setAttribute:(name,value)=>{attributes[name]=value;}},label={};
  const handlers={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/hud.js'),'utf8'),{
    document:{getElementById:id=>id==='pill'?pill:label},window:{vf:{on:(channel,fn)=>{handlers[channel]=fn;}}}
  });
  const state=handlers.state;
  state({state:'loading'});assert.equal(attributes['aria-label'],'Starting');
  state({state:'recording'});assert.equal(pill.className,'recording');
  state({state:'error',message:'Long microphone instructions'});
  assert(!attributes['aria-label'].includes('Long microphone instructions'));
  assert.equal(label.textContent,'Microphone unavailable');
  assert.equal(handlers['last-text'],undefined);
  state({state:'transcribing'});assert.equal(label.textContent,'Transcribing');
  state({state:'idle',completion:'paste-sent'});assert.equal(label.textContent,'');assert.equal(pill.className,'idle');
  assert(!html.includes('id="details"'));assert(!html.includes('<button'));
});
