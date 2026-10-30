import { createHash } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { test, expect, login, E2E_ADMIN, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from './fixtures';

async function showField(editor: Locator, label: string) {
  const field = editor.getByLabel(label, { exact: true });
  const groups = field.locator('xpath=ancestor::details');
  for (const group of await groups.all()) {
    if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').click();
  }
  return field;
}

async function createVessel(page: Page, title: string): Promise<Locator> {
  await page.goto('/cms/fleet');
  await page.getByRole('button', { name: 'Add vessel', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^(Add|Edit) vessel$/ });
  await (await showField(editor, 'Title · English')).fill(title);
  await (await showField(editor, 'Title · Thai')).fill('เรือทดสอบระบบ');
  await editor.getByLabel('Vessel type · English', { exact: true }).fill('Container');
  await editor.getByLabel('Summary · English', { exact: true }).fill('Synthetic browser workflow vessel.');
  await editor.getByLabel('Summary · Thai', { exact: true }).fill('เรือสำหรับทดสอบการทำงานของเว็บไซต์');
  await expect(editor.getByLabel('Status', { exact: true })).toHaveCount(0);
  return editor;
}

test('Save immediately shows content, discard preserves it, and Trash/restore remains reversible', async ({ page, context, db }) => {
  await login(page);
  const title = 'Immediate save vessel';
  const editor = await createVessel(page, title);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  await editor.getByRole('button', { name: 'Browse library for main image' }).click();
  await editor.getByRole('searchbox', { name: 'Search library for main image' }).fill(String(media!.title));
  await editor.getByRole('button', { name: media!.title, exact: true }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const savedVessel = await db.collection('moe_content').findOne({ title, type: 'Vessel' });
  expect(savedVessel).toMatchObject({ status: 'Published', revision: 1 });
  const id = String(savedVessel!.id);

  const publicPage = await context.newPage();
  await publicPage.goto('/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await publicPage.goto('/th/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('เรือทดสอบระบบ');

  await page.getByRole('button', { name: 'Edit ' + title, exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
  await (await showField(edit, 'Title · English')).fill('Unsaved replacement');
  const firstControl = edit.getByRole('button', { name: 'Close Edit vessel', exact: true });
  await firstControl.press('Shift+Tab');
  await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  await edit.getByRole('button', { name: 'Save', exact: true }).press('Tab');
  await expect(firstControl).toBeFocused();
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
  expect((await publicPage.goto('/fleet/' + id))?.status()).toBe(404);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.goto('/cms/trash');
  await page.getByRole('button', { name: 'Restore ' + title, exact: true }).click();
  await expect.poll(async () => (await db.collection('moe_content').findOne({ id, type: 'Vessel' }))?.deletedAt).toBeUndefined();
  await publicPage.reload();
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('prepared uploads retry sequentially and an interrupted saved response recovers once', async ({ page, context, db }) => {
  await login(page);
  const title = 'Upload recovery vessel';
  const editor = await createVessel(page, title);
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
  await editor.getByText('More photos', { exact: true }).click();
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
  expect(await db.collection('moe_content').countDocuments({ title, type: 'Vessel' })).toBe(0);
  expect(await db.collection('moe_media').countDocuments()).toBe(baselineMedia + 1);

  let interruptedResponses = 0;
  await page.route('**/api/cms/content', async route => {
    if (route.request().method() !== 'POST' || interruptedResponses >= 2) return route.continue();
    interruptedResponses++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { error: 'Synthetic lost save response' } });
  });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Synthetic lost save response');
  const committed = await db.collection('moe_content').findOne({ title, type: 'Vessel' });
  expect(committed).toMatchObject({ revision: 1 });
  const id = String(committed!.id);
  const updatedTitle = 'Renamed while the saved response was uncertain';
  await (await showField(editor, 'Title · English')).fill(updatedTitle);
  // A second lost response belongs to the new text save, with its own retry budget.
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('alert')).toContainText('Synthetic lost save response');
  await expect(editor.getByRole('alert')).not.toContainText('Your newer unsaved changes');
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(await showField(editor, 'Title · English')).toHaveValue(updatedTitle);
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
  expect(saved[0]).toMatchObject({ title: updatedTitle, status: 'Published', revision: 2, gallery: [{ alt: 'Gallery image description', altTh: 'คำอธิบายภาพทดสอบ' }] });
  expect(await db.collection('moe_content').countDocuments({ type: 'Vessel', title: { $in: [title, updatedTitle] } })).toBe(1);
  expect(await db.collection('moe_media').countDocuments()).toBe(baselineMedia + 2);
  expect(await db.collection('moe_media').countDocuments({ submissionId: submittedIds[0], state: 'committed' })).toBe(2);
  const publicPage = await context.newPage();
  await publicPage.goto('/fleet/' + id);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(updatedTitle);
  await publicPage.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(publicPage.getByRole('img', { name: 'Gallery image description', exact: true })).toBeVisible();
});
