const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{defaults}=require(path.join(root,'lib/config')),{cleanup}=require(path.join(root,'lib/format')),{LocalAI}=require(path.join(root,'lib/local-ai'));
const c={...defaults,useOllama:true,cleanupMode:'dictation',managedOllama:true,ollamaModel:'qwen2.5:3b',cleanupPrompt:''};
const cases=[
 ['pt-list-two','Ah, eu tenho uma lista, eu quero comprar três litros de água. Não, pera, eu quero comprar dois litros de água, um quilo de banana e abacaxi.',t=>/(dois|2) litros/i.test(t)&&!/(três|3) litros/i.test(t)&&t.includes('\n')&&/banana/i.test(t)&&/abacaxi/i.test(t)],
 ['pt-list-three','Lista de compras: dois litros de água, quer dizer, três litros de água e não dois, um quilo de banana e abacaxi.',t=>/(três|3) litros/i.test(t)&&!/(dois|2) litros/i.test(t)&&t.includes('\n')],
 ['pt-repeat','Compre três litros de água. Não, dois. Quer dizer, três, não dois. E abacaxi.',t=>/(três|3) litros/i.test(t)&&!/(dois|2)/i.test(t)&&/abacaxi/i.test(t)],
 ['pt-negation','Não envie a fatura para João. O valor é R$ 1.250,50.',t=>/Não envie/i.test(t)&&t.includes('João')&&t.includes('1.250,50')],
 ['pt-prose','Gosto de água, banana e abacaxi.',t=>!t.includes('\n')&&/Gosto/i.test(t)&&/abacaxi/i.test(t)],
 ['en-correction','Send it on Tuesday, sorry, I mean Thursday. Do not send it to John.',t=>t.includes('Thursday')&&!t.includes('Tuesday')&&t.includes('Do not send it to John')],
 ['fr-correction',"Ma liste : deux litres d'eau, non pardon, trois litres d'eau, un kilo de bananes et un ananas.",t=>/trois|3/i.test(t)&&!/deux|2/i.test(t)&&/bananes/i.test(t)&&/ananas/i.test(t)&&t.includes('\n')],
 ['pt-ambiguous','Não quero dizer que João errou. Não envie dois relatórios sem revisar.',t=>/Não quero dizer/i.test(t)&&/João/i.test(t)&&/Não envie/i.test(t)&&/dois|2/i.test(t)],
 ['pt-name-number','Envie para François R$ 42,75 amanhã. Não envie hoje.',t=>t.includes('François')&&t.includes('42,75')&&/Não envie hoje/i.test(t)]
];
(async()=>{
 const ai=new LocalAI(root),signal=new AbortController().signal,result={model:c.ollamaModel,method:'one cold warm action, then nine typed transcripts; deterministic local JSON mode; no live ASR accuracy claim',results:[]};
 try {
  const start=performance.now();await ai.warm(c,signal);result.warmMs=performance.now()-start;result.status=await ai.status(c);console.log('Local AI warm ms',result.warmMs.toFixed(1));
  for(const [id,raw,check] of cases) {
   const r=await cleanup(raw,c,signal,async(...args)=>{await ai.ensure(c,signal);return fetch(...args);});
   const pass=check(r.text)&&(r.mode==='llm'||(['pt-negation','pt-prose','pt-ambiguous','pt-name-number'].includes(id)&&r.mode==='whisper'&&r.text===raw)||(id==='pt-ambiguous'&&r.mode==='whisper'&&/uncorrected quantity|ordinary prose/.test(r.warning||'')));result.results.push({id,raw,...r,pass});console.log(id,pass,JSON.stringify(r.text));
  }
 }finally{await ai.close();await fs.writeFile(path.join(root,'benchmarks/intelligent-dictation.json'),JSON.stringify(result,null,2)+'\n');}
 if(result.results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
