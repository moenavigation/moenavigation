import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { hasMediaReferences, userMediaReferenceFilter } from '../src/server/media-references';

const picture = 'https://res.cloudinary.com/test/image/upload/profile.webp';

function database(contentUsed: boolean, users: { avatar?: string; deletedAt?: Date; purgeAt?: Date }[]) {
  const queries: { collection: string; filter: unknown; options: unknown }[] = [];
  const db = { collection: (collection: string) => ({
    findOne: async (filter: { avatar?: string }, options: unknown) => {
      queries.push({ collection, filter, options });
      if (collection === 'moe_content') return contentUsed ? { _id: 'News:one' } : null;
      if (collection === 'moe_users') return users.some(user => user.avatar === filter.avatar) ? { _id: 'user-one' } : null;
      throw new Error(`Unexpected collection ${collection}`);
    },
  }) } as unknown as Db;
  return { db, queries };
}

test('profile references match exact URLs without excluding Trash accounts', () => {
  assert.deepEqual(userMediaReferenceFilter(picture), { avatar: picture });
  assert.deepEqual(userMediaReferenceFilter('https://example.test/[literal].*'), { avatar: 'https://example.test/[literal].*' });
});

test('saved content references stop deletion before querying accounts', async () => {
  const { db, queries } = database(true, []);
  assert.equal(await hasMediaReferences(db, picture), true);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].collection, 'moe_content');
});

test('active and retained Trash accounts protect profile images in the same transaction', async () => {
  const session = {} as ClientSession;
  for (const retained of [{ avatar: picture }, { avatar: picture, deletedAt: new Date() }, { avatar: picture, deletedAt: new Date(0), purgeAt: new Date(1) }]) {
    const { db, queries } = database(false, [retained]);
    assert.equal(await hasMediaReferences(db, picture, session), true);
    assert.deepEqual(queries.map(query => query.collection), ['moe_content', 'moe_users']);
    for (const query of queries) assert.deepEqual(query.options, { projection: { _id: 1 }, session });
    assert.deepEqual(queries[1].filter, { avatar: picture });
  }
});

test('unreferenced images and empty fields do not become protected by unrelated accounts', async () => {
  const { db, queries } = database(false, [{ avatar: 'https://example.test/other.webp' }, {}]);
  assert.equal(await hasMediaReferences(db, picture), false);
  queries.length = 0;
  assert.equal(await hasMediaReferences(db, ''), false);
  assert.deepEqual(queries, []);
});
