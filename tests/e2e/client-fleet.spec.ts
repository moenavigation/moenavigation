import { randomUUID } from 'node:crypto';
import { test, expect, E2E_ADMIN, E2E_BASE_URL } from './fixtures';

const vessels = [
  ['ranong-moe', 'RANONG MOE', 'ระนองโม', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-2', 'MOE 2', 'โม2', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-3', 'MOE 3', 'โม3', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-4', 'MOE 4', 'โม4', 'Crane', 'เรือเครน'],
  ['moe-line-5', 'MOE 5', 'โม5', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-6', 'MOE 6', 'โม6', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-7', 'MOE 7', 'โม7', 'Container', 'เรือคอนเทนเนอร์'],
  ['dumai-moe', 'DUMAI MOE', 'Dumai Moe', 'Tanker', 'เรือแทงเกอร์'],
];

test('confirmed fleet names, categories, order and all detail URLs work in both languages', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const locale of ['en', 'th']) {
    const prefix = locale === 'th' ? '/th' : '';
    await page.goto(`${prefix}/fleet`);
    const cards = page.locator(`main a[href^="${prefix}/fleet/"]`);
    await expect(cards).toHaveCount(8);
    for (let index = 0; index < vessels.length; index++) {
      const [id, en, th, category, categoryTh] = vessels[index];
      await expect(cards.nth(index)).toHaveAttribute('href', `${prefix}/fleet/${id}`);
      await expect(cards.nth(index)).toContainText(locale === 'en' ? en : th);
      await expect(cards.nth(index)).toContainText(locale === 'en' ? category : categoryTh);
      const response = await request.get(`${prefix}/fleet/${id}`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toMatch(new RegExp(`<h1[^>]*>${locale === 'en' ? en : th}</h1>`));
      expect(html).not.toContain('Demo listing with illustrative imagery');
      expect(html).not.toContain('src=""');
    }
    await page.screenshot({ path: testInfo.outputPath(`fleet-desktop-${locale}.png`), fullPage: true });
    for (const [category, categoryTh, count] of [['Container', 'เรือคอนเทนเนอร์', 6], ['Crane', 'เรือเครน', 1], ['Tanker', 'เรือแทงเกอร์', 1]] as const) {
      await page.getByRole('button', { name: locale === 'en' ? category : categoryTh, exact: true }).click();
      await expect(cards).toHaveCount(count);
    }
  }
});

test('Thai mobile search opens the new crane vessel without broken photos or overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/th/fleet');
  await page.screenshot({ path: testInfo.outputPath('fleet-mobile-th.png'), fullPage: true });
  await page.getByRole('searchbox', { name: 'ค้นหาเรือ' }).fill('โม4');
  await expect(page.getByRole('status')).toHaveText('1 ลำ');
  await page.getByRole('main').getByRole('link', { name: /โม4/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('โม4');
  await expect(page.getByText('ยังไม่มีภาพเรือลำนี้', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /gallery|แกลเลอรี/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fleet-detail-mobile-th.png'), fullPage: true });
  await page.getByRole('link', { name: 'กลับไปยังกองเรือ', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('โม4');
  expect(errors).toEqual([]);
});

test('CMS saves a vessel with no photo and immediately refreshes its public profile', async ({ request, page }) => {
  const headers = { origin: E2E_BASE_URL };
  expect((await request.post('/api/cms/login', { headers, data: E2E_ADMIN })).ok()).toBe(true);
  const records = (await (await request.get('/api/cms/content')).json()).records;
  const vessel = records.find((record: { id: string }) => record.id === 'dumai-moe');
  expect(vessel.image).toBe('');
  expect(vessel.gallery).toEqual([]);
  await page.goto('/fleet/dumai-moe');
  const saved = await request.post('/api/cms/content', { headers, data: {
    record: { ...vessel, description: 'Updated tanker profile from the CMS.' },
    expectedRevision: vessel.revision, submissionId: randomUUID(),
  } });
  expect(saved.status(), await saved.text()).toBe(200);
  await page.reload();
  await expect(page.getByText('Updated tanker profile from the CMS.', { exact: true })).toBeVisible();
  await expect(page.getByText('Vessel photo not yet available', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
});
