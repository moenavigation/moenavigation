import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, login, solveLoginSlide, E2E_ADMIN, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';

const views = [
  { path: '/cms', heading: 'Dashboard' },
  { path: '/cms/pages', heading: 'Pages' },
  { path: '/cms/fleet', heading: 'Fleet' },
  { path: '/cms/routes', heading: 'Routes' },
  { path: '/cms/projects', heading: 'Projects' },
  { path: '/cms/services', heading: 'Services' },
  { path: '/cms/news', heading: 'News' },
  { path: '/cms/enquiries', heading: 'Enquiries' },
  { path: '/cms/media', heading: 'Media library' },
  { path: '/cms/trash', heading: 'Trash' },
  { path: '/cms/users', heading: 'Users' },
  { path: '/cms/logs', heading: 'Logs' },
  { path: '/cms/usage', heading: 'Data usage' },
  { path: '/cms/setting', heading: 'Settings' },
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await expect(drawer.locator('[aria-current="page"]')).toContainText('Settings');
  await expect(drawer.getByRole('button', { name: 'Sections', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/cms?type=Section');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages');
  await expect(page.getByRole('heading', { name: 'Which page would you like to update?', exact: true })).toBeVisible();
});

test('Settings contains website details and tools, and old account bookmarks redirect', async ({ page }) => {
  await login(page);
  const old = await page.request.get('/cms/account', { maxRedirects: 0 });
  expect(old.status()).toBe(307);
  expect(new URL(old.headers().location, page.url()).pathname).toBe('/cms/setting');
  await page.goto('/cms/account');
  await expect(page).toHaveURL(/\/cms\/setting$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(page.getByRole('heading', { name: 'Website details', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Content tools', exact: true })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Change password', exact: true })).toHaveCount(0);
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.locator('header [data-cms-language-switch]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai.Settings);
  await expect(page.getByRole('heading', { name: cmsMainThai['Website details'], exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('drawer, selected pages and browser history stay aligned with CMS URLs', async ({ page }) => {
  await login(page);
  await chooseDrawerView(page, 'Pages');
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages');
  await page.getByRole('button', { name: /^Home\b/ }).click();
  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'CMS navigation', exact: true }).locator('[aria-current="page"]')).toContainText('Pages');
  await page.keyboard.press('Escape');
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages');
  await expect(page.getByRole('heading', { name: 'Which page would you like to update?', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Home', exact: true })).toBeVisible();
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
  await chooseDrawerView(page, 'Dashboard');
  await expect(page).toHaveURL(/\/cms$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
});

test('choosing a page opens its existing content for editing without adding sections', async ({ page, db }) => {
  await login(page);
  const count = await db.collection('moe_content').countDocuments({ type: 'Section' });
  expect(count).toBeGreaterThan(0);
  const section = await db.collection<{ title: string }>('moe_content').findOne({ type: 'Section', id: 'home-expertise' });
  expect(section).not.toBeNull();
  await chooseDrawerView(page, 'Pages');
  await expect(page.getByRole('button', { name: 'Create content', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Home\b/ }).click();
  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  await page.getByRole('button', { name: `Edit ${section!.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit content', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Title · English', exact: true })).toHaveValue(section!.title);
  await expect(dialog.getByRole('combobox', { name: 'Content type', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'URL identifier', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await db.collection('moe_content').countDocuments({ type: 'Section' })).toBe(count);
});

test('an unsaved Settings draft survives CMS route navigation and browser Back', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Settings');
  await expect(page).toHaveURL(/\/cms\/setting$/);
  const email = page.getByRole('textbox', { name: 'Public email address', exact: true });
  const original = (await db.collection<{ _id: string; email?: string }>('moe_settings').findOne({ _id: 'website' }))?.email || '';
  await email.fill('draft-only@example.test');
  await chooseDrawerView(page, 'Enquiries');
  await expect(page).toHaveURL(/\/cms\/enquiries$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/setting$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(email).toHaveValue('draft-only@example.test');
  expect((await db.collection<{ _id: string; email?: string }>('moe_settings').findOne({ _id: 'website' }))?.email || '').toBe(original);
});

test('an unsaved Media library image and title survive CMS route navigation and Back', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Media library');
  await expect(page).toHaveURL(/\/cms\/media$/);
  const addImage = page.getByRole('button', { name: 'Add an image', exact: true });
  const upload = page.getByRole('dialog', { name: 'Add an image', exact: true });
  await expect(upload).not.toBeVisible();
  await addImage.click();
  await expect(upload.getByText('Choose device image', { exact: true })).toBeVisible();
  const before = await db.collection('moe_media').countDocuments();
  await upload.getByLabel('Choose media library image', { exact: true }).setInputFiles({
    name: 'media-draft.png',
    mimeType: 'image/png',
    buffer: E2E_IMAGE_BUFFER,
  });
  const title = upload.getByRole('textbox', { name: /^Image name/ });
  await expect(title).toHaveValue('media-draft');
  await title.fill('Unsaved media draft');
  await expect(upload.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(upload).not.toBeVisible();
  await expect(addImage).toBeFocused();
  await addImage.click();
  await expect(upload.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await expect(title).toHaveValue('Unsaved media draft');
  await page.keyboard.press('Escape');
  await chooseDrawerView(page, 'Dashboard');
  await expect(page).toHaveURL(/\/cms$/);
  await expect(page.getByRole('img', { name: 'Prepared media preview' })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/media$/);
  await addImage.click();
  await expect(upload.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await expect(title).toHaveValue('Unsaved media draft');
  expect(await db.collection('moe_media').countDocuments()).toBe(before);
});

test('Media library shows 30 images per page and searches older images', async ({ page, db }) => {
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  await db.collection<{ _id: string }>('moe_media').insertMany(Array.from({ length: 60 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `media-page-${number}`;
    return {
      _id: id, id, title: `Media page image ${number}`, url: `${source!.url}?page=${number}`,
      publicId: `moe-e2e/${id}`, state: 'committed', owner: source!.owner,
      submissionId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      pinned: true, createdAt: new Date(Date.now() + (index + 1) * 1000).toISOString(),
      touchedAt: new Date(), bytes: source!.bytes,
    };
  }));
  await login(page);
  await page.goto('/cms/media');
  const library = page.getByRole('region', { name: 'Saved images' });
  const cards = library.locator('[class*="libraryGrid"] > div');
  await expect(cards).toHaveCount(30);
  await expect(library.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Next images' }).click();
  await expect(cards).toHaveCount(20);
  let releaseMore!: () => void;
  let moreStarted!: () => void;
  const heldMore = new Promise<void>(resolve => { releaseMore = resolve; });
  const startedMore = new Promise<void>(resolve => { moreStarted = resolve; });
  const moreRoute = (url: URL) => url.pathname === '/api/cms/media' && url.searchParams.has('cursor') && !url.searchParams.has('q');
  await page.route(moreRoute, async route => { moreStarted(); await heldMore; await route.continue(); });
  try {
    await library.getByRole('button', { name: 'Load more images' }).click();
    await startedMore;
    await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeDisabled();
  } finally {
    releaseMore();
  }
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();
  // Keep the released passthrough until teardown while image requests settle.
  const search = library.getByRole('searchbox', { name: 'Search media library' });
  await search.fill('Media page image 01');
  await expect(cards).toHaveCount(1);
  await expect(library.getByText('Media page image 01', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Clear search' }).click();
  await expect(cards).toHaveCount(30);
  await expect(library.getByText(/^Page 1 of \d+$/)).toBeVisible();
});

test('Media library keeps the prepared image and title when the upload provider is unavailable', async ({ page, db }) => {
  await login(page);
  await chooseDrawerView(page, 'Media library');
  await page.getByRole('button', { name: 'Add an image', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'Add an image', exact: true });
  const committedBefore = await db.collection('moe_media').countDocuments({ state: 'committed' });
  await upload.getByLabel('Choose media library image', { exact: true }).setInputFiles({
    name: 'provider-unavailable.png',
    mimeType: 'image/png',
    buffer: E2E_IMAGE_BUFFER,
  });
  const title = upload.getByRole('textbox', { name: /^Image name/ });
  await expect(title).toHaveValue('provider-unavailable');
  await title.fill('Prepared image kept after error');
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/cms/media') && response.request().method() === 'POST');
  await upload.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await uploadResponse).status()).toBe(503);
  await expect(upload.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(upload.getByRole('img', { name: 'Prepared media preview' })).toBeVisible();
  await expect(title).toHaveValue('Prepared image kept after error');
  expect(await db.collection('moe_media').countDocuments({ state: 'committed' })).toBe(committedBefore);
});

test('saving an image closes the upload dialog and shows the committed image in the library', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/media');
  let uploads = 0;
  // Stub the provider upload only; the final commit and saved library item use the real API.
  await page.route('**/api/cms/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploads++;
    const body = route.request().postDataBuffer();
    expect(body).not.toBeNull();
    const form = await new Response(new Uint8Array(body!), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
    const submissionId = String(form.get('submissionId'));
    const file = form.get('file') as File;
    const mediaId = createHash('sha256').update(submissionId + ':' + file.name).digest('hex');
    const media = { id: mediaId, title: file.name, url: E2E_IMAGE_ORIGIN + 'v1/' + mediaId + '.png', publicId: 'moe-e2e/' + mediaId, state: 'staged', owner: E2E_ADMIN.id, submissionId, pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date() };
    await db.collection<{ _id: string }>('moe_media').insertOne({ _id: mediaId, ...media });
    await route.fulfill({ status: 201, json: { media } });
  });
  const addImage = page.getByRole('button', { name: 'Add an image', exact: true });
  await addImage.click();
  const upload = page.getByRole('dialog', { name: 'Add an image', exact: true });
  await upload.getByLabel('Choose media library image', { exact: true }).setInputFiles({ name: 'new-library-image.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await upload.getByRole('textbox', { name: /^Image name/ }).fill('New saved library image');
  expect(uploads).toBe(0);
  await upload.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(upload).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved images' }).getByText('New saved library image', { exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  expect(await db.collection('moe_media').findOne({ title: 'New saved library image', state: 'committed', pinned: true })).not.toBeNull();
  await addImage.click();
  await expect(upload.getByRole('img', { name: 'Prepared media preview' })).toHaveCount(0);
});

test('Media library fits desktop and narrow mobile layouts in both CMS languages', async ({ page }, testInfo) => {
  await login(page);
  await page.goto('/cms/media');
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media library');
    const refreshBox = await page.getByRole('button', { name: 'Refresh workspace', exact: true }).boundingBox();
    const addBox = await page.getByRole('button', { name: 'Add an image', exact: true }).boundingBox();
    expect(refreshBox).not.toBeNull();
    expect(addBox).not.toBeNull();
    expect(addBox!.x).toBeGreaterThan(refreshBox!.x + refreshBox!.width);
    expect(Math.abs(addBox!.y + addBox!.height / 2 - refreshBox!.y - refreshBox!.height / 2)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath(`media-toolbar-${width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'Add an image', exact: true }).click();
    const upload = page.getByRole('dialog', { name: 'Add an image', exact: true });
    await expect(upload.getByLabel('Choose media library image', { exact: true })).toBeAttached();
    const bounds = await upload.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({ path: testInfo.outputPath(`media-upload-dialog-${width}.png`), animations: 'disabled' });
    await upload.getByLabel('Choose media library image', { exact: true }).setInputFiles({ name: `preview-${width}.png`, mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
    await expect(upload.getByRole('textbox', { name: /^Image name/ })).toHaveValue(`preview-${width}`);
    await expect(upload.getByRole('button', { name: 'Save image', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`media-upload-prepared-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Saved images' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.locator('header [data-cms-language-switch]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai['Media library']);
  await expect(page.getByRole('region', { name: cmsMainThai['Saved images'] })).toBeVisible();
  await page.getByRole('button', { name: cmsMainThai['Add an image'], exact: true }).click();
  await expect(page.getByRole('dialog', { name: cmsMainThai['Add an image'], exact: true }).getByLabel(cmsMainThai['Choose media library image'], { exact: true })).toBeAttached();
  await page.screenshot({ path: testInfo.outputPath('media-upload-dialog-thai-360.png'), animations: 'disabled' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Dashboard presents management summaries without a duplicate content table or Media library panel', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.getByRole('heading', { level: 2, name: 'Media library' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Content at a glance', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recently updated', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create content', exact: true })).toHaveCount(0);
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
  for (const path of ['/cms/sections', '/cms/not-a-view']) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test.describe('Thai deep-link sign-in', () => {
  test.use({ cmsLocale: 'th' });

  test('signing in returns to the requested CMS view and language changes keep the path', async ({ page }) => {
    await page.goto('/cms/enquiries');
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await expect(page.getByRole('heading', { name: cmsMainThai['Welcome back'], exact: true })).toBeVisible();
    await page.getByLabel(cmsMainThai['Username'], { exact: true }).fill(E2E_ADMIN.username);
    await page.getByLabel(cmsMainThai['Password'], { exact: true }).fill(E2E_ADMIN.password);
    await solveLoginSlide(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai['Enquiries']);
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await page.locator('header [data-cms-language-switch]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enquiries');
    await expect(page).toHaveURL(/\/cms\/enquiries$/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enquiries');
  });
});
