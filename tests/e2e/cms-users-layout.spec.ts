import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN } from './fixtures';

async function clickOutside(page: Page, dialog: Locator) {
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThan(2);
  await page.mouse.click(bounds!.x / 2, bounds!.y + bounds!.height / 2);
}

test('the single refresh updates user cards and the layout fits desktop and narrow Thai screens', async ({ page, db }, testInfo) => {
  const accounts = db.collection<{ _id: string; username: string; [key: string]: unknown }>('moe_users');
  const source = await accounts.findOne({ _id: E2E_ADMIN.id });
  expect(source).not.toBeNull();
  const longName = 'operations-team-account-with-long-name';
  await accounts.insertMany([
    { ...source!, _id: randomUUID(), username: longName, role: 'Operator' },
    { ...source!, _id: randomUUID(), username: 'protected-developer', role: 'Dev' },
  ]);
  await login(page);
  await page.goto('/cms/users');
  const region = page.getByRole('region', { name: 'Users', exact: true });
  await expect(region.getByRole('listitem')).toHaveCount(3);
  const refresh = page.getByRole('button', { name: 'Refresh workspace', exact: true });
  await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(1);
  await expect(refresh).toHaveClass(/secondary/);
  await expect(region.getByRole('listitem').filter({ hasText: 'protected-developer' }).getByRole('button')).toHaveCount(0);
  await expect(region.getByRole('button', { name: `Move ${E2E_ADMIN.username} to Trash`, exact: true })).toHaveCount(0);

  // An external roster change must be picked up by the retained page refresh.
  await accounts.insertOne({ ...source!, _id: randomUUID(), username: 'newly-visible-operator', role: 'Operator' });
  let rosterReads = 0;
  page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/cms/users') rosterReads++; });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(region.getByRole('listitem')).toHaveCount(4);
  await expect(region.getByText('newly-visible-operator', { exact: true })).toBeVisible();
  expect(rosterReads).toBe(1);

  for (const [locale, width] of [['en', 1440], ['th', 320]] as const) {
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await page.setViewportSize({ width, height: 900 });
    const t = (source: string) => translateCms(locale, source);
    const users = page.getByRole('region', { name: t('Users'), exact: true });
    await expect(users.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('button', { name: t('Add user'), exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const card of await users.getByRole('listitem').all()) {
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    const first = await users.getByRole('listitem').nth(0).boundingBox();
    const second = await users.getByRole('listitem').nth(1).boundingBox();
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    if (width > 1000) expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    else expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    await page.screenshot({ path: testInfo.outputPath(`user-cards-${locale}-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('Add user closes by Cancel, Escape or backdrop, restores focus and clears private fields in both languages', async ({ page, db }, testInfo) => {
  await login(page);
  await page.goto('/cms/users');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/cms/users') writes++; });
  for (const [locale, width] of [['en', 1280], ['th', 320]] as const) {
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await page.setViewportSize({ width, height: 900 });
    const t = (source: string) => translateCms(locale, source);
    const opener = page.getByRole('button', { name: t('Add user'), exact: true });
    const dialog = page.getByRole('dialog', { name: t('Add user'), exact: true });
    for (const dismiss of ['Cancel', 'Escape', 'backdrop'] as const) {
      await opener.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel(t('Username'), { exact: true })).toHaveValue('');
      for (const label of ['Password', 'Confirm password', 'Your current password']) await expect(dialog.getByLabel(t(label), { exact: true })).toHaveValue('');
      await expect(dialog.getByLabel(t('Role'), { exact: true })).toHaveValue('Operator');
      await dialog.getByLabel(t('Username'), { exact: true }).fill('unsaved-new-user');
      await dialog.getByLabel(t('Role'), { exact: true }).selectOption('Admin');
      await dialog.getByLabel(t('Password'), { exact: true }).fill('Private-unsaved-password-2026!');
      await dialog.getByLabel(t('Your current password'), { exact: true }).fill('Private-current-password');
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab');
        await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      }
      if (dismiss === 'Cancel') {
        await page.screenshot({ path: testInfo.outputPath(`add-user-${locale}-${width}.png`), animations: 'disabled' });
        await dialog.getByRole('button', { name: t('Cancel'), exact: true }).click();
      } else if (dismiss === 'Escape') await page.keyboard.press('Escape');
      else await clickOutside(page, dialog);
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    }
  }
  expect(writes).toBe(0);
  expect(await db.collection('moe_users').countDocuments()).toBe(1);
});

test('Add user keeps its pending panel and failed input, then closes after one successful retry', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/users');
  const opener = page.getByRole('button', { name: 'Add user', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Add user', exact: true });
  const password = 'Retry-new-user-password-2026!';
  await dialog.getByLabel('Username', { exact: true }).fill('retry-card-user');
  await dialog.getByLabel('Role', { exact: true }).selectOption('Admin');
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm password', { exact: true }).fill(password);
  await dialog.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(() => release(), 25_000);
  let writes = 0;
  await page.route('**/api/cms/users', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    if (writes !== 1) return route.continue();
    await gate;
    await route.fulfill({ status: 503, json: { error: 'Synthetic user creation unavailable.' } });
  });
  try {
    await dialog.getByRole('button', { name: 'Add user', exact: true }).click();
    await expect(dialog.locator('[data-working-panel]')).toContainText('Adding user…');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await dialog.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    await page.keyboard.press('Escape');
    await clickOutside(page, dialog);
    await expect(dialog).toBeVisible();
    expect(writes).toBe(1);
    expect(await db.collection('moe_users').countDocuments({ username: 'retry-card-user' })).toBe(0);
  } finally { clearTimeout(timeout); release(); }
  await expect(dialog.getByRole('alert')).toHaveText('Synthetic user creation unavailable.');
  await expect(dialog.locator('[data-working-panel]')).toHaveCount(0);
  await expect(dialog.getByLabel('Username', { exact: true })).toHaveValue('retry-card-user');
  await expect(dialog.getByLabel('Role', { exact: true })).toHaveValue('Admin');
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveValue(password);
  await expect(dialog.getByLabel('Your current password', { exact: true })).toHaveValue(E2E_ADMIN.password);
  await dialog.getByRole('button', { name: 'Add user', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(writes).toBe(2);
  await expect(page.getByRole('region', { name: 'Users', exact: true }).getByText('retry-card-user', { exact: true })).toBeVisible();
  expect(await db.collection('moe_users').countDocuments({ username: 'retry-card-user' })).toBe(1);
});
