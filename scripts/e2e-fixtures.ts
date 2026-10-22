import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { MongoClient, type Db } from 'mongodb';
import type { ContentRecord } from '../src/lib/cms-types';
import { websiteContentRecords } from './data/website-content';

export const E2E_DATABASE = 'moenavigation_e2e';
export const E2E_BASE_URL = 'https://127.0.0.1:3010';
export const E2E_ADMIN = { id: '00000000-0000-4000-8000-000000000001', username: 'e2e-admin', password: 'Only-for-local-E2E-2026!' } as const;
export const E2E_IMAGE_ORIGIN = 'https://res.cloudinary.com/moe-e2e/image/upload/';
// Generate a complete synthetic PNG, including valid chunk checksums.
export function createE2eImageBuffer(color: [number, number, number] = [29, 83, 111]) {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const width = 64, height = 48, header = Buffer.alloc(13), pixels = Buffer.alloc((width * 3 + 1) * height);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(color, y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
export const E2E_IMAGE_BUFFER = createE2eImageBuffer();
export const E2E_IMAGE_URL = `${E2E_IMAGE_ORIGIN}v1/hero.png`;
export const E2E_INBOX = {
  total: 130, newCount: 44, inProgressCount: 43, resolvedCount: 43,
  oldThai: { id: enquiryId(0), query: 'คำขอเก่าท่าเรือสงขลา', subject: 'คำขอเก่าท่าเรือสงขลา', status: 'New' },
  literal: { id: enquiryId(1), query: '[cargo].*', subject: 'Literal [cargo].* shipment', status: 'In progress' },
  oldResolved: { id: enquiryId(2), query: 'old-resolved-anchor', subject: 'old-resolved-anchor', status: 'Resolved' },
} as const;

const ownedCollections = ['moe_content', 'moe_media', 'moe_users', 'moe_sessions', 'moe_state', 'moe_operations', 'moe_enquiries', 'moe_settings'] as const;
function enquiryId(index: number) { return `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`; }

export function e2eConnection() {
  const uri = process.env.MOE_E2E_MONGODB_URI || '';
  const owner = process.env.MOE_E2E_OWNER || '';
  assert(/^mongodb:\/\/127\.0\.0\.1:\d+\/(?:moenavigation_e2e)?\?(?:[^#]+)$/.test(uri), 'E2E database URI must be the runner-owned loopback replica set.');
  const parsed = new URL(uri);
  assert(Number(parsed.port) > 1024 && !parsed.username && !parsed.password, 'Unexpected E2E database connection.');
  assert(/^[0-9a-f-]{36}$/.test(owner), 'Run browser tests with npm run test:e2e.');
  return { uri, owner };
}

export async function assertOwnedDatabase(db: Db) {
  const { owner } = e2eConnection();
  assert.equal(db.databaseName, E2E_DATABASE, 'Only the fixed ephemeral E2E database may be reset.');
  const marker = await db.collection<{ _id: string; owner: string }>('e2e_owner').findOne({ _id: 'suite' });
  assert.equal(marker?.owner, owner, 'E2E database ownership does not match this runner.');
}

export async function connectE2eDatabase() {
  const { uri } = e2eConnection();
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  try { const db = client.db(E2E_DATABASE); await assertOwnedDatabase(db); return { client, db }; }
  catch (error) { await client.close(); throw error; }
}

export async function seedE2eDatabase(db: Db) {
  await assertOwnedDatabase(db);
  // Keep collection indexes: the real app caches index initialization for its process.
  for (const name of ownedCollections) await db.collection(name).deleteMany({});
  const source = structuredClone(websiteContentRecords) as ContentRecord[];
  const originals = new Set(source.flatMap(record => [record.image, record.mobileImage, ...(record.gallery || []).map(image => image.url)]).filter((url): url is string => Boolean(url)));
  const mappings = new Map([...originals].map(url => [url, `${E2E_IMAGE_ORIGIN}v1/${url.split('/').at(-1)!.replace(/\.[^.]+$/, '')}.png`]));
  const now = new Date().toISOString();
  for (const record of source) {
    record.image = mappings.get(record.image) || '';
    if (record.mobileImage) record.mobileImage = mappings.get(record.mobileImage);
    for (const image of record.gallery || []) image.url = mappings.get(image.url)!;
    record.revision = 1; record.updatedAt = now;
  }
  await db.collection('moe_content').insertMany(source.map(record => ({ _id: `${record.type}:${record.id}`, ...record })) as never[]);
  await db.collection('moe_media').insertMany([...mappings].map(([sourcePath, url], index) => {
    const id = `fixture-image-${String(index + 1).padStart(2, '0')}`;
    return { _id: id, id, title: sourcePath.split('/').at(-1)!, url, publicId: `moe-e2e/${id}`, sourcePath, state: 'committed', owner: E2E_ADMIN.id, submissionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, pinned: true, createdAt: now, touchedAt: new Date(), bytes: E2E_IMAGE_BUFFER.length };
  }) as never[]);
  const salt = 'a'.repeat(32);
  const passwordHash = `scrypt:${salt}:${scryptSync(E2E_ADMIN.password, salt, 64).toString('hex')}`;
  await db.collection('moe_users').insertOne({ _id: E2E_ADMIN.id, username: E2E_ADMIN.username, passwordHash, passwordVersion: 1, createdAt: new Date() } as never);
  await db.collection('moe_settings').insertOne({ _id: 'website', companyName: 'MOE Navigation', companyNameTh: 'MOE Navigation', officeAddress: 'Synthetic E2E office', officeAddressTh: 'สำนักงานทดสอบ E2E', phone: '+66000000000', email: 'contact@example.test', mapUrl: '', revision: 1 } as never);
  const statuses = ['New', 'In progress', 'Resolved'] as const;
  const enquiries = Array.from({ length: E2E_INBOX.total }, (_, index) => {
    const id = enquiryId(index), createdAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    const subject = index === 0 ? E2E_INBOX.oldThai.subject : index === 1 ? E2E_INBOX.literal.subject : index === 2 ? E2E_INBOX.oldResolved.subject : `Fixture enquiry ${String(index + 1).padStart(3, '0')}`;
    return { _id: id, id, submissionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, fingerprint: createHash('sha256').update(id).digest('hex'), consentAt: createdAt, name: `Fixture visitor ${index + 1}`, email: `visitor-${index + 1}@example.test`, company: 'Synthetic E2E company', subject, message: `Synthetic browser test enquiry ${index + 1}.`, locale: index === 0 ? 'th' : 'en', status: statuses[index % 3], revision: 1, createdAt, updatedAt: createdAt };
  });
  await db.collection('moe_enquiries').insertMany(enquiries as never[]);
}

export async function resetDatabase() {
  const { client, db } = await connectE2eDatabase();
  try { await seedE2eDatabase(db); } finally { await client.close(); }
}
