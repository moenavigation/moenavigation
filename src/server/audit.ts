import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession, Db, Document } from 'mongodb';
import { z } from 'zod';
import { cmsLogActions, cmsLogCategory, cmsLogEventSchema, cmsLogGroups, cmsLogPageSize, cmsLogSummary, type CmsLogActor, type CmsLogEvent, type CmsLogItem, type CmsLogPage, type CmsLogQuery } from '@/lib/cms-logs';
import { resolveCmsRole } from '@/lib/cms-roles';
import { escapeInboxSearch } from '@/lib/inbox-query';
import { collections, ensureIndexes, getDb, type AuditDocument, type UserDocument } from './db';
import { HttpError } from './http';

export function auditActor(user: Pick<UserDocument, '_id' | 'username' | 'role'>): CmsLogActor {
  return { id: user._id, username: user.username, role: resolveCmsRole(user.role) };
}

/** Preserve UTC time of day and clamp leap day to February 28 in the next year. */
export function auditExpiryDate(occurredAt: Date): Date {
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid activity date.');
  const result = new Date(occurredAt);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

/** The event and its successful mutation belong to the same caller-owned transaction. */
export async function appendAuditEvent(db: Db, session: ClientSession, event: CmsLogEvent) {
  const safe = cmsLogEventSchema.parse(event);
  const occurredAt = new Date();
  const document: AuditDocument = { _id: randomUUID(), occurredAt, expiresAt: auditExpiryDate(occurredAt), ...safe, category: cmsLogCategory(safe.action) };
  await collections(db).logs.insertOne(document, { session });
  return document._id;
}

const cursorSchema = z.strictObject({ id: z.uuid(), occurredAt: z.string().datetime(), scope: z.string().regex(/^[a-f0-9]{16}$/) });
type Cursor = z.infer<typeof cursorSchema>;
function cursorScope(query: CmsLogQuery) {
  return createHash('sha256').update(JSON.stringify([query.category, query.action, query.q.toLowerCase()])).digest('hex').slice(0, 16);
}
function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function decodeCursor(raw: string | null, scope: string) {
  if (!raw) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (cursor.scope !== scope || encodeCursor(cursor) !== raw || new Date(cursor.occurredAt).toISOString() !== cursor.occurredAt) throw new Error();
    return cursor;
  } catch { throw new HttpError(400, 'This page cursor is invalid. Refresh the list.'); }
}

export function buildCmsLogPipeline(query: CmsLogQuery, now = new Date()): Document[] {
  const cursor = decodeCursor(query.cursor, cursorScope(query));
  const group = cmsLogGroups.find(option => option.value === query.category);
  const filtered = {
    expiresAt: { $gt: now }, action: query.action === 'All' ? { $in: cmsLogActions } : query.action,
    ...(query.category === 'All' ? {} : { category: group ? { $in: group.categories } : query.category }),
    ...(query.q ? { $or: ['actor.username', 'target.label', 'target.id', 'action', 'category'].map(field => ({ [field]: { $regex: escapeInboxSearch(query.q), $options: 'i' } })) } : {}),
  };
  const page: Document[] = [];
  if (cursor) page.push({ $match: { $or: [{ occurredAt: { $lt: new Date(cursor.occurredAt) } }, { occurredAt: new Date(cursor.occurredAt), _id: { $gt: cursor.id } }] } });
  page.push({ $sort: { occurredAt: -1, _id: 1 } }, { $limit: cmsLogPageSize + 1 }, { $project: {
    _id: 1, occurredAt: 1, expiresAt: 1, action: 1, category: 1, outcome: 1,
    'actor.id': 1, 'actor.username': 1, 'actor.role': 1, 'actor.system': 1,
    'target.type': 1, 'target.id': 1, 'target.label': 1,
  } });
  return [{ $match: filtered }, { $facet: { items: page, total: [{ $count: 'value' }] } }];
}

export function formatCmsLogPage(rows: AuditDocument[], total: number, query: CmsLogQuery): CmsLogPage {
  const items: CmsLogItem[] = rows.slice(0, cmsLogPageSize).map(row => {
    // Construct every field explicitly so unexpected database fields cannot leak through a spread.
    const actor: CmsLogActor = 'id' in row.actor ? { id: row.actor.id, username: row.actor.username, role: row.actor.role } : { system: true };
    const permitsLabel = !['Enquiry', 'Session', 'MediaLibrary', 'Settings'].includes(row.target.type);
    const target = { type: row.target.type, id: row.target.id, ...(permitsLabel && row.target.label !== undefined ? { label: row.target.label } : {}) };
    const safe = cmsLogEventSchema.parse({ action: row.action, actor, target, outcome: row.outcome });
    return { id: row._id, occurredAt: row.occurredAt.toISOString(), expiresAt: row.expiresAt.toISOString(), action: safe.action, category: cmsLogCategory(safe.action), actor: safe.actor, target: safe.target, outcome: safe.outcome, summary: cmsLogSummary(safe.action, safe.outcome) };
  });
  const last = items.at(-1);
  return { items, total, nextCursor: rows.length > cmsLogPageSize && last ? encodeCursor({ id: last.id, occurredAt: last.occurredAt, scope: cursorScope(query) }) : null };
}

export async function getCmsLogPage(query: CmsLogQuery): Promise<CmsLogPage> {
  const pipeline = buildCmsLogPipeline(query);
  await ensureIndexes();
  const result = (await collections(await getDb()).logs.aggregate<{ items: AuditDocument[]; total: { value: number }[] }>(pipeline).toArray())[0];
  return formatCmsLogPage(result?.items ?? [], result?.total[0]?.value ?? 0, query);
}
