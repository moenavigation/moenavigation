import assert from 'node:assert/strict';
import test from 'node:test';
import { blankContact, matchesSubmittedDraft, restoreContactDraft, restoreContactSubmission, serializeContactDraft } from '../src/lib/contact-draft';

const attempt = { id: '932a2575-273c-4d6f-a5b2-c505a080a684', locale: 'en' as const };
const values = { ...blankContact, name: 'A visitor', email: 'visitor@example.com', subject: 'My edited enquiry', message: 'Please send more information.', consent: true };

test('a service subject cannot overwrite a saved draft or break retry identity after reload', () => {
  const raw = serializeContactDraft(values, attempt);
  const restored = restoreContactDraft(raw, 'Original service title');
  assert.equal(restored.subject, values.subject);
  assert.equal(restored.message, values.message);
  assert.equal(restored.consent, false);
  assert.deepEqual(restoreContactSubmission(raw, restored, 'th'), attempt);
});

test('new or subjectless drafts accept a suggested subject without losing other fields', () => {
  assert.equal(restoreContactDraft(null, 'Vessel enquiry').subject, 'Vessel enquiry');
  const draft = restoreContactDraft(JSON.stringify({ name: 'Visitor', message: 'Existing message' }), 'New service');
  assert.equal(draft.name, 'Visitor');
  assert.equal(draft.message, 'Existing message');
  assert.equal(draft.subject, 'New service');
});

test('malformed or oversized browser drafts remain safe and consent is never restored', () => {
  for (const raw of ['not json', 'false', '[]', '42']) assert.deepEqual(restoreContactDraft(raw), blankContact);
  const draft = restoreContactDraft(JSON.stringify({ name: 'x'.repeat(200), message: 'x'.repeat(6000), email: 17, consent: true }));
  assert.equal(draft.name.length, 120);
  assert.equal(draft.message.length, 5000);
  assert.equal(draft.email, '');
  assert.equal(draft.consent, false);
  assert.equal(restoreContactDraft(null, 'x'.repeat(300)).subject.length, 200);
});

test('retry keys only belong to the exact draft and retain the original submission language', () => {
  const raw = serializeContactDraft(values, attempt);
  assert.deepEqual(restoreContactSubmission(raw, { ...values, consent: false }, 'th'), attempt);
  assert.equal(restoreContactSubmission(raw, { ...values, message: 'A changed request' }, 'en'), null);
  assert.equal(restoreContactSubmission(JSON.stringify({ ...values, submissionId: 'invalid' }), values, 'en'), null);
  assert.equal(serializeContactDraft(blankContact), null);
});

test('a late successful response cannot erase a newer draft from another visit or tab', () => {
  assert.equal(matchesSubmittedDraft(serializeContactDraft(values, attempt), values, attempt), true);
  assert.equal(matchesSubmittedDraft(serializeContactDraft({ ...values, message: 'New unsent message' }), values, attempt), false);
  assert.equal(matchesSubmittedDraft(serializeContactDraft(values, { ...attempt, id: '293d2802-c4bb-48a2-b5ad-52e916f50ff1' }), values, attempt), false);
  assert.equal(matchesSubmittedDraft(null, values, attempt), false);
});
