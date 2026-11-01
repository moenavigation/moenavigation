import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN } from './fixtures';

type StoredUser = { _id: string; [key: string]: unknown };

async function outsidePoint(page: Page, dialog: Locator) {
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const height = await page.evaluate(() => innerHeight);
  expect(bounds!.x).toBeGreaterThan(2);
  return { x: Math.max(1, bounds!.x / 2), y: Math.max(2, Math.min(height - 2, bounds!.y + bounds!.height / 2)) };
}

async function clickOutside(page: Page, dialog: Locator) {
  const point = await outsidePoint(page, dialog);
  await page.mouse.click(point.x, point.y);
}

async function dragOutside(page: Page, dialog: Locator) {
  const heading = await dialog.getByRole('heading').first().boundingBox();
  expect(heading).not.toBeNull();
  const outside = await outsidePoint(page, dialog);
  await page.mouse.move(heading!.x + heading!.width / 2, heading!.y + heading!.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 6 });
  await page.mouse.up();
}

test('recipient guidance is localized and backdrop dismissal excludes inside clicks and drags', async ({ page }, testInfo) => {
  await login(page);
  let writes = 0;
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/cms/email/recipients') writes++; });
  for (const [locale, width] of [['en', 1280], ['th', 320]] as const) {
    const t = (source: string) => translateCms(locale, source);
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cms/enquiries');
    const opener = page.getByRole('button', { name: t('Notification recipients'), exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: t('Notification recipients'), exact: true });
    const add = dialog.getByRole('button', { name: t('Add email'), exact: true });
    await expect(add).toBeEnabled();
    await expect(dialog.getByText(t('Important'), { exact: true })).toBeVisible();
    await expect(dialog.getByText(locale === 'en' ? /Spam|Junk/ : /สแปม/).first()).toBeVisible();
    await expect(dialog.getByText(t('Saving this list does not send an email. Resend still needs a configured API key and verified sender.'), { exact: true })).toHaveCount(0);
    await add.click();
    const input = dialog.getByRole('textbox');
    await input.fill('unsaved-recipient@example.com');
    await dialog.getByRole('heading').click();
    await expect(dialog).toBeVisible();

    // A dialog-root event can occur on its padding or border, not just its backdrop.
    const bounds = (await dialog.boundingBox())!;
    const inside = { button: 0, clientX: bounds.x + 1, clientY: bounds.y + 1, pointerType: 'mouse', isPrimary: true };
    await dialog.dispatchEvent('pointerdown', inside);
    await dialog.dispatchEvent('click', inside);
    await expect(dialog).toBeVisible();
    await dragOutside(page, dialog);
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue('unsaved-recipient@example.com');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`recipients-spam-note-${locale}-${width}.png`), animations: 'disabled' });
    await clickOutside(page, dialog);
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  }
  expect(writes).toBe(0);
});

test('profile and usage dialogs close on the backdrop and restore their openers', async ({ page }) => {
  await login(page);
  await page.goto('/cms/users');
  const settingsOpener = page.getByRole('button', { name: 'User settings', exact: true });
  await settingsOpener.click();
  const settings = page.getByRole('dialog', { name: 'User settings', exact: true });
  const photoOpener = settings.getByRole('button', { name: 'Change profile photo', exact: true });
  await photoOpener.click();
  const photo = page.getByRole('dialog', { name: 'Profile photo', exact: true });
  await expect(photo).toBeVisible();
  await photo.getByRole('heading').click();
  await expect(photo).toBeVisible();
  await clickOutside(page, photo);
  await expect(photo).not.toBeVisible();
  await expect(settings).toBeVisible();
  await expect(photoOpener).toBeFocused();
  await clickOutside(page, settings);
  await expect(settings).not.toBeVisible();
  await expect(settingsOpener).toBeFocused();

  await page.goto('/cms/usage');
  for (const name of ['Monitoring limits', 'Update Vercel reading']) {
    const opener = page.getByRole('button', { name, exact: true });
    await expect(opener).toBeEnabled();
    await opener.click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog).toBeVisible();
    await clickOutside(page, dialog);
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  }
});

test('an outside click closes only the nested password reset and preserves its parent edit draft', async ({ page, db }) => {
  const source = await db.collection<StoredUser>('moe_users').findOne({ _id: E2E_ADMIN.id });
  expect(source).not.toBeNull();
  const id = randomUUID();
  await db.collection<StoredUser>('moe_users').insertOne({ ...source!, _id: id, username: 'outside-dialog-target', role: 'Operator' });
  await login(page);
  await page.goto('/cms/users');
  const opener = page.getByRole('button', { name: 'Edit outside-dialog-target', exact: true });
  await opener.click();
  const edit = page.getByRole('dialog', { name: 'Edit user', exact: true });
  await edit.getByLabel('Role', { exact: true }).selectOption('Admin');
  await edit.getByLabel('Your current password', { exact: true }).fill('unsaved-password');
  const resetOpener = edit.getByRole('button', { name: 'Reset password', exact: true });
  await resetOpener.click();
  const reset = page.getByRole('dialog', { name: 'Reset password', exact: true });
  await reset.getByLabel('New password', { exact: true }).fill('Unsubmitted-reset-password-2026!');
  await clickOutside(page, reset);
  await expect(reset).not.toBeVisible();
  await expect(edit).toBeVisible();
  await expect(resetOpener).toBeFocused();
  await expect(edit.getByLabel('Role', { exact: true })).toHaveValue('Admin');
  await expect(edit.getByLabel('Your current password', { exact: true })).toHaveValue('unsaved-password');
  expect(await db.collection<StoredUser>('moe_users').findOne({ _id: id })).toMatchObject({ role: 'Operator' });
  await clickOutside(page, edit);
  await expect(edit).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('shared dialogs dismiss outside and dirty content keeps its discard confirmation', async ({ page }) => {
  await login(page);
  const filterOpener = page.getByRole('button', { name: 'Filter activity', exact: true });
  await filterOpener.click();
  const filter = page.getByRole('dialog', { name: 'Filter activity', exact: true });
  await expect(filter).toBeVisible();
  await clickOutside(page, filter);
  await expect(filter).not.toBeVisible();
  await expect(filterOpener).toBeFocused();

  await page.goto('/cms/services');
  await page.getByRole('button', { name: 'Add service', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add service', exact: true });
  const title = editor.getByLabel('Title · English', { exact: true });
  await title.fill('Unsaved outside-click service');
  await clickOutside(page, editor);
  const discard = page.getByRole('dialog', { name: 'Discard changes', exact: true });
  await expect(discard).toBeVisible();
  await expect(editor).toBeVisible();
  await clickOutside(page, discard);
  await expect(discard).not.toBeVisible();
  await expect(editor).toBeVisible();
  await expect(title).toHaveValue('Unsaved outside-click service');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(editor).not.toBeVisible();
});

test('the captcha dialog closes outside but ignores an inside-to-outside drag', async ({ page }) => {
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill('unverified-user');
  await page.getByLabel('Password', { exact: true }).fill('Unsubmitted-login-password-2026!');
  const opener = page.getByRole('button', { name: 'Sign in', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Complete the picture', exact: true });
  await expect(dialog.locator('input[type="range"]')).toBeEnabled();
  await dragOutside(page, dialog);
  await expect(dialog).toBeVisible();
  await clickOutside(page, dialog);
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('Unsubmitted-login-password-2026!');
});
