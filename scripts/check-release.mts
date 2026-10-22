import nextEnv from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { indexingEnabled, publicHttpsOrigin } from '../src/lib/site-config';

nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes('--live');
const checks: { name: string; status: 'pass' | 'blocked' | 'review'; detail: string }[] = [];
const check = (name: string, okay: boolean, detail: string, failure: 'blocked' | 'review' = 'blocked') => checks.push({ name, status: okay ? 'pass' : failure, detail });
const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
check('Server configuration', required.every(name => Boolean(process.env[name])), required.every(name => Boolean(process.env[name])) ? 'Required server variables are present; values are not printed.' : `Missing variables: ${required.filter(name => !process.env[name]).join(', ')}`);
check('Public HTTPS origin', publicHttpsOrigin(process.env.NEXT_PUBLIC_SITE_URL || ''), 'A verified public HTTPS origin is required before launch.');
check('Business content approval', process.env.SITE_CONTENT_APPROVED === 'true', 'The owner must approve company facts, images, route descriptions and privacy content.');
check('Production search indexing', indexingEnabled(), 'Indexing requires both launch flags, production runtime and a public HTTPS origin. It remains disabled in previews.', 'review');
check('Email configuration', Boolean(process.env.RESEND_API_KEY && process.env.ENQUIRY_EMAIL_FROM && process.env.ENQUIRY_EMAIL_TO), 'Notifications require a provider key, verified sender and destination. Confirm actual delivery separately.', 'review');
let client: MongoClient | undefined;
if (live) {
  try {
    if (!required.every(name => Boolean(process.env[name]))) throw new Error('ConfigurationMissing');
    client = await new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 }).connect();
    const db = client.db(process.env.MONGODB_DB_NAME);
    await db.command({ ping: 1 }); check('MongoDB connectivity', true, 'Read-only connection succeeded.');
    const settings = await db.collection('moe_settings').findOne({ _id: 'website' as never });
    const requiredContactFields = ['companyName', 'companyNameTh', 'officeAddress', 'officeAddressTh', 'phone', 'email'];
    const missingContacts = requiredContactFields.filter(name => !String(settings?.[name] || '').trim());
    check('Company contact details', missingContacts.length === 0, missingContacts.length ? `Missing fields: ${missingContacts.join(', ')}` : 'Company contact fields are populated; owner still needs to approve accuracy.');
    const records = await db.collection('moe_content').find({ status: 'Published', deletedAt: { $exists: false } }).toArray();
    const core = ['home', 'about', 'services', 'fleet', 'routes', 'projects', 'news', 'contact', 'privacy'];
    const missingPages = core.filter(id => !records.some(record => record.type === 'Page' && record.id === id));
    check('Core pages', missingPages.length === 0, missingPages.length ? `Missing published pages: ${missingPages.join(', ')}` : 'All nine core pages are published.');
    const vessels = records.filter(record => record.type === 'Vessel');
    const noSpecs = vessels.filter(record => !record.vesselSpecs || Object.keys(record.vesselSpecs).length === 0);
    check('Vessel specification review', vessels.length > 0 && noSpecs.length === 0, `${noSpecs.length} of ${vessels.length} published vessels have no specifications. Supply verified values where available; never invent missing numbers.`, 'review');
    const provisional = records.filter(record => /illustrative|pending verification|demonstration|placeholder/i.test([record.title, record.description, record.body, record.caption].join(' ')));
    check('Provisional content review', provisional.length === 0, `${provisional.length} published records contain explicit provisional wording. Review business accuracy before approval.`, 'review');
    const media = await db.collection('moe_media').find().toArray(), urls = new Set(media.filter(item => item.state === 'committed').map(item => item.url));
    const references = records.flatMap(record => [record.image, record.mobileImage, ...(record.gallery || []).map((image: { url: string }) => image.url)]).filter(Boolean);
    check('Registered content images', references.every(url => urls.has(url)), `${references.length} published image references checked against committed media.`);
    check('Pending upload cleanup', media.every(item => item.state === 'committed'), `${media.filter(item => item.state !== 'committed').length} unfinished upload records. Review CMS Cleanup before backup.`, 'review');
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    await cloudinary.api.ping(); check('Cloudinary connectivity', true, 'Read-only provider authentication succeeded.');
  } catch (error) {
    check('Live checks', false, `A live check failed (${error instanceof Error ? error.name : 'ProviderError'}). No secrets or customer data are included.`);
  } finally { await client?.close(); }
} else checks.push({ name: 'Live checks', status: 'review', detail: 'Use --live for read-only database, content and provider checks.' });
const report = { checkedAt: new Date().toISOString(), mode: live ? 'read-only-live' : 'configuration-only', ready: checks.every(item => item.status === 'pass'), checks, requiresExternalVerification: ['Domain ownership and HTTPS', 'Hosting environment variables and platform limits', 'Atlas backup policy and restore retention', 'Independent secure storage of encrypted backup and recovery key', 'Verified email sender and received notification', 'Deployed bilingual mobile/browser checks'] };
await mkdir('.local/release', { recursive: true });
await writeFile('.local/release/readiness.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (checks.some(item => item.status === 'blocked')) process.exitCode = 1;
