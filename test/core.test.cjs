const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');
const {safeUrl,safeFilename,uniquePath,searchScript}=require('../src/core.cjs');
test('remote navigation rejects local resources and embedded credentials',()=>{
 for(const value of ['file:///etc/passwd','javascript:alert(1)','http://example.com','https://user:pass@example.com','invalid'])assert.equal(safeUrl(value),null);
 assert.equal(safeUrl('https://ex.810114.xyz/'),'https://ex.810114.xyz/');
});
test('downloads sanitize traversal and Windows filenames',()=>{
 assert.equal(safeFilename('../../hello.jpg'),'hello.jpg');assert.equal(safeFilename('C:\\temp\\a:b.jpg'),'a_b.jpg');assert.match(safeFilename('CON.txt'),/^image-/);
});
test('download paths preserve existing files and concurrent downloads',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gallery-test-'));
 try{fs.writeFileSync(path.join(folder,'image.jpg'),'original');
 const second=uniquePath(folder,'image.jpg');assert.equal(second,path.join(folder,'image (1).jpg'));
 assert.equal(uniquePath(folder,'image.jpg',new Set([second])),path.join(folder,'image (2).jpg'));
 assert.equal(fs.readFileSync(path.join(folder,'image.jpg'),'utf8'),'original');}finally{fs.rmSync(folder,{recursive:true});}
});
test('author search submits actual form without evaluating user text',()=>{
 let submitted=false;const input={value:'',dispatchEvent(){},form:{querySelector:()=>null,requestSubmit(){submitted=true;}}};
 const context={document:{querySelector:()=>input},Event:class{}};
 const result=vm.runInNewContext(searchScript('name"; globalThis.exploited=true;//','artist'),context);
 assert.equal(result.ok,true);assert.equal(submitted,true);assert.match(input.value,/^artist:"/);assert.equal(context.exploited,undefined);
});
test('unsupported website search returns actionable error',()=>{assert.equal(vm.runInNewContext(searchScript('author','artist'),{document:{querySelector:()=>null}}).ok,false);});
