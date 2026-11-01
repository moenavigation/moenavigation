import { randomUUID } from 'node:crypto';
import type { Locator, Page, Route } from '@playwright/test';
import type { ContentRecord } from '../../src/lib/cms-types';
import { translateCms } from '../../src/lib/cms-locale';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from './fixtures';

const panelSelector = '[data-working-panel]';
const origin = { Origin: E2E_BASE_URL };

// Keep the operation pending until its progress UI has been checked. The timer
// only releases a failed test's intercept so cleanup cannot strand the runner.
async function holdAction(page: Page, pathname: string, method: string, reply?: (route: Route) => Promise<void>) {
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const active = new Set<Promise<void>>();
  let requests = 0;
  const timeout = setTimeout(() => release(), 25_000);
  const resume = () => { clearTimeout(timeout); release(); };
  const match = (url: URL) => url.pathname === pathname;
  const handler = (route: Route) => {
    const operation = (async () => {
      if (route.request().method() !== method) return route.continue();
      requests++;
      await released;
      if (reply) await reply(route); else await route.continue();
    })().finally(() => { active.delete(operation); });
    active.add(operation);
    return operation;
  };
  await page.route(match, handler);
  return {
    release: resume,
    started: () => expect.poll(() => requests).toBeGreaterThan(0),
    count: () => requests,
    dispose: async () => {
      resume();
      while (active.size) await Promise.all([...active]);
      await page.unroute(match, handler);
    },
  };
}

async function showField(editor: Locator, label: string) {
  const field = editor.getByLabel(label, { exact: true });
  for (const group of await field.locator('xpath=ancestor::details').all()) {
    if (!await group.evaluate(element => element.hasAttribute('open'))) await group.locator(':scope > summary').click();
  }
  return field;
}

async function editVessel(page: Page) {
  await login(page);
  const result = await page.request.get('/api/cms/content');
  const record = ((await result.json()).records as ContentRecord[]).find(item => item.type === 'Vessel' && !item.deletedAt)!;
  expect(record).toBeTruthy();
  await page.goto('/cms/fleet');
  await page.getByRole('button', { name: `Edit ${record.title}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit vessel', exact: true });
  await expect(editor).toBeVisible();
  return { editor, record };
}

test('a slow save remains visible beyond notification timers and a failure preserves the editor', async ({ page, db }, testInfo) => {
  const { editor, record } = await editVessel(page);
  const replacement = 'Draft retained after slow save';
  await (await showField(editor, 'Title · English')).fill(replacement);
  const save = editor.locator('button[type="submit"]');
  const operation = await holdAction(page, '/api/cms/content', 'POST', route => route.fulfill({ status: 503, json: { error: 'Synthetic slow save unavailable' } }));
  await page.clock.install();
  try {
    await save.click();
    await operation.started();
    const working = editor.locator(panelSelector);
    await expect(working).toBeVisible();
    await expect(working).toContainText('Saving content…');
    await expect(page.locator(`${panelSelector}:visible`)).toHaveCount(1);
    await expect(save).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await editor.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    expect(operation.count()).toBe(1);
    await page.clock.fastForward(11_000);
    await expect(working).toBeVisible();
    await expect(working).toHaveAttribute('data-working-state', 'extended');
    await expect(working).not.toContainText(/\d+\s*%/);
    await expect(working.locator('[aria-valuenow]')).toHaveCount(0);
    await working.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('content-save-working.png') });
  } finally { await operation.dispose(); }
  await expect(editor.locator(panelSelector)).toHaveCount(0);
  await expect(editor.getByRole('alert')).toContainText('Synthetic slow save unavailable');
  await expect(editor.getByLabel('Title · English', { exact: true })).toHaveValue(replacement);
  await expect(save).toBeEnabled();
  expect((await db.collection('moe_content').findOne({ type: 'Vessel', id: record.id }))?.title).toBe(record.title);
});

test('image upload changes into final-save progress without duplicate uploads or losing the prepared image', async ({ page, db }) => {
  const { editor, record } = await editVessel(page);
  const mediaId = randomUUID();
  const url = `${E2E_IMAGE_ORIGIN}v1/${mediaId}.png`;
  const upload = await holdAction(page, '/api/cms/media', 'POST', async route => {
    const body = route.request().postDataBuffer();
    expect(body).not.toBeNull();
    const form = await new Response(new Uint8Array(body!), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
    const file = form.get('file') as File;
    const submissionId = String(form.get('submissionId'));
    const media = { id: mediaId, title: file.name, url, publicId: `moe-e2e/${mediaId}`, state: 'staged', owner: E2E_ADMIN.id, submissionId, pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date() };
    await db.collection<{ _id: string }>('moe_media').insertOne({ _id: mediaId, ...media });
    await route.fulfill({ status: 201, json: { media } });
  });
  const save = await holdAction(page, '/api/cms/content', 'POST');
  try {
    await editor.getByLabel('Choose main image', { exact: true }).setInputFiles({ name: 'working-image.png', mimeType: 'image/png', buffer: E2E_IMAGE_BUFFER });
    await expect(editor.getByText('Ready to upload', { exact: true })).toBeVisible();
    expect(upload.count()).toBe(0);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await upload.started();
    const working = editor.locator(panelSelector);
    await expect(working).toBeVisible();
    await expect(working).toContainText('Uploading image 1 of 1…');
    await expect(editor.locator('button[type="submit"]')).toBeDisabled();
    expect(save.count()).toBe(0);
    upload.release();
    await save.started();
    await expect(working).toContainText('Saving content…');
    await expect(page.locator(`${panelSelector}:visible`)).toHaveCount(1);
    expect(upload.count()).toBe(1);
    save.release();
    await expect(editor).not.toBeVisible();
    await expect(page.locator(panelSelector)).toHaveCount(0);
    expect((await db.collection('moe_content').findOne({ type: 'Vessel', id: record.id }))?.image).toBe(url);
    expect(await db.collection<{ _id: string }>('moe_media').countDocuments({ _id: mediaId, state: 'committed' })).toBe(1);
  } finally { await upload.dispose(); await save.dispose(); }
});

test('slow Trash restoration has one visible on-page panel and finishes with the item restored', async ({ page, db }) => {
  await login(page);
  const response = await page.request.get('/api/cms/content');
  const record = ((await response.json()).records as ContentRecord[]).find(item => item.type === 'News' && !item.deletedAt)!;
  const moved = await page.request.post('/api/cms/content/action', { headers: origin, data: { id: record.id, type: record.type, expectedRevision: record.revision, action: 'trash' } });
  expect(moved.ok()).toBe(true);
  await page.goto('/cms/trash?kind=News');
  const row = page.locator(`[data-trash-key="News:${record.id}"]`);
  await expect(row).toBeVisible();
  const restore = await holdAction(page, '/api/cms/content/action', 'POST');
  try {
    await row.getByRole('button', { name: `Restore ${record.title}`, exact: true }).click();
    await restore.started();
    await expect(page.locator(`${panelSelector}:visible`)).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Trash items', exact: true }).locator(panelSelector)).toBeVisible();
    await expect(row.getByRole('button', { name: `Restore ${record.title}`, exact: true })).toBeDisabled();
    expect((await db.collection('moe_content').findOne({ type: record.type, id: record.id }))?.deletedAt).toBeTruthy();
  } finally { await restore.dispose(); }
  await expect(row).toHaveCount(0);
  await expect(page.locator(panelSelector)).toHaveCount(0);
  expect((await db.collection('moe_content').findOne({ type: record.type, id: record.id }))?.deletedAt).toBeUndefined();
});

test('Thai mobile recipient saves show reduced-motion progress inside their dialog', async ({ page }, testInfo) => {
  const t = (text: string) => translateCms('th', text);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.evaluate(() => localStorage.setItem('moe-cms-language', 'th'));
  await page.goto('/cms/enquiries');
  await page.getByRole('button', { name: t('Notification recipients'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: t('Notification recipients'), exact: true });
  await dialog.getByRole('button', { name: t('Add email'), exact: true }).click();
  await dialog.getByRole('textbox').fill('working-recipient@example.test');
  const saving = await holdAction(page, '/api/cms/email/recipients', 'PUT');
  try {
    await dialog.getByRole('button', { name: t('Save changes'), exact: true }).click();
    await saving.started();
    const working = dialog.locator(panelSelector);
    await expect(working).toBeVisible();
    await expect(working).toContainText(t('Saving…'));
    await expect(page.locator(`${panelSelector}:visible`)).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: t('Cancel'), exact: true })).toBeDisabled();
    await expect(dialog.getByRole('textbox')).toHaveValue('working-recipient@example.test');
    expect(await working.evaluate(element => [element, ...element.querySelectorAll('*')].every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(working).toBeInViewport({ ratio: .95 });
    await working.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('working-recipient-th-mobile.png') });
  } finally { await saving.dispose(); }
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(panelSelector)).toHaveCount(0);
});

test.describe('mobile public actions', () => {
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test('public contact progress protects a pending message and clears after failure or success', async ({ page }, testInfo) => {
  await page.goto('/contact');
  const form = page.locator('#contact-form');
  await form.locator('#contact-name').fill('Working visitor');
  await form.locator('#contact-email').fill('working-visitor@example.test');
  await form.locator('#contact-subject').fill('Long action enquiry');
  const message = 'Please share your shipping routes and available services.';
  await form.locator('#contact-message').fill(message);
  await form.locator('#contact-consent').check();
  const pending = await holdAction(page, '/api/contact', 'POST', route => route.fulfill({ status: 503, json: { error: 'Synthetic contact unavailable' } }));
  try {
    await form.getByRole('button', { name: 'Send enquiry', exact: true }).click();
    await pending.started();
    const working = page.locator(panelSelector);
    await expect(working).toBeVisible();
    await expect(form).toHaveAttribute('aria-busy', 'true');
    await expect(form.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
    await expect(form.locator('#contact-message')).toHaveValue(message);
    await form.evaluate((element: HTMLFormElement) => { element.requestSubmit(); element.requestSubmit(); });
    expect(pending.count()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(working).toBeInViewport({ ratio: .95 });
    await working.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('contact-working-mobile.png') });
  } finally { await pending.dispose(); }
  await expect(page.locator(panelSelector)).toHaveCount(0);
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.locator('#contact-message')).toHaveValue(message);
  await expect(form.locator('#contact-consent')).toBeChecked();
  const retry = await holdAction(page, '/api/contact', 'POST');
  try {
    await form.getByRole('button', { name: 'Send enquiry', exact: true }).click();
    await retry.started();
    await expect(page.locator(panelSelector)).toBeVisible();
  } finally { await retry.dispose(); }
  await expect(page.locator(panelSelector)).toHaveCount(0);
  await expect(form.getByText('Your enquiry has been received.', { exact: true })).toBeVisible();
  await expect(form).toHaveAttribute('aria-busy', 'false');
});
});

test('a quick slide save never mounts a delayed panel after completion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.goto('/cms/slides');
  await expect(page.locator('[data-slide-card]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Move slide 1 down', exact: true }).click();
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.evaluate(() => {
    const recorded = window as Window & { workingPanelAppearances?: number };
    recorded.workingPanelAppearances = 0;
    new MutationObserver(mutations => {
      for (const mutation of mutations) for (const added of mutation.addedNodes) {
        if (added instanceof Element && (added.matches('[data-working-panel]') || added.querySelector('[data-working-panel]'))) recorded.workingPanelAppearances!++;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const response = page.waitForResponse(result => new URL(result.url()).pathname === '/api/cms/home-slides' && result.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save slides', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.clock.runFor(1_000);
  await expect(page.locator(panelSelector)).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { workingPanelAppearances?: number }).workingPanelAppearances)).toBe(0);
});

test.describe('narrow working drawer', () => {
test.use({ viewport: { width: 320, height: 720 }, reducedMotion: 'reduce' });
test('sign-out progress stays readable in the drawer without crowding the account controls', async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'CMS navigation', exact: true });
  const pending = await holdAction(page, '/api/cms/logout', 'POST', route => route.fulfill({ status: 503, json: { error: 'Synthetic sign-out unavailable' } }));
  try {
    await drawer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await pending.started();
    const working = drawer.locator(panelSelector);
    await expect(working).toBeInViewport({ ratio: .95 });
    await expect(working).toContainText('Signing out…');
    await expect(page.locator(`${panelSelector}:visible`)).toHaveCount(1);
    await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toBeDisabled();
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('sign-out-working-mobile.png') });
  } finally { await pending.dispose(); }
  await expect(drawer.locator(panelSelector)).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Close CMS navigation', exact: true }).click();
  await expect(page.locator('#cms-content').getByRole('alert')).toContainText('Synthetic sign-out unavailable');
});
});
