import { local, type Locale } from './content';
import { contactFieldLimits, contactTextFields, type ContactValues } from './contact-draft';

export type ContactFieldErrors = Partial<Record<keyof ContactValues, string>>;

// Keep the public form and API on the same practical email format without
// including the CMS schemas or Zod runtime in the public form bundle.
const contactEmailPattern = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
export function isContactEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= contactFieldLimits.email && contactEmailPattern.test(email);
}

function fieldMessages(locale: Locale): Record<keyof ContactValues, string> {
  return {
    name: local(locale, 'Please enter your name using 2–120 characters.', 'กรุณากรอกชื่อ 2–120 ตัวอักษร'),
    email: local(locale, 'Please enter a valid email address.', 'กรุณากรอกอีเมลที่ถูกต้อง'),
    company: local(locale, 'Please use no more than 160 characters for the company name.', 'กรุณากรอกชื่อบริษัทไม่เกิน 160 ตัวอักษร'),
    subject: local(locale, 'Please enter a subject using 2–200 characters.', 'กรุณากรอกหัวข้อ 2–200 ตัวอักษร'),
    message: local(locale, 'Please describe your requirements using 10–5,000 characters.', 'กรุณาระบุความต้องการ 10–5,000 ตัวอักษร'),
    consent: local(locale, 'Please agree to the processing of your enquiry.', 'กรุณายินยอมให้ใช้ข้อมูลเพื่อดำเนินการตามข้อความสอบถาม'),
  };
}

export function validateContactValues(values: ContactValues, locale: Locale): ContactFieldErrors {
  const messages = fieldMessages(locale);
  const errors: ContactFieldErrors = {};
  for (const field of contactTextFields) {
    const length = values[field].trim().length;
    const minimum = field === 'name' || field === 'subject' ? 2 : field === 'message' ? 10 : 0;
    if (length < minimum || length > contactFieldLimits[field] || (field === 'email' && !isContactEmail(values.email))) errors[field] = messages[field];
  }
  if (values.consent !== true) errors.consent = messages.consent;
  return errors;
}

export function contactApiFieldErrors(response: unknown, locale: Locale): ContactFieldErrors {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return {};
  const fields = (response as Record<string, unknown>).fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
  const messages = fieldMessages(locale);
  const errors: ContactFieldErrors = {};
  for (const field of [...contactTextFields, 'consent'] as const) {
    if (Object.hasOwn(fields, field) && typeof (fields as Record<string, unknown>)[field] === 'string') errors[field] = messages[field];
  }
  return errors;
}
