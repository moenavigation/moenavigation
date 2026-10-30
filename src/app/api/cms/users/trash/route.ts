import { resolveCmsRole } from '@/lib/cms-roles';
import { requireRole } from '@/server/auth';
import { collections, ensureIndexes, getDb } from '@/server/db';
import { api, json } from '@/server/http';

export const runtime = 'nodejs';
export const GET = api(async () => {
  const actor = await requireRole('Dev', 'Admin');
  await ensureIndexes();
  const users = await collections(await getDb()).users.find({
    deletedAt: { $exists: true }, $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: new Date() } }],
  }, { projection: { _id: 1, username: 1, role: 1, createdAt: 1, deletedAt: 1, purgeAt: 1, avatar: 1 } }).sort({ deletedAt: -1, _id: 1 }).toArray();
  return json({ actorRole: actor.role, users: users.map(user => ({
    id: user._id, username: user.username, role: resolveCmsRole(user.role),
    createdAt: user.createdAt, deletedAt: user.deletedAt, purgeAt: user.purgeAt, ...(user.avatar ? { avatar: user.avatar } : {}),
  })) });
});
