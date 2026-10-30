import { randomUUID } from 'node:crypto';
import { request as apiRequest, type Page } from '@playwright/test';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';

type Stored = { _id: string; [key: string]: unknown };
const endpoint = '/api/cms/email/recipients';
const id = 'enquiry-email-recipients';
async function signIn(page: Page) {
  expect((await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) } })).status()).toBe(200);
}

test('recipient APIs enforce roles, validation, origin, revisions and private audit records', async ({ page, db }) => {
  expect((await page.request.get(endpoint)).status()).toBe(401);
  await signIn(page);
  expect(await (await page.request.get(endpoint)).json()).toEqual({ revision: 0, recipients: [] });
  const original = await db.collection<Stored>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  for (const role of ['Dev', 'Admin', 'Operator'] as const) {
    const userId = randomUUID(); const username = `recipients-${role.toLowerCase()}`;
    await db.collection<Stored>('moe_users').insertOne({ ...original!, _id: userId, username, role });
    const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
    try {
      expect((await client.post('/api/cms/login', { data: { username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } })).status()).toBe(200);
      expect((await client.get(endpoint)).status()).toBe(role === 'Operator' ? 403 : 200);
      if (role === 'Operator') {
        expect((await client.put(endpoint, { data: { expectedRevision: 0, recipients: ['unauthorized@example.com'] } })).status()).toBe(403);
        await db.collection<Stored>('moe_users').updateOne({ _id: E2E_ADMIN.id }, { $set: { role: 'Operator' } });
        expect((await page.request.put(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { expectedRevision: 0, recipients: ['stale-role@example.com'] } })).status()).toBe(403);
        await page.goto('/cms/enquiries');
        await expect(page.getByRole('button', { name: 'Notification recipients', exact: true })).toHaveCount(0);
        await db.collection<Stored>('moe_users').updateOne({ _id: E2E_ADMIN.id }, { $set: { role: 'Admin' } });
      }
    } finally { await client.dispose(); }
  }
  const put = (data: unknown, origin = E2E_BASE_URL) => page.request.put(endpoint, { headers: { Origin: origin }, data });
  expect((await put({ expectedRevision: 0, recipients: ['first@example.com'] }, 'https://unrelated.example')).status()).toBe(403);
  for (const recipients of [['bad'], ['same@example.com', 'SAME@example.com'], Array.from({ length: 51 }, (_, n) => `p${n}@example.com`)]) expect((await put({ expectedRevision: 0, recipients })).status()).toBe(400);
  const results = await Promise.all([put({ expectedRevision: 0, recipients: ['first@example.com', 'second@example.com'] }), put({ expectedRevision: 0, recipients: ['other@example.com'] })]);
  expect(results.map(response => response.status()).sort()).toEqual([200, 409]);
  const saved = await (await page.request.get(endpoint)).json();
  expect(saved.revision).toBe(1);
  expect((await put({ expectedRevision: 0, recipients: saved.recipients })).status()).toBe(200);
  expect((await page.request.get(`${endpoint}?recipient=private`)).status()).toBe(400);
  expect((await page.request.delete(endpoint)).status()).toBe(405);
  const logs = await db.collection<Stored>('moe_logs').find({ action: 'settings.email_recipients_updated' }).toArray();
  expect(logs).toHaveLength(1); expect(JSON.stringify(logs)).not.toContain('@example.com');
  expect(await (await page.request.get('/api/cms/email/status')).json()).toEqual({ provider: 'Resend', configured: false, checks: { apiKey: 'missing', sender: 'missing', recipient: 'added' } });
  expect(await (await page.request.get('/api/cms/export')).text()).not.toContain(saved.recipients[0]);
  expect((await put({ expectedRevision: 1, recipients: [] })).status()).toBe(200);
  expect(await (await page.request.get(endpoint)).json()).toEqual({ revision: 2, recipients: [] });
  expect((await db.collection<Stored>('moe_settings').findOne({ _id: id }))?.recipients).toEqual([]);
});

for (const screen of [{ locale: 'en', width: 1280, height: 800 }, { locale: 'th', width: 360, height: 640 }, { locale: 'th', width: 844, height: 390 }] as const) test.describe(`${screen.locale} ${screen.width} recipient dialog`, () => {
  test.use({ viewport: { width: screen.width, height: screen.height }, hasTouch: true });
  test('add, edit, remove, cancel and save recipients with keyboard and mobile layout', async ({ page, db }, testInfo) => {
    const t = (source: string) => translateCms(screen.locale, source);
    await page.addInitScript(locale => localStorage.setItem('moe-cms-language', locale), screen.locale);
    await db.collection<Stored>('moe_settings').insertOne({ _id: id, revision: 1, recipients: ['original@example.com'] });
    await signIn(page); await page.goto('/cms/enquiries');
    let sends = 0; page.on('request', req => { if (new URL(req.url()).pathname === '/api/cms/inbox/notify') sends++; });
    const opener = page.getByRole('button', { name: t('Notification recipients'), exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: t('Notification recipients'), exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: translateCms(screen.locale, 'Recipient email {number}', { number: 1 }) }).fill('edited@example.com');
    await dialog.getByRole('button', { name: t('Add email'), exact: true }).click();
    const second = dialog.getByRole('textbox', { name: translateCms(screen.locale, 'Recipient email {number}', { number: 2 }) });
    await expect(second).toBeFocused(); await second.fill('second@example.com');
    await dialog.getByRole('button', { name: t('Cancel'), exact: true }).click();
    await expect(opener).toBeFocused();
    expect((await db.collection<Stored>('moe_settings').findOne({ _id: id }))?.recipients).toEqual(['original@example.com']);
    await opener.click();
    await expect(dialog.getByRole('textbox')).toHaveValue('original@example.com');
    await dialog.getByRole('textbox').fill('edited@example.com');
    await dialog.getByRole('button', { name: t('Add email'), exact: true }).click();
    await second.fill('second@example.com');
    await expect.poll(() => second.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const container = element.closest('dialog')!;
      const top = container.querySelector('header')!.getBoundingClientRect().bottom;
      const bottom = container.querySelector('footer')!.getBoundingClientRect().top;
      return bounds.top >= top - 1 && bounds.bottom <= bottom + 1;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('recipient-dialog.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: t('Save changes'), exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
    expect((await db.collection<Stored>('moe_settings').findOne({ _id: id }))?.recipients).toEqual(['edited@example.com', 'second@example.com']);
    await opener.click();
    await expect(dialog.getByRole('textbox')).toHaveCount(2);
    await dialog.getByRole('button', { name: translateCms(screen.locale, 'Remove recipient {number}', { number: 1 }) }).click();
    await dialog.getByRole('button', { name: t('Save changes'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await db.collection<Stored>('moe_settings').findOne({ _id: id }))?.recipients).toEqual(['second@example.com']);
    expect(sends).toBe(0);
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
});

test('failed saves retain edits, duplicate submits are blocked and conflicts can load the latest list', async ({ page }) => {
  await signIn(page); await page.goto('/cms/enquiries');
  await page.getByRole('button', { name: 'Notification recipients', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Notification recipients', exact: true });
  await dialog.getByRole('button', { name: 'Add email', exact: true }).click();
  await dialog.getByRole('textbox').fill('retained@example.com');
  let writes = 0; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${endpoint}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++; await gate; await route.fulfill({ status: 503, json: { error: 'Try again.' } });
  });
  try {
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => writes).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Close notification recipients' })).toBeDisabled();
  } finally { release(); }
  await expect(dialog.getByRole('alert')).toContainText('Try again.');
  await expect(dialog.getByRole('textbox')).toHaveValue('retained@example.com');
  await page.unroute(`**${endpoint}`);
  await page.request.put(endpoint, { headers: { Origin: E2E_BASE_URL }, data: { expectedRevision: 0, recipients: ['newer@example.com'] } });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Recipients changed elsewhere.');
  await expect(dialog.getByRole('textbox')).toHaveValue('retained@example.com');
  await dialog.getByRole('button', { name: 'Load latest list', exact: true }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('newer@example.com');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

test('a late recipient load cannot reopen the dialog after session expiry', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return originalFetch(input, url.includes('/api/cms/email/recipients') ? { ...init, signal: undefined } : init);
    };
  });
  await signIn(page); await page.goto('/cms/enquiries');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route(`**${endpoint}`, async route => { reads++; await gate; await route.fulfill({ json: { revision: 0, recipients: ['late@example.com'] } }).catch(() => {}); });
  await page.getByRole('button', { name: 'Notification recipients', exact: true }).click();
  try {
    await expect.poll(() => reads).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    const response = page.waitForResponse(result => new URL(result.url()).pathname === endpoint);
    release(); await response;
  } finally { release(); }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notification recipients', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
