import { z } from 'zod';
import { HttpError } from './http';
const schema = z.object({ id: z.string().min(1).max(100), createdAt: z.string().datetime() });
export function readCursor(raw: string | null) {
  if (!raw) return null;
  try {
    if (raw.length > 400) throw new Error();
    return schema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch { throw new HttpError(400, 'This page cursor is invalid. Refresh the list.'); }
}
export function nextCursor(record: { id: string; createdAt: string }) {
  return Buffer.from(JSON.stringify({ id: record.id, createdAt: record.createdAt })).toString('base64url');
}
