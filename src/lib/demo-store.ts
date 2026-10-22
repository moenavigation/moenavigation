import { news, projects, services, vessels } from './content';

export type DemoRecord = {
  id: string;
  type: 'Vessel' | 'Project' | 'News' | 'Service' | 'Page' | 'Route';
  title: string;
  titleTh: string;
  description: string;
  descriptionTh: string;
  image: string;
  category: string;
  categoryTh?: string;
  status: 'Published' | 'Draft';
  deletedAt?: string;
};

export const DEMO_STORAGE_KEY = 'moe-content-v1';
export const DEMO_CONTENT_EVENT = 'moe-demo-content';
export const DEMO_TRASH_DAYS = 30;

// These are sample records for the demo. Specifications and business details
// will be supplied and verified before a production launch.
const vesselRecords: DemoRecord[] = vessels.map(vessel => ({ id: vessel.id, type: 'Vessel', title: vessel.name, titleTh: vessel.name, description: vessel.description.en, descriptionTh: vessel.description.th, image: vessel.image, category: vessel.type, status: 'Published' }));
const projectRecords: DemoRecord[] = projects.map(project => ({ id: project.id, type: 'Project', title: project.title.en, titleTh: project.title.th, description: project.description.en, descriptionTh: project.description.th, image: project.image, category: project.category, status: 'Published' }));
const serviceRecords: DemoRecord[] = services.map(service => ({ id: service.id, type: 'Service', title: service.title.en, titleTh: service.title.th, description: service.description.en, descriptionTh: service.description.th, image: service.image, category: 'Maritime services', status: 'Published' }));
const newsRecords: DemoRecord[] = news.map(article => ({ id: article.id, type: 'News', title: article.title.en, titleTh: article.title.th, description: article.description.en, descriptionTh: article.description.th, image: article.image, category: article.category, status: 'Published' }));

export const demoSeed: DemoRecord[] = [
  projectRecords[0], vesselRecords[0],
  { id: 'home', type: 'Page', title: 'Your trusted maritime partner.', titleTh: 'พันธมิตรที่คุณวางใจ ในทุกการเดินทาง', description: 'Connecting people, vessels and possibilities. Maritime services built around your journey.', descriptionTh: 'เชื่อมโยงผู้คน เรือ และโอกาสใหม่ ด้วยบริการทางทะเลที่พร้อมดูแลทุกการเดินทางของคุณ', image: '/images/hero.webp', category: 'Website pages', status: 'Published' },
  { id: 'services', type: 'Page', title: 'Our services', titleTh: 'บริการของเรา', description: 'Maritime expertise. Dependable support.', descriptionTh: 'ความเชี่ยวชาญทางทะเล พร้อมการสนับสนุนที่เชื่อถือได้', image: '/images/container-vessel.webp', category: 'Website pages', status: 'Published' },
  ...vesselRecords.slice(1), ...projectRecords.slice(1), ...serviceRecords, ...newsRecords,
  { id: 'laem-chabang-singapore', type: 'Route', title: 'Laem Chabang — Singapore', titleTh: 'แหลมฉบัง — สิงคโปร์', description: 'Illustrative shipping route. Schedules and service availability will be confirmed later.', descriptionTh: 'ตัวอย่างเส้นทางเดินเรือ ตารางเวลาและบริการจะยืนยันภายหลัง', image: '/images/hero.webp', category: 'Regional route', status: 'Published' },
  { id: 'laem-chabang-port-klang', type: 'Route', title: 'Laem Chabang — Port Klang', titleTh: 'แหลมฉบัง — ท่าเรือคลัง', description: 'Illustrative regional route. Schedules and service availability will be confirmed later.', descriptionTh: 'ตัวอย่างเส้นทางภูมิภาค ตารางเวลาและบริการจะยืนยันภายหลัง', image: '/images/port.webp', category: 'Regional route', status: 'Published' },
  { id: 'laem-chabang-tanjung-priok', type: 'Route', title: 'Laem Chabang — Tanjung Priok', titleTh: 'แหลมฉบัง — ตันจุงปริอ็อก', description: 'Illustrative regional route. Schedules and service availability will be confirmed later.', descriptionTh: 'ตัวอย่างเส้นทางภูมิภาค ตารางเวลาและบริการจะยืนยันภายหลัง', image: '/images/container-vessel.webp', category: 'Regional route', status: 'Published' },
  { id: 'about', type: 'Page', title: 'About MOE Navigation', titleTh: 'เกี่ยวกับ MOE Navigation', description: 'Built around the people and partnerships that keep maritime operations moving.', descriptionTh: 'ร่วมงานกับผู้คนและพันธมิตรเพื่อขับเคลื่อนการปฏิบัติงานทางทะเล', image: '/images/container-vessel.webp', category: 'Website pages', status: 'Published' },
];

const recordTypes = new Set(['Vessel', 'Project', 'News', 'Service', 'Page', 'Route']);
export function demoRecordKey(record: Pick<DemoRecord, 'id' | 'type'>): string { return `${record.type}-${record.id}`; }

function validRecord(value: unknown): value is DemoRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const strings = ['id', 'title', 'titleTh', 'description', 'descriptionTh', 'image', 'category'];
  return strings.every(key => typeof record[key] === 'string')
    && recordTypes.has(String(record.type))
    && (record.status === 'Published' || record.status === 'Draft')
    && (record.categoryTh === undefined || typeof record.categoryTh === 'string')
    && (record.deletedAt === undefined || (typeof record.deletedAt === 'string' && Number.isFinite(Date.parse(record.deletedAt))));
}

export function saveDemoRecords(records: DemoRecord[]): void {
  if (typeof window === 'undefined') throw new Error('Demo changes can only be saved in a browser.');
  if (!Array.isArray(records) || !records.every(validRecord)) throw new Error('The demo content could not be validated.');
  if (new Set(records.map(demoRecordKey)).size !== records.length) throw new Error('Content identifiers must be unique within their type.');
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(records));
  } catch {
    throw new Error('Your browser could not save this change. Storage may be full or disabled. Keep this editor open, use a smaller image, and try again.');
  }
  window.dispatchEvent(new Event(DEMO_CONTENT_EVENT));
}

function readDemoRecords(): DemoRecord[] {
  if (typeof window === 'undefined') return demoSeed.map(record => ({ ...record }));
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  } catch {
    throw new Error('Browser storage is unavailable. Demo changes cannot be loaded or saved in this browser.');
  }
  if (raw === null) return demoSeed.map(record => ({ ...record }));
  let records: unknown;
  try {
    records = JSON.parse(raw);
  } catch {
    throw new Error('The saved demo content could not be read. Existing browser data has been preserved.');
  }
  if (!Array.isArray(records) || !records.every(validRecord) || new Set(records.map(demoRecordKey)).size !== records.length) {
    throw new Error('The saved demo content is invalid. Existing browser data has been preserved.');
  }
  return records;
}

function retainedRecords(records: DemoRecord[]): DemoRecord[] {
  const expiry = Date.now() - DEMO_TRASH_DAYS * 24 * 60 * 60 * 1000;
  return records.filter(record => !record.deletedAt || Date.parse(record.deletedAt) > expiry);
}

export function getDemoRecords(): DemoRecord[] { return retainedRecords(readDemoRecords()); }

// Call from a CMS effect or event handler, never a render/snapshot read.
export function reconcileDemoTrash(): void {
  if (typeof window === 'undefined') return;
  const records = readDemoRecords();
  const retained = retainedRecords(records);
  if (retained.length !== records.length) saveDemoRecords(retained);
}
