import 'server-only';
import { createHash } from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { ClientSession, Db, Filter } from 'mongodb';
import { z } from 'zod';
import type { ContentRecord, MediaItem } from '@/lib/cms-types';
import { escapeInboxSearch } from '@/lib/inbox-query';
import { collections, ensureIndexes, getDb, transaction, type MediaDocument, type UserDocument } from './db';
import { digest, rateLimit } from './auth';
import { HttpError, readBytes } from './http';
import { submissionSchema } from './validation';
import { nextCursor, readCursor } from './pagination';
import { contentMediaReferenceFilter, hasMediaReferences, userMediaReferenceFilter } from './media-references';
import { authorizeTrashDeletion } from './trash-permissions';
import { appendAuditEvent, auditActor } from './audit';

const uploadLeaseMs = 120000;
const submissionKey = (owner: string, submissionId: string) => `media-submission:${digest(`${owner}:${submissionId}`)}`;
async function abortSubmission(db: Db, session: ClientSession, owner: string, submissionId: string) {
  return collections(db).state.findOneAndUpdate({ _id: submissionKey(owner, submissionId) }, {
    $set: { value: 'aborted' }, $inc: { count: 1 },
  }, { upsert: true, returnDocument: 'after', session });
}

// Every save, upload reservation/completion, and abort writes this same row. MongoDB
// then retries a competing transaction instead of allowing a late save after abort.
async function touchSubmission(db: Db, session: ClientSession, owner: string, submissionId: string) {
  return collections(db).state.findOneAndUpdate({ _id: submissionKey(owner, submissionId) }, {
    $setOnInsert: { value: 'open' }, $inc: { count: 1 },
  }, { upsert: true, returnDocument: 'after', session });
}
export async function lockMediaSubmission(db: Db, session: ClientSession, owner: string, submissionId: string) {
  const state = await touchSubmission(db, session, owner, submissionId);
  if (state?.value === 'aborted') throw new HttpError(409, 'This save was cancelled. Start a new save to upload the prepared images again.');
}

export const mediaFolder = () => process.env.CLOUDINARY_FOLDER || 'moe-navigation';
export function mediaProvider() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error('Cloudinary configuration is missing.');
  if (!/^[a-zA-Z0-9/_-]+$/.test(mediaFolder())) throw new Error('Invalid Cloudinary folder.');
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}
function clean(media: MediaDocument): MediaItem {
  return { id: media.id, title: media.title, url: media.url, publicId: media.publicId, state: media.state === 'trashed' ? 'trashed' : media.state === 'committed' ? 'committed' : 'staged', createdAt: media.createdAt, ...(media.trashedAt ? { trashedAt: media.trashedAt } : {}), ...(media.sourcePath ? { sourcePath: media.sourcePath } : {}) };
}
function imageType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export async function uploadMedia(request: Request, owner: string, actor?: UserDocument): Promise<MediaItem> {
  await ensureIndexes();
  const body = await readBytes(request, 3 * 1024 * 1024 + 65536);
  let form: FormData;
  try { form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData(); }
  catch { throw new HttpError(400, 'The image could not be read. Please choose it again.'); }
  const submissionId = submissionSchema.parse(form.get('submissionId'));
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) throw new HttpError(400, 'Choose a prepared JPEG, PNG or WebP image up to 3 MB.');
  const data = Buffer.from(await file.arrayBuffer());
  if (imageType(data) !== file.type) throw new HttpError(400, 'The file must contain a valid JPEG, PNG or WebP image.');
  const id = digest(`${owner}:${submissionId}:${createHash('sha256').update(data).digest('hex')}`);
  const publicId = `${mediaFolder()}/${id}`;
  const c = collections(await getDb());
  await rateLimit(`upload:${owner}`, 100, 60 * 60);
  const reservation = await transaction(async (db, session) => {
    const scoped = collections(db);
    const existing = await scoped.media.findOne({ _id: id }, { session });
    if (existing?.state === 'committed') return { ready: existing };
    await lockMediaSubmission(db, session, owner, submissionId);
    if (existing?.state === 'staged') return { ready: existing };
    const now = new Date();
    if (!existing) {
      await scoped.media.insertOne({ _id: id, id, title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Uploaded image', url: `pending:${id}`, publicId, state: 'uploading', owner, submissionId, pinned: false, touchedAt: now, createdAt: now.toISOString() }, { session });
    } else {
      if (existing.state !== 'uploading' || existing.touchedAt.getTime() > Date.now() - uploadLeaseMs) throw new HttpError(409, 'This image is still processing. Wait two minutes, then retry the same save.');
      await scoped.media.updateOne({ _id: id, state: 'uploading', touchedAt: existing.touchedAt }, { $set: { touchedAt: now } }, { session });
    }
    return { leaseAt: now };
  });
  if (reservation.ready) return clean(reservation.ready);
  const provider = mediaProvider();
  let result: Pick<UploadApiResponse, 'public_id' | 'secure_url' | 'bytes'>;
  try {
    result = await new Promise<UploadApiResponse>((resolveUpload, rejectUpload) => {
      const stream = provider.uploader.upload_stream({ public_id: publicId, resource_type: 'image', overwrite: false, allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], timeout: 60000 }, (error, value) => {
        if (error || !value) rejectUpload(new Error('CloudinaryUploadError'));
        else resolveUpload(value);
      });
      stream.end(data);
    });
  } catch {
    // A timed-out response can still have uploaded successfully; deterministic IDs allow recovery.
    try { result = await provider.api.resource(publicId, { resource_type: 'image' }) as UploadApiResponse; }
    catch { await c.media.updateOne({ _id: id, state: 'uploading', touchedAt: reservation.leaseAt }, { $set: { touchedAt: new Date() } }); throw new HttpError(502, 'The image upload could not be confirmed. Your prepared image is kept; wait two minutes, then retry the save.'); }
  }
  if (result.public_id !== publicId || !result.secure_url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`)) throw new Error('UnexpectedCloudinaryAsset');
  const updated = await transaction(async (db, session) => {
    const state = await touchSubmission(db, session, owner, submissionId);
    const scoped = collections(db);
    const existing = await scoped.media.findOne({ _id: id }, { session });
    if (existing?.state === 'committed') return existing;
    if (state?.value === 'aborted') {
      // Cleanup may already have removed an expired reservation. A late provider
      // response must still retain a deletion retry record for this exact asset.
      const cancelled: MediaDocument = { _id: id, id, title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Uploaded image', url: result.secure_url, publicId, state: 'deleting', owner, submissionId, pinned: false, touchedAt: new Date(), createdAt: existing?.createdAt || reservation.leaseAt!.toISOString(), bytes: result.bytes };
      await scoped.media.replaceOne({ _id: id }, cancelled, { upsert: true, session });
      return cancelled;
    }
    if (existing?.state === 'staged') return existing;
    return scoped.media.findOneAndUpdate({ _id: id, state: 'uploading', touchedAt: reservation.leaseAt }, { $set: {
      state: 'staged', url: result.secure_url, bytes: result.bytes, touchedAt: new Date(),
    } }, { returnDocument: 'after', session });
  });
  if (!updated) throw new HttpError(409, 'This upload changed during processing. Retry the save.');
  if (updated.state === 'deleting') {
    await deleteClaimedMedia(updated, actor);
    throw new HttpError(409, 'This save was cancelled. Start a new save to upload the prepared images again.');
  }
  return clean(updated);
}
export async function getMedia() {
  return (await collections(await getDb()).media.find({ state: 'committed' }).sort({ createdAt: -1 }).toArray()).map(clean);
}
const mediaCursorSchema = z.strictObject({ id: z.string().min(1).max(100), createdAt: z.string().datetime(), search: z.string().regex(/^[a-f0-9]{16}$/) });
function mediaSearchCursor(record: { id: string; createdAt: string }, query: string) {
  return Buffer.from(JSON.stringify({ id: record.id, createdAt: record.createdAt, search: digest(query).slice(0, 16) })).toString('base64url');
}
function readMediaCursor(rawCursor: string | null, query: string) {
  if (!query) {
    const cursor = readCursor(rawCursor);
    if (rawCursor && (!cursor || nextCursor(cursor) !== rawCursor)) throw new HttpError(400, 'This page cursor is invalid. Refresh the list.');
    return cursor;
  }
  if (!rawCursor) return null;
  try {
    if (rawCursor.length > 400 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) throw new Error();
    const cursor = mediaCursorSchema.parse(JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')));
    if (cursor.search !== digest(query).slice(0, 16) || mediaSearchCursor(cursor, query) !== rawCursor) throw new Error();
    return cursor;
  } catch { throw new HttpError(400, 'This page cursor is invalid. Refresh the list.'); }
}
export async function getMediaPage(rawCursor: string | null, rawQuery: string | null = null, state: 'committed' | 'trashed' = 'committed', pageSize = 50) {
  const query = (rawQuery || '').trim().toLocaleLowerCase();
  if (query.length > 160 || query.includes('\0')) throw new HttpError(400, 'Search image names using up to 160 characters.');
  const cursorScope = state === 'trashed' ? `trash:${query}` : query;
  const cursor = readMediaCursor(rawCursor, cursorScope);
  const filter: Filter<MediaDocument> = {
    state,
    ...(query ? { title: { $regex: escapeInboxSearch(query), $options: 'i' } } : {}),
    ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] } : {}),
  };
  const items = await collections(await getDb()).media.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize + 1).toArray();
  return { media: items.slice(0, pageSize).map(clean), nextCursor: items.length > pageSize ? cursorScope ? mediaSearchCursor(items[pageSize - 1], cursorScope) : nextCursor(items[pageSize - 1]) : null };
}
export const getMediaTrashPage = (cursor: string | null) => getMediaPage(cursor, null, 'trashed', 30);

async function deleteClaimedMedia(media: MediaDocument, actor?: UserDocument): Promise<boolean> {
  const c = collections(await getDb());
  try {
    const result = await mediaProvider().uploader.destroy(media.publicId!, { resource_type: 'image', invalidate: true });
    if (!['ok', 'not found'].includes(result.result)) throw new Error('CloudinaryDeleteError');
    await transaction(async (db, session) => {
      const removed = await collections(db).media.deleteOne({ _id: media._id, state: 'deleting' }, { session });
      if (removed.deletedCount && actor) await appendAuditEvent(db, session, {
        action: media.trashedAt || media.state === 'trashed' || media.state === 'committed' || media.pinned ? 'media.deleted' : 'media.upload_discarded',
        actor: auditActor(actor), target: { type: 'Image', id: media.id, label: media.title },
      });
    });
    return true;
  } catch {
    // Keep the exact asset identity so an authorized Cleanup can retry deletion.
    await c.media.updateOne({ _id: media._id, state: 'deleting' }, { $set: { touchedAt: new Date(0) } });
    if (actor) {
      try {
        await transaction((db, session) => appendAuditEvent(db, session, {
          action: 'media.delete_failed', actor: auditActor(actor), target: { type: 'Image', id: media.id, label: media.title }, outcome: 'failed',
        }));
      } catch { /* The retained deletion claim is authoritative if logging is also unavailable. */ }
    }
    return false;
  }
}

export type MediaSubmissionResult = {
  status: 'committed' | 'pending' | 'aborted' | 'open';
  record?: ContentRecord;
  media: MediaItem[];
  deleted: number;
  failed: number;
  pending: number;
};

export async function resolveMediaSubmission(submissionId: string, owner: string, action: 'resolve' | 'abort', actor?: UserDocument): Promise<MediaSubmissionResult> {
  const outcome = await transaction(async (db, session) => {
    const c = collections(db);
    // A successful save remains authoritative even if its response was lost.
    const operation = await c.operations.findOne({ _id: `${owner}:${submissionId}` }, { session });
    let state = await c.state.findOne({ _id: submissionKey(owner, submissionId) }, { session });
    if (action === 'abort') {
      state = await abortSubmission(db, session, owner, submissionId);
    }
    const media = await c.media.find({ owner, submissionId }, { session }).toArray();
    return { record: operation?.result, aborted: state?.value === 'aborted', media };
  });
  let deleted = 0, failed = 0;
  if (action === 'abort') {
    for (const candidate of outcome.media) {
      if (candidate.pinned || candidate.trashedAt || candidate.state === 'committed' || candidate.state === 'trashed' || !candidate.publicId?.startsWith(`${mediaFolder()}/`)) continue;
      const claimed = await transaction(async (db, session) => {
        const c = collections(db);
        const current = await c.media.findOne({ _id: candidate._id, owner, submissionId }, { session });
        if (!current || current.pinned || current.trashedAt || current.state === 'committed' || current.state === 'trashed') return null;
        // The provider request can still complete after the caller loses its connection.
        // Its completion sees the tombstone and deletes only its own upload.
        if (current.state === 'uploading' && current.touchedAt.getTime() > Date.now() - uploadLeaseMs) return null;
        if (await hasMediaReferences(db, current.url, session)) return null;
        await c.media.updateOne({ _id: current._id, state: current.state }, { $set: { state: 'deleting', touchedAt: new Date() } }, { session });
        return current;
      });
      if (!claimed) continue;
      if (await deleteClaimedMedia(claimed, actor)) deleted++; else failed++;
    }
  }
  const resolved = await transaction(async (db, session) => {
    const c = collections(db);
    const operation = await c.operations.findOne({ _id: `${owner}:${submissionId}` }, { session });
    const state = await c.state.findOne({ _id: submissionKey(owner, submissionId) }, { session });
    const media = await c.media.find({ owner, submissionId }, { session }).toArray();
    return { record: operation?.result, aborted: state?.value === 'aborted', media };
  });
  const remaining = resolved.media;
  const committed = remaining.filter(item => item.state === 'committed').map(clean);
  const pending = remaining.filter(item => item.state === 'uploading').length;
  const status = resolved.record || committed.length ? 'committed' : pending ? 'pending' : resolved.aborted ? 'aborted' : 'open';
  return { status, ...(resolved.record ? { record: resolved.record } : {}), media: committed, deleted, failed, pending };
}

export async function removeMedia(mediaId: string, requireTrash = false, actor?: UserDocument) {
  const media = await transaction(async (db, session) => {
    if (actor) await authorizeTrashDeletion(actor, db, session);
    const c = collections(db);
    const item = await c.media.findOne({ _id: mediaId }, { session });
    if (!item) return null;
    if (requireTrash && item.state !== 'trashed' && !(item.state === 'deleting' && item.trashedAt)) throw new HttpError(409, 'Move this image to Media Trash before deleting it permanently.');
    if (!item.publicId?.startsWith(`${mediaFolder()}/`)) throw new HttpError(400, 'This image is outside the managed library.');
    if (item.state === 'uploading') throw new HttpError(409, 'This image is still uploading. Wait for its submission to finish before removing it.');
    if (await hasMediaReferences(db, item.url, session)) throw new HttpError(409, 'This image is used by content or a user profile, including Trash. Replace it there before removing it.');
    await abortSubmission(db, session, item.owner, item.submissionId);
    await c.media.updateOne({ _id: mediaId }, { $set: { state: 'deleting', pinned: false, touchedAt: new Date(0) } }, { session });
    return item;
  });
  if (!media) return { removed: true };
  if (!await deleteClaimedMedia(media, actor)) throw new HttpError(502, 'The image could not be removed. Retry Cleanup to finish removing it.');
  return { removed: true };
}
export async function getMediaUsage(mediaId: string) {
  await ensureIndexes();
  const c = collections(await getDb());
  const media = await c.media.findOne({ _id: mediaId, state: 'committed' });
  if (!media) throw new HttpError(404, 'This image is no longer in the library. Refresh the page.');
  const [documents, users] = await Promise.all([
    c.content.find(contentMediaReferenceFilter(media.url), {
      projection: { type: 1, id: 1, title: 1, titleTh: 1, status: 1, parentId: 1, deletedAt: 1, updatedAt: 1, image: 1, mobileImage: 1, gallery: 1, heroSlides: 1 },
    }).sort({ deletedAt: 1, updatedAt: -1, _id: 1 }).toArray(),
    c.users.find(userMediaReferenceFilter(media.url), { projection: { _id: 1, username: 1, deletedAt: 1 } }).sort({ deletedAt: 1, username: 1, _id: 1 }).toArray(),
  ]);
  return {
    media: { id: media.id, title: media.title },
    usages: [...documents.map(record => {
      const fields: Array<'image' | 'mobileImage' | 'gallery' | 'heroSlides'> = [];
      if (record.image === media.url) fields.push('image');
      if (record.mobileImage === media.url) fields.push('mobileImage');
      if (record.gallery?.some(image => image.url === media.url)) fields.push('gallery');
      if (record.heroSlides?.some(image => image.url === media.url)) fields.push('heroSlides');
      return {
        type: record.type, id: record.id, title: record.title, titleTh: record.titleTh,
        status: record.status, ...(record.parentId ? { parentId: record.parentId } : {}),
        ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}), fields,
      };
    }), ...users.map(user => ({
      type: 'User' as const, id: user._id, title: user.username, titleTh: user.username,
      ...(user.deletedAt ? { deletedAt: user.deletedAt.toISOString() } : {}), fields: ['avatar'] as ['avatar'],
    }))],
  };
}
export async function trashMedia(mediaId: string, actor?: UserDocument): Promise<MediaItem> {
  return transaction(async (db, session) => {
    const c = collections(db);
    const item = await c.media.findOne({ _id: mediaId }, { session });
    if (!item) throw new HttpError(404, 'This image is no longer in the library. Refresh the page.');
    if (item.state === 'trashed') return clean(item);
    if (item.state !== 'committed') throw new HttpError(409, 'This image is still processing. Try again after it is saved.');
    if (!item.publicId?.startsWith(`${mediaFolder()}/`)) throw new HttpError(400, 'This image is outside the managed library.');
    if (await hasMediaReferences(db, item.url, session)) throw new HttpError(409, 'This image is used by content or a user profile, including Trash. Replace it there before moving it to Media Trash.');
    const moved = await c.media.findOneAndUpdate({ _id: mediaId, state: 'committed', touchedAt: item.touchedAt }, { $set: { state: 'trashed', trashedAt: new Date().toISOString(), touchedAt: new Date() } }, { session, returnDocument: 'after' });
    if (!moved) throw new HttpError(409, 'This image changed while it was being moved. Refresh the library and try again.');
    if (actor) await appendAuditEvent(db, session, { action: 'media.trashed', actor: auditActor(actor), target: { type: 'Image', id: moved.id, label: moved.title } });
    return clean(moved);
  });
}
export async function restoreMedia(mediaId: string, actor?: UserDocument): Promise<MediaItem> {
  return transaction(async (db, session) => {
    const c = collections(db);
    const item = await c.media.findOne({ _id: mediaId }, { session });
    if (!item) throw new HttpError(404, 'This image is no longer in Media Trash. Refresh the list.');
    if (item.state === 'committed') return clean(item);
    if (item.state !== 'trashed') throw new HttpError(409, 'This image is not ready to restore. Refresh Media Trash.');
    const restored = await c.media.findOneAndUpdate({ _id: mediaId, state: 'trashed', touchedAt: item.touchedAt }, { $set: { state: 'committed', pinned: true, touchedAt: new Date() }, $unset: { trashedAt: '' } }, { session, returnDocument: 'after' });
    if (!restored) throw new HttpError(409, 'This image changed while it was being restored. Refresh Media Trash and try again.');
    if (actor) await appendAuditEvent(db, session, { action: 'media.restored', actor: auditActor(actor), target: { type: 'Image', id: restored.id, label: restored.title } });
    return clean(restored);
  });
}
export async function commitMedia(mediaId: string, submissionId: string, title: string, owner: string, actor?: UserDocument) {
  return transaction(async (db, session) => {
    const c = collections(db);
    const media = await c.media.findOne({ _id: mediaId, owner, submissionId, state: { $in: ['staged', 'committed'] } }, { session });
    if (!media) throw new HttpError(403, 'This upload is not available for this save.');
    if (media.state === 'committed' && media.pinned) return clean(media);
    await lockMediaSubmission(db, session, owner, submissionId);
    media.state = 'committed'; media.pinned = true; media.title = title; media.touchedAt = new Date();
    await c.media.replaceOne({ _id: mediaId }, media, { session });
    if (actor) await appendAuditEvent(db, session, { action: 'media.uploaded', actor: auditActor(actor), target: { type: 'Image', id: media.id, label: media.title } });
    return clean(media);
  });
}
export async function cleanupMedia({ allowTrashDeletion = true, actor }: { allowTrashDeletion?: boolean; actor?: UserDocument } = {}) {
  const c = collections(await getDb());
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  let trashed = 0;
  // A saved image becomes recoverable Media Trash only after the same reference
  // check used by the usage dialog, including content already in Trash.
  for await (const candidate of c.media.find({ state: 'committed', touchedAt: { $lt: cutoff } }).sort({ touchedAt: 1, _id: 1 })) {
    if (!candidate.publicId?.startsWith(`${mediaFolder()}/`)) continue;
    const moved = await transaction(async (db, session) => {
      const scoped = collections(db);
      const current = await scoped.media.findOne({ _id: candidate._id, state: 'committed', touchedAt: candidate.touchedAt }, { session });
      if (!current || await hasMediaReferences(db, current.url, session)) return false;
      const result = await scoped.media.updateOne({ _id: current._id, state: 'committed', touchedAt: current.touchedAt }, { $set: { state: 'trashed', trashedAt: new Date().toISOString(), touchedAt: new Date() } }, { session });
      if (result.modifiedCount && actor) await appendAuditEvent(db, session, { action: 'media.trashed', actor: auditActor(actor), target: { type: 'Image', id: current.id, label: current.title } });
      return result.modifiedCount === 1;
    });
    if (moved) trashed++;
  }
  // Unfinished uploads have no saved library entry to restore. Keep their
  // existing one-hour grace and provider deletion retry workflow.
  const candidates = await c.media.find({ pinned: false, state: { $in: ['uploading', 'staged', 'deleting'] }, touchedAt: { $lt: cutoff }, ...(!allowTrashDeletion ? { owner: actor?._id ?? '', trashedAt: { $exists: false } } : {}) }).sort({ touchedAt: 1 }).limit(50).toArray();
  let deleted = 0, failed = 0;
  for (const candidate of candidates) {
    if (!candidate.publicId?.startsWith(`${mediaFolder()}/`)) continue;
    const claimed = await transaction(async (db, session) => {
      // Cross-account cleanup is privileged too. Recheck the current stored role
      // under the users lock so a demotion cannot retain a prior cleanup claim.
      if (actor && (candidate.trashedAt || candidate.owner !== actor._id)) await authorizeTrashDeletion(actor, db, session);
      const scoped = collections(db);
      if (await hasMediaReferences(db, candidate.url, session)) {
        await scoped.media.updateOne({ _id: candidate._id, state: candidate.state, touchedAt: candidate.touchedAt }, { $set: { touchedAt: new Date() } }, { session });
        return false;
      }
      const result = await scoped.media.updateOne({ _id: candidate._id, owner: candidate.owner, pinned: false, state: candidate.state, touchedAt: candidate.touchedAt }, { $set: { state: 'deleting', touchedAt: new Date() } }, { session });
      // Close only a reservation actually claimed; a refreshed lease stays active.
      if (result.modifiedCount) await abortSubmission(db, session, candidate.owner, candidate.submissionId);
      return result.modifiedCount === 1;
    });
    if (!claimed) continue;
    if (await deleteClaimedMedia(candidate, actor)) deleted++; else failed++;
  }
  if (actor) await transaction((db, session) => appendAuditEvent(db, session, { action: 'media.cleanup', actor: auditActor(actor), target: { type: 'MediaLibrary', id: 'library' }, outcome: failed ? 'failed' : 'success' }));
  return { trashed, deleted, failed };
}
