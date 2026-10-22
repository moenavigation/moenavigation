import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { removeMedia } from '@/server/media';
import { api, json, readJson, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
const schema = z.object({ mediaId: z.string().regex(/^[a-f0-9]{64}$/) });
export const POST = api(async request => { sameOrigin(request); await requireUser(); const input = schema.parse(await readJson(request)); return json(await removeMedia(input.mediaId)); });
