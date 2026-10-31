import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { canonical, decryptBackup, documentHash, encryptBackup, excludedCollections, includedCollections, isMissingRecoveryAsset, remapImages, sha256, validateBackup, validateTarget, type Backup, type BackupAsset } from './lib/recovery';

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2), command = args[0];
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const activeDatabase = process.env.MONGODB_DB_NAME || '';
let client: MongoClient | undefined;
async function connect() {
  assert(process.env.MONGODB_URI && /^[a-zA-Z0-9_-]{1,64}$/.test(activeDatabase), 'MongoDB configuration is missing.');
  client ??= await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).connect();
  return client;
}
function provider() {
  assert(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET, 'Cloudinary configuration is missing.');
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
  return cloudinary;
}
async function passphrase() {
  return process.env.BACKUP_PASSPHRASE || (process.env.BACKUP_PASSPHRASE_FILE ? (await readFile(process.env.BACKUP_PASSPHRASE_FILE, 'utf8')).trim() : '');
}
async function saveJson(path: string, data: unknown, exclusive = false) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
}
async function imageBytes(url: string, expected?: string) {
  const parsed = new URL(url);
  assert(parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && parsed.pathname.startsWith(`/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`), 'Unexpected media origin.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert(response.ok && response.headers.get('content-type')?.startsWith('image/'), 'Image delivery failed.');
  assert(Number(response.headers.get('content-length') || 0) <= 25 * 1024 * 1024, 'Image exceeds backup limit.');
  const chunks: Uint8Array[] = []; let size = 0;
  assert(response.body, 'Empty image response.');
  for await (const chunk of response.body) { size += chunk.length; assert(size <= 25 * 1024 * 1024, 'Image exceeds backup limit.'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (expected) assert.equal(sha256(bytes), expected, 'Image hash verification failed.');
  return bytes;
}
async function snapshot(dbName: string) {
  const connection = await connect(), db = connection.db(dbName), session = connection.startSession();
  const collections: Backup['collections'] = {}, indexes: Backup['indexes'] = {};
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name);
  assert(existing.filter(name => name.startsWith('moe_')).every(name => [...includedCollections, ...excludedCollections].includes(name)), 'An unknown application collection needs a backup policy before continuing.');
  try {
    await session.withTransaction(async () => {
      let documentBytes = 0;
      for (const name of includedCollections) {
        collections[name] = [];
        for await (const document of db.collection(name).find({}, { session }).sort({ _id: 1 })) {
          documentBytes += Buffer.byteLength(canonical(document));
          assert(documentBytes <= 64 * 1024 * 1024, 'Database records exceed this CLI limit; use a native database backup.');
          collections[name].push(document);
        }
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    for (const name of includedCollections) indexes[name] = existing.includes(name) ? await db.collection(name).listIndexes().toArray() : [];
  } finally { await session.endSession(); }
  return { collections, indexes };
}
async function create() {
  const secret = await passphrase(); assert(secret.length >= 20, 'Set BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE to a secret of at least 20 characters.');
  const backup: Backup = { schema: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDatabase: activeDatabase, ...await snapshot(activeDatabase), assets: [] };
  assert(backup.collections.moe_media.every(media => media.state === 'committed'), 'Finish pending uploads or use the CMS Cleanup tool before creating a full backup.');
  let totalImageBytes = 0;
  for (const media of backup.collections.moe_media) {
    const remote = await provider().api.resource(media.publicId, { resource_type: 'image' });
    assert(remote.public_id === media.publicId && remote.secure_url === media.url, 'Registered media no longer matches the original provider asset.');
    const bytes = await imageBytes(remote.secure_url, media.sourceSha256);
    totalImageBytes += bytes.length;
    assert(totalImageBytes <= 128 * 1024 * 1024, 'Original images exceed this CLI limit; use a streaming backup for larger libraries.');
    assert.equal(bytes.length, remote.bytes, 'Original image size differs from Cloudinary metadata.');
    backup.assets.push({ mediaId: String(media._id), publicId: media.publicId, url: media.url, format: remote.format, bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64') });
  }
  // Do not label a backup complete if records changed while media were being downloaded.
  const after = await snapshot(activeDatabase);
  for (const name of includedCollections) assert.equal(documentHash(backup.collections[name]), documentHash(after.collections[name]), 'Application data changed during backup. Retry when editing has finished.');
  validateBackup(backup);
  const encrypted = encryptBackup(backup, secret);
  decryptBackup(encrypted, secret); // Verify authentication, schema and every image before writing.
  const path = resolve(option('output') || `.local/backups/${backup.createdAt.replace(/[:.]/g, '-')}.moebackup`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encrypted, { mode: 0o600, flag: 'wx' });
  const report = { status: 'verified', archive: path, archiveSha256: sha256(encrypted), backupId: backup.id, createdAt: backup.createdAt, collections: Object.fromEntries(includedCollections.map(name => [name, backup.collections[name].length])), originalImages: backup.assets.length, imageBytes: backup.assets.reduce((sum, image) => sum + image.bytes, 0), excludedCollections, providerSecretsIncluded: false, accountPasswordHashesIncluded: true };
  await saveJson(`${path}.report.json`, report, true); console.log(JSON.stringify(report, null, 2));
}
async function load() {
  const path = option('archive'); assert(path, 'Pass --archive=<encrypted backup path>.');
  const bytes = await readFile(resolve(path));
  return { backup: decryptBackup(bytes, await passphrase()), archiveHash: sha256(bytes) };
}
async function plan(backup: Backup, archiveHash: string) {
  const target = option('target-db') || '';
  validateTarget(backup.sourceDatabase, activeDatabase, target);
  const folder = `${process.env.CLOUDINARY_FOLDER || 'moe-navigation'}/recovery/${backup.id}-${sha256(target).slice(0, 12)}`;
  assert(/^[a-zA-Z0-9/_-]+$/.test(folder), 'Invalid Cloudinary recovery folder.');
  const value = { archiveHash, backupId: backup.id, targetDatabase: target, mediaFolder: folder, mediaMode: 'restore-original-bytes', records: Object.fromEntries(includedCollections.map(name => [name, backup.collections[name].length])), originalImages: backup.assets.length };
  return { ...value, planHash: sha256(canonical(value)) };
}
type Plan = Awaited<ReturnType<typeof plan>>;
function assetId(plan: Plan, asset: BackupAsset) { return `${plan.mediaFolder}/${sha256(asset.mediaId).slice(0, 20)}-${asset.sha256.slice(0, 16)}`; }
async function requireEmpty(dbName: string) {
  const db = (await connect()).db(dbName);
  assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0, 'The restore target must have no collections. Choose a new isolated target.');
  return db;
}
function upload(asset: BackupAsset, publicId: string, backupId: string) {
  return new Promise<UploadApiResponse>((resolveUpload, reject) => {
    provider().uploader.upload_stream({ resource_type: 'image', public_id: publicId, overwrite: false, unique_filename: false, context: { moe_recovery_id: backupId, sha256: asset.sha256 } }, (error, response) => error || !response ? reject(error || new Error('Empty upload response')) : resolveUpload(response)).end(Buffer.from(asset.content, 'base64'));
  });
}
async function restore() {
  const { backup, archiveHash } = await load(), planned = await plan(backup, archiveHash);
  const db = await requireEmpty(planned.targetDatabase);
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', ...planned }, null, 2));
  if (!args.includes('--apply')) return;
  assert.equal(option('expected-plan'), planned.planHash, 'Reviewed plan hash is required and must match.');
  const receiptPath = resolve(option('receipt') || `.local/recovery/${backup.id}-${sha256(planned.targetDatabase).slice(0, 12)}.json`);
  const receipt = { ...planned, status: 'started', assets: backup.assets.map(asset => ({ source: asset.url, publicId: assetId(planned, asset), sha256: asset.sha256 })), hashes: {} as Record<string, string> };
  await saveJson(receiptPath, receipt, true);
  // Claim this empty database. A concurrent restore cannot acquire the same unique marker.
  await db.createCollection('moe_recovery');
  await db.collection('moe_recovery').insertOne({ _id: backup.id as never, archiveHash, planHash: planned.planHash, status: 'started' });
  const mappings = new Map<string, { url: string; publicId: string }>();
  for (const asset of backup.assets) {
    const publicId = assetId(planned, asset);
    const remote = await upload(asset, publicId, backup.id);
    assert(!remote.existing && remote.public_id === publicId, 'A recovery asset already exists; refusing to reuse or overwrite it.');
    await imageBytes(remote.secure_url, asset.sha256);
    mappings.set(asset.url, { publicId, url: remote.secure_url });
  }
  const documents = remapImages(backup.collections, mappings), connection = await connect(), session = connection.startSession();
  receipt.hashes = Object.fromEntries(includedCollections.map(name => [name, documentHash(documents[name])]));
  await saveJson(receiptPath, receipt);
  // Create collections before the data transaction; no TTL indexes are activated in a rehearsal.
  for (const name of includedCollections) await db.createCollection(name);
  try {
    await session.withTransaction(async () => {
      for (const name of includedCollections) {
        assert.equal(await db.collection(name).countDocuments({}, { session }), 0, 'Restore target was modified.');
        if (documents[name].length) await db.collection(name).insertMany(documents[name], { session });
      }
      await db.collection('moe_recovery').updateOne({ _id: backup.id as never, planHash: planned.planHash }, { $set: { status: 'restored' } }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
  for (const name of includedCollections) {
    const actual = await db.collection(name).find().toArray();
    assert.equal(documentHash(actual), documentHash(documents[name]), `Restored document verification failed: ${name}`);
    receipt.hashes[name] = documentHash(actual);
  }
  receipt.status = 'verified'; await saveJson(receiptPath, receipt);
  console.log(JSON.stringify({ status: 'verified', receipt: receiptPath, originalImagesVerified: backup.assets.length, documentCounts: planned.records, sessionsRestored: 0, notificationsSent: 0, ttlIndexesActivated: false }, null, 2));
}
async function verifyOrCleanup(cleanup: boolean) {
  const { backup, archiveHash } = await load(), planned = await plan(backup, archiveHash);
  const receiptPath = option('receipt'); assert(receiptPath, 'Pass the receipt from the restore.');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert(receipt.planHash === planned.planHash && receipt.archiveHash === archiveHash, 'Receipt does not match this archive and target.');
  const connection = await connect(), db = connection.db(planned.targetDatabase);
  const marker = await db.collection('moe_recovery').findOne({ _id: backup.id as never });
  assert(marker?.planHash === planned.planHash && marker.archiveHash === archiveHash, 'Target is not owned by this restore.');
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name);
  assert(names.every(name => [...includedCollections, 'moe_recovery'].includes(name)), 'Unexpected collection in restore target; refusing cleanup.');
  const mappings = new Map<string, { url: string; publicId: string }>();
  for (const asset of backup.assets) {
    const publicId = assetId(planned, asset);
    try {
      const remote = await provider().api.resource(publicId, { resource_type: 'image', context: true });
      assert(remote.context?.custom?.moe_recovery_id === backup.id && remote.context?.custom?.sha256 === asset.sha256, 'Recovery asset ownership does not match.');
      if (!cleanup) await imageBytes(remote.secure_url, asset.sha256);
      mappings.set(asset.url, { url: remote.secure_url, publicId });
    } catch (error) {
      if (!(cleanup && isMissingRecoveryAsset(error))) throw error;
    }
  }
  const expected = remapImages(backup.collections, mappings);
  for (const name of includedCollections) {
    const actual = await db.collection(name).find().toArray();
    if (marker.status === 'restored') {
      assert.equal(documentHash(actual), receipt.hashes[name] || documentHash(expected[name]), 'Restored data changed; refusing automatic cleanup.');
    } else assert.equal(actual.length, 0, 'Unexpected records in unfinished restore.');
  }
  if (!cleanup) { assert(marker.status === 'restored', 'Restore is unfinished.'); console.log(JSON.stringify({ status: 'verified', planHash: planned.planHash, images: backup.assets.length, collections: planned.records })); return; }
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'cleanup' : 'cleanup-dry-run', planHash: planned.planHash, targetDatabase: planned.targetDatabase, exactRecoveryImages: mappings.size }));
  if (!args.includes('--apply')) return;
  assert.equal(option('expected-plan'), planned.planHash, 'Reviewed plan hash is required for cleanup.');
  const sourceDb = connection.db(activeDatabase);
  // Every deletion is an exact ID with a verified per-backup ownership marker.
  for (const mapping of mappings.values()) {
    assert.equal(await sourceDb.collection('moe_media').countDocuments({ $or: [{ publicId: mapping.publicId }, { url: mapping.url }] }), 0, 'A recovery image is referenced by the active database.');
    assert.equal(await sourceDb.collection('moe_content').countDocuments({ $or: [{ image: mapping.url }, { mobileImage: mapping.url }, { 'gallery.url': mapping.url }, { 'heroSlides.url': mapping.url }] }), 0, 'A recovery image is used by active content.');
    assert.equal(await sourceDb.collection('moe_users').countDocuments({ avatar: mapping.url }), 0, 'A recovery image is used by a user profile, including Trash.');
    const result = await provider().uploader.destroy(mapping.publicId, { resource_type: 'image', invalidate: true });
    assert(['ok', 'not found'].includes(result.result), 'Recovery image cleanup failed; target retained for retry.');
  }
  await db.dropDatabase();
  receipt.status = 'cleaned'; receipt.cleanedAt = new Date().toISOString(); await saveJson(resolve(receiptPath), receipt);
  console.log(JSON.stringify({ status: 'cleaned', databaseRemoved: planned.targetDatabase, recoveryImagesRemoved: mappings.size, backupPreserved: true }));
}
try {
  if (command === 'create') await create();
  else if (command === 'inspect') {
    const { backup, archiveHash } = await load();
    console.log(JSON.stringify({ status: 'verified', backupId: backup.id, createdAt: backup.createdAt, sourceDatabase: backup.sourceDatabase, archiveHash, collections: Object.fromEntries(includedCollections.map(name => [name, backup.collections[name].length])), originalImages: backup.assets.length }, null, 2));
  } else if (command === 'restore') await restore();
  else if (command === 'verify') await verifyOrCleanup(false);
  else if (command === 'cleanup') await verifyOrCleanup(true);
  else throw new Error('Use create, inspect, restore, verify, or cleanup. See docs/RECOVERY.md.');
} catch (error) {
  // Provider/driver errors can contain credentials or customer data; report only a safe name.
  console.error('Recovery command failed:', error instanceof assert.AssertionError ? error.message.split('\n')[0] : error instanceof Error ? error.name : 'ProviderError');
  process.exitCode = 1;
} finally { await client?.close(); }
