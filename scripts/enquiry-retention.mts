import nextEnv from '@next/env';
import { createHash } from 'node:crypto';
import type { Filter } from 'mongodb';
import type { EnquiryDocument } from '../src/server/db';
import { enquiryExpiryDate, enquiryPurgeDate, enquiryRetainedFilter } from '../src/server/enquiry-retention';

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const value = (name: string) => args.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1);
const reviewHash = value('--review-hash');
const maximum = Number(value('--limit') ?? 500);
if (args.some(argument => argument !== '--apply' && argument !== '--dry-run' && !/^--(?:review-hash|limit)=/.test(argument)) || !Number.isInteger(maximum) || maximum < 1 || maximum > 10_000 || args.includes('--dry-run') && apply) {
  throw new Error('Use --dry-run (default), or --apply --review-hash=<reviewed hash>. Optional --limit=1..10000 (default 500).');
}
if (apply && !/^[a-f0-9]{64}$/.test(reviewHash ?? '')) throw new Error('Apply requires the review hash from a fresh dry-run.');

const { collections, getClient, getDb } = await import('../src/server/db');
type Metadata = Pick<EnquiryDocument, '_id' | 'createdAt' | 'deletedAt' | 'expiresAt' | 'purgeAt'>;
type Plan = { before: Metadata; expiresAt: Date; purgeAt: Date };
const encoded = (value: unknown): unknown => value === undefined ? { missing: true } : value instanceof Date ? { date: value.getTime() } : value;
const snapshot = (record: Metadata) => ['_id', 'createdAt', 'deletedAt', 'expiresAt', 'purgeAt'].map(field => [field, encoded(record[field as keyof Metadata])]);
const exact = (value: unknown) => value === undefined ? { $exists: false } : value;

try {
  const db = await getDb();
  const enquiries = collections(db).enquiries;
  const now = new Date();
  const counts = { total: 0, missingExpiry: 0, missingPurge: 0, invalid: 0, alreadyExpired: 0, retained: 0, candidates: 0, futureCandidates: 0, expiredCandidates: 0 };
  const plans: Plan[] = [];
  const hash = createHash('sha256').update(JSON.stringify({ policy: 'enquiry-calendar-year-v1-future-only', database: db.databaseName, maximum }));
  // Never load enquiry messages, sender details, notification envelopes, or credentials.
  const cursor = enquiries.find({}, { projection: { _id: 1, createdAt: 1, deletedAt: 1, expiresAt: 1, purgeAt: 1 } }).sort({ _id: 1 }).batchSize(250);
  for await (const record of cursor) {
    counts.total++;
    if (record.expiresAt === undefined) counts.missingExpiry++;
    if (record.purgeAt === undefined) counts.missingPurge++;
    let expiresAt: Date; let purgeAt: Date;
    try {
      if (typeof record._id !== 'string' || typeof record.createdAt !== 'string') throw new Error('Invalid metadata.');
      expiresAt = enquiryPurgeDate({ ...record, deletedAt: undefined, purgeAt: undefined });
      // Validate every existing deadline before proposing any repair.
      purgeAt = enquiryPurgeDate(record);
      enquiryExpiryDate(record.createdAt);
    } catch { counts.invalid++; continue; }
    const expired = purgeAt <= now;
    if (expired) counts.alreadyExpired++; else counts.retained++;
    const candidate = record.expiresAt?.getTime() !== expiresAt.getTime() || record.purgeAt?.getTime() !== purgeAt.getTime();
    if (!candidate) continue;
    counts.candidates++;
    if (expired) { counts.expiredCandidates++; continue; }
    counts.futureCandidates++;
    const plan = { before: record, expiresAt, purgeAt };
    hash.update(JSON.stringify({ before: snapshot(record), expiresAt, purgeAt }));
    if (plans.length < maximum) plans.push(plan);
  }
  hash.update(JSON.stringify(counts));
  const digest = hash.digest('hex');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', database: db.databaseName, ...counts, batchLimit: maximum, reviewHash: digest, policy: 'One UTC calendar year from receipt; Trash up to 30 days within that year.', note: 'Apply updates future retention metadata only. Invalid and already-expired records require separate review. This tool does not create indexes or delete records.' }, null, 2));
  if (apply) {
    if (reviewHash !== digest) throw new Error('The reviewed metadata changed. Run dry-run again and review the new hash.');
    if (counts.futureCandidates > maximum) throw new Error('Candidate count exceeds the batch limit. Review and rerun with an explicit larger --limit (maximum 10000).');
    if (!plans.length) { console.log('No future retention metadata needs updating.'); }
    else {
      const session = (await getClient()).startSession();
      try {
        await session.withTransaction(async () => {
          if (plans.some(plan => plan.purgeAt.getTime() <= Date.now())) throw new Error('A reviewed candidate expired. Run dry-run again.');
          const result = await enquiries.bulkWrite(plans.map(plan => ({ updateOne: {
            filter: { $and: [
              { _id: plan.before._id, createdAt: plan.before.createdAt, expiresAt: exact(plan.before.expiresAt), purgeAt: exact(plan.before.purgeAt), deletedAt: exact(plan.before.deletedAt) } as Filter<EnquiryDocument>,
              enquiryRetainedFilter(new Date()),
            ] },
            update: { $set: { expiresAt: plan.expiresAt, purgeAt: plan.purgeAt } },
          } })), { session, ordered: true });
          if (result.matchedCount !== plans.length || plans.some(plan => plan.purgeAt.getTime() <= Date.now())) throw new Error('Reviewed metadata changed or expired. No changes committed; run dry-run again.');
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } finally { await session.endSession(); }
      console.log(`Updated retention metadata for ${plans.length} future enquiries.`);
    }
  }
} finally { await (await getClient()).close(); }
