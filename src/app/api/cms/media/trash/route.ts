import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getMediaTrashPage, trashMedia } from '@/server/media';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
const mediaIdSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const inputSchema = z.strictObject({ mediaId: mediaIdSchema });

export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'cursor') || params.getAll('cursor').length > 1) throw new HttpError(400, 'Use one Media Trash page cursor.');
  return json(await getMediaTrashPage(params.get('cursor')));
});

export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const { mediaId } = inputSchema.parse(await readJson(request));
  return json({ media: await trashMedia(mediaId, user) });
});
