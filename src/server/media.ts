import 'server-only';
import { createHash } from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { ClientSession, Db } from 'mongodb';
import type { ContentRecord, MediaItem } from '@/lib/cms-types';
import { collections, ensureIndexes, getDb, transaction, type MediaDocument } from './db';
import { digest, rateLimit } from './auth';
import { HttpError, readBytes } from './http';
import { submissionSchema } from './validation';
import { nextCursor, readCursor } from './pagination';
import { contentMediaReferenceFilter } from './media-references';

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
  return { id: media.id, title: media.title, url: media.url, publicId: media.publicId, state: media.state === 'committed' ? 'committed' : 'staged', createdAt: media.createdAt, ...(media.sourcePath ? { sourcePath: media.sourcePath } : {}) };
}
function imageType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export async function uploadMedia(request: Request, owner: string): Promise<MediaItem> {
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
    await deleteClaimedMedia(updated);
    throw new HttpError(409, 'This save was cancelled. Start a new save to upload the prepared images again.');
  }
  return clean(updated);
}
export async function getMedia() {
  return (await collections(await getDb()).media.find({ state: 'committed' }).sort({ createdAt: -1 }).toArray()).map(clean);
}
export async function getMediaPage(rawCursor: string | null) {
  const cursor = readCursor(rawCursor);
  const filter = { state: 'committed' as const, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] } : {}) };
  const items = await collections(await getDb()).media.find(filter).sort({ createdAt: -1, _id: -1 }).limit(51).toArray();
  return { media: items.slice(0, 50).map(clean), nextCursor: items.length > 50 ? nextCursor(items[49]) : null };
}

async function deleteClaimedMedia(media: MediaDocument): Promise<boolean> {
  const c = collections(await getDb());
  try {
    const result = await mediaProvider().uploader.destroy(media.publicId!, { resource_type: 'image', invalidate: true });
    if (!['ok', 'not found'].includes(result.result)) throw new Error('CloudinaryDeleteError');
    await c.media.deleteOne({ _id: media._id, state: 'deleting' });
    return true;
  } catch {
    // Keep the exact asset identity so an authorized Cleanup can retry deletion.
    await c.media.updateOne({ _id: media._id, state: 'deleting' }, { $set: { touchedAt: new Date(0) } });
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

export async function resolveMediaSubmission(submissionId: string, owner: string, action: 'resolve' | 'abort'): Promise<MediaSubmissionResult> {
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
      if (candidate.pinned || candidate.state === 'committed' || !candidate.publicId?.startsWith(`${mediaFolder()}/`)) continue;
      const claimed = await transaction(async (db, session) => {
        const c = collections(db);
        const current = await c.media.findOne({ _id: candidate._id, owner, submissionId }, { session });
        if (!current || current.pinned || current.state === 'committed') return null;
        // The provider request can still complete after the caller loses its connection.
        // Its completion sees the tombstone and deletes only its own upload.
        if (current.state === 'uploading' && current.touchedAt.getTime() > Date.now() - uploadLeaseMs) return null;
        if (await c.content.findOne(contentMediaReferenceFilter(current.url), { session })) return null;
        await c.media.updateOne({ _id: current._id, state: current.state }, { $set: { state: 'deleting', touchedAt: new Date() } }, { session });
        return current;
      });
      if (!claimed) continue;
      if (await deleteClaimedMedia(claimed)) deleted++; else failed++;
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

export async function removeMedia(mediaId: string) {
  const media = await transaction(async (db, session) => {
    const c = collections(db);
    const item = await c.media.findOne({ _id: mediaId }, { session });
    if (!item) return null;
    if (!item.publicId?.startsWith(`${mediaFolder()}/`)) throw new HttpError(400, 'This image is outside the managed library.');
    if (item.state === 'uploading') throw new HttpError(409, 'This image is still uploading. Wait for its submission to finish before removing it.');
    if (await c.content.findOne(contentMediaReferenceFilter(item.url), { session })) throw new HttpError(409, 'This image is used by content, including Trash. Replace it there before removing it.');
    await abortSubmission(db, session, item.owner, item.submissionId);
    await c.media.updateOne({ _id: mediaId }, { $set: { state: 'deleting', pinned: false, touchedAt: new Date(0) } }, { session });
    return item;
  });
  if (!media) return { removed: true };
  if (!await deleteClaimedMedia(media)) throw new HttpError(502, 'The image could not be removed. Retry Cleanup to finish removing it.');
  return { removed: true };
}
export async function commitMedia(mediaId: string, submissionId: string, title: string, owner: string) {
  return transaction(async (db, session) => {
    const c = collections(db);
    const media = await c.media.findOne({ _id: mediaId, owner, submissionId, state: { $in: ['staged', 'committed'] } }, { session });
    if (!media) throw new HttpError(403, 'This upload is not available for this save.');
    if (media.state === 'committed' && media.pinned) return clean(media);
    await lockMediaSubmission(db, session, owner, submissionId);
    media.state = 'committed'; media.pinned = true; media.title = title; media.touchedAt = new Date();
    await c.media.replaceOne({ _id: mediaId }, media, { session });
    return clean(media);
  });
}
export async function cleanupMedia() {
  const c = collections(await getDb());
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  // Previously committed assets stay in the library until explicitly removed.
  const candidates = await c.media.find({ pinned: false, state: { $in: ['uploading', 'staged', 'deleting'] }, touchedAt: { $lt: cutoff } }).sort({ touchedAt: 1 }).limit(50).toArray();
  let deleted = 0, failed = 0;
  for (const candidate of candidates) {
    if (!candidate.publicId?.startsWith(`${mediaFolder()}/`)) continue;
    const claimed = await transaction(async (db, session) => {
      const scoped = collections(db);
      if (await scoped.content.findOne(contentMediaReferenceFilter(candidate.url), { session })) {
        await scoped.media.updateOne({ _id: candidate._id, state: candidate.state, touchedAt: candidate.touchedAt }, { $set: { touchedAt: new Date() } }, { session });
        return false;
      }
      const result = await scoped.media.updateOne({ _id: candidate._id, pinned: false, state: candidate.state, touchedAt: candidate.touchedAt }, { $set: { state: 'deleting', touchedAt: new Date() } }, { session });
      // Close only a reservation actually claimed; a refreshed lease stays active.
      if (result.modifiedCount) await abortSubmission(db, session, candidate.owner, candidate.submissionId);
      return result.modifiedCount === 1;
    });
    if (!claimed) continue;
    if (await deleteClaimedMedia(candidate)) deleted++; else failed++;
  }
  return { deleted, failed };
}
