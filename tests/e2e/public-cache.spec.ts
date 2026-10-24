import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, refreshPublicCache } from './fixtures';

const headers = { origin: E2E_BASE_URL };

async function signIn(request: APIRequestContext) {
  const response = await request.post('/api/cms/login', { headers, data: E2E_ADMIN });
  expect(response.status(), await response.text()).toBe(200);
}

async function publicHtml(request: APIRequestContext, path: string, title: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  const html = await response.text();
  // Assertions use the actual HTML response: no hydration or JavaScript fetch is required.
  expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
  expect(html).toContain(`<title>${title} | `);
  return html;
}

test('warm public HTML is cached and new routes share the published database snapshot', async ({ request, db }) => {
  const source = await db.collection('moe_content').findOne({ type: 'Vessel', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();
  const id = 'e2e-cached-snapshot';
  await db.collection('moe_content').insertOne({ ...source!, _id: `Vessel:${id}`, id, title: 'Cached snapshot vessel', titleTh: 'เรือจากข้อมูลแคช' } as never);
  await refreshPublicCache();

  await publicHtml(request, `/en/fleet/${id}`, 'Cached snapshot vessel');
  const cached = await request.get(`/en/fleet/${id}`);
  expect(cached.headers()['x-nextjs-cache']).toBe('HIT');
  expect(cached.headers()['cache-control']).toContain('s-maxage=');

  // Bypass publishing deliberately in the isolated test database. Both an existing
  // HTML page and a previously unvisited locale must retain the cached snapshot.
  await db.collection('moe_content').updateOne({ id, type: 'Vessel' }, { $set: { title: 'Fresh snapshot vessel', titleTh: 'เรือจากข้อมูลใหม่' } });
  await publicHtml(request, `/en/fleet/${id}`, 'Cached snapshot vessel');
  await publicHtml(request, `/fleet/${id}`, 'เรือจากข้อมูลแคช');

  await refreshPublicCache();
  await publicHtml(request, `/en/fleet/${id}`, 'Fresh snapshot vessel');
  await publicHtml(request, `/fleet/${id}`, 'เรือจากข้อมูลใหม่');
});

test('CMS saves, Trash and restore refresh cached pages, metadata, sitemap and missing URLs immediately', async ({ request, db }) => {
  await signIn(request);
  const id = 'e2e-cache-publish';
  const paths = [`/fleet/${id}`, `/en/fleet/${id}`];
  for (const path of paths) expect((await request.get(path)).status()).toBe(404);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/fleet/${id}`);
  const source = await db.collection('moe_content').findOne({ type: 'Vessel', deletedAt: { $exists: false } });
  expect(source).not.toBeNull();

  let record = { ...source!, id, title: 'First published vessel', titleTh: 'เรือเผยแพร่ครั้งแรก' };
  const save = async (expectedRevision: number | null) => {
    const response = await request.post('/api/cms/content', { headers, data: { record, expectedRevision, submissionId: randomUUID() } });
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()).record;
  };
  const checkPublished = async (title: string, titleTh: string) => {
    await publicHtml(request, paths[0], titleTh);
    await publicHtml(request, paths[1], title);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const path of paths) expect(sitemap).toContain(`${E2E_BASE_URL}${path}</loc>`);
  };

  record = await save(null);
  await checkPublished(record.title, record.titleTh);
  record = { ...record, title: 'Updated published vessel', titleTh: 'เรือที่แก้ไขแล้ว' };
  record = await save(1);
  await checkPublished(record.title, record.titleTh);

  const trashed = await request.post('/api/cms/content/action', { headers, data: { id, type: 'Vessel', action: 'trash', expectedRevision: 2 } });
  expect(trashed.status(), await trashed.text()).toBe(200);
  for (const path of paths) expect((await request.get(path)).status()).toBe(404);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/fleet/${id}`);

  const restored = await request.post('/api/cms/content/action', { headers, data: { id, type: 'Vessel', action: 'restore', expectedRevision: 3 } });
  expect(restored.status(), await restored.text()).toBe(200);
  await checkPublished(record.title, record.titleTh);
});

test('saving website details refreshes cached contact text and metadata in both languages', async ({ request }) => {
  await signIn(request);
  for (const path of ['/contact', '/en/contact']) {
    expect((await request.get(path)).status()).toBe(200);
    expect((await request.get(path)).headers()['x-nextjs-cache']).toBe('HIT');
  }
  const { settings } = await (await request.get('/api/cms/settings')).json();
  const response = await request.put('/api/cms/settings', { headers, data: {
    expectedRevision: settings.revision,
    settings: { ...settings, companyName: 'Updated cache company', companyNameTh: 'บริษัททดสอบแคช', officeAddress: 'Updated cached office', officeAddressTh: 'สำนักงานที่แก้ไขแล้ว' },
  } });
  expect(response.status(), await response.text()).toBe(200);
  const english = await (await request.get('/en/contact')).text();
  const thai = await (await request.get('/contact')).text();
  expect(english).toContain('Updated cached office');
  expect(english).toMatch(/<title>[^<]+ \| Updated cache company<\/title>/);
  expect(thai).toContain('สำนักงานที่แก้ไขแล้ว');
  expect(thai).toMatch(/<title>[^<]+ \| บริษัททดสอบแคช<\/title>/);
});

test('CMS responses remain private and only signed-in same-origin callers can refresh public content', async ({ request }) => {
  const denied = await request.post('/api/cms/cache', { headers });
  expect(denied.status()).toBe(401);
  expect(denied.headers()['cache-control']).toContain('no-store');
  const signedOut = await request.get('/api/cms/session');
  expect(await signedOut.json()).toEqual({ user: null });
  expect(signedOut.headers()['cache-control']).toContain('no-store');

  await signIn(request);
  for (const path of ['/cms', '/api/cms/session', '/api/cms/content', '/api/cms/settings', '/api/cms/inbox']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['cache-control'], path).toContain('no-store');
    expect(response.headers()['x-nextjs-cache'], path).not.toBe('HIT');
  }
  const crossOrigin = await request.post('/api/cms/cache', { headers: { origin: 'https://unrelated.example.test', 'sec-fetch-site': 'cross-site' } });
  expect(crossOrigin.status()).toBe(403);
  expect((await request.post('/api/cms/cache', { headers })).status()).toBe(200);
});
