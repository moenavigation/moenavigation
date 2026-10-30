import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { restoreMedia } from '@/server/media';
import { api, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
const inputSchema = z.strictObject({ mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) });

export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const { mediaId } = inputSchema.parse(await readJson(request));
  return json({ media: await restoreMedia(mediaId, user) });
});
