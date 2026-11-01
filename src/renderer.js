const $ = id => document.getElementById(id);
const api=window.desktop;
let timer;
function notice(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,12000);}
function directory(value){$('directory').textContent=`保存到：${value}`;}
function panel(show){setPanel(show?'downloads':'browse');}
function setPanel(name){$('search-match').disabled=name==='browse';if(name==='browse')$('search-hint').textContent='网页搜索由网站自身表单处理，匹配方式由网站决定。';else if(typeof updateSearchHint==='function')updateSearchHint();api.panel(name!=='browse');for(const id of ['comic-panel','source-panel','download-panel'])$(id).hidden=id!==({'sources':'source-panel','downloads':'download-panel'}[name]|| (name==='browse'?'':'comic-panel'));for(const id of ['explore','library','sources','downloads','browse'])$(id).classList.toggle('active',id===name);$('heading').textContent=({explore:'发现漫画',library:'我的书架',sources:'漫画源',downloads:'下载管理',browse:'网页浏览'})[name]||'漫画阅读';}

$('browse').onclick=()=>{panel(false);api.navigate('home');};$('downloads').onclick=()=>panel(true);
for(const action of ['back','forward','reload','home'])$(action).onclick=()=>{panel(false);api.navigate(action).catch(e=>notice(e.message));};
$('search-form').onsubmit=async event=>{event.preventDefault();panel(false);const result=await api.search($('query').value,$('search-mode').value);if(!result.ok)notice(result.error);};
$('choose').onclick=async()=>directory(await api.chooseDirectory());
$('open-folder').onclick=async()=>{const error=await api.openDirectory();if(error)notice(error);};
const bytes=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${(n/1024).toFixed(0)} KB`;
function downloads(jobs){
 $('count').textContent=String(jobs.filter(j=>j.state==='progressing').length);
 $('empty').hidden=jobs.length>0;$('jobs').replaceChildren();
 const labels={progressing:'下载中',completed:'已完成',cancelled:'已取消',interrupted:'下载中断'};
 for(const job of jobs.toReversed()){
  const row=document.createElement('div');row.className='job';
  const info=document.createElement('div');info.className='job-info';
  const title=document.createElement('strong');title.textContent=job.name;
  const detail=document.createElement('p');detail.textContent=`${labels[job.state]||job.state} · ${job.unit==='pages'?`${job.received} / ${job.total} 页`:`${bytes(job.received)} / ${job.total?bytes(job.total):'未知大小'}`}${job.error?' · '+job.error:''}`;
  const progress=document.createElement('progress');if(job.total){progress.max=job.total;progress.value=job.received;}else if(job.state!=='progressing'){progress.max=1;progress.value=job.state==='completed'?1:0;}
  info.append(title,detail,progress);row.append(info);
  if(job.state==='completed'||job.state==='progressing'){
   const button=document.createElement('button');button.textContent=job.state==='completed'?'在文件夹中显示':'取消';button.onclick=()=>api.job(job.id,job.state==='completed'?'reveal':'cancel');row.append(button);
  }
  $('jobs').append(row);
 }
}
api.on('downloads',downloads);api.on('notice',notice);
api.on('browser-state',state=>{$('status').textContent=state.loading?'正在加载网站…':(state.url||'网站尚未加载');$('back').disabled=!state.back;$('forward').disabled=!state.forward;});
api.init().then(state=>{directory(state.directory);downloads(state.jobs);}).catch(e=>notice(e.message));
