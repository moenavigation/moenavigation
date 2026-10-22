import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BSON, MongoClient } from 'mongodb';
import { serviceCopyDrafts } from './data/service-copy-drafts';
import { canonical, documentHash, sha256 } from './lib/recovery';
import { recordSchema } from '../src/lib/validation';

nextEnv.loadEnvConfig(process.cwd());
const database = process.env.MONGODB_DB_NAME || '';
assert(database && !database.includes('_restore_') && !database.endsWith('_qa_backend'), 'Use the main project configuration for this reviewed editorial update.');
assert(process.env.MONGODB_URI, 'MongoDB configuration is missing.');
const client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).connect();
try {
  const db = client.db(database), content = db.collection('moe_content');
  const ids = serviceCopyDrafts.map(item => `Service:${item.id}`);
  const before = await content.find({ _id: { $in: ids as never[] }, type: 'Service' }).sort({ _id: 1 }).toArray();
  assert(before.length === 6 && new Set(before.map(item => item.id)).size === 6, 'All six expected Service records must exist.');
  const countBefore = await content.countDocuments();
  const changes = serviceCopyDrafts.flatMap(({ id, ...fields }) => {
    const previous = before.find(record => record.id === id); assert(previous, 'Service record missing.');
    recordSchema.parse({ ...previous, ...fields });
    return Object.entries(fields).every(([key, value]) => previous[key] === value) ? [] : [{ _id: previous._id, id, fields, expectedRevision: previous.revision }];
  });
  const plan = { database, beforeHash: documentHash(before), records: changes.map(item => ({ id: item.id, fields: Object.keys(item.fields), expectedRevision: item.expectedRevision })), draftHash: sha256(canonical(serviceCopyDrafts)), totalRecords: countBefore };
  const planHash = sha256(canonical(plan));
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', planHash, ...plan }, null, 2));
  await mkdir('.local/service-copy', { recursive: true });
  await writeFile('.local/service-copy/plan.json', JSON.stringify({ planHash, ...plan }, null, 2));
  if (process.argv.includes('--apply')) {
    assert.equal(process.argv.find(arg => arg.startsWith('--expected-plan='))?.slice('--expected-plan='.length), planHash, 'Exact reviewed plan hash required.');
    if (!changes.length) console.log('Service draft copy is already applied; no records changed.');
    else {
      const snapshotPath = `.local/service-copy/before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await writeFile(snapshotPath, BSON.EJSON.stringify({ database, createdAt: new Date(), planHash, records: before }, { relaxed: false }), { flag: 'wx', mode: 0o600 });
      const timestamp = new Date().toISOString(), session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const current = await content.find({ _id: { $in: ids as never[] } }, { session }).sort({ _id: 1 }).toArray();
          assert.equal(documentHash(current), plan.beforeHash, 'A Service changed after review. Retry the dry run.');
          for (const change of changes) {
            const result = await content.updateOne({ _id: change._id, type: 'Service', revision: change.expectedRevision }, { $set: { ...change.fields, updatedAt: timestamp }, $inc: { revision: 1 } }, { session });
            assert.equal(result.modifiedCount, 1, 'Service revision conflict.');
          }
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } finally { await session.endSession(); }
      const after = await content.find({ _id: { $in: ids as never[] } }).sort({ _id: 1 }).toArray();
      const expected = before.map(record => {
        const change = changes.find(item => item.id === record.id);
        return change ? { ...record, ...change.fields, updatedAt: timestamp, revision: record.revision + 1 } : record;
      });
      assert.equal(documentHash(after), documentHash(expected), 'Unexpected field change in Service records.');
      assert.equal(await content.countDocuments(), countBefore, 'Content record count changed during verification.');
      const report = { status: 'verified', planHash, snapshotPath, changedServices: changes.map(item => item.id), changedFields: ['body', 'bodyTh', 'bodyHeading', 'bodyHeadingTh', 'updatedAt', 'revision'], totalRecordsBefore: countBefore, totalRecordsAfter: countBefore, preservedOtherFields: true };
      await writeFile('.local/service-copy/result.json', JSON.stringify(report, null, 2), { mode: 0o600 });
      console.log(JSON.stringify(report, null, 2));
    }
  }
} catch (error) {
  console.error('Service copy update failed:', error instanceof assert.AssertionError ? error.message.split('\n')[0] : error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally { await client.close(); }
