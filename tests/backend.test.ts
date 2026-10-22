import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { actionSchema, enquirySchema, loginSchema, passwordSchema, recordSchema, saveSchema, saveSettingsSchema } from '../src/server/validation';
import { projectPublicContent } from '../src/lib/public-content';
import { contentTypes, corePageIds, type ContentRecord } from '../src/lib/cms-types';
import { contentMediaUrls, contentMediaReferenceFilter } from '../src/server/media-references';

const validRecord = {
  id: 'test-vessel', type: 'Vessel' as const,
  title: 'Test vessel', titleTh: 'เรือทดสอบ',
  description: 'A vessel description.', descriptionTh: 'รายละเอียดเรือทดสอบ',
  image: '/images/hero.webp', category: 'Cargo', categoryTh: 'สินค้า', status: 'Draft' as const,
};

test('content accepts bilingual data and trims user-entered text', () => {
  const result = recordSchema.parse({ ...validRecord, title: '  Test vessel  ', titleTh: '  เรือทดสอบ  ' });
  assert.equal(result.title, 'Test vessel');
  assert.equal(result.titleTh, 'เรือทดสอบ');
});

test('records cannot omit either language or silently exceed editor limits', () => {
  for (const change of [
    { titleTh: '  ' }, { descriptionTh: '' }, { title: 'a'.repeat(201) },
    { description: 'a'.repeat(2001) }, { body: 'a'.repeat(30001) },
    { category: '' }, { status: 'Deleted' }, { type: 'Admin' },
  ]) assert.equal(recordSchema.safeParse({ ...validRecord, ...change }).success, false);
});

test('content IDs cannot contain traversal, URL delimiters, or alternate encodings', () => {
  for (const id of ['../news', 'my/news', 'my?news', 'my#news', '%2e%2e', '$where', 'a--b', '-a', 'a-', 'UPPER']) {
    assert.equal(recordSchema.safeParse({ ...validRecord, id }).success, false, id);
  }
  assert.equal(recordSchema.safeParse({ ...validRecord, id: 'route-2026-10' }).success, true);
});

test('clients cannot assign persistence metadata through content input', () => {
  const result = recordSchema.parse({
    ...validRecord, _id: 'another-record', revision: 900, deletedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z', owner: 'someone-else', purgeAt: '2026-10-02',
  });
  for (const key of ['_id', 'revision', 'deletedAt', 'updatedAt', 'owner', 'purgeAt']) {
    assert.equal(key in result, false, `Server metadata ${key} must not be accepted`);
  }
});

test('core pages remain published and reserved routes cannot be replaced by generic pages', () => {
  for (const id of corePageIds) {
    assert.equal(recordSchema.safeParse({ ...validRecord, type: 'Page', id }).success, false);
    assert.equal(recordSchema.safeParse({ ...validRecord, type: 'Page', id, status: 'Published' }).success, true);
  }
  for (const id of ['cms', 'api', 'en', 'sitemap', 'robots']) {
    assert.equal(recordSchema.safeParse({ ...validRecord, type: 'Page', id, status: 'Published' }).success, false);
  }
});

test('dates reject impossible calendar dates without throwing an unexpected error', () => {
  for (const date of ['2026-99-01', '2026-13-01', '2026-00-00', '2026-02-30', '2026-02-29', 'not-a-date']) {
    assert.doesNotThrow(() => recordSchema.safeParse({ ...validRecord, date }), date);
    assert.equal(recordSchema.safeParse({ ...validRecord, date }).success, false, date);
  }
  for (const date of ['', '2028-02-29', '2026-10-23']) {
    assert.equal(recordSchema.safeParse({ ...validRecord, date }).success, true, date);
  }
});

test('save and trash contracts require explicit revisions and UUID submission keys', () => {
  const submissionId = randomUUID();
  assert.equal(saveSchema.safeParse({ record: validRecord, expectedRevision: null, submissionId }).success, true);
  assert.equal(saveSchema.safeParse({ record: validRecord, expectedRevision: 1, submissionId }).success, true);
  for (const expectedRevision of [undefined, 0, -1, 1.5, '1']) {
    assert.equal(saveSchema.safeParse({ record: validRecord, expectedRevision, submissionId }).success, false);
  }
  assert.equal(saveSchema.safeParse({ record: validRecord, expectedRevision: null, submissionId: 'shared-key' }).success, false);
  assert.equal(actionSchema.safeParse({ id: validRecord.id, type: validRecord.type, expectedRevision: 1, action: 'purge' }).success, false);
});

test('contact data requires explicit consent, valid address, and a fresh submission key', () => {
  const enquiry = {
    name: 'Visitor', email: 'visitor@example.com', subject: 'Vessel enquiry',
    message: 'Please share the confirmed vessel availability.', company: '', locale: 'en',
    consent: true, submissionId: randomUUID(), website: '',
  };
  assert.equal(enquirySchema.safeParse(enquiry).success, true);
  for (const change of [
    { consent: false }, { consent: 'true' }, { email: 'not-an-email' }, { message: 'short' },
    { locale: 'fr' }, { website: 'https://spam.invalid' }, { submissionId: 'duplicate' },
  ]) assert.equal(enquirySchema.safeParse({ ...enquiry, ...change }).success, false);
  const normalized = enquirySchema.parse({ ...enquiry, email: ' Visitor@Example.com ', status: 'Resolved' });
  assert.equal(normalized.email, 'visitor@example.com');
  assert.equal('status' in normalized, false);
});

test('login normalizes usernames while preserving password bytes', () => {
  const result = loginSchema.parse({ username: '  ADMIN  ', password: '  intentional spaces  ' });
  assert.equal(result.username, 'admin');
  assert.equal(result.password, '  intentional spaces  ');
  assert.equal(passwordSchema.safeParse({ currentPassword: 'old-password', newPassword: 'short' }).success, false);
  assert.equal(passwordSchema.safeParse({ currentPassword: 'old-password', newPassword: 'a sufficiently long new password' }).success, true);
});

test('public projection excludes drafts and Trash across all content types', () => {
  const records: ContentRecord[] = [];
  for (const type of contentTypes) {
    records.push({ ...validRecord, id: `${type.toLowerCase()}-public`, type, status: 'Published', revision: 1 });
    records.push({ ...validRecord, id: `${type.toLowerCase()}-draft`, type, status: 'Draft', revision: 1 });
    records.push({ ...validRecord, id: `${type.toLowerCase()}-trash`, type, status: 'Published', revision: 2, deletedAt: new Date().toISOString() });
  }
  const content = projectPublicContent(records);
  for (const list of Object.values(content)) {
    assert.equal(list.length, 1);
    assert.ok(list[0].id.endsWith('-public'));
  }
});

test('image reference extraction covers mobile art direction and every gallery entry without duplicates', () => {
  const record = { image: 'https://cdn.test/main.webp', mobileImage: 'https://cdn.test/mobile.webp', gallery: [
    { url: 'https://cdn.test/gallery.webp', alt: 'Deck', altTh: 'ดาดฟ้า' },
    { url: 'https://cdn.test/main.webp', alt: '', altTh: '' },
  ] };
  assert.deepEqual(contentMediaUrls(record), ['https://cdn.test/main.webp', 'https://cdn.test/mobile.webp', 'https://cdn.test/gallery.webp']);
  assert.deepEqual(contentMediaUrls({ image: '' }), []);
  assert.deepEqual(contentMediaReferenceFilter(record.image), {
    $or: [{ image: record.image }, { mobileImage: record.image }, { 'gallery.url': record.image }],
  });
  assert.equal('deletedAt' in contentMediaReferenceFilter(record.image), false, 'Trash must continue protecting media');
  assert.equal('type' in contentMediaReferenceFilter(record.image), false, 'Sections must protect media like other records');
});

test('sections and expanded images preserve bilingual fields and enforce useful limits', () => {
  const section = { ...validRecord, type: 'Section', parentId: 'home', image: '', mobileImage: 'https://cdn.test/mobile.webp', gallery: [
    { url: 'https://cdn.test/gallery.webp', alt: 'Deck', altTh: 'ดาดฟ้า' },
  ], order: 2, eyebrow: 'Our fleet', eyebrowTh: 'กองเรือของเรา' };
  const parsed = recordSchema.parse(section);
  assert.equal(parsed.gallery[0].altTh, 'ดาดฟ้า');
  assert.equal(parsed.mobileImage, section.mobileImage);
  assert.equal(parsed.parentId, 'home');
  assert.equal(recordSchema.safeParse({ ...section, parentId: '' }).success, false);
  assert.equal(recordSchema.safeParse({ ...section, gallery: Array(13).fill(section.gallery[0]) }).success, false);
  assert.equal(recordSchema.safeParse({ ...section, gallery: [{ ...section.gallery[0], url: '' }] }).success, false);
  assert.equal(recordSchema.safeParse({ ...validRecord, image: '' }).success, false);
});

test('new public articles retain supplied dates and never invent a missing date', () => {
  const articles = projectPublicContent([
    { ...validRecord, id: 'undated-news', type: 'News', status: 'Published', revision: 1 },
    { ...validRecord, id: 'dated-news', type: 'News', status: 'Published', revision: 1, date: '2026-10-23' },
  ]).news;
  assert.equal(articles.find(item => item.id === 'undated-news')?.date, undefined);
  assert.equal(articles.find(item => item.id === 'dated-news')?.date, '2026-10-23');
});

test('website settings require bilingual company names and reject unsafe contact links', () => {
  const settings = { companyName: 'MOE Navigation', companyNameTh: 'MOE Navigation', officeAddress: '', officeAddressTh: '', phone: '', email: '', mapUrl: '' };
  assert.equal(saveSettingsSchema.safeParse({ settings, expectedRevision: 0 }).success, true);
  for (const change of [
    { companyNameTh: '' }, { email: 'not-an-email' }, { phone: '<script>' },
    { mapUrl: 'javascript:alert(1)' }, { mapUrl: 'http://maps.example' }, { mapUrl: 'https://user:password@maps.example' },
  ]) assert.equal(saveSettingsSchema.safeParse({ settings: { ...settings, ...change }, expectedRevision: 0 }).success, false);
  assert.equal(saveSettingsSchema.safeParse({ settings, expectedRevision: -1 }).success, false);
});
