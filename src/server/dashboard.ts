import 'server-only';
import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { attentionIssueCodes, attentionTypes, getContentAttentionIssues, type AttentionItem, type AttentionPage, type AttentionQuery, type DashboardData, type DashboardServiceStatus } from '@/lib/cms-dashboard';
import type { ContentRecord } from '@/lib/cms-types';
import { collections, ensureIndexes, getDb, type ContentDocument } from './db';
import { cleanEnquiry } from './enquiries';
import { readEnquiryRecipients } from './enquiry-recipients';
import { emailSetupStatus } from './enquiry-notifications';
import { HttpError } from './http';

const pageSize = 12;
const serviceCacheMs = 60_000;
const attentionQuerySchema = z.strictObject({
  view: z.literal('attention'), q: z.string().trim().max(160).refine(value => !value.includes('\0')).default(''),
  type: z.enum(['All', ...attentionTypes]).default('All'), issue: z.enum(['All', ...attentionIssueCodes]).default('All'),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).nullable().default(null),
});
const cursorSchema = z.strictObject({ offset: z.number().int().min(0).max(1_000_000), scope: z.string().regex(/^[a-f0-9]{64}$/) });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function parseAttentionQuery(params: URLSearchParams): AttentionQuery {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new HttpError(400, 'Use each dashboard filter only once.');
  const { view, ...query } = attentionQuerySchema.parse(Object.fromEntries(params));
  void view;
  return query;
}

/** Filter the full active collection before slicing; missing optional fields do not create errors. */
export function attentionPageFromRecords(records: ContentRecord[], query: AttentionQuery): AttentionPage {
  const scope = hash(JSON.stringify({ q: query.q, type: query.type, issue: query.issue }));
  let offset = 0;
  if (query.cursor) {
    try {
      const cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (cursor.scope !== scope || Buffer.from(JSON.stringify(cursor)).toString('base64url') !== query.cursor) throw new Error('Cursor scope');
      offset = cursor.offset;
    } catch { throw new HttpError(400, 'This attention page has changed. Refresh the list.'); }
  }
  const search = query.q.toLocaleLowerCase();
  const items: AttentionItem[] = records.flatMap(record => {
    if (query.type !== 'All' && record.type !== query.type) return [];
    if (search && ![record.title, record.titleTh, record.id].some(value => value?.toLocaleLowerCase().includes(search))) return [];
    const issues = getContentAttentionIssues(record);
    return issues.length && (query.issue === 'All' || issues.some(issue => issue.code === query.issue)) ? [{ record, issues }] : [];
  });
  const nextOffset = offset + pageSize;
  return { items: items.slice(offset, nextOffset), total: items.length, nextCursor: nextOffset < items.length ? Buffer.from(JSON.stringify({ offset: nextOffset, scope })).toString('base64url') : null };
}

function cleanContent(row: ContentDocument): ContentRecord {
  const { _id, purgeAt, ...record } = row;
  void _id; void purgeAt;
  return record;
}
async function attentionRecords(db: Db): Promise<ContentRecord[]> {
  // Long bodies and image galleries are irrelevant to these checks. Scan the
  // complete collection using lighter records, then hydrate only the page.
  return (await collections(db).content.find({ deletedAt: { $exists: false }, type: { $in: [...attentionTypes] }, $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }] }, { projection: { body: 0, bodyTh: 0, gallery: 0, heroSlides: 0 } }).sort({ updatedAt: -1, _id: 1 }).toArray()).map(cleanContent);
}
export async function getDashboardAttention(query: AttentionQuery): Promise<AttentionPage> {
  await ensureIndexes();
  const db = await getDb();
  const page = attentionPageFromRecords(await attentionRecords(db), query);
  const records = await collections(db).content.find({ _id: { $in: page.items.map(item => `${item.record.type}:${item.record.id}`) }, deletedAt: { $exists: false } }).toArray();
  const byKey = new Map(records.map(row => [row._id, cleanContent(row)]));
  return { ...page, items: page.items.flatMap(item => {
    const record = byKey.get(`${item.record.type}:${item.record.id}`);
    return record ? [{ record, issues: getContentAttentionIssues(record) }] : [];
  }) };
}

type Environment = Readonly<Record<string, string | undefined>>;
type ServiceDependencies = { env: Environment; database: () => Promise<unknown>; images: () => Promise<unknown>; email: () => Promise<boolean>; now?: () => Date };
async function boundedCheck<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Check timed out')), 5500); })]); }
  finally { if (timer) clearTimeout(timer); }
}

/** The SDK's socket timeout does not abort a stalled request; this check does. */
export async function pingDashboardImages({ env = process.env, fetcher = fetch, timeoutMs = 5000 }: { env?: Environment; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<unknown> {
  const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !/^[A-Za-z0-9_-]{1,100}$/.test(cloud) || !key || !secret || key.length > 512 || secret.length > 2048 || /[\r\n]/.test(key + secret)) throw new Error('Image status configuration is unavailable.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Image status check timed out.')); }, timeoutMs); });
  const read = async () => {
    const response = await fetcher(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/ping`, { method: 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, Accept: 'application/json' } });
    if (!response.ok || Number(response.headers.get('content-length')) > 1024) { controller.abort(); void response.body?.cancel().catch(() => {}); throw new Error('Image status response unavailable.'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Image status response unavailable.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024) { controller.abort(); void reader.cancel().catch(() => {}); throw new Error('Image status response unavailable.'); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally { reader.releaseLock(); }
  };
  try { return await Promise.race([read(), deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

/** Safe aggregate states only: provider responses, recipient addresses and exceptions never leave the server. */
export async function checkDashboardServices({ env, database, images, email, now = () => new Date() }: ServiceDependencies): Promise<DashboardServiceStatus[]> {
  const imagesConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME?.trim() && env.CLOUDINARY_API_KEY?.trim() && env.CLOUDINARY_API_SECRET?.trim());
  const [dbResult, imageResult, emailResult] = await Promise.allSettled([
    boundedCheck(database), imagesConfigured ? boundedCheck(images) : Promise.resolve(null), boundedCheck(email),
  ]);
  const checkedAt = now().toISOString();
  const databaseOk = dbResult.status === 'fulfilled' && Boolean(dbResult.value);
  const imageOk = imageResult.status === 'fulfilled' && imageResult.value !== null && typeof imageResult.value === 'object' && 'status' in imageResult.value && imageResult.value.status === 'ok';
  return [
    { id: 'database', label: 'Database', status: databaseOk ? 'connected' : 'unavailable', detail: databaseOk ? 'Database connection verified.' : 'Database could not be reached.', checkedAt },
    { id: 'images', label: 'Image storage', status: !imagesConfigured ? 'needs_setup' : imageOk ? 'connected' : 'unavailable', detail: !imagesConfigured ? 'Image storage is not configured.' : imageOk ? 'Image storage connection verified.' : 'Image storage could not be reached.', checkedAt },
    { id: 'email', label: 'Enquiry email', status: emailResult.status === 'rejected' ? 'unknown' : emailResult.value ? 'configured' : 'needs_setup', detail: emailResult.status === 'rejected' ? 'Email setup could not be checked.' : emailResult.value ? 'Email notifications are configured. Delivery is not verified.' : 'Email notifications need setup.', checkedAt },
  ];
}

let serviceCache: { key: string; expiresAt: number; result: Promise<DashboardServiceStatus[]> } | null = null;
async function serviceStatuses(db: Db): Promise<DashboardServiceStatus[]> {
  const env = process.env;
  const key = hash(JSON.stringify([env.MONGODB_URI, env.MONGODB_DB_NAME, env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET, env.RESEND_API_KEY, env.ENQUIRY_EMAIL_FROM, env.ENQUIRY_EMAIL_TO]));
  if (serviceCache?.key === key && serviceCache.expiresAt > Date.now()) return serviceCache.result;
  const result = checkDashboardServices({
    env,
    database: async () => (await db.command({ ping: 1 }, { timeoutMS: 3000 })).ok === 1,
    images: () => pingDashboardImages({ env }),
    email: async () => emailSetupStatus(env, (await readEnquiryRecipients(db)).recipients).configured,
  });
  serviceCache = { key, expiresAt: Date.now() + serviceCacheMs, result };
  return result;
}

export async function getDashboardData(): Promise<DashboardData> {
  await ensureIndexes();
  const db = await getDb(), enquiries = collections(db).enquiries;
  const awaitingReply = { status: { $in: ['New', 'In progress'] as const } };
  const [records, rows, enquiriesTotal, services] = await Promise.all([
    attentionRecords(db), enquiries.find(awaitingReply).sort({ createdAt: -1, _id: -1 }).limit(5).toArray(),
    enquiries.countDocuments(awaitingReply), serviceStatuses(db),
  ]);
  return { attentionCount: records.filter(record => getContentAttentionIssues(record).length).length, enquiries: rows.map(cleanEnquiry), enquiriesTotal, services, checkedAt: new Date().toISOString() };
}
