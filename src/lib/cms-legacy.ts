import { contentTypes, type ContentRecord, type MediaItem } from './cms-types';
import { mapRecordImages, recordImageUrls } from './cms-client';

export type LegacyRecord = Omit<ContentRecord, 'revision'> & { revision?: number };
export type LegacyMedia = { id: string; title: string; image: string };
type Receipts = { records: Record<string, { localHash: string; remoteHash: string }>; media: Record<string, string>; pending?: Record<string, { id: string; attempts: number }> };
export type LegacySnapshot = { raw: Record<string, string | null>; records: LegacyRecord[]; media: LegacyMedia[]; expired: number; receipts: Receipts };
const keys = ['moe-content-v1', 'moe-media-v1'] as const;
const receiptKey = 'moe-migration-v1';
const archiveKey = 'moe-migration-archive-v1';
export const legacyRecordKey = (record: Pick<ContentRecord, 'id' | 'type'>) => `${record.type}-${record.id}`;
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
function comparable(record: LegacyRecord) { const result = { ...record }; delete result.revision; delete result.updatedAt; return result; }
function readReceipts(): Receipts {
  const parsed = JSON.parse(localStorage.getItem(receiptKey) || '{"records":{},"media":{}}');
  if (!parsed || typeof parsed.records !== 'object' || typeof parsed.media !== 'object') throw new Error('Local migration receipts could not be read. Export your local data before changing it.');
  return parsed;
}
export function readLegacySnapshot(): LegacySnapshot {
  const raw = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
  const records: unknown = JSON.parse(raw['moe-content-v1'] || '[]');
  const media: unknown = JSON.parse(raw['moe-media-v1'] || '[]');
  if (!Array.isArray(records) || records.some(record => !record || typeof record !== 'object'
    || !['id', 'title', 'titleTh', 'description', 'descriptionTh', 'image', 'category'].every(key => typeof record[key] === 'string')
    || !(contentTypes as readonly string[]).includes(record.type) || !['Published', 'Draft'].includes(record.status)
    || (record.gallery !== undefined && (!Array.isArray(record.gallery) || record.gallery.some((image: Record<string, unknown>) => !image || typeof image.url !== 'string' || typeof image.alt !== 'string' || typeof image.altTh !== 'string')))
    || (record.mobileImage !== undefined && typeof record.mobileImage !== 'string')
    || (record.deletedAt !== undefined && (typeof record.deletedAt !== 'string' || !Number.isFinite(Date.parse(record.deletedAt)))))) throw new Error('Some saved local records could not be read. Your browser data is preserved. Export it before making changes.');
  if (new Set(records.map(legacyRecordKey)).size !== records.length) throw new Error('Local records contain duplicate identifiers. Export them before making changes.');
  if (!Array.isArray(media) || media.some(item => !item || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.image !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(item.image))) throw new Error('Saved local media could not be read. Your browser data is preserved.');
  const retained = (records as LegacyRecord[]).filter(record => !record.deletedAt || Date.parse(record.deletedAt) > Date.now() - 30 * 86400000);
  return { raw, records: retained, media, expired: records.length - retained.length, receipts: readReceipts() };
}
export async function legacyImageUrl(url: string, media: MediaItem[], snapshot: LegacySnapshot): Promise<string> {
  if (url.startsWith('data:')) return snapshot.receipts.media[await digest(url)] || url;
  return media.find(item => item.sourcePath === url)?.url || url;
}
export async function translateLegacyRecord(record: LegacyRecord, media: MediaItem[], snapshot: LegacySnapshot): Promise<LegacyRecord> {
  const translations = new Map<string, string>();
  for (const url of recordImageUrls(record)) translations.set(url, await legacyImageUrl(url, media, snapshot));
  return mapRecordImages(record, url => translations.get(url) || url);
}
export async function legacyRecordMatches(local: LegacyRecord, remote: ContentRecord | undefined, media: MediaItem[], snapshot: LegacySnapshot): Promise<boolean> {
  if (!remote) return false;
  const receipt = snapshot.receipts.records[legacyRecordKey(local)];
  if (receipt && receipt.localHash === await digest(local) && receipt.remoteHash === await digest(comparable(remote))) return true;
  const translated = comparable(await translateLegacyRecord(local, media, snapshot));
  if (Boolean(local.deletedAt) !== Boolean(remote.deletedAt)) return false;
  // Compare every field present in the legacy record. New server fields remain independent.
  return Object.entries(translated).every(([key, value]) => stable(value || '') === stable(remote[key as keyof ContentRecord] || ''));
}
export async function legacyMediaMatches(local: LegacyMedia, media: MediaItem[], snapshot: LegacySnapshot): Promise<boolean> {
  const url = await legacyImageUrl(local.image, media, snapshot);
  return media.some(item => item.url === url && item.state === 'committed');
}
export async function rememberLegacyRecord(local: LegacyRecord, remote: ContentRecord) {
  const receipts = readReceipts(); receipts.records[legacyRecordKey(local)] = { localHash: await digest(local), remoteHash: await digest(comparable(remote)) };
  localStorage.setItem(receiptKey, JSON.stringify(receipts));
}
export async function rememberLegacyMedia(localUrl: string, remoteUrl: string) {
  const receipts = readReceipts(); receipts.media[await digest(localUrl)] = remoteUrl; localStorage.setItem(receiptKey, JSON.stringify(receipts));
}
export async function getLegacySubmission(key: string) {
  const receipts = readReceipts(); const hash = await digest(key);
  if (receipts.pending?.[hash]) return receipts.pending[hash];
  const submission = { id: crypto.randomUUID(), attempts: 0 }; receipts.pending = { ...receipts.pending, [hash]: submission }; localStorage.setItem(receiptKey, JSON.stringify(receipts)); return submission;
}
export async function saveLegacySubmission(key: string, submission: { id: string; attempts: number } | null) {
  const receipts = readReceipts(); const hash = await digest(key); receipts.pending ||= {};
  if (submission) receipts.pending[hash] = { id: submission.id, attempts: submission.attempts }; else delete receipts.pending[hash];
  localStorage.setItem(receiptKey, JSON.stringify(receipts));
}
export async function clearVerifiedLegacy(snapshot: LegacySnapshot, records: ContentRecord[], media: MediaItem[]) {
  for (const key of keys) if (localStorage.getItem(key) !== snapshot.raw[key]) throw new Error('Browser data changed during verification. Review the latest local data before clearing it.');
  for (const local of snapshot.records) if (!await legacyRecordMatches(local, records.find(remote => legacyRecordKey(remote) === legacyRecordKey(local)), media, snapshot)) throw new Error(`“${local.title}” has not been verified on the server. Review or import it first.`);
  for (const local of snapshot.media) if (!await legacyMediaMatches(local, media, snapshot)) throw new Error(`The local image “${local.title}” has not been verified in the media library.`);
  // Recheck after asynchronous hashing; never delete a newer browser edit.
  for (const key of keys) if (localStorage.getItem(key) !== snapshot.raw[key]) throw new Error('Browser data changed. Nothing has been cleared.');
  const archive = JSON.stringify({ raw: snapshot.raw, receipts: localStorage.getItem(receiptKey) });
  const existingArchive = localStorage.getItem(archiveKey);
  if (existingArchive && existingArchive !== archive) throw new Error('An earlier local archive is already preserved. Export it before clearing another set of local data.');
  try { localStorage.setItem(archiveKey, archive); } catch { throw new Error('There is not enough browser storage to create the recovery archive. Nothing was cleared. Export local data to keep a copy.'); }
  keys.forEach(key => localStorage.removeItem(key)); localStorage.removeItem(receiptKey);
}
export function hasLegacyArchive() { return localStorage.getItem(archiveKey) !== null; }
export function restoreLegacyArchive() {
  if (keys.some(key => localStorage.getItem(key) !== null) || localStorage.getItem(receiptKey) !== null) throw new Error('Current browser data exists. The archive cannot replace newer local data.');
  const archive = JSON.parse(localStorage.getItem(archiveKey) || 'null');
  if (!archive || !archive.raw || keys.some(key => archive.raw[key] !== null && typeof archive.raw[key] !== 'string') || (archive.receipts !== null && typeof archive.receipts !== 'string')) throw new Error('The local recovery archive could not be read.');
  const restored: string[] = [];
  try { for (const key of keys) if (archive.raw[key] !== null) { localStorage.setItem(key, archive.raw[key]); restored.push(key); } if (archive.receipts !== null) { localStorage.setItem(receiptKey, archive.receipts); restored.push(receiptKey); } }
  catch { restored.forEach(key => localStorage.removeItem(key)); throw new Error('The archive could not be restored because browser storage is full. The archive remains safe.'); }
}
