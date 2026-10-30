import { createHash, randomUUID } from 'node:crypto';
import { request as apiRequest, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import type { Db } from 'mongodb';
import type { CmsRole } from '../../src/lib/cms-roles';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';

type Account = { _id: string; username: string; role?: CmsRole; passwordHash: string; passwordVersion: number; createdAt: Date; avatar?: string; profileRevision?: number; deletedAt?: Date; purgeAt?: Date };
type Image = { _id: string; id: string; title: string; url: string; publicId: string; state: 'committed' | 'staged' | 'trashed' | 'deleting'; owner: string; submissionId: string; pinned: boolean; createdAt: string; touchedAt: Date; trashedAt?: string };
const origin = { Origin: E2E_BASE_URL };

async function expectStatus(response: Pick<APIResponse, 'status' | 'text'>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

async function seedAccount(db: Db, username: string, role: CmsRole) {
  const original = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  const account = { ...original!, _id: randomUUID(), username, role, createdAt: new Date() };
  await db.collection<Account>('moe_users').insertOne(account);
  return account;
}

async function seedImage(db: Db, name: string, extra: Partial<Image> = {}) {
  const id = createHash('sha256').update(name).digest('hex');
  const item: Image = { _id: id, id, title: name, url: `${E2E_IMAGE_ORIGIN}v1/${id}.png`, publicId: `moe-e2e/${id}`, state: 'committed', owner: E2E_ADMIN.id, submissionId: randomUUID(), pinned: true, createdAt: new Date(0).toISOString(), touchedAt: new Date(0), ...extra };
  await db.collection<Image>('moe_media').insertOne(item);
  return item;
}

async function signIn(username: string = E2E_ADMIN.username) {
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  await expectStatus(await client.post('/api/cms/login', { data: { username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } }), 200);
  return client;
}

function photo(id: string, avatar: string, expectedProfileRevision = 0, extra: Record<string, unknown> = {}) {
  return { id, avatar, expectedProfileRevision, submissionId: randomUUID(), ...extra };
}

async function useSession(page: Page, client: APIRequestContext) {
  await page.context().clearCookies();
  await page.context().addCookies((await client.storageState()).cookies);
  await page.goto('/cms/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Users');
}

async function openOwnPhoto(page: Page, locale: 'en' | 'th' = 'en') {
  const t = (value: string) => translateCms(locale, value);
  await page.goto('/cms/users');
  await page.getByRole('button', { name: t('User settings'), exact: true }).click();
  await page.getByRole('dialog', { name: t('User settings'), exact: true }).getByRole('button', { name: t('Change profile photo'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: t('Profile photo'), exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function mockUploads(page: Page, db: Db, owner: string, failFirst = false) {
  const attempts: Array<{ filename: string; submissionId: string; mediaId: string }> = [];
  await page.route('**/api/cms/media', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataBuffer();
    expect(body).not.toBeNull();
    const form = await new Response(new Uint8Array(body!), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
    const submissionId = String(form.get('submissionId'));
    const file = form.get('file') as File;
    const mediaId = createHash('sha256').update(`${owner}:${submissionId}:${file.name}`).digest('hex');
    attempts.push({ filename: file.name, submissionId, mediaId });
    if (failFirst && attempts.length === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic profile upload failure.' } });
    const now = new Date();
    const media: Image = { _id: mediaId, id: mediaId, title: file.name, url: `${E2E_IMAGE_ORIGIN}v1/${mediaId}.png`, publicId: `moe-e2e/${mediaId}`, state: 'staged', owner, submissionId, pinned: false, createdAt: now.toISOString(), touchedAt: now };
    await db.collection<Image>('moe_media').updateOne({ _id: mediaId }, { $setOnInsert: media }, { upsert: true });
    await route.fulfill({ status: 201, json: { media } });
  });
  return attempts;
}

test('photo permissions allow every role to update itself and preserve all existing sessions', async ({ db }) => {
  const developer = await seedAccount(db, 'photo-dev', 'Dev');
  const operator = await seedAccount(db, 'photo-operator', 'Operator');
  const otherDev = await seedAccount(db, 'photo-other-dev', 'Dev');
  const otherAdmin = await seedAccount(db, 'photo-other-admin', 'Admin');
  const first = await seedImage(db, 'Profile role image');
  const second = await seedImage(db, 'Profile replacement image');
  const ids = [E2E_ADMIN.id, developer._id, operator._id];
  const names = [E2E_ADMIN.username, developer.username, operator.username];
  const clients = await Promise.all(names.map(name => signIn(name)));
  const previous = await Promise.all(names.map(name => signIn(name)));
  try {
    for (const [index, client] of clients.entries()) {
      await expectStatus(await client.post('/api/cms/users/profile', { data: photo(ids[index], first.url) }), 200);
      for (const session of [client, previous[index]]) expect((await (await session.get('/api/cms/session')).json()).user).toMatchObject({ id: ids[index], avatar: first.url, profileRevision: 1 });
      expect(await db.collection<Account>('moe_users').findOne({ _id: ids[index] })).toMatchObject({ passwordVersion: 1, avatar: first.url });
    }
    const changeOther = (id: string, revision = 0) => photo(id, second.url, revision, { currentPassword: E2E_ADMIN.password });
    await expectStatus(await clients[1].post('/api/cms/users/profile', { data: changeOther(otherDev._id) }), 200);
    await expectStatus(await clients[1].post('/api/cms/users/profile', { data: changeOther(E2E_ADMIN.id, 1) }), 200);
    await expectStatus(await clients[0].post('/api/cms/users/profile', { data: changeOther(otherAdmin._id) }), 200);
    await expectStatus(await clients[0].post('/api/cms/users/profile', { data: changeOther(operator._id, 1) }), 200);
    await expectStatus(await clients[0].post('/api/cms/users/profile', { data: changeOther(developer._id, 1) }), 403);
    await expectStatus(await clients[2].post('/api/cms/users/profile', { data: changeOther(otherAdmin._id, 1) }), 403);
    for (const index of [0, 2]) expect((await (await previous[index].get('/api/cms/session')).json()).user).toMatchObject({ avatar: second.url, profileRevision: 2 });
    expect((await (await previous[1].get('/api/cms/session')).json()).user).toMatchObject({ avatar: first.url, profileRevision: 1 });
    await expectStatus(await clients[0].patch('/api/cms/users', { data: { id: otherAdmin._id, avatar: first.url, currentPassword: E2E_ADMIN.password } }), 400);
    await expectStatus(await clients[0].post('/api/cms/users', { data: { username: 'reject-combined-photo', role: 'Operator', password: E2E_ADMIN.password, avatar: first.url, currentPassword: E2E_ADMIN.password } }), 400);
    expect(await db.collection<Account>('moe_users').findOne({ username: 'reject-combined-photo' })).toBeNull();
  } finally { await Promise.all([...clients, ...previous].map(client => client.dispose())); }
});

test('profile photo submissions commit staged media once and replay without reverting newer photos', async ({ db }) => {
  const admin = await signIn();
  const submissionId = randomUUID();
  const staged = await seedImage(db, 'Staged profile image', { state: 'staged', pinned: false, submissionId });
  const replacement = await seedImage(db, 'Later profile image');
  const input = photo(E2E_ADMIN.id, staged.url, 0, { submissionId });
  try {
    await expectStatus(await admin.post('/api/cms/users/profile', { data: input }), 200);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: input }), 200);
    expect(await db.collection<Image>('moe_media').findOne({ _id: staged.id })).toMatchObject({ state: 'committed' });
    expect(await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id })).toMatchObject({ avatar: staged.url, profileRevision: 1, passwordVersion: 1 });
    await expectStatus(await admin.post('/api/cms/users/profile', { data: { ...input, avatar: replacement.url } }), 409);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, replacement.url, 0) }), 409);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, replacement.url, 1) }), 200);
    const replay = await admin.post('/api/cms/users/profile', { data: input });
    await expectStatus(replay, 200);
    expect((await replay.json()).user).toMatchObject({ avatar: replacement.url, profileRevision: 2 });
    const events = await db.collection('moe_logs').find({ action: 'user.profile_updated', 'target.id': E2E_ADMIN.id }).toArray();
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(staged.url);
    expect(JSON.stringify(events)).not.toContain(replacement.url);
    expect(events.every(event => event.target.type === 'User')).toBe(true);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, '', 2) }), 200);
    expect((await (await admin.get('/api/cms/session')).json()).user).toMatchObject({ profileRevision: 3 });
    expect((await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id }))?.avatar || '').toBe('');
  } finally { await admin.dispose(); }
});

test('invalid or foreign profile images are rejected and audit failure rolls back profile and media together', async ({ db, page }) => {
  const foreign = await seedAccount(db, 'foreign-photo-owner', 'Operator');
  const otherSubmission = randomUUID();
  const wrongOwner = await seedImage(db, 'Foreign profile image', { state: 'staged', pinned: false, owner: foreign._id, submissionId: otherSubmission });
  const removed = await seedImage(db, 'Trashed profile image', { state: 'trashed', trashedAt: new Date().toISOString() });
  const ownSubmission = randomUUID();
  const staged = await seedImage(db, 'Atomic profile image', { state: 'staged', pinned: false, submissionId: ownSubmission });
  const admin = await signIn();
  try {
    await expectStatus(await page.request.post('/api/cms/users/profile', { headers: origin, data: photo(E2E_ADMIN.id, staged.url, 0, { submissionId: ownSubmission }) }), 401);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, 'https://untrusted.example.test/photo.png') }), 400);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, removed.url) }), 400);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, wrongOwner.url, 0, { submissionId: otherSubmission }) }), 403);
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, staged.url) }), 403);
    await db.command({ collMod: 'moe_logs', validator: { $or: [{ action: { $ne: 'user.profile_updated' } }, { 'target.id': { $ne: E2E_ADMIN.id } }] }, validationLevel: 'strict', validationAction: 'error' });
    try {
      await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, staged.url, 0, { submissionId: ownSubmission }) }), 503);
      expect((await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id }))?.avatar || '').toBe('');
      expect(await db.collection<Image>('moe_media').findOne({ _id: staged.id })).toMatchObject({ state: 'staged', pinned: false });
      expect(await db.collection('moe_logs').countDocuments({ 'target.id': staged.id })).toBe(0);
    } finally { await db.command({ collMod: 'moe_logs', validator: {}, validationLevel: 'strict', validationAction: 'error' }); }
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, staged.url, 0, { submissionId: ownSubmission }) }), 200);
  } finally { await admin.dispose(); }
});

test('active and trashed account photos protect media until the last user reference is removed', async ({ db }) => {
  const target = await seedAccount(db, 'retained-profile-user', 'Operator');
  const image = await seedImage(db, 'Protected account photo');
  const admin = await signIn();
  try {
    await expectStatus(await admin.post('/api/cms/users/profile', { data: photo(target._id, image.url, 0, { currentPassword: E2E_ADMIN.password }) }), 200);
    for (const trashed of [false, true]) {
      if (trashed) await expectStatus(await admin.delete('/api/cms/users', { data: { id: target._id, currentPassword: E2E_ADMIN.password } }), 200);
      await db.collection<Image>('moe_media').updateOne({ _id: image.id }, { $set: { touchedAt: new Date(0) } });
      const usage = await admin.get(`/api/cms/media/usage?mediaId=${image.id}`);
      await expectStatus(usage, 200);
      const userUsage = (await usage.json()).usages.find((item: { type: string; id: string }) => item.type === 'User' && item.id === target._id);
      expect(userUsage).toMatchObject({ title: target.username, fields: ['avatar'] });
      if (trashed) expect(userUsage).toHaveProperty('deletedAt');
      await expectStatus(await admin.post('/api/cms/media/trash', { data: { mediaId: image.id } }), 409);
      await expectStatus(await admin.post('/api/cms/media/cleanup', { data: {} }), 200);
      expect(await db.collection<Image>('moe_media').findOne({ _id: image.id })).toMatchObject({ state: 'committed' });
    }
    const trash = await (await admin.get(`/api/cms/trash?item=User:${target._id}`)).json();
    expect(trash.items[0]).toMatchObject({ image: image.url });
    await db.collection<Image>('moe_media').updateOne({ _id: image.id }, { $set: { state: 'trashed', trashedAt: new Date().toISOString() } });
    await expectStatus(await admin.post('/api/cms/media/remove', { data: { mediaId: image.id } }), 409);
    expect((await (await admin.get(`/api/cms/trash?item=Image:${image.id}`)).json()).items[0]).toMatchObject({ canDelete: false });
    await expectStatus(await admin.post('/api/cms/users/remove', { data: { id: target._id, currentPassword: E2E_ADMIN.password } }), 200);
    await expectStatus(await admin.post('/api/cms/media/restore', { data: { mediaId: image.id } }), 200);
    await expectStatus(await admin.post('/api/cms/media/trash', { data: { mediaId: image.id } }), 200);
  } finally { await admin.dispose(); }
});

test('profile saves and unused-image cleanup cannot leave a saved avatar pointing into Trash', async ({ db }) => {
  const admin = await signIn();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const image = await seedImage(db, `Concurrent profile image ${attempt}`);
      const current = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
      const [saved, cleaned] = await Promise.all([
        admin.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, image.url, current?.profileRevision || 0) }),
        admin.post('/api/cms/media/cleanup', { data: {} }),
      ]);
      await expectStatus(cleaned, 200);
      expect([200, 400, 409]).toContain(saved.status());
      const user = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
      const media = await db.collection<Image>('moe_media').findOne({ _id: image.id });
      if (saved.status() === 200) {
        expect(user).toMatchObject({ avatar: image.url });
        expect(media).toMatchObject({ state: 'committed' });
      } else expect(user?.avatar).not.toBe(image.url);
    }
  } finally { await admin.dispose(); }
});

test('cancelling a prepared profile photo never uploads it or changes the account', async ({ page, db }) => {
  await login(page);
  const attempts = await mockUploads(page, db, E2E_ADMIN.id);
  const before = await db.collection<Image>('moe_media').countDocuments();
  const dialog = await openOwnPhoto(page);
  await dialog.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'cancel-profile.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await expect(dialog.getByRole('img', { name: 'Profile photo preview', exact: true })).toHaveAttribute('src', /^blob:/);
  expect(attempts).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await db.collection<Image>('moe_media').countDocuments()).toBe(before);
  expect((await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id }))?.avatar || '').toBe('');
  const reopened = await openOwnPhoto(page);
  await expect(reopened.getByRole('img', { name: 'Profile photo preview', exact: true })).toHaveCount(0);
  expect(attempts).toHaveLength(0);
});

test('failed photo uploads and saves preserve the prepared image and reuse the staged upload on retry', async ({ page, db }) => {
  const target = await seedAccount(db, 'photo-upload-target', 'Operator');
  await login(page);
  await page.goto('/cms/users');
  const attempts = await mockUploads(page, db, E2E_ADMIN.id, true);
  let profileWrites = 0;
  await page.route('**/api/cms/users/profile', async route => {
    profileWrites++;
    if (profileWrites === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic profile save failure.' } });
    await expectStatus(await route.fetch(), 200);
    // Lose the successful response: the dialog must reconcile through its safe
    // roster read, without another upload or another profile mutation.
    return route.abort('failed');
  });
  await page.getByRole('button', { name: `Change profile photo for ${target.username}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Profile photo', exact: true });
  await dialog.getByLabel('Your current password', { exact: true }).fill(E2E_ADMIN.password);
  await dialog.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'retry-profile.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
  await expect(dialog.getByRole('img', { name: 'Profile photo preview', exact: true })).toHaveAttribute('src', /^blob:/);
  expect(attempts).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic profile upload failure.');
  expect(profileWrites).toBe(0);
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic profile save failure.');
  expect(attempts).toHaveLength(2);
  expect(new Set(attempts.map(attempt => attempt.submissionId)).size).toBe(1);
  await expect(dialog.getByLabel('Your current password', { exact: true })).toHaveValue(E2E_ADMIN.password);
  expect((await db.collection<Account>('moe_users').findOne({ _id: target._id }))?.avatar || '').toBe('');
  expect(await db.collection<Image>('moe_media').findOne({ _id: attempts[1].mediaId })).toMatchObject({ state: 'staged' });
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(profileWrites).toBe(2);
  expect(attempts).toHaveLength(2);
  const saved = await db.collection<Image>('moe_media').findOne({ _id: attempts[1].mediaId });
  expect(saved).toMatchObject({ state: 'committed' });
  expect(await db.collection<Account>('moe_users').findOne({ _id: target._id })).toMatchObject({ avatar: saved!.url, profileRevision: 1, passwordVersion: 1 });
  await expect(page.getByRole('region', { name: 'Users', exact: true }).getByRole('listitem').filter({ hasText: target.username }).locator('img')).toHaveAttribute('src', saved!.url);
  expect(await db.collection('moe_logs').countDocuments({ action: 'user.profile_updated', 'target.id': target._id })).toBe(1);
});

test('the profile library shows twelve images per panel and own photos update the header with bilingual mobile layouts', async ({ page, db }) => {
  const operator = await seedAccount(db, 'profile-viewer', 'Operator');
  const images = [];
  for (let index = 0; index < 25; index++) images.push(await seedImage(db, `Profile gallery ${String(index).padStart(2, '0')}`));
  const client = await signIn(operator.username);
  try {
    await useSession(page, client);
    const header = page.getByRole('button', { name: 'Open user settings', exact: true });
    await expect(header.locator('img')).toHaveCount(0);
    await expect(header).toContainText('P');
    const dialog = await openOwnPhoto(page);
    await expect(dialog.getByLabel('Your current password', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Browse library', exact: true }).click();
    await dialog.getByRole('searchbox', { name: 'Search profile images', exact: true }).fill('Profile gallery');
    const library = dialog.getByRole('region', { name: 'Profile image library', exact: true });
    await expect(library.locator('[data-profile-image]')).toHaveCount(12);
    await library.getByRole('button', { name: 'Next images', exact: true }).click();
    await expect(library.locator('[data-profile-image]')).toHaveCount(12);
    await library.getByRole('button', { name: 'Next images', exact: true }).click();
    await expect(library.locator('[data-profile-image]')).toHaveCount(1);
    await dialog.getByRole('searchbox', { name: 'Search profile images', exact: true }).fill(images[24].title);
    await expect(library.locator('[data-profile-image]')).toHaveCount(1);
    await library.locator('[data-profile-image]').click();
    expect((await db.collection<Account>('moe_users').findOne({ _id: operator._id }))?.avatar || '').toBe('');
    await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('dialog', { name: 'User settings', exact: true }).getByRole('button', { name: 'Close user settings', exact: true }).click();
    await expect(header.locator('img')).toHaveAttribute('src', images[24].url);
    await expect(page.getByRole('region', { name: 'Users', exact: true }).getByRole('listitem').filter({ hasText: operator.username }).locator('img')).toHaveAttribute('src', images[24].url);
    for (const [width, locale] of [[1280, 'en'], [360, 'th']] as const) {
      await page.setViewportSize({ width, height: 900 });
      if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
      const t = (value: string) => translateCms(locale, value);
      if (locale === 'th') expect(t('Profile photo')).not.toBe('Profile photo');
      const translated = await openOwnPhoto(page, locale);
      await expect(translated.getByRole('img', { name: t('Profile photo preview'), exact: true })).toHaveAttribute('src', images[24].url);
      await expect.poll(() => translated.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/cms-profile-${locale}-${width}-viewport.png` });
      await translated.getByRole('button', { name: t('Cancel'), exact: true }).click();
      await page.getByRole('dialog', { name: t('User settings'), exact: true }).getByRole('button', { name: t('Close user settings'), exact: true }).click();
    }
    await page.locator('header [data-cms-language-switch]').click();
    const remove = await openOwnPhoto(page);
    await remove.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await remove.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(remove).not.toBeVisible();
    await page.getByRole('dialog', { name: 'User settings', exact: true }).getByRole('button', { name: 'Close user settings', exact: true }).click();
    await expect(header.locator('img')).toHaveCount(0);
    await expect(header).toContainText('P');
    expect((await (await client.get('/api/cms/session')).json()).user).toMatchObject({ id: operator._id, profileRevision: 2 });
  } finally { await client.dispose(); }
});

test('a conflicting profile edit keeps the staged photo until the user explicitly rebases and saves again', async ({ page, db }) => {
  const concurrentImage = await seedImage(db, 'Profile selected in another session');
  const otherSession = await signIn();
  await login(page);
  const uploads = await mockUploads(page, db, E2E_ADMIN.id);
  const writes: Array<{ expectedProfileRevision: number; submissionId: string; avatar: string }> = [];
  await page.route('**/api/cms/users/profile', async route => {
    writes.push(route.request().postDataJSON());
    await route.continue();
  });
  try {
    const dialog = await openOwnPhoto(page);
    await dialog.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'keep-my-profile.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
    const preview = dialog.getByRole('img', { name: 'Profile photo preview', exact: true });
    await expect(preview).toHaveAttribute('src', /^blob:/);
    const preparedUrl = await preview.getAttribute('src');
    await expectStatus(await otherSession.post('/api/cms/users/profile', { data: photo(E2E_ADMIN.id, concurrentImage.url) }), 200);

    const conflict = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/users/profile' && response.status() === 409);
    await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expectStatus(await conflict, 409);
    const useSelected = dialog.getByRole('button', { name: 'Use my selected photo', exact: true });
    await expect(useSelected).toBeVisible();
    await expect(preview).toHaveAttribute('src', preparedUrl!);
    expect(uploads).toHaveLength(1);
    expect(writes).toHaveLength(1);
    expect(await db.collection<Image>('moe_media').findOne({ _id: uploads[0].mediaId })).toMatchObject({ state: 'staged' });
    expect(await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id })).toMatchObject({ avatar: concurrentImage.url, profileRevision: 1 });

    await useSelected.click();
    await expect(dialog.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
    await expect(preview).toHaveAttribute('src', preparedUrl!);
    expect(writes).toHaveLength(1);
    expect(await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id })).toMatchObject({ avatar: concurrentImage.url, profileRevision: 1 });
    await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(uploads).toHaveLength(1);
    expect(writes.map(write => write.expectedProfileRevision)).toEqual([0, 1]);
    expect(new Set(writes.map(write => write.submissionId)).size).toBe(1);
    const staged = await db.collection<Image>('moe_media').findOne({ _id: uploads[0].mediaId });
    expect(staged).toMatchObject({ state: 'committed' });
    expect(await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id })).toMatchObject({ avatar: staged!.url, profileRevision: 2, passwordVersion: 1 });
  } finally { await otherSession.dispose(); }
});

test('a late successful photo response cannot restore the workspace after the session expires', async ({ page, db }) => {
  await login(page);
  const uploads = await mockUploads(page, db, E2E_ADMIN.id);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  let markCommitted!: () => void;
  const committed = new Promise<void>(resolve => { markCommitted = resolve; });
  let writes = 0;
  await page.route('**/api/cms/users/profile', async route => {
    writes++;
    const response = await route.fetch();
    await expectStatus(response, 200);
    markCommitted();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    const dialog = await openOwnPhoto(page);
    await dialog.getByLabel('Choose profile photo', { exact: true }).setInputFiles({ name: 'late-profile.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
    await expect(dialog.getByRole('img', { name: 'Profile photo preview', exact: true })).toHaveAttribute('src', /^blob:/);
    await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
    await committed;
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signInButton).toBeVisible();
    await expect(dialog).not.toBeVisible();
    const lateResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/users/profile' && response.status() === 200);
    releaseResponse();
    await expectStatus(await lateResponse, 200);
    // Two paint frames allow the completed fetch callback and any React state
    // update it schedules to run before asserting the signed-out interface.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(signInButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open user settings', exact: true })).toHaveCount(0);
    expect(writes).toBe(1);
    expect(uploads).toHaveLength(1);
    expect(await db.collection<Image>('moe_media').findOne({ _id: uploads[0].mediaId })).toMatchObject({ state: 'committed' });
  } finally { releaseResponse(); }
});
