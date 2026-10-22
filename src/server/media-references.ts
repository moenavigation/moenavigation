import type { Filter } from 'mongodb';
import type { ContentRecord } from '@/lib/cms-types';
import type { ContentDocument } from './db';

/** All persisted image fields, including those on sections and items in Trash. */
export function contentMediaUrls(record: Pick<ContentRecord, 'image' | 'mobileImage' | 'gallery'>): string[] {
  return [...new Set([record.image, record.mobileImage, ...(record.gallery || []).map(image => image.url)].filter((url): url is string => Boolean(url)))];
}

export function contentMediaReferenceFilter(url: string): Filter<ContentDocument> {
  return { $or: [{ image: url }, { mobileImage: url }, { 'gallery.url': url }] };
}
