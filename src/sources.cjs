const {safeUrl}=require('./core.cjs');
const plain=x=>x && typeof x==='object' && !Array.isArray(x);
function text(value,label,max=300){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label}无效`);return value.trim();}
function image(value){if(typeof value!=='string')return '';if(safeUrl(value)||/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value))return value;return '';}
function chapter(value,index){if(!plain(value))throw Error('章节格式无效');return {id:text(value.id,'章节 ID'),title:text(value.title||`第 ${index+1} 章`,'章节名称'),...(Array.isArray(value.pages)?{pages:pages(value.pages)}:{})};}
function pages(value){if(!Array.isArray(value)||!value.length||value.length>3000)throw Error('章节图片应为 1–3000 项数组');return value.map(v=>{const url=image(v);if(!url)throw Error('图片必须是 HTTPS 地址或内嵌 PNG/JPEG/WebP/GIF');return url;});}
function comic(value,detail=false){if(!plain(value))throw Error('漫画格式无效');const result={id:text(value.id,'漫画 ID'),title:text(value.title,'漫画标题'),author:typeof value.author==='string'?value.author.slice(0,300):'',cover:image(value.cover),description:typeof value.description==='string'?value.description.slice(0,10000):''};if(detail){if(!Array.isArray(value.chapters)||!value.chapters.length)throw Error('漫画没有章节');result.chapters=value.chapters.map(chapter);if(new Set(result.chapters.map(x=>x.id)).size!==result.chapters.length)throw Error('章节 ID 重复');}return result;}
function validateSource(value){
 if(!plain(value)||value.format!=='atelier-source-v1')throw Error('请选择 atelier-source-v1 JSON 源；暂不支持 Venera JS 脚本');
 const result={format:value.format,id:text(value.id,'源 ID',80),name:text(value.name,'源名称',100),version:typeof value.version==='string'?value.version:'1.0.0',type:value.type};
 if(!/^[a-zA-Z0-9_-]+$/.test(result.id)||result.id==='demo')throw Error('源 ID 仅支持字母、数字、下划线、短横线，demo 为保留 ID');
 if(value.type==='catalog'){
  if(!Array.isArray(value.comics)||!value.comics.length||value.comics.length>10000)throw Error('目录源需要 1–10000 部漫画');
  result.comics=value.comics.map(x=>comic(x,true));
  if(result.comics.some(c=>c.chapters.some(ch=>!ch.pages)))throw Error('目录源的每个章节都需要 pages 图片列表');
  if(new Set(result.comics.map(x=>x.id)).size!==result.comics.length)throw Error('漫画 ID 重复');
 }else if(value.type==='api'){
  if(!safeUrl(value.baseUrl))throw Error('API 根地址必须为 HTTPS');result.baseUrl=value.baseUrl;
  result.endpoints={};
  for(const key of ['browse','search','detail','chapter']){const template=text(value.endpoints?.[key],`${key} API`,2000);const url=new URL(template,result.baseUrl);if(!safeUrl(url.href)||url.origin!==new URL(result.baseUrl).origin)throw Error('API 接口必须与根地址同源');result.endpoints[key]=template;}
 }else throw Error('源类型应为 catalog 或 api');
 return result;
}
function endpoint(source,key,params){let template=source.endpoints[key];for(const [name,value]of Object.entries(params))template=template.replaceAll(`{${name}}`,encodeURIComponent(value));if(/\{[^}]+\}/.test(template))throw Error('API 模板包含未知占位符');return new URL(template,source.baseUrl).href;}
function listing(value){if(!plain(value)||!Array.isArray(value.items)||value.items.length>1000)throw Error('目录 API 应返回 {items, hasMore}');return {items:value.items.map(x=>comic(x)),hasMore:value.hasMore===true};}
// Normalize presentation differences without changing the displayed titles.
function normalizeQuery(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');}
function oneEditApart(a,b){
 const left=Array.from(a),right=Array.from(b);
 if(Math.abs(left.length-right.length)>1)return false;
 if(left.length===right.length){const positions=[];for(let i=0;i<left.length;i++)if(left[i]!==right[i])positions.push(i);return positions.length<=1||(positions.length===2&&positions[1]===positions[0]+1&&left[positions[0]]===right[positions[1]]&&left[positions[1]]===right[positions[0]]);}
 const short=left.length<right.length?left:right,long=left.length<right.length?right:left;
 let i=0,j=0,skips=0;while(i<short.length&&j<long.length){if(short[i]===long[j]){i++;j++;}else{if(++skips>1)return false;j++;}}return true;
}
function matchScore(value,query,match='contains'){
 const title=normalizeQuery(value),q=normalizeQuery(query);
 if(!q)return 0;
 if(title===q)return 100;
 if(match==='exact')return -1;
 if(title.includes(q))return 80;
 if(match!=='fuzzy')return -1;
 // Ordered subsequence: e.g. 山信 matches 山间来信.
 const queryChars=Array.from(q);let position=0;for(const char of title){if(char===queryChars[position])position++;}
 if(position===queryChars.length)return 50;
 if(queryChars.length>=3&&oneEditApart(title,q))return 30;
 return -1;
}
function localListing(source,query='',mode='keyword',page=1,match='contains'){
 const found=source.comics.map((book,index)=>{
  const values=mode==='artist'?[book.author]:mode==='title'?[book.title]:[book.title,book.author];
  return {book,index,score:Math.max(...values.map(value=>matchScore(value,query,match)))};
 }).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.index-b.index);
 const start=(page-1)*24;return{items:found.slice(start,start+24).map(x=>comic(x.book)),hasMore:start+24<found.length};
}
module.exports={validateSource,comic,pages,listing,endpoint,localListing,normalizeQuery,matchScore};
