import { test, expect, E2E_IMAGE_URL, refreshPublicCache } from './fixtures';

test('query preferences hydrate from cached pages and follow browser Back and Forward', async ({ page }) => {
  await page.goto('/fleet?q=MOE&category=Tanker');
  const search = page.getByRole('searchbox', { name: 'Search vessels' });
  await expect(search).toHaveValue('MOE');
  await expect(page.getByRole('button', { name: 'Tanker', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('1 vessel');

  // Category selection adds a history entry; typing replaces that same entry.
  await page.getByRole('button', { name: 'Container', exact: true }).click();
  await search.fill('unmatched-e2e-history');
  await expect(page.getByRole('heading', { name: 'No matching results' })).toBeVisible();
  await expect(page).toHaveURL(/category=Container/);
  await expect(page).toHaveURL(/q=unmatched-e2e-history/);

  await page.goBack();
  await expect(search).toHaveValue('MOE');
  await expect(page.getByRole('button', { name: 'Tanker', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('1 vessel');
  await page.goForward();
  await expect(search).toHaveValue('unmatched-e2e-history');
  await expect(page.getByRole('button', { name: 'Container', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'No matching results' })).toBeVisible();
});

test('fleet filters survive reload, language changes and detail/back navigation', async ({ page }) => {
  await page.goto('/fleet');
  await page.getByRole('button', { name: 'Tanker', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search vessels' }).fill('MOE');
  await expect(page).toHaveURL(/category=Tanker/);
  await expect(page).toHaveURL(/q=MOE/);
  await expect(page.getByRole('status')).toHaveText('1 vessel');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('MOE');
  await page.getByRole('link', { name: 'Switch to Thai' }).click();
  await expect(page).toHaveURL(/\/th\/fleet\?/);
  await expect(page.getByRole('button', { name: 'เรือแทงเกอร์', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox')).toHaveValue('MOE');
  await page.getByRole('main').getByRole('link', { name: /Dumai Moe/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dumai Moe');
  await page.getByRole('link', { name: 'กลับไปยังกองเรือ', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('MOE');
  await page.getByRole('button', { name: 'ล้างตัวกรอง', exact: true }).click();
  await expect(page).toHaveURL(/\/th\/fleet$/);
  await expect(page.getByRole('searchbox')).toBeFocused();
});

for (const listing of [
  { path: 'news', category: 'Articles', query: 'voyage', title: 'What goes into planning a voyage?', back: 'Back to articles' },
  { path: 'projects', category: 'Container', query: 'handoff', title: 'Planning a sea-to-land handoff', back: 'Back to topics' },
]) {
  test(listing.path + ' search, empty state and detail return remain usable', async ({ page }) => {
    await page.goto('/' + listing.path);
    await page.getByRole('button', { name: listing.category, exact: true }).click();
    await page.getByRole('searchbox').fill('unmatched-e2e-result');
    await expect(page.getByRole('heading', { name: 'No matching results' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.getByRole('searchbox').fill(listing.query);
    await page.getByRole('main').getByRole('link').filter({ hasText: listing.title }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(listing.title);
    await page.getByRole('link', { name: listing.back, exact: true }).click();
    await expect(page.getByRole('searchbox')).toHaveValue(listing.query);
    await expect(page.getByRole('button', { name: listing.category, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/' + listing.path + '$'));
    await expect(page.getByRole('searchbox')).toBeFocused();
  });
}

test.describe('mobile browser layout', () => {
test.use({ viewport: { width: 390, height: 844 } });
test('mobile navigation returns to top and gallery keyboard focus stays contained', async ({ page, db }) => {
  // Gallery behavior uses explicit test photos; confirmed fleet records have no client photos yet.
  await db.collection<{ _id: string }>('moe_content').updateOne({ _id: 'Vessel:moe-line-3' }, { $set: {
    image: E2E_IMAGE_URL,
    gallery: [{ url: `${E2E_IMAGE_URL}?gallery=2`, alt: 'Test vessel detail', altTh: 'ภาพเรือสำหรับทดสอบ' }],
  } });
  await refreshPublicCache();
  await page.goto('/fleet/moe-line-3');
  const trigger = page.getByRole('button', { name: 'Open image gallery' });
  await trigger.click();
  const gallery = page.getByRole('dialog');
  await expect(gallery).toBeVisible();
  const close = gallery.getByRole('button', { name: 'Close gallery' });
  const next = gallery.getByRole('button', { name: 'Next image' });
  await close.press('Shift+Tab');
  await expect(next).toBeFocused();
  await next.press('Tab');
  await expect(close).toBeFocused();
  await next.click();
  await expect(gallery).toContainText('2 /');
  await gallery.press('Escape');
  await expect(gallery).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  await menu.getByRole('button', { name: 'Close menu' }).press('Shift+Tab');
  await expect(menu.getByRole('link', { name: 'English', exact: true })).toBeFocused();
  await menu.getByRole('link', { name: 'English', exact: true }).press('Tab');
  await expect(menu.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await menu.getByRole('link', { name: 'Services', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Our services');
  await expect(menu).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await menu.getByRole('link', { name: 'Services', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2);
});
});

test('route keyboard selection survives reload and language change', async ({ page }) => {
  await page.goto('/routes');
  await page.getByRole('radio', { name: /Laem Chabang — Singapore/ }).press('ArrowDown');
  await expect(page).toHaveURL(/route=laem-chabang-port-klang/);
  await expect(page.getByRole('radio', { name: /Laem Chabang — Port Klang/ })).toBeChecked();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Fit selected route', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: /Laem Chabang — Port Klang/ })).toBeChecked();
  await page.getByRole('link', { name: 'Switch to Thai' }).click();
  await expect(page.getByRole('radio', { name: /แหลมฉบัง — ท่าเรือคลัง/ })).toBeChecked();
  await expect(page.getByRole('link', { name: 'สอบถามเกี่ยวกับเส้นทางนี้' })).toHaveAttribute('href', /subject=/);
});

test('contact draft survives a lost success response and retries without a duplicate', async ({ page, db }) => {
  await page.goto('/contact?subject=Vessel%20enquiry');
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Vessel enquiry');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser enquiry');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('browser-enquiry@example.com');
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Browser retry receipt');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please discuss this synthetic vessel operation and preferred dates.');
  await page.getByRole('checkbox').check();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Browser retry receipt');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Clear draft', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep editing' }).filter({ hasText: 'Keep editing' }).click();
  await expect(page.getByRole('button', { name: 'Clear draft', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Browser enquiry');

  let firstResponse = true;
  await page.route('**/api/contact', async route => {
    if (!firstResponse) return route.continue();
    firstResponse = false;
    const accepted = await route.fetch();
    expect(accepted.status()).toBe(201);
    // The server commits successfully; the browser sees an uncertain response.
    await route.fulfill({ status: 503, json: { error: 'Synthetic interrupted response' } });
  });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Browser retry receipt');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Browser retry receipt');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText('Your enquiry has been received.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
  const saved = await db.collection('moe_enquiries').find({ subject: 'Browser retry receipt' }).toArray();
  expect(saved).toHaveLength(1);
  expect(saved[0].notification).toMatchObject({ status: 'not_configured', attempts: 0 });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
});
