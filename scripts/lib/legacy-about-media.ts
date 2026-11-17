import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { mediaProvider } from '../../src/server/media';
import { metadataMatches, type MigrationProviderAsset } from './migration-media';
import type { LegacyAboutImage, LegacyAboutImageKey } from '../data/legacy-about';

export type PreparedAboutImage = { key: LegacyAboutImageKey; id: string; url: string; publicId: string; sha256: string };
export const aboutMediaDirectory = resolve('.local/legacy-about-import-2026-11-17');
export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function legacyAboutSourceBytes(asset: LegacyAboutImage) {
  const path = resolve(asset.sourcePath);
  assert(path.startsWith(resolve('.local/legacy-moe-line-2026-11-16/assets') + sep), 'Unexpected About source path.');
  const bytes = await readFile(path);
  assert.equal(bytes.length, asset.bytes, `Source size changed for ${asset.key}.`);
  assert.equal(sha256(bytes), asset.sha256, `Source pixels changed for ${asset.key}.`);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'Malformed WebP source.');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    assert(!['EXIF', 'XMP ', 'ICCP'].includes(chunk), `Unexpected image metadata for ${asset.key}.`);
    offset += 8 + length + length % 2;
  }
  return bytes;
}
export async function aboutDeliveryHash(remote: MigrationProviderAsset) {
  const origin = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
  assert(remote.secure_url.startsWith(origin), 'Unexpected managed image origin.');
  assert(remote.bytes > 0 && remote.bytes <= 3 * 1024 * 1024, 'Unexpected image size.');
  const response = await fetch(remote.secure_url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert(response.ok && response.headers.get('content-type')?.startsWith('image/'), 'Prepared image is not deliverable.');
  assert(response.body, 'Prepared image is empty.');
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    assert(size <= remote.bytes && size <= 3 * 1024 * 1024, 'Prepared image delivery exceeds its declared size.');
    chunks.push(value);
  }
  assert.equal(size, remote.bytes);
  return sha256(Buffer.concat(chunks));
}
export async function verifyAboutImage(asset: LegacyAboutImage, item: { publicId?: string; url: string }) {
  assert(item.publicId, 'Prepared image identity is missing.');
  const remote = await mediaProvider().api.resource(item.publicId, { resource_type: 'image' }) as MigrationProviderAsset;
  assert.equal(remote.public_id, item.publicId);
  assert.equal(remote.secure_url, item.url);
  assert(metadataMatches(asset, remote), `Prepared image metadata differs for ${asset.key}.`);
  assert.equal(await aboutDeliveryHash(remote), asset.sha256, `Prepared image pixels differ for ${asset.key}.`);
  return remote;
}
