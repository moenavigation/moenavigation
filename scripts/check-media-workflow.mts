import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { mock } from 'node:test';
import { ZodError } from 'zod';
import nextEnv from '@next/env';

if (!process.argv.includes('--qa')) throw new Error('This write check requires --qa and always uses the isolated QA database.');
nextEnv.loadEnvConfig(process.cwd());
process.env.MONGODB_DB_NAME = `${process.env.MONGODB_DB_NAME}_qa_backend`;
process.env.CLOUDINARY_FOLDER = 'moe-navigation-qa';
const { collections, getDb, getClient } = await import('../src/server/db');
const { uploadMedia, resolveMediaSubmission, commitMedia, removeMedia, mediaProvider, getMedia, getMediaPage, cleanupMedia } = await import('../src/server/media');
const { saveContent, contentAction } = await import('../src/server/content');
const { saveSchema } = await import('../src/server/validation');
const { digest } = await import('../src/server/auth');
const { HttpError } = await import('../src/server/http');
const runId = `qa-media-${randomUUID()}`;
const owner = runId;
const submissions: string[] = [];
const records: string[] = [];
const report = { runId, startedAt: new Date().toISOString(), finishedAt: '', database: process.env.MONGODB_DB_NAME, protectedSharedMedia: 0, checks: [] as string[], media: [] as { id: string; publicId?: string }[], records, submissions, cleanup: '', failure: '' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzGQAAAAASUVORK5CYII=', 'base64');
const submission = () => { const id = randomUUID(); submissions.push(id); return id; };
const c = collections(await getDb());
const sharedMedia = await c.media.find({ state: 'committed', publicId: { $not: /^moe-navigation-qa\// } }).project({ _id: 1, publicId: 1, url: 1, state: 1 }).toArray();
report.protectedSharedMedia = sharedMedia.length;
function uploadRequest(submissionId: string, bytes = png, mime = 'image/png') {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mime }), `${runId}.png`);
  form.set('submissionId', submissionId);
  return new Request('http://localhost:3006/api/cms/media', { method: 'POST', body: form });
}
function section(id: string, mobileImage = '', gallery: { url: string; alt: string; altTh: string }[] = []) {
  records.push(`Section:${id}`);
  return { id, type: 'Section', parentId: 'home', title: 'QA image references', titleTh: 'ตรวจสอบรูปภาพ', description: 'Temporary QA media workflow content.', descriptionTh: 'ข้อมูลชั่วคราวสำหรับตรวจสอบรูปภาพ', category: 'QA', categoryTh: 'ทดสอบ', image: '', mobileImage, gallery, status: 'Draft' };
}
async function check(label: string, run: () => Promise<void>) {
  await run(); report.checks.push(label); console.log(`PASS: ${label}`);
}
async function rejected(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, error => error instanceof HttpError && error.status === status);
}

try {
  await check('Every media mutation requires a session and website origin; library reads require a session', async () => {
    assert.equal((await fetch('http://localhost:3006/api/cms/media', { signal: AbortSignal.timeout(15000) })).status, 401);
    for (const endpoint of ['', '/submission', '/commit', '/remove', '/cleanup']) {
      const url = `http://localhost:3006/api/cms/media${endpoint}`;
      const body = JSON.stringify({ submissionId: submission(), action: 'abort' });
      const anonymous = await fetch(url, { method: 'POST', headers: { Origin: 'http://localhost:3006', 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
      assert.equal(anonymous.status, 401, `${endpoint} session`);
      const foreign = await fetch(url, { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
      assert.equal(foreign.status, 403, `${endpoint} origin`);
    }
  });

  await check('Empty, unsupported, mismatched, malformed and oversized uploads create no media reservations', async () => {
    const before = await c.media.countDocuments({ owner });
    for (const [bytes, mime] of [[Buffer.alloc(0), 'image/png'], [png, 'image/jpeg'], [Buffer.from('<svg></svg>'), 'image/svg+xml'], [Buffer.from('not image data'), 'image/png'], [Buffer.alloc(3 * 1024 * 1024 + 1), 'image/png']] as const) {
      await rejected(uploadMedia(uploadRequest(submission(), bytes, mime), owner), 400);
    }
    const missing = new FormData(); missing.set('submissionId', submission());
    await rejected(uploadMedia(new Request('http://localhost:3006/api/cms/media', { method: 'POST', body: missing }), owner), 400);
    await rejected(uploadMedia(new Request('http://localhost:3006/api/cms/media', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'invalid form' }), owner), 400);
    await assert.rejects(uploadMedia(uploadRequest('not-a-submission-id'), owner), error => error instanceof ZodError);
    await rejected(uploadMedia(new Request('http://localhost:3006/api/cms/media', { method: 'POST', headers: { 'Content-Length': String(3 * 1024 * 1024 + 65537) }, body: 'declared too large' }), owner), 413);
    await rejected(uploadMedia(new Request('http://localhost:3006/api/cms/media', { method: 'POST', body: Buffer.alloc(3 * 1024 * 1024 + 65537) }), owner), 413);
    assert.equal(await c.media.countDocuments({ owner }), before);
  });

  await check('Real Cloudinary upload retries reuse one asset; abort deletes only its owner’s unfinished upload', async () => {
    const id = submission();
    const first = await uploadMedia(uploadRequest(id), owner);
    report.media.push({ id: first.id, publicId: first.publicId });
    const retry = await uploadMedia(uploadRequest(id), owner);
    assert.equal(retry.id, first.id);
    assert.equal(retry.publicId, first.publicId);
    assert.equal(await c.media.countDocuments({ owner, submissionId: id }), 1);
    const other = await resolveMediaSubmission(id, `${owner}-other`, 'abort');
    assert.equal(other.deleted, 0);
    assert.ok(await c.media.findOne({ _id: first.id }));
    const aborted = await resolveMediaSubmission(id, owner, 'abort');
    assert.equal(aborted.status, 'aborted'); assert.equal(aborted.deleted, 1);
    assert.equal(await c.media.findOne({ _id: first.id }), null);
    assert.equal((await resolveMediaSubmission(id, owner, 'abort')).deleted, 0);
    await rejected(uploadMedia(uploadRequest(id), owner), 409);
    await rejected(saveContent(saveSchema.parse({ record: section(`${runId}-aborted`), expectedRevision: null, submissionId: id }), owner), 409);
    assert.deepEqual(await removeMedia(first.id), { removed: true });
  });

  await check('Staged images stay private to their owner and exact save; failed saves preserve them for retry', async () => {
    const id = submission();
    const media = await uploadMedia(uploadRequest(id), owner);
    report.media.push({ id: media.id, publicId: media.publicId });
    assert.equal((await getMedia()).some(item => item.id === media.id), false);
    assert.equal((await getMediaPage(null)).media.some(item => item.id === media.id), false);
    await rejected(commitMedia(media.id, id, 'Wrong owner', `${owner}-other`), 403);
    await rejected(commitMedia(media.id, submission(), 'Wrong submission', owner), 403);
    const record = section(`${runId}-staged-owner`, media.url);
    await rejected(saveContent(saveSchema.parse({ record, expectedRevision: null, submissionId: id }), `${owner}-other`), 403);
    await rejected(saveContent(saveSchema.parse({ record, expectedRevision: null, submissionId: submission() }), owner), 403);
    await rejected(saveContent(saveSchema.parse({ record, expectedRevision: 999, submissionId: id }), owner), 409);
    assert.equal((await c.media.findOne({ _id: media.id }))?.state, 'staged');
    assert.equal(await c.content.findOne({ _id: `Section:${record.id}` }), null);
    const saved = await saveContent(saveSchema.parse({ record, expectedRevision: null, submissionId: id }), owner);
    assert.equal(saved.revision, 1);
    assert.equal((await getMedia()).some(item => item.id === media.id), true);
    assert.equal((await c.media.findOne({ _id: media.id }))?.state, 'committed');
    await rejected(saveContent(saveSchema.parse({ record: { ...record, title: 'Changed replay' }, expectedRevision: null, submissionId: id }), owner), 409);
  });

  await check('Uncertain committed saves resolve authoritatively and mobile/gallery/Trash references prevent removal', async () => {
    const id = submission();
    const media = await uploadMedia(uploadRequest(id), owner);
    report.media.push({ id: media.id, publicId: media.publicId });
    const record = section(`${runId}-references`, media.url);
    const saved = await saveContent(saveSchema.parse({ record, expectedRevision: null, submissionId: id }), owner);
    const resolved = await resolveMediaSubmission(id, owner, 'abort');
    assert.equal(resolved.status, 'committed'); assert.equal(resolved.record?.revision, saved.revision); assert.equal(resolved.deleted, 0);
    await rejected(removeMedia(media.id), 409);
    const replay = await saveContent(saveSchema.parse({ record, expectedRevision: null, submissionId: id }), owner);
    assert.equal(replay.revision, saved.revision);
    const updated = await saveContent(saveSchema.parse({ record: { ...saved, mobileImage: '', gallery: [{ url: media.url, alt: 'Deck', altTh: 'ดาดฟ้า' }] }, expectedRevision: saved.revision, submissionId: submission() }), owner);
    await rejected(removeMedia(media.id), 409);
    await contentAction({ id: updated.id, type: updated.type, expectedRevision: updated.revision, action: 'trash' });
    await rejected(removeMedia(media.id), 409);
    assert.ok(await c.media.findOne({ _id: media.id, state: 'committed' }));
    const trashed = await c.content.findOne({ _id: `Section:${record.id}` });
    assert.ok(trashed?.revision);
    await contentAction({ id: record.id, type: 'Section', expectedRevision: trashed.revision, action: 'restore' });
    await rejected(removeMedia(media.id), 409);
  });

  await check('Standalone library commits survive abort and replay without changing the saved title', async () => {
    const id = submission();
    const media = await uploadMedia(uploadRequest(id), owner);
    report.media.push({ id: media.id, publicId: media.publicId });
    await commitMedia(media.id, id, 'QA library image', owner);
    const result = await resolveMediaSubmission(id, owner, 'abort');
    assert.equal(result.status, 'committed'); assert.equal(result.media[0].id, media.id); assert.equal(result.deleted, 0);
    assert.equal((await commitMedia(media.id, id, 'Changed retry title', owner)).title, 'QA library image');
    assert.equal((await getMedia()).some(item => item.id === media.id), true);
    assert.equal((await uploadMedia(uploadRequest(id), owner)).id, media.id);
  });

  await check('A lost provider upload response recovers the exact asset without uploading it again', async () => {
    const id = submission();
    const provider = mediaProvider();
    let uploadCalls = 0;
    let resourceCalls = 0;
    const uploadMock = mock.method(provider.uploader, 'upload_stream', (_options: object, callback: (error: Error) => void) => {
      uploadCalls++;
      return new Writable({ write(_chunk, _encoding, done) { done(); }, final(done) { callback(new Error('Simulated lost provider response')); done(); } });
    });
    const resourceMock = mock.method(provider.api, 'resource', async (publicId: string) => {
      resourceCalls++;
      return { public_id: publicId, secure_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}.png`, bytes: png.length };
    });
    const deleteMock = mock.method(provider.uploader, 'destroy', async () => ({ result: 'not found' }));
    try {
      const recovered = await uploadMedia(uploadRequest(id), owner);
      report.media.push({ id: recovered.id, publicId: recovered.publicId });
      assert.equal(recovered.state, 'staged');
      assert.equal((await uploadMedia(uploadRequest(id), owner)).id, recovered.id);
      assert.equal(uploadCalls, 1); assert.equal(resourceCalls, 1);
      assert.equal((await resolveMediaSubmission(id, owner, 'abort')).deleted, 1);
    } finally { uploadMock.mock.restore(); resourceMock.mock.restore(); deleteMock.mock.restore(); }
  });

  await check('Concurrent save and abort serialize to one authoritative outcome', async () => {
    for (let index = 0; index < 4; index++) {
      const id = submission();
      const record = section(`${runId}-race-${index}`);
      const input = saveSchema.parse({ record, expectedRevision: null, submissionId: id });
      const results = await Promise.allSettled([saveContent(input, owner), resolveMediaSubmission(id, owner, 'abort')]);
      const resolved = await resolveMediaSubmission(id, owner, 'abort');
      const persisted = await c.content.findOne({ _id: `Section:${record.id}` });
      if (persisted) {
        assert.equal(resolved.status, 'committed'); assert.equal(resolved.record?.id, record.id);
        assert.equal(results[0].status, 'fulfilled');
      } else {
        assert.equal(resolved.status, 'aborted'); assert.equal(results[0].status, 'rejected');
        if (results[0].status === 'rejected') assert.equal(results[0].reason.status, 409);
      }
    }
  });

  for (const expired of [false, true]) await check(expired ? 'An expired upload reservation still cleans a provider response arriving after abort' : 'An upload finishing after cancellation deletes its own late asset', async () => {
    const id = submission();
    const provider = mediaProvider();
    let release!: () => void;
    let started!: () => void;
    const uploading = new Promise<void>(resolve => { started = resolve; });
    const deleted: string[] = [];
    const uploadMock = mock.method(provider.uploader, 'upload_stream', (options: { public_id: string }, callback: (error: null, result: object) => void) => {
      release = () => callback(null, { public_id: options.public_id, secure_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${options.public_id}.png`, bytes: png.length });
      started();
      return new Writable({ write(_chunk, _encoding, done) { done(); } });
    });
    const deleteMock = mock.method(provider.uploader, 'destroy', async (publicId: string) => { deleted.push(publicId); return { result: 'ok' }; });
    try {
      const upload = uploadMedia(uploadRequest(id), owner);
      // Attach the rejection handler before releasing the simulated provider response.
      const settled = upload.then(() => null, error => error);
      await uploading;
      await rejected(uploadMedia(uploadRequest(id), owner), 409);
      const reserved = await c.media.findOne({ owner, submissionId: id });
      assert.ok(reserved);
      report.media.push({ id: reserved.id, publicId: reserved.publicId });
      if (expired) await c.media.updateOne({ _id: reserved.id }, { $set: { touchedAt: new Date(0) } });
      const pending = await resolveMediaSubmission(id, owner, 'abort');
      assert.equal(pending.status, expired ? 'aborted' : 'pending');
      assert.equal(pending.pending, expired ? 0 : 1); assert.equal(deleted.length, expired ? 1 : 0);
      release();
      const error = await settled;
      assert.ok(error instanceof HttpError); assert.equal(error.status, 409);
      assert.equal(deleted.length, expired ? 2 : 1);
      assert.equal(await c.media.countDocuments({ owner, submissionId: id }), 0);
      assert.equal((await resolveMediaSubmission(id, owner, 'resolve')).status, 'aborted');
    } finally { uploadMock.mock.restore(); deleteMock.mock.restore(); }
  });

  await check('Failed rollback retains the exact asset for an idempotent cleanup retry', async () => {
    const id = submission();
    const mediaId = digest(`${runId}:delete-retry`);
    const publicId = `moe-navigation-qa/${mediaId}`;
    report.media.push({ id: mediaId, publicId });
    await c.media.insertOne({ _id: mediaId, id: mediaId, title: 'Simulated failed deletion', owner, submissionId: id, publicId, url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}.png`, state: 'staged', pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date() });
    let attempt = 0;
    const provider = mediaProvider();
    const deletionMock = mock.method(provider.uploader, 'destroy', async () => { if (!attempt++) throw new Error('Simulated provider interruption'); return { result: 'not found' }; });
    try {
      const failed = await resolveMediaSubmission(id, owner, 'abort');
      assert.equal(failed.status, 'aborted'); assert.equal(failed.failed, 1);
      assert.equal((await c.media.findOne({ _id: mediaId }))?.state, 'deleting');
      const retry = await resolveMediaSubmission(id, owner, 'abort');
      assert.equal(retry.deleted, 1); assert.equal(retry.failed, 0);
      assert.equal(await c.media.findOne({ _id: mediaId }), null);
    } finally { deletionMock.mock.restore(); }
  });

  await check('Manual cleanup moves old unused saved images to Media Trash while removing stale uploads', async () => {
    // Use an entirely separate, newly created database for the global cleanup
    // scan so concurrent browser/API fixtures and migrated images are untouched.
    const previousDatabase = process.env.MONGODB_DB_NAME!;
    const isolatedName = `qa_media_cleanup_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const isolatedDb = (await getClient()).db(isolatedName);
    assert.equal((await isolatedDb.listCollections().toArray()).length, 0);
    const scoped = collections(isolatedDb);
    const expired = new Date(0);
    const now = new Date();
    const rows = ['staged', 'deleting', 'uploading', 'retry', 'fresh-staged', 'fresh-uploading', 'fresh-committed', 'pinned', 'committed', 'committed-pinned', 'committed-active', 'committed-trashed', 'foreign-folder', 'referenced', 'trashed-gallery'].map(label => {
      const id = digest(`${runId}:cleanup:${label}`);
      const publicId = `${label === 'foreign-folder' ? 'outside-managed-folder' : 'moe-navigation-qa'}/${id}`;
      return { _id: id, id, title: label, publicId, url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}.png`, owner, submissionId: randomUUID(), state: (label.includes('committed') ? 'committed' : label.includes('uploading') ? 'uploading' : label === 'deleting' || label === 'retry' ? 'deleting' : 'staged') as 'staged' | 'uploading' | 'deleting' | 'committed', pinned: label === 'pinned' || label === 'committed-pinned', touchedAt: label.startsWith('fresh-') ? now : expired, createdAt: now.toISOString() };
    });
    let deleteMock: ReturnType<typeof mock.method> | undefined;
    try {
      await scoped.media.insertMany(rows);
      await scoped.state.insertOne({ _id: runId });
      const base = saveSchema.parse({ record: section(`${runId}-isolated-references`), expectedRevision: null, submissionId: randomUUID() }).record;
      await scoped.content.insertOne({ _id: `Section:${base.id}`, ...base, image: rows.find(row => row.title === 'referenced')!.url, gallery: [
        { url: rows.find(row => row.title === 'trashed-gallery')!.url, alt: '', altTh: '' },
        { url: rows.find(row => row.title === 'committed-trashed')!.url, alt: '', altTh: '' },
      ], deletedAt: now.toISOString(), purgeAt: new Date(Date.now() + 86400000) });
      const activeId = `${runId}-isolated-active`;
      await scoped.content.insertOne({ _id: `Section:${activeId}`, ...base, id: activeId, image: rows.find(row => row.title === 'committed-active')!.url });
      const removed: string[] = [];
      let retryFailed = false;
      const retryId = rows.find(row => row.title === 'retry')!.publicId;
      deleteMock = mock.method(mediaProvider().uploader, 'destroy', async (publicId: string) => {
        if (publicId === retryId && !retryFailed) { retryFailed = true; throw new Error('Simulated cleanup interruption'); }
        removed.push(publicId); return { result: 'not found' };
      });
      process.env.MONGODB_DB_NAME = isolatedName;
      assert.deepEqual(await cleanupMedia(), { trashed: 2, deleted: 3, failed: 1 });
      assert.deepEqual(await cleanupMedia(), { trashed: 0, deleted: 1, failed: 0 });
      assert.deepEqual(await cleanupMedia(), { trashed: 0, deleted: 0, failed: 0 });
      assert.deepEqual(new Set(removed), new Set(rows.filter(row => ['staged', 'deleting', 'uploading', 'retry'].includes(row.title)).map(row => row.publicId)));
      assert.equal(await scoped.media.countDocuments({}), rows.length - 4);
      for (const title of ['committed', 'committed-pinned']) {
        const row = await scoped.media.findOne({ title });
        assert.equal(row?.state, 'trashed');
        assert.ok(row?.trashedAt);
      }
      for (const title of ['fresh-committed', 'committed-active', 'committed-trashed']) {
        assert.equal((await scoped.media.findOne({ title }))?.state, 'committed');
      }
      // Permanent deletion is a separate, explicit action after an image has
      // been moved to recoverable Media Trash.
      const trashed = rows.find(row => row.title === 'committed')!;
      assert.deepEqual(await removeMedia(trashed.id), { removed: true });
      assert.equal(await scoped.media.findOne({ _id: trashed.id }), null);
      assert.ok(removed.includes(trashed.publicId));
    } finally {
      process.env.MONGODB_DB_NAME = previousDatabase;
      deleteMock?.mock.restore();
      // This exact name was verified empty before this test created its rows.
      assert.ok(isolatedName.startsWith('qa_media_cleanup_') && isolatedName !== previousDatabase);
      await isolatedDb.dropDatabase();
    }
  });
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const codeName = error && typeof error === 'object' && 'codeName' in error ? String(error.codeName) : '';
  const detail = error instanceof assert.AssertionError || error instanceof HttpError ? error.message : error instanceof Error ? `${error.name}${code ? ` (${code}${codeName ? ` ${codeName}` : ''})` : ''}` : 'UnknownError';
  console.error(`Media workflow verification failed: ${detail}`);
  report.failure = detail;
  process.exitCode = 1;
} finally {
  mock.restoreAll();
  try {
    // Every key comes from this run; no shared QA or production content is purged.
    if (records.length) await c.content.deleteMany({ _id: { $in: records }, id: { $regex: `^${runId}` } });
    const leftovers = await c.media.find({ owner }).toArray();
    for (const item of leftovers) {
      if (!item.publicId?.startsWith('moe-navigation-qa/')) throw new Error('Unexpected QA media folder');
      await removeMedia(item.id);
    }
    await c.operations.deleteMany({ _id: { $in: submissions.map(id => `${owner}:${id}`) } });
    await c.state.deleteMany({ _id: { $in: [owner, `${owner}-other`].flatMap(user => submissions.map(id => `media-submission:${digest(`${user}:${id}`)}`)) } });
    await c.state.deleteMany({ _id: { $regex: `^limit:${digest(`upload:${owner}`)}:\\d+$` } });
    assert.equal(await c.media.countDocuments({ owner }), 0);
    assert.equal(await c.content.countDocuments({ _id: { $in: records }, id: { $regex: `^${runId}` } }), 0);
    for (const original of sharedMedia) assert.deepEqual(await c.media.findOne({ _id: original._id }, { projection: { _id: 1, publicId: 1, url: 1, state: 1 } }), original);
    report.checks.push('All shared migrated media remain unchanged after exact fixture cleanup');
    report.cleanup = 'Removed only this run’s exact content, media, operation, and submission keys.';
  } catch (error) {
    report.cleanup = error instanceof HttpError ? error.message : 'Review this run’s exact artifacts; automatic cleanup could not finish.';
    process.exitCode = 1;
  }
  await mkdir('.local', { recursive: true });
  report.finishedAt = new Date().toISOString();
  await writeFile('.local/media-workflow-result.json', `${JSON.stringify(report, null, 2)}\n`);
  await writeFile('.local/full-test-media-result.json', `${JSON.stringify(report, null, 2)}\n`);
  await getClient().then(client => client.close()).catch(() => {});
  console.log(`${report.checks.length} media workflow checks completed. Manifest: .local/media-workflow-result.json`);
}
