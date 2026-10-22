import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import type { ContentRecord } from '../src/lib/cms-types';
import { recordSchema } from '../src/lib/validation';
import { websiteContentRecords } from './data/website-content';

nextEnv.loadEnvConfig(process.cwd());
if (process.argv.includes('--qa')) {
  process.env.MONGODB_DB_NAME = `${process.env.MONGODB_DB_NAME}_qa_backend`;
  process.env.CLOUDINARY_FOLDER = 'moe-navigation-qa';
}
const apply = process.argv.includes('--apply');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.split('=')[1];
const { collections, ensureIndexes, getClient, getDb, transaction } = await import('../src/server/db');
const { contentMediaReferenceFilter } = await import('../src/server/media-references');
type Asset = { sourcePath: string; sha256: string; bytes: number; width: number; height: number; format: string };
type ProviderAsset = { public_id: string; secure_url: string; bytes: number; width: number; height: number; existing?: boolean; context?: { custom?: { source_sha256?: string } } };
const manifest: Asset[] = JSON.parse(await readFile(new URL('./data/media-manifest.json', import.meta.url), 'utf8'));
const folder = process.env.CLOUDINARY_FOLDER || 'moe-navigation';
assert(/^[a-zA-Z0-9/_-]+$/.test(folder), 'Invalid media folder.');
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const publicId = (asset: Asset) => `${folder}/library/${basename(asset.sourcePath, '.webp')}-${asset.sha256.slice(0, 20)}`;
const mediaId = (asset: Asset) => hash(publicId(asset));
const key = (record: Pick<ContentRecord, 'id' | 'type'>) => `${record.type}:${record.id}`;
const uploadedThisRun: Asset[] = [];
const providers = new Map<string, ProviderAsset>();
const sourcePaths = new Set(manifest.map(asset => asset.sourcePath));
const imageUrls = (record: Partial<ContentRecord>) => [record.image, record.mobileImage, ...(record.gallery || []).map(image => image.url)].filter((url): url is string => Boolean(url));
function replaceImages(record: ContentRecord, urls: Map<string, string>): ContentRecord {
  const replace = (url: string) => {
    if (!url.startsWith('/images/')) return url;
    assert(urls.has(url), `Unrecognized local image: ${url}`);
    return urls.get(url)!;
  };
  return { ...record, image: replace(record.image), mobileImage: record.mobileImage ? replace(record.mobileImage) : '', gallery: (record.gallery || []).map(image => ({ ...image, url: replace(image.url) })) };
}
async function sourceBytes(asset: Asset) {
  const candidates = [resolve('public', asset.sourcePath.slice(1)), resolve('.local/migration-backup-2026-10-23/images', basename(asset.sourcePath))];
  for (const path of candidates) {
    try { const data = await readFile(path); assert.equal(hash(data), asset.sha256, `Source image changed: ${asset.sourcePath}`); return data; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  throw new Error(`Missing migration source: ${asset.sourcePath}`);
}
async function verifyDelivery(asset: Asset, remote: ProviderAsset) {
  assert.equal(remote.public_id, publicId(asset), 'Unexpected Cloudinary asset.');
  assert(remote.secure_url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`), 'Unexpected delivery origin.');
  const response = await fetch(remote.secure_url, { signal: AbortSignal.timeout(30000) });
  assert(response.ok && response.headers.get('content-type')?.startsWith('image/'), `Image not deliverable: ${asset.sourcePath}`);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), asset.sha256, `Remote image differs from source: ${asset.sourcePath}`);
}

try {
  const db = await getDb();
  const c = collections(db);
  const [existing, existingMedia, savedSettings] = await Promise.all([c.content.find({}).toArray(), c.media.find({}).toArray(), c.settings.findOne({ _id: 'website' })]);
  // Resource checks happen during dry-run as well: local files alone do not establish a migration.
  for (const asset of manifest) {
    try {
      const remote = await cloudinary.api.resource(publicId(asset), { resource_type: 'image', context: true }) as ProviderAsset;
      await verifyDelivery(asset, remote);
      providers.set(asset.sourcePath, remote);
    } catch (error) {
      if ((error as { http_code?: number }).http_code !== 404 && (error as { error?: { http_code?: number } }).error?.http_code !== 404) throw error;
      await sourceBytes(asset);
    }
  }
  const initialUrls = new Map(manifest.map(asset => [asset.sourcePath, providers.get(asset.sourcePath)?.secure_url || `cloudinary:${publicId(asset)}`]));
  const seeds = new Map(websiteContentRecords.map(record => [key(record as ContentRecord), record]));
  const previous = new Map(existing.map(record => [record._id, record]));
  const recordKeys = [...new Set([...seeds.keys(), ...previous.keys()])].sort();
  const desired = recordKeys.map(id => {
    const before = previous.get(id);
    // Existing field values (including intentional empty fields) win over the migration snapshot.
    const merged = { ...seeds.get(id), ...before };
    const validation = recordSchema.safeParse(merged);
    assert(validation.success, `Invalid migration record ${id}: ${validation.error?.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    const parsed = validation.data;
    const next: ContentRecord = { ...parsed, revision: before?.revision || 1, ...(before?.deletedAt ? { deletedAt: before.deletedAt } : {}) };
    for (const url of imageUrls(next)) if (url.startsWith('/images/')) assert(sourcePaths.has(url), `Unmapped image in ${id}`);
    return next;
  });
  const changes = desired.map(record => {
    const mapped = replaceImages(record, initialUrls);
    const before = previous.get(key(record));
    const fields = Object.entries(mapped).filter(([name, value]) => {
      if (['revision','updatedAt','deletedAt'].includes(name)) return false;
      const current = before?.[name as keyof typeof before];
      if (before && current === undefined && (value === '' || Array.isArray(value) && value.length === 0)) return false;
      return JSON.stringify(current) !== JSON.stringify(value);
    }).map(([name]) => name);
    return { key: key(record), revision: before?.revision ?? null, fields };
  }).filter(item => item.fields.length);
  const missingMedia = manifest.filter(asset => !existingMedia.some(item => item._id === mediaId(asset) && item.state === 'committed' && item.sourceSha256 === asset.sha256));
  const plan = { content: changes, uploads: manifest.filter(asset => !providers.has(asset.sourcePath)).map(asset => asset.sourcePath), mediaRecords: missingMedia.map(asset => asset.sourcePath), settings: !savedSettings };
  const planHash = hash(JSON.stringify({ database: process.env.MONGODB_DB_NAME, folder, plan, desired, manifest }));
  const report = { mode: apply ? 'apply' : 'dry-run', planHash, contentRecords: desired.length, contentChanges: changes.length, images: manifest.length, uploadsNeeded: plan.uploads.length, mediaRecordsNeeded: missingMedia.length, settingsNeeded: !savedSettings, localMediaReferences: existing.reduce((count, record) => count + imageUrls(record).filter(url => url.startsWith('/images/')).length, 0), plan };
  console.log(JSON.stringify({ ...report, plan: undefined }, null, 2));
  await mkdir('.local', { recursive: true });
  await writeFile('.local/website-migration-plan.json', JSON.stringify(report, null, 2) + '\n');
  if (apply) {
    assert(expectedPlan === planHash, 'Run the dry-run and provide its exact --expected-plan value.');
    await writeFile(`.local/migration-before-${Date.now()}.json`, JSON.stringify({ content: existing, media: existingMedia, settings: savedSettings }, null, 2), { flag: 'wx' });
    await ensureIndexes();
    for (const asset of manifest) {
      if (!providers.has(asset.sourcePath)) {
        const bytes = await sourceBytes(asset);
        const remote = await new Promise<ProviderAsset>((resolveUpload, reject) => {
          const stream = cloudinary.uploader.upload_stream({ public_id: publicId(asset), overwrite: false, resource_type: 'image', allowed_formats: ['webp'], context: { source_sha256: asset.sha256 }, timeout: 60000 }, (error, value) => error || !value ? reject(new Error(`Upload failed for ${asset.sourcePath}`)) : resolveUpload(value));
          stream.end(bytes);
        });
        if (!remote.existing) uploadedThisRun.push(asset);
        providers.set(asset.sourcePath, remote);
        await verifyDelivery(asset, remote);
        console.log(`Verified upload ${asset.sourcePath}`);
      }
      const remote = providers.get(asset.sourcePath)!;
      await c.media.updateOne({ _id: mediaId(asset) }, { $setOnInsert: { id: mediaId(asset), title: basename(asset.sourcePath, '.webp').replaceAll('-', ' '), url: remote.secure_url, publicId: remote.public_id, state: 'staged', owner: 'website-migration-v1', submissionId: `migration:${asset.sha256}`, pinned: false, createdAt: new Date().toISOString(), touchedAt: new Date(), sourcePath: asset.sourcePath, sourceSha256: asset.sha256, bytes: asset.bytes, width: asset.width, height: asset.height } }, { upsert: true });
    }
    const finalUrls = new Map(manifest.map(asset => [asset.sourcePath, providers.get(asset.sourcePath)!.secure_url]));
    await transaction(async (database, session) => {
      const scoped = collections(database);
      for (const record of desired) {
        const id = key(record);
        const before = previous.get(id);
        if (!changes.some(change => change.key === id)) continue;
        const next = replaceImages(record, finalUrls);
        const { revision, ...fields } = next;
        void revision;
        if (before) {
          const result = await scoped.content.updateOne({ _id: id, revision: before.revision }, { $set: { ...fields, revision: before.revision + 1, updatedAt: new Date().toISOString() } }, { session });
          assert.equal(result.matchedCount, 1, `Content changed during migration: ${id}`);
        } else await scoped.content.insertOne({ _id: id, ...next, revision: 1, updatedAt: new Date().toISOString() }, { session });
      }
      for (const asset of manifest) {
        const result = await scoped.media.updateOne({ _id: mediaId(asset), state: { $in: ['staged', 'committed'] }, sourceSha256: asset.sha256 }, { $set: { state: 'committed', pinned: true, touchedAt: new Date() } }, { session });
        assert.equal(result.matchedCount, 1, `Media changed during migration: ${asset.sourcePath}`);
      }
      if (!savedSettings) await scoped.settings.insertOne({ _id: 'website', companyName: 'MOE Navigation', companyNameTh: 'MOE Navigation', officeAddress: '', officeAddressTh: '', phone: '', email: '', mapUrl: '', revision: 1 }, { session });
    });
    console.log(JSON.stringify({ applied: true, contentRecords: await c.content.countDocuments(), mediaRecords: await c.media.countDocuments({ state: 'committed' }), instruction: 'Run this command again without --apply to verify zero changes, zero uploads, and zero local media references.' }));
  }
} catch (error) {
  // Only clean assets newly uploaded by this attempt, after MongoDB confirms no successful save references them.
  for (const asset of uploadedThisRun) {
    try {
      const c = collections(await getDb());
      const remote = providers.get(asset.sourcePath);
      if (!remote) continue;
      if (await c.content.findOne(contentMediaReferenceFilter(remote.secure_url)) || await c.media.findOne({ _id: mediaId(asset), state: 'committed' })) continue;
      const result = await cloudinary.uploader.destroy(publicId(asset), { resource_type: 'image', invalidate: true });
      if (['ok','not found'].includes(result.result)) await c.media.deleteOne({ _id: mediaId(asset), state: 'staged', owner: 'website-migration-v1' });
    } catch { console.error(`Cleanup uncertain for ${asset.sourcePath}; retained for recovery.`); }
  }
  console.error('Migration stopped:', error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.name : 'Provider request failed.');
  process.exitCode = 1;
} finally { await getClient().then(client => client.close()).catch(() => {}); }
