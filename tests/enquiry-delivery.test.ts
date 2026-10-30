import assert from 'node:assert/strict';
import test from 'node:test';
import type { Db } from 'mongodb';
import type { EnquiryDocument } from '../src/server/db';
import { deliverEnquiryNotification as deliver, NotificationSendError, notificationRetryWindowMs, notificationView, type EmailEnvelope } from '../src/server/enquiry-notifications';
import { HttpError } from '../src/server/http';

const now = Date.parse('2026-10-31T00:00:00.000Z');
const initial: EnquiryDocument = {
  _id: 'saved-enquiry', id: 'saved-enquiry', submissionId: 'private-submission', fingerprint: 'private-fingerprint', consentAt: new Date(now).toISOString(),
  name: 'Offline visitor', email: 'visitor@example.com', company: 'Offline test', subject: 'Saved before notification', message: 'Private enquiry text',
  locale: 'en', status: 'New', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), revision: 1,
  notification: { status: 'pending', attempts: 0 },
};

const environment = { RESEND_API_KEY: 'ONLY_OFFLINE_STUB', ENQUIRY_EMAIL_FROM: 'sender@example.com', ENQUIRY_EMAIL_TO: 'inbox@example.com' };
function deliverEnquiryNotification(id: string, options: Parameters<typeof deliver>[1]) {
  return deliver(id, { env: environment, ...options });
}

function memoryDatabase(document: EnquiryDocument | null = initial, recipients?: string[]) {
  const stored: Record<string, unknown> | null = structuredClone(document);
  const read = (object: Record<string, unknown> | null, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, object);
  const matches = (filter: Record<string, unknown>) => stored && Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$exists' in value) return (read(stored, key) !== undefined) === value.$exists;
    return read(stored, key) === value;
  });
  const set = (key: string, value: unknown) => {
    assert(stored);
    const parts = key.split('.'); let parent = stored;
    for (const part of parts.slice(0, -1)) {
      if (!parent[part] || typeof parent[part] !== 'object') parent[part] = {};
      parent = parent[part] as Record<string, unknown>;
    }
    parent[parts.at(-1)!] = structuredClone(value);
  };
  const collection = {
    async findOne(filter: Record<string, unknown>) { return matches(filter) ? structuredClone(stored) : null; },
    async findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
      if (!matches(filter)) return null;
      for (const [key, value] of Object.entries(update.$set)) set(key, value);
      return structuredClone(stored);
    },
  };
  let recipientList = recipients;
  return { db: { collection: (name: string) => name === 'moe_settings' ? { findOne: async () => recipientList === undefined ? null : { _id: 'enquiry-email-recipients', revision: 1, recipients: recipientList } } : collection } as unknown as Db, current: () => structuredClone(stored) as EnquiryDocument | null, set, setRecipients: (next: string[]) => { recipientList = next; } };
}

test('saved recipients receive one shared notification and retries preserve that entire list', async () => {
  const recipients = ['operations@example.com', 'management@example.com'];
  const database = memoryDatabase(initial, recipients); let original = '';
  await deliverEnquiryNotification(initial.id, { db: database.db, now, send: async envelope => {
    assert.equal(envelope.from, 'MOE Navigation <sender@example.com>');
    assert.deepEqual(envelope.to, recipients); original = JSON.stringify(envelope); throw new Error('Lost provider response');
  } });
  database.setRecipients(['replacement@example.com']);
  const result = await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 30_001, send: async envelope => {
    assert.equal(envelope.from, 'MOE Navigation <sender@example.com>');
    assert.equal(JSON.stringify(envelope), original); return 'same-group-notification';
  } });
  assert.equal(result.notification?.status, 'sent'); assert.equal(result.status, 'New');
  assert.deepEqual(result.notificationDelivery?.envelope.to, recipients);
});

test('an explicitly empty saved list pauses mail without falling back to the server recipient', async () => {
  const database = memoryDatabase(initial, []); let sends = 0;
  const send = async (envelope: EmailEnvelope) => { sends++; assert.deepEqual(envelope.to, ['resumed@example.com']); return 'resumed'; };
  const paused = await deliverEnquiryNotification(initial.id, { db: database.db, now, send });
  assert.equal(paused.notification?.status, 'not_configured'); assert.equal(paused.notification?.attempts, 0); assert.equal(sends, 0);
  database.setRecipients(['resumed@example.com']);
  const resumed = await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 1, send });
  assert.equal(resumed.notification?.status, 'sent'); assert.equal(sends, 1);
});

test('a malformed saved list blocks delivery instead of silently sending to a fallback', async () => {
  const database = memoryDatabase(initial, ['invalid-address']); let sends = 0;
  await assert.rejects(() => deliverEnquiryNotification(initial.id, { db: database.db, now, send: async () => { sends++; return 'unexpected'; } }), error => error instanceof HttpError && error.status === 503);
  assert.equal(sends, 0); assert.equal(database.current()?.notification?.attempts, 0);
});

test('delivery requires an already saved enquiry and never sends for a missing record', async () => {
  const database = memoryDatabase(null); let sends = 0;
  await assert.rejects(() => deliverEnquiryNotification(initial.id, { db: database.db, now, send: async () => { sends++; return 'unexpected'; } }), error => error instanceof HttpError && error.status === 404);
  assert.equal(sends, 0);
});

test('concurrent delivery claims and accepted retries call the provider only once', async () => {
  const database = memoryDatabase(); let sends = 0;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const send = async () => {
    sends++; assert.equal(database.current()?.notification?.status, 'sending'); started(); await gate; return 'accepted-reference';
  };
  const first = deliverEnquiryNotification(initial.id, { db: database.db, now, send });
  try {
    await ready;
    await Promise.all(Array.from({ length: 5 }, () => deliverEnquiryNotification(initial.id, { db: database.db, now, send })));
    assert.equal(sends, 1);
  } finally { release(); await first; }
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 1_000, send });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.status, 'sent');
  assert.equal(database.current()?.notification?.attempts, 1);
  assert.equal(database.current()?.message, initial.message);
});

test('an uncertain retry preserves its original envelope and idempotency key after configuration or enquiry changes', async () => {
  const database = memoryDatabase();
  let originalEnvelope: EmailEnvelope | undefined; let originalKey = '';
  await deliverEnquiryNotification(initial.id, { db: database.db, now, send: async (envelope, key) => {
    originalEnvelope = structuredClone(envelope); originalKey = key; throw new Error('private provider failure');
  } });
  assert.equal(database.current()?.notification?.status, 'failed');
  assert(!database.current()?.notification?.message?.includes('private provider failure'));
  database.set('subject', 'Changed later'); database.set('message', 'Changed text');
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 31_000, env: { ...environment, ENQUIRY_EMAIL_FROM: 'changed-sender@example.com', ENQUIRY_EMAIL_TO: 'changed-inbox@example.com' }, send: async (envelope, key) => {
    assert.deepEqual(envelope, originalEnvelope); assert.equal(key, originalKey); return 'same-acceptance-reference';
  } });
  assert.equal(originalKey, `moe-enquiry/${initial.id}`);
  assert.equal(database.current()?.notification?.status, 'sent');
  assert.equal(database.current()?.notification?.attempts, 2);
});

test('three failures stop further attempts without deleting or changing the saved enquiry', async () => {
  const database = memoryDatabase(); let sends = 0;
  const send = async () => { sends++; throw new Error('offline simulated failure'); };
  for (let index = 0; index < 5; index++) await deliverEnquiryNotification(initial.id, { db: database.db, now: now + index * 31_000, send });
  assert.equal(sends, 3);
  assert.equal(database.current()?.notification?.status, 'review');
  assert.equal(database.current()?.notification?.attempts, 3);
  assert.equal(database.current()?.message, initial.message);
  assert.equal(database.current()?.revision, initial.revision);
});

test('the retry window closes before provider idempotency expires', async () => {
  const database = memoryDatabase(); let sends = 0;
  await deliverEnquiryNotification(initial.id, { db: database.db, now, send: async () => { sends++; throw new Error('lost response'); } });
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + notificationRetryWindowMs, send: async () => { sends++; return 'must-not-send'; } });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.status, 'review');
  assert.equal(database.current()?.notification?.attempts, 1);
});

test('an expired lease can recover and a stale completion cannot overwrite the newer acceptance', async () => {
  const database = memoryDatabase();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const first = deliverEnquiryNotification(initial.id, { db: database.db, now, send: async () => { started(); await gate; return 'stale-reference'; } });
  try {
    await ready;
    const expiry = Date.parse(database.current()!.notificationDelivery!.leaseUntil);
    await deliverEnquiryNotification(initial.id, { db: database.db, now: expiry + 1, send: async () => 'latest-reference' });
  } finally { release(); await first; }
  const originalResult = await first;
  assert.equal(originalResult.notification?.status, 'sent');
  assert.equal(originalResult.notificationDelivery?.providerId, 'latest-reference');
  assert.equal(database.current()?.notification?.status, 'sent');
  assert.equal(database.current()?.notification?.attempts, 2);
  assert.equal(database.current()?.notificationDelivery?.providerId, 'latest-reference');
});

test('missing credentials consume no attempt and preserve the enquiry until a configured retry', async () => {
  const database = memoryDatabase(); let sends = 0;
  const send = async () => { sends++; return 'accepted-after-configuration'; };
  await deliverEnquiryNotification(initial.id, { db: database.db, now, env: {}, send });
  assert.equal(sends, 0);
  assert.equal(database.current()?.notification?.status, 'not_configured');
  assert.equal(database.current()?.notification?.attempts, 0);
  assert.equal(database.current()?.notificationDelivery, undefined);
  assert.equal(database.current()?.message, initial.message);
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 1_000, send });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.status, 'sent');
});

test('a provider cooldown blocks repeated requests without consuming another attempt', async () => {
  const database = memoryDatabase(); let sends = 0;
  await deliverEnquiryNotification(initial.id, { db: database.db, now, send: async () => { sends++; throw new NotificationSendError('temporary', 60_000); } });
  assert.equal(database.current()?.notification?.retryAt, new Date(now + 60_000).toISOString());
  for (const offset of [0, 1_000, 59_999]) await deliverEnquiryNotification(initial.id, { db: database.db, now: now + offset, send: async () => { sends++; return 'too-early'; } });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.attempts, 1);
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 60_000, send: async () => { sends++; return 'accepted-after-cooldown'; } });
  assert.equal(sends, 2);
  assert.equal(database.current()?.notification?.status, 'sent');
  assert.equal(database.current()?.notification?.retryAt, undefined);
});

test('a permanent idempotency conflict stops sending immediately and keeps the saved enquiry', async () => {
  const database = memoryDatabase(); let sends = 0;
  const send = async () => { sends++; throw new NotificationSendError('review'); };
  await deliverEnquiryNotification(initial.id, { db: database.db, now, send });
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 60_000, send });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.status, 'review');
  assert.equal(database.current()?.notification?.retryAt, undefined);
  assert.equal(database.current()?.message, initial.message);
});

test('a cooldown beyond the safe retry window immediately requires review without another send', async () => {
  const database = memoryDatabase(); let sends = 0;
  const send = async () => { sends++; throw new NotificationSendError('temporary', 24 * 60 * 60_000); };
  const result = await deliverEnquiryNotification(initial.id, { db: database.db, now, send });
  assert.equal(result.notification?.status, 'review');
  assert.equal(result.notification?.retryAt, undefined);
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 24 * 60 * 60_000, send });
  assert.equal(sends, 1);
});

test('legacy plain-text envelopes are retried unchanged instead of receiving a new template', async () => {
  const oldEnvelope: EmailEnvelope = { from: 'old-sender@example.com', to: ['old-recipient@example.com'], reply_to: initial.email, subject: 'Original legacy subject', text: 'Original legacy plain-text message' };
  const record: EnquiryDocument = {
    ...initial,
    notification: { status: 'failed', attempts: 1, retryAt: new Date(now + 30_000).toISOString() },
    notificationDelivery: { firstAttemptAt: new Date(now).toISOString(), leaseUntil: new Date(now + 120_000).toISOString(), leaseToken: 'old-token', envelope: oldEnvelope },
  };
  const database = memoryDatabase(record); let sends = 0;
  await deliverEnquiryNotification(initial.id, { db: database.db, now: now + 31_000, env: { ...environment, NEXT_PUBLIC_SITE_URL: 'https://company.example.com' }, send: async envelope => {
    sends++; assert.deepEqual(envelope, oldEnvelope); assert(!('html' in envelope)); return 'legacy-accepted';
  } });
  assert.equal(sends, 1);
  assert.equal(database.current()?.notification?.status, 'sent');
});

test('a frozen legacy HTML notification retains its exact sender, visitor subject and body after template and settings changes', async () => {
  const oldEnvelope: EmailEnvelope = {
    from: 'old-sender@example.com', to: ['old-recipient@example.com', 'old-team@example.com'], reply_to: initial.email,
    subject: 'Website enquiry: Original visitor subject', text: 'Original visitor subject\r\nOriginal message',
    html: '<html lang="th"><body style="font-family:Arial"><p>ข้อความเดิม &amp; เก่า</p></body></html>',
  };
  const serialized = JSON.stringify(oldEnvelope);
  const record: EnquiryDocument = {
    ...initial, subject: 'Changed current visitor topic', message: 'Changed current visitor message',
    notification: { status: 'failed', attempts: 1, retryAt: new Date(now + 30_000).toISOString() },
    notificationDelivery: { firstAttemptAt: new Date(now).toISOString(), leaseUntil: new Date(now + 120_000).toISOString(), leaseToken: 'legacy-html-token', envelope: oldEnvelope },
  };
  const database = memoryDatabase(record, ['new-recipient@example.com']); let sends = 0;
  const result = await deliverEnquiryNotification(initial.id, {
    db: database.db, now: now + 31_000,
    env: { ...environment, ENQUIRY_EMAIL_FROM: 'new-sender@example.com', NEXT_PUBLIC_SITE_URL: 'https://new-site.example.com' },
    send: async (envelope, key) => { sends++; assert.equal(JSON.stringify(envelope), serialized); assert.equal(key, `moe-enquiry/${initial.id}`); return 'legacy-html-accepted'; },
  });
  assert.equal(sends, 1);
  assert.equal(result.notification?.status, 'sent');
  assert.equal(JSON.stringify(database.current()?.notificationDelivery?.envelope), serialized);
});

test('expired, exhausted and malformed delivery metadata projects to review without modifying a read', async () => {
  const envelope: EmailEnvelope = { from: 'sender@example.com', to: ['inbox@example.com'], reply_to: initial.email, subject: initial.subject, text: initial.message };
  const valid: EnquiryDocument = { ...initial, notification: { status: 'failed', attempts: 1 }, notificationDelivery: { firstAttemptAt: new Date(now).toISOString(), leaseUntil: new Date(now + 120_000).toISOString(), leaseToken: 'valid-token', envelope } };
  const cases: Array<{ record: EnquiryDocument; at: number }> = [
    { record: valid, at: now + notificationRetryWindowMs },
    { record: { ...valid, notification: { status: 'failed', attempts: 3 } }, at: now },
    { record: { ...valid, notificationDelivery: undefined }, at: now },
    { record: { ...valid, notificationDelivery: { ...valid.notificationDelivery!, firstAttemptAt: 'invalid' } }, at: now },
    { record: { ...valid, notificationDelivery: { ...valid.notificationDelivery!, leaseUntil: 'invalid' } }, at: now },
    { record: { ...valid, notificationDelivery: { ...valid.notificationDelivery!, leaseToken: '' } }, at: now },
    { record: { ...valid, notification: { status: 'failed', attempts: 1, retryAt: 'invalid' } }, at: now },
    { record: { ...valid, notification: { status: 'failed', attempts: 1, lastAttemptAt: 'invalid' } }, at: now },
    { record: { ...valid, notification: { status: 'failed', attempts: 1, lastAttemptAt: new Date(now - 1).toISOString() } }, at: now },
    { record: { ...valid, notification: { status: 'failed', attempts: 1, lastAttemptAt: new Date(now + 1).toISOString() } }, at: now },
  ];
  for (const scenario of cases) {
    const unchanged = structuredClone(scenario.record);
    assert.equal(notificationView(scenario.record, scenario.at).status, 'review');
    assert.deepEqual(scenario.record, unchanged);
    const database = memoryDatabase(scenario.record); let sends = 0;
    await deliverEnquiryNotification(initial.id, { db: database.db, now: scenario.at, send: async () => { sends++; return 'unsafe'; } });
    assert.equal(sends, 0);
    assert.equal(database.current()?.notification?.status, 'review');
  }
});
