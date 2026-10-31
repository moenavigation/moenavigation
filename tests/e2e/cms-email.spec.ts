import { randomUUID } from 'node:crypto';
import { request as apiRequest, type Page } from '@playwright/test';
import type { Enquiry } from '../../src/lib/cms-types';
import type { EmailSetupStatus } from '../../src/lib/enquiry-email';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, E2E_INBOX, loginChallengeData } from './fixtures';

const missing: EmailSetupStatus = { provider: 'Resend', configured: false, checks: { apiKey: 'missing', sender: 'missing', recipient: 'missing' } };
const configured: EmailSetupStatus = { provider: 'Resend', configured: true, checks: { apiKey: 'added', sender: 'added', recipient: 'added' } };
type Account = { _id: string; username: string; role: 'Dev' | 'Admin' | 'Operator'; passwordHash: string; passwordVersion: number; createdAt: Date };

async function signIn(page: Page) {
  expect((await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) } })).status()).toBe(200);
}

async function openEnquiry(page: Page, locale: 'en' | 'th' = 'en') {
  const t = (value: string) => translateCms(locale, value);
  await page.goto('/cms/enquiries');
  const inbox = page.getByRole('region', { name: t('Enquiry inbox') });
  await inbox.getByRole('searchbox', { name: t('Search all enquiries') }).fill(E2E_INBOX.oldThai.query);
  await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
  const dialog = page.getByRole('dialog', { name: t('Enquiry details') });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: t('In progress'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: t('In progress'), exact: true })).toBeEnabled();
  return dialog;
}

test('email readiness is authenticated, read-only and secret-free for every role', async ({ request, db }) => {
  expect((await request.get('/api/cms/email/status')).status()).toBe(401);
  const original = await db.collection<Account>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  for (const role of ['Dev', 'Admin', 'Operator'] as const) {
    const account = { ...original!, _id: randomUUID(), username: `email-${role.toLowerCase()}`, role, createdAt: new Date() };
    await db.collection<Account>('moe_users').insertOne(account);
    const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
    try {
      expect((await client.post('/api/cms/login', { data: { username: account.username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } })).status()).toBe(200);
      const response = await client.get('/api/cms/email/status');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(await response.json()).toEqual(missing);
      expect((await client.get('/api/cms/email/status?probe=1')).status()).toBe(400);
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await client.fetch('/api/cms/email/status', { method, data: {} })).status()).toBe(405);
    } finally { await client.dispose(); }
  }
});

for (const screen of [{ locale: 'en', width: 1280, height: 800 }, { locale: 'th', width: 360, height: 640 }] as const) test.describe(`${screen.locale} ${screen.width} email setup`, () => {
  test.use({ viewport: { width: screen.width, height: screen.height }, hasTouch: true });
  test('the read-only setup card and saved inbox explain missing setup without sending mail', async ({ page }, testInfo) => {
    const t = (value: string) => translateCms(screen.locale, value);
    await page.addInitScript(locale => localStorage.setItem('moe-cms-language', locale), screen.locale);
    await signIn(page);
    let statusReads = 0; let sends = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/cms/email/status') statusReads++; });
    await page.route('**/api/cms/inbox/notify', async route => { sends++; await route.fulfill({ status: 503, json: { error: 'No test email should be sent.' } }); });
    await page.goto('/cms/setting');
    const card = page.getByRole('region', { name: t('Email notifications'), exact: true });
    await expect(card.getByText(t('Email setup incomplete'), { exact: true })).toBeVisible();
    await expect(card.getByText(t('Not added'), { exact: true })).toHaveCount(3);
    await expect(card.locator('input, textarea, select')).toHaveCount(0);
    await card.getByText(t('How email setup works'), { exact: true }).click();
    await expect(card.getByText(t('Older enquiries are not sent automatically. Open an enquiry to send an eligible notification individually.'), { exact: true })).toBeVisible();
    await card.evaluate(element => {
      const bannerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - bannerHeight - 12, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('email-setup-viewport.png'), animations: 'disabled' });
    await card.screenshot({ path: testInfo.outputPath('email-setup-card.png'), animations: 'disabled' });
    const enquiry = await openEnquiry(page, screen.locale);
    await expect(enquiry.getByRole('button', { name: t('Send notification'), exact: true })).toBeDisabled();
    await expect(enquiry.getByText(t('No email notification has been requested for this enquiry.'), { exact: true })).toBeVisible();
    await enquiry.getByRole('button', { name: t('Send notification'), exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('email-inbox-disabled.png'), animations: 'disabled' });
    await enquiry.getByRole('link', { name: t('View email setup'), exact: true }).click();
    await expect(page).toHaveURL(/\/cms\/setting#email-notifications$/);
    await expect(enquiry).toHaveCount(0);
    await expect(card).toBeInViewport();
    // A full page navigation to the inbox creates a new workspace; its client-side return reuses that check.
    expect(statusReads).toBe(2);
    expect(sends).toBe(0);
  });
});

test('sending has a busy guard and a local retry deadline without polling or changing enquiry status', async ({ page }, testInfo) => {
  await signIn(page);
  await page.clock.install();
  let statusReads = 0; let sends = 0;
  await page.route('**/api/cms/email/status', async route => { statusReads++; await route.fulfill({ json: configured }); });
  const saved = await page.request.get(`/api/cms/inbox?id=${E2E_INBOX.oldThai.id}`);
  let enquiry = (await saved.json() as { enquiry: Enquiry }).enquiry;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/cms/inbox/notify', async route => {
    sends++;
    expect(route.request().postDataJSON()).toEqual({ id: enquiry.id });
    if (sends === 1) {
      await gate;
      const now = await page.evaluate(() => Date.now());
      await route.fulfill({ json: { enquiry: { ...enquiry, notification: { status: 'failed', attempts: 1, retryAt: new Date(now + 30_000).toISOString(), message: 'Email delivery is uncertain. A safe retry will reuse the original notification.' } } } });
    } else await route.fulfill({ json: { enquiry: { ...enquiry, notification: { status: 'sent', attempts: 2, sentAt: new Date().toISOString() } } } });
  });
  const dialog = await openEnquiry(page);
  enquiry = (await (await page.request.get(`/api/cms/inbox?id=${enquiry.id}`)).json() as { enquiry: Enquiry }).enquiry;
  const status = dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: enquiry.status, exact: true });
  await expect(dialog.getByRole('button', { name: 'Send notification', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('enquiry-send-enabled.png'), animations: 'disabled' });
  try {
    await dialog.getByRole('button', { name: 'Send notification', exact: true }).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => sends).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Sending notification…', exact: true })).toBeDisabled();
    await expect(status).toBeDisabled();
  } finally { release(); }
  const retry = dialog.getByRole('button', { name: 'Retry notification', exact: true });
  await expect(retry).toBeDisabled();
  await expect(dialog.getByText(/You can retry after/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('enquiry-retry-cooldown.png'), animations: 'disabled' });
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  expect(sends).toBe(1);
  await page.clock.fastForward(31_000);
  await expect(retry).toBeEnabled();
  expect(statusReads).toBe(1); expect(sends).toBe(1);
  await retry.click();
  await expect(dialog.getByText('The email provider accepted the notification. Inbox delivery is not guaranteed.', { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  expect(sends).toBe(2);
});

test('setup refresh is guarded and a failed check preserves the previous checks while disabling sends', async ({ page }, testInfo) => {
  await signIn(page);
  await page.clock.install();
  let reads = 0; let sends = 0;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/cms/email/status', async route => {
    reads++;
    if (reads === 1) return route.fulfill({ json: configured });
    await gate;
    return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable.' } });
  });
  await page.route('**/api/cms/inbox/notify', async route => { sends++; return route.fulfill({ status: 503, json: { error: 'No test email should be sent.' } }); });
  const enquiry = await openEnquiry(page);
  await expect(enquiry.getByRole('button', { name: 'Send notification', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('complementary', { name: 'Email notifications' }).getByRole('link', { name: 'View email setup' }).click();
  const card = page.getByRole('region', { name: 'Email notifications', exact: true });
  await expect(card.getByText('Settings added', { exact: true })).toBeVisible();
  await expect(card.getByText('Added', { exact: true })).toHaveCount(3);
  await card.screenshot({ path: testInfo.outputPath('email-setup-configured.png'), animations: 'disabled' });
  expect(reads).toBe(1);
  await page.clock.fastForward(3_100);
  const refresh = card.getByRole('button', { name: 'Refresh email setup', exact: true });
  await expect(refresh).toBeEnabled();
  try {
    await refresh.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => reads).toBe(2);
    await expect(card.getByRole('button', { name: 'Checking…', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(card.getByText('Email setup status unavailable', { exact: true })).toBeVisible();
  await expect(card.getByText('Last successful setup check', { exact: true })).toBeVisible();
  await expect(card.getByText('Added', { exact: true })).toHaveCount(3);
  await card.screenshot({ path: testInfo.outputPath('email-setup-unavailable.png'), animations: 'disabled' });
  await page.clock.fastForward(60_000);
  expect(reads).toBe(2);
  // Client navigation back to the inbox preserves the failed latest check and blocks sending.
  await page.goBack();
  const inbox = page.getByRole('region', { name: 'Enquiry inbox' });
  await inbox.getByRole('searchbox', { name: 'Search all enquiries' }).fill(E2E_INBOX.oldThai.query);
  await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
  await expect(enquiry.getByRole('button', { name: 'Send notification', exact: true })).toBeDisabled();
  expect(reads).toBe(2); expect(sends).toBe(0);
});

test('a late notification result cannot refresh or restore an expired workspace even if transport ignores cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return originalFetch(input, url.includes('/api/cms/inbox/notify') ? { ...init, signal: undefined } : init);
    };
  });
  await signIn(page);
  await page.route('**/api/cms/email/status', route => route.fulfill({ json: configured }));
  const saved = await page.request.get(`/api/cms/inbox?id=${E2E_INBOX.oldThai.id}`);
  const enquiry = (await saved.json() as { enquiry: Enquiry }).enquiry;
  let expired = false; let lateReads = 0; let sends = 0;
  page.on('request', request => { if (expired && new URL(request.url()).pathname === '/api/cms/inbox') lateReads++; });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let markStarted!: () => void; const started = new Promise<void>(resolve => { markStarted = resolve; });
  await page.route('**/api/cms/inbox/notify', async route => {
    sends++; markStarted(); await gate;
    await route.fulfill({ json: { enquiry: { ...enquiry, notification: { status: 'sent', attempts: 1, sentAt: new Date().toISOString() } } } });
  });
  try {
    const dialog = await openEnquiry(page);
    await dialog.getByRole('button', { name: 'Send notification', exact: true }).click();
    await started;
    expired = true;
    await page.evaluate(() => window.dispatchEvent(new Event('moe-cms-session-expired')));
    const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signInButton).toBeVisible();
    const lateResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/inbox/notify');
    release(); expect((await lateResponse).status()).toBe(200);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(signInButton).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open user settings', exact: true })).toHaveCount(0);
    expect(sends).toBe(1); expect(lateReads).toBe(0);
  } finally { release(); }
});
