import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, login } from './fixtures';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test('coordinate progress follows the latest link and a pending lookup can be cancelled without changing the route', async ({ page }) => {
  await login(page);
  const response = await page.request.get('/api/cms/content');
  const records = (await response.json()).records as ContentRecord[];
  const before = records.find(record => record.type === 'Route' && record.origin && record.waypoints?.length)!;
  expect(before).toBeTruthy();
  await page.goto('/cms/routes');
  await page.getByRole('button', { name: `Edit ${before.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit route', exact: true });
  const mapDetails = editor.getByText('Route map and ports', { exact: true }).locator('xpath=ancestor::details[1]');
  if (!await mapDetails.evaluate(element => element.hasAttribute('open'))) await mapDetails.locator(':scope > summary').click();
  await editor.getByRole('button', { name: 'Use Google Maps link · Origin point', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Google Maps link', exact: true });
  const input = dialog.getByLabel('Google Maps link', { exact: true });
  const panel = dialog.locator('[data-working-panel]');
  const old = gate(), cancelled = gate();
  let requests = 0, saves = 0;
  const pending: Promise<void>[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/cms/content' && request.method() === 'POST') saves++; });
  await page.route('**/api/cms/routes/coordinates', route => {
    const current = ++requests;
    const work = (async () => {
      if (current === 1) await old.promise;
      if (current === 3) await cancelled.promise;
      const coordinates = current === 2 ? { latitude: 14.5, longitude: 101.75 } : { latitude: 10.1, longitude: 99.2 };
      // The first and third requests are intentionally aborted by the editor.
      if (current === 2) await route.fulfill({ json: coordinates });
      else await route.fulfill({ json: coordinates }).catch(() => {});
    })();
    pending.push(work);
    return work;
  });
  try {
    await input.fill('https://www.google.com/maps?q=10.1,99.2');
    await expect.poll(() => requests).toBe(1);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Finding coordinates…');
    await expect(dialog.getByRole('button', { name: 'Use coordinates', exact: true })).toBeDisabled();
    await input.fill('https://www.google.com/maps?q=14.5,101.75');
    await expect(dialog.getByText('Coordinates found', { exact: true })).toBeVisible();
    await expect(dialog.getByText('14.5', { exact: true })).toBeVisible();
    await expect(panel).toHaveCount(0);
    old.release();
    await pending[0];
    await expect(dialog.getByText('101.75', { exact: true })).toBeVisible();
    await expect(dialog.getByText('99.2', { exact: true })).toHaveCount(0);
    await input.fill('https://www.google.com/maps?q=12.5,100.5');
    await expect.poll(() => requests).toBe(3);
    await expect(panel).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(editor).toBeVisible();
    expect(saves).toBe(0);
    cancelled.release();
    const after = (await (await page.request.get('/api/cms/content')).json()).records as ContentRecord[];
    expect(after.find(record => record.type === 'Route' && record.id === before.id)).toEqual(before);
  } finally {
    old.release(); cancelled.release();
    await Promise.all(pending);
    await page.unroute('**/api/cms/routes/coordinates');
  }
});

test('email setup progress clears after failure and retains the last successful checks without sending mail', async ({ page }, testInfo) => {
  await login(page);
  const held = gate();
  let reads = 0, sends = 0;
  const pending: Promise<void>[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/cms/inbox/notify') sends++; });
  await page.route('**/api/cms/email/status', route => {
    const current = ++reads;
    const work = (async () => {
      if (current === 1) return route.fulfill({ json: { provider: 'Resend', configured: true, checks: { apiKey: 'added', sender: 'added', recipient: 'added' } } });
      await held.promise;
      return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable.' } });
    })();
    pending.push(work); return work;
  });
  try {
    await page.goto('/cms/setting#email-notifications');
    const card = page.getByRole('region', { name: 'Email notifications', exact: true });
    await expect(card.getByText('Settings added', { exact: true })).toBeVisible();
    await expect(card.getByText('Added', { exact: true })).toHaveCount(3);
    const refresh = card.getByRole('button', { name: 'Refresh email setup', exact: true });
    await expect(refresh).toBeEnabled();
    await refresh.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => reads).toBe(2);
    const panel = card.locator('[data-working-panel]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Checking email setup…');
    await expect(card.getByRole('button', { name: 'Checking…', exact: true })).toBeDisabled();
    await expect(card.getByText('Added', { exact: true })).toHaveCount(3);
    await card.screenshot({ path: testInfo.outputPath('email-check-progress.png'), animations: 'disabled' });
    held.release();
    await expect(card.getByText('Email setup status unavailable', { exact: true })).toBeVisible();
    await expect(panel).toHaveCount(0);
    await expect(card.getByText('Last successful setup check', { exact: true })).toBeVisible();
    await expect(card.getByText('Added', { exact: true })).toHaveCount(3);
    expect(reads).toBe(2); expect(sends).toBe(0);
  } finally {
    held.release();
    await Promise.all(pending);
    await page.unroute('**/api/cms/email/status');
  }
});
