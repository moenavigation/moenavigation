import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import type { ContentRecord, Enquiry, SiteSettings } from '../src/lib/cms-types';

if (!process.argv.includes('--qa')) throw new Error('Use --qa. This rehearsal writes only to the isolated QA database.');
nextEnv.loadEnvConfig(process.cwd());
const source = process.env.MONGODB_DB_NAME;
if (!source || source.endsWith('_qa_backend')) throw new Error('Start from the main configuration; this script selects its isolated QA database.');
process.env.MONGODB_DB_NAME = `${source}_qa_backend`;
process.env.RESEND_API_KEY = '';
process.env.ENQUIRY_EMAIL_FROM = '';
process.env.ENQUIRY_EMAIL_TO = '';
const base = new URL('http://localhost:3006');
const { collections, ensureIndexes, getClient, getDb } = await import('../src/server/db');
const { digest, hashPassword } = await import('../src/server/auth');
const db = await getDb();
assert.equal(db.databaseName, `${source}_qa_backend`);
await ensureIndexes();
const c = collections(db);
const runId = `qa-full-${Date.now()}-${randomUUID().slice(0, 8)}`;
const userId = randomUUID();
const username = runId;
let password = randomBytes(24).toString('base64url');
let cookie = '';
const recordIds: string[] = [];
const enquiryIds: string[] = [];
const submissions: string[] = [];
const emails: string[] = [];
let savedSettings: SiteSettings | undefined;
const report = { runId, checkedAt: new Date().toISOString(), base: base.origin, database: db.databaseName, checks: [] as string[], failures: [] as string[], cleanup: {} as Record<string, unknown>, temporaryUser: userId, content: recordIds, enquiries: enquiryIds, email: 'QA server must use disabled email; notification rehearsal uses a stub sender.' };
type Data = { record?: ContentRecord; records?: ContentRecord[]; enquiry?: Enquiry; enquiries?: Enquiry[]; settings?: SiteSettings; id?: string; error?: string; nextCursor?: string | null; user?: { username: string } | null; media?: { id: string; url: string; sourcePath?: string }[] };
type Options = { method?: string; body?: unknown; raw?: string; cookie?: string | null; origin?: string | null; headers?: Record<string, string> };
async function request(path: string, options: Options = {}) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = { ...options.headers };
  const session = options.cookie === undefined ? cookie : options.cookie;
  if (session) headers.Cookie = session;
  if (!['GET', 'HEAD'].includes(method) && options.origin !== null) headers.Origin = options.origin || base.origin;
  if (options.body !== undefined || options.raw !== undefined) headers['Content-Type'] ??= 'application/json';
  const response = await fetch(new URL(path, base), { method, headers, body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)), redirect: 'manual', signal: AbortSignal.timeout(45_000) });
  const text = await response.text();
  let data: Data = {};
  try { data = JSON.parse(text) as Data; } catch { /* Public routes return HTML. */ }
  return { response, data, text };
}
function status(result: Awaited<ReturnType<typeof request>>, expected: number, label: string) {
  assert.equal(result.response.status, expected, `${label}: HTTP ${result.response.status}; ${result.data.error || ''}`);
}
async function check(label: string, run: () => Promise<void>) {
  try { await run(); report.checks.push(label); console.log(`PASS: ${label}`); }
  catch (error) { const message = `${label}: ${error instanceof Error ? error.message : 'failed'}`; report.failures.push(message); throw new Error(message); }
}
function submission() { const value = randomUUID(); submissions.push(value); return value; }
async function login() {
  const result = await request('/api/cms/login', { method: 'POST', body: { username, password }, cookie: null });
  status(result, 200, 'Temporary QA login');
  const value = result.response.headers.getSetCookie().find(item => item.startsWith('moe_cms_session='));
  assert.ok(value); assert.match(value, /HttpOnly/i); assert.match(value, /SameSite=Strict/i); assert.match(value, /Path=\//i);
  cookie = value.split(';', 1)[0];
  return cookie;
}
function save(record: ContentRecord, expectedRevision: number | null, id = submission()) {
  return request('/api/cms/content', { method: 'POST', body: { record, expectedRevision, submissionId: id } });
}
function action(record: ContentRecord, action: 'trash' | 'restore') {
  return request('/api/cms/content/action', { method: 'POST', body: { id: record.id, type: record.type, expectedRevision: record.revision, action } });
}
function track(record: ContentRecord) { const key = `${record.type}:${record.id}`; if (!recordIds.includes(key)) recordIds.push(key); return record; }
async function publicPage(path: string, expected: number, text?: string) {
  const result = await request(path, { cookie: null }); status(result, expected, path);
  if (expected === 200) assert.match(result.text, new RegExp(`<html[^>]*lang="${path === '/th' || path.startsWith('/th/') ? 'th' : 'en'}"`), `${path} document language`);
  if (text) assert.ok(result.text.includes(text), `${path} must server-render its current content`);
  return result;
}
const content = new Map<ContentRecord['type'], ContentRecord>();
try {
  await c.users.insertOne({ _id: userId, username, passwordHash: await hashPassword(password), passwordVersion: 1, createdAt: new Date() });
  await check('Private endpoints reject anonymous sessions and malformed authentication tokens', async () => {
    for (const path of ['/api/cms/content', '/api/cms/media', '/api/cms/inbox', '/api/cms/settings', '/api/cms/export']) {
      status(await request(path, { cookie: null }), 401, path);
      status(await request(path, { cookie: 'moe_cms_session=invalid' }), 401, `${path} malformed session`);
    }
    status(await request('/api/cms/inbox/notify', { method: 'POST', body: { id: randomUUID() }, cookie: null }), 401, 'Private notification retry');
    const anonymous = await request('/api/cms/session', { cookie: null }); status(anonymous, 200, 'Anonymous session'); assert.equal(anonymous.data.user, null);
  });
  await check('Temporary account login sets a private cookie and never exposes its credentials', async () => {
    await login(); const session = await request('/api/cms/session'); status(session, 200, 'Session'); assert.equal(session.data.user?.username, username); assert.ok(!session.text.includes(password));
  });
  await check('Mutation origins, body types, malformed JSON, and oversized bodies are rejected', async () => {
    for (const origin of [null, 'https://foreign.invalid']) status(await request('/api/cms/content', { method: 'POST', body: {}, origin }), 403, 'Origin guard');
    status(await request('/api/cms/content', { method: 'POST', body: {}, headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403, 'Cross-site fetch');
    status(await request('/api/cms/content', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'text/plain' } }), 415, 'Content type');
    status(await request('/api/cms/content', { method: 'POST', raw: '{' }), 400, 'Malformed JSON');
    status(await request('/api/cms/content', { method: 'POST', raw: JSON.stringify({ text: 'x'.repeat(260 * 1024) }) }), 413, 'Oversized JSON');
  });
  const library = await request('/api/cms/media'); status(library, 200, 'Existing QA library');
  const image = library.data.media?.find(item => item.sourcePath)?.url; assert.ok(image, 'QA library requires a migrated baseline image; never borrow another test run’s temporary asset.');
  const pageId = `${runId}-page`;
  const shared = { title: `Workflow ${runId}`, titleTh: `ตรวจสอบ ${runId}`, description: 'Temporary isolated workflow test content.', descriptionTh: 'ข้อมูลชั่วคราวสำหรับตรวจสอบระบบ', category: 'QA', categoryTh: 'ตรวจสอบ', image, imageAlt: 'Illustration', imageAltTh: 'ภาพประกอบ', status: 'Draft' as const, revision: 0 };
  await check('All seven content types create drafts and keep private details unavailable publicly', async () => {
    for (const type of ['Page', 'Vessel', 'Route', 'Project', 'Service', 'News', 'Section'] as const) {
      const record: ContentRecord = { ...shared, id: `${runId}-${type.toLowerCase()}`, type,
        ...(type === 'Section' ? { parentId: pageId, image: '' } : {}),
        ...(type === 'Vessel' ? { vesselSpecs: { imo: '7654329', lengthM: 120, beamM: 22, capacityTeu: 0, flag: 'Thailand', flagTh: 'ไทย' }, gallery: [{ url: image, alt: 'Deck', altTh: 'ดาดฟ้า' }] } : {}),
        ...(type === 'Route' ? { origin: { name: 'QA origin', nameTh: 'ท่าเรือต้นทาง', country: 'Thailand', countryTh: 'ไทย' }, destination: { name: 'QA destination', nameTh: 'ท่าเรือปลายทาง', country: 'Thailand', countryTh: 'ไทย' }, waypoints: [[13, 100], [13.5, 101]] as [number, number][] } : {}),
      };
      track(record); const result = await save(record, null); status(result, 200, `Create ${type}`); assert.ok(result.data.record); content.set(type, result.data.record);
      assert.equal(result.data.record.status, 'Draft'); assert.equal(result.data.record.revision, 1);
      const path = type === 'Page' ? `/${record.id}` : type === 'Vessel' ? `/fleet/${record.id}` : ['Project', 'Service', 'News'].includes(type) ? `/${type === 'News' ? 'news' : `${type.toLowerCase()}s`}/${record.id}` : null;
      if (path) { await publicPage(path, 404); await publicPage(`/th${path}`, 404); }
    }
  });
  await check('Content retry is idempotent and changed payloads cannot reuse its submission', async () => {
    const before = content.get('News')!; const id = submission(); const changed = { ...before, title: `${before.title} retry` };
    const results = await Promise.all([save(changed, before.revision, id), save(changed, before.revision, id)]);
    for (const result of results) status(result, 200, 'Concurrent retry');
    assert.equal(results[0].data.record?.revision, before.revision + 1); assert.deepEqual(results[0].data.record, results[1].data.record);
    content.set('News', results[0].data.record!);
    status(await save({ ...changed, title: 'Different payload' }, before.revision, id), 409, 'Changed save fingerprint');
  });
  await check('Competing edits preserve one winner and reject the stale revision', async () => {
    const before = content.get('Project')!;
    const results = await Promise.all([save({ ...before, title: `${before.title} A` }, before.revision), save({ ...before, title: `${before.title} B` }, before.revision)]);
    assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
    content.set('Project', results.find(result => result.response.status === 200)!.data.record!);
  });
  await check('Every content type publishes into its Thai and English public view', async () => {
    for (const [type, before] of content) {
      const saved = await save({ ...before, status: 'Published' }, before.revision); status(saved, 200, `Publish ${type}`); const record = saved.data.record!; content.set(type, record);
      const path = type === 'Page' ? `/${record.id}` : type === 'Section' ? `/${pageId}` : type === 'Route' ? '/routes' : type === 'Vessel' ? `/fleet/${record.id}` : `/${type === 'News' ? 'news' : `${type.toLowerCase()}s`}/${record.id}`;
      await publicPage(`/th${path}`, 200, record.titleTh); const english = await publicPage(path, 200, record.title);
      assert.match(english.text, /rel="canonical"/); assert.match(english.text, /hrefLang="th"/);
    }
  });
  await check('Invalid identifiers, unavailable Section parents, and invalid hidden fields are rejected', async () => {
    const before = content.get('Section')!;
    for (const parentId of ['', `${runId}-missing`]) status(await save({ ...before, parentId }, before.revision), 400, 'Invalid Section parent');
    const news = content.get('News')!;
    for (const invalid of [{ ...news, id: '../unsafe' }, { ...news, titleTh: '' }, { ...news, image: 'https://unowned.invalid/photo.jpg' }, { ...news, vesselSpecs: { lengthM: 100 } }]) status(await save(invalid, invalid.id === news.id ? news.revision : null), 400, 'Invalid record');
    const list = await request('/api/cms/content'); const home = list.data.records?.find(record => record.type === 'Page' && record.id === 'home'); assert.ok(home, 'QA has core Home page');
    status(await save({ ...home, status: 'Draft' }, home.revision), 400, 'Core page unpublish'); status(await action(home, 'trash'), 400, 'Core page Trash');
  });
  await check('Trash and restore enforce revisions, public exclusion, and parent availability', async () => {
    let page = content.get('Page')!; const section = content.get('Section')!;
    const trashed = await action(page, 'trash'); status(trashed, 200, 'Trash page');
    status(await save(section, section.revision), 400, 'Section of trashed parent'); await publicPage(`/${page.id}`, 404);
    status(await action(page, 'restore'), 409, 'Stale restore'); page = trashed.data.record!;
    const restored = await action(page, 'restore'); status(restored, 200, 'Restore parent'); content.set('Page', restored.data.record!);
    for (const [type, before] of content) {
      if (type === 'Page') continue;
      const removed = await action(before, 'trash'); status(removed, 200, `Trash ${type}`); assert.ok(removed.data.record?.deletedAt);
      status(await save(before, before.revision), 409, 'Cannot edit Trash');
      const restoredItem = await action(removed.data.record!, 'restore'); status(restoredItem, 200, `Restore ${type}`); assert.equal(restoredItem.data.record?.deletedAt, undefined); content.set(type, restoredItem.data.record!);
    }
    const expired: ContentRecord = { ...shared, id: `${runId}-expired`, type: 'News' }; track(expired); const created = await save(expired, null); status(created, 200, 'Expired fixture');
    await c.content.updateOne({ _id: `News:${expired.id}` }, { $set: { deletedAt: new Date(Date.now() - 31 * 86400000).toISOString(), purgeAt: new Date(Date.now() - 1000) } });
    const list = await request('/api/cms/content'); assert.equal(list.data.records?.some(record => record.id === expired.id), false);
    status(await action(created.data.record!, 'restore'), 404, 'Expired Trash cannot restore');
  });
  await check('Website details validate, detect conflicts, refresh, and restore their original values', async () => {
    const initial = await request('/api/cms/settings'); status(initial, 200, 'Read settings'); savedSettings = initial.data.settings!;
    for (const invalid of [{ ...savedSettings, mapUrl: 'javascript:alert(1)' }, { ...savedSettings, email: 'invalid' }, { ...savedSettings, phone: 'not-a-phone' }]) status(await request('/api/cms/settings', { method: 'PUT', body: { settings: invalid, expectedRevision: savedSettings.revision } }), 400, 'Invalid settings');
    const changed = { ...savedSettings, companyName: runId, companyNameTh: `ตรวจสอบ ${runId}`, phone: '+66 123456789' };
    const first = await request('/api/cms/settings', { method: 'PUT', body: { settings: changed, expectedRevision: savedSettings.revision } }); status(first, 200, 'Save details');
    status(await request('/api/cms/settings', { method: 'PUT', body: { settings: savedSettings, expectedRevision: savedSettings.revision } }), 409, 'Stale details');
    const latest = await request('/api/cms/settings'); assert.equal(latest.data.settings?.companyName, runId); assert.equal(latest.data.settings?.revision, savedSettings.revision + 1);
    const restored = await request('/api/cms/settings', { method: 'PUT', body: { settings: savedSettings, expectedRevision: latest.data.settings!.revision } }); status(restored, 200, 'Restore details'); assert.equal(restored.data.settings?.companyName, savedSettings.companyName); savedSettings = undefined;
  });
  await check('Public enquiries validate consent, text, email and honeypots before storing', async () => {
    const body = { name: 'Workflow QA', email: `${runId}@example.com`, company: '', subject: runId, message: 'Temporary isolated API workflow verification.', consent: true, locale: 'en', website: '', submissionId: randomUUID() };
    for (const invalid of [{ ...body, consent: false }, { ...body, name: 'a' }, { ...body, email: 'invalid' }, { ...body, message: 'short' }, { ...body, website: 'spam' }, { ...body, locale: 'unknown' }]) status(await request('/api/contact', { method: 'POST', body: invalid, cookie: null }), 400, 'Invalid enquiry');
    assert.equal(await c.enquiries.countDocuments({ subject: runId }), 0);
  });
  await check('Concurrent enquiry retries store once and status refresh preserves private fields', async () => {
    const email = `${runId}@example.com`; emails.push(email);
    const body = { name: 'Workflow QA', email, company: runId, subject: runId, message: 'Temporary isolated API workflow verification.', consent: true, locale: 'en', website: '', submissionId: randomUUID() };
    const results = await Promise.all(Array.from({ length: 3 }, () => request('/api/contact', { method: 'POST', body, cookie: null })));
    for (const result of results) status(result, 201, 'Concurrent enquiry'); const id = results[0].data.id!; enquiryIds.push(id); assert.ok(results.every(result => result.data.id === id));
    assert.equal(await c.enquiries.countDocuments({ submissionId: body.submissionId }), 1);
    status(await request('/api/contact', { method: 'POST', body: { ...body, message: 'Different content must not overwrite the original.' }, cookie: null }), 409, 'Changed enquiry retry');
    const detail = await request(`/api/cms/inbox?id=${id}`); status(detail, 200, 'Enquiry detail'); const enquiry = detail.data.enquiry!; assert.equal(enquiry.notification?.status, 'not_configured');
    for (const key of ['_id', 'submissionId', 'fingerprint', 'consentAt', 'notificationDelivery']) assert.equal(key in enquiry, false, `Private ${key}`);
    const update = await request('/api/cms/inbox', { method: 'PATCH', body: { id, expectedRevision: enquiry.revision, status: 'In progress' } }); status(update, 200, 'Status update');
    status(await request('/api/cms/inbox', { method: 'PATCH', body: { id, expectedRevision: enquiry.revision, status: 'Resolved' } }), 409, 'Stale status');
    const refreshed = await request(`/api/cms/inbox?id=${id}`); assert.equal(refreshed.data.enquiry?.status, 'In progress');
    status(await request('/api/cms/inbox?id=invalid'), 400, 'Malformed identifier'); status(await request(`/api/cms/inbox?id=${randomUUID()}`), 404, 'Missing enquiry');
    const retry = await request('/api/cms/inbox/notify', { method: 'POST', body: { id } }); status(retry, 200, 'Unconfigured notification'); assert.equal(retry.data.enquiry?.notification?.attempts, 0);
  });
  await check('Inbox pagination preserves all records sharing one timestamp without duplicates', async () => {
    const createdAt = new Date().toISOString(); const fixtures = Array.from({ length: 61 }, (_, index) => {
      const id = randomUUID(); enquiryIds.push(id);
      return { _id: id, id, name: 'Pagination QA', email: `${runId}-page@example.com`, company: runId, subject: `${runId}-page-${index}`, message: 'Temporary pagination fixture.', locale: 'en' as const, status: (['New', 'In progress', 'Resolved'] as const)[index % 3], createdAt, updatedAt: createdAt, revision: 1, submissionId: randomUUID(), fingerprint: runId, consentAt: createdAt, notification: { status: 'not_configured' as const, attempts: 0 } };
    });
    await c.enquiries.insertMany(fixtures); const found: Enquiry[] = []; let cursor: string | null = null; let pages = 0;
    do { const result = await request('/api/cms/inbox' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')); status(result, 200, 'Inbox page'); assert.ok(result.data.enquiries && result.data.enquiries.length <= 50); found.push(...result.data.enquiries); cursor = result.data.nextCursor || null; assert.ok(++pages < 30, 'Pagination must terminate'); } while (cursor);
    assert.equal(new Set(found.map(item => item.id)).size, found.length);
    for (const item of fixtures) assert.equal(found.filter(record => record.id === item.id && record.status === item.status).length, 1);
    status(await request('/api/cms/inbox?cursor=not-a-cursor'), 400, 'Invalid inbox cursor');
  });
  await check('Per-email submission throttling limits new messages while preserving exact retries', async () => {
    const email = `${runId}-limit@example.com`; emails.push(email);
    const body = { name: 'Throttle QA', email, company: runId, subject: runId, message: 'Temporary per-email throttling verification.', consent: true, locale: 'th', website: '', submissionId: randomUUID() };
    for (let index = 0; index < 5; index++) { const result = await request('/api/contact', { method: 'POST', body: { ...body, submissionId: index ? randomUUID() : body.submissionId }, cookie: null }); status(result, 201, 'Allowed enquiry'); enquiryIds.push(result.data.id!); }
    status(await request('/api/contact', { method: 'POST', body: { ...body, submissionId: randomUUID() }, cookie: null }), 429, 'Per-email throttle');
    status(await request('/api/contact', { method: 'POST', body, cookie: null }), 201, 'Retry bypasses new-message throttle');
  });
  await check('Exports and authenticated responses expose content without credentials or delivery secrets', async () => {
    const exported = await request('/api/cms/export'); status(exported, 200, 'Export'); assert.match(exported.response.headers.get('content-disposition') || '', /attachment/i); assert.match(exported.response.headers.get('cache-control') || '', /no-store/i);
    assert.ok(exported.data.records && exported.data.media && exported.data.enquiries); assert.equal('users' in exported.data, false); assert.equal('sessions' in exported.data, false); assert.ok(!exported.text.includes(password));
    for (const enquiry of exported.data.enquiries) for (const key of ['fingerprint', 'consentAt', 'notificationDelivery', 'submissionId']) assert.equal(key in enquiry, false);
  });
  await check('Password changes validate the old password and rotate only the temporary account sessions', async () => {
    const firstSession = cookie; const secondSession = await login();
    const nextPassword = randomBytes(24).toString('base64url');
    status(await request('/api/cms/password', { method: 'POST', body: { currentPassword: 'wrong', newPassword: nextPassword } }), 400, 'Wrong old password');
    status(await request('/api/cms/password', { method: 'POST', body: { currentPassword: password, newPassword: password } }), 400, 'Same password');
    status(await request('/api/cms/password', { method: 'POST', body: { currentPassword: password, newPassword: 'short' } }), 400, 'Short password');
    const changed = await request('/api/cms/password', { method: 'POST', body: { currentPassword: password, newPassword: nextPassword } }); status(changed, 200, 'Temporary password update');
    const rotated = changed.response.headers.getSetCookie().find(value => value.startsWith('moe_cms_session=')); assert.ok(rotated); cookie = rotated.split(';', 1)[0];
    for (const old of [firstSession, secondSession]) status(await request('/api/cms/content', { cookie: old }), 401, 'Old session revoked');
    status(await request('/api/cms/content'), 200, 'Rotated session works');
    status(await request('/api/cms/login', { method: 'POST', body: { username, password }, cookie: null }), 401, 'Old password rejected'); password = nextPassword; await login();
  });
  await check('Expired sessions and logout revoke access without changing saved content', async () => {
    await c.sessions.updateOne({ _id: digest(cookie.split('=', 2)[1]), userId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    status(await request('/api/cms/content'), 401, 'Expired session'); await login(); const previous = cookie;
    status(await request('/api/cms/logout', { method: 'POST', body: {} }), 200, 'Logout'); status(await request('/api/cms/content', { cookie: previous }), 401, 'Revoked session'); cookie = '';
  });
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : 'API workflow rehearsal failed.');
  if (!report.failures.length) report.failures.push(error instanceof Error ? error.message : 'API workflow rehearsal failed.');
} finally {
  if (savedSettings) {
    const latest = await c.settings.findOne({ _id: 'website' });
    if (latest?.companyName === runId) await c.settings.replaceOne({ _id: 'website', revision: latest.revision }, { _id: 'website', ...savedSettings, revision: latest.revision + 1 });
  }
  await c.content.deleteMany({ _id: { $in: recordIds } });
  await c.enquiries.deleteMany({ $or: [{ _id: { $in: enquiryIds }, company: runId }, { company: runId, subject: runId }] });
  await c.operations.deleteMany({ _id: { $in: submissions.map(id => `${userId}:${id}`) } });
  await c.state.deleteMany({ _id: { $in: submissions.map(id => `media-submission:${digest(`${userId}:${id}`)}`) } });
  for (const key of [`login:${username}`, `password:${userId}`, `notification-retry:${userId}`, ...emails.map(email => `contact:${email}`)]) await c.state.deleteMany({ _id: { $regex: `^limit:${digest(key)}:` } });
  await c.sessions.deleteMany({ userId }); await c.users.deleteOne({ _id: userId, username });
  report.cleanup = { contentRemaining: await c.content.countDocuments({ _id: { $in: recordIds } }), enquiriesRemaining: await c.enquiries.countDocuments({ _id: { $in: enquiryIds } }), temporaryUsersRemaining: await c.users.countDocuments({ _id: userId }), temporarySessionsRemaining: await c.sessions.countDocuments({ userId }), sharedMedia: 'Existing image reused; no media created or removed.', existingAccounts: 'Unchanged' };
  await mkdir('.local', { recursive: true }); await writeFile('.local/full-test-api-result.json', `${JSON.stringify(report, null, 2)}\n`);
  await (await getClient()).close();
}
console.log(`${report.checks.length} comprehensive API checks passed; ${report.failures.length} failures. Evidence: .local/full-test-api-result.json`);
