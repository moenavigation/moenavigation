import { randomUUID } from 'node:crypto';
import { request as apiRequest } from '@playwright/test';
import { test, expect, E2E_ADMIN, E2E_BASE_URL, E2E_IMAGE_ORIGIN, loginChallengeData } from './fixtures';
import type { UserDocument, MediaDocument, ContentDocument } from '../../src/server/db';

for (const role of ['Operator', 'Admin', 'Dev'] as const) {
  test(`${role} cleanup respects unfinished-upload ownership while retaining references and shared saved-image Trash`, async ({ db }) => {
    const users = db.collection<UserDocument>('moe_users');
    const original = await users.findOne({ _id: E2E_ADMIN.id });
    expect(original).not.toBeNull();
    const actor = { ...original!, _id: randomUUID(), username: `audit-cleanup-${role.toLowerCase()}`, role };
    const other = { ...original!, _id: randomUUID(), username: 'audit-cleanup-other', role: 'Admin' as const };
    await users.insertMany([actor, other]);
    const media = db.collection<MediaDocument>('moe_media');
    const image = (suffix: string, owner: string, state: 'staged' | 'committed'): MediaDocument => ({
      _id: `audit-${suffix}`, id: `audit-${suffix}`, title: `Audit ${suffix}`, url: `${E2E_IMAGE_ORIGIN}v1/audit-${suffix}.png`,
      publicId: `moe-e2e/audit-${suffix}`, state, owner, submissionId: randomUUID(), pinned: state === 'committed',
      touchedAt: new Date(0), createdAt: new Date(0).toISOString(),
    });
    const own = image('own-abandoned', actor._id, 'staged');
    const foreign = image('other-abandoned', other._id, 'staged');
    const referenced = image('referenced-abandoned', actor._id, 'staged');
    const saved = image('shared-unused-saved', other._id, 'committed');
    await media.insertMany([own, foreign, referenced, saved]);
    await db.collection<ContentDocument>('moe_content').updateOne({ type: 'News' }, { $set: { image: referenced.url } });
    const client = await apiRequest.newContext({ baseURL: E2E_BASE_URL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: E2E_BASE_URL } });
    try {
      const signIn = await client.post('/api/cms/login', { data: { username: actor.username, password: E2E_ADMIN.password, ...await loginChallengeData(client) } });
      expect(signIn.status(), await signIn.text()).toBe(200);
      const response = await client.post('/api/cms/media/cleanup', { data: {} });
      expect(response.status(), await response.text()).toBe(200);
      expect(await media.findOne({ _id: own._id })).toMatchObject({ state: 'deleting', owner: actor._id });
      expect(await media.findOne({ _id: foreign._id })).toMatchObject({ state: role === 'Operator' ? 'staged' : 'deleting', owner: other._id });
      expect(await media.findOne({ _id: referenced._id })).toMatchObject({ state: 'staged', url: referenced.url });
      expect(await media.findOne({ _id: saved._id })).toMatchObject({ state: 'trashed', trashedAt: expect.any(String) });
    } finally { await client.dispose(); }
  });
}
