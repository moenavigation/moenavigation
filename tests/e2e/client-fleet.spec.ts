import { randomUUID } from 'node:crypto';
import type { ContentRecord } from '../../src/lib/cms-types';
import { fleetPhotos } from '../../src/lib/fleet-photos';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, loginChallengeData, refreshPublicCache } from './fixtures';

const vessels = [
  ['ranong-moe', 'RANONG MOE', 'ระนองโม', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-2', 'MOE LINE 2', 'โมไลน์ 2', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-3', 'MOE LINE 3', 'โมไลน์ 3', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-4', 'MOE LINE 4', 'โมไลน์ 4', 'Crane', 'เรือเครน'],
  ['moe-line-5', 'MOE LINE 5', 'โมไลน์ 5', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-6', 'MOE LINE 6', 'โมไลน์ 6', 'Container', 'เรือคอนเทนเนอร์'],
  ['moe-line-7', 'MOE LINE 7', 'โมไลน์ 7', 'Container', 'เรือคอนเทนเนอร์'],
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
      const photo = fleetPhotos[id as keyof typeof fleetPhotos][0];
      const imageDescription = locale === 'en' ? photo.alt : photo.altTh;
      await expect(cards.nth(index).getByRole('img')).toHaveAttribute('alt', imageDescription);
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

test('Thai mobile search opens the crane vessel and its corrected photo gallery without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/th/fleet');
  await page.screenshot({ path: testInfo.outputPath('fleet-mobile-th.png'), fullPage: true });
  await page.getByRole('searchbox', { name: 'ค้นหาเรือ' }).fill('โมไลน์ 4');
  await expect(page.getByRole('status')).toHaveText('1 ลำ');
  await page.getByRole('main').getByRole('link', { name: /โมไลน์ 4/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('โมไลน์ 4');
  const photograph = page.getByRole('img', { name: fleetPhotos['moe-line-4'][0].altTh, exact: true });
  await expect(photograph).toBeVisible();
  await expect.poll(() => photograph.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const galleryTrigger = page.getByRole('button', { name: 'เปิดแกลเลอรีภาพ', exact: true });
  await galleryTrigger.click();
  const gallery = page.getByRole('dialog');
  await expect(gallery).toBeVisible();
  await gallery.getByRole('button', { name: 'ภาพถัดไป', exact: true }).click();
  await expect(gallery).toContainText('2 / 2');
  await expect(gallery.getByRole('img')).toHaveAttribute('alt', fleetPhotos['moe-line-4'][1].altTh);
  await gallery.press('Escape');
  await expect(gallery).not.toBeVisible();
  await expect(galleryTrigger).toBeFocused();
  await page.getByRole('button', { name: 'แสดงภาพที่ 1', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fleet-detail-mobile-th.png'), fullPage: true });
  await page.getByRole('link', { name: 'กลับไปยังกองเรือ', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('โมไลน์ 4');
  expect(errors).toEqual([]);
});

test('CMS saves a vessel with no photo and immediately refreshes its public profile', async ({ request, page }) => {
  const headers = { origin: E2E_BASE_URL };
  expect((await request.post('/api/cms/login', { headers, data: { ...E2E_ADMIN, ...await loginChallengeData(request) } })).ok()).toBe(true);
  const records = (await (await request.get('/api/cms/content')).json()).records;
  const vessel = records.find((record: { id: string }) => record.id === 'dumai-moe');
  expect(vessel.image).toBeTruthy();
  expect(vessel.gallery).toHaveLength(0);
  await page.goto('/fleet/dumai-moe');
  const saved = await request.post('/api/cms/content', { headers, data: {
    record: { ...vessel, description: 'Updated tanker profile from the CMS.', image: '', imageAlt: '', imageAltTh: '', mobileImage: '', gallery: [] },
    expectedRevision: vessel.revision, submissionId: randomUUID(),
  } });
  expect(saved.status(), await saved.text()).toBe(200);
  await page.reload();
  await expect(page.getByText('Updated tanker profile from the CMS.', { exact: true })).toBeVisible();
  await expect(page.getByText('Vessel photo not yet available', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
});

test('historical vessel names appear in both languages before saving and later CMS name edits persist', async ({ page, db, request }) => {
  const records = db.collection<ContentRecord & { _id: string }>('moe_content');
  const key = { _id: 'Vessel:moe-line-2' };
  await records.updateOne(key, { $set: { title: 'MOE 2', titleTh: 'โม2', imageAlt: 'MOE 2 at the pier', imageAltTh: 'โม2 ที่ท่าเรือ' } });
  await refreshPublicCache();
  for (const [url, name] of [['/fleet/moe-line-2', 'MOE LINE 2'], ['/th/fleet/moe-line-2', 'โมไลน์ 2']]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  }
  const headers = { origin: E2E_BASE_URL };
  expect((await request.post('/api/cms/login', { headers, data: { ...E2E_ADMIN, ...await loginChallengeData(request) } })).ok()).toBe(true);
  async function find(q: string): Promise<ContentRecord[]> {
    const response = await request.get('/api/cms/content', { params: { type: 'Vessel', q } });
    expect(response.ok()).toBe(true);
    return (await response.json()).records;
  }
  async function save(record: ContentRecord): Promise<ContentRecord> {
    const response = await request.post('/api/cms/content', { headers, data: { record, expectedRevision: record.revision, submissionId: randomUUID() } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).record;
  }
  const [vessel] = await find('โมไลน์ 2');
  expect(vessel).toMatchObject({ id: 'moe-line-2', title: 'MOE LINE 2', titleTh: 'โมไลน์ 2', imageAlt: 'MOE LINE 2 at the pier', imageAltTh: 'โมไลน์ 2 ที่ท่าเรือ' });
  expect(await records.findOne(key)).toMatchObject({ title: 'MOE 2', titleTh: 'โม2', revision: vessel.revision });
  const published = await save({ ...vessel, body: 'Updated by the fleet officer.' });
  expect(await records.findOne(key)).toMatchObject({ title: 'MOE LINE 2', titleTh: 'โมไลน์ 2', body: 'Updated by the fleet officer.' });
  const renamed = await save({ ...published, title: 'Harbor Star', titleTh: 'ดาวท่าเรือ' });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ดาวท่าเรือ');
  expect(await find('MOE LINE 2')).toHaveLength(0);
  expect((await find('Harbor Star')).map(item => item.id)).toEqual(['moe-line-2']);
  await save({ ...renamed, title: 'MOE 2' });
  await page.goto('/fleet/moe-line-2');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MOE 2');
});
