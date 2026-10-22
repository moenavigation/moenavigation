import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { decryptBackup, documentHash, encryptBackup, includedCollections, isMissingRecoveryAsset, remapImages, sha256, validateBackup, validateTarget, type Backup } from '../scripts/lib/recovery';

const secret = 'a-test-only-passphrase-at-least-20-characters';
function fixture(): Backup {
  const bytes = Buffer.from('image original bytes');
  const collections = Object.fromEntries(includedCollections.map(name => [name, []])) as Backup['collections'];
  const url = 'https://res.cloudinary.com/example/image/upload/v1/example.webp';
  collections.moe_content = [{ _id: 'Page:home', image: url, mobileImage: url, gallery: [{ url, alt: 'Cargo vessel' }], purgeAt: new Date('2030-01-01'), revision: 3 }];
  collections.moe_media = [{ _id: 'image1', publicId: 'example', url, state: 'committed' }];
  collections.moe_users = [{ _id: 'user1', passwordHash: 'encrypted-only-test-hash' }];
  return { schema: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDatabase: 'moe', collections, indexes: {}, assets: [{ mediaId: 'image1', publicId: 'example', url, format: 'webp', bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64') }] };
}
test('encrypted backup round-trips BSON dates, all documents and original image bytes', () => {
  const source = fixture(), encrypted = encryptBackup(source, secret), restored = decryptBackup(encrypted, secret);
  for (const name of includedCollections) assert.equal(documentHash(source.collections[name]), documentHash(restored.collections[name]));
  assert(restored.collections.moe_content[0].purgeAt instanceof Date);
  assert.equal(restored.assets[0].content, source.assets[0].content);
  assert(!encrypted.includes(Buffer.from('encrypted-only-test-hash')));
});
test('wrong passphrase, tampered header/payload and truncated archive fail authentication', () => {
  const encrypted = encryptBackup(fixture(), secret);
  assert.throws(() => decryptBackup(encrypted, 'wrong-but-long-enough-passphrase'));
  for (const index of [20, encrypted.length - 30, encrypted.length - 1]) {
    const damaged = Buffer.from(encrypted); damaged[index] ^= 1;
    assert.throws(() => decryptBackup(damaged, secret));
  }
  assert.throws(() => decryptBackup(encrypted.subarray(0, 30), secret));
  assert.throws(() => encryptBackup(fixture(), 'short'));
});
test('integrity validation rejects missing images, changed bytes and unknown collections', () => {
  const missing = fixture(); missing.assets = []; assert.throws(() => validateBackup(missing));
  const changed = fixture(); changed.assets[0].sha256 = '0'.repeat(64); assert.throws(() => validateBackup(changed));
  const unknown = fixture(); unknown.collections.moe_sessions = []; assert.throws(() => validateBackup(unknown));
  const external = fixture(); external.collections.moe_content[0].image = '/images/unbacked.webp'; assert.throws(() => validateBackup(external));
});
test('restore target validation refuses main, active QA, malformed and unrelated databases', () => {
  validateTarget('moe', 'moe', 'moe_restore_rehearsal');
  for (const target of ['moe', 'moe_qa', 'other_restore_test', 'moe_restore_', 'moe_restore_bad.name', `moe_restore_${'x'.repeat(64)}`]) assert.throws(() => validateTarget('moe', 'moe_qa', target));
  assert.throws(() => validateTarget('moe', 'moe_restore_active', 'moe_restore_active'));
});

test('restore targets enforce the Atlas 38-byte boundary before provider writes', () => {
  const prefix = 'moenavigation_restore_';
  const boundary = prefix + 'x'.repeat(38 - prefix.length);
  assert.equal(Buffer.byteLength(boundary), 38);
  assert.doesNotThrow(() => validateTarget('moenavigation', 'moenavigation', boundary));
  assert.throws(() => validateTarget('moenavigation', 'moenavigation', `${boundary}x`), /at most 38 ASCII characters/);
  assert.throws(() => validateTarget('moenavigation', 'moenavigation', `${prefix}ทดสอบ`), /isolated/);
});

test('cleanup retries recognize SDK missing-asset responses without hiding other provider errors', () => {
  assert.equal(isMissingRecoveryAsset({ http_code: 404 }), true);
  assert.equal(isMissingRecoveryAsset({ request_options: {}, query_params: {}, error: { message: 'Already removed', http_code: 404 } }), true);
  for (const error of [undefined, null, '404', new Error('Not found'), { error: 'Not found' }, { http_code: '404' }, { error: { http_code: 401 } }, { error: { http_code: 429 } }, { error: { http_code: 500 } }, { http_code: 500, error: { http_code: 404 } }]) {
    assert.equal(isMissingRecoveryAsset(error), false);
  }
});
test('isolated media remapping covers main, mobile, gallery and Trash without changing backup', () => {
  const backup = fixture(), before = documentHash(backup.collections.moe_content), original = backup.assets[0].url;
  backup.collections.moe_content[0].deletedAt = '2026-10-23';
  const mapped = remapImages(backup.collections, new Map([[original, { url: 'https://res.cloudinary.com/example/image/upload/recovery/new.webp', publicId: 'recovery/new' }]]));
  assert.equal(mapped.moe_content[0].image, mapped.moe_content[0].mobileImage);
  assert.equal(mapped.moe_content[0].gallery[0].url, mapped.moe_media[0].url);
  assert.equal(mapped.moe_media[0].publicId, 'recovery/new');
  assert.equal(mapped.moe_content[0].deletedAt, '2026-10-23');
  assert.equal(backup.collections.moe_content[0].image, original);
  delete backup.collections.moe_content[0].deletedAt;
  assert.equal(documentHash(backup.collections.moe_content), before);
});
