const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {safeUrl,safeFilename,uniquePath}=require('./core.cjs');
const {validateSource,comic,pages,listing,endpoint,localListing}=require('./sources.cjs');
const demo=require('./demo.cjs');
class SourceService{
 constructor({directory,session,getDownloadDirectory,jobs,publish}){this.root=directory;this.session=session;this.getDownloadDirectory=getDownloadDirectory;this.jobs=jobs;this.publish=publish;this.sources=[demo];this.library={favorites:[],progress:{}};fs.mkdirSync(directory,{recursive:true});
  const sourceFile=path.join(directory,'sources.json');if(fs.existsSync(sourceFile)){const saved=JSON.parse(fs.readFileSync(sourceFile,'utf8'));this.sources.push(...saved.map(validateSource));}
  const libraryFile=path.join(directory,'library.json');if(fs.existsSync(libraryFile)){const saved=JSON.parse(fs.readFileSync(libraryFile,'utf8'));if(!Array.isArray(saved.favorites)||!saved.progress||typeof saved.progress!=='object')throw Error('书架存储格式无效');this.library=saved;}
 }
 save(name,data){const target=path.join(this.root,name+'.json');fs.writeFileSync(target+'.tmp',JSON.stringify(data,null,2));fs.renameSync(target+'.tmp',target);}
 list(){return this.sources.map(({comics,...s})=>({...s,count:comics?.length}));}
 source(id){const s=this.sources.find(s=>s.id===id);if(!s)throw Error('源不存在，请先导入');return s;}
 async fetch(url,{image=false,signal}={}){
  if(!safeUrl(url))throw Error('仅允许 HTTPS 地址');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try{for(let i=0;i<6;i++){
   const r=await this.session.fetch(url,{redirect:'manual',signal:controller.signal});
   if(r.status>=300&&r.status<400){const location=r.headers.get('location');if(!location)throw Error('源重定向缺少 Location');const next=new URL(location,url).href;if(!safeUrl(next))throw Error('不允许的重定向');await r.body?.cancel();url=next;continue;}
   if(!r.ok)throw Error(`源请求失败：HTTP ${r.status}`);
   const mime=(r.headers.get('content-type')||'').split(';')[0];
   if(image&&!['image/jpeg','image/png','image/gif','image/webp','image/avif'].includes(mime))throw Error('下载响应不是支持的图片');
   const limit=image?30*1024*1024:8*1024*1024;let size=0;const buffers=[];
   for await(const chunk of r.body){size+=chunk.length;if(size>limit){controller.abort();throw Error('源响应超过大小限制');}buffers.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(buffers);return image?{bytes,mime}:JSON.parse(bytes.toString('utf8'));
  }throw Error('源重定向过多');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 async import(value){const parsed=validateSource(value);if(this.sources.some(s=>s.id===parsed.id))throw Error('源 ID 已存在，请先删除旧源再导入');this.sources.push(parsed);try{this.save('sources',this.sources.filter(s=>s.id!=='demo'));}catch(e){this.sources.pop();throw e;}return this.list();}
 remove(id){if(id==='demo')throw Error('内置演示源不能删除');const before=this.sources;this.sources=this.sources.filter(s=>s.id!==id);try{this.save('sources',this.sources.filter(s=>s.id!=='demo'));}catch(e){this.sources=before;throw e;}return this.list();}
 async browse(id,query='',mode='keyword',page=1,match='contains'){const s=this.source(id);if(!['keyword','artist','title'].includes(mode)||!['contains','fuzzy','exact'].includes(match))throw Error('不支持的搜索方式');page=Number(page);if(!Number.isInteger(page)||page<1||page>10000)throw Error('页码无效');if(typeof query!=='string'||query.length>500)throw Error('搜索词过长');if(s.type==='demo'){const data=localListing(s,query,mode,page,match);data.items.forEach(c=>c.cover=s.comics.find(x=>x.id===c.id).cover);return data;}return s.type!=='api'?localListing(s,query,mode,page,match):listing(await this.fetch(endpoint(s,query?'search':'browse',{query,mode,page,match})));}
 async detail(id,comicId){const s=this.source(id);const result=s.type==='api'?comic(await this.fetch(endpoint(s,'detail',{id:comicId})),true):s.comics.find(c=>c.id===comicId);if(!result)throw Error('漫画不存在');return result;}
 async chapter(id,comicId,chapterId){const s=this.source(id);if(s.type==='api')return pages((await this.fetch(endpoint(s,'chapter',{id:comicId,chapterId}))).pages);const c=await this.detail(id,comicId);const chapter=c.chapters.find(ch=>ch.id===chapterId);if(!chapter)throw Error('章节不存在');return chapter.pages;}
 remember(id,comicId,chapterId,page){if(!Number.isInteger(page)||page<0||page>3000)throw Error('阅读进度无效');this.library.progress[JSON.stringify([id,comicId])]={chapterId,page,updatedAt:Date.now()};this.save('library',this.library);}
 favorite(id,book){this.source(id);const validated=comic(book);if(id==='demo')validated.cover=demo.comics.find(x=>x.id===validated.id)?.cover||'';const index=this.library.favorites.findIndex(x=>x.sourceId===id&&x.id===validated.id);if(index>=0)this.library.favorites.splice(index,1);else this.library.favorites.push({...validated,sourceId:id});this.save('library',this.library);return this.library;}
 async download(id,comicId,chapterId){const s=this.source(id);const book=await this.detail(id,comicId);const chapter=book.chapters.find(c=>c.id===chapterId);if(!chapter)throw Error('章节不存在');const urls=await this.chapter(id,comicId,chapterId);
  const parent=path.join(this.getDownloadDirectory(),safeFilename(s.name),safeFilename(book.title));fs.mkdirSync(parent,{recursive:true});const folder=uniquePath(parent,chapter.title);fs.mkdirSync(folder);
  const controller=new AbortController(),job={id:crypto.randomUUID(),name:`${book.title} / ${chapter.title}`,path:folder,received:0,total:urls.length,unit:'pages',state:'progressing',item:{cancel:()=>controller.abort()}};this.jobs.set(job.id,job);this.publish();
  (async()=>{const files=[];try{for(let i=0;i<urls.length;i++){
   if(controller.signal.aborted)throw Error('cancelled');
   let result;
   if(s.type==='demo'){result={bytes:Buffer.from(urls[i].split(',')[1],'base64'),mime:'image/svg+xml'};}
   else if(urls[i].startsWith('data:')){const match=urls[i].match(/^data:([^;]+);base64,(.*)$/);result={mime:match[1],bytes:Buffer.from(match[2],'base64')};}
   else result=await this.fetch(urls[i],{image:true,signal:controller.signal});
   const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'}[result.mime];
   const filename=`${String(i+1).padStart(4,'0')}.${ext}`;fs.writeFileSync(path.join(folder,filename),result.bytes);files.push(filename);job.received=i+1;this.publish();
  }fs.writeFileSync(path.join(folder,'chapter.json'),JSON.stringify({sourceId:id,comicId,title:book.title,chapter:chapter.title,files},null,2));job.state='completed';}
  catch(e){job.state=controller.signal.aborted?'cancelled':'interrupted';job.error=e.message;}
  finally{job.item=null;this.publish();}})();return job.id;
 }
}
module.exports=SourceService;
