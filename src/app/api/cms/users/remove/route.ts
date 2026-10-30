import { transaction } from '@/server/db';
import { authorizeUserMutation, permanentlyRemoveUserInTransaction, userTrashInput } from '@/server/users';
import { api, json, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const POST = api(async request => {
  const input = userTrashInput.parse(await readJson(request));
  const actor = await authorizeUserMutation(request, input.currentPassword);
  await transaction((db, session) => permanentlyRemoveUserInTransaction(actor, input.id, db, session));
  return json({ ok: true });
});
