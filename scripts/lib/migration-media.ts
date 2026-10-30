import assert from 'node:assert/strict';

export type MigrationAsset = { sourcePath: string; sha256: string; bytes: number; width: number; height: number; format: string };
export type MigrationProviderAsset = { public_id: string; secure_url: string; bytes: number; width: number; height: number; format: string };
export type MigrationMedia = { _id: string; state: string; publicId?: string; url: string; bytes?: number; width?: number; height?: number };

export function metadataMatches(asset: MigrationAsset, remote: MigrationProviderAsset) {
  return remote.bytes === asset.bytes && remote.width === asset.width && remote.height === asset.height && remote.format === asset.format;
}

export async function findReusableMedia<Media extends MigrationMedia, Remote extends MigrationProviderAsset>(
  asset: MigrationAsset,
  media: Media[],
  folder: string,
  inspect: (item: Media) => Promise<Remote>,
  deliveryHash: (remote: Remote) => Promise<string>,
): Promise<{ media: Media; remote: Remote } | null> {
  const matches: { media: Media; remote: Remote }[] = [];
  for (const item of media) {
    if (item.state !== 'committed' || !item.publicId?.startsWith(`${folder}/`)) continue;
    if (item.bytes !== undefined && item.bytes !== asset.bytes) continue;
    if (item.width !== undefined && item.width !== asset.width) continue;
    if (item.height !== undefined && item.height !== asset.height) continue;
    const remote = await inspect(item);
    assert.equal(remote.public_id, item.publicId, 'Registered Cloudinary asset identity changed.');
    assert.equal(remote.secure_url, item.url, 'Registered Cloudinary URL changed.');
    if (metadataMatches(asset, remote) && await deliveryHash(remote) === asset.sha256) matches.push({ media: item, remote });
  }
  assert(matches.length <= 1, `Multiple registered images match ${asset.sourcePath}; resolve the duplicate before migrating.`);
  return matches[0] || null;
}
