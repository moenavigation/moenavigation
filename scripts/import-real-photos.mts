import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { BSON, MongoClient } from 'mongodb';
import { collections, getClient, type ContentDocument } from '../src/server/db';
import { appendAuditEvent, mediaAuditTarget } from '../src/server/audit';
import { contentMediaUrls, hasMediaReferences } from '../src/server/media-references';
import { lockMediaSubmission, uploadMedia } from '../src/server/media';
import { isRetiredMedia, replaceRetiredContentPhotos } from '../src/server/retired-photos';
import { isBundledHomeSlide } from '../src/lib/home-slides';
import { canonical, sha256 } from './lib/recovery';

nextEnv.loadEnvConfig(process.cwd());
const actor = { system: true } as const;
const legacyRelease = {
  owner: 'maintenance:company-photographs', submission: '0a1cc4a1-9632-48d9-91a7-9ad9562edeaf',
  directory: resolve('.local/real-photo-import'),
};
const ownerRelease = {
  owner: 'maintenance:owner-media-20261124', submission: '7843fdb9-8307-4dd9-8d8f-b76d4c0d0447',
  directory: resolve('.local/owner-media-review/import-backups'),
};
const fields = ['image', 'mobileImage', 'imageAlt', 'imageAltTh', 'caption', 'captionTh', 'gallery', 'heroSlides'] as const;
const usage = [
  'Usage: node --conditions=react-server --import tsx scripts/import-real-photos.mts [options]',
  '  No options                  Preview the changes without writing.',
  '  --owner-media               Import the owner’s photo collection and update published content.',
  '  --stage                     Upload missing originals and show the post-stage plan.',
  '  --apply --expected-plan=HASH Apply the reviewed plan in one transaction.',
  '  --help                      Show this help.',
].join('\n');
let client: MongoClient | undefined;
let startedUploader = false;

async function run() {
  const options = parseArgs({ options: {
    stage: { type: 'boolean' }, apply: { type: 'boolean' }, 'owner-media': { type: 'boolean' },
    'expected-plan': { type: 'string' }, help: { type: 'boolean' },
  } });
  const { stage, apply, help, 'owner-media': ownerMode, 'expected-plan': expected } = options.values;
  if (help) { console.log(usage); return; }
  assert(!(stage && apply), 'Choose either --stage or --apply. Stage the photos before applying.');
  assert(expected === undefined || apply, 'Use --expected-plan only with --apply.');
  assert(expected === undefined || /^[0-9a-f]{64}$/.test(expected), 'Pass a 64-character lowercase SHA-256 plan hash.');
  assert(!apply || expected, 'Pass --apply --expected-plan=HASH using the reviewed post-stage plan.');
  const ownerCollection = ownerMode ? await import('./data/owner-media-content') : undefined;
  const { owner, submission, directory } = ownerMode ? ownerRelease : legacyRelease;
  const { MONGODB_URI: uri, MONGODB_DB_NAME: databaseName } = process.env;
  assert(uri && databaseName, 'Configure MONGODB_URI and MONGODB_DB_NAME before running the import.');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  const db = client.db(databaseName);
  const c = collections(db);
  const activeFilter = ownerMode ? { status: 'Published' as const, deletedAt: { $exists: false } } : {};
  const [content, media] = await Promise.all([
    c.content.find(activeFilter).sort({ _id: 1 }).toArray(),
    c.media.find({}).sort({ _id: 1 }).toArray(),
  ]);
  const retired = ownerMode ? [] : media.filter(item => item.state === 'committed' && isRetiredMedia(item));
  const registeredSources = new Map(media.map(item => [item.url, item.sourcePath || item.url]));
  const sourceFor = (url: string) => registeredSources.get(url) ?? url;
  const converted = content.map(record => ownerCollection
    ? ownerCollection.applyOwnerMedia(record, sourceFor)
    : replaceRetiredContentPhotos(record));
  const requestedPaths = ownerCollection?.ownerPhotoPaths ?? converted.flatMap((item, index) => {
    const previous = new Set(contentMediaUrls(content[index]));
    return contentMediaUrls(item).filter(url => url.startsWith('/images/') && !previous.has(url) && !isBundledHomeSlide(url));
  });
  const paths = [...new Set(requestedPaths)].sort();
  const uploads = new Map<string, { id: string; url: string; sha: string }>();
  for (const path of paths) {
    const allowedPath = ownerMode ? /^\/images\/owner-media\/photo-[a-z0-9-]+\.webp$/ : /^\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.webp$/;
    assert(allowedPath.test(path), `Unexpected replacement path: ${path}`);
    const bytes = await readFile(resolve('public', path.slice(1)));
    const sha = sha256(bytes);
    const id = sha256(`${owner}:${submission}:${sha}`);
    const existing = media.find(item => (item._id === id || item.sourceSha256 === sha)
      && !isRetiredMedia(item)
      && (item.state === 'committed' || (item.state === 'staged' && item.owner === owner && item.submissionId === submission)));
    if (existing) {
      uploads.set(path, { id: existing.id, url: existing.url, sha });
      continue;
    }
    if (!stage) {
      uploads.set(path, { id, url: path, sha });
      continue;
    }
    const form = new FormData();
    form.set('submissionId', submission);
    form.set('file', new File([new Uint8Array(bytes)], basename(path), { type: 'image/webp' }));
    startedUploader = true;
    const saved = await uploadMedia(new Request('http://localhost/maintenance/real-photos', { method: 'POST', body: form }), owner);
    uploads.set(path, { id: saved.id, url: saved.url, sha });
  }
  const lookup = (url: string) => uploads.get(url)?.url ?? url;
  const changes = converted.flatMap((item, index) => {
    const before = content[index];
    const after = { ...item, image: lookup(item.image) };
    if (item.mobileImage) after.mobileImage = lookup(item.mobileImage);
    if (item.gallery) after.gallery = item.gallery.map(photo => ({ ...photo, url: lookup(photo.url) }));
    if (item.heroSlides) after.heroSlides = item.heroSlides.map(slide => ({
      ...slide, url: ownerMode && isBundledHomeSlide(slide.url, slide.kind) ? slide.url : lookup(slide.url),
    }));
    const changedFields = fields.filter(field => !isDeepStrictEqual(before[field], after[field]));
    const patch: Partial<ContentDocument> = Object.fromEntries(changedFields.map(field => [field, after[field]]));
    return Object.keys(patch).length ? [{ before, patch }] : [];
  });
  const replacementIds = [...new Set([...uploads.values()].map(asset => asset.id))];
  // A stage run may have created rows after the initial snapshot. Use database state
  // for the summary and preserve replacement order for the subsequent apply-plan hash.
  const replacementRows = stage && replacementIds.length
    ? await c.media.find({ _id: { $in: replacementIds } }).toArray()
    : media;
  const mediaById = new Map(replacementRows.map(item => [item.id, item]));
  const staged = replacementIds.filter(id => mediaById.get(id)?.state === 'staged');
  const registrations = ownerMode ? paths.filter(path => {
    const asset = uploads.get(path)!;
    const item = mediaById.get(asset.id);
    return !item || item.state !== 'committed' || !item.pinned || item.sourceSha256 !== asset.sha || item.sourcePath !== path;
  }) : [];
  const plan = {
    target: sha256(uri + db.databaseName), changes, retired, uploads: [...uploads], staged,
    ...(ownerMode && { collection: owner, registrations }),
  };
  const planHash = sha256(canonical(plan));
  console.log(JSON.stringify({
    mode: stage ? 'stage' : apply ? 'apply' : 'preview', planHash,
    ...(ownerMode && { collection: owner, totalLibraryPhotos: paths.length }),
    content: changes.map(change => change.before._id), retire: retired.map(item => item.title), replacements: ownerMode ? registrations : paths,
    awaitingUpload: [...uploads.values()].filter(asset => asset.url.startsWith('/')).length, staged: staged.length,
  }, null, 2));
  if (!apply || !(changes.length || retired.length || staged.length || registrations.length)) return;
  assert.equal(expected, planHash, 'Review the post-stage plan before applying.');
  assert([...uploads.values()].every(asset => asset.url.startsWith('https://')), 'Stage the replacement photos first.');
  // Verify the delivered original against the file we reviewed, before changing any references.
  for (const { url, sha } of uploads.values()) {
    assert.equal(new URL(url).hostname, 'res.cloudinary.com', 'The replacement must be delivered by Cloudinary.');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert(response.ok && sha256(Buffer.from(await response.arrayBuffer())) === sha, 'Delivery verification failed');
  }
  await mkdir(directory, { recursive: true });
  const backup = resolve(directory, `before-${Date.now()}.json`);
  const changedUrls = new Set(changes.flatMap(change => contentMediaUrls({ ...change.before, ...change.patch })));
  const transactionAssets = [...uploads].filter(([path, asset]) =>
    !ownerMode || registrations.includes(path) || changedUrls.has(asset.url));
  const touchedMedia = new Set(transactionAssets.map(([, asset]) => asset.id));
  const before = {
    planHash, content: changes.map(change => change.before),
    media: media.filter(item => retired.includes(item) || touchedMedia.has(item.id)),
  };
  await writeFile(backup, BSON.EJSON.stringify(before, { relaxed: false }), { flag: 'wx', mode: 0o600 });
  await client.withSession(session => session.withTransaction(async () => {
    const now = new Date();
    if (staged.length) await lockMediaSubmission(db, session, owner, submission);
    for (const [sourcePath, asset] of transactionAssets) {
      const item = await c.media.findOne({ _id: asset.id, url: asset.url }, { session });
      assert(item && (item.state === 'committed' || (item.state === 'staged' && item.owner === owner && item.submissionId === submission)), 'The replacement file is no longer available for this import.');
      await c.media.updateOne({ _id: item.id }, {
        $set: { state: 'committed', pinned: true, touchedAt: now, sourceSha256: asset.sha, sourcePath },
      }, { session });
      if (item.state === 'staged') {
        await appendAuditEvent(db, session, { action: 'media.uploaded', actor, target: mediaAuditTarget(item) });
      }
    }
    for (const { before, patch } of changes) {
      const result = await c.content.updateOne({ _id: before._id, revision: before.revision, ...activeFilter }, {
        $set: { ...patch, updatedAt: now.toISOString() }, $inc: { revision: 1 },
      }, { session });
      assert.equal(result.matchedCount, 1, 'Concurrent content edit');
      await appendAuditEvent(db, session, { action: 'content.updated', actor, target: { type: before.type, id: before.id, label: before.title } });
    }
    for (const item of retired) {
      assert(!await hasMediaReferences(db, item.url, session), `Retained reference to ${item.title}`);
      const result = await c.media.updateOne({ _id: item.id, state: 'committed', touchedAt: item.touchedAt }, {
        $set: { state: 'trashed', trashedAt: now.toISOString(), touchedAt: now },
      }, { session });
      assert.equal(result.matchedCount, 1, 'Concurrent library edit');
      await appendAuditEvent(db, session, { action: 'media.trashed', actor, target: mediaAuditTarget(item) });
    }
  }));
  for (const { before, patch } of changes) {
    const saved = await c.content.findOne({ _id: before._id });
    assert(saved && saved.revision === before.revision + 1
      && Object.entries(patch).every(([key, value]) => isDeepStrictEqual(saved[key as keyof ContentDocument], value)), `Saved photo fields differ for ${before._id}.`);
  }
  if (ownerMode) {
    const saved = await c.media.find({ _id: { $in: replacementIds }, state: 'committed', pinned: true }).toArray();
    const byId = new Map(saved.map(item => [item.id, item]));
    for (const [path, asset] of uploads) {
      const item = byId.get(asset.id);
      assert(item && item.url === asset.url && item.sourceSha256 === asset.sha && item.sourcePath === path, `Library registration differs for ${path}.`);
    }
  }
  console.log(JSON.stringify({ verified: changes.length, trashed: retired.length, ...(ownerMode && { verifiedLibraryPhotos: paths.length }), backup }));
}

try {
  await run();
} catch (error) {
  if (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')) {
    console.error(`${error.message}\n${usage}`);
  } else {
    console.error(error instanceof assert.AssertionError ? error.message : `Photo import stopped (${error instanceof Error ? error.name : 'error'})`);
  }
  process.exitCode = 1;
} finally {
  await client?.close();
  if (startedUploader) await getClient().then(connection => connection.close()).catch(() => {});
}
