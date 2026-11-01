import 'server-only';
import type { Filter } from 'mongodb';
import type { EnquiryDocument } from './db';

export const enquiryTrashRetentionMs = 30 * 24 * 60 * 60 * 1000;

function retentionDate(value: Date | string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || typeof value === 'string' && value !== date.toISOString() && value !== date.toISOString().slice(0, 10)) throw new Error('Invalid enquiry retention date.');
  return date;
}

/** Keep the received UTC time, clamping leap day to February 28 next year. */
export function enquiryExpiryDate(createdAt: Date | string): Date {
  const created = retentionDate(createdAt);
  const result = new Date(created);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

type RetainedEnquiry = Pick<EnquiryDocument, 'createdAt' | 'expiresAt' | 'purgeAt' | 'deletedAt'>;

/** A shorter stored deadline is respected; no operation can extend the original year. */
export function enquiryPurgeDate(record: RetainedEnquiry): Date {
  const candidates = [enquiryExpiryDate(record.createdAt).getTime()];
  for (const field of ['expiresAt', 'purgeAt'] as const) {
    if (record[field] === undefined) continue;
    if (!(record[field] instanceof Date) || !Number.isFinite(record[field].getTime())) throw new Error('Invalid enquiry retention date.');
    candidates.push(record[field].getTime());
  }
  if (record.deletedAt !== undefined) {
    const deleted = retentionDate(record.deletedAt).getTime();
    candidates.push(deleted + enquiryTrashRetentionMs);
  }
  return new Date(Math.min(...candidates));
}

export function isEnquiryRetained(record: RetainedEnquiry, now = new Date()): boolean {
  try { return enquiryPurgeDate(record).getTime() > now.getTime(); }
  catch { return false; }
}

const parsedDate = (field: string) => ({ $convert: { input: `$${field}`, to: 'date', onError: null, onNull: null } });
const deadlineFilter = (field: string, unit: 'year' | 'day', amount: number, now: Date) => ({ $expr: { $and: [
  // Keep JS and MongoDB parsing identical. Date-only legacy values are UTC;
  // normalized invalid days and timezone-less timestamps fail closed.
  { $in: [`$${field}`, ['%Y-%m-%dT%H:%M:%S.%LZ', '%Y-%m-%d'].map(format => ({ $dateToString: { date: parsedDate(field), format, timezone: 'UTC', onNull: null } }))] },
  { $gt: [{ $dateAdd: { startDate: parsedDate(field), unit, amount, timezone: 'UTC' } }, now] },
] } });

/** MongoDB TTL cleanup is asynchronous, so reads also enforce every deadline. */
export function enquiryRetainedFilter(now = new Date()): Filter<EnquiryDocument> {
  return { $and: [
    deadlineFilter('createdAt', 'year', 1, now),
    { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $type: 'date', $gt: now } }] },
    { $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $type: 'date', $gt: now } }] },
    { $or: [{ deletedAt: { $exists: false } }, deadlineFilter('deletedAt', 'day', 30, now)] },
  ] };
}

export function activeEnquiryFilter(now = new Date()): Filter<EnquiryDocument> {
  return { $and: [enquiryRetainedFilter(now), { deletedAt: { $exists: false } }] };
}
