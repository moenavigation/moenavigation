import type { ContentRecord } from '../../src/lib/cms-types';
import { recordSchema } from '../../src/lib/validation';
import { legacyAboutCopy, legacyAboutImages, type LegacyAboutImageKey } from './legacy-about';

export type LegacyAboutImageUrls = Record<LegacyAboutImageKey, string>;
type CopyPatch = { type: ContentRecord['type']; id: string; parentId?: string; patch: Partial<ContentRecord> };
export type LegacyAboutImportPlan = { inserts: ContentRecord[]; updates: (CopyPatch & { expectedRevision: number })[]; conflicts: string[] };

const imageRoot = 'https://res.cloudinary.com/yod4qzgu/image/upload/';
// Only edited fields are baselined. Later edits to an image or a targeted text
// field block the update; unrelated bodies, media, ordering and custom fields win.
export const legacyAboutBaselines: readonly CopyPatch[] = [
  { type: 'Page', id: 'about', patch: {
    title: 'About Moe Navigation Co.,Ltd.', titleTh: 'เกี่ยวกับบริษัท โม เนวิเกชั่น จำกัด',
    description: 'Built around the people and partnerships that keep maritime operations moving.', descriptionTh: 'ร่วมงานกับผู้คนและพันธมิตรเพื่อขับเคลื่อนการปฏิบัติงานทางทะเล',
    eyebrow: 'OUR COMPANY', eyebrowTh: 'เกี่ยวกับบริษัท',
    image: imageRoot + 'v1792694748/moe-navigation/library/container-vessel-15c2222f580a9621f307.webp', imageAlt: 'Maritime operations', imageAltTh: 'งานปฏิบัติการทางทะเล',
  } },
  { type: 'Section', id: 'about-intro', parentId: 'about', patch: {
    title: 'A clear purpose.\nA practical approach.', titleTh: 'เป้าหมายชัดเจน\nแนวทางที่ทำได้จริง',
    description: 'Every operation starts with understanding your needs. Our approach brings together careful planning, clear communication and practical maritime support.',
    descriptionTh: 'ทุกงานเริ่มจากการทำความเข้าใจความต้องการของคุณ เราผสานการวางแผนอย่างรอบคอบ การสื่อสารที่ชัดเจน และการสนับสนุนงานทางทะเลที่เหมาะสม',
    eyebrow: 'WHO WE ARE', eyebrowTh: 'แนวทางของเรา', body: '', bodyTh: '',
    image: imageRoot + 'v1792694758/moe-navigation/library/port-7db6750e9234effd2ac7.webp', imageAlt: 'Port and container operations', imageAltTh: 'ท่าเรือและงานขนถ่ายตู้สินค้า',
  } },
  { type: 'Section', id: 'about-mission', parentId: 'about', patch: { description: 'Marine services shaped around your operational needs.', descriptionTh: 'บริการทางทะเลที่สอดคล้องกับความต้องการของแต่ละงาน' } },
  { type: 'Section', id: 'about-vision', parentId: 'about', patch: { description: 'Better connections across the maritime industry.', descriptionTh: 'เชื่อมโยงโอกาสในอุตสาหกรรมการเดินเรือ' } },
];

function picture(key: LegacyAboutImageKey, images: LegacyAboutImageUrls) {
  const source = legacyAboutImages.find(image => image.key === key)!;
  return { image: images[key], imageAlt: source.alt, imageAltTh: source.altTh };
}
export function legacyAboutDraftPatches(images: LegacyAboutImageUrls): CopyPatch[] {
  return [
    { type: 'Page', id: 'about', patch: { ...legacyAboutCopy.page, ...picture('hero', images) } },
    { type: 'Section', id: 'about-intro', parentId: 'about', patch: { ...legacyAboutCopy.intro, ...picture('overview', images) } },
    { type: 'Section', id: 'about-mission', parentId: 'about', patch: { ...legacyAboutCopy.mission } },
    { type: 'Section', id: 'about-vision', parentId: 'about', patch: { ...legacyAboutCopy.vision } },
  ];
}
export function legacyAboutFeatureRecords(images: LegacyAboutImageUrls): ContentRecord[] {
  return (['safety', 'maintenance', 'crew', 'office'] as const).map((key, index) => ({
    id: `about-${key}`, type: 'Section', parentId: 'about', ...legacyAboutCopy[key], ...picture(key, images),
    body: '', bodyTh: '', eyebrow: '', eyebrowTh: '', image: images[key],
    category: 'Website sections', categoryTh: 'ส่วนเนื้อหาเว็บไซต์', status: 'Published', order: 40 + index, revision: 1,
  }));
}
function identity(record: ContentRecord) {
  return !record.deletedAt && record.status === 'Published' && Number.isInteger(record.revision) && record.revision > 0
    && (!('_id' in record) || record._id === `${record.type}:${record.id}`);
}
function canonical(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sort(child)])) : item;
  return JSON.stringify(sort(value));
}

/** Pure narrow preview; any conflict prevents the maintenance caller from writing. */
export function buildLegacyAboutImportPlan(records: readonly ContentRecord[], images: LegacyAboutImageUrls): LegacyAboutImportPlan {
  const plan: LegacyAboutImportPlan = { inserts: [], updates: [], conflicts: [] };
  for (const image of legacyAboutImages) {
    try {
      const url = new URL(images[image.key]);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || !url.pathname.includes('/image/upload/')) throw new Error();
    } catch { plan.conflicts.push(`A verified managed image is required for ${image.key}.`); }
  }
  if (plan.conflicts.length) return plan;
  for (const desired of legacyAboutDraftPatches(images)) {
    const matches = records.filter(record => record.type === desired.type && record.id === desired.id);
    const current = matches[0];
    if (matches.length !== 1 || !identity(current) || (current.parentId || '') !== (desired.parentId || '')) {
      plan.conflicts.push(`${desired.type}:${desired.id} is missing, duplicated, unpublished, trashed or has an unexpected identity.`);
      continue;
    }
    const baseline = legacyAboutBaselines.find(item => item.id === desired.id)!.patch;
    const edited = Object.keys(desired.patch) as (keyof ContentRecord)[];
    const changed = edited.filter(field => canonical(current[field] ?? '') !== canonical(desired.patch[field]));
    const conflicts = changed.filter(field => canonical(current[field] ?? '') !== canonical(baseline[field] ?? ''));
    if (conflicts.length) {
      plan.conflicts.push(`${desired.type}:${desired.id} has later edits to ${conflicts.join(', ')}; preserve them for review.`);
      continue;
    }
    if (changed.length) {
      const patch = Object.fromEntries(changed.map(field => [field, desired.patch[field]]));
      if (!recordSchema.safeParse({ ...current, ...patch }).success) plan.conflicts.push(`${desired.type}:${desired.id} would be invalid after the patch.`);
      else plan.updates.push({ ...desired, patch, expectedRevision: current.revision });
    }
  }
  for (const desired of legacyAboutFeatureRecords(images)) {
    const matches = records.filter(record => record.type === desired.type && record.id === desired.id);
    if (!matches.length) plan.inserts.push(desired);
    else {
      const current = matches[0], parsed = recordSchema.safeParse(current);
      if (matches.length !== 1 || !identity(current) || !parsed.success || canonical(parsed.data) !== canonical(recordSchema.parse(desired))) {
        plan.conflicts.push(`Section:${desired.id} already exists with different content or identity; preserve it for review.`);
      }
    }
  }
  return plan;
}
