import type { Locator } from '@playwright/test';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, refreshPublicCache } from './fixtures';

async function expectSaveOnlyInterface(scope: Locator) {
  const oldLabels = /^(Published|Not public|Draft|Published content|Saved as published|Saved unpublished content|Publication status|เผยแพร่แล้ว|ยังไม่เผยแพร่|เนื้อหาที่เผยแพร่|บันทึกเป็นเนื้อหาที่เผยแพร่แล้ว|เนื้อหาที่บันทึกไว้แต่ยังไม่เผยแพร่|สถานะการเผยแพร่)$/;
  await expect(scope.getByText(oldLabels)).toHaveCount(0);
  await expect(scope.getByRole('combobox', { name: /Publication status|สถานะการเผยแพร่/ })).toHaveCount(0);
  await expect(scope.getByRole('button', { name: /^(Publish|Unpublish|Save draft|เผยแพร่|ยกเลิกเผยแพร่|บันทึกฉบับร่าง)$/ })).toHaveCount(0);
}

for (const locale of ['en', 'th'] as const) {
  test(`CMS has no publishing controls or badges in ${locale}`, async ({ page, db }) => {
    test.setTimeout(90_000);
    const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
    const vessel = await content.findOne({ type: 'Vessel', deletedAt: { $exists: false } });
    const pageSource = await content.findOne({ type: 'Page', deletedAt: { $exists: false } });
    const area = await content.findOne({ type: 'Section', deletedAt: { $exists: false } });
    const media = await db.collection('moe_media').findOne({ state: 'committed' });
    expect(vessel && pageSource && area && media).toBeTruthy();
    const now = new Date().toISOString();
    await content.insertMany([
      { ...vessel!, _id: 'Vessel:save-only-legacy', id: 'save-only-legacy', title: 'Older vessel record', titleTh: 'ข้อมูลเรือเดิม', image: media!.url, status: 'Draft', updatedAt: now, revision: 1 },
      { ...pageSource!, _id: 'Page:save-only-page', id: 'save-only-page', title: 'Older page record', titleTh: 'ข้อมูลหน้าเดิม', image: media!.url, status: 'Draft', updatedAt: now, revision: 1 },
      { ...area!, _id: 'Section:save-only-area', id: 'save-only-area', parentId: 'save-only-page', title: 'Older content area', titleTh: 'ส่วนเนื้อหาเดิม', image: media!.url, status: 'Draft', updatedAt: now, revision: 1 },
      { ...vessel!, _id: 'Vessel:save-only-trash', id: 'save-only-trash', title: 'Removed vessel record', titleTh: 'ข้อมูลเรือที่ลบแล้ว', image: media!.url, status: 'Draft', updatedAt: now, deletedAt: now, purgeAt: new Date(Date.now() + 86400000), revision: 1 },
    ]);
    const t = (value: string) => translateCms(locale, value);
    await login(page);
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('Dashboard'));
    await expect(page.getByText(t('Saved content'), { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: new RegExp('^' + t('New enquiries')) })).toBeVisible();
    await expectSaveOnlyInterface(page.locator('main'));

    for (const [path, heading] of [['fleet', 'Fleet'], ['routes', 'Routes'], ['projects', 'Projects'], ['services', 'Services'], ['news', 'News']] as const) {
      const loaded = page.waitForResponse(response => response.url().includes('/api/cms/content?type=') && response.status() === 200);
      await page.goto(`/cms/${path}`);
      await loaded;
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t(heading));
      const table = page.locator('section[aria-labelledby="content-heading"]');
      await expect(table.locator('tbody tr').first()).toBeVisible();
      await expect(table.getByRole('columnheader', { name: t('Status'), exact: true })).toHaveCount(0);
      await expectSaveOnlyInterface(table);
      if (path === 'fleet') {
        for (const width of [360, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
          await page.screenshot({ path: `test-results/save-only-fleet-${locale}-${width}.png`, fullPage: true });
        }
      }
      if (path === 'projects' || path === 'news') {
        const label = path === 'projects' ? 'Add project' : 'Add news';
        await page.getByRole('button', { name: t(label), exact: true }).click();
        const editor = page.getByRole('dialog', { name: t(label), exact: true });
        await expectSaveOnlyInterface(editor);
        await expect(editor.getByLabel(t('Date'), { exact: true })).toBeVisible();
        await expect(editor.getByLabel(/Publication date|วันที่เผยแพร่/)).toHaveCount(0);
        await editor.getByRole('button', { name: t('Cancel'), exact: true }).click();
      }
    }

    await page.goto('/cms/pages?page=save-only-page');
    await expect(page.getByRole('heading', { level: 2, name: locale === 'th' ? 'ข้อมูลหน้าเดิม' : 'Older page record', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: locale === 'th' ? 'ส่วนเนื้อหาเดิม' : 'Older content area', exact: true })).toBeVisible();
    await expectSaveOnlyInterface(page.locator('main'));
    await page.goto('/cms/trash');
    const trash = page.getByRole('region', { name: t('Trash items'), exact: true });
    await expect(trash).toContainText(locale === 'th' ? 'ข้อมูลเรือที่ลบแล้ว' : 'Removed vessel record');
    await expectSaveOnlyInterface(trash);
    await expect(trash.getByRole('columnheader', { name: t('Status'), exact: true })).toHaveCount(0);

    await page.goto('/cms/media');
    await page.getByRole('searchbox', { name: t('Search media library'), exact: true }).fill(String(media!.title));
    const image = page.getByRole('region', { name: t('Saved images'), exact: true }).locator('[class*="libraryGrid"] > div').filter({ hasText: String(media!.title) }).first();
    await image.getByRole('button', { name: t('Usage for {name}').replace('{name}', String(media!.title)), exact: true }).click();
    const usage = page.getByRole('dialog', { name: t('Where this image is used'), exact: true });
    await expect(usage).toContainText(locale === 'th' ? 'ข้อมูลเรือเดิม' : 'Older vessel record');
    await expect(usage).toContainText(locale === 'th' ? 'ข้อมูลเรือที่ลบแล้ว' : 'Removed vessel record');
    await expectSaveOnlyInterface(usage);
    expect(await content.countDocuments({ id: { $in: ['save-only-legacy', 'save-only-page', 'save-only-area', 'save-only-trash'] }, status: 'Draft' })).toBe(4);
  });
}

test('saving an older record makes only that item live immediately', async ({ page, context, db }) => {
  const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
  const source = await content.findOne({ type: 'Vessel', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  await content.insertMany(['save-only-edit', 'save-only-untouched'].map(id => ({
    ...source!, _id: `Vessel:${id}`, id, title: id, titleTh: 'ข้อมูลเรือเดิม', status: 'Draft', revision: 1,
  })));
  await refreshPublicCache();
  await login(page);
  const publicPage = await context.newPage();
  expect((await publicPage.goto('/fleet/save-only-edit'))?.status()).toBe(404);
  expect((await publicPage.goto('/fleet/save-only-untouched'))?.status()).toBe(404);
  await page.goto('/cms/fleet?edit=Vessel%3Asave-only-edit');
  const editor = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
  await expectSaveOnlyInterface(editor);
  await editor.getByLabel('Title · English', { exact: true }).fill('Saved existing vessel');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '“Saved existing vessel” saved.' })).toBeVisible();
  expect(await content.findOne({ id: 'save-only-edit' })).toMatchObject({ status: 'Published', revision: 2 });
  expect(await content.findOne({ id: 'save-only-untouched' })).toMatchObject({ status: 'Draft', revision: 1 });
  expect((await publicPage.goto('/fleet/save-only-edit'))?.status()).toBe(200);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('Saved existing vessel');
  expect((await publicPage.goto('/fleet/save-only-untouched'))?.status()).toBe(404);
});
