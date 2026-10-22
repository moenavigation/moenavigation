import { requireUser, rateLimit } from '@/server/auth';
import { cleanupMedia } from '@/server/media';
import { api, json, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); await rateLimit(`cleanup:${user._id}`, 10, 3600); return json(await cleanupMedia()); });
