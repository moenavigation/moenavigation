import nextEnv from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryVariables, configurationChecks, contactReadiness, contentReadiness, emailReadiness, mongoVariables, populated, releaseReport, type ReleaseRecord } from './release-checks';

nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes('--live');
const checks = configurationChecks(process.env);
let recipients: ReleaseRecord | null | undefined;
if (live) {
  if (populated(process.env, mongoVariables)) {
    let client: MongoClient | undefined;
    try {
      // Deliberately bypass application getDb/collections: those initialize indexes.
      // Only ping/find operations are allowed against the configured database.
      client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000, socketTimeoutMS: 15_000 });
      await client.connect();
      const db = client.db(process.env.MONGODB_DB_NAME);
      await db.command({ ping: 1 }, { timeoutMS: 10_000 });
      checks.push({ name: 'MongoDB connectivity', status: 'pass', detail: 'Read-only connection succeeded. No indexes, setup, migrations or writes were performed.' });
      const settings = db.collection<ReleaseRecord & { _id: string }>('moe_settings');
      recipients = await settings.findOne({ _id: 'enquiry-email-recipients' }, { projection: { _id: 0, recipients: 1, revision: 1 }, maxTimeMS: 10_000 });
      const company = await settings.findOne({ _id: 'website' }, { projection: { _id: 0, companyName: 1, companyNameTh: 1, officeAddress: 1, officeAddressTh: 1, phone: 1, email: 1 }, maxTimeMS: 10_000 });
      checks.push(contactReadiness(company));
      const records = await db.collection('moe_content').find({ status: 'Published', deletedAt: { $exists: false } }, { projection: {
        _id: 0, type: 1, id: 1, vesselSpecs: 1, title: 1, titleTh: 1, description: 1, descriptionTh: 1, body: 1, bodyTh: 1,
        eyebrow: 1, eyebrowTh: 1, bodyHeading: 1, bodyHeadingTh: 1, category: 1, categoryTh: 1, caption: 1, captionTh: 1,
        imageAlt: 1, imageAltTh: 1, image: 1, mobileImage: 1, gallery: 1,
      }, maxTimeMS: 10_000 }).toArray();
      const media = await db.collection('moe_media').find({}, { projection: { _id: 0, state: 1, url: 1, trashedAt: 1 }, maxTimeMS: 10_000 }).toArray();
      checks.push(...contentReadiness(records, media));
    } catch {
      checks.push({ name: 'MongoDB live checks', status: 'blocked', detail: 'A read-only database check could not complete. Provider messages, credentials and private data are omitted.' });
    } finally { await client?.close(); }
  } else checks.push({ name: 'MongoDB connectivity', status: 'blocked', detail: 'Database configuration is incomplete; no connection was attempted.' });

  if (populated(process.env, cloudinaryVariables)) {
    try {
      await cloudinary.api.ping({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true, timeout: 10_000 });
      checks.push({ name: 'Cloudinary connectivity', status: 'pass', detail: 'Read-only provider authentication succeeded. No assets were uploaded, changed or deleted.' });
    } catch {
      checks.push({ name: 'Cloudinary connectivity', status: 'blocked', detail: 'The read-only provider ping could not complete. Provider messages and credentials are omitted.' });
    }
  } else checks.push({ name: 'Cloudinary connectivity', status: 'blocked', detail: 'Provider configuration is incomplete; no connection was attempted.' });
} else checks.push({ name: 'Live checks', status: 'review', detail: 'Use --live for read-only database, content and provider checks.' });
checks.push(emailReadiness(process.env, recipients));
const report = releaseReport(checks, live);
await mkdir('.local/release', { recursive: true });
await writeFile('.local/release/readiness.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (checks.some(item => item.status === 'blocked')) process.exitCode = 1;
