import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientSession, Db } from 'mongodb';
import { canAssignRole, canManageUser, canPermanentlyDelete, cmsRoles, resolveCmsRole, type CmsRole } from '../src/lib/cms-roles';
import { createUserInTransaction, editUserInTransaction, permanentlyRemoveUserInTransaction, removeUserInTransaction, restoreUserInTransaction } from '../src/server/users';
import type { UserDocument } from '../src/server/db';
import { HttpError } from '../src/server/http';

const session = {} as ClientSession;
const account = (_id: string, role?: CmsRole): UserDocument => ({ _id, username: _id, ...(role ? { role } : {}), passwordVersion: 1, passwordHash: 'existing-hash', createdAt: new Date() });
type Filter = { _id?: string; username?: string; passwordVersion?: number; role?: CmsRole | { $exists: boolean }; deletedAt?: Date | { $exists: boolean }; purgeAt?: Date | { $exists: boolean }; $or?: Filter[] };
const trashed = (user: UserDocument, daysRemaining = 30): UserDocument => ({ ...user, deletedAt: new Date(), purgeAt: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000) });

function harness(...accounts: UserDocument[]) {
  const users = new Map(accounts.map(user => [user._id, structuredClone(user)]));
  const revoked: string[] = [];
  let locks = 0;
  const matches = (user: UserDocument, filter: Filter): boolean => {
    if (filter._id !== undefined && user._id !== filter._id || filter.passwordVersion !== undefined && user.passwordVersion !== filter.passwordVersion) return false;
    if (filter.username !== undefined && user.username !== filter.username) return false;
    if (typeof filter.role === 'string' && user.role !== filter.role) return false;
    if (filter.role && typeof filter.role === 'object' && (user.role !== undefined) !== filter.role.$exists) return false;
    for (const key of ['deletedAt', 'purgeAt'] as const) {
      const condition = filter[key];
      if (condition instanceof Date && user[key]?.getTime() !== condition.getTime()) return false;
      if (condition && !(condition instanceof Date) && (user[key] !== undefined) !== condition.$exists) return false;
    }
    return !filter.$or || filter.$or.some(item => matches(user, item));
  };
  const db = { collection: (name: string) => {
    if (name === 'moe_users') return {
      findOne: async (filter: Filter) => structuredClone([...users.values()].find(user => matches(user, filter)) ?? null),
      countDocuments: async (filter: Filter) => [...users.values()].filter(user => matches(user, filter)).length,
      insertOne: async (user: UserDocument) => { users.set(user._id, structuredClone(user)); },
      updateOne: async (filter: Filter, update: { $set?: Partial<UserDocument>; $unset?: { deletedAt?: string; purgeAt?: string }; $inc: { passwordVersion: number } }) => {
        const user = [...users.values()].find(item => matches(item, filter));
        if (!user) return { matchedCount: 0 };
        Object.assign(user, update.$set, { passwordVersion: user.passwordVersion + update.$inc.passwordVersion });
        if (update.$unset?.deletedAt !== undefined) delete user.deletedAt;
        if (update.$unset?.purgeAt !== undefined) delete user.purgeAt;
        return { matchedCount: 1 };
      },
      deleteOne: async (filter: Filter) => {
        const user = [...users.values()].find(item => matches(item, filter));
        return { deletedCount: user && users.delete(user._id) ? 1 : 0 };
      },
    };
    if (name === 'moe_logs') return { insertOne: async () => ({ acknowledged: true }) };
    if (name === 'moe_state') return { updateOne: async () => { locks++; } };
    if (name === 'moe_sessions') return { deleteMany: async ({ userId }: { userId: string }) => { revoked.push(userId); } };
    return {};
  } } as unknown as Db;
  return { db, users, revoked, locks: () => locks };
}
const rejects = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('role policy covers every actor/target pair and legacy roles fail closed', () => {
  for (const actor of cmsRoles) for (const target of cmsRoles) {
    const allowed = actor === 'Dev' || actor === 'Admin' && target !== 'Dev';
    assert.equal(canManageUser(actor, target), allowed, `${actor} manages ${target}`);
    assert.equal(canAssignRole(actor, target), allowed, `${actor} assigns ${target}`);
  }
  assert.equal(resolveCmsRole(undefined), 'Admin');
  for (const role of [null, '', 'admin', 'Owner', {}, []]) assert.equal(resolveCmsRole(role), 'Operator');
  for (const role of cmsRoles) assert.equal(canPermanentlyDelete(role), role !== 'Operator');
});

test('only Dev can create Dev and Operators cannot create accounts', async () => {
  for (const actorRole of cmsRoles) for (const role of cmsRoles) {
    const actor = account('actor', actorRole);
    const state = harness(actor);
    const action = createUserInTransaction(actor, { username: 'created', role, passwordHash: 'new-hash' }, state.db, session);
    if (canAssignRole(actorRole, role)) {
      const user = await action;
      assert.equal(state.users.get(user._id)?.role, role);
      assert.equal(user.passwordVersion, 1);
    } else {
      await assert.rejects(action, rejects(403));
      assert.equal(state.users.size, 1);
    }
    assert.equal(state.locks(), 1);
  }
});

test('Admin cannot rename, demote, reset or delete a Dev, or grant Dev to another account', async () => {
  const actor = account('admin', 'Admin');
  const dev = account('dev', 'Dev');
  const operator = account('operator', 'Operator');
  const state = harness(actor, dev, operator);
  for (const changes of [{ username: 'renamed' }, { role: 'Operator' as const }, { passwordHash: 'reset-hash' }]) {
    await assert.rejects(editUserInTransaction(actor, dev._id, changes, state.db, session), rejects(403));
  }
  await assert.rejects(removeUserInTransaction(actor, dev._id, state.db, session), rejects(403));
  await assert.rejects(editUserInTransaction(actor, operator._id, { role: 'Dev' }, state.db, session), rejects(403));
  await assert.rejects(editUserInTransaction(actor, actor._id, { role: 'Dev' }, state.db, session), rejects(403));
  assert.deepEqual(state.users.get(dev._id), dev);
  assert.equal(state.revoked.length, 0);
});

test('Dev and Admin can edit permitted users and changes revoke all target sessions', async () => {
  for (const actorRole of ['Dev', 'Admin'] as const) for (const targetRole of cmsRoles) {
    if (!canManageUser(actorRole, targetRole)) continue;
    const actor = account('actor', actorRole);
    const target = account('target', targetRole);
    const state = harness(actor, target);
    const result = await editUserInTransaction(actor, target._id, { username: 'renamed', passwordHash: 'reset-hash' }, state.db, session);
    assert.equal(result.changed, true);
    assert.equal(result.user.role, targetRole);
    assert.equal(result.user.username, 'renamed');
    assert.equal(result.user.passwordVersion, 2);
    assert.equal(state.users.get(target._id)?.passwordHash, 'reset-hash');
    assert.deepEqual(state.revoked, [target._id]);
    const removed = harness(actor, target);
    await removeUserInTransaction(actor, target._id, removed.db, session);
    const saved = removed.users.get(target._id)!;
    assert.ok(saved.deletedAt);
    assert.equal(saved.purgeAt!.getTime() - saved.deletedAt.getTime(), 30 * 24 * 60 * 60 * 1000);
    assert.equal(saved.passwordVersion, 2);
    assert.equal(saved.passwordHash, target.passwordHash);
    assert.deepEqual(removed.revoked, [target._id]);
  }
});

test('all roles are prevented from removing themselves and Operators cannot edit others', async () => {
  for (const role of cmsRoles) {
    const actor = account('actor', role);
    const state = harness(actor, account('other', 'Admin'));
    await assert.rejects(removeUserInTransaction(actor, actor._id, state.db, session), rejects(400));
    assert.equal(state.users.size, 2);
  }
  const operator = account('operator', 'Operator');
  const state = harness(operator, account('target', 'Operator'));
  await assert.rejects(editUserInTransaction(operator, 'target', { passwordHash: 'reset-hash' }, state.db, session), rejects(403));
  await assert.rejects(editUserInTransaction(operator, operator._id, { role: 'Admin' }, state.db, session), rejects(403));
  await assert.rejects(removeUserInTransaction(operator, 'target', state.db, session), rejects(403));
});

test('last Dev and last manager cannot be demoted, while valid self profile edits remain possible', async () => {
  const dev = account('dev', 'Dev');
  const state = harness(dev, account('admin', 'Admin'));
  await assert.rejects(editUserInTransaction(dev, dev._id, { role: 'Admin' }, state.db, session), rejects(409));
  const renamed = await editUserInTransaction(dev, dev._id, { username: 'renamed-dev' }, state.db, session);
  assert.equal(renamed.user.role, 'Dev');
  assert.equal(renamed.user.username, 'renamed-dev');
  const admin = account('legacy-admin');
  const legacy = harness(admin, account('operator', 'Operator'));
  await assert.rejects(editUserInTransaction(admin, admin._id, { role: 'Operator' }, legacy.db, session), rejects(409));
  const multiple = harness(dev, account('second-dev', 'Dev'));
  const demoted = await editUserInTransaction(dev, dev._id, { role: 'Operator' }, multiple.db, session);
  assert.equal(demoted.user.role, 'Operator');
  assert.deepEqual(multiple.revoked, [dev._id]);
});

test('transaction authorization uses persisted roles and versions, not caller claims', async () => {
  const original = account('actor', 'Dev');
  const state = harness({ ...original, role: 'Operator' }, account('target', 'Admin'));
  await assert.rejects(editUserInTransaction(original, 'target', { username: 'renamed' }, state.db, session), rejects(403));
  state.users.set(original._id, { ...original, passwordVersion: 2 });
  await assert.rejects(createUserInTransaction(original, { username: 'new-user', role: 'Admin', passwordHash: 'new-hash' }, state.db, session), rejects(409));
  state.users.delete(original._id);
  await assert.rejects(removeUserInTransaction(original, 'target', state.db, session), rejects(409));
  assert.equal(state.revoked.length, 0);
});

test('unchanged edits keep sessions, and password self-service cannot be bypassed', async () => {
  const actor = account('admin', 'Admin');
  const target = account('target', 'Operator');
  const state = harness(actor, target);
  const result = await editUserInTransaction(actor, target._id, { username: target.username, role: target.role }, state.db, session);
  assert.equal(result.changed, false);
  assert.equal(result.user.passwordVersion, 1);
  assert.deepEqual(state.revoked, []);
  await assert.rejects(editUserInTransaction(actor, actor._id, { passwordHash: 'new-hash' }, state.db, session), rejects(400));
});

test('a removed account restores its identity and password without reviving prior sessions', async () => {
  const actor = account('dev', 'Dev');
  const target = account('target', 'Admin');
  const state = harness(actor, target);
  await removeUserInTransaction(actor, target._id, state.db, session);
  await restoreUserInTransaction(actor, target._id, state.db, session);
  assert.deepEqual(state.users.get(target._id), { ...target, passwordVersion: 3 });
  assert.deepEqual(state.revoked, [target._id, target._id]);
  await assert.rejects(permanentlyRemoveUserInTransaction(actor, target._id, state.db, session), rejects(409));
  assert.equal(state.users.has(target._id), true);
  await removeUserInTransaction(actor, target._id, state.db, session);
  await permanentlyRemoveUserInTransaction(actor, target._id, state.db, session);
  assert.equal(state.users.has(target._id), false);
  assert.deepEqual(state.revoked, [target._id, target._id, target._id, target._id]);
});

test('restoration and permanent deletion enforce every actor and target role pair', async () => {
  for (const actorRole of cmsRoles) for (const targetRole of cmsRoles) {
    for (const action of [restoreUserInTransaction, permanentlyRemoveUserInTransaction]) {
      const actor = account('actor', actorRole);
      const target = trashed(account('target', targetRole));
      const state = harness(actor, target);
      const mutation = action(actor, target._id, state.db, session);
      if (canManageUser(actorRole, targetRole)) {
        await mutation;
        assert.deepEqual(state.revoked, [target._id]);
        if (action === restoreUserInTransaction) {
          assert.equal(state.users.get(target._id)?.deletedAt, undefined);
          assert.equal(state.users.get(target._id)?.passwordVersion, 2);
        } else assert.equal(state.users.has(target._id), false);
      } else {
        await assert.rejects(mutation, rejects(403));
        assert.deepEqual(state.users.get(target._id), target);
        assert.deepEqual(state.revoked, []);
      }
      assert.equal(state.locks(), 1);
    }
  }
});

test('Trash actions reject expired, missing, or active targets and repeated removal', async () => {
  const actor = account('dev', 'Dev');
  const target = account('target', 'Admin');
  for (const action of [restoreUserInTransaction, permanentlyRemoveUserInTransaction]) {
    const active = harness(actor, target);
    await assert.rejects(action(actor, target._id, active.db, session), rejects(409));
    const expired = harness(actor, trashed(target, -1));
    await assert.rejects(action(actor, target._id, expired.db, session), rejects(404));
    await assert.rejects(action(actor, 'missing', active.db, session), rejects(404));
    assert.equal(active.users.has(target._id), true);
    assert.equal(expired.users.has(target._id), true);
    assert.deepEqual(active.revoked, []);
    assert.deepEqual(expired.revoked, []);
  }
  const retained = harness(actor, trashed(target));
  await assert.rejects(removeUserInTransaction(actor, target._id, retained.db, session), rejects(409));
  await assert.rejects(editUserInTransaction(actor, target._id, { passwordHash: 'changed' }, retained.db, session), rejects(409));
  await assert.rejects(permanentlyRemoveUserInTransaction(actor, actor._id, retained.db, session), rejects(400));
  assert.deepEqual(retained.revoked, []);
});

test('trashed privileged accounts never satisfy the last active Dev or manager safeguard', async () => {
  const dev = account('dev', 'Dev');
  const developers = harness(dev, trashed(account('spare-dev', 'Dev')), account('admin', 'Admin'));
  await assert.rejects(editUserInTransaction(dev, dev._id, { role: 'Admin' }, developers.db, session), rejects(409));
  for (const role of ['Admin', undefined] as const) {
    const admin = account('admin', role);
    const managers = harness(admin, trashed(account('old-dev', 'Dev')), trashed(account('old-admin', 'Admin')));
    await assert.rejects(editUserInTransaction(admin, admin._id, { role: 'Operator' }, managers.db, session), rejects(409));
    assert.deepEqual(managers.revoked, []);
  }
});

test('an account moved to Trash cannot authorize any mutation with a stale session snapshot', async () => {
  const actor = account('dev', 'Dev');
  const state = harness(trashed(actor), account('active', 'Operator'), trashed(account('removed', 'Operator')));
  await assert.rejects(createUserInTransaction(actor, { username: 'new-user', role: 'Admin', passwordHash: 'new-hash' }, state.db, session), rejects(409));
  await assert.rejects(editUserInTransaction(actor, 'active', { username: 'renamed' }, state.db, session), rejects(409));
  await assert.rejects(removeUserInTransaction(actor, 'active', state.db, session), rejects(409));
  await assert.rejects(restoreUserInTransaction(actor, 'removed', state.db, session), rejects(409));
  await assert.rejects(permanentlyRemoveUserInTransaction(actor, 'removed', state.db, session), rejects(409));
  assert.deepEqual(state.revoked, []);
  assert.equal(state.users.size, 3);
});

test('active and trashed accounts reserve their username until permanent deletion', async () => {
  const actor = account('dev', 'Dev');
  const target = account('target', 'Operator');
  for (const reserved of [account('reserved', 'Admin'), trashed(account('reserved', 'Admin'))]) {
    const state = harness(actor, target, reserved);
    const expected = reserved.deletedAt ? 'This username belongs to a user in Trash. Choose another username.' : 'This username is already in use. Choose another username.';
    const conflict = (error: unknown) => rejects(409)(error) && error instanceof Error && error.message === expected;
    await assert.rejects(createUserInTransaction(actor, { username: reserved.username, role: 'Operator', passwordHash: 'new-hash' }, state.db, session), conflict);
    await assert.rejects(editUserInTransaction(actor, target._id, { username: reserved.username }, state.db, session), conflict);
    assert.deepEqual(state.revoked, []);
  }
  const removed = trashed(account('reserved', 'Admin'));
  const available = harness(actor, removed);
  await permanentlyRemoveUserInTransaction(actor, removed._id, available.db, session);
  const replacement = await createUserInTransaction(actor, { username: removed.username, role: 'Operator', passwordHash: 'new-hash' }, available.db, session);
  assert.notEqual(replacement._id, removed._id);
  assert.equal(replacement.username, removed.username);
});
