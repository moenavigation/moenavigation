import { test, expect, login } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';

test('Dashboard shows saved totals, opens recent content and links to management views', async ({ page, db }) => {
  await login(page);
  const saved = await db.collection('moe_content').countDocuments({ deletedAt: { $exists: false } });
  const card = page.getByText('Saved content', { exact: true }).locator('..');
  await expect(card.locator('strong')).toHaveText(saved.toLocaleString('en-GB'));
  await expect(page.getByRole('heading', { name: 'Content at a glance', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently updated', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Publication status', exact: true })).toHaveCount(0);
  const recent = page.getByRole('region', { name: 'Recently updated', exact: true });
  await recent.getByRole('list').getByRole('button').first().click();
  const dialog = page.getByRole('dialog', { name: /^Edit (content|vessel|route|project|service|news)$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Title · English', exact: true })).toHaveValue(/\S/);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Website settings', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/setting$/);
  await page.goto('/cms');
  const overview = page.getByRole('region', { name: 'Content at a glance', exact: true });
  await overview.getByRole('button', { name: /^Pages\b/ }).click();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { name: 'Which page would you like to update?', exact: true })).toBeVisible();
  await page.goto('/cms');
  await overview.getByRole('button', { name: /^Fleet/ }).click();
  await expect(page).toHaveURL(/\/cms\/fleet$/);
});

test('Dashboard fits mobile and wide screens in English and Thai', async ({ page }) => {
  await login(page);
  for (const width of [360, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 1440) await page.screenshot({ path: 'test-results/save-only-dashboard-en.png', fullPage: true });
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('header [data-cms-language-switch]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai.Dashboard);
  await expect(page.getByRole('heading', { name: cmsMainThai['Content at a glance'], exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/save-only-dashboard-th-mobile.png', fullPage: true });
});
