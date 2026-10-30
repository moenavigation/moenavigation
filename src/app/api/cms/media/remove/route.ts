import { z } from 'zod';
import { requireTrashManager } from '@/server/trash-permissions';
import { removeMedia } from '@/server/media';
import { api, json, readJson, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
const schema = z.strictObject({ mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) });
export const POST = api(async request => { sameOrigin(request); const actor = await requireTrashManager(); const input = schema.parse(await readJson(request)); return json(await removeMedia(input.mediaId, true, actor)); });
