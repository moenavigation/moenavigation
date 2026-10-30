import { test, expect, login, E2E_ADMIN } from './fixtures';

test('a late successful self-rename cannot revive the expired workspace or start another roster read', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/users');
  const users = page.getByRole('region', { name: 'Users', exact: true });
  await expect(users.getByRole('button', { name: `Edit ${E2E_ADMIN.username}`, exact: true })).toBeVisible();
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  let markCommitted!: () => void;
  const committed = new Promise<void>(resolve => { markCommitted = resolve; });
  let expired = false;
  let writes = 0;
  let lateRosterReads = 0;
  await page.route('**/api/cms/users', async route => {
    if (route.request().method() !== 'PATCH') {
      if (expired && route.request().method() === 'GET') lateRosterReads++;
      return route.continue();
    }
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    markCommitted();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    await users.getByRole('button', { name: `Edit ${E2E_ADMIN.username}`, exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit user', exact: true });
    await edit.getByLabel('Username', { exact: true }).fill('audit-self-renamed');
    await edit.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await committed;
    expired = true;
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signIn).toBeVisible();
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/cms/users' && value.request().method() === 'PATCH');
    releaseResponse();
    expect((await response).status()).toBe(200);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(signIn).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open user settings', exact: true })).toHaveCount(0);
    expect(writes).toBe(1);
    expect(lateRosterReads).toBe(0);
    expect(await db.collection('moe_users').findOne({ username: 'audit-self-renamed' })).not.toBeNull();
  } finally { releaseResponse(); }
});
test('user settings dismiss during a held roster read and restore scrolling through the nested photo dialog', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 360, height: 780 });
  const initialOverflow = await page.evaluate(() => document.body.style.overflow);
  let releaseRoster!: () => void;
  const rosterGate = new Promise<void>(resolve => { releaseRoster = resolve; });
  let markReading!: () => void;
  const reading = new Promise<void>(resolve => { markReading = resolve; });
  let reads = 0;
  await page.route('**/api/cms/users', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    reads++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    markReading();
    await rosterGate;
    await route.fulfill({ response });
  });
  try {
    const avatar = page.getByRole('button', { name: 'Open user settings', exact: true });
    await avatar.click();
    await reading;
    const settings = page.getByRole('dialog', { name: 'User settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByLabel('Current password', { exact: true })).toBeDisabled();
    await expect(settings.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
    await expect(settings.getByRole('button', { name: 'Change profile photo', exact: true })).toBeDisabled();
    await expect(settings.getByRole('button', { name: 'Close user settings', exact: true })).toBeEnabled();
    await expect(settings.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    for (const action of ['Escape', 'Close user settings', 'Cancel']) {
      if (action === 'Escape') await page.keyboard.press('Escape');
      else await settings.getByRole('button', { name: action, exact: true }).click();
      await expect(settings).not.toBeVisible();
      await expect(avatar).toBeFocused();
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
      if (action !== 'Cancel') { await avatar.click(); await expect(settings).toBeVisible(); }
    }
    expect(reads).toBe(1);
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/cms/users' && value.request().method() === 'GET');
    releaseRoster(); await response;
    const rowTrigger = page.getByRole('button', { name: 'User settings', exact: true });
    await expect(rowTrigger).toBeEnabled(); await rowTrigger.click();
    await settings.getByRole('button', { name: 'Change profile photo', exact: true }).click();
    const photo = page.getByRole('dialog', { name: 'Profile photo', exact: true });
    await expect(photo).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape'); await expect(photo).not.toBeVisible();
    await expect(settings).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape'); await expect(settings).not.toBeVisible();
    await expect(rowTrigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
    await rowTrigger.click(); await settings.getByRole('button', { name: 'Change profile photo', exact: true }).click();
    await expect(photo).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(initialOverflow);
  } finally { releaseRoster(); }
});

