import type { Locator, Page } from '@playwright/test';
import { test, expect, E2E_ADMIN } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';
import { cmsFieldsThai } from '../../src/lib/cms-fields-th';
import { cmsMessagesThai } from '../../src/lib/cms-messages-th';

// An untouched browser has no stored preference. Existing workflow tests opt in
// to English through the fixture; these tests exercise the actual Thai default.
test.use({ cmsLocale: 'th' });

function languageControl(scope: Page | Locator) {
  return scope.getByRole('group', { name: /^(CMS language|ภาษาของระบบจัดการเว็บไซต์)$/ });
}
function headerLanguage(page: Page) {
  return page.locator('header [data-cms-language-switch]');
}

async function signInThai(page: Page) {
  await page.goto('/cms');
  await expect(headerLanguage(page)).toHaveText('TH');
  await expect(headerLanguage(page)).toHaveAttribute('aria-label', cmsMainThai['Switch to English']);
  await page.locator('input[name="username"]').fill(E2E_ADMIN.username);
  await page.locator('input[name="password"]').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: cmsMainThai['Sign in'], exact: true }).click();
  await expect(page.getByRole('heading', { name: cmsMainThai['Content overview'], exact: true })).toBeVisible();
}

async function expectStickyHeader(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect.poll(() => page.locator('header').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
}

test('CMS header remains at the top while scrolling the desktop overview', async ({ page }) => {
  await signInThai(page);
  await expectStickyHeader(page);
});

test('CMS defaults to Thai during loading and remembers an explicit language choice', async ({ page }, testInfo) => {
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>(resolve => { releaseSession = resolve; });
  await page.route('**/api/cms/session', async route => {
    await sessionGate;
    await route.continue();
  });
  await page.goto('/cms');
  const loading = page.locator('[data-loading-screen="cms"]');
  try {
    await expect(loading).toHaveAttribute('lang', 'th');
    await expect(loading.getByRole('status')).toContainText('กำลังตรวจสอบการเข้าสู่ระบบ');
  } finally {
    releaseSession();
  }
  await expect(page.getByRole('heading', { name: cmsMainThai['Welcome back'], exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('thai-sign-in.png'), animations: 'disabled' });
  await headerLanguage(page).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(headerLanguage(page)).toHaveText('EN');
  await expect(headerLanguage(page)).toHaveAttribute('aria-label', 'Switch to Thai');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(headerLanguage(page)).toHaveText('EN');
  await headerLanguage(page).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: cmsMainThai['Welcome back'], exact: true })).toBeVisible();
});

test('switching language preserves sign-in input and translates an existing error', async ({ page }) => {
  const message = 'The username or password is incorrect.';
  await page.route('**/api/cms/login', route => route.fulfill({ status: 401, json: { error: message } }));
  await page.goto('/cms');
  await page.locator('input[name="username"]').fill('language-test');
  await page.locator('input[name="password"]').fill('unsaved-test-password');
  await page.getByRole('button', { name: cmsMainThai['Sign in'], exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(cmsMessagesThai[message]);
  await headerLanguage(page).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
  await expect(page.locator('input[name="username"]')).toHaveValue('language-test');
  await expect(page.locator('input[name="password"]')).toHaveValue('unsaved-test-password');
});

test.describe('mobile content editor', () => {
test.use({ viewport: { width: 390, height: 844 } });

test('content draft survives language changes inside its dialog without saving', async ({ page, db }, testInfo) => {
  await signInThai(page);
  await headerLanguage(page).click();
  const recordCount = await db.collection('moe_content').countDocuments();
  await page.getByRole('button', { name: 'Create content', exact: true }).click();
  const editor = page.locator('dialog[open]').filter({ has: page.locator('#cms-content-editor') });
  await editor.getByLabel('Title · English', { exact: true }).fill('An unsaved English title');
  await editor.getByLabel('Title · Thai', { exact: true }).fill('ชื่อภาษาไทยที่ยังไม่บันทึก');
  await languageControl(editor).getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(editor).toHaveAccessibleName(cmsMainThai['Create content']);
  await expect(editor.getByLabel(cmsFieldsThai['Title · English'], { exact: true })).toHaveValue('An unsaved English title');
  await expect(editor.getByLabel(cmsFieldsThai['Title · Thai'], { exact: true })).toHaveValue('ชื่อภาษาไทยที่ยังไม่บันทึก');
  await expect(editor.getByRole('button', { name: cmsMainThai['Save'], exact: true })).toBeVisible();
  await expect.poll(() => editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('thai-editor-mobile.png'), animations: 'disabled' });
  await languageControl(editor).getByRole('button', { name: 'English', exact: true }).click();
  await expect(editor.getByLabel('Title · English', { exact: true })).toHaveValue('An unsaved English title');
  await expect(editor.getByLabel('Title · Thai', { exact: true })).toHaveValue('ชื่อภาษาไทยที่ยังไม่บันทึก');
  expect(await db.collection('moe_content').countDocuments()).toBe(recordCount);
});
});

test.describe('mobile language controls', () => {
test.use({ viewport: { width: 390, height: 844 } });
test('Thai and English mobile navigation stay within the viewport and restore focus', async ({ page }, testInfo) => {
  await signInThai(page);
  const menu = page.getByRole('button', { name: cmsMainThai['Open CMS navigation'], exact: true });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: cmsMainThai['CMS navigation'], exact: true });
  await expect(drawer).toBeVisible();
  await expect.poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('thai-navigation-mobile.png'), animations: 'disabled' });
  await languageControl(drawer).getByRole('button', { name: 'English', exact: true }).click();
  const englishDrawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await expect(englishDrawer.getByRole('button', { name: 'Content overview', exact: true })).toBeVisible();
  await expect.poll(() => englishDrawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(englishDrawer).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open CMS navigation', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
});

test.describe('narrow CMS header', () => {
test.use({ viewport: { width: 320, height: 750 } });

test('language switch stays beside the site button in both languages', async ({ page }, testInfo) => {
  await signInThai(page);
  const header = page.locator('header');
  const site = header.getByRole('link', { name: /^(เปิดเว็บไซต์ในแท็บใหม่|View website in a new tab)$/ });
  const language = headerLanguage(page);
  const onSameRow = async () => {
    const siteBox = await site.boundingBox();
    const languageBox = await language.boundingBox();
    expect(siteBox).not.toBeNull();
    expect(languageBox).not.toBeNull();
    expect(Math.abs(siteBox!.y + siteBox!.height / 2 - languageBox!.y - languageBox!.height / 2)).toBeLessThan(2);
    expect(languageBox!.x).toBeGreaterThan(siteBox!.x + siteBox!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await onSameRow();
  await page.screenshot({ path: testInfo.outputPath('thai-header-narrow.png'), animations: 'disabled' });
  await language.click();
  await expect(language).toHaveText('EN');
  await onSameRow();
  await page.screenshot({ path: testInfo.outputPath('english-header-narrow.png'), animations: 'disabled' });
  await expectStickyHeader(page);
});
});

test('Thai content form saves original enum values and both content languages unchanged', async ({ page, context, db }) => {
  await signInThai(page);
  await page.getByRole('button', { name: cmsMainThai['Create content'], exact: true }).click();
  const editor = page.getByRole('dialog', { name: cmsMainThai['Create content'], exact: true });
  const contentType = editor.getByRole('combobox', { name: cmsFieldsThai['Content type'], exact: true });
  await contentType.selectOption({ label: cmsFieldsThai.Vessel });
  await expect(contentType).toHaveValue('Vessel');
  const id = 'e2e-thai-cms-vessel';
  // Deliberately use a translated UI word as content: saved text must stay exact.
  const title = 'Save';
  const titleTh = 'เรือทดสอบจากระบบภาษาไทย';
  const summary = 'Original English vessel summary entered in the Thai interface.';
  const summaryTh = 'เนื้อหาภาษาไทยที่กรอกผ่านหน้าจัดการภาษาไทย';
  await editor.getByLabel(cmsFieldsThai['Title · English'], { exact: true }).fill(title);
  await editor.getByLabel(cmsFieldsThai['Title · Thai'], { exact: true }).fill(titleTh);
  await editor.getByLabel(cmsMainThai['URL identifier']).fill(id);
  await editor.getByLabel(`${cmsFieldsThai['Vessel type']} · ${cmsFieldsThai.English}`, { exact: true }).fill('Container');
  await editor.getByLabel(`${cmsFieldsThai['Vessel type']} · ${cmsFieldsThai.Thai}`, { exact: true }).fill('เรือตู้คอนเทนเนอร์');
  await editor.getByLabel(cmsFieldsThai['Summary · English'], { exact: true }).fill(summary);
  await editor.getByLabel(cmsFieldsThai['Summary · Thai'], { exact: true }).fill(summaryTh);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  const imageLabel = cmsFieldsThai['Browse library for {label}'].replace('{label}', cmsFieldsThai['Main image']);
  await editor.getByRole('button', { name: imageLabel, exact: true }).click();
  await editor.getByRole('button', { name: media!.title, exact: true }).click();
  await editor.getByRole('button', { name: cmsMainThai.Save, exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await db.collection('moe_content').findOne({ id })).toMatchObject({
    type: 'Vessel', title, titleTh, description: summary, descriptionTh: summaryTh,
    category: 'Container', categoryTh: 'เรือตู้คอนเทนเนอร์', status: 'Published', revision: 1,
  });
  const publicPage = await context.newPage();
  await publicPage.goto(`/fleet/${id}`);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await publicPage.goto(`/th/fleet/${id}`);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(titleTh);
});
