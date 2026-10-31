import { test, expect, login, E2E_BASE_URL } from './fixtures';
import type { AttentionPage, DashboardData } from '../../src/lib/cms-dashboard';
import type { ContentDocument, EnquiryDocument } from '../../src/server/db';

test('dashboard requires authentication and validates read-only query boundaries', async ({ page }) => {
  expect((await page.request.get('/api/cms/dashboard')).status()).toBe(401);
  expect((await page.request.get('/api/cms/dashboard?view=attention')).status()).toBe(401);
  await login(page);
  for (const query of ['unknown=1', 'q=test', 'view=other', 'view=attention&unknown=1', 'view=attention&q=a&q=b', 'view=attention&type=Vessel&type=News', 'view=attention&type=Account', 'view=attention&issue=privacy', 'view=attention&cursor=invalid']) {
    expect((await page.request.get(`/api/cms/dashboard?${query}`)).status()).toBe(400);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    expect((await page.request.fetch('/api/cms/dashboard', { method, headers: { Origin: E2E_BASE_URL }, data: { attentionCount: 0 } })).status()).toBe(405);
  }
});

test('dashboard awaiting-reply totals cover all New and In progress enquiries and service checks stay safe', async ({ page, db }) => {
  await login(page);
  const expected = await db.collection<EnquiryDocument>('moe_enquiries').find({ status: { $in: ['New', 'In progress'] } }).sort({ createdAt: -1, _id: -1 }).toArray();
  const response = await page.request.get('/api/cms/dashboard');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const data = await response.json() as DashboardData;
  expect(data.enquiriesTotal).toBe(expected.length);
  expect(data.enquiries.map(item => item.id)).toEqual(expected.slice(0, 5).map(item => item.id));
  expect(data.enquiries.every(item => ['New', 'In progress'].includes(item.status))).toBe(true);
  expect(data.services.map(service => service.id)).toEqual(['database', 'images', 'email']);
  for (const service of data.services) {
    expect(Object.keys(service).sort()).toEqual(['checkedAt', 'detail', 'id', 'label', 'status']);
    expect(Number.isFinite(Date.parse(service.checkedAt))).toBe(true);
    expect(['connected', 'configured', 'needs_setup', 'unavailable', 'unknown']).toContain(service.status);
  }
  const safe = JSON.stringify(data.services);
  expect(safe).not.toMatch(/mongodb(?:\+srv)?:\/\/|api[_-]?key|api[_-]?secret|password|authorization|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
  const email = data.services.find(service => service.id === 'email')!;
  if (email.status === 'configured') expect(email.detail).toContain('Delivery is not verified');
});

test('attention scans the whole database before filtering and bounded paging, excludes Trash and returns editable records', async ({ page, db }) => {
  const source = await db.collection<ContentDocument>('moe_content').findOne({ type: 'Vessel', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  const now = new Date().toISOString();
  const fixtures: ContentDocument[] = Array.from({ length: 27 }, (_, index) => ({
    ...source!, _id: `Vessel:dashboard-attention-${index}`, id: `dashboard-attention-${index}`, title: `Dashboard attention ${index}`, titleTh: `เรือที่ต้องตรวจสอบ ${index}`,
    image: '', description: 'Complete description', descriptionTh: 'รายละเอียดครบถ้วน', vesselSpecs: { lengthM: 100 }, body: 'Preserve this long editable body', gallery: [{ url: source!.image, alt: 'Gallery', altTh: 'แกลเลอรี' }], updatedAt: now,
  }));
  await db.collection<ContentDocument>('moe_content').insertMany([
    ...fixtures,
    { ...fixtures[0], _id: 'Vessel:dashboard-attention-trashed', id: 'dashboard-attention-trashed', deletedAt: now },
    { ...fixtures[0], _id: 'Page:dashboard-attention-page', type: 'Page', id: 'dashboard-attention-page' },
    { ...fixtures[0], _id: 'Section:dashboard-attention-area', type: 'Section', id: 'dashboard-attention-area', description: '', descriptionTh: '' },
    { ...fixtures[0], _id: 'Page:dashboard-translation-page', type: 'Page', id: 'dashboard-translation-page', titleTh: '' },
    { ...fixtures[0], _id: 'Vessel:dashboard-complete-vessel', id: 'dashboard-complete-vessel', title: 'Dashboard attention complete', image: source!.image },
  ]);
  await login(page);
  let cursor: string | null = null;
  const ids: string[] = [];
  let firstCursor: string | null = null;
  do {
    const params = new URLSearchParams({ view: 'attention', q: 'dashboard-attention', issue: 'image', type: 'Vessel' });
    if (cursor) params.set('cursor', cursor);
    const response = await page.request.get(`/api/cms/dashboard?${params}`);
    expect(response.status()).toBe(200);
    const data = await response.json() as AttentionPage;
    expect(data.total).toBe(27);
    expect(data.items.length).toBeLessThanOrEqual(12);
    for (const item of data.items) {
      expect(item.record.type).toBe('Vessel'); expect(item.record.deletedAt).toBeUndefined();
      expect(item.issues.map(issue => issue.code)).toEqual(['image']);
      expect(item.record.body).toBe('Preserve this long editable body');
      expect(item.record.gallery).toHaveLength(1);
    }
    ids.push(...data.items.map(item => item.record.id));
    cursor = data.nextCursor;
    if (!firstCursor) firstCursor = cursor;
  } while (cursor);
  expect(ids).toHaveLength(27); expect(new Set(ids).size).toBe(27);
  const changed = new URLSearchParams({ view: 'attention', q: 'dashboard-attention', issue: 'translation', type: 'Vessel', cursor: firstCursor! });
  expect((await page.request.get(`/api/cms/dashboard?${changed}`)).status()).toBe(400);
  const optional = await (await page.request.get('/api/cms/dashboard?view=attention&q=dashboard-attention&type=All')).json() as AttentionPage;
  expect(optional.total).toBe(27);
  const untranslated = await (await page.request.get('/api/cms/dashboard?view=attention&q=dashboard-translation-page&type=Page')).json() as AttentionPage;
  expect(untranslated.total).toBe(1);
  expect(untranslated.items[0].issues.map(issue => issue.code)).toEqual(['translation']);
  const summary = await (await page.request.get('/api/cms/dashboard')).json() as DashboardData;
  const allAttention = await (await page.request.get('/api/cms/dashboard?view=attention')).json() as AttentionPage;
  expect(summary.attentionCount).toBe(allAttention.total);
});
