import { test as base, expect, type Page } from '@playwright/test';
import type { Db } from 'mongodb';
import { connectE2eDatabase, seedE2eDatabase, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_BUFFER, E2E_IMAGE_ORIGIN } from '../../scripts/e2e-fixtures';

export { expect };
export { E2E_ADMIN, E2E_BASE_URL, E2E_DATABASE, E2E_IMAGE_BUFFER, E2E_IMAGE_URL, E2E_IMAGE_ORIGIN, E2E_INBOX, createE2eImageBuffer, resetDatabase, assertOwnedDatabase } from '../../scripts/e2e-fixtures';

export const test = base.extend<{ db: Db; _resetDatabase: void }>({
  db: async ({}, provide) => {
    const { client, db } = await connectE2eDatabase();
    try { await provide(db); } finally { await client.close(); }
  },
  _resetDatabase: [async ({ db }, provide) => { await seedE2eDatabase(db); await provide(); }, { auto: true }],
  context: async ({ context }, provide) => {
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

export async function login(page: Page) {
  await page.goto('/cms');
  await page.getByLabel('Username', { exact: true }).fill(E2E_ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Content overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh workspace', exact: true })).toBeEnabled();
}
