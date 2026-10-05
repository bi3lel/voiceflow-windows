// First-run setup; explicit downloads only. Uses the same tested IPC as Settings.
async function createVoiceFlowSetup(api=window.vf,force=false){
 const [initial,models,editing,hardware]=await Promise.all([api.getConfig(),api.getModels(),api.getEditingModel(),api.getHardware()]);
 const selected=models.find(m=>m.selected&&m.installed);
 if(!force&&selected&&initial.micDevice)return null;
 document.getElementById('setup-guide')?.remove();
 const guide=document.createElement('div');guide.id='setup-guide';guide.className='setup-guide';guide.setAttribute('role','dialog');guide.setAttribute('aria-label','VoiceFlow setup');
 guide.innerHTML='<div class="setup-card"><p class="setup-eyebrow">Welcome to VoiceFlow</p><h1 id="setup-title"></h1><p id="setup-description"></p><div id="setup-content"></div><p id="setup-status" role="status" aria-live="polite"></p><div class="setup-actions"><button id="setup-secondary" class="ghost"></button><button id="setup-primary" class="primary"></button><button id="setup-cancel" hidden>Cancel download</button></div><p class="hint">Your dictations are saved in History on this computer.</p></div>';
 document.body.append(guide);
 const get=id=>document.getElementById('setup-'+id),title=get('title'),description=get('description'),content=get('content'),status=get('status'),primary=get('primary'),secondary=get('secondary'),cancel=get('cancel');
 let c=initial,step=1,tested=false,busy=false;
 let chosen=selected?.id||'parakeet-v3';
 const say=(t,d)=>{title.textContent=t;description.textContent=d;content.replaceChildren();status.textContent='';};
 function syncConfig(next){c=next;if(typeof cfg!=='undefined'){cfg=next;for(const [key,value] of Object.entries(next)){const input=document.getElementById(key);if(input){if(input.type==='checkbox')input.checked=value;else input.value=value;}}}}
 async function run(action,downloading=false){
  if(busy)return;busy=true;primary.disabled=true;secondary.disabled=true;cancel.hidden=!downloading;
  try{await action();}catch(e){status.textContent='Could not finish this step. '+e.message+' Try again.';}
  finally{busy=false;cancel.hidden=true;primary.disabled=step===2&&!tested;secondary.disabled=false;}
 }
 cancel.onclick=()=>api.cancelModelDownload();
 api.on('model-download',p=>{if(!busy)return;status.textContent=p.phase==='extracting'?'Preparing your download…':Math.round(100*p.bytes/p.total)+'% downloaded';});
 async function render(){
  guide.querySelector('.setup-eyebrow').textContent=step<=3?`Step ${step} of 3 · VoiceFlow`:'VoiceFlow';
  secondary.hidden=true;primary.hidden=false;primary.disabled=false;
  if(step===1){
   say('Let’s get ready',selected?'Voice recognition is ready. Let’s check your microphone.':'A one-time download lets VoiceFlow understand your voice. After that, it works without internet.');
   const card=document.createElement('div');card.className='setup-hardware';
   const heading=document.createElement('strong');heading.textContent=hardware.title;
   const explanation=document.createElement('p');explanation.textContent=hardware.message;card.append(heading,explanation);content.append(card);
   const label=document.createElement('label');label.htmlFor='setup-model';label.textContent='Speech model';
   const choices=document.createElement('select');choices.id='setup-model';
   for(const model of models){const option=document.createElement('option');option.value=model.id;option.textContent=model.label||model.id;choices.append(option);}
   choices.value=chosen;content.append(label,choices);
   const detail=document.createElement('p');detail.className='hint';content.append(detail);
   const updateChoice=()=>{chosen=choices.value;const model=models.find(m=>m.id===chosen);detail.textContent=model?.description||'Parakeet is recommended for English, Portuguese and French.';primary.textContent=model?.installed?'Continue':'Download & continue · '+Math.ceil((model?.downloadBytes||hardware.speechDownloadBytes)/1000000)+' MB';};
   choices.onchange=updateChoice;updateChoice();
   primary.onclick=()=>run(async()=>{
    const model=models.find(m=>m.id===chosen);if(!model)throw Error('Choose a speech model');
    if(chosen==='whistle'&&c.language==='pt')throw Error('Whistle does not support Portuguese. Choose Parakeet or Whisper.');
    if(!model.installed){status.textContent='Downloading voice recognition…';await api.downloadModel(chosen);}
    if(!model.selected)syncConfig(await api.useModel(chosen));syncConfig(await api.saveConfig({device:chosen==='whistle'?'auto':hardware.device}));
    step=2;await render();
   },!models.find(m=>m.id===chosen)?.installed);
  }else if(step===2){
   say('Choose your microphone','Select your microphone, then say a few words during the five-second test.');
   const label=document.createElement('label');label.htmlFor='setup-microphone';label.textContent='Microphone';
   const select=document.createElement('select');select.id='setup-microphone';select.setAttribute('aria-label','Microphone');
   const test=document.createElement('button');test.id='setup-test';test.textContent='Test microphone';
   const refresh=document.createElement('button');refresh.textContent='Refresh microphones';
   content.append(label,select,test,refresh);
   const devices=async()=>{
    try{const names=await api.listDevices();select.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Choose a microphone';select.append(prompt);
     for(const name of names){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}
     select.value=names.includes(c.micDevice)?c.micDevice:names.length===1?names[0]:'';
     if(!names.length)status.textContent='No microphones found. Plug one in and click Refresh microphones.';
    }catch(e){status.textContent='Could not find microphones. '+e.message;}
   };
   select.onchange=()=>{tested=false;primary.disabled=true;status.textContent='';};
   refresh.onclick=()=>{tested=false;primary.disabled=true;devices();};
   test.onclick=async()=>{
    if(!select.value){status.textContent='Choose a microphone first.';return;}
    test.disabled=true;select.disabled=true;refresh.disabled=true;primary.disabled=true;tested=false;
    status.textContent='Say a few words for five seconds…';
    try{const result=await api.testMicrophone(select.value);tested=result.usable;status.textContent=tested?'Your microphone works. Continue when you’re ready.':'We couldn’t hear you. Check the microphone’s mute button, then try again.';}
    catch(e){status.textContent='Could not test your microphone. '+e.message;}
    finally{test.disabled=false;select.disabled=false;refresh.disabled=false;primary.disabled=!tested;}
   };
   primary.textContent='Continue';primary.disabled=true;
   primary.onclick=()=>tested?run(async()=>{syncConfig(await api.saveConfig({micDevice:select.value,historyEnabled:true}));step=3;await render();}):undefined;
   await devices();
  }else if(step===3){
   if(editing.available===false){
    say('Ready for dictation','Your speech model adds punctuation automatically. VoiceFlow saves your dictations in History.');
    const note=document.createElement('p');note.className='hint';note.textContent=editing.reason;content.append(note);
    primary.textContent='Continue';primary.onclick=()=>run(async()=>{syncConfig(await api.saveConfig({useOllama:false}));await finish();});return;
   }
   say('Would you like AI text editing?','Apply spoken corrections and organize lists while keeping your meaning and introductory context. This is optional; basic punctuation already works.');
   const note=document.createElement('p');note.className='hint';note.textContent='Download size, not GPU memory. The editor runs locally, with a processor fallback, and unloads after five idle minutes.';content.append(note);
   primary.textContent=editing.installed?'Enable text editing':'Download editor · '+(editing.downloadBytes/1e9).toFixed(2)+' GB';
   secondary.hidden=false;secondary.textContent='Use without AI editing';
   primary.onclick=()=>run(async()=>{if(!editing.installed){status.textContent='Downloading smart editing…';await api.downloadEditingModel();}syncConfig(await api.enableEditingModel());await finish();},!editing.installed);
   secondary.onclick=()=>run(async()=>{syncConfig(await api.saveConfig({useOllama:false}));await finish();});
  }else{
   say('You’re ready',`Click where you want to type. Hold ${c.hotkey} to speak, then release. Your words will appear there.`);
   primary.textContent='Start dictating';primary.onclick=()=>{guide.remove();api.closeSettings();};
  }
 }
 async function finish(){
  status.textContent='Getting ready for your first dictation…';await api.warmModel();
  syncConfig(await api.saveConfig({setupCompleted:true,historyEnabled:true}));step=4;await render();
 }
 await render();return {guide,get step(){return step;}};
}
const setupLauncher=document.createElement('button');setupLauncher.textContent='Quick setup';setupLauncher.id='quick-setup';
document.getElementById('tab-app').prepend(setupLauncher);setupLauncher.onclick=()=>createVoiceFlowSetup(window.vf,true);
createVoiceFlowSetup().catch(()=>{});
