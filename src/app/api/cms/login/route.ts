import { login } from '@/server/auth';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { loginSchema } from '@/server/validation';
export const runtime = 'nodejs';
export const POST = api(async request => { sameOrigin(request); const input = loginSchema.parse(await readJson(request)); return json({ user: await login(input.username, input.password) }); });
