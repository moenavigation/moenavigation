import { randomUUID } from 'node:crypto';
import { request as apiRequest, type APIResponse } from '@playwright/test';
import type { EnquiryDocument, UserDocument } from '../../src/server/db';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, loginChallengeData, E2E_ADMIN, E2E_BASE_URL, E2E_INBOX } from './fixtures';

const headers = { Origin: E2E_BASE_URL };
async function expectStatus(response: APIResponse, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

for (const screen of [{ locale: 'en', width: 1280 }, { locale: 'th', width: 360 }] as const) {
  test(`enquiry details confirms Trash and restores the same status and expiry · ${screen.locale}`, async ({ page, db }, testInfo) => {
    const t = (value: string) => translateCms(screen.locale, value);
    await page.setViewportSize({ width: screen.width, height: 900 });
    await login(page);
    await page.evaluate(locale => localStorage.setItem('moe-cms-language', locale), screen.locale);
    await page.goto('/cms/enquiries');
    const inbox = page.getByRole('region', { name: t('Enquiry inbox') });
    await expect(inbox.getByText(t('Enquiries expire one year after receipt.'), { exact: true })).toBeVisible();
    await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
    await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
    const detail = page.getByRole('dialog', { name: t('Enquiry details'), exact: true });
    const move = detail.getByRole('button', { name: t('Move to Trash'), exact: true });
    await expect(move).toBeEnabled();
    await expect(detail.getByText(new RegExp(screen.locale === 'th' ? '^หมดอายุ ' : '^Expires '))).toBeVisible();
    const before = await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id });
    expect(before).toMatchObject({ status: 'In progress', revision: 2 });
    const originalExpiry = new Date(before!.createdAt); originalExpiry.setUTCFullYear(originalExpiry.getUTCFullYear() + 1);

    await move.click();
    const confirm = page.getByRole('dialog', { name: t('Move to Trash'), exact: true });
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).not.toBeVisible();
    await expect(move).toBeFocused();
    expect((await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: before!._id }))?.deletedAt).toBeUndefined();

    if (screen.locale === 'en') await page.route('**/api/cms/inbox/action', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, status: 503, json: { error: 'Simulated interrupted response after a successful write.' } });
    }, { times: 1 });
    await move.click();
    await confirm.getByRole('button', { name: t('Move to Trash'), exact: true }).click();
    await expect(detail).not.toBeVisible();
    await expect(inbox.getByRole('searchbox')).toBeFocused();
    await expect(inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) })).toHaveCount(0);
    const trashed = await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: before!._id });
    expect(trashed).toMatchObject({ status: 'In progress', revision: 3, expiresAt: originalExpiry });
    expect(trashed!.purgeAt!.getTime()).toBeLessThanOrEqual(Date.parse(trashed!.deletedAt!) + 30 * 86400000);
    await inbox.getByRole('link', { name: t('View enquiry Trash'), exact: true }).click();
    const row = page.locator(`[data-trash-key="Enquiry:${before!._id}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByText(t('Enquiry'), { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`enquiry-trash-${screen.locale}.png`), fullPage: true });
    await row.getByRole('button', { name: new RegExp(`^${t('Restore {name}').split('{name}')[0]}`) }).click();
    await expect(row).toHaveCount(0);
    const restored = await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: before!._id });
    expect(restored).toMatchObject({ status: 'In progress', revision: 4, expiresAt: originalExpiry, purgeAt: originalExpiry });
    expect(restored!.deletedAt).toBeUndefined();
    await page.goto('/cms/enquiries');
    await page.getByRole('searchbox', { name: t('Search all enquiries'), exact: true }).fill(E2E_INBOX.oldThai.query);
    await page.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
    await expect(detail.getByRole('button', { name: t('In progress'), exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: before!._id }))?.revision).toBe(4);
    await expect.poll(() => detail.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await move.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`enquiry-details-${screen.locale}.png`) });
  });
}

test('expiry is enforced before TTL cleanup in inbox, details, status, notifications, exports, dashboard and Trash', async ({ page, db }) => {
  await login(page);
  const source = (await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id }))!;
  const now = Date.now(), marker = 'Retention boundary fixture';
  const future = new Date(now + 7 * 86400000);
  const expired: EnquiryDocument[] = [
    { ...source, _id: randomUUID(), id: '', submissionId: randomUUID(), subject: marker, createdAt: new Date(now).toISOString(), expiresAt: new Date(now - 1), purgeAt: future },
    { ...source, _id: randomUUID(), id: '', submissionId: randomUUID(), subject: marker, createdAt: '2024-02-29T12:00:00.000Z', purgeAt: future },
    { ...source, _id: randomUUID(), id: '', submissionId: randomUUID(), subject: marker, createdAt: new Date(now).toISOString(), deletedAt: new Date(now - 31 * 86400000).toISOString(), purgeAt: future },
  ].map(record => ({ ...record, id: record._id, status: 'New' as const, revision: 1 }));
  const dashboardBefore = await (await page.request.get('/api/cms/dashboard')).json();
  await db.collection<EnquiryDocument>('moe_enquiries').insertMany(expired);
  const list = await page.request.get('/api/cms/inbox', { params: { q: marker } });
  expect(await list.json()).toMatchObject({ enquiries: [], total: 0, totalAll: E2E_INBOX.total });
  for (const record of expired) {
    await expectStatus(await page.request.get(`/api/cms/inbox?id=${record.id}`), 404);
    await expectStatus(await page.request.patch('/api/cms/inbox', { headers, data: { id: record.id, expectedRevision: 1, status: 'Resolved' } }), 409);
    await expectStatus(await page.request.post('/api/cms/inbox/notify', { headers, data: { id: record.id } }), 404);
    await expectStatus(await page.request.post('/api/cms/inbox/action', { headers, data: { id: record.id, expectedRevision: 1, action: record.deletedAt ? 'restore' : 'trash' } }), 404);
    const trash = await (await page.request.get('/api/cms/trash', { params: { item: `Enquiry:${record.id}` } })).json();
    expect(trash).toMatchObject({ items: [], total: 0 });
    expect((await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: record._id }))?.revision).toBe(1);
  }
  const dashboardAfter = await (await page.request.get('/api/cms/dashboard')).json();
  expect(dashboardAfter.enquiriesTotal).toBe(dashboardBefore.enquiriesTotal);
  expect(dashboardAfter.enquiries.some((record: { id: string }) => expired.some(item => item.id === record.id))).toBe(false);
  const exported = await (await page.request.get('/api/cms/export')).json();
  expect(exported.enquiries.some((record: { id: string }) => expired.some(item => item.id === record.id))).toBe(false);
  const index = (await db.collection('moe_enquiries').indexes()).find(item => item.key.purgeAt === 1);
  expect(index?.expireAfterSeconds).toBe(0);
});

test('retention cannot be extended through status changes, Trash or restore, and deletion is revision/role protected', async ({ page, db }) => {
  await login(page);
  const enquiries = db.collection<EnquiryDocument>('moe_enquiries');
  const source = (await enquiries.findOne({ _id: E2E_INBOX.oldThai.id }))!;
  const id = randomUUID(), expiry = new Date(Date.now() + 2 * 86400000);
  await enquiries.insertOne({ ...source, _id: id, id, submissionId: randomUUID(), status: 'Resolved', expiresAt: expiry, purgeAt: expiry, revision: 1 });
  await expectStatus(await page.request.post('/api/cms/inbox/remove', { headers, data: { id, expectedRevision: 1 } }), 409);
  await expectStatus(await page.request.post('/api/cms/inbox/action', { headers, data: { id, expectedRevision: 9, action: 'trash' } }), 409);
  await expectStatus(await page.request.post('/api/cms/inbox/action', { headers, data: { id, expectedRevision: 1, action: 'trash', expiresAt: '2099-01-01T00:00:00.000Z' } }), 400);
  await expectStatus(await page.request.post('/api/cms/inbox/action', { headers, data: { id, expectedRevision: 1, action: 'trash' } }), 200);
  expect(await enquiries.findOne({ _id: id })).toMatchObject({ revision: 2, expiresAt: expiry, purgeAt: expiry });
  const detail = await page.request.get(`/api/cms/inbox?id=${id}`); await expectStatus(detail, 404);
  const overview = await (await page.request.get('/api/cms/content?scope=overview')).json();
  const trashPage = await (await page.request.get('/api/cms/trash')).json();
  expect(trashPage.counts.Enquiry).toBe(1);
  expect(overview.summary.trashCount).toBe(trashPage.counts.All);
  const targeted = await (await page.request.get('/api/cms/trash', { params: { item: `Enquiry:${id}` } })).json();
  expect(JSON.stringify(targeted)).not.toMatch(/email|message|fingerprint|consentAt|submissionId|notificationDelivery/);
  for (const q of [source.email, source.message]) {
    const privateSearch = await (await page.request.get('/api/cms/trash', { params: { kind: 'Enquiry', q } })).json();
    expect(privateSearch).toMatchObject({ items: [], total: 0 });
  }
  expect((await (await page.request.get('/api/cms/export')).json()).enquiries.some((item: { id: string }) => item.id === id)).toBe(true);

  const admin = (await db.collection<UserDocument>('moe_users').findOne({ _id: E2E_ADMIN.id }))!;
  await db.collection<UserDocument>('moe_users').insertOne({ ...admin, _id: randomUUID(), username: 'retention-operator', role: 'Operator' });
  const operator = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: headers });
  try {
    await expectStatus(await operator.post('/api/cms/login', { data: { username: 'retention-operator', password: E2E_ADMIN.password, ...await loginChallengeData(operator) } }), 200);
    await expectStatus(await operator.post('/api/cms/inbox/remove', { data: { id, expectedRevision: 2 } }), 403);
    await expectStatus(await operator.post('/api/cms/inbox/action', { data: { id, expectedRevision: 2, action: 'restore' } }), 200);
    expect(await enquiries.findOne({ _id: id })).toMatchObject({ status: 'Resolved', revision: 3, expiresAt: expiry, purgeAt: expiry });
    await expectStatus(await operator.patch('/api/cms/inbox', { data: { id, expectedRevision: 3, status: 'In progress', expiresAt: '2099-01-01T00:00:00.000Z' } }), 200);
    expect(await enquiries.findOne({ _id: id })).toMatchObject({ status: 'In progress', revision: 4, expiresAt: expiry, purgeAt: expiry });
    await expectStatus(await operator.post('/api/cms/inbox/action', { data: { id, expectedRevision: 4, action: 'trash' } }), 200);
    await expectStatus(await page.request.post('/api/cms/inbox/remove', { headers, data: { id, expectedRevision: 4 } }), 409);
    await expectStatus(await page.request.post('/api/cms/inbox/remove', { headers, data: { id, expectedRevision: 5 } }), 200);
    expect(await enquiries.findOne({ _id: id })).toBeNull();
    const logs = await db.collection('moe_logs').find({ 'target.id': id }).toArray();
    expect(logs.map(item => item.action)).toEqual(['enquiry.trashed', 'enquiry.restored', 'enquiry.status_changed', 'enquiry.trashed', 'enquiry.deleted']);
    expect(JSON.stringify(logs)).not.toContain(source.email);
    expect(JSON.stringify(logs)).not.toContain(source.subject);
    expect(JSON.stringify(logs)).not.toContain(source.message);
  } finally { await operator.dispose(); }
});

test('new contact submissions receive immutable BSON deadlines and retries keep the original date', async ({ page, db }) => {
  const input = { name: 'Retention visitor', email: 'retention@example.test', company: '', subject: 'New expiry enquiry', message: 'Please share your shipping details.', locale: 'en', consent: true, website: '', submissionId: randomUUID() };
  const first = await page.request.post('/api/contact', { headers, data: input });
  await expectStatus(first, 201);
  const { id } = await first.json();
  const saved = (await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: id }))!;
  const expected = new Date(saved.createdAt); expected.setUTCFullYear(expected.getUTCFullYear() + 1);
  expect(saved).toMatchObject({ expiresAt: expected, purgeAt: expected, revision: 1 });
  const retry = await page.request.post('/api/contact', { headers, data: input });
  await expectStatus(retry, 201);
  expect(await retry.json()).toMatchObject({ id });
  expect((await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: id }))?.expiresAt).toEqual(expected);
});
