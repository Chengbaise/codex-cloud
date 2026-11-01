// Run with Electron under a desktop display: electron scripts/smoke.cjs
const {app, BrowserWindow, session} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-smoke-'));
app.setPath('userData', path.join(root,'profile'));
app.setPath('downloads', root);
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn) { for(let i=0;i<100;i++){if(await fn())return;await wait(100);}throw Error('Timed out'); }
app.whenReady().then(async()=>{
  await session.fromPartition('persist:gallery').protocol.handle('https', request=>{
    const url = new URL(request.url);
    if(url.pathname==='/image.png')return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="sample.png"'}});
    return new Response('<!doctype html><title>Fixture Gallery</title><form action="/"><input name="f_search"><button type="submit">Search</button></form><img src="/preview.png">',{headers:{'Content-Type':'text/html'}});
  });
});
require('../src/main.cjs');
app.whenReady().then(async()=>{
 try{
  await until(()=>BrowserWindow.getAllWindows().length>0);
  const win=BrowserWindow.getAllWindows()[0];
  await until(()=>win.webContents.getURL().startsWith('file:')&&!win.webContents.isLoading());
  const view=win.contentView.children[0];
  await win.webContents.executeJavaScript('window.desktop.navigate("home")');
  await until(()=>view.webContents.getTitle()==='Fixture Gallery'&&!view.webContents.isLoading());
  assert.equal(await win.webContents.executeJavaScript('!!window.desktop'),true,'preload bridge loads');
  const result=await win.webContents.executeJavaScript('window.desktop.search("sample author","artist")');
  assert.equal(result.ok,true);
  await until(()=>view.webContents.getURL().includes('f_search='));
  assert.equal(new URL(view.webContents.getURL()).searchParams.get('f_search'),'artist:"sample author"');
  await win.webContents.executeJavaScript('document.getElementById("downloads").click()');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("download-panel").hidden'),false);
  view.webContents.downloadURL('https://ex.810114.xyz/image.png');
  await until(async()=>await win.webContents.executeJavaScript('document.getElementById("jobs").textContent.includes("已完成")'));
  assert.equal(fs.readFileSync(path.join(root,'sample.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  await win.webContents.executeJavaScript('document.getElementById("browse").click()');
  assert.ok(view.getBounds().width>0);
  await win.webContents.capturePage().then(image=>fs.writeFileSync(path.join(root,'window.png'),image.toPNG()));
  console.log('PASS: window, preload, author form submission, panel switch, image download, saved file.');
  console.log('Smoke artifacts:',root);
  app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
