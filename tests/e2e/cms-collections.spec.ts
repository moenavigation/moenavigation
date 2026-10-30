import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { cmsMainThai } from '../../src/lib/cms-main-th';
import { cmsFieldsThai } from '../../src/lib/cms-fields-th';
import { test, expect, login } from './fixtures';

const collections = [
  { type: 'Vessel', view: 'fleet', name: 'vessel' },
  { type: 'Route', view: 'routes', name: 'route' },
  { type: 'Project', view: 'projects', name: 'project' },
  { type: 'Service', view: 'services', name: 'service' },
  { type: 'News', view: 'news', name: 'news' },
] as const;
type Collection = typeof collections[number];

async function showField(editor: Locator, label: string) {
  const field = editor.getByLabel(label, { exact: true });
  for (const group of await field.locator('xpath=ancestor::details').all()) {
    if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').click();
  }
  await expect(field).toBeVisible();
  return field;
}

async function openNew(page: Page, collection: Collection) {
  await page.goto(`/cms/${collection.view}`);
  await page.getByRole('button', { name: `Add ${collection.name}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: `Add ${collection.name}`, exact: true });
  await expect(editor).toBeVisible();
  for (const label of ['Content type', 'URL identifier', 'Display order', 'Parent page', 'Icon']) {
    await expect(editor.getByLabel(new RegExp(`^${label}`))).toHaveCount(0);
  }
  return editor;
}

async function fillCore(editor: Locator, collection: Collection, title: string, category = 'Custom category') {
  for (const language of ['English', 'Thai']) {
    await (await showField(editor, `Title · ${language}`)).fill(language === 'English' ? title : `ชื่อภาษาไทย ${title}`);
    await editor.getByLabel(`Summary · ${language}`, { exact: true }).fill(language === 'English' ? 'Saved bilingual collection description.' : 'รายละเอียดภาษาไทยสำหรับรายการนี้');
    if (['Vessel', 'Project', 'News'].includes(collection.type)) {
      const label = collection.type === 'Vessel' ? 'Vessel type' : 'Category';
      await editor.getByLabel(`${label} · ${language}`, { exact: true }).fill(language === 'English' ? category : 'หมวดหมู่ที่กำหนดเอง');
    }
  }
}

async function chooseImage(editor: Locator, title: string) {
  await editor.getByRole('button', { name: 'Browse library for main image', exact: true }).click();
  await editor.getByRole('searchbox', { name: 'Search library for main image' }).fill(title);
  await editor.getByRole('button', { name: title, exact: true }).click();
}

async function save(page: Page, editor: Locator): Promise<ContentRecord> {
  const pending = page.waitForResponse(response => response.url().endsWith('/api/cms/content') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  return (await response.json()).record;
}

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

test.describe('mobile image picker', () => {
test.use({ viewport: { width: 390, height: 844 } });
test('Browse library shows 12 images per page and searches older images', async ({ page, db }) => {
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  await db.collection<{ _id: string }>('moe_media').insertMany(Array.from({ length: 55 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `picker-test-${number}`;
    return {
      _id: id, id, title: `Picker test image ${number}`, url: `${source!.url}?picker=${number}`,
      publicId: `moe-e2e/${id}`, state: 'committed', owner: source!.owner,
      submissionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      pinned: true, createdAt: new Date(Date.now() + (index + 1) * 1000).toISOString(),
      touchedAt: new Date(), bytes: source!.bytes,
    };
  }));
  await login(page);
  const editor = await openNew(page, collections[0]);
  await editor.getByRole('button', { name: 'Browse library for main image', exact: true }).click();
  const choices = editor.locator('[class*="imagePicker"] > button');
  await expect(choices).toHaveCount(12);
  await expect(editor.getByRole('button', { name: 'Picker test image 01', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Next images', exact: true }).click();
  await expect(choices).toHaveCount(12);
  await editor.getByRole('button', { name: 'Previous images', exact: true }).click();
  await expect(editor.getByText('Page 1 of 5', { exact: true })).toBeVisible();
  const search = editor.getByRole('searchbox', { name: 'Search library for main image' });
  await search.fill('Picker test image 01');
  await expect(editor.getByRole('button', { name: 'Picker test image 01', exact: true })).toBeVisible();
  await expect(choices).toHaveCount(1);
  await editor.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(choices).toHaveCount(12);
  await expect(editor.getByText(/^Page 1 of \d+$/)).toBeVisible();
  await expect.poll(() => editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
});

test('each collection creates through its own simple bilingual editor and the real API', async ({ page, db }) => {
  test.setTimeout(120_000);
  await login(page);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  for (const collection of collections) {
    const title = `Created ${collection.name} from the simple editor`;
    const editor = await openNew(page, collection);
    await fillCore(editor, collection, title);
    if (collection.type !== 'Vessel') await chooseImage(editor, String(media!.title));
    if (collection.type === 'Service' || collection.type === 'Route') {
      await expect(editor.getByLabel(/^Category ·/)).toHaveCount(0);
    }
    const saved = await save(page, editor);
    expect(saved).toMatchObject({ type: collection.type, title, titleTh: `ชื่อภาษาไทย ${title}`, description: 'Saved bilingual collection description.', descriptionTh: 'รายละเอียดภาษาไทยสำหรับรายการนี้', status: 'Published', revision: 1 });
    expect(saved.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(saved.id.length).toBeLessThanOrEqual(100);
    expect((await records(page)).find(record => record.type === collection.type && record.title === title)).toEqual(saved);
    if (['Vessel', 'Project', 'News'].includes(collection.type)) expect(saved).toMatchObject({ category: 'Custom category', categoryTh: 'หมวดหมู่ที่กำหนดเอง' });
    else expect(saved.category).toBeTruthy();
    if (collection.type !== 'Vessel') expect(saved.image).toBe(media!.url);
    else expect(saved.image).toBe('');
  }
});

test('duplicate non-ASCII names get distinct valid automatic identifiers', async ({ page }) => {
  await login(page);
  const ids: string[] = [];
  const title = 'เรือชื่อซ้ำ';
  for (let index = 0; index < 2; index++) {
    const editor = await openNew(page, collections[0]);
    await fillCore(editor, collections[0], title, 'Container');
    const saved = await save(page, editor);
    ids.push(saved.id);
    expect(saved.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(saved.id.length).toBeLessThanOrEqual(100);
  }
  expect(new Set(ids).size).toBe(2);
  const saved = (await records(page)).filter(record => record.type === 'Vessel' && record.title === title);
  expect(saved).toHaveLength(2);
  expect(saved.map(record => record.id).sort()).toEqual(ids.sort());
});

test('editing preserves existing identities, categories, design fields, vessel details and route points', async ({ page, db }) => {
  test.setTimeout(120_000);
  const service = await db.collection('moe_content').findOne({ type: 'Service' });
  const vessel = await db.collection('moe_content').findOne({ type: 'Vessel' });
  expect(service).not.toBeNull();
  expect(vessel).not.toBeNull();
  await db.collection('moe_content').updateOne({ type: 'Service', id: service!.id }, { $set: {
    category: 'Legacy service category', categoryTh: 'หมวดบริการเดิม', order: 4242,
    caption: 'Retained image caption', mobileImage: service!.image,
    gallery: [{ url: service!.image, alt: 'Retained supporting image', altTh: 'ภาพประกอบเดิม' }],
  } });
  await db.collection('moe_content').updateOne({ type: 'Vessel', id: vessel!.id }, { $set: {
    category: 'Unlisted vessel type', categoryTh: 'ประเภทเรือเดิม', vesselSpecs: { capacityTeu: 0, flag: 'Thailand', flagTh: 'ไทย' },
  } });
  await login(page);
  const original = await records(page);
  for (const collection of collections.filter(item => ['Service', 'Vessel', 'Route'].includes(item.type))) {
    const before = original.find(record => record.type === collection.type
      && (collection.type !== 'Service' || record.id === service!.id)
      && (collection.type !== 'Vessel' || record.id === vessel!.id))!;
    await page.goto(`/cms/${collection.view}`);
    await page.getByRole('button', { name: `Edit ${before.title}`, exact: true }).click();
    const editor = page.getByRole('dialog', { name: `Edit ${collection.name}`, exact: true });
    await (await showField(editor, 'Title · English')).fill(`Renamed ${before.title}`);
    const saved = await save(page, editor);
    expect(saved.title).toBe(`Renamed ${before.title}`);
    expect(saved.revision).toBe(before.revision + 1);
    for (const key of ['id', 'type', 'order', 'icon', 'category', 'categoryTh', 'date', 'caption', 'bodyHeading', 'body', 'image', 'mobileImage', 'gallery', 'vesselSpecs', 'origin', 'destination', 'waypoints'] as const) {
      const empty = key === 'order' ? 0 : key === 'gallery' || key === 'waypoints' ? [] : '';
      expect(saved[key] ?? empty, `${collection.type}.${key}`).toEqual(before[key] ?? empty);
    }
  }
});

test('optional vessel panels start closed and invalid hidden specifications reopen without losing text', async ({ page }) => {
  await login(page);
  const editor = await openNew(page, collections[0]);
  await fillCore(editor, collections[0], 'Vessel with checked optional details', 'Container');
  const year = editor.getByLabel('Year built', { exact: true });
  const specifications = year.locator('xpath=ancestor::details[1]');
  await expect(specifications).not.toHaveAttribute('open');
  const gallery = editor.getByText('More photos', { exact: true }).locator('xpath=ancestor::details[1]');
  await expect(gallery).not.toHaveAttribute('open');
  await (await showField(editor, 'Year built')).fill(String(new Date().getUTCFullYear() + 1));
  await editor.getByLabel('Container capacity (TEU)', { exact: true }).fill('0');
  await specifications.locator(':scope > summary').click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(specifications).toHaveAttribute('open', '');
  await expect(year).toBeVisible();
  await expect(editor.getByLabel('Title · English', { exact: true })).toHaveValue('Vessel with checked optional details');
  expect((await records(page)).filter(record => record.title === 'Vessel with checked optional details')).toHaveLength(0);
  await year.fill('2020');
  const saved = await save(page, editor);
  expect(saved.vesselSpecs).toEqual({ yearBuilt: 2020, capacityTeu: 0 });
});

test('route editing keeps existing points and ports while adding a validated intermediate point', async ({ page }, testInfo) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const before = (await records(page)).find(record => record.type === 'Route' && record.origin && record.destination && (record.waypoints?.length ?? 0) > 2)!;
  expect(before).toBeTruthy();
  const expectedPoints = before.waypoints!.map(point => [...point] as [number, number]);
  const destination = [...expectedPoints.at(-1)!] as [number, number];
  expectedPoints[1][0] = Number((expectedPoints[1][0] + 0.01).toFixed(6));
  const origin = { ...before.origin!, name: `${before.origin!.name} terminal` };
  await page.goto('/cms/routes');
  await page.getByRole('button', { name: `Edit ${before.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit route', exact: true });
  const outer = editor.getByText('Route map and ports', { exact: true }).locator('xpath=ancestor::details[1]');
  await expect(outer).not.toHaveAttribute('open');
  await outer.locator(':scope > summary').click();
  const map = editor.getByText('Map setup', { exact: true }).locator('xpath=ancestor::details[1]');
  await expect(map).toHaveAttribute('open', '');
  await editor.getByRole('group', { name: 'Origin port', exact: true }).getByLabel('Port name · English', { exact: true }).fill(origin.name);
  await editor.getByLabel('Intermediate point 1 · Latitude', { exact: true }).fill(String(expectedPoints[1][0]));
  await editor.getByRole('button', { name: 'Add intermediate point', exact: true }).click();
  const newPointLabel = `Intermediate point ${expectedPoints.length - 1}`;
  const newLatitude = editor.getByLabel(`${newPointLabel} · Latitude`, { exact: true });
  const newLongitude = editor.getByLabel(`${newPointLabel} · Longitude`, { exact: true });
  await expect(newLatitude).toHaveValue('');
  await expect(newLongitude).toHaveValue('');
  for (let index = 0; index < expectedPoints.length; index++) {
    const label = index === 0 ? 'Origin point' : index === expectedPoints.length - 1 ? 'Destination point' : `Intermediate point ${index}`;
    for (const [coordinate, value] of [['Latitude', expectedPoints[index][0]], ['Longitude', expectedPoints[index][1]]] as const) {
      expect(Number(await editor.getByLabel(`${label} · ${coordinate}`, { exact: true }).inputValue())).toBe(value);
    }
  }

  let posts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/cms/content')) posts++;
  });
  await map.locator(':scope > summary').click();
  await outer.locator(':scope > summary').click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(outer).toHaveAttribute('open', '');
  await expect(map).toHaveAttribute('open', '');
  await expect(newLatitude).toBeVisible();
  expect(posts).toBe(0);
  expect((await records(page)).find(record => record.type === 'Route' && record.id === before.id)).toEqual(before);

  const previous = expectedPoints.at(-2)!;
  const added: [number, number] = [Number(((previous[0] + destination[0]) / 2).toFixed(6)), Number(((previous[1] + destination[1]) / 2).toFixed(6))];
  await newLatitude.fill(String(added[0]));
  await newLongitude.fill(String(added[1]));
  expectedPoints.splice(expectedPoints.length - 1, 0, added);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 750 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => editor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await map.locator(':scope > summary').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`cms-route-map-expanded-${width}.png`), animations: 'disabled' });
  }
  const saved = await save(page, editor);
  expect(saved).toMatchObject({ id: before.id, type: 'Route', revision: before.revision + 1, origin, destination: before.destination, waypoints: expectedPoints });
  expect(saved.waypoints!.at(-1)).toEqual(destination);
  expect(posts).toBe(1);
});

for (const locale of ['en', 'th'] as const) {
  test(`collection editors fit a 320px viewport in ${locale}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await login(page);
    await page.setViewportSize({ width: 320, height: 750 });
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    for (const collection of collections) {
      await page.goto(`/cms/${collection.view}`);
      const name = locale === 'th' ? cmsMainThai[`Add ${collection.name}`] : `Add ${collection.name}`;
      await page.getByRole('button', { name, exact: true }).click();
      const editor = page.getByRole('dialog', { name, exact: true });
      for (const language of ['English', 'Thai']) await showField(editor, locale === 'th' ? cmsFieldsThai[`Title · ${language}`] : `Title · ${language}`);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => editor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await editor.locator('summary').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`cms-${collection.name}-editor-320-${locale}.png`), animations: 'disabled' });
      await expect(editor.getByRole('button', { name: locale === 'th' ? cmsMainThai.Save : 'Save', exact: true })).toBeInViewport();
      await editor.getByRole('button', { name: locale === 'th' ? cmsMainThai.Cancel : 'Cancel', exact: true }).click();
      await expect(editor).not.toBeVisible();
    }
  });
}
