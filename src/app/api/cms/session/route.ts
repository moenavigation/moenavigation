import { currentUser, publicUser } from '@/server/auth';
import { api, json } from '@/server/http';
export const runtime = 'nodejs';
export const GET = api(async () => { const user = await currentUser(); return json({ user: user ? publicUser(user) : null }); });
