import type { ContentRecord } from '../../src/lib/cms-types';
import { recordSchema } from '../../src/lib/validation';
import { legacyRoutesPageCopy, legacyTradingRouteRecords } from './legacy-trading-routes';

export { legacyRoutesPageCopy };
export type LegacyRouteImportUpdate = {
  type: ContentRecord['type'];
  id: string;
  expectedRevision: number;
  patch: Partial<ContentRecord>;
};
export type LegacyRouteImportPlan = {
  inserts: ContentRecord[];
  updates: LegacyRouteImportUpdate[];
  conflicts: string[];
};

const imageRoot = 'https://res.cloudinary.com/yod4qzgu/image/upload/';
const firstLeg: [number, number][] = [[13.0833, 100.8833], [11.8, 100.8], [9.8, 101.1], [7.7, 102], [5.6, 103.3], [3.4, 104]];
const laemChabang = { name: 'Laem Chabang', nameTh: 'แหลมฉบัง', country: 'Thailand', countryTh: 'ไทย' };

function sample(id: string, destination: ContentRecord['destination'], image: string, order: number, tail: [number, number][]): ContentRecord {
  const englishName = destination!.name;
  const thaiName = destination!.nameTh;
  return {
    id, type: 'Route', title: `Laem Chabang — ${englishName}`, titleTh: `แหลมฉบัง — ${thaiName}`,
    description: `For an enquiry involving Laem Chabang and ${englishName}, share the cargo and preferred timing to discuss possible routing. Service availability is confirmed case by case.`,
    descriptionTh: `หากต้องการสอบถามงานระหว่างแหลมฉบังกับ${thaiName} โปรดแจ้งรายละเอียดสินค้าและช่วงเวลาที่ต้องการเพื่อหารือแนวทางการขนส่ง ความพร้อมให้บริการต้องยืนยันเป็นรายกรณี`,
    image: imageRoot + image, category: 'Port connections', categoryTh: 'ท่าเรือต้นทาง–ปลายทาง', status: 'Published', order, revision: 4,
    origin: laemChabang, destination, waypoints: [...firstLeg, ...tail],
  };
}

// Public editorial baselines inspected on 17 November 2026. These identify the
// three illustrative records the user authorized retaining as historical Drafts.
// Parsing fills harmless optional defaults; no parsed record replaces saved data.
export const legacyRouteSampleBaselines: readonly ContentRecord[] = [
  sample('laem-chabang-singapore', { name: 'Singapore', nameTh: 'สิงคโปร์', country: 'Singapore', countryTh: 'สิงคโปร์' },
    'v1792694754/moe-navigation/library/hero-6c2f556625f7536f8a39.webp', 23,
    [[2.1, 104.1], [1.17, 104.15], [1.16, 103.95], [1.2, 103.8], [1.2662, 103.7802]]),
  sample('laem-chabang-port-klang', { name: 'Port Klang', nameTh: 'ท่าเรือคลัง', country: 'Malaysia', countryTh: 'มาเลเซีย' },
    'v1792694758/moe-navigation/library/port-7db6750e9234effd2ac7.webp', 24,
    [[2.1, 104.1], [1.17, 104.15], [1.14, 103.78], [1.2, 103.55], [1.5, 103.1], [2.15, 102.35], [2.75, 101.65], [3, 101.4]]),
  sample('laem-chabang-tanjung-priok', { name: 'Tanjung Priok', nameTh: 'ตันจุงปริอ็อก', country: 'Jakarta, Indonesia', countryTh: 'จาการ์ตา อินโดนีเซีย' },
    'v1792694748/moe-navigation/library/container-vessel-15c2222f580a9621f307.webp', 25,
    [[1.6, 104.4], [0.2, 105.8], [-1.2, 107.4], [-2.8, 108.7], [-4.3, 108.6], [-5.4, 107.6], [-6.0803, 106.8803]]),
];

export const legacyRoutesPageBaseline = {
  title: 'Port connections', titleTh: 'การเชื่อมต่อระหว่างท่าเรือ',
  description: 'Review port pairs on the map, then enquire about routing, timing and availability for your cargo.',
  descriptionTh: 'ดูท่าเรือต้นทางและปลายทางบนแผนที่ แล้วสอบถามเส้นทาง ช่วงเวลา และความพร้อมให้บริการสำหรับสินค้าของคุณ',
  eyebrow: 'PORT CONNECTIONS', eyebrowTh: 'ท่าเรือในภูมิภาค',
} as const;

function canonical(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sort(child)])) : item;
  return JSON.stringify(sort(value));
}
function currentIdentity(record: ContentRecord) {
  return !record.deletedAt && Number.isInteger(record.revision) && record.revision > 0
    && (!('_id' in record) || record._id === `${record.type}:${record.id}`);
}
function sameContent(left: ContentRecord, right: ContentRecord, ignoreStatus = false) {
  const normalize = (record: ContentRecord) => recordSchema.safeParse(ignoreStatus ? { ...record, status: 'Published' } : record);
  const a = normalize(left), b = normalize(right);
  return a.success && b.success && canonical(a.data) === canonical(b.data);
}
function savedImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.username && !url.password && url.pathname.includes('/image/upload/');
  } catch { return false; }
}

/** Pure preview. The caller must refuse all writes if any conflict is returned. */
export function buildLegacyRouteImportPlan(records: readonly ContentRecord[]): LegacyRouteImportPlan {
  const plan: LegacyRouteImportPlan = { inserts: [], updates: [], conflicts: [] };
  const find = (type: ContentRecord['type'], id: string) => {
    const matches = records.filter(record => record.type === type && record.id === id);
    if (matches.length !== 1) {
      plan.conflicts.push(`${type}:${id} must have exactly one current record.`);
      return undefined;
    }
    const record = matches[0];
    if (!currentIdentity(record)) {
      plan.conflicts.push(`${type}:${id} is trashed or has an unexpected identity or revision.`);
      return undefined;
    }
    return record;
  };

  let portImage: string | undefined;
  for (const baseline of legacyRouteSampleBaselines) {
    const record = find('Route', baseline.id);
    if (!record) continue;
    if (!sameContent(record, baseline, true)) {
      plan.conflicts.push(`Route:${baseline.id} differs from the reviewed illustrative content. Preserve it for review.`);
      continue;
    }
    if (record.id === 'laem-chabang-port-klang') {
      if (savedImage(record.image)) portImage = record.image;
      else plan.conflicts.push('The saved Port Klang image is not a managed HTTPS image.');
    }
    if (record.status === 'Published') plan.updates.push({ type: 'Route', id: record.id, expectedRevision: record.revision, patch: { status: 'Draft' } });
  }

  const sourceIds = legacyTradingRouteRecords.map(record => record.id);
  if (sourceIds.length !== 5 || new Set(sourceIds).size !== 5) plan.conflicts.push('The reviewed trading-route source must contain exactly five distinct records.');
  if (!portImage) plan.conflicts.push('A reviewed saved Port Klang image is required before importing routes.');
  if (portImage) for (const source of legacyTradingRouteRecords) {
    const desired: ContentRecord = { ...structuredClone(source), image: portImage };
    const references = [desired.image, desired.mobileImage, ...(desired.gallery?.map(image => image.url) || [])].filter(Boolean);
    if (desired.type !== 'Route' || desired.status !== 'Published' || desired.revision !== 1 || desired.deletedAt || references.some(url => url !== portImage) || !recordSchema.safeParse(desired).success) {
      plan.conflicts.push(`Route:${source.id} is not a valid reviewed route using the saved image.`);
      continue;
    }
    const matches = records.filter(record => record.type === 'Route' && record.id === source.id);
    if (!matches.length) plan.inserts.push(desired);
    else if (matches.length !== 1 || !currentIdentity(matches[0]) || !sameContent(matches[0], desired)) {
      plan.conflicts.push(`Route:${source.id} already exists with different content. No existing route will be replaced.`);
    }
  }

  const page = find('Page', 'routes');
  if (page) {
    const fields = Object.keys(legacyRoutesPageBaseline) as (keyof typeof legacyRoutesPageBaseline)[];
    const existing = Object.fromEntries(fields.map(field => [field, page[field] || '']));
    if (page.status !== 'Published') plan.conflicts.push('Page:routes must remain published.');
    else if (canonical(existing) === canonical(legacyRoutesPageCopy)) { /* Already imported; preserve every field. */ }
    else if (canonical(existing) === canonical(legacyRoutesPageBaseline) && page.status === 'Published') {
      plan.updates.push({ type: 'Page', id: 'routes', expectedRevision: page.revision, patch: { ...legacyRoutesPageCopy } });
    } else plan.conflicts.push('Page:routes copy differs from the reviewed baseline. Preserve it for review.');
  }
  return plan;
}
