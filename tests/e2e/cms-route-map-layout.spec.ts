import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { test, expect, login } from './fixtures';

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

async function checkPointRow(page: Page, dialog: Locator, locale: CmsLocale) {
  const t = (source: string) => translateCms(locale, source);
  const selected = dialog.getByRole('button', { name: t('Selected point'), exact: true });
  const latitude = dialog.getByRole('textbox', { name: t('Latitude'), exact: true });
  const longitude = dialog.getByRole('textbox', { name: t('Longitude'), exact: true });
  const fields = selected.locator('xpath=ancestor::fieldset[1]');
  await fields.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const boxes = await Promise.all([selected, latitude, longitude].map(control => control.boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const [point, lat, lng] = boxes.map(box => box!);
  expect(Math.max(point.y, lat.y, lng.y) - Math.min(point.y, lat.y, lng.y), 'All three controls share one row.').toBeLessThanOrEqual(1);
  expect(point.x + point.width).toBeLessThanOrEqual(lat.x + 1);
  expect(lat.x + lat.width).toBeLessThanOrEqual(lng.x + 1);
  for (const box of [point, lat, lng]) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const text = await selected.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const style = getComputedStyle(element);
    return { lines: new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size, whiteSpace: style.whiteSpace, overflow: style.overflowX, ellipsis: style.textOverflow };
  });
  expect(text.whiteSpace).toBe('nowrap');
  expect(text.overflow).toBe('hidden');
  expect(text.ellipsis).toBe('ellipsis');
  expect(text.lines).toBe(1);
  await expect.poll(() => fields.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(dialog.locator('select, datalist')).toHaveCount(0);
  return { selected, latitude, longitude };
}

for (const width of [320, 390, 1440]) test.describe(`CMS route map single-row controls at ${width}px`, () => {
  test.use({ viewport: { width, height: width < 700 ? 900 : 1100 }, reducedMotion: 'reduce' });
  for (const locale of ['en', 'th'] as const) test(`point picker stays beside coordinates and selects immediately in ${locale}`, async ({ page }, testInfo) => {
    await login(page);
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    const t = (source: string) => translateCms(locale, source);
    const before = (await records(page)).find(record => record.type === 'Route' && record.origin && record.destination && (record.waypoints?.length ?? 0) > 12)!;
    expect(before).toBeTruthy();
    await page.goto('/cms/routes');
    const title = locale === 'th' ? before.titleTh || before.title : before.title;
    await page.getByRole('button', { name: translateCms(locale, 'Edit {name}', { name: title }), exact: true }).click();
    const editor = page.getByRole('dialog', { name: t('Edit route'), exact: true });
    const setup = editor.getByText(t('Route map and ports'), { exact: true }).locator('xpath=ancestor::details[1]');
    if (!await setup.evaluate(element => element.hasAttribute('open'))) await setup.locator(':scope > summary').click();
    const opener = editor.getByRole('button', { name: t('Edit points on map'), exact: true });
    let writes = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') writes++; });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: t('Edit points on map'), exact: true });
    await expect(dialog.getByRole('region', { name: t('Route point editor map'), exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: t('Zoom in'), exact: true })).toBeEnabled();
    const view = await checkPointRow(page, dialog, locale);
    await view.selected.click();
    const picker = page.getByRole('dialog', { name: t('Selected point'), exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-selection-option]')).toHaveCount(before.waypoints!.length);
    const index = 11;
    await picker.locator(`[data-selection-option="${index}"]`).click();
    await expect(picker).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(view.selected).toBeFocused();
    await expect(view.selected).toHaveAttribute('data-selection-value', String(index));
    await expect(view.selected).toHaveText(`${index + 1}. ${translateCms(locale, 'Intermediate point {number}', { number: index })}`);
    await expect(view.selected).toHaveAccessibleDescription(`${index + 1}. ${translateCms(locale, 'Intermediate point {number}', { number: index })}`);
    // Existing coordinate text intentionally retains its original spacing.
    await expect.poll(async () => Number(await view.latitude.inputValue())).toBe(before.waypoints![index][0]);
    await expect.poll(async () => Number(await view.longitude.inputValue())).toBe(before.waypoints![index][1]);
    await checkPointRow(page, dialog, locale);
    await dialog.screenshot({ path: testInfo.outputPath(`cms-route-map-row-${width}-${locale}.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: t('Cancel'), exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(editor).toBeVisible();
    expect(writes).toBe(0);
    expect((await records(page)).find(record => record.id === before.id)).toEqual(before);
  });
});
