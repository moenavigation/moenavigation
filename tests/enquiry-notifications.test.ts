import assert from 'node:assert/strict';
import test from 'node:test';
import { emailConfiguration, emailSetupStatus, emailEnvelope as buildEnvelope, NotificationSendError, sendNotificationEmail, notificationView } from '../src/server/enquiry-notifications';
import { cleanEnquiry } from '../src/server/enquiries';
import type { EnquiryDocument } from '../src/server/db';
import { contactFieldLimits } from '../src/lib/contact-draft';
import { enquirySchema } from '../src/lib/validation';

const record: EnquiryDocument = { _id: 'test', id: 'test', submissionId: 'private', fingerprint: 'private', consentAt: '2026-01-01', name: 'Visitor', email: 'visitor@example.com', company: 'Example', subject: 'Vessel\r\nenquiry', message: '<script>not HTML</script>', locale: 'th', status: 'New', createdAt: '2026-01-01', updatedAt: '2026-01-01', revision: 1 };
const emailEnvelope = (enquiry: Parameters<typeof buildEnvelope>[0], config: Parameters<typeof buildEnvelope>[1], env: Readonly<Record<string, string | undefined>> = {}) => buildEnvelope(enquiry, config, env);
test('notifications stay unconfigured until all sender credentials are valid', () => {
  assert.equal(emailConfiguration({}), null);
  assert.equal(emailConfiguration({ RESEND_API_KEY: 'test', ENQUIRY_EMAIL_FROM: 'Company <a@example.com>', ENQUIRY_EMAIL_TO: 'b@example.com' }), null);
  assert.deepEqual(emailConfiguration({ RESEND_API_KEY: 'test', ENQUIRY_EMAIL_FROM: 'a@example.com', ENQUIRY_EMAIL_TO: 'b@example.com' }), { apiKey: 'test', from: 'a@example.com', to: 'b@example.com' });
});

test('configuration treats blank, malformed and multiple addresses as incomplete and trims valid values', () => {
  const valid = { RESEND_API_KEY: ' test-key ', ENQUIRY_EMAIL_FROM: ' sender@example.com ', ENQUIRY_EMAIL_TO: ' inbox@example.com ' };
  assert.deepEqual(emailConfiguration(valid), { apiKey: 'test-key', from: 'sender@example.com', to: 'inbox@example.com' });
  for (const field of ['RESEND_API_KEY', 'ENQUIRY_EMAIL_FROM', 'ENQUIRY_EMAIL_TO'] as const) {
    for (const value of [undefined, '', '   ']) assert.equal(emailConfiguration({ ...valid, [field]: value }), null, `${field}: ${String(value)}`);
  }
  for (const address of ['not-an-address', 'first@example.com,second@example.com', 'first@example.com;second@example.com', 'first@example.com\r\nBcc: other@example.com']) {
    for (const field of ['ENQUIRY_EMAIL_FROM', 'ENQUIRY_EMAIL_TO'] as const) assert.equal(emailConfiguration({ ...valid, [field]: address }), null);
  }
});
test('readiness exposes only configuration checks and never credentials or email addresses', () => {
  assert.deepEqual(emailSetupStatus({}), { provider: 'Resend', configured: false, checks: { apiKey: 'missing', sender: 'missing', recipient: 'missing' } });
  const env = { RESEND_API_KEY: 'private-test-key', ENQUIRY_EMAIL_FROM: 'private-sender@example.com', ENQUIRY_EMAIL_TO: 'private-recipient@example.com' };
  const status = emailSetupStatus(env);
  assert.deepEqual(status, { provider: 'Resend', configured: true, checks: { apiKey: 'added', sender: 'added', recipient: 'added' } });
  for (const value of Object.values(env)) assert(!JSON.stringify(status).includes(value));
  assert.deepEqual(emailSetupStatus({ ...env, ENQUIRY_EMAIL_FROM: 'invalid sender', ENQUIRY_EMAIL_TO: '' }).checks, { apiKey: 'added', sender: 'invalid', recipient: 'missing' });
});

test('notification payload keeps the configured destination and visitor reply-to with localized escaped HTML and text', () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  assert.equal(payload.reply_to, 'visitor@example.com');
  assert.deepEqual(payload.to, ['inbox@example.com']);
  assert(!payload.subject.includes('\n'));
  assert(payload.text.includes(record.message));
  assert(payload.html?.includes('&lt;script&gt;not HTML&lt;/script&gt;'));
  assert(!payload.html?.includes('<script>'));
  const hostile = { ...record, name: '<img src=x onerror=alert(1)>', company: 'A&B "quoted"', subject: '<b>subject</b>', message: '<a href="javascript:alert(1)">unsafe</a>' };
  const escaped = emailEnvelope(hostile, { from: 'sender@example.com', to: 'inbox@example.com' });
  for (const raw of [hostile.name, hostile.company, hostile.subject, hostile.message]) assert(!escaped.html?.includes(raw));
  assert(escaped.text.includes(hostile.message));
  const english = emailEnvelope({ ...record, locale: 'en' }, { from: 'sender@example.com', to: 'inbox@example.com' });
  assert.notEqual(payload.html, english.html);
  assert.notEqual(payload.text, english.text);
});

test('new notifications use a fixed sender and neutral localized subject without visitor header content', () => {
  const enquiry = { ...record, id: 'a1b2c3d4-5678-4901-8234-567890abcdef', name: 'Visitor\r\nBcc: other@example.com', subject: 'URGENT <script>visitor subject</script>\r\nCc: other@example.com', company: 'Different visitor company' };
  const config = { from: 'sender@example.com', to: ['operations@example.com', 'management@example.com'] };
  for (const locale of ['en', 'th'] as const) {
    const payload = emailEnvelope({ ...enquiry, locale }, config);
    assert.equal(payload.from, 'MOE Navigation <sender@example.com>');
    assert.equal(payload.subject, `MOE Navigation | ${locale === 'en' ? 'New enquiry' : 'ข้อความสอบถามใหม่'} #a1b2c3d4`);
    assert.equal(payload.reply_to, record.email);
    assert.deepEqual(payload.to, config.to);
    assert(!/[\r\n]/.test(payload.subject + payload.from + payload.reply_to));
    assert.equal(emailEnvelope({ ...enquiry, locale, name: 'Changed name', subject: 'Entirely different visitor topic' }, config).subject, payload.subject);
    assert(payload.text.includes(enquiry.subject));
    assert(payload.html?.includes('&lt;script&gt;visitor subject&lt;/script&gt;'));
    assert.deepEqual(Object.keys(payload).sort(), ['from', 'html', 'reply_to', 'subject', 'text', 'to']);
  }
  assert.equal(emailEnvelope({ ...enquiry, locale: 'en', id: '--<>\r\n' }, config).subject, 'MOE Navigation | New enquiry');
  assert.equal(emailEnvelope({ ...enquiry, locale: 'en', id: 'AB12\r\nCDef-more' }, config).subject, 'MOE Navigation | New enquiry #AB12CDef');
  assert.equal(enquirySchema.safeParse({ ...record, email: 'visitor@example.com\r\nBcc: other@example.com', consent: true, submissionId: 'a1b2c3d4-5678-4901-8234-567890abcdef' }).success, false);
});

test('HTML and plaintext keep the complete bilingual enquiry with only the approved inbox link and no remote resources', () => {
  const enquiry = {
    ...record, id: 'a1b2c3d4-5678-4901-8234-567890abcdef', createdAt: '2026-10-30T18:10:00.000Z',
    name: 'Manee "Marine" & Team', company: 'Company <fleet> & partners',
    subject: 'หัวข้อ <a href="https://untrusted.example.com">visitor link</a>',
    message: 'Full first line <b>ข้อความ</b> & cargo.\r\nSecond line with "quotes" and apostrophe\'s.',
  };
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  for (const locale of ['en', 'th'] as const) {
    const payload = emailEnvelope({ ...enquiry, locale }, { from: 'sender@example.com', to: 'inbox@example.com' }, { NEXT_PUBLIC_SITE_URL: 'https://company.example.com/path?ignored=visitor' });
    const html = payload.html!;
    const visibleText = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<wbr\s*\/?\s*>/gi, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, entity => entities[entity]).replace(/\s+/g, ' ');
    for (const value of [enquiry.subject, enquiry.name, enquiry.email, enquiry.company, enquiry.message, enquiry.id]) {
      assert(payload.text.includes(value));
      assert(visibleText.includes(value.replace(/\s+/g, ' ')), value);
    }
    assert(payload.text.indexOf(enquiry.subject) < payload.text.indexOf(enquiry.name));
    assert(payload.text.indexOf(enquiry.name) < payload.text.indexOf(enquiry.message));
    assert(payload.text.indexOf(enquiry.message) < payload.text.indexOf(enquiry.id));
    assert(visibleText.indexOf(enquiry.name) < visibleText.indexOf(enquiry.message.replace(/\s+/g, ' ')));
    assert(visibleText.indexOf(enquiry.message.replace(/\s+/g, ' ')) < visibleText.indexOf(enquiry.id));
    assert.deepEqual([...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)].map(match => match[1]), ['https://company.example.com/cms/enquiries']);
    assert(payload.text.includes('https://company.example.com/cms/enquiries'));
    assert(!/<(?:img|script|iframe|link|object|embed|form)\b|\bsrc\s*=|@import|url\s*\(/i.test(html));
    assert(!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|max-height\s*:\s*0|font-size\s*:\s*0/i.test(html));
    assert(!html.includes('href="https://untrusted.example.com"'));
  }
});

test('maximum valid enquiry fields stay complete and below the 64 KiB HTML budget', context => {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
  assert.equal(email.length, contactFieldLimits.email);
  let maximumHtmlBytes = 0;
  for (const character of ['"', 'ก']) for (const locale of ['en', 'th'] as const) {
    const input = enquirySchema.parse({
      name: character.repeat(contactFieldLimits.name), email, company: character.repeat(contactFieldLimits.company),
      subject: character.repeat(contactFieldLimits.subject), message: character.repeat(contactFieldLimits.message),
      locale, consent: true, submissionId: 'a1b2c3d4-5678-4901-8234-567890abcdef',
    });
    const payload = emailEnvelope({ ...record, ...input, id: input.submissionId, createdAt: '2026-10-30T18:10:00.000Z' }, { from: 'sender@example.com', to: 'inbox@example.com' });
    const htmlBytes = Buffer.byteLength(payload.html!, 'utf8');
    maximumHtmlBytes = Math.max(maximumHtmlBytes, htmlBytes);
    assert(htmlBytes <= 64 * 1024);
    assert(payload.text.includes(input.subject)); assert(payload.text.includes(input.message));
    assert(payload.html!.replace(/<wbr>/g, '').includes((character === '"' ? '&quot;' : character).repeat(contactFieldLimits.message)));
  }
  context.diagnostic(`Largest maximum-field HTML fixture: ${maximumHtmlBytes} UTF-8 bytes (limit ${64 * 1024}).`);
});

test('long tokens have safe HTML break opportunities without changing entities, Unicode, plaintext or the link destination', () => {
  const token = 'A&<>"\'literal&amp;'.repeat(12);
  const unicode = 'ภาษาไทยกำลังทดสอบ 👩‍🚢 สวัสดีค่ะ';
  const message = `${token}\r\n${unicode}\n${'X'.repeat(204)}`;
  const origin = 'https://long-company-navigation-subdomain.example.com';
  const payload = emailEnvelope({ ...record, message }, { from: 'sender@example.com', to: 'inbox@example.com' }, { NEXT_PUBLIC_SITE_URL: origin });
  const html = payload.html!;
  const messageHtml = html.match(/<p\b[^>]*dir="auto"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert(messageHtml);
  assert(messageHtml.includes('<wbr>'));
  assert(!/&[^;<>]*<wbr>/.test(messageHtml));
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  const restored = messageHtml.replace(/<wbr>/g, '').replace(/<br>/g, '\n').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, entity => entities[entity]);
  assert.equal(restored, message.replace(/\r\n?/g, '\n'));
  assert(messageHtml.includes(unicode));
  assert(payload.text.includes(message)); assert(!payload.text.includes('<wbr>'));
  assert.deepEqual([...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)].map(match => match[1]), [`${origin}/cms/enquiries`]);
  assert(payload.text.includes(`${origin}/cms/enquiries`));
});

test('retry validation accepts the generated sender and legacy plain addresses but rejects forged display names or headers', () => {
  const now = Date.parse('2026-10-31T00:00:00.000Z');
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  const attempted = (from: string): EnquiryDocument => ({
    ...record, notification: { status: 'failed', attempts: 1 },
    notificationDelivery: { firstAttemptAt: new Date(now).toISOString(), leaseUntil: new Date(now + 120_000).toISOString(), leaseToken: 'safe-token', envelope: { ...payload, from } },
  });
  const longestAddress = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
  for (const from of [payload.from, 'legacy@example.com', `MOE Navigation <${longestAddress}>`]) assert.equal(notificationView(attempted(from), now).status, 'failed', from);
  for (const from of [
    'Visitor <sender@example.com>', 'MOE NAVIGATION <sender@example.com>', '"MOE Navigation" <sender@example.com>',
    'MOE Navigation <not-an-address>', 'MOE Navigation <sender@example.com>,other@example.com',
    'MOE Navigation <sender@example.com>\r\nBcc: other@example.com', 'sender@example.com\nCc: other@example.com',
  ]) assert.equal(notificationView(attempted(from), now).status, 'review', from);
});

test('email links use only an explicit public HTTPS website origin', () => {
  const config = { from: 'sender@example.com', to: 'inbox@example.com' };
  const valid = emailEnvelope(record, config, { NEXT_PUBLIC_SITE_URL: 'https://company.example.com' });
  assert(valid.html?.includes('https://company.example.com/cms/enquiries'));
  for (const value of [undefined, '', 'http://company.example.com', 'https://company.example', 'https://company.test', 'https://company.local', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://private:password@company.example.com', 'javascript:alert(1)']) {
    const envelope = emailEnvelope(record, config, { NEXT_PUBLIC_SITE_URL: value });
    assert(!envelope.html?.includes('/cms/enquiries'), String(value));
    assert(!envelope.text.includes('/cms/enquiries'), String(value));
  }
});

test('new email templates use mobile metadata and a localized Bangkok date with a safe invalid-date fallback', () => {
  for (const locale of ['en', 'th'] as const) {
    const config = { from: 'sender@example.com', to: 'inbox@example.com' };
    const payload = emailEnvelope({ ...record, locale, createdAt: '2026-10-30T18:10:00.000Z' }, config);
    assert(payload.html?.includes('charset="UTF-8"'));
    assert(payload.html?.includes('width=device-width'));
    const localDate = locale === 'en' ? '31 Oct 2026' : '31 ต.ค. 2569';
    const timeZone = locale === 'en' ? '(Bangkok time)' : '(เวลาประเทศไทย)';
    for (const body of [payload.text, payload.html!]) {
      assert(body.includes(localDate)); assert(body.includes('01:10')); assert(body.includes(timeZone));
      assert(!body.includes('2026-10-30T18:10:00.000Z'));
    }
    const invalid = 'invalid-date-private-value';
    const fallback = emailEnvelope({ ...record, locale, createdAt: invalid }, config);
    for (const body of [fallback.text, fallback.html!]) {
      assert(!body.includes(invalid));
      assert(body.includes(locale === 'en' ? 'Date unavailable' : 'ไม่สามารถแสดงวันที่ได้'));
    }
  }
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

test('sending uses the fixed HTTPS endpoint, POST, bearer authorization and an abortable deadline', async () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options?.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer private-test-credential');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('Idempotency-Key'), 'moe-enquiry/test');
    assert(options?.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    assert.deepEqual(JSON.parse(String(options.body)), payload);
    assert(!String(options.body).includes('private-test-credential'));
    return Response.json({ id: 'accepted-provider-reference' });
  };
  assert.equal(await sendNotificationEmail(payload, 'moe-enquiry/test', 'private-test-credential', request), 'accepted-provider-reference');
});

test('a provider timeout remains uncertain even when a fetcher ignores cancellation', async () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  let signal: AbortSignal | undefined;
  const request: typeof fetch = async (_url, options) => { signal = options?.signal ?? undefined; return new Promise<Response>(() => {}); };
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    await assert.rejects(() => sendNotificationEmail(payload, 'deadline-key', 'private-key', request, { timeoutMs: 5 }), error => error instanceof NotificationSendError && error.kind === 'uncertain' && !error.message.includes('private'));
    assert.equal(signal?.aborted, true);
  } finally { clearTimeout(keepAlive); }
});

test('a successful HTTP status is insufficient without a usable provider acceptance identifier', async () => {
  assert.equal(await sendNotificationEmail(emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' }), 'stable-key', 'secret', async () => Response.json({ id: 'provider:id.1' })), 'provider:id.1');
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  for (const result of [null, {}, { id: '' }, { id: 12 }, { id: 'unsafe\nidentifier' }, { id: 'a'.repeat(129) }, { error: 'private-response-details' }]) {
    await assert.rejects(() => sendNotificationEmail(payload, 'malformed-key', 'private-key', async () => Response.json(result)), error => error instanceof NotificationSendError && error.kind === 'uncertain');
  }
  await assert.rejects(() => sendNotificationEmail(payload, 'malformed-key', 'private-key', async () => new Response('private-not-json', { status: 200 })), error => error instanceof NotificationSendError && error.kind === 'uncertain' && !error.message.includes('private'));
});

test('provider responses are bounded and a stalled body uses the same whole-operation deadline', async () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  await assert.rejects(() => sendNotificationEmail(payload, 'large-key', 'private-key', async () => Response.json({ id: 'valid-id', padding: 'x'.repeat(17 * 1024) })), error => error instanceof NotificationSendError && error.kind === 'uncertain');
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"id":')); }, cancel() { cancelled = true; } });
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    await assert.rejects(() => sendNotificationEmail(payload, 'body-key', 'private-key', async () => new Response(body), { timeoutMs: 5 }), error => error instanceof NotificationSendError && error.kind === 'uncertain');
    assert.equal(cancelled, true);
  } finally { clearTimeout(keepAlive); }
});

test('idempotency mismatch requires review while concurrent requests and rate limits receive bounded cooldowns', async () => {
  const payload = emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' });
  const cases = [
    { status: 409, name: 'invalid_idempotent_request', kind: 'review' },
    { status: 409, name: 'concurrent_idempotent_requests', kind: 'temporary', delay: 5_000 },
    { status: 429, name: 'rate_limit_exceeded', kind: 'temporary', retry: '60', delay: 60_000 },
    { status: 429, name: 'rate_limit_exceeded', kind: 'temporary', retry: '999999', delay: 86_400_000 },
  ];
  for (const scenario of cases) await assert.rejects(() => sendNotificationEmail(payload, 'retry-key', 'private-key', async () => Response.json({ name: scenario.name, message: 'unsafe private failure' }, { status: scenario.status, headers: scenario.retry ? { 'Retry-After': scenario.retry } : {} })), error => error instanceof NotificationSendError && error.kind === scenario.kind && (scenario.delay === undefined || error.retryAfterMs === scenario.delay) && !error.message.includes('private'));
});
test('interrupted leases can be checked again without exposing internal delivery metadata', () => {
  const interrupted: EnquiryDocument = { ...record, notification: { status: 'sending', attempts: 1 }, notificationDelivery: { leaseToken: 'private', leaseUntil: new Date(1).toISOString(), firstAttemptAt: new Date(0).toISOString(), envelope: emailEnvelope(record, { from: 'sender@example.com', to: 'inbox@example.com' }) } };
  assert.equal(notificationView(interrupted, 2).status, 'pending');
  const publicValue = cleanEnquiry(interrupted);
  assert(!('notificationDelivery' in publicValue)); assert(!('submissionId' in publicValue)); assert(!('fingerprint' in publicValue));
});
