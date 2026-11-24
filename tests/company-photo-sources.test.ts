import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import manifest from '../scripts/data/media-manifest.json';
import archive from '../docs/research/legacy-moe-line-2026-11-16/media-library.json';
import { websiteContentRecords } from '../scripts/data/website-content';
import { companyPhotoReplacements, companyPhotos } from '../src/lib/company-photo-replacements';
import { recordSchema } from '../src/lib/validation';

test('current seed pictures and galleries all use registered company photos with available original bytes', async () => {
  const approved = new Set(manifest.map(asset => asset.sourcePath));
  for (const entry of websiteContentRecords) {
    const record = recordSchema.parse(entry);
    const urls = [record.image, record.mobileImage, ...record.gallery.map(image => image.url)];
    for (const url of urls) if (url) assert(approved.has(url), `${record.type}:${record.id}: ${url}`);
  }
  for (const previous of Object.keys(companyPhotoReplacements)) assert(!approved.has(previous));
  for (const photo of Object.values(companyPhotos)) {
    assert(approved.has(photo.url), photo.url);
    assert(photo.alt.trim() && photo.altTh.trim(), photo.url);
  }
  for (const asset of manifest.filter(photo => photo.sourcePath.startsWith('/images/company-originals/'))) {
    const source = archive.records.find(item => item.url === asset.sourceUrl);
    assert(source, asset.sourcePath);
    const bytes = readFileSync(new URL(`../public${asset.sourcePath}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.length, source.bytesAsPublished);
    const image = await sharp(bytes).metadata();
    assert.equal(image.format, 'webp');
    assert.equal(image.width, source.width);
    assert.equal(image.height, source.height);
    assert(!image.exif && !image.xmp && !image.icc);
  }
});
