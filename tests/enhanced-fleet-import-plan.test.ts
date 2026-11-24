import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import type { ContentRecord } from '../src/lib/cms-types';
import { buildEnhancedFleetPlan, enhancedFleetSelection as selection } from '../scripts/data/enhanced-fleet-import-plan';

const urls = Object.fromEntries(selection.assets.map(asset => [asset.url, `https://res.cloudinary.com/example/image/upload/v1/fleet/${asset.vesselId}-${asset.variant}.webp`]));
const identities = [
  ['ranong-moe', 'RANONG MOE'], ['moe-line-2', 'MOE LINE 2'], ['moe-line-3', 'MOE LINE 3'],
  ['moe-line-4', 'MOE LINE 4'], ['moe-line-5', 'MOE LINE 5'], ['moe-line-6', 'MOE LINE 6'],
  ['moe-line-7', 'MOE LINE 7'], ['dumai-moe', 'DUMAI MOE'],
] as const;
// Reviewed final PNG identities, retained here so validation does not depend on working files.
const approvedSources: Record<string, readonly [string, number, number]> = {
  'ranong-moe:neutral': ['aa868366c5fa0c68a216cd9b2195f8e1b4d22e5ac18032ce9ef71336b2d9b62a', 1448, 1086],
  'ranong-moe:warm': ['ac153addfdba75602a72efa454794c8b15d90eb7f50c408d358d55976774c505', 1448, 1086],
  'moe-line-2:neutral': ['fbdfe2e49d3bba1676016cdb4aecdc0d61f8c754da1a3b3c6148610db2f48306', 1614, 974],
  'moe-line-2:warm': ['2749a52088e916981c5ee6b0f5853818dd1b40f85c65feba33d05b77dc7fb659', 1614, 974],
  'moe-line-3:neutral': ['2b52a1b5a22efe70ead0f1a22236b7e4c2c3437dbc8e5aa6531ec34ff22ed422', 1614, 975],
  'moe-line-3:warm': ['9c7883442e94fae7129537f166b3fbe2e94a6b04fb93332fd7a4d784efe80395', 1614, 975],
  'moe-line-4:neutral': ['029f99b32ea62f6ae42cf883ee906cf1a11d27b953780466d81af9cd2a7175ca', 1672, 941],
  'moe-line-4:warm': ['d498c62ec39ae58e0ed6249a0cc91e4a3c9dea17269d003a0e08113311c10681', 1672, 941],
  'moe-line-5:neutral': ['b7fbd491f2280a35481bd50397e9763f1686d24fdc674f355fc13db56ff16a3a', 1614, 975],
  'moe-line-5:warm': ['ffbafff19785d598cd6afd0a36d7f2f0977e4ea77b0c9004f65c458f55153b9c', 1614, 975],
  'moe-line-6:neutral': ['4649cad8536e63b16b7327c547a936c6ff90a70f00b91c223ba0a23065d1d8ab', 1614, 975],
  'moe-line-6:warm': ['e833c661165c002653808706fe4c7cd0d44179d2ee15f281081310e8e92a457d', 1614, 975],
  'moe-line-7:neutral': ['193991e22019dbde7fff79aa121f7213f147fb1adc1bbe198b091d6d623f69cd', 1672, 940],
  'moe-line-7:warm': ['03bb0232839439c8a77d6fb650d0726ad9facff1a5e48d7b1c3cc915773f1c55', 1673, 940],
};
function fixture(): ContentRecord[] {
  return identities.map(([id, title], index) => ({
    id, type: 'Vessel', title, titleTh: `ชื่อที่ผู้ใช้บันทึก ${index}`, description: 'Client description', descriptionTh: 'คำอธิบายของลูกค้า',
    body: 'Client body', bodyTh: 'เนื้อหาของลูกค้า', bodyHeading: 'Client heading', bodyHeadingTh: 'หัวข้อ',
    image: `https://example.com/previous-${id}.webp`, imageAlt: 'Previous photo', imageAltTh: 'ภาพเดิม',
    mobileImage: '', gallery: [], category: index === 3 ? 'Crane' : index === 7 ? 'Tanker' : 'Container', categoryTh: 'ประเภทเดิม',
    status: 'Published', order: index + 1, revision: index + 3,
    updatedAt: '2026-11-16T01:02:03.000Z',
    vesselSpecs: { loa: 63, reeferPlugs: 5 },
  }));
}
function apply(records: ContentRecord[]) {
  const plan = buildEnhancedFleetPlan(records, urls);
  return records.map(record => {
    const change = plan.find(item => item.id === record.id);
    return change ? { ...record, ...change.patch, revision: change.expectedRevision + 1 } : record;
  });
}

test('fleet photo plan matches exactly seven saved identities and changes only image fields', () => {
  const records = fixture(), before = structuredClone(records);
  const plan = buildEnhancedFleetPlan(records, urls);
  assert.deepEqual(plan.map(item => [item.id, item.name]), identities.slice(0, 7));
  for (const change of plan) {
    const original = records.find(item => item.id === change.id)!;
    assert.equal(change.expectedRevision, original.revision);
    assert.deepEqual(Object.keys(change.patch).sort(), ['gallery', 'image', 'imageAlt', 'imageAltTh']);
    const selected = selection.vessels.find(item => item.id === change.id)!;
    assert.equal(change.patch.image, urls[selected.main.url]);
    assert.deepEqual(change.patch.gallery, selected.gallery.map(photo => ({ url: urls[photo.url], alt: photo.alt, altTh: photo.altTh })));
  }
  const saved = apply(records);
  assert.deepEqual(saved.find(item => item.id === 'dumai-moe'), before.find(item => item.id === 'dumai-moe'));
  for (const original of before.slice(0, 7)) {
    const savedRecord = saved.find(item => item.id === original.id)!;
    for (const key of Object.keys(original) as (keyof ContentRecord)[]) {
      if (!['image', 'imageAlt', 'imageAltTh', 'gallery', 'revision'].includes(key)) assert.deepEqual(savedRecord[key], original[key], `${original.id}.${key}`);
    }
  }
  assert.deepEqual(records, before, 'Planning must not mutate stored content.');
});

test('wrong names, missing IDs, duplicate IDs, wrong record types and removed vessels block the entire plan', () => {
  for (const id of identities.slice(0, 7).map(item => item[0])) {
    const original = fixture();
    const index = original.findIndex(item => item.id === id);
    const wrongName = structuredClone(original); wrongName[index].title = 'Another ship';
    const wrongType = structuredClone(original); wrongType[index].type = 'Project';
    const removed = structuredClone(original); removed[index].deletedAt = '2026-11-17T00:00:00.000Z';
    for (const records of [wrongName, original.filter(item => item.id !== id), [...original, structuredClone(original[index])], wrongType, removed]) {
      assert.throws(() => buildEnhancedFleetPlan(records, urls), id);
    }
  }
});

test('the photo import accepts historical numbered names and rejects a number belonging to another vessel', () => {
  const records = fixture().map(record => ({ ...record, title: record.title.replace('MOE LINE ', 'MOE ') }));
  assert.deepEqual(buildEnhancedFleetPlan(records, urls).map(change => change.patch), buildEnhancedFleetPlan(fixture(), urls).map(change => change.patch));
  records[1].title = 'MOE 3';
  assert.throws(() => buildEnhancedFleetPlan(records, urls), /moe-line-2/);
});

test('both distinct prepared photos are required for each vessel', () => {
  for (const vessel of selection.vessels) {
    const missingMain = { ...urls }; delete missingMain[vessel.main.url];
    const missingAlternate = { ...urls }; delete missingAlternate[vessel.gallery[0].url];
    const samePhoto = { ...urls, [vessel.gallery[0].url]: urls[vessel.main.url] };
    for (const mapping of [missingMain, missingAlternate, samePhoto]) assert.throws(() => buildEnhancedFleetPlan(fixture(), mapping), vessel.id);
  }
});

test('gallery replaces explicitly labelled illustrations and retains client photographs without duplicate URLs', () => {
  const records = fixture(), selected = selection.vessels[0];
  const clientPhoto = { url: 'https://example.com/client-added.webp', alt: 'A client photograph', altTh: 'ภาพถ่ายของลูกค้า' };
  records[0].gallery = [
    { url: 'https://example.com/placeholder-1.webp', alt: 'Illustration of a vessel', altTh: '' },
    { url: 'https://example.com/placeholder-2.webp', alt: 'RANONG MOE — illustrative maritime image 2, not a photograph of this vessel.', altTh: '' },
    { url: 'https://example.com/placeholder-3.webp', alt: '', altTh: 'ภาพประกอบทางทะเล' },
    clientPhoto, structuredClone(clientPhoto),
    { url: urls[selected.main.url], alt: 'Old duplicate of new main', altTh: '' },
    { url: urls[selected.gallery[0].url], alt: 'Old caption for alternate', altTh: '' },
  ];
  const patch = buildEnhancedFleetPlan(records, urls)[0].patch;
  assert.deepEqual(patch.gallery, [{ url: urls[selected.gallery[0].url], alt: selected.gallery[0].alt, altTh: selected.gallery[0].altTh }, clientPhoto]);
  assert.equal(new Set([patch.image, ...patch.gallery!.map(photo => photo.url)]).size, 3);
});

test('already applied pairs are idempotent and mixed previously applied records update only remaining vessels', () => {
  const records = fixture(), saved = apply(records);
  assert.deepEqual(buildEnhancedFleetPlan(saved, urls), []);
  const mixed = records.map(record => record.id === saved[0].id ? saved[0] : record);
  assert.deepEqual(buildEnhancedFleetPlan(mixed, urls).map(item => item.id), identities.slice(1, 7).map(item => item[0]));
});

test('an existing gallery that cannot fit the alternate safely blocks import', () => {
  const records = fixture();
  records[0].gallery = Array.from({ length: 12 }, (_, i) => ({ url: `https://example.com/client-${i}.webp`, alt: `Client photo ${i}`, altTh: '' }));
  assert.throws(() => buildEnhancedFleetPlan(records, urls), /exceeds 12 photos/);
  records[0].gallery.pop();
  assert.equal(buildEnhancedFleetPlan(records, urls)[0].patch.gallery?.length, 12);
});

test('all fourteen prepared assets match approved source hashes, tracked files and metadata-free native dimensions', async () => {
  const mediaManifest = JSON.parse(readFileSync(new URL('../scripts/data/media-manifest.json', import.meta.url), 'utf8'));
  assert.equal(selection.assets.length, 14);
  assert.equal(new Set(selection.assets.map(item => item.url)).size, 14);
  assert.equal(new Set(selection.assets.map(item => item.sha256)).size, 14);
  assert.equal(selection.assets.some(item => item.vesselId === 'dumai-moe'), false);
  for (const asset of selection.assets) {
    const approved = approvedSources[`${asset.vesselId}:${asset.variant}`];
    assert(approved, 'Asset has no reviewed source identity.');
    assert.equal(asset.sourceSha256, approved[0]);
    const bytes = readFileSync(new URL(`../public${asset.url}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(mediaManifest.find((item: { sourcePath: string }) => item.sourcePath === asset.url), { sourcePath: asset.url, sha256: asset.sha256, bytes: asset.bytes, width: asset.width, height: asset.height, format: 'webp' });
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, approved[1]); assert.equal(metadata.height, approved[2]);
    assert.equal(metadata.format, 'webp');
    assert(!metadata.exif && !metadata.xmp && !metadata.icc);
    assert.match(asset.alt, /AI-enhanced/); assert.match(asset.altTh, /AI/);
    await sharp(bytes).raw().toBuffer();
  }
});
