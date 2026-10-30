import { test, expect, login } from './fixtures';

test('media search finds older images and binds cursors to the search', async ({ page, db }) => {
  const source = await db.collection('moe_media').findOne({ state: 'committed' });
  expect(source).not.toBeNull();
  await db.collection<{ _id: string }>('moe_media').insertMany(Array.from({ length: 55 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const id = `media-search-${number}`;
    return {
      _id: id, id, title: `Map [special] ${number}`, url: `${source!.url}?media-search=${number}`,
      publicId: `moe-e2e/${id}`, state: 'committed', owner: source!.owner,
      submissionId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      pinned: true, createdAt: new Date(Date.now() + (index + 1) * 1000).toISOString(),
      touchedAt: new Date(), bytes: source!.bytes,
    };
  }));
  await login(page);
  const query = encodeURIComponent('  MAP [SPECIAL]  ');
  const first = await page.request.get(`/api/cms/media?q=${query}`);
  expect(first.status()).toBe(200);
  const firstPage = await first.json();
  expect(firstPage.media).toHaveLength(50);
  expect(firstPage.media.every((item: { title: string }) => item.title.startsWith('Map [special] '))).toBe(true);
  expect(firstPage.nextCursor).toBeTruthy();

  const next = await page.request.get(`/api/cms/media?q=${query}&cursor=${encodeURIComponent(firstPage.nextCursor)}`);
  expect(next.status()).toBe(200);
  const nextPage = await next.json();
  expect(nextPage.media).toHaveLength(5);
  expect(nextPage.nextCursor).toBeNull();
  expect(new Set([...firstPage.media, ...nextPage.media].map((item: { id: string }) => item.id)).size).toBe(55);

  const mismatched = await page.request.get(`/api/cms/media?q=another&cursor=${encodeURIComponent(firstPage.nextCursor)}`);
  expect(mismatched.status()).toBe(400);
  const unscoped = await page.request.get(`/api/cms/media?cursor=${encodeURIComponent(firstPage.nextCursor)}`);
  expect(unscoped.status()).toBe(400);
});
