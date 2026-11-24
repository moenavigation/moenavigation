import { test, expect, login, solveLoginSlide, E2E_ADMIN, E2E_IMAGE_BUFFER } from './fixtures';
import type { ContentRecord } from '../../src/lib/cms-types';
import type { MediaDocument } from '../../src/server/db';
import { fleetPhotoSlides, includedHomeSlides, ownerVideoSlides, homeSlideVideoPoster } from '../../src/lib/home-slides';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // Visit lazy thumbnails before the full-page capture so the saved review
  // artifact includes the same images an editor sees while scrolling.
  for (const thumbnail of await page.locator('[data-slide-card] img').all()) {
    await thumbnail.scrollIntoViewIfNeeded();
    await expect.poll(() => thumbnail.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => page.locator('[data-slide-card]').evaluateAll(cards => cards.every(card => getComputedStyle(card).transform === 'none'))).toBe(true);
  const output = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' });
  const folder = path.resolve('docs/screenshots');
  await mkdir(folder, { recursive: true });
  await copyFile(output, path.join(folder, `${name}-${testInfo.project.name}.png`));
}

test.describe('mobile banner photo preparation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('large banner photos retain 2560 pixels and fit the mobile slide editor', async ({ page }) => {
    await login(page);
    await page.goto('/cms/slides');
    const cards = page.locator('[data-slide-card]');
    await expect(cards).toHaveCount(5);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 1000;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#37688c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL().split(',')[1];
    });
    await page.getByLabel('Select banner images or videos').setInputFiles({
      name: 'wide-banner.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
    });
    await expect(cards).toHaveCount(6);
    const preview = cards.last().locator('img');
    await preview.scrollIntoViewIfNeeded();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([2560, 853]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('a device video is compressed locally, saved as a video, and available in the banner library', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/slides');
  const cards = page.locator('[data-slide-card]');
  await expect(cards).toHaveCount(5);
  const file = page.getByLabel('Select banner images or videos');
  let uploads = 0;
  await page.route('**/api/cms/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploads++;
    const form = await new Response(new Uint8Array(route.request().postDataBuffer()!), {
      headers: { 'Content-Type': route.request().headers()['content-type'] },
    }).formData();
    const clip = form.get('file') as File;
    const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
    const submissionId = String(form.get('submissionId'));
    const id = sha(`${E2E_ADMIN.id}:${submissionId}:${preparedHash}`);
    const publicId = `moe-e2e/${id}`;
    const url = `https://res.cloudinary.com/moe-e2e/video/upload/v1/${publicId}.${clip.type === 'video/mp4' ? 'mp4' : 'webm'}`;
    // Emulate the staged Cloudinary asset. The request still exercises the real
    // authenticated upload validation and the subsequent MongoDB slide save.
    await db.collection<MediaDocument>('moe_media').insertOne({
      _id: id, id, publicId, url, title: 'Harbor clip', kind: 'video', state: 'staged',
      owner: E2E_ADMIN.id, submissionId, pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date(),
    });
    await route.continue();
  });
  await file.setInputFiles(path.resolve('tests/fixtures/banner-video.mp4'));
  const hasEncoder = await page.evaluate(() => typeof VideoEncoder !== 'undefined');
  if (!hasEncoder) {
    await expect(page.getByText('This browser could not compress this video. Try another browser or choose a different clip.', { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(5);
    expect(uploads).toBe(0);
    // A browser without an encoder can still prepare an already optimized clip.
    await file.setInputFiles(path.resolve('tests/fixtures/prepared-slide.mp4'));
  }
  await expect(cards).toHaveCount(6);
  const preview = cards.last().locator('video');
  await expect(preview).toHaveAttribute('src', /^blob:/);
  // WebKit may omit multipart file bytes from Playwright's intercepted request.
  // Hash the actual local preview that the editor submits on Save.
  const preparedHash = await preview.evaluate(async (video: HTMLVideoElement) => {
    const bytes = await (await fetch(video.src)).arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  });
  if (hasEncoder) await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(1280);
  expect(uploads).toBe(0);
  await cards.last().locator('summary').click();
  await cards.last().getByLabel('Video description · English').fill('A ship entering the harbor');
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.')).toBeVisible();
  expect(uploads).toBe(1);
  const saved = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(saved.heroSlides?.at(-1)).toMatchObject({ kind: 'video', alt: 'A ship entering the harbor' });
  await page.getByRole('button', { name: 'Remove slide 6', exact: true }).click();
  await page.getByRole('button', { name: 'Browse library', exact: true }).click();
  await page.getByLabel('Search banners').fill('Harbor clip');
  await page.getByRole('button', { name: 'Video · Harbor clip', exact: true }).click();
  await expect(cards.last().locator('video')).toHaveAttribute('src', saved.heroSlides!.at(-1)!.url);
  expect(uploads).toBe(1);
});

test('homepage slide manager preserves unsaved order across navigation and saves interval with immediate public visibility', async ({ page, context }, testInfo) => {
  await login(page);
  await page.goto('/cms/slides');
  await expect(page.getByRole('heading', { name: 'Homepage slides', exact: true })).toBeVisible();
  const cards = page.locator('[data-slide-card]');
  await expect(cards).toHaveCount(5);
  const original = await cards.first().locator('img').getAttribute('src');
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  await expect(cards.nth(1).locator('img')).toHaveAttribute('src', original!);
  const timing = page.getByLabel('Time between slides', { exact: true });
  await timing.focus(); await timing.press('Home'); await timing.press('ArrowRight'); await timing.press('ArrowRight');
  await expect(timing).toHaveValue('4');
  await page.getByRole('button', { name: 'Open CMS navigation' }).click();
  await page.getByRole('dialog', { name: 'CMS navigation' }).getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await page.getByRole('button', { name: 'Open CMS navigation' }).click();
  await page.getByRole('dialog', { name: 'CMS navigation' }).getByRole('button', { name: 'Homepage slides', exact: true }).click();
  await expect(cards.nth(1).locator('img')).toHaveAttribute('src', original!);
  await expect(timing).toHaveValue('4');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  const saved = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(saved.heroSlideInterval).toBe(4);
  expect(saved.heroSlides?.[1].url).toBe(original);
  await capture(page, testInfo, 'cms-slides-desktop');
  const publicPage = await context.newPage();
  await publicPage.emulateMedia({ reducedMotion: 'reduce' });
  await publicPage.goto('/');
  await expect(publicPage.locator('main img').first()).toHaveAttribute('src', saved.heroSlides![0].url);
  await publicPage.close();
});

test.describe('desktop slide grid', () => {
  test.use({ viewport: { width: 1440, height: 1050 } });

  test('cards share a row without the preview panel and drag horizontally', async ({ page }) => {
    await login(page);
    await page.goto('/cms/slides');
    const cards = page.locator('[data-slide-card]');
    await expect(cards).toHaveCount(5);
    await expect(page.getByRole('complementary', { name: 'Banner preview', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Preview', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slide-preview]')).toHaveCount(0);
    const boxes = await cards.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
    expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(1);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    const original = await cards.first().locator('img').getAttribute('src');
    const handle = await page.getByRole('button', { name: 'Drag slide 1 to reorder', exact: true }).boundingBox();
    expect(handle).not.toBeNull();
    const start = { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + boxes[1].x - boxes[0].x, start.y, { steps: 20 });
    await expect(cards.nth(1).locator('img')).toHaveAttribute('src', original!);
    await page.mouse.up();
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  });

  test('drag handles move a card from the first row to the last position in the next row', async ({ page }) => {
    await login(page);
    await page.goto('/cms/slides');
    const cards = page.locator('[data-slide-card]');
    await expect(cards).toHaveCount(5);
    const original = await cards.first().locator('img').getAttribute('src');
    const first = await cards.first().boundingBox();
    const last = await cards.last().boundingBox();
    const handle = await page.getByRole('button', { name: 'Drag slide 1 to reorder', exact: true }).boundingBox();
    expect(first).not.toBeNull(); expect(last).not.toBeNull(); expect(handle).not.toBeNull();
    expect(last!.y).toBeGreaterThan(first!.y + first!.height);
    const start = { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Place the dragged card's center beyond the last card's midpoint so it
    // inserts after that card, independent of the handle's position inside it.
    await page.mouse.move(start.x + last!.x - first!.x + last!.width * .2, start.y + last!.y - first!.y, { steps: 30 });
    await expect(cards.last().locator('img')).toHaveAttribute('src', original!);
    await page.mouse.up();
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  });
});

for (const width of [320, 390]) {
  test.describe(`${width}px mobile homepage slide manager`, () => {
    test.use({ viewport: { width, height: 844 } });
    test('mobile controls fit and Thai copy remains localized', async ({ page }, testInfo) => {
      await login(page);
      await page.goto('/cms/slides');
      await expect(page.locator('[data-slide-card]')).toHaveCount(5);
      await expect(page.locator('[data-slide-preview]')).toHaveCount(0);
      await expect(page.getByLabel('Time between slides', { exact: true })).toHaveValue('3');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      const name = width === 390 ? 'cms-slides-mobile' : `cms-slides-mobile-${width}`;
      await capture(page, testInfo, name);
      await page.evaluate(() => { localStorage.setItem('moe-cms-language', 'th'); window.dispatchEvent(new Event('cms-language-change')); });
      await expect(page.getByRole('heading', { name: 'สไลด์หน้าแรก', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ภาพตัวอย่าง', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'บันทึกสไลด์', exact: true })).toBeVisible();
      await expect(page.getByLabel('ระยะเวลาเปลี่ยนสไลด์', { exact: true })).toHaveValue('3');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await capture(page, testInfo, width === 390 ? 'cms-slides-mobile-th' : `cms-slides-mobile-th-${width}`);
    });
  });
}

test('failed save retains the draft and a lost successful response reconciles without a duplicate revision', async ({ page }) => {
  await login(page);
  await page.goto('/cms/slides');
  const cards = page.locator('[data-slide-card]');
  await expect(cards).toHaveCount(5);
  const before = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  let fail = true;
  await page.route('**/api/cms/home-slides', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    if (fail) { fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary save error' }) }); }
    await route.fetch();
    return route.abort('failed');
  });
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Temporary save error', { exact: true })).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  const after = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(after.revision).toBe(before.revision + 1);
  await expect(page.getByRole('button', { name: 'Save slides', exact: true })).toBeDisabled();
});

test('concurrent homepage changes require review and preserve both the slide draft and latest homepage text', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/slides');
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  await db.collection('moe_content').updateOne({ type: 'Page', id: 'home' }, { $inc: { revision: 1 }, $set: { title: 'Latest homepage introduction' } });
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Another change was saved first', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save slides', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Keep my version', exact: true }).click();
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  const saved = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(saved.title).toBe('Latest homepage introduction');
  expect(saved.heroSlides).toHaveLength(5);
});

test('expired sessions keep the slide draft and prepared device image for the same account', async ({ page }) => {
  await login(page);
  await page.goto('/cms/slides');
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  let uploadRequests = 0;
  await page.route('**/api/cms/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploadRequests++;
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Please sign in again.' }) });
  });
  await page.getByLabel('Select banner images or videos', { exact: true }).setInputFiles({ name: 'prepared-banner.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await expect(page.locator('[data-slide-card]')).toHaveCount(6);
  expect(uploadRequests).toBe(0);
  const lastCard = page.locator('[data-slide-card]').last();
  const preparedUrl = await lastCard.locator('img').getAttribute('src');
  expect(preparedUrl).toMatch(/^blob:/);
  await lastCard.locator('summary').click();
  await lastCard.getByLabel('Image description · English', { exact: true }).fill('Prepared banner kept through sign-in');
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(E2E_ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await solveLoginSlide(page);
  await expect(page.getByRole('heading', { name: 'Homepage slides', exact: true })).toBeVisible();
  await expect(page.locator('[data-slide-card]')).toHaveCount(6);
  await expect(lastCard.locator('img')).toHaveAttribute('src', preparedUrl!);
  await lastCard.locator('summary').click();
  await expect(lastCard.getByLabel('Image description · English', { exact: true })).toHaveValue('Prepared banner kept through sign-in');
  expect(await lastCard.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(uploadRequests).toBe(1);
});

test('a removed included banner can be found and added again after saving', async ({ page }) => {
  await login(page);
  await page.goto('/cms/slides');
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Remove slide 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-slide-card]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Browse library', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a banner', exact: true });
  const included = picker.getByRole('region', { name: 'Included banners', exact: true });
  await expect(included.getByRole('button')).toHaveCount(includedHomeSlides.length);
  await expect(included.getByRole('button', { name: fleetPhotoSlides[1].alt, exact: true })).toBeDisabled();
  await picker.getByLabel('Search banners', { exact: true }).fill(fleetPhotoSlides[0].alt);
  await expect(included.getByRole('button')).toHaveCount(1);
  await included.getByRole('button', { name: fleetPhotoSlides[0].alt, exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  const saved = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(saved.heroSlides?.at(-1)).toEqual(fleetPhotoSlides[0]);
});

test('included company footage has a poster, saves without upload, and retains the editor description', async ({ page }) => {
  const clip = ownerVideoSlides[0];
  let uploads = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/media') uploads++; });
  await login(page);
  await page.goto('/cms/slides');
  await page.getByRole('button', { name: 'Browse library', exact: true }).click();
  const included = page.getByRole('region', { name: 'Included banners', exact: true });
  const select = included.getByRole('button', { name: `Video · ${clip.alt}`, exact: true });
  await expect(select.locator('img')).toHaveAttribute('src', homeSlideVideoPoster(clip.url)!);
  await select.click();
  const card = page.locator('[data-slide-card]').last();
  await expect(card.locator('video')).toHaveAttribute('poster', homeSlideVideoPoster(clip.url)!);
  await card.locator('summary').click();
  await card.getByLabel('Video description · English').fill('Selected owner footage');
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  await expect(page.getByText('Homepage slides saved. Your website is up to date.', { exact: true })).toBeVisible();
  const saved = (await (await page.request.get('/api/cms/home-slides')).json()).record as ContentRecord;
  expect(saved.heroSlides).toEqual([...fleetPhotoSlides, { ...clip, alt: 'Selected owner footage' }]);
  await page.reload();
  await expect(page.locator('[data-slide-card]').last().locator('video')).toHaveAttribute('aria-label', 'Selected owner footage');
  expect(uploads).toBe(0);
});
