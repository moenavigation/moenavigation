import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:3005';
const indexed=process.argv.includes('--indexed');
const queue=['/','/th','/cms'];
const seen=new Set();
const assets=new Set();
const errors=[];
const fetchHeaders=async(input,options)=>{
  const response=await fetch(input,options);
  const result={status:response.status,headers:response.headers};
  await response.body?.cancel();
  return result;
};
const attr=(html,name)=>[...html.matchAll(new RegExp(`${name}="([^"]+)"`,'g'))].map(m=>m[1].replaceAll('&amp;','&'));
const documentLanguage=path=>path==='/cms'||path==='/th'||path.startsWith('/th/')?'th':'en';
const linkPath=(html,rel,language)=>{
  const tag=(html.match(/<link\b[^>]*>/g)||[]).find(value=>attr(value,'rel').includes(rel)&&(!language||attr(value,'hrefLang').includes(language)));
  assert.ok(tag,`${rel}${language?` ${language}`:''} link exists`);
  return new URL(attr(tag,'href')[0],base).pathname;
};
const sharedHeaderCount=html=>(html.match(/<header\b[^>]*data-site-header="true"/g)||[]).length;
const completedHeaderFallbacks=html=>[...html.matchAll(/<!--\$\?--><template id="B:([^"]+)"><\/template>([\s\S]*?)<!--\/\$-->/g)]
  .filter(([,id,fallback])=>
    (html.includes(`<div hidden id="S:${id}">`)||html.includes(`<div hidden="" id="S:${id}">`))
    &&fallback.includes('data-loading-screen="public"')&&sharedHeaderCount(fallback)===1).length;
while(queue.length) {
  const path=queue.shift();
  if(seen.has(path))continue;
  seen.add(path);
  try {
    const response=await fetch(new URL(path,base),{redirect:'manual'});
    assert.equal(response.status,200,`${path} HTTP status`);
    const html=await response.text();
    const lang=documentLanguage(path);
    assert.match(html,new RegExp(`<html[^>]*lang="${lang}"`),`${path} document language`);
    if(path==='/cms') {
      // Authentication resolves in the browser. SSR intentionally sends its
      // localized live loading region; browser workflows check the login h1.
      assert.match(html,/<title>MOE Navigation[^<]+<\/title>/,`${path} CMS title`);
      assert.match(html,/data-cms-language="th"/,`${path} Thai-default CMS locale`);
      assert.match(html,/data-loading-screen="cms"/,`${path} session loading screen`);
      assert.match(html,/role="status"[^>]*aria-live="polite"/,`${path} accessible session loading status`);
    }else assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${path} one primary heading`);
    assert.match(html,indexed && path!=='/cms' ? /<meta name="robots" content="index, follow"\s*\/>/ : /<meta name="robots" content="noindex, nofollow"\s*\/>/,`${path} indexing policy`);
    if(path!=='/cms') {
      assert.match(html,/<link rel="canonical"/,`${path} canonical`);
      assert.match(html,/hrefLang="th"/,`${path} Thai alternate`);
      assert.match(html,/hrefLang="en"/,`${path} English alternate`);
      const english=lang==='th'?path.slice(3)||'/':path;
      const thai=english==='/'?'/th':`/th${english}`;
      assert.equal(linkPath(html,'canonical'),path,`${path} canonical path`);
      assert.equal(linkPath(html,'alternate','en'),english,`${path} English alternate path`);
      assert.equal(linkPath(html,'alternate','th'),thai,`${path} Thai alternate path`);
      assert.equal(linkPath(html,'alternate','x-default'),english,`${path} default alternate path`);
      // Completed React streams include both the loading fallback and the
      // hidden replacement before browser scripts remove the fallback.
      const headers=sharedHeaderCount(html), fallbacks=completedHeaderFallbacks(html);
      assert(headers>=1&&headers<=2,`${path} bounded streamed shared headers`);
      assert.equal(headers-fallbacks,1,`${path} one shared header after completed loading fallback`);
    }
    const mediaSources = ['src','srcSet','srcset','content'].flatMap(name => attr(html,name));
    for(const src of mediaSources) {
      assert(!src.startsWith('/images/'),`${path} still references a local content image`);
      if(src.startsWith('https://res.cloudinary.com/')) for(const candidate of src.split(/,\s*(?=https?:)/)) {
        const url=candidate.split(/\s+/)[0];
        // Verify each original plus one responsive size, without generating every srcset derivative.
        const original=url.replace(/\/f_auto,q_auto:good,c_limit,w_\d+\//,'/');
        assets.add(original);
        if(url!==original) assets.add(original.replace('/image/upload/','/image/upload/f_auto,q_auto:good,c_limit,w_640/'));
      }
    }
    for(const link of attr(html,'href')) {
      if(!link.startsWith('/')||link.startsWith('/_next/')||link.includes('.')||link.startsWith('//'))continue;
      const pathname=new URL(link,base).pathname;
      if(!seen.has(pathname))queue.push(pathname);
    }
  }catch(error){errors.push(error.message);}
}
for(const path of assets) {
  try{const response=await fetchHeaders(new URL(path,base));assert.equal(response.status,200,`${path} available`);assert.match(response.headers.get('content-type')||'',/^image\//,`${path} image content type`);}catch(error){errors.push(error.message);}
}
for(const path of ['/missing-page','/th/missing-page','/about/unsupported','/th/routes/unsupported']){
  try{assert.equal((await fetchHeaders(new URL(path,base),{redirect:'manual'})).status,404,`${path} 404`);}catch(error){errors.push(error.message);}
}
for(const [path,target] of [['/en','/'],['/en/fleet?campaign=legacy','/fleet?campaign=legacy']]){
  try{
    const response=await fetchHeaders(new URL(path,base),{redirect:'manual'});
    assert.equal(response.status,308,`${path} permanent English redirect`);
    const actual=new URL(response.headers.get('location'),base);
    assert.equal(actual.pathname+actual.search,target,`${path} redirect destination`);
  }catch(error){errors.push(error.message);}
}
try{
  const response=await fetchHeaders(new URL('/?campaign=return',base),{redirect:'manual',headers:{Cookie:'moe-public-language=th'}});
  assert.equal(response.status,307,'Remembered Thai homepage redirect is temporary');
  const target=new URL(response.headers.get('location'),base);
  assert.equal(target.pathname+target.search,'/th?campaign=return','Remembered homepage preserves query');
  assert.match(response.headers.get('cache-control')||'',/no-store/i,'Language preference redirect is not cached');
}catch(error){errors.push(error.message);}
assert.match(await (await fetch(new URL('/robots.txt',base))).text(),indexed ? /Allow: \// : /Disallow: \/(?:\r?\n|$)/);
assert.match(await (await fetch(new URL('/sitemap.xml',base))).text(),/<xhtml:link/);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else{console.log(`PASS: ${seen.size} linked routes, ${assets.size} Cloudinary image URLs (originals and responsive deliveries), zero local content images, localized HTML/metadata/navigation, 4 invalid routes, legacy and preference redirects, robots and sitemap.`);}
