import 'server-only';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
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
export async function currentUser(): Promise<UserDocument | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const c = collections(await getDb());
  const session = await c.sessions.findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return c.users.findOne({ _id: session.userId, passwordVersion: session.passwordVersion });
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Please sign in to continue. Your unsaved input is still available.');
  return user;
}
export async function createSession(user: UserDocument) {
  const token = randomBytes(32).toString('hex');
  const c = collections(await getDb());
  await c.sessions.insertOne({ _id: digest(token), userId: user._id, passwordVersion: user.passwordVersion, expiresAt: new Date(Date.now() + sessionDuration * 1000) });
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'), sameSite: 'strict', path: '/', maxAge: sessionDuration });
}
export async function login(username: string, password: string) {
  await rateLimit('login:global', 100, 15 * 60);
  await rateLimit(`login:username:${username}`, 10, 15 * 60);
  const c = collections(await getDb());
  const user = await c.users.findOne({ username });
  const valid = await verifyPassword(password, user?.passwordHash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
  if (!user || !valid) throw new HttpError(401, 'The username or password is incorrect.');
  const old = (await cookies()).get(cookieName)?.value;
  if (old) await c.sessions.deleteOne({ _id: digest(old) });
  await createSession(user);
  return { username: user.username };
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await collections(await getDb()).sessions.deleteOne({ _id: digest(token) });
  jar.delete(cookieName);
}
export async function changePassword(user: UserDocument, currentPassword: string, newPassword: string) {
  await rateLimit(`password:${user._id}`, 10, 15 * 60);
  if (!await verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, 'The current password is incorrect.');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a different password.');
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (db, session) => {
    const c = collections(db);
    const result = await c.users.updateOne({ _id: user._id, passwordVersion: user.passwordVersion }, { $set: { passwordHash }, $inc: { passwordVersion: 1 } }, { session });
    if (!result.modifiedCount) throw new HttpError(409, 'Your account changed. Please sign in again.');
    await c.sessions.deleteMany({ userId: user._id }, { session });
  });
  await createSession({ ...user, passwordHash, passwordVersion: user.passwordVersion + 1 });
}
