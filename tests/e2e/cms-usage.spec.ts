import { randomUUID } from 'node:crypto';
import { request as apiRequest, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { Db } from 'mongodb';
import type { CmsRole } from '../../src/lib/cms-roles';
import type { UsageOverview, UsageProvider, UsageSettings } from '../../src/lib/cms-usage';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';

type Account = { _id: string; username: string; role?: CmsRole; passwordHash: string; passwordVersion: number; createdAt: Date };
type State = { _id: string; count?: number; value?: string; expiresAt?: Date };
const origin = { Origin: E2E_BASE_URL };

async function expectStatus(response: Pick<APIResponse, 'status' | 'text'>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

async function seedAccount(db: Db, username: string, role: CmsRole) {
  const source = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(source).not.toBeNull();
  const account = { ...source!, _id: randomUUID(), username, role, createdAt: new Date() };
  await db.collection<Account>('moe_users').insertOne(account);
  return account;
}

async function signIn(username: string = E2E_ADMIN.username) {
  const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: origin });
  await expectStatus(await client.post('/api/cms/login', { data: { username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } }), 200);
  return client;
}

async function overview(client: APIRequestContext) {
  const response = await client.get('/api/cms/usage');
  await expectStatus(response, 200);
  return await response.json() as UsageOverview;
}

function update(settings: UsageSettings, extra: Record<string, unknown> = {}) {
  const reading = settings.vercelReading;
  return {
    expectedRevision: settings.revision, allowances: settings.allowances, vercelWindow: settings.vercelWindow,
    vercelReading: reading ? { transferBytes: reading.transferBytes, requests: reading.requests, periodLabel: reading.periodLabel } : null,
    ...extra,
  };
}

function provider(data: UsageOverview, id: UsageProvider['id']) {
  const match = data.providers.find(item => item.id === id);
  expect(match).toBeDefined();
  return match!;
}

function safe(data: unknown) {
  expect(JSON.stringify(data)).not.toMatch(/passwordHash|passwordVersion|currentPassword|Bearer |Basic |api_secret|mongodb:\/\/|scrypt:/i);
  expect(JSON.stringify(data)).not.toContain(E2E_ADMIN.password);
}

async function replaceCachedProvider(db: Db, replacement: UsageProvider) {
  const row = await db.collection<State>('moe_state').findOne({ _id: new RegExp(`^usage:cache:${replacement.id}:`) });
  expect(row).not.toBeNull();
  const cached = JSON.parse(row!.value!) as { provider: UsageProvider; window: string; nextCheckAt: number };
  await db.collection<State>('moe_state').updateOne({ _id: row!._id }, { $set: { value: JSON.stringify({ ...cached, provider: replacement }) } });
  return { row: row!, cached };
}

test('only Dev and Admin can read or update usage, and permissions follow the current stored role', async ({ page, db }) => {
  const developer = await seedAccount(db, 'usage-developer', 'Dev');
  const operator = await seedAccount(db, 'usage-operator', 'Operator');
  await expectStatus(await page.request.get('/api/cms/usage'), 401);
  const clients = await Promise.all([signIn(), signIn(developer.username), signIn(operator.username)]);
  try {
    const adminData = await overview(clients[0]);
    const devData = await overview(clients[1]);
    expect(adminData.providers.map(item => item.id)).toEqual(['vercel', 'mongodb', 'cloudinary']);
    expect(devData.providers.map(item => item.id)).toEqual(['vercel', 'mongodb', 'cloudinary']);
    safe(adminData);
    safe(devData);
    const before = await db.collection<State>('moe_state').find({ _id: /^usage:/ }).sort({ _id: 1 }).toArray();
    for (const method of ['GET', 'POST', 'PUT']) {
      await expectStatus(await clients[2].fetch('/api/cms/usage', { method, ...(method === 'PUT' ? { data: update(adminData.settings) } : {}) }), 403);
    }
    expect(await db.collection<State>('moe_state').find({ _id: /^usage:/ }).sort({ _id: 1 }).toArray()).toEqual(before);
    for (const client of clients.slice(0, 2)) {
      for (const method of ['POST', 'PUT']) await expectStatus(await client.fetch('/api/cms/usage', { method, headers: { Origin: 'https://untrusted.example' }, ...(method === 'PUT' ? { data: update(adminData.settings) } : {}) }), 403);
    }
    await expectStatus(await clients[0].get('/api/cms/usage?refresh=true'), 400);
    for (const method of ['PATCH', 'DELETE']) await expectStatus(await clients[0].fetch('/api/cms/usage', { method }), 405);
    const updated = await clients[1].put('/api/cms/usage', { data: update(devData.settings, { vercelReading: { transferBytes: 0, requests: null, periodLabel: 'Provider dashboard test period' } }) });
    await expectStatus(updated, 200);
    await db.collection<Account>('moe_users').updateOne({ _id: developer._id }, { $set: { role: 'Operator' } });
    await expectStatus(await clients[1].get('/api/cms/usage'), 403);
    await expectStatus(await clients[1].put('/api/cms/usage', { data: update((await updated.json() as UsageOverview).settings) }), 403);

    await page.context().addCookies((await clients[2].storageState()).cookies);
    await page.goto('/cms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
    await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'CMS navigation', exact: true }).getByRole('button', { name: 'Data usage', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/cms/usage');
    await expect(page.locator('[data-usage-provider]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update Vercel reading', exact: true })).toHaveCount(0);
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});

test('missing readings remain unknown, explicit zero is saved, and monitoring edits have safe revisioned audit records', async ({ db }) => {
  const admin = await signIn();
  try {
    const first = await overview(admin);
    expect(first.settings.revision).toBe(0);
    expect(first.settings.vercelReading).toBeNull();
    expect(first.settings.allowances).toEqual(expect.arrayContaining([
      { provider: 'mongodb', metric: 'cluster_storage', limit: 512 * 1024 * 1024, unit: 'bytes' },
      { provider: 'vercel', metric: 'fast_data_transfer', limit: 100 * 1e9, unit: 'bytes' },
      { provider: 'vercel', metric: 'cdn_requests', limit: 1e6, unit: 'count' },
    ]));
    const missing = provider(first, 'vercel');
    expect(missing.status).toBe('not_configured');
    expect(missing.metrics.every(metric => metric.used === null)).toBe(true);
    expect(provider(first, 'cloudinary').status).toBe('not_configured');
    expect(provider(first, 'cloudinary').metrics).toEqual([]);
    const mongo = provider(first, 'mongodb');
    expect(mongo.metrics.find(metric => metric.key === 'cluster_storage')).toMatchObject({ used: null, limit: 512 * 1024 * 1024, scope: 'cluster' });
    expect(mongo.metrics.find(metric => metric.key === 'database_storage')).toMatchObject({ limit: null, scope: 'database' });
    expect(mongo.metrics.find(metric => metric.key === 'database_storage')?.used).toBeGreaterThan(0);
    expect(mongo.metrics.find(metric => metric.key === 'data_transfer')).toMatchObject({ used: null, limit: null });

    const request = update(first.settings, { vercelReading: { transferBytes: null, requests: 0, periodLabel: 'Provider dashboard: last 30 days' } });
    const before = Date.now();
    const saved = await admin.put('/api/cms/usage', { data: request });
    await expectStatus(saved, 200);
    const data = await saved.json() as UsageOverview;
    expect(data.settings.revision).toBe(1);
    expect(data.settings.vercelReading).toMatchObject(request.vercelReading!);
    expect(Date.parse(data.settings.vercelReading!.recordedAt)).toBeGreaterThanOrEqual(before);
    expect(provider(data, 'vercel').metrics.find(metric => metric.key === 'fast_data_transfer')).toMatchObject({ used: null, limit: 100 * 1e9 });
    expect(provider(data, 'vercel').metrics.find(metric => metric.key === 'cdn_requests')).toMatchObject({ used: 0, limit: 1e6 });
    const stored = await db.collection<State>('moe_state').findOne({ _id: 'usage:settings' });
    expect(stored?.count).toBe(1);
    expect(JSON.parse(stored!.value!)).toEqual(data.settings);
    await expectStatus(await admin.put('/api/cms/usage', { data: request }), 409);
    expect((await overview(admin)).settings).toEqual(data.settings);
    const events = await db.collection('moe_logs').find({ action: 'settings.usage_updated' }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: 'settings', actor: { id: E2E_ADMIN.id, username: E2E_ADMIN.username, role: 'Admin' }, target: { type: 'Settings', id: 'usage' }, outcome: 'success' });
    expect(events[0]).not.toHaveProperty('vercelReading');
    expect(events[0]).not.toHaveProperty('allowances');
    safe(data);
    safe(events);

    const configured = await admin.put('/api/cms/usage', { data: update(data.settings, { allowances: data.settings.allowances.map(item => item.metric === 'cdn_requests' ? { ...item, limit: 900_000 } : item) }) });
    await expectStatus(configured, 200);
    const configuredData = await configured.json() as UsageOverview;
    expect(configuredData.settings.revision).toBe(2);
    expect(configuredData.settings.vercelReading?.recordedAt).toBe(data.settings.vercelReading?.recordedAt);
    const changed = await admin.put('/api/cms/usage', { data: update(configuredData.settings, { vercelReading: { transferBytes: 120 * 1e9, requests: null, periodLabel: 'Provider dashboard current reporting range' } }) });
    await expectStatus(changed, 200);
    const latest = await overview(admin);
    expect(latest.settings.revision).toBe(3);
    expect(provider(latest, 'vercel').metrics.find(metric => metric.key === 'fast_data_transfer')).toMatchObject({ used: 120 * 1e9, limit: 100 * 1e9 });
    expect(provider(latest, 'vercel').metrics.find(metric => metric.key === 'cdn_requests')?.used).toBeNull();
  } finally { await admin.dispose(); }
});

test('invalid monitoring settings never change the saved revision or activity history', async ({ db }) => {
  const admin = await signIn();
  try {
    const initial = await overview(admin);
    const valid = update(initial.settings);
    const invalid = [
      { ...valid, unknown: true },
      { ...valid, vercelReading: { transferBytes: null, requests: null, periodLabel: 'Empty reading' } },
      { ...valid, vercelReading: { transferBytes: -1, requests: 1, periodLabel: 'Negative' } },
      { ...valid, vercelReading: { transferBytes: 1, requests: 1.5, periodLabel: 'Fraction' } },
      { ...valid, vercelReading: { transferBytes: 1, requests: 0, periodLabel: ' ' } },
      { ...valid, vercelReading: { transferBytes: 1, requests: 0, periodLabel: 'Period', recordedAt: new Date().toISOString() } },
      { ...valid, allowances: [...valid.allowances, valid.allowances[0]] },
      { ...valid, allowances: [{ provider: 'vercel', metric: 'cdn_requests', limit: -1, unit: 'count' }] },
      { ...valid, vercelWindow: { start: '2026-02-30', end: '2026-03-01' } },
      { ...valid, vercelWindow: { start: '2026-03-02', end: '2026-03-01' } },
      { ...valid, vercelWindow: { start: '2025-01-01', end: '2026-01-03' } },
      { ...valid, allowances: [{ provider: 'vercel', metric: 'sku:123', limit: 1, unit: 'count' }], vercelWindow: null },
    ];
    for (const data of invalid) await expectStatus(await admin.put('/api/cms/usage', { data }), 400);
    expect((await overview(admin)).settings).toEqual(initial.settings);
    expect(await db.collection<State>('moe_state').findOne({ _id: 'usage:settings' })).toBeNull();
    expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(0);
  } finally { await admin.dispose(); }
});

test('an activity-write failure rolls monitoring edits back and permits a clean retry', async ({ db }) => {
  const admin = await signIn();
  try {
    const first = await overview(admin);
    const data = update(first.settings, { vercelReading: { transferBytes: 12 * 1e9, requests: 345, periodLabel: 'Transaction test reporting period' } });
    await db.command({ collMod: 'moe_logs', validator: { action: { $ne: 'settings.usage_updated' } }, validationLevel: 'strict', validationAction: 'error' });
    try {
      await expectStatus(await admin.put('/api/cms/usage', { data }), 503);
      expect(await db.collection<State>('moe_state').findOne({ _id: 'usage:settings' })).toBeNull();
      expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(0);
      expect((await overview(admin)).settings.revision).toBe(0);
    } finally { await db.command({ collMod: 'moe_logs', validator: {}, validationLevel: 'strict', validationAction: 'error' }); }
    await expectStatus(await admin.put('/api/cms/usage', { data }), 200);
    expect((await overview(admin)).settings.revision).toBe(1);
    expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(1);
  } finally { await admin.dispose(); }
});

test('repeated refreshes share the server cooldown across users and retain bounded provider caches', async ({ db }) => {
  const developer = await seedAccount(db, 'usage-refresh-dev', 'Dev');
  const clients = await Promise.all([signIn(), signIn(developer.username)]);
  try {
    const first = await overview(clients[0]);
    const force = await clients[0].post('/api/cms/usage');
    await expectStatus(force, 200);
    const forced = await force.json() as UsageOverview;
    expect(Date.parse(forced.nextRefreshAt)).toBeGreaterThan(Date.now());
    const state = () => db.collection<State>('moe_state').find({ _id: /^usage:(?:cache:|lease:|refresh)/ }).sort({ _id: 1 }).toArray();
    const before = await state();
    expect(before.some(item => item._id.startsWith('usage:cache:mongodb:'))).toBe(true);
    expect(before.some(item => item._id.startsWith('usage:cache:cloudinary:'))).toBe(true);
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => clients[index % 2].post('/api/cms/usage')));
    for (const response of responses) {
      await expectStatus(response, 200);
      const data = await response.json() as UsageOverview;
      expect(provider(data, 'mongodb').checkedAt).toBe(provider(first, 'mongodb').checkedAt);
      expect(provider(data, 'cloudinary').checkedAt).toBe(provider(first, 'cloudinary').checkedAt);
      expect(data.nextRefreshAt).toBe(forced.nextRefreshAt);
    }
    expect(await state()).toEqual(before);
    const again = await overview(clients[1]);
    expect(provider(again, 'mongodb')).toEqual(provider(first, 'mongodb'));
    expect(provider(again, 'cloudinary')).toEqual(provider(first, 'cloudinary'));
    expect(await state()).toEqual(before);
    for (const cached of before.filter(item => item._id.startsWith('usage:cache:'))) {
      const value = JSON.parse(cached.value!);
      expect(value.nextCheckAt).toBeGreaterThan(Date.parse(value.provider.checkedAt));
      expect(value.nextCheckAt - Date.parse(value.provider.checkedAt)).toBeLessThanOrEqual(10 * 60_000);
      safe(value.provider);
    }
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});

test('a cached provider snapshot cannot cross its credential and reporting-scope boundary', async ({ db }) => {
  const admin = await signIn();
  try {
    const initial = await overview(admin);
    const cloud = provider(initial, 'cloudinary');
    const { row, cached } = await replaceCachedProvider(db, { ...cloud, status: 'ready', metrics: [{ key: 'credits', label: 'Other account private metric', used: 123, limit: 456, unit: 'credits', scope: 'environment', period: 'rolling_30_days' }] });
    const foreign = { ...cached, window: 'different-account-scope', provider: { ...cloud, status: 'ready', message: 'Other account private details', metrics: [{ key: 'credits', label: 'Other account private metric', used: 123, limit: 456, unit: 'credits', scope: 'environment', period: 'rolling_30_days' }] } };
    await db.collection<State>('moe_state').updateOne({ _id: row._id }, { $set: { value: JSON.stringify(foreign) } });
    const result = await overview(admin);
    expect(provider(result, 'cloudinary').metrics).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/Other account private|different-account-scope/);
    expect(JSON.stringify(result)).not.toContain(cached.window);
    safe(result);
  } finally { await admin.dispose(); }
});

test('the reading dialog cancels cleanly and preserves blank, zero, and typed values after a failed save', async ({ page, db }) => {
  await login(page);
  await page.goto('/cms/usage');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data usage');
  const vercel = page.locator('[data-usage-provider="vercel"]');
  const transfer = vercel.locator('[data-usage-metric="fast_data_transfer"]');
  await expect(transfer.getByText('Unknown', { exact: true })).toHaveCount(2);
  await expect(transfer.getByRole('progressbar')).toHaveCount(0);
  const open = vercel.getByRole('button', { name: 'Update Vercel reading', exact: true });
  await open.click();
  let dialog = page.getByRole('dialog', { name: 'Update Vercel reading', exact: true });
  await dialog.locator('input[name="transferGb"]').fill('9');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  expect(await db.collection<State>('moe_state').findOne({ _id: 'usage:settings' })).toBeNull();

  const writes: Array<Record<string, unknown>> = [];
  await page.route('**/api/cms/usage', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic monitoring save failure.' } });
    return route.continue();
  });
  await open.click();
  dialog = page.getByRole('dialog', { name: 'Update Vercel reading', exact: true });
  await expect(dialog.locator('input[name="transferGb"]')).toHaveValue('');
  await dialog.locator('input[name="transferGb"]').fill('0');
  await dialog.locator('input[name="requests"]').fill('');
  await dialog.locator('input[name="periodLabel"]').fill('Provider dashboard last 30 days');
  await dialog.getByRole('button', { name: 'Save reading', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetic monitoring save failure.');
  await expect(dialog.locator('input[name="transferGb"]')).toHaveValue('0');
  await expect(dialog.locator('input[name="requests"]')).toHaveValue('');
  await expect(dialog.locator('input[name="periodLabel"]')).toHaveValue('Provider dashboard last 30 days');
  await dialog.getByRole('button', { name: 'Save reading', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  await expect(transfer.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(transfer.getByText('0 B', { exact: true })).toBeVisible();
  await expect(vercel.locator('[data-usage-metric="cdn_requests"]').getByText('Unknown', { exact: true })).toHaveCount(2);
  expect(writes).toHaveLength(2);
  expect(writes.every(item => item.readingUpdated === true && item.expectedRevision === 0)).toBe(true);
  expect((await overview(page.request)).settings.vercelReading).toMatchObject({ transferBytes: 0, requests: null, periodLabel: 'Provider dashboard last 30 days' });
  expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(1);
  await open.click();
  dialog = page.getByRole('dialog', { name: 'Update Vercel reading', exact: true });
  await dialog.getByRole('checkbox', { name: /^Clear saved reading/ }).check();
  await expect(dialog.locator('input[name="transferGb"]')).toBeDisabled();
  await expect(dialog.locator('input[name="requests"]')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Clear saved reading', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await overview(page.request)).settings.vercelReading).toBeNull();
  await expect(transfer.getByText('Unknown', { exact: true })).toHaveCount(2);
  await expect(transfer.getByRole('progressbar')).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(2);
});

test('provider cards and monitoring dialogs show accurate remaining amounts in English and Thai', async ({ page, db }) => {
  await login(page);
  const initial = await overview(page.request);
  const saved = await page.request.put('/api/cms/usage', { headers: origin, data: update(initial.settings, { vercelReading: { transferBytes: 25 * 1e9, requests: 250_000, periodLabel: 'Provider dashboard last 30 days' } }) });
  await expectStatus(saved, 200);
  const data = await saved.json() as UsageOverview;
  const originalDate = new Date(Date.now() - 7 * 86400000).toISOString();
  const settings = { ...data.settings, vercelReading: { ...data.settings.vercelReading!, recordedAt: originalDate } };
  await db.collection<State>('moe_state').updateOne({ _id: 'usage:settings' }, { $set: { value: JSON.stringify(settings) } });
  await replaceCachedProvider(db, {
    id: 'cloudinary', name: 'Cloudinary', status: 'ready', plan: 'Current plan', checkedAt: originalDate, reportedAt: originalDate,
    dashboardUrl: 'https://console.cloudinary.com/', metrics: [
      { key: 'credits', label: 'Shared credits', used: 27, limit: 25, unit: 'credits', scope: 'environment', period: 'rolling_30_days' },
      { key: 'storage', label: 'Storage', used: 3 * 1e9, limit: null, unit: 'bytes', scope: 'environment', period: 'current' },
      { key: 'bandwidth', label: 'Bandwidth', used: 4 * 1e9, limit: null, unit: 'bytes', scope: 'environment', period: 'rolling_30_days' },
    ],
  });
  await page.goto('/cms/usage');
  await expect(page.locator('[data-usage-provider]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Monitoring limits', exact: true }).click();
  const limits = page.getByRole('dialog', { name: 'Monitoring limits', exact: true });
  await expect(limits.locator('input[name="cluster_storage"]')).toHaveValue('512');
  await expect(limits.locator('input[name="fast_data_transfer"]')).toHaveValue('100');
  await expect(limits.locator('input[name="cdn_requests"]')).toHaveValue('1000000');
  await limits.locator('input[name="cluster_storage"]').fill('');
  await limits.getByRole('button', { name: 'Save limits', exact: true }).click();
  await expect(limits).not.toBeVisible();
  const changed = await overview(page.request);
  expect(changed.settings.vercelReading?.recordedAt).toBe(originalDate);
  expect(changed.settings.allowances.some(item => item.provider === 'mongodb' && item.metric === 'cluster_storage')).toBe(false);

  for (const [width, locale] of [[1280, 'en'], [360, 'th']] as const) {
    await page.setViewportSize({ width, height: 900 });
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    const t = (value: string, params?: Record<string, string | number>) => translateCms(locale, value, params);
    if (locale === 'th') for (const key of ['Data usage', 'Remaining', 'Unknown', 'Monitoring limits', 'Update Vercel reading']) expect(t(key)).not.toBe(key);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('Data usage'));
    const dashboard = page.getByRole('region', { name: t('Service usage'), exact: true });
    const transfer = dashboard.locator('[data-usage-provider="vercel"] [data-usage-metric="fast_data_transfer"]');
    await expect(transfer.getByText('75 GB', { exact: true })).toBeVisible();
    await expect(transfer.getByText('25 GB', { exact: true })).toBeVisible();
    await expect(transfer.getByText('100 GB', { exact: true })).toBeVisible();
    await expect(transfer.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await expect(dashboard.locator('[data-usage-provider="vercel"] [data-usage-metric="cdn_requests"]').getByText('750,000', { exact: true })).toBeVisible();
    const credits = dashboard.locator('[data-usage-provider="cloudinary"] [data-usage-metric="credits"]');
    await expect(credits.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(credits.getByText(`0 ${t('credits')}`, { exact: true })).toBeVisible();
    await expect(credits.getByText(t('Over allowance by {amount}', { amount: `2 ${t('credits')}` }), { exact: true })).toBeVisible();
    const storage = dashboard.locator('[data-usage-provider="cloudinary"] [data-usage-metric="storage"]');
    await expect(storage.getByText('3 GB', { exact: true })).toBeVisible();
    await expect(storage.getByRole('progressbar')).toHaveCount(0);
    await expect(storage.getByText(t('Allowance'), { exact: true })).toHaveCount(0);
    await expect(dashboard.locator('[data-usage-provider="mongodb"] [data-usage-metric="cluster_storage"]').getByRole('progressbar')).toHaveCount(0);
    await expect(dashboard).not.toContainText(/\bFree\b|ฟรี/iu);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/cms-usage-${locale}-${width}-viewport.png` });
    await page.screenshot({ path: `test-results/cms-usage-${locale}-${width}.png`, fullPage: true });
    await dashboard.getByRole('button', { name: t('Update Vercel reading'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('Update Vercel reading'), exact: true });
    await expect(dialog.getByLabel(t('Fast Data Transfer (GB)'), { exact: true })).toHaveValue('25');
    await expect(dialog.getByLabel(t('CDN Requests'), { exact: true })).toHaveValue('250000');
    await expect(dialog).not.toContainText(/\bFree\b|ฟรี/iu);
    for (let index = 0; index < 8; index++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
    await page.screenshot({ path: `test-results/cms-usage-reading-${locale}-${width}.png` });
    await dialog.getByRole('button', { name: t('Cancel'), exact: true }).click();
  }
});

test('conflicting reading edits preserve input and a lost successful response reconciles without a duplicate write', async ({ page }) => {
  await login(page);
  const client = await signIn();
  try {
    await page.goto('/cms/usage');
    await page.getByRole('button', { name: 'Update Vercel reading', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Update Vercel reading', exact: true });
    await dialog.locator('input[name="transferGb"]').fill('25');
    await dialog.locator('input[name="requests"]').fill('123');
    await dialog.locator('input[name="periodLabel"]').fill('My chosen provider reporting period');
    const initial = await overview(client);
    await expectStatus(await client.put('/api/cms/usage', { data: update(initial.settings, { vercelReading: { transferBytes: 99 * 1e9, requests: 999, periodLabel: 'Other saved reading' } }) }), 200);
    const writes: Array<{ expectedRevision: number }> = [];
    await page.route('**/api/cms/usage', async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      writes.push(route.request().postDataJSON());
      if (writes.length === 2) {
        const response = await route.fetch();
        await expectStatus(response, 200);
        return route.abort('failed');
      }
      return route.continue();
    });
    await dialog.getByRole('button', { name: 'Save reading', exact: true }).click();
    const conflict = dialog.getByRole('region', { name: 'Monitoring settings conflict', exact: true });
    await expect(conflict.getByText('Other saved reading', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save reading', exact: true })).toBeDisabled();
    await expect(dialog.locator('input[name="transferGb"]')).toHaveValue('25');
    await expect(dialog.locator('input[name="requests"]')).toHaveValue('123');
    await expect(dialog.locator('input[name="periodLabel"]')).toHaveValue('My chosen provider reporting period');
    await conflict.getByRole('button', { name: 'Use my entered values', exact: true }).click();
    expect(writes).toHaveLength(1);
    expect((await overview(client)).settings.revision).toBe(1);
    await dialog.getByRole('button', { name: 'Save reading', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(writes.map(item => item.expectedRevision)).toEqual([0, 1]);
    const latest = await overview(client);
    expect(latest.settings.revision).toBe(2);
    expect(latest.settings.vercelReading).toMatchObject({ transferBytes: 25 * 1e9, requests: 123, periodLabel: 'My chosen provider reporting period' });
  } finally { await client.dispose(); }
});

test('refresh is guarded while pending and during cooldown, and time passing never polls providers', async ({ page, db }) => {
  await login(page);
  await overview(page.request);
  await db.collection<State>('moe_state').updateMany({ _id: /^usage:lease:/ }, { $set: { expiresAt: new Date(0) } });
  await page.clock.install();
  const calls: string[] = [];
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/cms/usage', async route => {
    calls.push(route.request().method());
    if (route.request().method() === 'POST') { started(); await gate; }
    return route.continue();
  });
  try {
    await page.goto('/cms/usage');
    const refresh = page.getByRole('button', { name: /^(Refresh usage|Checking usage…)$/ });
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await pending;
    await expect(refresh).toBeDisabled();
    await refresh.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    expect(calls.filter(method => method === 'POST')).toHaveLength(1);
    release();
    await expect(page.getByRole('region', { name: 'Service usage', exact: true }).getByRole('status')).toContainText('Usage check completed.');
    await expect(refresh).toBeDisabled();
    expect(calls).toEqual(['GET', 'POST']);
    await page.clock.fastForward(11 * 60_000);
    await expect(refresh).toBeEnabled();
    expect(calls).toEqual(['GET', 'POST']);
  } finally { release(); }
});

test('the API refresh budget rejects request twenty-one and shares the same budget with settings writes', async ({ db }) => {
  const developer = await seedAccount(db, 'usage-budget-dev', 'Dev');
  const clients = await Promise.all([signIn(), signIn(developer.username)]);
  try {
    // Keep this test inside one real fixed-window bucket without changing the server clock.
    const untilNextMinute = 60_000 - Date.now() % 60_000;
    if (untilNextMinute < 3000) await new Promise(resolve => setTimeout(resolve, untilNextMinute + 25));
    const first = await overview(clients[0]);
    for (let index = 0; index < 20; index++) await expectStatus(await clients[0].post('/api/cms/usage'), 200);
    await expectStatus(await clients[0].post('/api/cms/usage'), 429);
    await expectStatus(await clients[0].put('/api/cms/usage', { data: update(first.settings, { vercelReading: { transferBytes: 1, requests: 1, periodLabel: 'Rejected over-budget reading' } }) }), 429);
    expect(await db.collection<State>('moe_state').findOne({ _id: 'usage:settings' })).toBeNull();
    expect(await db.collection('moe_logs').countDocuments({ action: 'settings.usage_updated' })).toBe(0);
    const other = await clients[1].post('/api/cms/usage');
    await expectStatus(other, 200);
    const cached = await other.json() as UsageOverview;
    expect(cached.refreshed).toBe(false);
    expect(provider(cached, 'mongodb').checkedAt).toBe(provider(first, 'mongodb').checkedAt);
    expect(provider(cached, 'cloudinary').checkedAt).toBe(provider(first, 'cloudinary').checkedAt);
    expect((await overview(clients[0])).settings).toEqual(first.settings);
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});
