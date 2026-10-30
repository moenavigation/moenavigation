import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, rateLimit, requireUser, verifyPassword } from '@/server/auth';
import { collections, getDb, transaction } from '@/server/db';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, 'Use 3–40 lowercase letters, numbers, dots, underscores or hyphens.');
const password = z.string().min(14).max(200);
const createInput = z.object({ username, password, currentPassword: z.string().min(1) });
const resetInput = z.object({ id: z.string().uuid(), password, currentPassword: z.string().min(1) });
const removeInput = z.object({ id: z.string().uuid(), currentPassword: z.string().min(1) });

async function authorizeMutation(request: Request, currentPassword: string) {
  sameOrigin(request);
  const actor = await requireUser();
  await rateLimit(`users:${actor._id}`, 12, 15 * 60);
  if (!await verifyPassword(currentPassword, actor.passwordHash)) throw new HttpError(403, 'Your current password is incorrect.');
  return actor;
}

export const GET = api(async () => {
  const actor = await requireUser();
  const users = await collections(await getDb()).users.find({}, { projection: { _id: 1, username: 1, createdAt: 1 } }).sort({ username: 1 }).toArray();
  return json({ users: users.map(user => ({ id: user._id, username: user.username, createdAt: user.createdAt, current: user._id === actor._id })) });
});

export const POST = api(async request => {
  const input = createInput.parse(await readJson(request));
  const actor = await authorizeMutation(request, input.currentPassword);
  const passwordHash = await hashPassword(input.password);
  await transaction(async (db, session) => {
    const c = collections(db);
    if (!await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion }, { session })) throw new HttpError(409, 'Your account changed. Sign in again.');
    await c.users.insertOne({ _id: randomUUID(), username: input.username, passwordHash, passwordVersion: 1, createdAt: new Date() }, { session });
  });
  return json({ ok: true }, 201);
});

export const PATCH = api(async request => {
  const input = resetInput.parse(await readJson(request));
  const actor = await authorizeMutation(request, input.currentPassword);
  if (input.id === actor._id) throw new HttpError(400, 'Change your own password in Account & tools.');
  const passwordHash = await hashPassword(input.password);
  await transaction(async (db, session) => {
    const c = collections(db);
    if (!await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion }, { session })) throw new HttpError(409, 'Your account changed. Sign in again.');
    const updated = await c.users.updateOne({ _id: input.id }, { $set: { passwordHash }, $inc: { passwordVersion: 1 } }, { session });
    if (!updated.matchedCount) throw new HttpError(404, 'Administrator not found. Refresh the list.');
    await c.sessions.deleteMany({ userId: input.id }, { session });
  });
  return json({ ok: true });
});

export const DELETE = api(async request => {
  const input = removeInput.parse(await readJson(request));
  const actor = await authorizeMutation(request, input.currentPassword);
  if (input.id === actor._id) throw new HttpError(400, 'You cannot remove your own account.');
  await transaction(async (db, session) => {
    const c = collections(db);
    // All admin mutations share this document, so concurrent removals cannot delete the last account.
    await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
    if (await c.users.countDocuments({}, { session }) <= 1) throw new HttpError(409, 'The last administrator cannot be removed.');
    if (!await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion }, { session })) throw new HttpError(409, 'Your account changed. Sign in again.');
    const removed = await c.users.deleteOne({ _id: input.id }, { session });
    if (!removed.deletedCount) throw new HttpError(404, 'Administrator not found. Refresh the list.');
    await c.sessions.deleteMany({ userId: input.id }, { session });
  });
  return json({ ok: true });
});
