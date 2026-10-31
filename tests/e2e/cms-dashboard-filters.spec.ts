import { copyFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type { AuditDocument } from '../../src/server/db';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN } from './fixtures';

const dataIds = Array.from({ length: 9 }, () => randomUUID());
const accountId = randomUUID();
const enquiryIds = Array.from({ length: 3 }, () => randomUUID());

test.beforeEach(async ({ db }) => {
  const now = Date.now();
  const actor = { id: E2E_ADMIN.id, username: E2E_ADMIN.username, role: 'Admin' } as const;
  const expiresAt = new Date(now + 365 * 86_400_000);
  const noise: AuditDocument[] = Array.from({ length: 40 }, (_, index) => ({
    _id: randomUUID(), occurredAt: new Date(now - 10_000 - index * 1000), expiresAt,
    action: 'auth.login', category: 'auth', outcome: 'success', actor,
    target: { type: 'Session', id: 'cms' },
  }));
  const changes: AuditDocument[] = dataIds.map((id, index) => ({
    _id: id, occurredAt: new Date(now - 3_600_000 - index * 1000), expiresAt,
    actor, outcome: 'success',
    ...(index % 3 === 0 ? { action: 'content.updated' as const, category: 'content' as const, target: { type: 'News' as const, id: `group-content-${index}`, label: `Grouped content change ${index}` } }
      : index % 3 === 1 ? { action: 'media.restored' as const, category: 'media' as const, target: { type: 'Image' as const, id: `group-image-${index}`, label: `Grouped image change ${index}` } }
        : { action: 'settings.updated' as const, category: 'settings' as const, target: { type: 'Settings' as const, id: 'website' } }),
  }));
  const account: AuditDocument = {
    _id: accountId, occurredAt: new Date(now - 5000), expiresAt, actor, outcome: 'success',
    action: 'user.updated', category: 'user', target: { type: 'User', id: 'group-account', label: 'Grouped account change' },
  };
  const enquiries: AuditDocument[] = enquiryIds.map((id, index) => ({
    _id: id, occurredAt: new Date(now - 7_200_000 - index * 1000), expiresAt, actor, outcome: 'success',
    action: index % 2 ? 'enquiry.notification_requested' : 'enquiry.status_changed', category: 'enquiry', target: { type: 'Enquiry', id: randomUUID() },
  }));
  await db.collection<AuditDocument>('moe_logs').insertMany([...noise, ...changes, account, ...enquiries]);
});

async function rowIds(page: Page) {
  return page.getByRole('region', { name: 'Recent activity', exact: true }).locator('[data-log-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-log-id')));
}

test('activity selector has four simple options and Escape preserves the view and keyboard focus', async ({ page }) => {
  await login(page);
  const activity = page.getByRole('region', { name: 'Recent activity', exact: true });
  await expect(activity.locator('[data-log-id]')).toHaveCount(5);
  const original = await rowIds(page);
  const trigger = activity.getByRole('button', { name: 'Filter activity', exact: true });
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/cms/logs') requests++; });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filter activity', exact: true });
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Apply filters', exact: true })).toHaveCount(0);
  for (const label of ['All activities', 'Data changes', 'User activity', 'Enquiry activity']) {
    await expect(dialog.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: /^All activities/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await rowIds(page)).toEqual(original);
  expect(requests).toBe(0);
});

test('choosing a group applies immediately across the full history and carries into full Logs', async ({ page }) => {
  await login(page);
  const activity = page.getByRole('region', { name: 'Recent activity', exact: true });
  await expect(activity.locator('[data-log-id]')).toHaveCount(5);
  const original = await rowIds(page);
  expect(original).not.toContain(dataIds[0]);
  const trigger = activity.getByRole('button', { name: 'Filter activity', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Filter activity', exact: true });
  async function choose(label: string) {
    await trigger.click();
    await dialog.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  await choose('Data changes');
  await expect(activity.locator('[data-log-id]').first()).toHaveAttribute('data-log-id', dataIds[0]);
  expect(await rowIds(page)).toEqual(dataIds.slice(0, 5));
  await expect(activity).toContainText('Updated content');
  await expect(activity).toContainText('Restored image');
  await expect(activity).toContainText('Updated settings');
  await trigger.click();
  await expect(dialog.getByRole('button', { name: /^Data changes/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  await choose('User activity');
  await expect(activity.locator(`[data-log-id="${accountId}"]`)).toBeVisible();
  await expect(activity).toContainText('Signed in');
  await expect(activity).toContainText('Updated user');
  await choose('Enquiry activity');
  await expect(activity.locator('[data-log-id]')).toHaveCount(3);
  expect(await rowIds(page)).toEqual(enquiryIds);
  await expect(activity).toContainText('Updated enquiry status');
  await expect(activity).toContainText('Requested enquiry notification');

  await choose('All activities');
  await expect(activity.locator('[data-log-id]').first()).toHaveAttribute('data-log-id', original[0]!);
  expect(await rowIds(page)).toEqual(original);
  await choose('Data changes');
  await expect(activity.locator('[data-log-id]').first()).toHaveAttribute('data-log-id', dataIds[0]);
  await activity.getByRole('link', { name: 'View all logs', exact: true }).click();
  await expect(page).toHaveURL(/\/cms\/logs\?/);
  expect(new URL(page.url()).searchParams.get('category')).toBe('data_changes');
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  const full = page.getByRole('region', { name: 'Activity log', exact: true });
  await expect(full.getByRole('combobox', { name: 'Activity type', exact: true })).toHaveValue('data_changes');
  await expect(full.locator('[data-log-id]')).toHaveCount(9);
  expect(await full.locator('[data-log-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-log-id')))).toEqual(dataIds);
  await expect(full.locator('tbody button')).toHaveCount(0);
});

async function captureFilter(page: Page, testInfo: TestInfo, locale: string) {
  const output = testInfo.outputPath(`activity-filter-${locale}-mobile.png`);
  await page.screenshot({ path: output, animations: 'disabled' });
  const folder = path.resolve('docs/screenshots');
  await mkdir(folder, { recursive: true });
  await copyFile(output, path.join(folder, `cms-dashboard-activity-filter-${locale}-${testInfo.project.name}.png`));
}

test.describe('mobile activity filters', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the simple selection dialog fits mobile in English and Thai', async ({ page }, testInfo) => {
    await login(page);
    for (const locale of ['en', 'th'] as const) {
      const t = (value: string) => translateCms(locale, value);
      if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
      const trigger = page.getByRole('region', { name: t('Recent activity'), exact: true }).getByRole('button', { name: t('Filter activity'), exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: t('Filter activity'), exact: true });
      for (const label of ['All activities', 'Data changes', 'User activity', 'Enquiry activity']) {
        await expect(dialog.getByRole('button', { name: new RegExp(`^${t(label)}`) })).toBeInViewport();
      }
      await expect(dialog.getByRole('searchbox')).toHaveCount(0);
      await expect(dialog.getByRole('combobox')).toHaveCount(0);
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await captureFilter(page, testInfo, locale);
      await dialog.getByRole('button', { name: new RegExp(`^${t('Data changes')}`) }).click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
  });
});
