import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiryRecipientList, saveEnquiryRecipientsSchema } from '../src/lib/enquiry-email';
import { emailConfiguration, emailSetupStatus } from '../src/server/enquiry-notifications';
import { cmsLogEventSchema } from '../src/lib/cms-logs';

const env = { RESEND_API_KEY: 'OFFLINE_ONLY', ENQUIRY_EMAIL_FROM: 'sender@example.com', ENQUIRY_EMAIL_TO: 'legacy@example.com' };
test('recipient validation trims plain addresses, rejects duplicates and bounds the list', () => {
  assert.deepEqual(enquiryRecipientList.parse([' first@example.com ', 'second@example.com']), ['first@example.com', 'second@example.com']);
  assert.deepEqual(enquiryRecipientList.parse([]), []);
  assert(enquiryRecipientList.safeParse(Array.from({ length: 50 }, (_, n) => `person${n}@example.com`)).success);
  for (const list of [['same@example.com', 'SAME@example.com'], ['a@example.com,b@example.com'], ['Name <a@example.com>'], ['a@example.com\r\nBcc: b@example.com'], [''], Array.from({ length: 51 }, (_, n) => `person${n}@example.com`)]) assert.equal(enquiryRecipientList.safeParse(list).success, false);
  assert.equal(saveEnquiryRecipientsSchema.safeParse({ expectedRevision: 0, recipients: [], role: 'Dev' }).success, false);
});
test('saved recipients override the environment for readiness without exposing the list', () => {
  assert.equal(emailSetupStatus({ ...env, ENQUIRY_EMAIL_TO: undefined }, ['one@example.com', 'two@example.com']).configured, true);
  assert.equal(emailSetupStatus(env, []).configured, false);
  assert.equal(emailSetupStatus(env, ['invalid']).checks.recipient, 'invalid');
  assert.deepEqual(emailConfiguration(env, ['one@example.com', 'two@example.com'])?.to, ['one@example.com', 'two@example.com']);
  assert.equal(emailConfiguration(env, []), null);
  const result = JSON.stringify(emailSetupStatus(env, ['one@example.com', 'two@example.com']));
  assert(!result.includes('@')); assert(!result.includes('OFFLINE_ONLY'));
});
test('recipient changes have a safe audit action that cannot contain email addresses', () => {
  const event = { action: 'settings.email_recipients_updated', actor: { id: 'dev', username: 'dev', role: 'Dev' }, target: { type: 'Settings', id: 'enquiry-email-recipients' } };
  assert(cmsLogEventSchema.safeParse(event).success);
  assert.equal(cmsLogEventSchema.safeParse({ ...event, target: { ...event.target, label: 'private@example.com' } }).success, false);
});
