import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { test, expect, login } from './fixtures';

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

async function expand(editor: Locator, text: string) {
  const panel = editor.getByText(text, { exact: true }).locator('xpath=ancestor::details[1]');
  if (!await panel.evaluate(element => element.hasAttribute('open'))) await panel.locator(':scope > summary').click();
}

async function openExisting(page: Page, locale: CmsLocale = 'en') {
  const before = (await records(page)).find(record => record.type === 'Route' && record.origin && record.destination && (record.waypoints?.length ?? 0) > 5)!;
  expect(before).toBeTruthy();
  await page.goto('/cms/routes');
  const title = locale === 'th' ? before.titleTh || before.title : before.title;
  await page.getByRole('button', { name: translateCms(locale, 'Edit {name}', { name: title }), exact: true }).click();
  const editor = page.getByRole('dialog', { name: translateCms(locale, 'Edit route'), exact: true });
  await expand(editor, translateCms(locale, 'Route map and ports'));
  return { editor, before };
}

async function openMap(page: Page, editor: Locator, locale: CmsLocale = 'en') {
  const t = (source: string) => translateCms(locale, source);
  const opener = editor.getByRole('button', { name: t('Edit points on map'), exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: t('Edit points on map'), exact: true });
  const map = dialog.getByRole('region', { name: t('Route point editor map'), exact: true });
  await expect(map).toBeVisible();
  await expect(dialog.getByRole('button', { name: t('Zoom in'), exact: true })).toBeEnabled();
  return {
    dialog, map, opener,
    selected: dialog.getByRole('combobox', { name: t('Selected point'), exact: true }),
    latitude: dialog.getByRole('textbox', { name: t('Latitude'), exact: true }),
    longitude: dialog.getByRole('textbox', { name: t('Longitude'), exact: true }),
    apply: dialog.getByRole('button', { name: t('Use map points'), exact: true }),
  };
}

async function pointValues(editor: Locator, locale: CmsLocale = 'en') {
  const values = async (coordinate: 'Latitude' | 'Longitude') => editor.locator('input[aria-label]').evaluateAll((inputs, suffix) => inputs
    .filter(input => input.getAttribute('aria-label')?.endsWith(` · ${suffix}`)).map(input => (input as HTMLInputElement).value), translateCms(locale, coordinate));
  const latitudes = await values('Latitude'), longitudes = await values('Longitude');
  return latitudes.map((latitude, index) => [latitude, longitudes[index]]);
}

async function dragMarker(page: Page, map: Locator, index: number) {
  await map.scrollIntoViewIfNeeded();
  const marker = map.locator(`[data-route-point-index="${index}"]`);
  await expect(marker).toBeVisible();
  const bounds = (await marker.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(43.99);
  expect(bounds.height).toBeGreaterThanOrEqual(43.99);
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const area = (await map.boundingBox())!;
  const dx = start.x > area.x + area.width / 2 ? -35 : 35;
  const dy = start.y > area.y + area.height / 2 ? -30 : 30;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - bounds.x - dx)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.y - bounds.y - dy)).toBeLessThan(2);
}

test('dragging origin, intermediate and destination updates only those points after Apply and normal Save', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const { editor, before } = await openExisting(page);
  const preservedLatitude = editor.getByLabel('Intermediate point 1 · Latitude', { exact: true });
  await preservedLatitude.fill('12.12345678912340');
  const portName = editor.getByRole('group', { name: 'Origin port', exact: true }).getByLabel('Port name · English', { exact: true });
  await portName.fill('Unfinished port details');
  const original = await pointValues(editor);
  const expected = original.map(point => [...point]);
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const view = await openMap(page, editor);
  await expect(view.map.locator('[data-route-point-index]')).toHaveCount(original.length);
  for (const index of [0, 5, original.length - 1]) {
    await view.selected.selectOption(String(index));
    const initial = [await view.latitude.inputValue(), await view.longitude.inputValue()];
    await dragMarker(page, view.map, index);
    await expect.poll(async () => [await view.latitude.inputValue(), await view.longitude.inputValue()]).not.toEqual(initial);
    await expect(view.selected).toHaveValue(String(index));
    expected[index] = [await view.latitude.inputValue(), await view.longitude.inputValue()];
    expect(expected[index].map(Number).every(Number.isFinite)).toBe(true);
  }
  expect(await pointValues(editor)).toEqual(original);
  expect(saves).toBe(0);
  expect((await records(page)).find(record => record.id === before.id)).toEqual(before);
  await view.apply.click();
  await expect(view.dialog).not.toBeVisible();
  await expect(view.opener).toBeFocused();
  expect(await pointValues(editor)).toEqual(expected);
  await expect(preservedLatitude).toHaveValue('12.12345678912340');
  await expect(portName).toHaveValue('Unfinished port details');
  expect(saves).toBe(0);
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const saved = (await response.json()).record as ContentRecord;
  expect(saved.waypoints).toEqual(expected.map(point => point.map(Number)));
  expect(saved.origin).toEqual({ ...before.origin, name: 'Unfinished port details' });
  expect(saved.destination).toEqual(before.destination);
  expect(saves).toBe(1);
});

test('keyboard coordinates validate locally and Enter, Cancel and Escape never save or change the parent draft', async ({ page }) => {
  await login(page);
  const { editor } = await openExisting(page);
  const original = await pointValues(editor);
  let saves = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') saves++; });
  const view = await openMap(page, editor);
  const intermediate = view.map.locator('[data-route-point-index="5"]');
  await intermediate.focus();
  await intermediate.press('Enter');
  await expect(view.selected).toHaveValue('5');
  const destinationIndex = original.length - 1;
  const destination = view.map.locator(`[data-route-point-index="${destinationIndex}"]`);
  await destination.focus();
  await destination.press('Space');
  await expect(view.selected).toHaveValue(String(destinationIndex));
  await expect(view.dialog).toBeVisible();
  expect(saves).toBe(0);
  await view.selected.selectOption('0');
  await view.latitude.fill('91');
  await expect(view.apply).toBeDisabled();
  await view.latitude.fill('');
  await expect(view.apply).toBeDisabled();
  await view.latitude.fill('13.1234567891234');
  await view.longitude.fill('100.4567891234567');
  await view.longitude.press('Enter');
  await expect(view.dialog).toBeVisible();
  await expect(view.apply).toBeEnabled();
  expect(saves).toBe(0);
  expect(await pointValues(editor)).toEqual(original);
  await view.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(view.opener).toBeFocused();
  expect(await pointValues(editor)).toEqual(original);
  const reopened = await openMap(page, editor);
  await expect(reopened.latitude).toHaveValue(original[0][0]);
  await reopened.longitude.fill('100.123');
  await reopened.longitude.press('Escape');
  await expect(reopened.dialog).not.toBeVisible();
  await expect(reopened.opener).toBeFocused();
  expect(await pointValues(editor)).toEqual(original);
  expect(saves).toBe(0);
});

test('a new route can place both blank endpoints on the map without committing on cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await login(page);
  await page.goto('/cms/routes');
  await page.getByRole('button', { name: 'Add route', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add route', exact: true });
  await expand(editor, 'Route map and ports');
  await expand(editor, 'Map setup');
  const first = await openMap(page, editor);
  await expect(first.apply).toBeDisabled();
  await expect(first.selected.locator('option')).toHaveCount(2);
  await first.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await pointValues(editor)).toEqual([]);
  const view = await openMap(page, editor);
  const placed: string[][] = [];
  for (const index of [0, 1]) {
    await view.selected.selectOption(String(index));
    await view.map.scrollIntoViewIfNeeded();
    const area = (await view.map.boundingBox())!;
    await page.mouse.click(area.x + area.width * (index === 0 ? .35 : .65), area.y + area.height * .55);
    await expect(view.latitude).not.toHaveValue('');
    await expect(view.longitude).not.toHaveValue('');
    placed.push([await view.latitude.inputValue(), await view.longitude.inputValue()]);
  }
  expect(placed[0]).not.toEqual(placed[1]);
  await expect(view.apply).toBeEnabled();
  await view.apply.click();
  expect(await pointValues(editor)).toEqual(placed);
});

test.describe('touch map point editor', () => {
  test.use({ hasTouch: true });
  for (const locale of ['en', 'th'] as const) {
    test(`map editing fits desktop and 320px in ${locale}, supports touch and discards backdrop changes`, async ({ page, browserName }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 1100 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await login(page);
      if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
      const { editor } = await openExisting(page, locale);
      const original = await pointValues(editor, locale);
      const view = await openMap(page, editor, locale);
      await view.selected.selectOption('5');
      await view.map.scrollIntoViewIfNeeded();
      const previous = [await view.latitude.inputValue(), await view.longitude.inputValue()];
      if (browserName === 'chromium') {
        const marker = (await view.map.locator('[data-route-point-index="5"]').boundingBox())!;
        const x = marker.x + marker.width / 2, y = marker.y + marker.height / 2;
        const session = await page.context().newCDPSession(page);
        try {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 4, y: y + step * 3 }] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally { await session.detach(); }
      } else {
        const area = (await view.map.boundingBox())!;
        await page.touchscreen.tap(area.x + area.width * .3, area.y + area.height * .6);
      }
      await expect.poll(async () => [await view.latitude.inputValue(), await view.longitude.inputValue()]).not.toEqual(previous);
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 800 : 1100 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await expect.poll(() => view.dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        if (width === 320) {
          await view.map.scrollIntoViewIfNeeded();
          // Choose actual exposed map space, excluding markers and sticky dialog controls.
          const spot = await view.map.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            for (const fy of [.5, .35, .65, .25, .75]) for (const fx of [.3, .7, .5]) {
              const x = bounds.x + bounds.width * fx, y = bounds.y + bounds.height * fy;
              const target = document.elementFromPoint(x, y);
              if (target && element.contains(target) && !target.closest('[data-route-point-index]')) return { x, y };
            }
            return null;
          });
          expect(spot).not.toBeNull();
          const beforeTap = [await view.latitude.inputValue(), await view.longitude.inputValue()];
          await page.touchscreen.tap(spot!.x, spot!.y);
          await expect.poll(async () => [await view.latitude.inputValue(), await view.longitude.inputValue()]).not.toEqual(beforeTap);
          const point = [Number(await view.latitude.inputValue()), Number(await view.longitude.inputValue())];
          await expect(view.dialog.getByRole('link', { name: translateCms(locale, 'Open in Google Maps'), exact: true }))
            .toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.join(','))}`);
        }
        await view.dialog.screenshot({ path: testInfo.outputPath(`route-map-editor-${locale}-${width}.png`), animations: 'disabled' });
      }
      for (let index = 0; index < 10; index++) {
        await page.keyboard.press('Tab');
        expect(await view.dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      }
      const bounds = (await view.dialog.boundingBox())!;
      await page.mouse.click(bounds.x / 2, bounds.y + bounds.height / 2);
      await expect(view.dialog).not.toBeVisible();
      await expect(view.opener).toBeFocused();
      expect(await pointValues(editor, locale)).toEqual(original);
    });
  }
});

test('a failed map background keeps existing points editable without losing the draft', async ({ page }) => {
  await login(page);
  const { editor } = await openExisting(page);
  await page.route('https://tile.openstreetmap.org/**', route => route.abort('failed'));
  const view = await openMap(page, editor);
  await expect(view.dialog.getByText(/map background is unavailable/i)).toBeVisible();
  await view.latitude.fill('13.123456789');
  await expect(view.apply).toBeEnabled();
  await view.apply.click();
  await expect(editor.getByLabel('Origin point · Latitude', { exact: true })).toHaveValue('13.123456789');
});
