import { test, expect } from './fixtures';

for (const locale of ['en', 'th'] as const) {
  test(`company name is consistent on ${locale} public pages and metadata`, async ({ page }) => {
    const thai = locale === 'th';
    const prefix = thai ? '/th' : '';
    const company = thai ? 'บริษัท โม เนวิเกชั่น จำกัด' : 'Moe Navigation Co.,Ltd.';
    const aboutTitle = thai ? `เกี่ยวกับ${company}` : `About ${company}`;
    await page.goto(`${prefix}/about`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(aboutTitle);
    await expect(page).toHaveTitle(`${aboutTitle} | ${company}`);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', company);
    await expect(page.locator('footer')).toContainText(`© ${new Date().getFullYear()} ${company}`);
    await expect(page.locator('[data-site-header] img[src="/brand/moe-logo.svg"]')).toHaveAttribute('alt', company);
  });
}
