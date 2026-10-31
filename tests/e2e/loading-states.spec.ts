import type { Page, Route } from '@playwright/test';
import { test, expect, login, E2E_ADMIN, E2E_BASE_URL, E2E_INBOX, loginChallengeData } from './fixtures';

type RouteMatch = Parameters<Page['route']>[0];

// Requests stay pending until the assertion releases them. The timeout is a
// test-only cleanup guard; production loading never waits for a timer.
async function holdRequests(page: Page, match: RouteMatch, options: { error?: string; rscOnly?: boolean } = {}) {
  let release!: () => void;
  let requests = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const active = new Set<Promise<void>>();
  const timeout = setTimeout(() => release(), 25_000);
  const resume = () => { clearTimeout(timeout); release(); };
  const handler = (route: Route) => {
    const operation = (async () => {
      if (route.request().method() !== 'GET' || (options.rscOnly && route.request().headers().rsc !== '1')) return route.continue();
      requests++;
      await held;
      if (options.error) return route.fulfill({ status: 503, json: { error: options.error } });
      return route.continue();
    })().finally(() => { active.delete(operation); });
    active.add(operation);
    return operation;
  };
  await page.route(match, handler);
  return {
    release: resume,
    started: () => expect.poll(() => requests).toBeGreaterThan(0),
    dispose: async () => {
      resume();
      // Removing an interception while its callback is still continuing or
      // fulfilling lets Playwright handle the same route twice.
      while (active.size) await Promise.all([...active]);
      await page.unroute(match, handler);
    },
  };
}

async function authenticate(page: Page) {
  const response = await page.request.post('/api/cms/login', {
    headers: { Origin: E2E_BASE_URL },
    data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password, ...await loginChallengeData(page.request) },
  });
  expect(response.status()).toBe(200);
}

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

test.describe('mobile CMS loading', () => {
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test('CMS checks the session without flashing login and respects reduced motion on mobile', async ({ page }, testInfo) => {
  const session = await holdRequests(page, '**/api/cms/session');
  try {
    await page.goto('/cms', { waitUntil: 'domcontentloaded' });
    await session.started();
    const loading = page.locator('[data-loading-screen="cms"]');
    await expect(loading).toBeVisible();
    await expect(loading).toContainText('Checking your session');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
    await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
    expect(await loading.evaluate(element => [...element.querySelectorAll('*')].every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cms-session-mobile.png') });
  } finally { await session.dispose(); }
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.locator('[data-loading-screen]')).toHaveCount(0);
});
});

test('an authenticated CMS waits for its first content response before showing the dashboard', async ({ page }, testInfo) => {
  await authenticate(page);
  const content = await holdRequests(page, url => url.pathname === '/api/cms/content' && url.searchParams.get('scope') === 'overview');
  try {
    await page.goto('/cms', { waitUntil: 'domcontentloaded' });
    await content.started();
    const loading = page.locator('[data-loading-screen="cms"]');
    await expect(loading).toBeVisible();
    await expect(loading).toContainText('Getting your workspace ready');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('cms-workspace-desktop.png'), animations: 'disabled' });
  } finally { await content.dispose(); }
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent activity', exact: true }).locator('[data-log-id]').first()).toBeVisible();
  await expect(page.locator('[data-loading-screen]')).toHaveCount(0);
});

test('a failed initial CMS load leaves loading and can be recovered with Refresh', async ({ page }) => {
  await authenticate(page);
  const content = await holdRequests(page, url => url.pathname === '/api/cms/content' && url.searchParams.get('scope') === 'overview', { error: 'Synthetic initial content unavailable' });
  try {
    await page.goto('/cms', { waitUntil: 'domcontentloaded' });
    await content.started();
    await expect(page.locator('[data-loading-screen="cms"]')).toBeVisible();
  } finally { await content.dispose(); }
  const alerts = page.locator('#cms-content').getByRole('alert');
  await expect(alerts).toContainText('Synthetic initial content unavailable');
  await expect(page.locator('[data-loading-screen]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recent activity', exact: true }).locator('[data-log-id]').first()).toBeVisible();
  await expect(alerts).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();
});

test('Refresh has a short cooldown so repeated clicks cannot start extra requests', async ({ page }) => {
  await login(page);
  const refresh = page.getByRole('button', { name: 'Refresh workspace', exact: true });
  let overviewRequests = 0;
  await page.route(url => url.pathname === '/api/cms/content' && url.searchParams.get('scope') === 'overview', route => {
    overviewRequests += 1;
    return route.continue();
  });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect.poll(() => overviewRequests).toBe(1);
  await expect(refresh).toBeEnabled({ timeout: 6_000 });
  expect(overviewRequests).toBe(1);
  await refresh.click();
  await expect.poll(() => overviewRequests).toBe(2);
});

test('a partial Refresh failure identifies the area while successful areas update', async ({ page, db }) => {
  await login(page);
  const recent = page.getByRole('region', { name: 'Recent activity', exact: true });
  const firstTitle = await recent.locator('[data-log-id]').first().innerText();
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  const addedTitle = 'Image added before partial refresh';
  const addedMedia = {
    _id: 'partial-refresh-image', id: 'partial-refresh-image', title: addedTitle,
    url: `${source!.url}?partial-refresh=1`, publicId: 'moe-e2e/partial-refresh-image',
    state: 'committed', owner: source!.owner, submissionId: '50000000-0000-4000-8000-000000000001',
    pinned: true, createdAt: new Date().toISOString(), touchedAt: new Date(), bytes: source!.bytes,
  };
  await db.collection<{ _id: string }>('moe_media').insertOne(addedMedia);
  const settings = await holdRequests(page, url => url.pathname === '/api/cms/settings', { error: 'Synthetic settings unavailable' });
  try {
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await settings.started();
  } finally { await settings.dispose(); }
  const alert = page.locator('#cms-content').getByRole('alert');
  await expect(alert).toContainText('Website details');
  await expect(alert).toContainText('Synthetic settings unavailable');
  await expect(recent.locator('[data-log-id]').first()).toHaveText(firstTitle.replace(/\s+/g, ' ').trim(), { useInnerText: true });
  await page.getByRole('button', { name: 'Open CMS navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'CMS navigation' }).getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved images' }).getByText(addedTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
  await expect(alert).toHaveCount(0);
});

test.describe('mobile workspace loading', () => {
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test('background refresh keeps content visible and an inbox search resolves its loading panel', async ({ page }, testInfo) => {
  await login(page);
  const firstRow = page.getByRole('region', { name: 'Recent activity', exact: true }).locator('[data-log-id]').first();
  const originalText = await firstRow.innerText();
  const content = await holdRequests(page, url => url.pathname === '/api/cms/content' && url.searchParams.get('scope') === 'overview');
  try {
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await content.started();
    await expect(page.getByText('Refreshing workspace', { exact: true })).toBeVisible();
    await expect(firstRow).toHaveText(originalText.replace(/\s+/g, ' ').trim(), { useInnerText: true });
    await expect(page.getByRole('region', { name: 'Recent activity', exact: true }).locator('[data-log-id]').first()).toBeVisible();
    await expect(page.locator('[data-loading-screen]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('cms-refresh-mobile.png'), animations: 'disabled' });
  } finally { await content.dispose(); }
  await expect(page.getByText('Refreshing workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();

  await page.getByRole('link', { name: /^New enquiries/ }).click();
  const inbox = page.getByRole('region', { name: 'Enquiry inbox' });
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText(`Showing 50 of ${E2E_INBOX.total} enquiries`);
  const enquiry = await holdRequests(page, url => url.pathname === '/api/cms/inbox' && url.searchParams.get('q') === E2E_INBOX.oldThai.query);
  try {
    await inbox.getByRole('searchbox').fill(E2E_INBOX.oldThai.query);
    await enquiry.started();
    await expect(inbox.locator('[data-loading-panel="inbox"]')).toBeVisible();
    await expect(inbox).not.toContainText('No matching enquiries');
    await expect(page.locator('[data-loading-screen]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cms-inbox-mobile.png'), animations: 'disabled' });
  } finally { await enquiry.dispose(); }
  await expect(inbox.locator('[data-loading-panel]')).toHaveCount(0);
  await expect(inbox.getByRole('status').filter({ hasText: /^Showing / })).toHaveText('Showing 1 of 1 enquiries');
  await expect(inbox.getByText(E2E_INBOX.oldThai.subject, { exact: true })).toBeVisible();
});
});

for (const layout of [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' as const },
  { name: 'mobile', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' as const },
]) {
test.describe(`${layout.name} public loading`, () => {
test.use({ viewport: layout.viewport, reducedMotion: layout.reducedMotion });
test('public navigation shows the destination language while its page response is pending', async ({ page }, testInfo) => {
  // Register before the initial visit so a prefetch cannot populate this route.
  const destination = await holdRequests(page, url => url.pathname === '/th/fleet', { rscOnly: true });
  try {
    await page.goto('/fleet?q=MOE');
    // Cached HTML is usable before hydration; wait for query state before
    // specifically exercising a React navigation rather than a document link.
    await expect(page.getByRole('searchbox', { name: 'Search vessels' })).toHaveValue('MOE');
    if (layout.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('link', { name: 'ไทย', exact: true }).click();
    } else {
      await page.getByRole('link', { name: 'Switch to Thai' }).click();
    }
    await destination.started();
    const pending = page.locator('[data-navigation-loading]');
    const loading = pending.locator('[data-loading-screen="public"]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('lang', 'th');
    await expect(loading).toContainText('กำลังโหลดหน้าเว็บไซต์');
    await expect(page.locator('main')).toHaveJSProperty('inert', true);
    await expect(page.locator('[data-site-header]')).not.toHaveJSProperty('inert', true);
    if (layout.reducedMotion === 'reduce') {
      expect(await loading.evaluate(element => [...element.querySelectorAll('*')].every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`public-loading-thai-${layout.name}.png`), animations: 'disabled' });
  } finally { await destination.dispose(); }
  await expect(page).toHaveURL(/\/th\/fleet\?q=MOE$/);
  await expect(page.locator('[data-navigation-loading]')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'ค้นหาเรือ' })).toBeVisible();
  await expect(page.locator('main')).not.toHaveJSProperty('inert', true);
});
});
}

test('a newer header navigation cancels the pending view and restores page interaction', async ({ page }) => {
  const services = await holdRequests(page, url => url.pathname === '/services', { rscOnly: true });
  try {
    await page.goto('/fleet?q=MOE');
    await expect(page.getByRole('searchbox', { name: 'Search vessels' })).toHaveValue('MOE');
    const header = page.locator('[data-site-header]');
    await header.getByRole('link', { name: 'Services', exact: true }).click();
    await services.started();
    await expect(page.locator('[data-navigation-loading]')).toBeVisible();
    await header.getByRole('link', { name: 'Routes', exact: true }).click();
    await expect(page).toHaveURL(/\/routes$/);
    await expect(page.locator('[data-navigation-loading]')).toHaveCount(0);
    await expect(page.locator('main')).not.toHaveJSProperty('inert', true);
    await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
  } finally { await services.dispose(); }
  // Releasing the older response must not replace the newer destination or
  // restore an obsolete inert/hidden state from an overlapping loading view.
  await expect(page).toHaveURL(/\/routes$/);
  await expect(page.locator('[data-navigation-loading]')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveJSProperty('inert', true);
  await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
  const search = page.getByRole('searchbox');
  await search.fill('voyage');
  await expect(search).toHaveValue('voyage');
});
