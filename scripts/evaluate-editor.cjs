// node scripts/evaluate-editor.cjs APP_FOLDER [--model ABSOLUTE_GGUF] [--cpu]
const fs=require('node:fs/promises'),path=require('node:path');
const {LocalAI}=require('../lib/local-ai'),{cleanup}=require('../lib/format'),{defaults}=require('../lib/config');
const cases=[
 ['pt-list-two','Ah, eu tenho uma lista, eu quero comprar três litros de água. Não, pera, eu quero comprar dois litros de água, um quilo de banana e abacaxi.',t=>/(dois|2) litros/i.test(t)&&!/(três|3) litros/i.test(t)&&t.includes('\n')&&/banana/i.test(t)&&/abacaxi/i.test(t)],
 ['pt-list-three','Lista de compras: dois litros de água, quer dizer, três litros de água e não dois, um quilo de banana e abacaxi.',t=>/(três|3) litros/i.test(t)&&!/(dois|2) litros/i.test(t)&&t.includes('\n')],
 ['pt-repeat','Compre três litros de água. Não, dois. Quer dizer, três, não dois. E abacaxi.',t=>/(três|3) litros/i.test(t)&&!/(dois|2)/i.test(t)&&/abacaxi/i.test(t)&&!/(3|três) abacaxi/i.test(t)],
 ['pt-negation','Não envie a fatura para João. O valor é R$ 1.250,50.',t=>/Não envie/i.test(t)&&t.includes('João')&&t.includes('1.250,50')],
 ['pt-prose','Gosto de água, banana e abacaxi.',t=>t==='Gosto de água, banana e abacaxi.'],
 ['en-correction','Send it on Tuesday, sorry, I mean Thursday. Do not send it to John.',t=>t==='Send it on Thursday. Do not send it to John.'],
 ['fr-correction',"Ma liste : deux litres d'eau, non pardon, trois litres d'eau, un kilo de bananes et un ananas.",t=>/trois|3/i.test(t)&&!/deux|2/i.test(t)&&/bananes/i.test(t)&&/ananas/i.test(t)&&t.includes('\n')],
 ['pt-ambiguous','Não quero dizer que João errou. Não envie dois relatórios sem revisar.',t=>t==='Não quero dizer que João errou. Não envie dois relatórios sem revisar.'],
 ['pt-name-number','Envie para François R$ 42,75 amanhã. Não envie hoje.',t=>t==='Envie para François R$ 42,75 amanhã. Não envie hoje.'],
 ['en-intro','I want you to go to the supermarket and buy three liters of water, three oranges, and a soda. Actually, not three liters of water, five liters of water.',t=>t.startsWith('I want you to go to the supermarket and buy:')&&/5 liters/.test(t)&&/3 oranges/.test(t)&&/soda/i.test(t)&&!/3 liters/.test(t)],
 ['pt-intro','Quero que você vá ao supermercado e compre três litros de água, três laranjas e um refrigerante. Na verdade, não três litros de água, cinco litros de água.',t=>t.startsWith('Quero que você vá ao supermercado e compre:')&&/5 litros/.test(t)&&/3 laranjas/.test(t)&&/refrigerante/i.test(t)],
 ['fr-intro',"Je veux que tu ailles au supermarché et achète trois litres d'eau et deux oranges. En fait, pas trois litres d'eau, cinq litres d'eau.",t=>t.startsWith('Je veux que tu ailles au supermarché et achète:')&&/5 litres/.test(t)&&/2 oranges/.test(t)],
 ['pt-shopping','Quero ir ao supermercado e comprar arroz, feijão e bananas.',t=>t.startsWith('Quero ir ao supermercado e comprar:')&&t.includes('\n')&&/arroz/i.test(t)&&/feijão/i.test(t)&&/bananas/i.test(t)],
 ['en-shopping','I want to go to the supermarket and buy water, bananas and soda.',t=>t.startsWith('I want to go to the supermarket and buy:')&&t.includes('\n')&&/water/i.test(t)&&/bananas/i.test(t)&&/soda/i.test(t)],
 ['fr-shopping',"Je veux aller au supermarché et acheter du pain, des pommes et du lait.",t=>t.startsWith('Je veux aller au supermarché et acheter:')&&t.includes('\n')&&/pain/i.test(t)&&/pommes/i.test(t)&&/lait/i.test(t)],
 ['en-short','Three eggs, no, two eggs.',t=>/2|two/i.test(t)&&!/3|three/i.test(t)],
 ['pt-short','Três ovos, quer dizer, dois ovos.',t=>/2|dois/i.test(t)&&!/3|três/i.test(t)],
 ['fr-short','Trois œufs, je veux dire, deux œufs.',t=>/2|deux/i.test(t)&&!/3|trois/i.test(t)]
];
async function evaluate(root,config=defaults){
 const ai=new LocalAI(root),signal=new AbortController().signal,c={...config,useOllama:true,cleanupMode:'dictation',cleanupPrompt:''};
 const report={model:c.editingModel,method:'18 typed transcripts, cold model loading separately from warm text editing; no ASR or release-to-insertion latency claim',results:[]};
 try{
  const begin=performance.now();await ai.warm(c,signal);report.coldLoadMs=performance.now()-begin;report.diagnostics=await ai.status(c);
  for(const [id,raw,check] of cases){let modelRequested=false;const start=performance.now();const result=await cleanup(raw,c,signal,(url,options)=>{modelRequested=true;return ai.request(c,url,options,signal);});const pass=check(result.text)&&!result.warning;report.results.push({id,raw,...result,modelRequested,wallMs:performance.now()-start,pass});console.log(id,pass,result.mode);}
  const times=report.results.filter(r=>r.modelRequested).map(r=>r.wallMs).sort((a,b)=>a-b);report.summary={passed:report.results.filter(r=>r.pass).length,total:cases.length,modelRequests:times.length,warmEditingMedianMs:times[Math.floor(times.length/2)],warmEditingMinMs:times[0],warmEditingMaxMs:times.at(-1)};
 }finally{await ai.close();}
 return report;
}
if(require.main===module){
 const [folder,...flags]=process.argv.slice(2);if(!folder)throw Error('Provide an installed VoiceFlow application folder.');
 const modelIndex=flags.indexOf('--model'),c={...defaults,...(modelIndex>=0?{editingModel:path.resolve(flags[modelIndex+1])}:{}),device:flags.includes('--cpu')?'cpu':'auto'};
 evaluate(path.resolve(folder),c).then(async report=>{const file=path.join(__dirname,'../benchmarks/llama-editor-'+c.device+'.json');await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));if(report.summary.passed!==report.summary.total)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={evaluate,cases};
