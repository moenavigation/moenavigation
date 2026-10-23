import 'server-only';
import { cache } from 'react';
import type { ClientSession, Db } from 'mongodb';
import type { z } from 'zod';
import { corePageIds, type ContentRecord } from '@/lib/cms-types';
import { collections, ensureIndexes, getDb, transaction, type ContentDocument } from './db';
import { digest } from './auth';
import { HttpError } from './http';
import { actionSchema, saveSchema } from './validation';
import { lockMediaSubmission } from './media';
import { contentMediaUrls } from './media-references';

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
export async function saveContent(input: z.infer<typeof saveSchema>, owner: string) {
  return transaction((db, session) => saveContentInTransaction(input, owner, db, session));
}

/** Keep parent validation, revision checks, and media commits in the same transaction. */
export async function saveContentInTransaction(input: z.infer<typeof saveSchema>, owner: string, db: Db, session: ClientSession) {
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
  }
  const record: ContentRecord = { ...input.record, revision: (existing?.revision || 0) + 1, updatedAt: new Date().toISOString() };
  if (existing) await c.content.replaceOne({ _id: key, revision: input.expectedRevision! }, record, { session });
  else await c.content.insertOne({ _id: key, ...record }, { session });
  await c.operations.insertOne({ _id: operationId, fingerprint, result: record, createdAt: new Date() }, { session });
  return record;
}
export async function contentAction(input: z.infer<typeof actionSchema>) {
  if (input.type === 'Page' && (corePageIds as readonly string[]).includes(input.id)) throw new HttpError(400, 'Core website pages cannot be moved to Trash. You can edit their content.');
  return transaction(async (db, session) => {
    const c = collections(db);
    const record = await c.content.findOne({ _id: contentKey(input) }, { session });
    if (!record || record.purgeAt && record.purgeAt <= new Date()) throw new HttpError(404, 'This item is no longer available.');
    if (record.revision !== input.expectedRevision) throw new HttpError(409, 'This content changed elsewhere. Refresh and try again.');
    if (input.action === 'trash' && record.deletedAt || input.action === 'restore' && !record.deletedAt) throw new HttpError(409, 'The item has already changed. Refresh the content list.');
    if (input.action === 'trash') {
      record.deletedAt = new Date().toISOString();
      record.purgeAt = new Date(Date.now() + 30 * 86400000);
    } else { delete record.deletedAt; delete record.purgeAt; }
    record.revision++;
    record.updatedAt = new Date().toISOString();
    await c.content.replaceOne({ _id: record._id, revision: input.expectedRevision }, record, { session });
    return clean(record);
  });
}
