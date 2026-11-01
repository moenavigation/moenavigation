import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { cmsRoles, type CmsRole } from '../src/lib/cms-roles';
import type { AuditDocument, EnquiryDocument, UserDocument } from '../src/server/db';
import { enquiryActionInTransaction, enquiryActionSchema, removeEnquirySchema, removeTrashedEnquiryInTransaction } from '../src/server/enquiry-trash';
import { enquiryExpiryDate, enquiryTrashRetentionMs } from '../src/server/enquiry-retention';
import { HttpError } from '../src/server/http';

const session = {} as ClientSession;
const now = new Date('2026-07-01T12:30:00.000Z');
const id = '123e4567-e89b-42d3-a456-426614174000';
const actor = (role: CmsRole = 'Operator'): UserDocument => ({ _id: 'actor', username: 'actor', role, passwordVersion: 1, passwordHash: 'private-hash', createdAt: now });
function enquiry(changes: Partial<EnquiryDocument> = {}): EnquiryDocument {
  const createdAt = '2026-01-20T08:15:00.000Z';
  const record: EnquiryDocument = {
    _id: id, id, name: 'Private sender', email: 'private-sender@example.test', company: 'Private company', subject: 'Private subject', message: 'Private message',
    locale: 'en', status: 'Resolved', createdAt, updatedAt: createdAt, revision: 4, submissionId: 'private-submission', fingerprint: 'private-fingerprint', consentAt: createdAt,
    expiresAt: enquiryExpiryDate(createdAt), purgeAt: enquiryExpiryDate(createdAt), notification: { status: 'sent', attempts: 1 },
    notificationDelivery: { firstAttemptAt: createdAt, leaseUntil: createdAt, leaseToken: 'private-lease', envelope: { from: 'from@example.test', to: ['recipient@example.test'], reply_to: 'private-sender@example.test', subject: 'Private subject', text: 'Private message' } },
    ...changes,
  };
  for (const key of Object.keys(record)) if (record[key as keyof EnquiryDocument] === undefined) Reflect.deleteProperty(record, key);
  return record;
}
type Query = Record<string, unknown>;
function matches(row: Query, filter: Query): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    // MongoDB evaluates retention expressions; the transaction also checks the full deadline in JavaScript.
    if (key === '$expr') continue;
    if (key === '$and' && !(condition as Query[]).every(part => matches(row, part))) return false;
    if (key === '$or' && !(condition as Query[]).some(part => matches(row, part))) return false;
    if (key.startsWith('$')) continue;
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const check = condition as Query;
      if ('$exists' in check && Object.hasOwn(row, key) !== check.$exists) return false;
      if ('$type' in check && check.$type === 'date' && !(value instanceof Date)) return false;
      if ('$gt' in check && (!(value instanceof Date) || value.getTime() <= (check.$gt as Date).getTime())) return false;
    } else if (value !== condition) return false;
  }
  return true;
}
function harness(account: UserDocument, initial: EnquiryDocument = enquiry()) {
  const users = new Map([[account._id, structuredClone(account)]]);
  const records = new Map([[initial._id, structuredClone(initial)]]);
  const audits: AuditDocument[] = [];
  const sessions: ClientSession[] = [];
  const writes: Query[] = [];
  let locks = 0;
  let conflict = false;
  const track = (options: { session: ClientSession }) => { sessions.push(options.session); };
  const db = { collection: (name: string) => {
    if (name === 'moe_users') return { findOne: async (filter: Query, options: { session: ClientSession }) => { track(options); return structuredClone([...users.values()].find(user => matches(user, filter)) ?? null); } };
    if (name === 'moe_state') return { updateOne: async (_filter: Query, _update: Query, options: { session: ClientSession }) => { track(options); locks++; } };
    if (name === 'moe_logs') return { insertOne: async (row: AuditDocument, options: { session: ClientSession }) => { track(options); audits.push(structuredClone(row)); } };
    if (name === 'moe_enquiries') return {
      findOne: async (filter: Query, options: { session: ClientSession }) => { track(options); return structuredClone([...records.values()].find(row => matches(row, filter)) ?? null); },
      updateOne: async (filter: Query, update: { $set: Partial<EnquiryDocument>; $inc: { revision: number }; $unset?: Query }, options: { session: ClientSession }) => {
        track(options); writes.push(filter);
        const row = [...records.values()].find(record => matches(record, filter));
        if (!row || conflict) return { matchedCount: 0 };
        Object.assign(row, structuredClone(update.$set), { revision: row.revision + update.$inc.revision });
        if (update.$unset?.deletedAt !== undefined) delete row.deletedAt;
        return { matchedCount: 1 };
      },
      deleteOne: async (filter: Query, options: { session: ClientSession }) => {
        track(options); writes.push(filter);
        const row = [...records.values()].find(record => matches(record, filter));
        return { deletedCount: row && !conflict && records.delete(row._id) ? 1 : 0 };
      },
    };
    return {};
  } } as unknown as Db;
  return { db, users, records, audits, writes, sessions, locks: () => locks, forceConflict: () => { conflict = true; } };
}
const rejects = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const action = (kind: 'trash' | 'restore', revision = 4) => ({ id, expectedRevision: revision, action: kind });

test('enquiry Trash endpoints accept only explicit UUID/revision actions', () => {
  assert.deepEqual(enquiryActionSchema.parse(action('trash')), action('trash'));
  assert.deepEqual(removeEnquirySchema.parse({ id, expectedRevision: 4 }), { id, expectedRevision: 4 });
  for (const input of [{ ...action('trash'), id: 'content-slug' }, { ...action('trash'), expectedRevision: 0 }, { ...action('trash'), expectedRevision: 1.5 }, { ...action('trash'), action: 'delete' }, { ...action('trash'), message: 'edited' }]) assert.equal(enquiryActionSchema.safeParse(input).success, false);
  assert.equal(removeEnquirySchema.safeParse(action('restore')).success, false);
});

test('every CMS role can trash and restore, preserving the message, status, original expiry and transactional privacy', async () => {
  for (const role of cmsRoles) {
    const account = actor(role);
    const original = enquiry();
    const state = harness(account, original);
    const moved = await enquiryActionInTransaction(action('trash'), account, state.db, session, now);
    assert.equal(moved.status, original.status);
    assert.equal(moved.deletedAt, now.toISOString());
    assert.equal(moved.purgeAt, new Date(now.getTime() + enquiryTrashRetentionMs).toISOString());
    assert.equal(moved.expiresAt, original.expiresAt!.toISOString());
    assert.equal(moved.revision, 5);
    for (const key of ['_id', 'submissionId', 'fingerprint', 'consentAt', 'notificationDelivery']) assert.equal(Object.hasOwn(moved, key), false);
    const restored = await enquiryActionInTransaction(action('restore', 5), account, state.db, session, new Date(now.getTime() + 1000));
    assert.equal(restored.deletedAt, undefined);
    assert.equal(restored.purgeAt, original.expiresAt!.toISOString());
    assert.equal(restored.revision, 6);
    const saved = state.records.get(id)!;
    for (const key of ['subject', 'message', 'name', 'email', 'company', 'createdAt', 'status', 'notification', 'notificationDelivery'] as const) assert.deepEqual(saved[key], original[key]);
    assert.deepEqual(state.audits.map(event => event.action), ['enquiry.trashed', 'enquiry.restored']);
    for (const event of state.audits) assert.deepEqual(event.target, { type: 'Enquiry', id });
    const logged = JSON.stringify(state.audits);
    for (const privateValue of [original.subject, original.message, original.email, original.name, 'recipient@example.test', 'private-lease']) assert.equal(logged.includes(privateValue), false);
    assert.equal(state.locks(), 2);
    assert.ok(state.sessions.every(value => value === session));
  }
});

test('Trash is capped at the original expiry, including legacy missing dates, shorter deadlines and repeated restoration', async () => {
  for (const original of [enquiry({ expiresAt: undefined, purgeAt: undefined }), enquiry({ expiresAt: new Date('2026-07-03T00:00:00.000Z'), purgeAt: new Date('2026-07-03T00:00:00.000Z') })]) {
    const account = actor();
    const state = harness(account, original);
    const deadline = original.expiresAt ?? enquiryExpiryDate(original.createdAt);
    const firstTrashAt = new Date(deadline.getTime() - 5000);
    let result = await enquiryActionInTransaction(action('trash'), account, state.db, session, firstTrashAt);
    assert.equal(result.purgeAt, deadline.toISOString());
    result = await enquiryActionInTransaction(action('restore', result.revision), account, state.db, session, new Date(firstTrashAt.getTime() + 1000));
    result = await enquiryActionInTransaction(action('trash', result.revision), account, state.db, session, new Date(firstTrashAt.getTime() + 2000));
    assert.equal(result.expiresAt, deadline.toISOString());
    assert.equal(result.purgeAt, deadline.toISOString());
  }
});

test('expired annual, stored and 30-day deadlines cannot be restored or mutated before TTL deletion', async () => {
  const expired = [
    enquiry({ createdAt: '2025-07-01T12:30:00.000Z', expiresAt: undefined, purgeAt: undefined }),
    enquiry({ expiresAt: now }), enquiry({ purgeAt: now }),
    enquiry({ deletedAt: new Date(now.getTime() - enquiryTrashRetentionMs).toISOString(), purgeAt: undefined }),
    enquiry({ createdAt: 'invalid' }), enquiry({ expiresAt: new Date('invalid') }), enquiry({ deletedAt: 'invalid' }),
  ];
  for (const original of expired) for (const operation of ['trash', 'restore'] as const) {
    const account = actor();
    const state = harness(account, original);
    await assert.rejects(enquiryActionInTransaction(action(operation), account, state.db, session, now), rejects(404));
    assert.equal(state.writes.length, 0);
    assert.equal(state.audits.length, 0);
  }
});

test('revisions, lifecycle checks and lost update guards prevent stale writes and duplicate audit entries', async () => {
  const account = actor();
  for (const operation of ['trash', 'restore'] as const) {
    const state = harness(account, operation === 'restore' ? enquiry({ deletedAt: now.toISOString() }) : enquiry());
    await assert.rejects(enquiryActionInTransaction(action(operation, 3), account, state.db, session, now), rejects(409));
    assert.equal(state.audits.length, 0);
    state.forceConflict();
    await assert.rejects(enquiryActionInTransaction(action(operation), account, state.db, session, now), rejects(409));
    assert.equal(state.audits.length, 0);
  }
  const state = harness(account);
  await assert.rejects(enquiryActionInTransaction(action('restore'), account, state.db, session, now), rejects(409));
  await enquiryActionInTransaction(action('trash'), account, state.db, session, now);
  await assert.rejects(enquiryActionInTransaction(action('trash', 5), account, state.db, session, now), rejects(409));
  assert.equal(state.audits.length, 1);
});

test('trash and restore recheck stored account activity and credentials and audit the persisted actor', async () => {
  const account = actor('Dev');
  for (const changes of [{ passwordVersion: 2 }, { deletedAt: now }, { purgeAt: now }]) for (const operation of ['trash', 'restore'] as const) {
    const state = harness({ ...account, ...changes });
    await assert.rejects(enquiryActionInTransaction(action(operation), account, state.db, session, now), rejects(401));
    assert.equal(state.writes.length, 0);
    assert.equal(state.audits.length, 0);
  }
  const state = harness(actor('Operator'));
  await enquiryActionInTransaction(action('trash'), account, state.db, session, now);
  assert.deepEqual(state.audits[0].actor, { id: 'actor', username: 'actor', role: 'Operator' });
});

test('permanent deletion requires current Dev/Admin rights, retained Trash and an exact revision', async () => {
  for (const role of cmsRoles) {
    const account = actor(role);
    const state = harness(account, enquiry({ deletedAt: now.toISOString() }));
    const removal = removeTrashedEnquiryInTransaction({ id, expectedRevision: 4 }, account, state.db, session, now);
    if (role === 'Operator') {
      await assert.rejects(removal, rejects(403));
      assert.equal(state.records.size, 1);
      assert.equal(state.audits.length, 0);
    } else {
      assert.deepEqual(await removal, { removed: true });
      assert.equal(state.records.size, 0);
      assert.equal(state.audits[0].action, 'enquiry.deleted');
      assert.deepEqual(state.audits[0].target, { type: 'Enquiry', id });
    }
  }
  const admin = actor('Admin');
  for (const [original, expectedRevision, status] of [[enquiry(), 4, 409], [enquiry({ deletedAt: now.toISOString() }), 3, 409], [enquiry({ deletedAt: now.toISOString(), expiresAt: now }), 4, 404]] as const) {
    const state = harness(admin, original);
    await assert.rejects(removeTrashedEnquiryInTransaction({ id, expectedRevision }, admin, state.db, session, now), rejects(status));
    assert.equal(state.records.size, 1);
    assert.equal(state.audits.length, 0);
  }
  const demoted = harness(actor('Operator'), enquiry({ deletedAt: now.toISOString() }));
  await assert.rejects(removeTrashedEnquiryInTransaction({ id, expectedRevision: 4 }, admin, demoted.db, session, now), rejects(403));
  assert.equal(demoted.records.size, 1);
});
