import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getPublishedRecords } from './content';
import { getSiteSettings } from './settings';
import { PUBLIC_CACHE_SECONDS, PUBLIC_CONTENT_TAG } from './public-cache';
import type { ContentRecord } from '@/lib/cms-types';

// Use the existing Next cache model; migrating the entire app to Cache
// Components is independent of caching these public reads. Include the data
// source identity, and isolate each ephemeral test run from persisted caches.
const scope = [process.env.MONGODB_DB_NAME || '', process.env.NEXT_PUBLIC_SITE_URL || '', process.env.MOE_E2E_OWNER || ''];
const options = { tags: [PUBLIC_CONTENT_TAG], revalidate: PUBLIC_CACHE_SECONDS };
// Refresh snapshots after the reviewed Thai copy update applied outside CMS saves.
export const getPublicRecords = cache(unstable_cache(getPublishedRecords, ['public-records-v2', ...scope], options));
export const getPublicSettings = cache(unstable_cache(getSiteSettings, ['public-settings-v1', ...scope], options));

export const getPublicRecord = cache(async (type: ContentRecord['type'], id: string) =>
  (await getPublicRecords()).find(record => record.type === type && record.id === id) || null);
