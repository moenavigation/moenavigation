import { z } from 'zod';
import { contentTypes, corePageIds } from '@/lib/cms-types';
import { contactFieldLimits } from '@/lib/contact-draft';
import { isContactEmail } from '@/lib/contact-validation';
import { MAX_HOME_SLIDES, MAX_HOME_SLIDE_INTERVAL, MIN_HOME_SLIDE_INTERVAL } from '@/lib/home-slides';

export const submissionSchema = z.string().uuid();
export const idSchema = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');
const optionalText = (max: number) => z.string().trim().max(max).optional().default('');
const optionalSpecText = (max: number) => z.string().trim().max(max).optional().transform(value => value || undefined);
// Existing IMO ship numbers use six digits followed by a weighted check digit.
// https://www.imo.org/en/ourwork/iiis/pages/imo-identification-number-schemes.aspx
const imoSchema = z.string().trim().refine(value => !value || (/^[1-9]\d{6}$/.test(value) && [...value.slice(0, 6)].reduce((sum, digit, index) => sum + Number(digit) * (7 - index), 0) % 10 === Number(value[6])), 'Enter the seven-digit IMO ship number with its correct check digit.').optional().transform(value => value || undefined);
export const vesselSpecsSchema = z.object({
  imo: imoSchema,
  yearBuilt: z.number().int().min(1800).max(new Date().getUTCFullYear(), 'Use the actual completed build year.').optional(),
  lengthM: z.number().positive().max(1000).optional(),
  beamM: z.number().positive().max(500).optional(),
  draftM: z.number().positive().max(100).optional(),
  deadweightT: z.number().positive().max(2000000).optional(),
  capacityTeu: z.number().int().nonnegative().max(100000).optional(),
  flag: optionalSpecText(100), flagTh: optionalSpecText(100),
  availability: optionalSpecText(200), availabilityTh: optionalSpecText(200),
}).superRefine((specs, context) => {
  if (specs.lengthM !== undefined && specs.beamM !== undefined && specs.beamM > specs.lengthM) context.addIssue({ code: 'custom', path: ['beamM'], message: 'Beam cannot exceed the vessel length.' });
  for (const [english, thai] of [['flag', 'flagTh'], ['availability', 'availabilityTh']] as const) {
    if (Boolean(specs[english]) !== Boolean(specs[thai])) context.addIssue({ code: 'custom', path: [specs[english] ? thai : english], message: 'Provide both English and Thai text, or leave both blank.' });
  }
});
const portSchema = z.object({ name: z.string().trim().min(1).max(150), nameTh: z.string().trim().min(1).max(150), country: z.string().trim().min(1).max(100), countryTh: z.string().trim().min(1).max(100) });
const dateSchema = z.string().refine(value => {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.').optional().default('');
const homeSlidesSchema = z.array(z.object({
  url: z.string().trim().min(1).max(1500), alt: z.string().trim().max(250), altTh: z.string().trim().max(250),
})).min(1, 'Keep at least one slide.').max(MAX_HOME_SLIDES).refine(slides => new Set(slides.map(slide => slide.url)).size === slides.length, 'Choose each image only once.');
const homeSlideIntervalSchema = z.number().int().min(MIN_HOME_SLIDE_INTERVAL).max(MAX_HOME_SLIDE_INTERVAL);
export const saveHomeSlidesSchema = z.strictObject({
  slides: homeSlidesSchema,
  intervalSeconds: homeSlideIntervalSchema,
  expectedRevision: z.number().int().positive(),
  submissionId: submissionSchema,
});
export const recordSchema = z.object({
  id: idSchema, type: z.enum(contentTypes),
  title: z.string().trim().min(1).max(200), titleTh: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000), descriptionTh: z.string().trim().max(2000),
  image: z.string().max(1500), category: z.string().trim().min(1).max(100), categoryTh: optionalText(100),
  status: z.enum(['Published', 'Draft']), body: optionalText(30000), bodyTh: optionalText(30000),
  date: dateSchema, imageAlt: optionalText(250), imageAltTh: optionalText(250),
  parentId: z.union([z.literal(''), idSchema]).optional().default(''), order: z.number().int().min(0).max(10000).optional().default(0),
  eyebrow: optionalText(160), eyebrowTh: optionalText(160), icon: z.string().regex(/^[A-Za-z0-9]*$/).max(50).optional().default(''),
  caption: optionalText(200), captionTh: optionalText(200),
  mobileImage: optionalText(1500), gallery: z.array(z.object({ url: z.string().min(1).max(1500), alt: z.string().trim().max(250), altTh: z.string().trim().max(250) })).max(12).optional().default([]),
  heroSlides: homeSlidesSchema.optional(), heroSlideInterval: homeSlideIntervalSchema.optional(),
  bodyHeading: optionalText(200), bodyHeadingTh: optionalText(200),
  origin: portSchema.optional(), destination: portSchema.optional(),
  waypoints: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).max(100).optional().default([]),
  vesselSpecs: vesselSpecsSchema.optional(),
}).superRefine((record, context) => {
  if ((record.heroSlides !== undefined || record.heroSlideInterval !== undefined) && (record.type !== 'Page' || record.id !== 'home')) context.addIssue({ code: 'custom', path: ['heroSlides'], message: 'Homepage slides belong to the home page only.' });
  if (record.type !== 'Vessel' && record.vesselSpecs && Object.values(record.vesselSpecs).some(value => value !== undefined)) context.addIssue({ code: 'custom', path: ['vesselSpecs'], message: 'Vessel specifications belong to fleet records only.' });
  if (record.type !== 'Section') {
    if (!record.description) context.addIssue({ code: 'custom', path: ['description'], message: 'Enter an English summary.' });
    if (!record.descriptionTh) context.addIssue({ code: 'custom', path: ['descriptionTh'], message: 'Enter a Thai summary.' });
  }
  if (record.type === 'Page' && ['en','th','cms','api','sitemap','robots'].includes(record.id)) {
    context.addIssue({ code: 'custom', path: ['id'], message: 'This address is reserved for an existing website section.' });
  }
  if (record.type === 'Page' && (corePageIds as readonly string[]).includes(record.id) && record.status !== 'Published') {
    context.addIssue({ code: 'custom', path: ['status'], message: 'This core page must remain published.' });
  }
  // These fixed page layouts display text and collection images, without a page image slot.
  const pageWithoutImage = record.type === 'Page' && ['services', 'fleet', 'routes', 'projects', 'news', 'privacy'].includes(record.id);
  if (!record.image && record.type !== 'Vessel' && record.type !== 'Section' && !pageWithoutImage) context.addIssue({ code: 'custom', path: ['image'], message: 'Choose an image for this content.' });
  if (record.type === 'Section' && !record.parentId) context.addIssue({ code: 'custom', path: ['parentId'], message: 'Choose the page this section belongs to.' });
  if (record.waypoints.length === 1 || (record.waypoints.length > 0 && (!record.origin || !record.destination))) context.addIssue({ code: 'custom', path: ['waypoints'], message: 'Mapped routes need both ports and at least two coordinates.' });
});

export const saveSchema = z.object({ record: recordSchema, expectedRevision: z.number().int().positive().nullable(), submissionId: submissionSchema });
export const actionSchema = z.object({ id: idSchema, type: z.enum(contentTypes), expectedRevision: z.number().int().positive(), action: z.enum(['trash', 'restore']) });
export const loginSchema = z.object({ username: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9@._-]+$/), password: z.string().min(1).max(200), challengeId: z.string().regex(/^[a-f0-9]{48}$/), challengePosition: z.number().int().min(0).max(100) });
export const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(14, 'Use at least 14 characters.').max(200) });
export const enquirySchema = z.object({
  name: z.string().trim().min(2).max(contactFieldLimits.name), email: z.string().trim().toLowerCase().refine(isContactEmail, 'Enter a valid email address.').max(contactFieldLimits.email), company: optionalText(contactFieldLimits.company),
  subject: z.string().trim().min(2).max(contactFieldLimits.subject), message: z.string().trim().min(10).max(contactFieldLimits.message),
  locale: z.enum(['en','th']), consent: z.literal(true), submissionId: submissionSchema, website: z.string().max(0).optional().default(''),
});
export const inboxSchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive(), status: z.enum(['New','In progress','Resolved']) });
export const siteSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(150), companyNameTh: z.string().trim().min(1).max(150),
  officeAddress: z.string().trim().max(1000), officeAddressTh: z.string().trim().max(1000),
  phone: z.string().trim().max(40).refine(value => !value || /^\+?[0-9() .-]{5,40}$/.test(value), 'Enter a valid phone number, including the country code if applicable.'),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]),
  mapUrl: z.string().trim().max(1500).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }, 'Use a complete HTTPS map link.'),
});
export const saveSettingsSchema = z.object({ settings: siteSettingsSchema, expectedRevision: z.number().int().nonnegative() });
