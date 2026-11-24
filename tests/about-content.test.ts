import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { legacyAboutCopy, legacyAboutImages } from '../scripts/data/legacy-about';
import { websiteContentRecords } from '../scripts/data/website-content';
import { recordSchema } from '../src/lib/validation';

const imageTargets = {
  hero: { id: 'about', path: '/images/about/port-operations.webp' },
  overview: { id: 'about-intro', path: '/images/about/container-vessel.webp' },
  safety: { id: 'about-safety', path: '/images/about/safety-inspection.webp' },
  maintenance: { id: 'about-maintenance', path: '/images/about/ship-maintenance.webp' },
  crew: { id: 'about-crew', path: '/images/about/onboard-team.webp' },
  office: { id: 'about-office', path: '/images/company-originals/office-meeting.webp' },
};

test('About seeds pair reviewed bilingual copy with the six correct photographs and preserve existing values', () => {
  const about = websiteContentRecords
    .filter(record => record.id === 'about' && record.type === 'Page' || record.type === 'Section' && record.parentId === 'about')
    .map(record => recordSchema.parse(record));
  assert.equal(about.length, 9);
  assert.equal(new Set(websiteContentRecords.map(record => `${record.type}:${record.id}`)).size, websiteContentRecords.length);
  for (const image of legacyAboutImages) {
    const target = imageTargets[image.key];
    const record = about.find(item => item.id === target.id)!;
    assert.equal(record.image, target.path);
    assert.equal(record.imageAlt, image.alt);
    assert.equal(record.imageAltTh, image.altTh);
  }
  for (const [key, id] of [['page', 'about'], ['intro', 'about-intro'], ['mission', 'about-mission'], ['vision', 'about-vision'], ['safety', 'about-safety'], ['maintenance', 'about-maintenance'], ['crew', 'about-crew'], ['office', 'about-office']] as const) {
    const record = about.find(item => item.id === id)!;
    for (const [field, value] of Object.entries(legacyAboutCopy[key])) assert.equal(record[field as keyof typeof record], value);
  }
  const page = about.find(record => record.id === 'about')!;
  const intro = about.find(record => record.id === 'about-intro')!;
  assert.ok(page.titleTh.includes('Moe Navigation Co.,Ltd.'));
  assert.equal(intro.title, 'Moe Navigation Co.,Ltd.');
  assert.equal(intro.titleTh, 'Moe Navigation Co.,Ltd.');
  assert.doesNotMatch(JSON.stringify(legacyAboutCopy), /Moe Container Line|2022|10,000,000|Eddie Moe|Kasikorn|zero (?:cargo loss|breakdowns)/i);
  const values = about.find(record => record.id === 'about-values')!;
  assert.equal(values.description, 'Clear communication. Accountability. Respect.');
  assert.equal(values.descriptionTh, 'สื่อสารชัดเจน รับผิดชอบ และเคารพกัน');
});

test('About photographs are registered original WebP pixels with no metadata chunks', () => {
  const manifest: { sourcePath: string; sha256: string; bytes: number; width: number; height: number; format: string }[] = JSON.parse(readFileSync(new URL('../scripts/data/media-manifest.json', import.meta.url), 'utf8'));
  for (const source of legacyAboutImages) {
    const target = imageTargets[source.key].path;
    const assets = manifest.filter(asset => asset.sourcePath === target);
    assert.equal(assets.length, 1, `Register one migration asset for ${target}`);
    assert.deepEqual(assets[0], { sourcePath: target, sha256: source.sha256, bytes: source.bytes, width: source.width, height: source.height, format: source.format,
      ...(source.key === 'office' ? { sourceUrl: source.sourceUrl } : {}) });
    const bytes = readFileSync(new URL(`../public${target}`, import.meta.url));
    assert.equal(bytes.length, source.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
    const chunks: string[] = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = bytes.readUInt32LE(offset + 4);
      chunks.push(bytes.toString('ascii', offset, offset + 4));
      offset += 8 + size + size % 2;
      assert.ok(offset <= bytes.length);
    }
    assert.equal(offset, bytes.length);
    assert.deepEqual(chunks, ['VP8 '], `No EXIF, XMP, ICC or other metadata in ${target}`);
  }
});
