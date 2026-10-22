import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Enquiry, EnquiryNotification } from '@/lib/cms-types';
import { collections, getDb, type EnquiryDocument } from './db';
import { HttpError } from './http';

export const notificationAttemptLimit = 3;
const leaseMs = 120_000;
// Resend retains idempotency keys for 24 hours. Stop before that boundary.
export const notificationRetryWindowMs = 23 * 60 * 60 * 1000;
export type EmailEnvelope = { from: string; to: string[]; reply_to: string; subject: string; text: string };
export type NotificationDelivery = { firstAttemptAt: string; leaseUntil: string; leaseToken: string; envelope: EmailEnvelope; providerId?: string };
type EmailConfiguration = { apiKey: string; from: string; to: string };

export function emailConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): EmailConfiguration | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.ENQUIRY_EMAIL_FROM?.trim();
  const to = env.ENQUIRY_EMAIL_TO?.trim();
  // Plain verified addresses avoid ambiguous display-name/header parsing.
  if (!apiKey || !from || !to || !z.email().safeParse(from).success || !z.email().safeParse(to).success) return null;
  return { apiKey, from, to };
}

export function initialNotification(): EnquiryNotification {
  return emailConfiguration()
    ? { status: 'pending', attempts: 0, message: 'Waiting for an email notification attempt.' }
    : { status: 'not_configured', attempts: 0, message: 'Email notifications are not configured. This enquiry is safely stored in the inbox.' };
}

export function emailEnvelope(enquiry: Enquiry, config: Pick<EmailConfiguration, 'from' | 'to'>): EmailEnvelope {
  return {
    from: config.from, to: [config.to], reply_to: enquiry.email,
    subject: `Website enquiry: ${enquiry.subject.replace(/[\r\n]/g, ' ').slice(0, 160)}`,
    text: [
      'A new website enquiry is saved in your CMS inbox.', '',
      `Reference: ${enquiry.id}`, `Name: ${enquiry.name}`, `Email: ${enquiry.email}`,
      `Company: ${enquiry.company || 'Not supplied'}`, `Subject: ${enquiry.subject}`,
      `Language: ${enquiry.locale}`, `Received: ${enquiry.createdAt}`, '', enquiry.message,
    ].join('\n'),
  };
}

export class NotificationSendError extends Error {
  constructor(public kind: 'configuration' | 'temporary' | 'uncertain') { super(kind); }
}

export async function sendNotificationEmail(envelope: EmailEnvelope, key: string, apiKey: string, request: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await request('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(envelope),
    });
  } catch { throw new NotificationSendError('uncertain'); }
  if (!response.ok) throw new NotificationSendError([400, 401, 403, 422].includes(response.status) ? 'configuration' : 'temporary');
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) throw new NotificationSendError('uncertain');
  return result.id;
}

export function notificationView(record: EnquiryDocument, now = Date.now()): EnquiryNotification {
  const state = record.notification ?? { status: 'not_configured' as const, attempts: 0, message: 'No email notification has been requested for this enquiry.' };
  if (state.status === 'sending' && Date.parse(record.notificationDelivery?.leaseUntil || '') <= now) {
    return { ...state, status: 'pending', message: 'The last attempt was interrupted. Retry to check the same email request safely.' };
  }
  return state;
}

/** A durable, bounded attempt. Database save success never depends on this provider. */
export async function deliverEnquiryNotification(id: string, options: {
  db?: Awaited<ReturnType<typeof getDb>>;
  now?: number;
  send?: typeof sendNotificationEmail;
} = {}) {
  const c = collections(options.db ?? await getDb());
  const now = options.now ?? Date.now();
  const record = await c.enquiries.findOne({ _id: id });
  if (!record) throw new HttpError(404, 'This enquiry is no longer available.');
  const current = notificationView(record, now);
  if (['sent', 'review', 'sending'].includes(current.status)) return record;
  const match = {
    _id: id,
    ...(record.notification ? { 'notification.status': record.notification.status, 'notification.attempts': record.notification.attempts } : { notification: { $exists: false } }),
    ...(record.notificationDelivery ? { 'notificationDelivery.leaseToken': record.notificationDelivery.leaseToken } : {}),
  };
  const expired = record.notificationDelivery && now - Date.parse(record.notificationDelivery.firstAttemptAt) >= notificationRetryWindowMs;
  if (expired || current.attempts >= notificationAttemptLimit) {
    return await c.enquiries.findOneAndUpdate(match, { $set: { notification: { ...current, status: 'review', message: 'Check the email provider history before sending again. Automatic retry is closed to prevent duplicate messages.' } } }, { returnDocument: 'after' }) ?? record;
  }
  const config = emailConfiguration();
  if (!config) {
    return await c.enquiries.findOneAndUpdate(match, { $set: { notification: { ...current, status: 'not_configured', message: 'Configure the email provider and verified sender before retrying. The enquiry remains saved.' } } }, { returnDocument: 'after' }) ?? record;
  }
  const timestamp = new Date(now).toISOString();
  const leaseToken = randomUUID();
  const delivery: NotificationDelivery = {
    firstAttemptAt: record.notificationDelivery?.firstAttemptAt ?? timestamp,
    leaseUntil: new Date(now + leaseMs).toISOString(), leaseToken,
    // Freeze the payload so a retry uses the same idempotency key AND message.
    envelope: record.notificationDelivery?.envelope ?? emailEnvelope(record, config),
  };
  const notification: EnquiryNotification = { status: 'sending', attempts: current.attempts + 1, lastAttemptAt: timestamp, message: 'Sending an email notification.' };
  const claimed = await c.enquiries.findOneAndUpdate(match, { $set: { notification, notificationDelivery: delivery } }, { returnDocument: 'after' });
  if (!claimed) return await c.enquiries.findOne({ _id: id }) ?? record;
  let finalState: EnquiryNotification;
  let providerId: string | undefined;
  try {
    providerId = await (options.send ?? sendNotificationEmail)(delivery.envelope, `moe-enquiry/${id}`, config.apiKey);
    finalState = { ...notification, status: 'sent', sentAt: new Date().toISOString(), message: 'The email provider accepted the notification. Inbox delivery is not independently confirmed.' };
  } catch (error) {
    const configuration = error instanceof NotificationSendError && error.kind === 'configuration';
    finalState = { ...notification, status: 'failed', message: configuration
      ? 'The email provider rejected this request. Check the API key, recipient and verified sender before retrying.'
      : 'Email acceptance could not be confirmed. Retry uses the same request to avoid duplicate notifications.' };
  }
  return await c.enquiries.findOneAndUpdate({ _id: id, 'notificationDelivery.leaseToken': leaseToken }, {
    $set: { notification: finalState, ...(providerId ? { 'notificationDelivery.providerId': providerId } : {}) },
  }, { returnDocument: 'after' }) ?? claimed;
}
