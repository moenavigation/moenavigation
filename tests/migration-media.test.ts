import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { findReusableMedia, type MigrationAsset, type MigrationMedia, type MigrationProviderAsset } from '../scripts/lib/migration-media';

const bytes = Buffer.from('the exact image bytes');
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const asset: MigrationAsset = { sourcePath: '/images/ship.webp', sha256: sha256(bytes), bytes: bytes.length, width: 1672, height: 941, format: 'webp' };
const registration: MigrationMedia = { _id: 'existing-media', state: 'committed', publicId: 'moe-navigation/earlier-upload', url: 'https://res.cloudinary.com/example/image/upload/earlier-upload.webp' };
const provider: MigrationProviderAsset = { public_id: registration.publicId!, secure_url: registration.url, bytes: asset.bytes, width: asset.width, height: asset.height, format: asset.format };

test('migration reuses only an owned committed image with exact metadata and delivered bytes', async () => {
  const ignored = [
    { ...registration, _id: 'unfinished', state: 'staged' },
    { ...registration, _id: 'outside', publicId: 'another-site/earlier-upload' },
    { ...registration, _id: 'different-size', bytes: asset.bytes + 1 },
  ];
  const result = await findReusableMedia(asset, [...ignored, registration], 'moe-navigation', async item => {
    assert.equal(item._id, registration._id);
    return provider;
  }, async () => sha256(bytes));
  assert.equal(result?.media._id, registration._id);
  assert.equal(result?.remote.secure_url, registration.url);
  assert.equal(await findReusableMedia(asset, [registration], 'moe-navigation', async () => provider, async () => sha256(Buffer.from('another image, same size'))), null);
  assert.equal(await findReusableMedia(asset, [registration], 'moe-navigation', async () => ({ ...provider, width: 1 }), async () => sha256(bytes)), null);
});

test('migration refuses ambiguous duplicate registrations and changed provider identity', async () => {
  const duplicate = { ...registration, _id: 'duplicate', publicId: 'moe-navigation/duplicate', url: 'https://res.cloudinary.com/example/image/upload/duplicate.webp' };
  await assert.rejects(findReusableMedia(asset, [registration, duplicate], 'moe-navigation', async item => ({ ...provider, public_id: item.publicId!, secure_url: item.url }), async () => sha256(bytes)), /Multiple registered images match/);
  await assert.rejects(findReusableMedia(asset, [registration], 'moe-navigation', async () => ({ ...provider, secure_url: 'https://res.cloudinary.com/example/image/upload/wrong.webp' }), async () => sha256(bytes)), /Registered Cloudinary URL changed/);
});
