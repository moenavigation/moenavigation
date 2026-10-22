import assert from 'node:assert/strict';
import test from 'node:test';
import { emailConfiguration, emailEnvelope, NotificationSendError, sendNotificationEmail, notificationView } from '../src/server/enquiry-notifications';
import { cleanEnquiry } from '../src/server/enquiries';
import type { EnquiryDocument } from '../src/server/db';

const record: EnquiryDocument = { _id: 'test', id: 'test', submissionId: 'private', fingerprint: 'private', consentAt: '2026-01-01', name: 'Visitor', email: 'visitor@example.com', company: 'Example', subject: 'Vessel\r\nenquiry', message: '<script>not HTML</script>', locale: 'th', status: 'New', createdAt: '2026-01-01', updatedAt: '2026-01-01', revision: 1 };
test('notifications stay unconfigured until all sender credentials are valid', () => {
  assert.equal(emailConfiguration({}), null);
  assert.equal(emailConfiguration({ RESEND_API_KEY: 'test', ENQUIRY_EMAIL_FROM: 'Company <a@example.com>', ENQUIRY_EMAIL_TO: 'b@example.com' }), null);
  assert.deepEqual(emailConfiguration({ RESEND_API_KEY: 'test', ENQUIRY_EMAIL_FROM: 'a@example.com', ENQUIRY_EMAIL_TO: 'b@example.com' }), { apiKey: 'test', from: 'a@example.com', to: 'b@example.com' });
});
test('notification payload is plain text with fixed destination and visitor reply-to', () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  assert.equal(payload.reply_to, 'visitor@example.com');
  assert.deepEqual(payload.to, ['inbox@example.com']);
  assert(!payload.subject.includes('\n'));
  assert(payload.text.includes(record.message));
  assert(!('html' in payload));
});
test('provider requests use stable idempotency keys and hide unsafe provider failures', async () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  let attempts = 0;
  const request = (async (url, options) => { attempts++; assert.equal(url, 'https://api.resend.com/emails'); assert.equal(new Headers(options?.headers).get('Idempotency-Key'), 'fixed-key'); assert.deepEqual(JSON.parse(String(options?.body)), payload); return Response.json({ id: 'provider-id' }); }) as typeof fetch;
  assert.equal(await sendNotificationEmail(payload, 'fixed-key', 'test-secret', request), 'provider-id');
  assert.equal(attempts, 1);
  for (const status of [400, 403, 429, 503]) {
    await assert.rejects(() => sendNotificationEmail(payload, 'fixed-key', 'test-secret', async () => Response.json({ error: 'secret raw provider message' }, { status })), error => error instanceof NotificationSendError && !error.message.includes('secret'));
  }
  await assert.rejects(() => sendNotificationEmail(payload, 'fixed-key', 'test-secret', async () => { throw new Error('token'); }), error => error instanceof NotificationSendError && error.kind === 'uncertain');
});
test('interrupted leases can be checked again without exposing internal delivery metadata', () => {
  const interrupted: EnquiryDocument = { ...record, notification: { status: 'sending', attempts: 1 }, notificationDelivery: { leaseToken: 'private', leaseUntil: new Date(1).toISOString(), firstAttemptAt: new Date(0).toISOString(), envelope: emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' }) } };
  assert.equal(notificationView(interrupted, 2).status, 'pending');
  const publicValue = cleanEnquiry(interrupted);
  assert(!('notificationDelivery' in publicValue)); assert(!('submissionId' in publicValue)); assert(!('fingerprint' in publicValue));
});
