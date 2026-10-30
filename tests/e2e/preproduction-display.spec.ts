import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { translateCms } from '../../src/lib/cms-locale';
import type { ContentRecord } from '../../src/lib/cms-types';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, loginChallengeData } from './fixtures';

type Locale = 'en' | 'th';
type StoredAccount = { _id: string; username: string; passwordHash: string; passwordVersion: number; role: 'Dev' | 'Admin' | 'Operator'; createdAt: Date };

async function signIn(page: Page, locale: Locale) {
  await page.addInitScript(value => localStorage.setItem('moe-cms-language', value), locale);
  expect((await page.request.post('/api/cms/login', {
    headers: { Origin: E2E_BASE_URL },
    data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) },
  })).status()).toBe(200);
}

async function noOverflow(page: Page, dialog?: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (!dialog) return;
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    if (!box) return Number.POSITIVE_INFINITY;
    const viewport = page.viewportSize()!;
    return Math.max(-box.x, -box.y, box.x + box.width - viewport.width, box.y + box.height - viewport.height);
  }).toBeLessThanOrEqual(1);
}

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 0.98 });
  expect(await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return Boolean(hit && (element === hit || element.contains(hit)));
  })).toBe(true);
}

async function focusedInputVisible(control: Locator) {
  await expect(control).toBeFocused();
  // Do not scroll here: this checks the app's focus/scroll handling itself.
  await expect.poll(() => control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const dialog = element.closest('dialog')!;
    const dialogBounds = dialog.getBoundingClientRect();
    const heading = dialog.querySelector('header, [class*="settingsHeading"]')!.getBoundingClientRect();
    const footer = dialog.querySelector('footer')?.getBoundingClientRect();
    const top = Math.max(0, dialogBounds.top, heading.bottom);
    const bottom = Math.min(innerHeight, dialogBounds.bottom, footer?.top ?? Number.POSITIVE_INFINITY);
    return bounds.top >= top - 1 && bounds.bottom <= bottom + 1
      && document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
  })).toBe(true);
}

async function focusContained(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]').filter({ visible: true });
  await controls.last().focus(); await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await controls.first().focus(); await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
}

// These are deliberate text-size and layout simulations, not browser or OS
// zoom. Halving 1280x900 to 640x450 exercises the CSS reflow space at 200% zoom;
// the other case enlarges root text to 150% while keeping a 360px viewport.
const displayModes = [
  { name: '150% root text at 360px', width: 360, height: 800, rootPercent: 150 },
  { name: '200% equivalent reflow at 640px', width: 640, height: 450, rootPercent: 100 },
] as const;

for (const locale of ['en', 'th'] as const) for (const display of displayModes) {
  test.describe(`${locale} ${display.name}`, () => {
    test.use({ viewport: { width: display.width, height: display.height }, hasTouch: true });
    test('headers and long recipient/Edit dialogs retain keyboard focus and reachable controls', async ({ page, db }, testInfo) => {
      test.setTimeout(90_000);
      const t = (text: string, parameters?: Record<string, string | number>) => translateCms(locale, text, parameters);
      const recipients = Array.from({ length: 8 }, (_, index) => `display-review-${index}@example.com`);
      await db.collection<{ _id: string; revision: number; recipients: string[] }>('moe_settings').insertOne({ _id: 'enquiry-email-recipients', revision: 1, recipients });
      const original = await db.collection<StoredAccount>('moe_users').findOne({ _id: E2E_ADMIN.id });
      expect(original).not.toBeNull();
      const target = { ...original!, _id: randomUUID(), username: 'display-dialog-operator', role: 'Operator' as const };
      await db.collection<StoredAccount>('moe_users').insertOne(target);
      await signIn(page, locale);
      let writes = 0;
      page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if ((path === '/api/cms/email/recipients' && request.method() === 'PUT')
          || (path === '/api/cms/users' && request.method() === 'PATCH')
          || path === '/api/cms/inbox/notify') writes++;
      });
      async function openPage(path: string) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.addStyleTag({ content: `html { font-size: ${display.rootPercent}% !important; }` });
        await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16 * display.rootPercent / 100);
        await noOverflow(page);
        await reachable(page.getByRole('button', { name: t('Open CMS navigation'), exact: true }));
      }
      await openPage('/cms/enquiries');
      const opener = page.getByRole('button', { name: t('Notification recipients'), exact: true });
      await opener.tap();
      const recipientsDialog = page.getByRole('dialog', { name: t('Notification recipients'), exact: true });
      await expect(recipientsDialog.getByRole('textbox')).toHaveCount(recipients.length);
      await noOverflow(page, recipientsDialog);
      await focusContained(page, recipientsDialog);
      await recipientsDialog.getByRole('button', { name: t('Add email'), exact: true }).tap();
      const added = recipientsDialog.getByRole('textbox', { name: t('Recipient email {number}', { number: recipients.length + 1 }), exact: true });
      await focusedInputVisible(added);
      await added.fill('new-display-review@example.com');
      await reachable(recipientsDialog.getByRole('button', { name: t('Save changes'), exact: true }));
      await page.screenshot({ path: testInfo.outputPath('recipient-text-reflow.png'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await expect(recipientsDialog).toHaveCount(0); await expect(opener).toBeFocused();
      expect((await db.collection<{ _id: string; recipients: string[] }>('moe_settings').findOne({ _id: 'enquiry-email-recipients' }))?.recipients).toEqual(recipients);

      await openPage('/cms/users');
      const editOpener = page.getByRole('button', { name: t('Edit {name}', { name: target.username }), exact: true });
      await editOpener.tap();
      const edit = page.getByRole('dialog', { name: t('Edit user'), exact: true });
      await expect(edit).toBeVisible(); await noOverflow(page, edit); await focusContained(page, edit);
      await edit.getByRole('button', { name: t('Save changes'), exact: true }).tap();
      await focusedInputVisible(edit.getByLabel(t('Your current password'), { exact: true }));
      await reachable(edit.getByRole('button', { name: t('Reset password'), exact: true }));
      await page.screenshot({ path: testInfo.outputPath('edit-user-text-reflow.png'), animations: 'disabled' });
      await page.keyboard.press('Escape'); await expect(edit).not.toBeVisible(); await expect(editOpener).toBeFocused();
      expect(writes).toBe(0);
      expect(await db.collection<StoredAccount>('moe_users').findOne({ _id: target._id })).toMatchObject({ username: target.username, role: 'Operator', passwordVersion: target.passwordVersion });
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    });
  });
}

test.describe('4800px declared DPR 2 display', () => {
  test.use({ viewport: { width: 4800, height: 1800 }, deviceScaleFactor: 2 });
  test('public and CMS layouts apply 40px root scaling without overflow', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('40px');
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('public-4800-dpr2.png'), scale: 'css', animations: 'disabled' });
    await signIn(page, 'en'); await page.goto('/cms');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('40px');
    await noOverflow(page);
    const opener = page.getByRole('button', { name: 'Open CMS navigation', exact: true });
    await reachable(opener); await opener.click();
    const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
    await expect(drawer).toBeVisible(); await noOverflow(page, drawer); await focusContained(page, drawer);
    await reachable(drawer.getByRole('link', { name: 'View website in a new tab', exact: true }));
    await page.screenshot({ path: testInfo.outputPath('cms-drawer-4800-dpr2.png'), scale: 'css', animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(drawer).not.toBeVisible(); await expect(opener).toBeFocused();
  });
});

test.describe('Thai 320px native-touch contact submission', () => {
  test.use({ viewport: { width: 320, height: 740 }, hasTouch: true });
  test('invalid input receives focus before one valid enquiry is saved with Thai receipt', async ({ page, db }, testInfo) => {
    await page.goto('/th/contact');
    const form = page.getByRole('form', { name: 'ส่งข้อความสอบถาม', exact: true });
    const submit = form.getByRole('button', { name: 'ส่งข้อความสอบถาม', exact: true });
    let writes = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/contact' && request.method() === 'POST') writes++; });
    await submit.tap();
    await expect(form.getByRole('textbox', { name: 'ชื่อ', exact: true })).toBeFocused();
    expect(writes).toBe(0);
    await form.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('ผู้สอบถาม ทดสอบมือถือ');
    await form.getByRole('textbox', { name: 'อีเมล', exact: true }).fill('thai-mobile-review@example.com');
    await form.getByRole('textbox', { name: 'หัวข้อ', exact: true }).fill('สอบถามบริการขนส่งจากมือถือ');
    await form.getByRole('textbox', { name: 'ข้อความ', exact: true }).fill('ข้อความสมมติสำหรับตรวจสอบการส่งแบบฟอร์มภาษาไทยบนมือถือ โดยไม่มีการส่งอีเมลจริง');
    await form.getByRole('checkbox').tap();
    await noOverflow(page); await reachable(submit);
    await submit.tap();
    const receipt = form.getByRole('status');
    await expect(receipt).toContainText('ได้รับข้อความสอบถามของคุณแล้ว');
    await expect(receipt).toBeFocused(); await expect(receipt).toBeInViewport({ ratio: 0.98 });
    const contactShortcut = page.getByRole('button', { name: 'เปิดช่องทางติดต่อ', exact: true });
    await expect(contactShortcut).toBeVisible();
    await expect.poll(async () => {
      const shortcutBounds = await contactShortcut.boundingBox();
      if (!shortcutBounds) return false;
      return receipt.evaluate((element, shortcut) => {
        const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        let visibleFragments = 0;
        while ((textNode = textNodes.nextNode())) {
          if (!textNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(textNode);
          for (const bounds of range.getClientRects()) {
            if (!bounds.width || !bounds.height) continue;
            visibleFragments++;
            if (bounds.left < shortcut.x + shortcut.width && bounds.right > shortcut.x
              && bounds.top < shortcut.y + shortcut.height && bounds.bottom > shortcut.y) return false;
          }
        }
        return visibleFragments > 0;
      }, shortcutBounds);
    }).toBe(true);
    await noOverflow(page);
    expect(writes).toBe(1);
    const saved = await db.collection('moe_enquiries').find({ email: 'thai-mobile-review@example.com' }).toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ locale: 'th', status: 'New', subject: 'สอบถามบริการขนส่งจากมือถือ', notification: { status: 'not_configured', attempts: 0 } });
    await expect(form.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('');
    await page.screenshot({ path: testInfo.outputPath('thai-contact-receipt-320.png'), animations: 'disabled' });
  });
});

test.describe('Browser JSON downloads', () => {
  test.use({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  test('Settings export and a failed-save draft download contain the intended data without account secrets', async ({ page, db }, testInfo) => {
    const stored = await db.collection<ContentRecord & { _id: string }>('moe_content').findOne({ type: 'Vessel', deletedAt: { $exists: false } });
    const account = await db.collection<StoredAccount>('moe_users').findOne({ _id: E2E_ADMIN.id });
    expect(stored).not.toBeNull(); expect(account).not.toBeNull();
    await db.collection<{ _id: string; revision: number; recipients: string[] }>('moe_settings').insertOne({
      _id: 'enquiry-email-recipients', revision: 1, recipients: ['private-download-recipient@example.com'],
    });
    await signIn(page, 'en'); await page.goto('/cms/setting');
    const exportDownloadPromise = page.waitForEvent('download');
    const exportResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/export' && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Export data', exact: true }).click();
    const exportDownload = await exportDownloadPromise;
    const exportResponse = await exportResponsePromise;
    expect(exportResponse.status()).toBe(200);
    expect(exportDownload.suggestedFilename()).toMatch(/^moe-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await exportDownload.failure()).toBeNull();
    await exportDownload.saveAs(testInfo.outputPath(exportDownload.suggestedFilename()));
    const exportPath = await exportDownload.path(); expect(exportPath).not.toBeNull();
    const exportedText = await readFile(exportPath!, 'utf8');
    const exported = JSON.parse(exportedText);
    expect(exported).toEqual(await exportResponse.json());
    expect(exported.format).toBe('moe-export-v1');
    expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
    expect(exported.records).toEqual(expect.arrayContaining([expect.objectContaining({ id: stored!.id, type: 'Vessel', title: stored!.title, titleTh: stored!.titleTh })]));
    expect(exported.media.length).toBeGreaterThan(0);
    expect(exported.enquiries).toHaveLength(await db.collection('moe_enquiries').countDocuments());
    expect(exported.settings).toHaveProperty('companyName');
    expect(exported).not.toHaveProperty('users'); expect(exported).not.toHaveProperty('logs');
    expect(exportedText).not.toContain(account!.passwordHash);
    expect(exportedText).not.toContain(E2E_ADMIN.password);
    expect(exportedText).not.toContain('private-download-recipient@example.com');
    function noSecretKeys(value: unknown) {
      if (Array.isArray(value)) { value.forEach(noSecretKeys); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/^(password(?:Hash|Version)?|sessionToken|apiKey|apiSecret|notificationDelivery|fingerprint|consentAt)$/i);
        noSecretKeys(child);
      }
    }
    noSecretKeys(exported);

    await page.goto('/cms/fleet');
    await page.getByRole('button', { name: `Edit ${stored!.title}`, exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
    const draftTitle = 'Retained draft after a controlled save failure';
    const draftTitleTh = 'ข้อความที่ยังไม่บันทึกหลังการทดสอบข้อผิดพลาด';
    for (const [label, value] of [['Title · English', draftTitle], ['Title · Thai', draftTitleTh]]) {
      const field = editor.getByLabel(label, { exact: true });
      for (const group of await field.locator('xpath=ancestor::details').all()) {
        if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').click();
      }
      await field.fill(value);
    }
    let saves = 0;
    await page.route('**/api/cms/content', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      saves++;
      await route.fulfill({ status: 503, json: { error: 'Synthetic save failure for draft download.' } });
    });
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Synthetic save failure for draft download.');
    const draftDownloadPromise = page.waitForEvent('download');
    await editor.getByRole('button', { name: 'Download unsaved text', exact: true }).click();
    const draftDownload = await draftDownloadPromise;
    expect(draftDownload.suggestedFilename()).toBe(`unsaved-${stored!.id}.json`);
    expect(await draftDownload.failure()).toBeNull();
    await draftDownload.saveAs(testInfo.outputPath(draftDownload.suggestedFilename()));
    const draftPath = await draftDownload.path(); expect(draftPath).not.toBeNull();
    const draft = JSON.parse(await readFile(draftPath!, 'utf8'));
    expect(draft).toMatchObject({ version: 1, kind: 'moe-unsaved-content', record: { id: stored!.id, type: 'Vessel', title: draftTitle, titleTh: draftTitleTh, revision: stored!.revision } });
    expect(draft.note).toContain('Prepared device image files are not included');
    noSecretKeys(draft);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Title · English', { exact: true })).toHaveValue(draftTitle);
    await expect(editor.getByLabel('Title · Thai', { exact: true })).toHaveValue(draftTitleTh);
    expect(saves).toBe(1);
    expect(await db.collection<ContentRecord & { _id: string }>('moe_content').findOne({ _id: stored!._id })).toEqual(stored);
  });
});
