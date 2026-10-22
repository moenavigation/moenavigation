import { changePassword, requireUser } from '@/server/auth';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { passwordSchema } from '@/server/validation';
export const runtime = 'nodejs';
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const input = passwordSchema.parse(await readJson(request)); await changePassword(user, input.currentPassword, input.newPassword); return json({ ok: true }); });
