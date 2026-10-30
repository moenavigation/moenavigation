import 'server-only';
import { appendAuditEvent, auditActor } from './audit';
import { cache } from 'react';
import type { ClientSession, Db, Filter } from 'mongodb';
import { z } from 'zod';
import { contentTypes, corePageIds, type ContentRecord } from '@/lib/cms-types';
import { canManageUser, type CmsRole } from '@/lib/cms-roles';
import { collections, ensureIndexes, getDb, transaction, type ContentDocument, type UserDocument } from './db';
import { digest } from './auth';
import { HttpError } from './http';
import { actionSchema, saveSchema } from './validation';
import { lockMediaSubmission } from './media';
import { contentMediaUrls } from './media-references';
import { assertCmsContentAction, assertCmsContentEdit } from './cms-content-policy';

export const contentKey = (record: Pick<ContentRecord, 'type' | 'id'>) => `${record.type}:${record.id}`;
function clean(record: ContentDocument): ContentRecord {
  const { _id, purgeAt, ...value } = record;
  void _id; void purgeAt;
  return value;
}
export const getPublishedRecords = cache(async (): Promise<ContentRecord[]> => {
  const c = collections(await getDb());
  return (await c.content.find({ status: 'Published', deletedAt: { $exists: false } }).sort({ _id: 1 }).toArray()).map(clean);
});
// Reused by route validation and metadata within one render. Checking one indexed
// record before streaming preserves real 404 responses for missing or trashed URLs.
export const getPublishedRecord = cache(async (type: ContentRecord['type'], id: string): Promise<ContentRecord | null> => {
  const record = await collections(await getDb()).content.findOne({ _id: contentKey({ type, id }), status: 'Published', deletedAt: { $exists: false } });
  return record ? clean(record) : null;
});
export async function getContentRecords() {
  await ensureIndexes();
  return (await collections(await getDb()).content.find({ $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }] }).sort({ updatedAt: -1, _id: 1 }).toArray()).map(clean);
}

export async function getCmsContentRecord(type: ContentRecord['type'], id: string): Promise<ContentRecord | null> {
  await ensureIndexes();
  const record = await collections(await getDb()).content.findOne({ _id: contentKey({ type, id }), deletedAt: { $exists: false } });
  return record ? clean(record) : null;
}

export async function getCmsTrashRecords() {
  await ensureIndexes();
  return (await collections(await getDb()).content.find({ deletedAt: { $exists: true }, $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }] }).sort({ updatedAt: -1, _id: 1 }).toArray()).map(clean);
}

export async function getCmsContentOverview(role: CmsRole = 'Operator') {
  await ensureIndexes();
  const { content, media, users } = collections(await getDb());
  const retained = { $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }] };
  const active = { ...retained, deletedAt: { $exists: false } };
  const [core, grouped, categoriesRaw, recent, contentTrashCount, mediaTrashCount, userTrashCount] = await Promise.all([
    content.find({ ...retained, type: { $in: ['Page', 'Section'] } }).sort({ updatedAt: -1, _id: 1 }).toArray(),
    content.aggregate<{ _id: { type: ContentRecord['type']; status: ContentRecord['status'] }; count: number }>([
      { $match: active }, { $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 } } },
    ]).toArray(),
    content.aggregate<{ _id: ContentRecord['type']; en: string[]; th: string[]; maxOrder: number }>([
      { $match: active }, { $group: { _id: '$type', en: { $addToSet: '$category' }, th: { $addToSet: '$categoryTh' }, maxOrder: { $max: { $ifNull: ['$order', 0] } } } },
    ]).toArray(),
    content.find(active).sort({ updatedAt: -1, _id: 1 }).limit(5).toArray(),
    content.countDocuments({ ...retained, deletedAt: { $exists: true } }),
    media.countDocuments({ $or: [{ state: 'trashed' }, { state: 'deleting', trashedAt: { $exists: true } }] }),
    canManageUser(role, 'Operator') ? users.countDocuments({ ...retained, deletedAt: { $exists: true } }) : 0,
  ]);
  const counts = Object.fromEntries(contentTypes.map(type => [type, { total: 0, published: 0, draft: 0 }])) as Record<ContentRecord['type'], { total: number; published: number; draft: number }>;
  for (const group of grouped) {
    const bucket = counts[group._id.type];
    if (!bucket) continue;
    bucket.total += group.count;
    if (group._id.status === 'Published') bucket.published += group.count;
    else if (group._id.status === 'Draft') bucket.draft += group.count;
  }
  const categories: Partial<Record<ContentRecord['type'], { en: string[]; th: string[] }>> = {};
  const nextOrder: Partial<Record<ContentRecord['type'], number>> = {};
  for (const group of categoriesRaw) {
    if (!counts[group._id]) continue;
    categories[group._id] = {
      en: group.en.filter(value => typeof value === 'string' && value.trim()).sort((a, b) => a.localeCompare(b)),
      th: group.th.filter(value => typeof value === 'string' && value.trim()).sort((a, b) => a.localeCompare(b, 'th')),
    };
    nextOrder[group._id] = Math.min(10000, Math.max(-1, group.maxOrder) + 1);
  }
  return { records: core.map(clean), summary: { counts, categories, nextOrder, recent: recent.map(clean), trashCount: contentTrashCount + mediaTrashCount + userTrashCount } };
}

export type CmsCollectionType = Exclude<ContentRecord['type'], 'Page' | 'Section'>;
export type CmsContentPageQuery = { type: CmsCollectionType; q: string; status: 'All' | ContentRecord['status']; cursor: string | null };
const CONTENT_PAGE_SIZE = 12;
const contentCursorSchema = z.strictObject({ offset: z.number().int().min(0).max(1_000_000), scope: z.string().regex(/^[a-f0-9]{64}$/) });
const escapeContentSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function getCmsContentPage(query: CmsContentPageQuery) {
  const scope = digest(JSON.stringify({ type: query.type, q: query.q, status: query.status }));
  let offset = 0;
  if (query.cursor) {
    try {
      const decoded = contentCursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (Buffer.from(JSON.stringify(decoded)).toString('base64url') !== query.cursor || decoded.scope !== scope) throw new Error('Invalid cursor');
      offset = decoded.offset;
    } catch { throw new HttpError(400, 'This page cursor is invalid. Refresh the list.'); }
  }
  const filter: Filter<ContentDocument> = { type: query.type, deletedAt: { $exists: false } };
  if (query.status !== 'All') filter.status = query.status;
  if (query.q) {
    const match = new RegExp(escapeContentSearch(query.q), 'i');
    filter.$or = ['title', 'titleTh', 'id', 'category', 'categoryTh', 'parentId'].map(field => ({ [field]: match }));
  }
  await ensureIndexes();
  const content = collections(await getDb()).content;
  const [total, documents] = await Promise.all([
    content.countDocuments(filter),
    content.find(filter).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(CONTENT_PAGE_SIZE).toArray(),
  ]);
  const nextOffset = offset + documents.length;
  return { records: documents.map(clean), total, nextCursor: nextOffset < total ? Buffer.from(JSON.stringify({ offset: nextOffset, scope })).toString('base64url') : null };
}
export async function saveContent(input: z.infer<typeof saveSchema>, owner: string) {
  return transaction((db, session) => saveContentInTransaction(input, owner, db, session));
}

/** Browser and import saves enforce the fixed page structure; maintenance uses saveContent. */
export async function saveCmsContent(input: z.infer<typeof saveSchema>, actor: UserDocument) {
  return transaction((db, session) => saveContentInTransaction(input, actor._id, db, session, 'cms', actor));
}

/** Keep parent validation, revision checks, and media commits in the same transaction. */
export async function saveContentInTransaction(input: z.infer<typeof saveSchema>, owner: string, db: Db, session: ClientSession, source: 'maintenance' | 'cms' = 'maintenance', actor?: UserDocument) {
  // Every CMS Save makes that record available; historical states remain valid
  // for maintenance and untouched records. Normalize before idempotency checks.
  if (source === 'cms') input = { ...input, record: { ...input.record, status: 'Published' } };
  const key = contentKey(input.record);
  const fingerprint = digest(JSON.stringify({ record: input.record, expectedRevision: input.expectedRevision }));
  const c = collections(db);
  const operationId = `${owner}:${input.submissionId}`;
  const prior = await c.operations.findOne({ _id: operationId }, { session });
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new HttpError(409, 'This save identifier was already used. Start a new save after refreshing.');
    return prior.result;
  }
  await lockMediaSubmission(db, session, owner, input.submissionId);
  const existing = await c.content.findOne({ _id: key }, { session });
  if ((existing?.revision ?? null) !== input.expectedRevision || existing?.deletedAt) throw new HttpError(409, 'This content changed elsewhere. Reload the latest version before saving.');
  if (source === 'cms') assertCmsContentEdit(input.record, existing);
  if (input.record.type === 'Section' && input.record.parentId !== 'shared') {
    const parent = await c.content.findOne({ _id: contentKey({ type: 'Page', id: input.record.parentId }) }, { session });
    if (!parent || parent.deletedAt || parent.purgeAt) throw new HttpError(400, 'Choose an existing page for this section. Restore pages in Trash before adding or editing their sections.');
  }
  const images = contentMediaUrls(input.record);
  for (const url of images) {
    const media = await c.media.findOne({ url }, { session });
    if (!media || !['staged', 'committed'].includes(media.state)) throw new HttpError(400, 'Choose a library image or upload an image before saving.');
    if (media.state === 'staged' && (media.owner !== owner || media.submissionId !== input.submissionId)) throw new HttpError(403, 'This upload belongs to a different save. Please choose the image again.');
    // This write conflicts with cleanup's state claim, making save and cleanup mutually exclusive.
    await c.media.updateOne({ _id: media._id, state: media.state }, { $set: { state: 'committed', touchedAt: new Date() } }, { session });
    if (actor && media.state === 'staged') await appendAuditEvent(db, session, { action: 'media.uploaded', actor: auditActor(actor), target: { type: 'Image', id: media.id, label: media.title } });
  }
  const record: ContentRecord = { ...input.record, revision: (existing?.revision || 0) + 1, updatedAt: new Date().toISOString() };
  if (existing) await c.content.replaceOne({ _id: key, revision: input.expectedRevision! }, record, { session });
  else await c.content.insertOne({ _id: key, ...record }, { session });
  await c.operations.insertOne({ _id: operationId, fingerprint, result: record, createdAt: new Date() }, { session });
  if (actor) await appendAuditEvent(db, session, { action: existing ? 'content.updated' : 'content.created', actor: auditActor(actor), target: { type: record.type, id: record.id, label: record.title } });
  return record;
}
export async function contentAction(input: z.infer<typeof actionSchema>) {
  return transaction((db, session) => contentActionInTransaction(input, db, session));
}

export async function cmsContentAction(input: z.infer<typeof actionSchema>, actor: UserDocument) {
  return transaction((db, session) => contentActionInTransaction(input, db, session, 'cms', actor));
}

export async function contentActionInTransaction(input: z.infer<typeof actionSchema>, db: Db, session: ClientSession, source: 'maintenance' | 'cms' = 'maintenance', actor?: UserDocument) {
  if (source === 'cms') assertCmsContentAction(input.type, input.action);
  if (input.action === 'trash' && input.type === 'Page' && (corePageIds as readonly string[]).includes(input.id)) throw new HttpError(400, 'Core website pages cannot be moved to Trash. You can edit their content.');
  const c = collections(db);
  const record = await c.content.findOne({ _id: contentKey(input) }, { session });
  if (!record || record.purgeAt && record.purgeAt <= new Date()) throw new HttpError(404, 'This item is no longer available.');
  if (record.revision !== input.expectedRevision) throw new HttpError(409, 'This content changed elsewhere. Refresh and try again.');
  if (input.action === 'trash' && record.deletedAt || input.action === 'restore' && !record.deletedAt) throw new HttpError(409, 'The item has already changed. Refresh the content list.');
  if (input.action === 'restore' && record.type === 'Section' && record.parentId && record.parentId !== 'shared') {
    const parent = await c.content.findOne({ _id: `Page:${record.parentId}` }, { session });
    if (!parent || parent.deletedAt || parent.purgeAt && parent.purgeAt <= new Date()) throw new HttpError(409, 'Restore the parent page before restoring this content area.');
  }
  if (input.action === 'trash') {
    record.deletedAt = new Date().toISOString();
    record.purgeAt = new Date(Date.now() + 30 * 86400000);
  } else { delete record.deletedAt; delete record.purgeAt; }
  record.revision++;
  record.updatedAt = new Date().toISOString();
  await c.content.replaceOne({ _id: record._id, revision: input.expectedRevision }, record, { session });
  if (actor) await appendAuditEvent(db, session, { action: input.action === 'trash' ? 'content.trashed' : 'content.restored', actor: auditActor(actor), target: { type: record.type, id: record.id, label: record.title } });
  return clean(record);
}
