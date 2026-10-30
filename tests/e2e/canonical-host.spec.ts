import { test, expect } from './fixtures';

test('the exact www host redirects to the apex without losing paths or repeated query values', async ({ request }) => {
  // The owned HTTPS test proxy replaces Host. Use its owned Next upstream
  // directly, and never follow the external Location returned by the server.
  const upstream = 'http://127.0.0.1:3011';
  const paths = [
    '/th/fleet?x=one&x=two&search=%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B8%AD',
    '/cms/users?tag=cargo&tag=marine&edit=User%3A123&return=%2Fcms%2Fusers%3Fpage%3D2&note=a%2Bb+space&empty=',
  ];
  for (const path of paths) {
    const response = await request.get(`${upstream}${path}`, {
      headers: { Host: 'www.moe-navigation.com' }, maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    const location = response.headers().location;
    expect(location).toBeTruthy();
    const destination = new URL(location);
    const original = new URL(path, upstream);
    expect(destination.origin).toBe('https://moe-navigation.com');
    expect(destination.pathname).toBe(original.pathname);
    expect([...destination.searchParams]).toEqual([...original.searchParams]);
  }

  for (const host of [
    'moe-navigation.com', 'localhost:3011', '127.0.0.1:3011',
    'moenavigation-preview.vercel.app', 'wwwXmoe-navigation.com',
    'www.moe-navigation.com.unrelated.example',
  ]) {
    const response = await request.get(`${upstream}/cms/users?check=host`, {
      headers: { Host: host, 'X-Forwarded-Host': 'www.moe-navigation.com' }, maxRedirects: 0,
    });
    expect(response.status(), host).toBe(200);
    expect(response.headers().location, host).toBeUndefined();
  }
});
