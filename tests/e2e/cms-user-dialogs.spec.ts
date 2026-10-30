import { randomUUID } from 'node:crypto';
import { request as apiRequest, type Locator, type Page } from '@playwright/test';
import type { Db } from 'mongodb';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';

type Account = { _id: string; username: string; role?: 'Dev' | 'Admin' | 'Operator'; passwordHash: string; passwordVersion: number; createdAt: Date };
const newPassword = 'Nested-reset-safe-password-2026!';

async function seedTarget(db: Db, extraRows = 0) {
  const original = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  const target = { ...original!, _id: randomUUID(), username: 'dialog-target', role: 'Operator' as const, createdAt: new Date() };
  await db.collection<Account>('moe_users').insertMany([target, ...Array.from({ length: extraRows }, (_, index) => ({ ...target, _id: randomUUID(), username: `dialog-list-${index}` }))]);
  return target;
}

async function openEdit(page: Page, username: string) {
  await page.goto('/cms/users');
  const opener = page.getByRole('button', { name: `Edit ${username}`, exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Edit user', exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, opener };
}

async function fillReset(dialog: Locator, password: string = newPassword, currentPassword: string = E2E_ADMIN.password) {
  await dialog.getByLabel('New password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm new password', { exact: true }).fill(password);
  await dialog.getByLabel('Your current password', { exact: true }).fill(currentPassword);
}

test('Edit and nested Reset cancellation preserve the edit draft without writing and reopening clears discarded credentials', async ({ page, db }) => {
  const target = await seedTarget(db);
  await login(page);
  const { dialog: edit, opener } = await openEdit(page, target.username);
  let writes = 0;
  await page.route('**/api/cms/users', async route => {
    if (route.request().method() === 'PATCH') writes++;
    return route.continue();
  });
  await edit.getByLabel('Username', { exact: true }).fill('unsaved-dialog-name');
  await edit.getByLabel('Role', { exact: true }).selectOption('Admin');
  await edit.getByLabel('Your current password', { exact: true }).fill('unsaved-actor-password');
  const resetTrigger = edit.getByRole('button', { name: 'Reset password', exact: true });
  await resetTrigger.click();
  const reset = page.getByRole('dialog', { name: 'Reset password', exact: true });
  await fillReset(reset);
  await reset.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(reset).not.toBeVisible();
  await expect(resetTrigger).toBeFocused();
  await expect(edit.getByLabel('Username', { exact: true })).toHaveValue('unsaved-dialog-name');
  await expect(edit.getByLabel('Role', { exact: true })).toHaveValue('Admin');
  await expect(edit.getByLabel('Your current password', { exact: true })).toHaveValue('unsaved-actor-password');
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(writes).toBe(0);
  expect(await db.collection<Account>('moe_users').findOne({ _id: target._id })).toMatchObject({ username: target.username, role: 'Operator', passwordVersion: target.passwordVersion });
  const users = page.getByRole('region', { name: 'Users', exact: true });
  await expect(users.getByRole('button', { name: 'Reset password', exact: true })).toHaveCount(0);
  await opener.click();
  await expect(edit.getByLabel('Username', { exact: true })).toHaveValue(target.username);
  await expect(edit.getByLabel('Your current password', { exact: true })).toHaveValue('');
  await edit.getByLabel('Username', { exact: true }).fill('saved-dialog-name');
  await edit.getByLabel('Your current password', { exact: true }).fill('incorrect-actor-password');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('Your current password is incorrect.');
  await expect(edit.getByLabel('Username', { exact: true })).toHaveValue('saved-dialog-name');
  await edit.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(users.getByRole('button', { name: 'Edit saved-dialog-name', exact: true })).toBeFocused();
  expect(writes).toBe(2);
  await users.getByRole('button', { name: `Edit ${E2E_ADMIN.username}`, exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Reset password', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('nested Reset validates and preserves failed input, blocks duplicate submissions and revokes target sessions on success', async ({ page, db }) => {
  const target = await seedTarget(db);
  const oldSession = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  expect((await oldSession.post('/api/cms/login', { data: { username: target.username, password: E2E_ADMIN.password, ...await loginChallengeData(oldSession) } })).status()).toBe(200);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let markCommitted!: () => void;
  const committed = new Promise<void>(resolve => { markCommitted = resolve; });
  let writes = 0;
  try {
    await login(page);
    const { dialog: edit } = await openEdit(page, target.username);
    await edit.getByLabel('Username', { exact: true }).fill('edit-draft-stays-unsaved');
    await edit.getByLabel('Role', { exact: true }).selectOption('Admin');
    const resetTrigger = edit.getByRole('button', { name: 'Reset password', exact: true });
    await resetTrigger.click();
    const reset = page.getByRole('dialog', { name: 'Reset password', exact: true });
    await page.route('**/api/cms/users', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      writes++;
      if (writes === 2) return route.fulfill({ status: 503, json: { error: 'Temporary reset service failure.' } });
      if (writes < 3) return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      markCommitted();
      await gate;
      await route.fulfill({ response });
    });
    await fillReset(reset, newPassword, '');
    await reset.getByRole('button', { name: 'Save new password', exact: true }).click();
    expect(writes).toBe(0);
    expect(await reset.getByLabel('Your current password', { exact: true }).evaluate(element => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
    await reset.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
    await reset.getByLabel('Confirm new password', { exact: true }).fill('A-different-password-2026!');
    await reset.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(reset.getByRole('alert')).toContainText('Passwords do not match.');
    expect(writes).toBe(0);
    await fillReset(reset, newPassword, 'wrong-actor-password');
    await reset.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(reset.getByRole('alert')).toContainText('Your current password is incorrect.');
    await expect(reset.getByLabel('New password', { exact: true })).toHaveValue(newPassword);
    await reset.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
    await reset.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(reset.getByRole('alert')).toContainText('Temporary reset service failure.');
    for (const label of ['New password', 'Confirm new password']) await expect(reset.getByLabel(label, { exact: true })).toHaveValue(newPassword);
    await expect(reset.getByLabel('Your current password', { exact: true })).toHaveValue(E2E_ADMIN.password);
    expect((await (await oldSession.get('/api/cms/session')).json()).user?.username).toBe(target.username);
    await reset.locator('form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await committed;
    await expect(reset.locator('form')).toHaveAttribute('aria-busy', 'true');
    await expect(reset.getByRole('button', { name: 'Close reset password', exact: true })).toBeDisabled();
    await expect(reset.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(reset).toBeVisible();
    expect(writes).toBe(3);
    release();
    await expect(reset).not.toBeVisible();
    await expect(resetTrigger).toBeFocused();
    await expect(edit.getByLabel('Username', { exact: true })).toHaveValue('edit-draft-stays-unsaved');
    await expect(edit.getByLabel('Role', { exact: true })).toHaveValue('Admin');
    expect(await db.collection<Account>('moe_users').findOne({ _id: target._id })).toMatchObject({ username: target.username, role: 'Operator', passwordVersion: target.passwordVersion + 1 });
    expect((await oldSession.get('/api/cms/users')).status()).toBe(401);
    expect((await oldSession.post('/api/cms/login', { data: { username: target.username, password: newPassword, ...await loginChallengeData(oldSession) } })).status()).toBe(200);
    await resetTrigger.click();
    for (const label of ['New password', 'Confirm new password', 'Your current password']) await expect(reset.getByLabel(label, { exact: true })).toHaveValue('');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  } finally { release(); await oldSession.dispose(); }
});

test('session expiry closes both user dialogs and a late reset success cannot restore the workspace or its scroll lock', async ({ page, db }) => {
  const target = await seedTarget(db);
  await login(page);
  const initialOverflow = await page.evaluate(() => document.body.style.overflow);
  const { dialog: edit } = await openEdit(page, target.username);
  await edit.getByRole('button', { name: 'Reset password', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Reset password', exact: true });
  await fillReset(reset);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let markCommitted!: () => void;
  const committed = new Promise<void>(resolve => { markCommitted = resolve; });
  let expired = false;
  let lateReads = 0;
  await page.route('**/api/cms/users', async route => {
    if (route.request().method() !== 'PATCH') {
      if (expired && route.request().method() === 'GET') lateReads++;
      return route.continue();
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    markCommitted(); await gate; await route.fulfill({ response });
  });
  try {
    await reset.getByRole('button', { name: 'Save new password', exact: true }).click();
    await committed;
    expired = true;
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signIn).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/cms/users' && value.request().method() === 'PATCH');
    release(); expect((await response).status()).toBe(200);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(signIn).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
    expect(lateReads).toBe(0);
    expect((await db.collection<Account>('moe_users').findOne({ _id: target._id }))?.passwordVersion).toBe(target.passwordVersion + 1);
  } finally { release(); }
});

async function checkDialog(page: Page, dialog: Locator) {
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1); expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  const controls = dialog.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled)').filter({ visible: true });
  await controls.last().focus(); await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await controls.first().focus(); await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
}

async function checkFocusedInput(input: Locator) {
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport({ ratio: 0.98 });
  expect(await input.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  })).toBe(true);
}

for (const screen of [
  { locale: 'en', width: 1280, height: 800 },
  { locale: 'th', width: 360, height: 640 },
  { locale: 'th', width: 844, height: 390 },
] as const) test.describe(`${screen.locale} ${screen.width}x${screen.height} user dialogs`, () => {
  test.use({ viewport: { width: screen.width, height: screen.height }, hasTouch: true });
  test('Edit and nested Reset fit, retain focus and lock background scrolling until both close', async ({ page, db }, testInfo) => {
    const target = await seedTarget(db, 15);
    await page.addInitScript(locale => localStorage.setItem('moe-cms-language', locale), screen.locale);
    expect((await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) } })).status()).toBe(200);
    await page.goto('/cms/users');
    const t = (value: string) => translateCms(screen.locale, value);
    const opener = page.getByRole('button', { name: translateCms(screen.locale, 'Edit {name}', { name: target.username }), exact: true });
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    await opener.tap();
    const edit = page.getByRole('dialog', { name: t('Edit user'), exact: true });
    await expect(edit).toBeVisible(); await checkDialog(page, edit);
    await expect(edit.locator('[data-cms-language-switch]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('edit-user.png'), animations: 'disabled' });
    await edit.getByRole('button', { name: t('Save changes'), exact: true }).click();
    await checkFocusedInput(edit.getByLabel(t('Your current password'), { exact: true }));
    const resetTrigger = edit.getByRole('button', { name: t('Reset password'), exact: true });
    await resetTrigger.tap();
    const reset = page.getByRole('dialog', { name: t('Reset password'), exact: true });
    await expect(reset).toBeVisible(); await checkDialog(page, reset);
    await expect(reset.locator('[data-cms-language-switch]')).toHaveCount(0);
    const position = await page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
    expect(position.max).toBeGreaterThan(100);
    const box = await reset.boundingBox();
    const delta = position.y < position.max / 2 ? 400 : -400;
    const frames = await page.evaluateHandle(() => {
      const values: number[] = []; const start = performance.now();
      const finished = new Promise<number[]>(resolve => {
        function frame(now: number) { values.push(scrollY); if (now - start >= 500) resolve(values); else requestAnimationFrame(frame); }
        requestAnimationFrame(frame);
      });
      return { finished };
    });
    try {
      await page.mouse.move(box!.x / 2, screen.height / 2); await page.mouse.wheel(0, delta);
      const values = await frames.evaluate(async value => value.finished);
      expect(Math.max(...values.map(value => Math.abs(value - position.y)))).toBeLessThanOrEqual(1);
    } finally { await frames.dispose(); }
    await reset.getByRole('button', { name: t('Save new password'), exact: true }).scrollIntoViewIfNeeded();
    await expect(reset.getByRole('button', { name: t('Save new password'), exact: true })).toBeInViewport({ ratio: 0.98 });
    await page.screenshot({ path: testInfo.outputPath('reset-password.png'), animations: 'disabled' });
    await reset.getByRole('button', { name: t('Save new password'), exact: true }).click();
    await checkFocusedInput(reset.getByLabel(t('New password'), { exact: true }));
    await page.keyboard.press('Escape'); await expect(reset).not.toBeVisible();
    await expect(resetTrigger).toBeFocused(); await expect(edit).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape'); await expect(edit).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
    const before = await page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
    await page.mouse.move(3, screen.height / 2); await page.mouse.wheel(0, before.y < before.max / 2 ? 400 : -400);
    await expect.poll(() => page.evaluate(previous => Math.abs(scrollY - previous), before.y)).toBeGreaterThan(1);
  });
});
