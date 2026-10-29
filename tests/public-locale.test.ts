import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { href, localeFromPathname, pathWithoutLocale } from '../src/lib/content';
import { PUBLIC_LANGUAGE_COOKIE, PUBLIC_LANGUAGE_MAX_AGE, publicLanguageCookie } from '../src/lib/public-locale';
import { proxy } from '../src/proxy';

const origin = 'https://example.test';
function request(path: string, options: { language?: string; headers?: Record<string, string>; method?: string } = {}) {
  return new NextRequest(origin + path, {
    method: options.method,
    headers: { ...(options.language ? { cookie: `${PUBLIC_LANGUAGE_COOKIE}=${options.language}` } : {}), ...options.headers },
  });
}

test('English URLs are unprefixed and Thai URLs use an exact th segment', () => {
  assert.equal(href('en'), '/');
  assert.equal(href('th'), '/th');
  assert.equal(href('en', '/fleet/ranong-moe'), '/fleet/ranong-moe');
  assert.equal(href('th', '/routes?from=bangkok#map'), '/th/routes?from=bangkok#map');
  for (const path of ['/th', '/th/contact', '/th/services/vessel-services']) assert.equal(localeFromPathname(path), 'th', path);
  for (const path of ['/', '/fleet', '/en/fleet', '/thailand', '/cms', '/TH']) assert.equal(localeFromPathname(path), 'en', path);
  assert.equal(pathWithoutLocale('/th/routes'), 'routes');
  assert.equal(pathWithoutLocale('/en/fleet/ranong-moe'), 'fleet/ranong-moe');
  assert.equal(pathWithoutLocale('/th'), '');
  assert.equal(pathWithoutLocale('/enquiry'), 'enquiry');
});

test('the language preference persists for a year and uses secure cookies on HTTPS', () => {
  assert.equal(PUBLIC_LANGUAGE_MAX_AGE, 31536000);
  assert.equal(publicLanguageCookie('th', true), `${PUBLIC_LANGUAGE_COOKIE}=th; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  assert.equal(publicLanguageCookie('en', false), `${PUBLIC_LANGUAGE_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax`);
});

test('a fresh homepage entrance restores Thai with a private temporary redirect', () => {
  const response = proxy(request('/?campaign=kept', { language: 'th' }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), origin + '/th?campaign=kept');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  for (const language of [undefined, 'en', 'invalid']) assert.equal(proxy(request('/', { language })).headers.get('location'), null);
});

test('explicit public links and background navigation keep their URL language', () => {
  for (const path of ['/fleet', '/th/fleet', '/th', '/cms', '/api/contact', '/icons/Phone.svg']) {
    assert.equal(proxy(request(path, { language: 'th' })).headers.get('location'), null, path);
  }
  const backgroundHeaders: Record<string, string>[] = [
    { rsc: '1' }, { 'next-router-prefetch': '1' }, { purpose: 'prefetch' }, { 'sec-purpose': 'prefetch;prerender' },
    { referer: origin + '/th/fleet' }, { referer: origin + '/cms' },
  ];
  for (const headers of backgroundHeaders) assert.equal(proxy(request('/', { language: 'th', headers })).headers.get('location'), null);
  assert.equal(proxy(request('/', { language: 'th', headers: { referer: 'https://external.test/article' } })).status, 307);
  assert.equal(proxy(request('/', { language: 'th', headers: { referer: 'malformed' } })).status, 307);
  assert.equal(proxy(request('/', { language: 'th', method: 'POST' })).headers.get('location'), null);
});

test('legacy English URLs redirect permanently without losing queries or switching to Thai', () => {
  for (const [from, to] of [['/en', '/'], ['/en/fleet?category=cargo', '/fleet?category=cargo']]) {
    const response = proxy(request(from, { language: 'th' }));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), origin + to);
    assert.equal(response.cookies.get(PUBLIC_LANGUAGE_COOKIE)?.value, 'en');
    assert.match(response.headers.get('set-cookie') || '', /Max-Age=31536000/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(proxy(request('/en/fleet', { headers: { 'next-router-prefetch': '1' } })).headers.get('set-cookie'), null);
  assert.equal(proxy(request('/enquiry')).headers.get('location'), null);
  assert.equal(proxy(request('/en', { method: 'POST' })).headers.get('location'), null);
});

test('an explicit home link retains English behind a configured HTTPS reverse proxy', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  try {
    const response = proxy(new NextRequest('http://127.0.0.1:3011/', {
      headers: { cookie: `${PUBLIC_LANGUAGE_COOKIE}=th`, referer: origin + '/cms' },
    }));
    assert.equal(response.headers.get('location'), null);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
