const {test}=require('node:test'),assert=require('node:assert/strict');
const {cleanup,detectFormat,needsEditing}=require('../lib/format'),{defaults,validate}=require('../lib/config');
const {updateEntry,exportHistory}=require('../lib/history'),{invokes,sends}=require('../lib/ipc');
test('ordinary multilingual dictation bypasses AI even with smart editing enabled',async()=>{
 for(const raw of ['Please send João 42 euros tomorrow.','Não envie a fatura para João.','François ne peut pas venir mardi.','Gosto de água, banana e abacaxi.']){
  const result=await cleanup(raw,{...defaults,useOllama:true,cleanupMode:'dictation'},new AbortController().signal,()=>{throw Error('AI must not run');});assert.equal(result.text,raw);assert.equal(result.mode,'whisper');assert.equal(result.warning,undefined);
 }
});
test('only explicit lists and corrections request editing; retired formats migrate safely',()=>{
 for(const raw of ['My list: water and bananas','Tuesday, sorry, I mean Thursday.','Três litros, não, pera, dois.','I changed my mind, make it Friday.'])assert(needsEditing(raw));
 for(const raw of ['Não quero dizer que João errou.','Question: Does this work? Answer: Yes.','Write an email: hello Ana.'])assert(!needsEditing(raw));
 assert.equal(detectFormat('My list: water'),'list');assert.equal(detectFormat('Write an email: hello'),'plain');
 for(const outputFormat of ['speakers','email','faq'])assert.equal(validate({outputFormat,micDevice:'Microphone'}).outputFormat,'auto');assert.throws(()=>validate({outputFormat:'html'}));
});
test('fast speech requests never enable token timestamps',()=>{
 const {inferenceFields}=require('../lib/engine');for(const language of ['auto','en','pt','fr']){const fields=inferenceFields(language);assert.equal(fields.response_format,'json');assert.equal(fields.no_timestamps,'true');assert.equal(fields.token_timestamps,'false');assert.equal(fields.translate,'false');}
});
test('exact repeated-unit corrections collapse before AI but contrasts and raw original remain intact',()=>{
 const {prepareCorrections}=require('../lib/format');
 const raw='Lista: três litros de água, não, pera, dois litros de água, um quilo de banana e abacaxi.';
 assert.equal(prepareCorrections(raw),'Lista: dois litros de água, um quilo de banana e abacaxi.');assert(raw.includes('três'));
 assert.equal(prepareCorrections('Buy three litres, no, two litres.'),'Buy two litres.');
 assert.equal(prepareCorrections("deux litres d'eau, non, pardon, trois litres d'eau"),"trois litres d'eau");
 const contrast='Compre três litros de água, não dois litros de água.';assert.equal(prepareCorrections(contrast),contrast);
});
test('history edits preserve original and export both texts',()=>{
 const entries=[{id:'a',raw:'Não envie 42.',cleaned:'Não envie 42.',ts:'2026-10-03',format:'plain'}],edited=updateEntry(entries,'a',{cleaned:'Não envie 42!'});
 assert.equal(edited[0].raw,entries[0].raw);assert.equal(entries[0].cleaned,'Não envie 42.');assert(edited[0].edited);assert.throws(()=>updateEntry(entries,'a',{cleaned:''}));assert.throws(()=>updateEntry(entries,'b',{cleaned:'hello'}));assert.equal(JSON.parse(exportHistory(edited,'json'))[0].raw,entries[0].raw);assert(exportHistory(edited,'text').includes('Original:\nNão envie 42.'));
 assert(sends.includes('open-history-window'));for(const name of ['export-history','reformat-history-item','update-history-item'])assert(invokes.includes(name));
});
