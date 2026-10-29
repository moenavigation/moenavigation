import type { Locator, Page } from '@playwright/test';
import { test, expect, E2E_ADMIN } from './fixtures';

const logoSelector = 'img[src="/brand/moe-logo.svg"]';

async function expectOfficialLogo(logo: Locator, locale: 'en' | 'th' = 'en') {
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('alt', locale === 'th' ? 'บริษัท โม เนวิเกชั่น จำกัด' : 'Moe Navigation Co.,Ltd.');
  await expect(logo).toHaveAttribute('width', '805');
  await expect(logo).toHaveAttribute('height', '365');
  await expect.poll(() => logo.evaluate(element => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0;
  })).toBe(true);
  const bounds = await logo.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThan(0);
  expect(bounds!.width / bounds!.height).toBeCloseTo(805 / 365, 2);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('official logo loads in the desktop public header and footer with accessible home links', async ({ page }, testInfo) => {
  await page.goto('/');
  const header = page.locator('[data-site-header]');
  await expect(header).toHaveCount(1);
  const home = header.getByRole('link', { name: 'Moe Navigation Co.,Ltd. home', exact: true });
  await expect(home).toHaveAttribute('href', '/');
  await expectOfficialLogo(home.locator(logoSelector));
  await expectNoHorizontalOverflow(page);
  await header.screenshot({ path: testInfo.outputPath('official-logo-desktop-header.png'), animations: 'disabled' });

  const footer = page.locator('footer');
  await footer.scrollIntoViewIfNeeded();
  const footerHome = footer.getByRole('link', { name: 'Moe Navigation Co.,Ltd.', exact: true });
  await expect(footerHome).toHaveAttribute('href', '/');
  await expectOfficialLogo(footerHome.locator(logoSelector));
  await footer.screenshot({ path: testInfo.outputPath('official-logo-desktop-footer.png'), animations: 'disabled' });
});

for (const width of [320, 390]) {
  test.describe(`official logo mobile drawer at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test('public logo and drawer keep their proportions in both languages', async ({ page }, testInfo) => {
      for (const locale of ['en', 'th'] as const) {
        const thai = locale === 'th';
        await page.goto(thai ? '/th' : '/');
        const header = page.locator('[data-site-header]');
        await expect(header).toHaveCount(1);
        const home = header.getByRole('link', { name: thai ? 'หน้าแรกของบริษัท โม เนวิเกชั่น จำกัด' : 'Moe Navigation Co.,Ltd. home', exact: true });
        await expect(home).toHaveAttribute('href', thai ? '/th' : '/');
        await expectOfficialLogo(home.locator(logoSelector), locale);
        await expectNoHorizontalOverflow(page);
        await header.getByRole('button', { name: thai ? 'เปิดเมนู' : 'Open menu', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: thai ? 'เมนู' : 'Menu', exact: true });
        await expectOfficialLogo(drawer.locator(logoSelector));
        await expect.poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`official-logo-drawer-${width}-${locale}.png`), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
      }
    });
  });
}

test.describe('official logo in narrow CMS and recovery screens', () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test('CMS login and signed-in header retain a complete accessible logo at 320px', async ({ page }, testInfo) => {
    await page.goto('/cms');
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    const header = page.locator('header');
    const home = header.getByRole('link', { name: 'Moe Navigation Co.,Ltd. home in a new tab', exact: true });
    await expect(home).toHaveAttribute('href', '/');
    await expect(home).toHaveAttribute('target', '_blank');
    await expectOfficialLogo(home.locator(logoSelector));
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('official-logo-cms-login-320.png'), animations: 'disabled' });

    await page.getByLabel('Username', { exact: true }).fill(E2E_ADMIN.username);
    await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Content overview', exact: true })).toBeVisible();
    await expectOfficialLogo(home.locator(logoSelector));
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('official-logo-cms-signed-in-320-en.png'), animations: 'disabled' });
    await header.locator('[data-cms-language-switch]').click();
    await expect(page.getByRole('heading', { name: 'ภาพรวมเนื้อหา', exact: true })).toBeVisible();
    await expectOfficialLogo(header.locator(logoSelector), 'th');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('official-logo-cms-signed-in-320-th.png'), animations: 'disabled' });
  });

  test('localized recovery pages show the official logo and retain the visible 404 context', async ({ page }, testInfo) => {
    for (const locale of ['en', 'th'] as const) {
      const thai = locale === 'th';
      expect((await page.goto(`${thai ? '/th' : ''}/missing-brand-qa`))?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(thai ? 'ไม่พบหน้านี้' : 'Page not found');
      await expect(page.getByText('404', { exact: true })).toBeVisible();
      await expectOfficialLogo(page.locator('main').locator(logoSelector), locale);
      await expect(page.getByRole('link', { name: thai ? 'กลับหน้าแรก' : 'Return home', exact: true })).toHaveAttribute('href', thai ? '/th' : '/');
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`official-logo-recovery-320-${locale}.png`), animations: 'disabled' });
    }
  });
});
