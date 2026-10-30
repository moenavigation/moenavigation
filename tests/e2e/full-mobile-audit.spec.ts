import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import type { Db } from 'mongodb';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_BUFFER, loginChallengeData } from './fixtures';
import { translateCms } from '../../src/lib/cms-locale';
import type { CmsRole } from '../../src/lib/cms-roles';

type Locale = 'en' | 'th';
const sizes = [
  { name: '320 portrait', width: 320, height: 740 },
  { name: '360 portrait', width: 360, height: 800 },
  { name: '390 portrait', width: 390, height: 844 },
  { name: '430 portrait', width: 430, height: 932 },
  { name: '844 landscape', width: 844, height: 390 },
] as const;
const locales: Locale[] = ['en', 'th'];
const dialogSizes = [{ name: '360 short portrait', width: 360, height: 640 }, { name: '844 landscape', width: 844, height: 390 }];
const cmsRoutes = ['', 'pages', 'fleet', 'routes', 'projects', 'services', 'news', 'media', 'enquiries', 'users', 'trash', 'setting', 'logs', 'usage'];

function translator(locale: Locale) {
  return (text: string, params?: Record<string, string | number>) => translateCms(locale, text, params);
}

async function noOverflow(page: Page, container?: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `Horizontal overflow: ${page.url()}` }).toBeLessThanOrEqual(1);
  if (container) {
    await expect.poll(() => container.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    // Native drawers enter with a transform. data-phase="open" starts that
    // transition; wait for their actual onscreen geometry before measuring.
    await expect.poll(async () => {
      const box = await container.boundingBox();
      if (!box) return Number.POSITIVE_INFINITY;
      const viewport = page.viewportSize()!;
      return Math.max(-box.x, -box.y, box.x + box.width - viewport.width, box.y + box.height - viewport.height);
    }).toBeLessThanOrEqual(1);
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
}

async function touchTarget(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  // IntersectionObserver can report slightly below1 for a subpixel edge even
  // after native scrolling. Keep explicit one-pixel bounds and the hit check.
  await expect(locator).toBeInViewport({ ratio: 0.98 });
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = locator.page().viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box!.height).toBeGreaterThanOrEqual(43);
  expect(box!.width).toBeGreaterThanOrEqual(43);
  // Detect clipping by a sticky header or a sibling, not merely root overflow.
  expect(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(hit && (element === hit || element.contains(hit)));
  })).toBe(true);
}

async function trapFocus(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]').filter({ visible: true });
  const first = controls.first();
  const last = controls.last();
  await last.focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
}

async function openDialog(page: Page, opener: Locator, title: string, locale: Locale, pointer: 'touch' | 'mouse' = 'touch') {
  // Safari does not focus every clicked/tapped button. Keep a different control
  // focused first so returning to a stale activeElement is observable.
  await page.getByRole('button', { name: translator(locale)('Open CMS navigation'), exact: true }).focus();
  await touchTarget(opener);
  if (pointer === 'mouse') await opener.click();
  else await opener.tap();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await noOverflow(page, dialog);
  await expect(dialog.locator('[data-cms-language-switch]')).toHaveCount(0);
  await trapFocus(page, dialog);
  return dialog;
}

async function escapeDialog(page: Page, dialog: Locator, opener: Locator) {
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
}

async function backdropScrollStaysLocked(page: Page, dialog: Locator) {
  const position = await page.evaluate(() => ({ y: window.scrollY, maxY: document.documentElement.scrollHeight - window.innerHeight }));
  expect(position.maxY, 'The Users page underneath must genuinely be scrollable.').toBeGreaterThan(100);
  const delta = position.y < position.maxY / 2 ? 400 : -400;
  const bounds = await dialog.boundingBox();
  expect(bounds!.x, 'Leave an actual backdrop strip to test.').toBeGreaterThan(2);
  const point = { x: bounds!.x / 2, y: page.viewportSize()!.height / 2 };
  // Sample frames across native wheel processing, including smooth scrolling.
  // An immediate assertion can falsely pass before the wheel reaches the page.
  const recording = await page.evaluateHandle(() => {
    const positions: number[] = [];
    let resolve!: (values: number[]) => void;
    const finished = new Promise<number[]>(done => { resolve = done; });
    const start = performance.now();
    const sample = (time: number) => {
      positions.push(window.scrollY);
      if (time - start >= 500) resolve(positions);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return { finished };
  });
  try {
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, delta);
    const positions = await recording.evaluate(async recorder => recorder.finished);
    expect.soft(Math.max(...positions.map(value => Math.abs(value - position.y))), 'A wheel gesture over the modal backdrop must not move the Users page.').toBeLessThanOrEqual(1);
  } finally { await recording.dispose(); }
  return async () => {
    const current = await page.evaluate(() => ({ y: window.scrollY, maxY: document.documentElement.scrollHeight - window.innerHeight }));
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, current.y < current.maxY / 2 ? 400 : -400);
    await expect.poll(() => page.evaluate(value => Math.abs(window.scrollY - value), current.y), { message: 'Closing User settings must restore background scrolling.' }).toBeGreaterThan(1);
  };
}

async function signIn(page: Page, db: Db, role: CmsRole, locale: Locale) {
  type Account = { _id: string; username: string; passwordHash: string; passwordVersion: number; role?: CmsRole; createdAt: Date; deletedAt?: Date; purgeAt?: Date };
  const users = db.collection<Account>('moe_users');
  const original = await users.findOne({ _id: E2E_ADMIN.id });
  expect(original).not.toBeNull();
  await users.updateOne({ _id: E2E_ADMIN.id }, { $set: { role } });
  await users.insertMany((['Dev', 'Admin', 'Operator'] as const).map(targetRole => ({ ...original!, _id: randomUUID(), username: `mobile-${targetRole.toLowerCase()}`, role: targetRole })));
  const trashedUserId = randomUUID();
  const deletedAt = new Date();
  const purgeAt = new Date(Date.now() + 30 * 86400_000);
  await users.insertOne({ ...original!, _id: trashedUserId, username: 'mobile-trashed-dev', role: 'Dev', deletedAt, purgeAt });
  type FixtureDocument = { _id: string; [key: string]: unknown };
  const content = db.collection<FixtureDocument>('moe_content');
  const news = await content.findOne({ type: 'News' });
  expect(news).not.toBeNull();
  await content.insertOne({ ...news!, _id: 'News:mobile-trash-news', id: 'mobile-trash-news', title: 'Mobile trash news', titleTh: 'ข่าวทดสอบในถังขยะ', deletedAt: deletedAt.toISOString(), purgeAt });
  const media = db.collection<FixtureDocument>('moe_media');
  const sourceImage = await media.findOne({ state: 'committed' });
  expect(sourceImage).not.toBeNull();
  await media.insertMany(Array.from({ length: 13 }, (_, index) => {
    const id = `mobile-image-${index}`;
    return { ...sourceImage!, _id: id, id, title: `ภาพทดสอบมือถือ-${index}-a-long-image-name-without-spaces-for-the-mobile-library.png`, url: `${String(sourceImage!.url)}?mobile=${index}`, createdAt: new Date().toISOString() };
  }));
  await page.addInitScript(value => localStorage.setItem('moe-cms-language', value), locale);
  const response = await page.request.post('/api/cms/login', { headers: { Origin: E2E_BASE_URL }, data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) } });
  expect(response.ok()).toBe(true);
  await page.goto('/cms');
  await expect(page.getByRole('heading', { name: translator(locale)('Dashboard'), exact: true })).toBeVisible();
  return { trashedUserId };
}

async function headerAlignment(page: Page, locale: Locale) {
  const navigation = page.getByRole('button', { name: translator(locale)('Open CMS navigation'), exact: true });
  await touchTarget(navigation);
  const header = navigation.locator('xpath=ancestor::header[1]');
  const language = header.locator('[data-cms-language-switch]');
  const profile = header.getByRole('button').last();
  await touchTarget(language);
  await touchTarget(profile);
  const languageBox = await language.boundingBox();
  const profileBox = await profile.boundingBox();
  expect(profileBox!.x).toBeGreaterThanOrEqual(languageBox!.x + languageBox!.width - 1);
  expect(Math.abs(languageBox!.y + languageBox!.height / 2 - profileBox!.y - profileBox!.height / 2)).toBeLessThanOrEqual(2);
  expect(profileBox!.x + profileBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.describe('Expanded public mobile coverage', () => {
  test.use({ hasTouch: true });
  for (const locale of locales) for (const size of sizes.filter(size => [320, 390, 430, 844].includes(size.width))) {
    test.describe(() => {
      test.use({ viewport: { width: size.width, height: size.height } });
      test.skip(({ browserName }) => browserName !== 'chromium' && ![430, 844].includes(size.width), 'The narrow route sweep runs once; portrait and landscape touch navigation run across engines.');
      test(`${locale} ${size.name}: public pages, details and drawer`, async ({ page, db, browserName }) => {
        test.setTimeout(120_000);
        const records = await db.collection<{ id: string; type: string }>('moe_content').find({ type: 'Page', deletedAt: { $exists: false } }).project<{ id: string }>({ id: 1, _id: 0 }).toArray();
        const paths = records.map(record => record.id === 'home' ? '' : record.id);
        for (const [type, base] of [['Vessel', 'fleet'], ['Service', 'services'], ['Project', 'projects'], ['News', 'news']]) {
          const record = await db.collection<{ id: string; type: string }>('moe_content').findOne({ type, deletedAt: { $exists: false } }, { projection: { id: 1 } });
          expect(record).not.toBeNull();
          paths.push(`${base}/${record!.id}`);
        }
        const coveredPaths = size.width === 430 ? paths.filter(path => ['', 'fleet', 'contact'].includes(path) || path.startsWith('fleet/')) : paths;
        for (const path of coveredPaths) await test.step(path || 'Home', async () => {
          const response = await page.goto(`${locale === 'th' ? '/th' : ''}/${path}`);
          expect(response?.status()).toBe(200);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await noOverflow(page);
        });
        await page.goto(locale === 'th' ? '/th' : '/');
        const opener = page.getByRole('button', { name: locale === 'th' ? 'เปิดเมนู' : 'Open menu', exact: true });
        await touchTarget(opener);
        await opener.tap();
        const drawer = page.getByRole('dialog', { name: locale === 'th' ? 'เมนู' : 'Menu', exact: true });
        await expect(drawer).toBeVisible();
        await expect(drawer).toHaveAttribute('data-phase', 'open');
        await noOverflow(page, drawer);
        await trapFocus(page, drawer);
        const links = drawer.getByRole('link');
        await links.last().scrollIntoViewIfNeeded();
        await expect(links.last()).toBeInViewport({ ratio: 0.98 });
        await escapeDialog(page, drawer, opener);
        await opener.tap();
        await drawer.locator(`a[href="${locale === 'th' ? '/th' : ''}/services"]`).tap();
        await expect(page).toHaveURL(/\/services$/);
        await expect(drawer).not.toBeVisible();
        await page.goBack();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await noOverflow(page);
        // The bundled Firefox driver stalls on a live viewport resize with
        // hasTouch. Its independent static 844x390 cases above retain every
        // route, drawer, native-touch, geometry and focus assertion. Chromium
        // and WebKit additionally exercise the live portrait-to-landscape move.
        if (size.width === 430 && browserName !== 'firefox') {
          await page.setViewportSize({ width: 844, height: 390 });
          await opener.tap();
          await expect(drawer).toHaveAttribute('data-phase', 'open');
          await noOverflow(page, drawer);
          await links.last().scrollIntoViewIfNeeded();
          await expect(links.last()).toBeInViewport({ ratio: 0.98 });
          await escapeDialog(page, drawer, opener);
        }
      });
    });
  }
});

test.describe('Expanded CMS mobile coverage', () => {
  test.use({ hasTouch: true });
  // Broad route/role sweeps run once in Chromium. Other engines exercise the
  // real-touch long-dialog boundaries below instead of repeating every route.
  for (const role of ['Admin', 'Dev', 'Operator'] as const) for (const locale of locales) for (const size of sizes.filter(size => [320, 390].includes(size.width) || role === 'Admin' && size.width === 430)) {
    test.describe(() => {
      test.use({ viewport: { width: size.width, height: size.height } });
      test.skip(({ browserName }) => browserName !== 'chromium', 'Shared route/role geometry is covered once; touch dialogs are checked across engines.');
      test(`${role} ${locale} ${size.name}: CMS screens, navigation and role controls`, async ({ page, db }) => {
        test.setTimeout(120_000);
        const { trashedUserId } = await signIn(page, db, role, locale);
        const t = translator(locale);
        const coveredRoutes = size.width === 430 ? ['media', 'users', 'trash', 'usage'] : cmsRoutes;
        for (const route of coveredRoutes) await test.step(route || 'Dashboard', async () => {
          await page.goto(`/cms${route ? '/' + route : ''}`);
          await expect(page.locator('main')).toBeVisible();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await noOverflow(page);
          await headerAlignment(page, locale);
        });
        await page.goto('/cms/users');
        const list = page.getByRole('region', { name: t('Users'), exact: true });
        await expect(list.getByText(E2E_ADMIN.username, { exact: true })).toBeVisible();
        const current = list.getByRole('listitem').filter({ has: page.getByText(E2E_ADMIN.username, { exact: true }) });
        await expect(current.getByRole('button', { name: t('Move {name} to Trash', { name: E2E_ADMIN.username }), exact: true })).toHaveCount(0);
        for (const targetRole of ['Dev', 'Admin', 'Operator'] as const) {
          const name = `mobile-${targetRole.toLowerCase()}`;
          const row = list.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });
          const edit = row.getByRole('button', { name: t('Edit {name}', { name }), exact: true });
          if (role === 'Dev' || role === 'Admin' && targetRole !== 'Dev') {
            await expect(edit).toBeVisible();
            await touchTarget(edit);
          } else await expect(edit).toHaveCount(0);
        }
        const settingsOpener = current.getByRole('button', { name: t('User settings'), exact: true });
        const settings = await openDialog(page, settingsOpener, t('User settings'), locale);
        await touchTarget(settings.getByRole('button', { name: t('Update password'), exact: true }));
        const nestedPhotoOpener = settings.getByRole('button', { name: t('Change profile photo'), exact: true });
        await nestedPhotoOpener.tap();
        const nestedPhoto = page.getByRole('dialog', { name: t('Profile photo'), exact: true });
        await expect(nestedPhoto).toBeVisible();
        await noOverflow(page, nestedPhoto);
        await trapFocus(page, nestedPhoto);
        await escapeDialog(page, nestedPhoto, nestedPhotoOpener);
        await expect(settings).toBeVisible();
        await escapeDialog(page, settings, settingsOpener);
        const photoOpener = current.getByRole('button', { name: t('Change profile photo for {name}', { name: E2E_ADMIN.username }), exact: true });
        const photo = await openDialog(page, photoOpener, t('Profile photo'), locale);
        await photo.getByRole('button', { name: t('Browse library'), exact: true }).tap();
        await expect(photo.locator('[data-profile-image]').first()).toBeVisible();
        await expect(photo.locator('[data-profile-image]')).toHaveCount(12);
        const firstImage = await photo.locator('[data-profile-image]').first().textContent();
        await photo.getByRole('button', { name: t('Next images'), exact: true }).tap();
        await expect(photo.locator('[data-profile-image]').first()).not.toHaveText(firstImage!);
        await photo.getByRole('button', { name: t('Previous images'), exact: true }).tap();
        await expect(photo.locator('[data-profile-image]').first()).toHaveText(firstImage!);
        await noOverflow(page, photo);
        await touchTarget(photo.getByRole('button', { name: t('Cancel'), exact: true }));
        await escapeDialog(page, photo, photoOpener);
        const navigation = page.getByRole('button', { name: t('Open CMS navigation'), exact: true });
        await navigation.tap();
        const drawer = page.getByRole('dialog', { name: t('CMS navigation'), exact: true });
        await expect(drawer).toHaveAttribute('data-phase', 'open');
        await noOverflow(page, drawer);
        await trapFocus(page, drawer);
        const usage = drawer.getByRole('button', { name: t('Data usage'), exact: true });
        if (role === 'Operator') await expect(usage).toHaveCount(0);
        else { await usage.scrollIntoViewIfNeeded(); await expect(usage).toBeInViewport({ ratio: 0.98 }); }
        await touchTarget(drawer.getByRole('button', { name: t('Close CMS navigation'), exact: true }));
        await escapeDialog(page, drawer, navigation);
        await page.screenshot({ path: test.info().outputPath('users-mobile.png'), fullPage: true });
        await page.goto('/cms/trash');
        const newsRow = page.locator('[data-trash-key="News:mobile-trash-news"]');
        const title = locale === 'th' ? 'ข่าวทดสอบในถังขยะ' : 'Mobile trash news';
        await expect(newsRow.getByRole('button', { name: t('Restore {name}', { name: title }), exact: true })).toBeVisible();
        const permanent = newsRow.getByRole('button', { name: t('Delete {name} permanently', { name: title }), exact: true });
        const userRow = page.locator(`[data-trash-key="User:${trashedUserId}"]`);
        if (role === 'Operator') {
          await expect(permanent).toHaveCount(0);
          await expect(userRow).toHaveCount(0);
        } else {
          const confirmation = await openDialog(page, permanent, t('Delete permanently'), locale);
          await touchTarget(confirmation.getByRole('button', { name: t('Cancel'), exact: true }));
          await escapeDialog(page, confirmation, permanent);
          await expect(userRow).toBeVisible();
          if (role === 'Admin') await expect(userRow.getByRole('button')).toHaveCount(0);
          else {
            const restoreUser = userRow.getByRole('button', { name: t('Restore {name}', { name: 'mobile-trashed-dev' }), exact: true });
            const restoreDialog = await openDialog(page, restoreUser, t('Restore user'), locale);
            await expect(restoreDialog.getByLabel(t('Your current password'), { exact: true })).toBeVisible();
            await touchTarget(restoreDialog.getByRole('button', { name: t('Cancel'), exact: true }));
            await escapeDialog(page, restoreDialog, restoreUser);
          }
        }
        await noOverflow(page);
      });
    });
  }

  for (const locale of locales) for (const size of dialogSizes) {
    test.describe(() => {
      test.use({ viewport: { width: size.width, height: size.height } });
      test(`${locale} ${size.name}: content, image, inbox and Trash dialog focus and scroll`, async ({ page, db }) => {
        test.setTimeout(120_000);
        await signIn(page, db, 'Admin', locale);
        const t = translator(locale);
        await test.step('User settings locks and restores backdrop scrolling', async () => {
          await page.goto('/cms/users');
          const opener = page.getByRole('button', { name: t('User settings'), exact: true });
          const dialog = await openDialog(page, opener, t('User settings'), locale);
          const expectScrollRestored = await backdropScrollStaysLocked(page, dialog);
          await escapeDialog(page, dialog, opener);
          await expectScrollRestored();
        });
        for (const [route, label] of [['fleet', 'vessel'], ['routes', 'route'], ['projects', 'project'], ['services', 'service'], ['news', 'news']]) await test.step(`Add ${label}`, async () => {
          await page.goto(`/cms/${route}`);
          const opener = page.getByRole('button', { name: t(`Add ${label}`), exact: true });
          const dialog = await openDialog(page, opener, t(`Add ${label}`), locale);
          const details = dialog.locator('details');
          for (const group of await details.all()) if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').tap();
          await noOverflow(page, dialog);
          const library = dialog.getByRole('button', { name: t('Browse library for {label}', { label: t('Main image').toLocaleLowerCase(locale) }), exact: true });
          await library.tap();
          await expect(dialog.locator('[class*="imagePicker"] > button')).toHaveCount(12);
          await noOverflow(page, dialog);
          if (route === 'fleet') {
            const choices = dialog.locator('[class*="imagePicker"] > button');
            const firstImage = await choices.first().textContent();
            await dialog.getByRole('button', { name: t('Next images'), exact: true }).tap();
            await expect(choices.first()).not.toHaveText(firstImage!);
            await dialog.getByRole('button', { name: t('Previous images'), exact: true }).tap();
            await expect(choices.first()).toHaveText(firstImage!);
          }
          const save = dialog.getByRole('button', { name: t('Save'), exact: true });
          await touchTarget(save);
          await escapeDialog(page, dialog, opener);
          if (route === 'fleet') {
            const pointerDialog = await openDialog(page, opener, t('Add vessel'), locale, 'mouse');
            await escapeDialog(page, pointerDialog, opener);
          }
        });
        await page.goto('/cms/pages?page=home');
        const editOpener = page.getByRole('button', { name: t('Edit {name}', { name: t('Page introduction') }), exact: true });
        const editor = await openDialog(page, editOpener, t('Edit content'), locale);
        await touchTarget(editor.getByRole('button', { name: t('Save'), exact: true }));
        await escapeDialog(page, editor, editOpener);
        await page.goto('/cms/news');
        const trashOpener = page.locator('[class*="actionCell"] button[aria-label]').last();
        const confirm = await openDialog(page, trashOpener, t('Move to Trash?'), locale);
        await touchTarget(confirm.getByRole('button', { name: t('Move to Trash'), exact: true }));
        await escapeDialog(page, confirm, trashOpener);
        await page.goto('/cms/media');
        const uploadOpener = page.getByRole('button', { name: t('Add an image'), exact: true });
        const upload = await openDialog(page, uploadOpener, t('Add an image'), locale);
        await upload.getByLabel(t('Choose media library image'), { exact: true }).setInputFiles({ name: 'mobile-prepared-image.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
        await expect(upload.getByRole('button', { name: t('Save image'), exact: true })).toBeEnabled();
        await touchTarget(upload.getByRole('button', { name: t('Save image'), exact: true }));
        await noOverflow(page, upload);
        await escapeDialog(page, upload, uploadOpener);
        const usageOpener = page.locator('[class*="mediaCardActions"] button').first();
        const usage = await openDialog(page, usageOpener, t('Where this image is used'), locale);
        await expect(usage.locator('img').first()).toBeVisible();
        await noOverflow(page, usage);
        await escapeDialog(page, usage, usageOpener);
        await page.goto('/cms/enquiries');
        const enquiryOpener = page.locator('[class*="enquiryRow"]').first();
        const enquiry = await openDialog(page, enquiryOpener, t('Enquiry details'), locale);
        await enquiry.getByRole('link', { name: t('Reply by email'), exact: true }).scrollIntoViewIfNeeded();
        await expect(enquiry.getByRole('link', { name: t('Reply by email'), exact: true })).toBeInViewport({ ratio: 0.98 });
        await escapeDialog(page, enquiry, enquiryOpener);
        await page.goto('/cms/trash');
        const filterOpener = page.getByRole('button', { name: t('Filter Trash'), exact: true });
        const filter = await openDialog(page, filterOpener, t('Filter Trash'), locale);
        await filter.getByRole('radio', { name: t('User accounts'), exact: true }).scrollIntoViewIfNeeded();
        await expect(filter.getByRole('radio', { name: t('User accounts'), exact: true })).toBeInViewport({ ratio: 0.98 });
        await touchTarget(filter.getByRole('button', { name: t('Apply filters'), exact: true }));
        await escapeDialog(page, filter, filterOpener);
        await page.goto('/cms/usage');
        for (const title of ['Monitoring limits', 'Update Vercel reading']) {
          const opener = page.getByRole('button', { name: t(title), exact: true });
          const dialog = await openDialog(page, opener, t(title), locale);
          await touchTarget(dialog.getByRole('button', { name: t('Cancel'), exact: true }));
          await escapeDialog(page, dialog, opener);
        }
      });
    });
  }
});

test.describe('Native touch login challenge', () => {
  test.use({ hasTouch: true });
  for (const locale of locales) for (const size of dialogSizes) {
    test.describe(() => {
      test.use({ viewport: { width: size.width, height: size.height } });
      test(`${locale} ${size.name}: releasing an aligned native touch submits login`, async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('moe-cms-language', value), locale);
        const t = translator(locale);
        const submitted: number[] = [];
        await page.route('**/api/cms/login', async route => {
          submitted.push(route.request().postDataJSON().challengePosition);
          await route.fulfill({ status: 401, json: { error: 'The username or password is incorrect.' } });
        });
        await page.goto('/cms');
        await page.getByLabel(t('Username'), { exact: true }).fill('mobile-touch-test');
        await page.getByLabel(t('Password'), { exact: true }).fill('Synthetic-touch-check-only');
        const signIn = page.getByRole('button', { name: t('Sign in'), exact: true });
        await touchTarget(signIn);
        await signIn.tap();
        const dialog = page.getByRole('dialog');
        const slider = dialog.locator('input[type="range"]');
        await expect(slider).toBeEnabled();
        await expect(dialog.locator('[class*="loginPuzzleVerify"]')).toHaveCount(0);
        await noOverflow(page, dialog);
        const target = Number.parseFloat(await dialog.locator('[class*="loginPuzzleTarget"]').evaluate(element => (element as HTMLElement).style.left)) / .8;
        async function tapTrack(value: number) {
          await touchTarget(slider);
          const track = await slider.boundingBox();
          const thumbWidth = await slider.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.2);
          const x = track!.x + thumbWidth / 2 + (track!.width - thumbWidth) * value / 100;
          await page.touchscreen.tap(x, track!.y + track!.height / 2);
        }
        await tapTrack(target >= 50 ? 10 : 90);
        expect(submitted).toHaveLength(0);
        await expect(dialog).toBeVisible();
        await tapTrack(target);
        await expect.poll(() => submitted.length).toBe(1);
        expect(Number.isInteger(submitted[0])).toBe(true);
        expect(Math.abs(submitted[0] - target)).toBeLessThanOrEqual(3);
        await expect(dialog).not.toBeVisible();
        await noOverflow(page);
      });
    });
  }
});
