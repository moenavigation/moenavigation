import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, login } from './fixtures';
import type { ContentDocument } from '../../src/server/db';
import { translateCms } from '../../src/lib/cms-locale';

const marker = 'Attention review marker';

test.beforeEach(async ({ db }) => {
  const content = db.collection<ContentDocument>('moe_content');
  const source = await content.findOne({ type: 'News', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  const now = new Date().toISOString();
  await content.insertMany(Array.from({ length: 15 }, (_, index): ContentDocument => {
    const suffix = String(index).padStart(2, '0');
    const id = `attention-review-${suffix}`;
    return { ...source!, _id: `News:${id}`, id, title: `${marker} ${suffix}`, titleTh: '', description: 'A dashboard review fixture.', descriptionTh: 'ข้อมูลสำหรับทดสอบการตรวจสอบเนื้อหา', image: '', updatedAt: now, revision: 1 };
  }));
});

test.describe('desktop attention review', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('attention searches the full collection, filters and paginates before opening the existing editor', async ({ page }) => {
    await login(page);
    const opener = page.getByRole('button', { name: /^Attention/ });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Content needing attention', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox', { name: 'Search content needing attention', exact: true }).fill(marker);
    await dialog.getByLabel('Content type', { exact: true }).selectOption('News');
    await dialog.getByLabel('Needs attention', { exact: true }).selectOption('image');
    const edits = dialog.getByRole('button', { name: new RegExp(`^Edit ${marker}`) });
    await expect(dialog.getByRole('status')).toHaveText('Showing 12 of 15 items needing attention');
    await expect(edits).toHaveCount(12);
    await expect(dialog.getByText('Add a main image', { exact: true })).toHaveCount(12);
    await expect(dialog.getByText('Complete English and Thai text', { exact: true })).toHaveCount(12);
    await dialog.getByRole('button', { name: 'Load more content', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Showing 15 of 15 items needing attention');
    await expect(edits).toHaveCount(15);
    const labels = await edits.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
    expect(new Set(labels).size).toBe(15);
    await expect(dialog.getByRole('button', { name: 'Load more content', exact: true })).toHaveCount(0);

    await dialog.getByRole('searchbox').fill('No such attention fixture');
    await expect(dialog.getByRole('heading', { name: 'No matching items', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(dialog.getByRole('searchbox')).toHaveValue('');
    await expect(dialog.getByLabel('Content type', { exact: true })).toHaveValue('All');
    await expect(dialog.getByLabel('Needs attention', { exact: true })).toHaveValue('All');

    await dialog.getByRole('searchbox').fill(marker);
    await expect(edits).toHaveCount(12);
    const title = (await edits.first().getAttribute('aria-label'))!.replace(/^Edit /, '');
    await edits.first().click();
    await expect(dialog).not.toBeVisible();
    const editor = page.getByRole('dialog', { name: 'Edit news', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Title · English', exact: true })).toHaveValue(title);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await opener.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
});

test.describe('mobile attention review', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the large review dialog fits English and Thai and Escape returns focus', async ({ page }, testInfo) => {
    await login(page);
    for (const locale of ['en', 'th'] as const) {
      if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
      const t = (key: string) => translateCms(locale, key);
      const opener = page.getByRole('button', { name: new RegExp(`^${t('Attention')}`) });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: t('Content needing attention'), exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('searchbox', { name: t('Search content needing attention'), exact: true }).fill(marker);
      await expect(dialog.getByRole('status')).toHaveText(t('Showing {count} of {total} items needing attention').replace('{count}', '12').replace('{total}', '15'));
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      const screenshot = testInfo.outputPath(`attention-${locale}-mobile.png`);
      await page.screenshot({ path: screenshot, animations: 'disabled' });
      const folder = path.resolve('docs/screenshots');
      await mkdir(folder, { recursive: true });
      await copyFile(screenshot, path.join(folder, `cms-attention-${locale}-mobile-${testInfo.project.name}.png`));
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
    }
  });
});
