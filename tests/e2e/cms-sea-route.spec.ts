import { createHash } from 'node:crypto';
import { request as apiRequest, type Locator, type Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import type { GeneratedSeaRoute, SeaRoutePoint } from '../../src/lib/sea-route';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL } from './fixtures';
import { clickClippedMapPoint } from './map-point-helpers';

const endpoint = '/api/cms/routes/generate';
const landNote = 'This route touches land in the available map data. Review and adjust the points before saving.';
// These offshore endpoints exercise a regional maritime route without relying
// on a port's street address or silently moving an endpoint onto the network.
const origin: SeaRoutePoint = [12.9, 100.7];
const destination: SeaRoutePoint = [3, 101];
const originText = ['12.9000000', '100.700000000'] as const;
const destinationText = ['3.00000000', '101.0000000000'] as const;
// Timing and layout tests replay the real engine's checked Malay Peninsula
// detour; the first test independently calls the actual generator.
const example = (start: SeaRoutePoint = origin): GeneratedSeaRoute => ({
  waypoints: [start, [13, 100.4], [9.03, 102.09], [7.812, 102.606], [7.569, 102.708], [4.569, 103.95], [1.6555, 104.4625], [1.442, 104.478], [1.341, 104.482], [1.1, 103.6], [1.498, 102.893], [2.023, 101.974], [2.735, 101.149], [2.927, 100.922], destination],
  distanceKm: 1889.109706705088,
});

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

async function openExisting(page: Page, locale: CmsLocale = 'en') {
  const before = (await records(page)).find(record => record.type === 'Route' && record.origin && record.destination && (record.waypoints?.length ?? 0) > 2)!;
  expect(before).toBeTruthy();
  await page.goto('/cms/routes');
  const title = locale === 'th' ? before.titleTh || before.title : before.title;
  await page.getByRole('button', { name: translateCms(locale, 'Edit {name}', { name: title }), exact: true }).click();
  const editor = page.getByRole('dialog', { name: translateCms(locale, 'Edit route'), exact: true });
  const panel = editor.getByText(translateCms(locale, 'Route map and ports'), { exact: true }).locator('xpath=ancestor::details[1]');
  if (!await panel.evaluate(element => element.hasAttribute('open'))) await panel.locator(':scope > summary').click();
  const opener = editor.getByRole('button', { name: translateCms(locale, 'Generate sea route'), exact: true });
  return { editor, before, opener };
}

function coordinate(editor: Locator, point: string, field: 'Latitude' | 'Longitude', locale: CmsLocale = 'en') {
  return editor.getByLabel(translateCms(locale, '{point} · {coordinate}', {
    point: translateCms(locale, point), coordinate: translateCms(locale, field),
  }), { exact: true });
}

async function setEndpoints(editor: Locator, locale: CmsLocale = 'en') {
  for (const [label, values] of [['Origin point', originText], ['Destination point', destinationText]] as const) {
    await coordinate(editor, label, 'Latitude', locale).fill(values[0]);
    await coordinate(editor, label, 'Longitude', locale).fill(values[1]);
  }
}

async function pointValues(editor: Locator, locale: CmsLocale = 'en') {
  const latitude = translateCms(locale, 'Latitude');
  const longitude = translateCms(locale, 'Longitude');
  const latitudes = await editor.locator('input[aria-label]').evaluateAll((inputs, suffix) => inputs
    .filter(input => input.getAttribute('aria-label')?.endsWith(` · ${suffix}`)).map(input => (input as HTMLInputElement).value), latitude);
  const longitudes = await editor.locator('input[aria-label]').evaluateAll((inputs, suffix) => inputs
    .filter(input => input.getAttribute('aria-label')?.endsWith(` · ${suffix}`)).map(input => (input as HTMLInputElement).value), longitude);
  return latitudes.map((latitude, index) => [latitude, longitudes[index]]);
}

test('a generated sea route is previewed before applying, preserves endpoint text and saves through the normal route workflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const { editor, before, opener } = await openExisting(page);
  await setEndpoints(editor);
  const portName = editor.getByRole('group', { name: 'Origin port', exact: true }).getByLabel('Port name · English', { exact: true });
  await portName.fill('Unsaved origin terminal');
  const beforePoints = await pointValues(editor);
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST');
  await opener.click();
  const preview = page.getByRole('dialog', { name: 'Sea route preview', exact: true });
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  const generated = await response.json() as GeneratedSeaRoute;
  expect(generated.waypoints.length).toBeGreaterThan(2);
  expect(generated.waypoints.length).toBeLessThanOrEqual(100);
  expect(generated.waypoints[0]).toEqual(origin);
  expect(generated.waypoints.at(-1)).toEqual(destination);
  expect(generated.distanceKm).toBeGreaterThan(0);
  expect(generated.touchesLand).not.toBe(true);
  expect(Math.min(...generated.waypoints.map(point => point[0]))).toBeLessThan(2);
  await expect(preview.getByRole('button', { name: 'Use generated points', exact: true })).toBeEnabled();
  const map = preview.getByRole('region', { name: 'Generated sea route map', exact: true });
  await expect(map).toBeVisible();
  const links = map.locator('a[data-route-point]');
  await expect(links).toHaveCount(generated.waypoints.length);
  for (const [index, point] of generated.waypoints.entries()) {
    await expect(links.nth(index)).toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.join(','))}`);
    await expect(links.nth(index)).toHaveAttribute('target', '_blank');
    await expect(links.nth(index)).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(map.locator('a[data-route-point="origin"] > span')).toHaveCSS('opacity', '1');
  await expect(map.locator('a[data-route-point="destination"] > span')).toHaveCSS('opacity', '1');
  const intermediate = map.locator('a[data-route-point="intermediate"]').nth(4);
  const dot = intermediate.locator(':scope > span');
  await expect(dot).toHaveCSS('opacity', '0');
  await intermediate.hover();
  await expect(dot).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(dot).toHaveCSS('opacity', '0');
  await page.keyboard.press('Tab');
  await intermediate.focus();
  await expect(dot).toHaveCSS('opacity', '1');
  const fit = preview.getByRole('button', { name: 'Fit generated route', exact: true });
  await fit.focus();
  await expect(dot).toHaveCSS('opacity', '0');
  // A drag beginning on a linked marker pans the map without opening a tab.
  const markerBounds = await intermediate.boundingBox();
  const center = { x: markerBounds!.x + markerBounds!.width / 2, y: markerBounds!.y + markerBounds!.height / 2 };
  let openedTabs = 0;
  const countPopup = () => { openedTabs++; };
  page.on('popup', countPopup);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y + 20, { steps: 6 });
  await page.mouse.up();
  await fit.click();
  await page.mouse.move(0, 0);
  await expect(dot).toHaveCSS('opacity', '0');
  expect(openedTabs).toBe(0);
  page.off('popup', countPopup);
  await page.context().route('https://www.google.com/maps/search/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>External map destination</title>' }));
  const edgeTab = page.waitForEvent('popup');
  await clickClippedMapPoint(page, map, intermediate);
  const external = await edgeTab;
  await expect(external).toHaveURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(generated.waypoints[5].join(','))}`);
  await external.close();
  await page.bringToFront();
  await fit.click();
  await expect(preview.getByText('Approximate website route. Review coastal areas before saving. Not for navigation.', { exact: true })).toBeVisible();
  await expect(preview.getByText(landNote, { exact: true })).toHaveCount(0);
  await preview.screenshot({ path: testInfo.outputPath('sea-route-real-detour-desktop.png'), animations: 'disabled' });
  expect(await pointValues(editor)).toEqual(beforePoints);
  expect(saves).toBe(0);
  expect((await records(page)).find(record => record.id === before.id && record.type === 'Route')).toEqual(before);
  await preview.getByRole('button', { name: 'Use generated points', exact: true }).click();
  await expect(preview).not.toBeVisible();
  await expect(opener).toBeFocused();
  const applied = await pointValues(editor);
  expect(applied[0]).toEqual(originText);
  expect(applied.at(-1)).toEqual(destinationText);
  expect(applied.map(point => point.map(Number))).toEqual(generated.waypoints);
  await expect(portName).toHaveValue('Unsaved origin terminal');
  expect(saves).toBe(0);
  const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const save = await savedResponse;
  expect(save.status(), await save.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  const saved = (await save.json()).record as ContentRecord;
  expect(saved.waypoints).toEqual(generated.waypoints);
  expect(saved.origin).toEqual({ ...before.origin, name: 'Unsaved origin terminal' });
  expect(saved.destination).toEqual(before.destination);
  expect(saved.revision).toBe(before.revision + 1);
  expect(saves).toBe(1);
});

test('the reported coastal endpoints generate a reviewable route and only save after applying and Save', async ({ page }, testInfo) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { editor, before, opener } = await openExisting(page);
  // The destination is within 100 km of a maritime edge, but over 100 km
  // from its nearest vertex. The former vertex guard rejected this exact pair.
  const screenshotOrigin: SeaRoutePoint = [0.878983, 104.655717];
  const screenshotDestination: SeaRoutePoint = [2.515278, 111.313529];
  const screenshotOriginText = ['0.878983000', '104.6557170000'];
  const screenshotDestinationText = ['2.515278000', '111.3135290000'];
  for (const [label, values] of [['Origin point', screenshotOriginText], ['Destination point', screenshotDestinationText]] as const) {
    await coordinate(editor, label, 'Latitude').fill(values[0]);
    await coordinate(editor, label, 'Longitude').fill(values[1]);
  }
  const portName = editor.getByRole('group', { name: 'Origin port', exact: true }).getByLabel('Port name · English', { exact: true });
  await portName.fill('Coastal route draft');
  const originalPoints = await pointValues(editor);
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST');
  await opener.click();
  const preview = page.getByRole('dialog', { name: 'Sea route preview', exact: true });
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  const generated = await response.json() as GeneratedSeaRoute;
  expect(generated.touchesLand).toBe(true);
  expect(generated.waypoints.length).toBeGreaterThan(2);
  expect(generated.waypoints.length).toBeLessThanOrEqual(100);
  expect(Number.isFinite(generated.distanceKm) && generated.distanceKm > 0).toBe(true);
  expect(generated.waypoints[0]).toEqual(screenshotOrigin);
  expect(generated.waypoints.at(-1)).toEqual(screenshotDestination);
  const apply = preview.getByRole('button', { name: 'Use generated points', exact: true });
  await expect(apply).toBeEnabled();
  await expect(preview.getByText(landNote, { exact: true })).toBeVisible();
  await expect(preview.getByRole('alert')).toHaveCount(0);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 780 : 1100 });
    await expect.poll(() => preview.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await preview.screenshot({ path: testInfo.outputPath(`sea-route-land-contact-en-${width}.png`), animations: 'disabled' });
  }
  expect(await pointValues(editor)).toEqual(originalPoints);
  await expect(portName).toHaveValue('Coastal route draft');
  expect(saves).toBe(0);
  expect((await records(page)).find(record => record.id === before.id && record.type === 'Route')).toEqual(before);
  await apply.click();
  await expect(preview).not.toBeVisible();
  await expect(opener).toBeFocused();
  const applied = await pointValues(editor);
  expect(applied[0]).toEqual(screenshotOriginText);
  expect(applied.at(-1)).toEqual(screenshotDestinationText);
  expect(applied.map(point => point.map(Number))).toEqual(generated.waypoints);
  await expect(portName).toHaveValue('Coastal route draft');
  expect(saves).toBe(0);
  const savePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const save = await savePromise;
  expect(save.status(), await save.text()).toBe(200);
  const saved = (await save.json()).record as ContentRecord;
  expect(saved.waypoints).toEqual(generated.waypoints);
  expect(saved.origin).toEqual({ ...before.origin, name: 'Coastal route draft' });
  expect(saved.destination).toEqual(before.destination);
  expect(saved.revision).toBe(before.revision + 1);
  expect(saves).toBe(1);
});

test('generation requires two valid distinct endpoints and never submits incomplete coordinates', async ({ page }) => {
  await login(page);
  const { editor, opener } = await openExisting(page);
  await setEndpoints(editor);
  let attempts = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === endpoint) attempts++; });
  const latitude = coordinate(editor, 'Origin point', 'Latitude');
  for (const invalid of ['', '91', 'not-a-coordinate']) {
    await latitude.fill(invalid);
    await expect(opener).toBeDisabled();
  }
  await latitude.fill(destinationText[0]);
  await coordinate(editor, 'Origin point', 'Longitude').fill(destinationText[1]);
  await expect(opener).toBeDisabled();
  await setEndpoints(editor);
  await expect(opener).toBeEnabled();
  expect(attempts).toBe(0);
});

test('cancelled generation and failed retries preserve the draft and ignore an old response after reopening', async ({ page }) => {
  await login(page);
  const { editor, before, opener } = await openExisting(page);
  await setEndpoints(editor);
  let attempts = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(() => release(), 30_000);
  let oldSettled = false;
  const newerOrigin: SeaRoutePoint = [12.85, origin[1]];
  await page.route(`**${endpoint}`, async route => {
    attempts++;
    if (attempts === 1) {
      await gate;
      await route.fulfill({ status: 200, json: example() }).catch(() => {});
      oldSettled = true;
    } else if (attempts === 2) {
      await route.fulfill({ status: 422, json: { error: 'Synthetic route is unavailable. Adjust the endpoints.' } });
    } else await route.fulfill({ status: 200, json: example(newerOrigin) });
  });
  try {
    await opener.click();
    const preview = page.getByRole('dialog', { name: 'Sea route preview', exact: true });
    await expect(preview.locator('[data-working-panel]')).toContainText('Generating sea route…');
    await expect(preview.getByRole('button', { name: 'Use generated points', exact: true })).toBeDisabled();
    await expect(preview.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(preview).not.toBeVisible();
    await expect(opener).toBeFocused();
    await coordinate(editor, 'Origin point', 'Latitude').fill('12.850000');
    const unsaved = await pointValues(editor);
    await opener.click();
    await expect(preview.getByRole('alert')).toContainText('Synthetic route is unavailable.');
    expect(await pointValues(editor)).toEqual(unsaved);
    await expect(preview.getByRole('button', { name: 'Use generated points', exact: true })).toBeDisabled();
    await preview.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'Use generated points', exact: true })).toBeEnabled();
    release();
    await expect.poll(() => oldSettled).toBe(true);
    await preview.getByRole('button', { name: 'Use generated points', exact: true }).click();
    await expect(preview).not.toBeVisible();
    const points = await pointValues(editor);
    expect(points[0]).toEqual(['12.850000', originText[1]]);
    expect(points.map(point => point.map(Number))).toEqual(example(newerOrigin).waypoints);
    expect((await records(page)).find(record => record.id === before.id && record.type === 'Route')).toEqual(before);
    expect(attempts).toBe(3);
  } finally { clearTimeout(timeout); release(); }
});

test.describe('touch sea route preview', () => {
test.use({ hasTouch: true });
test('sea route preview fits Thai mobile and desktop, links every point and cancels on the backdrop without applying', async ({ page }, testInfo) => {
  await login(page);
  await page.locator('header [data-cms-language-switch]').click();
  const locale = 'th';
  const t = (source: string) => translateCms(locale, source);
  const { editor, opener } = await openExisting(page, locale);
  await setEndpoints(editor, locale);
  const before = await pointValues(editor, locale);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`**${endpoint}`, route => route.fulfill({ status: 200, json: { ...example(), touchesLand: true } }));
  await opener.click();
  const preview = page.getByRole('dialog', { name: t('Sea route preview'), exact: true });
  await expect(preview.getByRole('button', { name: t('Use generated points'), exact: true })).toBeEnabled();
  await expect(preview.getByText(t(landNote), { exact: true })).toBeVisible();
  await expect(preview.getByRole('button', { name: t('Fit generated route'), exact: true })).toBeEnabled();
  const map = preview.getByRole('region', { name: t('Generated sea route map'), exact: true });
  await expect(map.locator('a[data-route-point]')).toHaveCount(example().waypoints.length);
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 780 : 960 });
    await expect.poll(() => preview.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await preview.screenshot({ path: testInfo.outputPath(`sea-route-preview-th-${width}.png`), animations: 'disabled' });
  }
  const intermediate = map.locator('a[data-route-point="intermediate"]').nth(4);
  await expect(intermediate.locator(':scope > span')).toHaveCSS('opacity', '0');
  const target = await intermediate.boundingBox();
  expect(target!.width).toBeGreaterThanOrEqual(43.99);
  expect(target!.height).toBeGreaterThanOrEqual(43.99);
  await page.context().route('https://www.google.com/maps/search/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>External map destination</title>' }));
  const newTab = page.waitForEvent('popup');
  await intermediate.tap();
  const external = await newTab;
  await expect(external).toHaveURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(example().waypoints[5].join(','))}`);
  await external.close();
  await page.bringToFront();
  await expect(preview).toBeVisible();
  expect(await pointValues(editor, locale)).toEqual(before);
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(await preview.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  const bounds = await preview.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x / 2, bounds!.y + bounds!.height / 2);
  await expect(preview).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(editor).toBeVisible();
  expect(await pointValues(editor, locale)).toEqual(before);
});
});

test('sea-route generation requires a same-origin CMS session, validates input and remains a read-only tool for every role', async ({ page, db }) => {
  const body = { origin, destination };
  const anonymous = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  try { expect((await anonymous.post(endpoint, { data: body })).status()).toBe(401); }
  finally { await anonymous.dispose(); }
  await login(page);
  const before = await db.collection('moe_content').find({ type: 'Route' }).sort({ _id: 1 }).toArray();
  expect((await page.request.post(endpoint, { headers: { Origin: 'https://elsewhere.example' }, data: body })).status()).toBe(403);
  expect((await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { ...body, origin: [95, 100] } })).status()).toBe(400);
  expect((await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { ...body, unexpected: true } })).status()).toBe(400);
  const inland = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { origin: [18.7883, 98.9853], destination } });
  expect(inland.status(), await inland.text()).toBe(422);
  expect(await inland.json()).not.toHaveProperty('waypoints');
  for (const role of ['Dev', 'Admin', 'Operator']) {
    await db.collection<{ _id: string; role: string }>('moe_users').updateOne({ _id: E2E_ADMIN.id }, { $set: { role } });
    const response = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: body });
    expect(response.status(), await response.text()).toBe(200);
    const generated = await response.json() as GeneratedSeaRoute;
    expect(generated.waypoints[0]).toEqual(origin);
    expect(generated.waypoints.at(-1)).toEqual(destination);
    expect(response.headers()['cache-control']).toBe('no-store');
  }
  const state = db.collection<{ _id: string; count: number; expiresAt: Date }>('moe_state');
  const limitPrefix = `limit:${createHash('sha256').update(`sea-route:${E2E_ADMIN.id}`).digest('hex')}:`;
  const exhaustCurrentBucket = async () => {
    const bucket = await state.findOne({ _id: { $regex: `^${limitPrefix}` } }, { sort: { _id: -1 } });
    expect(bucket).not.toBeNull();
    expect(bucket!.count).toBeGreaterThan(0);
    expect(bucket!.expiresAt).toBeInstanceOf(Date);
    await state.updateOne({ _id: bucket!._id }, { $set: { count: 12 } });
    return Number(bucket!._id.split(':').at(-1));
  };
  const bucket = await exhaustCurrentBucket();
  let limited = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: body });
  // A new minute can begin between the DB update and the request. Exercise the
  // newly created bucket once as well instead of making this a clock-edge flake.
  if (limited.status() !== 429 && Math.floor(Date.now() / 60_000) !== bucket) {
    await exhaustCurrentBucket();
    limited = await page.request.post(endpoint, { headers: { Origin: E2E_BASE_URL }, data: body });
  }
  expect(limited.status(), await limited.text()).toBe(429);
  expect(await limited.json()).not.toHaveProperty('waypoints');
  expect(await db.collection('moe_content').find({ type: 'Route' }).sort({ _id: 1 }).toArray()).toEqual(before);
});
