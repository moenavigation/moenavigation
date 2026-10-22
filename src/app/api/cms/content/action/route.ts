import { requireUser } from '@/server/auth';
import { contentAction } from '@/server/content';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { actionSchema } from '@/server/validation';
export const runtime = 'nodejs';
export const POST = api(async request => { sameOrigin(request); await requireUser(); return json({ record: await contentAction(actionSchema.parse(await readJson(request))) }); });
