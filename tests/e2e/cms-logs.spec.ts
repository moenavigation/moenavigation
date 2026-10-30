import { createHash, randomUUID } from 'node:crypto';
import { request as apiRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { Db } from 'mongodb';
import type { CmsRole } from '../../src/lib/cms-roles';
import type { CmsLogPage as LogPage } from '../../src/lib/cms-logs';
import type { AuditDocument as LogDocument } from '../../src/server/db';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';

type Actor = { id: string; username: string; role: CmsRole };
type Account = { _id: string; username: string; role?: CmsRole; passwordHash: string; passwordVersion: number; createdAt: Date };
const origin = { Origin: E2E_BASE_URL };
const adminActor: Actor = { id: E2E_ADMIN.id, username: E2E_ADMIN.username, role: 'Admin' };
const sensitivePassword = 'Logs-must-never-store-this-password-2026!';

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

async function signIn(username: string = E2E_ADMIN.username, password: string = E2E_ADMIN.password) {
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  await expectStatus(await client.post('/api/cms/login', { data: { username, password, ...await loginChallengeData(client) } }), 200);
  return client;
}

async function readLogs(client: APIRequestContext, params = new URLSearchParams()) {
  const response = await client.get(`/api/cms/logs${params.size ? `?${params}` : ''}`);
  await expectStatus(response, 200);
  return await response.json() as LogPage;
}

function oneCalendarYearAfter(value: Date) {
  const result = new Date(value);
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== value.getUTCMonth()) result.setUTCDate(0);
  return result;
}

function expectSafe(items: unknown) {
  const json = JSON.stringify(items);
  for (const secret of [E2E_ADMIN.password, sensitivePassword, 'injected-top-level-secret', 'injected-nested-secret']) expect(json).not.toContain(secret);
  expect(json).not.toMatch(/passwordHash|passwordVersion|currentPassword|newPassword|sessionToken|accessToken|challengePosition|fingerprint|scrypt:/);
}

async function targetEvents(db: Db, id: string) {
  return db.collection<LogDocument>('moe_logs').find({ 'target.id': id }).sort({ occurredAt: 1, _id: 1 }).toArray();
}

function expectStoredEvent(event: LogDocument) {
  expect(event.occurredAt).toEqual(expect.any(Date));
  expect(event.expiresAt).toEqual(oneCalendarYearAfter(event.occurredAt));
  expect(event.outcome).toBe('success');
  expect(event.actor).toEqual(adminActor);
  expectSafe(event);
}

test('all CMS roles can read safe retained logs but cannot create, edit, delete, or move logs to Trash', async ({ page, db }) => {
  const developer = await seedAccount(db, 'logs-dev', 'Dev');
  const operator = await seedAccount(db, 'logs-operator', 'Operator');
  const occurredAt = new Date(Date.now() - 3600000);
  const retained: LogDocument = { _id: randomUUID(), occurredAt, expiresAt: oneCalendarYearAfter(occurredAt), action: 'content.updated', category: 'content', actor: adminActor, target: { type: 'News', id: 'audit-retained-private', label: 'Retained audit entry' }, outcome: 'success' };
  const expired: LogDocument = { ...retained, _id: randomUUID(), occurredAt: new Date(Date.now() - 2 * 366 * 86400000), expiresAt: new Date(Date.now() - 86400000), target: { type: 'News', id: 'audit-expired-private', label: 'Expired audit entry' } };
  await db.collection<LogDocument>('moe_logs').insertMany([retained, expired]);
  await db.collection<LogDocument>('moe_logs').updateOne({ _id: retained._id }, { $set: { passwordHash: 'injected-top-level-secret', 'actor.sessionToken': 'injected-nested-secret', 'target.accessToken': 'injected-nested-secret' } });
  await expectStatus(await page.request.get('/api/cms/logs'), 401);
  const clients = await Promise.all([signIn(), signIn(developer.username), signIn(operator.username)]);
  try {
    for (const client of clients) {
      const logs = await readLogs(client, new URLSearchParams({ q: 'audit-retained-private' }));
      expect(logs.total).toBe(1);
      expect(logs.items[0]).toMatchObject({ id: retained._id, actor: adminActor, target: retained.target, outcome: 'success' });
      expect(Object.keys(logs.items[0].actor).sort()).toEqual(['id', 'role', 'username']);
      expect(Object.keys(logs.items[0].target).sort()).toEqual(['id', 'label', 'type']);
      expectSafe(logs);
      expect((await readLogs(client, new URLSearchParams({ q: 'audit-expired-private' }))).items).toEqual([]);
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        await expectStatus(await client.fetch(`/api/cms/logs?id=${retained._id}`, { method, data: { id: retained._id, action: 'overwrite', expiresAt: new Date().toISOString() } }), 405);
      }
      const trash = await client.get('/api/cms/trash');
      await expectStatus(trash, 200);
      expect(JSON.stringify(await trash.json())).not.toContain(retained._id);
      await expectStatus(await client.get('/api/cms/trash?kind=Log'), 400);
      const exported = await client.get('/api/cms/export');
      await expectStatus(exported, 200);
      const exportData = await exported.json();
      expect(exportData).not.toHaveProperty('logs');
      expect(JSON.stringify(exportData)).not.toContain(retained._id);
    }
    const stored = await db.collection<LogDocument>('moe_logs').findOne({ _id: retained._id });
    expect(stored).toMatchObject({ action: retained.action, target: retained.target, expiresAt: retained.expiresAt });
    const exports = await db.collection<LogDocument>('moe_logs').find({ action: 'settings.exported' }).toArray();
    expect(exports).toHaveLength(3);
    expect(exports.map(event => event.actor)).toEqual(expect.arrayContaining([
      adminActor,
      { id: developer._id, username: developer.username, role: 'Dev' },
      { id: operator._id, username: operator.username, role: 'Operator' },
    ]));
    for (const event of exports) {
      expect(event).toMatchObject({ category: 'settings', target: { type: 'Settings', id: 'website' }, outcome: 'success' });
      expect(event.target).not.toHaveProperty('label');
      expect(event.expiresAt).toEqual(oneCalendarYearAfter(event.occurredAt));
      expectSafe(event);
    }
    const indexes = await db.collection('moe_logs').listIndexes().toArray();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })]));
    await page.context().addCookies((await clients[2].storageState()).cookies);
    await page.goto('/cms/logs');
    const activity = page.getByRole('region', { name: 'Activity log', exact: true });
    await expect(activity.locator(`[data-log-id="${retained._id}"]`)).toBeVisible();
    await expect(activity.locator('[data-log-id]').getByRole('button')).toHaveCount(0);
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});

test('log search, category filters and cursor pages stay bounded and the bilingual view is read-only', async ({ page, db }) => {
  const occurredAt = new Date(Date.now() - 3600000);
  const entries: LogDocument[] = Array.from({ length: 61 }, (_, index) => ({
    _id: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`, occurredAt, expiresAt: oneCalendarYearAfter(occurredAt),
    action: index % 2 ? 'media.restored' : 'content.updated', category: index % 2 ? 'media' : 'content', actor: adminActor,
    target: { type: index % 2 ? 'Image' : 'News', id: `audit-paging-${index}`, label: `Audit paging [cargo].* ${String(index).padStart(2, '0')} บันทึกทดสอบ` }, outcome: 'success',
  }));
  await db.collection<LogDocument>('moe_logs').insertMany(entries);
  await login(page);
  const query = { q: 'Audit paging' };
  const first = await readLogs(page.request, new URLSearchParams(query));
  expect(first.total).toBe(61);
  expect(first.items).toHaveLength(30);
  const second = await readLogs(page.request, new URLSearchParams({ ...query, cursor: first.nextCursor! }));
  const third = await readLogs(page.request, new URLSearchParams({ ...query, cursor: second.nextCursor! }));
  expect(second.items).toHaveLength(30);
  expect(third.items).toHaveLength(1);
  expect(third.nextCursor).toBeNull();
  expect([...first.items, ...second.items, ...third.items].map(item => item.id)).toEqual(entries.map(item => item._id));
  expect((await readLogs(page.request, new URLSearchParams({ ...query, category: 'content' }))).total).toBe(31);
  expect((await readLogs(page.request, new URLSearchParams({ ...query, action: 'media.restored' }))).total).toBe(30);
  expect((await readLogs(page.request, new URLSearchParams({ q: '[cargo].*' }))).total).toBe(61);
  expect((await readLogs(page.request, new URLSearchParams({ q: 'บันทึกทดสอบ' }))).total).toBe(61);
  for (const suffix of ['q=a&q=b', 'category=invalid', 'action=invalid', `q=${'x'.repeat(161)}`, `q=changed&cursor=${first.nextCursor}`]) {
    await expectStatus(await page.request.get(`/api/cms/logs?${suffix}`), 400);
  }

  await page.goto('/cms/logs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Logs');
  const activity = page.getByRole('region', { name: 'Activity log', exact: true });
  await activity.getByRole('searchbox', { name: 'Search logs', exact: true }).fill(query.q);
  const rows = activity.locator('[data-log-id]');
  await expect(rows).toHaveCount(30);
  await activity.getByRole('button', { name: 'Load more logs', exact: true }).click();
  await expect(rows).toHaveCount(60);
  await activity.getByRole('button', { name: 'Load more logs', exact: true }).click();
  await expect(rows).toHaveCount(61);
  await activity.getByRole('combobox', { name: 'Activity type', exact: true }).selectOption('media');
  await expect(rows).toHaveCount(30);
  await expect(activity.getByRole('button', { name: 'Load more logs', exact: true })).toHaveCount(0);
  await expect(rows.getByRole('button')).toHaveCount(0);
  for (const [width, locale] of [[1280, 'en'], [360, 'th']] as const) {
    await page.setViewportSize({ width, height: 900 });
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    const t = (value: string) => translateCms(locale, value);
    if (locale === 'th') for (const value of ['Logs', 'Activity log', 'Search logs', 'Activity type']) expect(t(value)).not.toBe(value);
    const translated = page.getByRole('region', { name: t('Activity log'), exact: true });
    await expect(translated.getByRole('searchbox', { name: t('Search logs'), exact: true })).toBeVisible();
    await expect(translated.getByRole('combobox', { name: t('Activity type'), exact: true })).toHaveValue('media');
    await expect(translated.locator('[data-log-id]')).toHaveCount(30);
    await expect(translated.getByRole('button', { name: /^(Edit|Delete|Remove|Restore|Save|แก้ไข|ลบ|กู้คืน|บันทึก)/ })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/cms-logs-${locale}-${width}-viewport.png` });
    await page.screenshot({ path: `test-results/cms-logs-${locale}-${width}.png`, fullPage: true });
  }
});

test('content save retries produce one audit event and lifecycle actions preserve the immutable history', async ({ db }) => {
  const admin = await signIn();
  try {
    const records = (await (await admin.get('/api/cms/content')).json()).records as Array<Record<string, unknown>>;
    const source = records.find(record => record.type === 'News');
    expect(source).toBeTruthy();
    const id = 'audit-content-lifecycle';
    const submissionId = randomUUID();
    const mediaId = createHash('sha256').update('audit-content-staged-image').digest('hex');
    const imageUrl = `${E2E_IMAGE_ORIGIN}v1/${mediaId}.png`;
    const now = new Date();
    await db.collection<{ _id: string }>('moe_media').insertOne({ _id: mediaId, id: mediaId, title: 'Image saved with content', publicId: `moe-e2e/${mediaId}`, url: imageUrl, state: 'staged', pinned: false, owner: E2E_ADMIN.id, submissionId, touchedAt: now, createdAt: now.toISOString() } as never);
    const record = { ...source!, id, title: 'Audit content lifecycle', image: imageUrl, mobileImage: imageUrl, gallery: [{ url: imageUrl, alt: '', altTh: '' }] };
    const payload = { record, expectedRevision: null, submissionId };
    const initial = await admin.post('/api/cms/content', { data: payload });
    await expectStatus(initial, 200);
    await expectStatus(await admin.post('/api/cms/content', { data: payload }), 200);
    const created = (await initial.json()).record;
    let events = await targetEvents(db, id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: 'content', target: { type: 'News', id } });
    expectStoredEvent(events[0]);
    const uploadEvents = await targetEvents(db, mediaId);
    expect(uploadEvents).toHaveLength(1);
    expect(uploadEvents[0]).toMatchObject({ action: 'media.uploaded', target: { type: 'Image', id: mediaId } });
    expectStoredEvent(uploadEvents[0]);
    expect(await db.collection<{ _id: string }>('moe_media').findOne({ _id: mediaId })).toMatchObject({ state: 'committed' });
    const updated = await admin.post('/api/cms/content', { data: { record: { ...created, title: 'Audit revised title' }, expectedRevision: 1, submissionId: randomUUID() } });
    await expectStatus(updated, 200);
    let revision = 2;
    for (const action of ['trash', 'restore', 'trash']) {
      const response = await admin.post('/api/cms/content/action', { data: { id, type: 'News', expectedRevision: revision, action } });
      await expectStatus(response, 200);
      revision = (await response.json()).record.revision;
    }
    await expectStatus(await admin.post('/api/cms/content/remove', { data: { id, type: 'News', expectedRevision: revision } }), 200);
    expect(await db.collection('moe_content').findOne({ id })).toBeNull();
    events = await targetEvents(db, id);
    expect(events).toHaveLength(6);
    expect(events.map(event => event.action)).toEqual(['content.created', 'content.updated', 'content.trashed', 'content.restored', 'content.trashed', 'content.deleted']);
    for (const event of events) expectStoredEvent(event);
    const response = await readLogs(admin, new URLSearchParams({ q: id, category: 'content' }));
    expect(response.total).toBe(6);
    expectSafe(response);
    expect((await targetEvents(db, mediaId)).map(event => event.action)).toEqual(['media.uploaded']);
  } finally { await admin.dispose(); }
});

test('concurrent sign-out requests for one session record a single completed sign-out', async ({ db }) => {
  const admin = await signIn();
  const peer = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin, storageState: await admin.storageState() });
  const logs = db.collection<LogDocument>('moe_logs');
  const filter = { action: 'auth.logout' as const, 'actor.id': E2E_ADMIN.id };
  const before = await logs.countDocuments(filter);
  try {
    const responses = await Promise.all([admin.post('/api/cms/logout'), peer.post('/api/cms/logout')]);
    for (const response of responses) await expectStatus(response, 200);
    expect(await logs.countDocuments(filter)).toBe(before + 1);
    for (const client of [admin, peer]) {
      expect((await (await client.get('/api/cms/session')).json()).user).toBeNull();
      await expectStatus(await client.post('/api/cms/logout'), 200);
    }
    expect(await logs.countDocuments(filter)).toBe(before + 1);
  } finally { await admin.dispose(); await peer.dispose(); }
});

test('a required audit insert failure rolls back its business change and save retry marker', async ({ db }) => {
  const admin = await signIn();
  const id = 'audit-reject-transaction';
  const submissionId = randomUUID();
  try {
    const records = (await (await admin.get('/api/cms/content')).json()).records as Array<Record<string, unknown>>;
    const source = records.find(record => record.type === 'News');
    expect(source).toBeTruthy();
    // The fixture proves ownership before yielding this ephemeral database. Only
    // this target's audit insert is rejected; no global replica failpoint is used.
    await db.command({ collMod: 'moe_logs', validator: { 'target.id': { $ne: id } }, validationLevel: 'strict', validationAction: 'error' });
    await expectStatus(await admin.post('/api/cms/content', { data: { record: { ...source!, id, title: 'Atomic audit rejection' }, expectedRevision: null, submissionId } }), 503);
    expect(await db.collection('moe_content').findOne({ id })).toBeNull();
    expect(await db.collection('moe_operations').findOne({ _id: `${E2E_ADMIN.id}:${submissionId}` } as never)).toBeNull();
    expect(await targetEvents(db, id)).toEqual([]);
  } finally {
    await db.command({ collMod: 'moe_logs', validator: {}, validationLevel: 'strict', validationAction: 'error' });
    await admin.dispose();
  }
});

test('user, settings, and security events preserve actor identity without passwords or submitted settings', async ({ db }) => {
  const admin = await signIn();
  const visitor = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  try {
    const username = 'audit-created-user';
    await expectStatus(await admin.post('/api/cms/users', { data: { username, role: 'Operator', password: sensitivePassword, currentPassword: E2E_ADMIN.password } }), 201);
    const target = await db.collection<Account>('moe_users').findOne({ username });
    expect(target).not.toBeNull();
    const mutation = { id: target!._id, currentPassword: E2E_ADMIN.password };
    await expectStatus(await admin.patch('/api/cms/users', { data: { ...mutation, username: `${username}-edited`, role: 'Admin' } }), 200);
    await expectStatus(await admin.patch('/api/cms/users', { data: { ...mutation, password: `${sensitivePassword}-reset` } }), 200);
    await expectStatus(await admin.delete('/api/cms/users', { data: mutation }), 200);
    await expectStatus(await admin.post('/api/cms/users/restore', { data: mutation }), 200);
    await expectStatus(await admin.delete('/api/cms/users', { data: mutation }), 200);
    await expectStatus(await admin.post('/api/cms/users/remove', { data: mutation }), 200);
    const userEvents = await targetEvents(db, target!._id);
    expect(userEvents.map(event => event.action)).toEqual(['user.created', 'user.updated', 'user.password_reset', 'user.trashed', 'user.restored', 'user.trashed', 'user.deleted']);
    for (const event of userEvents) expectStoredEvent(event);

    const settings = (await (await admin.get('/api/cms/settings')).json()).settings;
    await expectStatus(await admin.put('/api/cms/settings', { data: { settings: { ...settings, officeAddress: 'Private submitted settings marker' }, expectedRevision: settings.revision } }), 200);
    const settingEvents = await targetEvents(db, 'website');
    expect(settingEvents).toHaveLength(1);
    expect(settingEvents[0]).toMatchObject({ action: 'settings.updated', target: { type: 'Settings', id: 'website' } });
    expect(JSON.stringify(settingEvents)).not.toContain('Private submitted settings marker');
    expectStoredEvent(settingEvents[0]);

    const attemptedUsername = 'private-attempt@example.test';
    await expectStatus(await visitor.post('/api/cms/login', { data: { username: attemptedUsername, password: sensitivePassword, ...await loginChallengeData(visitor) } }), 401);
    const denied = await db.collection<LogDocument>('moe_logs').find({ action: 'auth.login', outcome: 'denied' }).toArray();
    expect(denied).toHaveLength(1);
    expect(denied[0].actor).toEqual({ system: true });
    expect(denied[0].target).toEqual({ type: 'Session', id: 'cms' });
    expect(JSON.stringify(denied)).not.toContain(attemptedUsername);
    expectSafe(denied);
    await expectStatus(await admin.post('/api/cms/password', { data: { currentPassword: E2E_ADMIN.password, newPassword: sensitivePassword } }), 200);
    const passwordEvents = await db.collection<LogDocument>('moe_logs').find({ action: 'auth.password_changed', 'actor.id': E2E_ADMIN.id }).toArray();
    expect(passwordEvents).toHaveLength(1);
    expectStoredEvent(passwordEvents[0]);
    await expectStatus(await admin.post('/api/cms/logout'), 200);
    const securityEvents = await db.collection<LogDocument>('moe_logs').find({ category: 'auth', 'actor.id': E2E_ADMIN.id }).toArray();
    expect(securityEvents.map(event => event.action)).toEqual(expect.arrayContaining(['auth.login', 'auth.logout', 'auth.password_changed']));
    expectSafe(await db.collection('moe_logs').find().toArray());
  } finally { await admin.dispose(); await visitor.dispose(); }
});

test('existing long email-style usernames remain valid audit actors', async ({ db }) => {
  const username = `existing.account.${'a'.repeat(35)}@example.test`;
  const account = await seedAccount(db, username, 'Operator');
  const client = await signIn(username);
  try {
    const events = await db.collection<LogDocument>('moe_logs').find({ action: 'auth.login', 'actor.id': account._id }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0].actor).toEqual({ id: account._id, username, role: 'Operator' });
    expectSafe(await readLogs(client, new URLSearchParams({ q: username })));
  } finally { await client.dispose(); }
});

test('image and enquiry operations record minimal events and repeat saves do not duplicate history', async ({ db }) => {
  const admin = await signIn();
  const submissionId = randomUUID();
  const mediaId = createHash('sha256').update('audit-image-fixture').digest('hex');
  const now = new Date();
  await db.collection<{ _id: string }>('moe_media').insertOne({ _id: mediaId, id: mediaId, title: 'Audit image', publicId: `moe-e2e/${mediaId}`, url: `${E2E_IMAGE_ORIGIN}v1/${mediaId}.png`, state: 'staged', pinned: false, owner: E2E_ADMIN.id, submissionId, touchedAt: now, createdAt: now.toISOString() } as never);
  try {
    const commit = { mediaId, submissionId, title: 'Audit image saved' };
    await expectStatus(await admin.post('/api/cms/media/commit', { data: commit }), 200);
    await expectStatus(await admin.post('/api/cms/media/commit', { data: commit }), 200);
    expect((await targetEvents(db, mediaId)).map(event => event.action)).toEqual(['media.uploaded']);
    for (const route of ['trash', 'trash', 'restore', 'restore', 'trash']) {
      await expectStatus(await admin.post(`/api/cms/media/${route}`, { data: { mediaId } }), 200);
    }
    const moved = await targetEvents(db, mediaId);
    expect(moved.map(event => event.action)).toEqual(['media.uploaded', 'media.trashed', 'media.restored', 'media.trashed']);
    for (const event of moved) expectStoredEvent(event);
    // Provider credentials are disabled in this isolated runner. A failed remove
    // must describe failure, retain the claim, and never claim a successful delete.
    await expectStatus(await admin.post('/api/cms/media/remove', { data: { mediaId } }), 502);
    const failed = await targetEvents(db, mediaId);
    expect(failed.at(-1)).toMatchObject({ action: 'media.delete_failed', outcome: 'failed' });
    expect(failed.some(event => event.action === 'media.deleted')).toBe(false);

    const enquiry = await db.collection('moe_enquiries').findOne({ status: 'New' });
    expect(enquiry).not.toBeNull();
    await db.collection('moe_enquiries').updateOne({ _id: enquiry!._id }, { $set: { message: 'Private enquiry body marker', email: 'private-audit-email@example.test' } });
    await expectStatus(await admin.patch('/api/cms/inbox', { data: { id: enquiry!.id, expectedRevision: enquiry!.revision, status: 'In progress' } }), 200);
    const events = await targetEvents(db, String(enquiry!.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'enquiry.status_changed', target: { type: 'Enquiry', id: enquiry!.id } });
    expect(events[0].target).not.toHaveProperty('label');
    expectStoredEvent(events[0]);
    const notification = await admin.post('/api/cms/inbox/notify', { data: { id: enquiry!.id } });
    await expectStatus(notification, 200);
    expect((await notification.json()).enquiry.notification.status).toBe('not_configured');
    const requested = (await targetEvents(db, String(enquiry!.id))).at(-1)!;
    expect(requested).toMatchObject({ action: 'enquiry.notification_requested', target: { type: 'Enquiry', id: enquiry!.id } });
    expectStoredEvent(requested);
    const all = await db.collection<LogDocument>('moe_logs').find().toArray();
    expect(JSON.stringify(all)).not.toMatch(/Private enquiry body marker|private-audit-email@example.test/);
    expectSafe(await readLogs(admin));
  } finally { await admin.dispose(); }
});
