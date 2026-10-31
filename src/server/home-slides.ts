import 'server-only';
import type { ClientSession, Db } from 'mongodb';
import type { z } from 'zod';
import { digest } from './auth';
import { getCmsContentRecord, saveContentInTransaction } from './content';
import { collections, transaction, type UserDocument } from './db';
import { HttpError } from './http';
import { saveHomeSlidesSchema, saveSchema } from './validation';

export async function getCmsHomeSlides() {
  const record = await getCmsContentRecord('Page', 'home');
  if (!record) throw new HttpError(404, 'The home page is not available.');
  return record;
}

export async function saveHomeSlides(input: z.infer<typeof saveHomeSlidesSchema>, actor: UserDocument) {
  return transaction((db, session) => saveHomeSlidesInTransaction(input, actor, db, session));
}

export async function saveHomeSlidesInTransaction(input: z.infer<typeof saveHomeSlidesSchema>, actor: UserDocument, db: Db, session: ClientSession) {
  const c = collections(db);
  // Fingerprint the dedicated request, not the reconstructed page. A retry
  // remains idempotent even if another editor has since changed page copy.
  const fingerprint = digest(JSON.stringify({ kind: 'home-slides', slides: input.slides, intervalSeconds: input.intervalSeconds, expectedRevision: input.expectedRevision }));
  const prior = await c.operations.findOne({ _id: `${actor._id}:${input.submissionId}` }, { session });
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new HttpError(409, 'This save identifier was already used. Start a new save after refreshing.');
    return prior.result;
  }
  const existing = await c.content.findOne({ _id: 'Page:home' }, { session });
  if (!existing || existing.deletedAt) throw new HttpError(404, 'The home page is not available.');
  const save = saveSchema.parse({
    record: { ...existing, heroSlides: input.slides, heroSlideInterval: input.intervalSeconds, status: 'Published' },
    expectedRevision: input.expectedRevision, submissionId: input.submissionId,
  });
  return saveContentInTransaction(save, actor._id, db, session, 'cms', actor, fingerprint);
}
