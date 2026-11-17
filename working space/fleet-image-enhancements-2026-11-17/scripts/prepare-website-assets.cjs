/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS maintenance CLI; retain its .cjs runtime and local helper compatibility. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const root = process.cwd();
const task = path.join(root, 'working space/fleet-image-enhancements-2026-11-17');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const names = {
  'ranong-moe': ['RANONG MOE', 'RANONG MOE', 'ระนอง โม'],
  'moe-line-2': ['MOE 2', 'MOE LINE 2', 'โมไลน์ 2'],
  'moe-line-3': ['MOE 3', 'MOE LINE 3', 'โมไลน์ 3'],
  'moe-line-4': ['MOE 4', 'MOE LINE 4', 'โมไลน์ 4'],
  'moe-line-5': ['MOE 5', 'MOE LINE 5', 'โมไลน์ 5'],
  'moe-line-6': ['MOE 6', 'MOE LINE 6', 'โม ไลน์ 6'],
  'moe-line-7': ['MOE 7', 'MOE LINE 7', 'โม ไลน์ 7'],
};
function webpChunks(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    chunks.push(type);
    offset += 8 + size + (size % 2);
  }
  assert(chunks.every(type => !['EXIF', 'XMP ', 'ICCP'].includes(type)));
  return chunks;
}

(async () => {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(task, 'final-manifest.json'), 'utf8'));
  assert.equal(sourceManifest.jobs.length, 14);
  const assets = [];
  const previews = [];
  await fs.mkdir(path.join(root, 'public/images/fleet-enhanced'), { recursive: true });
  for (const [id, [currentName, legacyName, thaiName]] of Object.entries(names)) {
    for (const variant of ['neutral', 'warm']) {
      const source = sourceManifest.jobs.find(item => item.vessel === id && item.variant === variant);
      assert.equal(source.reviewStatus, 'pass_identity_review');
      const sourcePath = path.join(task, source.path);
      const sourceBytes = await fs.readFile(sourcePath);
      assert.equal(hash(sourceBytes), source.sha256);
      const url = `/images/fleet-enhanced/${id}-${variant}.webp`;
      const outputPath = path.join(root, 'public', url);
      const bytes = await sharp(sourceBytes).webp({ quality: 94, effort: 6, smartSubsample: true }).toBuffer();
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, source.width);
      assert.equal(metadata.height, source.height);
      assert(!metadata.exif && !metadata.xmp && !metadata.icc);
      await sharp(bytes).raw().toBuffer();
      const chunks = webpChunks(bytes);
      await fs.writeFile(outputPath, bytes);
      const asset = {
        vesselId: id, currentName, legacyName, variant,
        sourcePath: path.relative(root, sourcePath).replaceAll('\\', '/'), sourceSha256: source.sha256,
        url, sha256: hash(bytes), bytes: bytes.length, sourceBytes: sourceBytes.length,
        width: metadata.width, height: metadata.height, format: 'webp', quality: 94,
        metadataRemoved: true, chunks,
        alt: `${currentName} — AI-enhanced vessel photograph${variant === 'warm' ? ' in warm daylight' : ''}.`,
        altTh: `${thaiName} — ภาพถ่ายเรือที่ปรับปรุงด้วย AI${variant === 'warm' ? ' ในแสงแดดโทนอุ่น' : ''}`,
      };
      assets.push(asset);
      const label = Buffer.from(`<svg width="600" height="36"><rect width="600" height="36" fill="white"/><text x="12" y="25" font-family="Arial" font-size="20" fill="#082b50">${currentName} / ${variant}</text></svg>`);
      const preview = await sharp(bytes).resize(600, 362, { fit: 'contain', background: '#e8eff4' }).extend({ top: 36, bottom: 0, left: 0, right: 0, background: 'white' }).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
      previews.push({ input: preview, left: variant === 'neutral' ? 0 : 600, top: (Object.keys(names).indexOf(id)) * 398 });
    }
  }
  assert.equal(new Set(assets.map(item => item.url)).size, 14);
  const vessels = Object.entries(names).map(([id, [currentName, legacyName]]) => ({
    id, currentName, legacyName, mainVariant: 'neutral',
    selectionReason: 'Neutral daylight keeps the green/red hull colors natural and the corrected lettering clear; warm daylight provides the gallery alternative.',
    main: assets.find(item => item.vesselId === id && item.variant === 'neutral'),
    gallery: [assets.find(item => item.vesselId === id && item.variant === 'warm')],
  }));
  const result = { preparedOn: '2026-11-17', sourceDirectory: path.relative(root, task).replaceAll('\\', '/'),
    selectionRationale: 'The reviewed neutral treatments provide consistent natural daylight across the fleet. Warm alternatives are kept in the gallery. DUMAI MOE has no asset mapping and is unchanged.',
    vessels, assets };
  await fs.writeFile(path.join(root, 'scripts/data/enhanced-fleet-images.json'), JSON.stringify(result, null, 2) + '\n');
  const manifestPath = path.join(root, 'scripts/data/media-manifest.json');
  const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const unchanged = existing.filter(item => !item.sourcePath.startsWith('/images/fleet-enhanced/'));
  const added = assets.map(({ url, sha256, bytes, width, height, format }) => ({ sourcePath: url, sha256, bytes, width, height, format }));
  await fs.writeFile(manifestPath, JSON.stringify([...unchanged, ...added], null, 2) + '\n');
  await sharp({ create: { width: 1200, height: 2786, channels: 3, background: 'white' } }).composite(previews).png().toFile(path.join(task, 'source-checks/website-webp-comparison.png'));
  const sourceBytes = assets.reduce((sum, item) => sum + item.sourceBytes, 0);
  const outputBytes = assets.reduce((sum, item) => sum + item.bytes, 0);
  const summary = { assets: assets.length, vessels: vessels.length, quality: 94, sourceBytes, outputBytes, reductionPercent: Math.round((1 - outputBytes / sourceBytes) * 1000) / 10, minBytes: Math.min(...assets.map(item => item.bytes)), maxBytes: Math.max(...assets.map(item => item.bytes)), decoded: true, dimensionsPreserved: true, metadataAbsent: true };
  await fs.writeFile(path.join(task, 'source-checks/website-webp-qa.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
})().catch(error => { console.error(error); process.exitCode = 1; });
