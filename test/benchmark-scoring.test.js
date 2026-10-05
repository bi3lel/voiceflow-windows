const {test}=require('node:test'),assert=require('node:assert/strict');
const {characterScore,aggregate,pairedSummary}=require('../scripts/compare-models');
test('benchmark character scoring preserves accents and empty results never imply zero errors',()=>{
 assert.equal(characterScore('Olá, João!','Olá João').characterEdits,0);
 assert.equal(characterScore('Olá','Ola').characterEdits,1);
 assert.equal(aggregate([]).werPercent,null);
});
test('paired benchmark uses matched clips, weighted word errors, and deterministic intervals',()=>{
 const results=[];
 for(const backend of ['whisper','parakeet'])for(const language of ['en','pt','fr'])for(let id=0;id<5;id++)results.push({id:language+id,backend,language,words:10,characters:40,edits:backend==='whisper'?2:1,characterEdits:backend==='whisper'?4:2,transcriptionMs:backend==='whisper'?100:50,durationSeconds:10,reference:'Sentence '+id});
 const first=pairedSummary({results}),second=pairedSummary({results});assert.deepEqual(first,second);
 for(const group of Object.values(first.languages)){assert.equal(group.whisper.werPercent,20);assert.equal(group.parakeet.werPercent,10);assert.equal(group.parakeetFewerErrors,5);assert.deepEqual(group.parakeetMinusWhisperWer95CI,[-10,-10]);}
});
