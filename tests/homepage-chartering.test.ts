import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHomepageCopy, defaultHomeCharters } from '../src/lib/homepage-chartering';
import { websiteContentRecords } from '../scripts/data/website-content';
import { recordSchema } from '../src/lib/validation';

test('the previous published introduction and seed copy converge while each edited language is retained', () => {
  const home = websiteContentRecords.find(record => record.type === 'Page' && record.id === 'home')!;
  assert.equal(home.title, 'Moe Navigation Co., Ltd.');
  assert.equal(home.titleTh, 'บริษัท โม เนวิเกชั่น จำกัด');
  const legacy = { ...home, title: 'Moe Navigation Co.,Ltd.', titleTh: 'บรรณาธิการแก้ไขชื่อเรื่อง', eyebrow: 'Beyond Shipping · Built on Trust' };
  assert.deepEqual(applyHomepageCopy(legacy), { ...home, titleTh: legacy.titleTh });
  const unrelated = { ...legacy, type: 'News' };
  assert.equal(applyHomepageCopy(unrelated), unrelated);
  assert.deepEqual(applyHomepageCopy(home), home);
});

test('homepage services store bilingual text for three charter types and the included management component', () => {
  const expertise = websiteContentRecords.find(record => record.type === 'Section' && record.id === 'home-expertise')!;
  const record = { ...expertise, homeCharters: structuredClone(defaultHomeCharters) };
  record.homeCharters.crane.title = 'Edited crane charter';
  assert.deepEqual(recordSchema.parse(record).homeCharters, record.homeCharters);
  assert.equal(recordSchema.safeParse({ ...record, parentId: 'shared' }).success, false);
  assert.equal(recordSchema.safeParse({ ...record, homeCharters: { ...record.homeCharters, tanker: undefined } }).success, false);
});
