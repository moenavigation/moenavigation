import { publicUser, rateLimit, requireUser } from '@/server/auth';
import { transaction } from '@/server/db';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';
import { authorizeUserMutation, updateUserProfileInTransaction, userProfileInput } from '@/server/users';

export const runtime = 'nodejs';
export const POST = api(async request => {
  sameOrigin(request);
  const input = userProfileInput.parse(await readJson(request));
  let actor = await requireUser();
  if (input.id !== actor._id) {
    if (!input.currentPassword) throw new HttpError(400, 'Enter your current password to change another user’s profile photo.');
    actor = await authorizeUserMutation(request, input.currentPassword);
  } else await rateLimit(`user-profile:${actor._id}`, 30, 15 * 60);
  const { currentPassword, ...change } = input;
  void currentPassword;
  const result = await transaction((db, session) => updateUserProfileInTransaction(actor, change, db, session));
  return json({ ok: true, user: publicUser(result.user), replayed: result.replayed });
});
