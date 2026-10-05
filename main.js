const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, ClipboardItem, screen, dialog, nativeTheme } = require('electron');
const insertionClipboard = {read:()=>clipboard.read(),write:items=>clipboard.write(items),clear:()=>clipboard.clear(),
  readText:()=>clipboard.readText(),writeText:text=>clipboard.writeText(text),makeItem:data=>new ClipboardItem(data)};
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { defaults, validate, roots, resolvePath, atomicJson, load, startupSpec } = require('./lib/config');
const { SpeechEngine:Engine } = require('./lib/speech-engine');
const { Sessions } = require('./lib/session');
const { validateAudio } = require('./lib/capture');
const {fastCapture}=require('./lib/fast-capture');
const {modelStatus,modelConfig,runtimes}=require('./lib/model-catalog');
const {installModel,cleanAbandonedDownloads}=require('./lib/model-download');
const {installEditing,editingStatus}=require('./lib/editing-download');
const {detectHardware}=require('./lib/hardware');
const {testMicrophone}=require('./lib/microphone');
const {LocalAI}=require('./lib/local-ai');
const { cleanup } = require('./lib/format');
const {checkedEntry,updateEntry,exportHistory}=require('./lib/history');
const { Hotkey } = require('./lib/hotkey');
const windows = require('./lib/windows');
const { invokes, sends } = require('./lib/ipc');
const {indicatorSize,indicatorPresentation}=require('./lib/indicator');
const {releasePolicy,requireManagedEditing}=require('./lib/release-policy');
const distribution=releasePolicy(__dirname);
// Diagnostic mode has no hook/recording and uses a separate scratch session folder.
if (process.argv.includes('--self-test') || app.requestSingleInstanceLock()) boot(); else app.quit();
function boot() {
  const selfTest = process.argv.includes('--self-test');
  const locations = roots({ packaged:app.isPackaged, execPath:process.execPath, appPath:app.getAppPath(),
    portableDir:process.env.PORTABLE_EXECUTABLE_DIR || process.env.VOICEFLOW_PORTABLE_DIR, userData:selfTest&&process.env.VOICEFLOW_SELF_TEST_DATA?path.resolve(process.env.VOICEFLOW_SELF_TEST_DATA):app.getPath('userData') });
  app.setPath('userData',locations.data);
  const configFile = path.join(locations.data,'config.json'), historyFile = path.join(locations.data,'history.json'), temp = path.join(locations.data,selfTest?'self-test-sessions':'sessions');
  let config = {...defaults}, pill, settings, historyWindow, tray, controller, hook, hotkey, quitting = false, hideTimer, recovery = '', warming;
  let history = [], configWarning, microphoneTask, lastState = {state:'idle'}, lastNotice='',shortcutCapturing=false;
  let downloadTask,downloadAbort;
  const engine = new Engine(locations.root,path.join(temp,'engine'),info=>broadcast('diagnostics',info));
  const localAI=new LocalAI(locations.root);
  function broadcast(channel,data) { for (const w of [pill,settings,historyWindow]) if (w && !w.isDestroyed()) w.webContents.send(channel,data); }
  function notify(detail) {
    lastState = detail; clearTimeout(hideTimer);
    if(detail.state==='stopping' && controller?.active) {settings?.hide();historyWindow?.hide();}
    if(detail.message || detail.warning) lastNotice=detail.message || detail.warning;
    try{atomicJson(path.join(locations.data,'last-state.json'),{...detail,ts:new Date().toISOString(),version:app.getVersion()});}catch{}
    const presentation=indicatorPresentation(detail);
    if(pill && detail.state==='loading') {
      const {x,y,width,height}=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      pill.setPosition(x+Math.round((width-indicatorSize.width)/2),y+height-indicatorSize.height-16);
    }
    if (pill) { if(presentation.visible && !selfTest)pill.showInactive();else pill.hide();broadcast('state',detail); }
    if (detail.message) broadcast('error-msg',detail.message);
    if(presentation.hideAfterMs)hideTimer=setTimeout(()=>pill?.hide(),detail.state==='idle'?config.autoHideDelay:presentation.hideAfterMs);
  }
  function preferences() { return {preload:path.join(__dirname,'src','preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:false}; }
  function secure(w) {
    w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    w.webContents.on('will-navigate',e=>e.preventDefault());
    w.webContents.on('did-finish-load',()=>{w.webContents.send('state',lastState);w.webContents.send('diagnostics',engine.info);if(lastNotice)w.webContents.send('error-msg',lastNotice);});
  }
  function createSettings() {
    if (settings) {settings.show();return settings.focus();}
    const area=screen.getPrimaryDisplay().workArea;
    settings=new BrowserWindow({width:Math.min(960,area.width-32),height:Math.min(820,area.height-32),minWidth:640,minHeight:560,...windowChrome(),show:!selfTest,webPreferences:preferences()});
    secure(settings);settings.loadFile(path.join(__dirname,'src','settings.html'));settings.on('closed',()=>{settings=null;shortcutCapturing=false;hotkey?.reset();});
  }
  function createHistory() {
    if(historyWindow){historyWindow.show();return historyWindow.focus();}
    historyWindow=new BrowserWindow({width:1040,height:740,minWidth:760,minHeight:520,title:'VoiceFlow History',...windowChrome(),show:!selfTest,webPreferences:preferences()});
    secure(historyWindow);historyWindow.loadFile(path.join(__dirname,'src','history.html'));historyWindow.on('closed',()=>{historyWindow=null;});
  }
  function windowChrome() { const dark=nativeTheme.shouldUseDarkColors;return {icon:path.join(__dirname,'assets','icon.ico'),backgroundColor:dark?'#171819':'#f6f6f5',autoHideMenuBar:true,titleBarStyle:'hidden',titleBarOverlay:{color:dark?'#1d1f21':'#efefee',symbolColor:dark?'#ededee':'#24272a',height:44}}; }
  nativeTheme.on('updated',()=>{for(const w of [settings,historyWindow])if(w&&!w.isDestroyed())w.setTitleBarOverlay(windowChrome().titleBarOverlay);});
  function trusted(event) {
    const w=BrowserWindow.fromWebContents(event.sender);
    if (![pill,settings,historyWindow].includes(w) || event.senderFrame!==event.sender.mainFrame) throw Error('Untrusted IPC sender');
  }
  function setStartup(enabled) {
    if (process.platform!=='win32') throw Error('Windows startup only');
    if (enabled && locations.data===path.join(locations.root,'data')) throw Error('Startup disabled in portable mode; drive letters can change');
    app.setLoginItemSettings({openAtLogin:enabled,...startupSpec(app.isPackaged,process.execPath,app.getAppPath())});
  }
  function diagnostics() {
    return new Promise(resolve=>execFile('nvidia-smi',['--query-gpu=name,memory.total,memory.used,driver_version','--format=csv,noheader'],
      {windowsHide:true,timeout:5000},async(error,stdout)=>resolve({...engine.info,cleanupAI:await localAI.status(config),gpu:error?`nvidia-smi unavailable: ${error.message}`:stdout.trim(),
        microphoneCapture:await windows.call('capture-info').catch(e=>({available:false,error:e.message})),root:locations.root,data:locations.data,platform:process.platform,state:controller.state,lastNotice})));
  }
  async function warm() {
    if (controller.active || warming) throw Error('Wait for current job');
    const abort=new AbortController();warming=abort;notify({state:'loading'});
    try {await engine.warm(config,abort.signal);if(config.useOllama)await localAI.warm(config,abort.signal);notify({state:'idle',completion:'model-ready'});return {...engine.info,cleanupAI:await localAI.status(config)};}
    catch(e){notify({state:'error',message:e.message});throw e;}finally{warming=null;}
  }
  const handlers={
    'get-config':()=>config,
    'save-config':async c=>{
      if(controller.active || warming) throw Error('Wait for dictation to finish before changing settings');
      const next=validate(c,config);
      if(next.useOllama&&next.editingBackend==='llamacpp')requireManagedEditing(distribution);
      if(next.startWithWindows!==config.startWithWindows)setStartup(next.startWithWindows);
      const changed=['whisperBin','whisperCpuBin','whisperModel','device','speechBackend','parakeetBin','parakeetCpuBin','parakeetModel','whistleModel'].some(k=>next[k]!==config[k]);
      const editingChanged=!next.useOllama||['editingBackend','editingModel','device'].some(k=>next[k]!==config[k]);
      atomicJson(configFile,next);config=next;hotkey.reset();if(changed)await engine.unload();
      if(editingChanged)await localAI.close();
      tray.setToolTip(`VoiceFlow — ${config.hotkeyMode}: ${config.hotkey}`);broadcast('history-update',history);return config;
    },
    'get-history':()=>history,
    'get-models':async()=>{
      const hardware=await detectHardware(),models=await modelStatus(locations.root,config);
      return models.map(item=>item.backend==='parakeet'?{...item,downloadBytes:item.bytes+(hardware.device==='cpu'||config.device==='cpu'?runtimes[1].bytes:runtimes.reduce((n,r)=>n+r.bytes,0))}:item);
    },
    'get-hardware':()=>detectHardware(),
    'get-editing-model':async()=>{const hardware=await detectHardware();return {...await editingStatus(locations.root,config,{cpuOnly:hardware.device==='cpu'||config.device==='cpu'}),available:distribution.managedEditing,reason:distribution.reason};},
    'download-editing-model':async()=>{
      requireManagedEditing(distribution);
      if(downloadTask)throw Error('A model download is already in progress');
      const hardware=await detectHardware();if(downloadTask)throw Error('A model download is already in progress');
      downloadAbort=new AbortController();downloadTask=installEditing(locations.root,downloadAbort.signal,p=>broadcast('model-download',p),{cpuOnly:hardware.device==='cpu'||config.device==='cpu'});
      try{await downloadTask;return await editingStatus(locations.root,config);}finally{downloadTask=null;downloadAbort=null;}
    },
    'enable-editing-model':async()=>{
      requireManagedEditing(distribution);
      if(!(await editingStatus(locations.root,config)).installed)throw Error('Download the local editing model first');
      return handlers['save-config']({useOllama:true,managedOllama:true,editingBackend:'llamacpp',editingModel:'models/qwen2.5-3b-instruct-q4_k_m.gguf',cleanupMode:'dictation',cleanupPrompt:''});
    },
    'download-model':async id=>{
      if(downloadTask)throw Error('A model download is already in progress');
      const hardware=await detectHardware();
      if(downloadTask)throw Error('A model download is already in progress');
      downloadAbort=new AbortController();downloadTask=installModel(id,locations.root,downloadAbort.signal,p=>broadcast('model-download',p),{cpuOnly:hardware.device==='cpu'||config.device==='cpu'});
      try{await downloadTask;return await modelStatus(locations.root,config);}finally{downloadTask=null;downloadAbort=null;}
    },
    'cancel-model-download':()=>downloadAbort?.abort(),
    'use-model':async id=>{
      if(controller.active||warming)throw Error('Wait for dictation to finish before switching models');
      const models=await modelStatus(locations.root,config),item=models.find(x=>x.id===id);
      if(!item?.installed)throw Error('Download this model and its runtime first');
      return handlers['save-config'](modelConfig(id));
    },
    'update-history-item':arg=>{history=updateEntry(history,arg?.id,arg);atomicJson(historyFile,history);broadcast('history-update',history);},
    'reformat-history-item':async arg=>{
      if(controller.active||warming)throw Error('Wait for the current job');
      const entry=checkedEntry(history,arg?.id),c=validate({outputFormat:arg?.format,cleanupMode:'dictation',useOllama:true},config);
      const abort=new AbortController();warming=abort;
      try {
        const result=await cleanup(entry.raw,c,abort.signal,(url,options)=>localAI.request(c,url,options,abort.signal));
        if(!['llm','rules'].includes(result.mode))throw Error(result.warning||'Formatting unavailable; previous final text retained');
        abort.signal.throwIfAborted();if(!config.historyEnabled)throw Error('History is disabled');checkedEntry(history,entry.id);
        history=history.map(e=>e.id===entry.id?{...e,cleaned:result.text,format:result.format||'plain',mode:result.mode,warning:result.warning||'',edited:false}:e);
        atomicJson(historyFile,history);broadcast('history-update',history);return result;
      }finally{warming=null;}
    },
    'export-history':async()=>{
      const result=await dialog.showSaveDialog(historyWindow||settings,{title:'Export VoiceFlow history',defaultPath:'voiceflow-history.json',filters:[{name:'JSON (original and final)',extensions:['json']},{name:'Text',extensions:['txt']}]});
      if(result.canceled)return {cancelled:true};await fs.writeFile(result.filePath,exportHistory(history,path.extname(result.filePath).toLowerCase()==='.json'?'json':'text'),'utf8');return {cancelled:false};
    },
    'clear-history':()=>{history=[];atomicJson(historyFile,history);broadcast('history-update',history);},
    'delete-history-item':id=>{history=history.filter(e=>String(e.id)!==String(id));atomicJson(historyFile,history);broadcast('history-update',history);},
    'copy-text':async text=>{if(typeof text!=='string'||text.length>200000)throw Error('Invalid text');await clipboard.writeText(text);},
    'copy-last':async()=>{if(!recovery)throw Error('No transcript available');await clipboard.writeText(windows.insertionText(recovery));return 'copied';},
    diagnostics,
    'unload-model':async()=>{if(controller.active||warming)throw Error('Cancel or wait before unloading');await engine.unload();await localAI.unload(config);return engine.info;},
    'warm-model':warm,
    cancel:async()=>{hotkey?.reset();warming?.abort();const cancelled=controller.cancel();await localAI.close();await microphoneTask?.catch(()=>{});await cancelled;await engine.unload();},
    'list-devices':()=>windows.call('devices',['-Ffmpeg',resolvePath(config.ffmpegBin,locations.root)]),
    'test-microphone':async device=>{
      if(controller.active || warming)throw Error('Wait for the current job');
      if(typeof device!=='string' || !device.trim())throw Error('Select a microphone first');
      const abort=new AbortController();warming=abort;
      try {
        microphoneTask=testMicrophone({...config,micDevice:device.trim()},locations.root,temp,abort.signal,notify,5,(file,c,s)=>fastCapture(file,c,s,locations.root));
        const result=await microphoneTask;
        atomicJson(path.join(locations.data,'microphone-test.json'),result);
        notify(result.usable?{state:'idle',completion:'microphone-ready'}:{state:'error',message:result.message});return result;
      }catch(e){notify({state:'error',message:e.message});throw e;}finally{warming=null;microphoneTask=null;}
    }
  };
  for(const channel of invokes)ipcMain.handle(channel,async(event,arg)=>{trusted(event);return handlers[channel](arg);});
  for(const channel of sends)ipcMain.on(channel,(event,arg)=>{
    try{trusted(event);if(channel==='open-settings')createSettings();if(channel==='close-settings')settings?.close();
      if(channel==='shortcut-capture' && event.sender===settings?.webContents){shortcutCapturing=arg===true;hotkey?.reset();}
      if(channel==='open-history-window')createHistory();if(channel==='hide-pill')pill?.hide();
    }catch(e){notify({state:'error',message:e.message});}
  });
  app.on('second-instance',()=>createSettings());
  app.whenReady().then(async()=>{
    try{
      const initial=validate(load(path.join(locations.bundledRoot,'portable-defaults.json'),{}));
      if(locations.root!==locations.bundledRoot)initial.whisperCpuBin=path.join(locations.bundledRoot,defaults.whisperCpuBin);
      config=validate(load(configFile,initial),initial);
      if(!distribution.managedEditing&&config.editingBackend==='llamacpp')config.useOllama=false;
    }catch(e){configWarning=`Settings not loaded: ${e.message}. Original config preserved.`;}
    try{history=load(historyFile,[]);if(!Array.isArray(history))history=[];}catch(e){configWarning||=`History not loaded: ${e.message}`;}
    try{const previous=load(path.join(locations.data,'last-state.json'),{});lastNotice=previous.message||previous.warning||'';}catch{}
    // Single-instance lock is held; remove only this application's stale session directory.
    await fs.rm(temp,{recursive:true,force:true});await fs.mkdir(temp,{recursive:true});
    if(!selfTest)await cleanAbandonedDownloads(locations.root).catch(e=>{configWarning||='Temporary download cleanup failed: '+e.message;});
    const {x,y,width,height}=screen.getPrimaryDisplay().workArea;
    pill=new BrowserWindow({...indicatorSize,x:x+Math.round((width-indicatorSize.width)/2),y:y+height-indicatorSize.height-16,frame:false,transparent:true,alwaysOnTop:true,focusable:false,
      skipTaskbar:true,resizable:false,show:false,webPreferences:preferences()});
    pill.setIgnoreMouseEvents(true);
    secure(pill);pill.loadFile(path.join(__dirname,'src','pill.html'));pill.on('close',e=>{if(!quitting){e.preventDefault();pill.hide();}});
    controller=new Sessions({config:()=>config,temp,engine,capture:(file,c,s)=>fastCapture(file,c,s,locations.root),validateAudio,target:async signal=>{
      const target=await windows.call('target',[],signal);
      // Dictation from our settings is useful too; never paste back into our own controls.
      return {...target,copyOnly:target.pid===process.pid};
    },cleanup:(raw,c,signal)=>cleanup(raw,c,signal,(url,options)=>localAI.request(c,url,options,signal)),
      insert:(text,target,c,s)=>windows.insert(text,target,c,s,insertionClipboard),notify,
      recovery:text=>{recovery=text;broadcast('last-text',text);},
      history:async(entry,c)=>{if(c.historyEnabled){history.unshift(entry);history=history.slice(0,1000);atomicJson(historyFile,history);broadcast('history-update',history);}},
      metrics:m=>atomicJson(path.join(locations.data,'last-metrics.json'),m)});
    tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'assets','icon.ico')));tray.setToolTip(`VoiceFlow — ${config.hotkeyMode}: ${config.hotkey}`);
    const safe=fn=>()=>Promise.resolve().then(fn).catch(e=>notify({state:'error',message:e.message}));
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'History',click:createHistory},
      {label:'Copy last transcript',click:safe(handlers['copy-last'])},{label:'Settings',click:createSettings},
      {label:'Load / warm model',click:safe(warm)},{label:'Unload model (free VRAM)',click:safe(handlers['unload-model'])},
      {label:'Cancel dictation',click:safe(handlers.cancel)},{type:'separator'},{label:'Quit',click:()=>app.quit()}]));
    tray.on('click',createSettings);
    hotkey=new Hotkey(()=>config,()=>{if(!warming && !shortcutCapturing)controller.start();},()=>controller.stop(),()=>{if(controller.active || warming)handlers.cancel().catch(e=>notify({state:'error',message:e.message}));});
    try{await windows.call('sequence');hook=require('uiohook-napi').uIOhook;if(!selfTest){hook.on('keydown',e=>hotkey.keydown(e));hook.on('keyup',e=>hotkey.keyup(e));hook.start();}}catch(e){configWarning||=`Global keyboard hook / Windows helper failed: ${e.message}`;}
    if(selfTest) {
      createSettings();createHistory();
      const loaded=w=>w.webContents.isLoading()?new Promise(resolve=>w.webContents.once('did-finish-load',resolve)):Promise.resolve();
      await Promise.all([loaded(pill),loaded(settings),loaded(historyWindow)]);
      for(const w of [pill,settings,historyWindow])await w.webContents.executeJavaScript('document.fonts.ready');
      const result={packaged:app.isPackaged,version:app.getVersion(),pillFocusable:pill.isFocusable(),pillStyle:{transparent:true,blur:false,...indicatorSize},electron:process.versions.electron,locations,nativeKeyboard:!!hook,warning:configWarning};
      result.renderer=await settings.webContents.executeJavaScript('window.vf.getConfig().then(c=>({language:c.language,model:c.whisperModel,bridge:true}))');
      result.history=await historyWindow.webContents.executeJavaScript('window.vf.getHistory().then(h=>({historyCount:h.length,bridge:true,width:innerWidth,height:innerHeight}))');
      result.pill=await pill.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,bars:document.querySelectorAll(".bar").length,detailsPanel:!!document.getElementById("details")})');
      if(process.argv.includes('--self-test-ui')) {
        const shots=path.join(locations.data,'ui-validation');await fs.mkdir(shots,{recursive:true});
        const snapshot=async(w,name)=>{await new Promise(r=>setTimeout(r,220));const image=await w.webContents.capturePage();await fs.writeFile(path.join(shots,name+'.png'),image.toPNG());};
        const styleState='({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,background:getComputedStyle(document.body).backgroundColor,focusable:document.querySelectorAll("button,input,select,textarea").length})';
        result.ui={settings:await settings.webContents.executeJavaScript(styleState),pages:[],history:await historyWindow.webContents.executeJavaScript(styleState)};
        for(const theme of ['dark','light']) {
          nativeTheme.themeSource=theme;
          for(const page of ['recording','output','llm','whisper','app']) {
            const paintMs=await settings.webContents.executeJavaScript(`new Promise(resolve=>{const began=performance.now();document.querySelector('[data-tab="${page}"]').click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-began)));})`);
            await snapshot(settings,theme+'-'+page);
            const selected=await settings.webContents.executeJavaScript('document.querySelector(".tab.active").dataset.tab');
            if(selected!==page)throw Error('Sidebar selection mismatch');
            result.ui.pages.push({theme,page,selected,paintMs});
          }
          await historyWindow.webContents.executeJavaScript(`receive([{id:'ui-example',ts:'2026-10-04T09:32:00+02:00',raw:'Make a list. Three eggs, actually two eggs and one water bottle.',cleaned:'- Two eggs\\n- One water bottle',format:'list',mode:'llm'}])`);
          await snapshot(historyWindow,theme+'-history');
          for(const state of ['loading','recording','transcribing','result','error']) {
            pill.webContents.send('last-text',"I'll send the updated version tomorrow.");
            pill.webContents.send('state',state==='result'?{state:'idle',completion:'paste-sent'}:{state,message:'Silence detected in microphone capture. Long details remain in Settings.'});
            await snapshot(pill,theme+'-hud-'+state);
          }
        }
        nativeTheme.themeSource='system';
        result.ui.settingsControls=await settings.webContents.executeJavaScript('({hotkey:document.getElementById("hotkey").value,microphone:document.getElementById("micDevice").value,language:document.getElementById("language").value,switches:[...document.querySelectorAll(".switch input")].map(x=>({id:x.id,focusable:x.tabIndex>=0,label:x.getAttribute("aria-label")}))})');
        const realSave=handlers['save-config'];let submitted;
        try {
          handlers['save-config']=arg=>{submitted=arg;return config;};
          await settings.webContents.executeJavaScript('document.getElementById("save-btn").click()');
          await new Promise(r=>setTimeout(r,100));
          if(!submitted)throw Error('Settings Save handler did not submit');
          const checked=validate(submitted,config);
          if(Object.keys(submitted).some(k=>checked[k]!==config[k]))throw Error('Redesign changed existing setting values');
          result.ui.saveRoundTrip=true;
        }finally{handlers['save-config']=realSave;}
        result.ui.gabarito=await settings.webContents.executeJavaScript('document.fonts.check("500 13px Gabarito") && [...document.fonts].some(f=>f.family==="Gabarito" && f.status==="loaded")');
        if(!result.ui.gabarito)throw Error('Bundled Gabarito failed to load');
        pill.webContents.send('state',{state:'idle',completion:'paste-sent'});
        await new Promise(r=>setTimeout(r,50));
        result.ui.noTranscriptPreview=await pill.webContents.executeJavaScript('document.getElementById("hud-text").textContent === ""');
        if(!result.ui.noTranscriptPreview)throw Error('Transcript preview must remain empty');
        pill.webContents.send('state',{state:'idle'});
        result.ui.processes=app.getAppMetrics().map(x=>({type:x.type,cpuPercent:x.cpu.percentCPUUsage,workingSetKB:x.memory.workingSetSize}));
      }
      if(process.argv.includes('--self-test-indicator')) {
        pill.webContents.send('state',{state:'recording'});
        await new Promise(resolve=>setTimeout(resolve,150));
        const image=await pill.webContents.capturePage();
        await fs.writeFile(path.join(locations.data,'indicator-preview.png'),image.toPNG());
        pill.webContents.send('state',{state:'error',message:'A detailed error must never expand this overlay.'});
        result.indicatorError=await pill.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,detailsPanel:!!document.getElementById("details"),text:document.body.innerText})');
      }
      for(const k of ['ffmpegBin','whisperBin','whisperCpuBin','whisperModel']) {
        try{await fs.access(resolvePath(config[k],locations.root));result[k]='present';}catch{result[k]='missing';}
      }
      result.helper=await windows.call('target');
      result.emptyClipboardSnapshot=(await windows.snapshot({...insertionClipboard,read:async()=>[{types:[]}]})).length===0;
      result.nativeCapture=await windows.call('capture-info');if(!result.nativeCapture.available)throw Error('Native capture helper failed: '+result.nativeCapture.error);
      result.modelCatalog=await settings.webContents.executeJavaScript('window.vf.getModels()');
      result.editingModel=await settings.webContents.executeJavaScript('window.vf.getEditingModel()');
      result.editingDownloadControls=await settings.webContents.executeJavaScript('!!document.getElementById("useOllama").onchange && !document.getElementById("editing-enable")');
      if(process.argv.includes('--self-test-ui')){
        const names=['get-models','use-model','get-editing-model','download-editing-model','enable-editing-model','save-config'];
        const real=Object.fromEntries(names.map(name=>[name,handlers[name]]));let selected=0,downloads=0,enabled=0,disabled=0;
        try{
          handlers['get-models']=()=>[{id:'test-model',label:'Test model',installed:true,selected:true,description:'Test only',downloadBytes:0}];
          handlers['use-model']=()=>{selected++;return config;};
          handlers['get-editing-model']=()=>({installed:false,downloadBytes:1000000});
          handlers['download-editing-model']=()=>{downloads++;};
          handlers['enable-editing-model']=()=>{enabled++;return {...config,useOllama:true};};
          handlers['save-config']=update=>{if(update.useOllama===false)disabled++;return {...config,...update};};
          result.immediateModelControls=await settings.webContents.executeJavaScript(`(async()=>{
            await refreshModels();await document.getElementById('model-choice').onchange();
            const toggle=document.getElementById('useOllama');toggle.checked=true;await toggle.onchange();if(!toggle.checked)throw Error('Editing enable did not finish');
            toggle.checked=false;await toggle.onchange();if(toggle.checked)throw Error('Editing off did not finish');
            return !document.getElementById('model-use')&&!document.getElementById('editing-enable')&&!document.getElementById('editing-disable');
          })()`);
          if(!result.immediateModelControls||selected!==1||downloads!==1||enabled!==1||disabled!==1)throw Error('Immediate model controls failed');
          result.modelControlActions={selected,downloads,enabled,disabled};
        }finally{for(const name of names)handlers[name]=real[name];}
      }
      if(process.argv.includes('--self-test-setup')){
        result.quickSetup=await settings.webContents.executeJavaScript(`(async()=>{
          let config={hotkey:'F9',micDevice:'',historyEnabled:false},downloads=0,editingDownloads=0,warmed=0,micTests=0;
          const fake={getConfig:async()=>config,getModels:async()=>[{id:'parakeet-v3',label:'Parakeet',selected:true,installed:false},{id:'whistle',label:'Whistle',installed:false,downloadBytes:17885885,description:'No Portuguese; maximum 30 seconds.'}],getEditingModel:async()=>({installed:false,available:${JSON.stringify(distribution.managedEditing)},reason:'Test public editing policy',downloadBytes:1980000000}),getHardware:async()=>({device:'cpu',speechDownloadBytes:719503874,title:'Works with your processor',message:'Processor version selected.'}),on:()=>()=>{},
            downloadModel:async()=>{if(++downloads===1)throw Error('Test interruption');},useModel:async()=>({...config,speechBackend:'parakeet'}),listDevices:async()=>['Test microphone'],
            testMicrophone:async()=>({usable:++micTests>1}),saveConfig:async update=>(config={...config,...update}),warmModel:async()=>{if(++warmed===1)throw Error('Test startup failure');},
            downloadEditingModel:async()=>{editingDownloads++;},enableEditingModel:async()=>config,cancelModelDownload:()=>{},closeSettings:()=>{}};
          const setup=await createVoiceFlowSetup(fake,true),button=()=>document.getElementById('setup-primary');
          const modelChoice=document.getElementById('setup-model');modelChoice.value='whistle';modelChoice.onchange();
          if(!button().textContent.includes('18 MB'))throw Error('Setup model-specific download size missing');
          modelChoice.value='parakeet-v3';modelChoice.onchange();
          if(downloads)throw Error('Setup downloaded without a click');
          await button().onclick();if(setup.step!==1||!document.getElementById('setup-status').textContent.includes('Try again'))throw Error('Setup retry missing');
          await button().onclick();if(setup.step!==2||!button().disabled)throw Error('Microphone test must be required');
          await document.getElementById('setup-test').onclick();if(!button().disabled)throw Error('Silent microphone accepted');
          await document.getElementById('setup-test').onclick();if(button().disabled)throw Error('Valid microphone rejected');
          await button().onclick();if(setup.step!==3||!config.historyEnabled)throw Error('History or microphone was not saved');
          const finishButton=document.getElementById(${JSON.stringify(distribution.managedEditing?'setup-secondary':'setup-primary')});
          await finishButton.onclick();if(setup.step!==3||config.setupCompleted)throw Error('Failed model load completed setup');
          await finishButton.onclick();if(setup.step!==4||!config.setupCompleted||editingDownloads)throw Error('Optional editing check: '+JSON.stringify({step:setup.step,config,warmed,editingDownloads,status:document.getElementById('setup-status').textContent}));
          return {step:setup.step,downloads,micTests,warmed,editingDownloads,historyEnabled:config.historyEnabled,setupCompleted:config.setupCompleted};
        })()`);
        await fs.writeFile(path.join(locations.data,'setup-preview.png'),(await settings.webContents.capturePage()).toPNG());
      }
      if(process.argv.includes('--self-test-ai')) {
        const c={...config,useOllama:true,cleanupMode:'dictation',managedOllama:true,ollamaModel:'qwen2.5:3b',cleanupPrompt:''},signal=new AbortController().signal;
        await localAI.warm(c,signal);
        result.intelligentDictation=await cleanup('Lista: três litros de água, não, pera, dois litros de água, um quilo de banana e abacaxi.',c,signal,(url,options)=>localAI.request(c,url,options,signal));
        result.localAI=await localAI.status(c);
        if(result.intelligentDictation.mode!=='llm' || !/Dois|2/i.test(result.intelligentDictation.text) || /Três|3/i.test(result.intelligentDictation.text))throw Error('Packaged intelligent dictation failed');
      }
      if(process.argv.includes('--self-test-whistle')) {
        const testConfig={...config,speechBackend:'whistle',language:'en',device:'auto'},signal=new AbortController().signal;
        await engine.warm(testConfig,signal);result.whistle={...engine.info};
        const index=process.argv.indexOf('--test-audio'),audio=process.argv[index+1];
        if(index>=0){result.whistleTranscript=await engine.transcribe(audio,testConfig,signal);if(!result.whistleTranscript.text.trim())throw Error('Packaged Whistle did not transcribe');}
        await engine.unload();result.whistleUnloaded=!engine.info.loaded;
        await localAI.close();
        result.aiOff=await cleanup('Buy three kilograms of rice and two kilograms of beans. Actually seven kilograms of rice.',{...config,useOllama:false},signal,()=>{throw Error('Disabled editor must not run');});
        if(result.aiOff.mode!=='whisper')throw Error('Disabled editor was called');
        result.editingOffControl=await settings.webContents.executeJavaScript('!!document.getElementById("useOllama").onchange && !document.getElementById("editing-disable")');
        if(!result.editingOffControl)throw Error('Editing off control missing');
        const originalConfig=config,configBytes=await fs.readFile(configFile).catch(()=>null),historyBytes=await fs.readFile(historyFile).catch(()=>null);
        try {
          await handlers['save-config']({useOllama:false,historyEnabled:false});
          const savedHistory=await fs.readFile(historyFile).catch(()=>null);
          result.historyPauseRetainsEntries=historyBytes===null?savedHistory===null:historyBytes.equals(savedHistory);
          result.editorDisabledAndUnloaded=!config.useOllama&&!(await localAI.status(config)).loaded;
          if(!result.historyPauseRetainsEntries||!result.editorDisabledAndUnloaded)throw Error('Editing off or history retention failed');
        }finally{config=originalConfig;if(configBytes)await fs.writeFile(configFile,configBytes);else await fs.rm(configFile,{force:true});}
      }
      atomicJson(path.join(locations.data,'self-test-report.json'),result);app.quit();return;
    }
    if(configWarning)notify({state:'error',message:configWarning});if(!config.micDevice || process.argv.includes('--settings'))createSettings();
  }).catch(e=>{console.error(e);app.exit(1);});
  app.on('window-all-closed',()=>{});
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();quitting=true;clearTimeout(hideTimer);warming?.abort();downloadAbort?.abort();try{hook?.stop();}catch{}
    Promise.resolve(controller?.close()).then(()=>microphoneTask?.catch(()=>{})).then(()=>downloadTask?.catch(()=>{})).then(()=>engine.unload()).then(()=>localAI.close()).finally(()=>{windows.close();app.quit();});
  });
}
