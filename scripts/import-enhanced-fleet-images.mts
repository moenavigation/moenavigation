import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, sep } from 'node:path';
import { BSON, MongoClient } from 'mongodb';
import type { ContentDocument, MediaDocument } from '../src/server/db';
import { getClient } from '../src/server/db';
import { appendAuditEvent } from '../src/server/audit';
import { lockMediaSubmission, uploadMedia, mediaProvider } from '../src/server/media';
import { recordSchema } from '../src/lib/validation';
import { canonical, documentHash, sha256 } from './lib/recovery';
import { metadataMatches, type MigrationProviderAsset } from './lib/migration-media';
import { aboutDeliveryHash } from './lib/legacy-about-media';
import { buildEnhancedFleetPlan, enhancedFleetOwner, enhancedFleetSubmission, enhancedFleetSelection as selection } from './data/enhanced-fleet-import-plan';

// --stage uploads reviewed media only. Default previews the image-only content
// patch. --apply requires its exact plan hash and commits media/content/audit together.
nextEnv.loadEnvConfig(process.cwd());
const directory = resolve('.local/enhanced-fleet-import-2026-11-17');
const stage = process.argv.includes('--stage'), apply = process.argv.includes('--apply');
const expected = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
type Prepared = { key: string; vesselId: string; variant: string; id: string; url: string; publicId: string; sha256: string };
let client: MongoClient | undefined, usedUpload = false;
async function sourceBytes(asset: typeof selection.assets[number]) {
  const path = resolve('public', '.' + asset.url);
  assert(path.startsWith(resolve('public/images/fleet-enhanced') + sep), 'Unexpected fleet image location.');
  const bytes = await readFile(path);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(sha256(bytes), asset.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    assert(!['EXIF', 'XMP ', 'ICCP'].includes(chunk), 'Image metadata needs removal.');
    offset += 8 + length + length % 2;
  }
  return bytes;
}
async function verify(asset: typeof selection.assets[number], image: { publicId?: string; url: string }) {
  assert(image.publicId);
  const remote = await mediaProvider().api.resource(image.publicId, { resource_type: 'image' }) as MigrationProviderAsset;
  assert.equal(remote.public_id, image.publicId);
  assert.equal(remote.secure_url, image.url);
  assert(metadataMatches({ ...asset, sourcePath: asset.url }, remote), 'Prepared image dimensions or bytes differ.');
  assert.equal(await aboutDeliveryHash(remote), asset.sha256, 'Remote photo differs from the reviewed prepared image.');
}
try {
  assert(!(stage && apply), 'Stage and apply are separate operations.');
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration missing.');
  assert.equal(selection.assets.length, 14);
  assert.equal(new Set(selection.assets.map(asset => asset.sha256)).size, 14);
  for (const asset of selection.assets) await sourceBytes(asset);
  await mkdir(directory, { recursive: true });
  client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 20000 }).connect();
  const db = client.db(process.env.MONGODB_DB_NAME), content = db.collection<ContentDocument>('moe_content'), media = db.collection<MediaDocument>('moe_media');
  const before = await content.find({ type: 'Vessel' }).sort({ _id: 1 }).toArray();
  const localUrls = Object.fromEntries(selection.assets.map(asset => [asset.url, asset.url]));
  buildEnhancedFleetPlan(before, localUrls); // Check IDs/names before any provider write.
  assert.equal(before.filter(record => record.id === 'dumai-moe').length, 1, 'DUMAI MOE needs preservation review.');
  if (stage) {
    const images: Prepared[] = [];
    for (const asset of selection.assets) {
      const id = sha256(`${enhancedFleetOwner}:${enhancedFleetSubmission}:${asset.sha256}`);
      let saved = await media.findOne({ _id: id });
      if (saved) {
        assert.equal(saved.owner, enhancedFleetOwner);
        assert.equal(saved.submissionId, enhancedFleetSubmission);
        assert(['uploading', 'staged', 'committed'].includes(saved.state), 'Prepared image is unavailable.');
      }
      if (!saved || saved.state === 'uploading') {
        const form = new FormData();
        form.set('submissionId', enhancedFleetSubmission);
        form.set('file', new File([new Uint8Array(await sourceBytes(asset))], basename(asset.url), { type: 'image/webp' }));
        usedUpload = true;
        await uploadMedia(new Request('http://localhost/maintenance/enhanced-fleet', { method: 'POST', body: form }), enhancedFleetOwner);
        saved = await media.findOne({ _id: id });
      }
      assert(saved && ['staged', 'committed'].includes(saved.state));
      await verify(asset, saved);
      images.push({ key: `${asset.vesselId}:${asset.variant}`, vesselId: asset.vesselId, variant: asset.variant, id, url: saved.url, publicId: saved.publicId!, sha256: asset.sha256 });
      console.log(JSON.stringify({ prepared: asset.vesselId, variant: asset.variant, verified: true }));
    }
    await writeFile(resolve(directory, 'live-media.json'), JSON.stringify({ images }, null, 2) + '\n');
    console.log(JSON.stringify({ staged: images.length, contentWrites: false }));
  } else {
    const prepared = JSON.parse(await readFile(resolve(directory, 'live-media.json'), 'utf8')) as { images: Prepared[] };
    assert.equal(prepared.images.length, 14);
    assert.equal(new Set(prepared.images.map(image => image.id)).size, 14);
    const mediaBefore = await media.find({ _id: { $in: prepared.images.map(image => image.id) } }).sort({ _id: 1 }).toArray();
    const urls: Record<string, string> = {};
    for (const asset of selection.assets) {
      const image = prepared.images.find(item => item.key === `${asset.vesselId}:${asset.variant}`);
      assert(image && image.sha256 === asset.sha256);
      const saved = mediaBefore.find(item => item._id === image.id);
      assert(saved && ['staged', 'committed'].includes(saved.state) && saved.url === image.url && saved.publicId === image.publicId);
      assert.equal(saved.owner, enhancedFleetOwner);
      assert.equal(saved.submissionId, enhancedFleetSubmission);
      await verify(asset, saved);
      urls[asset.url] = saved.url;
    }
    const updates = buildEnhancedFleetPlan(before, urls), staged = mediaBefore.filter(image => image.state === 'staged');
    const planHash = sha256(canonical({ target: sha256(`${process.env.MONGODB_URI}:${process.env.MONGODB_DB_NAME}`), before, mediaBefore, updates }));
    await writeFile(resolve(directory, 'plan.json'), JSON.stringify({ planHash, updates, staged: staged.map(item => item.id), dumaiUnchanged: true }, null, 2) + '\n');
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', planHash, vessels: updates.map(item => ({ id: item.id, name: item.name, galleryImages: item.patch.gallery?.length })), mediaToCommit: staged.length }));
    if (apply && (updates.length || staged.length)) {
      assert.equal(expected, planHash, 'Saved content or the plan changed; review the dry-run again.');
      for (const change of updates) recordSchema.parse({ ...before.find(record => record.id === change.id), ...change.patch });
      const now = new Date().toISOString(), backup = resolve(directory, `before-${Date.now()}.json`);
      await writeFile(backup, BSON.EJSON.stringify({ createdAt: now, planHash, content: before, media: mediaBefore }, null, 2, { relaxed: false }) + '\n', { flag: 'wx', mode: 0o600 });
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          assert.equal(documentHash(await content.find({ type: 'Vessel' }, { session }).sort({ _id: 1 }).toArray()), documentHash(before), 'A vessel changed after review.');
          assert.equal(documentHash(await media.find({ _id: { $in: prepared.images.map(image => image.id) } }, { session }).sort({ _id: 1 }).toArray()), documentHash(mediaBefore), 'Prepared media changed after review.');
          if (staged.length) await lockMediaSubmission(db, session, enhancedFleetOwner, enhancedFleetSubmission);
          for (const change of updates) {
            const original = before.find(record => record.id === change.id)!;
            const saved = await content.updateOne({ _id: original._id, revision: change.expectedRevision, deletedAt: { $exists: false } }, { $set: { ...change.patch, revision: change.expectedRevision + 1, updatedAt: now } }, { session });
            assert.equal(saved.matchedCount, 1, 'Concurrent vessel edit detected.');
            await appendAuditEvent(db, session, { action: 'content.updated', actor: { system: true }, target: { type: 'Vessel', id: change.id, label: change.name } });
          }
          for (const image of staged) {
            const saved = await media.updateOne({ _id: image._id, state: 'staged', owner: enhancedFleetOwner, submissionId: enhancedFleetSubmission, touchedAt: image.touchedAt }, { $set: { state: 'committed', pinned: true, touchedAt: new Date(now) } }, { session });
            assert.equal(saved.matchedCount, 1);
            await appendAuditEvent(db, session, { action: 'media.uploaded', actor: { system: true }, target: { type: 'Image', id: image.id, label: image.title } });
          }
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } finally { await session.endSession(); }
      const after = await content.find({ type: 'Vessel' }).sort({ _id: 1 }).toArray();
      assert.equal(after.length, before.length);
      for (const original of before) {
        const change = updates.find(item => item.id === original.id);
        const wanted = change ? { ...original, ...change.patch, revision: original.revision + 1, updatedAt: now } : original;
        assert.deepEqual(after.find(record => record._id === original._id), wanted, `Unexpected saved changes to ${original.id}.`);
      }
      assert.equal(await media.countDocuments({ _id: { $in: prepared.images.map(image => image.id) }, state: 'committed' }), 14);
      assert.deepEqual(buildEnhancedFleetPlan(after, urls), [], 'Import is not idempotent.');
      await writeFile(resolve(directory, 'after-vessels.json'), BSON.EJSON.stringify(after, null, 2, { relaxed: false }) + '\n');
      await writeFile(resolve(directory, 'live-media.json'), JSON.stringify({ images: prepared.images, vessels: after.map(record => ({ id: record.id, name: record.title, image: record.image, imageAlt: record.imageAlt, imageAltTh: record.imageAltTh, gallery: record.gallery })) }, null, 2) + '\n');
      await writeFile(resolve(directory, 'applied.json'), JSON.stringify({ appliedAt: now, planHash, backup, updated: updates.map(item => item.id), committedImages: staged.length, dumaiEntireRecordUnchanged: true, otherVesselFieldsPreserved: true, idempotent: true }, null, 2) + '\n');
      console.log(JSON.stringify({ applied: true, updated: updates.length, committedImages: staged.length, dumaiEntireRecordUnchanged: true, verified: true, cacheRefreshRequired: true }));
    }
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : `Fleet photo import stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); if (usedUpload) await getClient().then(connection => connection.close()).catch(() => {}); }
