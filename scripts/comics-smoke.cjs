const {app,BrowserWindow,session}=require('electron');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-comics-'));app.setPath('userData',path.join(root,'profile'));app.setPath('downloads',root);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<150;i++){if(await fn())return;await wait(100);}throw Error('Timed out');}
app.whenReady().then(()=>{session.fromPartition('persist:gallery').protocol.handle('https',request=>{
 const u=new URL(request.url);if(u.pathname==='/browse')return Response.json({items:[{id:'live',title:'API 样本漫画',author:'样本画师'}],hasMore:false});
 if(u.pathname==='/comic/live')return Response.json({id:'live',title:'API 样本漫画',author:'样本画师',chapters:[{id:'first',title:'样本第一章'}]});
 if(u.pathname==='/chapter/first')return Response.json({pages:['https://fixture.invalid/image.png']});
 return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}});
 });});
require('../src/main.cjs');
app.whenReady().then(async()=>{try{
 await until(()=>BrowserWindow.getAllWindows().length);const win=BrowserWindow.getAllWindows()[0],wc=win.webContents;
 const js=code=>wc.executeJavaScript(code);
 await until(async()=>!wc.isLoading()&&await js('!!document.querySelector(".comic-card")'));
 assert.equal(await js('getComputedStyle(document.documentElement).backgroundColor'),'rgb(0, 0, 0)');
 await js('document.getElementById("search-mode").value="title";document.getElementById("query").value="山信";document.getElementById("search-match").value="contains";document.getElementById("search-form").requestSubmit()');
 await until(()=>js('document.getElementById("comic-content").textContent.includes("没有找到漫画")'));
 await js('document.getElementById("search-match").value="fuzzy";document.getElementById("search-match").dispatchEvent(new Event("change"));document.getElementById("search-form").requestSubmit()');
 await until(()=>js('!!document.querySelector(".comic-card")'));

 await until(()=>js('document.querySelector(".comic-card img")?.naturalWidth===800'));
 fs.writeFileSync(path.join(root,'explore.png'),(await wc.capturePage()).toPNG());
 await js('document.querySelector(".comic-card").click()');await until(()=>js('!!document.querySelector(".chapters")'));
 await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="加入书架").click()');await until(()=>js('!!Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="移出书架")'));
 await js('document.querySelector(".chapter-row button").click()');await until(()=>js('document.querySelector(".reader-image")?.naturalWidth===800'));
 await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="下一页 →").click()');
 await until(async()=>{const lib=await js('window.desktop.comic("library")');return lib.progress['["demo","journey"]']?.page===1;});
 await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="切换条漫").click()');assert.equal(await js('document.querySelectorAll(".reader-image").length'),3);
 await until(()=>js('Array.from(document.querySelectorAll(".reader-image")).some(img=>img.naturalWidth===800)'));
 fs.writeFileSync(path.join(root,'reader.png'),(await wc.capturePage()).toPNG());
 await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="下载本章").click()');await until(()=>js('document.getElementById("jobs").textContent.includes("已完成")'));
 assert.equal(fs.readdirSync(path.join(root,'内置演示源','山间来信','第一章 · 出发')).filter(x=>x.endsWith('.svg')).length,3);
 await js('document.getElementById("library").click()');await until(()=>js('!!document.querySelector(".comic-card")'));
 const manifest={format:'atelier-source-v1',id:'api-fixture',name:'测试 API 源',type:'api',baseUrl:'https://fixture.invalid',endpoints:{browse:'/browse',search:'/browse',detail:'/comic/{id}',chapter:'/chapter/{chapterId}'}};
 await js('document.getElementById("sources").click()');
 await until(()=>js('document.getElementById("source-list").textContent.includes("内置演示源")'));
 await js(`document.getElementById('source-json').value=${JSON.stringify(JSON.stringify(manifest))};document.getElementById('import-text').click()`);
 await until(()=>js('document.getElementById("source-list").textContent.includes("测试 API 源")'));
 await js('document.getElementById("sources").click()');await until(()=>js('document.getElementById("source-list").textContent.includes("测试 API 源")'));
 await js('currentSource="api-fixture"; explore()');await until(()=>js('document.getElementById("comic-content").textContent.includes("API 样本漫画")'));
 await js('document.querySelector(".comic-card").click()');await until(()=>js('!!document.querySelector(".chapters")'));
 await js('document.querySelector(".chapter-row button").click()');await until(()=>js('document.querySelector(".reader-image")?.naturalWidth===1'));
 await js('document.getElementById("sources").click()');await until(()=>js('document.getElementById("source-list").textContent.includes("测试 API 源")'));
 fs.writeFileSync(path.join(root,'sources.png'),(await wc.capturePage()).toPNG());
 const stored=JSON.parse(fs.readFileSync(path.join(root,'profile','comic-data','sources.json')));assert.equal(stored[0].id,'api-fixture');
 console.log('PASS: demo browse, chapters, favorite, progress, single/strip reader, chapter download, source import and persistence, real Electron session JSON API and image load.');console.log('Artifacts:',root);app.exit(0);
}catch(e){console.error(e);app.exit(1);}});
