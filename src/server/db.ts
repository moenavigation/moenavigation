import 'server-only';
import { MongoClient, type ClientSession, type Db } from 'mongodb';
import type { ContentRecord, Enquiry, MediaItem, SiteSettings } from '@/lib/cms-types';
import type { NotificationDelivery } from './enquiry-notifications';

export type ContentDocument = ContentRecord & { _id: string; purgeAt?: Date };
export type MediaDocument = Omit<MediaItem, 'state'> & { _id: string; state: 'uploading' | 'staged' | 'committed' | 'deleting'; owner: string; submissionId: string; pinned: boolean; touchedAt: Date; bytes?: number; sourceSha256?: string; width?: number; height?: number };
export type UserDocument = { _id: string; username: string; passwordHash: string; createdAt: Date; passwordVersion: number };
export type SessionDocument = { _id: string; userId: string; passwordVersion: number; expiresAt: Date };
export type EnquiryDocument = Enquiry & { _id: string; submissionId: string; fingerprint: string; consentAt: string; notificationDelivery?: NotificationDelivery };
type StateDocument = { _id: string; value?: string; count?: number; expiresAt?: Date };
type OperationDocument = { _id: string; fingerprint: string; result: ContentRecord; createdAt: Date };

const globalDb = globalThis as typeof globalThis & { moeMongo?: Promise<MongoClient>; moeIndexes?: Promise<void> };
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
export function collections(db: Db) {
  return {
    content: db.collection<ContentDocument>('moe_content'), media: db.collection<MediaDocument>('moe_media'),
    users: db.collection<UserDocument>('moe_users'), sessions: db.collection<SessionDocument>('moe_sessions'),
    enquiries: db.collection<EnquiryDocument>('moe_enquiries'), state: db.collection<StateDocument>('moe_state'),
    operations: db.collection<OperationDocument>('moe_operations'),
    settings: db.collection<SiteSettings & { _id: string }>('moe_settings'),
  };
}
export async function ensureIndexes() {
  if (!globalDb.moeIndexes) globalDb.moeIndexes = (async () => {
    const c = collections(await getDb());
    await Promise.all([
      c.content.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }), c.content.createIndex({ status: 1, deletedAt: 1 }),
      c.media.createIndex({ url: 1 }, { unique: true, sparse: true }), c.media.createIndex({ state: 1, touchedAt: 1 }),
      c.users.createIndex({ username: 1 }, { unique: true }), c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      c.state.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), c.enquiries.createIndex({ submissionId: 1 }, { unique: true }),
      c.enquiries.createIndex({ createdAt: -1 }),
      c.enquiries.createIndex({ createdAt: -1, _id: -1 }), c.enquiries.createIndex({ status: 1, createdAt: -1, _id: -1 }),
      c.operations.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }),
    ]);
  })().catch(error => { globalDb.moeIndexes = undefined; throw error; });
  return globalDb.moeIndexes;
}
export async function transaction<T>(run: (db: Db, session: ClientSession) => Promise<T>): Promise<T> {
  await ensureIndexes();
  const client = await getClient();
  const session = client.startSession();
  try { return await session.withTransaction(() => run(client.db(process.env.MONGODB_DB_NAME), session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
  finally { await session.endSession(); }
}
