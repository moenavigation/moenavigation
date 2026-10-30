import { randomUUID } from 'node:crypto';
import { request as apiRequest, type APIResponse } from '@playwright/test';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';
import type { ContentRecord, SiteSettings } from '../../src/lib/cms-types';
import { recordSchema, siteSettingsSchema } from '../../src/lib/validation';
import type { UserDocument, MediaDocument, EnquiryDocument } from '../../src/server/db';

async function status(response: APIResponse, expected: number) { expect(response.status(), await response.text()).toBe(expected); }

test('Operator can complete normal collection, fixed-page, Settings, inbox and recoverable image workflows', async ({ db, page }) => {
  test.setTimeout(120_000);
  const users = db.collection<UserDocument>('moe_users');
  const original = await users.findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  const actor = { ...original!, _id: randomUUID(), username: 'audit-allowed-operator', role: 'Operator' as const };
  await users.insertOne(actor);
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  try {
    await status(await client.post('/api/cms/login', { data: { username: actor.username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } }), 200);
    const all = await client.get('/api/cms/content'); await status(all, 200);
    const { records } = await all.json() as { records: ContentRecord[] };
    for (const type of ['Vessel', 'Route', 'Project', 'Service', 'News'] as const) {
      const source = records.find(record => record.type === type)!;
      expect(source).toBeTruthy();
      const create = await client.post('/api/cms/content', { data: { record: recordSchema.parse({ ...source, id: `audit-operator-${type.toLowerCase()}`, title: `Operator ${type}` }), expectedRevision: null, submissionId: randomUUID() } });
      await status(create, 200);
      const created = (await create.json() as { record: ContentRecord }).record;
      const edit = await client.post('/api/cms/content', { data: { record: recordSchema.parse({ ...created, title: `Operator edited ${type}` }), expectedRevision: created.revision, submissionId: randomUUID() } });
      await status(edit, 200);
      const edited = (await edit.json() as { record: ContentRecord }).record;
      const trash = await client.post('/api/cms/content/action', { data: { type, id: edited.id, action: 'trash', expectedRevision: edited.revision } });
      await status(trash, 200);
      const removed = (await trash.json() as { record: ContentRecord }).record;
      await status(await client.post('/api/cms/content/remove', { data: { type, id: removed.id, expectedRevision: removed.revision } }), 403);
      await status(await client.post('/api/cms/content/action', { data: { type, id: removed.id, action: 'restore', expectedRevision: removed.revision } }), 200);
    }
    for (const type of ['Page', 'Section'] as const) {
      const source = records.find(record => record.type === type && (type !== 'Page' || record.id === 'home'))!;
      expect(source).toBeTruthy();
      const editedResponse = await client.post('/api/cms/content', { data: { record: recordSchema.parse({ ...source, title: `Operator updated ${type}` }), expectedRevision: source.revision, submissionId: randomUUID() } });
      await status(editedResponse, 200);
      const edited = (await editedResponse.json() as { record: ContentRecord }).record;
      await status(await client.post('/api/cms/content', { data: { record: recordSchema.parse({ ...edited, id: `audit-forbidden-${type.toLowerCase()}` }), expectedRevision: null, submissionId: randomUUID() } }), 403);
      await status(await client.post('/api/cms/content', { data: { record: recordSchema.parse({ ...edited, order: (edited.order ?? 0) + 1 }), expectedRevision: edited.revision, submissionId: randomUUID() } }), 403);
      await status(await client.post('/api/cms/content/action', { data: { type, id: edited.id, action: 'trash', expectedRevision: edited.revision } }), 403);
    }
    const settingsResponse = await client.get('/api/cms/settings'); await status(settingsResponse, 200);
    const { settings } = await settingsResponse.json() as { settings: SiteSettings };
    const changedSettings = await client.put('/api/cms/settings', { data: { settings: siteSettingsSchema.parse({ ...settings, phone: '+66 2000 1234' }), expectedRevision: settings.revision } });
    await status(changedSettings, 200);
    expect((await changedSettings.json()).settings).toMatchObject({ phone: '+66 2000 1234', revision: settings.revision + 1 });
    const inbox = await client.get('/api/cms/inbox'); await status(inbox, 200);
    const enquiry = (await inbox.json() as { enquiries: EnquiryDocument[] }).enquiries[0];
    expect(enquiry).toBeTruthy();
    const changedEnquiry = await client.patch('/api/cms/inbox', { data: { id: enquiry.id, expectedRevision: enquiry.revision, status: 'Resolved' } });
    await status(changedEnquiry, 200);
    expect((await changedEnquiry.json()).enquiry.status).toBe('Resolved');
    const media: MediaDocument = { _id: 'audit-operator-unused', id: 'audit-operator-unused', title: 'Operator shared library image', url: `${E2E_IMAGE_ORIGIN}v1/audit-operator-unused.png`, publicId: 'moe-e2e/audit-operator-unused', state: 'committed', owner: E2E_ADMIN.id, submissionId: randomUUID(), pinned: true, touchedAt: new Date(), createdAt: new Date().toISOString() };
    await db.collection<MediaDocument>('moe_media').insertOne(media);
    await status(await client.post('/api/cms/media/trash', { data: { mediaId: media.id } }), 200);
    await status(await client.post('/api/cms/media/remove', { data: { mediaId: media.id } }), 403);
    await status(await client.post('/api/cms/media/restore', { data: { mediaId: media.id } }), 200);
    expect(await db.collection<MediaDocument>('moe_media').findOne({ _id: media.id })).toMatchObject({ state: 'committed' });
    await page.context().clearCookies(); await page.context().addCookies((await client.storageState()).cookies);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/cms/fleet'); await expect(page.getByRole('button', { name: 'Add vessel', exact: true })).toBeVisible();
    await page.goto('/cms/setting'); await expect(page.getByRole('button', { name: 'Save website details', exact: true })).toBeVisible();
    await page.goto('/cms/enquiries'); await expect(page.getByRole('region', { name: 'Enquiry inbox', exact: true })).toBeVisible();
    await page.goto('/cms/media'); await expect(page.getByRole('button', { name: 'Add an image', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  } finally { await client.dispose(); }
});
