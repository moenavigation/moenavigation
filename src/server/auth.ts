import 'server-only';
import { appendAuditEvent, auditActor } from './audit';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { resolveCmsRole, type CmsRole, type CmsUser } from '@/lib/cms-roles';
import { collections, ensureIndexes, getDb, transaction, type UserDocument } from './db';
import { HttpError } from './http';

const derive = promisify(scrypt);
const cookieName = 'moe_cms_session';
const sessionDuration = 8 * 60 * 60;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const [, salt, expected] = parts;
  const key = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  await ensureIndexes();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const _id = `limit:${digest(key)}:${bucket}`;
  const result = await collections(await getDb()).state.findOneAndUpdate({ _id }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) },
  }, { upsert: true, returnDocument: 'after' });
  if ((result?.count || 0) > limit) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
export async function issueLoginChallenge() {
  await rateLimit('login:challenge:global', 1000, 15 * 60);
  const id = randomBytes(24).toString('hex');
  const target = 56 + randomBytes(1)[0] % 33;
  await collections(await getDb()).state.insertOne({ _id: `login:challenge:${id}`, value: String(target), expiresAt: new Date(Date.now() + 2 * 60_000) });
  return { id, target };
}
async function consumeLoginChallenge(id: string, position: number) {
  const challenge = await collections(await getDb()).state.findOneAndDelete({ _id: `login:challenge:${id}`, expiresAt: { $gt: new Date() } });
  if (!challenge || Math.abs(Number(challenge.value) - position) > 3) throw new HttpError(400, 'Slide verification expired or did not match. Try a new slide.');
}
export function publicUser(user: UserDocument): CmsUser {
  return { id: user._id, username: user.username, role: resolveCmsRole(user.role), ...(user.avatar ? { avatar: user.avatar } : {}), profileRevision: user.profileRevision ?? 0 };
}
export async function currentUser(): Promise<(UserDocument & { role: CmsRole }) | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const c = collections(await getDb());
  const session = await c.sessions.findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await c.users.findOne({ _id: session.userId, passwordVersion: session.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } });
  return user ? { ...user, role: resolveCmsRole(user.role) } : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Please sign in to continue. Your unsaved input is still available.');
  return user;
}
export async function requireRole(...roles: CmsRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new HttpError(403, 'Your role does not allow this action.');
  return user;
}
export async function createSession(user: UserDocument, logSignIn = false) {
  const token = randomBytes(32).toString('hex');
  await transaction(async (db, session) => {
    const c = collections(db);
    await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
    const active = await c.users.findOne({ _id: user._id, passwordVersion: user.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session });
    if (!active) throw new HttpError(401, 'The username or password is incorrect.');
    await c.sessions.insertOne({ _id: digest(token), userId: active._id, passwordVersion: active.passwordVersion, expiresAt: new Date(Date.now() + sessionDuration * 1000) }, { session });
    if (logSignIn) await appendAuditEvent(db, session, { action: 'auth.login', actor: auditActor(active), target: { type: 'Session', id: 'cms' } });
  });
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'), sameSite: 'strict', path: '/', maxAge: sessionDuration });
}
export async function login(username: string, password: string, challengeId: string, challengePosition: number) {
  await rateLimit('login:global', 100, 15 * 60);
  await rateLimit(`login:username:${username}`, 10, 15 * 60);
  await consumeLoginChallenge(challengeId, challengePosition);
  const c = collections(await getDb());
  const user = await c.users.findOne({ username, deletedAt: { $exists: false }, purgeAt: { $exists: false } });
  const valid = await verifyPassword(password, user?.passwordHash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
  if (!user || !valid) {
    await transaction((db, session) => appendAuditEvent(db, session, { action: 'auth.login', actor: { system: true }, target: { type: 'Session', id: 'cms' }, outcome: 'denied' }));
    throw new HttpError(401, 'The username or password is incorrect.');
  }
  const old = (await cookies()).get(cookieName)?.value;
  if (old) await c.sessions.deleteOne({ _id: digest(old) });
  await createSession(user, true);
  return publicUser(user);
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  const actor = token ? await currentUser() : null;
  if (token) await transaction(async (db, session) => {
    const removed = await collections(db).sessions.deleteOne({ _id: digest(token) }, { session });
    if (actor && removed.deletedCount) await appendAuditEvent(db, session, { action: 'auth.logout', actor: auditActor(actor), target: { type: 'Session', id: 'cms' } });
  });
  jar.delete(cookieName);
}
export async function changePassword(user: UserDocument, currentPassword: string, newPassword: string) {
  await rateLimit(`password:${user._id}`, 10, 15 * 60);
  if (!await verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, 'The current password is incorrect.');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a different password.');
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (db, session) => {
    const c = collections(db);
    await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
    const result = await c.users.updateOne({ _id: user._id, passwordVersion: user.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { $set: { passwordHash }, $inc: { passwordVersion: 1 } }, { session });
    if (!result.modifiedCount) throw new HttpError(409, 'Your account changed. Please sign in again.');
    await c.sessions.deleteMany({ userId: user._id }, { session });
    await appendAuditEvent(db, session, { action: 'auth.password_changed', actor: auditActor(user), target: { type: 'User', id: user._id, label: user.username } });
  });
  await createSession({ ...user, passwordHash, passwordVersion: user.passwordVersion + 1 });
}
