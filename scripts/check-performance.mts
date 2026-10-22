import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { cloudinaryLoader as loader } from '../src/lib/cloudinary-loader';

const origin = new URL(process.argv[2] || 'http://localhost:3005').origin;
const routes: { path: string; bytes: number; warmResponseMs: number[] }[] = [];
const originals = new Set<string>();
for (const path of ['/', '/en/services', '/en/fleet']) {
  let html = ''; const times: number[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = performance.now();
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(45_000) });
    assert.equal(response.status, 200, `${path} is available`);
    html = await response.text();
    if (attempt > 0) times.push(Math.round(performance.now() - start));
  }
  routes.push({ path, bytes: Buffer.byteLength(html), warmResponseMs: times });
  for (const match of html.matchAll(/https:\/\/res\.cloudinary\.com\/[^\s"<>]+/g)) {
    const candidate = match[0].split(/,\s*(?=https?:)/)[0].replaceAll('&amp;', '&');
    if (candidate.includes('\\')) continue;
    originals.add(candidate.replace(/\/f_auto,q_auto:good,c_limit,w_\d+\//, '/'));
  }
}
const images: { image: string; originalBytes: number; responsiveBytes: number; savingsPercent: number }[] = [];
for (const original of originals) {
  if (!/\.(webp|jpg|jpeg|png)(?:$|\?)/i.test(original)) continue;
  const bytes: number[] = [];
  for (const url of [original, loader({ src: original, width: 640 })]) {
    const response = await fetch(url, { headers: { Accept: 'image/avif,image/webp,image/*' }, signal: AbortSignal.timeout(45_000) });
    assert.equal(response.status, 200, 'Image delivery is available');
    assert.match(response.headers.get('content-type') || '', /^image\//);
    bytes.push((await response.arrayBuffer()).byteLength);
  }
  images.push({ image: new URL(original).pathname.split('/').at(-1)!, originalBytes: bytes[0], responsiveBytes: bytes[1], savingsPercent: Math.round(100 * (1 - bytes[1] / bytes[0])) });
}
assert(images.length > 0, 'Published images were measured');
const originalBytes = images.reduce((sum, item) => sum + item.originalBytes, 0);
const responsiveBytes = images.reduce((sum, item) => sum + item.responsiveBytes, 0);
const result = { checkedAt: new Date().toISOString(), origin, method: 'HTTP response and actual 640px Cloudinary payloads; local timing is not a Core Web Vitals or field score.', routes, images, totals: { originalBytes, responsiveBytes, savingsPercent: Math.round(100 * (1 - responsiveBytes / originalBytes)) } };
await mkdir('.local', { recursive: true });
await writeFile('.local/performance-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ routes: routes.length, images: images.length, ...result.totals, report: '.local/performance-result.json' }));
