import 'server-only';
import { appendAuditEvent, auditActor } from './audit';
import { randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import { z } from 'zod';
import { canAssignRole, canManageUser, resolveCmsRole, type CmsRole } from '@/lib/cms-roles';
import { collections, type UserDocument } from './db';
import { digest, rateLimit, requireUser, verifyPassword } from './auth';
import { HttpError, sameOrigin } from './http';
import { lockMediaSubmission } from './media';

type Actor = Pick<UserDocument, '_id' | 'passwordVersion'>;
type NewUser = { username: string; role: CmsRole; passwordHash: string };
type UserChanges = { username?: string; role?: CmsRole; passwordHash?: string };
export const userTrashInput = z.strictObject({ id: z.string().uuid(), currentPassword: z.string().min(1).max(200) });
export const userProfileInput = z.strictObject({
  id: z.uuid(), avatar: z.union([z.literal(''), z.url().max(2048).refine(value => value.startsWith('https://'), 'Choose an image from the library or upload a photo.')]),
  submissionId: z.uuid(), expectedProfileRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currentPassword: z.string().min(1).max(200).optional(),
});
type ProfileChange = Omit<z.infer<typeof userProfileInput>, 'currentPassword'>;

export async function authorizeUserMutation(request: Request, suppliedPassword: string) {
  sameOrigin(request);
  const actor = await requireUser();
  await rateLimit(`users:${actor._id}`, 12, 15 * 60);
  if (!await verifyPassword(suppliedPassword, actor.passwordHash)) throw new HttpError(403, 'Your current password is incorrect.');
  return actor;
}

async function lockActor(actor: Actor, db: Db, session: ClientSession) {
  const c = collections(db);
  // Role changes, removals, resets, and password changes serialize here.
  await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
  const current = await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session });
  if (!current) throw new HttpError(409, 'Your account changed. Sign in again.');
  return { ...current, role: resolveCmsRole(current.role) };
}

function assertManager(actor: CmsRole, target: CmsRole) {
  if (!canManageUser(actor, target)) throw new HttpError(403, target === 'Dev' ? 'Only Dev can manage Dev accounts.' : 'Your role cannot manage users.');
}

async function preserveAccess(target: UserDocument, nextRole: CmsRole | null, db: Db, session: ClientSession) {
  const c = collections(db);
  const previousRole = resolveCmsRole(target.role);
  if (previousRole === 'Dev' && nextRole !== 'Dev' && await c.users.countDocuments({ role: 'Dev', deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session }) <= 1) {
    throw new HttpError(409, 'The last Dev account cannot be removed or changed to another role.');
  }
  if ((previousRole === 'Dev' || previousRole === 'Admin') && nextRole !== 'Dev' && nextRole !== 'Admin') {
    const managers = await c.users.countDocuments({ deletedAt: { $exists: false }, purgeAt: { $exists: false }, $or: [{ role: 'Dev' }, { role: 'Admin' }, { role: { $exists: false } }] }, { session });
    if (managers <= 1) throw new HttpError(409, 'Keep at least one Dev or Admin account.');
  }
}

async function assertUsernameAvailable(username: string, id: string | null, db: Db, session: ClientSession) {
  const existing = await collections(db).users.findOne({ username }, { session });
  if (existing && existing._id !== id) throw new HttpError(409, existing.deletedAt ? 'This username belongs to a user in Trash. Choose another username.' : 'This username is already in use. Choose another username.');
}

function assertRetainedUser(target: UserDocument | null): asserts target is UserDocument {
  if (!target || target.purgeAt && target.purgeAt <= new Date()) throw new HttpError(404, 'User not found. Refresh the list.');
}

export async function createUserInTransaction(actor: Actor, input: NewUser, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  if (!canAssignRole(current.role, input.role)) throw new HttpError(403, input.role === 'Dev' ? 'Only Dev can create Dev accounts.' : 'Your role cannot manage users.');
  await assertUsernameAvailable(input.username, null, db, session);
  const user: UserDocument = { _id: randomUUID(), ...input, passwordVersion: 1, createdAt: new Date() };
  await collections(db).users.insertOne(user, { session });
  await appendAuditEvent(db, session, { action: 'user.created', actor: auditActor(current), target: { type: 'User', id: user._id, label: user.username } });
  return user;
}

/** Profile photos have their own revision and never change credentials or revoke sessions. */
export async function updateUserProfileInTransaction(actor: Actor, input: ProfileChange, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  const c = collections(db);
  const target = await c.users.findOne({ _id: input.id }, { session });
  assertRetainedUser(target);
  if (current._id !== target._id) assertManager(current.role, resolveCmsRole(target.role));
  if (target.deletedAt || target.purgeAt) throw new HttpError(409, 'Restore this user from Trash before editing the account.');
  const operationId = `user-profile:${current._id}:${input.submissionId}`;
  const fingerprint = digest(JSON.stringify({ id: input.id, avatar: input.avatar, expectedProfileRevision: input.expectedProfileRevision }));
  const prior = await c.state.findOne({ _id: operationId }, { session });
  if (prior) {
    if (prior.value !== fingerprint) throw new HttpError(409, 'This save identifier was already used. Start a new save after refreshing.');
    // The operation succeeded previously. Return today's photo without overwriting a later edit.
    return { user: target, changed: false, replayed: true };
  }
  const revision = target.profileRevision ?? 0;
  if (revision !== input.expectedProfileRevision) throw new HttpError(409, 'This profile photo changed elsewhere. Refresh the user and try again.');
  await lockMediaSubmission(db, session, current._id, input.submissionId);
  const changed = (target.avatar ?? '') !== input.avatar;
  if (changed && input.avatar) {
    const media = await c.media.findOne({ url: input.avatar }, { session });
    if (!media || !['staged', 'committed'].includes(media.state)) throw new HttpError(400, 'Choose a library image or upload a photo before saving.');
    if (media.state === 'staged' && (media.owner !== current._id || media.submissionId !== input.submissionId)) throw new HttpError(403, 'This upload belongs to a different save. Please choose the image again.');
    // Touch even existing library images: save and cleanup must conflict on the media document.
    const touchedAt = new Date(Math.max(Date.now(), media.touchedAt.getTime() + 1));
    const saved = await c.media.updateOne({ _id: media._id, state: media.state, touchedAt: media.touchedAt }, { $set: { state: 'committed', touchedAt } }, { session });
    if (!saved.matchedCount) throw new HttpError(409, 'This image changed elsewhere. Choose it again before saving.');
    if (media.state === 'staged') await appendAuditEvent(db, session, { action: 'media.uploaded', actor: auditActor(current), target: { type: 'Image', id: media.id, label: media.title } });
  }
  let user = target;
  if (changed) {
    const profileRevision = revision + 1;
    const updated = await c.users.updateOne({
      _id: target._id, passwordVersion: target.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false },
      ...(revision ? { profileRevision: revision } : { $or: [{ profileRevision: 0 }, { profileRevision: { $exists: false } }] }),
    }, {
      $set: { profileRevision, ...(input.avatar ? { avatar: input.avatar } : {}) },
      ...(!input.avatar ? { $unset: { avatar: '' } } : {}),
    }, { session });
    if (!updated.matchedCount) throw new HttpError(409, 'This profile photo changed elsewhere. Refresh the user and try again.');
    user = { ...target, profileRevision };
    if (input.avatar) user.avatar = input.avatar; else delete user.avatar;
    await appendAuditEvent(db, session, { action: 'user.profile_updated', actor: auditActor(current), target: { type: 'User', id: target._id, label: target.username } });
  }
  await c.state.insertOne({ _id: operationId, value: fingerprint, expiresAt: new Date(Date.now() + 7 * 86400000) }, { session });
  return { user, changed, replayed: false };
}

export async function editUserInTransaction(actor: Actor, id: string, changes: UserChanges, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  if (!canManageUser(current.role, 'Operator')) throw new HttpError(403, 'Your role cannot manage users.');
  const c = collections(db);
  const target = await c.users.findOne({ _id: id }, { session });
  assertRetainedUser(target);
  const targetRole = resolveCmsRole(target.role);
  assertManager(current.role, targetRole);
  if (target.deletedAt || target.purgeAt) throw new HttpError(409, 'Restore this user from Trash before editing the account.');
  if (changes.role !== undefined && !canAssignRole(current.role, changes.role)) throw new HttpError(403, 'Only Dev can assign the Dev role.');
  if (id === current._id && changes.passwordHash !== undefined) throw new HttpError(400, 'Change your own password in User settings.');
  await preserveAccess(target, changes.role ?? targetRole, db, session);
  if (changes.username !== undefined) await assertUsernameAvailable(changes.username, target._id, db, session);
  const changed = changes.passwordHash !== undefined || changes.username !== undefined && changes.username !== target.username || changes.role !== undefined && changes.role !== targetRole;
  if (!changed) return { user: target, changed: false };
  const user = { ...target, ...changes, passwordVersion: target.passwordVersion + 1 };
  const updated = await c.users.updateOne({ _id: id, passwordVersion: target.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { $set: changes, $inc: { passwordVersion: 1 } }, { session });
  if (!updated.matchedCount) throw new HttpError(409, 'This user changed elsewhere. Refresh the list.');
  await c.sessions.deleteMany({ userId: id }, { session });
  await appendAuditEvent(db, session, { action: changes.passwordHash !== undefined ? 'user.password_reset' : 'user.updated', actor: auditActor(current), target: { type: 'User', id: user._id, label: user.username } });
  if (changes.passwordHash !== undefined && (changes.username !== undefined && changes.username !== target.username || changes.role !== undefined && changes.role !== targetRole)) {
    await appendAuditEvent(db, session, { action: 'user.updated', actor: auditActor(current), target: { type: 'User', id: user._id, label: user.username } });
  }
  return { user, changed: true };
}

export async function removeUserInTransaction(actor: Actor, id: string, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  if (id === current._id) throw new HttpError(400, 'You cannot remove your own account.');
  if (!canManageUser(current.role, 'Operator')) throw new HttpError(403, 'Your role cannot manage users.');
  const c = collections(db);
  const target = await c.users.findOne({ _id: id }, { session });
  assertRetainedUser(target);
  assertManager(current.role, resolveCmsRole(target.role));
  if (target.deletedAt || target.purgeAt) throw new HttpError(409, 'This user is already in Trash. Refresh the list.');
  await preserveAccess(target, null, db, session);
  const deletedAt = new Date();
  const removed = await c.users.updateOne({ _id: id, passwordVersion: target.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, {
    $set: { deletedAt, purgeAt: new Date(deletedAt.getTime() + 30 * 86400000) }, $inc: { passwordVersion: 1 },
  }, { session });
  if (!removed.matchedCount) throw new HttpError(409, 'This user changed elsewhere. Refresh the list.');
  await c.sessions.deleteMany({ userId: id }, { session });
  await appendAuditEvent(db, session, { action: 'user.trashed', actor: auditActor(current), target: { type: 'User', id, label: target.username } });
}

export async function restoreUserInTransaction(actor: Actor, id: string, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  if (!canManageUser(current.role, 'Operator')) throw new HttpError(403, 'Your role cannot manage users.');
  const c = collections(db);
  const target = await c.users.findOne({ _id: id }, { session });
  assertRetainedUser(target);
  assertManager(current.role, resolveCmsRole(target.role));
  if (!target.deletedAt) throw new HttpError(409, 'This user is not in Trash. Refresh the list.');
  const restored = await c.users.updateOne({ _id: id, passwordVersion: target.passwordVersion, deletedAt: target.deletedAt }, {
    $unset: { deletedAt: '', purgeAt: '' }, $inc: { passwordVersion: 1 },
  }, { session });
  if (!restored.matchedCount) throw new HttpError(409, 'This user changed elsewhere. Refresh the list.');
  await c.sessions.deleteMany({ userId: id }, { session });
  await appendAuditEvent(db, session, { action: 'user.restored', actor: auditActor(current), target: { type: 'User', id, label: target.username } });
}

export async function permanentlyRemoveUserInTransaction(actor: Actor, id: string, db: Db, session: ClientSession) {
  const current = await lockActor(actor, db, session);
  if (id === current._id) throw new HttpError(400, 'You cannot remove your own account.');
  if (!canManageUser(current.role, 'Operator')) throw new HttpError(403, 'Your role cannot manage users.');
  const c = collections(db);
  const target = await c.users.findOne({ _id: id }, { session });
  assertRetainedUser(target);
  assertManager(current.role, resolveCmsRole(target.role));
  if (!target.deletedAt) throw new HttpError(409, 'Move this user to Trash before deleting the account permanently.');
  const removed = await c.users.deleteOne({ _id: id, passwordVersion: target.passwordVersion, deletedAt: target.deletedAt }, { session });
  if (!removed.deletedCount) throw new HttpError(409, 'This user changed elsewhere. Refresh the list.');
  await c.sessions.deleteMany({ userId: id }, { session });
  await appendAuditEvent(db, session, { action: 'user.deleted', actor: auditActor(current), target: { type: 'User', id, label: target.username } });
}
