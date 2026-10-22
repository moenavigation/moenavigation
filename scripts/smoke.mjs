import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
const base=process.argv[2]||'http://localhost:3005';
const queue=['/','/en','/cms'];
const seen=new Set();
const assets=new Set((await readdir(new URL('../public/images/',import.meta.url))).filter(file=>file.endsWith('.webp')).map(file=>`/images/${file}`));
const errors=[];
const attr=(html,name)=>[...html.matchAll(new RegExp(`${name}="([^"]+)"`,'g'))].map(m=>m[1].replaceAll('&amp;','&'));
while(queue.length) {
  const path=queue.shift();
  if(seen.has(path))continue;
  seen.add(path);
  try {
    const response=await fetch(new URL(path,base));
    assert.equal(response.status,200,`${path} HTTP status`);
    const html=await response.text();
    const lang=path.startsWith('/en')||path==='/cms'?'en':'th';
    assert.match(html,new RegExp(`<html[^>]*lang="${lang}"`),`${path} document language`);
    assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${path} one primary heading`);
    assert.match(html,/<meta name="robots" content="noindex, nofollow"\s*\/>/,`${path} demo noindex`);
    if(path!=='/cms') {
      assert.match(html,/<link rel="canonical"/,`${path} canonical`);
      assert.match(html,/hrefLang="th"/,`${path} Thai alternate`);
      assert.match(html,/hrefLang="en"/,`${path} English alternate`);
      assert.equal((html.match(/<header\b[^>]*data-site-header="true"/g)||[]).length,1,`${path} shared header`);
    }
    for(const src of attr(html,'src'))if(src.startsWith('/images/'))assets.add(src);
    for(const link of attr(html,'href')) {
      if(!link.startsWith('/')||link.startsWith('/_next/')||link.includes('.')||link.startsWith('//'))continue;
      const pathname=new URL(link,base).pathname;
      if(!seen.has(pathname))queue.push(pathname);
    }
  }catch(error){errors.push(error.message);}
}
for(const path of assets) {
  try{const response=await fetch(new URL(path,base));assert.equal(response.status,200,`${path} available`);assert.match(response.headers.get('content-type')||'',/^image\//,`${path} image content type`);}catch(error){errors.push(error.message);}
}
for(const path of ['/missing-page','/en/missing-page','/about/unsupported','/en/routes/unsupported']){
  try{assert.equal((await fetch(new URL(path,base))).status,404,`${path} 404`);}catch(error){errors.push(error.message);}
}
assert.match(await (await fetch(new URL('/robots.txt',base))).text(),/Disallow: \//);
assert.match(await (await fetch(new URL('/sitemap.xml',base))).text(),/<xhtml:link/);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else{console.log(`PASS: ${seen.size} linked routes, ${assets.size} local images, localized HTML/metadata/navigation, 4 invalid routes, robots and sitemap.`);}
