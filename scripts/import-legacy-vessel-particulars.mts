import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import type { ContentDocument } from '../src/server/db';
import { appendAuditEvent } from '../src/server/audit';
import { vesselSpecsSchema } from '../src/lib/validation';
import { buildLegacyVesselParticularsPlan } from './data/legacy-vessel-particulars';

// Narrow, reviewed website-first content import. Default mode reads only; never run the full
// website migration to populate vessel particulars on an existing website.
nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const expectedPlan = process.argv.find(value => value.startsWith('--expected-plan='))?.slice('--expected-plan='.length);
const directory = resolve('.local/legacy-vessel-website-import-2026-11-17');
let client: MongoClient | undefined;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const withoutChangedFields = ({ vesselSpecs, revision, updatedAt, ...rest }: ContentDocument) => { void vesselSpecs; void revision; void updatedAt; return rest; };

try {
  assert(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME, 'Database configuration is incomplete.');
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 15_000, socketTimeoutMS: 20_000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);
  const content = db.collection<ContentDocument>('moe_content');
  const filter = { type: 'Vessel' as const };
  const before = await content.find(filter).sort({ id: 1 }).toArray();
  const plan = buildLegacyVesselParticularsPlan(before, { replaceReviewedPdfValues: true, allowCurrentFleet: true });
  const planHash = hash({ target: hash([process.env.MONGODB_URI, process.env.MONGODB_DB_NAME]), before, plan });
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'plan.json'), JSON.stringify({ reviewedAt: new Date().toISOString(), planHash, ...plan }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', planHash, changes: plan.changes.map(change => ({ id: change.id, expectedRevision: change.expectedRevision, addedFields: change.addedFields, replacedFields: change.replacedFields, removedFields: change.removedFields, fieldDifferences: change.fieldDifferences })), unchanged: plan.unchanged, unmatched: plan.unmatched, conflicts: plan.conflicts }, null, 2));
  if (apply) assert.equal(plan.conflicts.length, 0, 'Existing CMS values conflict with the legacy source. Review the plan before applying.');
  if (apply && plan.changes.length) {
    assert.equal(expectedPlan, planHash, 'The reviewed plan or current records changed. Run the dry-run again.');
    for (const change of plan.changes) vesselSpecsSchema.parse(change.afterSpecs);
    const backup = resolve(directory, `before-${Date.now()}.json`);
    await writeFile(backup, JSON.stringify({ createdAt: new Date().toISOString(), planHash, content: before }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await content.find(filter, { session }).sort({ id: 1 }).toArray();
        assert.equal(hash(current), hash(before), 'Fleet records changed after the backup; nothing was imported.');
        for (const change of plan.changes) {
          const original = before.find(record => record.id === change.id)!;
          assert(change.afterSpecs, `No reviewed particulars were supplied for ${change.id}.`);
          const result = await content.updateOne({ _id: original._id, revision: original.revision, deletedAt: { $exists: false } }, {
            $set: { vesselSpecs: change.afterSpecs, revision: original.revision + 1, updatedAt: new Date().toISOString() },
          }, { session });
          assert.equal(result.matchedCount, 1, `Concurrent edit detected for ${change.id}.`);
          await appendAuditEvent(db, session, { action: 'content.updated', actor: { system: true }, target: { type: 'Vessel', id: original.id, label: original.title } });
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
    const after = await content.find(filter).sort({ id: 1 }).toArray();
    assert.equal(after.length, before.length, 'Fleet count changed during verification.');
    for (const original of before) {
      const saved = after.find(record => record.id === original.id)!;
      const change = plan.changes.find(item => item.id === original.id);
      if (change) {
        assert.deepEqual(saved.vesselSpecs, change.afterSpecs, `Saved particulars differ for ${original.id}.`);
        assert.equal(saved.revision, original.revision + 1);
        assert.deepEqual(withoutChangedFields(saved), withoutChangedFields(original), `Unrelated content changed for ${original.id}.`);
      } else assert.deepEqual(saved, original, `Untargeted vessel changed: ${original.id}.`);
    }
    assert.equal(buildLegacyVesselParticularsPlan(after, { allowCurrentFleet: true }).changes.length, 0, 'Import is not idempotent.');
    await writeFile(resolve(directory, 'applied.json'), JSON.stringify({ appliedAt: new Date().toISOString(), primarySource: 'website', planHash, backup, updatedVessels: plan.changes.map(change => change.id), content: after, verification: { exactSavedSpecs: true, unrelatedContentPreserved: true, idempotent: true }, cacheRefreshRequired: true }, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ applied: true, updatedVessels: plan.changes.length, backup, verified: true, cacheRefreshRequired: true }));
  } else if (apply) console.log(JSON.stringify({ applied: false, updatedVessels: 0, reason: 'All reviewed particulars are already stored.' }));
} catch (error) {
  // Provider errors may contain connection details. Keep them out of console output.
  console.error(error instanceof assert.AssertionError ? error.message : `Fleet import stopped (${error instanceof Error ? error.name : 'unknown error'}). No provider details are displayed.`);
  process.exitCode = 1;
} finally { await client?.close(); }
