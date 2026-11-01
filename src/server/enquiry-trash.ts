import 'server-only';
import type { ClientSession, Db, Filter } from 'mongodb';
import { z } from 'zod';
import { appendAuditEvent, auditActor } from './audit';
import { collections, transaction, type EnquiryDocument, type UserDocument } from './db';
import { cleanEnquiry } from './enquiries';
import { enquiryPurgeDate, enquiryRetainedFilter, enquiryTrashRetentionMs, isEnquiryRetained } from './enquiry-retention';
import { HttpError } from './http';
import { authorizeTrashDeletion } from './trash-permissions';

export const enquiryActionSchema = z.strictObject({
  id: z.uuid(), expectedRevision: z.number().int().positive(), action: z.enum(['trash', 'restore']),
});
export const removeEnquirySchema = enquiryActionSchema.omit({ action: true });
type EnquiryAction = z.infer<typeof enquiryActionSchema>;
type RemoveEnquiry = z.infer<typeof removeEnquirySchema>;

const unavailable = () => new HttpError(404, 'This enquiry is no longer available. Refresh the inbox.');
const conflict = () => new HttpError(409, 'This enquiry changed elsewhere. Refresh and try again.');

async function currentActor(actor: UserDocument, db: Db, session: ClientSession) {
  const current = await collections(db).users.findOne({
    _id: actor._id, passwordVersion: actor.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false },
  }, { session });
  if (!current) throw new HttpError(401, 'Please sign in to continue. Your unsaved input is still available.');
  return current;
}

async function retainedEnquiry(id: string, db: Db, session: ClientSession, now: Date) {
  const record = await collections(db).enquiries.findOne({ _id: id }, { session });
  if (!record || !isEnquiryRetained(record, now)) throw unavailable();
  return record;
}

function revisionFilter(record: EnquiryDocument, now: Date): Filter<EnquiryDocument> {
  return { _id: record._id, revision: record.revision, deletedAt: record.deletedAt ?? { $exists: false }, ...enquiryRetainedFilter(now) };
}

export async function enquiryActionInTransaction(input: EnquiryAction, actor: UserDocument, db: Db, session: ClientSession, now = new Date()) {
  const c = collections(db);
  // Account edits use the same lock, so revocation cannot race this authorization.
  await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
  const author = await currentActor(actor, db, session);
  const record = await retainedEnquiry(input.id, db, session, now);
  if (record.revision !== input.expectedRevision) throw conflict();
  if (input.action === 'trash' && record.deletedAt !== undefined) throw new HttpError(409, 'This enquiry is already in Trash. Refresh the inbox.');
  if (input.action === 'restore' && record.deletedAt === undefined) throw new HttpError(409, 'This enquiry is no longer in Trash. Refresh the list.');

  const expiresAt = enquiryPurgeDate({ ...record, purgeAt: undefined, deletedAt: undefined });
  const purgeAt = input.action === 'trash'
    ? new Date(Math.min(enquiryPurgeDate(record).getTime(), now.getTime() + enquiryTrashRetentionMs))
    : expiresAt;
  const values = { expiresAt, purgeAt, updatedAt: now.toISOString(), ...(input.action === 'trash' ? { deletedAt: now.toISOString() } : {}) };
  const result = await c.enquiries.updateOne(revisionFilter(record, now), {
    $set: values, $inc: { revision: 1 }, ...(input.action === 'restore' ? { $unset: { deletedAt: '' } } : {}),
  }, { session });
  if (result.matchedCount !== 1) throw conflict();
  await appendAuditEvent(db, session, {
    action: input.action === 'trash' ? 'enquiry.trashed' : 'enquiry.restored', actor: auditActor(author), target: { type: 'Enquiry', id: record.id },
  });
  const updated = { ...record, ...values, revision: record.revision + 1 };
  if (input.action === 'restore') delete updated.deletedAt;
  return cleanEnquiry(updated);
}

export async function cmsEnquiryAction(input: EnquiryAction, actor: UserDocument) {
  return transaction((db, session) => enquiryActionInTransaction(input, actor, db, session));
}

export async function removeTrashedEnquiryInTransaction(input: RemoveEnquiry, actor: UserDocument, db: Db, session: ClientSession, now = new Date()) {
  await authorizeTrashDeletion(actor, db, session);
  const author = await currentActor(actor, db, session);
  const record = await retainedEnquiry(input.id, db, session, now);
  if (record.revision !== input.expectedRevision) throw conflict();
  if (record.deletedAt === undefined) throw new HttpError(409, 'Move this enquiry to Trash before deleting it permanently.');
  const result = await collections(db).enquiries.deleteOne(revisionFilter(record, now), { session });
  if (result.deletedCount !== 1) throw conflict();
  await appendAuditEvent(db, session, { action: 'enquiry.deleted', actor: auditActor(author), target: { type: 'Enquiry', id: record.id } });
  return { removed: true } as const;
}

export async function removeTrashedEnquiry(input: RemoveEnquiry, actor: UserDocument) {
  return transaction((db, session) => removeTrashedEnquiryInTransaction(input, actor, db, session));
}
