import assert from 'node:assert/strict';
import test from 'node:test';
import { indexingEnabled, publicHttpsOrigin, siteOrigin } from '../src/lib/site-config';
import loader from '../src/lib/cloudinary-loader';
import { safeErrorDetails } from '../src/lib/error-reporting';
import { cloudinaryVariables, configurationChecks, contactReadiness, contentReadiness, emailReadiness, mongoVariables, populated, releaseReport } from '../scripts/release-checks';

test('indexing requires explicit content approval and a production public HTTPS origin', () => {
  const ready = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://moe-navigation.com', SITE_INDEXING_ENABLED: 'true', SITE_CONTENT_APPROVED: 'true' };
  assert.equal(indexingEnabled(ready), true);
  for (const changes of [{ NODE_ENV: 'development' }, { SITE_CONTENT_APPROVED: 'false' }, { SITE_INDEXING_ENABLED: 'false' }, { VERCEL_ENV: 'preview' }, { NEXT_PUBLIC_SITE_URL: 'https://example.com' }, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3005' }]) assert.equal(indexingEnabled({ ...ready, ...changes }), false);
  for (const url of ['https://127.0.0.1', 'https://a.local', 'https://a.example', 'https://u:p@moe-navigation.com', 'https://moe-navigation.com/path', 'https://moe-navigation.com?x=1']) assert.equal(publicHttpsOrigin(url), false);
  assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://moe-navigation.com/' }), 'https://moe-navigation.com');
  assert.throws(() => siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://example.com/extra' }));
});

test('responsive media delivery preserves original identity and skips signed/external URLs', () => {
  const original = 'https://res.cloudinary.com/test/image/upload/v123/moe/photo.webp';
  assert.equal(loader({ src: original, width: 640 }), 'https://res.cloudinary.com/test/image/upload/f_auto,q_auto:good,c_limit,w_640/v123/moe/photo.webp');
  assert.match(loader({ src: original, width: 10000 }), /w_3840/);
  for (const src of ['/icon.svg', 'blob:local-image', 'https://example.com/a.jpg', 'https://res.cloudinary.com/test/image/upload/s--signed--/v1/a.jpg']) assert.equal(loader({ src, width: 640 }), src);
});

test('error reporting excludes provider messages, arbitrary names, stacks, and unsafe digests', () => {
  const error = Object.assign(new Error('mongodb://private-credential'), { digest: 'known-123' });
  assert.deepEqual(safeErrorDetails(error), { type: 'Error', digest: 'known-123' });
  error.name = 'secret-token'; error.digest = 'private\nvalue';
  assert.deepEqual(safeErrorDetails(error), { type: 'UnknownError' });
});

const emailEnvironment = { RESEND_API_KEY: 'private-test-key', ENQUIRY_EMAIL_FROM: 'sender@example.com', ENQUIRY_EMAIL_TO: 'legacy@example.com' };

test('release email readiness follows saved CMS recipients without requiring the legacy variable', () => {
  const check = emailReadiness({ ...emailEnvironment, ENQUIRY_EMAIL_TO: undefined }, { revision: 1, recipients: ['one@example.com', 'two@example.com'] });
  assert.equal(check.status, 'pass');
  assert.match(check.detail, /2 recipient\(s\).*saved CMS list/);
  assert.match(check.detail, /actual receipt have not been checked/);
});

test('saved empty and malformed recipient lists never fall back to a legacy address', () => {
  const paused = emailReadiness(emailEnvironment, { revision: 1, recipients: [] });
  assert.equal(paused.status, 'review');
  assert.match(paused.detail, /intentionally paused/);
  for (const row of [
    { revision: 0, recipients: ['one@example.com'] },
    { revision: '1', recipients: ['one@example.com'] },
    { revision: 1, recipients: ['one@example.com', 'ONE@example.com'] },
    { revision: 1, recipients: ['bad address'] },
    { revision: 1, recipients: Array.from({ length: 51 }, (_, index) => `recipient${index}@example.com`) },
  ]) {
    const check = emailReadiness(emailEnvironment, row);
    assert.equal(check.status, 'review');
    assert.match(check.detail, /saved CMS recipient list is invalid/);
  }
});

test('a configuration-only or failed database check cannot claim that recipients are configured', () => {
  assert.equal(emailReadiness(emailEnvironment).status, 'review');
  assert.match(emailReadiness(emailEnvironment).detail, /have not been read/);
  assert.equal(emailReadiness(emailEnvironment, null).status, 'pass');
  assert.equal(emailReadiness({ ...emailEnvironment, ENQUIRY_EMAIL_TO: undefined }, null).status, 'review');
});

test('release email checks validate configuration syntax and never reveal secrets or recipients', () => {
  for (const changes of [
    { RESEND_API_KEY: '' }, { RESEND_API_KEY: 'secret\r\nvalue' }, { RESEND_API_KEY: 'x'.repeat(2049) },
    { ENQUIRY_EMAIL_FROM: 'invalid sender' }, { ENQUIRY_EMAIL_FROM: 'sender@example.com\r\nBcc: elsewhere@example.com' },
  ]) assert.equal(emailReadiness({ ...emailEnvironment, ...changes }, { revision: 1, recipients: ['private-recipient@example.com'] }).status, 'review');
  const output = JSON.stringify(emailReadiness(emailEnvironment, { revision: 1, recipients: ['private-recipient@example.com'] }));
  for (const secret of [...Object.values(emailEnvironment), 'private-recipient@example.com']) assert(!output.includes(secret));
});

test('healthy Media Trash is not reported as an unfinished upload; incomplete deletions remain visible', () => {
  const check = (media: Record<string, unknown>[], name: string) => contentReadiness([], media).find(item => item.name === name)!;
  assert.equal(check([{ state: 'trashed', trashedAt: '2026-10-31T00:00:00.000Z' }], 'Pending upload cleanup').status, 'pass');
  assert.equal(check([{ state: 'staged' }, { state: 'uploading' }, { state: 'deleting' }], 'Pending upload cleanup').status, 'review');
  const retainedDeletion = [{ state: 'deleting', trashedAt: '2026-10-31T00:00:00.000Z' }];
  assert.equal(check(retainedDeletion, 'Pending upload cleanup').status, 'pass');
  assert.equal(check(retainedDeletion, 'Media Trash deletion review').status, 'review');
});

test('referenced images must be available committed media and blank specifications remain reviewable', () => {
  const records = [{ type: 'Vessel', id: 'vessel', image: 'private-image-url', vesselSpecs: { tonnage: '', length: null } }];
  const checks = contentReadiness(records, [{ state: 'trashed', url: 'private-image-url' }]);
  assert.equal(checks.find(item => item.name === 'Registered content images')!.status, 'blocked');
  assert.equal(checks.find(item => item.name === 'Vessel specification review')!.status, 'review');
  assert(!JSON.stringify(checks).includes('private-image-url'));
  assert.equal(contentReadiness([{ ...records[0], vesselSpecs: { tonnage: 0 } }], [{ state: 'committed', url: 'private-image-url' }]).find(item => item.name === 'Vessel specification review')!.status, 'pass');
});

test('provider prerequisites are independent and whitespace does not count as configuration', () => {
  const env = { MONGODB_URI: 'mongodb://local.test', MONGODB_DB_NAME: 'project', CLOUDINARY_API_KEY: ' ' };
  assert.equal(populated(env, mongoVariables), true);
  assert.equal(populated(env, cloudinaryVariables), false);
  assert.equal(configurationChecks(env).find(item => item.name === 'Server configuration')!.status, 'blocked');
  assert(!JSON.stringify(configurationChecks(env)).includes(env.MONGODB_URI));
});

test('an omitted public email is an owner review, while missing company names remain blocking', () => {
  const contacts = { companyName: 'Example company', companyNameTh: 'บริษัทตัวอย่าง', officeAddress: 'Confirmed address', officeAddressTh: 'ที่อยู่ที่ยืนยันแล้ว', phone: 'Confirmed phone', email: '' };
  const check = contactReadiness(contacts);
  assert.equal(check.status, 'review');
  assert.match(check.detail, /Optional contact fields awaiting owner confirmation: email/);
  assert.match(check.detail, /may remain blank until verified/);
  assert.equal(contactReadiness({ ...contacts, email: 'confirmed@example.com' }).status, 'pass');
  for (const name of ['companyName', 'companyNameTh']) {
    const missing = contactReadiness({ ...contacts, [name]: ' ' });
    assert.equal(missing.status, 'blocked');
    assert(missing.detail.includes(name));
  }
  assert.equal(contactReadiness(null).status, 'blocked');
  assert.equal(contactReadiness({ companyName: contacts.companyName, companyNameTh: contacts.companyNameTh }).status, 'review');
  assert(!JSON.stringify(check).includes(contacts.phone));
});

test('passing automated checks does not falsely attest external launch readiness', () => {
  const report = releaseReport([{ name: 'Automated check', status: 'pass', detail: 'Passed.' }], true, new Date('2026-10-31T00:00:00.000Z'));
  assert.equal(report.automatedChecksPassed, true);
  assert.equal(report.ready, false);
  assert(report.requiresExternalVerification.length > 0);
  assert.equal(releaseReport([{ name: 'Content review', status: 'review', detail: 'Pending.' }], false).automatedChecksPassed, false);
});
