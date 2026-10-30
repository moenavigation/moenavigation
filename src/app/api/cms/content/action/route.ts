import { requireUser } from '@/server/auth';
import { cmsContentAction } from '@/server/content';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { actionSchema } from '@/server/validation';
import { invalidatePublicContent } from '@/server/public-cache';
export const runtime = 'nodejs';
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const record = await cmsContentAction(actionSchema.parse(await readJson(request)), user); invalidatePublicContent(); return json({ record }); });
