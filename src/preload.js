const { contextBridge, ipcRenderer } = require('electron');
const { events } = require('../lib/ipc');
contextBridge.exposeInMainWorld('vf', {
  getConfig:()=>ipcRenderer.invoke('get-config'), saveConfig:c=>ipcRenderer.invoke('save-config',c),
  getHardware:()=>ipcRenderer.invoke('get-hardware'),
  getEditingModel:()=>ipcRenderer.invoke('get-editing-model'),downloadEditingModel:()=>ipcRenderer.invoke('download-editing-model'),enableEditingModel:()=>ipcRenderer.invoke('enable-editing-model'),
  getModels:()=>ipcRenderer.invoke('get-models'),downloadModel:id=>ipcRenderer.invoke('download-model',id),useModel:id=>ipcRenderer.invoke('use-model',id),cancelModelDownload:()=>ipcRenderer.invoke('cancel-model-download'),
  openHistory:()=>ipcRenderer.send('open-history-window'),
  updateHistoryItem:entry=>ipcRenderer.invoke('update-history-item',entry),
  reformatHistoryItem:entry=>ipcRenderer.invoke('reformat-history-item',entry),
  exportHistory:()=>ipcRenderer.invoke('export-history'),
  getHistory:()=>ipcRenderer.invoke('get-history'), clearHistory:()=>ipcRenderer.invoke('clear-history'),
  deleteHistoryItem:id=>ipcRenderer.invoke('delete-history-item',id), copyText:text=>ipcRenderer.invoke('copy-text',text),
  copyLast:()=>ipcRenderer.invoke('copy-last'), diagnostics:()=>ipcRenderer.invoke('diagnostics'),
  unloadModel:()=>ipcRenderer.invoke('unload-model'), warmModel:()=>ipcRenderer.invoke('warm-model'),
  cancel:()=>ipcRenderer.invoke('cancel'), listDevices:()=>ipcRenderer.invoke('list-devices'),
  testMicrophone:device=>ipcRenderer.invoke('test-microphone',device),
  openSettings:()=>ipcRenderer.send('open-settings'), closeSettings:()=>ipcRenderer.send('close-settings'),
  hidePill:()=>ipcRenderer.send('hide-pill'),
  shortcutCapture:enabled=>ipcRenderer.send('shortcut-capture',enabled),
  on:(channel,fn)=>{
    if(!events.includes(channel)||typeof fn!=='function')return;
    const listener=(_,data)=>fn(data);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);
  }
});
