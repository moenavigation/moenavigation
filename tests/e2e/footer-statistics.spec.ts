import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, login, refreshPublicCache } from './fixtures';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 900 }]) {
  test.describe(`Footer statistics · ${viewport.width}`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });
    test('footer exposes bilingual navigation, the published fleet and visible office details', async ({ page, db }, testInfo) => {
      test.slow();
      const mapUrl = 'https://maps.google.com/?q=Synthetic+E2E+office';
      await db.collection('moe_settings').updateOne({}, { $set: { mapUrl, companyNameTh: 'บริษัทเดินเรือตัวอย่าง' } });
      await db.collection('moe_content').updateOne({ type: 'Vessel', id: 'moe-line-3' }, { $set: { status: 'Draft' } });
      await db.collection('moe_content').updateOne({ type: 'Vessel', id: 'moe-line-2' }, { $set: { deletedAt: new Date().toISOString() } });
      await refreshPublicCache();
      const vessels = await db.collection<ContentRecord>('moe_content').find({ type: 'Vessel', status: 'Published', deletedAt: { $exists: false } }).sort({ order: 1, id: 1 }).toArray();
      expect(vessels).toHaveLength(6);
      for (const locale of ['en', 'th'] as const) {
        const thai = locale === 'th';
        const prefix = thai ? '/th' : '';
        const routes = ['', '/about', '/services', '/fleet', '/routes', '/projects', '/news', '/contact', '/privacy', '/services/vessel-services', `/fleet/${vessels[0].id}`, '/projects/bunkering-operation', '/news/connected-ports'];
        for (const route of routes) {
          await page.goto(`${prefix}${route}` || '/', { waitUntil: 'domcontentloaded' });
          const footer = page.getByRole('contentinfo');
          const fleet = footer.getByRole('navigation', { name: thai ? 'กองเรือของเรา' : 'Our fleet', exact: true }).getByRole('link');
          await expect(fleet).toHaveText(vessels.map(vessel => thai ? vessel.titleTh : vessel.title));
          expect(await fleet.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(vessels.map(vessel => `${prefix}/fleet/${vessel.id}`));
          await expect(footer.locator('dd').first()).toHaveText(String(vessels.length));
        }
        const footer = page.getByRole('contentinfo');
        const navigation = footer.getByRole('navigation', { name: thai ? 'เมนูเว็บไซต์' : 'Navigation', exact: true }).getByRole('link');
        await expect(navigation).toHaveText(thai ? ['หน้าแรก', 'เกี่ยวกับเรา', 'บริการ', 'กองเรือ', 'เส้นทาง', 'ติดต่อเรา'] : ['Home', 'About Us', 'Services', 'Fleet', 'Routes', 'Contact Us']);
        expect(await navigation.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['', '/about', '/services', '/fleet', '/routes', '/contact'].map(path => `${prefix}${path}` || '/'));
        await expect(footer.getByText(thai ? /ให้บริการเช่าเรือคอนเทนเนอร์ เรือเครน/ : /Full-vessel chartering for container ships/)).toBeVisible();
        await expect(footer.getByText(thai ? 'บริษัทเดินเรือตัวอย่าง' : 'Moe Navigation Co., Ltd.', { exact: true })).toBeVisible();
        const office = footer.getByRole('region', { name: thai ? 'ติดต่อเรา' : 'Contact', exact: true });
        await expect(office.getByText(thai ? 'สำนักงานทดสอบ E2E' : 'Synthetic E2E office')).toBeVisible();
        await expect(office.locator('a[href="tel:+66000000000"]')).toContainText('+66000000000');
        await expect(office.locator('a[href="mailto:contact@example.test"]')).toContainText('contact@example.test');
        await expect(office.getByRole('link', { name: thai ? /แผนที่สำนักงาน/ : /Office map/ })).toHaveAttribute('href', mapUrl);
        await expect(office.getByRole('link', { name: thai ? 'ส่งข้อความสอบถาม' : 'Send an enquiry' })).toHaveAttribute('href', `${prefix}/contact#contact-form`);
        await expect(footer.getByRole('link', { name: thai ? 'นโยบายความเป็นส่วนตัว' : 'Privacy policy' })).toHaveAttribute('href', `${prefix}/privacy`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await footer.screenshot({ path: testInfo.outputPath(`footer-directory-${locale}.png`), animations: 'disabled' });
      }
    });

    test('CMS edits preserve automatic Fleet count and save the other bilingual figures', async ({ page }, testInfo) => {
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
        { label: 'Fixture fleet', labelTh: 'กองเรือตัวอย่าง', value: '8' },
        { label: 'Fixture cargo', labelTh: 'สินค้าตัวอย่าง', value: '12,345' },
        { label: 'Fixture crew', labelTh: 'ลูกเรือตัวอย่าง', value: '88' },
        { label: 'Fixture voyages', labelTh: 'เที่ยวเรือตัวอย่าง', value: '1,234' },
      ];
      for (let index = 0; index < expected.length; index++) {
        if (index === 0) await expect(cards.nth(index).getByLabel('Displayed value', { exact: true })).toHaveCount(0);
        else await cards.nth(index).getByLabel('Displayed value', { exact: true }).fill(expected[index].value);
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
      await expect(editor.getByLabel('Displayed value', { exact: true }).nth(0)).toHaveValue('12,345');
      await editor.getByLabel('Displayed value', { exact: true }).nth(0).fill('');
      const cleared = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      expect((await cleared).status()).toBe(200);
      await page.goto('/about');
      const updated = page.getByRole('contentinfo').getByRole('region', { name: 'Company at a glance', exact: true });
      await expect(updated.locator('dd')).toHaveText(['8', '88', '1,234']);
      await expect(updated.getByText('Fixture cargo', { exact: true })).toHaveCount(0);
    });
  });
}
