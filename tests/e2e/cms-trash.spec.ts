import { randomUUID } from 'node:crypto';
import { request as apiRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { Db } from 'mongodb';
import { translateCms } from '../../src/lib/cms-locale';
import type { CmsTrashPage } from '../../src/lib/cms-trash';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';

type Account = { _id: string; username: string; passwordHash: string; passwordVersion: number; createdAt: Date; role?: string; deletedAt?: Date; purgeAt?: Date };
const origin = { Origin: E2E_BASE_URL };
const credentials = (id: string) => ({ id, currentPassword: E2E_ADMIN.password });

async function expectStatus(response: Pick<APIResponse, 'status' | 'text'>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

async function account(db: Db, username: string, role: string, deletedAt?: Date, purgeAt?: Date) {
  const source = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(source).not.toBeNull();
  const user: Account = { ...source!, _id: randomUUID(), username, role, passwordVersion: 1, createdAt: new Date(), ...(deletedAt ? { deletedAt, purgeAt: purgeAt || new Date(deletedAt.getTime() + 30 * 86400000) } : {}) };
  await db.collection<Account>('moe_users').insertOne(user);
  return user;
}

async function signIn(username: string = E2E_ADMIN.username) {
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  await expectStatus(await client.post('/api/cms/login', { data: { username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } }), 200);
  return client;
}

async function readTrash(client: APIRequestContext, params = new URLSearchParams()) {
  const response = await client.get(`/api/cms/trash${params.size ? `?${params}` : ''}`);
  await expectStatus(response, 200);
  return await response.json() as CmsTrashPage;
}

async function mixedContent(db: Db, suffix: string, title: string, deletedAt: Date) {
  const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
  const source = await content.findOne({ type: 'News', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  const item = { ...source!, _id: `News:${suffix}`, id: suffix, title, titleTh: `ถังขยะชุดทดสอบ ${suffix}`, revision: 1, deletedAt: deletedAt.toISOString(), purgeAt: new Date(deletedAt.getTime() + 30 * 86400000) };
  await content.insertOne(item);
  return item;
}

async function mixedImage(db: Db, suffix: string, title: string, deletedAt: Date) {
  const item = { _id: suffix, id: suffix, title, url: `${E2E_IMAGE_ORIGIN}v1/${suffix}.png`, publicId: `moe-e2e/${suffix}`, state: 'trashed', owner: E2E_ADMIN.id, submissionId: randomUUID(), pinned: true, createdAt: deletedAt.toISOString(), touchedAt: deletedAt, trashedAt: deletedAt.toISOString() };
  await db.collection<{ _id: string } & Record<string, unknown>>('moe_media').insertOne(item);
  return item;
}

test('removed user accounts retain identity for recovery while access and earlier sessions stay disabled', async ({ db }) => {
  const target = await account(db, 'recoverable-operator', 'Operator');
  const users = db.collection<Account>('moe_users');
  const admin = await signIn();
  const oldSession = await signIn(target.username);
  const visitor = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  try {
    await expectStatus(await admin.delete('/api/cms/users', { data: credentials(target._id) }), 200);
    const removed = await users.findOne({ _id: target._id });
    expect(removed).toMatchObject({ username: target.username, role: 'Operator', passwordHash: target.passwordHash, passwordVersion: 2, deletedAt: expect.any(Date), purgeAt: expect.any(Date) });
    expect(removed!.purgeAt!.getTime() - removed!.deletedAt!.getTime()).toBe(30 * 86400000);
    expect((await (await admin.get('/api/cms/users')).json()).users).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: target._id })]));
    await expectStatus(await oldSession.get('/api/cms/content'), 401);
    await expectStatus(await visitor.post('/api/cms/login', { data: { username: target.username, password: E2E_ADMIN.password, ...await loginChallengeData(visitor) } }), 401);
    await expectStatus(await admin.post('/api/cms/users', { data: { username: target.username, role: 'Operator', password: E2E_ADMIN.password, currentPassword: E2E_ADMIN.password } }), 409);
    expect((await readTrash(admin, new URLSearchParams({ kind: 'User' }))).items).toEqual(expect.arrayContaining([expect.objectContaining({ key: `User:${target._id}`, title: target.username, role: 'Operator' })]));

    await expectStatus(await admin.post('/api/cms/users/restore', { data: credentials(target._id) }), 200);
    const restored = await users.findOne({ _id: target._id });
    expect(restored).toMatchObject({ role: 'Operator', passwordHash: target.passwordHash, passwordVersion: 3 });
    expect(restored).not.toHaveProperty('deletedAt');
    expect(restored).not.toHaveProperty('purgeAt');
    await expectStatus(await oldSession.get('/api/cms/content'), 401);
    const restoredSession = await signIn(target.username);
    try { expect((await (await restoredSession.get('/api/cms/session')).json()).user).toMatchObject({ id: target._id, role: 'Operator' }); }
    finally { await restoredSession.dispose(); }
    await expectStatus(await admin.post('/api/cms/users/remove', { data: credentials(target._id) }), 409);
    await expectStatus(await admin.delete('/api/cms/users', { data: credentials(target._id) }), 200);
    await expectStatus(await admin.post('/api/cms/users/remove', { data: credentials(target._id) }), 200);
    expect(await users.findOne({ _id: target._id })).toBeNull();
  } finally { await admin.dispose(); await oldSession.dispose(); await visitor.dispose(); }
});

test('user Trash obeys roles, active-account guards, and expiry without exposing private account data', async ({ db }) => {
  const now = new Date();
  const developer = await account(db, 'trash-acting-dev', 'Dev');
  const protectedDev = await account(db, 'trash-protected-dev', 'Dev', now);
  const removedOperator = await account(db, 'trash-retained-operator', 'Operator', now);
  const operator = await account(db, 'trash-limited-operator', 'Operator');
  const expired = await account(db, 'trash-expired-user', 'Operator', new Date(Date.now() - 31 * 86400000), new Date(Date.now() - 86400000));
  const [admin, dev, op] = await Promise.all([signIn(), signIn(developer.username), signIn(operator.username)]);
  try {
    const adminTrash = await readTrash(admin, new URLSearchParams({ kind: 'User' }));
    const protectedRow = adminTrash.items.find(item => item.key === `User:${protectedDev._id}`);
    expect(protectedRow).toMatchObject({ role: 'Dev', canRestore: false, canDelete: false });
    expect(adminTrash.items.some(item => item.key === `User:${expired._id}`)).toBe(false);
    expect(JSON.stringify(adminTrash)).not.toMatch(/passwordHash|passwordVersion|scrypt:|sessionId|submissionId|owner/);
    const limited = await readTrash(op, new URLSearchParams({ kind: 'User' }));
    expect(limited.total).toBe(0);
    expect(limited.items).toEqual([]);
    expect(limited.counts.User).toBe(0);
    expect((await readTrash(op, new URLSearchParams({ item: `User:${removedOperator._id}` }))).total).toBe(0);
    await expectStatus(await op.get('/api/cms/users/trash'), 403);
    for (const route of ['restore', 'remove']) {
      await expectStatus(await admin.post(`/api/cms/users/${route}`, { data: credentials(protectedDev._id) }), 403);
      await expectStatus(await op.post(`/api/cms/users/${route}`, { data: credentials(removedOperator._id) }), 403);
      await expectStatus(await admin.post(`/api/cms/users/${route}`, { data: credentials(expired._id) }), 404);
      await expectStatus(await admin.post(`/api/cms/users/${route}`, { data: credentials(operator._id) }), 409);
    }
    await expectStatus(await dev.post('/api/cms/users/restore', { data: credentials(protectedDev._id) }), 200);
    await expectStatus(await dev.delete('/api/cms/users', { data: credentials(protectedDev._id) }), 200);
    await expectStatus(await dev.post('/api/cms/users/remove', { data: credentials(protectedDev._id) }), 200);
    for (const [client, id] of [[admin, E2E_ADMIN.id], [dev, developer._id], [op, operator._id]] as const) {
      await expectStatus(await client.post('/api/cms/users/remove', { data: credentials(id) }), 400);
    }
    expect(await db.collection<Account>('moe_users').findOne({ _id: protectedDev._id })).toBeNull();
    expect(await db.collection<Account>('moe_users').findOne({ _id: removedOperator._id })).toMatchObject({ role: 'Operator', deletedAt: now });
  } finally { await admin.dispose(); await dev.dispose(); await op.dispose(); }
});

test('unified Trash searches every kind and paginates timestamp ties without duplicate or hidden accounts', async ({ db, page }) => {
  const deletedAt = new Date();
  const operator = await account(db, 'mixed-current-operator', 'Operator');
  for (let index = 0; index < 18; index++) {
    const suffix = String(index).padStart(2, '0');
    await mixedContent(db, `mixed-content-${suffix}`, `Mixed [cargo].* content ${suffix}`, deletedAt);
    await mixedImage(db, `mixed-image-${suffix}`, `Mixed [cargo].* image ${suffix}`, deletedAt);
    await account(db, `mixed-user-${suffix}`, 'Operator', deletedAt);
  }
  await account(db, 'mixed-protected-dev', 'Dev', deletedAt);
  await db.collection<{ _id: string }>('moe_media').updateOne({ _id: 'mixed-image-17' }, { $set: { state: 'deleting', pinned: false } });
  await expectStatus(await page.request.get('/api/cms/trash'), 401);
  const admin = await signIn();
  const op = await signIn(operator.username);
  try {
    const first = await readTrash(admin, new URLSearchParams({ q: 'mixed' }));
    expect(first.items).toHaveLength(30);
    expect(first.total).toBe(55);
    expect(first.counts).toMatchObject({ All: 55, News: 18, Image: 18, User: 19 });
    expect(first.items.find(item => item.key === 'Image:mixed-image-17')).toMatchObject({ canRestore: false, canDelete: true });
    expect(first.nextCursor).toEqual(expect.any(String));
    const next = await readTrash(admin, new URLSearchParams({ q: 'mixed', cursor: first.nextCursor! }));
    expect(next.items).toHaveLength(25);
    expect(next.total).toBe(55);
    expect(next.nextCursor).toBeNull();
    const keys = [...first.items, ...next.items].map(item => item.key);
    expect(new Set(keys).size).toBe(55);
    expect(keys).toEqual([...keys].sort());
    expect((await readTrash(admin, new URLSearchParams({ q: '[cargo].*' }))).total).toBe(36);
    expect((await readTrash(admin, new URLSearchParams({ q: 'ถังขยะชุดทดสอบ' }))).total).toBe(18);
    const focused = await readTrash(admin, new URLSearchParams({ kind: 'User', q: 'no-matching-search', item: 'News:mixed-content-00' }));
    expect(focused.total).toBe(1);
    expect(focused.items[0].key).toBe('News:mixed-content-00');
    const operatorTrash = await readTrash(op);
    expect(operatorTrash.total).toBe(36);
    expect(operatorTrash.counts).toMatchObject({ All: 36, User: 0 });
    expect(operatorTrash.items.every(item => item.kind !== 'User')).toBe(true);
    for (const [client, trash] of [[admin, first], [op, operatorTrash]] as const) {
      const overview = await client.get('/api/cms/content?scope=overview');
      await expectStatus(overview, 200);
      expect((await overview.json()).summary.trashCount).toBe(trash.counts.All);
    }
    expect((await readTrash(op, new URLSearchParams({ kind: 'User', q: 'mixed' }))).items).toEqual([]);
    expect(JSON.stringify([...first.items, ...next.items])).not.toMatch(/passwordHash|passwordVersion|scrypt:|sessionId|submissionId|owner/);
    for (const path of ['/api/cms/trash?kind=Invalid', '/api/cms/trash?q=a&q=b', `/api/cms/trash?kind=Image&cursor=${encodeURIComponent(first.nextCursor!)}`]) {
      await expectStatus(await admin.get(path), 400);
    }
    await expectStatus(await op.get(`/api/cms/trash?q=mixed&cursor=${encodeURIComponent(first.nextCursor!)}`), 400);
    await page.context().addCookies((await admin.storageState()).cookies);
    await page.goto('/cms/trash');
    const list = page.getByRole('region', { name: 'Trash items', exact: true });
    await expect(list.locator('[data-trash-key]')).toHaveCount(30);
    await list.getByRole('button', { name: 'Load more items', exact: true }).click();
    await expect(list.locator('[data-trash-key]')).toHaveCount(55);
    await expect(list.getByRole('button', { name: 'Load more items', exact: true })).toHaveCount(0);
    expect(await list.locator('[data-trash-key]').evaluateAll(elements => new Set(elements.map(element => element.getAttribute('data-trash-key'))).size)).toBe(55);
  } finally { await admin.dispose(); await op.dispose(); }
});

test('Trash shows recoverable shared sections and requires deleted page parents to be restored first', async ({ db }) => {
  const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
  const pageSource = await content.findOne({ _id: 'Page:home' });
  const sectionSource = await content.findOne({ type: 'Section', deletedAt: { $exists: false } });
  expect(pageSource && sectionSource).toBeTruthy();
  const retained = { revision: 1, deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 86400000) };
  await content.insertMany([
    { ...pageSource!, ...retained, _id: 'Page:trash-parent', id: 'trash-parent' },
    { ...sectionSource!, ...retained, _id: 'Section:trash-child', id: 'trash-child', parentId: 'trash-parent' },
    { ...sectionSource!, ...retained, _id: 'Section:trash-shared', id: 'trash-shared', parentId: 'shared' },
  ]);
  const admin = await signIn();
  try {
    const shared = await readTrash(admin, new URLSearchParams({ item: 'Section:trash-shared' }));
    expect(shared.items[0]).toMatchObject({ canRestore: true });
    const child = await readTrash(admin, new URLSearchParams({ item: 'Section:trash-child' }));
    expect(child.items[0]).toMatchObject({ canRestore: false, restoreBlockedReason: expect.any(String) });
    const parent = await readTrash(admin, new URLSearchParams({ item: 'Page:trash-parent' }));
    expect(parent.items[0]).toMatchObject({ canRestore: true, canDelete: false, deleteBlockedReason: expect.any(String) });
    await expectStatus(await admin.post('/api/cms/content/action', { data: { id: 'trash-parent', type: 'Page', expectedRevision: 1, action: 'restore' } }), 200);
    expect((await readTrash(admin, new URLSearchParams({ item: 'Section:trash-child' }))).items[0]).toMatchObject({ canRestore: true });
  } finally { await admin.dispose(); }
});

test('one Trash list supports reversible filters and mixed-item recovery in English and Thai', async ({ page, db }) => {
  const deletedAt = new Date();
  const content = await mixedContent(db, 'mixed-ui-content', 'Mixed content example', deletedAt);
  const image = await mixedImage(db, 'mixed-ui-image', 'Mixed image example', deletedAt);
  const restoreUser = await account(db, 'mixed-ui-user-restore', 'Operator', deletedAt);
  const deleteUser = await account(db, 'mixed-ui-user-delete', 'Admin', deletedAt);
  await login(page);
  await page.goto('/cms/trash');
  const list = page.getByRole('region', { name: 'Trash items', exact: true });
  const rows = list.locator('[data-trash-key]');
  await expect(rows).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Images', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Deleted content', exact: true })).toHaveCount(0);
  await list.getByRole('button', { name: 'Filter Trash', exact: true }).click();
  const filter = page.getByRole('dialog', { name: 'Filter Trash', exact: true });
  await filter.getByRole('radio', { name: 'Images', exact: true }).check();
  await filter.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await list.getByRole('button', { name: 'Filter Trash', exact: true }).click();
  await expect(filter.getByRole('radio', { name: 'All items', exact: true })).toBeChecked();
  await filter.getByRole('radio', { name: 'Images', exact: true }).check();
  await filter.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-trash-key', `Image:${image.id}`);
  await list.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await list.getByRole('button', { name: 'Filter Trash', exact: true }).click();
  await filter.getByRole('radio', { name: 'User accounts', exact: true }).check();
  await filter.getByRole('button', { name: 'Reset selection', exact: true }).click();
  await expect(filter.getByRole('radio', { name: 'All items', exact: true })).toBeChecked();
  await filter.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await list.getByRole('searchbox', { name: 'Search Trash', exact: true }).fill('example');
  await expect(rows).toHaveCount(2);
  await list.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(rows).toHaveCount(4);

  for (const [width, locale] of [[1280, 'en'], [360, 'th']] as const) {
    await page.setViewportSize({ width, height: 900 });
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    const t = (value: string) => translateCms(locale, value);
    if (locale === 'th') for (const value of ['Trash items', 'Search Trash', 'Filter Trash', 'Item type']) expect(t(value)).not.toBe(value);
    const translatedList = page.getByRole('region', { name: t('Trash items'), exact: true });
    await expect(translatedList.locator('[data-trash-key]')).toHaveCount(4);
    await expect(translatedList.getByRole('searchbox', { name: t('Search Trash'), exact: true })).toBeVisible();
    await translatedList.getByRole('button', { name: t('Filter Trash'), exact: true }).click();
    const translatedFilter = page.getByRole('dialog', { name: t('Filter Trash'), exact: true });
    await expect(translatedFilter.getByRole('radiogroup', { name: t('Item type'), exact: true })).toBeVisible();
    await expect.poll(() => translatedFilter.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/cms-trash-filter-${locale}-${width}.png`, fullPage: true });
    await translatedFilter.getByRole('button', { name: t('Cancel'), exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/cms-trash-${locale}-${width}.png`, fullPage: true });
  }
  await page.locator('header [data-cms-language-switch]').click();
  await list.getByRole('button', { name: `Restore ${image.title}`, exact: true }).click();
  await expect(list.locator(`[data-trash-key="Image:${image.id}"]`)).toHaveCount(0);
  expect(await db.collection<{ _id: string }>('moe_media').findOne({ _id: image.id })).toMatchObject({ state: 'committed' });
  await list.getByRole('button', { name: `Restore ${content.title}`, exact: true }).click();
  await expect(list.locator(`[data-trash-key="News:${content.id}"]`)).toHaveCount(0);
  expect(await db.collection('moe_content').findOne({ id: content.id })).not.toHaveProperty('deletedAt');
  await list.getByRole('button', { name: `Restore ${restoreUser.username}`, exact: true }).click();
  const restore = page.getByRole('dialog', { name: 'Restore user', exact: true });
  await restore.getByLabel('Your current password', { exact: true }).fill('incorrect-password');
  await restore.getByRole('button', { name: 'Restore user', exact: true }).click();
  await expect(restore.getByRole('alert')).toContainText('Your current password is incorrect.');
  await restore.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
  await restore.getByRole('button', { name: 'Restore user', exact: true }).click();
  await expect(restore).not.toBeVisible();
  await expect(list.locator(`[data-trash-key="User:${restoreUser._id}"]`)).toHaveCount(0);
  expect(await db.collection<Account>('moe_users').findOne({ _id: restoreUser._id })).toMatchObject({ role: 'Operator', passwordHash: restoreUser.passwordHash });

  const remove = list.getByRole('button', { name: `Delete ${deleteUser.username} permanently`, exact: true });
  await remove.click();
  const confirmation = page.getByRole('dialog', { name: 'Delete user permanently', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  await confirmation.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
  await confirmation.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(list.getByRole('searchbox', { name: 'Search Trash', exact: true })).toBeFocused();
  expect(await db.collection<Account>('moe_users').findOne({ _id: deleteUser._id })).toBeNull();
});

test('a lost successful account restore response reconciles the list without repeating the write', async ({ page, db }) => {
  const target = await account(db, 'lost-response-user', 'Operator', new Date());
  await login(page);
  await page.goto('/cms/trash');
  const list = page.getByRole('region', { name: 'Trash items', exact: true });
  const row = list.locator(`[data-trash-key="User:${target._id}"]`);
  await expect(row).toBeVisible();
  let restoreRequests = 0;
  await page.route('**/api/cms/users/restore', async route => {
    restoreRequests++;
    await expectStatus(await route.fetch(), 200);
    await route.abort('failed');
  });
  await row.getByRole('button', { name: `Restore ${target.username}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore user', exact: true });
  await dialog.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
  const reconciled = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/cms/trash' && url.searchParams.get('item') === `User:${target._id}` && response.request().method() === 'GET';
  });
  await dialog.getByRole('button', { name: 'Restore user', exact: true }).click();
  await expectStatus(await reconciled, 200);
  await expect(dialog).not.toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(list.getByRole('status').filter({ hasText: 'This item is no longer in Trash. The list has been refreshed.' })).toBeVisible();
  await expect(list.getByRole('status').filter({ hasText: 'Showing 0 of 0 items' })).toBeVisible();
  await expect(list.getByRole('searchbox', { name: 'Search Trash', exact: true })).toBeFocused();
  await expect(list.getByRole('alert')).toHaveCount(0);
  expect(restoreRequests).toBe(1);
  const restored = await db.collection<Account>('moe_users').findOne({ _id: target._id });
  expect(restored).toMatchObject({ role: 'Operator', passwordVersion: 2, passwordHash: target.passwordHash });
  expect(restored).not.toHaveProperty('deletedAt');
});

test('failed image removal stays in Trash with a retry action and no unsafe restore action', async ({ page, db }) => {
  const image = await mixedImage(db, 'provider-failure-image', 'Retry image removal', new Date());
  await login(page);
  await page.goto('/cms/trash');
  const list = page.getByRole('region', { name: 'Trash items', exact: true });
  const row = list.locator(`[data-trash-key="Image:${image.id}"]`);
  const remove = row.getByRole('button', { name: `Delete ${image.title} permanently`, exact: true });
  await expect(row.getByRole('button', { name: `Restore ${image.title}`, exact: true })).toBeVisible();
  for (let attempt = 0; attempt < 2; attempt++) {
    await remove.click();
    const dialog = page.getByRole('dialog', { name: 'Delete permanently', exact: true });
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/media/remove' && response.request().method() === 'POST');
    // The isolated runner disables Cloudinary credentials, so this exercises the
    // retained deletion claim without making a request to the real provider.
    await dialog.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expectStatus(await failed, 502);
    await expect(dialog.getByRole('alert')).toContainText('The image could not be removed.');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(remove).toBeEnabled();
    await expect(row.getByRole('button', { name: `Restore ${image.title}`, exact: true })).toHaveCount(0);
    await expect(row).toContainText('This image is waiting for permanent deletion. Retry deleting it to finish.');
    expect(await db.collection<{ _id: string }>('moe_media').findOne({ _id: image.id })).toMatchObject({ state: 'deleting', pinned: false, publicId: image.publicId, trashedAt: image.trashedAt });
  }
  await page.reload();
  await expect(remove).toBeVisible();
  await expect(row.getByRole('button', { name: `Restore ${image.title}`, exact: true })).toHaveCount(0);
  const trash = await readTrash(page.request);
  const overview = await page.request.get('/api/cms/content?scope=overview');
  await expectStatus(overview, 200);
  expect((await overview.json()).summary.trashCount).toBe(trash.counts.All);
});
