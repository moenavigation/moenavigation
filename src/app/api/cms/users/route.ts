import { z } from 'zod';
import { cmsRoles } from '@/lib/cms-roles';
import { createSession, hashPassword, publicUser, requireUser } from '@/server/auth';
import { collections, getDb, transaction } from '@/server/db';
import { authorizeUserMutation, createUserInTransaction, editUserInTransaction, removeUserInTransaction } from '@/server/users';
import { api, json, readJson } from '@/server/http';

export const runtime = 'nodejs';

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, 'Use 3–40 lowercase letters, numbers, dots, underscores or hyphens.');
const password = z.string().min(14).max(200);
const currentPassword = z.string().min(1).max(200);
const createInput = z.strictObject({ username, password, role: z.enum(cmsRoles).default('Admin'), currentPassword });
const editInput = z.strictObject({ id: z.string().uuid(), username: username.optional(), role: z.enum(cmsRoles).optional(), password: password.optional(), currentPassword })
  .refine(input => input.username !== undefined || input.role !== undefined || input.password !== undefined, 'Choose a user detail to update.');
const removeInput = z.strictObject({ id: z.string().uuid(), currentPassword });

export const GET = api(async () => {
  const actor = await requireUser();
  const users = await collections(await getDb()).users.find({ deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { projection: { _id: 1, username: 1, role: 1, createdAt: 1, avatar: 1, profileRevision: 1 } }).sort({ username: 1 }).toArray();
  return json({ actorRole: actor.role, users: users.map(user => ({ ...publicUser(user), createdAt: user.createdAt, current: user._id === actor._id })) });
});

export const POST = api(async request => {
  const input = createInput.parse(await readJson(request));
  const actor = await authorizeUserMutation(request, input.currentPassword);
  const passwordHash = await hashPassword(input.password);
  await transaction((db, session) => createUserInTransaction(actor, { username: input.username, role: input.role, passwordHash }, db, session));
  return json({ ok: true }, 201);
});

export const PATCH = api(async request => {
  const input = editInput.parse(await readJson(request));
  const actor = await authorizeUserMutation(request, input.currentPassword);
  const changes = {
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
  };
  const result = await transaction((db, session) => editUserInTransaction(actor, input.id, changes, db, session));
  if (input.id === actor._id) {
    if (result.changed) await createSession(result.user);
    return json({ ok: true, user: publicUser(result.user) });
  }
  return json({ ok: true });
});

export const DELETE = api(async request => {
  const input = removeInput.parse(await readJson(request));
  const actor = await authorizeUserMutation(request, input.currentPassword);
  await transaction((db, session) => removeUserInTransaction(actor, input.id, db, session));
  return json({ ok: true });
});
