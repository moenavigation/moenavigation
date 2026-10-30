import 'server-only';
import { MongoClient, type AggregateOptions, type ClientSession, type Db, type Document, type Filter, type FindOptions, type InsertOneOptions } from 'mongodb';
import type { ContentRecord, Enquiry, MediaItem, SiteSettings } from '@/lib/cms-types';
import type { CmsRole } from '@/lib/cms-roles';
import type { CmsLogItem } from '@/lib/cms-logs';
import type { NotificationDelivery } from './enquiry-notifications';

export type ContentDocument = ContentRecord & { _id: string; purgeAt?: Date };
export type MediaDocument = Omit<MediaItem, 'state'> & { _id: string; state: 'uploading' | 'staged' | 'committed' | 'trashed' | 'deleting'; owner: string; submissionId: string; pinned: boolean; touchedAt: Date; bytes?: number; sourceSha256?: string; width?: number; height?: number };
export type UserDocument = { _id: string; username: string; role?: CmsRole; passwordHash: string; createdAt: Date; passwordVersion: number; avatar?: string; profileRevision?: number; deletedAt?: Date; purgeAt?: Date };
export type SessionDocument = { _id: string; userId: string; passwordVersion: number; expiresAt: Date };
export type EnquiryDocument = Enquiry & { _id: string; submissionId: string; fingerprint: string; consentAt: string; notificationDelivery?: NotificationDelivery };
export type AuditDocument = Omit<CmsLogItem, 'id' | 'summary' | 'occurredAt' | 'expiresAt'> & { _id: string; occurredAt: Date; expiresAt: Date };
type StateDocument = { _id: string; value?: string; count?: number; expiresAt?: Date };
type OperationDocument = { _id: string; fingerprint: string; result: ContentRecord; createdAt: Date };

type IndexCache = { version: string; promise: Promise<void> };
// Bump when index definitions change so development hot reload applies new indexes.
const indexSchemaVersion = '2026-10-30-user-profiles-v1';
const globalDb = globalThis as typeof globalThis & { moeMongo?: Promise<MongoClient>; moeIndexes?: Promise<void>; moeIndexCache?: IndexCache };
export async function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MongoDB configuration is missing.');
  if (!globalDb.moeMongo) globalDb.moeMongo = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 }).connect().catch(error => { globalDb.moeMongo = undefined; throw error; });
  return globalDb.moeMongo;
}
export async function getDb(): Promise<Db> {
  const name = process.env.MONGODB_DB_NAME;
  if (!name || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('MongoDB database name is missing or invalid.');
  return (await getClient()).db(name);
}
function assertReadOnlyLogPipeline(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertReadOnlyLogPipeline); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$out' || key === '$merge') throw new Error('Activity logs only support read-only aggregation.');
    assertReadOnlyLogPipeline(child);
  }
}
export function collections(db: Db) {
  const logCollection = db.collection<AuditDocument>('moe_logs');
  // Keep update/delete methods unavailable to CMS code, including through aggregation write stages.
  const logs = Object.freeze({
    find: (filter: Filter<AuditDocument> = {}, options?: FindOptions) => logCollection.find(filter, options),
    aggregate: <T extends Document = AuditDocument>(pipeline: Document[] = [], options?: AggregateOptions) => {
      assertReadOnlyLogPipeline(pipeline);
      return logCollection.aggregate<T>(pipeline, options);
    },
    insertOne: (document: AuditDocument, options?: InsertOneOptions) => logCollection.insertOne(document, options),
  });
  return {
    content: db.collection<ContentDocument>('moe_content'), media: db.collection<MediaDocument>('moe_media'),
    users: db.collection<UserDocument>('moe_users'), sessions: db.collection<SessionDocument>('moe_sessions'),
    enquiries: db.collection<EnquiryDocument>('moe_enquiries'), state: db.collection<StateDocument>('moe_state'),
    operations: db.collection<OperationDocument>('moe_operations'),
    settings: db.collection<SiteSettings & { _id: string }>('moe_settings'),
    logs,
  };
}
export async function ensureIndexes() {
  if (globalDb.moeIndexCache?.version === indexSchemaVersion) return globalDb.moeIndexCache.promise;
  // The legacy promise may survive a hot reload; do not let its old failure handler own the new cache.
  const previous = globalDb.moeIndexCache?.promise ?? globalDb.moeIndexes;
  const promise = (async () => {
    if (previous) await previous.catch(() => undefined);
    const db = await getDb();
    const c = collections(db);
    const logIndexes = db.collection<AuditDocument>('moe_logs');
    await Promise.all([
      c.content.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }), c.content.createIndex({ status: 1, deletedAt: 1 }),
      c.content.createIndex({ type: 1, deletedAt: 1, updatedAt: -1, _id: 1 }),
      c.content.createIndex({ image: 1 }), c.content.createIndex({ mobileImage: 1 }), c.content.createIndex({ 'gallery.url': 1 }),
      c.media.createIndex({ url: 1 }, { unique: true, sparse: true }), c.media.createIndex({ state: 1, touchedAt: 1 }), c.media.createIndex({ state: 1, createdAt: -1, _id: -1 }),
      c.users.createIndex({ username: 1 }, { unique: true }), c.users.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }),
      c.users.createIndex({ avatar: 1 }),
      c.users.createIndex({ deletedAt: -1, _id: 1 }), c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      c.state.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), c.enquiries.createIndex({ submissionId: 1 }, { unique: true }),
      c.enquiries.createIndex({ createdAt: -1 }),
      c.enquiries.createIndex({ createdAt: -1, _id: -1 }), c.enquiries.createIndex({ status: 1, createdAt: -1, _id: -1 }),
      c.operations.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }),
      logIndexes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      logIndexes.createIndex({ occurredAt: -1, _id: 1 }),
      logIndexes.createIndex({ category: 1, occurredAt: -1, _id: 1 }),
      logIndexes.createIndex({ action: 1, occurredAt: -1, _id: 1 }),
    ]);
  })();
  const entry: IndexCache = { version: indexSchemaVersion, promise };
  globalDb.moeIndexCache = entry;
  void promise.catch(() => {
    // An older initialization must never invalidate a newer schema's in-flight promise.
    if (globalDb.moeIndexCache === entry) globalDb.moeIndexCache = undefined;
  });
  return promise;
}
export async function transaction<T>(run: (db: Db, session: ClientSession) => Promise<T>): Promise<T> {
  await ensureIndexes();
  const client = await getClient();
  const session = client.startSession();
  try { return await session.withTransaction(() => run(client.db(process.env.MONGODB_DB_NAME), session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
  finally { await session.endSession(); }
}
