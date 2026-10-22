import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { blankContact } from '../src/lib/contact-draft';
import { contactApiFieldErrors, isContactEmail, validateContactValues } from '../src/lib/contact-validation';
import { enquirySchema } from '../src/lib/validation';

const values = { ...blankContact, name: 'A visitor', email: 'visitor@example.com', subject: 'Vessel enquiry', message: 'Please send more information.', consent: true };
const metadata = { locale: 'en', submissionId: '932a2575-273c-4d6f-a5b2-c505a080a684', website: '' };

test('public email validation preserves the existing API acceptance rules', () => {
  for (const email of ['visitor@example.com', ' First.Last+route@Sub.Example.com ', "o'neill@example.com", '.name@example.com', 'name..last@example.com', 'name@example.c', 'name@localhost', 'name@-example.com', 'name@example.123', 'two names@example.com', 'name@例子.com', 'a'.repeat(245) + '@example.com']) {
    const accepted = z.string().trim().toLowerCase().email().max(254).safeParse(email).success;
    assert.equal(isContactEmail(email), accepted, email);
    assert.equal(enquirySchema.safeParse({ ...values, ...metadata, email }).success, accepted, email);
    assert.equal(!validateContactValues({ ...values, email }, 'en').email, accepted, email);
  }
});

test('public and API field constraints agree on trimmed boundaries', () => {
  assert.deepEqual(validateContactValues(values, 'en'), {});
  for (const change of [{ name: ' ' }, { name: 'x'.repeat(121) }, { company: 'x'.repeat(161) }, { subject: 'x' }, { subject: 'x'.repeat(201) }, { message: 'short' }, { message: 'x'.repeat(5001) }, { consent: false }]) {
    assert.ok(Object.keys(validateContactValues({ ...values, ...change }, 'en')).length);
    assert.equal(enquirySchema.safeParse({ ...values, ...metadata, ...change }).success, false);
  }
  assert.deepEqual(validateContactValues({ ...values, name: `  ${'x'.repeat(120)}  ` }, 'en'), {});
});

test('API validation fields map to localized visible inputs in form order', () => {
  const result = contactApiFieldErrors({ fields: { message: 'internal English error', email: 'internal English error', submissionId: 'invalid id', website: 'invalid trap', 'name.nested': 'unknown' } }, 'th');
  assert.deepEqual(Object.keys(result), ['email', 'message']);
  assert.equal(result.email, 'กรุณากรอกอีเมลที่ถูกต้อง');
  assert.equal(result.message?.includes('internal'), false);
  for (const malformed of [null, false, [], 'bad', { fields: null }, { fields: [] }, { fields: { email: 3 } }]) assert.deepEqual(contactApiFieldErrors(malformed, 'en'), {});
});
