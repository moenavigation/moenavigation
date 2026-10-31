import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { BSON, type Document } from 'mongodb';
import { isBundledHomeSlide } from '../../src/lib/home-slides';

const MAGIC = Buffer.from('MOEBACKUP1\n');
const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_PLAINTEXT = 512 * 1024 * 1024;
export const includedCollections = ['moe_content', 'moe_media', 'moe_users', 'moe_enquiries', 'moe_settings'];
export const excludedCollections = ['moe_sessions', 'moe_state', 'moe_operations', 'moe_recovery', 'moe_logs'];
export type BackupAsset = { mediaId: string; publicId: string; url: string; format: string; bytes: number; sha256: string; content: string };
export type Backup = { schema: 1; id: string; createdAt: string; sourceDatabase: string; collections: Record<string, Document[]>; indexes: Record<string, Document[]>; assets: BackupAsset[] };
export const sha256 = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
export const canonical = (value: unknown): string => {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sort(entry)])) : item;
  return JSON.stringify(sort(BSON.EJSON.serialize(value, { relaxed: false })));
};
export const documentHash = (documents: Document[]) => sha256(canonical([...documents].sort((a, b) => String(a._id).localeCompare(String(b._id)))));
function key(passphrase: string, salt: Buffer) {
  assert(passphrase.length >= 20, 'Use a backup passphrase with at least 20 characters.');
  return scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export function encryptBackup(backup: Backup, passphrase: string) {
  const plaintext = Buffer.from(BSON.EJSON.stringify(backup, { relaxed: false }));
  assert(plaintext.length <= MAX_PLAINTEXT, 'Backup exceeds the CLI memory limit. Use a database-native backup for larger installations.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({ cipher: 'aes-256-gcm', kdf: 'scrypt-32768-8-1', salt: salt.toString('base64'), iv: iv.toString('base64') }));
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const authenticated = Buffer.concat([MAGIC, length, header]);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  cipher.setAAD(authenticated);
  const output = Buffer.concat([authenticated, cipher.update(gzipSync(plaintext)), cipher.final(), cipher.getAuthTag()]);
  assert(output.length <= MAX_ARCHIVE, 'Encrypted backup exceeds the CLI limit.');
  return output;
}
export function decryptBackup(data: Buffer, passphrase: string): Backup {
  assert(data.length <= MAX_ARCHIVE && data.length > MAGIC.length + 20 && data.subarray(0, MAGIC.length).equals(MAGIC), 'Invalid or oversized backup.');
  const headerLength = data.readUInt32BE(MAGIC.length);
  assert(headerLength > 0 && headerLength <= 1024, 'Invalid backup header.');
  const offset = MAGIC.length + 4 + headerLength;
  assert(offset + 16 < data.length, 'Truncated backup.');
  const header = JSON.parse(data.subarray(MAGIC.length + 4, offset).toString());
  assert(header.cipher === 'aes-256-gcm' && header.kdf === 'scrypt-32768-8-1', 'Unsupported backup encryption.');
  const salt = Buffer.from(header.salt, 'base64'), iv = Buffer.from(header.iv, 'base64');
  assert(salt.length === 16 && iv.length === 12, 'Invalid encryption parameters.');
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
  decipher.setAAD(data.subarray(0, offset)); decipher.setAuthTag(data.subarray(-16));
  const compressed = Buffer.concat([decipher.update(data.subarray(offset, -16)), decipher.final()]);
  const backup = BSON.EJSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_PLAINTEXT }).toString(), { relaxed: false }) as Backup;
  // EJSON's numeric wrappers preserve document BSON types; envelope counters are ordinary JS numbers.
  backup.schema = Number(backup.schema) as 1;
  for (const asset of backup.assets || []) asset.bytes = Number(asset.bytes);
  validateBackup(backup);
  return backup;
}
export function validateBackup(backup: Backup) {
  assert(backup.schema === 1 && /^[0-9a-f-]{36}$/.test(backup.id), 'Unsupported backup payload.');
  assert(/^[a-zA-Z0-9_-]{1,64}$/.test(backup.sourceDatabase), 'Invalid source database.');
  assert(Object.keys(backup.collections).length === includedCollections.length && includedCollections.every(name => Array.isArray(backup.collections[name])), 'Unexpected backup collection set.');
  assert(backup.assets.length === backup.collections.moe_media.length, 'Every registered image must be backed up.');
  const ids = new Set<string>();
  for (const asset of backup.assets) {
    assert(!ids.has(asset.mediaId), 'Duplicate media in backup.'); ids.add(asset.mediaId);
    assert(/^[a-z0-9]+$/i.test(asset.format) && asset.bytes > 0 && asset.bytes <= 25 * 1024 * 1024, 'Unsupported image in backup.');
    const bytes = Buffer.from(asset.content, 'base64');
    assert(bytes.length === asset.bytes && sha256(bytes) === asset.sha256, 'Image integrity check failed.');
    assert(backup.collections.moe_media.some(media => media._id === asset.mediaId && media.publicId === asset.publicId && media.url === asset.url && media.state === 'committed'), 'Media metadata differs from backup image.');
  }
  const urls = new Set(backup.assets.map(asset => asset.url));
  for (const record of backup.collections.moe_content) {
    for (const url of [record.image, record.mobileImage, ...(record.gallery || []).map((image: Document) => image.url)]) if (url) assert(urls.has(url), 'Content references an image missing from the backup.');
    for (const image of record.heroSlides || []) assert(urls.has(image.url) || (record.type === 'Page' && record.id === 'home' && isBundledHomeSlide(image.url)), 'Homepage slides reference an image missing from the backup.');
  }
  for (const user of backup.collections.moe_users) {
    if (user.avatar) assert(urls.has(user.avatar), 'A user profile references an image missing from the backup.');
  }
}
export function validateTarget(source: string, current: string, target: string) {
  assert(target !== source && target !== current && target.startsWith(`${source}_restore_`) && /^[a-zA-Z0-9_-]+$/.test(target) && target.length > `${source}_restore_`.length, 'Restore target must be an isolated <source>_restore_<suffix> database, different from the active database.');
  assert(target.length <= 38, 'Restore target name must be at most 38 ASCII characters for MongoDB Atlas. Choose a shorter suffix.');
}
export function isMissingRecoveryAsset(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const provider = error as { http_code?: unknown; error?: unknown };
  const nested = provider.error && typeof provider.error === 'object' ? provider.error as { http_code?: unknown } : undefined;
  return (provider.http_code ?? nested?.http_code) === 404;
}
export function remapImages(collections: Backup['collections'], mappings: Map<string, { url: string; publicId: string }>) {
  const result = BSON.EJSON.deserialize(BSON.EJSON.serialize(collections, { relaxed: false }), { relaxed: false }) as Backup['collections'];
  for (const record of result.moe_content) {
    if (record.image) record.image = mappings.get(record.image)?.url || record.image;
    if (record.mobileImage) record.mobileImage = mappings.get(record.mobileImage)?.url || record.mobileImage;
    for (const image of record.gallery || []) image.url = mappings.get(image.url)?.url || image.url;
    for (const image of record.heroSlides || []) image.url = mappings.get(image.url)?.url || image.url;
  }
  for (const media of result.moe_media) {
    const mapping = mappings.get(media.url);
    if (mapping) { media.url = mapping.url; media.publicId = mapping.publicId; }
  }
  for (const user of result.moe_users) {
    if (user.avatar) user.avatar = mappings.get(user.avatar)?.url || user.avatar;
  }
  return result;
}
