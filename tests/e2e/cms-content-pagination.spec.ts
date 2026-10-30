import { test, expect, login } from './fixtures';

test('collection pages search all saved records while the overview keeps page areas and accurate counts', async ({ page, db }) => {
  const before = await db.collection('moe_content').countDocuments({ type: 'Vessel', deletedAt: { $exists: false } });
  const savedOrders = await db.collection('moe_content').find({ type: 'Vessel', deletedAt: { $exists: false } }, { projection: { order: 1 } }).toArray();
  const previousMaxOrder = Math.max(-1, ...savedOrders.map(record => typeof record.order === 'number' ? record.order : 0));
  await db.collection<{ _id: string }>('moe_content').insertMany(Array.from({ length: 26 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `paging-vessel-${number}`;
    return {
      _id: `Vessel:${id}`, id, type: 'Vessel', title: `Paging [${number}]`, titleTh: `เรือ ${number}`,
      description: `A paged vessel ${number}.`, descriptionTh: `เรือทดสอบ ${number}`, image: '',
      category: 'Cargo', categoryTh: 'สินค้า', order: 1000 + index, status: index === 0 ? 'Draft' : 'Published', revision: 1,
      updatedAt: new Date(Date.now() + (index + 1) * 1000).toISOString(),
    };
  }));
  await db.collection('moe_content').insertOne({
    _id: 'Vessel:paging-trashed', id: 'paging-trashed', type: 'Vessel', title: 'Retained trashed vessel', titleTh: 'เรือในถังขยะ',
    description: 'A retained deleted item.', descriptionTh: 'รายการที่ถูกลบ', image: '', category: 'Old',
    order: 9999, status: 'Published', revision: 2, updatedAt: new Date().toISOString(), deletedAt: new Date().toISOString(),
    purgeAt: new Date(Date.now() + 86400000),
  } as never);
  await login(page);

  const fullResponse = await page.request.get('/api/cms/content');
  expect(fullResponse.ok()).toBe(true);
  expect((await fullResponse.json()).records.some((record: { id: string }) => record.id === 'paging-vessel-01')).toBe(true);

  const overviewResponse = await page.request.get('/api/cms/content?scope=overview');
  expect(overviewResponse.ok()).toBe(true);
  const overview = await overviewResponse.json();
  expect(overview.records.every((record: { type: string }) => ['Page', 'Section'].includes(record.type))).toBe(true);
  expect(overview.summary.counts.Vessel.total).toBe(before + 26);
  expect(overview.summary.counts.Vessel.draft).toBeGreaterThanOrEqual(1);
  expect(overview.summary.categories.Vessel.en).toContain('Cargo');
  expect(overview.summary.nextOrder.Vessel).toBe(Math.min(10000, Math.max(previousMaxOrder, 1025) + 1));
  expect(overview.summary.trashCount).toBeGreaterThanOrEqual(1);
  expect(overview.summary.recent).toHaveLength(5);
  expect(overview.summary.recent[0].id).toBe('paging-vessel-26');
  const trashResponse = await page.request.get('/api/cms/content?scope=trash');
  expect(trashResponse.ok()).toBe(true);
  expect((await trashResponse.json()).records.some((record: { id: string }) => record.id === 'paging-trashed')).toBe(true);

  const firstResponse = await page.request.get('/api/cms/content?type=Vessel');
  expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json();
  expect(first.records).toHaveLength(12);
  expect(first.total).toBe(before + 26);
  expect(first.records[0].id).toBe('paging-vessel-26');
  expect(first.nextCursor).toBeTruthy();
  const secondResponse = await page.request.get(`/api/cms/content?type=Vessel&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(secondResponse.ok()).toBe(true);
  const second = await secondResponse.json();
  expect(second.records).toHaveLength(12);
  expect(new Set([...first.records, ...second.records].map(record => record.id)).size).toBe(24);

  const search = await page.request.get('/api/cms/content?type=Vessel&q=Paging%20%5B01%5D');
  expect(search.ok()).toBe(true);
  expect((await search.json()).records.map((record: { id: string }) => record.id)).toEqual(['paging-vessel-01']);
  const drafts = await page.request.get('/api/cms/content?type=Vessel&status=Draft');
  expect(drafts.ok()).toBe(true);
  expect((await drafts.json()).records.some((record: { id: string }) => record.id === 'paging-vessel-01')).toBe(true);
  const reusedCursor = await page.request.get(`/api/cms/content?type=Vessel&status=Draft&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(reusedCursor.status()).toBe(400);

  await page.goto('/cms/fleet');
  const list = page.locator('section[aria-labelledby="content-heading"]');
  const rows = list.locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(list.getByRole('status')).toContainText(`Showing 12 of ${before + 26} items`);
  await list.getByRole('button', { name: /Show more/ }).click();
  await expect(rows).toHaveCount(24);
  await list.getByRole('searchbox', { name: 'Search content' }).fill('Paging [01]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Paging [01]');
  await expect(list.getByRole('combobox', { name: 'Publication status' })).toHaveCount(0);
  await expect(rows.first().getByText('Not public', { exact: true })).toHaveCount(0);
});
