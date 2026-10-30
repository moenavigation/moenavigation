import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { cmsRoles, canManageUser, type CmsRole } from '../src/lib/cms-roles';
import { digest, publicUser } from '../src/server/auth';
import type { MediaDocument, UserDocument } from '../src/server/db';
import { HttpError } from '../src/server/http';
import { updateUserProfileInTransaction, userProfileInput } from '../src/server/users';

type Row = Record<string, unknown> & { _id: string };
type Filter = Record<string, unknown>;
type Change = { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown>; $unset?: Record<string, unknown>; $inc?: Record<string, number> };
const session = {} as ClientSession;
const account = (role: CmsRole): UserDocument => ({ _id: randomUUID(), username: role.toLowerCase(), role, passwordHash: 'existing-hash', passwordVersion: 1, createdAt: new Date() });
const photo = (owner: string, submissionId: string, state: MediaDocument['state'] = 'committed'): MediaDocument => {
  const id = randomUUID();
  return { _id: id, id, title: 'Profile photo', url: `https://res.cloudinary.com/example/image/upload/${id}.webp`, state, owner, submissionId, pinned: false, touchedAt: new Date('2020-01-01T00:00:00Z'), createdAt: new Date().toISOString() };
};
const input = (user: UserDocument, image?: MediaDocument) => ({ id: user._id, avatar: image?.url ?? '', submissionId: image?.submissionId ?? randomUUID(), expectedProfileRevision: user.profileRevision ?? 0 });
const rejects = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

function harness(users: UserDocument[], media: MediaDocument[] = []) {
  let tables = new Map<string, Map<string, Row>>([
    ['moe_users', new Map(users.map(row => [row._id, structuredClone({ ...row }) as Row]))],
    ['moe_media', new Map(media.map(row => [row._id, structuredClone({ ...row }) as Row]))],
  ]);
  let failAudit = false;
  const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
  const matches = (row: Row, filter: Filter): boolean => Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as Filter[]).some(part => matches(row, part));
    const value = row[key];
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (condition && typeof condition === 'object') {
      const operator = condition as Record<string, unknown>;
      if ('$exists' in operator) return (value !== undefined) === operator.$exists;
      if ('$in' in operator) return (operator.$in as unknown[]).includes(value);
    }
    return value === condition;
  });
  const apply = (row: Row, change: Change, inserted = false) => {
    if (inserted) Object.assign(row, structuredClone(change.$setOnInsert));
    Object.assign(row, structuredClone(change.$set));
    for (const [key, amount] of Object.entries(change.$inc ?? {})) row[key] = Number(row[key] ?? 0) + amount;
    for (const key of Object.keys(change.$unset ?? {})) delete row[key];
  };
  const find = (name: string, filter: Filter) => [...table(name).values()].find(row => matches(row, filter));
  const db = { collection: (name: string) => ({
    findOne: async (filter: Filter, options: { session?: ClientSession }) => { assert.equal(options.session, session); return structuredClone(find(name, filter) ?? null); },
    updateOne: async (filter: Filter, change: Change, options: { session?: ClientSession; upsert?: boolean }) => {
      assert.equal(options.session, session);
      let row = find(name, filter);
      if (!row && options.upsert) { row = { _id: filter._id as string }; table(name).set(row._id, row); apply(row, change, true); }
      else if (row) apply(row, change);
      return { matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 };
    },
    findOneAndUpdate: async (filter: Filter, change: Change, options: { session?: ClientSession; upsert?: boolean }) => {
      assert.equal(options.session, session);
      let row = find(name, filter);
      if (!row && options.upsert) { row = { _id: filter._id as string }; table(name).set(row._id, row); apply(row, change, true); }
      else if (row) apply(row, change);
      return structuredClone(row ?? null);
    },
    insertOne: async (row: Row, options: { session?: ClientSession }) => {
      assert.equal(options.session, session);
      if (name === 'moe_logs' && failAudit) throw new Error('Audit unavailable');
      assert.equal(table(name).has(row._id), false);
      table(name).set(row._id, structuredClone(row));
    },
    deleteMany: async () => { throw new Error('Profile changes must never revoke sessions'); },
  }) } as unknown as Db;
  return {
    db, table, failAudit: () => { failAudit = true; },
    save: async (actor: UserDocument, change: ReturnType<typeof input>) => {
      const before = structuredClone(tables);
      try { return await updateUserProfileInTransaction(actor, change, db, session); }
      catch (error) { tables = before; throw error; }
    },
  };
}

test('profile schema requires a bounded save identity and rejects unsafe URLs or credential edits', () => {
  const actor = account('Operator');
  const change = input(actor);
  assert.deepEqual(userProfileInput.parse(change), change);
  for (const invalid of [
    { ...change, role: 'Dev' }, { ...change, password: 'new-password' }, { ...change, passwordVersion: 2 },
    { ...change, avatar: 'http://example.com/photo.jpg' }, { ...change, avatar: 'data:image/png;base64,secret' },
    { ...change, avatar: 'javascript:alert(1)' }, { ...change, expectedProfileRevision: -1 },
    { ...change, expectedProfileRevision: Number.MAX_SAFE_INTEGER + 1 }, { ...change, submissionId: '' },
  ]) assert.equal(userProfileInput.safeParse(invalid).success, false);
});

test('every role can change its own photo without changing credentials or revoking sessions', async () => {
  for (const role of cmsRoles) {
    const actor = account(role);
    const image = photo('other-owner', randomUUID());
    const state = harness([actor], [image]);
    const result = await state.save(actor, input(actor, image));
    assert.equal(result.user.avatar, image.url);
    assert.equal(result.user.profileRevision, 1);
    assert.equal(result.user.passwordVersion, actor.passwordVersion);
    assert.equal(result.user.passwordHash, actor.passwordHash);
    assert.equal(result.changed, true);
    const logs = [...state.table('moe_logs').values()];
    assert.deepEqual(logs.map(row => row.action), ['user.profile_updated']);
    assert.equal(JSON.stringify(logs).includes(image.url), false);
    assert.deepEqual(publicUser(result.user), { id: actor._id, username: actor.username, role, avatar: image.url, profileRevision: 1 });
  }
});

test('photo edits of another account enforce the complete stored actor/target role matrix', async () => {
  for (const actorRole of cmsRoles) for (const targetRole of cmsRoles) {
    const actor = account(actorRole), target = account(targetRole);
    const image = photo(actor._id, randomUUID());
    const state = harness([actor, target], [image]);
    const mutation = state.save(actor, input(target, image));
    if (canManageUser(actorRole, targetRole)) assert.equal((await mutation).user.avatar, image.url);
    else { await assert.rejects(mutation, rejects(403)); assert.equal(state.table('moe_users').get(target._id)?.avatar, undefined); }
  }
});

test('staged photos require this actor and submission, and unavailable library images cannot be selected', async () => {
  const actor = account('Admin');
  const submissionId = randomUUID();
  for (const [image, expected] of [
    [photo('another-owner', submissionId, 'staged'), 403],
    [photo(actor._id, randomUUID(), 'staged'), 403],
    [photo(actor._id, submissionId, 'uploading'), 400],
    [photo(actor._id, submissionId, 'trashed'), 400],
    [photo(actor._id, submissionId, 'deleting'), 400],
  ] as const) {
    const state = harness([actor], [image]);
    await assert.rejects(state.save(actor, { ...input(actor, image), submissionId }), rejects(expected));
    assert.equal(state.table('moe_users').get(actor._id)?.avatar, undefined);
    assert.equal(state.table('moe_media').get(image.id)?.state, image.state);
    assert.equal(state.table('moe_logs').size, 0);
  }
  const unknown = photo(actor._id, submissionId);
  await assert.rejects(harness([actor]).save(actor, input(actor, unknown)), rejects(400));
});

test('successful staged save commits media, logs once, and exact retry returns the latest photo', async () => {
  const actor = account('Operator');
  const uploaded = photo(actor._id, randomUUID(), 'staged');
  const replacement = photo('library-owner', randomUUID());
  const state = harness([actor], [uploaded, replacement]);
  const change = input(actor, uploaded);
  const first = await state.save(actor, change);
  assert.equal(first.user.profileRevision, 1);
  assert.equal(state.table('moe_media').get(uploaded.id)?.state, 'committed');
  assert.ok((state.table('moe_media').get(uploaded.id)?.touchedAt as Date) > uploaded.touchedAt);
  assert.deepEqual([...state.table('moe_logs').values()].map(row => row.action), ['media.uploaded', 'user.profile_updated']);
  const replay = await state.save(actor, change);
  assert.equal(replay.replayed, true);
  assert.equal(replay.user.profileRevision, 1);
  assert.equal(state.table('moe_logs').size, 2);
  await state.save(actor, { ...input(actor, replacement), expectedProfileRevision: 1 });
  const afterLaterEdit = await state.save(actor, change);
  assert.equal(afterLaterEdit.user.profileRevision, 2);
  assert.equal(afterLaterEdit.user.avatar, replacement.url);
  assert.equal(state.table('moe_logs').size, 3);
  await assert.rejects(state.save(actor, { ...change, avatar: replacement.url }), rejects(409));
});

test('stale revisions, inactive actors, and changed target access are rejected even on replay', async () => {
  const actor = account('Dev'), target = account('Admin');
  const image = photo(actor._id, randomUUID());
  const state = harness([actor, target], [image]);
  const change = input(target, image);
  await state.save(actor, change);
  await assert.rejects(state.save(actor, { ...change, submissionId: randomUUID() }), rejects(409));
  state.table('moe_users').get(actor._id)!.role = 'Operator';
  await assert.rejects(state.save(actor, change), rejects(403));
  state.table('moe_users').get(actor._id)!.role = 'Dev';
  state.table('moe_users').get(target._id)!.deletedAt = new Date();
  await assert.rejects(state.save(actor, change), rejects(409));
  state.table('moe_users').get(target._id)!.purgeAt = new Date(0);
  await assert.rejects(state.save(actor, change), rejects(404));
  state.table('moe_users').get(actor._id)!.passwordVersion = 2;
  await assert.rejects(state.save(actor, change), rejects(409));
  state.table('moe_users').get(actor._id)!.passwordVersion = 1;
  state.table('moe_users').get(actor._id)!.deletedAt = new Date();
  await assert.rejects(state.save(actor, change), rejects(409));
});

test('removing a photo retains the library image; no-op saves do not increment revisions or log changes', async () => {
  const actor = account('Operator');
  const image = photo(actor._id, randomUUID());
  actor.avatar = image.url; actor.profileRevision = 4;
  const state = harness([actor], [image]);
  const unchanged = await state.save(actor, { ...input(actor, image), submissionId: randomUUID() });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.user.profileRevision, 4);
  assert.equal(state.table('moe_logs').size, 0);
  const removed = await state.save(actor, input(actor));
  assert.equal(removed.user.avatar, undefined);
  assert.equal(removed.user.profileRevision, 5);
  assert.equal(removed.user.passwordVersion, actor.passwordVersion);
  assert.deepEqual(state.table('moe_media').get(image.id), image);
  assert.deepEqual([...state.table('moe_logs').values()].map(row => row.action), ['user.profile_updated']);
});

test('aborted upload submissions cannot save a late profile change', async () => {
  const actor = account('Operator');
  const image = photo(actor._id, randomUUID(), 'staged');
  const state = harness([actor], [image]);
  const key = `media-submission:${digest(`${actor._id}:${image.submissionId}`)}`;
  state.table('moe_state').set(key, { _id: key, value: 'aborted', count: 1 });
  await assert.rejects(state.save(actor, input(actor, image)), rejects(409));
  assert.equal(state.table('moe_users').get(actor._id)?.avatar, undefined);
  assert.equal(state.table('moe_media').get(image.id)?.state, 'staged');
});

test('audit failure rolls back the staged photo, account, and operation marker in the caller transaction', async () => {
  for (const status of ['staged', 'committed'] as const) {
    const actor = account('Operator');
    const image = photo(actor._id, randomUUID(), status);
    const state = harness([actor], [image]);
    state.failAudit();
    await assert.rejects(state.save(actor, input(actor, image)), /Audit unavailable/);
    assert.deepEqual(state.table('moe_users').get(actor._id), actor);
    assert.deepEqual(state.table('moe_media').get(image.id), image);
    assert.equal(state.table('moe_state').size, 0);
    assert.equal(state.table('moe_logs').size, 0);
  }
});
