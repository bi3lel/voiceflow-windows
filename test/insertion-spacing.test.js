const {test}=require('node:test');
const assert=require('node:assert/strict');
const {insert,insertionText,withLeadingBoundary}=require('../lib/windows');
const {defaults}=require('../lib/config');
test('plain dictation leaves a space; lists leave a line boundary without duplicate whitespace',()=>{
  for(const text of ["Hello, how's it going?",'Olá, João.','Bonjour, François.','42'])assert.equal(insertionText(text),text+' ');
  for(const text of ['Already spaced. ','Paragraph.\n',''])assert.equal(insertionText(text),text);
  for(const text of ['- Water\n- Bananas','• Abacaxi','1. Água','First line\nSecond line'])assert.equal(insertionText(text),text+'\n');
});
test('consecutive actual paste payloads are separated and original clipboard is restored',async()=>{
  let clipboardText='Original clipboard',sequence=1,document='';
  const clipboard={read:async()=>[{types:['text/plain'],getType:async()=>new Blob([clipboardText])}],
    makeItem:data=>data,write:async items=>{clipboardText=await items[0]['text/plain'].text();sequence++;},
    clear:async()=>{clipboardText='';sequence++;},readText:async()=>clipboardText,
    writeText:async text=>{clipboardText=text;sequence++;}};
  const helper=async action=>{
    if(action==='sequence')return sequence;
    if(action==='context')return {known:true,selected:false,preceding:document.slice(-1)};
    assert.equal(action,'paste');document+=clipboardText;return {accepted:true};
  };
  for(const text of ["Hello, how's it going?",'This is the first test.','- Water\n- Bananas','Next sentence.']) {
    assert.equal(await insert(text,{hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,helper),'paste-sent');
    assert.equal(clipboardText,'Original clipboard');
  }
  assert.equal(document,"Hello, how's it going? This is the first test. \n- Water\n- Bananas\nNext sentence. ");
});
test('caret boundaries respect empty fields, selections, existing spaces, and lists',()=>{
  const at=preceding=>({known:true,selected:false,preceding});
  assert.equal(withLeadingBoundary('Hello.',at('.')),' Hello.');
  for(const prior of ['', ' ', '\n', '\t'])assert.equal(withLeadingBoundary('Hello.',at(prior)),'Hello.');
  assert.equal(withLeadingBoundary('Hello.',{...at('.'),selected:true}),'Hello.');
  assert.equal(withLeadingBoundary('Hello.',{known:false}),'Hello.');
  assert.equal(withLeadingBoundary('- Água\n- Bananas',at('.')),'\n- Água\n- Bananas');
  assert.equal(withLeadingBoundary('- Eau',at(' ')),'\n- Eau');
  assert.equal(withLeadingBoundary('- Eau',at('\n')),'- Eau');
});
test('successive recordings stay separated when the target strips trailing whitespace',async()=>{
  let text='User clipboard',sequence=1,document='';
  const clipboard={read:async()=>[{types:['text/plain'],getType:async()=>new Blob([text])}],
    makeItem:data=>data,write:async items=>{text=await items[0]['text/plain'].text();sequence++;},
    clear:async()=>{text='';sequence++;},readText:async()=>text,writeText:async value=>{text=value;sequence++;}};
  const helper=async action=>{
    if(action==='context')return {known:true,selected:false,preceding:document.slice(-1)};
    if(action==='sequence')return sequence;
    assert.equal(action,'paste');document=(document+text).trimEnd();return {accepted:true};
  };
  for(const spoken of ['This is a test.','Hello how are you?','Olá, João.','Bonjour.']) {
    await insert(spoken,{hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,helper);
    assert.equal(text,'User clipboard');
  }
  assert.equal(document,'This is a test. Hello how are you? Olá, João. Bonjour.');
  document=''; // A new field in the same window must not inherit a separator.
  await insert('Fresh field.',{hwnd:1,pid:2},defaults,new AbortController().signal,clipboard,helper);
  assert.equal(document,'Fresh field.');
});
test('copy-only dictation uses the same boundary',async()=>{
  let text;
  const result=await insert('Bonjour.',null,{...defaults,pasteMethod:'clipboard'},new AbortController().signal,{writeText:async value=>{text=value;}});
  assert.equal(result,'copied');assert.equal(text,'Bonjour. ');
});
