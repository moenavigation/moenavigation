import { requireUser } from '@/server/auth';
import { getMediaPage, uploadMedia } from '@/server/media';
import { api, json, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const GET = api(async request => { await requireUser(); return json(await getMediaPage(new URL(request.url).searchParams.get('cursor'))); });
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); return json({ media: await uploadMedia(request, user._id) }); });
