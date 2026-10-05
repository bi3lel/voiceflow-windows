const pill=document.getElementById('pill'),label=document.getElementById('hud-text');
window.vf.on('state',detail=>{
  const state=detail.state;
  pill.className=state;
  let text='';
  if(state==='loading')text='Starting';
  if(state==='stopping')text='Finishing';
  if(state==='transcribing')text='Transcribing';
  if(state==='inserting')text='Inserting';
  if(state==='error') {
    const message=detail.message||'';
    text=/silence|No speech|too short/i.test(message)?"Couldn't hear anything":/microphone|FFmpeg|device unavailable/i.test(message)?'Microphone unavailable':/Focus changed/i.test(message)?'Focus changed · copy from tray':'Dictation unavailable';
  }
  label.textContent=text;
  pill.setAttribute('aria-label',state==='recording'?'Recording':text||'VoiceFlow');
});
