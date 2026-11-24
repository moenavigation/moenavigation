import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base=process.argv[2]||'http://localhost:3005';
const indexed=process.argv.includes('--indexed');
const queue=['/','/th','/projects','/th/projects','/news','/th/news','/cms'];
const seen=new Set();
const assets=new Set();
const videoAssets=new Set();
const photoManifest = JSON.parse(readFileSync(new URL('./data/media-manifest.json', import.meta.url), 'utf8'));
const retiredIdentities = JSON.parse(readFileSync(new URL('../src/server/retired-photo-identities.json', import.meta.url), 'utf8'));
const cloudAssetKey = url => new URL(url).pathname.replace(/\/image\/upload\/.*?v\d+\//, '/image/upload/');
const retiredCloudPhotos = new Set(retiredIdentities.map(item => item.url || item.source)
  .filter(url => url.startsWith('https://res.cloudinary.com/')).map(cloudAssetKey));
const bundledPhotos = new Set([
  ...photoManifest.map(asset => asset.sourcePath),
  ...['moe-line-3', 'moe-line-4', 'moe-line-5', 'ranong-moe', 'moe-line-7']
    .flatMap(name => [`/images/hero/${name}.webp`, `/images/hero/${name}-mobile.webp`]),
]);
const bundledAssets=new Set();
const errors=[];
const fetchHeaders=async(input,options)=>{
  const response=await fetch(input,options);
  const result={status:response.status,headers:response.headers};
  await response.body?.cancel();
  return result;
};
const attr=(html,name)=>[...html.matchAll(new RegExp(`\\s${name}="([^"]+)"`,'gi'))].map(m=>m[1].replaceAll('&amp;','&'));
const documentLanguage=path=>path==='/th'||path.startsWith('/th/')?'th':'en';
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
    const canonicalTag = html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0];
    const siteOrigin = canonicalTag ? new URL(attr(canonicalTag,'href')[0],base).origin : new URL(base).origin;
    assert.match(html,new RegExp(`<html[^>]*lang="${lang}"`),`${path} document language`);
    if(path==='/cms') {
      // Authentication resolves in the browser. SSR intentionally sends its
      // localized live loading region; browser workflows check the login h1.
      assert.match(html,/<title>Moe Navigation Co\.,Ltd\.[^<]+<\/title>/,`${path} CMS title`);
      assert.match(html,/data-cms-language="en"/,`${path} English-default CMS locale`);
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
      const switchLabel = lang === 'th' ? 'เปลี่ยนเป็นภาษาอังกฤษ' : 'Switch to Thai';
      const switches = (html.match(/<a\b[^>]*>/gi) || []).filter(tag => attr(tag,'aria-label').includes(switchLabel));
      assert(switches.length, `${path} language switch present`);
      for (const link of switches) {
        assert.equal(attr(link,'href')[0], lang === 'th' ? english : thai, `${path} language switch destination`);
      }
      const shareImages = (html.match(/<meta\b[^>]*>/gi) || []).filter(tag => /(?:property="og:image"|name="twitter:image")/i.test(tag));
      for (const tag of shareImages) {
        const url = new URL(attr(tag, 'content')[0]);
        assert(url.origin === siteOrigin || url.origin === 'https://res.cloudinary.com', `${path} approved absolute social photo URL`);
      }
      // Completed React streams include both the loading fallback and the
      // hidden replacement before browser scripts remove the fallback.
      const headers=sharedHeaderCount(html), fallbacks=completedHeaderFallbacks(html);
      assert(headers>=1&&headers<=2,`${path} bounded streamed shared headers`);
      assert.equal(headers-fallbacks,1,`${path} one shared header after completed loading fallback`);
    }
    const sourceSets = [...attr(html,'srcset'), ...attr(html,'imagesrcset')].flatMap(value => value
      .split(/,\s*(?=https?:\/\/|\/images\/|\/_next\/)/i)
      .map(candidate => candidate.trim().split(/\s+/)[0]));
    const mediaSources = [...['src','poster','content'].flatMap(name => attr(html,name)), ...sourceSets];
    for(let src of mediaSources) {
      if (src.startsWith('/_next/image?')) src = new URL(src,base).searchParams.get('url') || '';
      if(src.startsWith('/images/') || src.startsWith(siteOrigin+'/images/')) {
        const pathname = new URL(src,base).pathname;
        assert(bundledPhotos.has(pathname),`${path} still references an unapproved local content image: ${pathname}`);
        bundledAssets.add(pathname);
      }
      if(src.startsWith('https://res.cloudinary.com/')) {
        const url=src;
        assert(!retiredCloudPhotos.has(cloudAssetKey(url)), `${path} still references a retired Cloudinary photo`);
        if (new URL(url).pathname.includes('/video/upload/') && /\.(mp4|webm)$/i.test(new URL(url).pathname)) {
          videoAssets.add(url);
          continue;
        }
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
for(const path of [...assets,...bundledAssets]) {
  try{const response=await fetchHeaders(new URL(path,base));assert.equal(response.status,200,`${path} available`);assert.match(response.headers.get('content-type')||'',/^image\//,`${path} image content type`);}catch(error){errors.push(error.message);}
}
for (const url of videoAssets) {
  try {
    const response = await fetchHeaders(url);
    assert.equal(response.status, 200, `${url} available`);
    assert.match(response.headers.get('content-type') || '', /^video\//, `${url} video content type`);
  } catch (error) { errors.push(error.message); }
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
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else{console.log(`PASS: ${seen.size} linked routes, ${assets.size} Cloudinary image URLs (originals and responsive deliveries), ${bundledAssets.size} approved bundled photos, zero unapproved local content images, localized HTML/metadata/navigation, 4 invalid routes, legacy and preference redirects, robots and sitemap.`);}
