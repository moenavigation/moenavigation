import type { Db } from 'mongodb';
import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, assertOwnedDatabase, E2E_IMAGE_URL, refreshPublicCache } from './fixtures';

const routeCount = 126;
const connectionName = (number: number) => `Connection ${String(number).padStart(3, '0')}`;

async function manyRoutes(db: Db) {
  await assertOwnedDatabase(db);
  const records: ContentRecord[] = Array.from({ length: routeCount }, (_, index) => {
    const number = index + 1, portNumber = String(Math.floor(index / 2) + 1).padStart(3, '0');
    const bangkok = index % 2 === 1;
    const origin = { name: bangkok ? 'Bangkok' : 'Laem Chabang', nameTh: bangkok ? 'กรุงเทพ' : 'แหลมฉบัง', country: 'Thailand', countryTh: 'ไทย' };
    const destination = { name: `Port ${portNumber}`, nameTh: `ท่าเรือ ${portNumber}`, country: 'Vietnam', countryTh: 'เวียดนาม' };
    return {
      id: `connection-${String(number).padStart(3, '0')}`, type: 'Route', status: 'Published', revision: 1, order: index,
      title: connectionName(number), titleTh: `เส้นทาง ${String(number).padStart(3, '0')}`,
      description: `Synthetic connection from ${origin.name} to ${destination.name}.`, descriptionTh: `เส้นทางจำลองจาก${origin.nameTh}ไป${destination.nameTh}`,
      image: E2E_IMAGE_URL, imageAlt: 'Synthetic route', imageAltTh: 'เส้นทางทดสอบ', category: 'Regional', categoryTh: 'ภูมิภาค',
      origin, destination, waypoints: [[13, bangkok ? 100.1 : 100], [10 + Math.floor(index / 2) * .02, 104]],
    };
  });
  // This fixture owns an ephemeral loopback database. The real site database is never used.
  await db.collection('moe_content').deleteMany({ type: 'Route' });
  await db.collection('moe_content').insertMany(records.map(record => ({ _id: `Route:${record.id}`, ...record })) as never[]);
  await refreshPublicCache();
}

test('many routes stay paginated and shared destinations use one map control', async ({ page, db }) => {
  await manyRoutes(db);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/routes?from=removed-origin&to=removed-destination&route=connection-001&tracking=kept');
  const finder = page.getByRole('region', { name: 'Find a route', exact: true });
  const details = page.getByRole('region', { name: 'Selected route details', exact: true });
  await expect(finder.getByRole('radio')).toHaveCount(6);
  await expect(finder.getByRole('status')).toHaveText('126 routes');
  await expect(finder.getByRole('combobox', { name: 'Origin', exact: true })).toHaveValue('');
  await expect(finder.getByRole('combobox', { name: 'Destination', exact: true })).toHaveValue('');
  await expect(details.getByRole('heading')).toHaveText(connectionName(1));
  await expect(page.locator('[data-port-key]')).toHaveCount(3);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(4);

  await finder.getByRole('button', { name: 'Next routes', exact: true }).click();
  await expect(page).toHaveURL(/routePage=2/);
  expect(new URL(page.url()).searchParams.has('from')).toBe(false);
  expect(new URL(page.url()).searchParams.has('to')).toBe(false);
  expect(new URL(page.url()).searchParams.get('tracking')).toBe('kept');
  await expect(finder.getByRole('radio')).toHaveCount(6);
  await expect(finder.getByRole('radio').first()).toHaveValue('connection-007');
  await expect(details.getByRole('heading')).toHaveText(connectionName(1));
  await expect(finder.getByRole('button', { name: 'Show selected route in list' })).toBeVisible();
  // The selected connection remains visible alongside the current six results.
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(5);

  const groupedPort = page.getByRole('button', { name: '2 routes to Port 004', exact: true });
  await groupedPort.press('Enter');
  const routeChoices = page.getByRole('dialog', { name: '2 routes to Port 004', exact: true });
  await expect(routeChoices).toBeVisible();
  await expect(routeChoices.getByRole('button', { name: connectionName(7), exact: true })).toBeFocused();
  await page.getByRole('button', { name: connectionName(8), exact: true }).click();
  await expect(page).toHaveURL(/route=connection-008/);
  await expect(details.getByRole('heading')).toHaveText(connectionName(8));
  await expect(finder.getByRole('radio', { name: /Connection 008/ })).toBeChecked();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(4);
  await expect(routeChoices).not.toBeVisible();
  await expect(groupedPort).toBeFocused();

  await groupedPort.press('Enter');
  await expect(routeChoices).toBeVisible();
  await expect(routeChoices.getByRole('button', { name: connectionName(7), exact: true })).toBeFocused();
  await routeChoices.getByRole('button', { name: connectionName(7), exact: true }).press('Escape');
  await expect(routeChoices).not.toBeVisible();
  await expect(groupedPort).toBeFocused();

  await groupedPort.press('Enter');
  await expect(routeChoices).toBeVisible();
  await routeChoices.getByRole('button', { name: 'Close route choices', exact: true }).click();
  await expect(routeChoices).not.toBeVisible();
  await expect(groupedPort).toBeFocused();
});

test('bilingual search and port filters preserve selection through reload and language changes', async ({ page, db }) => {
  await manyRoutes(db);
  await page.goto('/routes');
  const finder = page.getByRole('region', { name: 'Find a route', exact: true });
  await finder.getByRole('combobox', { name: 'Origin', exact: true }).selectOption({ label: 'Bangkok · Thailand' });
  await finder.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Port 012 · Vietnam' });
  await finder.getByRole('searchbox', { name: 'Search routes', exact: true }).fill('ท่าเรือ 012');
  await expect(finder.getByRole('radio')).toHaveCount(1);
  await finder.getByRole('radio', { name: /Connection 024/ }).check();
  await expect(page.getByRole('region', { name: 'Selected route details' }).getByRole('heading')).toHaveText(connectionName(24));
  const before = new URL(page.url());
  expect(before.searchParams.get('route')).toBe('connection-024');
  expect(before.searchParams.get('q')).toBe('ท่าเรือ 012');
  expect(before.searchParams.get('from')).toBeTruthy();
  expect(before.searchParams.get('to')).toBeTruthy();

  await page.reload();
  await expect(finder.getByRole('searchbox')).toHaveValue('ท่าเรือ 012');
  await expect(finder.getByRole('radio', { name: /Connection 024/ })).toBeChecked();
  await page.getByRole('link', { name: 'Switch to Thai' }).click();
  const thaiFinder = page.getByRole('region', { name: 'ค้นหาเส้นทาง', exact: true });
  await expect(thaiFinder.getByRole('searchbox')).toHaveValue('ท่าเรือ 012');
  await expect(thaiFinder.getByRole('combobox', { name: 'ต้นทาง', exact: true })).toHaveValue(before.searchParams.get('from')!);
  await expect(thaiFinder.getByRole('combobox', { name: 'ปลายทาง', exact: true })).toHaveValue(before.searchParams.get('to')!);
  await expect(thaiFinder.getByRole('radio', { name: /เส้นทาง 024/ })).toBeChecked();

  await thaiFinder.getByRole('searchbox').fill('unmatched-route-result');
  await expect(thaiFinder.getByRole('heading', { name: 'ไม่พบเส้นทางที่ตรงกัน' })).toBeVisible();
  await expect(thaiFinder.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'รายละเอียดเส้นทางที่เลือก' }).getByRole('heading')).toHaveText('เส้นทาง 024');
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  await thaiFinder.getByRole('button', { name: 'แสดงเส้นทางที่เลือกในรายการ', exact: true }).click();
  await expect(thaiFinder.getByRole('searchbox')).toHaveValue('');
  await expect(thaiFinder.getByRole('radio', { name: /เส้นทาง 024/ })).toBeChecked();
  await expect(page).toHaveURL(/routePage=4/);
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  await thaiFinder.getByRole('searchbox').fill('another-unmatched-route');
  await thaiFinder.getByRole('button', { name: 'ล้างตัวกรองทั้งหมด', exact: true }).click();
  await expect(thaiFinder.getByRole('searchbox')).toBeFocused();
  await expect(thaiFinder.getByRole('radio')).toHaveCount(6);
  await expect(thaiFinder.getByRole('status')).toHaveText('126 เส้นทาง');
});

test.describe('mobile route explorer', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('route selection and the map shortcut remain usable with many results', async ({ page, db }) => {
    await manyRoutes(db);
    await page.goto('/routes?route=connection-003');
    const finder = page.getByRole('region', { name: 'Find a route', exact: true });
    await expect(finder.getByRole('radio')).toHaveCount(6);
    await finder.getByRole('radio', { name: /Connection 004/ }).check();
    await expect(page.getByRole('region', { name: 'Selected route details' }).getByRole('heading')).toHaveText(connectionName(4));
    await finder.getByRole('button', { name: 'View selected route on map', exact: true }).click();
    const map = page.getByRole('region', { name: 'Interactive map of an illustrative route from Bangkok to Port 002', exact: true });
    await expect(map).toBeInViewport();
    const mapBounds = await map.boundingBox();
    const headerBounds = await page.locator('[data-site-header]').boundingBox();
    expect(mapBounds!.y).toBeGreaterThanOrEqual(headerBounds!.height - 1);
    await expect(page.getByRole('button', { name: 'Fit selected route', exact: true })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'OpenStreetMap contributors', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(4);
  });
});
