const path = require('node:path');
const fs = require('node:fs');
const SITE = 'https://ex.810114.xyz/';
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
function safeFilename(value) {
  const name = path.basename(String(value).replaceAll('\\', '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) ? `image-${Date.now()}` : name;
}
function uniquePath(folder, filename, reserved = new Set()) {
  const clean = safeFilename(filename), ext = path.extname(clean), stem = path.basename(clean, ext);
  let target = path.join(folder, clean), n = 1;
  while (fs.existsSync(target) || reserved.has(target)) target = path.join(folder, `${stem} (${n++})${ext}`);
  return target;
}
function searchScript(term, mode) {
  // Submit a real website form instead of guessing an endpoint. Author means artist tag.
  const query = mode === 'artist' ? `artist:"${term.replaceAll('"', '').trim()}"` : term.trim();
  return `(() => {
    const input = document.querySelector('input[name="f_search"], input[name="q"], input[name="search"], input[type="search"]');
    if (!input || !input.form) return {ok:false, error:'当前页面未找到可识别的搜索框，请先返回网站首页，或直接使用网页搜索。'};
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    const button = input.form.querySelector('button[type="submit"], input[type="submit"]');
    input.form.requestSubmit(button || undefined);
    return {ok:true};
  })()`;
}
module.exports = { SITE, safeUrl, safeFilename, uniquePath, searchScript };
