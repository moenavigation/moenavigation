import { randomUUID } from 'node:crypto';
import { request as apiRequest, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import type { Db } from 'mongodb';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';

type Account = { _id: string; username: string; role?: string; passwordHash: string; passwordVersion: number; createdAt: Date };
const resetPassword = 'Role-tests-replacement-password-2026!';

async function seedAccounts(db: Db, entries: Array<[string, string]>) {
  const users = db.collection<Account>('moe_users');
  const original = await users.findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  const accounts = entries.map(([username, role]) => ({ ...original!, _id: randomUUID(), username, role, passwordVersion: 1, createdAt: new Date() }));
  await users.insertMany(accounts);
  return accounts;
}

async function signIn(username: string, password: string = E2E_ADMIN.password) {
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  const response = await client.post('/api/cms/login', { data: { username, password, ...await loginChallengeData(client) } });
  expect(response.status(), await response.text()).toBe(200);
  return client;
}

async function expectStatus(response: Pick<APIResponse, 'status' | 'text'>, code: number) {
  expect(response.status(), await response.text()).toBe(code);
}

const mutation = (id: string, extra: Record<string, unknown> = {}) => ({ id, currentPassword: E2E_ADMIN.password, ...extra });

async function useSession(page: Page, client: APIRequestContext) {
  await page.context().clearCookies();
  await page.context().addCookies((await client.storageState()).cookies);
  await page.goto('/cms/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Users');
}

test('legacy accounts retain Admin access and only Dev can create Dev accounts', async ({ db }) => {
  const [developer] = await seedAccounts(db, [['role-dev', 'Dev']]);
  const admin = await signIn(E2E_ADMIN.username);
  const dev = await signIn(developer.username);
  try {
    const roster = await (await admin.get('/api/cms/users')).json();
    expect(roster.actorRole).toBe('Admin');
    expect(roster.users.find((user: { id: string }) => user.id === E2E_ADMIN.id)).toMatchObject({ role: 'Admin', current: true });
    expect(JSON.stringify(roster)).not.toMatch(/passwordHash|passwordVersion|scrypt:/);
    expect((await (await admin.get('/api/cms/session')).json()).user).toMatchObject({ role: 'Admin' });
    for (const role of ['Dev', 'Admin', 'Operator'] as const) {
      const adminResponse = await admin.post('/api/cms/users', { data: { username: `admin-creates-${role.toLowerCase()}`, password: resetPassword, role, currentPassword: E2E_ADMIN.password } });
      await expectStatus(adminResponse, role === 'Dev' ? 403 : 201);
      const devResponse = await dev.post('/api/cms/users', { data: { username: `dev-creates-${role.toLowerCase()}`, password: resetPassword, role, currentPassword: E2E_ADMIN.password } });
      await expectStatus(devResponse, 201);
      const created = await db.collection<Account>('moe_users').findOne({ username: `dev-creates-${role.toLowerCase()}` });
      expect(created).toMatchObject({ role, passwordVersion: 1 });
      expect(created?.passwordHash).toMatch(/^scrypt:/);
      expect(created?.passwordHash).not.toContain(resetPassword);
    }
    expect(await db.collection<Account>('moe_users').countDocuments({ username: 'admin-creates-dev' })).toBe(0);
  } finally { await admin.dispose(); await dev.dispose(); }
});

test('Admin can manage Admin and Operator accounts but cannot alter, reset, delete or grant Dev', async ({ db }) => {
  const [developer, otherAdmin, operator] = await seedAccounts(db, [['protected-dev', 'Dev'], ['managed-admin', 'Admin'], ['managed-operator', 'Operator']]);
  const admin = await signIn(E2E_ADMIN.username);
  const previousSessions = await Promise.all([signIn(otherAdmin.username), signIn(operator.username)]);
  try {
    await expectStatus(await admin.patch('/api/cms/users', { data: mutation(developer._id, { username: 'unauthorized-name' }) }), 403);
    await expectStatus(await admin.patch('/api/cms/users', { data: mutation(developer._id, { password: resetPassword }) }), 403);
    await expectStatus(await admin.delete('/api/cms/users', { data: mutation(developer._id) }), 403);
    await expectStatus(await admin.patch('/api/cms/users', { data: mutation(operator._id, { role: 'Dev' }) }), 403);
    for (const [index, target] of [otherAdmin, operator].entries()) {
      await expectStatus(await admin.patch('/api/cms/users', { data: mutation(target._id, { username: `${target.username}-edited`, role: target.role }) }), 200);
      await expectStatus(await previousSessions[index].get('/api/cms/content'), 401);
      await expectStatus(await admin.patch('/api/cms/users', { data: mutation(target._id, { password: resetPassword }) }), 200);
      const newSession = await signIn(`${target.username}-edited`, resetPassword);
      try {
        await expectStatus(await admin.delete('/api/cms/users', { data: mutation(target._id) }), 200);
        await expectStatus(await newSession.get('/api/cms/content'), 401);
      } finally { await newSession.dispose(); }
    }
    expect(await db.collection<Account>('moe_users').findOne({ _id: developer._id })).toMatchObject({ username: developer.username, role: 'Dev', passwordHash: developer.passwordHash, passwordVersion: 1 });
    expect(await db.collection<Account>('moe_users').countDocuments({ _id: { $in: [otherAdmin._id, operator._id] }, deletedAt: { $exists: true } })).toBe(2);
  } finally { await admin.dispose(); await Promise.all(previousSessions.map(session => session.dispose())); }
});

test('Dev can edit, reset and remove every role and promote lower roles without leaving stale access', async ({ db }) => {
  const [developer, targetDev, otherAdmin, operator, removableAdmin] = await seedAccounts(db, [['acting-dev', 'Dev'], ['target-dev', 'Dev'], ['promoted-admin', 'Admin'], ['dev-manages-operator', 'Operator'], ['dev-removes-admin', 'Admin']]);
  const dev = await signIn(developer.username);
  const oldDev = await signIn(targetDev.username);
  const oldAdmin = await signIn(otherAdmin.username);
  try {
    await expectStatus(await dev.patch('/api/cms/users', { data: mutation(targetDev._id, { username: 'edited-dev', role: 'Dev' }) }), 200);
    await expectStatus(await oldDev.get('/api/cms/content'), 401);
    await expectStatus(await dev.patch('/api/cms/users', { data: mutation(targetDev._id, { password: resetPassword }) }), 200);
    const recoveredDev = await signIn('edited-dev', resetPassword);
    try {
      await expectStatus(await dev.delete('/api/cms/users', { data: mutation(targetDev._id) }), 200);
      await expectStatus(await recoveredDev.get('/api/cms/content'), 401);
    } finally { await recoveredDev.dispose(); }
    await expectStatus(await dev.patch('/api/cms/users', { data: mutation(otherAdmin._id, { role: 'Dev' }) }), 200);
    await expectStatus(await oldAdmin.get('/api/cms/users'), 401);
    const promoted = await signIn(otherAdmin.username);
    try { expect((await (await promoted.get('/api/cms/session')).json()).user?.role).toBe('Dev'); }
    finally { await promoted.dispose(); }
    for (const target of [operator, removableAdmin]) {
      await expectStatus(await dev.patch('/api/cms/users', { data: mutation(target._id, { username: `${target.username}-edited`, role: target.role }) }), 200);
      await expectStatus(await dev.patch('/api/cms/users', { data: mutation(target._id, { password: resetPassword }) }), 200);
      await expectStatus(await dev.delete('/api/cms/users', { data: mutation(target._id) }), 200);
      expect(await db.collection<Account>('moe_users').findOne({ _id: target._id })).toMatchObject({ deletedAt: expect.any(Date), purgeAt: expect.any(Date) });
    }
    expect(await db.collection<Account>('moe_users').findOne({ _id: targetDev._id })).toMatchObject({ deletedAt: expect.any(Date), purgeAt: expect.any(Date) });
  } finally { await dev.dispose(); await oldDev.dispose(); await oldAdmin.dispose(); }
});

test('the last privileged account cannot demote itself and unknown roles never receive Admin permissions', async ({ db }) => {
  const [unknown] = await seedAccounts(db, [['invalid-role', 'unexpected-role']]);
  const admin = await signIn(E2E_ADMIN.username);
  const invalid = await signIn(unknown.username);
  try {
    expect((await (await invalid.get('/api/cms/session')).json()).user?.role).toBe('Operator');
    await expectStatus(await invalid.post('/api/cms/users', { data: { username: 'invalid-role-create', role: 'Admin', password: resetPassword, currentPassword: E2E_ADMIN.password } }), 403);
    await expectStatus(await admin.patch('/api/cms/users', { data: mutation(E2E_ADMIN.id, { role: 'Operator' }) }), 409);
    await expectStatus(await admin.patch('/api/cms/users', { data: mutation(E2E_ADMIN.id, { username: 'renamed-current-admin', role: 'Admin' }) }), 200);
    expect((await (await admin.get('/api/cms/session')).json()).user).toMatchObject({ username: 'renamed-current-admin', role: 'Admin' });
  } finally { await admin.dispose(); await invalid.dispose(); }
});

test('Operator cannot create or edit accounts, and no role can remove itself', async ({ db }) => {
  const [developer, admin, operator] = await seedAccounts(db, [['self-dev', 'Dev'], ['self-admin', 'Admin'], ['self-operator', 'Operator']]);
  const clients = await Promise.all([developer, admin, operator].map(account => signIn(account.username)));
  try {
    for (const role of ['Dev', 'Admin', 'Operator'] as const) {
      await expectStatus(await clients[2].post('/api/cms/users', { data: { username: `operator-creates-${role.toLowerCase()}`, role, password: resetPassword, currentPassword: E2E_ADMIN.password } }), 403);
    }
    for (const account of [developer, admin, operator]) {
      await expectStatus(await clients[2].patch('/api/cms/users', { data: mutation(account._id, { username: 'operator-edited', role: 'Dev' }) }), 403);
    }
    for (const [index, account] of [developer, admin, operator].entries()) {
      await expectStatus(await clients[index].delete('/api/cms/users', { data: mutation(account._id) }), 400);
      expect(await db.collection<Account>('moe_users').countDocuments({ _id: account._id })).toBe(1);
    }
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});

test('Operator cannot reset or remove any account but can change its own password', async ({ db }) => {
  const accounts = await seedAccounts(db, [['reset-dev', 'Dev'], ['reset-admin', 'Admin'], ['reset-operator', 'Operator']]);
  const operator = await signIn(accounts[2].username);
  try {
    for (const account of accounts) {
      const reset = await operator.patch('/api/cms/users', { data: mutation(account._id, { password: resetPassword }) });
      expect([400, 403]).toContain(reset.status());
      const remove = await operator.delete('/api/cms/users', { data: mutation(account._id) });
      expect(account._id === accounts[2]._id ? [400] : [403]).toContain(remove.status());
      expect(await db.collection<Account>('moe_users').findOne({ _id: account._id })).toMatchObject({ passwordHash: account.passwordHash, passwordVersion: 1 });
    }
    await expectStatus(await operator.post('/api/cms/password', { data: { currentPassword: E2E_ADMIN.password, newPassword: resetPassword } }), 200);
    expect((await (await operator.get('/api/cms/session')).json()).user?.role).toBe('Operator');
    const updated = await db.collection<Account>('moe_users').findOne({ _id: accounts[2]._id });
    expect(updated).toMatchObject({ role: 'Operator', passwordVersion: 2 });
  } finally { await operator.dispose(); }
});

test('demotion revokes earlier sessions and simultaneous self-demotions cannot remove the last Dev', async ({ db }) => {
  const [firstDev, secondDev, admin] = await seedAccounts(db, [['first-dev', 'Dev'], ['second-dev', 'Dev'], ['demoted-admin', 'Admin']]);
  const [first, second, oldAdmin] = await Promise.all([firstDev, secondDev, admin].map(account => signIn(account.username)));
  try {
    await expectStatus(await first.patch('/api/cms/users', { data: mutation(admin._id, { role: 'Operator' }) }), 200);
    await expectStatus(await oldAdmin.post('/api/cms/users', { data: { username: 'stale-admin-create', role: 'Admin', password: resetPassword, currentPassword: E2E_ADMIN.password } }), 401);
    const demoted = await signIn(admin.username);
    try {
      expect((await (await demoted.get('/api/cms/session')).json()).user?.role).toBe('Operator');
      await expectStatus(await demoted.post('/api/cms/users', { data: { username: 'demoted-create', role: 'Admin', password: resetPassword, currentPassword: E2E_ADMIN.password } }), 403);
      await expectStatus(await demoted.post('/api/cms/media/remove', { data: { mediaId: 'nonexistent-role-image' } }), 403);
    } finally { await demoted.dispose(); }
    const attempts = await Promise.all([
      first.patch('/api/cms/users', { data: mutation(firstDev._id, { role: 'Admin' }) }),
      second.patch('/api/cms/users', { data: mutation(secondDev._id, { role: 'Admin' }) }),
    ]);
    expect(attempts.map(result => result.status()).sort()).toEqual([200, 409]);
    expect(await db.collection<Account>('moe_users').countDocuments({ role: 'Dev' })).toBe(1);
    const winner = attempts[0].status() === 200 ? first : second;
    expect((await (await winner.get('/api/cms/session')).json()).user?.role).toBe('Admin');
  } finally { await first.dispose(); await second.dispose(); await oldAdmin.dispose(); }
});

test('self-demotion renews the current session with reduced permissions immediately', async ({ db }) => {
  const [developer] = await seedAccounts(db, [['self-demoted-dev', 'Dev'], ['remaining-dev', 'Dev']]);
  const dev = await signIn(developer.username);
  try {
    const response = await dev.patch('/api/cms/users', { data: mutation(developer._id, { role: 'Operator' }) });
    await expectStatus(response, 200);
    expect((await response.json()).user).toMatchObject({ username: developer.username, role: 'Operator' });
    expect((await (await dev.get('/api/cms/session')).json()).user?.role).toBe('Operator');
    await expectStatus(await dev.post('/api/cms/media/remove', { data: { mediaId: 'nonexistent-role-image' } }), 403);
    await expectStatus(await dev.post('/api/cms/users', { data: { username: 'self-demoted-create', role: 'Admin', password: resetPassword, currentPassword: E2E_ADMIN.password } }), 403);
  } finally { await dev.dispose(); }
});

test('Operator cannot bypass Trash deletion permissions through cleanup or submission cancellation', async ({ db }) => {
  const [account] = await seedAccounts(db, [['cleanup-operator', 'Operator']]);
  const operator = await signIn(account.username);
  const submissionId = randomUUID();
  const mediaId = 'operator-trashed-deletion-retry';
  const trashedAt = new Date().toISOString();
  const media = db.collection<{ _id: string } & Record<string, unknown>>('moe_media');
  await media.insertOne({ _id: mediaId, id: mediaId, title: 'Protected previous Trash deletion', url: `${E2E_IMAGE_ORIGIN}v1/${mediaId}.png`, publicId: `moe-e2e/${mediaId}`, state: 'deleting', pinned: false, trashedAt, touchedAt: new Date(0), createdAt: new Date(0).toISOString(), owner: account._id, submissionId });
  try {
    const cleanup = await operator.post('/api/cms/media/cleanup', { data: {} });
    await expectStatus(cleanup, 200);
    expect(await cleanup.json()).toMatchObject({ deleted: 0, failed: 0 });
    expect(await media.findOne({ _id: mediaId })).toMatchObject({ state: 'deleting', pinned: false, trashedAt, touchedAt: new Date(0) });
    const cancel = await operator.post('/api/cms/media/submission', { data: { submissionId, action: 'abort' } });
    await expectStatus(cancel, 200);
    expect(await cancel.json()).toMatchObject({ deleted: 0, failed: 0 });
    expect(await media.findOne({ _id: mediaId })).toMatchObject({ state: 'deleting', pinned: false, trashedAt, touchedAt: new Date(0) });
  } finally { await operator.dispose(); }
});

test('only Dev and Admin can permanently delete Trash and active content stays protected', async ({ db }) => {
  const [developer, admin, operator] = await seedAccounts(db, [['trash-dev', 'Dev'], ['trash-admin', 'Admin'], ['trash-operator', 'Operator']]);
  const clients = await Promise.all([developer, admin, operator].map(account => signIn(account.username)));
  const now = new Date();
  const source = await db.collection('moe_content').findOne({ type: 'News', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  const entries = ['dev', 'admin', 'operator'].map(role => ({ ...source!, _id: `News:role-trash-${role}`, id: `role-trash-${role}`, revision: 1, deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 86400000) }));
  const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
  await content.insertMany(entries);
  const corePage = await content.findOne({ _id: 'Page:home' });
  const section = await content.findOne({ type: 'Section' });
  expect(corePage && section).toBeTruthy();
  await content.updateOne({ _id: 'Page:home' }, { $set: { deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 86400000) } });
  await content.insertMany([
    { ...corePage!, _id: 'Page:role-linked-page', id: 'role-linked-page', revision: 1, deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 86400000) },
    { ...section!, _id: 'Section:role-linked-area', id: 'role-linked-area', parentId: 'role-linked-page', revision: 1 },
  ]);
  const imageId = 'role-permanent-image';
  await db.collection<{ _id: string }>('moe_media').insertOne({ _id: imageId, id: imageId, title: 'Role Trash image', url: `${E2E_IMAGE_ORIGIN}v1/role-trash.png`, publicId: 'moe-e2e/role-trash', state: 'trashed', owner: E2E_ADMIN.id, submissionId: randomUUID(), pinned: true, createdAt: now.toISOString(), touchedAt: now, trashedAt: now.toISOString() } as never);
  try {
    await expectStatus(await clients[2].post('/api/cms/media/remove', { data: { mediaId: imageId } }), 403);
    expect(await db.collection('moe_media').findOne({ _id: imageId } as never)).toMatchObject({ state: 'trashed' });
    await expectStatus(await clients[2].post('/api/cms/content/remove', { data: { id: entries[2].id, type: 'News', expectedRevision: 1 } }), 403);
    expect(await db.collection('moe_content').findOne({ id: entries[2].id })).not.toBeNull();
    for (const [index, client] of clients.slice(0, 2).entries()) {
      await expectStatus(await client.post('/api/cms/media/remove', { data: { mediaId: 'nonexistent-role-image' } }), 200);
      await expectStatus(await client.post('/api/cms/content/remove', { data: { id: source!.id, type: 'News', expectedRevision: source!.revision } }), 409);
      await expectStatus(await client.post('/api/cms/content/remove', { data: { id: entries[index].id, type: 'News', expectedRevision: 99 } }), 409);
      await expectStatus(await client.post('/api/cms/content/remove', { data: { id: 'home', type: 'Page', expectedRevision: corePage!.revision } }), 400);
      await expectStatus(await client.post('/api/cms/content/remove', { data: { id: 'role-linked-page', type: 'Page', expectedRevision: 1 } }), 409);
      await expectStatus(await client.post('/api/cms/content/remove', { data: { id: entries[index].id, type: 'News', expectedRevision: 1 } }), 200);
      expect(await db.collection('moe_content').findOne({ id: entries[index].id })).toBeNull();
    }
    expect(await db.collection('moe_media').findOne({ _id: imageId } as never)).toMatchObject({ state: 'trashed' });
    expect(await content.findOne({ _id: 'Page:home' })).toMatchObject({ deletedAt: now.toISOString() });
    expect(await content.findOne({ _id: 'Page:role-linked-page' })).not.toBeNull();
    expect(await content.findOne({ _id: 'Section:role-linked-area' })).not.toBeNull();
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});

test('permanent content deletion requires confirmation and leaves the saved library image intact', async ({ page, db }) => {
  const content = db.collection<{ _id: string } & Record<string, unknown>>('moe_content');
  const media = db.collection<{ _id: string } & Record<string, unknown>>('moe_media');
  const source = await content.findOne({ type: 'News', deletedAt: { $exists: false } });
  const sourceImage = await media.findOne({ state: 'committed' });
  expect(source && sourceImage).toBeTruthy();
  const now = new Date();
  const imageId = 'content-permanent-library-image';
  const savedImage = { ...sourceImage!, _id: imageId, id: imageId, title: 'Keep this library image', publicId: `moe-e2e/${imageId}`, url: `${E2E_IMAGE_ORIGIN}v1/${imageId}.png`, state: 'committed', pinned: true };
  await media.insertOne(savedImage);
  const itemId = 'content-permanent-confirmation';
  const title = 'Content awaiting permanent deletion';
  await content.insertOne({ ...source!, _id: `News:${itemId}`, id: itemId, title, image: savedImage.url, revision: 1, deletedAt: now.toISOString(), purgeAt: new Date(now.getTime() + 86400000) });
  const admin = await signIn(E2E_ADMIN.username);
  try {
    await useSession(page, admin);
    await page.goto('/cms/trash');
    const deletedContent = page.getByRole('region', { name: 'Trash items', exact: true });
    const row = deletedContent.locator(`[data-trash-key="News:${itemId}"]`);
    const remove = row.getByRole('button', { name: `Delete ${title} permanently`, exact: true });
    await expect(remove).toBeVisible();
    await remove.click();
    const confirmation = page.getByRole('dialog', { name: 'Delete permanently', exact: true });
    await expect(confirmation).toContainText(title);
    await expect(confirmation).toContainText('This cannot be undone. Saved images stay in the media library.');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(remove).toBeVisible();
    expect(await content.findOne({ _id: `News:${itemId}` })).not.toBeNull();
    expect(await media.findOne({ _id: imageId })).toEqual(savedImage);

    await remove.click();
    const response = page.waitForResponse(result => result.url().endsWith('/api/cms/content/remove') && result.request().method() === 'POST');
    await confirmation.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expectStatus(await response, 200);
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: `“${title}” permanently deleted.` })).toBeVisible();
    expect(await content.findOne({ _id: `News:${itemId}` })).toBeNull();
    expect(await media.findOne({ _id: imageId })).toEqual(savedImage);
    await page.reload();
    await expect(deletedContent).not.toContainText(title);
  } finally { await admin.dispose(); }
});

test('role-aware user controls protect Dev accounts and fit narrow screens in both languages', async ({ page, db }) => {
  const [developer, otherDev, operator] = await seedAccounts(db, [['ui-dev', 'Dev'], ['ui-protected-dev', 'Dev'], ['ui-operator', 'Operator']]);
  const admin = await signIn(E2E_ADMIN.username);
  const dev = await signIn(developer.username);
  const op = await signIn(operator.username);
  try {
    await useSession(page, admin);
    const users = page.getByRole('region', { name: 'Users', exact: true });
    const protectedDev = users.getByRole('listitem').filter({ hasText: otherDev.username });
    await expect(protectedDev).toContainText('Protected Dev account');
    await expect(protectedDev.getByRole('button')).toHaveCount(0);
    const create = page.getByRole('region', { name: 'Add user', exact: true });
    await expect(create.getByLabel('Role', { exact: true }).locator('option')).toHaveText(['Admin', 'Operator']);
    await users.getByRole('button', { name: `Edit ${operator.username}`, exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit user', exact: true });
    await edit.getByLabel('Username', { exact: true }).fill('ui-operator-edited');
    await edit.getByLabel('Role', { exact: true }).selectOption('Admin');
    await edit.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(users).toContainText('ui-operator-edited');
    expect(await db.collection<Account>('moe_users').findOne({ _id: operator._id } as never)).toMatchObject({ role: 'Admin' });
    await expectStatus(await op.get('/api/cms/users'), 401);

    // The stale Operator session was revoked by the role edit; use a fresh Operator account for the restricted view.
    const [restricted] = await seedAccounts(db, [['ui-restricted', 'Operator']]);
    const restrictedSession = await signIn(restricted.username);
    try {
      await useSession(page, restrictedSession);
      await expect(page.getByRole('region', { name: 'Add user', exact: true })).toHaveCount(0);
      await expect(users.getByRole('button', { name: /^(Edit |Move .* to Trash$|Reset password$)/ })).toHaveCount(0);
      await expect(users.getByRole('button', { name: 'User settings', exact: true })).toBeVisible();
      await page.goto('/cms/trash');
      await expect(page.getByRole('button', { name: /permanently/ })).toHaveCount(0);
    } finally { await restrictedSession.dispose(); }

    await useSession(page, dev);
    await expect(create.getByLabel('Role', { exact: true }).locator('option')).toHaveText(['Dev', 'Admin', 'Operator']);
    await expect(users.getByRole('button', { name: `Edit ${otherDev.username}`, exact: true })).toBeVisible();
    await expect(users.getByRole('button', { name: `Move ${developer.username} to Trash`, exact: true })).toHaveCount(0);
    for (const [width, language] of [[1280, 'en'], [360, 'th']] as const) {
      await page.setViewportSize({ width, height: 900 });
      if (language === 'th') await page.locator('header [data-cms-language-switch]').click();
      const t = (value: string) => translateCms(language, value);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('Users'));
      await expect(page.getByRole('region', { name: t('Users'), exact: true })).toBeVisible();
      const translatedCreate = page.getByRole('region', { name: t('Add user'), exact: true });
      await expect(translatedCreate.getByLabel(t('Role'), { exact: true })).toBeVisible();
      await expect(translatedCreate.getByRole('button', { name: t('Add user'), exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/cms-roles-${language}-${width}.png`, fullPage: true });
    }
  } finally { await admin.dispose(); await dev.dispose(); await op.dispose(); }
});
