import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BSON, MongoClient } from 'mongodb';
import type { ContentDocument, MediaDocument } from '../src/server/db';
import { appendAuditEvent } from '../src/server/audit';
import { lockMediaSubmission } from '../src/server/media';
import { recordSchema } from '../src/lib/validation';
import { buildLegacyAboutImportPlan, type LegacyAboutImageUrls } from './data/legacy-about-import-plan';
import { legacyAboutImages, legacyAboutMediaOwner, legacyAboutMediaSubmission } from './data/legacy-about';
import { aboutMediaDirectory, verifyAboutImage, type PreparedAboutImage } from './lib/legacy-about-media';
import { canonical, documentHash, sha256 } from './lib/recovery';

// Default: dry-run. Apply only the exact reviewed plan, after media preparation.
// Content, staged-image commits and audit records save in the same transaction.
nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
let client: MongoClient | undefined;
try {
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration is incomplete.');
  const prepared = JSON.parse(await readFile(resolve(aboutMediaDirectory, 'media.json'), 'utf8')) as { images: PreparedAboutImage[] };
  assert.equal(prepared.images.length, 6, 'Prepare all six reviewed About images first.');
  assert.equal(new Set(prepared.images.map(image => image.key)).size, 6, 'The prepared image keys are not distinct.');
  assert.equal(new Set(prepared.images.map(image => image.id)).size, 6, 'The prepared image records are not distinct.');
  client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 20000 }).connect();
  const db = client.db(process.env.MONGODB_DB_NAME), content = db.collection<ContentDocument>('moe_content'), media = db.collection<MediaDocument>('moe_media');
  const sectionIds = ['about-intro', 'about-mission', 'about-vision', 'about-safety', 'about-maintenance', 'about-crew', 'about-office'];
  const filter = { $or: [{ type: 'Page' as const, id: 'about' }, { type: 'Section' as const, $or: [{ parentId: 'about' }, { id: { $in: sectionIds } }] }] };
  const before = await content.find(filter).sort({ _id: 1 }).toArray();
  const settingsBefore = await db.collection('moe_settings').findOne({ _id: 'website' as never });
  assert.equal(settingsBefore?.companyName, 'Moe Navigation Co.,Ltd.', 'The current company identity needs review before importing About content.');
  const mediaBefore = await media.find({ _id: { $in: prepared.images.map(image => image.id) } }).sort({ _id: 1 }).toArray();
  const images = {} as LegacyAboutImageUrls;
  for (const asset of legacyAboutImages) {
    const selected = prepared.images.find(image => image.key === asset.key);
    assert(selected && selected.sha256 === asset.sha256, `The prepared ${asset.key} source differs from the reviewed original.`);
    const saved = mediaBefore.find(image => image._id === selected.id);
    assert(saved && ['staged', 'committed'].includes(saved.state) && saved.url === selected.url && saved.publicId === selected.publicId, `The prepared ${asset.key} image is unavailable or changed.`);
    if (saved.state === 'staged') assert(saved.owner === legacyAboutMediaOwner && saved.submissionId === legacyAboutMediaSubmission, 'A staged image belongs to a different submission.');
    await verifyAboutImage(asset, saved);
    images[asset.key] = saved.url;
  }
  const plan = buildLegacyAboutImportPlan(before, images);
  const staged = mediaBefore.filter(image => image.state === 'staged');
  const planHash = sha256(canonical({ target: sha256(`${process.env.MONGODB_URI}:${process.env.MONGODB_DB_NAME}`), before, settingsBefore, mediaBefore, plan }));
  await mkdir(aboutMediaDirectory, { recursive: true });
  await writeFile(resolve(aboutMediaDirectory, 'plan.json'), JSON.stringify({ reviewedAt: new Date().toISOString(), planHash, ...plan, mediaToCommit: staged.map(image => image.id), settingsWrites: false }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', planHash, ...plan, mediaToCommit: staged.map(image => image.id), settingsWrites: false }, null, 2));
  if (apply) assert.equal(plan.conflicts.length, 0, 'The About plan conflicts with saved content. Nothing was imported.');
  if (apply && (plan.inserts.length || plan.updates.length || staged.length)) {
    assert.equal(expectedPlan, planHash, 'The reviewed plan or saved content changed. Run the dry-run again.');
    const now = new Date().toISOString();
    const additions: ContentDocument[] = plan.inserts.map(record => ({ ...recordSchema.parse(record), _id: `${record.type}:${record.id}`, revision: 1, updatedAt: now }));
    for (const change of plan.updates) {
      const original = before.find(record => record.type === change.type && record.id === change.id);
      assert(original && original.revision === change.expectedRevision && !original.deletedAt, `The original ${change.id} needs review.`);
      recordSchema.parse({ ...original, ...change.patch });
      assert(!['id', 'type', 'parentId', 'revision', 'deletedAt', 'status', 'order'].some(field => field in change.patch), 'About patches cannot change identity, publication, order or retention.');
    }
    const backup = resolve(aboutMediaDirectory, `before-${Date.now()}.json`);
    await writeFile(backup, BSON.EJSON.stringify({ createdAt: now, planHash, content: before, media: mediaBefore, settings: settingsBefore }, null, 2, { relaxed: false }) + '\n', { flag: 'wx', mode: 0o600 });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        assert.equal(documentHash(await content.find(filter, { session }).sort({ _id: 1 }).toArray()), documentHash(before), 'About content changed after the backup.');
        assert.equal(canonical(await db.collection('moe_settings').findOne({ _id: 'website' as never }, { session })), canonical(settingsBefore), 'Website details changed after the review.');
        assert.equal(documentHash(await media.find({ _id: { $in: prepared.images.map(image => image.id) } }, { session }).sort({ _id: 1 }).toArray()), documentHash(mediaBefore), 'Prepared About images changed after the review.');
        if (staged.length) await lockMediaSubmission(db, session, legacyAboutMediaOwner, legacyAboutMediaSubmission);
        for (const record of additions) {
          await content.insertOne(record, { session });
          await appendAuditEvent(db, session, { action: 'content.created', actor: { system: true }, target: { type: 'Section', id: record.id, label: record.title } });
        }
        for (const change of plan.updates) {
          const original = before.find(record => record.type === change.type && record.id === change.id)!;
          const saved = await content.updateOne({ _id: original._id, revision: change.expectedRevision, deletedAt: { $exists: false } }, { $set: { ...change.patch, revision: change.expectedRevision + 1, updatedAt: now } }, { session });
          assert.equal(saved.matchedCount, 1, `Concurrent About edit detected for ${change.id}.`);
          await appendAuditEvent(db, session, { action: 'content.updated', actor: { system: true }, target: { type: original.type, id: original.id, label: change.patch.title || original.title } });
        }
        for (const image of staged) {
          const saved = await media.updateOne({ _id: image._id, state: 'staged', owner: legacyAboutMediaOwner, submissionId: legacyAboutMediaSubmission, touchedAt: image.touchedAt }, { $set: { state: 'committed', pinned: true, touchedAt: new Date(now) } }, { session });
          assert.equal(saved.matchedCount, 1, 'A prepared image changed during the About import.');
          await appendAuditEvent(db, session, { action: 'media.uploaded', actor: { system: true }, target: { type: 'Image', id: image.id, label: image.title } });
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
    const after = await content.find(filter).sort({ _id: 1 }).toArray();
    assert.equal(after.length, before.length + additions.length, 'Unexpected About record count after importing.');
    for (const original of before) {
      const change = plan.updates.find(item => item.id === original.id && item.type === original.type);
      const expected = change ? { ...original, ...change.patch, revision: original.revision + 1, updatedAt: now } : original;
      assert.deepEqual(after.find(record => record._id === original._id), expected, `Unexpected saved fields on ${original.id}.`);
    }
    for (const record of additions) assert.deepEqual(after.find(item => item._id === record._id), record, `Imported section differs for ${record.id}.`);
    assert.deepEqual(await db.collection('moe_settings').findOne({ _id: 'website' as never }), settingsBefore, 'Public contact settings changed.');
    assert.equal(await media.countDocuments({ _id: { $in: prepared.images.map(image => image.id) }, state: 'committed' }), 6, 'About images were not committed together.');
    assert.deepEqual(buildLegacyAboutImportPlan(after, images), { inserts: [], updates: [], conflicts: [] }, 'The About import did not pass idempotency verification.');
    await writeFile(resolve(aboutMediaDirectory, 'applied.json'), JSON.stringify({ appliedAt: now, planHash, backup, inserted: additions.map(record => record.id), updated: plan.updates.map(record => record.id), committedImages: staged.length, verification: { exactSavedRecords: true, currentContactsPreserved: true, idempotent: true }, cacheRefreshRequired: true }, null, 2) + '\n');
    console.log(JSON.stringify({ applied: true, backup, inserted: additions.length, updated: plan.updates.length, committedImages: staged.length, verified: true, cacheRefreshRequired: true }));
  } else if (apply) console.log(JSON.stringify({ applied: false, reason: 'All reviewed About content is already stored.' }));
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : `About import stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details are displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); }
