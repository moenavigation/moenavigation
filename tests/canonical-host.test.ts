import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';
import config from '../next.config';
import { proxy } from '../src/proxy';
import { PUBLIC_LANGUAGE_COOKIE } from '../src/lib/public-locale';

const responseFor = (url: string, headers?: Record<string, string>) => unstable_getResponseFromNextConfig({ url, nextConfig: config, headers });

test('the exact www host redirects HTTP and HTTPS public and CMS links permanently to the HTTPS apex', async () => {
  for (const protocol of ['http:', 'https:']) {
    for (const path of ['/', '/th/contact', '/fleet/ranong-moe', '/cms/users', '/api/cms/session', '/sitemap.xml', '/favicon.ico']) {
      const response = await responseFor(`${protocol}//www.moe-navigation.com${path}`);
      assert.equal(response.status, 308, path);
      assert.equal(response.headers.get('location'), `https://moe-navigation.com${path}`);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
});

test('canonical redirects preserve encoded paths and query values', async () => {
  const path = '/th/news/%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B8%AD';
  // Exercise repeated keys through actual HTTP: Next 16.4.2's experimental
  // config helper comma-joins arrays, unlike its production route serializer.
  const source = new URL(`https://www.moe-navigation.com${path}?tag=cargo&mode=marine&edit=User%3A123&return=%2Fcms%2Fusers%3Fpage%3D2&note=a%2Bb+space&empty=`);
  const response = await responseFor(source.href);
  assert.equal(response.status, 308);
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.origin, 'https://moe-navigation.com');
  assert.equal(target.pathname, source.pathname);
  assert.deepEqual([...target.searchParams], [...source.searchParams]);
});

test('apex, localhost, preview and hostname lookalikes are never canonicalized to production', async () => {
  for (const origin of [
    'https://moe-navigation.com', 'http://localhost:3005', 'https://127.0.0.1:3010',
    'https://moe-navigation-preview.vercel.app', 'https://www.moe-navigation.com.attacker.test',
    'https://wwwXmoe-navigationYcom', 'https://other.moe-navigation.com',
  ]) {
    for (const path of ['/', '/cms/users?edit=User%3A123', '/th/fleet']) {
      const response = await responseFor(origin + path);
      assert.equal(response.headers.get('location'), null, origin + path);
    }
  }
});

test('host matching uses the actual Host header and does not trust an arbitrary forwarded-host value', async () => {
  const proxied = await responseFor('http://127.0.0.1:3011/cms/users?page=2', { host: 'WWW.MOE-NAVIGATION.COM:443' });
  assert.equal(proxied.status, 308);
  assert.equal(proxied.headers.get('location'), 'https://moe-navigation.com/cms/users?page=2');
  const preview = await responseFor('https://preview.vercel.app/cms', { 'x-forwarded-host': 'www.moe-navigation.com' });
  assert.equal(preview.headers.get('location'), null);
});

test('canonicalization leaves the existing explicit-English language redirect intact', async () => {
  const canonical = await responseFor('https://www.moe-navigation.com/en/fleet?category=cargo');
  assert.equal(canonical.headers.get('location'), 'https://moe-navigation.com/en/fleet?category=cargo');
  const language = proxy(new NextRequest(canonical.headers.get('location')!, { headers: { cookie: `${PUBLIC_LANGUAGE_COOKIE}=th` } }));
  assert.equal(language.status, 308);
  assert.equal(language.headers.get('location'), 'https://moe-navigation.com/fleet?category=cargo');
  assert.equal(language.cookies.get(PUBLIC_LANGUAGE_COOKIE)?.value, 'en');
});
