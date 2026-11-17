import type { Page } from '@playwright/test';
import type { ContentDocument } from '../../src/server/db';
import { test, expect, refreshPublicCache } from './fixtures';

const query = 'Pagination fixture';
const cards = (page: Page) => page.locator('main a[href*="/fleet/pagination-vessel-"]');
const pager = (page: Page, thai = false) => page.getByRole('navigation', { name: thai ? 'หน้ากองเรือ' : 'Fleet pages', exact: true });

test('the existing eight vessels keep one visible numbered page with disabled previous and next', async ({ page }) => {
  await page.goto('/fleet');
  await expect(page.locator('main a[href^="/fleet/"]')).toHaveCount(8);
  const navigation = pager(page);
  await expect(navigation.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('button', { name: 'Previous fleet page', exact: true })).toHaveText('<');
  await expect(navigation.getByRole('button', { name: 'Previous fleet page', exact: true })).toBeDisabled();
  await expect(navigation.getByRole('button', { name: 'Next fleet page', exact: true })).toHaveText('>');
  await expect(navigation.getByRole('button', { name: 'Next fleet page', exact: true })).toBeDisabled();
});

test.describe('fleet pagination with synthetic records', () => {
  test.beforeEach(async ({ db }) => {
    const collection = db.collection<ContentDocument>('moe_content');
    const source = await collection.findOne({ type: 'Vessel', deletedAt: { $exists: false } });
    expect(source).not.toBeNull();
    await collection.insertMany(Array.from({ length: 40 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      const id = `pagination-vessel-${number}`;
      return {
        ...source!, _id: `Vessel:${id}`, id, title: `Pagination vessel ${number}`, titleTh: `เรือทดสอบหน้ารายการ ${number}`,
        description: `${query} for listing checks.`, descriptionTh: 'ข้อมูลสังเคราะห์สำหรับทดสอบการแบ่งหน้า',
        category: index < 30 ? 'Container' : 'Crane', categoryTh: index < 30 ? 'เรือคอนเทนเนอร์' : 'เรือเครน',
        order: 100 + index, revision: 1,
      };
    }));
    await refreshPublicCache();
  });

  test('18/18/remainder pages persist through reload, language, detail return and filter changes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/fleet?q=${encodeURIComponent(query)}&campaign=keep`);
    await expect(page.getByRole('status')).toHaveText('40 vessels');
    await expect(cards(page)).toHaveCount(18);
    await expect(cards(page).first()).toContainText('Pagination vessel 01');
    await pager(page).getByRole('button', { name: '2', exact: true }).click();
    await expect(cards(page).first()).toContainText('Pagination vessel 19');
    await expect(cards(page)).toHaveCount(18);
    await expect(cards(page).first()).toBeInViewport({ ratio: .9 });
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    expect(new URL(page.url()).searchParams.get('campaign')).toBe('keep');
    await page.reload();
    await expect(pager(page).getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(cards(page).first()).toContainText('Pagination vessel 19');
    await page.getByRole('link', { name: 'Switch to Thai', exact: true }).click();
    await expect(pager(page, true).getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(cards(page).first()).toContainText('เรือทดสอบหน้ารายการ 19');
    await cards(page).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('เรือทดสอบหน้ารายการ 19');
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    await page.getByRole('link', { name: 'กลับไปยังกองเรือ', exact: true }).click();
    await expect(pager(page, true).getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox', { name: 'ค้นหาเรือ', exact: true })).toHaveValue(query);
    await pager(page, true).getByRole('button', { name: '3', exact: true }).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(cards(page).first()).toBeInViewport({ ratio: .9 });
    await expect(pager(page, true).getByRole('button', { name: 'หน้ากองเรือถัดไป', exact: true })).toBeDisabled();
    await page.getByRole('group', { name: 'กรองตามประเภท', exact: true }).getByRole('button', { name: 'เรือคอนเทนเนอร์', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('30 ลำ');
    await expect(cards(page)).toHaveCount(18);
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();
    await pager(page, true).getByRole('button', { name: '2', exact: true }).click();
    await expect(cards(page)).toHaveCount(12);
    await page.getByRole('searchbox', { name: 'ค้นหาเรือ', exact: true }).fill(`${query} 01`);
    await expect(cards(page)).toHaveCount(1);
    await expect(pager(page, true).getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();
    expect(new URL(page.url()).searchParams.get('category')).toBe('Container');
  });

  test.describe('mobile page normalization', () => {
    test.use({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
    test('invalid pages clamp to available results and the pager fits narrow screens', async ({ page }) => {
      await page.goto(`/fleet?q=${encodeURIComponent(query)}&page=999`);
      await expect(cards(page)).toHaveCount(4);
      await expect(pager(page).getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('3');
      expect(await pager(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.goto(`/fleet?q=${encodeURIComponent(query)}&page=invalid`);
      await expect(cards(page)).toHaveCount(18);
      await expect(pager(page).getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBeNull();
      await pager(page).getByRole('button', { name: '2', exact: true }).click();
      await expect(cards(page).first()).toContainText('Pagination vessel 19');
      await expect(cards(page).first()).toBeInViewport({ ratio: .9 });
      await page.getByRole('searchbox', { name: 'Search vessels', exact: true }).fill('No matching pagination vessel');
      await expect(cards(page)).toHaveCount(0);
      await expect(pager(page)).toHaveCount(0);
    });
  });
});
