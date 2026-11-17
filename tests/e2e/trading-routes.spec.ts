import type { Locator } from '@playwright/test';
import { legacyTradingRouteRecords } from '../../scripts/data/legacy-trading-routes';
import { googleMapsPointUrl } from '../../src/lib/google-maps';
import { test, expect } from './fixtures';

const sourceMetrics = [
  { id: 'bkk-lcb', distance: 58, sailing: '8–10' },
  { id: 'bkk-lcb-suratthani', distance: 261, sailing: null },
  { id: 'bkk-lcb-songkhla', distance: 361, sailing: '52–54' },
  { id: 'ranong-yangon', distance: 459, sailing: '65' },
  { id: 'lcb-sihanoukville', distance: 248, sailing: '31–33' },
] as const;

function exact(value: string) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function metricValue(details: Locator, label: string) {
  return details.locator('dt').filter({ hasText: exact(label) }).locator('xpath=following-sibling::dd');
}

for (const viewport of [{ name: 'mobile', width: 320, height: 1000 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  test.describe(`trading routes · ${viewport.name}`, () => {
    // Keep viewport creation outside the running test. Windows Firefox may hang
    // when its window is repeatedly resized after navigation.
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    for (const locale of ['en', 'th'] as const) {
      test(`five source routes show bilingual voyage details and a usable contact menu · ${locale}`, async ({ page, db }, testInfo) => {
        test.setTimeout(120_000);
        const prefix = locale === 'th' ? '/th' : '';
        await page.goto(`${prefix}/routes`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'en' ? 'Trading Routes' : 'เส้นทางการเดินเรือ');
        const finder = page.getByRole('region', { name: locale === 'en' ? 'Find a route' : 'ค้นหาเส้นทาง', exact: true });
        const details = page.getByRole('region', { name: locale === 'en' ? 'Selected route details' : 'รายละเอียดเส้นทางที่เลือก', exact: true });
        await expect(finder.getByRole('radio')).toHaveCount(5);
        await expect(finder.getByRole('status')).toHaveText(locale === 'en' ? '5 routes' : '5 เส้นทาง');

        for (const item of sourceMetrics) {
          const source = legacyTradingRouteRecords.find(route => route.id === item.id)!;
          const title = locale === 'en' ? source.title : source.titleTh;
          await finder.locator(`input[type="radio"][value="${item.id}"]`).click();
          const selectedMap = page.locator('.leaflet-container');
          await expect(selectedMap).toBeInViewport();
          const header = await page.locator('[data-site-header]').boundingBox();
          await expect.poll(async () => (await selectedMap.boundingBox())!.y).toBeGreaterThanOrEqual(header!.height - 1);
          await expect.poll(async () => (await selectedMap.boundingBox())!.y).toBeLessThan(header!.height + 40);
          await expect(finder.locator(`input[type="radio"][value="${item.id}"]`)).toBeChecked();
          await expect(details.getByRole('heading')).toHaveText(title);
          await expect(metricValue(details, locale === 'en' ? 'Route distance' : 'ระยะทาง')).toHaveText(`${item.distance} ${locale === 'en' ? 'NM' : 'ไมล์ทะเล'}`);
          await expect(metricValue(details, locale === 'en' ? 'Container capacity' : 'ความจุตู้คอนเทนเนอร์')).toHaveText('72–120 TEU');
          const sailing = metricValue(details, locale === 'en' ? 'Sailing time' : 'เวลาเดินเรือ');
          if (item.sailing === null) {
            await expect(sailing).toContainText('—');
            await expect(sailing).toContainText(locale === 'en' ? 'Not provided' : 'ยังไม่มีข้อมูล');
            await expect(sailing).not.toContainText(/\d/);
          } else await expect(sailing).toHaveText(`${item.sailing} ${locale === 'en' ? 'hrs' : 'ชม.'}`);

          const origin = details.getByRole('link', { name: locale === 'en' ? /^Open origin port in Google Maps:/ : /^เปิดท่าเรือต้นทางใน Google Maps:/ });
          const destination = details.getByRole('link', { name: locale === 'en' ? /^Open destination port in Google Maps:/ : /^เปิดท่าเรือปลายทางใน Google Maps:/ });
          await expect(origin).toHaveAttribute('href', googleMapsPointUrl(...source.waypoints![0]));
          await expect(destination).toHaveAttribute('href', googleMapsPointUrl(...source.waypoints!.at(-1)!));
          await expect(origin).toHaveAttribute('rel', 'noopener noreferrer');
          await expect(destination).toHaveAttribute('target', '_blank');
          await expect(details.getByRole('link', { name: locale === 'en' ? 'Enquire about this route' : 'สอบถามเกี่ยวกับเส้นทางนี้', exact: true })).toHaveAttribute('href', `${prefix}/contact?subject=${encodeURIComponent(title)}`);
          await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        }

        // A source conflict stays blank after a reload, and route choice remains
        // reflected in the URL rather than reverting to an arbitrary default.
        await finder.locator('input[value="bkk-lcb-suratthani"]').click();
        await page.reload();
        await expect(finder.locator('input[value="bkk-lcb-suratthani"]')).toBeChecked();
        await expect(metricValue(details, locale === 'en' ? 'Sailing time' : 'เวลาเดินเรือ')).toContainText('—');
        await expect(page.getByRole('link', { name: 'OpenStreetMap contributors', exact: true })).toBeVisible();

        const settings = await db.collection('moe_settings').findOne({});
        await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
        const fab = page.locator('[data-contact-fab]');
        const contactTrigger = fab.getByRole('button');
        await expect(contactTrigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await contactTrigger.click();
        const menu = fab.getByRole('navigation', { name: locale === 'en' ? 'Contact options' : 'เลือกช่องทางติดต่อ', exact: true });
        await expect(menu).toBeVisible();
        await expect(contactTrigger).toHaveAttribute('aria-expanded', 'true');
        await expect(contactTrigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await contactTrigger.click();
        await expect(menu).not.toBeVisible();
        await expect(contactTrigger).toHaveAttribute('aria-expanded', 'false');
        await expect(contactTrigger).toBeFocused();
        await contactTrigger.click();
        await expect(menu).toBeVisible();
        expect(await menu.evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
        const rectangles = await menu.getByRole('link').evaluateAll(elements => elements.map(element => {
          const bounds = element.getBoundingClientRect();
          return { top: bounds.top, bottom: bounds.bottom, right: bounds.right };
        }));
        for (let index = 1; index < rectangles.length; index++) {
          expect(rectangles[index].top).toBeGreaterThanOrEqual(rectangles[index - 1].bottom - 1);
          expect(Math.abs(rectangles[index].right - rectangles[0].right)).toBeLessThanOrEqual(1);
        }
        expect(await menu.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.left >= -1 && bounds.right <= innerWidth + 1; })).toBe(true);
        if (settings?.email) {
          const email = menu.locator('a[href^="mailto:"]');
          await expect(email).toHaveAttribute('href', `mailto:${settings.email}`);
          await expect(email).toContainText(settings.email);
          if (viewport.name === 'desktop') {
            expect(await email.locator('[class*="itemDetail"]').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; })).toBe(1);
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`trading-routes-${locale}-${viewport.name}-contact-open.png`), fullPage: true, animations: 'disabled' });
        await menu.press('Escape');
        await expect(menu).not.toBeVisible();
        await expect(contactTrigger).toBeFocused();
      });
    }
  });
}
