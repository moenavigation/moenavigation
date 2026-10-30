import 'server-only';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { enquiryRecipientList, saveEnquiryRecipientsSchema, type EnquiryRecipientSettings } from '@/lib/enquiry-email';
import { resolveCmsRole } from '@/lib/cms-roles';
import { collections, getDb, transaction, type UserDocument } from './db';
import { appendAuditEvent, auditActor } from './audit';
import { HttpError } from './http';

const settingsId = 'enquiry-email-recipients';
type Environment = Readonly<Record<string, string | undefined>>;
type Document = EnquiryRecipientSettings & { _id: string };
const settings = (db: Db) => db.collection<Document>('moe_settings');

/** A saved empty list intentionally pauses mail; never fall back after Save. */
export async function readEnquiryRecipients(db?: Db, env: Environment = process.env): Promise<EnquiryRecipientSettings> {
  const row = await settings(db ?? await getDb()).findOne({ _id: settingsId });
  if (!row) {
    const legacy = env.ENQUIRY_EMAIL_TO?.trim();
    return { revision: 0, recipients: legacy && z.email().max(254).safeParse(legacy).success ? [legacy] : [] };
  }
  const parsed = enquiryRecipientList.safeParse(row.recipients);
  if (!parsed.success || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new HttpError(503, 'The recipient list could not be read. Please contact your website developer.');
  return { revision: row.revision, recipients: parsed.data };
}

export async function saveEnquiryRecipients(input: z.infer<typeof saveEnquiryRecipientsSchema>, actor: UserDocument): Promise<EnquiryRecipientSettings> {
  return transaction(async (db, session) => {
    const c = collections(db);
    await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
    const current = await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session });
    if (!current) throw new HttpError(401, 'Please sign in to continue.');
    if (!['Dev', 'Admin'].includes(resolveCmsRole(current.role))) throw new HttpError(403, 'Only Dev and Admin can manage notification recipients.');
    await c.state.updateOne({ _id: 'enquiry-recipients-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
    const existing = await settings(db).findOne({ _id: settingsId }, { session });
    const revision = existing?.revision ?? 0;
    if (revision !== input.expectedRevision) {
      if (revision === input.expectedRevision + 1 && JSON.stringify(existing?.recipients) === JSON.stringify(input.recipients)) return { revision, recipients: input.recipients };
      throw new HttpError(409, 'Recipients changed elsewhere. Load the latest list before saving.');
    }
    const result = { revision: revision + 1, recipients: input.recipients };
    await settings(db).replaceOne({ _id: settingsId }, result, { upsert: true, session });
    await appendAuditEvent(db, session, { action: 'settings.email_recipients_updated', actor: auditActor(current), target: { type: 'Settings', id: settingsId } });
    return result;
  });
}
