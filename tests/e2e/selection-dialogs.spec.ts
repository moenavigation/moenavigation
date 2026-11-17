import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { legacyRoutePorts } from '../../scripts/data/legacy-trading-routes';
import { routePortKey } from '../../src/lib/route-explorer';
import { test, expect, login, E2E_ADMIN } from './fixtures';

async function clickBackdrop(page: Page, dialog: Locator) {
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  const candidates = [
    { x: bounds!.x - 5, y: bounds!.y + bounds!.height / 2 },
    { x: bounds!.x + bounds!.width + 5, y: bounds!.y + bounds!.height / 2 },
    { x: bounds!.x + bounds!.width / 2, y: bounds!.y - 5 },
    { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height + 5 },
  ];
  const point = candidates.find(candidate => candidate.x > 0 && candidate.y > 0 && candidate.x < viewport.width && candidate.y < viewport.height);
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x, point!.y);
}

async function assertSimpleChoices(dialog: Locator) {
  const options = dialog.locator('[data-selection-option]');
  expect(await options.count()).toBeGreaterThan(0);
  await expect(dialog.locator('select, datalist, form, footer, button[type="submit"]')).toHaveCount(0);
  await expect(dialog.locator('p')).toHaveCount(0);
  for (const option of await options.all()) await expect(option).toHaveCSS('text-align', 'center');
}

for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  test.describe(`public selection dialogs · ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });

    test('origin and destination choices apply immediately and cancel safely in both languages', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      for (const locale of ['en', 'th'] as const) {
        await page.goto(`${locale === 'th' ? '/th' : ''}/routes`);
        const finder = page.getByRole('region', { name: locale === 'en' ? 'Find a route' : 'ค้นหาเส้นทาง', exact: true });
        await expect(page.locator('select, datalist')).toHaveCount(0);
        await expect(finder.getByRole('radio')).toHaveCount(5);

        for (const side of ['origin', 'destination'] as const) {
          const label = locale === 'en' ? side === 'origin' ? 'Origin' : 'Destination' : side === 'origin' ? 'ต้นทาง' : 'ปลายทาง';
          const trigger = finder.getByRole('button', { name: label, exact: true });
          const dialog = page.getByRole('dialog', { name: label, exact: true });
          const unchangedUrl = page.url();
          for (const cancel of ['close', 'escape', 'outside'] as const) {
            await trigger.click();
            await expect(dialog).toBeVisible();
            await assertSimpleChoices(dialog);
            if (cancel === 'close') await dialog.getByRole('button', { name: locale === 'en' ? 'Close dialog' : 'ปิดหน้าต่าง', exact: true }).click();
            else if (cancel === 'escape') await page.keyboard.press('Escape');
            else await clickBackdrop(page, dialog);
            await expect(dialog).not.toBeVisible();
            await expect(trigger).toBeFocused();
            await expect(trigger).toHaveAttribute('data-selection-value', '');
            expect(page.url()).toBe(unchangedUrl);
          }

          const port = side === 'origin' ? legacyRoutePorts.ranong : legacyRoutePorts.yangon;
          const key = routePortKey(port);
          await trigger.click();
          const option = dialog.locator('[data-selection-option]').filter({ hasText: locale === 'en' ? port.name : port.nameTh });
          await expect(option).toHaveCount(1);
          await option.click();
          await expect(dialog).not.toBeVisible();
          await expect(trigger).toBeFocused();
          await expect(trigger).toHaveAttribute('data-selection-value', key);
          expect(new URL(page.url()).searchParams.get(side === 'origin' ? 'from' : 'to')).toBe(key);
          await expect(finder.getByRole('radio')).toHaveCount(1);
          await expect(finder.locator('input[type="radio"][value="ranong-yangon"]')).toBeVisible();

          await trigger.click();
          await expect(dialog).toBeVisible();
          await page.screenshot({ path: testInfo.outputPath(`selection-${side}-${locale}-${viewport.name}.png`), animations: 'disabled' });
          await dialog.locator('[data-selection-option=""]').click();
          await expect(dialog).not.toBeVisible();
          await expect(finder.getByRole('radio')).toHaveCount(5);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        }
      }
    });
  });
}

test.describe('nested selection dialogs', () => {
  test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

  test('role safeguards remain enforced and choosing a role does not submit its parent user form', async ({ page, db }) => {
    await login(page);
    await page.goto('/cms/users');
    let writes = 0;
    page.on('request', request => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname === '/api/cms/users') writes++;
    });

    // The isolated fixture has one legacy Admin. Its last-manager protection
    // must remain disabled inside the replacement picker.
    await page.getByRole('button', { name: `Edit ${E2E_ADMIN.username}`, exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit user', exact: true });
    const protectedRole = edit.getByRole('button', { name: 'Role', exact: true });
    await protectedRole.click();
    const roleChoices = page.getByRole('dialog', { name: 'Role', exact: true });
    await expect(roleChoices.locator('[data-selection-option="Operator"]')).toBeDisabled();
    await expect(roleChoices.locator('[data-selection-option="Admin"]')).toBeEnabled();
    await expect(roleChoices.locator('[data-selection-option="Dev"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(roleChoices).not.toBeVisible();
    await expect(edit).toBeVisible();
    await expect(protectedRole).toBeFocused();
    await protectedRole.click();
    await clickBackdrop(page, roleChoices);
    await expect(roleChoices).not.toBeVisible();
    await expect(edit).toBeVisible();
    await expect(protectedRole).toBeFocused();
    await edit.getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.getByRole('button', { name: 'Add user', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add user', exact: true });
    await add.getByLabel('Username', { exact: true }).fill('selection-draft-user');
    await add.getByLabel('Password', { exact: true }).fill('Selection-draft-password-2026!');
    await add.getByLabel('Confirm password', { exact: true }).fill('Selection-draft-password-2026!');
    await add.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
    const role = add.getByRole('button', { name: 'Role', exact: true });
    await expect(role).toHaveAttribute('data-selection-value', 'Operator');
    await role.click();
    await assertSimpleChoices(roleChoices);
    await roleChoices.locator('[data-selection-option="Admin"]').click();
    await expect(roleChoices).not.toBeVisible();
    await expect(add).toBeVisible();
    await expect(role).toBeFocused();
    await expect(role).toHaveAttribute('data-selection-value', 'Admin');
    await expect(add.getByLabel('Username', { exact: true })).toHaveValue('selection-draft-user');
    await expect(add.getByLabel('Password', { exact: true })).toHaveValue('Selection-draft-password-2026!');
    for (const cancel of ['escape', 'outside'] as const) {
      await role.click();
      if (cancel === 'escape') await page.keyboard.press('Escape');
      else await clickBackdrop(page, roleChoices);
      await expect(roleChoices).not.toBeVisible();
      await expect(add).toBeVisible();
      await expect(role).toBeFocused();
      await expect(role).toHaveAttribute('data-selection-value', 'Admin');
    }
    expect(writes).toBe(0);
    expect(await db.collection('moe_users').findOne({ username: 'selection-draft-user' })).toBeNull();
    await add.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('selected route points use a nested picker without applying or closing the map draft', async ({ page }) => {
    await login(page);
    const response = await page.request.get('/api/cms/content');
    const record = ((await response.json()).records as ContentRecord[]).find(item => item.type === 'Route' && item.id === 'bkk-lcb')!;
    expect(record.waypoints!.length).toBeGreaterThan(2);
    await page.goto('/cms/routes');
    await page.getByRole('button', { name: `Edit ${record.title}`, exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit route', exact: true });
    const setup = editor.getByText('Route map and ports', { exact: true }).locator('xpath=ancestor::details[1]');
    await setup.locator(':scope > summary').click();
    let writes = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/content') writes++; });
    await editor.getByRole('button', { name: 'Edit points on map', exact: true }).click();
    const map = page.getByRole('dialog', { name: 'Edit points on map', exact: true });
    await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
    const point = map.getByRole('button', { name: 'Selected point', exact: true });
    await point.click();
    const choices = page.getByRole('dialog', { name: 'Selected point', exact: true });
    await assertSimpleChoices(choices);
    await choices.locator('[data-selection-option="1"]').click();
    await expect(choices).not.toBeVisible();
    await expect(point).toBeFocused();
    await expect(map).toBeVisible();
    await expect(point).toHaveAttribute('data-selection-value', '1');
    expect(Number(await map.getByRole('textbox', { name: 'Latitude', exact: true }).inputValue())).toBe(record.waypoints![1][0]);
    for (const cancel of ['escape', 'outside'] as const) {
      await point.click();
      if (cancel === 'escape') await page.keyboard.press('Escape');
      else await clickBackdrop(page, choices);
      await expect(choices).not.toBeVisible();
      await expect(point).toBeFocused();
      await expect(map).toBeVisible();
      await expect(point).toHaveAttribute('data-selection-value', '1');
    }
    expect(writes).toBe(0);
    await map.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(map).not.toBeVisible();
    await expect(editor).toBeVisible();
    const after = await page.request.get('/api/cms/content');
    expect(((await after.json()).records as ContentRecord[]).find(item => item.id === record.id && item.type === 'Route')!.waypoints).toEqual(record.waypoints);
  });
});
