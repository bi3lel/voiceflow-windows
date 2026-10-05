const {test}=require('node:test'),assert=require('node:assert/strict');
const {cleanup,validateDictation,prepareCorrections,detectFormat,needsEditing,listIntroduction}=require('../lib/format'),{defaults}=require('../lib/config');
const c={...defaults,editingBackend:'ollama',useOllama:true,cleanupMode:'dictation',cleanupPrompt:''};
const response=text=>async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({text})},load_duration:1230000})});

test('actual five-item recording replaces rice despite hesitation and a preference suffix',async()=>{
 const raw='I want you to buy three kilograms of rice, uh two kilograms of beans, one pack of chocolates, one soda, two oranges, and actually twelve kilograms of rice is better.';
 const expected='I want you to buy:\n- 12 kilograms of rice\n- 2 kilograms of beans\n- 1 pack of chocolates\n- 1 soda\n- 2 oranges';
 const prepared=prepareCorrections(raw);
 assert.match(prepared,/buy twelve kilograms of rice/);assert(!/three kilograms|actually|is better/.test(prepared));
 const result=await cleanup(raw,c,new AbortController().signal,response(expected));
 assert.equal(result.mode,'llm');assert.equal(result.text,expected);
 assert.throws(()=>validateDictation(raw,expected+'\n- 3 kilograms of rice','list'),/named late quantity correction/);
 assert.throws(()=>validateDictation(raw,expected.replace('\n- 2 oranges',''),'list'),/uncorrected quantity/);
 assert.equal(prepareCorrections('Buy 3 kg of rice and 2 kg of beans. Actually I want to buy 7 kg of rice'),'Buy 7 kg of rice and 2 kg of beans.');
 const hesitation='I want you to buy seven kg of rice, um, two kg of beans, and one pack of chocolates. Actually, three kg of rice is better.';
 assert.equal((await cleanup(hesitation,c,new AbortController().signal,response('I want you to buy:\n- 3 kg of rice\n- 2 kg of beans\n- 1 pack of chocolates'))).mode,'llm');
 for(const [suffix,subject,prefix] of [['Na verdade, doze kg de arroz é melhor.','kg de arroz','Compre três kg de arroz, dois kg de feijão e um chocolate.'],['En fait, douze kg de riz serait mieux.','kg de riz','Achetez trois kg de riz, deux kg de haricots et un chocolat.']])assert.match(prepareCorrections(prefix+' '+suffix),new RegExp('(?:doze|douze) '+subject));
 const ambiguous='Buy 3 kg of rice and 2 kg of beans. Actually 12 kg of rice is better than beans.';
 assert.equal(prepareCorrections(ambiguous),ambiguous);
});

test('named late correction has no three-item limit and retains every numbered item',async()=>{
 for(const count of [5,10,20]){
  const items=Array.from({length:count},(_,i)=>`${i+1} packs of item${String.fromCharCode(97+i)}`);
  const raw=`I want you to buy 3 kilograms of rice, ${items.join(', ')}. Actually 12 kilograms of rice is better.`;
  const expected='I want you to buy:\n- 12 kilograms of rice\n'+items.map(s=>'- '+s).join('\n');
  assert.match(prepareCorrections(raw),/buy 12 kilograms of rice/);
  assert.equal((await cleanup(raw,c,new AbortController().signal,response(expected))).text,expected);
 }
});

test('named late quantity corrections replace rice while preserving beans using the same unit',async()=>{
 const cases=[
  ['I want you to buy three kg of rice, two kg of beans and one pack of chocolates. Actually, I mean seven kg of rice.','I want you to buy seven kg of rice, two kg of beans and one pack of chocolates.','I want you to buy:\n- 7 kg of rice\n- 2 kg of beans\n- 1 pack of chocolates'],
  ['Quero comprar três kg de arroz, dois kg de feijão e um pacote de chocolates. Na verdade, quer dizer sete kg de arroz.','Quero comprar sete kg de arroz, dois kg de feijão e um pacote de chocolates.','Quero comprar:\n- 7 kg de arroz\n- 2 kg de feijão\n- 1 pacote de chocolates'],
  ['Je veux acheter trois kg de riz, deux kg de haricots et un paquet de chocolats. En fait, je veux dire sept kg de riz.','Je veux acheter sept kg de riz, deux kg de haricots et un paquet de chocolats.','Je veux acheter:\n- 7 kg de riz\n- 2 kg de haricots\n- 1 paquet de chocolats']
 ];
 for(const [raw,prepared,expected] of cases){
  assert.equal(prepareCorrections(raw),prepared);
  const result=await cleanup(raw,c,new AbortController().signal,response(expected));
  assert.equal(result.mode,'llm');assert.equal(result.text,expected);
  const stale=expected+'\n- '+(raw.includes('rice')?'3 kg of rice':raw.includes('arroz')?'3 kg de arroz':'3 kg de riz');
  assert.throws(()=>validateDictation(raw,stale,'list'),/named late quantity correction/);
  assert.throws(()=>validateDictation(raw,expected.replace('7 kg','3 kg'),'list'),/named late quantity correction/);
  assert.throws(()=>validateDictation(raw,expected.replace('2 kg','7 kg'),'list'),/uncorrected quantity/);
 }
 const repeated='Buy 3 kg of rice for John and 2 kg of rice for Ana. Actually, I mean 7 kg of rice.';
 assert.equal(prepareCorrections(repeated),repeated);
 const additional='Buy 3 kg of rice and 2 kg of beans. Also buy 7 kg of rice.';
 assert.equal(prepareCorrections(additional),additional);
 assert.equal(prepareCorrections('Buy 3 kg of rice and 2 kg of beans. Actually, I mean 7 kg of rice. Actually, I mean 5 kg of rice.'),'Buy 5 kg of rice and 2 kg of beans.');
});

test('shopping requests across consecutive sentences invoke editing and preserve every item',async()=>{
 const cases=[
  ['I want you to go to the supermarket and buy uh hot Cheetos. I want you to buy soda and also chocolate.','I want you to go to the supermarket and buy:\n- Hot Cheetos\n- Soda\n- Chocolate'],
  ['Quero ir ao supermercado e comprar Cheetos. Quero comprar refrigerante e também chocolate.','Quero ir ao supermercado e comprar:\n- Cheetos\n- Refrigerante\n- Chocolate'],
  ['Je veux aller au supermarché et acheter des chips. Je veux acheter du soda et aussi du chocolat.','Je veux aller au supermarché et acheter:\n- Des chips\n- Du soda\n- Du chocolat']
 ];
 for(const [raw,expected] of cases){
  assert.equal(detectFormat(raw),'list');assert(needsEditing(raw));
  const result=await cleanup(raw,c,new AbortController().signal,response(expected));
  assert.equal(result.mode,'llm');assert.equal(result.text,expected);
 }
 for(const raw of ['I want to buy milk. Then go home.','I want to buy milk. Do not buy chocolate and soda.','If I buy milk and eggs, I will cook.','Quero comprar leite. Não quero comprar ovos e chocolate.','I want to buy milk or soda.'])assert.equal(detectFormat(raw),'plain');
});

test('shopping enumerations do not require quantities in Portuguese, English or French',()=>{
 for(const raw of ['Quero ir ao supermercado e comprar arroz, feijão e bananas.','Eu quero que você vá ao mercado e compre água, pão e refrigerante.','Vou ao mercado comprar leite e ovos.','I want to go to the supermarket and buy water, bananas and soda.',"Je veux aller au supermarché et acheter du pain, des pommes et du lait."]){
  assert.equal(detectFormat(raw),'list');assert(needsEditing(raw));assert(listIntroduction(raw));
  assert.equal(detectFormat(raw,'plain'),'plain');
 }
 for(const raw of ['Quero comprar água.','Gosto de arroz, feijão e bananas.','Quero comprar leite e depois ir para casa.','I will buy milk and then cook dinner.'])assert.equal(detectFormat(raw),'plain');
});

test('Portuguese shopping without quantities invokes local list formatting and preserves its introduction',async()=>{
 const raw='Quero ir ao supermercado e comprar arroz, feijão e bananas.';
 const result=await cleanup(raw,c,new AbortController().signal,response('- Arroz\n- Feijão\n- Bananas'));
 assert.equal(result.mode,'llm');assert.equal(result.format,'list');assert.equal(result.text,'Quero ir ao supermercado e comprar:\n- Arroz\n- Feijão\n- Bananas');
});
test('make-a-list command keeps context and yields corrected items',async()=>{
 const raw='Okay, make a list. I want to go to the supermarket and buy three eggs. Actually, two eggs and one water bottle.';
 const expected='I want to go to the supermarket and buy:\n- 2 eggs\n- 1 water bottle';
 assert.equal(prepareCorrections(raw),'Okay, make a list. I want to go to the supermarket and buy two eggs and one water bottle.');
 const result=await cleanup(raw,c,new AbortController().signal,response(expected));
 assert.equal(result.text,expected);assert.equal(result.mode,'llm');assert.equal(result.format,'list');
 for(const wrong of ['- Three eggs\n- One water bottle','- Dois ovos\n- Uma garrafa de água','Two eggs and one water bottle.']) {
  const failed=await cleanup(raw,c,new AbortController().signal,response(wrong));assert.equal(failed.text,raw);assert(failed.warning);
 }
});

test('shopping list retains the request, applies a distant correction and accepts digits',async()=>{
 const raw='I want you to go to the supermarket and buy three liters of water, three oranges, and a soda. Actually, not three liters of water, five liters of water.';
 const expected='I want you to go to the supermarket and buy:\n- 5 liters of water\n- 3 oranges\n- A soda';
 const good=await cleanup(raw,c,new AbortController().signal,response(expected));
 assert.equal(good.text,expected);assert.equal(good.mode,'llm');assert.equal(good.format,'list');
 assert.equal(prepareCorrections(raw),'I want you to go to the supermarket and buy five liters of water, three oranges, and a soda.');
 assert.throws(()=>validateDictation(raw,'- 5 liters of water\n- 3 oranges\n- A soda','list'),/introductory context/);
 assert.equal((await cleanup(raw,c,new AbortController().signal,response('- 5 liters of water\n- 3 oranges\n- A soda'))).text,expected);
 for(const wrong of [expected.replace('5 liters','3 liters'),expected.replace('3 oranges','7 oranges')]){
  const result=await cleanup(raw,c,new AbortController().signal,response(wrong));assert.equal(result.text,raw);assert(result.warning);
 }
});

test('list context and numeric quantities work in Portuguese and French without invention',()=>{
 validateDictation('Quero que você vá ao supermercado e compre três litros de água, três laranjas e um refrigerante. Na verdade, não três litros de água, cinco litros de água.',
  'Quero que você vá ao supermercado e compre:\n- 5 litros de água\n- 3 laranjas\n- 1 refrigerante','list');
 validateDictation("Je veux que tu ailles au supermarché et achète trois litres d'eau et deux oranges.",
  "Je veux que tu ailles au supermarché et achète:\n- 3 litres d'eau\n- 2 oranges",'list');
 assert.throws(()=>validateDictation('I want you to buy three eggs and two oranges.','- 3 eggs\n- 2 oranges','list'),/introductory context/);
 assert.throws(()=>validateDictation('List: three eggs and two oranges.','- 30 eggs\n- 2 oranges','list'),/invented/);
});

test('late corrections are collapsed only for one exact earlier subject',()=>{
 const raw='Ask John to buy three liters of water and ask Ana to buy three liters of water. Actually, not three liters of water, five liters of water.';
 assert.equal(prepareCorrections(raw),raw);
 const french="Je veux que tu ailles au supermarché et achète trois litres d'eau et deux oranges. En fait, pas trois litres d'eau, cinq litres d'eau.";
 assert.equal(prepareCorrections(french),"Je veux que tu ailles au supermarché et achète cinq litres d'eau et deux oranges.");
 assert.throws(()=>validateDictation(french,"Je veux que tu ailles au supermarché et achète:\n- 3 litres d'eau\n- 2 oranges",'list'),/explicit quantity correction/);
});

test('an indefinite item can render as one but larger invented counts are rejected',()=>{
 const raw='List: three oranges and a soda.';
 validateDictation(raw,'- 3 oranges\n- 1 soda','list');
 assert.throws(()=>validateDictation(raw,'- 3 oranges\n- 2 sodas','list'),/invented/);
});
test('ordinary correction does not authorize translating nouns or inventing names',()=>{
 assert.throws(()=>validateDictation('Send it Tuesday, sorry, I mean Thursday.','Envie na quinta-feira.'),/translated|undictated/);
 assert.throws(()=>validateDictation('Send it Tuesday, sorry, I mean Thursday.','Send it Thursday to Alex.'),/undictated/);
});
test('intelligent mode accepts explicit corrected quantities and list structure while raw remains separate',async()=>{
 const raw='Minha lista: três litros de água, não, pera, dois litros de água, um quilo de banana e abacaxi.';
 const expected='- Dois litros de água\n- Um quilo de banana\n- Abacaxi';
 let body;const r=await cleanup(raw,c,new AbortController().signal,async(url,options)=>{assert(url.endsWith('/api/chat'));body=JSON.parse(options.body);return (await response(expected)());});
 assert.equal(r.text,expected);assert.equal(r.mode,'llm');assert(raw.includes('três'));assert.equal(r.metrics.cleanupLoadMs,1.23);
 assert.equal(body.messages[0].role,'system');assert.equal(JSON.parse(body.messages[1].content).transcript,prepareCorrections(raw));assert.equal(body.format.type,'object');assert.equal(body.options.temperature,0);
});
test('intelligent validation never treats ordinary negation as permission to remove a quantity',async()=>{
 const raw='Não quero dizer que João errou. Não envie dois relatórios sem revisar.';
 const r=await cleanup(raw,c,new AbortController().signal,response('Não quero dizer que João errou. Não envie relatórios sem revisar.'));
 assert.equal(r.text,raw);assert.equal(r.mode,'whisper');assert.equal(r.warning,undefined);
 assert.throws(()=>validateDictation(raw,'Não quero dizer que João errou. Não envie relatórios sem revisar.'),/uncorrected quantity/);
 assert.throws(()=>validateDictation('Lista: dois litros, quer dizer três litros.','- Quatro litros.'),/invented/);
 assert.throws(()=>validateDictation('Não quer dizer que precisamos de dois relatórios.','Não quer dizer que precisamos de relatórios.'),/uncorrected quantity/);
});
test('intelligent mode rejects invented numbers, ordinary prose rewrites, empty and truncated responses',async()=>{
 const raw='Lista: Não envie R$ 42,75 para François.';
 for(const text of ['', 'Envie R$ 42,75 para François.','Não envie R$ 420,75 para François.']){
  const r=await cleanup(raw,c,new AbortController().signal,response(text));assert.equal(r.text,raw);assert(r.warning);
 }
 const truncated=await cleanup(raw,c,new AbortController().signal,async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({text:raw})},done_reason:'length'})}));assert.equal(truncated.text,raw);assert.match(truncated.warning,/truncated/);
});
test('intelligent mode permits the latest explicit correction, and faithful mode remains available',async()=>{
 const raw='Lista: dois litros de água, quer dizer, três litros de água e não dois.';
 const r=await cleanup(raw,c,new AbortController().signal,response('- Três litros de água.'));assert.equal(r.mode,'llm');
 const faithful=await cleanup(raw,{...c,useOllama:false},new AbortController().signal,()=>{throw Error('must not call AI');});assert.equal(faithful.text,raw);
});

test('explicit same-unit correction must remove superseded item rather than list both',async()=>{
 const raw='Eu quero comprar três litros de água, não, pera, dois litros de água, um quilo de banana.';
 for(const text of ['- Três litros de água\n- Dois litros de água\n- Um quilo de banana','- Três litros de água\n- Um quilo de banana']){
  const result=await cleanup(raw,c,new AbortController().signal,response(text));assert.equal(result.text,raw);assert.match(result.warning,/explicit quantity correction/);
 }
 const good=await cleanup(raw,c,new AbortController().signal,response('- Dois litros de água\n- Um quilo de banana'));assert.equal(good.mode,'llm');
});

test('last explicit bare-number correction wins even when returning to original quantity',async()=>{
 const raw='Compre três litros de água. Não, dois. Quer dizer, três, não dois. E abacaxi.';
 const wrong=await cleanup(raw,c,new AbortController().signal,response('Compre dois litros de água e abacaxi.'));assert.equal(wrong.text,raw);assert.match(wrong.warning,/last explicit quantity correction/);
 const good=await cleanup(raw,c,new AbortController().signal,response('Compre três litros de água e abacaxi.'));assert.equal(good.mode,'llm');
});
