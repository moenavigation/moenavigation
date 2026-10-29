import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, E2E_IMAGE_URL, refreshPublicCache } from './fixtures';

const customPage: ContentRecord = {
  id: 'e2e-company-information', type: 'Page', status: 'Published',
  title: 'Synthetic company information', titleTh: 'ข้อมูลบริษัทสำหรับทดสอบ',
  description: 'A custom page used only by the isolated browser suite.',
  descriptionTh: 'หน้าข้อมูลสำหรับการทดสอบเว็บไซต์ในระบบแยกเท่านั้น',
  body: 'Custom CMS pages remain available at their saved addresses.',
  bodyTh: 'หน้าที่สร้างในระบบจัดการเนื้อหายังคงเปิดได้จากที่อยู่ที่บันทึกไว้',
  image: E2E_IMAGE_URL, category: 'Company', categoryTh: 'บริษัท',
  revision: 1, updatedAt: '2026-01-01T00:00:00.000Z',
};

test('the conventional favicon URL returns a complete icon instead of an HTML page', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\/(?:x-icon|vnd\.microsoft\.icon)(?:;|$)/);
  const icon = await response.body();
  expect(icon.length).toBeGreaterThan(22);
  expect(icon.readUInt16LE(0)).toBe(0);
  expect(icon.readUInt16LE(2)).toBe(1);
  const imageCount = icon.readUInt16LE(4);
  expect(imageCount).toBeGreaterThan(0);
  const directoryEnd = 6 + imageCount * 16;
  expect(icon.length).toBeGreaterThan(directoryEnd);
  for (let index = 0; index < imageCount; index++) {
    const entry = 6 + index * 16;
    const length = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    expect(length).toBeGreaterThan(0);
    expect(offset).toBeGreaterThanOrEqual(directoryEnd);
    expect(offset + length).toBeLessThanOrEqual(icon.length);
  }
});

test('malformed asset and content identifiers return localized 404 pages', async ({ request, page, db }) => {
  // A stale malformed fixture must never become a routable page. This makes
  // the test detect a missing URL guard even when MongoDB is healthy.
  await db.collection<ContentRecord & { _id: string }>('moe_content').insertOne({
    ...customPage, _id: 'Page:legacy-asset.png', id: 'legacy-asset.png',
  });
  const paths = [
    '/legacy-asset.png', '/th/legacy-asset.png', '/missing-image.png',
    '/th/missing-stylesheet.css', '/fleet/not_a_slug', '/th/fleet/not--a-slug',
    '/Fleet', '/fleet/' + 'a'.repeat(101),
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/legacy-asset.png');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.goto('/th/legacy-asset.png');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ไม่พบหน้านี้');
  expect(errors).toEqual([]);
});

test('valid custom CMS page identifiers still render and switch between both languages', async ({ page, db }) => {
  await db.collection<ContentRecord & { _id: string }>('moe_content').insertOne({
    _id: 'Page:' + customPage.id, ...customPage,
  });
  await refreshPublicCache();
  expect((await page.goto('/' + customPage.id))?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(customPage.title);
  await expect(page.getByText(customPage.body!, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle(customPage.title + ' | MOE Navigation');
  await page.getByRole('link', { name: 'Switch to Thai' }).click();
  await expect(page).toHaveURL(new RegExp('/th/' + customPage.id + '$'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(customPage.titleTh);
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.getByText(customPage.bodyTh!, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page).toHaveTitle(customPage.titleTh + ' | MOE Navigation');
});
