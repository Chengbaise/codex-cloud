const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  sources:()=>ipcRenderer.invoke('sources-list'),
  importSource:(kind,value)=>ipcRenderer.invoke('sources-import',kind,value),
  removeSource:id=>ipcRenderer.invoke('sources-remove',id),
  comic:(action,payload)=>ipcRenderer.invoke('comic',action,payload),
  navigate:action=>ipcRenderer.invoke('navigate',action),
  search:(term,mode)=>ipcRenderer.invoke('search',term,mode),
  panel:show=>ipcRenderer.invoke('panel',show),
  init:()=>ipcRenderer.invoke('init'),
  chooseDirectory:()=>ipcRenderer.invoke('choose-directory'),
  openDirectory:()=>ipcRenderer.invoke('open-directory'),
  job:(id,action)=>ipcRenderer.invoke('job',id,action),
  on:(channel,callback)=>{if(['downloads','browser-state','notice'].includes(channel))ipcRenderer.on(channel,(_event,value)=>callback(value));}
});
