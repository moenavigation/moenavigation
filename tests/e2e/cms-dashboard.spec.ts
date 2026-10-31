import { test, expect, login, E2E_ADMIN } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';
import type { CmsLogPage } from '../../src/lib/cms-logs';
import type { AuditDocument } from '../../src/server/db';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

test.beforeEach(async ({ db }) => {
  await db.collection<AuditDocument>('moe_logs').insertMany(Array.from({ length: 6 }, (_, index): AuditDocument => ({
    _id: `dashboard-activity-${index}`, occurredAt: new Date(Date.now() - 60_000 - index * 1000), expiresAt: new Date(Date.now() + 86_400_000),
    action: 'content.updated', category: 'content', outcome: 'success', actor: { id: E2E_ADMIN.id, username: E2E_ADMIN.username, role: 'Admin' },
    target: { type: 'News', id: `dashboard-news-${index}`, label: `Recent website change ${index}` },
  })));
});

test('Dashboard shares the latest five Logs entries and links to management views', async ({ page, db }) => {
  await login(page);
  await expect(page.getByText('Saved content', { exact: true })).toHaveCount(0);
  const enquiries = page.getByRole('link', { name: /^New enquiries/ });
  const trash = page.getByRole('link', { name: /^Trash/ });
  await expect(enquiries).toHaveAttribute('href', '/cms/enquiries');
  await expect(enquiries.locator('strong')).toHaveText(String(await db.collection('moe_enquiries').countDocuments({ status: 'New' })));
  await expect(trash).toHaveAttribute('href', '/cms/trash');
  await expect(page.locator('main').getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
  await enquiries.click();
  await expect(page).toHaveURL(/\/cms\/enquiries$/);
  await page.goto('/cms');
  await trash.focus();
  await trash.press('Enter');
  await expect(page).toHaveURL(/\/cms\/trash$/);
  await page.goto('/cms');
  await expect(page.getByRole('heading', { name: 'Content at a glance', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently updated', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Publication status', exact: true })).toHaveCount(0);
  const recent = page.getByRole('region', { name: 'Recent activity', exact: true });
  const logs = await (await page.request.get('/api/cms/logs')).json() as CmsLogPage;
  await expect(recent.locator('[data-log-id]')).toHaveCount(5);
  expect(await recent.locator('[data-log-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-log-id')))).toEqual(logs.items.slice(0, 5).map(item => item.id));
  await expect(recent.locator('li button, li input')).toHaveCount(0);
  await recent.getByRole('link', { name: 'View all logs', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/logs$/);
  await expect(page.getByRole('region', { name: 'Activity log', exact: true }).locator(`[data-log-id="${logs.items[0].id}"]`)).toBeVisible();
  await page.goto('/cms');
  await page.getByRole('link', { name: /^Web settings/ }).click();
  await expect(page).toHaveURL(/\/cms\/setting$/);
  await page.goto('/cms');
  const overview = page.getByRole('region', { name: 'Content at a glance', exact: true });
  await overview.getByRole('button', { name: /^Pages\b/ }).click();
  await expect(page).toHaveURL(/\/cms\/pages$/);
  await expect(page.getByRole('heading', { name: 'Which page would you like to update?', exact: true })).toBeVisible();
  await page.goto('/cms');
  await overview.getByRole('button', { name: /^Fleet/ }).click();
  await expect(page).toHaveURL(/\/cms\/fleet$/);
});

test('Dashboard fits mobile and wide screens in English and Thai', async ({ page }, testInfo) => {
  await login(page);
  await expect(page.getByRole('region', { name: 'Service status', exact: true }).locator('time')).toHaveCount(3);
  const folder = path.resolve('docs/screenshots');
  await mkdir(folder, { recursive: true });
  for (const width of [360, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 1440) {
      const screenshot = testInfo.outputPath('dashboard-desktop.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await copyFile(screenshot, path.join(folder, `cms-dashboard-overview-desktop-${testInfo.project.name}.png`));
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('header [data-cms-language-switch]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cmsMainThai.Dashboard);
  await expect(page.getByRole('heading', { name: cmsMainThai['Content at a glance'], exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: cmsMainThai['Recent activity'], exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: cmsMainThai['View all logs'], exact: true })).toHaveAttribute('href', '/cms/logs');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const screenshot = testInfo.outputPath('dashboard-th-mobile.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await copyFile(screenshot, path.join(folder, `cms-dashboard-overview-th-mobile-${testInfo.project.name}.png`));
});

test('Dashboard metrics have equal widths without hints or shortcuts and show service checks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await login(page);
  const cards = page.locator('[data-dashboard-metrics] > *');
  await expect(cards).toHaveCount(4);
  const widths = await cards.evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  await expect(page.getByText('Quick actions', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Waiting for your response', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Web settings/ })).toHaveAttribute('href', '/cms/setting');
  await expect(page.getByRole('button', { name: /^Attention/ })).toBeEnabled();
  const services = page.getByRole('region', { name: 'Service status', exact: true });
  await expect(services.getByRole('listitem')).toHaveCount(3);
  await expect(services).toContainText('Database connection verified.');
  await expect(services.locator('time')).toHaveCount(3);
  await expect(services).not.toContainText(/mongodb:\/\/|api_secret|API_KEY/);
});

test('Dashboard opens awaiting enquiries and refreshes the list after resolution', async ({ page, db }) => {
  await login(page);
  const panel = page.getByRole('region', { name: 'Enquiries needing a reply', exact: true });
  await expect(panel.getByRole('listitem')).toHaveCount(5);
  const target = await db.collection('moe_enquiries').findOne({ status: 'New' }, { sort: { createdAt: -1, _id: -1 } });
  expect(target).toBeTruthy();
  const subject = String(target!.subject);
  const row = panel.getByRole('listitem').filter({ hasText: subject });
  await expect(row).toBeVisible();
  await row.getByRole('button').click();
  const dialog = page.getByRole('dialog', { name: 'Enquiry details', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'In progress', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Resolved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Close Enquiry details', exact: true }).click();
  await expect(row).toHaveCount(0);
});

test('Dashboard activity refreshes from Logs after workspace refresh', async ({ page, db }) => {
  await login(page);
  const activity = page.getByRole('region', { name: 'Recent activity', exact: true });
  await expect(activity.locator('[data-log-id]')).toHaveCount(5);
  await db.collection<AuditDocument>('moe_logs').insertOne({ _id: 'dashboard-new-activity', occurredAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), action: 'settings.updated', category: 'settings', outcome: 'success', actor: { id: E2E_ADMIN.id, username: E2E_ADMIN.username, role: 'Admin' }, target: { type: 'Settings', id: 'website' } });
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  await expect(activity.locator('[data-log-id]').first()).toHaveAttribute('data-log-id', 'dashboard-new-activity');
  await expect(activity).toContainText('Updated settings');
});

test('Dashboard log failure can retry and an empty log keeps its full-history link', async ({ page }) => {
  let fail = true;
  await page.route('**/api/cms/logs?*', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: 'Activity temporarily unavailable' } : { items: [], total: 0, nextCursor: null } }));
  await login(page);
  const activity = page.getByRole('region', { name: 'Recent activity', exact: true });
  await expect(activity.getByRole('alert')).toContainText('Activity temporarily unavailable');
  await expect(page.getByRole('region', { name: 'Content at a glance', exact: true })).toBeVisible();
  fail = false;
  await activity.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(activity.getByText('No activity yet', { exact: true })).toBeVisible();
  await expect(activity.getByRole('link', { name: 'View all logs', exact: true })).toBeVisible();
  await expect(activity.getByRole('alert')).toHaveCount(0);
});
