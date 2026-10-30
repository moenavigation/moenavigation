import type { Locator, Page } from '@playwright/test';
import { test, expect, E2E_ADMIN, solveLoginSlide } from './fixtures';
import { cmsMainThai } from '../../src/lib/cms-main-th';
import { cmsFieldsThai } from '../../src/lib/cms-fields-th';
import { cmsMessagesThai } from '../../src/lib/cms-messages-th';
import { translateCms } from '../../src/lib/cms-locale';

// An untouched browser has no stored preference. Existing workflow tests opt in
// to English through the fixture; these tests exercise the actual Thai default.
test.use({ cmsLocale: 'th' });

function headerLanguage(page: Page) {
  return page.locator('header [data-cms-language-switch]');
}
async function showTextField(editor: Locator, label: string) {
  const field = editor.getByLabel(label, { exact: true });
  for (const group of await field.locator('xpath=ancestor::details').all()) {
    if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').click();
  }
  return field;
}
async function expectDrawerSiteLink(drawer: Locator, locale: 'th' | 'en') {
  const link = drawer.getByRole('link', { name: locale === 'th' ? cmsMainThai['View website in a new tab'] : 'View website in a new tab', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toBeInViewport();
  await expect(link).toHaveAttribute('href', locale === 'th' ? '/th' : '/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
  await expect(drawer.getByText(locale === 'th' ? cmsMainThai['Signed in as'] : 'Signed in as', { exact: true })).toHaveCount(1);
  await expect(drawer.getByText(E2E_ADMIN.username, { exact: true })).toBeInViewport();
  const signOut = drawer.getByRole('button', { name: locale === 'th' ? cmsMainThai['Sign out'] : 'Sign out', exact: true });
  await expect(signOut).toBeInViewport();
  const linkBox = await link.boundingBox();
  const signOutBox = await signOut.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(signOutBox).not.toBeNull();
  expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(signOutBox!.y + 1);
}

async function signInThai(page: Page) {
  await page.goto('/cms');
  await expect(headerLanguage(page)).toHaveText('TH');
  await expect(headerLanguage(page)).toHaveAttribute('aria-label', cmsMainThai['Switch to English']);
  await page.locator('input[name="username"]').fill(E2E_ADMIN.username);
  await page.locator('input[name="password"]').fill(E2E_ADMIN.password);
  await solveLoginSlide(page);
  await expect(page.getByRole('heading', { name: cmsMainThai['Dashboard'], exact: true })).toBeVisible();
}

async function expectStickyHeader(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect.poll(() => page.locator('header').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
}

test('CMS desktop header and drawer stay usable after scrolling', async ({ page }, testInfo) => {
  await signInThai(page);
  await expectStickyHeader(page);
  const menu = page.getByRole('button', { name: cmsMainThai['Open CMS navigation'], exact: true });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: cmsMainThai['CMS navigation'], exact: true });
  await expectDrawerSiteLink(drawer, 'th');
  await page.screenshot({ path: testInfo.outputPath('thai-navigation-desktop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
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
  const loginSiteLink = page.locator('header').getByRole('link', { name: cmsMainThai['View website in a new tab'], exact: true });
  await expect(loginSiteLink).toHaveAttribute('href', '/th');
  await expect(loginSiteLink).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: testInfo.outputPath('thai-sign-in.png'), animations: 'disabled' });
  await headerLanguage(page).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.locator('header').getByRole('link', { name: 'View website in a new tab', exact: true })).toHaveAttribute('href', '/');
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
  await solveLoginSlide(page);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(cmsMessagesThai[message]);
  await headerLanguage(page).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
  await expect(page.locator('input[name="username"]')).toHaveValue('language-test');
  await expect(page.locator('input[name="password"]')).toHaveValue('unsaved-test-password');
});

test.describe('mobile content editor', () => {
test.use({ viewport: { width: 390, height: 844 } });

test('mobile content editor keeps both language fields without a dialog language switch', async ({ page, db }, testInfo) => {
  await signInThai(page);
  const recordCount = await db.collection('moe_content').countDocuments();
  await page.goto('/cms/news');
  await page.getByRole('button', { name: cmsMainThai['Add news'], exact: true }).click();
  const editor = page.locator('dialog[open]').filter({ has: page.locator('#cms-content-editor') });
  await expect(editor.locator('[data-cms-language-switch]')).toHaveCount(0);
  await (await showTextField(editor, cmsFieldsThai['Title · English'])).fill('An unsaved English title');
  await (await showTextField(editor, cmsFieldsThai['Title · Thai'])).fill('ชื่อภาษาไทยที่ยังไม่บันทึก');
  await expect(editor).toHaveAccessibleName(cmsMainThai['Add news']);
  await expect(editor.getByLabel(cmsFieldsThai['Title · English'], { exact: true })).toHaveValue('An unsaved English title');
  await expect(editor.getByLabel(cmsFieldsThai['Title · Thai'], { exact: true })).toHaveValue('ชื่อภาษาไทยที่ยังไม่บันทึก');
  await expect(editor.getByRole('button', { name: cmsMainThai['Save'], exact: true })).toBeVisible();
  await expect.poll(() => editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('thai-editor-mobile.png'), animations: 'disabled' });
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
  await expect(drawer.getByRole('heading', { name: cmsMainThai['CMS navigation'], exact: true })).toHaveCount(0);
  await expect(drawer.locator('[data-cms-language-switch]')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: cmsMainThai['Dashboard'], exact: true })).toHaveAttribute('aria-current', 'page');
  await expectDrawerSiteLink(drawer, 'th');
  await expect.poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('thai-navigation-mobile.png'), animations: 'disabled' });
  // The modal keeps the background header inert. Close it before changing language.
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await headerLanguage(page).click();
  await expect(headerLanguage(page)).toHaveText('EN');
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const englishDrawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await expect(englishDrawer.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
  await expectDrawerSiteLink(englishDrawer, 'en');
  await expect.poll(() => englishDrawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(englishDrawer).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open CMS navigation', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'CMS navigation', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
});
});

test.describe('narrow CMS header', () => {
test.use({ viewport: { width: 320, height: 750 } });

test('signed-in header keeps the language control on the right in both languages', async ({ page }, testInfo) => {
  await signInThai(page);
  const header = page.locator('header');
  await expect(header.getByRole('link', { name: /^(เปิดเว็บไซต์ในแท็บใหม่|View website in a new tab)$/ })).toHaveCount(0);
  const menu = header.locator('button[aria-haspopup="dialog"]');
  const language = headerLanguage(page);
  const avatar = header.locator('button[class*="avatar"]');
  await expect(avatar).toHaveAccessibleName(/.+/);
  const onSameRow = async () => {
    const menuBox = await menu.boundingBox();
    const languageBox = await language.boundingBox();
    const headerBox = await header.boundingBox();
    const avatarBox = await avatar.boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(languageBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(Math.abs(menuBox!.y + menuBox!.height / 2 - languageBox!.y - languageBox!.height / 2)).toBeLessThan(2);
    expect(languageBox!.x).toBeGreaterThan(menuBox!.x + menuBox!.width);
    expect(Math.abs(avatarBox!.y + avatarBox!.height / 2 - languageBox!.y - languageBox!.height / 2)).toBeLessThan(2);
    expect(languageBox!.x + languageBox!.width).toBeLessThanOrEqual(avatarBox!.x + 1);
    expect(headerBox!.x + headerBox!.width - avatarBox!.x - avatarBox!.width).toBeLessThan(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await onSameRow();
  await page.screenshot({ path: testInfo.outputPath('thai-header-narrow.png'), animations: 'disabled' });
  await menu.click();
  const thaiDrawer = page.getByRole('dialog', { name: cmsMainThai['CMS navigation'], exact: true });
  await expectDrawerSiteLink(thaiDrawer, 'th');
  await page.screenshot({ path: testInfo.outputPath('thai-navigation-narrow.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(thaiDrawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await language.click();
  await expect(language).toHaveText('EN');
  await onSameRow();
  await page.screenshot({ path: testInfo.outputPath('english-header-narrow.png'), animations: 'disabled' });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  await expectDrawerSiteLink(drawer, 'en');
  const accountLink = drawer.getByRole('button', { name: 'Settings', exact: true });
  await accountLink.scrollIntoViewIfNeeded();
  await expect(accountLink).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('english-navigation-narrow.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await expectStickyHeader(page);
});
});

test('Thai content form saves original enum values and both content languages unchanged', async ({ page, context, db }) => {
  await signInThai(page);
  await page.goto('/cms/fleet');
  await page.getByRole('button', { name: cmsMainThai['Add vessel'], exact: true }).click();
  const editor = page.getByRole('dialog', { name: cmsMainThai['Add vessel'], exact: true });
  await expect(editor.getByRole('combobox', { name: cmsFieldsThai['Content type'], exact: true })).toHaveCount(0);
  // Deliberately use a translated UI word as content: saved text must stay exact.
  const title = 'Save';
  const titleTh = 'เรือทดสอบจากระบบภาษาไทย';
  const summary = 'Original English vessel summary entered in the Thai interface.';
  const summaryTh = 'เนื้อหาภาษาไทยที่กรอกผ่านหน้าจัดการภาษาไทย';
  await (await showTextField(editor, cmsFieldsThai['Title · English'])).fill(title);
  await (await showTextField(editor, cmsFieldsThai['Title · Thai'])).fill(titleTh);
  await editor.getByLabel(`${cmsFieldsThai['Vessel type']} · ${cmsFieldsThai.English}`, { exact: true }).fill('Container');
  await editor.getByLabel(`${cmsFieldsThai['Vessel type']} · ${cmsFieldsThai.Thai}`, { exact: true }).fill('เรือตู้คอนเทนเนอร์');
  await editor.getByLabel(cmsFieldsThai['Summary · English'], { exact: true }).fill(summary);
  await editor.getByLabel(cmsFieldsThai['Summary · Thai'], { exact: true }).fill(summaryTh);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  const imageLabel = translateCms('th', 'Browse library for {label}', { label: translateCms('th', 'Main image') });
  await editor.getByRole('button', { name: imageLabel, exact: true }).click();
  const searchLabel = translateCms('th', 'Search library for {label}', { label: translateCms('th', 'Main image') });
  await editor.getByRole('searchbox', { name: searchLabel, exact: true }).fill(String(media!.title));
  await editor.getByRole('button', { name: media!.title, exact: true }).click();
  await editor.getByRole('button', { name: cmsMainThai.Save, exact: true }).click();
  await expect(editor).not.toBeVisible();
  const saved = await db.collection('moe_content').findOne({ title, type: 'Vessel' });
  expect(saved).toMatchObject({
    type: 'Vessel', title, titleTh, description: summary, descriptionTh: summaryTh,
    category: 'Container', categoryTh: 'เรือตู้คอนเทนเนอร์', status: 'Published', revision: 1,
  });
  const id = String(saved!.id);
  const publicPage = await context.newPage();
  await publicPage.goto(`/fleet/${id}`);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await publicPage.goto(`/th/fleet/${id}`);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(titleTh);
});
