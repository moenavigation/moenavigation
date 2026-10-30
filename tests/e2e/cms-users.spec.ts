import type { Page } from '@playwright/test';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';

async function openUserSettings(page: Page) {
  await page.goto('/cms/users');
  await page.getByRole('button', { name: 'User settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'User settings', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(E2E_ADMIN.username, { exact: true })).toBeVisible();
  return dialog;
}

test('administrators can be added, reset and removed without exposing or retaining passwords', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Users');
  await expect(page.getByRole('region', { name: 'Users' }).getByText(E2E_ADMIN.username, { exact: true })).toBeVisible();
  const add = page.getByRole('region', { name: 'Add user' });
  await add.getByRole('textbox', { name: 'Username' }).fill('second-admin');
  await add.getByLabel('Role', { exact: true }).selectOption('Admin');
  await add.getByLabel('Password', { exact: true }).fill('A-strong-new-admin-password-2026');
  await add.getByLabel('Confirm password').fill('A-strong-new-admin-password-2026');
  await add.getByLabel('Your current password').fill(E2E_ADMIN.password);
  await add.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByText('User added. Share the password privately.')).toBeVisible();
  const created = await db.collection<{ _id: string; username: string; passwordHash: string; passwordVersion: number }>('moe_users').findOne({ username: 'second-admin' });
  expect(created?.passwordHash).toMatch(/^scrypt:/);
  expect(created?.passwordHash).not.toContain('A-strong-new-admin-password-2026');
  const origin = new URL(page.url()).origin;
  const blockedReset = await page.request.patch('/api/cms/users', { headers: { Origin: origin }, data: { id: created?._id, password: 'Different-strong-password-2026', currentPassword: 'wrong-password' } });
  expect(blockedReset.status()).toBe(403);
  const self = await db.collection<{ _id: string; username: string }>('moe_users').findOne({ username: E2E_ADMIN.username });
  const blockedSelfRemoval = await page.request.delete('/api/cms/users', { headers: { Origin: origin }, data: { id: self?._id, currentPassword: E2E_ADMIN.password } });
  expect(blockedSelfRemoval.status()).toBe(400);
  expect(await db.collection('moe_users').countDocuments()).toBe(2);
  await page.getByRole('button', { name: 'Edit second-admin', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit user', exact: true });
  await edit.getByRole('button', { name: 'Reset password', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Reset password', exact: true });
  await reset.getByLabel('New password', { exact: true }).fill('Different-strong-password-2026');
  await reset.getByLabel('Confirm new password').fill('Different-strong-password-2026');
  await reset.getByLabel('Your current password').fill(E2E_ADMIN.password);
  await reset.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password updated. Existing sessions for this user were signed out.')).toBeVisible();
  expect((await db.collection<{ username: string; passwordVersion: number }>('moe_users').findOne({ username: 'second-admin' }))?.passwordVersion).toBe(2);
  await expect(reset).not.toBeVisible();
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Move second-admin to Trash' }).click();
  const remove = page.getByRole('region', { name: 'Move user to Trash' });
  await remove.getByLabel('Your current password').fill(E2E_ADMIN.password);
  const updatedOverview = page.waitForResponse(response => response.url().includes('/api/cms/content?scope=overview') && response.status() === 200);
  await remove.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(page.getByText('User moved to Trash. Access is disabled until restored.')).toBeVisible();
  expect(await db.collection('moe_users').countDocuments({ deletedAt: { $exists: false } })).toBe(1);
  await expect(page.getByRole('button', { name: `Move ${E2E_ADMIN.username} to Trash` })).toHaveCount(0);
  const overview = await (await updatedOverview).json();
  expect(overview.summary.trashCount).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'CMS navigation', exact: true }).getByRole('button', { name: `Trash (${overview.summary.trashCount})`, exact: true })).toBeVisible();
});

test('personal user settings change the password and revoke previous sessions while keeping the current user signed in', async ({ page, db }) => {
  await login(page);
  const originalSession = (await page.context().cookies()).find(cookie => cookie.name === 'moe_cms_session');
  expect(originalSession).toBeDefined();
  await page.goto('/cms/setting');
  const avatar = page.getByRole('button', { name: 'Open user settings', exact: true });
  await avatar.click();
  await expect(page).toHaveURL(/\/cms\/users$/);
  const dialog = page.getByRole('dialog', { name: 'User settings', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(E2E_ADMIN.username, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(avatar).toBeFocused();
  await avatar.click();
  await expect(dialog).toBeVisible();
  const password = 'Updated-personal-password-2026!';
  await dialog.getByLabel('Current password', { exact: true }).fill(E2E_ADMIN.password);
  await dialog.getByLabel('New password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm new password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Your password has been updated.', { exact: true })).toBeVisible();
  const user = await db.collection<{ username: string; passwordHash: string; passwordVersion: number }>('moe_users').findOne({ username: E2E_ADMIN.username });
  expect(user?.passwordVersion).toBe(2);
  expect(user?.passwordHash).toMatch(/^scrypt:/);
  expect(user?.passwordHash).not.toContain(password);
  const session = await page.request.get('/api/cms/session');
  expect((await session.json()).user?.username).toBe(E2E_ADMIN.username);
  const stale = await page.request.get('/api/cms/content', { headers: { Cookie: `moe_cms_session=${originalSession!.value}` } });
  expect(stale.status()).toBe(401);
  const oldLogin = await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { ...E2E_ADMIN, ...await loginChallengeData(page.request) } });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { username: E2E_ADMIN.username, password, ...await loginChallengeData(page.request) } });
  expect(newLogin.status()).toBe(200);
  await page.getByRole('button', { name: 'User settings', exact: true }).click();
  for (const label of ['Current password', 'New password', 'Confirm new password']) await expect(dialog.getByLabel(label, { exact: true })).toHaveValue('');
});

test('personal password validation and failed saves preserve input for a successful retry', async ({ page }) => {
  await login(page);
  const dialog = await openUserSettings(page);
  let requests = 0;
  await page.route('**/api/cms/password', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: 'Temporary test service failure.' } });
    return route.continue();
  });
  const password = 'Retry-personal-password-2026!';
  await dialog.getByLabel('Current password', { exact: true }).fill(E2E_ADMIN.password);
  await dialog.getByLabel('New password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('Different-personal-password-2026!');
  await dialog.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The new passwords do not match.');
  expect(requests).toBe(0);
  await dialog.getByLabel('Confirm new password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Temporary test service failure.');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Current password', { exact: true })).toHaveValue(E2E_ADMIN.password);
  await expect(dialog.getByLabel('New password', { exact: true })).toHaveValue(password);
  await expect(dialog.getByLabel('Confirm new password', { exact: true })).toHaveValue(password);
  await expect(page.getByText('Your password has been updated.', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Your password has been updated.', { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('user settings fit narrow screens, contain keyboard focus and clear passwords when closed in both CMS languages', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/cms/users');
  for (const language of ['en', 'th'] as const) {
    const text = (value: string) => language === 'en' ? value : cmsMainThai[value];
    const trigger = page.getByRole('button', { name: text('User settings'), exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: text('User settings'), exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(text('Current password'), { exact: true }).fill('Unsaved-private-password');
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    for (const label of ['Current password', 'New password', 'Confirm new password']) await expect(dialog.getByLabel(text(label), { exact: true })).toHaveValue('');
    await page.keyboard.press('Escape');
    if (language === 'en') await page.locator('header [data-cms-language-switch]').click();
  }
});
