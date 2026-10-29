import { test, expect } from './fixtures';

test('fleet controls wait for hydration and then accept the first search and category selection', async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsMayLoad = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route(/\/_next\/.*\.js(?:\?|$)/, async route => {
    await scriptsMayLoad;
    await route.continue();
  });

  try {
    await page.goto('/th/fleet', { waitUntil: 'commit' });
    const search = page.getByRole('searchbox', { name: 'ค้นหาเรือ' });
    const crane = page.getByRole('button', { name: 'เรือเครน', exact: true });
    await expect(page.getByRole('status')).toHaveText('8 ลำ');
    await expect(search).toBeDisabled();
    await expect(crane).toBeDisabled();

    releaseScripts();
    await expect(search).toBeEnabled();
    await expect(crane).toBeEnabled();
    await search.fill('โม4');
    await expect(page.getByRole('status')).toHaveText('1 ลำ');
    expect(new URL(page.url()).searchParams.get('q')).toBe('โม4');
    await crane.click();
    await expect(crane).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.get('category')).toBe('Crane');
  } finally {
    releaseScripts();
  }
});
