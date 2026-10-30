import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getMediaUsage } from '@/server/media';
import { api, HttpError, json } from '@/server/http';

export const runtime = 'nodejs';
const mediaIdSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || params.getAll('mediaId').length !== 1) throw new HttpError(400, 'Choose one library image to check.');
  return json(await getMediaUsage(mediaIdSchema.parse(params.get('mediaId'))));
});
