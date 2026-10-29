import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, E2E_BASE_URL } from './fixtures';

const preferenceName = 'moe-public-language';

test.describe('temporarily hidden public entry points', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Projects and News links are absent from the homepage and mobile menu in both languages', async ({ page }) => {
    for (const path of ['/', '/th']) {
      await page.goto(path);
      await expect(page.locator('a[href^="/projects"], a[href^="/news"], a[href^="/th/projects"], a[href^="/th/news"]')).toHaveCount(0);
      await page.getByRole('button', { name: path === '/' ? 'Open menu' : 'เปิดเมนู' }).click();
      const menu = page.getByRole('dialog', { name: path === '/' ? 'Menu' : 'เมนู' });
      await expect(menu.getByRole('link', { name: /^(Projects|News|โครงการ|ข่าวสาร)$/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  });
});

async function chooseStoredLanguage(context: BrowserContext, value: string) {
  await context.addCookies([{ name: preferenceName, value, url: E2E_BASE_URL, sameSite: 'Lax', secure: true, expires: Math.floor(Date.now() / 1000) + 31_536_000 }]);
}

async function expectLanguage(page: Page, locale: 'en' | 'th', path: string) {
  await expect(page).toHaveURL(E2E_BASE_URL + path);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('English is the default and both languages publish matching canonical and alternate URLs', async ({ page, request }) => {
  // The requested default is English even for a browser that prefers Thai.
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' });
  expect((await page.goto('/'))?.status()).toBe(200);
  await expectLanguage(page, 'en', '/');
  await expect(page.getByRole('link', { name: 'Switch to Thai', exact: true })).toHaveText('EN');

  for (const locale of ['en', 'th'] as const) {
    const path = `${locale === 'th' ? '/th' : ''}/fleet/moe-line-3`;
    expect((await page.goto(path))?.status()).toBe(200);
    await expectLanguage(page, locale, path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', E2E_BASE_URL + path);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', E2E_BASE_URL + '/fleet/moe-line-3');
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveAttribute('href', E2E_BASE_URL + '/th/fleet/moe-line-3');
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', E2E_BASE_URL + '/fleet/moe-line-3');
  }

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(E2E_BASE_URL + '/fleet/moe-line-3</loc>');
  expect(sitemap).toContain(E2E_BASE_URL + '/th/fleet/moe-line-3</loc>');
  expect(sitemap).not.toContain(E2E_BASE_URL + '/en');
});

test('legacy English addresses redirect permanently and preserve filters and anchors', async ({ page, context }) => {
  const response = await context.request.get('/en/fleet?q=MOE&category=Tanker', { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers().location, E2E_BASE_URL).pathname).toBe('/fleet');
  expect(new URL(response.headers().location, E2E_BASE_URL).search).toBe('?q=MOE&category=Tanker');
  await page.goto('/en/contact?subject=Vessel%20enquiry#contact-form');
  await expect(page).toHaveURL(url => url.origin === E2E_BASE_URL && url.pathname === '/contact'
    && url.searchParams.get('subject') === 'Vessel enquiry' && url.hash === '#contact-form');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Vessel enquiry');

  // An explicitly requested old English homepage must not bounce back to Thai.
  await chooseStoredLanguage(context, 'th');
  await page.goto('/en');
  await expectLanguage(page, 'en', '/');
  expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('en');
});

test('desktop language selection remembers a persistent preference and keeps the current page state', async ({ page, context, browser }) => {
  await page.goto('/fleet?q=MOE&category=Tanker#main');
  await expect(page.getByRole('searchbox', { name: 'Search vessels', exact: true })).toHaveValue('MOE');
  await page.getByRole('link', { name: 'Switch to Thai', exact: true }).click();
  await expectLanguage(page, 'th', '/th/fleet?q=MOE&category=Tanker#main');
  await expect(page.getByRole('searchbox', { name: 'ค้นหาเรือ', exact: true })).toHaveValue('MOE');
  await expect(page.getByRole('button', { name: 'เรือบรรทุกน้ำมัน', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Revisit the initial route with an anchor, then switch back again. This
  // catches a cached canonical URL appending the same fragment twice.
  await page.getByRole('link', { name: 'เปลี่ยนเป็นภาษาอังกฤษ', exact: true }).click();
  await expectLanguage(page, 'en', '/fleet?q=MOE&category=Tanker#main');
  await expect(page.getByRole('searchbox', { name: 'Search vessels', exact: true })).toHaveValue('MOE');
  await page.getByRole('link', { name: 'Switch to Thai', exact: true }).click();
  await expectLanguage(page, 'th', '/th/fleet?q=MOE&category=Tanker#main');
  await expect(page.getByRole('searchbox', { name: 'ค้นหาเรือ', exact: true })).toHaveValue('MOE');
  const preference = (await context.cookies()).find(cookie => cookie.name === preferenceName);
  expect(preference?.value).toBe('th');
  expect(preference!.expires).toBeGreaterThan(Date.now() / 1000 + 30 * 86_400);
  expect(preference?.path).toBe('/');

  // Reload and a fresh browser context exercise both saved cookies and the
  // initial document request, rather than relying on the current React state.
  await page.reload();
  await expectLanguage(page, 'th', '/th/fleet?q=MOE&category=Tanker#main');
  const returning = await browser.newContext({ baseURL: E2E_BASE_URL, storageState: await context.storageState(), ignoreHTTPSErrors: true });
  try {
    await returning.route('**/*', route => new URL(route.request().url()).origin === E2E_BASE_URL ? route.continue() : route.abort('blockedbyclient'));
    const returningPage = await returning.newPage();
    await returningPage.goto('/');
    await expectLanguage(returningPage, 'th', '/th');
    await returningPage.getByRole('link', { name: 'เปลี่ยนเป็นภาษาอังกฤษ', exact: true }).click();
    await expectLanguage(returningPage, 'en', '/');
    expect((await returning.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('en');
    await returningPage.goto('/');
    await expectLanguage(returningPage, 'en', '/');
  } finally { await returning.close(); }
});

test('remembered Thai applies only to a new homepage visit and never overrides explicit deep links', async ({ page, context }) => {
  await chooseStoredLanguage(context, 'th');
  const home = await context.request.get('/?campaign=returning', { maxRedirects: 0 });
  expect(home.status()).toBe(307);
  expect(new URL(home.headers().location, E2E_BASE_URL).pathname).toBe('/th');
  expect(new URL(home.headers().location, E2E_BASE_URL).search).toBe('?campaign=returning');
  expect(home.headers()['cache-control']).toContain('no-store');
  expect(home.headers()['cache-control']).toContain('private');

  await page.goto('/fleet');
  await expectLanguage(page, 'en', '/fleet');
  expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('th');
  await chooseStoredLanguage(context, 'en');
  await page.goto('/th/fleet');
  await expectLanguage(page, 'th', '/th/fleet');
  expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('en');

  await chooseStoredLanguage(context, 'unsupported');
  await page.goto('/');
  await expectLanguage(page, 'en', '/');
});

test('preference redirects do not affect prefetched pages, CMS, API responses or icon files', async ({ context }) => {
  await chooseStoredLanguage(context, 'th');
  const prefetch = await context.request.get('/', { headers: { purpose: 'prefetch' }, maxRedirects: 0 });
  expect(prefetch.status()).toBe(200);
  expect(prefetch.headers().location).toBeUndefined();
  const explicitHome = await context.request.get('/', { headers: { referer: E2E_BASE_URL + '/th/fleet' }, maxRedirects: 0 });
  expect(explicitHome.status()).toBe(200);

  const cms = await context.request.get('/cms', { maxRedirects: 0 });
  expect(cms.status()).toBe(200);
  expect(cms.headers().location).toBeUndefined();
  const session = await context.request.get('/api/cms/session', { maxRedirects: 0 });
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ user: null });
  const icon = await context.request.get('/icons/Phone.svg', { maxRedirects: 0 });
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toMatch(/^image\/svg\+xml/);
});

test('opening a language link context menu does not change the saved language', async ({ page, context }) => {
  await chooseStoredLanguage(context, 'en');
  await page.goto('/fleet?q=MOE');
  await expect(page.getByRole('searchbox', { name: 'Search vessels', exact: true })).toHaveValue('MOE');
  await page.getByRole('link', { name: 'Switch to Thai', exact: true }).click({ button: 'right' });
  await expectLanguage(page, 'en', '/fleet?q=MOE');
  expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('en');
  await page.keyboard.press('Escape');
});

test.describe('mobile public language selection', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('drawer language choices preserve filters and the anchor and remember the last selection', async ({ page, context }) => {
    await page.goto('/fleet?q=MOE&category=Tanker#main');
    await expect(page.getByRole('searchbox', { name: 'Search vessels', exact: true })).toHaveValue('MOE');
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    const englishDrawer = page.getByRole('dialog', { name: 'Menu', exact: true });
    await englishDrawer.getByRole('link', { name: 'ไทย', exact: true }).click();
    await expectLanguage(page, 'th', '/th/fleet?q=MOE&category=Tanker#main');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('th');

    await page.getByRole('button', { name: 'เปิดเมนู', exact: true }).click();
    await page.getByRole('dialog', { name: 'เมนู', exact: true }).getByRole('link', { name: 'English', exact: true }).click();
    await expectLanguage(page, 'en', '/fleet?q=MOE&category=Tanker#main');
    await expect(page.getByRole('searchbox', { name: 'Search vessels', exact: true })).toHaveValue('MOE');
    expect((await context.cookies()).find(cookie => cookie.name === preferenceName)?.value).toBe('en');
    await page.goto('/');
    await expectLanguage(page, 'en', '/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
