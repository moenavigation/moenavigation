import type { Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { blankContact, contactDraftKey, serializeContactDraft } from '../../src/lib/contact-draft';
import { test, expect, login } from './fixtures';

async function freezeClock(page: Page) {
  // Freeze only after initial data loading. Network requests still complete
  // normally, while advancing five seconds cannot race the notification check.
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
}

async function openFleet(page: Page) {
  await login(page);
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  const records = (await response.json()).records as ContentRecord[];
  const vessel = records.find(record => record.type === 'Vessel')!;
  expect(vessel).toBeTruthy();
  await page.goto('/cms/fleet');
  await expect(page.getByRole('button', { name: `Edit ${vessel.title}`, exact: true })).toBeVisible();
  await freezeClock(page);
  return vessel;
}

async function saveVessel(page: Page, vessel: ContentRecord) {
  await page.getByRole('button', { name: `Edit ${vessel.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
  await expect(editor).toBeVisible();
  const response = page.waitForResponse(result => new URL(result.url()).pathname === '/api/cms/content' && result.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(editor).not.toBeVisible();
  const notice = page.getByText(`“${vessel.title}” saved.`, { exact: true });
  await expect(notice).toBeVisible();
  return notice;
}

test('saved content notifications disappear after five seconds and can still be dismissed immediately', async ({ page }) => {
  const vessel = await openFleet(page);
  const notice = await saveVessel(page, vessel);
  await page.clock.runFor(4_999);
  await expect(notice).toBeVisible();
  await page.clock.runFor(1);
  await expect(notice).not.toBeVisible();
  // The notification timer must not hide persistent counts or saved content.
  await expect(page.getByRole('status').filter({ hasText: /^Showing \d+ of \d+ items$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit ${vessel.title}`, exact: true })).toBeVisible();

  await saveVessel(page, vessel);
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await page.clock.runFor(5_000);
  await expect(notice).not.toBeVisible();
});

test('repeating the same saved message starts a fresh five-second notification timer', async ({ page }) => {
  const vessel = await openFleet(page);
  const notice = await saveVessel(page, vessel);
  await page.clock.runFor(4_000);
  await saveVessel(page, vessel);
  await page.clock.runFor(1_000);
  await expect(notice).toBeVisible();
  await page.clock.runFor(3_999);
  await expect(notice).toBeVisible();
  await page.clock.runFor(1);
  await expect(notice).not.toBeVisible();
});

test('slide notifications replace their timer without hiding the unsaved status or draft', async ({ page }) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cms/slides');
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  await freezeClock(page);
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  const first = page.getByText('Slide moved to position 2. Save to apply.', { exact: true });
  await expect(first).toBeVisible();
  await page.clock.runFor(4_000);
  await page.getByRole('button', { name: 'Move slide 2 up', exact: true }).click();
  const latest = page.getByText('Slide moved to position 1. Save to apply.', { exact: true });
  await expect(first).not.toBeVisible();
  await expect(latest).toBeVisible();
  await page.clock.runFor(1_000);
  await expect(latest).toBeVisible();
  await page.clock.runFor(4_000);
  await expect(latest).not.toBeVisible();

  // Make a lasting draft change after returning the card to its initial order.
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  await page.clock.runFor(5_000);
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save slides', exact: true })).toBeEnabled();
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
});

test('settings confirmations expire while an actionable save error remains available', async ({ page }) => {
  await login(page);
  await page.goto('/cms/setting');
  const company = page.getByLabel('Company name · English', { exact: true });
  await expect(company).toBeVisible();
  await freezeClock(page);
  await company.fill(`${await company.inputValue()} updated`);
  await page.getByRole('button', { name: 'Save website details', exact: true }).click();
  const confirmation = page.getByText('Website details saved. They are now available on the public contact page.', { exact: true });
  await expect(confirmation).toBeVisible();
  await page.clock.runFor(4_999);
  await expect(confirmation).toBeVisible();
  await page.clock.runFor(1);
  await expect(confirmation).not.toBeVisible();

  await page.route('**/api/cms/settings', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Check the company name before saving.' }) });
  });
  await company.fill('Unsaved company edit');
  await page.getByRole('button', { name: 'Save website details', exact: true }).click();
  const error = page.getByRole('alert').filter({ hasText: 'Check the company name before saving.' });
  await expect(error).toBeVisible();
  await page.clock.runFor(6_000);
  await expect(error).toBeVisible();
  await expect(company).toHaveValue('Unsaved company edit');
});

test('the public enquiry confirmation expires after five seconds while its reference and focus remain', async ({ page, db }) => {
  const restoredName = 'Restored notification draft';
  await page.addInitScript(({ key, draft }) => localStorage.setItem(key, draft), {
    key: contactDraftKey,
    draft: serializeContactDraft({ ...blankContact, name: restoredName })!,
  });
  await page.goto('/contact');
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  // Restoring browser storage requires the client store subscription to mount;
  // a visible server-rendered Send button alone does not prove hydration ready.
  await expect(name).toHaveValue(restoredName);
  await freezeClock(page);
  await name.fill('Notification timer visitor');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('notification-timer@example.test');
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Notification timer enquiry');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please share information about your maritime services.');
  await page.getByRole('checkbox', { name: 'I agree that my information may be used to review and respond to this enquiry.', exact: true }).check();
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/contact' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send enquiry', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  const { id } = await response.json() as { id: string };
  const receipt = page.locator('#contact-form > [tabindex="-1"]');
  await expect(receipt).toContainText('Your enquiry has been received.');
  await expect(receipt).toHaveAttribute('role', 'status');
  await expect(receipt).toContainText(`Reference: ${id}`);
  await expect(receipt).toBeFocused();

  await page.clock.runFor(4_999);
  await expect(receipt).toHaveAttribute('role', 'status');
  await page.clock.runFor(1);
  await expect(page.getByText('Your enquiry has been received.', { exact: true })).not.toBeVisible();
  await expect(receipt).not.toHaveAttribute('role', 'status');
  await expect(receipt).toContainText(`Reference: ${id}`);
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeFocused();
  expect(await db.collection('moe_enquiries').countDocuments({ subject: 'Notification timer enquiry' })).toBe(1);
});
