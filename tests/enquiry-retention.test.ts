import assert from 'node:assert/strict';
import test from 'node:test';
import type { EnquiryDocument } from '../src/server/db';
import { cleanEnquiry } from '../src/server/enquiries';
import { activeEnquiryFilter, enquiryExpiryDate, enquiryPurgeDate, enquiryRetainedFilter, enquiryTrashRetentionMs, isEnquiryRetained } from '../src/server/enquiry-retention';

const createdAt = '2026-10-31T18:20:30.123Z';
const record: EnquiryDocument = {
  _id: 'enquiry', id: 'enquiry', submissionId: 'private-submission', fingerprint: 'private-fingerprint', consentAt: createdAt,
  name: 'Visitor', email: 'visitor@example.com', company: '', subject: 'Shipping', message: 'Private enquiry',
  locale: 'en', status: 'New', createdAt, updatedAt: createdAt, revision: 1,
};

test('enquiry expiry adds a UTC calendar year and clamps leap day without changing the received time', () => {
  for (const [received, expected] of [
    ['2024-02-29T23:59:59.999Z', '2025-02-28T23:59:59.999Z'],
    ['2023-02-28T00:00:00.000Z', '2024-02-28T00:00:00.000Z'],
    ['2023-03-01T01:02:03.004Z', '2024-03-01T01:02:03.004Z'],
    ['2026-12-31T23:59:59.999Z', '2027-12-31T23:59:59.999Z'],
  ]) {
    assert.equal(enquiryExpiryDate(received).toISOString(), expected);
    const date = new Date(received);
    assert.equal(enquiryExpiryDate(date).toISOString(), expected);
    assert.equal(date.toISOString(), received, 'the supplied Date must not be mutated');
  }
  assert.throws(() => enquiryExpiryDate('invalid'));
  assert.throws(() => enquiryExpiryDate(new Date(NaN)));
  assert.equal(enquiryExpiryDate('2026-01-01').toISOString(), '2027-01-01T00:00:00.000Z');
  for (const malformed of ['2026-02-30T00:00:00.000Z', '2026-02-30', '2026-06-01T10:00:00', '2026-06-01T10:00:00+07:00']) assert.throws(() => enquiryExpiryDate(malformed), malformed);
});

test('legacy records expire immediately at their anniversary even before TTL metadata is backfilled', () => {
  const expiry = enquiryExpiryDate(record.createdAt);
  assert.equal(enquiryPurgeDate(record).toISOString(), expiry.toISOString());
  assert.equal(isEnquiryRetained(record, new Date(expiry.getTime() - 1)), true);
  assert.equal(isEnquiryRetained(record, expiry), false);
  assert.equal(isEnquiryRetained({ ...record, createdAt: 'invalid' }, new Date(createdAt)), false);
});

test('status updates and future stored deadlines cannot extend the original year', () => {
  const original = enquiryExpiryDate(record.createdAt);
  assert.equal(enquiryPurgeDate({ ...record, status: 'Resolved', updatedAt: '2027-05-01T00:00:00.000Z' } as EnquiryDocument).getTime(), original.getTime());
  assert.equal(enquiryPurgeDate({ ...record, expiresAt: new Date('2030-01-01'), purgeAt: new Date('2030-01-01') }).getTime(), original.getTime());
  const earlier = new Date('2027-01-01T00:00:00.000Z');
  assert.equal(enquiryPurgeDate({ ...record, expiresAt: earlier }).getTime(), earlier.getTime());
});

test('Trash keeps at most 30 days and never exceeds original or shorter stored expiry', () => {
  const earlyTrash = new Date('2026-11-01T00:00:00.000Z');
  assert.equal(enquiryPurgeDate({ ...record, deletedAt: earlyTrash.toISOString() }).getTime(), earlyTrash.getTime() + enquiryTrashRetentionMs);
  const lateTrash = new Date('2027-10-30T00:00:00.000Z');
  assert.equal(enquiryPurgeDate({ ...record, deletedAt: lateTrash.toISOString() }).toISOString(), enquiryExpiryDate(createdAt).toISOString());
  assert.equal(enquiryPurgeDate({ ...record, deletedAt: earlyTrash.toISOString(), purgeAt: new Date('2026-11-03T00:00:00.000Z') }).toISOString(), '2026-11-03T00:00:00.000Z');
  for (const malformed of [{ deletedAt: 'invalid' }, { expiresAt: '2027-01-01' }, { purgeAt: new Date(NaN) }]) {
    assert.equal(isEnquiryRetained({ ...record, ...malformed } as EnquiryDocument, earlyTrash), false);
  }
});

test('application queries enforce each deadline and active queries additionally exclude Trash', () => {
  const now = new Date('2026-11-01T00:00:00.000Z');
  const filter = enquiryRetainedFilter(now);
  assert.equal(filter.$and?.length, 4);
  assert.deepEqual(filter.$and?.[1], { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $type: 'date', $gt: now } }] });
  assert.deepEqual(filter.$and?.[2], { $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $type: 'date', $gt: now } }] });
  assert.deepEqual(activeEnquiryFilter(now), { $and: [filter, { deletedAt: { $exists: false } }] });
});

test('the enquiry DTO serializes Date metadata, reports earlier deadlines and omits private notification details', () => {
  const expiresAt = new Date('2027-06-01T00:00:00.000Z');
  const deletedAt = '2026-11-01T00:00:00.000Z';
  const dto = cleanEnquiry({ ...record, expiresAt, deletedAt, purgeAt: new Date('2026-11-15T00:00:00.000Z') });
  assert.equal(dto.expiresAt, expiresAt.toISOString());
  assert.equal(dto.purgeAt, '2026-11-15T00:00:00.000Z');
  assert.equal(dto.deletedAt, deletedAt);
  for (const key of ['_id', 'submissionId', 'fingerprint', 'consentAt', 'notificationDelivery']) assert.equal(key in dto, false);
  assert.doesNotThrow(() => JSON.stringify(dto));
});
