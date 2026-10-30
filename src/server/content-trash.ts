import 'server-only';
import { appendAuditEvent, auditActor } from './audit';
import { z } from 'zod';
import { contentTypes, corePageIds } from '@/lib/cms-types';
import { idSchema } from '@/lib/validation';
import { collections, transaction, type UserDocument } from './db';
import { HttpError } from './http';
import { authorizeTrashDeletion } from './trash-permissions';

export const removeContentSchema = z.strictObject({
  id: idSchema,
  type: z.enum(contentTypes),
  expectedRevision: z.number().int().positive(),
});

export async function removeTrashedContent(input: z.infer<typeof removeContentSchema>, actor: UserDocument) {
  return transaction(async (db, session) => {
    await authorizeTrashDeletion(actor, db, session);
    const c = collections(db);
    const key = `${input.type}:${input.id}`;
    const record = await c.content.findOne({ _id: key }, { session });
    if (!record || record.purgeAt && record.purgeAt <= new Date()) throw new HttpError(404, 'This item is no longer available.');
    if (!record.deletedAt) throw new HttpError(409, 'Move this content to Trash before deleting it permanently.');
    if (record.revision !== input.expectedRevision) throw new HttpError(409, 'This content changed elsewhere. Refresh and try again.');
    if (record.type === 'Page' && (corePageIds as readonly string[]).includes(record.id)) throw new HttpError(400, 'Core website pages cannot be permanently deleted. Restore this page instead.');
    if (record.type === 'Page' && await c.content.findOne({ type: 'Section', parentId: record.id }, { session })) throw new HttpError(409, 'This page still has content areas. Restore it or remove those areas from Trash first.');
    await c.content.deleteOne({ _id: key, revision: input.expectedRevision }, { session });
    await appendAuditEvent(db, session, { action: 'content.deleted', actor: auditActor(actor), target: { type: record.type, id: record.id, label: record.title } });
    // Library images remain available and reference-checked by the separate media cleanup workflow.
    return { removed: true };
  });
}
