const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SourceService = require('./source-service.cjs');
const { SITE, safeUrl, uniquePath, searchScript } = require('./core.cjs');
let win, browser, directory, hidden = true;
const jobs = new Map(), reserved = new Set();
function send(channel, data) { if (win && !win.isDestroyed()) win.webContents.send(channel, data); }
function publishJobs() { send('downloads', [...jobs.values()].map(({item, ...job}) => job)); }
function state() {
  const wc = browser.webContents;
  send('browser-state', { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward() });
}
function bounds() {
  if (!win || !browser) return;
  const [width, height] = win.getContentSize();
  browser.setBounds(hidden ? {x:0,y:0,width:0,height:0} : {x:216,y:164,width:Math.max(0,width-216),height:Math.max(0,height-200)});
}
function load(url) { const valid = safeUrl(url); if (!valid) throw new Error('仅支持 HTTPS 地址'); return browser.webContents.loadURL(valid).catch(error => send('notice', `页面加载失败：${error.message}`)); }
app.whenReady().then(() => {
  nativeTheme.themeSource='dark';
  const config = path.join(app.getPath('userData'), 'settings.json');
  directory = app.getPath('downloads');
  try { const saved = JSON.parse(fs.readFileSync(config, 'utf8')); if (fs.statSync(saved.directory).isDirectory()) directory = saved.directory; } catch {}
  win = new BrowserWindow({width:1360,height:900,minWidth:980,minHeight:640,title:'拾图 · 多源漫画阅读器',backgroundColor:'#000000',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  Menu.setApplicationMenu(null);
  browser = new WebContentsView({webPreferences:{partition:'persist:gallery',contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.contentView.addChildView(browser);
  browser.webContents.setWindowOpenHandler(({url}) => { if (safeUrl(url)) load(url); return {action:'deny'}; });
  browser.webContents.on('will-navigate', (event, url) => { if (!safeUrl(url)) event.preventDefault(); });
  browser.webContents.on('will-redirect', (event, url) => { if (!safeUrl(url)) event.preventDefault(); });
  browser.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  for (const event of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated']) browser.webContents.on(event, state);
  browser.webContents.on('did-fail-load', (_event, code, message, url, main) => { if (main && code !== -3) send('notice', `无法打开网站（${code}）：${message}。可点击刷新重试。`); });
  browser.webContents.on('context-menu', (_event, params) => {
    const items = [];
    if (params.mediaType === 'image' && safeUrl(params.srcURL)) {
      items.push({label:'下载这张图片', click:()=>browser.webContents.downloadURL(params.srcURL)});
      items.push({label:'复制图片地址', role:undefined, click:()=>require('electron').clipboard.writeText(params.srcURL)});
    }
    items.push({label:'返回', enabled:browser.webContents.navigationHistory.canGoBack(), click:()=>browser.webContents.navigationHistory.goBack()},{label:'刷新', click:()=>browser.webContents.reload()});
    Menu.buildFromTemplate(items).popup({window:win});
  });
  browser.webContents.session.on('will-download', (_event,item) => {
    const id=crypto.randomUUID();
    const target=uniquePath(directory,item.getFilename(),reserved); reserved.add(target);
    item.setSavePath(target);
    const job={id,name:path.basename(target),path:target,received:0,total:item.getTotalBytes(),state:'progressing',item};
    jobs.set(id,job); publishJobs();
    item.on('updated',(_event,status)=>{job.received=item.getReceivedBytes();job.total=item.getTotalBytes();job.state=status;publishJobs();});
    item.once('done',(_event,status)=>{job.received=item.getReceivedBytes();job.state=status;reserved.delete(target);job.item=null;publishJobs();});
  });
  let sourceService;
  try { sourceService = new SourceService({directory:path.join(app.getPath('userData'),'comic-data'),session:browser.webContents.session,getDownloadDirectory:()=>directory,jobs,publish:publishJobs}); }
  catch(error){dialog.showErrorBox('无法读取漫画源或书架数据',error.message);app.quit();return;}
  const localSender = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  const handle = (name, fn) => ipcMain.handle(name, (event,...args)=>{if(!localSender(event)) throw new Error('无权调用'); return fn(...args);});
  handle('sources-list',()=>sourceService.list());
  let importController=null;
  handle('sources-import-cancel',()=>{if(importController){importController.abort();return true;}return false;});
  handle('sources-import',async(kind,value)=>{
    if(importController)return {ok:false,error:'已有源正在导入，请等待完成或取消后重试。'};
    let controller;
    try{
      let data;
      if(kind==='file'){
        const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'漫画源 JSON',extensions:['json']}]});
        if(result.canceled)return {ok:true,sources:sourceService.list()};
        if(fs.statSync(result.filePaths[0]).size>8*1024*1024)throw Error('源文件超过 8 MB');
        try{data=JSON.parse(fs.readFileSync(result.filePaths[0],'utf8').replace(/^\uFEFF/,''));}catch(error){if(error instanceof SyntaxError)throw Error('源文件不是有效的 JSON，请检查文件格式。');throw error;}
      }else if(kind==='url'){
        if(typeof value!=='string'||value.length>2000)throw Error('源地址无效');
        controller=new AbortController();importController=controller;
        data=await sourceService.fetch(value.trim(),{timeoutMs:90000,signal:controller.signal});
        if(controller.signal.aborted)return {ok:false,cancelled:true,error:'导入已取消'};
      }else if(kind==='text'){
        if(typeof value!=='string'||value.length>8*1024*1024)throw Error('源内容过大');
        try{data=JSON.parse(value.replace(/^\uFEFF/,''));}catch{throw Error('粘贴的内容不是有效的 JSON。');}
      }else throw Error('不支持的导入方式');
      return {ok:true,sources:await sourceService.import(data)};
    }catch(error){
      const cancelled=controller?.signal.aborted===true;
      return {ok:false,cancelled,error:cancelled?'导入已取消':error.message||'无法导入漫画源'};
    }finally{if(controller&&importController===controller)importController=null;}
  });
  handle('sources-remove',id=>sourceService.remove(id));
  handle('comic',async(action,p={})=>{
    if(!p||typeof p!=='object')throw Error('请求无效');
    if(action==='browse')return sourceService.browse(p.sourceId,p.query,p.mode,p.page,p.match);
    if(action==='detail')return sourceService.detail(p.sourceId,p.comicId);
    if(action==='chapter')return sourceService.chapter(p.sourceId,p.comicId,p.chapterId);
    if(action==='library')return sourceService.library;
    if(action==='image'){const image=await sourceService.fetch(p.url,{image:true});return `data:${image.mime};base64,${image.bytes.toString('base64')}`;}
    if(action==='favorite')return sourceService.favorite(p.sourceId,p.book);
    if(action==='progress')return sourceService.remember(p.sourceId,p.comicId,p.chapterId,p.page);
    if(action==='download')return sourceService.download(p.sourceId,p.comicId,p.chapterId);
    throw Error('不支持的漫画操作');
  });
  handle('navigate', action => {
    const wc=browser.webContents;
    if(action==='home') return load(SITE);
    if(action==='back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if(action==='forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if(action==='reload') wc.reload();
  });
  handle('search',async(term,mode)=>{
    if(typeof term!=='string' || !term.trim() || term.length>500) return {ok:false,error:'请输入 1–500 个字符'};
    const current=new URL(browser.webContents.getURL() || SITE);
    if(current.origin!==new URL(SITE).origin) return {ok:false,error:'请先返回目标网站首页再搜索'};
    try { return await browser.webContents.executeJavaScript(searchScript(term,mode)); }
    catch { return {ok:false,error:'搜索未完成，请等待页面加载后重试。'}; }
  });
  handle('panel', value=>{hidden=value===true;bounds();});
  handle('init',()=>({directory,site:SITE,jobs:[...jobs.values()].map(({item,...j})=>j)}));
  handle('choose-directory',async()=>{
    const result=await dialog.showOpenDialog(win,{defaultPath:directory,properties:['openDirectory','createDirectory']});
    if(!result.canceled){directory=result.filePaths[0];fs.writeFileSync(config,JSON.stringify({directory}));}
    return directory;
  });
  handle('open-directory',()=>shell.openPath(directory));
  handle('job',async(id,action)=>{
    const job=jobs.get(id);if(!job)return;
    if(action==='cancel' && job.item)job.item.cancel();
    if(action==='reveal' && job.state==='completed')shell.showItemInFolder(job.path);
  });
  win.on('resize',bounds);
  win.on('close',event=>{
    if([...jobs.values()].some(j=>j.item)){
      const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续下载','取消下载并退出'],defaultId:0,cancelId:0,message:'仍有下载正在进行'});
      if(choice===0){event.preventDefault();return;}
      for(const job of jobs.values())job.item?.cancel();
    }
  });
  win.on('closed',()=>{browser.webContents.close();win=null;});
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.once('did-finish-load',()=>{bounds();});
});
app.on('window-all-closed',()=>app.quit());
