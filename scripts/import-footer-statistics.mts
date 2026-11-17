import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BSON, MongoClient } from 'mongodb';
import type { ContentDocument } from '../src/server/db';
import { appendAuditEvent } from '../src/server/audit';
import { recordSchema } from '../src/lib/validation';
import { canonical, documentHash, sha256 } from './lib/recovery';
import { buildFooterStatisticsPlan } from './data/footer-statistics-import-plan';

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
const directory = resolve('.local/footer-statistics-import-2026-11-17');
let client: MongoClient | undefined;
try {
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration is missing.');
  client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 }).connect();
  const db = client.db(process.env.MONGODB_DB_NAME), content = db.collection<ContentDocument>('moe_content');
  const filter = { $or: [{ type: 'Section' as const, id: 'footer', parentId: 'shared' }, { type: 'Vessel' as const }] };
  const before = await content.find(filter).sort({ _id: 1 }).toArray();
  const updates = buildFooterStatisticsPlan(before);
  const planHash = sha256(canonical({ target: sha256(`${process.env.MONGODB_URI}:${process.env.MONGODB_DB_NAME}`), before, updates }));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'plan.json'), JSON.stringify({ planHash, updates, sourceUrl: 'https://www.moe-line.com/', approvedSourceValues: { annualCarriedVolume: 15559, skilledCrew: 89, annualVoyages: 1119 }, fleetCountFromCurrentSavedVessels: true }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', planHash, updates }));
  if (apply && updates.length) {
    assert.equal(expectedPlan, planHash, 'The footer or fleet changed after review. Run the dry-run again.');
    const change = updates[0], original = before.find(record => record.type === 'Section' && record.id === change.id)!;
    recordSchema.parse({ ...original, ...change.patch });
    const now = new Date().toISOString(), backup = resolve(directory, `before-${Date.now()}.json`);
    await writeFile(backup, BSON.EJSON.stringify({ createdAt: now, planHash, content: before }, null, 2, { relaxed: false }) + '\n', { flag: 'wx', mode: 0o600 });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        assert.equal(documentHash(await content.find(filter, { session }).sort({ _id: 1 }).toArray()), documentHash(before), 'The saved footer or fleet changed after the backup.');
        const saved = await content.updateOne({ _id: original._id, revision: change.expectedRevision, deletedAt: { $exists: false } }, { $set: { ...change.patch, revision: original.revision + 1, updatedAt: now } }, { session });
        assert.equal(saved.matchedCount, 1, 'Concurrent footer edit detected.');
        await appendAuditEvent(db, session, { action: 'content.updated', actor: { system: true }, target: { type: 'Section', id: original.id, label: original.title } });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
    const after = await content.find(filter).sort({ _id: 1 }).toArray();
    assert.equal(after.length, before.length);
    for (const record of before) assert.deepEqual(after.find(item => item._id === record._id), record._id === original._id ? { ...record, ...change.patch, revision: record.revision + 1, updatedAt: now } : record, `Unexpected content change to ${record.id}.`);
    assert.deepEqual(buildFooterStatisticsPlan(after), [], 'Footer import is not idempotent.');
    await writeFile(resolve(directory, 'applied.json'), JSON.stringify({ appliedAt: now, planHash, backup, updated: [original.id], fleetRecordsUnchanged: true, unrelatedFooterFieldsPreserved: true, idempotent: true, cacheRefreshRequired: true }, null, 2) + '\n');
    console.log(JSON.stringify({ applied: true, updated: 1, fleetRecordsUnchanged: true, verified: true, cacheRefreshRequired: true }));
  }
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : `Footer statistics import stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); }
