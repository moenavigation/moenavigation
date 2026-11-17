import type { Locator, Page } from '@playwright/test';
import type { ContentRecord, RouteSpecs } from '../../src/lib/cms-types';
import { test, expect, login } from './fixtures';

async function openEditor(page: Page, title: string) {
  await page.goto('/cms/routes');
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit route', exact: true });
  await expect(editor).toBeVisible();
  const details = editor.getByText('Route details', { exact: true }).locator('xpath=ancestor::details[1]');
  await expect(details).not.toHaveAttribute('open');
  await details.locator(':scope > summary').click();
  return editor;
}

async function saveEditor(page: Page, editor: Locator): Promise<ContentRecord> {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  return (await response.json()).record;
}

test.use({ viewport: { width: 390, height: 844 } });

test('route detail inputs reject invalid ranges and round-trip valid edits and cleared ranges without changing the map', async ({ page, db }) => {
  test.setTimeout(120_000);
  const collection = db.collection<ContentRecord & { _id: string }>('moe_content');
  const before = await collection.findOne({ type: 'Route', deletedAt: { $exists: false }, status: 'Published' });
  expect(before).not.toBeNull();
  expect(before!.origin).toBeTruthy();
  expect(before!.destination).toBeTruthy();
  expect(before!.waypoints!.length).toBeGreaterThanOrEqual(2);
  // Synthetic values are written only to the fixture-owned isolated database.
  const initial: RouteSpecs = { distanceNm: 58.125, capacityMinTeu: 72, capacityMaxTeu: 120, sailingMinHours: 8.5, sailingMaxHours: 10.5 };
  await collection.updateOne({ _id: before!._id }, { $set: { routeSpecs: initial } });
  await login(page);
  const editor = await openEditor(page, before!.title);
  const labels = {
    distanceNm: 'Distance (NM)', capacityMinTeu: 'Capacity from (TEU)', capacityMaxTeu: 'Capacity to (TEU)',
    sailingMinHours: 'Sailing time from (hours)', sailingMaxHours: 'Sailing time to (hours)',
  } as const;
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    await expect(editor.getByLabel(labels[key], { exact: true })).toHaveValue(String(initial[key]));
  }
  let saves = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/cms/content' && request.method() === 'POST') saves++; });
  await editor.getByLabel('Capacity from (TEU)', { exact: true }).fill('121');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Maximum capacity cannot be less than minimum capacity.');
  expect(saves).toBe(0);
  expect((await collection.findOne({ _id: before!._id }))!.revision).toBe(before!.revision);
  await expect(editor.getByLabel('Capacity from (TEU)', { exact: true })).toHaveValue('121');

  await editor.getByLabel('Capacity from (TEU)', { exact: true }).fill('72');
  await editor.getByLabel('Sailing time to (hours)', { exact: true }).fill('');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Enter both sailing-time limits, or leave both blank.');
  expect(saves).toBe(0);
  expect((await collection.findOne({ _id: before!._id }))!.routeSpecs).toEqual(initial);

  const changed: RouteSpecs = { distanceNm: 59.75, capacityMinTeu: 72, capacityMaxTeu: 120, sailingMinHours: 32.5, sailingMaxHours: 35.5 };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) await editor.getByLabel(labels[key], { exact: true }).fill(String(changed[key]));
  const saved = await saveEditor(page, editor);
  expect(saves).toBe(1);
  expect(saved.routeSpecs).toEqual(changed);
  for (const field of ['origin', 'destination', 'waypoints', 'image', 'title', 'titleTh'] as const) expect(saved[field]).toEqual(before![field]);
  expect((await collection.findOne({ _id: before!._id }))!.routeSpecs).toEqual(changed);

  const reopened = await openEditor(page, before!.title);
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) await expect(reopened.getByLabel(labels[key], { exact: true })).toHaveValue(String(changed[key]));
  await reopened.getByLabel('Sailing time from (hours)', { exact: true }).fill('');
  await reopened.getByLabel('Sailing time to (hours)', { exact: true }).fill('');
  const cleared = await saveEditor(page, reopened);
  const remaining = { distanceNm: 59.75, capacityMinTeu: 72, capacityMaxTeu: 120 };
  expect(saves).toBe(2);
  expect(cleared.routeSpecs).toEqual(remaining);
  const stored = await collection.findOne({ _id: before!._id });
  expect(stored!.routeSpecs).toEqual(remaining);
  expect(stored!.revision).toBe(before!.revision + 2);
  expect(Object.hasOwn(stored!.routeSpecs!, 'sailingMinHours')).toBe(false);
  expect(Object.hasOwn(stored!.routeSpecs!, 'sailingMaxHours')).toBe(false);
  for (const field of ['origin', 'destination', 'waypoints', 'image', 'title', 'titleTh'] as const) expect(stored![field]).toEqual(before![field]);

  const final = await openEditor(page, before!.title);
  await expect(final.getByLabel('Sailing time from (hours)', { exact: true })).toHaveValue('');
  await expect(final.getByLabel('Sailing time to (hours)', { exact: true })).toHaveValue('');
  await expect(final.getByLabel('Distance (NM)', { exact: true })).toHaveValue('59.75');
  expect(await final.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await final.getByRole('button', { name: 'Cancel', exact: true }).click();
});
