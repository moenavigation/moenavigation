import { createHash } from 'node:crypto';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN } from './fixtures';

test('unused images are recoverable from the main CMS Trash page', async ({ page, db }) => {
  const old = new Date(0);
  const now = new Date();
  const mediaRow = (name: string, touchedAt = old) => {
    const id = createHash('sha256').update(`media-trash-e2e:${name}`).digest('hex');
    return {
      _id: id, id, title: `Media trash ${name}`, publicId: `moe-e2e/${id}`,
      url: `${E2E_IMAGE_ORIGIN}v1/${id}.png`, owner: E2E_ADMIN.id,
      submissionId: `40000000-0000-4000-8000-${String(name.length).padStart(12, '0')}`,
      state: 'committed', pinned: true, createdAt: touchedAt.toISOString(), touchedAt,
    };
  };
  const unused = mediaRow('unused');
  const fresh = mediaRow('fresh', now);
  const active = mediaRow('active');
  const inTrash = mediaRow('content-in-trash');
  await db.collection<{ _id: string }>('moe_media').insertMany([unused, fresh, active, inTrash]);
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Page:home' }, { $set: { image: active.url } });
  await db.collection('moe_content').insertOne({
    _id: 'News:media-trash-reference', id: 'media-trash-reference', type: 'News',
    title: 'Deleted content keeps its image', titleTh: 'เนื้อหาที่ลบยังเก็บภาพ',
    description: '', descriptionTh: '', image: '', mobileImage: '',
    gallery: [{ url: inTrash.url, alt: '', altTh: '' }], category: 'News',
    status: 'Published', revision: 1, updatedAt: now.toISOString(),
    deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 86400000),
  } as never);

  expect((await page.request.get('/api/cms/media/trash')).status()).toBe(401);
  expect((await page.request.post('/api/cms/media/cleanup', { headers: { Origin: E2E_BASE_URL }, data: {} })).status()).toBe(401);
  expect((await page.request.post('/api/cms/media/trash', { headers: { Origin: E2E_BASE_URL }, data: { mediaId: unused.id } })).status()).toBe(401);
  expect((await page.request.post('/api/cms/media/restore', { headers: { Origin: E2E_BASE_URL }, data: { mediaId: unused.id } })).status()).toBe(401);
  await login(page);
  await page.goto('/cms/media');
  const cleanupButton = page.getByRole('button', { name: 'Clean unused images' });
  await expect(cleanupButton).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search media library' }).fill(unused.title);
  const unusedCard = page.getByRole('region', { name: 'Saved images' }).locator('[class*="libraryGrid"] > div').filter({ hasText: unused.title });
  await expect(unusedCard).toBeVisible();

  for (const [item, expected] of [[unused, 0], [fresh, 0], [active, 1], [inTrash, 1]] as const) {
    const result = await page.request.get(`/api/cms/media/usage?mediaId=${item.id}`);
    expect(result.status()).toBe(200);
    expect((await result.json()).usages).toHaveLength(expected);
  }
  for (const item of [active, inTrash]) {
    const protectedMove = await page.request.post('/api/cms/media/trash', { headers: { Origin: E2E_BASE_URL }, data: { mediaId: item.id } });
    expect(protectedMove.status()).toBe(409);
  }

  const cleanupResponse = page.waitForResponse(response => response.url().endsWith('/api/cms/media/cleanup') && response.request().method() === 'POST');
  await cleanupButton.click();
  const cleanupConfirmation = page.getByRole('dialog', { name: 'Clean unused images' });
  await expect(cleanupConfirmation).toContainText('Media Trash');
  await cleanupConfirmation.getByRole('button', { name: 'Clean unused images', exact: true }).click();
  const cleanup = await cleanupResponse;
  expect(cleanup.status(), await cleanup.text()).toBe(200);
  expect(await cleanup.json()).toMatchObject({ trashed: 1, deleted: 0, failed: 0 });
  await expect(unusedCard).not.toBeVisible();

  const media = db.collection<{ _id: string; state: string; trashedAt?: string }>('moe_media');
  const moved = await media.findOne({ _id: unused.id });
  expect(moved).toMatchObject({ state: 'trashed', trashedAt: expect.anything() });
  for (const item of [fresh, active, inTrash]) {
    expect(await media.findOne({ _id: item.id })).toMatchObject({ state: 'committed' });
  }
  const library = await page.request.get('/api/cms/media?q=Media%20trash%20unused');
  expect(library.status()).toBe(200);
  expect((await library.json()).media).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: unused.id })]));
  const trash = await page.request.get('/api/cms/media/trash');
  expect(trash.status()).toBe(200);
  expect(await trash.json()).toMatchObject({ media: expect.arrayContaining([expect.objectContaining({ id: unused.id, state: 'trashed' })]) });
  const contentTrashCount = await db.collection('moe_content').countDocuments({
    deletedAt: { $exists: true },
    $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }],
  });
  const imageTrashCount = await media.countDocuments({ state: 'trashed' });
  const overviewResponse = await page.request.get('/api/cms/content?scope=overview');
  expect(overviewResponse.status()).toBe(200);
  expect(contentTrashCount).toBeGreaterThanOrEqual(1);
  expect(imageTrashCount).toBe(1);
  expect((await overviewResponse.json()).summary.trashCount).toBe(contentTrashCount + imageTrashCount);

  // The normal navigation destination must expose both removed content and images.
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await drawer.getByRole('button', { name: /^Trash(?:\s*\(\d+\))?$/ }).click();
  await expect(page).toHaveURL(/\/cms\/trash$/);
  const images = page.getByRole('region', { name: 'Trash items', exact: true });
  await expect(images).toContainText(unused.title);
  await expect(images).toContainText('Deleted content keeps its image');
  await expect(page.getByRole('dialog', { name: 'Media Trash', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(images).toContainText(unused.title);
  await expect(images.getByRole('button', { name: `Restore ${unused.title}` })).toBeVisible();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(images.getByRole('button', { name: `Delete ${unused.title} permanently` })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/unified-trash-${width === 1280 ? 'desktop' : 'mobile'}.png`, fullPage: true });
  }

  const restore = await page.request.post('/api/cms/media/restore', { headers: { Origin: E2E_BASE_URL }, data: { mediaId: unused.id } });
  expect(restore.status(), await restore.text()).toBe(200);
  expect(await media.findOne({ _id: unused.id })).toMatchObject({ state: 'committed' });
  const restoredLibrary = await page.request.get('/api/cms/media?q=Media%20trash%20unused');
  expect(restoredLibrary.status()).toBe(200);
  expect((await restoredLibrary.json()).media).toEqual(expect.arrayContaining([expect.objectContaining({ id: unused.id })]));
  expect((await (await page.request.get('/api/cms/media/trash')).json()).media).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: unused.id })]));
  const bypassTrash = await page.request.post('/api/cms/media/remove', { headers: { Origin: E2E_BASE_URL }, data: { mediaId: unused.id } });
  expect(bypassTrash.status()).toBe(409);
  expect(await media.findOne({ _id: unused.id })).toMatchObject({ state: 'committed' });

  // Refresh updates the Images section after a change made in another session.
  await expect(images).toContainText(unused.title);
  const refreshedImages = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/trash' && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  expect((await refreshedImages).status()).toBe(200);
  await expect(images.locator(`[data-trash-key="Image:${unused.id}"]`)).toHaveCount(0);

  // A person can move a recently restored, still-unused card without waiting
  // for the bulk cleanup grace period, then recover it from the visible Trash.
  await page.goto('/cms/media');
  await page.getByRole('searchbox', { name: 'Search media library' }).fill(unused.title);
  const card = page.getByRole('region', { name: 'Saved images' }).locator('[class*="libraryGrid"] > div').filter({ hasText: unused.title });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: `Move ${unused.title} to Media Trash` }).click();
  const confirmation = page.getByRole('dialog', { name: 'Move to Media Trash' });
  await expect(confirmation).toContainText(unused.title);
  await confirmation.getByRole('button', { name: 'Move to Media Trash', exact: true }).click();
  await expect.poll(async () => (await media.findOne({ _id: unused.id }))?.state).toBe('trashed');
  const trashShortcut = page.getByRole('link', { name: 'Media Trash', exact: true });
  await expect(trashShortcut).toHaveAttribute('href', '/cms/trash?kind=Image');
  await trashShortcut.click();
  await expect(page).toHaveURL(/\/cms\/trash\?kind=Image$/);
  await expect(images).toContainText(unused.title);
  await images.getByRole('button', { name: `Delete ${unused.title} permanently` }).click();
  const permanentDelete = page.getByRole('dialog', { name: 'Delete permanently' });
  await expect(permanentDelete).toContainText('cannot be undone');
  await permanentDelete.getByRole('button', { name: 'Cancel' }).click();
  expect(await media.findOne({ _id: unused.id })).toMatchObject({ state: 'trashed' });
  await images.getByRole('button', { name: `Restore ${unused.title}` }).click();
  await expect.poll(async () => (await media.findOne({ _id: unused.id }))?.state).toBe('committed');
  await expect(images.locator(`[data-trash-key="Image:${unused.id}"]`)).toHaveCount(0);
  await images.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(images).toContainText('Deleted content keeps its image');
});
