import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { cmsMainThai } from '../../src/lib/cms-main-th';
import { cmsFieldsThai } from '../../src/lib/cms-fields-th';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';

async function savedRecords(request: APIRequestContext): Promise<ContentRecord[]> {
  const response = await request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

function pageCard(page: Page, name: string) {
  return page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) });
}

async function showLanguage(editor: Locator, label: string) {
  const input = editor.getByLabel(label, { exact: true });
  if (!await input.isVisible()) {
    await input.locator('xpath=ancestor::details[1]').locator('summary').click();
  }
  await expect(input).toBeVisible();
  return input;
}

async function expectNoHorizontalOverflow(page: Page, editor?: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (editor) {
    await expect.poll(() => editor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
}

test('page cards lead to existing Home content, save both languages, and preserve the layout', async ({ page, context }, testInfo) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('button', { name: 'Create content', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  const before = (await savedRecords(page.request)).find(record => record.type === 'Page' && record.id === 'home')!;
  expect(before).toBeTruthy();

  await page.goto('/cms/pages');
  await expect(page.getByRole('heading', { name: 'Which page would you like to update?', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create content', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('cms-page-cards-desktop.png'), fullPage: true, animations: 'disabled' });
  await pageCard(page, 'Home').click();
  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  await expect(page.getByRole('heading', { name: 'Home', level: 2, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page introduction', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cms-home-content-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Edit Page introduction', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit content', exact: true });
  await expect(editor).toBeVisible();
  for (const label of ['Content type', 'URL identifier', 'Display order', 'Parent page', 'Icon', 'Content group · English', 'Content group · Thai']) {
    await expect(editor.getByLabel(new RegExp(`^${label}`))).toHaveCount(0);
  }
  await expect(editor.locator('[data-cms-language-switch]')).toHaveCount(0);
  await (await showLanguage(editor, 'Title · English')).fill('A clear Home title from the page editor');
  await (await showLanguage(editor, 'Title · Thai')).fill('ชื่อหน้าหลักที่แก้ไขจากหน้าจัดการเนื้อหา');
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveResponse;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  const saved = (await savedRecords(page.request)).find(record => record.type === 'Page' && record.id === 'home')!;
  expect(saved.title).toBe('A clear Home title from the page editor');
  expect(saved.titleTh).toBe('ชื่อหน้าหลักที่แก้ไขจากหน้าจัดการเนื้อหา');
  expect(saved.revision).toBe(before.revision + 1);
  for (const key of ['id', 'type', 'parentId', 'order', 'icon', 'category', 'categoryTh', 'image', 'mobileImage', 'gallery'] as const) {
    const empty = key === 'order' ? 0 : key === 'gallery' ? [] : '';
    expect(saved[key] ?? empty, key).toEqual(before[key] ?? empty);
  }

  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  const publicPage = await context.newPage();
  await publicPage.goto('/');
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(saved.title);
  await publicPage.goto('/th');
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(saved.titleTh);
  await publicPage.close();
  await page.getByRole('button', { name: 'All pages', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(pageCard(page, 'Home')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', level: 2, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Page introduction', exact: true }).click();
  await expect(await showLanguage(editor, 'Title · English')).toHaveValue(saved.title);
  await expect(await showLanguage(editor, 'Title · Thai')).toHaveValue(saved.titleTh);
});

test('shared footer editing contains only its bilingual text and links contact details to Settings', async ({ page }) => {
  await login(page);
  await page.goto('/cms/pages');
  await pageCard(page, 'Shared website content').click();
  await expect(page).toHaveURL(/\/cms\/pages\?page=shared$/);
  await page.getByRole('button', { name: 'Edit Footer text', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit content', exact: true });
  await showLanguage(editor, 'Title · English');
  await showLanguage(editor, 'Title · Thai');
  await expect(editor.locator('input, textarea, select')).toHaveCount(2);
  await expect(editor.getByRole('region', { name: 'Pictures', exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Summary · English', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/setting$/);
  await expect(page.getByRole('heading', { name: 'Website details', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review local content', exact: true })).toHaveCount(0);
});

test('required text opens its closed language panel and a previously moved section keeps generic image editing', async ({ page, db }) => {
  // Model a historical move in the isolated fixture; the current CMS cannot reparent sections.
  const moved = await db.collection('moe_content').updateOne(
    { type: 'Section', id: 'home-expertise' },
    { $set: { parentId: 'about' } },
  );
  expect(moved.modifiedCount).toBe(1);
  await login(page);
  const before = (await savedRecords(page.request)).find(record => record.type === 'Section' && record.id === 'home-expertise')!;
  await page.goto('/cms/pages?page=about');
  await page.getByRole('button', { name: `Edit ${before.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit content', exact: true });
  await expect(editor.getByRole('region', { name: 'Pictures', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Browse library for main image', exact: true })).toBeVisible();
  await expect(editor.getByLabel('Image description · English', { exact: true })).toBeEditable();
  await expect(editor.getByLabel('Image description · Thai', { exact: true })).toBeEditable();

  const thaiTitle = await showLanguage(editor, 'Title · Thai');
  await thaiTitle.fill('');
  const thaiPanel = thaiTitle.locator('xpath=ancestor::details[1]');
  await thaiPanel.locator('summary').click();
  await expect(thaiTitle).not.toBeVisible();
  const englishTitle = await showLanguage(editor, 'Title · English');
  await englishTitle.fill('Edited historical About section');
  await editor.getByLabel('Image description · English', { exact: true }).fill('Updated description for the existing section image');
  let contentPosts = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/cms/content') && request.method() === 'POST') contentPosts++;
  });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(thaiPanel).toHaveAttribute('open', '');
  await expect(thaiTitle).toBeVisible();
  await expect(thaiTitle).toHaveValue('');
  await expect(englishTitle).toHaveValue('Edited historical About section');
  await expect(editor.getByLabel('Image description · English', { exact: true })).toHaveValue('Updated description for the existing section image');
  expect(contentPosts).toBe(0);
  expect((await savedRecords(page.request)).find(record => record.type === 'Section' && record.id === before.id)).toEqual(before);

  await thaiTitle.fill(before.titleTh);
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveResponse;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  const saved = (await savedRecords(page.request)).find(record => record.type === 'Section' && record.id === before.id)!;
  expect(saved).toMatchObject({
    title: 'Edited historical About section', titleTh: before.titleTh,
    imageAlt: 'Updated description for the existing section image',
    parentId: 'about', order: before.order, image: before.image, revision: before.revision + 1,
  });
  expect(contentPosts).toBe(1);
});

for (const locale of ['en', 'th'] as const) {
  test(`page selection and the existing-content editor fit mobile in ${locale}`, async ({ page }, testInfo) => {
    await login(page);
    await page.setViewportSize({ width: 360, height: 800 });
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await page.goto('/cms/pages');
    const title = locale === 'th' ? cmsMainThai['Which page would you like to update?'] : 'Which page would you like to update?';
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`cms-page-cards-mobile-${locale}.png`), fullPage: true, animations: 'disabled' });
    await pageCard(page, locale === 'th' ? cmsMainThai.Home : 'Home').click();
    await expect(page).toHaveURL(/\/cms\/pages\?page=home$/);
    await expectNoHorizontalOverflow(page);
    const introduction = locale === 'th' ? cmsMainThai['Page introduction'] : 'Page introduction';
    const editName = locale === 'th' ? cmsMainThai['Edit {name}'].replace('{name}', introduction) : `Edit ${introduction}`;
    await page.getByRole('button', { name: editName, exact: true }).click();
    const editor = page.getByRole('dialog', { name: locale === 'th' ? cmsMainThai['Edit content'] : 'Edit content', exact: true });
    await expect(editor).toBeVisible();
    const labels = locale === 'th' ? [cmsFieldsThai['Title · Thai'], cmsFieldsThai['Title · English']] : ['Title · English', 'Title · Thai'];
    for (const label of labels) await showLanguage(editor, label);
    await expectNoHorizontalOverflow(page, editor);
    await editor.locator('summary').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`cms-page-editor-mobile-${locale}.png`), animations: 'disabled' });
    await expect(editor.getByRole('button', { name: locale === 'th' ? cmsMainThai.Save : 'Save', exact: true })).toBeInViewport();
    await editor.getByRole('button', { name: locale === 'th' ? cmsMainThai.Cancel : 'Cancel', exact: true }).click();
    await expect(editor).not.toBeVisible();
  });
}

test('CMS API rejects new page elements and layout changes without changing saved content', async ({ request }) => {
  const headers = { origin: E2E_BASE_URL };
  expect((await request.post('/api/cms/login', { headers, data: { ...E2E_ADMIN, ...await loginChallengeData(request) } })).ok()).toBe(true);
  const before = await savedRecords(request);
  const page = before.find(record => record.type === 'Page' && record.id === 'home')!;
  const section = before.find(record => record.type === 'Section' && record.id === 'home-expertise')!;
  expect(page).toBeTruthy();
  expect(section).toBeTruthy();

  for (const record of [page, section]) {
    const create = await request.post('/api/cms/content', { headers, data: {
      record: { ...record, id: `e2e-disallowed-${record.type.toLowerCase()}` },
      expectedRevision: null, submissionId: randomUUID(),
    } });
    expect(create.status(), await create.text()).toBe(403);
    expect((await create.json()).error).toContain('New page elements cannot be added');
  }

  const changes: Array<{ record: ContentRecord; patch: Partial<ContentRecord> }> = [
    { record: page, patch: { order: (page.order ?? 0) + 1 } },
    { record: section, patch: { parentId: 'about' } },
    { record: section, patch: { order: (section.order ?? 0) + 1 } },
    { record: section, patch: { icon: section.icon === 'Anchor' ? 'Ship' : 'Anchor' } },
    { record: section, patch: { category: 'A different layout group' } },
  ];
  for (const { record, patch } of changes) {
    const update = await request.post('/api/cms/content', { headers, data: {
      record: { ...record, ...patch }, expectedRevision: record.revision, submissionId: randomUUID(),
    } });
    expect(update.status(), await update.text()).toBe(403);
    expect((await update.json()).error).toContain('page layout is fixed');
  }
  for (const record of [page, section]) {
    const remove = await request.post('/api/cms/content/action', { headers, data: {
      id: record.id, type: record.type, action: 'trash', expectedRevision: record.revision,
    } });
    expect(remove.status(), await remove.text()).toBe(403);
  }
  expect(await savedRecords(request)).toEqual(before);
});
