import { z } from 'zod';
import { enquiryRecipientList } from '../src/lib/enquiry-email';
import { indexingEnabled, publicHttpsOrigin } from '../src/lib/site-config';
import { isBundledHomeSlide } from '../src/lib/home-slides';

export type ReleaseCheck = { name: string; status: 'pass' | 'blocked' | 'review'; detail: string };
type Environment = Readonly<Record<string, string | undefined>>;
export type ReleaseRecord = Record<string, unknown>;
export const mongoVariables = ['MONGODB_URI', 'MONGODB_DB_NAME'] as const;
export const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
export const populated = (env: Environment, names: readonly string[]) => names.every(name => Boolean(env[name]?.trim()));
const result = (name: string, okay: boolean, detail: string, failure: 'blocked' | 'review' = 'blocked'): ReleaseCheck => ({ name, status: okay ? 'pass' : failure, detail });

export function configurationChecks(env: Environment): ReleaseCheck[] {
  const required = [...mongoVariables, ...cloudinaryVariables];
  const missing = required.filter(name => !env[name]?.trim());
  return [
    result('Server configuration', missing.length === 0, missing.length ? `Missing variables: ${missing.join(', ')}` : 'Required server variables are present; values are not printed.'),
    result('Public HTTPS origin', publicHttpsOrigin(env.NEXT_PUBLIC_SITE_URL || ''), 'Checks origin syntax only. Domain ownership, DNS, certificate and the deployed site need independent verification.'),
    result('Business content approval', env.SITE_CONTENT_APPROVED === 'true', 'Checks the configured approval flag only; it cannot independently verify owner approval or the accuracy of company facts and media.'),
    result('Production search indexing', indexingEnabled(env), 'Checks launch flags and this process runtime only. Confirm deployed production indexing separately; previews must remain excluded.', 'review'),
  ];
}

/** undefined means unread; null means MongoDB confirmed that no saved list exists. */
export function emailReadiness(env: Environment, recipientDocument?: ReleaseRecord | null): ReleaseCheck {
  const apiKey = env.RESEND_API_KEY?.trim() || '';
  const sender = env.ENQUIRY_EMAIL_FROM?.trim() || '';
  const serverReady = apiKey.length > 0 && apiKey.length <= 2048 && /^[\x21-\x7e]+$/.test(apiKey) && z.email().max(254).safeParse(sender).success;
  const serverDetail = serverReady ? 'Provider key and sender syntax are valid.' : 'Provider key or sender is missing or invalid.';
  if (recipientDocument === undefined) return result('Email configuration', false, `${serverDetail} CMS recipients have not been read; a successful --live database check is required. A legacy recipient variable cannot prove the saved list is configured.`, 'review');
  let count = 0;
  if (recipientDocument === null) {
    const legacy = env.ENQUIRY_EMAIL_TO?.trim() || '';
    count = z.email().max(254).safeParse(legacy).success ? 1 : 0;
  } else {
    const recipients = enquiryRecipientList.safeParse(recipientDocument.recipients);
    if (!recipients.success || !Number.isSafeInteger(recipientDocument.revision) || Number(recipientDocument.revision) < 1) return result('Email configuration', false, `${serverDetail} The saved CMS recipient list is invalid; delivery is blocked.`, 'review');
    count = recipients.data.length;
    if (!count) return result('Email configuration', false, `${serverDetail} The saved CMS recipient list is empty; notifications are intentionally paused.`, 'review');
  }
  return result('Email configuration', serverReady && count > 0, `${serverDetail} ${count} recipient(s) configured using ${recipientDocument === null ? 'the legacy server fallback' : 'the saved CMS list'}. Provider authentication, domain verification and actual receipt have not been checked.`, 'review');
}

export function contactReadiness(settings: ReleaseRecord | null): ReleaseCheck {
  const missing = (fields: string[]) => fields.filter(name => typeof settings?.[name] !== 'string' || !String(settings[name]).trim());
  const required = missing(['companyName', 'companyNameTh']);
  if (required.length) return result('Company contact details', false, `Missing required company fields: ${required.join(', ')}`);
  const optional = missing(['officeAddress', 'officeAddressTh', 'phone', 'email']);
  return result('Company contact details', optional.length === 0, optional.length
    ? `Optional contact fields awaiting owner confirmation: ${optional.join(', ')}. Confirm which contact methods should be public; optional fields may remain blank until verified.`
    : 'Company contact fields are populated; the owner must still approve their accuracy.', 'review');
}

export function contentReadiness(records: readonly ReleaseRecord[], media: readonly ReleaseRecord[]): ReleaseCheck[] {
  const core = ['home', 'about', 'services', 'fleet', 'routes', 'projects', 'news', 'contact', 'privacy'];
  const missingPages = core.filter(id => !records.some(record => record.type === 'Page' && record.id === id));
  const vessels = records.filter(record => record.type === 'Vessel');
  const noSpecs = vessels.filter(record => !record.vesselSpecs || typeof record.vesselSpecs !== 'object' || !Object.values(record.vesselSpecs).some(value => value !== null && value !== undefined && String(value).trim() !== ''));
  const provisionalPattern = /\b(?:demo|sample|illustrative|preview|placeholder|not verified|not a photograph)\b|ตัวอย่าง|ภาพประกอบ|ยังต้องได้รับการตรวจสอบ/i;
  const gallery = (record: ReleaseRecord) => Array.isArray(record.gallery) ? record.gallery.filter((image): image is ReleaseRecord => Boolean(image) && typeof image === 'object') : [];
  const slides = (record: ReleaseRecord) => Array.isArray(record.heroSlides) ? record.heroSlides.filter((image): image is ReleaseRecord => Boolean(image) && typeof image === 'object') : [];
  const provisional = records.filter(record => provisionalPattern.test([
    record.title, record.titleTh, record.description, record.descriptionTh, record.body, record.bodyTh,
    record.eyebrow, record.eyebrowTh, record.bodyHeading, record.bodyHeadingTh,
    record.category, record.categoryTh, record.caption, record.captionTh, record.imageAlt, record.imageAltTh,
    ...gallery(record).flatMap(image => [image.alt, image.altTh]),
    ...slides(record).flatMap(image => [image.alt, image.altTh]),
  ].join(' ')));
  const urls = new Set(media.filter(item => item.state === 'committed' && !item.trashedAt).map(item => item.url));
  const references = records.flatMap(record => [record.image, record.mobileImage, ...gallery(record).map(image => image.url), ...slides(record).filter(image => !(record.type === 'Page' && record.id === 'home' && typeof image.url === 'string' && isBundledHomeSlide(image.url))).map(image => image.url)]).filter(Boolean);
  const unfinished = media.filter(item => ['uploading', 'staged', 'deleting'].includes(String(item.state)) && !item.trashedAt);
  const failedTrash = media.filter(item => item.state === 'deleting' && Boolean(item.trashedAt));
  return [
    result('Core pages', missingPages.length === 0, missingPages.length ? `Missing public pages: ${missingPages.join(', ')}` : 'All nine core pages are public.'),
    result('Vessel specification review', vessels.length > 0 && noSpecs.length === 0, `${noSpecs.length} of ${vessels.length} public vessels have no populated specifications. Supply verified values where available; never invent missing numbers.`, 'review'),
    result('Provisional content review', provisional.length === 0, provisional.length ? `${provisional.length} public records contain wording that needs editorial review. Text matching cannot replace owner approval.` : 'No explicit provisional wording found. Owner approval is still required for facts and media.', 'review'),
    result('Registered content images', references.every(url => urls.has(url)), `${references.length} public image references checked against available committed media. This does not fetch image files from the provider.`),
    result('Pending upload cleanup', unfinished.length === 0, `${unfinished.length} unfinished upload records. Healthy retained Media Trash is excluded.`, 'review'),
    result('Media Trash deletion review', failedTrash.length === 0, `${failedTrash.length} retained image deletions need review or retry. No cleanup was performed.`, 'review'),
  ];
}

export function releaseReport(checks: ReleaseCheck[], live: boolean, now = new Date()) {
  return {
    checkedAt: now.toISOString(), mode: live ? 'read-only-live' : 'configuration-only',
    // This script cannot establish the external deployment/recovery evidence.
    ready: false, automatedChecksPassed: checks.every(item => item.status === 'pass'), checks,
    requiresExternalVerification: [
      'Domain ownership, DNS, HTTPS and the deployed site',
      'Hosting environment variables, production indexing and platform limits',
      'Atlas backup policy and restore retention',
      'Independent secure storage of encrypted backup and recovery key',
      'Verified email sender, authentication alignment and received notification',
      'Deployed bilingual mobile/browser checks',
    ],
  };
}
