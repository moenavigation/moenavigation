import { request as apiRequest, type Locator, type Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL } from './fixtures';

const endpoint = '/api/cms/routes/coordinates';
const pin = { latitude: 13.1234567891234, longitude: 100.987654321012 };
const pinLink = `https://www.google.com/maps/place/Test+port/@12,99,15z/data=!4m2!3m1!1s0x0:0x0!3d${pin.latitude}!4d${pin.longitude}`;
const selectedPin = { latitude: 11.048254, longitude: 103.223807 };
// The nested 13.0833,100.8833 pair is a prior search. The selected pin is
// the sibling !3m3!8m2 branch and agrees with the place title.
const selectedPinLink = "https://www.google.com/maps/place/11%C2%B002'53.7%22N+103%C2%B013'25.7%22E/@11.0735511,103.1521576,877m/data=!3m1!1e3!4m10!1m5!3m4!2zMTPCsDA0JzU5LjkiTiAxMDDCsDUyJzU5LjkiRQ!8m2!3d13.0833!4d100.8833!3m3!8m2!3d11.048254!4d103.223807?entry=ttu&g_ep=EgoyMDI2MTAyOC4wIKXMDSoASAFQAw%3D%3D";
const queryLink = (latitude: number, longitude: number) => `https://www.google.com/maps/search/?api=1&query=${latitude}%2C${longitude}`;

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

async function expand(editor: Locator, text: string) {
  const panel = editor.getByText(text, { exact: true }).locator('xpath=ancestor::details[1]');
  if (!await panel.evaluate(element => element.hasAttribute('open'))) await panel.locator(':scope > summary').click();
  return panel;
}

async function openExisting(page: Page, locale: CmsLocale = 'en') {
  const before = (await records(page)).find(record => record.type === 'Route' && record.origin && record.destination && (record.waypoints?.length ?? 0) > 2)!;
  expect(before).toBeTruthy();
  await page.goto('/cms/routes');
  const title = locale === 'th' ? before.titleTh || before.title : before.title;
  await page.getByRole('button', { name: translateCms(locale, 'Edit {name}', { name: title }), exact: true }).click();
  const editor = page.getByRole('dialog', { name: translateCms(locale, 'Edit route'), exact: true });
  await expand(editor, translateCms(locale, 'Route map and ports'));
  return { editor, before };
}

async function openLink(page: Page, editor: Locator, point: string, locale: CmsLocale = 'en') {
  const opener = editor.getByRole('button', { name: translateCms(locale, 'Use Google Maps link · {point}', { point }), exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: translateCms(locale, 'Google Maps link'), exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, opener, input: dialog.getByLabel(translateCms(locale, 'Google Maps link'), { exact: true }) };
}

async function importPoint(page: Page, editor: Locator, point: string, url: string, locale: CmsLocale = 'en') {
  const { dialog, opener, input } = await openLink(page, editor, point, locale);
  await input.fill(url);
  await dialog.getByRole('button', { name: translateCms(locale, 'Use coordinates'), exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
}

async function save(page: Page, editor: Locator): Promise<ContentRecord> {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  return (await response.json()).record;
}

test('Google Maps import selects the current pin over a nested prior search and saves only the chosen point', async ({ page }) => {
  await login(page);
  const resolved = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { url: selectedPinLink } });
  expect(resolved.status(), await resolved.text()).toBe(200);
  expect(await resolved.json()).toMatchObject(selectedPin);
  const { editor, before } = await openExisting(page);
  const label = 'Intermediate point 1';
  const latitude = editor.getByLabel(`${label} · Latitude`, { exact: true });
  const longitude = editor.getByLabel(`${label} · Longitude`, { exact: true });
  const draftLatitude = await latitude.inputValue();
  const draftLongitude = await longitude.inputValue();
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const { dialog, input } = await openLink(page, editor, label);
  await input.fill(selectedPinLink);
  await expect(dialog.getByRole('button', { name: 'Use coordinates', exact: true })).toBeEnabled();
  await expect(dialog.getByText(String(selectedPin.latitude), { exact: true })).toBeVisible();
  await expect(dialog.getByText(String(selectedPin.longitude), { exact: true })).toBeVisible();
  await expect(dialog.getByText('13.0833', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('100.8833', { exact: true })).toHaveCount(0);
  await expect(latitude).toHaveValue(draftLatitude);
  await expect(longitude).toHaveValue(draftLongitude);
  await dialog.getByRole('button', { name: 'Use coordinates', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(latitude).toHaveValue(String(selectedPin.latitude));
  await expect(longitude).toHaveValue(String(selectedPin.longitude));
  expect(saves).toBe(0);
  await expect(editor.getByRole('link', { name: `Open in Google Maps · ${label}`, exact: true })).toHaveAttribute('href', queryLink(selectedPin.latitude, selectedPin.longitude));
  await expect(editor.getByRole('button', { name: `Use Google Maps link · ${label}`, exact: true })).toBeVisible();
  const expectedPoints = before.waypoints!.map(point => [...point] as [number, number]);
  expectedPoints[1] = [selectedPin.latitude, selectedPin.longitude];
  await expect(editor.getByRole('link', { name: /^Open in Google Maps/ })).toHaveCount(expectedPoints.length);
  for (const [index, coordinates] of expectedPoints.entries()) {
    const pointLabel = index === 0 ? 'Origin point' : index === expectedPoints.length - 1 ? 'Destination point' : `Intermediate point ${index}`;
    const link = editor.getByRole('link', { name: `Open in Google Maps · ${pointLabel}`, exact: true });
    await expect(link).toHaveAttribute('href', queryLink(...coordinates));
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  expect((await records(page)).find(record => record.id === before.id && record.type === 'Route')).toEqual(before);
  const saved = await save(page, editor);
  expect(saved).toMatchObject({ id: before.id, origin: before.origin, destination: before.destination, waypoints: expectedPoints, revision: before.revision + 1 });
  expect(saves).toBe(1);
});

test('Add route imports both endpoints and Enter in the link dialog never submits the route', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/routes');
  await page.getByRole('button', { name: 'Add route', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add route', exact: true });
  for (const language of ['English', 'Thai']) {
    const title = editor.getByLabel(`Title · ${language}`, { exact: true });
    for (const panel of await title.locator('xpath=ancestor::details').all()) {
      if (!await panel.evaluate(element => element.hasAttribute('open'))) await panel.locator(':scope > summary').click();
    }
    await title.fill(language === 'English' ? 'Google Maps test route' : 'เส้นทางทดสอบ Google Maps');
    await editor.getByLabel(`Summary · ${language}`, { exact: true }).fill(language === 'English' ? 'A route using imported map coordinates.' : 'เส้นทางที่ใช้พิกัดจากลิงก์แผนที่');
  }
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  await editor.getByRole('button', { name: 'Browse library for main image', exact: true }).click();
  await editor.getByRole('searchbox', { name: 'Search library for main image' }).fill(media!.title);
  await editor.getByRole('button', { name: media!.title, exact: true }).click();
  await expand(editor, 'Route map and ports');
  for (const name of ['Origin port', 'Destination port']) {
    const port = editor.getByRole('group', { name, exact: true });
    await port.getByLabel('Port name · English', { exact: true }).fill(name);
    await port.getByLabel('Port name · Thai', { exact: true }).fill(name === 'Origin port' ? 'ท่าเรือต้นทาง' : 'ท่าเรือปลายทาง');
    await port.getByLabel('Country · English', { exact: true }).fill('Thailand');
    await port.getByLabel('Country · Thai', { exact: true }).fill('ประเทศไทย');
  }
  await expand(editor, 'Map setup');
  await editor.getByRole('button', { name: 'Set up map points', exact: true }).click();
  await expect(editor.getByRole('link', { name: /^Open in Google Maps/ })).toHaveCount(0);
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const { dialog, input } = await openLink(page, editor, 'Origin point');
  await input.fill(selectedPinLink);
  await input.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Use coordinates', exact: true })).toBeEnabled();
  await expect(dialog.getByText(String(selectedPin.latitude), { exact: true })).toBeVisible();
  await expect(dialog.getByText(String(selectedPin.longitude), { exact: true })).toBeVisible();
  await expect(editor).toBeVisible();
  expect(saves).toBe(0);
  await dialog.getByRole('button', { name: 'Use coordinates', exact: true }).click();
  await importPoint(page, editor, 'Destination point', queryLink(7.203345678901, 100.59456789012));
  const saved = await save(page, editor);
  expect(saved).toMatchObject({ type: 'Route', title: 'Google Maps test route', waypoints: [[selectedPin.latitude, selectedPin.longitude], [7.203345678901, 100.59456789012]] });
  expect(saves).toBe(1);
});

test('invalid map links and cancelled delayed imports preserve coordinates and unsaved route fields', async ({ page }) => {
  await login(page);
  const { editor } = await openExisting(page);
  const portName = editor.getByRole('group', { name: 'Origin port', exact: true }).getByLabel('Port name · English', { exact: true });
  await portName.fill('Unsaved terminal name');
  const latitude = editor.getByLabel('Origin point · Latitude', { exact: true });
  const longitude = editor.getByLabel('Origin point · Longitude', { exact: true });
  const initial = [await latitude.inputValue(), await longitude.inputValue()];
  const first = await openLink(page, editor, 'Origin point');
  await first.input.fill('https://www.google.com.evil.example/maps?q=13,100');
  await expect(first.dialog.getByRole('alert')).toBeVisible();
  await expect(first.dialog.getByRole('button', { name: 'Use coordinates', exact: true })).toBeDisabled();
  await first.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(first.opener).toBeFocused();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  let settled = false;
  await page.route(`**${endpoint}`, async route => {
    if (route.request().postDataJSON().url !== 'https://maps.app.goo.gl/delayed-test') return route.continue();
    started = true;
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latitude: 1, longitude: 2 }) }).catch(() => {});
    settled = true;
  });
  try {
    const delayed = await openLink(page, editor, 'Origin point');
    await delayed.input.fill('https://maps.app.goo.gl/delayed-test');
    await expect.poll(() => started).toBe(true);
    await delayed.input.press('Escape');
    await expect(delayed.dialog).not.toBeVisible();
    await expect(delayed.opener).toBeFocused();
    await importPoint(page, editor, 'Destination point', queryLink(9.123456, 102.456789));
    release();
    await expect.poll(() => settled).toBe(true);
    await expect(latitude).toHaveValue(initial[0]);
    await expect(longitude).toHaveValue(initial[1]);
    await expect(editor.getByLabel('Destination point · Latitude', { exact: true })).toHaveValue('9.123456');
    await expect(editor.getByLabel('Destination point · Longitude', { exact: true })).toHaveValue('102.456789');
    await expect(portName).toHaveValue('Unsaved terminal name');
  } finally { release(); }
});

for (const locale of ['en', 'th'] as const) {
  test(`Google Maps dialog fits desktop and 320px in ${locale} with contained keyboard focus`, async ({ page }, testInfo) => {
    await login(page);
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    const { editor } = await openExisting(page, locale);
    const { dialog, opener, input } = await openLink(page, editor, translateCms(locale, 'Origin point'), locale);
    await input.fill(selectedPinLink);
    await expect(dialog.getByRole('button', { name: translateCms(locale, 'Use coordinates'), exact: true })).toBeEnabled();
    await expect(dialog.getByText(String(selectedPin.latitude), { exact: true })).toBeVisible();
    await expect(dialog.getByText(String(selectedPin.longitude), { exact: true })).toBeVisible();
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 750 : 960 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`cms-google-maps-${locale}-${width}.png`), animations: 'disabled' });
    }
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(editor).toBeVisible();
    await expect(opener).toBeFocused();
    const point = opener.locator('xpath=ancestor::li[1]');
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 750 : 960 });
      await point.scrollIntoViewIfNeeded();
      await expect.poll(() => editor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await point.screenshot({ path: testInfo.outputPath(`cms-map-point-${locale}-${width}.png`), animations: 'disabled' });
    }
  });
}

test('coordinate resolution requires a same-origin signed-in CMS user and allows every CMS role', async ({ page, db }) => {
  const anonymous = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  try {
    expect((await anonymous.post(endpoint, { data: { url: pinLink } })).status()).toBe(401);
  } finally { await anonymous.dispose(); }
  await login(page);
  expect((await page.request.post(endpoint, { headers: { Origin: 'https://elsewhere.example' }, data: { url: pinLink } })).status()).toBe(403);
  expect((await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { url: 'https://127.0.0.1/maps?q=13,100' } })).status()).toBe(400);
  for (const role of ['Dev', 'Admin', 'Operator']) {
    await db.collection<{ _id: string; role: string }>('moe_users').updateOne({ _id: E2E_ADMIN.id }, { $set: { role } });
    const response = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { url: pinLink } });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject(pin);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
});
