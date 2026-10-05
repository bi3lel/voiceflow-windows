(function(root,factory){const value=factory();if(typeof module==='object')module.exports=value;else root.ModelControls=value;})(globalThis,()=>{
  function create(api,notify=()=>{}){
    let busy=false,desired=false,editingTask=null;
    async function select(id,download=false){
      if(busy||editingTask)throw Error('Wait for the current model change to finish.');
      busy=true;notify({busy:true});
      try{
        const item=(await api.getModels()).find(x=>x.id===id);
        if(!item)throw Error('Unknown speech model.');
        if(!item.installed){if(!download)return null;await api.downloadModel(id);}
        return await api.useModel(id);
      }finally{busy=false;notify({busy:false});}
    }
    function editing(on){
      desired=!!on;
      if(editingTask){if(!desired)api.cancelModelDownload().catch(()=>{});return editingTask;}
      if(busy)return Promise.reject(Error('Wait for the speech model download to finish.'));
      editingTask=(async()=>{
        notify({editingBusy:true});
        try{
          let result;
          do{
            const target=desired;
            const config=await api.getConfig();
            if(target){
              if(config.editingBackend==='ollama')result=await api.saveConfig({useOllama:true});
              else{
                const state=await api.getEditingModel();
                if(!state.installed){
                  notify({editingDownloading:true});
                  try{await api.downloadEditingModel();}catch(e){if(desired)throw e;}
                }
                result=desired?await api.enableEditingModel():await api.saveConfig({useOllama:false});
              }
            }else result=await api.saveConfig({useOllama:false});
            if(result.useOllama===desired)return result;
          }while(true);
        }finally{editingTask=null;notify({editingBusy:false,editingDownloading:false});}
      })();
      return editingTask;
    }
    return {select,editing};
  }
  return {create};
});
