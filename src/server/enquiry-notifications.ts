import 'server-only';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { Enquiry, EnquiryNotification } from '@/lib/cms-types';
import type { EmailSetupCheck, EmailSetupStatus } from '@/lib/enquiry-email';
import { collections, getDb, type EnquiryDocument } from './db';
import { HttpError } from './http';
import { readEnquiryRecipients } from './enquiry-recipients';
import { enquiryRecipientList } from '@/lib/enquiry-email';
import { enquiryEmailTemplate } from './enquiry-email-template';

export const notificationAttemptLimit = 3;
const leaseMs = 120_000;
// Resend retains idempotency keys for 24 hours. Stop before that boundary.
export const notificationRetryWindowMs = 23 * 60 * 60 * 1000;
export const notificationRetryDelayMs = 30_000;
const maximumResponseBytes = 16 * 1024;
const maximumProviderWaitMs = 24 * 60 * 60 * 1000;
type Environment = Readonly<Record<string, string | undefined>>;
export type EmailEnvelope = { from: string; to: string[]; reply_to: string; subject: string; text: string; html?: string };
export type NotificationDelivery = { firstAttemptAt: string; leaseUntil: string; leaseToken: string; envelope: EmailEnvelope; providerId?: string };
type EmailConfiguration = { apiKey: string; from: string; to: string | string[] };

function setupCheck(value: string | undefined, valid: (value: string) => boolean): EmailSetupCheck {
  if (!value?.trim()) return 'missing';
  return valid(value.trim()) ? 'added' : 'invalid';
}

export function emailSetupStatus(env: Environment = process.env, recipients?: string[]): EmailSetupStatus {
  const address = (value: string) => value.length <= 254 && z.email().safeParse(value).success;
  const checks: EmailSetupStatus['checks'] = {
    // This verifies safe configuration syntax, not account access or ownership.
    apiKey: setupCheck(env.RESEND_API_KEY, value => value.length <= 2048 && /^[\x21-\x7e]+$/.test(value)),
    sender: setupCheck(env.ENQUIRY_EMAIL_FROM, address),
    recipient: recipients === undefined ? setupCheck(env.ENQUIRY_EMAIL_TO, address) : !recipients.length ? 'missing' : enquiryRecipientList.safeParse(recipients).success ? 'added' : 'invalid',
  };
  return { provider: 'Resend', configured: Object.values(checks).every(value => value === 'added'), checks };
}

export function emailConfiguration(env: Environment = process.env, recipients?: string[]): EmailConfiguration | null {
  if (!emailSetupStatus(env, recipients).configured) return null;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.ENQUIRY_EMAIL_FROM?.trim();
  const to = recipients ?? env.ENQUIRY_EMAIL_TO?.trim();
  // Plain verified addresses avoid ambiguous display-name/header parsing.
  if (!apiKey || !from || !to || !z.email().safeParse(from).success) return null;
  return { apiKey, from, to };
}

export function initialNotification(): EnquiryNotification {
  return emailConfiguration()
    ? { status: 'pending', attempts: 0, message: 'Waiting for an email notification attempt.' }
    : { status: 'not_configured', attempts: 0, message: 'Email notifications are not configured. This enquiry is safely stored in the inbox.' };
}

function inboxLink(env: Environment): string | null {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured || configured.length > 2048) return null;
  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || isIP(host.replace(/^\[|\]$/g, '')) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|lan|home)$/.test(host)) return null;
    return `${url.origin}/cms/enquiries`;
  } catch { return null; }
}

function receivedTime(value: string, thai: boolean): string {
  const time = isoTime(value);
  if (time === null) return thai ? 'ไม่สามารถแสดงวันที่ได้' : 'Date unavailable';
  const formatted = new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(time);
  return `${formatted} (${thai ? 'เวลาประเทศไทย' : 'Bangkok time'})`;
}

export function emailEnvelope(enquiry: Enquiry, config: Pick<EmailConfiguration, 'from' | 'to'>, env: Environment = process.env): EmailEnvelope {
  return enquiryEmailTemplate(enquiry, config, receivedTime(enquiry.createdAt, enquiry.locale === 'th'), inboxLink(env));
}

export class NotificationSendError extends Error {
  constructor(public kind: 'configuration' | 'temporary' | 'uncertain' | 'review', public retryAfterMs = notificationRetryDelayMs) { super(kind); }
}

function providerWait(headers: Headers, now: number, fallback: number) {
  const value = headers.get('retry-after');
  if (!value || value.length > 80) return fallback;
  const duration = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(duration) && duration >= 0 ? Math.min(maximumProviderWaitMs, Math.max(1000, duration)) : fallback;
}

async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw new NotificationSendError('uncertain'); }
  if (Number(response.headers.get('content-length')) > maximumResponseBytes) { void response.body?.cancel().catch(() => {}); throw new NotificationSendError('uncertain'); }
  const reader = response.body?.getReader();
  if (!reader) throw new NotificationSendError('uncertain');
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumResponseBytes) { abort(); throw new NotificationSendError('uncertain'); }
      chunks.push(value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function sendNotificationEmail(envelope: EmailEnvelope, key: string, apiKey: string, request: typeof fetch = fetch, options: { now?: () => number; timeoutMs?: number } = {}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NotificationSendError('uncertain')); }, options.timeoutMs ?? 12_000); });
  const send = async () => {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(envelope),
    });
    const result = await responseJson(response, controller.signal).catch(() => null);
    if (!response.ok) {
      const name = result && typeof result === 'object' && 'name' in result ? result.name : null;
      if (response.status === 409 && name !== 'concurrent_idempotent_requests') throw new NotificationSendError('review');
      const configuration = [400, 401, 403, 404, 405, 422].includes(response.status);
      throw new NotificationSendError(configuration ? 'configuration' : 'temporary', providerWait(response.headers, (options.now ?? Date.now)(), response.status === 409 ? 5000 : notificationRetryDelayMs));
    }
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id.trim() || !/^[\x20-\x7e]{1,128}$/.test(result.id)) throw new NotificationSendError('uncertain');
    return result.id;
  };
  try { return await Promise.race([send(), deadline]); }
  catch (error) { throw error instanceof NotificationSendError ? error : new NotificationSendError('uncertain'); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

function isoTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}
const senderSchema = z.string().max(280).refine(value => {
  const branded = /^MOE Navigation <([^<>]+)>$/.exec(value);
  return z.email().max(254).safeParse(branded ? branded[1] : value).success;
});
const envelopeSchema = z.object({ from: senderSchema, to: enquiryRecipientList.refine(value => value.length > 0), reply_to: z.email().max(254), subject: z.string().min(1).max(240), text: z.string().min(1).max(64 * 1024), html: z.string().max(128 * 1024).optional() }).strict();
const reviewMessage = 'Check the email provider history before sending again. Automatic retry is closed to prevent duplicate messages.';
function reviewState(state: EnquiryNotification): EnquiryNotification {
  const { retryAt, ...rest } = state; void retryAt;
  return { ...rest, status: 'review', message: reviewMessage };
}

export function notificationView(record: EnquiryDocument, now = Date.now()): EnquiryNotification {
  const state = record.notification ?? { status: 'not_configured' as const, attempts: 0, message: 'No email notification has been requested for this enquiry.' };
  if (state.status === 'sent' || state.status === 'review') {
    const { retryAt, ...terminal } = state; void retryAt;
    return terminal;
  }
  if (!Number.isSafeInteger(state.attempts) || state.attempts < 0) return reviewState({ ...state, attempts: 0 });
  if (state.retryAt !== undefined && isoTime(state.retryAt) === null) return reviewState(state);
  const delivery = record.notificationDelivery;
  const first = isoTime(delivery?.firstAttemptAt);
  const lease = isoTime(delivery?.leaseUntil);
  if (state.attempts > 0) {
    if (!delivery || first === null || lease === null || first > now || lease < first || lease > now + leaseMs || typeof delivery.leaseToken !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(delivery.leaseToken) || !envelopeSchema.safeParse(delivery.envelope).success) return reviewState(state);
    const last = isoTime(state.lastAttemptAt);
    if (state.lastAttemptAt !== undefined && (last === null || last < first || last > now)) return reviewState(state);
  } else if (delivery || state.status === 'sending') return reviewState(state);
  if (state.status === 'sending' && lease !== null && lease > now) return state;
  if (state.attempts >= notificationAttemptLimit || first !== null && (now - first >= notificationRetryWindowMs || state.retryAt !== undefined && Date.parse(state.retryAt) >= first + notificationRetryWindowMs)) return reviewState(state);
  if (state.status === 'sending') {
    return { ...state, status: 'pending', message: 'The last attempt was interrupted. Retry to check the same email request safely.' };
  }
  return state;
}

/** A durable, bounded attempt. Database save success never depends on this provider. */
export async function deliverEnquiryNotification(id: string, options: {
  db?: Awaited<ReturnType<typeof getDb>>;
  now?: number;
  send?: typeof sendNotificationEmail;
  env?: Environment;
} = {}) {
  const db = options.db ?? await getDb();
  const c = collections(db);
  const now = options.now ?? Date.now();
  const record = await c.enquiries.findOne({ _id: id });
  if (!record) throw new HttpError(404, 'This enquiry is no longer available.');
  const current = notificationView(record, now);
  if (['sent', 'sending'].includes(current.status)) return record;
  const match = {
    _id: id,
    ...(record.notification ? { 'notification.status': record.notification.status, 'notification.attempts': record.notification.attempts } : { notification: { $exists: false } }),
    ...(record.notificationDelivery ? { 'notificationDelivery.leaseToken': record.notificationDelivery.leaseToken } : {}),
  };
  if (current.status === 'review') {
    if (record.notification?.status === 'review') return record;
    return await c.enquiries.findOneAndUpdate(match, { $set: { notification: current } }, { returnDocument: 'after' }) ?? record;
  }
  if (current.retryAt && Date.parse(current.retryAt) > now) return record;
  const env = options.env ?? process.env;
  const recipients = await readEnquiryRecipients(db, env);
  const config = emailConfiguration(env, recipients.recipients);
  if (!config) {
    return await c.enquiries.findOneAndUpdate(match, { $set: { notification: { ...current, status: 'not_configured', message: 'Configure the email provider and verified sender before retrying. The enquiry remains saved.' } } }, { returnDocument: 'after' }) ?? record;
  }
  const timestamp = new Date(now).toISOString();
  const leaseToken = randomUUID();
  const delivery: NotificationDelivery = {
    firstAttemptAt: record.notificationDelivery?.firstAttemptAt ?? timestamp,
    leaseUntil: new Date(now + leaseMs).toISOString(), leaseToken,
    // Freeze the payload so a retry uses the same idempotency key AND message.
    envelope: record.notificationDelivery?.envelope ?? emailEnvelope(record, config, env),
  };
  const notification: EnquiryNotification = { status: 'sending', attempts: current.attempts + 1, lastAttemptAt: timestamp, message: 'Sending an email notification.' };
  const claimed = await c.enquiries.findOneAndUpdate(match, { $set: { notification, notificationDelivery: delivery } }, { returnDocument: 'after' });
  if (!claimed) return await c.enquiries.findOne({ _id: id }) ?? record;
  let finalState: EnquiryNotification;
  let providerId: string | undefined;
  try {
    providerId = await (options.send ?? sendNotificationEmail)(delivery.envelope, `moe-enquiry/${id}`, config.apiKey);
    finalState = { ...notification, status: 'sent', sentAt: new Date(options.now ?? Date.now()).toISOString(), message: 'The email provider accepted the notification. Inbox delivery is not independently confirmed.' };
  } catch (error) {
    const configuration = error instanceof NotificationSendError && error.kind === 'configuration';
    const wait = error instanceof NotificationSendError && Number.isFinite(error.retryAfterMs) ? Math.min(maximumProviderWaitMs, Math.max(1000, error.retryAfterMs)) : notificationRetryDelayMs;
    const retryTime = (options.now ?? Date.now()) + wait;
    const retryClosed = retryTime >= Date.parse(delivery.firstAttemptAt) + notificationRetryWindowMs;
    finalState = error instanceof NotificationSendError && error.kind === 'review' || notification.attempts >= notificationAttemptLimit || retryClosed ? reviewState(notification) : { ...notification, status: 'failed', retryAt: new Date(retryTime).toISOString(), message: configuration
      ? 'The email provider rejected this request. Check the API key, recipient and verified sender before retrying.'
      : 'Email acceptance could not be confirmed. Retry uses the same request to avoid duplicate notifications.' };
  }
  const finalized = await c.enquiries.findOneAndUpdate({ _id: id, 'notificationDelivery.leaseToken': leaseToken }, {
    $set: { notification: finalState, ...(providerId ? { 'notificationDelivery.providerId': providerId } : {}) },
  }, { returnDocument: 'after' });
  // An expired worker must report the newer claim's result, not its own stale
  // sending state, after losing the compare-and-swap above.
  return finalized ?? await c.enquiries.findOne({ _id: id }) ?? claimed;
}
