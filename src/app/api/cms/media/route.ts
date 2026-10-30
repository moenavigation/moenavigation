import { requireUser } from '@/server/auth';
import { getMediaPage, uploadMedia } from '@/server/media';
import { api, HttpError, json, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  if (params.getAll('q').length > 1 || params.getAll('cursor').length > 1) throw new HttpError(400, 'Use one media search and one page cursor.');
  return json(await getMediaPage(params.get('cursor'), params.get('q')));
});
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); return json({ media: await uploadMedia(request, user._id, user) }); });
