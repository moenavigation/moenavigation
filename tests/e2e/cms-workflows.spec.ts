import { createHash } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { test, expect, login, E2E_ADMIN, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from './fixtures';

async function createVessel(page: Page, id: string, title: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Create content', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Create content', exact: true });
  await editor.getByRole('combobox', { name: 'Content type', exact: true }).selectOption('Vessel');
  await editor.getByLabel('Title · English', { exact: true }).fill(title);
  await editor.getByLabel('Title · Thai', { exact: true }).fill('เรือทดสอบระบบ');
  await editor.getByLabel('URL identifier').fill(id);
  await editor.getByLabel('Vessel type · English', { exact: true }).fill('Container');
  await editor.getByLabel('Summary · English', { exact: true }).fill('Synthetic browser workflow vessel.');
  await editor.getByLabel('Summary · Thai', { exact: true }).fill('เรือสำหรับทดสอบการทำงานของเว็บไซต์');
  await expect(editor.getByLabel('Status', { exact: true })).toHaveCount(0);
  return editor;
}

test('Save immediately shows content, discard preserves it, and Trash/restore remains reversible', async ({ page, context, db }) => {
  await login(page);
  const id = 'e2e-immediate-vessel';
  const title = 'Immediate save vessel';
  const editor = await createVessel(page, id, title);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  await editor.getByRole('button', { name: 'Browse library for main image' }).click();
  await editor.getByRole('button', { name: media!.title, exact: true }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await db.collection('moe_content').findOne({ id, type: 'Vessel' })).toMatchObject({ status: 'Published', revision: 1 });

  const publicPage = await context.newPage();
  await publicPage.goto('/en/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await publicPage.goto('/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('เรือทดสอบระบบ');

  await page.getByRole('button', { name: 'Edit ' + title, exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit content', exact: true });
  await edit.getByLabel('Title · English', { exact: true }).fill('Unsaved replacement');
  await edit.getByRole('button', { name: 'Close Edit content' }).press('Shift+Tab');
  await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  await edit.getByRole('button', { name: 'Save', exact: true }).press('Tab');
  await expect(edit.getByRole('button', { name: 'Close Edit content' })).toBeFocused();
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Discard changes', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit.getByLabel('Title · English', { exact: true })).toHaveValue('Unsaved replacement');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect((await db.collection('moe_content').findOne({ id, type: 'Vessel' }))?.title).toBe(title);

  await page.getByRole('button', { name: 'Move ' + title + ' to Trash', exact: true }).click();
  await page.getByRole('dialog', { name: 'Move to Trash?' }).getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Move to Trash?' })).not.toBeVisible();
  expect((await publicPage.goto('/en/fleet/' + id))?.status()).toBe(404);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.getByRole('button', { name: /^Trash 1$/ }).click();
  await page.getByRole('button', { name: 'Restore ' + title, exact: true }).click();
  await expect.poll(async () => (await db.collection('moe_content').findOne({ id, type: 'Vessel' }))?.deletedAt).toBeUndefined();
  await publicPage.reload();
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('prepared uploads retry sequentially and an interrupted saved response recovers once', async ({ page, context, db }) => {
  await login(page);
  const id = 'e2e-upload-vessel';
  const title = 'Upload recovery vessel';
  const editor = await createVessel(page, id, title);
  const baselineMedia = await db.collection('moe_media').countDocuments();
  const files: string[] = [];
  const submittedIds: string[] = [];
  let uploadsInFlight = 0;
  let maximumConcurrentUploads = 0;
  let failSecond = true;
  // Simulate only the provider-facing upload boundary. Authentication, final
  // content transaction, references and uncertain-save resolution remain real.
  await page.route('**/api/cms/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    uploadsInFlight++;
    maximumConcurrentUploads = Math.max(maximumConcurrentUploads, uploadsInFlight);
    try {
      const body = route.request().postDataBuffer();
      expect(body).not.toBeNull();
      const form = await new Response(new Uint8Array(body!), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
      const submissionId = String(form.get('submissionId'));
      const file = form.get('file') as File;
      files.push(file.name);
      submittedIds.push(submissionId);
      if (files.length === 2 && failSecond) {
        failSecond = false;
        await route.fulfill({ status: 503, json: { error: 'Synthetic second upload failure' } });
        return;
      }
      const mediaId = createHash('sha256').update(submissionId + ':' + file.name).digest('hex');
      const url = E2E_IMAGE_ORIGIN + 'v1/' + mediaId + '.png';
      const media = { id: mediaId, title: file.name, url, publicId: 'moe-e2e/' + mediaId, state: 'staged', owner: E2E_ADMIN.id, submissionId, pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date() };
      await db.collection<{ _id: string }>('moe_media').insertOne({ _id: mediaId, ...media });
      await route.fulfill({ status: 201, json: { media } });
    } finally { uploadsInFlight--; }
  });
  await editor.getByLabel('Choose main image', { exact: true }).setInputFiles({ name: 'main-test.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await expect(editor.getByText('Ready to upload', { exact: true })).toHaveCount(1);
  await editor.getByText('Photo gallery', { exact: true }).click();
  await editor.getByRole('button', { name: 'Add gallery image' }).click();
  await editor.getByLabel('Choose gallery image 1', { exact: true }).setInputFiles({ name: 'gallery-test.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await expect(editor.getByText('Ready to upload', { exact: true })).toHaveCount(2);
  await editor.getByLabel('Description · English', { exact: true }).fill('Gallery image description');
  await editor.getByLabel('Description · Thai', { exact: true }).fill('คำอธิบายภาพทดสอบ');
  expect(files).toHaveLength(0);
  expect(await db.collection('moe_media').countDocuments()).toBe(baselineMedia);

  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Synthetic second upload failure');
  await expect(editor.getByLabel('Title · English', { exact: true })).toHaveValue(title);
  expect(await db.collection('moe_content').countDocuments({ id, type: 'Vessel' })).toBe(0);
  expect(await db.collection('moe_media').countDocuments()).toBe(baselineMedia + 1);

  let interruptSave = true;
  await page.route('**/api/cms/content', async route => {
    if (route.request().method() !== 'POST' || !interruptSave) return route.continue();
    interruptSave = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { error: 'Synthetic lost save response' } });
  });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Synthetic lost save response');
  // A retry uses the same submission and receives the committed operation.
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(files).toHaveLength(3);
  expect(files[0]).toMatch(/^main-test\./);
  expect(files[1]).toMatch(/^gallery-test\./);
  expect(files[2]).toBe(files[1]);
  expect(new Set(submittedIds).size).toBe(1);
  expect(maximumConcurrentUploads).toBe(1);
  const saved = await db.collection('moe_content').find({ id, type: 'Vessel' }).toArray();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ status: 'Published', revision: 1, gallery: [{ alt: 'Gallery image description', altTh: 'คำอธิบายภาพทดสอบ' }] });
  expect(await db.collection('moe_media').countDocuments()).toBe(baselineMedia + 2);
  expect(await db.collection('moe_media').countDocuments({ submissionId: submittedIds[0], state: 'committed' })).toBe(2);
  const publicPage = await context.newPage();
  await publicPage.goto('/en/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await publicPage.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(publicPage.getByRole('img', { name: 'Gallery image description', exact: true })).toBeVisible();
});
