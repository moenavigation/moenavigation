import { test as base, expect, request as apiRequest, type Page } from '@playwright/test';
import type { Db } from 'mongodb';
import { connectE2eDatabase, seedE2eDatabase, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from '../../scripts/e2e-fixtures';

export { expect };
export { E2E_ADMIN, E2E_BASE_URL, E2E_DATABASE, E2E_IMAGE_BUFFER, E2E_IMAGE_URL, E2E_IMAGE_ORIGIN, E2E_INBOX, createE2eImageBuffer, resetDatabase, assertOwnedDatabase } from '../../scripts/e2e-fixtures';

export const test = base.extend<{ db: Db; _resetDatabase: void; cmsLocale: 'th' | 'en' }>({
  cmsLocale: ['en', { option: true }],
  db: async ({}, provide) => {
    const { client, db } = await connectE2eDatabase();
    try { await provide(db); } finally { await client.close(); }
  },
  _resetDatabase: [async ({ db }, provide) => { await seedE2eDatabase(db); await refreshPublicCache(); await provide(); }, { auto: true }],
  context: async ({ context, cmsLocale }, provide) => {
    // Existing workflow checks use English explicitly; language tests exercise the Thai default.
    if (cmsLocale === 'en') await context.addInitScript(() => {
      if (!localStorage.getItem('moe-cms-language')) localStorage.setItem('moe-cms-language', 'en');
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === E2E_BASE_URL || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      if (route.request().url().startsWith(E2E_IMAGE_ORIGIN) || url.hostname.endsWith('.tile.openstreetmap.org') || url.hostname === 'tile.openstreetmap.org') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: E2E_IMAGE_BUFFER });
      }
      // Tests never fetch live Cloudinary assets, map tiles, email or third-party sites.
      return route.abort('blockedbyclient');
    });
    await provide(context);
  },
});

// Database fixtures bypass CMS writes, so explicitly invalidate through the
// same authenticated maintenance operation available after a real restore.
export async function refreshPublicCache() {
  const maintenance = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
  try {
    expect((await maintenance.post('/api/cms/login', { data: { username: E2E_ADMIN.username, password: E2E_ADMIN.password } })).ok()).toBe(true);
    expect((await maintenance.post('/api/cms/cache')).ok()).toBe(true);
    await maintenance.post('/api/cms/logout');
  } finally { await maintenance.dispose(); }
}

export async function login(page: Page) {
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill(E2E_ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Content overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();
}
