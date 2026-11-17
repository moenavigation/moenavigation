import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, login } from './fixtures';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 900 }]) {
  test.describe(`Footer statistics · ${viewport.width}`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });
    test('CMS edits save all four bilingual figures and blank values hide their cards', async ({ page }, testInfo) => {
      await page.goto('/about');
      const footer = page.getByRole('contentinfo');
      const statistics = footer.getByRole('region', { name: 'Company at a glance', exact: true });
      await statistics.scrollIntoViewIfNeeded();
      await expect(statistics.locator('dd')).toHaveText(['8', '15,559', '89', '1,119']);
      await expect(statistics.locator('dt')).toHaveText(['Fleet', 'Annual Carried Volume', 'Skilled Crew', 'Annual Voyages']);
      await expect(statistics.getByRole('link', { name: 'Explore our fleet', exact: true })).toHaveAttribute('href', '/fleet');
      await page.screenshot({ path: testInfo.outputPath('footer-default.png'), fullPage: false, animations: 'disabled' });

      await login(page);
      await page.goto('/cms/pages?page=shared');
      await page.getByRole('button', { name: 'Edit Footer and statistics', exact: true }).click();
      let editor = page.getByRole('dialog', { name: 'Edit content', exact: true });
      const cards = editor.getByRole('region', { name: 'Footer statistics', exact: true }).getByRole('group');
      await expect(cards).toHaveCount(4);
      const expected = [
        { label: 'Fixture fleet', labelTh: 'กองเรือตัวอย่าง', value: '9' },
        { label: 'Fixture cargo', labelTh: 'สินค้าตัวอย่าง', value: '12,345' },
        { label: 'Fixture crew', labelTh: 'ลูกเรือตัวอย่าง', value: '88' },
        { label: 'Fixture voyages', labelTh: 'เที่ยวเรือตัวอย่าง', value: '1,234' },
      ];
      for (let index = 0; index < expected.length; index++) {
        await cards.nth(index).getByLabel('Displayed value', { exact: true }).fill(expected[index].value);
        await cards.nth(index).getByLabel('Label · English', { exact: true }).fill(expected[index].label);
        await cards.nth(index).getByLabel('Label · Thai', { exact: true }).fill(expected[index].labelTh);
      }
      expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const saved = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      const response = await saved;
      expect(response.status(), await response.text()).toBe(200);
      const record = (await response.json()).record as ContentRecord;
      expect(record.footerStats).toEqual(expected);
      for (const locale of ['en', 'th'] as const) {
        await page.goto(`${locale === 'th' ? '/th' : ''}/about`);
        const figures = page.getByRole('contentinfo').getByRole('region', { name: locale === 'en' ? 'Company at a glance' : 'ข้อมูลบริษัทโดยสรุป', exact: true });
        await figures.scrollIntoViewIfNeeded();
        await expect(figures.locator('dt')).toHaveText(expected.map(item => locale === 'en' ? item.label : item.labelTh));
        await expect(figures.locator('dd')).toHaveText(expected.map(item => item.value));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`footer-four-${locale}.png`), fullPage: false, animations: 'disabled' });
      }
      await page.goto('/cms/pages?page=shared');
      await page.getByRole('button', { name: 'Edit Footer and statistics', exact: true }).click();
      editor = page.getByRole('dialog', { name: 'Edit content', exact: true });
      await expect(editor.getByLabel('Displayed value', { exact: true }).nth(1)).toHaveValue('12,345');
      await editor.getByLabel('Displayed value', { exact: true }).nth(1).fill('');
      const cleared = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      expect((await cleared).status()).toBe(200);
      await page.goto('/about');
      const updated = page.getByRole('contentinfo').getByRole('region', { name: 'Company at a glance', exact: true });
      await expect(updated.locator('dd')).toHaveText(['9', '88', '1,234']);
      await expect(updated.getByText('Fixture cargo', { exact: true })).toHaveCount(0);
    });
  });
}
