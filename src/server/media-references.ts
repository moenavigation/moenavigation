import type { ClientSession, Db, Filter } from 'mongodb';
import type { ContentRecord } from '@/lib/cms-types';
import type { ContentDocument, UserDocument } from './db';

/** All persisted image fields, including those on sections and items in Trash. */
export function contentMediaUrls(record: Pick<ContentRecord, 'image' | 'mobileImage' | 'gallery'>): string[] {
  return [...new Set([record.image, record.mobileImage, ...(record.gallery || []).map(image => image.url)].filter((url): url is string => Boolean(url)))];
}

export function contentMediaReferenceFilter(url: string): Filter<ContentDocument> {
  return { $or: [{ image: url }, { mobileImage: url }, { 'gallery.url': url }] };
}

export function userMediaReferenceFilter(url: string): Filter<UserDocument> {
  return { avatar: url };
}

/** Retain pictures for active records and records still physically retained in Trash. */
export async function hasMediaReferences(db: Db, url: string, session?: ClientSession): Promise<boolean> {
  if (!url) return false;
  const options = { projection: { _id: 1 }, ...(session ? { session } : {}) };
  // Keep transactional queries sequential: MongoDB sessions do not support parallel operations.
  if (await db.collection<ContentDocument>('moe_content').findOne(contentMediaReferenceFilter(url), options)) return true;
  return Boolean(await db.collection<UserDocument>('moe_users').findOne(userMediaReferenceFilter(url), options));
}
