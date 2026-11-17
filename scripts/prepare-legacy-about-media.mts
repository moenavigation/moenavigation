import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { MongoClient } from 'mongodb';
import type { MediaDocument } from '../src/server/db';
import { getClient } from '../src/server/db';
import { mediaFolder, mediaProvider, uploadMedia } from '../src/server/media';
import { legacyAboutImages, legacyAboutMediaOwner, legacyAboutMediaSubmission } from './data/legacy-about';
import { findReusableMedia, type MigrationProviderAsset } from './lib/migration-media';
import { aboutDeliveryHash, aboutMediaDirectory, legacyAboutSourceBytes, sha256, verifyAboutImage, type PreparedAboutImage } from './lib/legacy-about-media';

// Default: read-only provider/database preview. --upload stages reviewed media
// through the regular upload workflow; a separate content transaction commits it.
nextEnv.loadEnvConfig(process.cwd());
const upload = process.argv.includes('--upload');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
let client: MongoClient | undefined, usedUpload = false;
try {
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration is incomplete.');
  client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 20000 }).connect();
  const media = client.db(process.env.MONGODB_DB_NAME).collection<MediaDocument>('moe_media');
  const existing = await media.find({ state: 'committed' }).toArray();
  const provider = mediaProvider();
  const entries: (PreparedAboutImage & { action: 'reuse' | 'staged' | 'upload' })[] = [];
  for (const asset of legacyAboutImages) {
    await legacyAboutSourceBytes(asset);
    const reusable = await findReusableMedia(asset, existing, mediaFolder(), async item =>
      provider.api.resource(item.publicId!, { resource_type: 'image' }) as Promise<MigrationProviderAsset>, aboutDeliveryHash);
    if (reusable) {
      entries.push({ key: asset.key, id: reusable.media.id, url: reusable.media.url, publicId: reusable.media.publicId!, sha256: asset.sha256, action: 'reuse' });
      continue;
    }
    const id = sha256(`${legacyAboutMediaOwner}:${legacyAboutMediaSubmission}:${asset.sha256}`);
    const staged = await media.findOne({ _id: id });
    if (staged) {
      assert.equal(staged.owner, legacyAboutMediaOwner);
      assert.equal(staged.submissionId, legacyAboutMediaSubmission);
      assert(['staged', 'committed', 'uploading'].includes(staged.state), `Prepared image ${asset.key} is no longer available.`);
      if (staged.state !== 'uploading') {
        await verifyAboutImage(asset, staged);
        entries.push({ key: asset.key, id, url: staged.url, publicId: staged.publicId!, sha256: asset.sha256, action: staged.state === 'committed' ? 'reuse' : 'staged' });
        continue;
      }
    }
    entries.push({ key: asset.key, id, url: '', publicId: `${mediaFolder()}/${id}`, sha256: asset.sha256, action: 'upload' });
  }
  const planHash = sha256(JSON.stringify({ target: sha256(`${process.env.MONGODB_URI}:${process.env.MONGODB_DB_NAME}`), entries, sources: legacyAboutImages }));
  await mkdir(aboutMediaDirectory, { recursive: true });
  await writeFile(resolve(aboutMediaDirectory, 'media-plan.json'), JSON.stringify({ planHash, entries, images: legacyAboutImages }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: upload ? 'upload' : 'dry-run', planHash, entries, contentWrites: false }, null, 2));
  if (upload) {
    assert.equal(expectedPlan, planHash, 'The reviewed media plan changed. Run the dry-run again.');
    const prepared: PreparedAboutImage[] = [];
    for (const entry of entries) {
      const asset = legacyAboutImages.find(image => image.key === entry.key)!;
      if (entry.action === 'upload') {
        const form = new FormData();
        form.set('submissionId', legacyAboutMediaSubmission);
        form.set('file', new File([new Uint8Array(await legacyAboutSourceBytes(asset))], basename(asset.sourcePath), { type: 'image/webp' }));
        usedUpload = true;
        const saved = await uploadMedia(new Request('http://localhost/maintenance/legacy-about', { method: 'POST', body: form }), legacyAboutMediaOwner);
        assert.equal(saved.id, entry.id);
        entry.url = saved.url; entry.publicId = saved.publicId!;
      }
      await verifyAboutImage(asset, entry);
      prepared.push({ key: entry.key, id: entry.id, url: entry.url, publicId: entry.publicId, sha256: entry.sha256 });
    }
    await writeFile(resolve(aboutMediaDirectory, 'media.json'), JSON.stringify({ preparedAt: new Date().toISOString(), planHash, images: prepared }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ prepared: true, images: prepared.length, contentWrites: false, nextStep: 'Review the About content import dry-run. New uploads remain staged until that transaction succeeds.' }));
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : `About media preparation stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details are displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); if (usedUpload) await getClient().then(connection => connection.close()).catch(() => {}); }
