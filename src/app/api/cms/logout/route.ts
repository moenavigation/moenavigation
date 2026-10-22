import { logout } from '@/server/auth';
import { api, json, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
export const POST = api(async request => { sameOrigin(request); await logout(); return json({ ok: true }); });
