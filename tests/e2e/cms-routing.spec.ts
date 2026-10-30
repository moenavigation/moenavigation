import type { Page } from '@playwright/test';
import { test, expect, login, E2E_ADMIN, E2E_IMAGE_BUFFER } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';

const views = [
  { path: '/cms', heading: 'Content overview' },
  { path: '/cms/pages', heading: 'Pages' },
  { path: '/cms/sections', heading: 'Sections' },
  { path: '/cms/fleet', heading: 'Fleet' },
  { path: '/cms/routes', heading: 'Routes' },
  { path: '/cms/projects', heading: 'Projects' },
  { path: '/cms/services', heading: 'Services' },
  { path: '/cms/news', heading: 'News' },
  { path: '/cms/enquiries', heading: 'Enquiries' },
  { path: '/cms/media', heading: 'Media library' },
  { path: '/cms/trash', heading: 'Trash' },
  { path: '/cms/account', heading: 'Account & tools' },
] as const;

async function chooseDrawerView(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await drawer.getByRole('button', { name: new RegExp(`^${escapedName}(?:\\s+\\d+)?$`) }).click();
  await expect(drawer).not.toBeVisible();
}

test('every CMS view has a working direct URL and signed-in refresh', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  for (const view of views) {
    const response = await page.goto(view.path);
    expect(response?.status(), view.path).toBe(200);
    await expect(page).toHaveURL(new RegExp(view.path.replaceAll('/', '\\/') + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(view.heading);
    if (view.path !== '/cms/media') await expect(page.getByRole('heading', { level: 2, name: 'Media library' })).toHaveCount(0);
    if (view.path === '/cms/media') {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media library');
    }
  }
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account & tools');
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await expect(drawer.locator('[aria-current="page"]')).toContainText('Account & tools');
  await page.keyboard.press('Escape');
  await page.goto('/cms/sections');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sections');
});

test('drawer, content-type selector and browser history stay aligned with CMS URLs', async ({ page }) => {
  await login(page);
  await chooseDrawerView(page, 'Pages');
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages');
  await page.getByRole('combobox', { name: 'Content type', exact: true }).selectOption('Section');
  await expect(page).toHaveURL(/\/cms\/sections$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sections');
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages');
  await page.goForward();
  await expect(page).toHaveURL(/\/cms\/sections$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sections');
  await chooseDrawerView(page, 'Enquiries');
  await expect(page).toHaveURL(/\/cms\/enquiries$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enquiries');
  await chooseDrawerView(page, 'Media library');
  await expect(page).toHaveURL(/\/cms\/media$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media library');
  await expect(page.getByRole('dialog', { name: 'Media library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'CMS navigation', exact: true }).locator('[aria-current="page"]')).toContainText('Media library');
  await page.keyboard.press('Escape');
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/enquiries$/);
  await chooseDrawerView(page, 'Content overview');
  await expect(page).toHaveURL(/\/cms$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Content overview');
});

test('an unsaved Account draft survives CMS route navigation and browser Back', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Account & tools');
  await expect(page).toHaveURL(/\/cms\/account$/);
  const email = page.getByRole('textbox', { name: 'Public email address', exact: true });
  const original = (await db.collection<{ _id: string; email?: string }>('moe_settings').findOne({ _id: 'website' }))?.email || '';
  await email.fill('draft-only@example.test');
  await chooseDrawerView(page, 'Enquiries');
  await expect(page).toHaveURL(/\/cms\/enquiries$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/account$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account & tools');
  await expect(email).toHaveValue('draft-only@example.test');
  expect((await db.collection<{ _id: string; email?: string }>('moe_settings').findOne({ _id: 'website' }))?.email || '').toBe(original);
});

test('an unsaved Media library image and title survive CMS route navigation and Back', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Media library');
  await expect(page).toHaveURL(/\/cms\/media$/);
  await expect(page.getByText('Choose device image', { exact: true })).toBeVisible();
  const before = await db.collection('moe_media').countDocuments();
  await page.getByLabel('Choose media library image', { exact: true }).setInputFiles({
    name: 'media-draft.png',
    mimeType: 'image/png',
    buffer: E2E_IMAGE_BUFFER,
  });
  const title = page.getByRole('textbox', { name: /^Image name/ });
  await expect(title).toHaveValue('media-draft');
  await title.fill('Unsaved media draft');
  await expect(page.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await chooseDrawerView(page, 'Content overview');
  await expect(page).toHaveURL(/\/cms$/);
  await expect(page.getByRole('img', { name: 'Prepared media preview' })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/media$/);
  await expect(page.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await expect(title).toHaveValue('Unsaved media draft');
  expect(await db.collection('moe_media').countDocuments()).toBe(before);
});

test('Media library keeps the prepared image and title when the upload provider is unavailable', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Media library');
  const committedBefore = await db.collection('moe_media').countDocuments({ state: 'committed' });
  await page.getByLabel('Choose media library image', { exact: true }).setInputFiles({
    name: 'provider-unavailable.png',
    mimeType: 'image/png',
    buffer: E2E_IMAGE_BUFFER,
  });
  const title = page.getByRole('textbox', { name: /^Image name/ });
  await expect(title).toHaveValue('provider-unavailable');
  await title.fill('Prepared image kept after error');
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/cms/media') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await uploadResponse).status()).toBe(503);
  await expect(page.getByRole('region', { name: 'Add an image' }).getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await expect(title).toHaveValue('Prepared image kept after error');
  expect(await db.collection('moe_media').countDocuments({ state: 'committed' })).toBe(committedBefore);
});

test('Media library fits desktop and narrow mobile layouts in both CMS languages', async ({ page }) => {
  await login(page);
  await page.goto('/cms/media');
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media library');
    await expect(page.getByLabel('Choose media library image', { exact: true })).toBeAttached();
    await expect(page.getByRole('region', { name: 'Saved images' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.locator('header [data-cms-language-switch]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai['Media library']);
  await expect(page.getByRole('region', { name: cmsMainThai['Saved images'] })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Content overview has no duplicate Media library panel', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Content overview');
  await expect(page.getByRole('heading', { level: 2, name: 'Media library' })).toHaveCount(0);
  await expect(page.getByRole('table')).toBeVisible();
});

test('deep CMS URLs stay private and unknown views return 404', async ({ page }) => {
  await login(page);
  const response = await page.goto('/cms/pages');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const media = await page.goto('/cms/media');
  expect(media?.status()).toBe(200);
  expect(media?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const unknown = await page.request.get('/cms/not-a-view');
  expect(unknown.status()).toBe(404);
});

test.describe('Thai deep-link sign-in', () => {
  test.use({ cmsLocale: 'th' });

  test('signing in returns to the requested CMS view and language changes keep the path', async ({ page }) => {
    await page.goto('/cms/enquiries');
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await expect(page.getByRole('heading', { name: cmsMainThai['Welcome back'], exact: true })).toBeVisible();
    await page.getByLabel(cmsMainThai['Username'], { exact: true }).fill(E2E_ADMIN.username);
    await page.getByLabel(cmsMainThai['Password'], { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: cmsMainThai['Sign in'], exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai['Enquiries']);
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await page.locator('header [data-cms-language-switch]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enquiries');
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enquiries');
  });
});
