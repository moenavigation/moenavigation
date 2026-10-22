import type { Locale } from './content';

export type ContactValues = { name: string; email: string; company: string; subject: string; message: string; consent: boolean };
export type SubmissionAttempt = { id: string; locale: Locale };
export const blankContact: ContactValues = { name: '', email: '', company: '', subject: '', message: '', consent: false };
export const contactDraftKey = 'moe-contact-draft';
export const contactTextFields = ['name', 'email', 'company', 'subject', 'message'] as const;
export const contactFieldLimits = { name: 120, email: 254, company: 160, subject: 200, message: 5000 };

function parseDraft(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export function restoreContactDraft(raw: string | null, requestedSubject = ''): ContactValues {
  const values = { ...blankContact };
  const stored = parseDraft(raw);
  if (stored) for (const field of contactTextFields) {
    if (typeof stored[field] === 'string') values[field] = stored[field].slice(0, contactFieldLimits[field]);
  }
  // A service link may suggest a subject, but must never replace a visitor's
  // saved text or change the payload of an uncertain submission on reload.
  if (!values.subject) values.subject = requestedSubject.slice(0, contactFieldLimits.subject);
  return values;
}

export function serializeContactDraft(values: ContactValues, submission?: SubmissionAttempt): string | null {
  if (!contactTextFields.some(field => values[field].length)) return null;
  return JSON.stringify({ ...values, consent: false, submissionId: submission?.id, submissionLocale: submission?.locale });
}

export function restoreContactSubmission(raw: string | null, values: ContactValues, fallbackLocale: Locale): SubmissionAttempt | null {
  const stored = parseDraft(raw);
  if (!stored || !contactTextFields.every(field => stored[field] === values[field]) || typeof stored.submissionId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(stored.submissionId)) return null;
  return { id: stored.submissionId, locale: stored.submissionLocale === 'en' || stored.submissionLocale === 'th' ? stored.submissionLocale : fallbackLocale };
}

export function matchesSubmittedDraft(raw: string | null, values: ContactValues, submission: SubmissionAttempt): boolean {
  const restored = restoreContactSubmission(raw, values, submission.locale);
  return restored?.id === submission.id && restored.locale === submission.locale;
}
