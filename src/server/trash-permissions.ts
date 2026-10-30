import 'server-only';
import type { ClientSession, Db } from 'mongodb';
import { canPermanentlyDelete, resolveCmsRole } from '@/lib/cms-roles';
import { requireUser } from './auth';
import { collections, type UserDocument } from './db';
import { HttpError } from './http';

export async function requireTrashManager() {
  const user = await requireUser();
  if (!canPermanentlyDelete(resolveCmsRole(user.role))) throw new HttpError(403, 'Only Dev and Admin can permanently delete items from Trash.');
  return user;
}

export async function authorizeTrashDeletion(actor: UserDocument, db: Db, session: ClientSession) {
  const c = collections(db);
  // Serialize the deletion claim with account edits so a demoted session cannot claim new deletions.
  await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { upsert: true, session });
  const current = await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session });
  if (!current) throw new HttpError(401, 'Please sign in to continue. Your unsaved input is still available.');
  if (!canPermanentlyDelete(resolveCmsRole(current.role))) throw new HttpError(403, 'Only Dev and Admin can permanently delete items from Trash.');
}
