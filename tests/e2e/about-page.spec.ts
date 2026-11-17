import type { ContentRecord, SiteSettings } from '../../src/lib/cms-types';
import { test, expect } from './fixtures';

const featureIds = ['about-safety', 'about-maintenance', 'about-crew', 'about-office'];

for (const viewport of [{ name: 'mobile', width: 320, height: 900 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  test.describe(`About page · ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    for (const locale of ['en', 'th'] as const) {
      test(`saved company story, six photographs and current contacts remain usable · ${locale}`, async ({ page, db }, testInfo) => {
        const records = await db.collection<ContentRecord>('moe_content').find({ status: 'Published', deletedAt: { $exists: false } }).toArray();
        const settings = await db.collection<SiteSettings & { _id: string }>('moe_settings').findOne({ _id: 'website' });
        const titleField = locale === 'en' ? 'title' : 'titleTh';
        const descriptionField = locale === 'en' ? 'description' : 'descriptionTh';
        const altField = locale === 'en' ? 'imageAlt' : 'imageAltTh';
        const prefix = locale === 'th' ? '/th' : '';
        await page.goto(`${prefix}/about`);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading', { level: 1 })).toHaveText(settings!.companyName);
        await expect(main.getByRole('heading', { level: 1 })).toContainText('Moe Navigation Co.,Ltd.');

        for (const id of ['about-intro', 'about-mission', 'about-vision', ...featureIds]) {
          const record = records.find(item => item.id === id && item.parentId === 'about');
          expect(record, `Saved About section ${id}`).toBeTruthy();
          const container = id === 'about-intro' ? main.locator('[aria-labelledby="about-story-title"]')
            : featureIds.includes(id) ? main.locator(`article#${id}`)
            : main.getByRole('region', { name: locale === 'en' ? 'Our mission and vision' : 'พันธกิจและวิสัยทัศน์ของเรา', exact: true });
          await expect(container.getByRole('heading', { name: record![titleField], exact: true })).toHaveCount(1);
          if (record![descriptionField]) await expect(container.getByText(record![descriptionField], { exact: true })).toBeVisible();
        }
        for (const id of featureIds) {
          const record = records.find(item => item.id === id && item.parentId === 'about')!;
          const feature = main.locator(`article#${id}`);
          const photo = feature.getByRole('img', { name: record[altField], exact: true });
          await photo.scrollIntoViewIfNeeded();
          await expect(photo).toBeInViewport();
          await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
          const photoBounds = await photo.boundingBox();
          const headingBounds = await feature.getByRole('heading').boundingBox();
          expect(photoBounds!.width).toBeGreaterThan(200);
          if (viewport.name === 'mobile') expect(headingBounds!.y).toBeGreaterThanOrEqual(photoBounds!.y + photoBounds!.height);
          else expect(Math.abs(headingBounds!.y - photoBounds!.y)).toBeLessThan(photoBounds!.height);
        }
        expect(await main.locator('img').count()).toBeGreaterThanOrEqual(6);
        await expect(main.getByText(/^0[1-4]$/)).toHaveCount(0);
        const illustratedHeadings = main.locator('h2:has(svg)');
        await expect(illustratedHeadings).toHaveCount(6);
        for (const heading of await illustratedHeadings.all()) {
          const icon = heading.locator('svg');
          await expect(icon).toHaveAttribute('aria-hidden', 'true');
          const iconBounds = await icon.boundingBox();
          const textBounds = await heading.locator('span').boundingBox();
          expect(iconBounds!.x + iconBounds!.width).toBeLessThan(textBounds!.x);
          expect(iconBounds!.y).toBeLessThan(textBounds!.y + Math.min(textBounds!.height, 48));
          expect(iconBounds!.width).toBeCloseTo(viewport.name === 'mobile' ? 24 : 28, 3);
        }

        const company = main.getByRole('region', { name: locale === 'en' ? 'Company details and contact' : 'ข้อมูลบริษัทและการติดต่อ', exact: true });
        await expect(company.getByRole('heading', { name: 'Moe Navigation Co.,Ltd.', exact: true })).toBeVisible();
        await expect(company.getByText(locale === 'en' ? settings!.officeAddress : settings!.officeAddressTh, { exact: true })).toBeVisible();
        await expect(company.locator('a[href^="tel:"]')).toHaveAttribute('href', `tel:${settings!.phone.replace(/[^+\d]/g, '')}`);
        await expect(company.locator('a[href^="mailto:"]')).toHaveAttribute('href', `mailto:${settings!.email}`);
        await expect(company.getByRole('link', { name: locale === 'en' ? 'Contact our team' : 'ติดต่อทีมงาน', exact: true })).toHaveAttribute('href', `${prefix}/contact`);
        await expect(main).not.toContainText(/Moe Container Line|THB 10,000,000|zero cargo loss|zero breakdowns/i);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`about-${locale}-${viewport.name}.png`), fullPage: true, animations: 'disabled' });
        await company.getByRole('link', { name: locale === 'en' ? 'Contact our team' : 'ติดต่อทีมงาน', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${prefix}/contact$`));
      });
    }
  });
}
