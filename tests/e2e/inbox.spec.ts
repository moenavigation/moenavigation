import type { Page } from '@playwright/test';
import type { EnquiryPage } from '../../src/lib/inbox-query';
import type { EnquiryDocument } from '../../src/server/db';
import { test, expect, login, E2E_INBOX } from './fixtures';
import { translateCms } from '../../src/lib/cms-locale';

async function openInbox(page: Page) {
  await login(page);
  await page.getByRole('link', { name: /^New enquiries/ }).click();
  const inbox = page.getByRole('region', { name: 'Enquiry inbox' });
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText(`Showing 50 of ${E2E_INBOX.total} enquiries`);
  return inbox;
}

test('inbox searches older bilingual records and every field across the full database', async ({ page, db }, testInfo) => {
  await db.collection<EnquiryDocument>('moe_enquiries').updateOne({ _id: E2E_INBOX.oldThai.id }, {
    $set: { name: 'Manee Historical Search', email: 'older+ops@example.test', company: 'Archive Freight Co', message: 'Message-only needle: เรือเก่า' },
  });
  const inbox = await openInbox(page);
  await expect(inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) })).toHaveCount(0);
  await expect(inbox.getByText('130 enquiries in your inbox · 44 new. Search covers all saved enquiries.', { exact: true })).toBeVisible();
  const search = inbox.getByRole('searchbox', { name: 'Search all enquiries' });
  for (const query of [E2E_INBOX.oldThai.query, 'MANEE historical', 'OLDER+OPS@example.test', 'Archive Freight', 'เรือเก่า', E2E_INBOX.oldThai.id]) {
    await search.fill(query);
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
    await expect(inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) })).toBeVisible();
    await expect(inbox.getByRole('button', { name: 'Load more enquiries' })).toHaveCount(0);
  }
  await search.fill(E2E_INBOX.literal.query);
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  await expect(inbox.getByText(E2E_INBOX.literal.subject, { exact: true })).toBeVisible();
  await search.fill('^Fixture.*$');
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 0 of 0 enquiries');
  await expect(inbox.getByRole('heading', { name: 'No matching enquiries' })).toBeVisible();
  await inbox.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 130 enquiries');
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const status = inbox.getByRole('combobox', { name: 'Enquiry status' });
    await expect(search).toBeInViewport();
    await expect(status).toBeInViewport();
    await status.selectOption('In progress');
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 43 of 43 enquiries');
    await search.fill(E2E_INBOX.literal.query);
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
    await expect(inbox.getByText(E2E_INBOX.literal.subject, { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`inbox-${width}.png`), fullPage: true });
    await inbox.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(status).toHaveValue('All');
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 130 enquiries');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('filtered cursor pages preserve timestamp ties, exact totals and unique rows beyond 100 matches', async ({ page, db }) => {
  const collection = db.collection<EnquiryDocument>('moe_enquiries');
  const timestamp = '2026-01-01T00:00:00.000Z';
  await collection.updateMany({}, { $set: { company: 'Pagination crew [QA]+', status: 'Resolved', createdAt: timestamp } });
  const selected = await collection.find().sort({ _id: 1 }).limit(111).project<{ _id: string }>({ _id: 1 }).toArray();
  await collection.updateMany({ _id: { $in: selected.map(item => item._id) } }, { $set: { status: 'New' } });
  const inbox = await openInbox(page);
  await inbox.getByRole('searchbox').fill('[QA]+');
  await inbox.getByRole('combobox', { name: 'Enquiry status' }).selectOption('New');
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 111 enquiries');
  await expect(inbox.getByText('130 enquiries in your inbox · 111 new. Search covers all saved enquiries.', { exact: true })).toBeVisible();
  const firstResponse = await page.request.get('/api/cms/inbox', { params: { q: '[QA]+', status: 'New' } });
  expect(firstResponse.status()).toBe(200);
  const firstPage: EnquiryPage = await firstResponse.json();
  const received = [...firstPage.enquiries];
  expect(firstPage).toMatchObject({ total: 111, totalAll: 130, newCount: 111 });
  for (const count of [100, 111]) {
    const response = page.waitForResponse(value => {
      const url = new URL(value.url());
      return url.pathname === '/api/cms/inbox' && url.searchParams.has('cursor');
    });
    await inbox.getByRole('button', { name: 'Load more enquiries', exact: true }).click();
    const next = await response;
    expect(next.status()).toBe(200);
    const url = new URL(next.url());
    expect(url.searchParams.get('q')).toBe('[QA]+');
    expect(url.searchParams.get('status')).toBe('New');
    const result: EnquiryPage = await next.json();
    expect(result).toMatchObject({ total: 111, totalAll: 130, newCount: 111 });
    received.push(...result.enquiries);
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText(`Showing ${count} of 111 enquiries`);
    await expect(inbox.locator('button:has(time)')).toHaveCount(count);
    if (count === 111) expect(result.nextCursor).toBeNull();
  }
  expect(received.map(item => item.id)).toEqual(selected.map(item => item._id).reverse());
  expect(new Set(received.map(item => item.id)).size).toBe(111);
  expect(received.every(item => item.status === 'New' && item.createdAt === timestamp)).toBe(true);
  await expect(inbox.getByRole('button', { name: 'Load more enquiries' })).toHaveCount(0);
});

for (const screen of [{ locale: 'en', width: 1280 }, { locale: 'th', width: 320 }] as const) test(`opening new enquiries saves In progress and status pills preserve existing statuses · ${screen.locale}`, async ({ page, db }, testInfo) => {
  const t = (value: string) => translateCms(screen.locale, value);
  await page.setViewportSize({ width: screen.width, height: 900 });
  await login(page);
  await page.evaluate(locale => localStorage.setItem('moe-cms-language', locale), screen.locale);
  await page.goto('/cms/enquiries');
  const inbox = page.getByRole('region', { name: t('Enquiry inbox') });
  await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
  await inbox.getByRole('combobox', { name: t('Enquiry status') }).selectOption('New');
  await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
  const dialog = page.getByRole('dialog', { name: t('Enquiry details') });
  const pills = dialog.getByRole('group', { name: t('Status'), exact: true });
  const progress = pills.getByRole('button', { name: t('In progress'), exact: true });
  await expect(progress).toHaveAttribute('aria-pressed', 'true');
  await expect(progress).toBeEnabled();
  expect(await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id })).toMatchObject({ status: 'In progress', revision: 2 });
  await progress.focus();
  await page.keyboard.press('Tab');
  await expect(pills.getByRole('button', { name: t('Resolved'), exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pills.getByRole('button', { name: t('Resolved'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(progress).toBeEnabled();
  await pills.scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`enquiry-status-pills-${screen.locale}.png`) });
  await dialog.getByRole('button', { name: t('Close {title}').replace('{title}', t('Enquiry details')), exact: true }).click();
  await expect(inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) })).toHaveCount(0);
  await inbox.getByRole('combobox', { name: t('Enquiry status') }).selectOption('All');
  // Reopening either handled status does not reset it or create another revision.
  for (const [status, revision] of [['Resolved', 3], ['In progress', 4]] as const) {
    await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
    await expect(pills.getByRole('button', { name: t(status), exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(progress).toBeEnabled();
    expect(await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id })).toMatchObject({ status, revision });
    if (status === 'Resolved') {
      await progress.click();
      await expect(progress).toHaveAttribute('aria-pressed', 'true');
      await expect(progress).toBeEnabled();
    }
    await dialog.getByRole('button', { name: t('Close {title}').replace('{title}', t('Enquiry details')), exact: true }).click();
  }
});

test('a failed automatic status update keeps New selected and can be retried using the pills', async ({ page, db }) => {
  const inbox = await openInbox(page);
  await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
  let fail = true;
  await page.route('**/api/cms/inbox', async route => {
    if (route.request().method() === 'PATCH' && fail) {
      fail = false;
      return route.fulfill({ status: 503, json: { error: 'Synthetic status outage' } });
    }
    return route.continue();
  });
  await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
  const dialog = page.getByRole('dialog', { name: 'Enquiry details' });
  await expect(dialog.getByRole('alert')).toContainText('Synthetic status outage');
  await expect(dialog.getByRole('button', { name: 'New', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id })).toMatchObject({ status: 'New', revision: 1 });
  await dialog.getByRole('button', { name: 'In progress', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'In progress', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id })).toMatchObject({ status: 'In progress', revision: 2 });
});

test('opening a stale New row cannot overwrite an enquiry resolved by another user', async ({ page, db }) => {
  const inbox = await openInbox(page);
  await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
  const row = inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) });
  await expect(row).toBeVisible();
  await db.collection<EnquiryDocument>('moe_enquiries').updateOne({ _id: E2E_INBOX.oldThai.id }, { $set: { status: 'Resolved' }, $inc: { revision: 1 } });
  await row.click();
  const dialog = page.getByRole('dialog', { name: 'Enquiry details' });
  await expect(dialog.getByRole('alert')).toContainText('changed elsewhere');
  await dialog.getByRole('button', { name: 'Refresh enquiry', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id })).toMatchObject({ status: 'Resolved', revision: 2 });
});

test('enquiry status conflicts require refresh and successful edits refresh filtered rows and global counts', async ({ page, db }) => {
  const inbox = await openInbox(page);
  await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
  await inbox.getByRole('combobox', { name: 'Enquiry status' }).selectOption('New');
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
  const dialog = page.getByRole('dialog', { name: 'Enquiry details' });
  await expect(dialog.getByRole('button', { name: 'In progress', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Resolved', exact: true })).toBeEnabled();
  await db.collection<EnquiryDocument>('moe_enquiries').updateOne({ _id: E2E_INBOX.oldThai.id }, { $set: { status: 'In progress' }, $inc: { revision: 1 } });
  await dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed elsewhere');
  expect((await db.collection<EnquiryDocument>('moe_enquiries').findOne({ _id: E2E_INBOX.oldThai.id }))?.status).toBe('In progress');
  await dialog.getByRole('button', { name: 'Refresh enquiry', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'In progress', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'New', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'New', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true })).toBeEnabled();
  await dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Close Enquiry details', exact: true }).click();
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 0 of 0 enquiries');
  await expect(inbox.getByText('130 enquiries in your inbox · 43 new. Search covers all saved enquiries.', { exact: true })).toBeVisible();
  await inbox.getByRole('combobox', { name: 'Enquiry status' }).selectOption('Resolved');
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  const result = await page.request.get('/api/cms/inbox', { params: { q: E2E_INBOX.oldThai.query, status: 'Resolved' } });
  expect(await result.json()).toMatchObject({ total: 1, totalAll: 130, newCount: 43, enquiries: [{ id: E2E_INBOX.oldThai.id, status: 'Resolved', revision: 5 }] });
});

test('updating an enquiry during workspace refresh preserves the independent content response', async ({ page, db }) => {
  const contentCount = await db.collection('moe_content').countDocuments({ deletedAt: { $exists: false } });
  expect(contentCount).toBeGreaterThan(12);
  await login(page);
  let contentRequests = 0;
  let releaseContent!: () => void;
  let contentStarted!: () => void;
  const release = new Promise<void>(resolve => { releaseContent = resolve; });
  const started = new Promise<void>(resolve => { contentStarted = resolve; });
  await page.route(url => url.pathname === '/api/cms/content' && url.searchParams.get('scope') === 'overview', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    contentRequests += 1;
    if (contentRequests !== 1) return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    contentStarted();
    await release;
    await route.fulfill({ response });
  });
  try {
    // Refresh retains the loaded workspace and allows independent enquiry work.
    // The first authenticated load instead has its own full-screen loading state.
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await started;
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: /^New enquiries/ }).click();
    const inbox = page.getByRole('region', { name: 'Enquiry inbox' });
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 130 enquiries');
    await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
    await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
    await inbox.getByRole('button', { name: new RegExp(E2E_INBOX.oldThai.subject) }).click();
    const dialog = page.getByRole('dialog', { name: 'Enquiry details' });
    await dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('group', { name: 'Status', exact: true }).getByRole('button', { name: 'Resolved', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Close Enquiry details', exact: true }).click();
  } finally {
    releaseContent();
  }
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'CMS navigation' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Content at a glance', exact: true }).getByRole('button', { name: /^Pages\b/ }).locator('strong')).toHaveText(String(await db.collection('moe_content').countDocuments({ type: 'Page', deletedAt: { $exists: false } })));
  await expect(page.getByText('Saved unpublished content', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(contentRequests).toBe(1);
});

test('inbox API requires authentication, validates query boundaries and keeps private delivery data private', async ({ page, db }) => {
  expect((await page.request.get('/api/cms/inbox?q=test')).status()).toBe(401);
  expect((await page.request.get(`/api/cms/inbox?id=${E2E_INBOX.oldThai.id}`)).status()).toBe(401);
  await db.collection<EnquiryDocument>('moe_enquiries').updateOne({ _id: E2E_INBOX.oldThai.id }, {
    $set: { notificationDelivery: {
      firstAttemptAt: '2026-01-01T00:00:00.000Z', leaseUntil: '2026-01-01T00:02:00.000Z', leaseToken: 'private-lease', providerId: 'private-provider',
      envelope: { from: 'private-sender@example.test', to: ['private-recipient@example.test'], reply_to: 'visitor@example.test', subject: 'Private envelope', text: 'Private envelope text' },
    } },
  });
  await login(page);
  const valid = await page.request.get('/api/cms/inbox', { params: { q: `  ${E2E_INBOX.oldThai.id}  `, status: 'All' } });
  expect(valid.status()).toBe(200);
  expect(valid.headers()['cache-control']).toBe('no-store');
  const result: EnquiryPage = await valid.json();
  expect(result).toMatchObject({ total: 1, totalAll: 130, newCount: 44, nextCursor: null });
  expect(result.enquiries).toHaveLength(1);
  const single = await page.request.get('/api/cms/inbox', { params: { id: E2E_INBOX.oldThai.id } });
  expect(single.status()).toBe(200);
  for (const enquiry of [result.enquiries[0], (await single.json()).enquiry]) {
    for (const field of ['_id', 'submissionId', 'fingerprint', 'consentAt', 'notificationDelivery']) expect(enquiry).not.toHaveProperty(field);
    expect(JSON.stringify(enquiry)).not.toContain('private-');
  }
  for (const query of [
    'q=first&q=second', 'status=New&status=Resolved', 'status=Archived', 'status=', 'q[$ne]=', 'limit=200',
    `q=${'a'.repeat(201)}`, 'q=hidden%00value', 'cursor=', 'cursor=not-json', `cursor=${'a'.repeat(401)}`,
    `id=${E2E_INBOX.oldThai.id}&q=ignored`, `id=${E2E_INBOX.oldThai.id}&id=${E2E_INBOX.literal.id}`, 'id=not-a-uuid',
  ]) expect((await page.request.get(`/api/cms/inbox?${query}`)).status(), query).toBe(400);
});

test('a slow older inbox response cannot replace a newer search even if transport ignores cancellation', async ({ page }) => {
  // Exercise the request-generation guard independently of browser fetch cancellation.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return originalFetch(input, url.includes('/api/cms/inbox?') ? { ...init, signal: undefined } : init);
    };
  });
  const inbox = await openInbox(page);
  let releaseSlow!: () => void;
  let slowStarted!: () => void;
  const release = new Promise<void>(resolve => { releaseSlow = resolve; });
  const started = new Promise<void>(resolve => { slowStarted = resolve; });
  await page.route('**/api/cms/inbox?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') !== E2E_INBOX.oldThai.query) return route.continue();
    const response = await route.fetch();
    slowStarted();
    await release;
    await route.fulfill({ response });
  });
  const search = inbox.getByRole('searchbox');
  await search.fill(E2E_INBOX.oldThai.query);
  await started;
  await search.fill(E2E_INBOX.literal.query);
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  await expect(inbox.getByText(E2E_INBOX.literal.subject, { exact: true })).toBeVisible();
  const finished = page.waitForEvent('requestfinished', request => new URL(request.url()).searchParams.get('q') === E2E_INBOX.oldThai.query);
  releaseSlow();
  await finished;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(search).toHaveValue(E2E_INBOX.literal.query);
  await expect(inbox.getByText(E2E_INBOX.literal.subject, { exact: true })).toBeVisible();
  await expect(inbox.getByText(E2E_INBOX.oldThai.subject, { exact: true })).toHaveCount(0);
});

test('inbox retries failed searches and later pages without clearing filters or duplicating rows', async ({ page }) => {
  const inbox = await openInbox(page);
  let failSearch = true;
  let failMore = true;
  await page.route('**/api/cms/inbox?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (failSearch && params.get('q') === E2E_INBOX.oldResolved.query) {
      failSearch = false;
      return route.fulfill({ status: 503, json: { error: 'Synthetic search outage' } });
    }
    if (failMore && params.has('cursor')) {
      failMore = false;
      return route.fulfill({ status: 503, json: { error: 'Synthetic next-page outage' } });
    }
    return route.continue();
  });
  const search = inbox.getByRole('searchbox');
  const status = inbox.getByRole('combobox', { name: 'Enquiry status' });
  await status.selectOption('Resolved');
  await search.fill(E2E_INBOX.oldResolved.query);
  await expect(inbox.getByRole('alert')).toContainText('Synthetic search outage');
  await expect(search).toHaveValue(E2E_INBOX.oldResolved.query);
  await expect(status).toHaveValue('Resolved');
  await inbox.getByRole('button', { name: 'Retry enquiry search', exact: true }).click();
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  await expect(inbox.getByText(E2E_INBOX.oldResolved.subject, { exact: true })).toBeVisible();
  await inbox.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 130 enquiries');
  await inbox.getByRole('button', { name: 'Load more enquiries', exact: true }).click();
  await expect(inbox.getByRole('alert')).toContainText('Synthetic next-page outage');
  await expect(inbox.locator('button:has(time)')).toHaveCount(50);
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 50 of 130 enquiries');
  await inbox.getByRole('button', { name: 'Retry loading more', exact: true }).click();
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 100 of 130 enquiries');
  await expect(inbox.locator('button:has(time)')).toHaveCount(100);
  await expect(inbox.getByRole('alert')).toHaveCount(0);
});
