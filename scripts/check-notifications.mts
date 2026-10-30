import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes('--qa')) throw new Error('Use --qa for the notification rehearsal on the configured MongoDB host. Prefer the offline backend tests.');
const source = process.env.MONGODB_DB_NAME;
if (!source || source.endsWith('_qa_backend')) throw new Error('Start from the main configuration; this script chooses a suffixed QA database on the same MongoDB host.');
process.env.MONGODB_DB_NAME = `${source}_qa_backend`;
const env = { RESEND_API_KEY: 'TEST_ONLY_NO_PROVIDER_CALLS', ENQUIRY_EMAIL_FROM: 'test-sender@example.com', ENQUIRY_EMAIL_TO: 'test-inbox@example.com' };
const { getClient, getDb, collections } = await import('../src/server/db');
const { deliverEnquiryNotification, notificationRetryWindowMs, notificationRetryDelayMs } = await import('../src/server/enquiry-notifications');
const db = await getDb(); const c = collections(db); const ids: string[] = [];
const results: string[] = [];
const now = Date.now();
async function fixture() {
  const id = randomUUID(); ids.push(id);
  await c.enquiries.insertOne({ _id: id, id, submissionId: `notification-qa-${id}`, fingerprint: id, consentAt: new Date(now).toISOString(), name: 'Notification QA', email: 'qa@example.com', company: 'Isolated test', subject: 'Provider stub rehearsal', message: 'No actual email will be sent.', locale: 'en', status: 'New', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), revision: 1, notification: { status: 'pending', attempts: 0 } });
  return id;
}
try {
  const id = await fixture(); let sends = 0;
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const send = async () => { sends++; started(); await held; return 'test-provider-id'; };
  const first = deliverEnquiryNotification(id, { db, env, now, send });
  try {
    await Promise.race([ready, first.then(() => { throw new Error('The initial notification did not reach its sender.'); })]);
    await Promise.all(Array.from({ length: 5 }, () => deliverEnquiryNotification(id, { db, env, now, send })));
  } finally {
    release(); await first;
  }
  await deliverEnquiryNotification(id, { db, env, now, send });
  assert.equal(sends, 1); assert.equal((await c.enquiries.findOne({ _id: id }))?.notification?.status, 'sent'); results.push('concurrent attempts and accepted retry send once');

  const retryId = await fixture(); let payload = ''; let key = '';
  await deliverEnquiryNotification(retryId, { db, env, now, send: async (envelope, requestKey) => { payload = JSON.stringify(envelope); key = requestKey; throw new Error('simulated lost response'); } });
  const retry = await deliverEnquiryNotification(retryId, { db, env: { ...env, ENQUIRY_EMAIL_TO: 'changed-config@example.com' }, now: now + notificationRetryDelayMs + 1, send: async (envelope, requestKey) => { assert.equal(JSON.stringify(envelope), payload); assert.equal(requestKey, key); return 'same-provider-result'; } });
  assert.equal(retry.notification?.status, 'sent');
  results.push('uncertain retry preserves message and idempotency key');

  const failedId = await fixture(); let failures = 0;
  for (let i = 0; i < 4; i++) await deliverEnquiryNotification(failedId, { db, env, now: now + i * (notificationRetryDelayMs + 1), send: async () => { failures++; throw new Error('simulated provider outage'); } });
  assert.equal(failures, 3); assert.equal((await c.enquiries.findOne({ _id: failedId }))?.notification?.status, 'review'); results.push('three attempts maximum and saved enquiry retained');

  const expiredId = await fixture();
  await deliverEnquiryNotification(expiredId, { db, env, now, send: async () => { throw new Error('lost response'); } });
  await deliverEnquiryNotification(expiredId, { db, env, now: now + notificationRetryWindowMs, send: async () => { throw new Error('Must never call expired provider request'); } });
  assert.equal((await c.enquiries.findOne({ _id: expiredId }))?.notification?.status, 'review'); results.push('expired provider idempotency window stops sending');

  const interruptedId = await fixture();
  await deliverEnquiryNotification(interruptedId, { db, env, now, send: async () => { throw new Error('lost response'); } });
  await c.enquiries.updateOne({ _id: interruptedId }, { $set: { 'notification.status': 'sending' } });
  const recovered = await deliverEnquiryNotification(interruptedId, { db, env, now: now + 120_001, send: async () => 'recovered-provider-result' });
  assert.equal(recovered.notification?.status, 'sent'); results.push('expired upload-independent email lease recovers');

  const noConfigId = await fixture();
  const unconfigured = await deliverEnquiryNotification(noConfigId, { db, env: { ...env, RESEND_API_KEY: undefined }, send: async () => { throw new Error('Must not call unconfigured provider'); } });
  assert.equal(unconfigured.notification?.status, 'not_configured'); assert.equal(unconfigured.notification?.attempts, 0); results.push('missing credentials preserve enquiry without sending');
} finally {
  await c.enquiries.deleteMany({ _id: { $in: ids }, name: 'Notification QA' });
  await mkdir('.local', { recursive: true });
  await writeFile('.local/notification-check-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks: results, provider: 'stub; no external emails', testEnquiriesRemaining: await c.enquiries.countDocuments({ _id: { $in: ids } }) }, null, 2));
  await (await getClient()).close();
}
console.log(`PASS: ${results.length} notification recovery checks; exact test enquiries cleaned; no external email sent.`);
