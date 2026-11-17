import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BSON, MongoClient } from 'mongodb';
import type { ContentDocument } from '../src/server/db';
import { appendAuditEvent } from '../src/server/audit';
import { recordSchema } from '../src/lib/validation';
import { buildLegacyRouteImportPlan } from './data/legacy-route-import-plan';

// A narrow import, not a full website migration. Dry-run first, review its hash,
// then apply that exact plan against revision-checked records in one transaction.
nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
const directory = resolve('.local/legacy-route-import-2026-11-17');
let client: MongoClient | undefined;
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

try {
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration is incomplete.');
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 20000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);
  const content = db.collection<ContentDocument>('moe_content');
  const filter = { $or: [{ type: 'Route' as const }, { type: 'Page' as const, id: 'routes' }] };
  const before = await content.find(filter).sort({ _id: 1 }).toArray();
  const plan = buildLegacyRouteImportPlan(before);
  const planHash = hash({ target: hash([process.env.MONGODB_URI, process.env.MONGODB_DB_NAME]), before, plan });
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'plan.json'), JSON.stringify({ reviewedAt: new Date().toISOString(), planHash, ...plan }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', planHash, inserts: plan.inserts.map(record => ({ id: record.id, title: record.title, routeSpecs: record.routeSpecs, mapPoints: record.waypoints?.length })), updates: plan.updates, conflicts: plan.conflicts }, null, 2));
  if (apply) assert.equal(plan.conflicts.length, 0, 'The source plan conflicts with existing content. Nothing was imported.');
  if (apply && (plan.inserts.length || plan.updates.length)) {
    assert.equal(expectedPlan, planHash, 'The reviewed plan or saved content changed. Run dry-run again.');
    const now = new Date().toISOString();
    const additions: ContentDocument[] = plan.inserts.map(record => {
      assert(record.waypoints && record.waypoints.length > 2, `The map path for ${record.id} has not been reviewed yet.`);
      return { ...recordSchema.parse(record), _id: `${record.type}:${record.id}`, revision: 1, updatedAt: now };
    });
    for (const change of plan.updates) {
      const original = before.find(record => record.id === change.id && record.type === change.type);
      assert(original && !original.deletedAt, `No active original record for ${change.id}.`);
      assert.equal(original.revision, change.expectedRevision, `Unexpected revision for ${change.id}.`);
      recordSchema.parse({ ...original, ...change.patch });
      assert(!('id' in change.patch) && !('type' in change.patch) && !('revision' in change.patch) && !('deletedAt' in change.patch), 'The plan may not change record identity or retention.');
    }
    const backup = resolve(directory, `before-${Date.now()}.json`);
    await writeFile(backup, BSON.EJSON.stringify({ createdAt: now, planHash, content: before }, null, 2, { relaxed: false }) + '\n', { flag: 'wx', mode: 0o600 });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await content.find(filter, { session }).sort({ _id: 1 }).toArray();
        assert.equal(hash(current), hash(before), 'Route content changed after the backup. Nothing was imported.');
        for (const url of new Set(additions.map(record => record.image))) {
          const media = await db.collection('moe_media').findOne({ url, state: 'committed' }, { session, projection: { _id: 1 } });
          assert(media, 'A reused route image is no longer committed in the image library. Nothing was imported.');
        }
        for (const record of additions) {
          await content.insertOne(record, { session });
          await appendAuditEvent(db, session, { action: 'content.created', actor: { system: true }, target: { type: 'Route', id: record.id, label: record.title } });
        }
        for (const change of plan.updates) {
          const original = before.find(record => record.id === change.id && record.type === change.type)!;
          const result = await content.updateOne({ _id: original._id, revision: change.expectedRevision, deletedAt: { $exists: false } }, { $set: { ...change.patch, revision: change.expectedRevision + 1, updatedAt: now } }, { session });
          assert.equal(result.matchedCount, 1, `Concurrent edit detected for ${change.id}.`);
          await appendAuditEvent(db, session, { action: 'content.updated', actor: { system: true }, target: { type: original.type, id: original.id, label: change.patch.title || original.title } });
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
    const after = await content.find(filter).sort({ _id: 1 }).toArray();
    assert.equal(after.length, before.length + additions.length);
    for (const original of before) {
      const change = plan.updates.find(item => item.id === original.id && item.type === original.type);
      const expected = change ? { ...original, ...change.patch, revision: original.revision + 1, updatedAt: now } : original;
      assert.deepEqual(after.find(item => item._id === original._id), expected, `Stored record or unrelated content differs for ${original.id}.`);
    }
    for (const record of additions) assert.deepEqual(after.find(item => item._id === record._id), record, `Imported route differs for ${record.id}.`);
    const repeated = buildLegacyRouteImportPlan(after);
    assert.equal(repeated.inserts.length + repeated.updates.length + repeated.conflicts.length, 0, 'Import did not pass idempotency verification.');
    await writeFile(resolve(directory, 'applied.json'), JSON.stringify({ appliedAt: now, planHash, backup, inserted: additions.map(record => record.id), updated: plan.updates.map(record => record.id), verification: { exactSavedRecords: true, unrelatedContentPreserved: true, idempotent: true }, cacheRefreshRequired: true }, null, 2) + '\n');
    console.log(JSON.stringify({ applied: true, inserted: additions.length, updated: plan.updates.length, backup, verified: true, cacheRefreshRequired: true }));
  } else if (apply) console.log(JSON.stringify({ applied: false, reason: 'All reviewed route data is already stored.' }));
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : `Route import stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details are displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); }
