import type { Locator, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { translateCms, type CmsLocale } from '../../src/lib/cms-locale';
import { test, expect, login } from './fixtures';

async function records(page: Page): Promise<ContentRecord[]> {
  const response = await page.request.get('/api/cms/content');
  expect(response.ok()).toBe(true);
  return (await response.json()).records;
}

async function showField(editor: Locator, label: string) {
  const field = editor.getByLabel(label, { exact: true });
  for (const panel of await field.locator('xpath=ancestor::details').all()) {
    if (!await panel.evaluate(element => element.hasAttribute('open'))) await panel.locator(':scope > summary').click();
  }
  return field;
}

async function openService(page: Page, service: ContentRecord) {
  await page.goto('/cms/services');
  await page.getByRole('button', { name: `Edit ${service.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit service', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

async function save(page: Page, editor: Locator): Promise<ContentRecord> {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/cms/content' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  await expect(editor).not.toBeVisible();
  return (await response.json()).record;
}

async function discard(page: Page, editor: Locator, locale: CmsLocale = 'en') {
  await editor.getByRole('button', { name: translateCms(locale, 'Cancel'), exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: translateCms(locale, 'Discard changes'), exact: true });
  await confirmation.getByRole('button', { name: translateCms(locale, 'Discard changes'), exact: true }).click();
  await expect(editor).not.toBeVisible();
}

test('Add service saves its selected icon through the real API and immediately shows it on the public service pages', async ({ page, db, context }, testInfo) => {
  await login(page);
  const media = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(media).not.toBeNull();
  await page.goto('/cms/services');
  await page.getByRole('button', { name: 'Add service', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add service', exact: true });
  const picker = editor.getByRole('group', { name: 'Service icon', exact: true });
  await expect(picker.getByRole('radio', { name: 'Ship', exact: true })).toBeChecked();
  for (const language of ['English', 'Thai']) {
    await (await showField(editor, `Title · ${language}`)).fill(language === 'English' ? 'Service with a communication icon' : 'บริการที่มีไอคอนการสื่อสาร');
    await editor.getByLabel(`Summary · ${language}`, { exact: true }).fill(language === 'English' ? 'A saved service with a selected icon.' : 'บริการที่บันทึกพร้อมไอคอนที่เลือก');
  }
  await picker.getByRole('radio', { name: 'Communication', exact: true }).check();
  await editor.getByRole('button', { name: 'Browse library for main image', exact: true }).click();
  await editor.getByRole('searchbox', { name: 'Search library for main image', exact: true }).fill(String(media!.title));
  await editor.getByRole('button', { name: String(media!.title), exact: true }).click();
  const saved = await save(page, editor);
  expect(saved).toMatchObject({ type: 'Service', icon: 'MessagesSquare', revision: 1 });
  expect(await db.collection('moe_content').findOne({ type: 'Service', id: saved.id })).toMatchObject({ icon: 'MessagesSquare' });

  const website = await context.newPage();
  await website.goto('/services');
  await expect(website.locator(`main a[href="/services/${saved.id}"] svg.lucide-messages-square`)).toBeVisible();
  const featured = website.locator('main a[class*="serviceFeature"]').first();
  await expect(featured.locator('[class*="capabilityHeading"] > svg')).toBeVisible();
  for (const width of [1280, 320]) {
    await website.setViewportSize({ width, height: 900 });
    await featured.screenshot({ path: testInfo.outputPath(`featured-service-${width}.png`), animations: 'disabled' });
    expect(await website.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await website.goto(`/services/${saved.id}`);
  await expect(website.locator('[class*="detailIcon"] svg.lucide-messages-square')).toBeVisible();
  await website.close();
});

test('Edit service keeps an unsaved icon out of the database and saves the same icon for the homepage, listing, and detail', async ({ page, db, context }) => {
  await login(page);
  const services = (await records(page)).filter(record => record.type === 'Service').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const before = services[1] ?? services[0];
  expect(before).toBeTruthy();
  const draftLabel = before.icon === 'MapPin' ? 'Anchor' : 'Location';
  const editor = await openService(page, before);
  await editor.getByRole('group', { name: 'Service icon', exact: true }).getByRole('radio', { name: draftLabel, exact: true }).check();
  expect((await records(page)).find(record => record.type === 'Service' && record.id === before.id)).toEqual(before);
  await discard(page, editor);
  expect(await db.collection('moe_content').findOne({ type: 'Service', id: before.id })).toMatchObject({ icon: before.icon });

  const reopened = await openService(page, before);
  const label = before.icon === 'MessagesSquare' ? 'Anchor' : 'Communication';
  const icon = label === 'Anchor' ? 'Anchor' : 'MessagesSquare';
  const cssIcon = label === 'Anchor' ? 'anchor' : 'messages-square';
  await reopened.getByRole('group', { name: 'Service icon', exact: true }).getByRole('radio', { name: label, exact: true }).check();
  const saved = await save(page, reopened);
  expect(saved).toMatchObject({ id: before.id, icon, revision: before.revision + 1 });
  for (const field of ['title', 'titleTh', 'description', 'descriptionTh', 'image', 'order', 'category', 'categoryTh'] as const) expect(saved[field]).toEqual(before[field]);
  const website = await context.newPage();
  for (const path of ['/', '/services']) {
    await website.goto(path);
    await expect(website.locator(`main a[href="/services/${saved.id}"] svg.lucide-${cssIcon}`)).toBeVisible();
  }
  await website.goto(`/services/${saved.id}`);
  await expect(website.locator(`[class*="detailIcon"] svg.lucide-${cssIcon}`)).toBeVisible();
  await website.close();
});

test('editing text preserves an unknown historical service icon until an editor explicitly replaces it', async ({ page, db }) => {
  const service = await db.collection('moe_content').findOne({ type: 'Service' });
  expect(service).not.toBeNull();
  await db.collection('moe_content').updateOne({ type: 'Service', id: service!.id }, { $set: { icon: 'HistoricalMarineMark' } });
  await login(page);
  const before = (await records(page)).find(record => record.type === 'Service' && record.id === service!.id)!;
  const editor = await openService(page, before);
  const picker = editor.getByRole('group', { name: 'Service icon', exact: true });
  await expect(picker.getByText('The current icon is kept until you choose a replacement.', { exact: true })).toBeVisible();
  await expect(picker.locator('input[type="radio"]:checked')).toHaveCount(0);
  await (await showField(editor, 'Title · English')).fill(`${before.title} retained`);
  const unchangedIcon = await save(page, editor);
  expect(unchangedIcon.icon).toBe('HistoricalMarineMark');

  const reopened = await openService(page, unchangedIcon);
  await reopened.getByRole('group', { name: 'Service icon', exact: true }).getByRole('radio', { name: 'Ship', exact: true }).check();
  expect((await records(page)).find(record => record.type === 'Service' && record.id === before.id)?.icon).toBe('HistoricalMarineMark');
  expect((await save(page, reopened)).icon).toBe('Ship');
});

test('the service icon picker supports keyboard selection and fits English desktop and Thai 320px layouts', async ({ page }, testInfo) => {
  await login(page);
  for (const [locale, width] of [['en', 1280], ['th', 320]] as const) {
    if (locale === 'th') await page.locator('header [data-cms-language-switch]').click();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cms/services');
    await page.getByRole('button', { name: translateCms(locale, 'Add service'), exact: true }).click();
    const editor = page.getByRole('dialog', { name: translateCms(locale, 'Add service'), exact: true });
    const picker = editor.getByRole('group', { name: translateCms(locale, 'Service icon'), exact: true });
    await expect(picker.getByRole('radio')).toHaveCount(9);
    const ship = picker.getByRole('radio', { name: translateCms(locale, 'Ship'), exact: true });
    await ship.focus();
    await ship.press('ArrowRight');
    const fuel = picker.getByRole('radio', { name: translateCms(locale, 'Fuel'), exact: true });
    await expect(fuel).toBeFocused();
    await expect(fuel).toBeChecked();
    await expect.poll(() => picker.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => editor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await picker.screenshot({ path: testInfo.outputPath(`service-icons-${locale}-${width}.png`), animations: 'disabled' });
    await page.screenshot({ path: testInfo.outputPath(`service-icon-editor-${locale}-${width}.png`), animations: 'disabled' });
    await discard(page, editor, locale);
  }
});
